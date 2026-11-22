"""Pressure build-up analysis (single-phase oil, field units).

Method per shut-in event:
1. pwf = downhole pressure at the last flowing minute; Δp = pws − pwf.
2. Horner producing time tp = 24·Np/q (h), q = predicted daily oil rate before shut-in.
3. Bourdet derivative on Agarwal equivalent time, log-resampled and L-smoothed.
4. Infinite-acting radial flow (IARF) = the longest window (≥ 0.5 log cycle) where the derivative
   is flat (within tolerance) AND its log-log slope is below 0.1. Re-run at tolerances
   0.08–0.20: "good" only if k varies < 10 % and skin < 0.5; otherwise "indicative";
   no plateau at all -> "no_radial_flow" (last half cycle used, results indicative).
5. Horner straight line fitted in that window -> slope m (psi/cycle), p*, p1hr.
6. k = 162.6·q·B·μ / (m·h)
   s = 1.151·[(p1hr − pwf)/m − log10(k / (φ·μ·ct·rw²)) + 3.23]
   ΔPskin = 0.869·m·s
7. PI and flow efficiency use p* unless the late-time derivative falls (boundary or pressure
   support), in which case the last measured shut-in pressure is the reference.
k is the effective permeability to oil (single-phase oil analysis of a multiphase well).
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np
import pandas as pd

from wellperf import config

LN10 = np.log(10.0)
POINTS_PER_CYCLE = 20
DERIVATIVE_SMOOTHING_CYCLES = 0.15
IARF_FLATNESS_TOL = 0.12  # max relative deviation of derivative from its window median
IARF_MIN_CYCLES = 0.5
IARF_MAX_LOG_SLOPE = 0.1  # |d log(Δp') / d log(Δte)| allowed across a radial-flow window
TOLERANCE_SWEEP = (0.08, 0.10, 0.12, 0.15, 0.20)
GOOD_K_SPREAD = 0.10  # (k_max − k_min)/k across the sweep
GOOD_SKIN_SPREAD = 0.5
FALLBACK_CYCLES = 0.5
MIN_MANUAL_POINTS = 3
QUALITY_GOOD, QUALITY_INDICATIVE, QUALITY_NONE = "good", "indicative", "no_radial_flow"
TREND_FALLING = "derivative falling after radial flow (pressure support / closed-system depletion)"
EARLY_SKIP_HOURS = 0.05  # first few minutes are dominated by the choke-closure transient
MIN_BUILDUP_POINTS = 30
MAX_PWF_AGE_MIN = 10  # last flowing pressure must be this close to the shut-in time


class PTAError(ValueError):
    """Raised when a build-up cannot be analysed (too short, no pressure data, bad inputs)."""


@dataclass(frozen=True)
class ReservoirInputs:
    q_oil_stbd: float
    cum_oil_stb: float
    oil_fvf_rb_stb: float
    oil_viscosity_cp: float
    net_pay_ft: float
    porosity_frac: float
    total_compressibility_1_psi: float
    wellbore_radius_ft: float

    def validate(self) -> "ReservoirInputs":
        for name, value in asdict(self).items():
            if not np.isfinite(value) or value <= 0:
                raise PTAError(f"{name} must be a positive number, got {value}")
        return self

    @property
    def tp_hours(self) -> float:
        return 24.0 * self.cum_oil_stb / self.q_oil_stbd


@dataclass(frozen=True)
class BuildupData:
    dt_hours: np.ndarray
    pws_psia: np.ndarray
    pwf_psia: float
    shut_in_time: pd.Timestamp


@dataclass(frozen=True)
class PTAResult:
    horner_slope_psi_cycle: float
    permeability_md: float
    skin: float
    delta_p_skin_psi: float
    p_star_psia: float
    p1hr_psia: float
    pwf_psia: float
    q_oil_stbd: float
    tp_hours: float
    iarf_start_hours: float
    iarf_end_hours: float
    horner_fit_r2: float
    flow_efficiency: float
    productivity_index_stbd_psi: float
    radius_of_investigation_ft: float
    wellbore_storage_bbl_psi: float
    late_time_trend: str
    iarf_fallback: bool
    iarf_quality: str
    derivative_log_slope: float
    k_min_md: float
    k_max_md: float
    skin_min: float
    skin_max: float
    window_source: str
    last_measured_pws_psia: float
    pressure_basis: str


def extract_buildup(minute: pd.DataFrame, start: pd.Timestamp, end: pd.Timestamp | None) -> BuildupData:
    """Pull the shut-in pressure record for one well; `minute` holds that well only."""
    p = minute.set_index(config.TIME_COL)["dh_pressure_psia"].sort_index()
    before = p.loc[:start].dropna()
    if before.empty:
        raise PTAError("No flowing pressure recorded before shut-in")
    if start - before.index[-1] > pd.Timedelta(minutes=MAX_PWF_AGE_MIN):
        raise PTAError(f"Last flowing pressure is {start - before.index[-1]} before shut-in; pwf is unreliable")
    stop = end if end is not None and pd.notna(end) else p.index.max()
    after = p.loc[(p.index > start) & (p.index < stop)]
    after = after.interpolate(limit=5, limit_area="inside").dropna()
    if len(after) < MIN_BUILDUP_POINTS:
        raise PTAError(f"Build-up has only {len(after)} valid points")
    dt = ((after.index - start) / pd.Timedelta(hours=1)).to_numpy()
    return BuildupData(dt_hours=dt, pws_psia=after.to_numpy(), pwf_psia=float(before.iloc[-1]), shut_in_time=start)


def agarwal_time(dt: np.ndarray, tp: float) -> np.ndarray:
    return dt * tp / (tp + dt)


def horner_time(dt: np.ndarray, tp: float) -> np.ndarray:
    return (tp + dt) / dt


def log_resample(dt: np.ndarray, values: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Median of values in log-spaced bins (POINTS_PER_CYCLE per log cycle)."""
    positive = dt > 0
    log_dt = np.log10(dt[positive])
    edges = np.arange(log_dt.min(), log_dt.max() + 1.0 / POINTS_PER_CYCLE, 1.0 / POINTS_PER_CYCLE)
    bins = np.digitize(log_dt, edges)
    frame = pd.DataFrame({"bin": bins, "log_dt": log_dt, "v": values[positive]})
    grouped = frame.groupby("bin").median()
    return 10 ** grouped["log_dt"].to_numpy(), grouped["v"].to_numpy()


def bourdet_derivative(t: np.ndarray, dp: np.ndarray, smoothing: float = DERIVATIVE_SMOOTHING_CYCLES) -> np.ndarray:
    """d(Δp)/d(ln t) with Bourdet L-smoothing (L in log10 cycles)."""
    x = np.log(t)
    span = smoothing * LN10
    deriv = np.full_like(dp, np.nan, dtype=float)
    for i in range(len(t)):
        left = np.where(x[i] - x[:i] >= span)[0]
        right = np.where(x[i + 1:] - x[i] >= span)[0]
        j = left[-1] if len(left) else (i - 1 if i > 0 else None)
        k = i + 1 + right[0] if len(right) else (i + 1 if i + 1 < len(t) else None)
        if j is None or k is None:
            continue
        d1 = (dp[i] - dp[j]) / (x[i] - x[j])
        d2 = (dp[k] - dp[i]) / (x[k] - x[i])
        w1, w2 = x[i] - x[j], x[k] - x[i]
        deriv[i] = (d1 * w2 + d2 * w1) / (w1 + w2)
    return deriv


def window_log_slope(t: np.ndarray, deriv: np.ndarray, a: int, b: int) -> float:
    """Least-squares slope of log(Δp') vs log(Δte) over [a, b]: 0 for a true radial-flow plateau."""
    sel = np.arange(a, b + 1)
    sel = sel[np.isfinite(deriv[sel]) & (deriv[sel] > 0)]
    if len(sel) < 2:
        return float("nan")
    return float(np.polyfit(np.log10(t[sel]), np.log10(deriv[sel]), 1)[0])


def _is_plateau(t: np.ndarray, deriv: np.ndarray, a: int, b: int, tol: float,
                max_slope: float = IARF_MAX_LOG_SLOPE) -> tuple[bool, float]:
    window = deriv[a:b + 1]
    window = window[np.isfinite(window)]
    med = np.median(window)
    spread = float(np.max(np.abs(window - med)) / med)
    flat = spread <= tol and abs(window_log_slope(t, deriv, a, b)) < max_slope
    return flat, spread


def find_iarf_window(t: np.ndarray, deriv: np.ndarray, tol: float = IARF_FLATNESS_TOL,
                     max_slope: float = IARF_MAX_LOG_SLOPE) -> tuple[int, int, bool]:
    """Longest window (≥ IARF_MIN_CYCLES) flat within `tol` with |log-log slope| < `max_slope`.

    Returns (start, end, fallback); fallback=True means no plateau exists and the flattest
    half-cycle window is used instead."""
    idx = np.where(np.isfinite(deriv) & (deriv > 0) & (t >= EARLY_SKIP_HOURS))[0]
    if len(idx) < 3:
        raise PTAError("Not enough derivative points to identify radial flow")
    log_t = np.log10(t)
    best: tuple[float, float, int, int] | None = None
    for a_pos, a in enumerate(idx):
        for b in idx[a_pos + 2:]:
            length = log_t[b] - log_t[a]
            if length < IARF_MIN_CYCLES or (best is not None and length < best[0]):
                continue
            flat, spread = _is_plateau(t, deriv, a, b, tol, max_slope)
            if flat and (best is None or (length, -spread) > best[:2]):
                best = (length, -spread, a, b)
    if best is None:
        return (*_fallback_window(t, deriv, idx), True)
    return best[2], best[3], False


def _fallback_window(t: np.ndarray, deriv: np.ndarray, idx: np.ndarray) -> tuple[int, int]:
    """No plateau: the half-cycle window whose derivative is closest to flat (smallest |log-log slope|),
    searched only after the wellbore-storage hump (derivative maximum), where radial flow can occur."""
    log_t = np.log10(t)
    peak = idx[np.nanargmax(deriv[idx])]
    after_peak = idx[idx >= peak]
    idx = after_peak if len(after_peak) > 1 else idx
    best: tuple[float, int, int] | None = None
    for a in idx:
        ends = idx[log_t[idx] >= log_t[a] + FALLBACK_CYCLES]
        if len(ends) == 0:
            break
        slope = abs(window_log_slope(t, deriv, a, int(ends[0])))
        if np.isfinite(slope) and (best is None or slope < best[0]):
            best = (slope, int(a), int(ends[0]))
    if best is None:
        return int(idx[0]), int(idx[-1])
    return best[1], best[2]


def manual_window(dt: np.ndarray, start_h: float, end_h: float) -> tuple[int, int]:
    inside = np.where((dt >= start_h) & (dt <= end_h))[0]
    if len(inside) < MIN_MANUAL_POINTS:
        raise PTAError(f"Manual window {start_h:g}–{end_h:g} h holds fewer than {MIN_MANUAL_POINTS} points")
    return int(inside[0]), int(inside[-1])


def fit_line(x: np.ndarray, y: np.ndarray) -> tuple[float, float, float]:
    slope, intercept = np.polyfit(x, y, 1)
    pred = slope * x + intercept
    ss_res = float(np.sum((y - pred) ** 2))
    ss_tot = float(np.sum((y - y.mean()) ** 2))
    r2 = 1.0 - ss_res / ss_tot if ss_tot > 0 else 1.0
    return float(slope), float(intercept), r2


def late_time_trend(deriv: np.ndarray, iarf_end: int, iarf_level: float) -> str:
    tail = deriv[iarf_end + 1:]
    tail = tail[np.isfinite(tail)]
    if len(tail) < 3:
        return "radial flow until end of build-up"
    ratio = np.median(tail[-3:]) / iarf_level
    if ratio > 1 + IARF_FLATNESS_TOL:
        return "derivative rising after radial flow (sealing boundary / reduced mobility)"
    if ratio < 1 - IARF_FLATNESS_TOL:
        return TREND_FALLING
    return "radial flow until end of build-up"


def wellbore_storage(dt: np.ndarray, dp: np.ndarray, q: float, bo: float) -> float:
    """C = q·B·Δt / (24·Δp) from the earliest points (unit-slope approximation)."""
    early = (dt > 0) & (dp > 0)
    if not early.any():
        return float("nan")
    n = min(3, int(early.sum()))
    return float(np.median(q * bo * dt[early][:n] / (24.0 * dp[early][:n])))


@dataclass(frozen=True)
class PTADiagnostics:
    """Log-resampled curves used for plots; IARF bounds index into these arrays."""

    dt: np.ndarray
    dte: np.ndarray
    dp: np.ndarray
    derivative: np.ndarray
    iarf_slice: tuple[int, int]


@dataclass(frozen=True)
class SemilogFit:
    m: float
    p_star: float
    r2: float
    k: float
    p1hr: float
    skin: float


def semilog_fit(diag: PTADiagnostics, pwf: float, inputs: ReservoirInputs, a: int, b: int) -> SemilogFit:
    """Horner straight line on [a, b] and the resulting k, p1hr and skin (field units)."""
    tp = inputs.tp_hours
    pws = diag.dp + pwf
    slope, p_star, r2 = fit_line(np.log10(horner_time(diag.dt[a:b + 1], tp)), pws[a:b + 1])
    m = -slope
    if m <= 0:
        raise PTAError("Horner slope is not positive; pressure is not building up in the radial-flow window")
    q, bo, mu, h = inputs.q_oil_stbd, inputs.oil_fvf_rb_stb, inputs.oil_viscosity_cp, inputs.net_pay_ft
    phi, ct, rw = inputs.porosity_frac, inputs.total_compressibility_1_psi, inputs.wellbore_radius_ft
    k = 162.6 * q * bo * mu / (m * h)
    p1hr = p_star - m * np.log10(tp + 1.0)
    skin = 1.151 * ((p1hr - pwf) / m - np.log10(k / (phi * mu * ct * rw**2)) + 3.23)
    return SemilogFit(m=m, p_star=p_star, r2=r2, k=k, p1hr=p1hr, skin=skin)


def tolerance_sweep(diag: PTADiagnostics, pwf: float, inputs: ReservoirInputs) -> list[SemilogFit]:
    """Re-run window detection (flatness criterion only) and the Horner fit at each tolerance in
    TOLERANCE_SWEEP; the spread of k and skin shows how much the answer depends on the window."""
    fits = []
    for tol in TOLERANCE_SWEEP:
        a, b, _ = find_iarf_window(diag.dte, diag.derivative, tol, max_slope=np.inf)
        try:
            fits.append(semilog_fit(diag, pwf, inputs, a, b))
        except PTAError:
            continue
    return fits


def rate_quality(plateau: bool, main: SemilogFit, sweep: list[SemilogFit]) -> str:
    if not plateau:
        return QUALITY_NONE
    ks = [f.k for f in sweep] or [main.k]
    skins = [f.skin for f in sweep] or [main.skin]
    stable = (max(ks) - min(ks)) / main.k < GOOD_K_SPREAD and max(skins) - min(skins) < GOOD_SKIN_SPREAD
    return QUALITY_GOOD if stable else QUALITY_INDICATIVE


def _diagnostics(data: BuildupData, tp: float) -> PTADiagnostics:
    dt, dp = log_resample(data.dt_hours, data.pws_psia - data.pwf_psia)
    dte = agarwal_time(dt, tp)
    return PTADiagnostics(dt=dt, dte=dte, dp=dp, derivative=bourdet_derivative(dte, dp), iarf_slice=(0, 0))


def _select_window(diag: PTADiagnostics, window_hours: tuple[float, float] | None) -> tuple[int, int, bool, str]:
    if window_hours is None:
        a, b, fallback = find_iarf_window(diag.dte, diag.derivative)
        return a, b, fallback, "auto"
    a, b = manual_window(diag.dt, *window_hours)
    plateau, _ = _is_plateau(diag.dte, diag.derivative, a, b, IARF_FLATNESS_TOL)
    return a, b, not plateau, "manual"


def analyse_buildup(data: BuildupData, inputs: ReservoirInputs,
                    window_hours: tuple[float, float] | None = None) -> tuple[PTAResult, PTADiagnostics]:
    """Analyse one build-up. `window_hours` = (start, end) forces a manual radial-flow window."""
    inputs = inputs.validate()
    diag = _diagnostics(data, inputs.tp_hours)
    a, b, fallback, source = _select_window(diag, window_hours)
    diag = PTADiagnostics(diag.dt, diag.dte, diag.dp, diag.derivative, (a, b))
    fit = semilog_fit(diag, data.pwf_psia, inputs, a, b)
    sweep = tolerance_sweep(diag, data.pwf_psia, inputs) if source == "auto" else [fit]
    trend = late_time_trend(diag.derivative, b, float(np.nanmedian(diag.derivative[a:b + 1])))
    return _build_result(data, inputs, diag, fit, sweep, fallback, source, trend), diag


def _build_result(data: BuildupData, inputs: ReservoirInputs, diag: PTADiagnostics, fit: SemilogFit,
                  sweep: list[SemilogFit], fallback: bool, source: str, trend: str) -> PTAResult:
    a, b = diag.iarf_slice
    q, mu = inputs.q_oil_stbd, inputs.oil_viscosity_cp
    last_pws = float(data.pws_psia[-1])
    basis = "last_measured" if trend == TREND_FALLING else "p_star"
    p_ref = last_pws if basis == "last_measured" else fit.p_star
    drawdown = p_ref - data.pwf_psia
    dp_skin = 0.869 * fit.m * fit.skin
    iarf_end = float(diag.dt[b])
    ri = np.sqrt(fit.k * iarf_end / (948.0 * inputs.porosity_frac * mu * inputs.total_compressibility_1_psi))
    return PTAResult(
        horner_slope_psi_cycle=fit.m, permeability_md=fit.k, skin=fit.skin, delta_p_skin_psi=dp_skin,
        p_star_psia=fit.p_star, p1hr_psia=fit.p1hr, pwf_psia=data.pwf_psia, q_oil_stbd=q,
        tp_hours=inputs.tp_hours, iarf_start_hours=float(diag.dt[a]), iarf_end_hours=iarf_end,
        horner_fit_r2=fit.r2,
        flow_efficiency=(drawdown - dp_skin) / drawdown if drawdown > 0 else float("nan"),
        productivity_index_stbd_psi=q / drawdown if drawdown > 0 else float("nan"),
        radius_of_investigation_ft=float(ri),
        wellbore_storage_bbl_psi=wellbore_storage(data.dt_hours, data.pws_psia - data.pwf_psia, q,
                                                  inputs.oil_fvf_rb_stb),
        late_time_trend=trend, iarf_fallback=fallback,
        iarf_quality=rate_quality(not fallback, fit, sweep),
        derivative_log_slope=window_log_slope(diag.dte, diag.derivative, a, b),
        k_min_md=min(f.k for f in sweep), k_max_md=max(f.k for f in sweep),
        skin_min=min(f.skin for f in sweep), skin_max=max(f.skin for f in sweep),
        window_source=source, last_measured_pws_psia=last_pws, pressure_basis=basis,
    )


def interpret(result: PTAResult) -> list[str]:
    """Plain-language reading of the results; recommendations only for well-defined radial flow."""
    k_range = f"k {result.k_min_md:.0f}–{result.k_max_md:.0f} md, skin {result.skin_min:.1f} to {result.skin_max:.1f}"
    if result.iarf_quality != QUALITY_GOOD:
        reason = ("no flat derivative period" if result.iarf_quality == QUALITY_NONE
                  else "the result depends on the chosen radial-flow window")
        notes = [f"Indicative only: no stable radial flow ({reason}). Range across window choices: {k_range}."]
    else:
        notes = [_skin_note(result), _permeability_note(result.permeability_md)]
    basis = "last measured shut-in pressure" if result.pressure_basis == "last_measured" else "p* (semilog extrapolation)"
    notes.append(f"Flow efficiency {result.flow_efficiency:.0%} and PI {result.productivity_index_stbd_psi:.2f} "
                 f"STB/d/psi, referenced to the {basis}.")
    notes.append(f"Fitted window {result.iarf_start_hours:.2f}–{result.iarf_end_hours:.2f} h ({result.window_source}); "
                 f"derivative slope {result.derivative_log_slope:+.3f}; Horner R² = {result.horner_fit_r2:.4f}.")
    notes.append(f"Late-time behaviour: {result.late_time_trend}.")
    return notes


def _skin_note(result: PTAResult) -> str:
    if result.skin > 3:
        return (f"Skin {result.skin:.1f}: near-wellbore damage; stimulation candidate "
                f"({result.delta_p_skin_psi:.0f} psi lost across the damaged zone).")
    if result.skin < -1:
        return f"Skin {result.skin:.1f}: stimulated or fractured near-wellbore region."
    return f"Skin {result.skin:.1f}: near-wellbore region is close to undamaged."


def _permeability_note(k: float) -> str:
    if k >= 100:
        return f"Effective oil permeability {k:.0f} md: high-quality reservoir."
    if k >= 10:
        return f"Effective oil permeability {k:.1f} md: moderate reservoir quality."
    return f"Effective oil permeability {k:.2f} md: tight reservoir."
