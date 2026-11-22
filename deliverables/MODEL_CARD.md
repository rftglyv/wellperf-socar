# WellPerf — models and methods

## Phase 1 — Virtual flow meter (VFM)

| Item | Value |
|---|---|
| Model | Physics-constrained **log-linear bounded ridge regression** (own implementation, `engine/src/wellperf/bounded_ridge.py`) |
| File | `deliverables/model/vfm_model.pkl` (same object as `engine/artifacts/vfm_model.joblib`) |
| Target | ln(liquid rate, STB/d); oil = liquid·(1 − water cut), water = liquid·WC, gas = oil·GOR/1000 |
| Training labels | 85 well tests (10 wells, Jan–Sep 2025), 23 test labels repaired first |
| Inputs (per-minute sensors, averaged over each test window) | downhole pressure (Pwf), downhole temperature, annulus pressure, log gas-lift rate, log choke size |
| Not used | surface pressures (WHP, downstream WHP, choke ΔP): they drop 4–12 % while flow goes to the test separator, which biased the model by −9 % |
| Coefficients | 34 = 4 shared + 3 per well × 10 (intercept, Pwf slope, time/depletion trend) |
| Physics constraint | every per-well Pwf slope ≤ −1/5000 per psi (rate must fall when Pwf rises, inflow relation q ≈ J·(Pr − Pwf)) |
| Regularisation | ridge α chosen by leave-one-test-out CV from 13 values (1e-4 … 1e2); selected α = 1.0 |
| Water cut / GOR | per-well linear time trend of water cut; per-well mean GOR from tests |
| Daily rate | flowing rate × uptime fraction (0 on fully shut-in days) |
| Uncertainty | P10/P90 band from forward-validation errors (oil −6.8 % / +6.1 %) |

### Accuracy

| Validation | Oil MAPE | Water MAPE | Gas MAPE | Oil R² | Baseline oil MAPE |
|---|---|---|---|---|---|
| Leave-one-test-out (85 tests) | **2.65 %** | 3.45 % | 5.79 % | 0.999 | 4.09 % (test interpolation) |
| Forward chain (55 tests, past-only training) | **3.72 %** | 4.42 % | 6.60 % | 0.997 | 6.00 % (last test carried forward) |

## Data cleaning (before training and prediction)
- −999.25 sentinels → missing
- duplicate and out-of-order rows → removed / sorted
- 2–3 minute spikes → rolling-median filter (11-minute window)
- values outside physical bounds → missing
- frozen sensors (same value ≥ 60 min) → missing
- gaps longer than 36 h → left missing and reported, never filled

## Phase 2 — Pressure transient analysis (PTA)
- Shut-ins detected automatically (≥ 60 min, choke closed / gas lift off); 6 build-ups found Jan–Sep 2025.
- Rate before shut-in = VFM-predicted oil rate.
- Agarwal equivalent time → Bourdet derivative on the log-log plot.
- Radial flow (IARF) = longest window ≥ 0.5 log cycle where the derivative is flat within 12 % and log-slope < 0.1.
- Horner straight line on that window → slope m.
- k = 162.6·q·B·μ / (m·h); s = 1.151·[(p1hr − pwf)/m − log(k/(φμc_t r_w²)) + 3.23]; ΔP_skin = 0.869·m·s.
- PVT and completion values from `reservoir_pvt.csv` and `well_completion.csv`.
- Example: GL-06, 22 Jul 2025: k = 291.7 md, skin = 1.74, ΔP_skin = 23.3 psi. GL-01 and GL-10: no radial flow (flagged indicative).

## Software
- Python 3.11: numpy, pandas, scipy (bounded least squares), joblib, FastAPI.
- No neural networks or LLMs are used for predictions.
- The optional "Ask AI" panel (Gemini 2.5 Flash via OpenRouter) only explains results already computed.
