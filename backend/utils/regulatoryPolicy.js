const RegulatoryPolicyConfig = require("../models/RegulatoryPolicyConfig");

const parsePositiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseNonNegativeNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const getEnvRegulatoryPolicy = () => ({
  ctrCashThreshold: parsePositiveNumber(process.env.REGULATORY_CTR_THRESHOLD, 1000000),
  minLcrRatio: parseNonNegativeNumber(process.env.REGULATORY_MIN_LCR_RATIO, 100),
  maxLoanToDepositRatio: parseNonNegativeNumber(process.env.REGULATORY_MAX_LOAN_TO_DEPOSIT_RATIO, 90),
  openStrAlertThreshold: parseNonNegativeNumber(process.env.REGULATORY_OPEN_STR_ALERT_THRESHOLD, 1),
  criticalStrAlertThreshold: parseNonNegativeNumber(process.env.REGULATORY_CRITICAL_STR_ALERT_THRESHOLD, 1),
});

const normalizeRegulatoryPolicyPayload = (candidate = {}, fallback = getEnvRegulatoryPolicy()) => ({
  ctrCashThreshold: parsePositiveNumber(candidate.ctrCashThreshold, fallback.ctrCashThreshold),
  minLcrRatio: parseNonNegativeNumber(candidate.minLcrRatio, fallback.minLcrRatio),
  maxLoanToDepositRatio: parseNonNegativeNumber(candidate.maxLoanToDepositRatio, fallback.maxLoanToDepositRatio),
  openStrAlertThreshold: parseNonNegativeNumber(candidate.openStrAlertThreshold, fallback.openStrAlertThreshold),
  criticalStrAlertThreshold: parseNonNegativeNumber(
    candidate.criticalStrAlertThreshold,
    fallback.criticalStrAlertThreshold
  ),
});

let cachedRegulatoryPolicy = null;
let cachedRegulatoryPolicyMeta = {
  source: "ENV_DEFAULT",
  version: 0,
  updatedAt: null,
};

const getRegulatoryPolicy = () => cachedRegulatoryPolicy || getEnvRegulatoryPolicy();

const getRegulatoryPolicyState = () => ({
  policy: getRegulatoryPolicy(),
  source: cachedRegulatoryPolicyMeta.source,
  version: cachedRegulatoryPolicyMeta.version,
  updatedAt: cachedRegulatoryPolicyMeta.updatedAt,
});

const refreshRegulatoryPolicyCache = async () => {
  const activePolicy = await RegulatoryPolicyConfig.findOne({ key: "DEFAULT", isActive: true }).sort({ version: -1 });
  if (!activePolicy) {
    cachedRegulatoryPolicy = null;
    cachedRegulatoryPolicyMeta = {
      source: "ENV_DEFAULT",
      version: 0,
      updatedAt: null,
    };
    return getRegulatoryPolicyState();
  }

  cachedRegulatoryPolicy = normalizeRegulatoryPolicyPayload(activePolicy, getEnvRegulatoryPolicy());
  cachedRegulatoryPolicyMeta = {
    source: activePolicy.source || "ADMIN_DIRECT",
    version: Number(activePolicy.version || 0),
    updatedAt: activePolicy.updatedAt || null,
  };
  return getRegulatoryPolicyState();
};

const applyRegulatoryPolicy = async ({
  nextPolicy = {},
  updatedBy = null,
  source = "ADMIN_DIRECT",
  changeNote = "",
  session = null,
} = {}) => {
  const currentPolicy = getRegulatoryPolicy();
  const normalizedPolicy = normalizeRegulatoryPolicyPayload(nextPolicy, currentPolicy);

  const query = { key: "DEFAULT", isActive: true };
  let activePolicyQuery = RegulatoryPolicyConfig.findOne(query).sort({ version: -1 });
  if (session) activePolicyQuery = activePolicyQuery.session(session);
  const activePolicy = await activePolicyQuery;

  const nextVersion = Math.max(1, Number(activePolicy?.version || 0) + 1);

  if (activePolicy) {
    activePolicy.isActive = false;
    await activePolicy.save(session ? { session } : undefined);
  }

  const [createdPolicy] = await RegulatoryPolicyConfig.create(
    [
      {
        key: "DEFAULT",
        version: nextVersion,
        isActive: true,
        ...normalizedPolicy,
        source,
        changeNote: String(changeNote || "").slice(0, 240),
        updatedBy,
      },
    ],
    session ? { session } : undefined
  );

  cachedRegulatoryPolicy = normalizedPolicy;
  cachedRegulatoryPolicyMeta = {
    source: createdPolicy.source || source || "ADMIN_DIRECT",
    version: createdPolicy.version || nextVersion,
    updatedAt: createdPolicy.updatedAt || new Date(),
  };

  return createdPolicy;
};

module.exports = {
  getEnvRegulatoryPolicy,
  normalizeRegulatoryPolicyPayload,
  getRegulatoryPolicy,
  getRegulatoryPolicyState,
  refreshRegulatoryPolicyCache,
  applyRegulatoryPolicy,
};
