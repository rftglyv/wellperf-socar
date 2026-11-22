"""Where is lift gas worth the most? A ranking from a measured field-wide lift-gas cut.

On a field-wide gas-lift upset every well loses lift gas at the same time (a natural
experiment). For each well:
  leverage  = rise in downhole flowing pressure per 100 Mscf/d of lift gas removed (measured)
  oil value = leverage × oil productivity index (PI from that well's build-up test, else the
              field median PI — marked 'estimated')
            ≈ extra oil (STB/d) per +100 Mscf/d of lift gas around today's operating point.
Linear around the current rate: real gas-lift curves flatten, so move gas in small steps and
confirm with a well test. This is a screening ranking, not a full gas-lift optimisation.
"""

from __future__ import annotations

import pandas as pd

from wellperf import config

FIELD_WIDE = "field-wide"
SETTLE_AFTER_START = pd.Timedelta(minutes=30)  # skip the transient right after the cut
SKIP_BEFORE_END = pd.Timedelta(minutes=5)
BASELINE_BEFORE = pd.Timedelta(hours=3)
RECOVERY_AFTER_END = pd.Timedelta(minutes=60)
BASELINE_AFTER = pd.Timedelta(hours=4)
EDGE_MARGIN = pd.Timedelta(minutes=5)
PER_MSCFD = 100.0
MIN_GAS_CUT_MSCFD = 50.0
CONFIDENCE_MEASURED, CONFIDENCE_ESTIMATED = "measured PI (build-up)", "estimated PI (field median)"
RANKING_COLS = [config.WELL_COL, "lift_gas_cut_mscfd", "pwf_rise_psi", "pwf_rise_psi_per_100_mscfd",
                "oil_pi_stbd_psi", "oil_gain_stbd_per_100_mscfd", "confidence"]


def _largest_field_wide_event(upsets: pd.DataFrame) -> pd.DataFrame:
    field = upsets[upsets["scope"] == FIELD_WIDE] if "scope" in upsets else upsets.iloc[0:0]
    if field.empty:
        return field
    first = field.sort_values("start").iloc[0]["start"]
    return field[(field["start"] - first).abs() <= pd.Timedelta(hours=1)]


def _well_response(minute: pd.DataFrame, upset: pd.Series) -> dict | None:
    well = minute[minute[config.WELL_COL] == upset[config.WELL_COL]].set_index(config.TIME_COL).sort_index()
    during = well.loc[upset["start"] + SETTLE_AFTER_START: upset["end"] - SKIP_BEFORE_END]
    base = pd.concat([well.loc[upset["start"] - BASELINE_BEFORE: upset["start"] - EDGE_MARGIN],
                      well.loc[upset["end"] + RECOVERY_AFTER_END: upset["end"] + BASELINE_AFTER]])
    if during.empty or base.empty:
        return None
    cut = base["gas_lift_rate_mscfd"].median() - during["gas_lift_rate_mscfd"].median()
    rise = during["dh_pressure_psia"].median() - base["dh_pressure_psia"].median()
    if cut < MIN_GAS_CUT_MSCFD:
        return None
    return {config.WELL_COL: upset[config.WELL_COL], "lift_gas_cut_mscfd": cut, "pwf_rise_psi": rise}


def lift_gas_value(minute: pd.DataFrame, upsets: pd.DataFrame, pta_results: pd.DataFrame) -> pd.DataFrame:
    """Per-well extra oil per +100 Mscf/d of lift gas, best first (empty if no field-wide cut)."""
    event = _largest_field_wide_event(upsets)
    rows = [r for _, u in event.iterrows() if (r := _well_response(minute, u)) is not None]
    if not rows:
        return pd.DataFrame(columns=RANKING_COLS)
    table = pd.DataFrame(rows)
    pi = pta_results.groupby(config.WELL_COL)["productivity_index_stbd_psi"].mean() if not pta_results.empty \
        else pd.Series(dtype=float)
    measured = table[config.WELL_COL].map(pi)
    leverage = PER_MSCFD * table["pwf_rise_psi"] / table["lift_gas_cut_mscfd"]
    oil_pi = measured.fillna(pi.median() if len(pi) else float("nan"))
    table = table.assign(
        pwf_rise_psi_per_100_mscfd=leverage, oil_pi_stbd_psi=oil_pi,
        oil_gain_stbd_per_100_mscfd=leverage * oil_pi,
        confidence=measured.notna().map({True: CONFIDENCE_MEASURED, False: CONFIDENCE_ESTIMATED}),
    )
    return table.sort_values("oil_gain_stbd_per_100_mscfd", ascending=False, ignore_index=True)[RANKING_COLS]
