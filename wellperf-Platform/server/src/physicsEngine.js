/**
 * Real-time Physics-Constrained VFM & PTA Engine in Node.js
 * Implements the exact BoundedRidge VFM and Horner Semilog PTA equations
 * from `src/wellperf/vfm.py` and `src/wellperf/pta.py` for instant interactive simulation,
 * plus live Python subprocess execution for full retraining.
 */

const EPOCH_MS = new Date("2025-01-01T00:00:00Z").getTime();
const DAY_MS = 86400 * 1000;
const LOG_FLOOR = 1.0;

/**
 * Predict flowing oil, water, gas, liquid rates using the trained BoundedRidge VFM model
 */
function simulateVFM(vfmModel, params) {
  const {
    well_name,
    dh_pressure_psia,
    dh_temperature_degf,
    annulus_pressure_psia,
    gas_lift_rate_mscfd,
    choke_size_64ths,
    date_str = "2025-09-15",
    uptime_frac = 1.0,
  } = params;

  if (!vfmModel || !vfmModel.wells.includes(well_name)) {
    throw new Error(`Unknown well: ${well_name}`);
  }

  const t_days = (new Date(date_str).getTime() - EPOCH_MS) / DAY_MS;
  const center = vfmModel.centers[well_name];

  const featureMap = {
    log_choke_size_64ths: Math.log(Math.max(LOG_FLOOR, Number(choke_size_64ths))),
    log_gas_lift_rate_mscfd: Math.log(Math.max(LOG_FLOOR, Number(gas_lift_rate_mscfd))),
    dh_temperature_degf: Number(dh_temperature_degf),
    annulus_pressure_psia: Number(annulus_pressure_psia),
  };

  for (const w of vfmModel.wells) {
    const isWell = w === well_name ? 1.0 : 0.0;
    featureMap[`well_${w}`] = isWell;
    featureMap[`pwf_c_x_${w}`] = isWell * (Number(dh_pressure_psia) - center.dh_pressure_psia);
    featureMap[`t_c_x_${w}`] = isWell * (t_days - center.t_days);
  }

  let logLiquid = vfmModel.intercept;
  vfmModel.design_columns.forEach((col, idx) => {
    logLiquid += (featureMap[col] || 0) * vfmModel.coef[idx];
  });

  const flowing_liquid = Math.exp(logLiquid);
  const [wc_slope, wc_intercept] = vfmModel.wc_trend[well_name];
  const water_cut_frac = Math.min(0.99, Math.max(0.0, wc_intercept + wc_slope * t_days));
  const gor_scf_stb = vfmModel.gor_mean[well_name];

  const flowing_oil = flowing_liquid * (1 - water_cut_frac);
  const flowing_water = flowing_liquid * water_cut_frac;
  const flowing_gas = (flowing_oil * gor_scf_stb) / 1000.0;

  const up = Math.min(1.0, Math.max(0.0, Number(uptime_frac)));

  // Also generate an IPR curve (Pwf from 1800 to 3800 psia) for this well at current settings
  const ipr_curve = [];
  for (let pwf = 1800; pwf <= 3800; pwf += 100) {
    let ll = vfmModel.intercept;
    vfmModel.design_columns.forEach((col, idx) => {
      let val = featureMap[col] || 0;
      if (col === `pwf_c_x_${well_name}`) {
        val = pwf - center.dh_pressure_psia;
      }
      ll += val * vfmModel.coef[idx];
    });
    const liq = Math.exp(ll);
    ipr_curve.push({
      pwf_psia: pwf,
      liquid_rate_stbd: Number(liq.toFixed(1)),
      oil_rate_stbd: Number((liq * (1 - water_cut_frac)).toFixed(1)),
      water_rate_stbd: Number((liq * water_cut_frac).toFixed(1)),
    });
  }

  return {
    well_name,
    date: date_str,
    uptime_frac: up,
    flowing_liquid_rate_stbd: Number(flowing_liquid.toFixed(1)),
    flowing_oil_rate_stbd: Number(flowing_oil.toFixed(1)),
    flowing_water_rate_stbd: Number(flowing_water.toFixed(1)),
    flowing_gas_rate_mscfd: Number(flowing_gas.toFixed(1)),
    oil_rate_stbd: Number((flowing_oil * up).toFixed(1)),
    water_rate_stbd: Number((flowing_water * up).toFixed(1)),
    gas_rate_mscfd: Number((flowing_gas * up).toFixed(1)),
    water_cut_pct: Number((water_cut_frac * 100).toFixed(2)),
    gor_scf_stb: Number(gor_scf_stb.toFixed(1)),
    ipr_curve,
  };
}

/**
 * Recalculate PTA Horner straight line, permeability k, skin s, delta_p_skin, p*, PI, FE
 * when a Reservoir Engineer overrides q_oil_stbd and/or radial-flow window [start_h, end_h].
 */
function recalculatePTA(ptaEvent, overrideParams) {
  const baseInputs = ptaEvent.inputs;
  const baseProps = ptaEvent.properties;
  const curves = ptaEvent.curves;

  const q_oil_stbd =
    overrideParams.q_oil_stbd != null && overrideParams.q_oil_stbd > 0
      ? Number(overrideParams.q_oil_stbd)
      : Number(baseInputs.q_oil_stbd);

  const start_h =
    overrideParams.window_start_hours != null
      ? Number(overrideParams.window_start_hours)
      : Number(baseProps.iarf_start_hours);
  const end_h =
    overrideParams.window_end_hours != null
      ? Number(overrideParams.window_end_hours)
      : Number(baseProps.iarf_end_hours);

  const tp_hours = (24.0 * Number(baseInputs.cum_oil_stb)) / q_oil_stbd;
  const pwf = Number(curves.pwf_psia);

  // Filter diagnostic points inside [start_h, end_h]
  const pts = curves.points.filter((p) => p.dt_hours >= start_h - 1e-4 && p.dt_hours <= end_h + 1e-4);
  if (pts.length < 3) {
    throw new Error(`Selected window [${start_h.toFixed(2)}h – ${end_h.toFixed(2)}h] contains fewer than 3 points.`);
  }

  // Linear regression of pws vs log10((tp + dt)/dt)
  const xs = pts.map((p) => Math.log10((tp_hours + p.dt_hours) / p.dt_hours));
  const ys = pts.map((p) => p.pws_psia);
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  const slope = den > 0 ? num / den : -baseProps.horner_slope_psi_per_cycle;
  const p_star = meanY - slope * meanX;
  const m = -slope;

  if (m <= 0) {
    throw new Error("Horner slope m is not positive in the chosen radial-flow window.");
  }

  // R2
  let ss_res = 0;
  let ss_tot = 0;
  for (let i = 0; i < n; i++) {
    const pred = slope * xs[i] + p_star;
    ss_res += (ys[i] - pred) ** 2;
    ss_tot += (ys[i] - meanY) ** 2;
  }
  const r2 = ss_tot > 0 ? 1 - ss_res / ss_tot : 1.0;

  // Derivative log-log slope across window
  const validDeriv = pts.filter((p) => p.derivative_psi != null && p.derivative_psi > 0 && p.dte_hours > 0);
  let deriv_slope = 0;
  if (validDeriv.length >= 2) {
    const ltx = validDeriv.map((p) => Math.log10(p.dte_hours));
    const lty = validDeriv.map((p) => Math.log10(p.derivative_psi));
    const mx = ltx.reduce((a, b) => a + b, 0) / ltx.length;
    const my = lty.reduce((a, b) => a + b, 0) / lty.length;
    let dnum = 0,
      dden = 0;
    for (let i = 0; i < ltx.length; i++) {
      dnum += (ltx[i] - mx) * (lty[i] - my);
      dden += (ltx[i] - mx) ** 2;
    }
    deriv_slope = dden > 0 ? dnum / dden : 0;
  }

  const bo = Number(baseInputs.oil_fvf_rb_stb);
  const mu = Number(baseInputs.oil_viscosity_cp);
  const h = Number(baseInputs.net_pay_ft);
  const phi = Number(baseInputs.porosity_frac);
  const ct = Number(baseInputs.total_compressibility_1_psi);
  const rw = Number(baseInputs.wellbore_radius_ft);

  const k = (162.6 * q_oil_stbd * bo * mu) / (m * h);
  const p1hr = p_star - m * Math.log10(tp_hours + 1.0);
  const skin = 1.151 * ((p1hr - pwf) / m - Math.log10(k / (phi * mu * ct * rw * rw)) + 3.23);
  const dp_skin = 0.869 * m * skin;

  const last_pws = Number(baseProps.last_measured_pws_psia);
  const basis = baseProps.pressure_basis;
  const p_ref = basis === "last_measured" ? last_pws : p_star;
  const drawdown = p_ref - pwf;
  const flow_efficiency = drawdown > 0 ? (drawdown - dp_skin) / drawdown : null;
  const pi = drawdown > 0 ? q_oil_stbd / drawdown : null;
  const iarf_end = pts[pts.length - 1].dt_hours;
  const iarf_start = pts[0].dt_hours;
  const ri = Math.sqrt((k * iarf_end) / (948.0 * phi * mu * ct));

  const q_source = Math.abs(q_oil_stbd - Number(baseInputs.q_oil_stbd)) > 0.05 ? "override" : "vfm";
  const window_source =
    Math.abs(iarf_start - Number(baseProps.iarf_start_hours)) > 0.01 ||
    Math.abs(iarf_end - Number(baseProps.iarf_end_hours)) > 0.01
      ? "manual"
      : "auto";

  return {
    ...baseProps,
    horner_slope_psi_per_cycle: Number(m.toFixed(4)),
    permeability_md: Number(k.toFixed(4)),
    skin: Number(skin.toFixed(4)),
    delta_p_skin_psi: Number(dp_skin.toFixed(4)),
    p_star_semilog_extrapolation_psia: Number(p_star.toFixed(2)),
    p1hr_psia: Number(p1hr.toFixed(2)),
    q_oil_before_shut_in_stbd: Number(q_oil_stbd.toFixed(2)),
    horner_producing_time_hours: Number(tp_hours.toFixed(2)),
    flow_efficiency: flow_efficiency != null ? Number(flow_efficiency.toFixed(4)) : null,
    productivity_index_stbd_psi: pi != null ? Number(pi.toFixed(4)) : null,
    radius_of_investigation_ft: Number(ri.toFixed(1)),
    iarf_start_hours: Number(iarf_start.toFixed(4)),
    iarf_end_hours: Number(iarf_end.toFixed(4)),
    horner_fit_r2: Number(r2.toFixed(5)),
    derivative_log_slope: Number(deriv_slope.toFixed(4)),
    q_source,
    window_source,
  };
}

module.exports = {
  simulateVFM,
  recalculatePTA,
};
