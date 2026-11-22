"""Shut-in events and choke history.

Shut-ins come from the choke file (choke opening 0 %), cross-checked against the
sensor signature (gas lift off + downhole pressure building). Signature-only
events are added so uploaded data without a choke file still gets PTA.
"""

from __future__ import annotations

import pandas as pd

from wellperf import config

EVENT_COLS = ["event_id", config.WELL_COL, "shut_in_start", "shut_in_end", "duration_hours", "source"]


def _event_frame(rows: list[dict]) -> pd.DataFrame:
    if not rows:
        return pd.DataFrame(columns=EVENT_COLS)
    df = pd.DataFrame(rows).sort_values([config.WELL_COL, "shut_in_start"], ignore_index=True)
    df["duration_hours"] = (df["shut_in_end"] - df["shut_in_start"]) / pd.Timedelta(hours=1)
    df["event_id"] = df[config.WELL_COL] + "_" + df["shut_in_start"].dt.strftime("%Y%m%d_%H%M")
    return df[EVENT_COLS]


def shut_ins_from_choke(choke: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for well, events in choke.groupby(config.WELL_COL):
        events = events.sort_values(config.TIME_COL).reset_index(drop=True)
        for i, row in events.iterrows():
            if row["choke_opening_pct"] > 0:
                continue
            reopen = events[config.TIME_COL].iloc[i + 1] if i + 1 < len(events) else pd.NaT
            rows.append(
                {config.WELL_COL: well, "shut_in_start": row[config.TIME_COL], "shut_in_end": reopen, "source": "choke"}
            )
    return _event_frame(rows)


def shut_ins_from_signature(clean: pd.DataFrame) -> pd.DataFrame:
    """Detect shut-ins as runs of gas-lift-off minutes lasting at least the configured minimum."""
    rows = []
    min_len = config.SHUT_IN_MIN_DURATION_MIN
    for well, df in clean.groupby(config.WELL_COL):
        gas_lift = df["gas_lift_rate_mscfd"].ffill().bfill()  # a missing value continues the current state
        off = gas_lift <= config.GAS_LIFT_OFF_MSCFD
        run_id = (off != off.shift()).cumsum()
        for _, run in df[off].groupby(run_id[off]):
            if (run[config.TIME_COL].iloc[-1] - run[config.TIME_COL].iloc[0]) < pd.Timedelta(minutes=min_len - 1):
                continue
            start = run[config.TIME_COL].iloc[0] - pd.Timedelta(minutes=1)
            end = run[config.TIME_COL].iloc[-1] + pd.Timedelta(minutes=1)
            rows.append({config.WELL_COL: well, "shut_in_start": start, "shut_in_end": end, "source": "signature"})
    return _event_frame(rows)


def merge_events(choke_events: pd.DataFrame, signature_events: pd.DataFrame) -> pd.DataFrame:
    """Choke-file events win; signature events are kept only when they overlap no choke event."""
    if signature_events.empty:
        return choke_events
    keep = []
    for _, sig in signature_events.iterrows():
        same_well = choke_events[choke_events[config.WELL_COL] == sig[config.WELL_COL]]
        overlaps = (same_well["shut_in_start"] < sig["shut_in_end"]) & (same_well["shut_in_end"] > sig["shut_in_start"])
        if not overlaps.any():
            keep.append(sig.to_dict())
    if not keep:
        return choke_events
    combined = pd.concat([choke_events, pd.DataFrame(keep, columns=EVENT_COLS)], ignore_index=True)
    return _event_frame(combined.drop(columns=["event_id", "duration_hours"]).to_dict("records"))


def detect_shut_ins(clean: pd.DataFrame, choke: pd.DataFrame | None) -> pd.DataFrame:
    signature = shut_ins_from_signature(clean)
    if choke is None or choke.empty:
        return signature
    return merge_events(shut_ins_from_choke(choke), signature)


def shut_in_mask(times: pd.Series, wells: pd.Series, events: pd.DataFrame) -> pd.Series:
    """True for rows that fall inside a shut-in window (start exclusive, end exclusive)."""
    mask = pd.Series(False, index=times.index)
    for _, ev in events.iterrows():
        end = ev["shut_in_end"] if pd.notna(ev["shut_in_end"]) else times.max() + pd.Timedelta(minutes=1)
        mask |= (wells == ev[config.WELL_COL]) & (times > ev["shut_in_start"]) & (times < end)
    return mask


def choke_at(times: pd.Series, wells: pd.Series, choke: pd.DataFrame) -> pd.Series:
    """Choke opening (%) in force at each timestamp: last choke event at or before it."""
    frame = pd.DataFrame({config.TIME_COL: times.values, config.WELL_COL: wells.values, "_row": range(len(times))})
    merged = pd.merge_asof(
        frame.sort_values(config.TIME_COL),
        choke[[config.TIME_COL, config.WELL_COL, "choke_opening_pct"]].sort_values(config.TIME_COL),
        on=config.TIME_COL,
        by=config.WELL_COL,
        direction="backward",
    ).sort_values("_row")
    return pd.Series(merged["choke_opening_pct"].to_numpy(), index=times.index, name="choke_opening_pct")


UPSET_RATIO = 0.70  # lift gas below this fraction of its trailing 24 h median
UPSET_MIN_MINUTES = 30
UPSET_BASELINE_WINDOW = "24h"
UPSET_BASELINE_STEP = "10min"
UPSET_BASELINE_MIN_STEPS = 36  # ≥ 6 h of history before a baseline is trusted
UPSET_MERGE_GAP = pd.Timedelta(minutes=5)  # runs split by a brief recovery/missing value are one upset
FIELD_WIDE_MIN_WELLS = 3
FIELD_WIDE_WINDOW = pd.Timedelta(minutes=30)
UPSET_COLS = [config.WELL_COL, "start", "end", "duration_min", "min_ratio_to_baseline", "scope"]


def _trailing_baseline(well_df: pd.DataFrame) -> pd.Series:
    """Trailing 24 h median of lift gas (from 10-min medians, excluding the current step)."""
    series = well_df.set_index(config.TIME_COL)["gas_lift_rate_mscfd"]
    coarse = series.resample(UPSET_BASELINE_STEP).median()
    base = coarse.rolling(UPSET_BASELINE_WINDOW, min_periods=UPSET_BASELINE_MIN_STEPS).median().shift(1)
    return base.reindex(series.index, method="ffill")


def _well_upsets(well: str, well_df: pd.DataFrame) -> list[dict]:
    well_df = well_df.sort_values(config.TIME_COL).reset_index(drop=True)
    ratio = (well_df["gas_lift_rate_mscfd"] / _trailing_baseline(well_df).to_numpy())
    low = (ratio < UPSET_RATIO) & ~well_df["is_shut_in"] & well_df["gas_lift_rate_mscfd"].notna()
    run_id = (low != low.shift()).cumsum()
    runs = [(run[config.TIME_COL].iloc[0], run[config.TIME_COL].iloc[-1] + pd.Timedelta(minutes=1),
             float(ratio[run.index].min())) for _, run in well_df[low].groupby(run_id[low])]
    rows = []
    for start, end, lowest in _merge_runs(runs):
        minutes = (end - start) / pd.Timedelta(minutes=1)
        if minutes >= UPSET_MIN_MINUTES:
            rows.append({config.WELL_COL: well, "start": start, "end": end, "duration_min": minutes,
                         "min_ratio_to_baseline": lowest})
    return rows


def _merge_runs(runs: list[tuple]) -> list[tuple]:
    merged: list[tuple] = []
    for start, end, lowest in runs:
        if merged and start - merged[-1][1] <= UPSET_MERGE_GAP:
            prev = merged[-1]
            merged = [*merged[:-1], (prev[0], end, min(prev[2], lowest))]
        else:
            merged = [*merged, (start, end, lowest)]
    return merged


def _scope(upsets: pd.DataFrame) -> pd.Series:
    def scope(row: pd.Series) -> str:
        near = (upsets["start"] - row["start"]).abs() <= FIELD_WIDE_WINDOW
        return "field-wide" if upsets.loc[near, config.WELL_COL].nunique() >= FIELD_WIDE_MIN_WELLS else "single-well"
    return upsets.apply(scope, axis=1)


def detect_gas_lift_upsets(minute: pd.DataFrame) -> pd.DataFrame:
    """Lift-gas upsets: lift gas < 70 % of its trailing 24 h median for ≥ 30 min while the well is
    producing (never during shut-ins). 'field-wide' when ≥ 3 wells start within 30 min.
    Upsets are flagged for data quality only; they are not shut-ins and never go to PTA."""
    rows = [r for well, df in minute.groupby(config.WELL_COL) for r in _well_upsets(well, df)]
    if not rows:
        return pd.DataFrame(columns=UPSET_COLS)
    upsets = pd.DataFrame(rows).sort_values("start", ignore_index=True)
    return upsets.assign(scope=_scope(upsets))[UPSET_COLS]


def upset_mask(times: pd.Series, wells: pd.Series, upsets: pd.DataFrame) -> pd.Series:
    mask = pd.Series(False, index=times.index)
    for _, up in upsets.iterrows():
        mask |= (wells == up[config.WELL_COL]) & (times >= up["start"]) & (times < up["end"])
    return mask
