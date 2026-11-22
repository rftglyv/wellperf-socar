const jwt = require("jsonwebtoken");
const { AuditLog } = require("./models");

const ROLE_PERMISSIONS = {
  ADMIN: [
    "field:read",
    "vfm:read",
    "vfm:simulate",
    "vfm:retrain",
    "pta:read",
    "pta:override",
    "gaslift:read",
    "gaslift:allocate",
    "export:all",
    "rbac:manage",
  ],
  RESERVOIR_ENGINEER: [
    "field:read",
    "vfm:read",
    "vfm:simulate",
    "pta:read",
    "pta:override",
    "gaslift:read",
    "export:all",
  ],
  PRODUCTION_ENGINEER: [
    "field:read",
    "vfm:read",
    "vfm:simulate",
    "pta:read",
    "gaslift:read",
    "gaslift:allocate",
    "export:all",
  ],
  DATA_SCIENTIST: [
    "field:read",
    "vfm:read",
    "vfm:simulate",
    "vfm:retrain",
    "pta:read",
    "gaslift:read",
    "export:all",
  ],
  FIELD_OPERATOR: ["field:read", "vfm:read", "pta:read", "gaslift:read"],
};

const ROLE_DESCRIPTIONS = {
  ADMIN: {
    label: "Platform Administrator",
    badgeColor: "amber",
    description: "Full access to VFM retraining, PTA interpretation overrides, Lift-Gas allocation, and RBAC management.",
  },
  RESERVOIR_ENGINEER: {
    label: "Senior Reservoir Engineer",
    badgeColor: "emerald",
    description: "Authorised to override PTA radial-flow (IARF) windows, calibrate skin/k, and run VFM inflow simulations.",
  },
  PRODUCTION_ENGINEER: {
    label: "Production & Artificial Lift Engineer",
    badgeColor: "cyan",
    description: "Authorised to run Lift-Gas reallocation trials (GL-04 → GL-01), choke simulations, and VFM allocation.",
  },
  DATA_SCIENTIST: {
    label: "Lead Petroleum Data Scientist",
    badgeColor: "purple",
    description: "Authorised to retrain BoundedRidge VFM models, inspect LOTO/Forward CV metrics, and audit sensor QC.",
  },
  FIELD_OPERATOR: {
    label: "Offshore Field Operator",
    badgeColor: "slate",
    description: "Read-only surveillance access to 3D digital twin, sensor envelopes, daily VFM rates, and shut-in alerts.",
  },
};

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required. Missing Bearer token." });
  }
  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "socar_secret");
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired JWT token." });
  }
}

function requirePermission(permission) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthenticated" });
    }
    const userPerms = ROLE_PERMISSIONS[req.user.role] || [];
    if (!userPerms.includes(permission) && req.user.role !== "ADMIN") {
      try {
        await AuditLog.create({
          userEmail: req.user.email,
          userName: req.user.name,
          userRole: req.user.role,
          action: `DENIED_${permission.toUpperCase()}`,
          module: "RBAC",
          details: { requiredPermission: permission, path: req.originalUrl },
          status: "FORBIDDEN",
        });
      } catch (_) {}
      return res.status(403).json({
        error: `RBAC Access Denied: Role '${req.user.role}' lacks permission '${permission}'.`,
        requiredPermission: permission,
        currentRole: req.user.role,
      });
    }
    next();
  };
}

module.exports = {
  ROLE_PERMISSIONS,
  ROLE_DESCRIPTIONS,
  authenticate,
  requirePermission,
};
