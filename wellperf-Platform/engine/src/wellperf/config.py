"""Project-wide paths, column names and tunable thresholds."""

from __future__ import annotations

from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT
ARTIFACTS_DIR = PROJECT_ROOT / "artifacts"
OUTPUTS_DIR = PROJECT_ROOT / "outputs"
MODEL_PATH = ARTIFACTS_DIR / "vfm_model.joblib"

HIGH_FREQ_FILE = "high_freq_data.csv"
CHOKE_FILE = "choke_events.csv"
PVT_FILE = "reservoir_pvt.csv"
COMPLETION_FILE = "well_completion.csv"
WELL_TEST_GLOB = "*well*test*"

TIME_COL = "timestamp"
WELL_COL = "well_name"
SENSOR_COLS: tuple[str, ...] = (
    "whp_psia",
    "whp_downstream_psia",
    "dh_pressure_psia",
    "dh_temperature_degf",
    "annulus_pressure_psia",
    "gas_lift_rate_mscfd",
)

# Raw-data cleaning
NULL_SENTINEL = -999.25
SPIKE_WINDOW_MIN = 11
# Spike = deviation from rolling median above max(rel * |median|, abs floor).
SPIKE_REL_TOL = 0.25
SPIKE_ABS_FLOOR: dict[str, float] = {
    "whp_psia": 50.0,
    "whp_downstream_psia": 50.0,
    "dh_pressure_psia": 100.0,
    "dh_temperature_degf": 10.0,
    "annulus_pressure_psia": 100.0,
    "gas_lift_rate_mscfd": 150.0,
}
PHYSICAL_BOUNDS: dict[str, tuple[float, float]] = {
    "whp_psia": (0.0, 5000.0),
    "whp_downstream_psia": (0.0, 5000.0),
    "dh_pressure_psia": (0.0, 15000.0),
    "dh_temperature_degf": (32.0, 400.0),
    "annulus_pressure_psia": (0.0, 5000.0),
    "gas_lift_rate_mscfd": (0.0, 10000.0),
}
FROZEN_RUN_MIN = 60

# Shut-in detection
SHUT_IN_MIN_DURATION_MIN = 60
GAS_LIFT_OFF_MSCFD = 1.0
TARGETS: tuple[str, ...] = ("oil_rate_stbd", "water_rate_stbd", "gas_rate_mscfd")
