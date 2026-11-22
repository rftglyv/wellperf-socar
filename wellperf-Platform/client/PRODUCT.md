# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Reservoir and production engineers at SOCAR. They upload raw 1-minute field telemetry from 10 offshore gas-lift wells (GL-01 … GL-10), check data quality, and read back daily per-well rates and shut-in interpretations. Desk use, repeated, data-dense work; they know PTA/VFM vocabulary (Horner, Bourdet, skin, IARF, MAPE).

## Product Purpose
WellPerf turns raw sensor data into (1) daily oil/water/gas rates per well where no multiphase meter exists (Virtual Flow Metering) and (2) permeability, skin and ΔP-skin for every shut-in (Pressure Transient Analysis). Success: an engineer can drop in a new period of data and get trustworthy, exportable numbers in minutes, with the uncertainty and quality of each result stated plainly.

## Positioning
Physics-constrained, honest numbers: the VFM model cannot violate inflow physics (Pwf slope forced negative), surface pressures are excluded because test-separator routing biases them, and PTA results carry an explicit radial-flow quality rating (good / indicative / no radial flow) instead of always returning a k and skin.

## Operating Context
Workflow: 01 Data → 02 Clean & QC → 03 Trained model → 04 VFM → 05 PTA → 06 Field twin (3D) → 07 Export. Inputs are CSV / XLSX / Parquet / ZIP uploaded in parts; outputs are Excel/CSV deliverables and offline HTML reports. A Python FastAPI engine (port 8000) does all computation; the Next.js client (port 3000) displays it.

## Capabilities and Constraints
- Three UI languages must keep working: Azerbaijani, English, Russian.
- Dark and light themes must both keep working.
- The Three.js 3D field twin stays.
- The lift-gas response is NOT a calibrated optimiser; the product must not claim gas-lift optimisation.
- `/legacy` (MongoDB + RBAC dashboard) is out of scope.
- Landing page and workspace are both in scope for the shadcn/ui rebuild.

## Brand Commitments
- Name: WellPerf.
- Visual language: shadcn/ui (https://ui.shadcn.com/), pinned by the user.

## Evidence on Hand
- Real validation numbers: held-out oil MAPE 2.65 %, forward oil MAPE 3.72 % vs 6.0 % baseline, 85 repaired well tests (engine/README.md).
- Real PTA results for 6 shut-ins (GL-01, 02, 04, 06, 08, 10).
- Photos/GIF of an offshore rig in `public/` (caspian-rig.png / .gif).
- No customer testimonials, pricing or deployment claims exist; do not invent them.

## Product Principles
1. Numbers first: every screen leads with the result an engineer acts on.
2. State uncertainty and quality next to every result, never hide it.
3. Same steps on test day as in training; the workflow order is the product.
4. Plain engineering language; no marketing slogans inside the tool.
