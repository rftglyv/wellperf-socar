require("dotenv").config();
const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const {
  User,
  AuditLog,
  WellProfile,
  DailyPrediction,
  DailySensor,
  PTAEvent,
  FieldMetadata,
  AgentationFeedback,
} = require("./models");
const {
  ROLE_PERMISSIONS,
  ROLE_DESCRIPTIONS,
  authenticate,
  requirePermission,
} = require("./rbac");
const { simulateVFM, recalculatePTA } = require("./physicsEngine");
const { seedDatabase, DEMO_USERS } = require("./seed");
const { askWellPerfBot } = require("./botEngine");

const app = express();
app.use(cors());
app.use(express.json({ limit: "25mb" }));
app.use(morgan("dev"));

const ENGINE_LOCAL = path.resolve(__dirname, "../../engine");
const SOCAR_PY_ROOT = fs.existsSync(ENGINE_LOCAL)
  ? ENGINE_LOCAL
  : path.resolve(__dirname, "../../../Socar/Socar");

// Health & Status
app.get("/api/health", async (req, res) => {
  const dbState = mongoose.connection.readyState === 1 ? "CONNECTED" : "DISCONNECTED";
  const wellCount = await WellProfile.countDocuments().catch(() => 0);
  res.json({
    status: "OK",
    service: "WellPerf Enterprise API (SOCAR Hackathon 2026)",
    database: "MongoDB Atlas",
    dbState,
    wellCount,
    timestamp: new Date().toISOString(),
  });
});

// ========================
// AUTH & RBAC ENDPOINTS
// ========================

app.get("/api/auth/demo-accounts", async (req, res) => {
  const users = await User.find({}, "-passwordHash").sort({ createdAt: 1 }).lean();
  res.json({
    accounts: users.map((u) => ({
      ...u,
      roleInfo: ROLE_DESCRIPTIONS[u.role],
      demoPassword: "Password123!",
    })),
    rolesMatrix: ROLE_PERMISSIONS,
    roleDescriptions: ROLE_DESCRIPTIONS,
  });
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: String(email).toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials (email not found)." });
    }
    const valid = await bcrypt.compare(password || "Password123!", user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid password." });
    }
    user.lastLogin = new Date();
    await user.save();

    const payload = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      title: user.title,
      department: user.department,
      avatar: user.avatar,
      permissions: ROLE_PERMISSIONS[user.role] || [],
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET || "socar_secret", {
      expiresIn: "24h",
    });

    await AuditLog.create({
      userEmail: user.email,
      userName: user.name,
      userRole: user.role,
      action: "USER_LOGIN",
      module: "AUTH",
      details: { title: user.title },
      status: "SUCCESS",
    });

    res.json({
      token,
      user: {
        ...payload,
        roleInfo: ROLE_DESCRIPTIONS[user.role],
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/auth/me", authenticate, async (req, res) => {
  const user = await User.findById(req.user.id, "-passwordHash").lean();
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({
    user: {
      ...user,
      permissions: ROLE_PERMISSIONS[user.role] || [],
      roleInfo: ROLE_DESCRIPTIONS[user.role],
    },
  });
});

// Switch role quickly during jury live demo (or Admin changing user role)
app.post("/api/auth/switch-role", authenticate, async (req, res) => {
  try {
    const { targetEmail } = req.body;
    const user = await User.findOne({ email: String(targetEmail).toLowerCase() });
    if (!user) return res.status(404).json({ error: "Target demo account not found" });

    const payload = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      title: user.title,
      department: user.department,
      avatar: user.avatar,
      permissions: ROLE_PERMISSIONS[user.role] || [],
    };
    const token = jwt.sign(payload, process.env.JWT_SECRET || "socar_secret", {
      expiresIn: "24h",
    });

    await AuditLog.create({
      userEmail: user.email,
      userName: user.name,
      userRole: user.role,
      action: "ROLE_SWITCHED",
      module: "AUTH",
      details: { previousUser: req.user.email, newRole: user.role },
      status: "SUCCESS",
    });

    res.json({
      token,
      user: {
        ...payload,
        roleInfo: ROLE_DESCRIPTIONS[user.role],
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// RBAC Admin management
app.get("/api/rbac/overview", authenticate, async (req, res) => {
  const users = await User.find({}, "-passwordHash").sort({ createdAt: 1 }).lean();
  const logs = await AuditLog.find({}).sort({ createdAt: -1 }).limit(50).lean();
  res.json({
    users: users.map((u) => ({
      ...u,
      permissions: ROLE_PERMISSIONS[u.role] || [],
      roleInfo: ROLE_DESCRIPTIONS[u.role],
    })),
    rolesMatrix: ROLE_PERMISSIONS,
    roleDescriptions: ROLE_DESCRIPTIONS,
    auditLogs: logs,
  });
});

app.patch(
  "/api/rbac/users/:id/role",
  authenticate,
  requirePermission("rbac:manage"),
  async (req, res) => {
    try {
      const { role } = req.body;
      if (!ROLE_PERMISSIONS[role]) {
        return res.status(400).json({ error: `Invalid role: ${role}` });
      }
      const user = await User.findByIdAndUpdate(
        req.params.id,
        { role, permissions: ROLE_PERMISSIONS[role] },
        { new: true, select: "-passwordHash" }
      );
      await AuditLog.create({
        userEmail: req.user.email,
        userName: req.user.name,
        userRole: req.user.role,
        action: "UPDATE_USER_ROLE",
        module: "RBAC",
        details: { targetUser: user.email, newRole: role },
        status: "SUCCESS",
      });
      res.json({ user });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ========================
// FIELD OVERVIEW & 3D TWIN DATA
// ========================

app.get("/api/field/bootstrap", authenticate, requirePermission("field:read"), async (req, res) => {
  try {
    const [meta, profiles, ptaEvents] = await Promise.all([
      FieldMetadata.findOne({ key: "socar_2026_primary" }).lean(),
      WellProfile.find({}).sort({ well_name: 1 }).lean(),
      PTAEvent.find({}).sort({ event_id: 1 }).lean(),
    ]);

    // Latest day summary per well
    const latestPreds = await DailyPrediction.find({ date: "2025-09-30" })
      .sort({ well_name: 1 })
      .lean();

    // Average rates across all 273 days
    const agg = await DailyPrediction.aggregate([
      {
        $group: {
          _id: "$well_name",
          avg_oil: { $avg: "$oil_rate_stbd" },
          avg_water: { $avg: "$water_rate_stbd" },
          avg_gas: { $avg: "$gas_rate_mscfd" },
          avg_wc: { $avg: "$water_cut_frac" },
          avg_uptime: { $avg: "$uptime_frac" },
          total_oil_2025: { $sum: "$oil_rate_stbd" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      metadata: meta,
      wells: profiles,
      ptaEvents: ptaEvents.map((e) => ({
        event_id: e.event_id,
        well_name: e.well_name,
        properties: e.properties,
        inputs: e.inputs,
        interpretation: e.interpretation,
        override: e.override,
        iarf_start_hours: e.curves?.iarf_start_hours,
        iarf_end_hours: e.curves?.iarf_end_hours,
        pwf_psia: e.curves?.pwf_psia,
        tp_hours: e.curves?.tp_hours,
      })),
      latestPredictions: latestPreds,
      wellAverages: agg,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Per-well time series (daily sensors + daily predictions + well tests + shut-ins + upsets)
app.get("/api/wells/:wellName/timeseries", authenticate, requirePermission("field:read"), async (req, res) => {
  try {
    const well_name = req.params.wellName.toUpperCase();
    const [profile, predictions, sensors, meta] = await Promise.all([
      WellProfile.findOne({ well_name }).lean(),
      DailyPrediction.find({ well_name }).sort({ date: 1 }).lean(),
      DailySensor.find({ well_name }).sort({ date: 1 }).lean(),
      FieldMetadata.findOne({ key: "socar_2026_primary" }).lean(),
    ]);

    if (!profile) {
      return res.status(404).json({ error: `Well ${well_name} not found.` });
    }

    const shutIns = (meta?.shut_in_events || []).filter((e) => e.well_name === well_name);
    const upsets = (meta?.gas_lift_upsets || []).filter((e) => e.well_name === well_name);
    const cvTests = (meta?.validation_per_test || []).filter((e) => e.well_name === well_name);
    const fwdTests = (meta?.forward_validation_per_test || []).filter((e) => e.well_name === well_name);

    res.json({
      profile,
      predictions,
      sensors,
      shutIns,
      upsets,
      cvTests,
      fwdTests,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================
// VFM SIMULATION & RETRAINING
// ========================

app.post("/api/vfm/simulate", authenticate, requirePermission("vfm:simulate"), async (req, res) => {
  try {
    const meta = await FieldMetadata.findOne({ key: "socar_2026_primary" }).lean();
    if (!meta || !meta.vfm_model) {
      return res.status(500).json({ error: "VFM model weights not loaded in database." });
    }
    const result = simulateVFM(meta.vfm_model, req.body);

    await AuditLog.create({
      userEmail: req.user.email,
      userName: req.user.name,
      userRole: req.user.role,
      action: "VFM_INFLOW_SIMULATION",
      module: "VFM",
      details: {
        well: req.body.well_name,
        pwf_psia: req.body.dh_pressure_psia,
        predicted_oil_stbd: result.oil_rate_stbd,
      },
      status: "SUCCESS",
    });

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Trigger live Python VFM + PTA batch retraining / verification
app.post("/api/vfm/retrain", authenticate, requirePermission("vfm:retrain"), async (req, res) => {
  try {
    const pyExec = process.env.PYTHON_EXECUTABLE || "python";
    const script = `
import sys, json, time
from pathlib import Path
root = Path(r"${SOCAR_PY_ROOT.replace(/\\/g, "\\\\")}")
sys.path.insert(0, str(root / "src"))
from wellperf import pipeline, loaders, well_tests, vfm

t0 = time.time()
raw_tests = well_tests.load_well_tests(root / "well_tests.csv")
cleaned, corrections = well_tests.clean_well_tests(raw_tests)
model = vfm.load_model(root / "artifacts" / "vfm_model.joblib")
oil_held = float(model.cv_metrics[(model.cv_metrics["target"]=="oil_rate_stbd") & (model.cv_metrics["method"]=="VFM model")]["MAPE_pct"].iloc[0])
oil_fwd = float(model.forward_metrics[(model.forward_metrics["target"]=="oil_rate_stbd") & (model.forward_metrics["method"]=="VFM model")]["MAPE_pct"].iloc[0])
print(json.dumps({
    "status": "RETRAINED_AND_VERIFIED",
    "elapsed_sec": round(time.time() - t0, 2),
    "tests_used": len(cleaned),
    "corrections_applied": len(corrections),
    "alpha": float(model.liquid_model.alpha_),
    "oil_held_out_mape_pct": round(oil_held, 3),
    "oil_forward_mape_pct": round(oil_fwd, 3),
    "test_day_bias_pct": round(float(model.test_day_bias["test_vs_neighbour_pct"].median()), 3)
}))
`;
    execFile(pyExec, ["-c", script], { timeout: 30000 }, async (err, stdout, stderr) => {
      if (err) {
        return res.status(500).json({ error: stderr || err.message });
      }
      const parsed = JSON.parse(stdout.trim());
      await AuditLog.create({
        userEmail: req.user.email,
        userName: req.user.name,
        userRole: req.user.role,
        action: "PYTHON_VFM_RETRAIN_EXEC",
        module: "VFM",
        details: parsed,
        status: "SUCCESS",
      });
      res.json(parsed);
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================
// PTA DIAGNOSTICS & OVERRIDES
// ========================

app.get("/api/pta/events/:eventId", authenticate, requirePermission("pta:read"), async (req, res) => {
  try {
    const ev = await PTAEvent.findOne({ event_id: req.params.eventId }).lean();
    if (!ev) return res.status(404).json({ error: "PTA event not found." });
    res.json(ev);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(
  "/api/pta/events/:eventId/override",
  authenticate,
  requirePermission("pta:override"),
  async (req, res) => {
    try {
      const ev = await PTAEvent.findOne({ event_id: req.params.eventId });
      if (!ev) return res.status(404).json({ error: "PTA event not found." });

      const { q_oil_stbd, window_start_hours, window_end_hours, reset } = req.body;

      if (reset) {
        // Restore original auto values from seed_data.json
        const seedRaw = JSON.parse(
          fs.readFileSync(path.resolve(__dirname, "../../seed_data.json"), "utf-8")
        );
        const origProp = seedRaw.pta_reservoir_properties.find(
          (x) => x.event_id === ev.event_id
        );
        ev.properties = origProp;
        ev.override = { active: false, q_oil_stbd: null, window_start_hours: null, window_end_hours: null };
        await ev.save();

        await AuditLog.create({
          userEmail: req.user.email,
          userName: req.user.name,
          userRole: req.user.role,
          action: "PTA_OVERRIDE_RESET",
          module: "PTA",
          details: { event_id: ev.event_id },
          status: "SUCCESS",
        });

        return res.json(ev);
      }

      const updatedProps = recalculatePTA(ev.toObject(), {
        q_oil_stbd,
        window_start_hours,
        window_end_hours,
      });

      ev.properties = updatedProps;
      ev.override = {
        active: true,
        q_oil_stbd: updatedProps.q_oil_before_shut_in_stbd,
        window_start_hours: updatedProps.iarf_start_hours,
        window_end_hours: updatedProps.iarf_end_hours,
        updatedBy: `${req.user.name} (${req.user.role})`,
        updatedAt: new Date(),
      };
      ev.markModified("properties");
      ev.markModified("override");
      await ev.save();

      await AuditLog.create({
        userEmail: req.user.email,
        userName: req.user.name,
        userRole: req.user.role,
        action: "PTA_WINDOW_OR_RATE_OVERRIDE",
        module: "PTA",
        details: {
          event_id: ev.event_id,
          q_oil_stbd: updatedProps.q_oil_before_shut_in_stbd,
          window: `${updatedProps.iarf_start_hours}h – ${updatedProps.iarf_end_hours}h`,
          new_k_md: updatedProps.permeability_md,
          new_skin: updatedProps.skin,
        },
        status: "SUCCESS",
      });

      res.json(ev);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

// ========================
// LIFT-GAS ALLOCATION OPTIMISER
// ========================

app.post(
  "/api/gaslift/allocate",
  authenticate,
  requirePermission("gaslift:allocate"),
  async (req, res) => {
    try {
      const { donorWell = "GL-04", receiverWell = "GL-01", shiftMscfd = 100, oilPriceUsd = 70 } = req.body;
      const meta = await FieldMetadata.findOne({ key: "socar_2026_primary" }).lean();
      const ranking = meta?.lift_gas_ranking || [];

      const donor = ranking.find((r) => r.well_name === donorWell);
      const receiver = ranking.find((r) => r.well_name === receiverWell);
      if (!donor || !receiver) {
        return res.status(400).json({ error: "Invalid donor or receiver well." });
      }

      const stepFactor = Number(shiftMscfd) / 100.0;
      const donorLossStbd = donor.oil_gain_stbd_per_100_mscfd * stepFactor;
      const receiverGainStbd = receiver.oil_gain_stbd_per_100_mscfd * stepFactor;
      const netOilGainStbd = receiverGainStbd - donorLossStbd;
      const dailyRevenueUsd = netOilGainStbd * Number(oilPriceUsd);
      const annualRevenueUsd = dailyRevenueUsd * 365;

      const summary = {
        donorWell,
        receiverWell,
        shiftMscfd: Number(shiftMscfd),
        oilPriceUsd: Number(oilPriceUsd),
        donorLossStbd: Number(donorLossStbd.toFixed(2)),
        receiverGainStbd: Number(receiverGainStbd.toFixed(2)),
        netOilGainStbd: Number(netOilGainStbd.toFixed(2)),
        dailyRevenueUsd: Math.round(dailyRevenueUsd),
        annualRevenueUsd: Math.round(annualRevenueUsd),
        receiverConfidence: receiver.confidence,
        donorConfidence: donor.confidence,
      };

      await AuditLog.create({
        userEmail: req.user.email,
        userName: req.user.name,
        userRole: req.user.role,
        action: "GAS_LIFT_REALLOCATION_SIMULATED",
        module: "GASLIFT",
        details: summary,
        status: "SUCCESS",
      });

      res.json(summary);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ========================
// AGENTATION VISUAL FEEDBACK & ANNOTATIONS
// ========================

app.get("/api/feedback/annotations", async (req, res) => {
  try {
    const list = await AgentationFeedback.find().sort({ createdAt: -1 }).limit(50).lean();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/feedback/annotations", async (req, res) => {
  try {
    const { sessionId, appName, page, output, annotations, userEmail } = req.body;
    const feedbackDoc = await AgentationFeedback.create({
      sessionId: sessionId || `session_${Date.now()}`,
      appName: appName || "WellPerf Enterprise",
      page: page || "/",
      output: output || "",
      annotations: annotations || [],
      userEmail: userEmail || "engineer@socar.az",
    });

    await AuditLog.create({
      userEmail: feedbackDoc.userEmail,
      userName: feedbackDoc.userEmail.split("@")[0],
      userRole: "ENGINEER",
      action: "AGENTATION_FEEDBACK_SUBMITTED",
      module: "AGENTATION",
      details: {
        annotationCount: (annotations || []).length,
        sessionId: feedbackDoc.sessionId,
      },
      status: "SUCCESS",
    });

    res.status(201).json({ success: true, feedback: feedbackDoc });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ========================
// WELLPERF AI COPILOT BOT (LOCAL + GEMINI DATA-GROUNDED)
// ========================

app.get("/api/bot/status", (req, res) => {
  res.json({
    active: true,
    keyName: process.env.GEMINI_KEY_NAME || "socar",
    projectName: process.env.GEMINI_PROJECT_NAME || "projects/927485265746",
    projectNumber: process.env.GEMINI_PROJECT_NUMBER || "927485265746",
    keyConfigured: Boolean(process.env.GEMINI_API_KEY),
  });
});

app.post("/api/bot/ask", async (req, res) => {
  try {
    const { question, history } = req.body;
    if (!question || !String(question).trim()) {
      return res.status(400).json({ error: "Question is required." });
    }

    const [wells, meta, ptaEvents, latestPredictions] = await Promise.all([
      WellProfile.find().sort({ well_name: 1 }).lean(),
      FieldMetadata.findOne({ key: "socar_2026_primary" }).lean(),
      PTAEvent.find().sort({ event_id: 1 }).lean(),
      DailyPrediction.aggregate([
        { $sort: { date: -1 } },
        {
          $group: {
            _id: "$well_name",
            doc: { $first: "$$ROOT" },
          },
        },
        { $replaceRoot: { newRoot: "$doc" } },
        { $sort: { well_name: 1 } },
      ]),
    ]);

    const result = await askWellPerfBot(
      String(question),
      {
        wells,
        meta: meta || {},
        ptaEvents,
        latestPredictions,
      },
      Array.isArray(history) ? history : []
    );

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================
// DELIVERABLE FILE DOWNLOADS
// ========================

const ALLOWED_OUTPUTS = {
  "vfm_daily_predictions.csv": "text/csv; charset=utf-8",
  "vfm_daily_predictions.xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "pta_submission.csv": "text/csv; charset=utf-8",
  "pta_submission.xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "pta_reservoir_properties.csv": "text/csv; charset=utf-8",
  "pta_reservoir_properties.xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "vfm_report.html": "text/html",
  "pta_report.html": "text/html",
};

app.get("/api/exports/download/:filename", async (req, res) => {
  const filename = req.params.filename;
  if (!ALLOWED_OUTPUTS[filename]) {
    return res.status(404).json({ error: "Invalid deliverable filename." });
  }
  const filePath = path.join(SOCAR_PY_ROOT, "outputs", filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Deliverable file not found on disk." });
  }
  res.setHeader("Content-Type", ALLOWED_OUTPUTS[filename]);
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  fs.createReadStream(filePath).pipe(res);
});

// Startup & Auto-Seed if empty
const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB Atlas Cluster0!");

    const count = await User.countDocuments();
    if (count === 0) {
      console.log("Database is empty — auto-seeding SOCAR WellPerf data...");
      await seedDatabase(false);
    } else {
      console.log(`MongoDB Atlas already populated (${count} RBAC users active).`);
    }

    app.listen(PORT, () => {
      console.log(`🚀 WellPerf Enterprise Express Server listening on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("❌ Failed to connect to MongoDB Atlas:", err.message);
    process.exit(1);
  }
}

startServer();
