const APPROVAL_ACTION_TYPES = [
  "PAYMENT_REFUND",
  "LOAN_STATUS_UPDATE",
  "ACCOUNT_STATUS_UPDATE",
  "TRANSFER_EXECUTION",
  "SIP_PLAN_CREATION",
  "FD_BOOKING_CREATE",
  "RD_CREATION",
  "GL_MANUAL_JOURNAL",
  "MONEY_OUT_POLICY_UPDATE",
  "REGULATORY_POLICY_UPDATE",
  "TREASURY_SNAPSHOT_CREATE",
  "REGULATORY_REPORT_PUBLISH",
  "REGULATORY_ALERT_RESOLVE",
];

const normalizeList = (value) =>
  String(value || "")
    .split(",")
    .map((entry) => entry.trim().toUpperCase())
    .filter(Boolean);

const getApprovalMode = () => String(process.env.ADMIN_APPROVAL_MODE || "DISABLED").trim().toUpperCase();
const isDualControlEnforced = () =>
  String(process.env.ADMIN_APPROVAL_ENFORCE_DUAL_CONTROL || "false").trim().toLowerCase() === "true";
const isReviewNoteRequired = () =>
  String(process.env.ADMIN_APPROVAL_REQUIRE_REVIEW_NOTE || "false").trim().toLowerCase() === "true";

const getApprovalSlaHours = () => {
  const parsed = Number(process.env.ADMIN_APPROVAL_SLA_HOURS);
  if (!Number.isFinite(parsed) || parsed <= 0) return 24;
  return parsed;
};

const getApprovalEscalationHours = () => {
  const parsed = Number(process.env.ADMIN_APPROVAL_ESCALATION_HOURS);
  if (!Number.isFinite(parsed) || parsed <= 0) return 48;
  return parsed;
};

const getRequiredApprovalActions = () => {
  if (getApprovalMode() !== "ENABLED") {
    return [];
  }

  const configured = normalizeList(process.env.ADMIN_APPROVAL_REQUIRED_ACTIONS);
  if (!configured.length) {
    return [...APPROVAL_ACTION_TYPES];
  }

  const allowSet = new Set(APPROVAL_ACTION_TYPES);
  return configured.filter((entry) => allowSet.has(entry));
};

const isApprovalRequired = (actionType) => {
  const type = String(actionType || "").trim().toUpperCase();
  if (!type) return false;
  return getRequiredApprovalActions().includes(type);
};

module.exports = {
  APPROVAL_ACTION_TYPES,
  getApprovalMode,
  getRequiredApprovalActions,
  isApprovalRequired,
  isDualControlEnforced,
  isReviewNoteRequired,
  getApprovalSlaHours,
  getApprovalEscalationHours,
};
