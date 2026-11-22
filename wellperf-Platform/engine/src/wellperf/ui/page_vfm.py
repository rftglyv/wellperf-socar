"""Step 2: virtual flow metering — model status, validation and daily predictions."""

from __future__ import annotations

import streamlit as st

from wellperf import config, exports, pipeline, plots, vfm
from wellperf.features import DATE_COL
from wellperf.ui import state

GRAPH_DATA_TABS = ["📈 Graph", "📋 Data"]
PHASE_LABELS = {"oil_rate_stbd": "Oil", "water_rate_stbd": "Water", "gas_rate_mscfd": "Gas"}
SCOPE_NOTE = (
    "**What drives each rate.** Liquid is sensor-driven (downhole pressure, temperature, annulus pressure, "
    "lift gas, choke). Water cut follows a per-well time trend from the tests, and GOR is the per-well test "
    "mean, so daily water and gas follow test trends, not sensors. "
    "**Use:** allocation between well tests and input to build-up analysis. "
    "**Not valid for lift-gas optimisation.**"
)


def _training_controls(prepared: pipeline.Prepared) -> None:
    raw_tests = state.get_raw_tests()
    model = state.get_model()
    left, right = st.columns([3, 1])
    if model is None:
        left.warning("No trained model yet. Train it on the well tests.")
    else:
        left.success(f"VFM model ready ({st.session_state.get('model_source', '')}).")
    if raw_tests is None:
        right.caption("No well-test file found — upload one to (re)train.")
        return
    if right.button("Train / retrain model", type="primary", use_container_width=True):
        with st.spinner("Training with held-out and forward validation (about a minute)…"):
            new_model = pipeline.train_vfm(prepared, raw_tests)
        state.set_model(new_model, f"trained on {len(new_model.cv_predictions)} well tests")
        st.rerun()


def _mape(metrics, target: str) -> float | None:
    if metrics.empty:
        return None
    row = metrics[(metrics["target"] == target) & (metrics["method"] == "VFM model")]
    return float(row["MAPE_pct"].iloc[0]) if len(row) else None


def _accuracy_tiles(model: vfm.VFMModel) -> None:
    cols = st.columns(len(PHASE_LABELS) + 1)
    for col, (target, label) in zip(cols, PHASE_LABELS.items()):
        held, fwd = _mape(model.cv_metrics, target), _mape(model.forward_metrics, target)
        col.metric(f"{label} — held-out error", f"{held:.1f} %" if held is not None else "–",
                   help="Leave-one-test-out MAPE")
        col.metric(f"{label} — forward error", f"{fwd:.1f} %" if fwd is not None else "–",
                   help="Each test predicted only from earlier tests (MAPE)")
    if not model.test_day_bias.empty:
        cols[-1].metric("Test-day vs normal-day bias", f"{model.test_day_bias['test_vs_neighbour_pct'].median():+.2f} %",
                        help="Near zero: the model does not learn the test-separator routing.")
    cols[-1].metric("Tests (held-out / forward)", f"{len(model.cv_predictions)} / {len(model.forward_predictions)}")


def _validation(model: vfm.VFMModel, well: str) -> None:
    st.subheader("Validation")
    if model.cv_metrics.empty:
        st.info("This model was saved without validation results. Retrain to compute them.")
        return
    _accuracy_tiles(model)
    mode = st.segmented_control("Error view", ["Held-out", "Forward"], default="Held-out", key="vfm_err_mode")
    source = model.forward_predictions if mode == "Forward" and not model.forward_predictions.empty else model.cv_predictions
    st.plotly_chart(plots.error_vs_time(source, well, f"{mode or 'Held-out'} error vs well tests"),
                    use_container_width=True)
    with st.expander("Predicted vs measured (all wells, log axes) and metric tables"):
        st.plotly_chart(plots.cv_parity(model.cv_predictions), use_container_width=True)
        st.dataframe(model.cv_metrics.round(2), hide_index=True, use_container_width=True)
        st.dataframe(model.forward_metrics.round(2), hide_index=True, use_container_width=True)
    with st.expander("Per-well response to the inputs (% change in liquid)"):
        st.dataframe(vfm.sensitivities(model).round(2), hide_index=True, use_container_width=True)
    with st.expander("Well-test label corrections"):
        st.dataframe(model.label_corrections, use_container_width=True, hide_index=True)
    with st.expander("How the model works"):
        st.markdown(vfm.__doc__)


def _predictions_table(pred, well: str):
    cols = [DATE_COL, "oil_rate_stbd", "water_rate_stbd", "gas_rate_mscfd", "uptime_frac", "data_status"]
    table = pred.loc[pred[config.WELL_COL] == well, cols]
    return exports.round_numeric(table.assign(**{DATE_COL: table[DATE_COL].dt.date}), 1)


def render() -> None:
    st.header("2 · Virtual flow metering")
    st.caption("Estimate daily oil, water and gas rates from pressures, temperatures, gas lift and choke settings.")
    prepared = state.get_prepared()
    if prepared is None:
        st.info("Load data in step 1 first.")
        return
    _training_controls(prepared)
    model = state.get_model()
    if model is None:
        return
    try:
        pred = state.get_predictions(prepared, model)
    except ValueError as exc:
        st.error(f"Cannot predict: {exc}")
        return
    st.info(SCOPE_NOTE)
    well = st.selectbox("Well", sorted(pred[config.WELL_COL].unique()), key="vfm_well")
    _validation(model, well)
    st.subheader("Daily production rates")
    graph_tab, data_tab = st.tabs(GRAPH_DATA_TABS)
    with graph_tab:
        st.plotly_chart(plots.daily_rates(pred, state.clean_tests_for_plot(), well), use_container_width=True)
    with data_tab:
        st.dataframe(_predictions_table(pred, well), use_container_width=True, hide_index=True)
    st.download_button(
        "Download VFM predictions (Excel)",
        exports.vfm_excel(
            pred, model.cv_metrics, model.cv_predictions, model.label_corrections, prepared.qc,
            {"forward_validation_metrics": model.forward_metrics.round(3),
             "forward_validation_per_test": model.forward_predictions,
             "sensitivities": vfm.sensitivities(model).round(4), "gas_lift_upsets": prepared.upsets},
        ),
        file_name="vfm_daily_predictions.xlsx", type="primary",
    )
