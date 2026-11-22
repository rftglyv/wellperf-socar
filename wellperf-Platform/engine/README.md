# Intelligent Well Performance Analysis

SOCAR Hackathon 2026 — one application that goes from raw 1-minute field data to daily
oil/water/gas rates (**Virtual Flow Metering**) and on to reservoir properties from every
shut-in (**Pressure Transient Analysis**).

## What it is for

* **Rate allocation between periodic well tests.** Daily per-well rates where no multiphase
  meter exists, with P10–P90 bands from time-ordered validation.
* **Build-up QC and interpretation.** Effective oil permeability, skin and ΔP skin for every
  shut-in, with an explicit rating of whether radial flow was actually reached.
* **Not for lift-gas optimisation.** The lift-gas response is a shared correlation, not a
  calibrated gas-lift performance curve.

## Install and run

```bash
uv sync                          # Python 3.11 environment + dependencies
uv run streamlit run app.py      # interactive app at http://localhost:8501
uv run wellperf                  # batch: retrain, predict, PTA, write the 4 files to outputs/
uv run wellperf --no-train       # same, reusing artifacts/vfm_model.joblib
uv run pytest --cov=wellperf     # unit, integration, real-data acceptance and headless UI tests
```

The dataset files (`high_freq_data.csv`, `choke_events.csv`, `reservoir_pvt.csv`,
`well_completion.csv`, `well_tests.csv`) are read from the project folder and never
modified. The app also accepts uploaded files.

## Workflow (app pages)

1. **Field data:** sensor plots (min/max envelope, so spikes stay visible), the data-quality
   checks that fired, shut-ins (red) and gas-lift upsets (orange).
2. **Virtual flow metering:** model status, held-out and forward error per phase, % error vs
   time, per-well input sensitivities, daily rates with P10–P90 bands.
3. **Pressure transient analysis:** per shut-in, a radial-flow quality badge; k, skin, ΔP skin,
   p*, PI and flow efficiency; log-log, Horner, MDH and history plots; an optional manual
   override of the oil rate or the radial-flow window (recorded as `q_source` / `window_source`).
4. **Reports & export:** the four deliverables. The HTML reports embed plotly.js and work offline.

| File | Content |
|---|---|
| `outputs/vfm_daily_predictions.xlsx` | sheet `predictions`: `date, well_name, oil_rate_stbd, water_rate_stbd, gas_rate_mscfd`; details with P10/P90 and data status; held-out and forward validation; sensitivities; label corrections; gas-lift upsets; sensor QC |
| `outputs/pta_reservoir_properties.xlsx` | `event_id, well_name, shut_in_start, shut_in_end, horner_slope_psi_per_cycle, skin, permeability_md, delta_p_skin_psi`, then quality and provenance (`iarf_quality, k_min_md, k_max_md, skin_min, skin_max, window_source, q_source, k_from_q_low_md, k_from_q_high_md`) and details |
| `outputs/vfm_report.html`, `outputs/pta_report.html` | method, validation, all plots |

## Data preparation

**Sensor cleaning:** `-999.25` null codes, ~2,500 duplicate and ~7,000 out-of-order
timestamps, 2–3 minute spikes (rolling-median filter), out-of-range values and frozen sensors
(≥ 60 identical minutes). Gaps up to 36 h are reported, never silently filled.

**Events:**
* **Shut-ins:** 6, from the choke file (0 %), confirmed by the gas-lift-off and pressure-build-up
  signature.
* **Gas-lift upsets:** lift gas below 70 % of its trailing 24 h median for ≥ 30 min while
  producing. 14 Jun 2025 10:20–15:02 is a **field-wide** upset in all 10 wells. Upsets are
  data-quality flags (day status "gas-lift upset"), never shut-ins, and never go to PTA.

**Well-test repairs:** the file's own identities (liquid = oil + water, GOR = gas/oil,
total gas = formation gas + lift gas) expose 23 bad values:
* 5 sign errors, flipped only when an identity confirms the magnitude;
* GL-06 formation and total gas reported in Sm³/d instead of Mscf/d (÷ 28.317 reproduces the
  reported GOR).

Every repair is logged in the Excel output.

## VFM method

* **Features** are aggregated over producing minutes only, with identical code for test
  windows (training) and calendar days (prediction).
* **Liquid rate is sensor-driven.** It is a log-linear ridge regression fitted by bounded
  least squares (`scipy.optimize.lsq_linear`):
  * per well: an intercept, a slope on **well-centred** downhole flowing pressure, and a time
    trend (centring removes the collinearity with the intercept);
  * shared terms: downhole temperature, annulus pressure, log lift gas and log choke size.
  * Every per-well Pwf slope is constrained negative (≤ −1/5000 per psi, from
    d ln q/dPwf = −1/(Pr − Pwf)). The ridge penalty is chosen by leave-one-test-out CV.
* **Water cut** is a per-well time trend and **GOR** the per-well test mean, so daily water and
  gas follow test trends, not sensors.
* oil = liquid·(1−WC), water = liquid·WC, gas = oil·GOR. Daily rate = flowing rate × uptime.
* **Surface pressures are excluded on purpose.** During every test, flow is routed to the test
  separator: downstream WHP drops 12 % and WHP 4 %, while downhole pressure moves 0.3 %. A
  model using surface pressures scored well in CV but over-predicted normal days by ~9 %. The
  final model's test-day vs normal-day difference is +0.7 %.

### Accuracy (MAPE, 85 tests)

| Phase | Held-out VFM | Interpolation baseline | Forward VFM | Last-test-carried-forward baseline |
|---|---|---|---|---|
| Oil | **2.7 %** | 4.1 % | **3.7 %** | 6.0 % |
| Water | **3.5 %** | 4.7 % | **4.4 %** | 5.9 % |
| Gas | **5.8 %** | 7.7 % | **6.6 %** | 9.2 % |
| Liquid | **2.1 %** | 3.5 % | **3.1 %** | 4.7 % |

* **Held-out:** each test is predicted by a model fitted without it.
* **Forward (55 tests):** each test is predicted only from tests that started earlier, needing
  ≥ 3 earlier tests for the well. Its P10/P90 relative errors give the daily uncertainty bands
  (oil about −7 % / +6 %).

**Liquid response per +10 psi Pwf:** −0.2 % to −5.2 % depending on the well. GL-02, GL-03 and
GL-10 sit at the physical bound, so their Pwf response is weakly determined by the tests.

## PTA method

Single-phase oil build-up on the VFM-predicted oil rate, as the task requires:
* q = mean predicted flowing oil rate over the last 3 full days before shut-in;
* Np = cumulative oil at 1 Jan 2025 + predicted production to shut-in; tp = 24·Np/q.

Then:
1. Bourdet derivative on Agarwal equivalent time.
2. **Radial-flow (IARF) window:** the longest window of at least 0.5 log cycle where the
   derivative is flat (within 12 %) **and** its log-log slope satisfies |slope| < 0.1.
3. Horner line in that window gives m, p* and p1hr:
   * k = 162.6·q·B·μ/(m·h);
   * s = 1.151[(p1hr − pwf)/m − log(k/(φμc<sub>t</sub>r<sub>w</sub>²)) + 3.23];
   * ΔP<sub>skin</sub> = 0.869·m·s.
4. **Quality rating:**
   * Rerun at flatness tolerances 0.08–0.20.
   * **good:** plateau found, k varies < 10 % and skin < 0.5;
   * **indicative:** plateau found, but the result depends on the window;
   * **no_radial_flow:** no plateau; the flattest half-cycle after the storage hump is used.
   * A stimulation or damage recommendation is given only for **good**.
5. **PI and flow efficiency** use p* unless the late-time derivative falls (boundary or
   pressure support); then the last measured shut-in pressure is the reference.
6. k bounds from rate uncertainty: k ∝ q, so k × (1 ± forward oil MAPE).

| Event | m (psi/cycle) | ko (md) | skin | Quality | k range (md) | PI basis | PI (STB/d/psi) |
|---|---|---|---|---|---|---|---|
| GL-01 15 Apr | 23.2 | 109 | +5.7 | no radial flow | 109–111 | last measured | 3.77 |
| GL-02 8 Mar | 54.0 | 58 | −0.7 | good | 57–59 | p* | 2.56 |
| GL-04 3 Jun | 148.4 | 53 | −1.4 | good | 52–54 | p* | 0.59 |
| GL-06 22 Jul | 15.4 | 292 | +1.7 | good | 288–296 | p* | 3.69 |
| GL-08 19 Aug | 94.6 | 42 | −1.7 | good | 42–42 | p* | 1.78 |
| GL-10 27 May | 28.9 | 188 | +2.0 | no radial flow | 187–194 | last measured | 8.26 |

GL-01 and GL-10 have derivatives that fall steadily and never plateau. Their k and skin are
indicative only. GL-01's earlier "stimulation candidate" call is therefore withdrawn until a
longer or cleaner build-up confirms it.

## Limitations

* **k is the effective permeability to oil (ko).** The analysis treats each well as
  single-phase oil, although the wells produce water and gas.
* **p\* is a semilog extrapolation, not the average reservoir pressure.** With tp ≈ 10–25 years
  it lies above the measured late-time pressure when boundaries are felt.
* **The water/gas split comes from test trends.** Sudden changes in water cut or GOR between
  tests are not captured.
* **Not for lift-gas optimisation.**
* **Short build-ups:** GL-02 (5.7 h), GL-06 (8 h) and GL-10 (9 h) probe only a few hundred feet.

## Project layout

```
app.py                      Streamlit entry point
src/wellperf/
  config.py loaders.py      paths, thresholds, validated readers
  cleaning.py events.py     sensor QC, shut-ins, gas-lift upsets, choke history
  features.py               window/daily feature aggregation
  well_tests.py             label loading and identity-checked repair
  bounded_ridge.py vfm.py   constrained regression, VFM model, sensitivities
  validation.py             held-out CV, forward-chain CV, routing-bias check
  pta.py                    build-up engine with IARF quality rating
  pipeline.py cli.py        workflow, batch command
  plots.py exports.py reports.py   figures, Excel, offline HTML
  ui/                       one module per page + cached state
tests/                      unit, integration, real-data acceptance, headless UI
```

## 💨 Lift-gas optimiser (top of page 1)

A screening ranking of where extra lift gas gives the most oil, built from a measured event
rather than the VFM model:
* 📉 On 14 Jun, 10:20–15:02, lift gas dropped by about half in all 10 wells at once.
* 📏 Each well's bottom-hole pressure rise per 100 Mscf/d removed shows how much it relies on lift gas.
* ✖️ That rise × the well's oil PI (from its build-up, otherwise the field median, marked
  "estimated") gives the extra oil per +100 Mscf/d.

| Card | Well | Value |
|---|---|---|
| 🥇 Best place (measured) | GL-01 | +26 STB/d per +100 Mscf/d |
| 🔍 Check next | GL-03 | strongest response, about +82 STB/d if its PI matches the field median: needs a build-up test |
| ⬇️ Lowest value | GL-04 | +7 STB/d per +100 Mscf/d |
| 🔁 Move gas | GL-04 → GL-01 | 100 Mscf/d ≈ +19 STB/d oil, same total gas |

⚠️ This is linear around today's rates. Gas-lift curves flatten, so move gas in steps of
about 10 % and confirm with a well test. The ranking is also exported as the `lift_gas_ranking`
sheet.
