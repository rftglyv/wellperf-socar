"""Step 1: upload data, inspect quality, visualise field measurements."""

from __future__ import annotations

import pandas as pd
import streamlit as st

from wellperf import config, plots
from wellperf.loaders import DataValidationError
from wellperf.ui import overview, state

FLAG_SUFFIXES = ("__sentinel", "__spike", "__out_of_bounds", "__frozen")
GRAPH_DATA_TABS = ["📈 Graph", "📋 Data"]
GENERAL_CHECKS = ("duplicates_removed", "out_of_order_rows", "gap_count")


def _upload_section() -> None:
    source = st.radio(
        "Data source",
        ["Project data folder", "Upload files"],
        horizontal=True,
        index=1 if state.using_uploads() else 0,
        help="The project folder already contains the hackathon dataset.",
    )
    st.session_state["source"] = "upload" if source == "Upload files" else "folder"
    if not state.using_uploads():
        return
    uploads = dict(state.uploaded_files())
    cols = st.columns(len(state.UPLOAD_KEYS))
    for col, (key, (label, types)) in zip(cols, state.UPLOAD_KEYS.items()):
        file = col.file_uploader(label, type=types, key=f"up_{key}")
        if file is not None:
            uploads[key] = state.NamedBytes(file.getvalue(), file.name)
    st.session_state["uploads"] = uploads


def fired_flags(qc: pd.DataFrame) -> pd.DataFrame:
    """Long table of only the QC checks that found something (count > 0)."""
    checks = [c for c in qc.columns if c.endswith(FLAG_SUFFIXES) or c in GENERAL_CHECKS]
    long = qc.melt(id_vars=[config.WELL_COL], value_vars=checks, var_name="check", value_name="count")
    long = long[long["count"] > 0]
    split = long["check"].str.split("__", n=1, expand=True)
    sensor = split[0].where(split[1].notna(), "all sensors")
    issue = split[1].fillna(split[0])
    return pd.DataFrame({config.WELL_COL: long[config.WELL_COL], "sensor": sensor, "issue": issue,
                         "count": long["count"]}).sort_values(["issue", config.WELL_COL], ignore_index=True)


def render() -> None:
    st.header("1 · Field data")
    st.caption("Load well data, check sensor quality and review shut-ins and gas-lift upsets before modelling.")
    _upload_section()
    try:
        prepared = state.get_prepared()
    except DataValidationError as exc:
        st.error(f"Input file problem: {exc}")
        return
    if prepared is None:
        st.info("Upload at least the high-frequency data, PVT and completion files to continue.")
        return

    overview.render(prepared)
    wells = sorted(prepared.daily[config.WELL_COL].unique())
    c1, c2, c3, c4, c5 = st.columns(5)
    c1.metric("Wells", len(wells))
    c2.metric("Sensor rows (M)", f"{prepared.minute.shape[0] / 1e6:.2f}")
    c3.metric("Days", prepared.daily["date"].nunique())
    c4.metric("Shut-in events", len(prepared.events))
    c5.metric("Gas-lift upsets", len(prepared.upsets))

    well = st.selectbox("Well", wells)
    graph_tab, data_tab = st.tabs(GRAPH_DATA_TABS)
    with graph_tab:
        st.plotly_chart(plots.sensor_panels(prepared.minute, well, prepared.events, prepared.upsets),
                        use_container_width=True)
    with data_tab:
        _data_tables(prepared)


def _data_tables(prepared) -> None:
    st.subheader("Data quality: checks that fired")
    st.dataframe(fired_flags(prepared.qc), use_container_width=True, hide_index=True)
    with st.expander("Full data-quality table (all checks, including zeros)"):
        st.dataframe(prepared.qc, use_container_width=True, hide_index=True)
    st.subheader("Shut-in events (analysed in step 3)")
    st.dataframe(prepared.events, use_container_width=True, hide_index=True)
    st.subheader("Gas-lift upsets (data-quality flags, not shut-ins)")
    st.caption("Lift gas below 70 % of its trailing 24 h median for ≥ 30 min while producing; "
               "'field-wide' when ≥ 3 wells start within 30 min.")
    st.dataframe(prepared.upsets, use_container_width=True, hide_index=True)
