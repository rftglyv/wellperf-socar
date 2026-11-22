"""Window-aggregated features for the virtual flow meter.

The same aggregation is used for calendar days (prediction) and for well-test
windows (training), so the model sees identically built inputs in both cases.
Sensor statistics use *producing* minutes only; shut-in time is captured by the
uptime fraction instead.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from wellperf import config
from wellperf.events import choke_at, shut_in_mask

DATE_COL = "date"
WINDOW_COL = "window_id"
MEAN_COLS = (
    *config.SENSOR_COLS,
    "choke_opening_pct",
    "choke_size_64ths",
    "dp_choke_psi",
    "dp_tubing_psi",
)


def add_minute_features(
    clean: pd.DataFrame, choke: pd.DataFrame | None, events: pd.DataFrame, completion: pd.DataFrame
) -> pd.DataFrame:
    times, wells = clean[config.TIME_COL], clean[config.WELL_COL]
    if choke is not None and not choke.empty:
        choke_pct = choke_at(times, wells, choke)
    else:
        choke_pct = pd.Series(50.0, index=clean.index, name="choke_opening_pct")
    max_size = wells.map(completion.set_index(config.WELL_COL)["choke_max_size_64ths"]).astype(float)
    return clean.assign(
        choke_opening_pct=choke_pct,
        choke_size_64ths=choke_pct / 100.0 * max_size,
        is_shut_in=shut_in_mask(times, wells, events),
        dp_choke_psi=(clean["whp_psia"] - clean["whp_downstream_psia"]).clip(lower=0),
        dp_tubing_psi=clean["dh_pressure_psia"] - clean["whp_psia"],
    )


def aggregate(minute: pd.DataFrame, key: str) -> pd.DataFrame:
    """Aggregate minute rows grouped by (well, key) into one feature row each."""
    group_keys = [config.WELL_COL, key]
    recorded = minute.groupby(group_keys).size().rename("recorded_minutes")
    shut = minute.groupby(group_keys)["is_shut_in"].sum().rename("shut_in_minutes")
    upset_col = minute["is_gl_upset"] if "is_gl_upset" in minute else pd.Series(False, index=minute.index)
    upset = upset_col.groupby([minute[k] for k in group_keys]).sum().rename("gas_lift_upset_minutes")
    flowing = minute[~minute["is_shut_in"]]
    means = flowing.groupby(group_keys)[list(MEAN_COLS)].mean()
    stds = flowing.groupby(group_keys)[["whp_psia", "dh_pressure_psia", "gas_lift_rate_mscfd"]].std().add_suffix("_std")
    out = pd.concat([recorded, shut, upset, means, stds], axis=1)
    return out.assign(uptime_frac=(out["recorded_minutes"] - out["shut_in_minutes"]) / out["recorded_minutes"])


def daily_features(minute: pd.DataFrame) -> pd.DataFrame:
    keyed = minute.assign(**{DATE_COL: minute[config.TIME_COL].dt.floor("D")})
    return aggregate(keyed, DATE_COL).reset_index().sort_values([config.WELL_COL, DATE_COL], ignore_index=True)


def window_features(minute: pd.DataFrame, windows: pd.DataFrame) -> pd.DataFrame:
    """Aggregate over arbitrary [start, end) windows; `windows` has well_name, start, end, window_id."""
    pieces = []
    for _, win in windows.iterrows():
        sel = (
            (minute[config.WELL_COL] == win[config.WELL_COL])
            & (minute[config.TIME_COL] >= win["start"])
            & (minute[config.TIME_COL] < win["end"])
        )
        pieces.append(minute.loc[sel].assign(**{WINDOW_COL: win[WINDOW_COL]}))
    if not pieces:
        return pd.DataFrame(columns=[config.WELL_COL, WINDOW_COL])
    return aggregate(pd.concat(pieces, ignore_index=True), WINDOW_COL).reset_index()
