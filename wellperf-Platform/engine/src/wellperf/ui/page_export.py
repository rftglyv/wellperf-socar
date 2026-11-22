"""Step 4: export Excel deliverables and offline HTML reports for both modules."""

from __future__ import annotations

from datetime import datetime

import streamlit as st

from wellperf import config, reports
from wellperf.ui import state


def render() -> None:
    st.header("4 · Reports & export")
    prepared, model = state.get_prepared(), state.get_model()
    if prepared is None or model is None:
        st.info("Complete steps 1 and 2 first.")
        return
    try:
        pred = state.get_predictions(prepared, model)
    except ValueError as exc:
        st.error(f"The VFM model does not fit this data: {exc}. Retrain it in step 2.")
        return
    analyses, _ = state.get_analyses(prepared, pred)
    if state.get_overrides():
        st.warning(f"PTA overrides active for: {', '.join(state.get_overrides())}. "
                   "The exports use them (see the q_source and window_source columns).")
    files = reports.build_outputs(prepared, model, pred, analyses, state.clean_tests_for_plot())

    left, right = st.columns(2)
    left.subheader("Phase 1 — VFM")
    left.download_button("Predictions (Excel)", files["vfm_daily_predictions.xlsx"], "vfm_daily_predictions.xlsx")
    left.download_button("Report (HTML, works offline)", files["vfm_report.html"], "vfm_report.html")
    right.subheader("Phase 2 — PTA")
    right.download_button("Reservoir properties (Excel)", files["pta_reservoir_properties.xlsx"],
                          "pta_reservoir_properties.xlsx")
    right.download_button("Report with all plots (HTML, works offline)", files["pta_report.html"], "pta_report.html")

    if st.button("Save all to the project's outputs/ folder"):
        paths = reports.write_outputs(files)
        st.success(f"Saved {len(paths)} files to {config.OUTPUTS_DIR} at {datetime.now():%H:%M:%S}.")
