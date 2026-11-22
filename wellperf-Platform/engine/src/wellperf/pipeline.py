"""End-to-end workflow: raw files -> clean data -> VFM training/prediction -> PTA for every shut-in."""

from __future__ import annotations

from dataclasses import dataclass, replace
from pathlib import Path

import pandas as pd

from wellperf import config, loaders, pta
from wellperf.cleaning import clean_high_freq
from wellperf.events import detect_gas_lift_upsets, detect_shut_ins, upset_mask
from wellperf.features import DATE_COL, add_minute_features, daily_features, window_features
from wellperf.validation import cross_validate, forward_chain_validate, test_day_bias
from wellperf.vfm import VFMModel, fit_vfm, predict_daily
from wellperf.well_tests import clean_well_tests

Q_LOOKBACK_DAYS = 3


@dataclass(frozen=True)
class Prepared:
    minute: pd.DataFrame
    qc: pd.DataFrame
    events: pd.DataFrame
    daily: pd.DataFrame
    pvt: pd.DataFrame
    completion: pd.DataFrame
    upsets: pd.DataFrame


@dataclass(frozen=True)
class EventAnalysis:
    event: pd.Series
    inputs: pta.ReservoirInputs
    data: pta.BuildupData
    result: pta.PTAResult
    diagnostics: pta.PTADiagnostics
    q_source: str = "vfm"


@dataclass(frozen=True)
class EventOverride:
    """User choices for one shut-in: oil rate and/or radial-flow window (hours)."""

    q_oil_stbd: float | None = None
    window_hours: tuple[float, float] | None = None


def prepare(raw: pd.DataFrame, choke: pd.DataFrame | None, pvt: pd.DataFrame, completion: pd.DataFrame) -> Prepared:
    clean, qc = clean_high_freq(raw)
    events = detect_shut_ins(clean, choke)
    minute = add_minute_features(clean, choke, events, completion)
    upsets = detect_gas_lift_upsets(minute)
    minute = minute.assign(is_gl_upset=upset_mask(minute[config.TIME_COL], minute[config.WELL_COL], upsets))
    return Prepared(minute=minute, qc=qc, events=events, daily=daily_features(minute), pvt=pvt,
                    completion=completion, upsets=upsets)


def prepare_from_dir(data_dir: Path = config.DATA_DIR, cache_dir: Path = config.ARTIFACTS_DIR) -> Prepared:
    return prepare(
        loaders.cached_high_freq(data_dir, cache_dir),
        loaders.load_choke(data_dir / config.CHOKE_FILE),
        loaders.load_pvt(data_dir / config.PVT_FILE),
        loaders.load_completion(data_dir / config.COMPLETION_FILE),
    )


def training_table(prepared: Prepared, raw_tests: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Repaired well tests joined with features aggregated over each test window."""
    tests, corrections = clean_well_tests(raw_tests)
    windows = tests[[config.WELL_COL, "window_id"]].assign(start=tests["test_start"], end=tests["test_end"])
    feats = window_features(prepared.minute, windows)
    label_cols = [config.WELL_COL, "window_id", "test_start", "test_end", "oil_rate_stbd", "water_rate_stbd",
                  "gas_rate_mscfd", "liquid_rate_stbd", "water_cut_frac", "gor_scf_stb"]
    table = tests[label_cols].merge(feats, on=[config.WELL_COL, "window_id"], how="inner")
    return table, corrections


def train_vfm(prepared: Prepared, raw_tests: pd.DataFrame, run_cv: bool = True) -> VFMModel:
    table, corrections = training_table(prepared, raw_tests)
    model = fit_vfm(table)
    if not run_cv:
        return replace(model, label_corrections=corrections)
    cv_pred, cv_metrics = cross_validate(table)
    fwd_pred, fwd_metrics, quantiles = forward_chain_validate(table)
    return replace(model, cv_metrics=cv_metrics, cv_predictions=cv_pred, label_corrections=corrections,
                   test_day_bias=test_day_bias(model, table, prepared.daily), forward_metrics=fwd_metrics,
                   forward_predictions=fwd_pred, error_quantiles=quantiles)


def forward_oil_uncertainty(model: VFMModel) -> float | None:
    """Forward-validation oil MAPE as a fraction (used to bound k, since k ∝ q)."""
    if model.forward_metrics.empty:
        return None
    oil = model.forward_metrics[(model.forward_metrics["target"] == "oil_rate_stbd")
                                & (model.forward_metrics["method"] == "VFM model")]
    return float(oil["MAPE_pct"].iloc[0]) / 100


def predict(prepared: Prepared, model: VFMModel) -> pd.DataFrame:
    return predict_daily(model, prepared.daily)


def reservoir_inputs(event: pd.Series, daily_pred: pd.DataFrame, pvt: pd.DataFrame, completion: pd.DataFrame) -> pta.ReservoirInputs:
    """q = mean predicted flowing oil rate over the last full producing days before shut-in;
    Np = cumulative oil at 1 Jan 2025 + predicted production up to the shut-in time."""
    well = event[config.WELL_COL]
    start = event["shut_in_start"]
    preds = daily_pred[daily_pred[config.WELL_COL] == well].set_index(DATE_COL).sort_index()
    shut_day = start.normalize()
    before = preds.loc[preds.index < shut_day]
    full_days = before[before["data_status"] == "sensor-based"].tail(Q_LOOKBACK_DAYS)
    if full_days.empty:
        raise pta.PTAError(f"No fully producing day with sensor data before the {well} shut-in")
    q = float(full_days["flowing_oil_rate_stbd"].mean())
    same_day = preds.loc[shut_day, "flowing_oil_rate_stbd"] if shut_day in preds.index else q
    produced_2025 = before["oil_rate_stbd"].sum() + same_day * (start - shut_day) / pd.Timedelta(days=1)
    rock = pvt.set_index(config.WELL_COL).loc[well]
    cum0 = float(completion.set_index(config.WELL_COL).loc[well, "cum_oil_at_2025_01_01_stb"])
    return pta.ReservoirInputs(
        q_oil_stbd=q,
        cum_oil_stb=cum0 + float(produced_2025),
        oil_fvf_rb_stb=float(rock["oil_fvf_rb_stb"]),
        oil_viscosity_cp=float(rock["oil_viscosity_cp"]),
        net_pay_ft=float(rock["net_pay_thickness_ft"]),
        porosity_frac=float(rock["porosity_frac"]),
        total_compressibility_1_psi=float(rock["total_compressibility_1_psi"]),
        wellbore_radius_ft=float(rock["wellbore_radius_ft"]),
    )


def analyse_event(prepared: Prepared, event: pd.Series, daily_pred: pd.DataFrame,
                  override: EventOverride | None = None) -> EventAnalysis:
    override = override or EventOverride()
    inputs = reservoir_inputs(event, daily_pred, prepared.pvt, prepared.completion)
    if override.q_oil_stbd is not None:
        inputs = replace(inputs, q_oil_stbd=float(override.q_oil_stbd))
    well_minutes = prepared.minute[prepared.minute[config.WELL_COL] == event[config.WELL_COL]]
    data = pta.extract_buildup(well_minutes, event["shut_in_start"], event["shut_in_end"])
    result, diagnostics = pta.analyse_buildup(data, inputs, window_hours=override.window_hours)
    q_source = "override" if override.q_oil_stbd is not None else "vfm"
    return EventAnalysis(event=event, inputs=inputs, data=data, result=result, diagnostics=diagnostics,
                         q_source=q_source)


def analyse_all_events(prepared: Prepared, daily_pred: pd.DataFrame,
                       overrides: dict[str, EventOverride] | None = None
                       ) -> tuple[dict[str, EventAnalysis], pd.DataFrame]:
    """Run PTA for every shut-in; failures are reported per event rather than aborting the batch."""
    overrides = overrides or {}
    analyses, failures = {}, []
    for _, event in prepared.events.iterrows():
        try:
            analyses[event["event_id"]] = analyse_event(prepared, event, daily_pred,
                                                        overrides.get(event["event_id"]))
        except (pta.PTAError, KeyError, ValueError) as exc:
            failures.append({"event_id": event["event_id"], "error": str(exc)})
    return analyses, pd.DataFrame(failures, columns=["event_id", "error"])


def _deliverable_fields(event_id: str, a: EventAnalysis) -> dict:
    r = a.result
    return {
        "event_id": event_id,
        config.WELL_COL: a.event[config.WELL_COL],
        "shut_in_start": a.event["shut_in_start"],
        "shut_in_end": a.event["shut_in_end"],
        "horner_slope_psi_per_cycle": r.horner_slope_psi_cycle,
        "skin": r.skin,
        "permeability_md": r.permeability_md,
        "delta_p_skin_psi": r.delta_p_skin_psi,
    }


def _quality_fields(a: EventAnalysis, q_rel_uncertainty: float | None) -> dict:
    r = a.result
    u = q_rel_uncertainty if q_rel_uncertainty is not None else float("nan")
    return {
        "iarf_quality": r.iarf_quality,
        "k_min_md": r.k_min_md, "k_max_md": r.k_max_md, "skin_min": r.skin_min, "skin_max": r.skin_max,
        "window_source": r.window_source, "q_source": a.q_source,
        "k_from_q_low_md": r.permeability_md * (1 - u), "k_from_q_high_md": r.permeability_md * (1 + u),
        "derivative_log_slope": r.derivative_log_slope,
    }


def _detail_fields(a: EventAnalysis) -> dict:
    r = a.result
    return {
        "shut_in_duration_hours": a.event["duration_hours"],
        "q_oil_before_shut_in_stbd": r.q_oil_stbd,
        "horner_producing_time_hours": r.tp_hours,
        "p_star_semilog_extrapolation_psia": r.p_star_psia,
        "last_measured_pws_psia": r.last_measured_pws_psia,
        "pressure_basis": r.pressure_basis,
        "p1hr_psia": r.p1hr_psia,
        "pwf_at_shut_in_psia": r.pwf_psia,
        "flow_efficiency": r.flow_efficiency,
        "productivity_index_stbd_psi": r.productivity_index_stbd_psi,
        "wellbore_storage_bbl_psi": r.wellbore_storage_bbl_psi,
        "radius_of_investigation_ft": r.radius_of_investigation_ft,
        "iarf_start_hours": r.iarf_start_hours,
        "iarf_end_hours": r.iarf_end_hours,
        "horner_fit_r2": r.horner_fit_r2,
        "late_time_behaviour": r.late_time_trend,
    }


def pta_results_table(analyses: dict[str, EventAnalysis], q_rel_uncertainty: float | None = None) -> pd.DataFrame:
    """Deliverable columns first (fixed order), then quality/provenance, then details.

    `q_rel_uncertainty` (e.g. forward-validation oil MAPE as a fraction) gives k bounds, since k ∝ q."""
    rows = [{**_deliverable_fields(eid, a), **_quality_fields(a, q_rel_uncertainty), **_detail_fields(a)}
            for eid, a in analyses.items()]
    return pd.DataFrame(rows)
