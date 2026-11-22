# 🛢️ WellPerf Enterprise Platform — SOCAR Hackathon 2026

**Intelligent Well Performance Analysis:** Physics-Constrained Virtual Flow Metering (**VFM**) + Automated Pressure Transient Analysis (**PTA**) + **Three.js 3D Subsurface Digital Twin** + **MongoDB Atlas RBAC** + **Lift-Gas Allocation Optimiser**.

---

## 🏗️ Folder Architecture (`wellperf-Platform/`)

- **`client/`** — **Next.js 14 (App Router, TypeScript)** + **Tailwind CSS** + **shadcn/ui primitives** + **Three.js WebGL 3D Caspian Offshore Field Digital Twin** + **Recharts** interactive diagnostics.
- **`server/`** — **Express.js** + **MongoDB Atlas (`mongoose`)** + **JWT Role-Based Access Control (RBAC)** + **Real-time Physics Engine (BoundedRidge VFM & Horner Semilog PTA)** + **Live Python Scientific Engine Bridge**.
- **`seed_data.json`** — Complete pre-extracted dataset from the 3.93M 1-minute sensor rows, 85 repaired well tests, 2,730 daily predictions, 6 shut-in build-up curves, and 14 June natural experiment ranking.

---

## ⚡ Test-day workflow (main dashboard at `http://localhost:3000`)

The test data (the next 3 months of high-frequency data) is uploaded in the UI and goes through
**the same cleaning steps as training**, then the trained VFM model and the PTA engine.

```bash
# 1. Python engine (FastAPI, port 8000) — needs: pip install fastapi uvicorn python-multipart plotly
cd engine
python -m uvicorn api_server:app --port 8000

# 2. Next.js client (port 3000)
cd client && npm run dev
```

**Always-on:** double-click `start-wellperf.bat`. It opens two watchdog windows (engine :8000, dashboard :3000) that restart a crashed server within seconds; uploaded parts live in `engine/uploads/` and are restored — with all stages re-run — after any restart.

**Test-day data (organisers: well test + high-frequency + choke for the next 3 months).**
Keep the three files anywhere (e.g. `socarHACKHATON/TEST_DATA/`) and drop them into step 01 of the
dashboard; nothing has to be copied into the project. PVT and completion are unchanged and already
live in `engine/` (`reservoir_pvt.csv`, `well_completion.csv`). With the well-test file uploaded the VFM
is **recalibrated** on training + new tests (toggle in step 04): rehearsal on Jul–Sep 2025 cut oil MAPE
on the new tests from 4.9 % to 3.3 %. Reported accuracy stays honest — the original model's error on
the uploaded tests plus a leave-one-test-out score for the refitted model.

Steps in the dashboard: **01 Data → 02 Clean & QC → 03 VFM → 04 PTA → 05 Export**.

- Drop files in any order (CSV / XLSX / Parquet / ZIP); the type is detected from the columns.
  Sensor and choke files are **appended**, so the test period can arrive part by part — re-run after each part.
- "Training history as context" (on by default) prepends the last 3 days of training data before cleaning
  (rolling filters, choke state, 24 h gas-lift baseline) and uses the Jan–Sep predictions for cumulative oil
  (Horner tp). Outputs are limited to the uploaded dates.
- Without a choke file, shut-ins are still found from the sensor signature (gas lift off + pressure build-up).
- If well tests for the new period are uploaded, VFM error vs those tests is shown.
- Exports: `vfm_predictions.xlsx` (sheet `predictions`: date, well_name, oil_rate_stbd, water_rate_stbd,
  gas_rate_mscfd), `vfm_portal.csv`, `pta_results.xlsx` (Horner slope, skin, k md, ΔP skin psi),
  `pta_portal.csv`, two offline HTML reports, or everything as one ZIP.
- "Rehearse" buttons push a training month as a new part to practise the flow.

Verified: uploading Jul–Sep 2025 raw CSV in two parts reproduces the submitted VFM file exactly (920/920 rows)
and the GL-06 / GL-08 PTA results; a full run takes ~10 s.

The previous enterprise dashboard (MongoDB / RBAC / 3D twin) is still available at `/legacy`.

## 🔐 Role-Based Access Control (RBAC) Personas

All 5 enterprise personas are seeded into **MongoDB Atlas** (Password for all demo accounts: `Password123!`, or use 1-Click Persona Login / Top-Bar Role Switcher):

| Role | Email | Permissions | Capabilities |
|---|---|---|---|
| **👑 ADMIN** | `admin@socar.az` | All permissions (`rbac:manage`, `vfm:retrain`, `pta:override`, `gaslift:allocate`, etc.) | Full control over VFM retraining, PTA overrides, Lift-Gas allocation, and RBAC user management |
| **🔬 RESERVOIR_ENGINEER** | `reservoir@socar.az` | `field:read`, `vfm:read`, `vfm:simulate`, `pta:read`, `pta:override`, `gaslift:read`, `export:all` | Override PTA oil rate ($q_o$) and radial-flow (IARF) windows `[start_h, end_h]` with live Horner recalculation |
| **💨 PRODUCTION_ENGINEER** | `production@socar.az` | `field:read`, `vfm:read`, `vfm:simulate`, `pta:read`, `gaslift:read`, `gaslift:allocate`, `export:all` | Execute Lift-Gas reallocation trials (`GL-04 → GL-01`) and VFM choke/pressure inflow simulations |
| **🧠 DATA_SCIENTIST** | `datascience@socar.az` | `field:read`, `vfm:read`, `vfm:simulate`, `vfm:retrain`, `pta:read`, `gaslift:read`, `export:all` | Trigger live Python BoundedRidge VFM retraining & inspect LOTO / Forward CV metrics |
| **📡 FIELD_OPERATOR** | `operator@socar.az` | `field:read`, `vfm:read`, `pta:read`, `gaslift:read` | Read-only 3D Digital Twin surveillance, sensor envelopes, and shut-in / upset alerts |

---

## 🚀 Quick Start

### 1. Start the Express + MongoDB Atlas Server (`http://localhost:5000`)
```bash
cd server
cp .env.example .env   # Configure MONGODB_URI
npm install
npm run seed           # Seeds MongoDB Atlas with 5 RBAC roles, 10 wells, 2,730 predictions & 6 PTA build-ups
npm start
```

### 2. Start the Next.js 14 + Three.js Client (`http://localhost:3000`)
```bash
cd client
npm install
npm run dev
```

---

## 📊 Core Engineering Highlights

1. **VFM Accuracy & Separator Routing Trap Solved:**
   - Excludes surface wellhead pressures (`whp_psia`, `whp_downstream_psia`) which drop 4–12% during test-separator routing, reducing test-day bias from **−9.0% to +0.7%**.
   - **2.65% Held-Out Oil MAPE** (85 tests) and **3.72% Forward Oil MAPE** (55 tests, ~38% lower error than carrying the last test forward).
2. **Automated PTA with IARF Quality Sweep:**
   - Evaluates Bourdet derivative flatness across tolerances `0.08–0.20`: **🟢 good** radial flow on `GL-02`, `GL-04`, `GL-06` (**Skin +1.74 → stimulation candidate**), `GL-08`; flags `GL-01` and `GL-10` as **🔴 indicative (no radial flow)**.
3. **Zero-CAPEX Lift-Gas Optimiser (+$485k/yr):**
   - Uses the **14 June 2025 (10:20–15:02)** field-wide 50% lift-gas cut natural experiment ($\Delta P_{wf} \times \text{PI}$) to recommend shifting **100 Mscf/d from `GL-04` to `GL-01`** for **+19 STB/d extra oil**.
