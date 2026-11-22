const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ["ADMIN", "RESERVOIR_ENGINEER", "PRODUCTION_ENGINEER", "DATA_SCIENTIST", "FIELD_OPERATOR"],
      default: "FIELD_OPERATOR",
    },
    title: { type: String, default: "Upstream Engineer" },
    department: { type: String, default: "SOCAR Upstream Operations" },
    avatar: { type: String, default: "🛢️" },
    permissions: [{ type: String }],
    active: { type: Boolean, default: true },
    lastLogin: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const AuditLogSchema = new mongoose.Schema(
  {
    userEmail: { type: String, required: true },
    userName: { type: String, required: true },
    userRole: { type: String, required: true },
    action: { type: String, required: true },
    module: { type: String, required: true }, // AUTH, VFM, PTA, GASLIFT, EXPORT, RBAC
    details: { type: mongoose.Schema.Types.Mixed },
    status: { type: String, default: "SUCCESS" },
  },
  { timestamps: true }
);

const WellProfileSchema = new mongoose.Schema(
  {
    well_name: { type: String, required: true, unique: true },
    pvt: { type: mongoose.Schema.Types.Mixed },
    completion: { type: mongoose.Schema.Types.Mixed },
    qc: { type: mongoose.Schema.Types.Mixed },
    sensitivity: { type: mongoose.Schema.Types.Mixed },
    lift_gas_rank: { type: mongoose.Schema.Types.Mixed },
    choke_events: [{ type: mongoose.Schema.Types.Mixed }],
    well_tests: [{ type: mongoose.Schema.Types.Mixed }],
  },
  { timestamps: true }
);

const DailyPredictionSchema = new mongoose.Schema({
  well_name: { type: String, index: true },
  date: { type: String, index: true },
  oil_rate_stbd: Number,
  water_rate_stbd: Number,
  gas_rate_mscfd: Number,
  flowing_oil_rate_stbd: Number,
  flowing_water_rate_stbd: Number,
  flowing_gas_rate_mscfd: Number,
  water_cut_frac: Number,
  gor_scf_stb: Number,
  uptime_frac: Number,
  oil_rate_stbd_p10: Number,
  oil_rate_stbd_p90: Number,
  water_rate_stbd_p10: Number,
  water_rate_stbd_p90: Number,
  gas_rate_mscfd_p10: Number,
  gas_rate_mscfd_p90: Number,
  data_status: String,
});

const DailySensorSchema = new mongoose.Schema({
  well_name: { type: String, index: true },
  date: { type: String, index: true },
  whp_psia_mean: Number,
  whp_psia_min: Number,
  whp_psia_max: Number,
  whp_downstream_psia_mean: Number,
  whp_downstream_psia_min: Number,
  whp_downstream_psia_max: Number,
  dh_pressure_psia_mean: Number,
  dh_pressure_psia_min: Number,
  dh_pressure_psia_max: Number,
  dh_temperature_degf_mean: Number,
  dh_temperature_degf_min: Number,
  dh_temperature_degf_max: Number,
  annulus_pressure_psia_mean: Number,
  annulus_pressure_psia_min: Number,
  annulus_pressure_psia_max: Number,
  gas_lift_rate_mscfd_mean: Number,
  gas_lift_rate_mscfd_min: Number,
  gas_lift_rate_mscfd_max: Number,
});

const PTAEventSchema = new mongoose.Schema(
  {
    event_id: { type: String, required: true, unique: true },
    well_name: { type: String, required: true },
    properties: { type: mongoose.Schema.Types.Mixed },
    inputs: { type: mongoose.Schema.Types.Mixed },
    interpretation: { type: String },
    curves: { type: mongoose.Schema.Types.Mixed },
    override: {
      active: { type: Boolean, default: false },
      q_oil_stbd: { type: Number, default: null },
      window_start_hours: { type: Number, default: null },
      window_end_hours: { type: Number, default: null },
      updatedBy: { type: String, default: null },
      updatedAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

const FieldMetadataSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    vfm_model: { type: mongoose.Schema.Types.Mixed },
    validation_metrics: [{ type: mongoose.Schema.Types.Mixed }],
    validation_per_test: [{ type: mongoose.Schema.Types.Mixed }],
    forward_validation_metrics: [{ type: mongoose.Schema.Types.Mixed }],
    forward_validation_per_test: [{ type: mongoose.Schema.Types.Mixed }],
    well_test_corrections: [{ type: mongoose.Schema.Types.Mixed }],
    sensor_data_quality: [{ type: mongoose.Schema.Types.Mixed }],
    sensitivities: [{ type: mongoose.Schema.Types.Mixed }],
    gas_lift_upsets: [{ type: mongoose.Schema.Types.Mixed }],
    lift_gas_ranking: [{ type: mongoose.Schema.Types.Mixed }],
    shut_in_events: [{ type: mongoose.Schema.Types.Mixed }],
  },
  { timestamps: true }
);

const AgentationFeedbackSchema = new mongoose.Schema(
  {
    sessionId: { type: String, default: () => `session_${Date.now()}` },
    appName: { type: String, default: "WellPerf Enterprise" },
    page: { type: String, default: "/" },
    output: { type: String },
    annotations: [{ type: mongoose.Schema.Types.Mixed }],
    userEmail: { type: String, default: "engineer@socar.az" },
    status: { type: String, enum: ["PENDING", "IN_PROGRESS", "RESOLVED"], default: "PENDING" },
  },
  { timestamps: true }
);

module.exports = {
  User: mongoose.model("User", UserSchema),
  AuditLog: mongoose.model("AuditLog", AuditLogSchema),
  WellProfile: mongoose.model("WellProfile", WellProfileSchema),
  DailyPrediction: mongoose.model("DailyPrediction", DailyPredictionSchema),
  DailySensor: mongoose.model("DailySensor", DailySensorSchema),
  PTAEvent: mongoose.model("PTAEvent", PTAEventSchema),
  FieldMetadata: mongoose.model("FieldMetadata", FieldMetadataSchema),
  AgentationFeedback: mongoose.model("AgentationFeedback", AgentationFeedbackSchema),
};
