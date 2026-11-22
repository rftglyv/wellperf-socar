# WellPerf — equations and parameters (jury sheet)

All numbers below are read from the trained model file `model/vfm_model.pkl` and the engine code.

---

## 1. Data cleaning (per-minute sensors)

| Rule | Parameter |
|---|---|
| Null sentinel | −999.25 → missing |
| Spike | \|x − median₁₁min\| > max(0.25·\|median\|, floor) → missing |
| Spike floors | Pwf 100 psi · annulus 100 psi · WHP 50 psi · temp 10 °F · gas lift 150 Mscf/d |
| Physical bounds | Pwf 0–15 000 psia · temp 32–400 °F · annulus 0–5 000 psia · gas lift 0–10 000 Mscf/d |
| Frozen sensor | same non-zero value ≥ 60 min → missing |
| Shut-in | choke closed ≥ 60 min; gas lift "off" < 1 Mscf/d |
| Gaps | > 36 h left missing and reported, never filled |

Well-test labels are repaired with their own identities (liquid = oil + water, GOR = gas/oil):
negative rates → sign flipped; gas reported in Sm³/d (×28.3168 off) → converted to Mscf/d. 23 labels repaired, 85 tests kept.

---

## 2. Phase 1 — Virtual flow meter

### 2.1 Liquid rate (sensor-driven)

For well *w* at time *t*:

```
ln q_L = β₀ + α_w
       + β₁·ln(choke, 1/64")
       + β₂·ln(gas-lift rate, Mscf/d)
       + β₃·T_dh (°F)
       + β₄·P_ann (psia)
       + γ_w·(Pwf − P̄wf_w)
       + δ_w·(t − t̄_w)            t = days since 2025-01-01
```

Physics link: inflow q = J·(Pr − Pwf) ⇒ d ln q / dPwf = −1/(Pr − Pwf).
Constraint: **γ_w ≤ −1/5000 psi⁻¹** (rate must fall as Pwf rises; max drawdown 5000 psi).

### 2.2 Fitting

```
min ‖y − Xβ‖² + α·‖β_pen‖²     subject to  γ_w ≤ −0.0002
```
- y = ln(liquid rate) of the 85 well tests; X = sensor averages over each test window (flowing minutes only).
- Penalised columns are centred and standardised; well intercepts α_w are not penalised.
- Solver: bounded-variable least squares (scipy `lsq_linear`, method `bvls`), ridge rows √α·I appended.
- α chosen by leave-one-test-out CV over 13 values, 10⁻⁴ … 10²  → **α = 1.0**.
- 34 coefficients = 4 shared + 3 × 10 wells.

### 2.3 Fitted shared coefficients

| Term | Coefficient | Meaning |
|---|---|---|
| β₀ (intercept) | −0.3131 | |
| β₁ ln(choke) | +0.0843 | +10 % choke → +0.8 % liquid |
| β₂ ln(gas lift) | +0.0016 | weak, shared lift response |
| β₃ T_dh | +6.96·10⁻⁵ /°F | |
| β₄ P_ann | −3.58·10⁻⁵ /psi | |

### 2.4 Fitted per-well parameters

| Well | α_w | γ_w (1/psi) | δ_w (1/day) | P̄wf (psia) | WC slope a (1/day) | WC intercept b | GOR (scf/STB) |
|---|---|---|---|---|---|---|---|
| GL-01 | 7.4813 | −0.000552 | −0.001247 | 3226 | 0.0003 | 0.403 | 273.1 |
| GL-02 | 7.9012 | −0.000200 | −0.000322 | 2857 | 0.0003 | 0.501 | 302.1 |
| GL-03 | 7.0320 | −0.000200 | +0.000009 | 2533 | 0.0002 | 0.315 | 221.4 |
| GL-04 | 7.0386 | −0.000993 | −0.000317 | 2348 | 0.0001 | 0.294 | 245.1 |
| GL-05 | 7.0951 | −0.000427 | −0.000248 | 2886 | 0.0003 | 0.311 | 308.9 |
| GL-06 | 7.1286 | −0.005319 | −0.001605 | 2693 | 0.0002 | 0.379 | 208.7 |
| GL-07 | 8.7144 | −0.003080 | −0.000187 | 2736 | 0.0004 | 0.256 | 261.1 |
| GL-08 | 7.5397 | −0.000998 | −0.000197 | 2661 | 0.0003 | 0.169 | 332.4 |
| GL-09 | 7.4014 | −0.001246 | −0.000034 | 2650 | 0.0003 | 0.178 | 162.2 |
| GL-10 | 7.8571 | −0.000200 | −0.001299 | 3668 | 0.0002 | 0.216 | 227.8 |

γ_w = −0.000200 means the physics bound is active for that well.
δ_w < 0 = production decline (e.g. GL-06 −0.16 %/day).

### 2.5 Phases and daily rate

```
WC_w(t)   = a_w·t + b_w            (clipped 0 … 0.99)
q_oil     = q_L·(1 − WC)
q_water   = q_L·WC
q_gas     = q_oil·GOR_w / 1000      (Mscf/d)
daily     = flowing rate × uptime fraction   (0 on fully shut-in days)
P10 / P90 = daily × (1 + e₁₀) / (1 + e₉₀)
            oil −6.8 % / +6.1 % · water −8.6 % / +6.6 % · gas −12.3 % / +9.7 %
            (e = forward-validation relative-error quantiles)
```

Surface pressures (WHP, downstream WHP, choke ΔP) are excluded: during tests flow goes to the test separator and they drop 4–12 %, which gave a −9 % bias on normal days.

### 2.6 Accuracy

```
MAPE = (100/n)·Σ |q̂ − q| / q
```

| Validation | Oil | Water | Gas | Liquid | Oil R² | Oil RMSE (STB/d) |
|---|---|---|---|---|---|---|
| Leave-one-test-out, 85 tests | 2.65 % | 3.45 % | 5.79 % | 2.08 % | 0.999 | 38.8 |
| Baseline: test interpolation | 4.09 % | 4.67 % | 7.66 % | 3.49 % | 0.997 | 59.9 |
| Forward chain, 55 tests (past data only) | 3.72 % | 4.42 % | 6.60 % | 3.06 % | 0.997 | 59.1 |
| Baseline: last test carried forward | 6.00 % | 5.85 % | 9.23 % | 4.68 % | 0.993 | 92.9 |

---

## 3. Phase 2 — Pressure transient analysis (build-up, single-phase oil, field units)

### 3.1 Equations

```
Δp        = p_ws(Δt) − p_wf                      p_wf = last flowing pressure (≤ 10 min old)
t_p       = 24·N_p / q        (h)                N_p = cumulative oil, q = VFM oil rate before shut-in
Δt_e      = Δt·t_p / (t_p + Δt)                  Agarwal equivalent time
Horner    = (t_p + Δt) / Δt
Δp'       = dΔp / d ln Δt_e                      Bourdet derivative, L = 0.15 log cycle
p_ws      = p* − m·log₁₀[(t_p + Δt)/Δt]          straight line in the radial-flow window → m, p*, p1hr

k         = 162.6·q·B·μ / (m·h)                                     (md)
s         = 1.151·[(p1hr − p_wf)/m − log₁₀(k / (φ·μ·c_t·r_w²)) + 3.23]
ΔP_skin   = 0.869·m·s                                               (psi)
FE        = (p* − p_wf − ΔP_skin) / (p* − p_wf)
PI        = q / (p* − p_wf)                                         (STB/d/psi)
```

### 3.2 Algorithm parameters

| Parameter | Value |
|---|---|
| Log resampling | 20 points per log cycle (median) |
| Early-time skip (choke transient) | 0.05 h |
| Minimum build-up points | 30 |
| Radial-flow (IARF) window | longest ≥ 0.5 log cycle with derivative flat within 12 % of its median and \|log-log slope\| < 0.1 |
| Robustness sweep | flatness tolerance 0.08 / 0.10 / 0.12 / 0.15 / 0.20 |
| Quality "good" | k spread < 10 % and skin spread < 0.5 across the sweep |
| "indicative" | plateau found but not stable |
| "no_radial_flow" | no plateau; last 0.5 cycle used, result flagged |

### 3.3 Reservoir inputs per well (organiser files)

| Well | h (ft) | φ | c_t (1/psi) | r_w (ft) | B (rb/STB) | μ (cp) |
|---|---|---|---|---|---|---|
| GL-01 | 80 | 0.194 | 1.275e-5 | 0.328 | 1.160 | 1.054 |
| GL-02 | 82 | 0.173 | 1.561e-5 | 0.328 | 1.149 | 1.019 |
| GL-03 | 43 | 0.230 | 1.327e-5 | 0.328 | 1.121 | 1.713 |
| GL-04 | 32 | 0.161 | 1.174e-5 | 0.255 | 1.136 | 1.725 |
| GL-05 | 41 | 0.258 | 1.445e-5 | 0.255 | 1.166 | 1.058 |
| GL-06 | 68 | 0.221 | 1.373e-5 | 0.328 | 1.120 | 2.443 |
| GL-07 | 110 | 0.242 | 1.291e-5 | 0.354 | 1.138 | 1.367 |
| GL-08 | 65 | 0.243 | 1.162e-5 | 0.255 | 1.189 | 0.919 |
| GL-09 | 105 | 0.165 | 1.443e-5 | 0.328 | 1.092 | 3.008 |
| GL-10 | 136 | 0.222 | 1.078e-5 | 0.328 | 1.130 | 2.134 |

### 3.4 Worked example — GL-06, shut-in 22 Jul 2025

```
q = 688.2 STB/d (VFM, day before shut-in)   m = 15.43 psi/cycle   h = 68 ft   B = 1.120   μ = 2.443 cp
k        = 162.6 × 688.2 × 1.120 × 2.443 / (15.43 × 68) = 291.7 md
ΔP_skin  = 0.869 × 15.43 × 1.74                          = 23.3 psi
s        = 1.74      quality: good
```
