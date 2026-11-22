from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from wellperf import config, exports
from wellperf.features import DATE_COL
from wellperf.validation import cross_validate
from wellperf.vfm import fit_vfm, load_model, predict_daily, save_model
from wellperf.well_tests import M3_PER_MSCF, clean_well_tests

WELLS = ("W-1", "W-2", "W-3")
J = {"W-1": 2.0, "W-2": 3.0, "W-3": 1.5}
PR = {"W-1": 3500.0, "W-2": 3200.0, "W-3": 3800.0}
WC = {"W-1": 0.3, "W-2": 0.5, "W-3": 0.2}
GOR = {"W-1": 250.0, "W-2": 300.0, "W-3": 200.0}


def _row(well: str, when: pd.Timestamp, pwf: float, rng) -> dict:
    return {
        config.WELL_COL: well,
        "dh_pressure_psia": pwf,
        "dh_temperature_degf": 190 + rng.normal(0, 0.1),
        "annulus_pressure_psia": 1100 + rng.normal(0, 5),
        "gas_lift_rate_mscfd": 900 + rng.normal(0, 20),
        "choke_size_64ths": 48.0,
        "when": when,
    }


def synthetic_training(n_per_well: int = 9, seed: int = 1) -> pd.DataFrame:
    """Liquid follows a linear inflow relation q = J (Pr - Pwf): the structure the model should learn."""
    rng = np.random.default_rng(seed)
    rows = []
    for well in WELLS:
        for k in range(n_per_well):
            start = pd.Timestamp("2025-01-05") + pd.Timedelta(days=30 * k)
            pwf = PR[well] - rng.uniform(300, 700)
            row = _row(well, start, pwf, rng)
            liquid = J[well] * (PR[well] - pwf)
            oil = liquid * (1 - WC[well])
            rows.append({**row, "test_start": start, "test_end": start + pd.Timedelta(hours=12),
                         "liquid_rate_stbd": liquid, "water_cut_frac": WC[well], "gor_scf_stb": GOR[well],
                         "oil_rate_stbd": oil, "water_rate_stbd": liquid * WC[well],
                         "gas_rate_mscfd": oil * GOR[well] / 1000})
    return pd.DataFrame(rows).drop(columns="when")


def synthetic_daily(days: int = 10) -> pd.DataFrame:
    rng = np.random.default_rng(2)
    rows = []
    for well in WELLS:
        for d in range(days):
            row = _row(well, None, PR[well] - 500, rng)
            rows.append({**row, DATE_COL: pd.Timestamp("2025-02-01") + pd.Timedelta(days=d),
                         "uptime_frac": 1.0, "recorded_minutes": 1440})
    daily = pd.DataFrame(rows).drop(columns="when")
    gap = (daily[config.WELL_COL] == "W-1") & (daily[DATE_COL] == pd.Timestamp("2025-02-05"))
    shut = (daily[config.WELL_COL] == "W-2") & (daily[DATE_COL] == pd.Timestamp("2025-02-03"))
    daily.loc[shut, "uptime_frac"] = 0.0
    daily.loc[shut, "dh_pressure_psia"] = np.nan
    return daily[~gap].reset_index(drop=True)


def test_fit_recovers_inflow_relation():
    model = fit_vfm(synthetic_training())
    pred = predict_daily(model, synthetic_daily())
    w1 = pred[(pred[config.WELL_COL] == "W-1") & (pred["data_status"] == "sensor-based")]
    expected_liquid = J["W-1"] * 500
    liquid = w1["oil_rate_stbd"] + w1["water_rate_stbd"]
    assert liquid.median() == pytest.approx(expected_liquid, rel=0.03)
    assert (w1["water_rate_stbd"] / liquid).median() == pytest.approx(WC["W-1"], abs=0.01)


def test_daily_prediction_covers_full_calendar_and_flags_gaps():
    model = fit_vfm(synthetic_training())
    pred = predict_daily(model, synthetic_daily())
    assert len(pred) == len(WELLS) * 10
    gap = pred[(pred[config.WELL_COL] == "W-1") & (pred[DATE_COL] == pd.Timestamp("2025-02-05"))].iloc[0]
    assert gap["data_status"].startswith("no sensor data")
    assert gap["oil_rate_stbd"] > 0
    shut = pred[(pred[config.WELL_COL] == "W-2") & (pred[DATE_COL] == pd.Timestamp("2025-02-03"))].iloc[0]
    assert shut["oil_rate_stbd"] == 0.0
    assert shut["data_status"] == "shut in all day"


def test_unknown_well_rejected():
    model = fit_vfm(synthetic_training())
    daily = synthetic_daily().assign(**{config.WELL_COL: "W-99"})
    with pytest.raises(ValueError, match="W-99"):
        predict_daily(model, daily)


def test_cross_validation_beats_interpolation_baseline():
    preds, metrics = cross_validate(synthetic_training())
    assert len(preds) == len(WELLS) * 9
    oil = metrics[metrics["target"] == "oil_rate_stbd"].set_index("method")["MAPE_pct"]
    assert oil["VFM model"] < oil["Test interpolation (baseline)"]
    assert oil["VFM model"] < 5.0


def test_model_round_trip(tmp_path):
    model = fit_vfm(synthetic_training())
    path = save_model(model, tmp_path / "m.joblib")
    assert load_model(path).wells == model.wells


def test_well_test_repairs_signs_and_units():
    raw = pd.DataFrame({
        config.WELL_COL: ["A", "B"],
        "test_start": pd.to_datetime(["2025-01-01", "2025-01-02"]),
        "test_end": pd.to_datetime(["2025-01-01 12:00", "2025-01-02 12:00"]),
        "oil_rate_stbd": [1000.0, 800.0],
        "water_rate_stbd": [-500.0, 200.0],
        "gas_rate_mscfd": [250.0, 200.0 * M3_PER_MSCF],
        "gor_scf_stb": [250.0, 250.0],
        "gas_lift_rate_mscfd": [800.0, 700.0],
    })
    cleaned, log = clean_well_tests(raw)
    assert cleaned.loc[0, "water_rate_stbd"] == 500.0
    assert cleaned.loc[1, "gas_rate_mscfd"] == pytest.approx(200.0)
    assert cleaned.loc[0, "liquid_rate_stbd"] == 1500.0
    assert set(log["issue"].str.split(" ").str[0]) == {"negative", "reported"}
    assert raw.loc[0, "water_rate_stbd"] == -500.0  # input untouched


def test_vfm_deliverable_has_exact_columns():
    model = fit_vfm(synthetic_training())
    out = exports.vfm_deliverable(predict_daily(model, synthetic_daily()))
    assert list(out.columns) == ["date", "well_name", "oil_rate_stbd", "water_rate_stbd", "gas_rate_mscfd"]


def test_unconfirmed_negative_rate_is_not_blindly_flipped():
    raw = pd.DataFrame({
        config.WELL_COL: ["A"], "test_start": pd.to_datetime(["2025-01-01"]),
        "test_end": pd.to_datetime(["2025-01-01 12:00"]),
        "oil_rate_stbd": [1000.0], "water_rate_stbd": [-500.0], "gas_rate_mscfd": [250.0],
        "liquid_rate_stbd": [1200.0],  # |water| would give 1500: identity says the value is wrong
    })
    cleaned, log = clean_well_tests(raw)
    assert cleaned.empty
    assert "not confirmed" in log.loc[0, "issue"]


def test_pwf_slopes_constrained_negative_even_for_contrary_well():
    data = synthetic_training()
    contrary = data[config.WELL_COL] == "W-3"
    # Make W-3 liquid rise with Pwf (physically wrong) — the fit must not follow it.
    data.loc[contrary, "liquid_rate_stbd"] = 1000 + 0.5 * (data.loc[contrary, "dh_pressure_psia"] - 3300)
    model = fit_vfm(data)
    from wellperf.vfm import sensitivities
    sens = sensitivities(model)
    assert list(sens[config.WELL_COL]) == list(WELLS)
    assert (sens["liquid_pct_per_10psi_pwf"] < 0).all()
    assert {"liquid_pct_per_10pct_lift_gas", "liquid_pct_per_10pct_choke"} <= set(sens.columns)


def test_alpha_selected_by_cross_validation_inside_grid():
    from wellperf.vfm import RIDGE_ALPHAS
    model = fit_vfm(synthetic_training())
    assert RIDGE_ALPHAS.min() <= model.liquid_model.alpha_ <= RIDGE_ALPHAS.max()


def test_forward_validation_uses_only_earlier_tests():
    from wellperf.validation import FORWARD_MIN_PRIOR_TESTS, forward_chain_validate
    preds, metrics, quantiles = forward_chain_validate(synthetic_training())
    assert not preds.empty
    assert (preds["latest_training_test_start"] < preds["test_start"]).all()
    assert (preds["prior_tests_same_well"] >= FORWARD_MIN_PRIOR_TESTS).all()
    assert set(metrics["method"]) == {"VFM model", "Last test carried forward (baseline)"}
    for phase in ("oil_rate_stbd", "water_rate_stbd", "gas_rate_mscfd"):
        p10, p90 = quantiles[phase]
        assert p10 <= p90


def test_daily_prediction_uncertainty_columns():
    from dataclasses import replace
    model = replace(fit_vfm(synthetic_training()),
                    error_quantiles={"oil_rate_stbd": (-0.05, 0.04), "water_rate_stbd": (-0.06, 0.05),
                                     "gas_rate_mscfd": (-0.1, 0.08)})
    pred = predict_daily(model, synthetic_daily())
    ok = pred["oil_rate_stbd"] > 0
    assert (pred.loc[ok, "oil_rate_stbd_p10"] < pred.loc[ok, "oil_rate_stbd"]).all()
    assert (pred.loc[ok, "oil_rate_stbd_p90"] > pred.loc[ok, "oil_rate_stbd"]).all()
    assert list(exports.vfm_deliverable(pred).columns) == ["date", "well_name", "oil_rate_stbd",
                                                          "water_rate_stbd", "gas_rate_mscfd"]
