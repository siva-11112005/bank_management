const mongoose = require("mongoose");
const Transaction = require("../models/Transaction");
const MoneyOutPolicyConfig = require("../models/MoneyOutPolicyConfig");

const parsePositiveLimit = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value).toLowerCase() === "true";
};

const getDayBounds = (date = new Date()) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const getEnvMoneyOutPolicy = () => {
  const enforceBeneficiary = parseBoolean(process.env.ENFORCE_BENEFICIARY, false);
  const allowDirectTransferWithPin = parseBoolean(process.env.ALLOW_DIRECT_TRANSFER_WITH_PIN, true);

  return {
    maxSingleTransfer: parsePositiveLimit(process.env.MAX_SINGLE_TRANSFER, 200000),
    dailyTransferLimit: parsePositiveLimit(process.env.DAILY_TRANSFER_LIMIT, 500000),
    highValueTransferThreshold: parsePositiveLimit(process.env.HIGH_VALUE_TRANSFER_THRESHOLD, 50000),
    requireTransferOtpForHighValue:
      String(process.env.REQUIRE_TRANSFER_OTP_FOR_HIGH_VALUE || "false").toLowerCase() === "true",
    maxSingleWithdrawal: parsePositiveLimit(process.env.MAX_SINGLE_WITHDRAWAL, 100000),
    dailyWithdrawalLimit: parsePositiveLimit(process.env.DAILY_WITHDRAWAL_LIMIT, 200000),
    enforceBeneficiary,
    allowDirectTransferWithPin,
    requireVerifiedBeneficiary: enforceBeneficiary && !allowDirectTransferWithPin,
  };
};

const normalizePolicyPayload = (candidate = {}, fallback = getEnvMoneyOutPolicy()) => {
  const enforceBeneficiary = parseBoolean(candidate.enforceBeneficiary, fallback.enforceBeneficiary);
  const allowDirectTransferWithPin = parseBoolean(
    candidate.allowDirectTransferWithPin,
    fallback.allowDirectTransferWithPin
  );

  return {
    maxSingleTransfer: parsePositiveLimit(candidate.maxSingleTransfer, fallback.maxSingleTransfer),
    dailyTransferLimit: parsePositiveLimit(candidate.dailyTransferLimit, fallback.dailyTransferLimit),
    highValueTransferThreshold: parsePositiveLimit(
      candidate.highValueTransferThreshold,
      fallback.highValueTransferThreshold
    ),
    requireTransferOtpForHighValue: parseBoolean(
      candidate.requireTransferOtpForHighValue,
      fallback.requireTransferOtpForHighValue
    ),
    maxSingleWithdrawal: parsePositiveLimit(candidate.maxSingleWithdrawal, fallback.maxSingleWithdrawal),
    dailyWithdrawalLimit: parsePositiveLimit(candidate.dailyWithdrawalLimit, fallback.dailyWithdrawalLimit),
    enforceBeneficiary,
    allowDirectTransferWithPin,
    requireVerifiedBeneficiary: enforceBeneficiary && !allowDirectTransferWithPin,
  };
};

let cachedMoneyOutPolicy = null;
let cachedMoneyOutPolicyMeta = {
  source: "ENV_DEFAULT",
  version: 0,
  updatedAt: null,
};

const getMoneyOutPolicy = () => cachedMoneyOutPolicy || getEnvMoneyOutPolicy();

const getMoneyOutPolicyState = () => ({
  policy: getMoneyOutPolicy(),
  source: cachedMoneyOutPolicyMeta.source,
  version: cachedMoneyOutPolicyMeta.version,
  updatedAt: cachedMoneyOutPolicyMeta.updatedAt,
});

const refreshMoneyOutPolicyCache = async () => {
  const activePolicy = await MoneyOutPolicyConfig.findOne({ key: "DEFAULT", isActive: true }).sort({ version: -1 });
  if (!activePolicy) {
    cachedMoneyOutPolicy = null;
    cachedMoneyOutPolicyMeta = {
      source: "ENV_DEFAULT",
      version: 0,
      updatedAt: null,
    };
    return getMoneyOutPolicyState();
  }

  cachedMoneyOutPolicy = normalizePolicyPayload(activePolicy, getEnvMoneyOutPolicy());
  cachedMoneyOutPolicyMeta = {
    source: activePolicy.source || "ADMIN_DIRECT",
    version: Number(activePolicy.version || 0),
    updatedAt: activePolicy.updatedAt || null,
  };
  return getMoneyOutPolicyState();
};

const applyMoneyOutPolicy = async ({
  nextPolicy = {},
  updatedBy = null,
  source = "ADMIN_DIRECT",
  changeNote = "",
  session = null,
} = {}) => {
  const currentPolicy = getMoneyOutPolicy();
  const normalizedPolicy = normalizePolicyPayload(nextPolicy, currentPolicy);

  const query = { key: "DEFAULT", isActive: true };
  let activePolicyQuery = MoneyOutPolicyConfig.findOne(query).sort({ version: -1 });
  if (session) activePolicyQuery = activePolicyQuery.session(session);
  const activePolicy = await activePolicyQuery;

  const nextVersion = Math.max(1, Number(activePolicy?.version || 0) + 1);

  if (activePolicy) {
    activePolicy.isActive = false;
    await activePolicy.save(session ? { session } : undefined);
  }

  const [createdPolicy] = await MoneyOutPolicyConfig.create(
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

  cachedMoneyOutPolicy = normalizedPolicy;
  cachedMoneyOutPolicyMeta = {
    source: createdPolicy.source || source || "ADMIN_DIRECT",
    version: createdPolicy.version || nextVersion,
    updatedAt: createdPolicy.updatedAt || new Date(),
  };

  return createdPolicy;
};

const getUserDailyTotal = async ({ userId, type }) => {
  if (!userId || !type) {
    return 0;
  }

  const normalizedUserId = typeof userId === "string" ? new mongoose.Types.ObjectId(userId) : userId;
  const { start, end } = getDayBounds();

  const aggregateResult = await Transaction.aggregate([
    {
      $match: {
        userId: normalizedUserId,
        type,
        status: "SUCCESS",
        createdAt: { $gte: start, $lte: end },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: "$amount" },
      },
    },
  ]);

  return Number(aggregateResult[0]?.total || 0);
};

module.exports = {
  getEnvMoneyOutPolicy,
  normalizePolicyPayload,
  getMoneyOutPolicy,
  getMoneyOutPolicyState,
  refreshMoneyOutPolicyCache,
  applyMoneyOutPolicy,
  getUserDailyTotal,
};
