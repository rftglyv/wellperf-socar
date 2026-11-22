"""Lift-gas value ranking from a field-wide lift-gas cut (natural experiment)."""

from __future__ import annotations

import numpy as np
import pandas as pd

from tests.conftest import START, make_minutes
from wellperf import config
from wellperf.gaslift import CONFIDENCE_ESTIMATED, CONFIDENCE_MEASURED, lift_gas_value

CUT_START = START + pd.Timedelta(days=2, hours=10)
CUT_END = CUT_START + pd.Timedelta(hours=4)


def _well(name: str, seed: int, pwf_rise: float) -> pd.DataFrame:
    df = make_minutes(name, seed=seed)
    during = df[config.TIME_COL].between(CUT_START, CUT_END - pd.Timedelta(minutes=1))
    return df.assign(
        gas_lift_rate_mscfd=df["gas_lift_rate_mscfd"].where(~during, 400.0),
        dh_pressure_psia=df["dh_pressure_psia"].where(~during, df["dh_pressure_psia"] + pwf_rise),
    )


def _inputs():
    minute = pd.concat([_well("A", 1, 40.0), _well("B", 2, 10.0), _well("C", 3, 20.0)], ignore_index=True)
    upsets = pd.DataFrame({config.WELL_COL: ["A", "B", "C"], "start": [CUT_START] * 3, "end": [CUT_END] * 3,
                           "scope": ["field-wide"] * 3})
    pta = pd.DataFrame({config.WELL_COL: ["A", "B"], "productivity_index_stbd_psi": [2.0, 4.0]})
    return minute, upsets, pta


def test_ranking_uses_measured_leverage_and_pi():
    table = lift_gas_value(*_inputs())
    a, b, c = (table.set_index(config.WELL_COL).loc[w] for w in "ABC")
    assert np.isfinite(a["pwf_rise_psi"])
    assert abs(a["pwf_rise_psi"] - 40.0) < 2 and abs(b["pwf_rise_psi"] - 10.0) < 2
    # A: 40 psi per 400 Mscf/d -> 10 psi per 100 -> x PI 2 = 20 STB/d; B: 2.5 psi x 4 = 10 STB/d
    assert abs(a["oil_gain_stbd_per_100_mscfd"] - 20.0) < 2
    assert abs(b["oil_gain_stbd_per_100_mscfd"] - 10.0) < 2
    assert table.iloc[0][config.WELL_COL] == "A"
    assert a["confidence"] == CONFIDENCE_MEASURED and c["confidence"] == CONFIDENCE_ESTIMATED


def test_no_field_wide_cut_gives_empty_table():
    minute, upsets, pta = _inputs()
    assert lift_gas_value(minute, upsets.iloc[0:0], pta).empty
