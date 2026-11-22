"""WellPerf engine API — staged VFM → PTA workflow over incrementally uploaded data.

Run:   python -m uvicorn api_server:app --port 8000      (from the engine/ folder)

Workflow (each stage unlocks the next; uploading a new part marks later stages stale):
  1. POST /api/upload            one or more files (CSV / XLSX / Parquet / ZIP). The kind is detected
                                 from the columns: high-frequency sensors, choke events, well tests, PVT,
                                 completion. High-frequency and choke parts are APPENDED, so the test
                                 period can arrive in pieces (e.g. month by month).
  2. POST /api/run/clean         same cleaning steps as training: sentinels, duplicates, ordering, spikes,
                                 physical bounds, frozen sensors -> shut-in + gas-lift upset detection ->
                                 daily features.
  3. POST /api/run/vfm           trained VFM model -> daily oil / water / gas for the uploaded period.
  4. POST /api/run/pta           Horner / Bourdet build-up analysis for every shut-in in the uploaded period,
                                 using the predicted daily oil rate.
  5. GET  /api/export/{name}     Excel / CSV / HTML deliverables for both parts.

History context: the training period (Jan–Sep 2025) is kept in memory. When the uploaded data starts
after it, the last days of training data are prepended before cleaning (so rolling filters, the 24 h
gas-lift baseline and the choke state carry over) and the training-period predictions are used for the
cumulative oil (Np -> Horner tp) and the pre-shut-in rate. Outputs are always restricted to the
uploaded period.
"""

from __future__ import annotations

import io
import json
import math
import sys
import threading
import time
import traceback
import uuid
import re
import zipfile
from dataclasses import dataclass, field, replace
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, StreamingResponse

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "src"))

from wellperf import config, exports, loaders, pipeline, pta, vfm  # noqa: E402
from wellperf.features import DATE_COL  # noqa: E402
from wellperf.vfm import MID_TIME_COL, predict_flowing, test_midpoint  # noqa: E402
from wellperf.well_tests import clean_well_tests, load_well_tests  # noqa: E402

UPLOAD_DIR = ROOT / "uploads"
BASELINE_RAW = ROOT / "artifacts" / "high_freq_raw.parquet"
BASELINE_PRED = ROOT / "artifacts" / "baseline_predictions.parquet"
BASELINE_TABLE = ROOT / "artifacts" / "baseline_training_table.parquet"
RECAL_LOO_MAX = 40  # leave-one-test-out estimate for the recalibrated model (≈0.6 s per test)
CONTEXT_DAYS = 3
RATE_COLS = ["oil_rate_stbd", "water_rate_stbd", "gas_rate_mscfd"]
COLUMN_ALIASES = {
    "time": config.TIME_COL, "datetime": config.TIME_COL, "date_time": config.TIME_COL, "date": config.TIME_COL,
    "well": config.WELL_COL, "wellname": config.WELL_COL, "well_id": config.WELL_COL,
}


# ---------------------------------------------------------------------------------------------
# JSON helpers
# ---------------------------------------------------------------------------------------------

def clean_json(value):
    """Make pandas / numpy values JSON-safe (NaN -> None, timestamps -> ISO strings)."""
    if isinstance(value, dict):
        return {str(k): clean_json(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [clean_json(v) for v in value]
    if isinstance(value, (pd.Series, pd.Index)):
        return [clean_json(v) for v in value.tolist()]
    if isinstance(value, np.ndarray):
        return [clean_json(v) for v in value.tolist()]
    if isinstance(value, (pd.Timestamp, np.datetime64)):
        ts = pd.Timestamp(value)
        return None if pd.isna(ts) else ts.isoformat()
    if value is pd.NaT:
        return None
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating, float)):
        f = float(value)
        return None if not math.isfinite(f) else round(f, 6)
    if isinstance(value, np.bool_):
        return bool(value)
    return value


def records(df: pd.DataFrame) -> list[dict]:
    return clean_json(df.to_dict("records"))


def ok(payload: dict) -> JSONResponse:
    return JSONResponse(clean_json(payload))


# ---------------------------------------------------------------------------------------------
# Baseline (training period) — loaded once
# ---------------------------------------------------------------------------------------------

@dataclass
class Baseline:
    ready: bool = False
    error: str | None = None
    raw: pd.DataFrame | None = None
    choke: pd.DataFrame | None = None
    pvt: pd.DataFrame | None = None
    completion: pd.DataFrame | None = None
    model: vfm.VFMModel | None = None
    pred: pd.DataFrame | None = None
    train_table: pd.DataFrame | None = None  # training well tests joined with their window features
    started: float = field(default_factory=time.time)
    loaded_in_s: float | None = None


BASE = Baseline()


def _load_baseline() -> None:
    try:
        t0 = time.time()
        BASE.model = vfm.load_model(config.MODEL_PATH)
        BASE.pvt = loaders.load_pvt(ROOT / config.PVT_FILE)
        BASE.completion = loaders.load_completion(ROOT / config.COMPLETION_FILE)
        BASE.choke = loaders.load_choke(ROOT / config.CHOKE_FILE)
        if BASELINE_RAW.exists():
            BASE.raw = loaders.load_high_freq(BASELINE_RAW)
            if BASELINE_PRED.exists():
                BASE.pred = pd.read_parquet(BASELINE_PRED)
            else:
                prepared = pipeline.prepare(BASE.raw, BASE.choke, BASE.pvt, BASE.completion)
                BASE.pred = pipeline.predict(prepared, BASE.model)
                BASE.pred.to_parquet(BASELINE_PRED)
        if BASELINE_TABLE.exists():
            BASE.train_table = pd.read_parquet(BASELINE_TABLE)
        BASE.loaded_in_s = round(time.time() - t0, 1)
        BASE.ready = True
        restore_workspace()
    except Exception as exc:  # pragma: no cover - surfaced through /api/status
        BASE.error = f"{type(exc).__name__}: {exc}"
        traceback.print_exc()


# ---------------------------------------------------------------------------------------------
# Session (single workspace — hackathon demo)
# ---------------------------------------------------------------------------------------------

STAGES = ("clean", "vfm", "pta")


@dataclass
class Part:
    id: str
    filename: str
    kind: str
    rows: int
    wells: list[str]
    start: str | None
    end: str | None
    uploaded_at: str
    frame: pd.DataFrame


@dataclass
class Session:
    parts: list[Part] = field(default_factory=list)
    use_history: bool = True
    recalibrate: bool = True
    model: vfm.VFMModel | None = None  # model actually used for the current period
    stage_status: dict[str, str] = field(default_factory=lambda: {s: "idle" for s in STAGES})
    stage_meta: dict[str, dict] = field(default_factory=dict)
    prepared: pipeline.Prepared | None = None
    period: tuple[pd.Timestamp, pd.Timestamp] | None = None
    pred_full: pd.DataFrame | None = None
    pred_scope: pd.DataFrame | None = None
    test_check: pd.DataFrame | None = None
    analyses: dict[str, pipeline.EventAnalysis] = field(default_factory=dict)
    failures: pd.DataFrame | None = None
    overrides: dict[str, pipeline.EventOverride] = field(default_factory=dict)
    log: list[dict] = field(default_factory=list)


S = Session()
LOCK = threading.RLock()


def log(message: str, level: str = "info") -> None:
    S.log.append({"t": pd.Timestamp.now().isoformat(timespec="seconds"), "level": level, "msg": message})
    S.log = S.log[-200:]


MANIFEST = UPLOAD_DIR / "manifest.json"


def save_manifest() -> None:
    """Persist uploaded parts + finished stages so a restart restores the workspace."""
    try:
        UPLOAD_DIR.mkdir(exist_ok=True)
        data = {"use_history": S.use_history, "recalibrate": S.recalibrate, "parts": [part_json(p) for p in S.parts],
                "done": [s for s in STAGES if S.stage_status[s] in ("done", "stale")]}
        MANIFEST.write_text(json.dumps(data), encoding="utf-8")
        keep = {f"{p.id}.parquet" for p in S.parts}
        for f in UPLOAD_DIR.glob("*.parquet"):
            if f.name not in keep:
                f.unlink(missing_ok=True)
    except Exception as exc:  # never break a request because of persistence
        print(f"manifest save failed: {exc}")


def restore_workspace() -> None:
    if not MANIFEST.exists():
        return
    try:
        m = json.loads(MANIFEST.read_text(encoding="utf-8"))
        with LOCK:
            S.use_history = bool(m.get("use_history", True))
            S.recalibrate = bool(m.get("recalibrate", True))
            for pj in m.get("parts", []):
                path = UPLOAD_DIR / f"{pj['id']}.parquet"
                if path.exists():
                    S.parts.append(Part(**pj, frame=pd.read_parquet(path)))
            log(f"Restored {len(S.parts)} uploaded part(s) after restart")
            for stage in STAGES:
                if stage not in m.get("done", []):
                    break
                S.stage_status[stage] = "running"
                {"clean": run_clean, "vfm": run_vfm, "pta": run_pta}[stage]()
            save_manifest()
    except Exception as exc:
        log(f"Workspace restore incomplete: {exc}", "warn")
        for stage in STAGES:
            if S.stage_status[stage] == "running":
                S.stage_status[stage] = "idle"


def invalidate(from_stage: str = "clean") -> None:
    idx = STAGES.index(from_stage)
    for stage in STAGES[idx:]:
        if S.stage_status[stage] == "done":
            S.stage_status[stage] = "stale"
    if idx <= 0:
        S.prepared, S.period = None, None
    if idx <= 1:
        S.pred_full, S.pred_scope, S.test_check = None, None, None
    if idx <= 2:
        S.analyses, S.failures = {}, None


def parts_of(kind: str) -> list[Part]:
    return [p for p in S.parts if p.kind == kind]


# ---------------------------------------------------------------------------------------------
# File parsing & kind detection
# ---------------------------------------------------------------------------------------------

def _normalise_columns(df: pd.DataFrame) -> pd.DataFrame:
    cols = {c: str(c).strip().lower().replace(" ", "_") for c in df.columns}
    df = df.rename(columns=cols)
    if config.TIME_COL not in df.columns:
        df = df.rename(columns={c: COLUMN_ALIASES[c] for c in df.columns
                                if c in COLUMN_ALIASES and COLUMN_ALIASES[c] == config.TIME_COL})
    if config.WELL_COL not in df.columns:
        df = df.rename(columns={c: COLUMN_ALIASES[c] for c in df.columns
                                if c in COLUMN_ALIASES and COLUMN_ALIASES[c] == config.WELL_COL})
    return df


def detect_kind(df: pd.DataFrame) -> str:
    cols = set(df.columns)
    if {"test_start", "test_end", "oil_rate_stbd"} <= cols:
        return "tests"
    if "choke_opening_pct" in cols and config.TIME_COL in cols:
        return "choke"
    if {"dh_pressure_psia", "gas_lift_rate_mscfd"} <= cols and config.TIME_COL in cols:
        return "high_freq"
    if {"porosity_frac", "net_pay_thickness_ft"} <= cols:
        return "pvt"
    if "cum_oil_at_2025_01_01_stb" in cols:
        return "completion"
    if {"permeability_md", "skin", config.WELL_COL} <= cols:
        return "pta_ref"
    if set(RATE_COLS) <= cols and config.WELL_COL in cols and config.TIME_COL in cols:
        return "vfm_ref"
    raise HTTPException(400, f"Could not recognise the file from its columns: {', '.join(sorted(cols))[:400]}")


def _read_bytes(name: str, data: bytes) -> list[tuple[str, pd.DataFrame]]:
    lower = name.lower()
    if lower.endswith(".zip"):
        out = []
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            for info in zf.infolist():
                inner = info.filename
                if info.is_dir() or "__macosx" in inner.lower() or Path(inner).name.startswith("."):
                    continue
                if inner.lower().endswith((".csv", ".xlsx", ".xls", ".parquet")):
                    out.extend(_read_bytes(Path(inner).name, zf.read(info)))
        if not out:
            raise HTTPException(400, f"{name}: the archive has no CSV / Excel / Parquet files")
        return out
    buf = io.BytesIO(data)
    if lower.endswith(".parquet"):
        df = pd.read_parquet(buf)
    elif lower.endswith((".xlsx", ".xls")):
        df = pd.read_excel(buf)
    else:
        try:
            df = pd.read_csv(buf, engine="pyarrow")
        except Exception:
            buf.seek(0)
            df = pd.read_csv(buf)
    return [(name, _normalise_columns(df))]


def _typed(kind: str, df: pd.DataFrame) -> pd.DataFrame:
    """Validate and type a frame with the same readers used for training."""
    buf = io.BytesIO()
    df.to_parquet(buf)
    buf.seek(0)
    buf.name = "upload.parquet"  # type: ignore[attr-defined]
    if kind == "high_freq":
        out = loaders.load_high_freq(buf)
        return out[[config.TIME_COL, config.WELL_COL, *config.SENSOR_COLS]]
    if kind == "choke":
        return loaders.load_choke(buf)[[config.TIME_COL, config.WELL_COL, "choke_opening_pct"]]
    if kind == "tests":
        return load_well_tests(buf)
    if kind == "pvt":
        return loaders.load_pvt(buf)
    if kind == "vfm_ref":
        out = df[[config.TIME_COL, config.WELL_COL, *RATE_COLS]].copy()
        out[config.TIME_COL] = pd.to_datetime(out[config.TIME_COL]).dt.floor("D").astype("datetime64[ns]")
        out[config.WELL_COL] = out[config.WELL_COL].astype(str)
        return out
    if kind == "pta_ref":
        tcol = next((c for c in ("shut_in_time", "shut_in_start", config.TIME_COL) if c in df.columns), None)
        if tcol is None:
            raise HTTPException(400, "PTA reference file needs a shut_in_time column")
        out = df.rename(columns={tcol: "shut_in_time", "horner_slope_psi_per_cycle": "horner_slope"}).copy()
        out["shut_in_time"] = pd.to_datetime(out["shut_in_time"]).astype("datetime64[ns]")
        out[config.WELL_COL] = out[config.WELL_COL].astype(str)
        keep = [c for c in (config.WELL_COL, "shut_in_time", "permeability_md", "skin", "delta_p_skin_psi", "horner_slope")
                if c in out.columns]
        return out[keep]
    return loaders.load_completion(buf)


def _span(kind: str, df: pd.DataFrame) -> tuple[str | None, str | None]:
    col = {"high_freq": config.TIME_COL, "choke": config.TIME_COL, "tests": "test_start",
           "vfm_ref": config.TIME_COL, "pta_ref": "shut_in_time"}.get(kind)
    if not col or df.empty:
        return None, None
    return df[col].min().isoformat(), df[col].max().isoformat()


def add_part(filename: str, df: pd.DataFrame) -> Part:
    kind = detect_kind(df)
    typed = _typed(kind, df)
    start, end = _span(kind, typed)
    wells = sorted(typed[config.WELL_COL].astype(str).unique().tolist()) if config.WELL_COL in typed else []
    part = Part(id=uuid.uuid4().hex[:8], filename=filename, kind=kind, rows=len(typed), wells=wells,
                start=start, end=end, uploaded_at=pd.Timestamp.now().isoformat(timespec="seconds"), frame=typed)
    if kind in ("pvt", "completion", "vfm_ref", "pta_ref"):  # replaced, not appended
        S.parts = [p for p in S.parts if p.kind != kind]
    else:  # the same file uploaded again replaces its earlier copy instead of stacking duplicates
        S.parts = [p for p in S.parts if not (p.filename == filename and p.kind == kind and p.rows == part.rows
                                              and p.start == part.start and p.end == part.end)]
    S.parts.append(part)
    UPLOAD_DIR.mkdir(exist_ok=True)
    typed.to_parquet(UPLOAD_DIR / f"{part.id}.parquet")
    log(f"Uploaded {filename} → {kind} ({len(typed):,} rows{', ' + start[:10] + ' → ' + end[:10] if start else ''})")
    return part


def part_json(p: Part) -> dict:
    return {k: getattr(p, k) for k in ("id", "filename", "kind", "rows", "wells", "start", "end", "uploaded_at")}


# ---------------------------------------------------------------------------------------------
# Stage 2: cleaning, events, features
# ---------------------------------------------------------------------------------------------

def _concat(kind: str) -> pd.DataFrame | None:
    frames = [p.frame for p in parts_of(kind)]
    if not frames:
        return None
    # Later parts win on duplicates (a re-uploaded corrected file replaces earlier values).
    df = pd.concat(frames[::-1], ignore_index=True)
    return df


def reference_tables() -> tuple[pd.DataFrame, pd.DataFrame]:
    pvt = parts_of("pvt")[-1].frame if parts_of("pvt") else BASE.pvt
    completion = parts_of("completion")[-1].frame if parts_of("completion") else BASE.completion
    return pvt, completion


def run_clean() -> dict:
    uploaded = _concat("high_freq")
    if uploaded is None:
        raise HTTPException(400, "Upload at least one high-frequency sensor file first.")
    model_wells = set(BASE.model.wells)
    unknown = sorted(set(uploaded[config.WELL_COL]) - model_wells)
    if unknown:
        log(f"Wells without a trained calibration are skipped: {', '.join(unknown)}", "warn")
        uploaded = uploaded[uploaded[config.WELL_COL].isin(model_wells)]
    if uploaded.empty:
        raise HTTPException(400, "None of the uploaded wells has a trained VFM calibration.")

    t_start, t_end = uploaded[config.TIME_COL].min(), uploaded[config.TIME_COL].max()
    raw, context_rows = uploaded, 0
    if S.use_history and BASE.raw is not None:
        lo = t_start.normalize() - pd.Timedelta(days=CONTEXT_DAYS)
        ctx = BASE.raw[(BASE.raw[config.TIME_COL] >= lo) & (BASE.raw[config.TIME_COL] < t_start)
                       & BASE.raw[config.WELL_COL].isin(uploaded[config.WELL_COL].unique())]
        context_rows = len(ctx)
        raw = pd.concat([uploaded, ctx], ignore_index=True)

    choke_up = _concat("choke")
    choke_frames = [c for c in (choke_up, BASE.choke if S.use_history else None) if c is not None]
    choke = (pd.concat(choke_frames, ignore_index=True)
             .drop_duplicates([config.WELL_COL, config.TIME_COL], keep="first")
             .sort_values([config.WELL_COL, config.TIME_COL], ignore_index=True)) if choke_frames else None

    pvt, completion = reference_tables()
    t0 = time.time()
    prepared = pipeline.prepare(raw, choke, pvt, completion)
    S.prepared = prepared
    S.period = (t_start, t_end)
    elapsed = round(time.time() - t0, 1)

    in_scope = prepared.events[prepared.events["shut_in_start"].between(t_start, t_end)]
    ups = prepared.upsets
    ups_scope = ups[ups["start"].between(t_start, t_end)] if not ups.empty else ups
    qc = prepared.qc.copy()
    flagged = {
        "sentinel": int(qc.filter(like="__sentinel").sum().sum()),
        "spike": int(qc.filter(like="__spike").sum().sum()),
        "out_of_bounds": int(qc.filter(like="__out_of_bounds").sum().sum()),
        "frozen": int(qc.filter(like="__frozen").sum().sum()),
        "duplicates": int(qc["duplicates_removed"].sum()),
        "out_of_order": int(qc["out_of_order_rows"].sum()),
        "gaps": int(qc["gap_count"].sum()),
    }
    meta = {
        "elapsed_s": elapsed,
        "rows_uploaded": int(len(uploaded)),
        "context_rows": int(context_rows),
        "period_start": t_start, "period_end": t_end,
        "days": int((t_end.normalize() - t_start.normalize()).days + 1),
        "wells": sorted(uploaded[config.WELL_COL].unique().tolist()),
        "flags": flagged,
        "shut_ins": int(len(in_scope)),
        "upsets": int(len(ups_scope)),
        "choke_source": "uploaded + training" if choke_up is not None and S.use_history
        else ("uploaded" if choke_up is not None else ("training (carried forward)" if choke is not None else "none — sensor signature only")),
    }
    S.stage_status["clean"] = "done"
    S.stage_meta["clean"] = meta
    invalidate("vfm")
    log(f"Cleaning done in {elapsed}s — {len(in_scope)} shut-ins, {len(ups_scope)} gas-lift upsets in period")
    return meta


# ---------------------------------------------------------------------------------------------
# Stage 3: VFM
# ---------------------------------------------------------------------------------------------

def _scope_days(df: pd.DataFrame) -> pd.DataFrame:
    lo, hi = S.period[0].normalize(), S.period[1].normalize()
    return df[(df[DATE_COL] >= lo) & (df[DATE_COL] <= hi)].reset_index(drop=True)


def _check_against_tests() -> pd.DataFrame | None:
    """If well tests for the uploaded period were provided, compare VFM against them."""
    raw_tests = _concat("tests")
    if raw_tests is None:
        return None
    lo, hi = S.period
    raw_tests = raw_tests[raw_tests["test_start"].between(lo, hi)
                          & raw_tests[config.WELL_COL].isin(BASE.model.wells)]
    if raw_tests.empty:
        return None
    table, _ = pipeline.training_table(S.prepared, raw_tests.reset_index(drop=True))
    if table.empty:
        return None
    pred = predict_flowing(BASE.model, table.assign(**{MID_TIME_COL: test_midpoint(table)}), MID_TIME_COL)
    out = table[[config.WELL_COL, "test_start", "test_end", *RATE_COLS]].copy()
    for c in RATE_COLS:
        out[f"pred_{c}"] = pred[c].to_numpy()
        out[f"ape_{c}"] = (out[f"pred_{c}"] - out[c]).abs() / out[c].abs() * 100
    return out


def _baseline_table() -> pd.DataFrame | None:
    """Training-period test table; built once (full training prepare ≈ 30 s) and cached."""
    if BASE.train_table is None and BASE.raw is not None:
        prepared = pipeline.prepare(BASE.raw, BASE.choke, BASE.pvt, BASE.completion)
        table, _ = pipeline.training_table(prepared, load_well_tests(ROOT / "well_tests.csv"))
        table.to_parquet(BASELINE_TABLE)
        BASE.train_table = table
    return BASE.train_table


def _new_test_table() -> pd.DataFrame | None:
    raw_tests = _concat("tests")
    if raw_tests is None:
        return None
    lo, hi = S.period
    raw_tests = raw_tests[raw_tests["test_start"].between(lo - pd.Timedelta(days=1), hi)
                          & raw_tests[config.WELL_COL].isin(BASE.model.wells)].reset_index(drop=True)
    if raw_tests.empty:
        return None
    table, _ = pipeline.training_table(S.prepared, raw_tests)
    return table if not table.empty else None


def _recalibrated_model() -> tuple[vfm.VFMModel, dict | None]:
    """Refit the VFM on training tests + the uploaded tests of the new period (same method, same bounds).
    Validation metrics/uncertainty bands stay those of the validated training model."""
    if not S.recalibrate:
        return BASE.model, None
    new = _new_test_table()
    base = _baseline_table()
    if new is None or base is None:
        return BASE.model, None
    combined = (pd.concat([base, new], ignore_index=True)
                .drop_duplicates([config.WELL_COL, "test_start"], keep="first").reset_index(drop=True))
    added = len(combined) - len(base)
    if added <= 0:
        return BASE.model, None
    model = replace(vfm.fit_vfm(combined), cv_metrics=BASE.model.cv_metrics, cv_predictions=BASE.model.cv_predictions,
                    label_corrections=BASE.model.label_corrections, test_day_bias=BASE.model.test_day_bias,
                    forward_metrics=BASE.model.forward_metrics, forward_predictions=BASE.model.forward_predictions,
                    error_quantiles=BASE.model.error_quantiles)
    # honest estimate for the recalibrated model: each new test predicted by a refit without it
    new_idx = combined.index[len(base):][:RECAL_LOO_MAX]
    ape = {c: [] for c in RATE_COLS}
    for idx in new_idx:
        held = combined.loc[[idx]]
        m = vfm.fit_vfm(combined.drop(index=idx))
        p = predict_flowing(m, held.assign(**{MID_TIME_COL: test_midpoint(held)}), MID_TIME_COL).iloc[0]
        for c in RATE_COLS:
            ape[c].append(abs(p[c] - held[c].iloc[0]) / abs(held[c].iloc[0]) * 100)
    info = {"tests_added": int(added), "tests_total": int(len(combined)),
            "loo_mape": {c: float(np.mean(v)) for c, v in ape.items() if v}, "loo_n": int(len(new_idx))}
    log(f"VFM recalibrated with {added} uploaded well tests (LOTO oil MAPE {info['loo_mape'].get('oil_rate_stbd', float('nan')):.2f}%)")
    return model, info


def run_vfm() -> dict:
    if S.prepared is None:
        raise HTTPException(400, "Run the cleaning stage first.")
    t0 = time.time()
    try:
        model, recal = _recalibrated_model()
    except Exception as exc:
        model, recal = BASE.model, None
        log(f"Recalibration skipped: {exc}", "warn")
    S.model = model
    new_pred = pipeline.predict(S.prepared, model)
    first_day = S.period[0].normalize()
    if S.use_history and BASE.pred is not None:
        hist = BASE.pred[BASE.pred[DATE_COL] < first_day]
        full = pd.concat([hist, new_pred[new_pred[DATE_COL] >= first_day]], ignore_index=True)
    else:
        full = new_pred[new_pred[DATE_COL] >= first_day]
    S.pred_full = full.sort_values([config.WELL_COL, DATE_COL], ignore_index=True)
    S.pred_scope = _scope_days(S.pred_full)
    try:
        S.test_check = _check_against_tests()
    except Exception as exc:
        S.test_check = None
        log(f"Well-test comparison skipped: {exc}", "warn")
    sc = S.pred_scope
    per_well = (sc.groupby(config.WELL_COL)
                .agg(oil=("oil_rate_stbd", "mean"), water=("water_rate_stbd", "mean"), gas=("gas_rate_mscfd", "mean"),
                     uptime=("uptime_frac", "mean"), wc=("water_cut_frac", "mean"),
                     cum_oil=("oil_rate_stbd", "sum"))
                .reset_index())
    status_counts = sc["data_status"].value_counts().to_dict()
    accuracy = None
    if S.test_check is not None:
        accuracy = {c: float(S.test_check[f"ape_{c}"].mean()) for c in RATE_COLS}
        accuracy["n_tests"] = int(len(S.test_check))
    meta = {
        "elapsed_s": round(time.time() - t0, 2),
        "rows": int(len(sc)),
        "field_oil": float(sc.groupby(DATE_COL)["oil_rate_stbd"].sum().mean()),
        "field_water": float(sc.groupby(DATE_COL)["water_rate_stbd"].sum().mean()),
        "field_gas": float(sc.groupby(DATE_COL)["gas_rate_mscfd"].sum().mean()),
        "cum_oil": float(sc["oil_rate_stbd"].sum()),
        "per_well": records(per_well),
        "status_counts": status_counts,
        "accuracy_vs_uploaded_tests": accuracy,
        "recalibration": recal,
    }
    S.stage_status["vfm"] = "done"
    S.stage_meta["vfm"] = meta
    invalidate("pta")
    log(f"VFM predicted {len(sc):,} well-days in {meta['elapsed_s']}s")
    return meta


# ---------------------------------------------------------------------------------------------
# Stage 4: PTA
# ---------------------------------------------------------------------------------------------

def _scope_events() -> pd.DataFrame:
    ev = S.prepared.events
    lo, hi = S.period
    return ev[ev["shut_in_start"].between(lo, hi)].reset_index(drop=True)


def _analyse(event: pd.Series) -> pipeline.EventAnalysis:
    return pipeline.analyse_event(S.prepared, event, S.pred_full, S.overrides.get(event["event_id"]))


def pta_rows() -> pd.DataFrame:
    if not S.analyses:
        return pd.DataFrame(columns=exports.PTA_DELIVERABLE_COLS)
    return pipeline.pta_results_table(S.analyses, pipeline.forward_oil_uncertainty(BASE.model))


def run_pta() -> dict:
    if S.pred_full is None:
        raise HTTPException(400, "Run the VFM stage first.")
    t0 = time.time()
    analyses, failures = {}, []
    for _, event in _scope_events().iterrows():
        try:
            analyses[event["event_id"]] = _analyse(event)
        except (pta.PTAError, KeyError, ValueError) as exc:
            failures.append({"event_id": event["event_id"], config.WELL_COL: event[config.WELL_COL],
                             "shut_in_start": event["shut_in_start"], "error": str(exc)})
    S.analyses = analyses
    S.failures = pd.DataFrame(failures)
    table = pta_rows()
    meta = {
        "elapsed_s": round(time.time() - t0, 2),
        "events": int(len(analyses)),
        "failed": records(S.failures) if failures else [],
        "results": records(table),
    }
    S.stage_status["pta"] = "done"
    S.stage_meta["pta"] = meta
    log(f"PTA analysed {len(analyses)} shut-ins ({len(failures)} not analysable) in {meta['elapsed_s']}s")
    return meta


def event_detail(event_id: str) -> dict:
    a = S.analyses.get(event_id)
    if a is None:
        raise HTTPException(404, f"No analysis for {event_id}")
    r, d = a.result, a.diagnostics
    lo, hi = d.iarf_slice
    level = float(np.nanmedian(d.derivative[lo:hi + 1]))
    ht = pta.horner_time(d.dt, r.tp_hours)
    pws = d.dp + r.pwf_psia
    well = a.event[config.WELL_COL]
    start = a.event["shut_in_start"]
    end = a.event["shut_in_end"] if pd.notna(a.event["shut_in_end"]) else start + pd.Timedelta(hours=a.data.dt_hours[-1])
    m = S.prepared.minute
    win = m[(m[config.WELL_COL] == well) & m[config.TIME_COL].between(start - pd.Timedelta(days=4), end + pd.Timedelta(days=1))]
    win = win.set_index(config.TIME_COL)[["dh_pressure_psia", "gas_lift_rate_mscfd"]].resample("15min").mean().reset_index()
    pr = S.pred_full
    rates = pr[(pr[config.WELL_COL] == well) & pr[DATE_COL].between((start - pd.Timedelta(days=4)).normalize(), end)]
    x_line = [1.0, float(np.nanmax(ht))]
    return {
        "event_id": event_id,
        "well_name": well,
        "shut_in_start": start,
        "shut_in_end": end,
        "duration_hours": float(a.data.dt_hours[-1]),
        "q_source": a.q_source,
        "inputs": {**a.inputs.__dict__, "tp_hours": a.inputs.tp_hours},
        "result": r.__dict__,
        "interpretation": pta.interpret(r),
        "loglog": {"dte": d.dte, "dp": d.dp, "deriv": d.derivative, "iarf": [float(d.dte[lo]), float(d.dte[hi])],
                   "level": level},
        "horner": {"ht": ht, "pws": pws, "iarf_idx": [int(lo), int(hi)],
                   "line": {"x": x_line, "y": [r.p_star_psia - r.horner_slope_psi_cycle * math.log10(x) for x in x_line]}},
        "mdh": {"dt": d.dt, "pws": pws, "iarf_idx": [int(lo), int(hi)]},
        "history": {"t": win[config.TIME_COL], "p": win["dh_pressure_psia"], "gl": win["gas_lift_rate_mscfd"],
                    "days": rates[DATE_COL], "oil": rates["oil_rate_stbd"]},
    }


# ---------------------------------------------------------------------------------------------
# Visualisation helpers
# ---------------------------------------------------------------------------------------------

def sensors_for(well: str, resolution: str) -> dict:
    if S.prepared is None:
        raise HTTPException(400, "Run the cleaning stage first.")
    m = S.prepared.minute
    lo, hi = S.period
    w = m[(m[config.WELL_COL] == well) & m[config.TIME_COL].between(lo, hi)]
    if w.empty:
        raise HTTPException(404, f"No data for {well}")
    try:
        agg = (w.set_index(config.TIME_COL)[list(config.SENSOR_COLS) + ["choke_opening_pct"]]
               .resample(resolution).mean().reset_index())
    except ValueError:
        raise HTTPException(400, f"Invalid resolution {resolution!r} (use e.g. 1min, 15min, 1h, 1D)")
    ev = S.prepared.events
    ev = ev[(ev[config.WELL_COL] == well) & ev["shut_in_start"].between(lo, hi)]
    up = S.prepared.upsets
    up = up[(up[config.WELL_COL] == well) & up["start"].between(lo, hi)] if not up.empty else up
    raw_up = _concat("high_freq")
    raw_w = raw_up[raw_up[config.WELL_COL] == well]
    raw_stats = {c: int((raw_w[c] == config.NULL_SENTINEL).sum()) for c in config.SENSOR_COLS}
    return {
        "well": well,
        "series": {"t": agg[config.TIME_COL], **{c: agg[c] for c in agg.columns if c != config.TIME_COL}},
        "shut_ins": records(ev[["event_id", "shut_in_start", "shut_in_end", "duration_hours", "source"]]),
        "upsets": records(up) if not up.empty else [],
        "qc": records(S.prepared.qc[S.prepared.qc[config.WELL_COL] == well]),
        "raw_sentinels": raw_stats,
    }


def rates_for(well: str) -> dict:
    if S.pred_scope is None:
        raise HTTPException(400, "Run the VFM stage first.")
    p = S.pred_scope[S.pred_scope[config.WELL_COL] == well]
    tests = []
    if S.test_check is not None:
        tests = records(S.test_check[S.test_check[config.WELL_COL] == well])
    cols = [DATE_COL, *RATE_COLS, "uptime_frac", "water_cut_frac", "data_status"]
    cols += [c for c in p.columns if c.endswith(("_p10", "_p90"))]
    return {"well": well, "rows": records(p[cols]), "tests": tests}


# ---------------------------------------------------------------------------------------------
# Exports
# ---------------------------------------------------------------------------------------------

def _vfm_frame() -> pd.DataFrame:
    if S.pred_scope is None:
        raise HTTPException(400, "Run the VFM stage first.")
    return exports.vfm_deliverable(S.pred_scope)


def _pta_portal(table: pd.DataFrame) -> pd.DataFrame:
    return pd.DataFrame({
        "well_name": table[config.WELL_COL],
        "shut_in_time": pd.to_datetime(table["shut_in_start"]).dt.strftime("%Y-%m-%d %H:%M:%S"),
        "permeability_md": table["permeability_md"].round(4),
        "skin": table["skin"].round(4),
        "delta_p_skin_psi": table["delta_p_skin_psi"].round(4),
        "horner_slope": table["horner_slope_psi_per_cycle"].round(4),
    })


XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def build_export(name: str) -> tuple[bytes, str]:
    if name == "vfm_predictions.xlsx":
        pred = S.pred_scope
        sheets = {"predictions": _vfm_frame(),
                  "prediction_details": pred.assign(**{DATE_COL: pred[DATE_COL].dt.date}),
                  "sensor_data_quality": S.prepared.qc,
                  "gas_lift_upsets": S.prepared.upsets}
        if S.test_check is not None:
            sheets["check_vs_uploaded_tests"] = S.test_check
        return exports._to_excel(sheets), XLSX
    if name == "vfm_predictions.csv":
        return _vfm_frame().to_csv(index=False).encode(), "text/csv"
    if name == "vfm_portal.csv":
        df = _vfm_frame().rename(columns={"date": "timestamp"})
        return df.to_csv(index=False).encode(), "text/csv"
    if name in ("pta_results.xlsx", "pta_results.csv", "pta_portal.csv"):
        if S.stage_status["pta"] not in ("done", "stale") or not S.analyses:
            raise HTTPException(400, "Run the PTA stage first (no analysable shut-ins yet).")
        table = pta_rows()
        if name == "pta_results.xlsx":
            data = exports.pta_excel(table, S.analyses)
            return data, XLSX
        if name == "pta_results.csv":
            return exports.round_numeric(exports.pta_deliverable(table), 4).to_csv(index=False).encode(), "text/csv"
        return _pta_portal(table).to_csv(index=False).encode(), "text/csv"
    if name in ("vfm_report.html", "pta_report.html"):
        from wellperf import reports
        if name == "vfm_report.html":
            html = reports.vfm_report(S.prepared, BASE.model, S.pred_scope, None)
        else:
            if not S.analyses:
                raise HTTPException(400, "Run the PTA stage first.")
            html = reports.pta_report(S.prepared, S.pred_full, S.analyses, pta_rows())
        return html.encode(), "text/html"
    if name == "wellperf_deliverables.zip":
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for item in ("vfm_predictions.xlsx", "vfm_portal.csv", "pta_results.xlsx", "pta_portal.csv",
                         "vfm_report.html", "pta_report.html"):
                try:
                    zf.writestr(item, build_export(item)[0])
                except HTTPException:
                    continue
        return buf.getvalue(), "application/zip"
    raise HTTPException(404, f"Unknown export {name}")


# ---------------------------------------------------------------------------------------------
# Reference comparison (e.g. organiser's actual rates / portal results)
# ---------------------------------------------------------------------------------------------

def compare_references() -> dict:
    out: dict = {}
    vref = parts_of("vfm_ref")
    if vref and S.pred_scope is not None:
        ref = vref[-1].frame.rename(columns={config.TIME_COL: DATE_COL})
        m = S.pred_scope[[DATE_COL, config.WELL_COL, *RATE_COLS]].merge(
            ref, on=[DATE_COL, config.WELL_COL], suffixes=("", "_ref"))
        if not m.empty:
            phases = {}
            for c in RATE_COLS:
                valid = m[f"{c}_ref"].abs() > 1e-6
                ape = (m.loc[valid, c] - m.loc[valid, f"{c}_ref"]).abs() / m.loc[valid, f"{c}_ref"].abs() * 100
                phases[c] = {"mape": float(ape.mean()) if len(ape) else None,
                             "bias_pct": float(((m.loc[valid, c] - m.loc[valid, f"{c}_ref"]) / m.loc[valid, f"{c}_ref"]).mean() * 100) if len(ape) else None}
            valid = m["oil_rate_stbd_ref"].abs() > 1e-6
            mm = m[valid].assign(ape=(m["oil_rate_stbd"] - m["oil_rate_stbd_ref"]).abs() / m["oil_rate_stbd_ref"].abs() * 100)
            per_well = mm.groupby(config.WELL_COL)["ape"].mean().reset_index().rename(columns={"ape": "oil_mape"})
            out["vfm"] = {"file": vref[-1].filename, "rows_matched": int(len(m)), "phases": phases,
                          "per_well": records(per_well)}
    pref = parts_of("pta_ref")
    if pref and S.analyses:
        table = pta_rows()
        rows = []
        for _, r in pref[-1].frame.iterrows():
            cand = table[table[config.WELL_COL] == r[config.WELL_COL]]
            if cand.empty:
                continue
            gap = (pd.to_datetime(cand["shut_in_start"]) - r["shut_in_time"]).abs()
            if gap.min() > pd.Timedelta(days=1):
                continue
            ours = cand.loc[gap.idxmin()]
            row = {config.WELL_COL: r[config.WELL_COL], "shut_in_time": r["shut_in_time"], "event_id": ours["event_id"]}
            for ref_col, our_col in (("permeability_md", "permeability_md"), ("skin", "skin"),
                                     ("delta_p_skin_psi", "delta_p_skin_psi"), ("horner_slope", "horner_slope_psi_per_cycle")):
                if ref_col in r.index and pd.notna(r[ref_col]):
                    row[f"{ref_col}_ref"] = float(r[ref_col])
                    row[f"{ref_col}_ours"] = float(ours[our_col])
                    row[f"{ref_col}_diff_pct"] = (float(ours[our_col]) - float(r[ref_col])) / abs(float(r[ref_col])) * 100 \
                        if abs(float(r[ref_col])) > 1e-9 else None
            rows.append(row)
        out["pta"] = {"file": pref[-1].filename, "rows": clean_json(rows),
                      "unmatched": int(len(pref[-1].frame) - len(rows))}
    return out


def model_card_full() -> dict:
    m = BASE.model
    cv = m.cv_predictions
    sens = vfm.sensitivities(m)
    coefs = dict(zip(m.design_columns, m.liquid_model.coef_))
    shared = {k: float(v) for k, v in coefs.items() if not k.startswith(("well_", "pwf_c_x_", "t_c_x_"))}
    return {
        "card": _model_card(),
        "cv_metrics": records(m.cv_metrics),
        "forward_metrics": records(m.forward_metrics),
        "parity": records(cv[[config.WELL_COL, "test_start", *[f"{t}_{k}" for t in RATE_COLS for k in ("actual", "vfm")]]]),
        "sensitivities": records(sens),
        "shared_coefficients": shared,
        "label_corrections": int(len(m.label_corrections)),
        "error_quantiles": {k: list(v) for k, v in m.error_quantiles.items()},
        "n_design_columns": len(m.design_columns),
    }


# ---------------------------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------------------------

app = FastAPI(title="WellPerf Engine API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
def _startup() -> None:
    UPLOAD_DIR.mkdir(exist_ok=True)
    threading.Thread(target=_load_baseline, daemon=True).start()


def _need_baseline() -> None:
    if BASE.error:
        raise HTTPException(500, f"Engine failed to load: {BASE.error}")
    if not BASE.ready:
        raise HTTPException(503, "Engine is still loading the trained model and training history…")


def _model_card() -> dict:
    m = BASE.model
    if m is None:
        return {}
    def metric(df: pd.DataFrame) -> dict:
        if df.empty:
            return {}
        sub = df[df["method"] == "VFM model"]
        return {r["target"]: float(r["MAPE_pct"]) for _, r in sub.iterrows()}
    return {
        "type": "Physics-constrained log-linear bounded ridge (per-well IPR slope + depletion trend)",
        "wells": list(m.wells),
        "alpha": float(m.liquid_model.alpha_),
        "held_out_mape": metric(m.cv_metrics),
        "forward_mape": metric(m.forward_metrics),
        "n_tests": int(len(m.cv_predictions)) if not m.cv_predictions.empty else None,
        "features": list(m.design_columns)[:12],
    }


@app.get("/api/status")
def status():
    hist = None
    if BASE.raw is not None:
        hist = {"start": BASE.raw[config.TIME_COL].min(), "end": BASE.raw[config.TIME_COL].max(),
                "rows": int(len(BASE.raw)), "wells": sorted(BASE.raw[config.WELL_COL].unique().tolist())}
    with LOCK:
        return ok({
            "ready": BASE.ready, "error": BASE.error, "loaded_in_s": BASE.loaded_in_s,
            "model": _model_card(), "history": hist, "use_history": S.use_history, "recalibrate": S.recalibrate,
            "parts": [part_json(p) for p in S.parts],
            "stages": S.stage_status, "meta": S.stage_meta,
            "period": list(S.period) if S.period else None,
            "reference": compare_references(),
            "log": S.log[-40:],
        })


# ---------------------------------------------------------------------------------------------
# AI assistant (Gemini, grounded on the current workspace) — the API key never leaves the server
# ---------------------------------------------------------------------------------------------

GEMINI_MODELS = ("gemini-2.5-flash", "gemini-3.8-flash")
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent"


def _env(name: str) -> str | None:
    import os
    import re

    if os.environ.get(name):
        return os.environ[name].strip()
    for path in (ROOT / ".env", ROOT.parent / "server" / ".env"):
        if path.exists():
            m = re.search(rf'^{name}\s*=\s*"?([^"\n]+)"?', path.read_text(encoding="utf-8"), re.M)
            if m:
                return m.group(1).strip()
    return None


def _gemini_key() -> str | None:
    return _env("GEMINI_API_KEY")


OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


def _openrouter_models() -> list[str]:
    first = _env("OPENROUTER_MODEL")
    return [m for m in (first, "google/gemini-2.5-flash", "openai/gpt-4o-mini") if m]


def _round(v, n=2):
    return round(v, n) if isinstance(v, float) and math.isfinite(v) else v


def _chat_context() -> dict:
    m = BASE.model
    ctx: dict = {
        "app": "WellPerf — VFM + PTA workflow for the SOCAR Hackathon 2026 (10 gas-lifted wells GL-01..GL-10, Caspian).",
        "model": _model_card(),
        "training_history": {"start": str(BASE.raw[config.TIME_COL].min()), "end": str(BASE.raw[config.TIME_COL].max())} if BASE.raw is not None else None,
        "uploaded_parts": [{k: v for k, v in part_json(p).items() if k in ("filename", "kind", "rows", "start", "end")} for p in S.parts],
        "stages": S.stage_status,
        "use_history": S.use_history,
        "recalibrate": S.recalibrate,
    }
    if m is not None:
        ctx["per_well_sensitivity"] = records(vfm.sensitivities(m).round(3))
    meta = S.stage_meta
    if "clean" in meta:
        ctx["clean"] = {k: meta["clean"].get(k) for k in ("period_start", "period_end", "days", "wells", "rows_uploaded", "flags", "shut_ins", "upsets", "choke_source")}
    if "vfm" in meta:
        v = meta["vfm"]
        ctx["vfm"] = {k: v.get(k) for k in ("field_oil", "field_water", "field_gas", "cum_oil", "per_well", "status_counts", "accuracy_vs_uploaded_tests", "recalibration")}
    if S.analyses:
        rows = []
        for eid, a in S.analyses.items():
            r = a.result
            rows.append({"event_id": eid, "well": a.event[config.WELL_COL], "shut_in_start": str(a.event["shut_in_start"]),
                         "k_md": _round(r.permeability_md), "skin": _round(r.skin), "horner_slope_psi_cycle": _round(r.horner_slope_psi_cycle),
                         "delta_p_skin_psi": _round(r.delta_p_skin_psi), "iarf_quality": r.iarf_quality, "q_oil_stbd": _round(r.q_oil_stbd, 1),
                         "p_star_psia": _round(r.p_star_psia, 1), "flow_efficiency": _round(r.flow_efficiency), "interpretation": pta.interpret(r)})
        ctx["pta"] = rows
    if S.failures is not None and not S.failures.empty:
        ctx["pta_not_analysable"] = records(S.failures)
    try:
        ref = compare_references()
        if ref:
            ctx["reference_comparison"] = ref
    except Exception:
        pass
    return clean_json(ctx)


SYSTEM_PROMPT = """You are WellPerf AI, an expert petroleum-engineering assistant embedded in the WellPerf dashboard
(virtual flow metering + pressure transient analysis). Answer the user's question using the JSON workspace context
below. Rules:
- Reply in the user's language ({lang_name}) unless they write in another language.
- Use the numbers from the context; never invent results. If something has not been run or uploaded yet, say so and
  tell the user which dashboard step to run (01 Data, 02 Clean & QC, 03 Model, 04 VFM, 05 PTA, 06 Field twin, 07 Export).
- Be concise and practical: short paragraphs or bullet lists, units always (STB/d, Mscf/d, psi, md).
- You may explain methods: VFM = physics-constrained bounded ridge on downhole pressure, temperature, annulus pressure,
  lift gas and choke; water cut and GOR follow per-well test trends; daily = flowing × uptime; optional recalibration on
  uploaded well tests. PTA = single-phase oil build-up on predicted oil rate, Bourdet derivative on Agarwal time for the
  radial-flow window, Horner line → m, k = 162.6·q·B·μ/(m·h), skin, ΔP skin = 0.869·m·s.
- Recommend engineering actions only when the data supports them (e.g. skin > 3 → stimulation candidate).

WORKSPACE CONTEXT (JSON):
{context}"""

LANG_NAMES = {"az": "Azerbaijani", "en": "English", "ru": "Russian"}


@app.get("/api/chat/status")
def chat_status():
    if _env("OPENROUTER_API_KEY"):
        return ok({"configured": True, "provider": "openrouter", "models": _openrouter_models()})
    return ok({"configured": bool(_gemini_key()), "provider": "gemini", "models": list(GEMINI_MODELS)})


@app.post("/api/chat")
def chat(body: dict):
    import requests

    or_key = _env("OPENROUTER_API_KEY")
    key = _gemini_key()
    if not key and not or_key:
        raise HTTPException(503, "No AI key configured: set OPENROUTER_API_KEY or GEMINI_API_KEY in engine/.env.")
    msgs = [m for m in (body.get("messages") or []) if m.get("content")][-16:]
    if not msgs or msgs[-1].get("role") != "user":
        raise HTTPException(400, "The last message must come from the user.")
    lang = body.get("lang", "az")
    with LOCK:
        context = json.dumps(_chat_context(), ensure_ascii=False, default=str)[:60000]
    payload = {
        "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT.format(lang_name=LANG_NAMES.get(lang, "Azerbaijani"), context=context)}]},
        "contents": [{"role": "model" if m["role"] == "assistant" else "user", "parts": [{"text": str(m["content"])[:8000]}]} for m in msgs],
        "generationConfig": {"temperature": 0.3, "maxOutputTokens": 2048},
    }

    def stream_openrouter():
        system = payload["systemInstruction"]["parts"][0]["text"]
        messages = [{"role": "system", "content": system}] + [
            {"role": m["role"] if m["role"] in ("user", "assistant") else "user", "content": str(m["content"])[:8000]} for m in msgs
        ]
        last_err = None
        for model in _openrouter_models():
            try:
                with requests.post(
                    OPENROUTER_URL,
                    headers={"Authorization": f"Bearer {or_key}", "X-Title": "WellPerf"},
                    json={"model": model, "messages": messages, "stream": True, "temperature": 0.3, "max_tokens": 2048},
                    stream=True,
                    timeout=(10, 120),
                ) as r:
                    if r.status_code != 200:
                        last_err = f"{model}: HTTP {r.status_code}"
                        continue
                    r.encoding = "utf-8"
                    yield f"data: {json.dumps({'model': model})}\n\n"
                    for line in r.iter_lines(decode_unicode=True):
                        if not line or not line.startswith("data:"):
                            continue
                        data = line[5:].strip()
                        if data == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data)
                        except ValueError:
                            continue
                        if chunk.get("error"):
                            yield f"data: {json.dumps({'error': str(chunk['error'].get('message', chunk['error']))})}\n\n"
                            return
                        text = ((chunk.get("choices") or [{}])[0].get("delta") or {}).get("content") or ""
                        if text:
                            yield f"data: {json.dumps({'text': text}, ensure_ascii=False)}\n\n"
                    yield "data: {\"done\": true}\n\n"
                    return
            except Exception as exc:
                last_err = f"{model}: {type(exc).__name__}"
        yield f"data: {json.dumps({'error': f'AI service unavailable ({last_err})'})}\n\n"

    def stream():
        if or_key:
            yield from stream_openrouter()
            return
        last_err = None
        for model in GEMINI_MODELS:
            try:
                with requests.post(GEMINI_URL.format(model=model), params={"key": key, "alt": "sse"}, json=payload,
                                   stream=True, timeout=(10, 120)) as r:
                    if r.status_code != 200:
                        last_err = f"{model}: HTTP {r.status_code}"
                        continue
                    r.encoding = "utf-8"  # SSE has no charset header; requests would fall back to Latin-1
                    yield f"data: {json.dumps({'model': model})}\n\n"
                    for line in r.iter_lines(decode_unicode=True):
                        if not line or not line.startswith("data:"):
                            continue
                        try:
                            chunk = json.loads(line[5:].strip())
                        except ValueError:
                            continue
                        parts = (chunk.get("candidates") or [{}])[0].get("content", {}).get("parts", [])
                        text = "".join(p.get("text", "") for p in parts if not p.get("thought"))
                        if text:
                            yield f"data: {json.dumps({'text': text}, ensure_ascii=False)}\n\n"
                    yield "data: {\"done\": true}\n\n"
                    return
            except Exception as exc:
                last_err = f"{model}: {type(exc).__name__}"
        yield f"data: {json.dumps({'error': f'AI service unavailable ({last_err})'})}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


@app.get("/api/model")
def model_info():
    _need_baseline()
    return ok(model_card_full())


@app.post("/api/upload")
async def upload(files: list[UploadFile] = File(...)):
    _need_baseline()
    added, errors = [], []
    for f in files:
        data = await f.read()
        try:
            for name, df in _read_bytes(f.filename or "upload.csv", data):
                with LOCK:
                    added.append(part_json(add_part(name, df)))
        except HTTPException as exc:
            errors.append({"file": f.filename, "error": exc.detail})
        except Exception as exc:
            errors.append({"file": f.filename, "error": f"{type(exc).__name__}: {exc}"})
    with LOCK:
        kinds = {a["kind"] for a in added}
        if kinds & {"high_freq", "choke", "pvt", "completion"}:
            invalidate("clean")
        elif "tests" in kinds and S.recalibrate:
            invalidate("vfm")
        elif "tests" in kinds and S.stage_status["vfm"] == "done":
            try:
                S.test_check = _check_against_tests()
                acc = None
                if S.test_check is not None:
                    acc = {c: float(S.test_check[f"ape_{c}"].mean()) for c in RATE_COLS}
                    acc["n_tests"] = int(len(S.test_check))
                S.stage_meta["vfm"]["accuracy_vs_uploaded_tests"] = acc
            except Exception as exc:
                log(f"Well-test comparison skipped: {exc}", "warn")
        if added:
            save_manifest()
    if errors:
        for e in errors:
            log(f"Upload failed — {e['file']}: {e['error']}", "error")
    return ok({"added": added, "errors": errors})


@app.delete("/api/parts/{part_id}")
def delete_part(part_id: str):
    with LOCK:
        before = len(S.parts)
        S.parts = [p for p in S.parts if p.id != part_id]
        if len(S.parts) == before:
            raise HTTPException(404, "Unknown part")
        invalidate("clean")
        log(f"Removed part {part_id}")
        save_manifest()
    return ok({"removed": part_id})


@app.post("/api/reset")
def reset():
    global S
    with LOCK:
        S = Session()
        log("Workspace reset")
        save_manifest()
    return ok({"reset": True})


@app.post("/api/settings")
def settings(body: dict):
    with LOCK:
        if "recalibrate" in body:
            S.recalibrate = bool(body["recalibrate"])
            invalidate("vfm")
            save_manifest()
            log(f"Recalibration with uploaded well tests {'on' if S.recalibrate else 'off'}")
        if "use_history" in body:
            S.use_history = bool(body["use_history"])
            invalidate("clean")
            save_manifest()
            log(f"Training-history context {'on' if S.use_history else 'off'}")
    return ok({"use_history": S.use_history, "recalibrate": S.recalibrate})


@app.post("/api/demo/{month}")
def demo(month: str):
    """Load one month of the TRAINING data as an upload — lets you rehearse the test-day flow."""
    _need_baseline()
    try:
        start = pd.Timestamp(f"{month}-01")
    except Exception:
        raise HTTPException(400, "month must look like 2025-09")
    end = start + pd.offsets.MonthBegin(1)
    df = BASE.raw[(BASE.raw[config.TIME_COL] >= start) & (BASE.raw[config.TIME_COL] < end)]
    if df.empty:
        raise HTTPException(404, f"No training data in {month}")
    ch = BASE.choke[(BASE.choke[config.TIME_COL] >= start) & (BASE.choke[config.TIME_COL] < end)]
    with LOCK:
        parts = [part_json(add_part(f"demo_high_freq_{month}.csv", df.reset_index(drop=True)))]
        if not ch.empty:
            parts.append(part_json(add_part(f"demo_choke_{month}.csv", ch.reset_index(drop=True))))
        invalidate("clean")
        save_manifest()
    return ok({"added": parts})


def _run(stage: str):
    _need_baseline()
    with LOCK:
        S.stage_status[stage] = "running"
        try:
            meta = {"clean": run_clean, "vfm": run_vfm, "pta": run_pta}[stage]()
        except HTTPException:
            S.stage_status[stage] = "idle"
            raise
        except Exception as exc:
            S.stage_status[stage] = "error"
            log(f"{stage} failed: {exc}", "error")
            traceback.print_exc()
            raise HTTPException(500, f"{stage} failed: {exc}")
        save_manifest()
    return ok({"stage": stage, "meta": meta, "stages": S.stage_status})


@app.post("/api/run/{stage}")
def run_stage(stage: str):
    if stage == "all":
        for st in STAGES:
            _run(st)
        return ok({"stage": "all", "meta": S.stage_meta, "stages": S.stage_status})
    if stage not in STAGES:
        raise HTTPException(404, "Unknown stage")
    return _run(stage)


@app.get("/api/wells/{well}/sensors")
def well_sensors(well: str, resolution: str = "1h"):
    with LOCK:
        return ok(sensors_for(well.upper(), resolution))


@app.get("/api/wells/{well}/rates")
def well_rates(well: str):
    with LOCK:
        return ok(rates_for(well.upper()))


@app.get("/api/field/rates")
def field_rates():
    with LOCK:
        if S.pred_scope is None:
            raise HTTPException(400, "Run the VFM stage first.")
        g = S.pred_scope.groupby(DATE_COL)[RATE_COLS].sum().reset_index()
        return ok({"rows": records(g)})


@app.get("/api/pta/{event_id}")
def pta_event(event_id: str):
    with LOCK:
        return ok(event_detail(event_id))


@app.post("/api/pta/{event_id}/override")
def pta_override(event_id: str, body: dict):
    with LOCK:
        if event_id not in S.analyses:
            raise HTTPException(404, "Unknown event")
        if body.get("reset"):
            S.overrides.pop(event_id, None)
        else:
            q = body.get("q_oil_stbd")
            ws, we = body.get("window_start_hours"), body.get("window_end_hours")
            window = (float(ws), float(we)) if ws not in (None, "") and we not in (None, "") else None
            S.overrides[event_id] = pipeline.EventOverride(
                q_oil_stbd=float(q) if q not in (None, "") else None, window_hours=window)
        event = S.analyses[event_id].event
        try:
            S.analyses[event_id] = _analyse(event)
        except (pta.PTAError, ValueError) as exc:
            S.overrides.pop(event_id, None)
            S.analyses[event_id] = _analyse(event)
            raise HTTPException(400, str(exc))
        S.stage_meta.setdefault("pta", {})["results"] = records(pta_rows())
        log(f"PTA override on {event_id}: {'reset' if body.get('reset') else body}")
        return ok(event_detail(event_id))


@app.get("/api/results/pta")
def pta_table():
    with LOCK:
        return ok({"results": records(pta_rows()), "failed": records(S.failures) if S.failures is not None and not S.failures.empty else []})


@app.get("/api/preview/vfm")
def vfm_preview(limit: int = 200):
    with LOCK:
        df = _vfm_frame()
        return ok({"rows": records(df.head(limit).astype({"date": str})), "total": int(len(df))})


# ---------------------------------------------------------------------------------------------
# Export archive: every full export is kept as a timestamped ZIP + metadata on disk
# ---------------------------------------------------------------------------------------------

ARCHIVE_DIR = ROOT / "outputs" / "archive"
ARCHIVE_ID = re.compile(r"^\d{8}-\d{6}(-\d+)?$")


def _archive_meta(data: bytes, source: str) -> dict:
    from datetime import datetime

    meta = S.stage_meta
    clean_m, vfm_m = meta.get("clean", {}), meta.get("vfm", {})
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        files = [i.filename for i in zf.infolist()]
    return clean_json({
        "created": datetime.now().isoformat(timespec="seconds"),
        "source": source,
        "period_start": clean_m.get("period_start"),
        "period_end": clean_m.get("period_end"),
        "wells": len(clean_m.get("wells") or []),
        "days": clean_m.get("days"),
        "uploads": [p.filename for p in S.parts],
        "field_oil": vfm_m.get("field_oil"),
        "shut_ins": len(S.analyses or {}),
        "files": files,
        "size": len(data),
    })


def archive_save(data: bytes, source: str) -> dict:
    from datetime import datetime

    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    base = datetime.now().strftime("%Y%m%d-%H%M%S")
    aid, n = base, 1
    while (ARCHIVE_DIR / f"{aid}.zip").exists():
        n += 1
        aid = f"{base}-{n}"
    meta = {"id": aid, **_archive_meta(data, source)}
    (ARCHIVE_DIR / f"{aid}.zip").write_bytes(data)
    (ARCHIVE_DIR / f"{aid}.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
    return meta


def _archive_path(aid: str, ext: str) -> Path:
    if not ARCHIVE_ID.match(aid):
        raise HTTPException(400, "Bad archive id.")
    path = ARCHIVE_DIR / f"{aid}.{ext}"
    if not path.exists():
        raise HTTPException(404, "Archive entry not found.")
    return path


@app.get("/api/archive")
def archive_list():
    items = []
    if ARCHIVE_DIR.exists():
        for f in sorted(ARCHIVE_DIR.glob("*.json"), reverse=True):
            try:
                items.append(json.loads(f.read_text(encoding="utf-8")))
            except ValueError:
                continue
    items.sort(key=lambda a: (a.get("created", ""), len(a.get("id", "")), a.get("id", "")), reverse=True)
    return ok({"items": items})


@app.post("/api/archive")
def archive_create():
    with LOCK:
        if S.prepared is None or S.stage_status.get("vfm") != "done":
            raise HTTPException(400, "Run the VFM stage first.")
        data, _ = build_export("wellperf_deliverables.zip")
        meta = archive_save(data, "manual")
    return ok(meta)


@app.get("/api/archive/{aid}/download")
def archive_download(aid: str):
    path = _archive_path(aid, "zip")
    return Response(content=path.read_bytes(), media_type="application/zip",
                    headers={"Content-Disposition": f'attachment; filename="wellperf_{aid}.zip"'})


@app.delete("/api/archive/{aid}")
def archive_delete(aid: str):
    _archive_path(aid, "zip").unlink()
    meta = ARCHIVE_DIR / f"{aid}.json"
    if meta.exists():
        meta.unlink()
    return ok({"deleted": aid})


@app.get("/api/export/{name}")
def export(name: str):
    with LOCK:
        if S.prepared is None:
            raise HTTPException(400, "Nothing processed yet.")
        data, mime = build_export(name)
        if name == "wellperf_deliverables.zip":
            try:
                archive_save(data, "download")
            except OSError:
                pass
    return Response(content=data, media_type=mime,
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
