"""Headless smoke test of every UI page against the real project data (skipped if the dataset is absent)."""

from __future__ import annotations

import pytest
from streamlit.testing.v1 import AppTest

from wellperf import config

APP = str(config.PROJECT_ROOT / "app.py")
PAGES = {
    "src/wellperf/ui/page_data.py": "1 · Field data",
    "src/wellperf/ui/page_vfm.py": "2 · Virtual flow metering",
    "src/wellperf/ui/page_pta.py": "3 · Pressure transient analysis",
    "src/wellperf/ui/page_export.py": "4 · Reports & export",
}

pytestmark = pytest.mark.skipif(
    not (config.DATA_DIR / config.HIGH_FREQ_FILE).exists() or not config.MODEL_PATH.exists(),
    reason="real dataset or trained model not available",
)


@pytest.mark.parametrize("page", ["data", "vfm", "pta", "export"])
def test_page_renders_without_exceptions(page):
    renderers = {
        "data": "from wellperf.ui import page_data as p",
        "vfm": "from wellperf.ui import page_vfm as p",
        "pta": "from wellperf.ui import page_pta as p",
        "export": "from wellperf.ui import page_export as p",
    }
    script = f"import streamlit as st\n{renderers[page]}\np.render()\n"
    at = AppTest.from_string(script, default_timeout=180).run()
    assert not at.exception, at.exception
    assert at.header[0].value == PAGES[next(k for k in PAGES if page in k.split("_")[-1])]


def test_pta_page_lists_every_shut_in():
    at = AppTest.from_string(
        "from wellperf.ui import page_pta as p\np.render()\n", default_timeout=180
    ).run()
    assert not at.exception
    assert len(at.selectbox[0].options) == 6


def _all_text(at) -> str:
    return " ".join(str(getattr(el, "value", "")) + " " + str(getattr(el, "label", ""))
                    for el in at.main.children.values() for el in _walk(el))


def _walk(node):
    yield node
    for child in getattr(node, "children", {}).values():
        yield from _walk(child)


def test_gl01_badge_not_good_and_override_warning():
    at = AppTest.from_string("from wellperf.ui import page_pta as p\np.render()\n", default_timeout=180).run()
    at.selectbox(key="pta_event").set_value("GL-01_20250415_0800").run()
    assert not at.exception
    assert "No stable radial flow" in _all_text(at)
    at.number_input(key="q_GL-01_20250415_0800").set_value(900.0).run()
    at.button(key="apply_GL-01_20250415_0800").click().run()
    assert any("Override active: q = 900.0" in w.value for w in at.warning)


def test_data_page_lists_field_wide_upset():
    at = AppTest.from_string("from wellperf.ui import page_data as p\np.render()\n", default_timeout=180).run()
    assert not at.exception
    upsets = at.dataframe[-1].value
    assert (upsets["scope"] == "field-wide").sum() == 10


def test_cli_writes_four_outputs(tmp_path, monkeypatch):
    from wellperf import cli, reports
    original = reports.write_outputs
    monkeypatch.setattr(reports, "write_outputs", lambda files: original(files, tmp_path))
    assert cli.main(["--no-train"]) == 0
    assert sorted(p.name for p in tmp_path.iterdir()) == ["pta_report.html", "pta_reservoir_properties.xlsx",
                                                          "vfm_daily_predictions.xlsx", "vfm_report.html"]


def test_lift_gas_panel_at_top_of_first_page():
    at = AppTest.from_string("from wellperf.ui import page_data as p\np.render()\n", default_timeout=180).run()
    assert not at.exception
    headings = [s.value for s in at.subheader]
    assert headings[0].startswith("💨 Lift-gas optimiser")
    text = _all_text(at)
    for label in ("🥇 Best place", "⬇️ Lowest value", "🔁 Move gas"):
        assert label in text
