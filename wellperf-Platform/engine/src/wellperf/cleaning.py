"""Cleaning of raw per-minute sensor data, with a per-well quality-control report.

Issues found in the provided data and how each is handled:
* -999.25 null sentinels          -> NaN
* duplicate (well, timestamp) rows -> first kept
* out-of-order timestamps          -> sorted
* 2-3 minute spikes (~3x value)    -> rolling-median filter -> NaN
* values outside physical bounds   -> NaN
* frozen sensor (identical value for >= FROZEN_RUN_MIN minutes, non-zero) -> NaN
* recording gaps                   -> kept as missing; reported, never silently filled
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from wellperf import config


def _spike_mask(series: pd.Series, column: str) -> pd.Series:
    median = series.rolling(config.SPIKE_WINDOW_MIN, center=True, min_periods=3).median()
    tolerance = np.maximum(config.SPIKE_REL_TOL * median.abs(), config.SPIKE_ABS_FLOOR[column])
    return (series - median).abs() > tolerance


def _frozen_mask(series: pd.Series) -> pd.Series:
    run_id = (series.diff() != 0).cumsum()
    run_len = series.groupby(run_id).transform("size")
    return (run_len >= config.FROZEN_RUN_MIN) & (series != 0) & series.notna()


def _bounds_mask(series: pd.Series, column: str) -> pd.Series:
    low, high = config.PHYSICAL_BOUNDS[column]
    return (series < low) | (series > high)


def _clean_well(well_df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    stats: dict[str, int] = {}
    cleaned: dict[str, pd.Series] = {}
    for col in config.SENSOR_COLS:
        raw = well_df[col]
        sentinel = raw == config.NULL_SENTINEL
        series = raw.mask(sentinel)
        out_of_bounds = _bounds_mask(series, col)
        series = series.mask(out_of_bounds)
        spikes = _spike_mask(series, col)
        series = series.mask(spikes)
        frozen = _frozen_mask(series)
        cleaned[col] = series.mask(frozen)
        stats[f"{col}__sentinel"] = int(sentinel.sum())
        stats[f"{col}__spike"] = int(spikes.sum())
        stats[f"{col}__out_of_bounds"] = int(out_of_bounds.sum())
        stats[f"{col}__frozen"] = int(frozen.sum())
    return well_df.assign(**cleaned), stats


def _gap_stats(well_df: pd.DataFrame) -> dict:
    step = well_df[config.TIME_COL].diff()
    gaps = step[step > pd.Timedelta(minutes=1)]
    missing_min = int((gaps / pd.Timedelta(minutes=1)).sum() - len(gaps)) if len(gaps) else 0
    return {
        "gap_count": int(len(gaps)),
        "longest_gap_hours": round(float(gaps.max() / pd.Timedelta(hours=1)), 2) if len(gaps) else 0.0,
        "missing_minutes": missing_min,
    }


def clean_high_freq(raw: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Return (cleaned data, per-well QC report). The input frame is not modified."""
    rows_in = raw.groupby(config.WELL_COL).size()
    ordered = raw.sort_values([config.WELL_COL, config.TIME_COL], kind="stable")
    unordered = (raw.groupby(config.WELL_COL)[config.TIME_COL].diff() < pd.Timedelta(0)).groupby(
        raw[config.WELL_COL]
    ).sum()
    deduped = ordered.drop_duplicates([config.WELL_COL, config.TIME_COL], keep="first")

    frames, reports = [], []
    for well, well_df in deduped.groupby(config.WELL_COL, sort=True):
        well_df = well_df.reset_index(drop=True)
        cleaned, stats = _clean_well(well_df)
        frames.append(cleaned)
        reports.append(
            {
                config.WELL_COL: well,
                "rows_raw": int(rows_in[well]),
                "duplicates_removed": int(rows_in[well] - len(well_df)),
                "out_of_order_rows": int(unordered.get(well, 0)),
                **_gap_stats(well_df),
                **stats,
                "pct_values_flagged": round(
                    100 * (cleaned[list(config.SENSOR_COLS)].isna().sum().sum()) / (len(cleaned) * len(config.SENSOR_COLS)),
                    3,
                ),
            }
        )
    return pd.concat(frames, ignore_index=True), pd.DataFrame(reports)
