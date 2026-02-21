const dayjs = require("dayjs");
const AMLAlert = require("../../models/AMLAlert");
const Transaction = require("../../models/Transaction");
const Account = require("../../models/Account");

const round2 = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const upsertAlert = async ({ userId, accountId, ruleCode, title, description, severity, riskScore, context }) => {
  const fingerprint = `${ruleCode}:${context?.fingerprint || ""}`;
  const existing = await AMLAlert.findOne({
    userId: userId || null,
    accountId: accountId || null,
    ruleCode,
    status: { $in: ["OPEN", "IN_REVIEW", "ESCALATED"] },
    "context.fingerprint": context?.fingerprint || "",
  });
  if (existing) return { created: false, alert: existing };

  const alert = await AMLAlert.create({
    userId: userId || null,
    accountId: accountId || null,
    ruleCode,
    title,
    description,
    severity,
    riskScore,
    status: "OPEN",
    context: { ...(context || {}), fingerprint },
  });
  return { created: true, alert };
};

const detectStructuring = async ({ userId }) => {
  const lookback = dayjs().subtract(24, "hour").toDate();
  const suspiciousTx = await Transaction.find({
    userId,
    createdAt: { $gte: lookback },
    type: { $in: ["DEPOSIT", "TRANSFER"] },
    amount: { $gte: 95000, $lt: 100000 },
    status: "SUCCESS",
  }).select("_id accountId amount createdAt type");

  if (suspiciousTx.length < 3) return [];

  const total = round2(suspiciousTx.reduce((sum, tx) => sum + Number(tx.amount || 0), 0));
  const accountId = suspiciousTx[0]?.accountId || null;
  const first = suspiciousTx[0];
  const last = suspiciousTx[suspiciousTx.length - 1];

  const result = await upsertAlert({
    userId,
    accountId,
    ruleCode: "STRUCTURING_NEAR_THRESHOLD",
    title: "Potential Structuring Pattern Detected",
    description: `Detected ${suspiciousTx.length} near-threshold transactions totaling Rs ${total.toLocaleString("en-IN")} in the last 24h.`,
    severity: "HIGH",
    riskScore: 84,
    context: {
      fingerprint: `count:${suspiciousTx.length}|from:${first?._id}|to:${last?._id}|total:${total}`,
      transactionIds: suspiciousTx.map((tx) => tx._id),
      totalAmount: total,
      windowHours: 24,
    },
  });

  return result.created ? [result.alert] : [];
};

const detectVelocity = async ({ userId }) => {
  const oneHourAgo = dayjs().subtract(1, "hour").toDate();
  const outTx = await Transaction.find({
    userId,
    createdAt: { $gte: oneHourAgo },
    type: { $in: ["TRANSFER", "WITHDRAWAL"] },
    status: "SUCCESS",
  }).select("_id accountId amount");

  if (outTx.length < 10) return [];
  const total = round2(outTx.reduce((sum, tx) => sum + Number(tx.amount || 0), 0));

  const result = await upsertAlert({
    userId,
    accountId: outTx[0]?.accountId || null,
    ruleCode: "HIGH_VELOCITY_OUTBOUND",
    title: "High Velocity Outbound Activity",
    description: `${outTx.length} outbound transactions detected in the last hour (Rs ${total.toLocaleString("en-IN")}).`,
    severity: "CRITICAL",
    riskScore: 92,
    context: {
      fingerprint: `count:${outTx.length}|last:${outTx[outTx.length - 1]?._id}|total:${total}`,
      transactionIds: outTx.map((tx) => tx._id),
      totalAmount: total,
      windowMinutes: 60,
    },
  });

  return result.created ? [result.alert] : [];
};

const detectDormantBurst = async ({ userId }) => {
  const recent = await Transaction.find({ userId }).sort({ createdAt: -1 }).limit(2).select("_id accountId amount createdAt type");
  if (!recent.length) return [];
  const latest = recent[0];
  if (Number(latest.amount || 0) < 50000) return [];
  if (recent.length < 2) return [];

  const previous = recent[1];
  const dormantDays = dayjs(latest.createdAt).diff(dayjs(previous.createdAt), "day");
  if (dormantDays < 90) return [];

  const result = await upsertAlert({
    userId,
    accountId: latest.accountId || null,
    ruleCode: "DORMANT_ACCOUNT_ACTIVITY",
    title: "Dormant Account Reactivation Risk",
    description: `Account had ${dormantDays} inactive days before large movement of Rs ${Number(latest.amount || 0).toLocaleString("en-IN")}.`,
    severity: "HIGH",
    riskScore: 78,
    context: {
      fingerprint: `latest:${latest._id}|previous:${previous._id}|days:${dormantDays}`,
      latestTransactionId: latest._id,
      previousTransactionId: previous._id,
      dormantDays,
    },
  });

  return result.created ? [result.alert] : [];
};

const detectRapidInOut = async ({ userId }) => {
  const twoHoursAgo = dayjs().subtract(2, "hour").toDate();
  const txList = await Transaction.find({
    userId,
    createdAt: { $gte: twoHoursAgo },
    status: "SUCCESS",
    type: { $in: ["DEPOSIT", "PAYMENT_CREDIT", "TRANSFER", "WITHDRAWAL"] },
  })
    .sort({ createdAt: 1 })
    .select("_id accountId type amount createdAt");

  if (txList.length < 2) return [];

  const alerts = [];
  for (let index = 0; index < txList.length - 1; index += 1) {
    const first = txList[index];
    const second = txList[index + 1];
    const isIn = first.type === "DEPOSIT" || first.type === "PAYMENT_CREDIT";
    const isOut = second.type === "TRANSFER" || second.type === "WITHDRAWAL";
    if (!isIn || !isOut) continue;

    const minutes = dayjs(second.createdAt).diff(dayjs(first.createdAt), "minute");
    if (minutes < 0 || minutes > 30) continue;

    const inAmount = Number(first.amount || 0);
    const outAmount = Number(second.amount || 0);
    if (inAmount < 50000 || outAmount < 50000) continue;

    const outRatio = inAmount > 0 ? outAmount / inAmount : 0;
    if (outRatio < 0.75) continue;

    const result = await upsertAlert({
      userId,
      accountId: first.accountId || second.accountId || null,
      ruleCode: "RAPID_IN_OUT_FLOW",
      title: "Rapid In-Out Fund Movement",
      description: `Inflow Rs ${inAmount.toLocaleString("en-IN")} followed by outflow Rs ${outAmount.toLocaleString(
        "en-IN"
      )} within ${minutes} minutes.`,
      severity: "HIGH",
      riskScore: 86,
      context: {
        fingerprint: `in:${first._id}|out:${second._id}|minutes:${minutes}|ratio:${round2(outRatio)}`,
        inflowTransactionId: first._id,
        outflowTransactionId: second._id,
        minutesBetween: minutes,
        ratio: round2(outRatio),
      },
    });
    if (result.created) alerts.push(result.alert);
  }

  return alerts;
};

const runAmlScan = async ({ userId = "" } = {}) => {
  const usersToScan = [];
  if (userId) {
    usersToScan.push(String(userId));
  } else {
    const users = await Account.distinct("userId", {});
    users.forEach((entry) => usersToScan.push(String(entry)));
  }

  const createdAlerts = [];
  for (const currentUserId of usersToScan) {
    const structuring = await detectStructuring({ userId: currentUserId });
    const velocity = await detectVelocity({ userId: currentUserId });
    const dormant = await detectDormantBurst({ userId: currentUserId });
    const rapid = await detectRapidInOut({ userId: currentUserId });
    createdAlerts.push(...structuring, ...velocity, ...dormant, ...rapid);
  }

  return {
    scannedUsers: usersToScan.length,
    createdCount: createdAlerts.length,
    alerts: createdAlerts,
  };
};

module.exports = {
  runAmlScan,
};
