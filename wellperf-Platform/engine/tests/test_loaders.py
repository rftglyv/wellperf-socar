from __future__ import annotations

from io import BytesIO

import pandas as pd
import pytest

from wellperf import config, loaders
from wellperf.well_tests import load_well_tests


class Named(BytesIO):
    def __init__(self, data: bytes, name: str):
        super().__init__(data)
        self.name = name


def _csv(df: pd.DataFrame, name: str) -> Named:
    return Named(df.to_csv(index=False).encode(), name)


def test_missing_columns_raise_clear_error():
    bad = _csv(pd.DataFrame({config.WELL_COL: ["A"], "oil_rate_stbd": [1.0]}), "tests.csv")
    with pytest.raises(loaders.DataValidationError, match="test_start"):
        load_well_tests(bad)


def test_high_freq_loader_parses_times_to_ns(minutes):
    df = loaders.load_high_freq(_csv(minutes.head(10), "hf.csv"))
    assert df[config.TIME_COL].dtype == "datetime64[ns]"
    assert df[config.WELL_COL].iloc[0] == "W-1"


def test_choke_loader_sorts_and_accepts_mixed_iso_times():
    raw = pd.DataFrame({config.TIME_COL: ["2025-02-01 08:30", "2025-01-01"], config.WELL_COL: ["A", "A"],
                        "choke_opening_pct": [0.0, 40.0]})
    df = loaders.load_choke(_csv(raw, "choke.csv"))
    assert df["choke_opening_pct"].tolist() == [40.0, 0.0]


def test_excel_and_parquet_sources(tmp_path, completion):
    xlsx = tmp_path / "completion.xlsx"
    completion.to_excel(xlsx, index=False)
    assert loaders.load_completion(xlsx).shape == completion.shape
    pq = tmp_path / "completion.parquet"
    completion.to_parquet(pq)
    assert loaders.load_completion(pq).shape == completion.shape


def test_find_well_test_file(tmp_path):
    assert loaders.find_well_test_file(tmp_path) is None
    (tmp_path / "well_tests.csv").write_text("x\n")
    assert loaders.find_well_test_file(tmp_path).name == "well_tests.csv"


def test_cached_high_freq_writes_and_reuses_parquet(tmp_path, minutes):
    minutes.head(50).to_csv(tmp_path / config.HIGH_FREQ_FILE, index=False)
    cache = tmp_path / "cache"
    first = loaders.cached_high_freq(tmp_path, cache)
    assert (cache / "high_freq_raw.parquet").exists()
    second = loaders.cached_high_freq(tmp_path, cache)
    pd.testing.assert_frame_equal(first, second)
