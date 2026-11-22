"""Cached data/model state shared by all Streamlit pages."""

from __future__ import annotations

import hashlib
from io import BytesIO

import pandas as pd
import streamlit as st

from wellperf import config, loaders, pipeline, vfm
from wellperf.well_tests import clean_well_tests, load_well_tests

UPLOAD_KEYS = {
    "high_freq": ("High-frequency sensor data", ["csv", "parquet"]),
    "choke": ("Choke events", ["csv", "xlsx"]),
    "pvt": ("Reservoir PVT", ["csv", "xlsx"]),
    "completion": ("Well completion", ["csv", "xlsx"]),
    "tests": ("Well tests (labels for training)", ["csv", "xlsx"]),
}


class NamedBytes(BytesIO):
    """BytesIO that keeps the original filename so readers can pick the right parser."""

    def __init__(self, data: bytes, name: str):
        super().__init__(data)
        self.name = name


def _dir_signature() -> str:
    files = [config.HIGH_FREQ_FILE, config.CHOKE_FILE, config.PVT_FILE, config.COMPLETION_FILE]
    return "|".join(f"{f}:{(config.DATA_DIR / f).stat().st_mtime}" for f in files)


@st.cache_resource(show_spinner="Loading and cleaning 1-minute sensor data…")
def _prepared_from_dir(signature: str) -> pipeline.Prepared:
    return pipeline.prepare_from_dir()


@st.cache_resource(show_spinner="Loading and cleaning uploaded data…")
def _prepared_from_uploads(signature: str, _files: dict[str, NamedBytes]) -> pipeline.Prepared:
    for f in _files.values():
        f.seek(0)
    choke = loaders.load_choke(_files["choke"]) if "choke" in _files else None
    return pipeline.prepare(
        loaders.load_high_freq(_files["high_freq"]),
        choke,
        loaders.load_pvt(_files["pvt"]),
        loaders.load_completion(_files["completion"]),
    )


def uploaded_files() -> dict[str, NamedBytes]:
    return st.session_state.get("uploads", {})


def using_uploads() -> bool:
    return st.session_state.get("source") == "upload"


def source_signature() -> str | None:
    """Identifies the current input data; every downstream cache is keyed on it."""
    if not using_uploads():
        return "folder|" + _dir_signature()
    files = uploaded_files()
    if not all(k in files for k in ("high_freq", "pvt", "completion")):
        return None
    return "upload|" + "|".join(f"{k}:{hashlib.md5(v.getvalue()).hexdigest()}" for k, v in sorted(files.items()))


def _sync_source() -> str | None:
    """Drop the model and derived results when the data source changes."""
    signature = source_signature()
    if st.session_state.get("active_source") != signature:
        for key in ("model", "model_source", "pred", "pred_key", "analyses", "analyses_key", "pta_overrides"):
            st.session_state.pop(key, None)
        st.session_state["active_source"] = signature
    return signature


def get_prepared() -> pipeline.Prepared | None:
    signature = _sync_source()
    if signature is None:
        return None
    if not using_uploads():
        return _prepared_from_dir(_dir_signature())
    return _prepared_from_uploads(signature, uploaded_files())


def get_raw_tests() -> pd.DataFrame | None:
    if using_uploads():
        files = uploaded_files()
        if "tests" not in files:
            return None  # never mix uploaded sensors with the folder's labels
        files["tests"].seek(0)
        return load_well_tests(files["tests"])
    path = loaders.find_well_test_file()
    return load_well_tests(path) if path else None


def get_model() -> vfm.VFMModel | None:
    _sync_source()
    if "model" not in st.session_state and not using_uploads() and config.MODEL_PATH.exists():
        st.session_state["model"] = vfm.load_model()
        st.session_state["model_source"] = f"loaded from {config.MODEL_PATH.name}"
    return st.session_state.get("model")


def set_model(model: vfm.VFMModel, source: str) -> None:
    """Use a newly trained model; only folder-data models replace the saved model file."""
    if not using_uploads():
        vfm.save_model(model)
    st.session_state["model"] = model
    st.session_state["model_source"] = source


def get_predictions(prepared: pipeline.Prepared, model: vfm.VFMModel) -> pd.DataFrame:
    key = (id(prepared), id(model))
    if st.session_state.get("pred_key") != key:
        st.session_state["pred"] = pipeline.predict(prepared, model)
        st.session_state["pred_key"] = key
    return st.session_state["pred"]


def get_overrides() -> dict[str, pipeline.EventOverride]:
    return st.session_state.get("pta_overrides", {})


def set_override(event_id: str, override: pipeline.EventOverride | None) -> None:
    """Store (or clear, with None) the user's rate/window choice for one shut-in."""
    current = {k: v for k, v in get_overrides().items() if k != event_id}
    st.session_state["pta_overrides"] = current if override is None else {**current, event_id: override}


def get_analyses(prepared: pipeline.Prepared, pred: pd.DataFrame):
    """PTA for all events with the user's overrides applied; exports use exactly these analyses."""
    overrides = get_overrides()
    key = (id(prepared), id(pred), tuple(sorted((k, v.q_oil_stbd, v.window_hours) for k, v in overrides.items())))
    if st.session_state.get("analyses_key") != key:
        st.session_state["analyses"] = pipeline.analyse_all_events(prepared, pred, overrides)
        st.session_state["analyses_key"] = key
    return st.session_state["analyses"]


def clean_tests_for_plot() -> pd.DataFrame | None:
    raw = get_raw_tests()
    return None if raw is None else clean_well_tests(raw)[0]
