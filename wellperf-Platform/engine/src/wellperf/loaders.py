"""Readers for the hackathon input files. Every reader validates required columns."""

from __future__ import annotations

from pathlib import Path
from typing import IO, Union

import pandas as pd

from wellperf import config

Source = Union[str, Path, IO[bytes]]

HIGH_FREQ_REQUIRED = (config.TIME_COL, config.WELL_COL, *config.SENSOR_COLS)
CHOKE_REQUIRED = (config.TIME_COL, config.WELL_COL, "choke_opening_pct")
PVT_REQUIRED = (
    config.WELL_COL,
    "net_pay_thickness_ft",
    "porosity_frac",
    "total_compressibility_1_psi",
    "wellbore_radius_ft",
    "oil_fvf_rb_stb",
    "oil_viscosity_cp",
)
COMPLETION_REQUIRED = (config.WELL_COL, "cum_oil_at_2025_01_01_stb")


class DataValidationError(ValueError):
    """Raised when an input file does not match the expected schema."""


def require_columns(df: pd.DataFrame, required: tuple[str, ...], name: str) -> pd.DataFrame:
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise DataValidationError(f"{name} is missing columns: {', '.join(missing)}")
    return df


def _to_datetime(values: pd.Series) -> pd.Series:
    return pd.to_datetime(values, format="ISO8601").astype("datetime64[ns]")


def _read_table(source: Source) -> pd.DataFrame:
    name = getattr(source, "name", str(source)).lower()
    if name.endswith(".parquet"):
        return pd.read_parquet(source)
    if name.endswith((".xlsx", ".xls")):
        return pd.read_excel(source)
    try:
        return pd.read_csv(source, engine="pyarrow")
    except (ImportError, ValueError):
        if hasattr(source, "seek"):
            source.seek(0)
        return pd.read_csv(source)


def load_high_freq(source: Source) -> pd.DataFrame:
    df = require_columns(_read_table(source), HIGH_FREQ_REQUIRED, "High-frequency data")
    return df.assign(
        **{config.TIME_COL: _to_datetime(df[config.TIME_COL]), config.WELL_COL: df[config.WELL_COL].astype(str)}
    )


def load_choke(source: Source) -> pd.DataFrame:
    df = require_columns(_read_table(source), CHOKE_REQUIRED, "Choke data")
    return df.assign(**{config.TIME_COL: _to_datetime(df[config.TIME_COL])}).sort_values(
        [config.WELL_COL, config.TIME_COL], ignore_index=True
    )


def load_pvt(source: Source) -> pd.DataFrame:
    return require_columns(_read_table(source), PVT_REQUIRED, "PVT data")


def load_completion(source: Source) -> pd.DataFrame:
    return require_columns(_read_table(source), COMPLETION_REQUIRED, "Well completion data")


def find_well_test_file(data_dir: Path = config.DATA_DIR) -> Path | None:
    candidates = sorted(
        p for p in data_dir.glob(config.WELL_TEST_GLOB) if p.suffix.lower() in {".csv", ".xlsx", ".xls", ".parquet"}
    )
    return candidates[0] if candidates else None


def cached_high_freq(data_dir: Path = config.DATA_DIR, cache_dir: Path = config.ARTIFACTS_DIR) -> pd.DataFrame:
    """Read the large CSV once and keep a parquet copy for fast reloads."""
    cache = cache_dir / "high_freq_raw.parquet"
    source = data_dir / config.HIGH_FREQ_FILE
    if cache.exists() and cache.stat().st_mtime >= source.stat().st_mtime:
        return load_high_freq(cache)
    df = load_high_freq(source)
    cache_dir.mkdir(parents=True, exist_ok=True)
    df.to_parquet(cache)
    return df
