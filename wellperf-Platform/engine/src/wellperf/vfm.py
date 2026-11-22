"""Virtual flow meter: daily oil, water and gas rates from sensor data.

What is sensor-driven and what is not:
* Liquid rate is SENSOR-DRIVEN: log-linear ridge regression fitted by bounded least squares.
  Per well, rate follows an inflow relation in the downhole flowing pressure (q ~ J·(Pr − Pwf)):
  a per-well intercept, a per-well Pwf slope and a per-well time trend (depletion), both
  centred on the well's mean so they are not collinear with the intercept. Shared terms:
  downhole temperature, annulus pressure, log gas-lift rate, log choke size. Every per-well
  Pwf slope is constrained negative (≤ −1/5000 per psi: liquid must fall as Pwf rises).
  The ridge penalty is chosen by leave-one-test-out cross-validation.
* Water cut follows a per-well linear TIME TREND fitted to the tests; GOR is the per-well
  TEST MEAN. Daily water and gas therefore follow test trends, not sensors.
* oil = liquid·(1−wc), water = liquid·wc, gas = oil·GOR/1000 -> mutually consistent rates.
* Daily rate = flowing rate × uptime fraction (0 for fully shut-in days).
* Surface pressures (WHP, downstream WHP, choke ΔP) are deliberately NOT used: during well
  tests flow is routed to the test separator and those pressures drop 4–12 %, so a model
  trained on test windows would be biased on normal days (−9 % with them, +0.3 % without).
* Not valid for lift-gas optimisation: lift-gas response is a shared correlation, not a
  calibrated gas-lift performance curve.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from wellperf import config
from wellperf.bounded_ridge import BoundedRidge, fit_bounded_ridge
from wellperf.features import DATE_COL

EPOCH = pd.Timestamp("2025-01-01")
RIDGE_ALPHAS = np.logspace(-4, 2, 13)
MID_TIME_COL = "mid_time"
LOG_FEATURES = ("choke_size_64ths", "gas_lift_rate_mscfd")
LINEAR_FEATURES = ("dh_temperature_degf", "annulus_pressure_psia")
PWF_COL, TIME_FEATURE = "dh_pressure_psia", "t_days"
MAX_DRAWDOWN_PSI = 5000.0  # d ln q / dPwf = −1/(Pr − Pwf) ≤ −1/MAX_DRAWDOWN_PSI
LOG_FLOOR = 1.0
MIN_TESTS_FOR_TREND = 3
MIN_RECORDED_MINUTES = 1400  # below this the day's features come from a partial record
SENSITIVITY_PWF_PSI = 10.0
SENSITIVITY_REL_STEP = 0.10


@dataclass(frozen=True)
class VFMModel:
    liquid_model: BoundedRidge
    wells: tuple[str, ...]
    wc_trend: dict[str, tuple[float, float]]
    gor_mean: dict[str, float]
    design_columns: tuple[str, ...]
    centers: dict[str, dict[str, float]] = field(default_factory=dict)
    cv_metrics: pd.DataFrame = field(default_factory=pd.DataFrame)
    cv_predictions: pd.DataFrame = field(default_factory=pd.DataFrame)
    label_corrections: pd.DataFrame = field(default_factory=pd.DataFrame)
    test_day_bias: pd.DataFrame = field(default_factory=pd.DataFrame)
    forward_metrics: pd.DataFrame = field(default_factory=pd.DataFrame)
    forward_predictions: pd.DataFrame = field(default_factory=pd.DataFrame)
    error_quantiles: dict[str, tuple[float, float]] = field(default_factory=dict)


def test_midpoint(tests: pd.DataFrame) -> pd.Series:
    return tests["test_start"] + (tests["test_end"] - tests["test_start"]) / 2


def _t_days(times: pd.Series) -> pd.Series:
    return (times - EPOCH) / pd.Timedelta(days=1)


def _pwf_col(well: str) -> str:
    return f"pwf_c_x_{well}"


def design_matrix(features: pd.DataFrame, wells: tuple[str, ...],
                  centers: dict[str, dict[str, float]]) -> pd.DataFrame:
    """Shared terms + per-well intercept + per-well slopes on well-centred Pwf and time."""
    logs = {f"log_{c}": np.log(features[c].clip(lower=LOG_FLOOR)) for c in LOG_FEATURES}
    linear = {c: features[c] for c in LINEAR_FEATURES}
    dummies = {f"well_{w}": (features[config.WELL_COL] == w).astype(float) for w in wells}
    pwf = {_pwf_col(w): dummies[f"well_{w}"] * (features[PWF_COL] - centers[w][PWF_COL]) for w in wells}
    time = {f"t_c_x_{w}": dummies[f"well_{w}"] * (features[TIME_FEATURE] - centers[w][TIME_FEATURE])
            for w in wells}
    return pd.DataFrame({**logs, **linear, **dummies, **pwf, **time}, index=features.index)


def _fit_wc_trend(t: np.ndarray, wc: np.ndarray) -> tuple[float, float]:
    if len(t) < MIN_TESTS_FOR_TREND:
        return 0.0, float(np.mean(wc))
    slope, intercept = np.polyfit(t, wc, 1)
    return float(slope), float(intercept)


def _bounds(columns: list[str], wells: tuple[str, ...]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    pwf_cols = {_pwf_col(w) for w in wells}
    lower = np.full(len(columns), -np.inf)
    upper = np.array([-1.0 / MAX_DRAWDOWN_PSI if c in pwf_cols else np.inf for c in columns])
    penalised = np.array([not c.startswith("well_") for c in columns])
    return lower, upper, penalised


def fit_vfm(train: pd.DataFrame) -> VFMModel:
    """`train` = well-test labels joined with window features (one row per test)."""
    train = train.assign(t_days=_t_days(test_midpoint(train)))
    wells = tuple(sorted(train[config.WELL_COL].unique()))
    by_well = train.groupby(config.WELL_COL)
    centers = {w: {PWF_COL: float(g[PWF_COL].mean()), TIME_FEATURE: float(g[TIME_FEATURE].mean())}
               for w, g in by_well}
    X = design_matrix(train, wells, centers)
    lower, upper, penalised = _bounds(list(X.columns), wells)
    model = fit_bounded_ridge(X, np.log(train["liquid_rate_stbd"].to_numpy()), penalised, RIDGE_ALPHAS,
                              lower, upper)
    wc_trend = {w: _fit_wc_trend(g["t_days"].to_numpy(), g["water_cut_frac"].to_numpy()) for w, g in by_well}
    return VFMModel(model, wells, wc_trend, by_well["gor_scf_stb"].mean().to_dict(), tuple(X.columns), centers)


def sensitivities(model: VFMModel) -> pd.DataFrame:
    """% change in liquid per +10 psi Pwf, +10 % lift gas and +10 % choke, per well."""
    lm, step = model.liquid_model, 1 + SENSITIVITY_REL_STEP
    lift = 100 * (step ** lm.coef("log_gas_lift_rate_mscfd") - 1)
    choke = 100 * (step ** lm.coef("log_choke_size_64ths") - 1)
    return pd.DataFrame({
        config.WELL_COL: list(model.wells),
        "liquid_pct_per_10psi_pwf": [100 * np.expm1(SENSITIVITY_PWF_PSI * lm.coef(_pwf_col(w))) for w in model.wells],
        "liquid_pct_per_10pct_lift_gas": lift,
        "liquid_pct_per_10pct_choke": choke,
    })


def predict_flowing(model: VFMModel, features: pd.DataFrame, time_col: str) -> pd.DataFrame:
    """Flowing (on-stream) rates for each feature row. Rows from unknown wells are rejected."""
    unknown = set(features[config.WELL_COL]) - set(model.wells)
    if unknown:
        raise ValueError(f"No trained calibration for wells: {', '.join(sorted(unknown))}")
    feats = features.assign(t_days=_t_days(features[time_col]))
    X = design_matrix(feats, model.wells, model.centers)[list(model.design_columns)]
    complete = X.notna().all(axis=1)
    liquid = pd.Series(np.nan, index=feats.index)
    liquid[complete] = np.exp(model.liquid_model.predict(X[complete]))
    slope = feats[config.WELL_COL].map(lambda w: model.wc_trend[w][0])
    intercept = feats[config.WELL_COL].map(lambda w: model.wc_trend[w][1])
    wc = (intercept + slope * feats["t_days"]).clip(0.0, 0.99)
    gor = feats[config.WELL_COL].map(model.gor_mean)
    oil = liquid * (1 - wc)
    return pd.DataFrame(
        {
            "liquid_rate_stbd": liquid,
            "water_cut_frac": wc,
            "gor_scf_stb": gor,
            "oil_rate_stbd": oil,
            "water_rate_stbd": liquid * wc,
            "gas_rate_mscfd": oil * gor / 1000.0,
        },
        index=features.index,
    )


def _fill_missing_days(flowing: pd.DataFrame, daily: pd.DataFrame) -> pd.DataFrame:
    """Days with no flowing sensor data but producing time: interpolate rates within the well."""
    rate_cols = ["oil_rate_stbd", "water_rate_stbd", "gas_rate_mscfd"]
    filled = flowing.copy()
    for _, idx in daily.groupby(config.WELL_COL).groups.items():
        filled.loc[idx, rate_cols] = flowing.loc[idx, rate_cols].interpolate(limit_direction="both")
    return filled


def predict_daily(model: VFMModel, daily: pd.DataFrame) -> pd.DataFrame:
    """Daily production rates on a complete calendar (missing days are interpolated and flagged)."""
    calendar = _complete_calendar(daily)
    calendar = calendar.assign(**{MID_TIME_COL: calendar[DATE_COL] + pd.Timedelta(hours=12)})
    flowing = predict_flowing(model, calendar, MID_TIME_COL)
    imputed = flowing["oil_rate_stbd"].isna() & (calendar["uptime_frac"].fillna(1.0) > 0)
    flowing = _fill_missing_days(flowing, calendar)
    uptime = calendar["uptime_frac"].fillna(1.0)
    out = calendar[[DATE_COL, config.WELL_COL]].assign(
        oil_rate_stbd=flowing["oil_rate_stbd"] * uptime,
        water_rate_stbd=flowing["water_rate_stbd"] * uptime,
        gas_rate_mscfd=flowing["gas_rate_mscfd"] * uptime,
        flowing_oil_rate_stbd=flowing["oil_rate_stbd"],
        flowing_water_rate_stbd=flowing["water_rate_stbd"],
        flowing_gas_rate_mscfd=flowing["gas_rate_mscfd"],
        water_cut_frac=flowing["water_cut_frac"],
        gor_scf_stb=flowing["gor_scf_stb"],
        uptime_frac=uptime,
        **_uncertainty_columns(model, flowing, uptime),
        data_status=_status(calendar, uptime, imputed),
    )
    return out.sort_values([config.WELL_COL, DATE_COL], ignore_index=True)


def _uncertainty_columns(model: VFMModel, flowing: pd.DataFrame, uptime: pd.Series) -> dict[str, pd.Series]:
    """P10/P90 daily rates from forward-validation relative errors (empty if not validated)."""
    cols = {}
    for phase, (low, high) in model.error_quantiles.items():
        daily = flowing[phase] * uptime
        cols = {**cols, f"{phase}_p10": daily * (1 + low), f"{phase}_p90": daily * (1 + high)}
    return cols


def _status(calendar: pd.DataFrame, uptime: pd.Series, imputed: pd.Series) -> np.ndarray:
    return np.select(
        [calendar["recorded_minutes"].isna(), uptime <= 0, imputed, uptime < 1,
         calendar.get("gas_lift_upset_minutes", pd.Series(0, index=calendar.index)).fillna(0) > 0,
         calendar["recorded_minutes"] < MIN_RECORDED_MINUTES],
        ["no sensor data (rates interpolated)", "shut in all day", "insufficient data (rates interpolated)",
         "partial shut-in (rate x uptime)", "gas-lift upset", "partial sensor record"],
        default="sensor-based",
    )


def _complete_calendar(daily: pd.DataFrame) -> pd.DataFrame:
    dates = pd.date_range(daily[DATE_COL].min(), daily[DATE_COL].max(), freq="D")
    wells = sorted(daily[config.WELL_COL].unique())
    grid = pd.MultiIndex.from_product([wells, dates], names=[config.WELL_COL, DATE_COL]).to_frame(index=False)
    return grid.merge(daily, on=[config.WELL_COL, DATE_COL], how="left")


def save_model(model: VFMModel, path: Path = config.MODEL_PATH) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, path)
    return path


def load_model(path: Path = config.MODEL_PATH) -> VFMModel:
    model = joblib.load(path)
    if not isinstance(model, VFMModel):
        raise TypeError(f"{path} does not contain a VFMModel")
    return model
