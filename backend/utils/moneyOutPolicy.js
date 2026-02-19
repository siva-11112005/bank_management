const mongoose = require("mongoose");
const Transaction = require("../models/Transaction");

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

const getMoneyOutPolicy = () => {
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
  getMoneyOutPolicy,
  getUserDailyTotal,
};
