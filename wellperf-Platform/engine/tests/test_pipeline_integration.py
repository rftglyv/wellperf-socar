"""End-to-end workflow on a small synthetic field: prepare -> train -> predict -> PTA -> exports/plots."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from wellperf import config, exports, pipeline, plots
from tests.conftest import START, make_minutes

WELLS = ("W-1", "W-2", "W-3")
DAYS = 20
SHUT_START = START + pd.Timedelta(days=8, hours=8)
SHUT_END = SHUT_START + pd.Timedelta(hours=24)


def _field_minutes() -> pd.DataFrame:
    frames = []
    for i, well in enumerate(WELLS):
        df = make_minutes(well, days=DAYS, seed=i)
        drift = np.linspace(0, 40, len(df))  # slow drawdown change gives the model signal
        df = df.assign(dh_pressure_psia=df["dh_pressure_psia"] - drift * (i + 1))
        frames.append(df)
    field = pd.concat(frames, ignore_index=True)
    in_shut = (field[config.WELL_COL] == "W-1") & (field[config.TIME_COL] > SHUT_START) & (field[config.TIME_COL] < SHUT_END)
    dt_h = (field.loc[in_shut, config.TIME_COL] - SHUT_START) / pd.Timedelta(hours=1)
    pwf = field.loc[(field[config.WELL_COL] == "W-1") & (field[config.TIME_COL] == SHUT_START), "dh_pressure_psia"].iloc[0]
    field.loc[in_shut, "dh_pressure_psia"] = pwf + 150 + 30 * np.log10(dt_h)
    field.loc[in_shut, "gas_lift_rate_mscfd"] = 0.0
    return field


def _static() -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    choke = pd.DataFrame({
        config.TIME_COL: [START] * 3 + [SHUT_START, SHUT_END],
        config.WELL_COL: list(WELLS) + ["W-1", "W-1"],
        "choke_opening_pct": [40.0, 45.0, 50.0, 0.0, 40.0],
    })
    pvt = pd.DataFrame({config.WELL_COL: WELLS, "net_pay_thickness_ft": 60.0, "porosity_frac": 0.2,
                        "total_compressibility_1_psi": 1.3e-5, "wellbore_radius_ft": 0.33,
                        "oil_fvf_rb_stb": 1.15, "oil_viscosity_cp": 1.2})
    completion = pd.DataFrame({config.WELL_COL: WELLS, "choke_max_size_64ths": 128,
                               "cum_oil_at_2025_01_01_stb": 1e6})
    return choke, pvt, completion


def _tests(prepared: pipeline.Prepared) -> pd.DataFrame:
    rows = []
    for well in WELLS:
        for day in (2, 5, 12, 15, 18):
            start = START + pd.Timedelta(days=day, hours=6)
            win = prepared.minute[(prepared.minute[config.WELL_COL] == well)
                                  & prepared.minute[config.TIME_COL].between(start, start + pd.Timedelta(hours=12))]
            liquid = 2.0 * (3500 - win["dh_pressure_psia"].mean())
            oil = 0.7 * liquid
            rows.append({config.WELL_COL: well, "test_start": start, "test_end": start + pd.Timedelta(hours=12),
                         "oil_rate_stbd": oil, "water_rate_stbd": 0.3 * liquid, "gas_rate_mscfd": oil * 0.25,
                         "gas_lift_rate_mscfd": 800.0})
    return pd.DataFrame(rows)


@pytest.fixture(scope="module")
def workflow():
    choke, pvt, completion = _static()
    prepared = pipeline.prepare(_field_minutes(), choke, pvt, completion)
    model = pipeline.train_vfm(prepared, _tests(prepared))
    pred = pipeline.predict(prepared, model)
    analyses, failures = pipeline.analyse_all_events(prepared, pred)
    return prepared, model, pred, analyses, failures


def test_shut_in_detected_once(workflow):
    prepared = workflow[0]
    assert len(prepared.events) == 1
    assert prepared.events.loc[0, "source"] == "choke"


def test_predictions_cover_every_well_day(workflow):
    pred = workflow[2]
    assert len(pred) == len(WELLS) * DAYS
    assert pred[["oil_rate_stbd", "water_rate_stbd", "gas_rate_mscfd"]].notna().all().all()
    w1_shut_day = pred[(pred[config.WELL_COL] == "W-1") & (pred["date"] == SHUT_START.normalize())].iloc[0]
    assert 0 < w1_shut_day["uptime_frac"] < 1


def test_model_carries_validation_and_bias_check(workflow):
    model = workflow[1]
    assert not model.cv_metrics.empty
    assert not model.test_day_bias.empty


def test_pta_runs_and_exports(workflow):
    prepared, model, pred, analyses, failures = workflow
    assert failures.empty
    assert len(analyses) == 1
    results = pipeline.pta_results_table(analyses)
    assert results.loc[0, "horner_slope_psi_per_cycle"] == pytest.approx(30.0, rel=0.1)
    pta_xlsx = exports.pta_excel(results, analyses)
    vfm_xlsx = exports.vfm_excel(pred, model.cv_metrics, model.cv_predictions, model.label_corrections, prepared.qc)
    assert pta_xlsx[:2] == b"PK" and vfm_xlsx[:2] == b"PK"


def test_all_figures_render(workflow):
    prepared, model, pred, analyses, _ = workflow
    analysis = next(iter(analyses.values()))
    figures = [plots.sensor_panels(prepared.minute, "W-1", prepared.events),
               plots.daily_rates(pred, None, "W-1"),
               plots.cv_parity(model.cv_predictions),
               *plots.pta_figures(analysis, prepared.minute, pred).values()]
    html = exports.html_report("t", [("fig", exports.fig_html(f)) for f in figures])
    assert html.count("plotly-graph-div") == len(figures)


def test_html_report_works_offline(workflow):
    prepared, model, pred, analyses, _ = workflow
    html = exports.html_report("t", [("fig", exports.fig_html(plots.daily_rates(pred, None, "W-1")))])
    assert "<script src=" not in html  # nothing loaded from the network
    # The only "cdn.plot.ly" left is plotly.js's default topojson URL (geo maps only; unused here).
    assert html.count("cdn.plot.ly") <= 1
    assert html.count("Plotly") > 10  # library embedded inline


def test_pta_export_keeps_deliverable_columns_first(workflow):
    analyses = workflow[3]
    results = pipeline.pta_results_table(analyses, q_rel_uncertainty=0.04)
    assert list(results.columns[:8]) == exports.PTA_DELIVERABLE_COLS
    for col in ("iarf_quality", "k_min_md", "k_max_md", "skin_min", "skin_max", "window_source", "q_source"):
        assert col in results.columns[8:]
    assert results.loc[0, "k_from_q_high_md"] > results.loc[0, "permeability_md"] > results.loc[0, "k_from_q_low_md"]
