"""VFM validation: leave-one-test-out cross-validation against an industry baseline.

Baseline = linear interpolation in time between a well's neighbouring tests
(the usual way rates are allocated between periodic tests).
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from wellperf import config
from wellperf.features import DATE_COL
from wellperf.vfm import MID_TIME_COL, VFMModel, fit_vfm, predict_flowing, test_midpoint

RATE_COLS = ("oil_rate_stbd", "water_rate_stbd", "gas_rate_mscfd", "liquid_rate_stbd")


def _baseline(train: pd.DataFrame, row: pd.Series) -> dict[str, float]:
    same = train[train[config.WELL_COL] == row[config.WELL_COL]].sort_values("test_start")
    x = same["test_start"].to_numpy("datetime64[ns]").astype("int64")
    at = np.datetime64(row["test_start"], "ns").astype("int64")
    return {c: float(np.interp(at, x, same[c].to_numpy())) for c in RATE_COLS}


def cross_validate(tests: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Return (per-test predictions, summary metrics). Each test is predicted by a model fitted without it."""
    rows = []
    for idx in tests.index:
        held_out = tests.loc[[idx]]
        train = tests.drop(index=idx)
        if (train[config.WELL_COL] == held_out[config.WELL_COL].iloc[0]).sum() == 0:
            continue
        model = fit_vfm(train)
        pred = predict_flowing(model, held_out.assign(**{MID_TIME_COL: test_midpoint(held_out)}), MID_TIME_COL).iloc[0]
        base = _baseline(train, held_out.iloc[0])
        record = {config.WELL_COL: held_out[config.WELL_COL].iloc[0], "test_start": held_out["test_start"].iloc[0]}
        for col in RATE_COLS:
            record = {**record, f"{col}_actual": held_out[col].iloc[0], f"{col}_vfm": pred[col],
                      f"{col}_baseline": base[col]}
        rows.append(record)
    predictions = pd.DataFrame(rows)
    return predictions, summarize(predictions)


def summarize(predictions: pd.DataFrame) -> pd.DataFrame:
    out = []
    for col in RATE_COLS:
        actual = predictions[f"{col}_actual"]
        for method in ("vfm", "baseline"):
            err = predictions[f"{col}_{method}"] - actual
            ape = (err.abs() / actual).replace([np.inf], np.nan)
            out.append(
                {
                    "target": col,
                    "method": "VFM model" if method == "vfm" else "Test interpolation (baseline)",
                    "MAPE_pct": 100 * ape.mean(),
                    "median_APE_pct": 100 * ape.median(),
                    "RMSE": float(np.sqrt((err**2).mean())),
                    "R2": 1 - float((err**2).sum() / ((actual - actual.mean()) ** 2).sum()),
                }
            )
    return pd.DataFrame(out)


NEIGHBOUR_DAYS = ((-6, -2), (3, 7))


def test_day_bias(model: VFMModel, tests: pd.DataFrame, daily: pd.DataFrame) -> pd.DataFrame:
    """Liquid predicted for each test window vs the median of nearby full producing days.

    Tests route flow to a test separator, which changes surface pressures. A model that
    leaks that routing signal shows a large systematic jump here; a physically sound
    model shows a small one (slightly positive: lower backpressure during the test).
    """
    full = daily[daily["uptime_frac"] >= 1.0]
    full = full.assign(**{MID_TIME_COL: full[DATE_COL] + pd.Timedelta(hours=12)})
    day_liquid = predict_flowing(model, full, MID_TIME_COL)["liquid_rate_stbd"]
    test_liquid = predict_flowing(model, tests.assign(**{MID_TIME_COL: test_midpoint(tests)}), MID_TIME_COL)[
        "liquid_rate_stbd"]
    rows = []
    for idx, test in tests.iterrows():
        day = test["test_start"].normalize()
        same = full[config.WELL_COL] == test[config.WELL_COL]
        near = np.zeros(len(full), dtype=bool)
        for lo, hi in NEIGHBOUR_DAYS:
            near |= full[DATE_COL].between(day + pd.Timedelta(days=lo), day + pd.Timedelta(days=hi)).to_numpy()
        neighbours = day_liquid[same.to_numpy() & near]
        if neighbours.empty:
            continue
        rows.append({config.WELL_COL: test[config.WELL_COL], "test_start": test["test_start"],
                     "test_vs_neighbour_pct": 100 * (test_liquid[idx] / neighbours.median() - 1)})
    return pd.DataFrame(rows)


FORWARD_MIN_PRIOR_TESTS = 3
PHASES = ("oil_rate_stbd", "water_rate_stbd", "gas_rate_mscfd")
LOWER_Q, UPPER_Q = 0.10, 0.90
FORWARD_BASELINE = "Last test carried forward (baseline)"


def _forward_record(tests: pd.DataFrame, idx, model: VFMModel, train: pd.DataFrame) -> dict:
    held = tests.loc[[idx]]
    pred = predict_flowing(model, held.assign(**{MID_TIME_COL: test_midpoint(held)}), MID_TIME_COL).iloc[0]
    well = held[config.WELL_COL].iloc[0]
    prior = train[train[config.WELL_COL] == well].sort_values("test_start")
    record = {config.WELL_COL: well, "test_start": held["test_start"].iloc[0],
              "latest_training_test_start": train["test_start"].max(), "prior_tests_same_well": len(prior)}
    for col in RATE_COLS:
        record = {**record, f"{col}_actual": held[col].iloc[0], f"{col}_vfm": pred[col],
                  f"{col}_baseline": prior[col].iloc[-1]}
    return record


def forward_chain_validate(tests: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, dict[str, tuple[float, float]]]:
    """Time-ordered validation: each test is predicted by a model fitted only on tests that started
    strictly earlier (all wells), when its well has ≥ FORWARD_MIN_PRIOR_TESTS earlier tests.

    Returns (per-test predictions, metrics vs last-test-carried-forward, P10/P90 relative errors)."""
    rows = []
    for idx in tests.sort_values("test_start").index:
        start, well = tests.at[idx, "test_start"], tests.at[idx, config.WELL_COL]
        train = tests[tests["test_start"] < start]
        if (train[config.WELL_COL] == well).sum() < FORWARD_MIN_PRIOR_TESTS:
            continue
        rows.append(_forward_record(tests, idx, fit_vfm(train), train))
    predictions = pd.DataFrame(rows)
    if predictions.empty:
        return predictions, pd.DataFrame(), {}
    metrics = summarize(predictions).replace({"Test interpolation (baseline)": FORWARD_BASELINE})
    return predictions, metrics, error_quantiles(predictions)


def error_quantiles(predictions: pd.DataFrame) -> dict[str, tuple[float, float]]:
    """P10/P90 of the relative error actual/predicted − 1, per phase (used as uncertainty bands)."""
    out = {}
    for phase in PHASES:
        rel = predictions[f"{phase}_actual"] / predictions[f"{phase}_vfm"] - 1
        out[phase] = (float(rel.quantile(LOWER_Q)), float(rel.quantile(UPPER_Q)))
    return out
