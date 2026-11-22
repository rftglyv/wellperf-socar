"""Loading and repair of periodic well-test labels.

The test file is internally redundant (liquid = oil + water, GOR = gas/oil,
total gas = formation gas + lift gas, ...). Those identities are used to detect
and repair corrupted entries instead of throwing tests away:
* negative rates whose magnitude satisfies the identities -> sign flipped back
* formation/total gas reported in Sm3/d (GOR mismatch by ~28.32x) -> converted to Mscf/d
Derived columns are then recomputed from the repaired primary rates.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from wellperf import config
from wellperf.loaders import Source, _read_table, _to_datetime, require_columns

M3_PER_MSCF = 28.3168
UNIT_MATCH_TOL = 0.05
REQUIRED = (
    config.WELL_COL,
    "test_start",
    "test_end",
    "oil_rate_stbd",
    "water_rate_stbd",
    "gas_rate_mscfd",
)
SIGN_CHECK_COLS = ("oil_rate_stbd", "water_rate_stbd", "gas_rate_mscfd", "total_gas_rate_mscfd", "gas_lift_rate_mscfd")


def load_well_tests(source: Source) -> pd.DataFrame:
    df = require_columns(_read_table(source), REQUIRED, "Well-test data")
    return df.assign(
        test_start=_to_datetime(df["test_start"]),
        test_end=_to_datetime(df["test_end"]),
        **{config.WELL_COL: df[config.WELL_COL].astype(str)},
    )


def _log(log: list[dict], row: pd.Series, column: str, issue: str, old: float, new: float) -> None:
    log.append(
        {
            config.WELL_COL: row[config.WELL_COL],
            "test_start": row["test_start"],
            "column": column,
            "issue": issue,
            "original_value": old,
            "corrected_value": new,
        }
    )


IDENTITY_TOL = 0.02


def _close(a: float, b: float) -> bool:
    return bool(np.isfinite(a) and np.isfinite(b) and abs(a - b) <= IDENTITY_TOL * max(abs(b), 1.0))


def _flip_confirmed(row: pd.Series, col: str) -> bool:
    """True if |value| satisfies a redundant identity in the file (or no identity is available to check)."""
    flipped = row.copy()
    flipped[col] = abs(row[col])
    checks = []
    if "liquid_rate_stbd" in row and col in ("oil_rate_stbd", "water_rate_stbd"):
        checks.append(_close(flipped["oil_rate_stbd"] + flipped["water_rate_stbd"], row["liquid_rate_stbd"]))
    if "total_gas_rate_mscfd" in row and col in ("gas_rate_mscfd", "gas_lift_rate_mscfd", "total_gas_rate_mscfd"):
        checks.append(_close(abs(flipped["gas_rate_mscfd"]) + abs(flipped["gas_lift_rate_mscfd"]),
                             abs(flipped["total_gas_rate_mscfd"])))
    if "gor_scf_stb" in row and col == "gas_rate_mscfd":
        checks.append(_close(1000 * flipped["gas_rate_mscfd"] / flipped["oil_rate_stbd"], row["gor_scf_stb"]))
    return not checks or any(checks)


def _fix_signs(tests: pd.DataFrame, log: list[dict]) -> pd.DataFrame:
    """Flip negative rates whose magnitude the identities confirm; otherwise mark them missing."""
    fixed = tests.copy()
    for col in (c for c in SIGN_CHECK_COLS if c in tests):
        for idx in tests.index[tests[col] < 0]:
            old = tests.at[idx, col]
            if _flip_confirmed(tests.loc[idx], col):
                _log(log, tests.loc[idx], col, "negative value (sign error)", old, abs(old))
                fixed.at[idx, col] = abs(old)
            else:
                _log(log, tests.loc[idx], col, "negative value not confirmed by identities -> missing", old, np.nan)
                fixed.at[idx, col] = np.nan
    return fixed


def _fix_gas_units(tests: pd.DataFrame, log: list[dict]) -> pd.DataFrame:
    if "gor_scf_stb" not in tests:
        return tests
    implied_gor = 1000.0 * tests["gas_rate_mscfd"] / tests["oil_rate_stbd"]
    ratio = implied_gor / tests["gor_scf_stb"]
    in_m3 = (ratio / M3_PER_MSCF - 1).abs() < UNIT_MATCH_TOL
    fixed = tests.copy()
    gas_cols = [c for c in ("gas_rate_mscfd", "total_gas_rate_mscfd") if c in tests]
    for idx in tests.index[in_m3]:
        for col in gas_cols:
            new = tests.at[idx, col] / M3_PER_MSCF
            _log(log, tests.loc[idx], col, "reported in Sm3/d, converted to Mscf/d", tests.at[idx, col], new)
            fixed.at[idx, col] = new
    return fixed


def _recompute_derived(tests: pd.DataFrame) -> pd.DataFrame:
    liquid = tests["oil_rate_stbd"] + tests["water_rate_stbd"]
    derived = {
        "liquid_rate_stbd": liquid,
        "water_cut_frac": tests["water_rate_stbd"] / liquid,
        "gor_scf_stb": 1000.0 * tests["gas_rate_mscfd"] / tests["oil_rate_stbd"],
    }
    if "gas_lift_rate_mscfd" in tests:
        total_gas = tests["gas_rate_mscfd"] + tests["gas_lift_rate_mscfd"]
        derived = {**derived, "total_gas_rate_mscfd": total_gas, "glr_scf_stb": 1000.0 * total_gas / liquid}
    return tests.assign(**derived)


def clean_well_tests(raw: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Return (repaired tests, correction log). Rows with non-positive oil or liquid are dropped and logged."""
    log: list[dict] = []
    tests = _fix_signs(_fix_gas_units(raw, log), log)  # units first: sign checks need consistent units
    tests = _recompute_derived(tests)
    invalid = ~((tests["oil_rate_stbd"] > 0) & (tests["liquid_rate_stbd"] > 0) & np.isfinite(tests["gor_scf_stb"]))
    for idx in tests.index[invalid]:
        _log(log, tests.loc[idx], "oil_rate_stbd", "test dropped: no usable oil/liquid rate", tests.at[idx, "oil_rate_stbd"], np.nan)
    cleaned = tests.loc[~invalid].sort_values([config.WELL_COL, "test_start"], ignore_index=True)
    cleaned = cleaned.assign(window_id=cleaned[config.WELL_COL] + "_" + cleaned["test_start"].dt.strftime("%Y%m%d_%H%M"))
    return cleaned, pd.DataFrame(
        log, columns=[config.WELL_COL, "test_start", "column", "issue", "original_value", "corrected_value"]
    )
