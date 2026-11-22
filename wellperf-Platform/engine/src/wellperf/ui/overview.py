"""Top-of-app summary: where lift gas is worth the most, in plain words with icons."""

from __future__ import annotations

import pandas as pd
import streamlit as st

from wellperf import config, gaslift, pipeline, plots
from wellperf.ui import state

MOVE_STEP_MSCFD = 100
HOW_IT_WORKS = [
    "📉 **14 Jun, 10:20–15:02:** lift gas dropped by about half in all 10 wells at the same time.",
    "📏 **We measured** how much each well's bottom-hole pressure rose: a bigger rise means the well "
    "leans harder on lift gas.",
    "✖️ **Pressure rise × well productivity** (from its build-up test) = extra oil per +100 Mscf/d of lift gas.",
    "⚠️ **Move gas in small steps** (about +10 %) and confirm with a well test. The gain flattens at high gas rates.",
]


def _card(col, icon: str, title: str, value: str, note: str) -> None:
    with col.container(border=True):
        st.markdown(f"#### {icon} {title}")
        st.markdown(f"**{value}**")
        st.caption(note)


def _cards(table: pd.DataFrame) -> None:
    measured = table[table["confidence"] == gaslift.CONFIDENCE_MEASURED]
    best = (measured if not measured.empty else table).iloc[0]
    worst = table.iloc[-1]
    promising = table.iloc[0]
    gain = (best["oil_gain_stbd_per_100_mscfd"] - worst["oil_gain_stbd_per_100_mscfd"]) * MOVE_STEP_MSCFD / 100
    cols = st.columns(4)
    _card(cols[0], "🥇", "Best place", best[config.WELL_COL],
          f"+{best['oil_gain_stbd_per_100_mscfd']:.0f} STB/d oil per +100 Mscf/d (measured)")
    if promising[config.WELL_COL] != best[config.WELL_COL]:
        _card(cols[1], "🔍", "Check next", promising[config.WELL_COL],
              f"Strongest response (+{promising['pwf_rise_psi_per_100_mscfd']:.0f} psi per 100 Mscf/d). "
              f"Could give about +{promising['oil_gain_stbd_per_100_mscfd']:.0f} STB/d; needs a build-up test to confirm.")
    _card(cols[2], "⬇️", "Lowest value", worst[config.WELL_COL],
          f"Only +{worst['oil_gain_stbd_per_100_mscfd']:.0f} STB/d per +100 Mscf/d: gas can come from here")
    _card(cols[3], "🔁", "Move gas", f"{worst[config.WELL_COL]} → {best[config.WELL_COL]}",
          f"Shift {MOVE_STEP_MSCFD} Mscf/d of lift gas ≈ +{gain:.0f} STB/d oil, same total gas")


def lift_gas_table(prepared: pipeline.Prepared) -> pd.DataFrame | None:
    model = state.get_model()
    if model is None:
        return None
    pred = state.get_predictions(prepared, model)
    analyses, _ = state.get_analyses(prepared, pred)
    return gaslift.lift_gas_value(prepared.minute, prepared.upsets, pipeline.pta_results_table(analyses))


def render(prepared: pipeline.Prepared) -> None:
    st.subheader("💨 Lift-gas optimiser: where does extra gas give the most oil?")
    try:
        table = lift_gas_table(prepared)
    except ValueError as exc:
        st.info(f"Train the VFM model in step 2 to see the lift-gas ranking ({exc}).")
        return
    if table is None or table.empty:
        st.info("Needs a trained VFM model (step 2) and a field-wide lift-gas cut in the data.")
        return
    _cards(table)
    left, right = st.columns([3, 2])
    left.plotly_chart(plots.lift_gas_ranking(table), use_container_width=True)
    right.markdown("**How it works**")
    right.markdown("\n".join(f"- {line}" for line in HOW_IT_WORKS))
    st.divider()
