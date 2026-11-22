# WellPerf — SOCAR Hackathon 2026 (team Enthuzone)

Virtual flow metering (VFM) and pressure transient analysis (PTA) for 10 offshore gas-lifted wells (GL-01…GL-10).

## Deliverables (`deliverables/`)

| # | Requirement | File |
|---|---|---|
| 1 | Phase 1 (VFM) and Phase 2 (PTA) results, CSV/Excel | `vfm_daily_predictions.csv`, `pta_submission.csv`, `pta_submission.xlsx`, `pta_reservoir_properties.csv` |
| 2 | Trained model, `.pkl` | `model/vfm_model.pkl` |
| 3 | Notebook, all cells run, outputs shown | `notebook/WellPerf_results.ipynb` |
| 4 | PTA plots (log-log + Bourdet derivative, Horner, MDH) | `pta_plots/*.png` (one per shut-in) |
| – | Presentation | `WellPerf_Pitch_Deck.pptx` |

## Application (`wellperf-Platform/`)

Engineers upload raw well data and get results in 7 steps: Data → Clean & QC → Model → VFM → PTA → 3D field twin → Export (Excel, portal CSV, HTML reports, ZIP). UI in AZ / EN / RU, light and dark.

### Run

```bash
# 1. engine (Python 3.11+, uv)
cd wellperf-Platform/engine
uv sync
uv run uvicorn api_server:app --host 127.0.0.1 --port 8000

# 2. web app
cd wellperf-Platform/client
npm install
npm run dev        # http://localhost:3000
```

Optional: set `GEMINI_API_KEY` in `wellperf-Platform/engine/.env` to enable the "Ask AI" panel.

### Results
- VFM oil MAPE: 2.65 % held-out, 3.72 % forward (55 tests; last-test baseline 6.0 %).
- PTA: 6 shut-ins; 4 rated good, GL-01 and GL-10 show no radial flow.
