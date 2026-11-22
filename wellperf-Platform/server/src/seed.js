require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const {
  User,
  AuditLog,
  WellProfile,
  DailyPrediction,
  DailySensor,
  PTAEvent,
  FieldMetadata,
} = require("./models");
const { ROLE_PERMISSIONS } = require("./rbac");

const SEED_PATH = path.resolve(__dirname, "../../seed_data.json");

const DEMO_USERS = [
  {
    name: "Kənan Qafarov",
    email: "admin@socar.az",
    password: "Password123!",
    role: "ADMIN",
    title: "VP of Upstream Digital & AI",
    department: "SOCAR Executive Board & Caspian AI",
    avatar: "👑",
  },
  {
    name: "Dr. Eldar Məmmədov",
    email: "reservoir@socar.az",
    password: "Password123!",
    role: "RESERVOIR_ENGINEER",
    title: "Principal Reservoir & PTA Engineer",
    department: "Subsurface & Reservoir Characterization",
    avatar: "🔬",
  },
  {
    name: "Fəridə Əliyeva",
    email: "production@socar.az",
    password: "Password123!",
    role: "PRODUCTION_ENGINEER",
    title: "Lead Artificial Lift & Production Engineer",
    department: "Gas-Lift & Surface Facilities",
    avatar: "💨",
  },
  {
    name: "Tural Həsənli",
    email: "datascience@socar.az",
    password: "Password123!",
    role: "DATA_SCIENTIST",
    title: "Lead Petroleum ML Architect",
    department: "Caspian AI Institute — VFM Lab",
    avatar: "🧠",
  },
  {
    name: "Rəşad Quliyev",
    email: "operator@socar.az",
    password: "Password123!",
    role: "FIELD_OPERATOR",
    title: "Offshore Platform Surveillance Operator",
    department: "ACG / Gunashli Offshore Control Room",
    avatar: "📡",
  },
];

async function seedDatabase(closeWhenDone = true) {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI);
  }
  console.log("Connected to MongoDB Atlas for seeding...");

  if (!fs.existsSync(SEED_PATH)) {
    throw new Error(`Seed file not found at ${SEED_PATH}`);
  }
  const raw = JSON.parse(fs.readFileSync(SEED_PATH, "utf-8"));

  // 1. Seed Users
  await User.deleteMany({});
  const hash = await bcrypt.hash("Password123!", 10);
  const usersToInsert = DEMO_USERS.map((u) => ({
    name: u.name,
    email: u.email,
    passwordHash: hash,
    role: u.role,
    title: u.title,
    department: u.department,
    avatar: u.avatar,
    permissions: ROLE_PERMISSIONS[u.role] || [],
    active: true,
  }));
  await User.insertMany(usersToInsert);
  console.log(`Seeded ${usersToInsert.length} RBAC users.`);

  // 2. Seed WellProfiles
  await WellProfile.deleteMany({});
  const wells = raw.pvt.map((p) => p.well_name);
  const profiles = wells.map((w) => ({
    well_name: w,
    pvt: raw.pvt.find((x) => x.well_name === w),
    completion: raw.completion.find((x) => x.well_name === w),
    qc: raw.sensor_data_quality.find((x) => x.well_name === w),
    sensitivity: raw.sensitivities.find((x) => x.well_name === w),
    lift_gas_rank: raw.lift_gas_ranking.find((x) => x.well_name === w),
    choke_events: raw.choke_events.filter((x) => x.well_name === w),
    well_tests: raw.well_tests_clean.filter((x) => x.well_name === w),
  }));
  await WellProfile.insertMany(profiles);
  console.log(`Seeded ${profiles.length} WellProfiles.`);

  // 3. Seed DailyPredictions (2730 records)
  await DailyPrediction.deleteMany({});
  const predDocs = raw.prediction_details.map((p) => ({
    ...p,
    date: String(p.date).slice(0, 10),
  }));
  await DailyPrediction.insertMany(predDocs);
  console.log(`Seeded ${predDocs.length} DailyPredictions.`);

  // 4. Seed DailySensors (2730 records)
  await DailySensor.deleteMany({});
  await DailySensor.insertMany(raw.daily_sensors);
  console.log(`Seeded ${raw.daily_sensors.length} DailySensors.`);

  // 5. Seed PTAEvents (6 shut-ins with full diagnostic curves)
  await PTAEvent.deleteMany({});
  const ptaDocs = raw.pta_reservoir_properties.map((prop) => {
    const eid = prop.event_id;
    const inp = raw.pta_analysis_inputs.find((x) => x.event_id === eid);
    const interp = raw.pta_interpretation.find((x) => x.event_id === eid);
    const curves = raw.pta_curves[eid];
    return {
      event_id: eid,
      well_name: prop.well_name,
      properties: prop,
      inputs: inp,
      interpretation: interp ? interp.interpretation : "",
      curves,
      override: { active: false },
    };
  });
  await PTAEvent.insertMany(ptaDocs);
  console.log(`Seeded ${ptaDocs.length} PTAEvents.`);

  // 6. Seed FieldMetadata
  await FieldMetadata.deleteMany({});
  await FieldMetadata.create({
    key: "socar_2026_primary",
    vfm_model: raw.vfm_model,
    validation_metrics: raw.validation_metrics,
    validation_per_test: raw.validation_per_test,
    forward_validation_metrics: raw.forward_validation_metrics,
    forward_validation_per_test: raw.forward_validation_per_test,
    well_test_corrections: raw.well_test_corrections,
    sensor_data_quality: raw.sensor_data_quality,
    sensitivities: raw.sensitivities,
    gas_lift_upsets: raw.gas_lift_upsets,
    lift_gas_ranking: raw.lift_gas_ranking,
    shut_in_events: raw.shut_in_events,
  });
  console.log("Seeded FieldMetadata (VFM model weights, CV metrics, upsets, lift-gas ranking).");

  // 7. Seed Initial AuditLogs
  await AuditLog.deleteMany({});
  await AuditLog.insertMany([
    {
      userEmail: "datascience@socar.az",
      userName: "Tural Həsənli",
      userRole: "DATA_SCIENTIST",
      action: "VFM_MODEL_TRAINED",
      module: "VFM",
      details: { tests: 85, forwardTests: 55, oilForwardMAPE: "3.72%", testDayBias: "+0.7%" },
      status: "SUCCESS",
    },
    {
      userEmail: "reservoir@socar.az",
      userName: "Dr. Eldar Məmmədov",
      userRole: "RESERVOIR_ENGINEER",
      action: "PTA_BATCH_QUALITY_SWEEP",
      module: "PTA",
      details: { events: 6, goodRadialFlow: ["GL-02", "GL-04", "GL-06", "GL-08"], stimulationCandidate: "GL-06 (Skin +1.74)" },
      status: "SUCCESS",
    },
    {
      userEmail: "production@socar.az",
      userName: "Fəridə Əliyeva",
      userRole: "PRODUCTION_ENGINEER",
      action: "LIFT_GAS_OPTIMISATION_PROPOSAL",
      module: "GASLIFT",
      details: { shift: "100 Mscf/d from GL-04 → GL-01", netGain: "+19.0 STB/d (+$485k/yr)" },
      status: "SUCCESS",
    },
  ]);

  console.log("✅ MongoDB Atlas Seeding Complete!");
  if (closeWhenDone) {
    await mongoose.connection.close();
  }
}

if (require.main === module) {
  seedDatabase(true).catch((err) => {
    console.error("Seed error:", err);
    process.exit(1);
  });
}

module.exports = { seedDatabase, DEMO_USERS };
