"""Step 3: automated build-up analysis for every shut-in, driven by VFM oil rates."""

from __future__ import annotations

import streamlit as st

from wellperf import exports, pipeline, plots, pta
from wellperf.ui import state

QUALITY_BADGE = {
    pta.QUALITY_GOOD: ("Radial flow: good", "green"),
    pta.QUALITY_INDICATIVE: ("Radial flow: indicative only", "orange"),
    pta.QUALITY_NONE: ("No stable radial flow: indicative only", "red"),
}
TILES_PER_ROW = 3
GRAPH_DATA_TABS = ["📈 Graph", "📋 Data"]
PLOT_CHOICES = {"Log-log diagnostic": "loglog", "Horner": "horner", "MDH": "mdh", "Rate & pressure history": "history"}


def _event_metrics(result: pta.PTAResult) -> None:
    label, color = QUALITY_BADGE[result.iarf_quality]
    st.badge(label, color=color)
    tiles = [
        ("Horner slope m (psi/cycle)", f"{result.horner_slope_psi_cycle:.2f}", None),
        ("Permeability ko (effective to oil, md)", f"{result.permeability_md:.1f}",
         f"Range across window choices: {result.k_min_md:.1f}–{result.k_max_md:.1f} md"),
        ("Skin s", f"{result.skin:.2f}", f"Range: {result.skin_min:.2f} to {result.skin_max:.2f}"),
        ("ΔP skin (psi)", f"{result.delta_p_skin_psi:.1f}", None),
        ("p* (semilog extrapolation, psia)", f"{result.p_star_psia:.0f}", None),
        ("Last measured pws (psia)", f"{result.last_measured_pws_psia:.0f}", None),
        (f"PI (STB/d/psi, vs {'last measured pws' if result.pressure_basis == 'last_measured' else 'p*'})",
         f"{result.productivity_index_stbd_psi:.2f}", None),
        ("Flow efficiency", f"{result.flow_efficiency:.0%}", None),
        ("Oil rate used (STB/d)", f"{result.q_oil_stbd:.0f}", None),
        ("Radius of investigation (ft)", f"{result.radius_of_investigation_ft:.0f}",
         "At the end of the fitted radial-flow window"),
        ("Fitted window (h)", f"{result.iarf_start_hours:.2f}–{result.iarf_end_hours:.2f}", None),
        ("Derivative slope in window", f"{result.derivative_log_slope:+.3f}", None),
    ]
    for row in range(0, len(tiles), TILES_PER_ROW):
        for col, (label, value, help_text) in zip(st.columns(TILES_PER_ROW), tiles[row:row + TILES_PER_ROW]):
            col.metric(label, value, help=help_text)


def _override_controls(event_id: str, analysis: pipeline.EventAnalysis) -> None:
    current = state.get_overrides().get(event_id, pipeline.EventOverride())
    dt = sorted({round(float(h), 3) for h in analysis.diagnostics.dt})
    r = analysis.result
    with st.expander("Override the oil rate or the radial-flow window", expanded=current != pipeline.EventOverride()):
        q = st.number_input("Oil rate before shut-in (STB/d)", min_value=1.0, step=10.0, format="%.1f",
                            value=float(current.q_oil_stbd or round(analysis.inputs.q_oil_stbd, 1)), key=f"q_{event_id}")
        start, end = min(dt, key=lambda h: abs(h - r.iarf_start_hours)), min(dt, key=lambda h: abs(h - r.iarf_end_hours))
        window = st.select_slider("Radial-flow window", options=dt, value=(start, end),
                                  format_func=lambda h: f"{h:.2f} h", key=f"win_{event_id}")
        apply, reset = st.columns(2)
        if apply.button("Apply override", key=f"apply_{event_id}", type="primary"):
            q_val = None if analysis.q_source == "vfm" and abs(q - analysis.inputs.q_oil_stbd) < 0.05 else q
            win_val = None if (window == (start, end) and r.window_source == "auto") else window
            state.set_override(event_id, pipeline.EventOverride(q_oil_stbd=q_val, window_hours=win_val))
            st.rerun()
        if reset.button("Reset to automatic", key=f"reset_{event_id}"):
            state.set_override(event_id, None)
            st.rerun()


def _single_event(prepared: pipeline.Prepared, pred, analyses: dict) -> pipeline.EventAnalysis:
    event_id = st.selectbox("Shut-in event", list(analyses), key="pta_event")
    analysis = analyses[event_id]
    if analysis.q_source == "override":
        st.warning(f"Override active: q = {analysis.inputs.q_oil_stbd:.1f} STB/d (VFM value replaced).")
    if analysis.result.window_source == "manual":
        st.warning(f"Manual radial-flow window: {analysis.result.iarf_start_hours:.2f}–"
                   f"{analysis.result.iarf_end_hours:.2f} h.")
    _override_controls(event_id, analysis)
    _event_metrics(analysis.result)
    return analysis


def _graph(prepared: pipeline.Prepared, pred, analysis: pipeline.EventAnalysis) -> None:
    figs = plots.pta_figures(analysis, prepared.minute, pred)
    choice = st.segmented_control("Plot", list(PLOT_CHOICES), default="Log-log diagnostic", key="pta_plot")
    st.plotly_chart(figs[PLOT_CHOICES[choice or "Log-log diagnostic"]], use_container_width=True)
    st.subheader("Interpretation")
    st.markdown("\n".join(f"- {note}" for note in pta.interpret(analysis.result)))


def render() -> None:
    st.header("3 · Pressure transient analysis")
    st.caption("Build-up interpretation (single-phase oil) for each shut-in, using the VFM-predicted daily oil rate. "
               "k is the effective permeability to oil.")
    prepared, model = state.get_prepared(), state.get_model()
    if prepared is None or model is None:
        st.info("Complete steps 1 and 2 first (data loaded and VFM model available).")
        return
    try:
        pred = state.get_predictions(prepared, model)
    except ValueError as exc:
        st.error(f"The VFM model does not fit this data: {exc}. Retrain it in step 2.")
        return
    analyses, failures = state.get_analyses(prepared, pred)
    if not analyses:
        st.warning("No shut-in event could be analysed.")
    else:
        analysis = _single_event(prepared, pred, analyses)
        results = pipeline.pta_results_table(analyses, pipeline.forward_oil_uncertainty(model))
        graph_tab, data_tab = st.tabs(GRAPH_DATA_TABS)
        with graph_tab:
            _graph(prepared, pred, analysis)
        with data_tab:
            st.subheader("All shut-in events")
            st.dataframe(exports.round_numeric(exports.pta_deliverable(results), 3), use_container_width=True,
                         hide_index=True)
        st.download_button("Download reservoir properties (Excel)", exports.pta_excel(results, analyses),
                           file_name="pta_reservoir_properties.xlsx", type="primary")
    if not failures.empty:
        st.error("Some events could not be analysed:")
        st.dataframe(failures, hide_index=True)
    with st.expander("Method and equations"):
        st.markdown(pta.__doc__)
