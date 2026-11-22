"""Gas-lift upset detection and data-quality flags on synthetic data."""

from __future__ import annotations

import pandas as pd

from tests.conftest import START, make_minutes
from wellperf import config
from wellperf.cleaning import clean_high_freq
from wellperf.events import detect_gas_lift_upsets, detect_shut_ins

UPSET_START = START + pd.Timedelta(days=2, hours=10)


def _with_flags(raw: pd.DataFrame, events: pd.DataFrame | None = None) -> pd.DataFrame:
    clean, _ = clean_high_freq(raw)
    events = events if events is not None else detect_shut_ins(clean, None)
    from wellperf.events import shut_in_mask
    return clean.assign(is_shut_in=shut_in_mask(clean[config.TIME_COL], clean[config.WELL_COL], events))


def _halve(df: pd.DataFrame, start: pd.Timestamp, minutes: int) -> pd.DataFrame:
    sel = df[config.TIME_COL].between(start, start + pd.Timedelta(minutes=minutes - 1))
    return df.assign(gas_lift_rate_mscfd=df["gas_lift_rate_mscfd"].where(~sel, df["gas_lift_rate_mscfd"] * 0.5))


def test_field_wide_upset_when_three_wells_drop_together():
    wells = [_halve(make_minutes(f"W-{i}", seed=i), UPSET_START + pd.Timedelta(minutes=5 * i), 120) for i in range(3)]
    upsets = detect_gas_lift_upsets(_with_flags(pd.concat(wells, ignore_index=True)))
    assert len(upsets) == 3
    assert (upsets["scope"] == "field-wide").all()
    assert upsets["duration_min"].between(110, 125).all()


def test_single_well_upset_and_short_dip_ignored():
    w1 = _halve(make_minutes("W-1"), UPSET_START, 60)
    w2 = _halve(make_minutes("W-2", seed=2), UPSET_START, 10)  # too short
    upsets = detect_gas_lift_upsets(_with_flags(pd.concat([w1, w2], ignore_index=True)))
    assert list(upsets[config.WELL_COL]) == ["W-1"]
    assert upsets["scope"].iloc[0] == "single-well"


def test_shut_in_is_not_an_upset():
    raw = make_minutes("W-1")
    sel = raw[config.TIME_COL].between(UPSET_START, UPSET_START + pd.Timedelta(hours=8))
    raw = raw.assign(gas_lift_rate_mscfd=raw["gas_lift_rate_mscfd"].where(~sel, 0.0))
    upsets = detect_gas_lift_upsets(_with_flags(raw))
    assert upsets.empty


def test_frozen_run_and_out_of_bounds_are_flagged():
    raw = make_minutes("W-1")
    raw.loc[3000:3089, "annulus_pressure_psia"] = 1111.11  # 90-minute frozen sensor
    raw.loc[100, "dh_temperature_degf"] = 999.0  # beyond physical bounds
    clean, qc = clean_high_freq(raw)
    assert qc.loc[0, "annulus_pressure_psia__frozen"] == 90
    assert clean.loc[3000:3089, "annulus_pressure_psia"].isna().all()
    assert qc.loc[0, "dh_temperature_degf__out_of_bounds"] == 1


def test_brief_recovery_does_not_split_an_upset():
    raw = _halve(make_minutes("W-1"), UPSET_START, 120)
    blip = raw[config.TIME_COL] == UPSET_START + pd.Timedelta(minutes=60)
    raw = raw.assign(gas_lift_rate_mscfd=raw["gas_lift_rate_mscfd"].where(~blip, 800.0))
    upsets = detect_gas_lift_upsets(_with_flags(raw))
    assert len(upsets) == 1
    assert upsets["duration_min"].iloc[0] == 120
