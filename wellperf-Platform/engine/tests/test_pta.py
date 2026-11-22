"""PTA must recover known k and skin from an analytically generated build-up."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from wellperf import config, pta

K_TRUE, SKIN_TRUE = 80.0, 3.0
INPUTS = pta.ReservoirInputs(
    q_oil_stbd=1200.0,
    cum_oil_stb=2.0e5,
    oil_fvf_rb_stb=1.15,
    oil_viscosity_cp=1.2,
    net_pay_ft=60.0,
    porosity_frac=0.2,
    total_compressibility_1_psi=1.3e-5,
    wellbore_radius_ft=0.33,
)
P_INITIAL = 4000.0


def synthetic_buildup(k: float = K_TRUE, skin: float = SKIN_TRUE, hours: float = 48.0) -> pta.BuildupData:
    """Infinite-acting radial flow (semilog approximation) with skin, no wellbore storage."""
    i = INPUTS
    m = 162.6 * i.q_oil_stbd * i.oil_fvf_rb_stb * i.oil_viscosity_cp / (k * i.net_pay_ft)
    tp = i.tp_hours
    log_term = np.log10(k / (i.porosity_frac * i.oil_viscosity_cp * i.total_compressibility_1_psi * i.wellbore_radius_ft**2))
    pwf = P_INITIAL - m * (np.log10(tp) + log_term - 3.23 + 0.869 * skin)
    dt = np.arange(1, int(hours * 60) + 1) / 60.0
    pws = P_INITIAL - m * np.log10((tp + dt) / dt)
    return pta.BuildupData(dt_hours=dt, pws_psia=pws, pwf_psia=pwf, shut_in_time=pd.Timestamp("2025-03-01"))


def test_recovers_permeability_and_skin():
    result, _ = pta.analyse_buildup(synthetic_buildup(), INPUTS)
    assert result.permeability_md == pytest.approx(K_TRUE, rel=0.02)
    assert result.skin == pytest.approx(SKIN_TRUE, abs=0.15)
    assert result.p_star_psia == pytest.approx(P_INITIAL, abs=2.0)
    assert result.delta_p_skin_psi == pytest.approx(0.869 * result.horner_slope_psi_cycle * result.skin)


def test_negative_skin_recovered():
    result, _ = pta.analyse_buildup(synthetic_buildup(k=25.0, skin=-2.0), INPUTS)
    assert result.permeability_md == pytest.approx(25.0, rel=0.02)
    assert result.skin == pytest.approx(-2.0, abs=0.15)


def test_derivative_is_flat_in_radial_flow():
    _, diag = pta.analyse_buildup(synthetic_buildup(), INPUTS)
    lo, hi = diag.iarf_slice
    window = diag.derivative[lo:hi + 1]
    assert np.nanmax(np.abs(window / np.nanmedian(window) - 1)) < pta.IARF_FLATNESS_TOL


def test_invalid_inputs_rejected():
    bad = pta.ReservoirInputs(**{**INPUTS.__dict__, "q_oil_stbd": 0.0})
    with pytest.raises(pta.PTAError):
        pta.analyse_buildup(synthetic_buildup(), bad)


def test_extract_buildup_from_minute_data():
    times = pd.date_range("2025-03-01", periods=600, freq="min")
    pressure = np.r_[np.full(100, 2500.0), 2500 + 50 * np.log1p(np.arange(500))]
    minute = pd.DataFrame({config.TIME_COL: times, "dh_pressure_psia": pressure})
    data = pta.extract_buildup(minute, times[99], times[-1] + pd.Timedelta(minutes=1))
    assert data.pwf_psia == 2500.0
    assert data.dt_hours[0] == pytest.approx(1 / 60)
    assert len(data.dt_hours) == 500


def test_too_short_buildup_rejected():
    times = pd.date_range("2025-03-01", periods=20, freq="min")
    minute = pd.DataFrame({config.TIME_COL: times, "dh_pressure_psia": np.linspace(2500, 2600, 20)})
    with pytest.raises(pta.PTAError):
        pta.extract_buildup(minute, times[5], None)


def test_stale_flowing_pressure_rejected():
    times = pd.date_range("2025-03-01", periods=600, freq="min")
    pressure = np.r_[np.full(100, 2500.0), 2500 + 50 * np.log1p(np.arange(500))]
    pressure[60:100] = np.nan  # last 40 flowing minutes missing
    minute = pd.DataFrame({config.TIME_COL: times, "dh_pressure_psia": pressure})
    with pytest.raises(pta.PTAError, match="pwf is unreliable"):
        pta.extract_buildup(minute, times[99], None)


def test_radial_flow_found_flag_and_fallback_warning():
    result, _ = pta.analyse_buildup(synthetic_buildup(), INPUTS)
    assert result.iarf_fallback is False
    # A build-up that keeps steepening has no flat derivative: must be flagged.
    data = synthetic_buildup()
    curved = pta.BuildupData(data.dt_hours, data.pwf_psia + 5 * data.dt_hours**1.5, data.pwf_psia, data.shut_in_time)
    flagged, _ = pta.analyse_buildup(curved, INPUTS)
    assert flagged.iarf_fallback is True
    assert flagged.iarf_quality == pta.QUALITY_NONE
    assert pta.interpret(flagged)[0].startswith("Indicative only")


def falling_derivative_buildup(hours: float = 48.0) -> pta.BuildupData:
    """Derivative ∝ t^-0.3 everywhere (constant-pressure-boundary-like shape): never a plateau."""
    dt = np.arange(1, int(hours * 60) + 1) / 60.0
    pws = 3000.0 + 400.0 * (1 - (dt / 0.005) ** -0.3)
    return pta.BuildupData(dt_hours=dt, pws_psia=pws, pwf_psia=3000.0, shut_in_time=pd.Timestamp("2025-03-01"))


def test_semilog_radial_flow_is_good_quality():
    result, _ = pta.analyse_buildup(synthetic_buildup(), INPUTS)
    assert result.iarf_quality == "good"
    assert result.window_source == "auto"
    assert result.k_min_md <= result.permeability_md <= result.k_max_md
    assert (result.k_max_md - result.k_min_md) / result.permeability_md < 0.10
    assert abs(result.derivative_log_slope) < pta.IARF_MAX_LOG_SLOPE


def test_steadily_falling_derivative_is_not_good():
    result, _ = pta.analyse_buildup(falling_derivative_buildup(), INPUTS)
    assert result.iarf_quality != "good"
    assert any("Indicative only" in note for note in pta.interpret(result))
    assert not any("stimulation candidate" in note for note in pta.interpret(result))


def test_manual_window_override():
    result, diag = pta.analyse_buildup(synthetic_buildup(), INPUTS, window_hours=(2.0, 20.0))
    assert result.window_source == "manual"
    assert 2.0 <= result.iarf_start_hours < result.iarf_end_hours <= 20.0
    assert result.permeability_md == pytest.approx(K_TRUE, rel=0.02)


def test_manual_window_too_narrow_rejected():
    with pytest.raises(pta.PTAError):
        pta.analyse_buildup(synthetic_buildup(), INPUTS, window_hours=(5.0, 5.1))


def test_pressure_basis_follows_late_time_trend():
    infinite, _ = pta.analyse_buildup(synthetic_buildup(), INPUTS)
    assert infinite.pressure_basis == "p_star"
    assert infinite.last_measured_pws_psia == pytest.approx(synthetic_buildup().pws_psia[-1])
