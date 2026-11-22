"""Shared synthetic fixtures (no dependency on the real dataset)."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from wellperf import config

START = pd.Timestamp("2025-01-01")


def make_minutes(well: str, days: int = 3, seed: int = 0) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    n = days * 1440
    times = pd.date_range(START, periods=n, freq="min")
    return pd.DataFrame(
        {
            config.TIME_COL: times,
            config.WELL_COL: well,
            "whp_psia": 300 + rng.normal(0, 2, n),
            "whp_downstream_psia": 190 + rng.normal(0, 2, n),
            "dh_pressure_psia": 3000 + rng.normal(0, 1, n),
            "dh_temperature_degf": 200 + rng.normal(0, 0.01, n),
            "annulus_pressure_psia": 1100 + rng.normal(0, 1, n),
            "gas_lift_rate_mscfd": 800 + rng.normal(0, 10, n),
        }
    )


@pytest.fixture
def minutes() -> pd.DataFrame:
    return make_minutes("W-1")


@pytest.fixture
def completion() -> pd.DataFrame:
    return pd.DataFrame({config.WELL_COL: ["W-1"], "choke_max_size_64ths": [128], "cum_oil_at_2025_01_01_stb": [1e6]})
