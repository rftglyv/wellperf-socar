from __future__ import annotations

import numpy as np
import pytest
import pandas as pd

from wellperf import config
from wellperf.cleaning import clean_high_freq
from wellperf.events import choke_at, detect_shut_ins, shut_in_mask, shut_ins_from_choke


def test_sentinel_values_become_missing(minutes):
    raw = minutes.copy()
    raw.loc[10, "whp_psia"] = config.NULL_SENTINEL
    clean, qc = clean_high_freq(raw)
    assert np.isnan(clean.loc[10, "whp_psia"])
    assert qc.loc[0, "whp_psia__sentinel"] == 1


def test_short_spikes_removed_but_normal_noise_kept(minutes):
    raw = minutes.copy()
    raw.loc[500:502, "dh_pressure_psia"] = 9000.0
    clean, qc = clean_high_freq(raw)
    assert clean.loc[500:502, "dh_pressure_psia"].isna().all()
    assert qc.loc[0, "dh_pressure_psia__spike"] == 3
    assert clean["dh_pressure_psia"].notna().sum() == len(raw) - 3


def test_step_change_is_not_flagged_as_spike(minutes):
    raw = minutes.copy()
    raw.loc[2000:, "whp_psia"] = raw.loc[2000:, "whp_psia"] + 300  # shut-in style step
    clean, _ = clean_high_freq(raw)
    assert clean["whp_psia"].notna().all()


def test_duplicates_and_disorder_are_resolved(minutes):
    raw = pd.concat([minutes.iloc[:100], minutes.iloc[50:60], minutes.iloc[100:]]).iloc[::-1]
    clean, qc = clean_high_freq(raw)
    assert len(clean) == len(minutes)
    assert clean[config.TIME_COL].is_monotonic_increasing
    assert qc.loc[0, "duplicates_removed"] == 10


def test_input_frame_is_not_mutated(minutes):
    raw = minutes.copy()
    raw.loc[5, "whp_psia"] = config.NULL_SENTINEL
    snapshot = raw.copy()
    clean_high_freq(raw)
    pd.testing.assert_frame_equal(raw, snapshot)


def _choke(rows):
    return pd.DataFrame(rows, columns=[config.TIME_COL, config.WELL_COL, "choke_opening_pct"]).assign(
        **{config.TIME_COL: lambda d: pd.to_datetime(d[config.TIME_COL], format="ISO8601")}
    )


def test_shut_ins_from_choke_file():
    choke = _choke([("2025-01-01", "W-1", 40.0), ("2025-01-02 08:00", "W-1", 0.0), ("2025-01-02 20:00", "W-1", 35.0)])
    events = shut_ins_from_choke(choke)
    assert len(events) == 1
    assert events.loc[0, "duration_hours"] == 12.0


def test_signature_detection_finds_unlisted_shut_in(minutes):
    raw = minutes.copy()
    raw.loc[1000:1199, "gas_lift_rate_mscfd"] = 0.0
    clean, _ = clean_high_freq(raw)
    events = detect_shut_ins(clean, choke=None)
    assert len(events) == 1
    assert events.loc[0, "source"] == "signature"
    mask = shut_in_mask(clean[config.TIME_COL], clean[config.WELL_COL], events)
    assert mask.sum() == 200


def test_choke_at_uses_last_setting():
    choke = _choke([("2025-01-01", "W-1", 40.0), ("2025-01-01 12:00", "W-1", 30.0)])
    times = pd.Series(pd.to_datetime(["2025-01-01 06:00", "2025-01-01 13:00"]))
    wells = pd.Series(["W-1", "W-1"])
    assert choke_at(times, wells, choke).tolist() == [40.0, 30.0]


def test_missing_gas_lift_value_does_not_split_a_shut_in(minutes):
    raw = minutes.copy()
    raw.loc[1000:1399, "gas_lift_rate_mscfd"] = 0.0
    raw.loc[1200, "gas_lift_rate_mscfd"] = config.NULL_SENTINEL
    clean, _ = clean_high_freq(raw)
    events = detect_shut_ins(clean, choke=None)
    assert len(events) == 1
    assert events.loc[0, "duration_hours"] == pytest.approx(401 / 60)
