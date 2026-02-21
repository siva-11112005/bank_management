const mongoose = require("mongoose");
const dayjs = require("dayjs");
const Account = require("../models/Account");
const User = require("../models/User");
const Transaction = require("../models/Transaction");
const LedgerEntry = require("../models/LedgerEntry");
const AuditLog = require("../models/AuditLog");
const ApprovalRequest = require("../models/ApprovalRequest");
const GLAccount = require("../models/GLAccount");
const InterestAccrual = require("../models/InterestAccrual");
const FixedDeposit = require("../models/FixedDeposit");
const RecurringDeposit = require("../models/RecurringDeposit");
const AMLAlert = require("../models/AMLAlert");
const RegulatoryAlert = require("../models/RegulatoryAlert");
const SettlementRecord = require("../models/SettlementRecord");
const VpaHandle = require("../models/VpaHandle");
const TreasurySnapshot = require("../models/TreasurySnapshot");
const Loan = require("../models/Loan");
const { createNotifications } = require("../utils/notificationService");
const { sendRegulatoryBreachAlertEmail } = require("../utils/emailService");
const { getAdminIdentityLists } = require("../utils/adminIdentity");
const {
  round2,
  postJournal,
  ensureDefaultChartOfAccounts,
  getTrialBalance,
  getProfitAndLoss,
  getBalanceSheet,
  postFixedDepositBookingJournal,
  postFixedDepositClosureJournal,
  postFixedDepositRenewalJournal,
  postRecurringDepositInstallmentJournal,
  postRecurringDepositClosureJournal,
} = require("../utils/coreBanking/glService");
const { runSavingsInterestEod } = require("../utils/coreBanking/interestEngine");
const { runAmlScan } = require("../utils/coreBanking/amlEngine");
const { isApprovalRequired } = require("../utils/adminApprovalPolicy");
const { getRegulatoryPolicy } = require("../utils/regulatoryPolicy");

const toObjectId = (value = "") => {
  const raw = String(value || "").trim();
  return mongoose.Types.ObjectId.isValid(raw) ? new mongoose.Types.ObjectId(raw) : null;
};

const toPositiveNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const toNonNegativeNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
};

const normalizeRail = (value = "") => String(value || "").trim().toUpperCase();
const normalizeRegulatoryAlertStatus = (value = "") => {
  const status = String(value || "")
    .trim()
    .toUpperCase();
  if (["OPEN", "ACKNOWLEDGED", "RESOLVED"].includes(status)) return status;
  return "";
};

const parseDateRange = ({ fromDate, toDate, defaultFrom, defaultTo = new Date() }) => {
  const start = fromDate ? dayjs(fromDate).startOf("day").toDate() : defaultFrom;
  const end = toDate ? dayjs(toDate).endOf("day").toDate() : defaultTo;
  if (Number.isNaN(new Date(start).getTime()) || Number.isNaN(new Date(end).getTime())) {
    throw new Error("Invalid reporting date range.");
  }
  if (new Date(start).getTime() > new Date(end).getTime()) {
    throw new Error("fromDate cannot be greater than toDate.");
  }
  return { from: start, to: end };
};

const buildReferenceId = (prefix) => {
  const random = Math.floor(100000 + Math.random() * 900000);
  return `${prefix}-${Date.now()}-${random}`;
};

const getCurrentDepositAndLoanTotals = async () => {
  const [depositAggregation, loanAggregation] = await Promise.all([
    Account.aggregate([
      {
        $match: {
          status: { $in: ["ACTIVE", "INACTIVE", "FROZEN"] },
        },
      },
      {
        $group: {
          _id: null,
          totalDeposits: { $sum: "$balance" },
        },
      },
    ]),
    Loan.aggregate([
      {
        $match: {
          status: { $in: ["APPROVED"] },
        },
      },
      {
        $group: {
          _id: null,
          totalLoansOutstanding: {
            $sum: {
              $cond: [
                { $gt: [{ $ifNull: ["$remainingAmount", "$principal"] }, 0] },
                { $ifNull: ["$remainingAmount", "$principal"] },
                0,
              ],
            },
          },
        },
      },
    ]),
  ]);

  return {
    totalDeposits: round2(depositAggregation[0]?.totalDeposits || 0),
    totalLoansOutstanding: round2(loanAggregation[0]?.totalLoansOutstanding || 0),
  };
};

const calculateCompoundMaturity = ({ principal, annualRate, years, compoundingPerYear = 4 }) => {
  const n = Math.max(1, Number(compoundingPerYear || 4));
  const r = Math.max(0, Number(annualRate || 0)) / 100;
  const t = Math.max(0, Number(years || 0));
  const amount = Number(principal || 0) * (1 + r / n) ** (n * t);
  return round2(amount);
};

const calculateRdMaturity = ({ monthlyInstallment, annualRate, months }) => {
  const installment = Number(monthlyInstallment || 0);
  const monthlyRate = Math.max(0, Number(annualRate || 0)) / 12 / 100;
  const n = Math.max(0, Number(months || 0));
  if (!Number.isFinite(installment) || installment <= 0 || n <= 0) return 0;
  if (monthlyRate === 0) return round2(installment * n);
  const maturity = installment * ((((1 + monthlyRate) ** n - 1) / monthlyRate) * (1 + monthlyRate));
  return round2(maturity);
};

const parseFixedDepositRequestPayload = (body = {}) => {
  const principal = toPositiveNumber(body.principal);
  const tenureMonths = Math.round(toPositiveNumber(body.tenureMonths));
  const annualRate = toPositiveNumber(body.annualRate, Number(process.env.FD_INTEREST_RATE_DEFAULT || 6.8));
  const compoundingPerYear = Math.round(toPositiveNumber(body.compoundingPerYear, 4));
  const autoRenewEnabled = Boolean(body.autoRenewEnabled);
  const renewalTenureMonths = autoRenewEnabled
    ? Math.round(toPositiveNumber(body.renewalTenureMonths, tenureMonths))
    : 0;

  if (principal < 1000) {
    throw new Error("Minimum FD principal is Rs 1000.");
  }
  if (!tenureMonths || tenureMonths < 1) {
    throw new Error("Invalid FD tenure.");
  }
  if (autoRenewEnabled && (!renewalTenureMonths || renewalTenureMonths < 1)) {
    throw new Error("Invalid FD renewal tenure.");
  }

  return {
    principal,
    tenureMonths,
    annualRate,
    compoundingPerYear,
    autoRenewEnabled,
    renewalTenureMonths,
  };
};

const parseRecurringDepositRequestPayload = (body = {}) => {
  const monthlyInstallment = toPositiveNumber(body.monthlyInstallment);
  const tenureMonths = Math.round(toPositiveNumber(body.tenureMonths));
  const annualRate = toPositiveNumber(body.annualRate, Number(process.env.RD_INTEREST_RATE_DEFAULT || 6.5));
  const autoDebit = Boolean(body.autoDebit);

  if (monthlyInstallment < 100) {
    throw new Error("Minimum RD installment is Rs 100.");
  }
  if (!tenureMonths || tenureMonths < 1) {
    throw new Error("Invalid RD tenure.");
  }

  return {
    monthlyInstallment,
    tenureMonths,
    annualRate,
    autoDebit,
  };
};

const normalizeJournalLines = (lines = []) =>
  lines
    .map((line) => {
      const accountCode = String(line?.accountCode || "")
        .trim()
        .toUpperCase();
      const debit = round2(Number(line?.debit || 0));
      const credit = round2(Number(line?.credit || 0));
      const narration = String(line?.narration || "").trim().slice(0, 200);
      return { accountCode, debit, credit, narration };
    })
    .filter((line) => line.accountCode && (line.debit > 0 || line.credit > 0));

const parseManualJournalPayload = (body = {}) => {
  const description = String(body.description || "Manual GL adjustment").trim().slice(0, 200);
  const requestNote = String(body.requestNote || description || "Manual GL adjustment request")
    .trim()
    .slice(0, 240);
  const postingDateRaw = String(body.postingDate || "").trim();
  const referenceType = String(body.referenceType || "GL_MANUAL_ADJUSTMENT")
    .trim()
    .toUpperCase()
    .slice(0, 80);
  const metadata = typeof body.metadata === "object" && body.metadata !== null ? body.metadata : {};

  let lines = [];
  if (Array.isArray(body.lines) && body.lines.length) {
    lines = normalizeJournalLines(body.lines);
  } else {
    const debitAccountCode = String(body.debitAccountCode || "")
      .trim()
      .toUpperCase();
    const creditAccountCode = String(body.creditAccountCode || "")
      .trim()
      .toUpperCase();
    const amount = round2(Number(body.amount || 0));
    const narration = String(body.narration || description || "Manual GL adjustment").trim().slice(0, 200);
    if (debitAccountCode && creditAccountCode && amount > 0) {
      lines = [
        { accountCode: debitAccountCode, debit: amount, credit: 0, narration },
        { accountCode: creditAccountCode, debit: 0, credit: amount, narration },
      ];
    }
  }

  if (!description) {
    throw new Error("Description is required for manual GL adjustment.");
  }
  if (!Array.isArray(lines) || lines.length < 2) {
    throw new Error("At least two valid GL lines are required.");
  }
  if (lines.length > 40) {
    throw new Error("GL journal line count exceeds allowed limit.");
  }

  const totalDebit = round2(lines.reduce((sum, line) => sum + Number(line.debit || 0), 0));
  const totalCredit = round2(lines.reduce((sum, line) => sum + Number(line.credit || 0), 0));
  if (totalDebit <= 0 || totalCredit <= 0 || totalDebit !== totalCredit) {
    throw new Error("Journal debit and credit totals must be positive and equal.");
  }

  const postingDate = postingDateRaw ? new Date(postingDateRaw) : new Date();
  if (Number.isNaN(postingDate.getTime())) {
    throw new Error("Invalid posting date.");
  }

  return {
    description,
    requestNote,
    postingDate: postingDate.toISOString(),
    referenceType,
    lines,
    metadata,
    totalDebit,
    totalCredit,
  };
};

const buildTreasurySnapshotPayload = async (body = {}) => {
  const asOfDate = body?.asOfDate ? new Date(body.asOfDate) : new Date();
  if (Number.isNaN(asOfDate.getTime())) {
    throw new Error("Invalid asOfDate value.");
  }

  const cashInVault = toNonNegativeNumber(body?.cashInVault, 0);
  const rbiBalance = toNonNegativeNumber(body?.rbiBalance, 0);
  const nostroBalance = toNonNegativeNumber(body?.nostroBalance, 0);
  const interbankObligations = toNonNegativeNumber(body?.interbankObligations, 0);
  const remarks = String(body?.remarks || "")
    .trim()
    .slice(0, 240);
  const metadata = typeof body?.metadata === "object" && body?.metadata !== null ? body.metadata : {};

  const derivedTotals = await getCurrentDepositAndLoanTotals();
  const totalDeposits =
    body && Object.prototype.hasOwnProperty.call(body, "totalDeposits")
      ? toNonNegativeNumber(body.totalDeposits, derivedTotals.totalDeposits)
      : derivedTotals.totalDeposits;
  const totalLoansOutstanding =
    body && Object.prototype.hasOwnProperty.call(body, "totalLoansOutstanding")
      ? toNonNegativeNumber(body.totalLoansOutstanding, derivedTotals.totalLoansOutstanding)
      : derivedTotals.totalLoansOutstanding;

  const liquidityPool = round2(cashInVault + rbiBalance + nostroBalance);
  const netLiquidity = round2(liquidityPool - interbankObligations);
  const crrRatio = totalDeposits > 0 ? round2((rbiBalance / totalDeposits) * 100) : 0;
  const slrRatio = totalDeposits > 0 ? round2((liquidityPool / totalDeposits) * 100) : 0;
  const lcrRatio = interbankObligations > 0 ? round2((liquidityPool / interbankObligations) * 100) : 0;
  const asOfDateKey = dayjs(asOfDate).format("YYYY-MM-DD");

  return {
    asOfDate: asOfDate.toISOString(),
    asOfDateKey,
    cashInVault,
    rbiBalance,
    nostroBalance,
    interbankObligations,
    totalDeposits,
    totalLoansOutstanding,
    crrRatio,
    slrRatio,
    lcrRatio,
    netLiquidity,
    remarks,
    metadata,
  };
};

const createTreasurySnapshotFromPayload = async ({
  payload = {},
  actorUserId = null,
  source = "ADMIN_SNAPSHOT",
  approvalRequestId = null,
  ipAddress = "",
  userAgent = "",
} = {}) => {
  const snapshot = await TreasurySnapshot.create({
    asOfDate: payload.asOfDate ? new Date(payload.asOfDate) : new Date(),
    cashInVault: toNonNegativeNumber(payload.cashInVault, 0),
    rbiBalance: toNonNegativeNumber(payload.rbiBalance, 0),
    nostroBalance: toNonNegativeNumber(payload.nostroBalance, 0),
    interbankObligations: toNonNegativeNumber(payload.interbankObligations, 0),
    totalDeposits: toNonNegativeNumber(payload.totalDeposits, 0),
    totalLoansOutstanding: toNonNegativeNumber(payload.totalLoansOutstanding, 0),
    crrRatio: Number(payload.crrRatio || 0),
    slrRatio: Number(payload.slrRatio || 0),
    lcrRatio: Number(payload.lcrRatio || 0),
    netLiquidity: Number(payload.netLiquidity || 0),
    remarks: String(payload.remarks || "").slice(0, 240),
    createdBy: actorUserId || null,
    metadata: {
      ...(payload.metadata || {}),
      source,
      generatedAt: new Date().toISOString(),
      autoDerivedTotals: true,
      approvalRequestId: approvalRequestId || null,
    },
  });

  await AuditLog.create({
    userId: actorUserId,
    action: "TREASURY_SNAPSHOT_CREATED",
    ipAddress,
    userAgent,
    metadata: {
      snapshotId: snapshot._id,
      asOfDate: snapshot.asOfDate,
      crrRatio: snapshot.crrRatio,
      slrRatio: snapshot.slrRatio,
      lcrRatio: snapshot.lcrRatio,
      netLiquidity: snapshot.netLiquidity,
      source,
      approvalRequestId: approvalRequestId || null,
    },
  });

  return snapshot;
};

const buildRegulatoryReportData = async ({ fromDate, toDate, cashThreshold } = {}) => {
  const { from, to } = parseDateRange({
    fromDate,
    toDate,
    defaultFrom: dayjs().startOf("month").toDate(),
  });

  const regulatoryPolicy = getRegulatoryPolicy();
  const normalizedCashThreshold = Number(cashThreshold || regulatoryPolicy.ctrCashThreshold || 1000000);
  if (!Number.isFinite(normalizedCashThreshold) || normalizedCashThreshold <= 0) {
    throw new Error("Invalid cashThreshold value.");
  }

  const ctrMatch = {
    createdAt: { $gte: from, $lte: to },
    status: "SUCCESS",
    type: { $in: ["DEPOSIT", "WITHDRAWAL"] },
    amount: { $gte: normalizedCashThreshold },
  };

  const strMatch = {
    createdAt: { $gte: from, $lte: to },
    severity: { $in: ["HIGH", "CRITICAL"] },
  };

  const [ctrTransactions, ctrByType, strTotalCount, strOpenCount, strCriticalCount, strRuleBreakdown, settlementBreakdown, latestSnapshot] =
    await Promise.all([
      Transaction.find(ctrMatch)
        .sort({ createdAt: -1 })
        .limit(100)
        .select("type amount createdAt status userId accountId description")
        .populate("userId", "firstName lastName email")
        .populate("accountId", "accountNumber"),
      Transaction.aggregate([
        { $match: ctrMatch },
        {
          $group: {
            _id: "$type",
            count: { $sum: 1 },
            totalAmount: { $sum: "$amount" },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      AMLAlert.countDocuments(strMatch),
      AMLAlert.countDocuments({
        ...strMatch,
        status: { $in: ["OPEN", "IN_REVIEW", "ESCALATED"] },
      }),
      AMLAlert.countDocuments({ ...strMatch, severity: "CRITICAL" }),
      AMLAlert.aggregate([
        { $match: strMatch },
        {
          $group: {
            _id: "$ruleCode",
            count: { $sum: 1 },
            highestSeverity: { $max: "$severity" },
          },
        },
        { $sort: { count: -1, _id: 1 } },
        { $limit: 10 },
      ]),
      SettlementRecord.aggregate([
        {
          $match: {
            createdAt: { $gte: from, $lte: to },
          },
        },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            totalAmount: { $sum: "$amount" },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      TreasurySnapshot.findOne().sort({ asOfDate: -1, createdAt: -1 }),
    ]);

  const ctrTotalAmount = round2(ctrByType.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0));
  const ctrTotalCount = ctrByType.reduce((sum, item) => sum + Number(item.count || 0), 0);
  const ctrByTypeMap = ctrByType.reduce((accumulator, item) => {
    accumulator[item._id] = {
      count: Number(item.count || 0),
      totalAmount: round2(item.totalAmount || 0),
    };
    return accumulator;
  }, {});

  const settlementByStatus = settlementBreakdown.reduce((accumulator, item) => {
    accumulator[item._id] = {
      count: Number(item.count || 0),
      totalAmount: round2(item.totalAmount || 0),
    };
    return accumulator;
  }, {});

  const fallbackTotals = latestSnapshot ? null : await getCurrentDepositAndLoanTotals();
  const liquidity = latestSnapshot
    ? {
        asOfDate: latestSnapshot.asOfDate,
        cashInVault: round2(latestSnapshot.cashInVault || 0),
        rbiBalance: round2(latestSnapshot.rbiBalance || 0),
        nostroBalance: round2(latestSnapshot.nostroBalance || 0),
        interbankObligations: round2(latestSnapshot.interbankObligations || 0),
        totalDeposits: round2(latestSnapshot.totalDeposits || 0),
        totalLoansOutstanding: round2(latestSnapshot.totalLoansOutstanding || 0),
        crrRatio: round2(latestSnapshot.crrRatio || 0),
        slrRatio: round2(latestSnapshot.slrRatio || 0),
        lcrRatio: round2(latestSnapshot.lcrRatio || 0),
        netLiquidity: round2(latestSnapshot.netLiquidity || 0),
      }
    : {
        asOfDate: new Date(),
        cashInVault: 0,
        rbiBalance: 0,
        nostroBalance: 0,
        interbankObligations: 0,
        totalDeposits: round2(fallbackTotals?.totalDeposits || 0),
        totalLoansOutstanding: round2(fallbackTotals?.totalLoansOutstanding || 0),
        crrRatio: 0,
        slrRatio: 0,
        lcrRatio: 0,
        netLiquidity: 0,
      };

  const loanToDepositRatio =
    liquidity.totalDeposits > 0 ? round2((liquidity.totalLoansOutstanding / liquidity.totalDeposits) * 100) : 0;

  const indicators = [
    {
      code: "CTR_REVIEW",
      status: ctrTotalCount > 0 ? "ATTENTION" : "NORMAL",
      message:
        ctrTotalCount > 0
          ? `${ctrTotalCount} cash transaction(s) crossed threshold.`
          : "No high-value cash transactions in selected range.",
    },
    {
      code: "STR_ALERTS",
      status: strOpenCount >= Number(regulatoryPolicy.openStrAlertThreshold || 1) ? "ATTENTION" : "NORMAL",
      message:
        strOpenCount >= Number(regulatoryPolicy.openStrAlertThreshold || 1)
          ? `${strOpenCount} suspicious alert(s) pending review.`
          : "Open STR alerts are within policy threshold.",
    },
    {
      code: "STR_CRITICAL",
      status: strCriticalCount >= Number(regulatoryPolicy.criticalStrAlertThreshold || 1) ? "ATTENTION" : "NORMAL",
      message:
        strCriticalCount >= Number(regulatoryPolicy.criticalStrAlertThreshold || 1)
          ? `${strCriticalCount} critical suspicious alert(s) detected.`
          : "Critical STR alerts are within policy threshold.",
    },
    {
      code: "LCR_WATCH",
      status: liquidity.lcrRatio >= Number(regulatoryPolicy.minLcrRatio || 100) ? "NORMAL" : "ATTENTION",
      message: `Liquidity coverage ratio is ${liquidity.lcrRatio.toFixed(2)}%.`,
    },
    {
      code: "LTD_WATCH",
      status:
        loanToDepositRatio <= Number(regulatoryPolicy.maxLoanToDepositRatio || 90) || loanToDepositRatio === 0
          ? "NORMAL"
          : "ATTENTION",
      message: `Loan-to-deposit ratio is ${loanToDepositRatio.toFixed(2)}%.`,
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    range: {
      from: from.toISOString(),
      to: to.toISOString(),
      cashThreshold: normalizedCashThreshold,
    },
    ctr: {
      count: ctrTotalCount,
      totalAmount: ctrTotalAmount,
      byType: ctrByTypeMap,
      transactions: ctrTransactions,
    },
    str: {
      totalAlerts: strTotalCount,
      openAlerts: strOpenCount,
      criticalAlerts: strCriticalCount,
      topRules: strRuleBreakdown,
    },
    alm: {
      liquidity,
      loanToDepositRatio,
    },
    settlement: {
      byStatus: settlementByStatus,
    },
    policy: {
      ctrCashThreshold: Number(regulatoryPolicy.ctrCashThreshold || 1000000),
      minLcrRatio: Number(regulatoryPolicy.minLcrRatio || 100),
      maxLoanToDepositRatio: Number(regulatoryPolicy.maxLoanToDepositRatio || 90),
      openStrAlertThreshold: Number(regulatoryPolicy.openStrAlertThreshold || 1),
      criticalStrAlertThreshold: Number(regulatoryPolicy.criticalStrAlertThreshold || 1),
      effectiveCashThreshold: normalizedCashThreshold,
      overrideCashThresholdApplied:
        cashThreshold !== undefined && cashThreshold !== null && String(cashThreshold).trim() !== "",
    },
    indicators,
  };
};

const buildRegulatoryPublishPayload = ({ report = {}, publishNote = "" } = {}) => ({
  range: report.range || {},
  summary: {
    ctrCount: Number(report?.ctr?.count || 0),
    ctrTotalAmount: Number(report?.ctr?.totalAmount || 0),
    openStrAlerts: Number(report?.str?.openAlerts || 0),
    criticalStrAlerts: Number(report?.str?.criticalAlerts || 0),
    lcrRatio: Number(report?.alm?.liquidity?.lcrRatio || 0),
    loanToDepositRatio: Number(report?.alm?.loanToDepositRatio || 0),
  },
  publishNote: String(publishNote || "Regulatory report publish requested")
    .trim()
    .slice(0, 240),
  generatedAt: report.generatedAt,
});

const runRegulatoryBreachMonitor = async ({
  fromDate,
  toDate,
  cashThreshold,
  source = "SCHEDULER_MONITOR",
  monitorDate = new Date(),
  actorUserId = null,
  ipAddress = "",
  userAgent = "",
} = {}) => {
  const report = await buildRegulatoryReportData({ fromDate, toDate, cashThreshold });
  const attentionIndicators = (report?.indicators || []).filter(
    (indicator) => String(indicator?.status || "").toUpperCase() === "ATTENTION"
  );

  const monitorDateKey = dayjs(monitorDate).isValid() ? dayjs(monitorDate).format("YYYY-MM-DD") : dayjs().format("YYYY-MM-DD");

  if (!attentionIndicators.length) {
    return {
      monitorDateKey,
      source,
      evaluatedIndicators: Number(report?.indicators?.length || 0),
      attentionIndicators: 0,
      alertsCreated: 0,
      alertsSkipped: 0,
      emailsSent: 0,
      reportRange: report?.range || {},
    };
  }

  const fromKey = dayjs(report?.range?.from).isValid() ? dayjs(report.range.from).format("YYYYMMDD") : "from";
  const toKey = dayjs(report?.range?.to).isValid() ? dayjs(report.range.to).format("YYYYMMDD") : "to";
  const alertCandidates = attentionIndicators.map((indicator) => ({
    code: String(indicator?.code || "REGULATORY_ALERT").toUpperCase(),
    message: String(indicator?.message || "Regulatory threshold attention required.").trim(),
    alertKey: `REG_MONITOR:${monitorDateKey}:${String(indicator?.code || "REGULATORY_ALERT").toUpperCase()}:${fromKey}:${toKey}`,
  }));

  const existingAlerts = await RegulatoryAlert.find({
    alertKey: { $in: alertCandidates.map((item) => item.alertKey) },
  })
    .select("alertKey")
    .lean();

  const existingKeySet = new Set((existingAlerts || []).map((entry) => String(entry?.alertKey || "")));
  const freshAlerts = alertCandidates.filter((item) => !existingKeySet.has(item.alertKey));

  if (!freshAlerts.length) {
    return {
      monitorDateKey,
      source,
      evaluatedIndicators: Number(report?.indicators?.length || 0),
      attentionIndicators: attentionIndicators.length,
      alertsCreated: 0,
      alertsSkipped: attentionIndicators.length,
      emailsSent: 0,
      reportRange: report?.range || {},
    };
  }

  const persistedAlerts = [];
  for (const alert of freshAlerts) {
    try {
      const created = await RegulatoryAlert.create({
        alertKey: alert.alertKey,
        indicatorCode: alert.code,
        indicatorMessage: alert.message,
        source,
        monitorDateKey,
        reportRange: {
          from: report?.range?.from ? new Date(report.range.from) : null,
          to: report?.range?.to ? new Date(report.range.to) : null,
          cashThreshold: Number(report?.range?.cashThreshold || 0),
        },
        metadata: {
          reportRange: report?.range || {},
        },
      });
      persistedAlerts.push(created);
    } catch (error) {
      if (!(error && Number(error.code) === 11000)) {
        throw error;
      }
    }
  }

  if (!persistedAlerts.length) {
    return {
      monitorDateKey,
      source,
      evaluatedIndicators: Number(report?.indicators?.length || 0),
      attentionIndicators: attentionIndicators.length,
      alertsCreated: 0,
      alertsSkipped: attentionIndicators.length,
      emailsSent: 0,
      reportRange: report?.range || {},
    };
  }

  const adminIdentityLists = getAdminIdentityLists();
  const adminUsers = await User.find({
    isActive: { $ne: false },
    $or: [
      { role: "ADMIN" },
      { email: { $in: adminIdentityLists.emails } },
      { phone: { $in: adminIdentityLists.phones } },
    ],
  }).select("firstName lastName email phone role");

  const uniqueAdminUsers = [];
  const seenAdminIds = new Set();
  for (const adminUser of adminUsers) {
    const id = String(adminUser?._id || "");
    if (!id || seenAdminIds.has(id)) continue;
    seenAdminIds.add(id);
    uniqueAdminUsers.push(adminUser);
  }

  if (uniqueAdminUsers.length) {
    const inAppNotifications = [];
    persistedAlerts.forEach((alert) => {
      uniqueAdminUsers.forEach((adminUser) => {
        inAppNotifications.push({
          userId: adminUser._id,
          title: `Regulatory Alert: ${alert.indicatorCode}`,
          message: `${alert.indicatorMessage} Please review Core Banking Regulatory dashboard.`,
          category: "ADMIN",
          type: "WARNING",
          actionLink: "/core-banking?module=regulatory",
          metadata: {
            alertKey: alert.alertKey,
            indicatorCode: alert.indicatorCode,
            source,
            reportRange: report?.range || {},
          },
        });
      });
    });

    if (inAppNotifications.length) {
      await createNotifications(inAppNotifications);
    }
  }

  let emailsSent = 0;
  const emailTargets = uniqueAdminUsers.filter((entry) => String(entry?.email || "").trim());
  for (const adminUser of emailTargets) {
    const userName = `${adminUser.firstName || ""} ${adminUser.lastName || ""}`.trim() || "Admin";
    for (const alert of persistedAlerts) {
      const sent = await sendRegulatoryBreachAlertEmail({
        email: adminUser.email,
        userName,
        indicatorCode: alert.indicatorCode,
        indicatorMessage: alert.indicatorMessage,
        rangeFrom: report?.range?.from,
        rangeTo: report?.range?.to,
        source,
      });
      if (sent) emailsSent += 1;
    }
  }

  await Promise.all(
    persistedAlerts.map((alert) =>
      AuditLog.create({
        userId: actorUserId || null,
        action: "ADMIN_REGULATORY_BREACH_ALERTED",
        ipAddress: ipAddress || "",
        userAgent: userAgent || "",
        metadata: {
          alertKey: alert.alertKey,
          indicatorCode: alert.indicatorCode,
          indicatorMessage: alert.indicatorMessage,
          regulatoryAlertId: alert._id,
          source,
          monitorDateKey,
          reportRange: report?.range || {},
          notifiedAdminCount: uniqueAdminUsers.length,
          emailRecipientCount: emailTargets.length,
        },
      })
    )
  );

  return {
    monitorDateKey,
    source,
    evaluatedIndicators: Number(report?.indicators?.length || 0),
    attentionIndicators: attentionIndicators.length,
    alertsCreated: persistedAlerts.length,
    alertsSkipped: attentionIndicators.length - persistedAlerts.length,
    emailsSent,
    notifiedAdminCount: uniqueAdminUsers.length,
    reportRange: report?.range || {},
  };
};

const toCsvCell = (value) => {
  const normalized = value === null || value === undefined ? "" : String(value);
  const escaped = normalized.replace(/"/g, '""').replace(/\r?\n/g, " ").trim();
  if (/[" ,\n]/.test(escaped)) return `"${escaped}"`;
  return escaped;
};

const buildCsvContent = (rows = []) => rows.map((row) => row.map((cell) => toCsvCell(cell)).join(",")).join("\n");

const buildRegulatoryReportCsvContent = (report = {}) => {
  const rows = [];
  rows.push(["Section", "Metric", "Value"]);
  rows.push(["META", "Generated At", report.generatedAt || ""]);
  rows.push(["META", "From", report?.range?.from || ""]);
  rows.push(["META", "To", report?.range?.to || ""]);
  rows.push(["META", "Cash Threshold", Number(report?.range?.cashThreshold || 0)]);
  rows.push(["POLICY", "Min LCR Ratio", Number(report?.policy?.minLcrRatio || 0)]);
  rows.push(["POLICY", "Max Loan To Deposit Ratio", Number(report?.policy?.maxLoanToDepositRatio || 0)]);
  rows.push(["POLICY", "Open STR Alert Threshold", Number(report?.policy?.openStrAlertThreshold || 0)]);
  rows.push(["POLICY", "Critical STR Alert Threshold", Number(report?.policy?.criticalStrAlertThreshold || 0)]);
  rows.push(["CTR", "Count", Number(report?.ctr?.count || 0)]);
  rows.push(["CTR", "Total Amount", Number(report?.ctr?.totalAmount || 0)]);
  rows.push(["STR", "Total Alerts", Number(report?.str?.totalAlerts || 0)]);
  rows.push(["STR", "Open Alerts", Number(report?.str?.openAlerts || 0)]);
  rows.push(["STR", "Critical Alerts", Number(report?.str?.criticalAlerts || 0)]);
  rows.push(["ALM", "LCR Ratio", Number(report?.alm?.liquidity?.lcrRatio || 0)]);
  rows.push(["ALM", "Loan To Deposit Ratio", Number(report?.alm?.loanToDepositRatio || 0)]);
  rows.push(["ALM", "Net Liquidity", Number(report?.alm?.liquidity?.netLiquidity || 0)]);

  rows.push([]);
  rows.push(["CTR_TRANSACTIONS", "Transaction Date", "Type", "Amount", "User", "Account", "Description"]);
  for (const tx of report?.ctr?.transactions || []) {
    const userName = `${tx?.userId?.firstName || ""} ${tx?.userId?.lastName || ""}`.trim() || tx?.userId?.email || "";
    rows.push([
      "CTR_TRANSACTIONS",
      tx?.createdAt ? new Date(tx.createdAt).toISOString() : "",
      tx?.type || "",
      Number(tx?.amount || 0),
      userName,
      tx?.accountId?.accountNumber || "",
      tx?.description || "",
    ]);
  }

  rows.push([]);
  rows.push(["STR_TOP_RULES", "Rule Code", "Alert Count", "Highest Severity"]);
  for (const rule of report?.str?.topRules || []) {
    rows.push(["STR_TOP_RULES", rule?._id || "", Number(rule?.count || 0), rule?.highestSeverity || ""]);
  }

  rows.push([]);
  rows.push(["SETTLEMENT", "Status", "Count", "Total Amount"]);
  const settlementRows = Object.entries(report?.settlement?.byStatus || {});
  for (const [status, summary] of settlementRows) {
    rows.push(["SETTLEMENT", status, Number(summary?.count || 0), Number(summary?.totalAmount || 0)]);
  }

  rows.push([]);
  rows.push(["INDICATORS", "Code", "Status", "Message"]);
  for (const indicator of report?.indicators || []) {
    rows.push(["INDICATORS", indicator?.code || "", indicator?.status || "", indicator?.message || ""]);
  }

  return buildCsvContent(rows);
};

const publishRegulatoryReportFromPayload = async ({
  payload = {},
  actorUserId = null,
  source = "ADMIN_DIRECT",
  approvalRequestId = null,
  ipAddress = "",
  userAgent = "",
} = {}) => {
  const range = payload.range || {};
  const summary = payload.summary || {};
  const publishNote = String(payload.publishNote || "Regulatory report published").slice(0, 240);
  const publishedAt = new Date();

  await AuditLog.create({
    userId: actorUserId,
    action: "ADMIN_REGULATORY_REPORT_PUBLISHED",
    ipAddress,
    userAgent,
    metadata: {
      source,
      approvalRequestId: approvalRequestId || null,
      range,
      summary,
      publishNote,
      publishedAt: publishedAt.toISOString(),
    },
  });

  return {
    publishedAt: publishedAt.toISOString(),
    source,
    publishNote,
    range,
    summary,
  };
};

const resolveRegulatoryAlertFromPayload = async ({
  payload = {},
  actorUserId = null,
  source = "ADMIN_DIRECT",
  approvalRequestId = null,
  ipAddress = "",
  userAgent = "",
} = {}) => {
  const alertId = toObjectId(payload.alertId);
  if (!alertId) {
    throw new Error("Invalid alert identifier.");
  }

  const resolutionNote = String(payload.resolutionNote || "")
    .trim()
    .slice(0, 300);
  if (!resolutionNote) {
    throw new Error("Resolution note is required.");
  }

  const alert = await RegulatoryAlert.findById(alertId);
  if (!alert) {
    throw new Error("Regulatory alert not found.");
  }
  if (alert.status === "RESOLVED") {
    throw new Error("Alert is already resolved.");
  }

  const previousStatus = alert.status;
  const now = new Date();
  if (!alert.acknowledgedAt) {
    alert.acknowledgedAt = now;
    alert.acknowledgedBy = actorUserId || null;
  }
  alert.status = "RESOLVED";
  alert.resolvedBy = actorUserId || null;
  alert.resolvedAt = now;
  alert.resolutionNote = resolutionNote;
  await alert.save();

  await AuditLog.create({
    userId: actorUserId,
    action: "ADMIN_REGULATORY_ALERT_RESOLVED",
    ipAddress: ipAddress || "",
    userAgent: userAgent || "",
    metadata: {
      alertId: alert._id,
      alertKey: alert.alertKey,
      indicatorCode: alert.indicatorCode,
      previousStatus,
      nextStatus: alert.status,
      source,
      approvalRequestId: approvalRequestId || null,
      resolutionNote: alert.resolutionNote,
    },
  });

  return alert;
};

exports.createTreasurySnapshotFromPayload = createTreasurySnapshotFromPayload;
exports.buildRegulatoryReportData = buildRegulatoryReportData;
exports.publishRegulatoryReportFromPayload = publishRegulatoryReportFromPayload;
exports.resolveRegulatoryAlertFromPayload = resolveRegulatoryAlertFromPayload;
exports.runRegulatoryBreachMonitor = runRegulatoryBreachMonitor;

exports.bootstrapCoreBanking = async (_req, res) => {
  try {
    const result = await ensureDefaultChartOfAccounts();
    return res.status(200).json({
      success: true,
      message: "Core banking chart of accounts is ready.",
      result,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getGlAccounts = async (_req, res) => {
  try {
    const accounts = await GLAccount.find().sort({ code: 1 });
    return res.status(200).json({
      success: true,
      total: accounts.length,
      accounts,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getTrialBalanceReport = async (req, res) => {
  try {
    const report = await getTrialBalance({ asOfDate: req.query.asOfDate });
    return res.status(200).json({ success: true, report });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getProfitAndLossReport = async (req, res) => {
  try {
    const report = await getProfitAndLoss({ fromDate: req.query.fromDate, toDate: req.query.toDate });
    return res.status(200).json({ success: true, report });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getBalanceSheetReport = async (req, res) => {
  try {
    const report = await getBalanceSheet({ asOfDate: req.query.asOfDate });
    return res.status(200).json({ success: true, report });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.requestManualGlJournal = async (req, res) => {
  try {
    const payload = parseManualJournalPayload(req.body || {});
    const approvalRequired = isApprovalRequired("GL_MANUAL_JOURNAL");

    if (!approvalRequired) {
      const journal = await postJournal({
        description: payload.description,
        lines: payload.lines,
        postingDate: payload.postingDate,
        referenceType: payload.referenceType,
        referenceId: null,
        source: "ADMIN_DIRECT",
        metadata: {
          ...(payload.metadata || {}),
          initiatedBy: req.userId,
          approvalBypassed: true,
        },
      });

      await AuditLog.create({
        userId: req.userId,
        action: "ADMIN_GL_MANUAL_JOURNAL_POSTED",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || "",
        metadata: {
          journalId: journal._id,
          journalNumber: journal.journalNumber,
          totalDebit: journal.totalDebit,
          totalCredit: journal.totalCredit,
          description: payload.description,
          approvalBypassed: true,
        },
      });

      return res.status(201).json({
        success: true,
        pendingApproval: false,
        message: "Manual GL journal posted directly (approval mode disabled).",
        journal,
      });
    }

    const approvalRequest = await ApprovalRequest.create({
      actionType: "GL_MANUAL_JOURNAL",
      targetType: "GL_JOURNAL",
      targetId: new mongoose.Types.ObjectId(),
      payload,
      requestNote: payload.requestNote,
      requestedBy: req.userId,
    });

    await AuditLog.create({
      userId: req.userId,
      action: "ADMIN_APPROVAL_REQUEST_CREATED",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"] || "",
      metadata: {
        approvalRequestId: approvalRequest._id,
        actionType: approvalRequest.actionType,
        targetType: approvalRequest.targetType,
        targetId: approvalRequest.targetId,
        totalDebit: payload.totalDebit,
        totalCredit: payload.totalCredit,
      },
    });

    return res.status(202).json({
      success: true,
      pendingApproval: true,
      message: "Manual GL journal submitted for maker-checker approval.",
      approvalRequest,
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.runInterestEodJob = async (req, res) => {
  try {
    const forDate = req.body?.forDate ? new Date(req.body.forDate) : new Date();
    if (Number.isNaN(forDate.getTime())) {
      return res.status(400).json({ success: false, message: "Invalid forDate value." });
    }
    const result = await runSavingsInterestEod({ forDate });
    return res.status(200).json({
      success: true,
      message: "Interest EOD execution completed.",
      result,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.listInterestAccruals = async (req, res) => {
  try {
    const limit = Math.min(500, Math.max(1, Number(req.query.limit || 100)));
    const filter = {};
    if (req.query.dateKey) filter.dateKey = String(req.query.dateKey).trim();
    if (req.query.status) filter.status = String(req.query.status).trim().toUpperCase();
    if (req.query.userId && mongoose.Types.ObjectId.isValid(String(req.query.userId))) {
      filter.userId = new mongoose.Types.ObjectId(String(req.query.userId));
    }

    const accruals = await InterestAccrual.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("accountId", "accountNumber accountType")
      .populate("userId", "firstName lastName email");

    return res.status(200).json({
      success: true,
      total: accruals.length,
      accruals,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createTreasurySnapshot = async (req, res) => {
  try {
    const payload = await buildTreasurySnapshotPayload(req.body || {});
    const approvalRequired = isApprovalRequired("TREASURY_SNAPSHOT_CREATE");

    if (approvalRequired) {
      const existingRequest = await ApprovalRequest.findOne({
        actionType: "TREASURY_SNAPSHOT_CREATE",
        targetType: "TREASURY_SNAPSHOT",
        status: "PENDING",
        "payload.asOfDateKey": payload.asOfDateKey,
      });

      if (existingRequest) {
        return res.status(202).json({
          success: true,
          pendingApproval: true,
          message: "An approval request is already pending for treasury snapshot on this date.",
          approvalRequest: existingRequest,
        });
      }

      const approvalRequest = await ApprovalRequest.create({
        actionType: "TREASURY_SNAPSHOT_CREATE",
        targetType: "TREASURY_SNAPSHOT",
        targetId: new mongoose.Types.ObjectId(),
        payload,
        requestNote: `Treasury snapshot creation requested for ${payload.asOfDateKey}`,
        requestedBy: req.userId,
      });

      await AuditLog.create({
        userId: req.userId,
        action: "ADMIN_APPROVAL_REQUEST_CREATED",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || "",
        metadata: {
          approvalRequestId: approvalRequest._id,
          actionType: approvalRequest.actionType,
          targetType: approvalRequest.targetType,
          targetId: approvalRequest.targetId,
          asOfDateKey: payload.asOfDateKey,
        },
      });

      return res.status(202).json({
        success: true,
        pendingApproval: true,
        message: "Treasury snapshot submitted for approval.",
        approvalRequest,
      });
    }

    const snapshot = await createTreasurySnapshotFromPayload({
      payload,
      actorUserId: req.userId,
      source: "ADMIN_DIRECT",
      approvalRequestId: null,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"] || "",
    });

    return res.status(201).json({
      success: true,
      pendingApproval: false,
      message: "Treasury snapshot created successfully.",
      snapshot,
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.listTreasurySnapshots = async (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 25)));
    const filter = {};

    if (req.query.fromDate || req.query.toDate) {
      const { from, to } = parseDateRange({
        fromDate: req.query.fromDate,
        toDate: req.query.toDate,
        defaultFrom: new Date("2000-01-01T00:00:00.000Z"),
      });
      filter.asOfDate = { $gte: from, $lte: to };
    }

    const snapshots = await TreasurySnapshot.find(filter)
      .sort({ asOfDate: -1, createdAt: -1 })
      .limit(limit)
      .populate("createdBy", "firstName lastName email");

    return res.status(200).json({
      success: true,
      total: snapshots.length,
      snapshots,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.requestRegulatoryReportPublish = async (req, res) => {
  try {
    const report = await buildRegulatoryReportData({
      fromDate: req.body?.fromDate || req.query?.fromDate,
      toDate: req.body?.toDate || req.query?.toDate,
      cashThreshold: req.body?.cashThreshold || req.query?.cashThreshold,
    });
    const publishPayload = buildRegulatoryPublishPayload({
      report,
      publishNote: req.body?.publishNote || "Regulatory report publish requested",
    });

    const approvalRequired = isApprovalRequired("REGULATORY_REPORT_PUBLISH");
    if (approvalRequired) {
      const existingRequest = await ApprovalRequest.findOne({
        actionType: "REGULATORY_REPORT_PUBLISH",
        targetType: "REGULATORY_REPORT",
        status: "PENDING",
        "payload.range.from": publishPayload.range.from,
        "payload.range.to": publishPayload.range.to,
      });

      if (existingRequest) {
        return res.status(202).json({
          success: true,
          pendingApproval: true,
          message: "A publish approval request is already pending for this report range.",
          approvalRequest: existingRequest,
        });
      }

      const approvalRequest = await ApprovalRequest.create({
        actionType: "REGULATORY_REPORT_PUBLISH",
        targetType: "REGULATORY_REPORT",
        targetId: new mongoose.Types.ObjectId(),
        payload: publishPayload,
        requestNote: publishNote || "Regulatory report publish request",
        requestedBy: req.userId,
      });

      await AuditLog.create({
        userId: req.userId,
        action: "ADMIN_APPROVAL_REQUEST_CREATED",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || "",
        metadata: {
          approvalRequestId: approvalRequest._id,
          actionType: approvalRequest.actionType,
          targetType: approvalRequest.targetType,
          targetId: approvalRequest.targetId,
          range: publishPayload.range,
        },
      });

      return res.status(202).json({
        success: true,
        pendingApproval: true,
        message: "Regulatory report publish request submitted for approval.",
        approvalRequest,
      });
    }

    const publication = await publishRegulatoryReportFromPayload({
      payload: publishPayload,
      actorUserId: req.userId,
      source: "ADMIN_DIRECT",
      approvalRequestId: null,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"] || "",
    });

    return res.status(200).json({
      success: true,
      pendingApproval: false,
      message: "Regulatory report published successfully.",
      publication,
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.listRegulatoryPublications = async (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 25)));
    const logs = await AuditLog.find({ action: "ADMIN_REGULATORY_REPORT_PUBLISHED" })
      .populate("userId", "firstName lastName email")
      .sort({ createdAt: -1 })
      .limit(limit);

    const publications = logs.map((entry) => ({
      _id: entry._id,
      publishedAt: entry.createdAt,
      publishedBy: entry.userId,
      metadata: entry.metadata || {},
    }));

    return res.status(200).json({
      success: true,
      total: publications.length,
      publications,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getRegulatoryReport = async (req, res) => {
  try {
    const report = await buildRegulatoryReportData({
      fromDate: req.query.fromDate,
      toDate: req.query.toDate,
      cashThreshold: req.query.cashThreshold,
    });
    return res.status(200).json({
      success: true,
      report,
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.getRegulatoryAlerts = async (req, res) => {
  try {
    const filter = {};
    const status = normalizeRegulatoryAlertStatus(req.query.status);
    if (req.query.status && !status) {
      return res.status(400).json({ success: false, message: "Invalid regulatory alert status filter." });
    }
    if (status) filter.status = status;
    if (req.query.indicatorCode) {
      filter.indicatorCode = String(req.query.indicatorCode).trim().toUpperCase();
    }
    if (req.query.source) {
      filter.source = String(req.query.source).trim().toUpperCase();
    }
    if (req.query.monitorDateKey) {
      filter.monitorDateKey = String(req.query.monitorDateKey).trim();
    }

    const rawLimit = Number(req.query.limit || 40);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 40;

    const alerts = await RegulatoryAlert.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("acknowledgedBy", "firstName lastName email")
      .populate("resolvedBy", "firstName lastName email")
      .lean();

    return res.status(200).json({
      success: true,
      total: alerts.length,
      alerts,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.acknowledgeRegulatoryAlert = async (req, res) => {
  try {
    const alertId = toObjectId(req.params.alertId);
    if (!alertId) {
      return res.status(400).json({ success: false, message: "Invalid alert identifier." });
    }

    const alert = await RegulatoryAlert.findById(alertId);
    if (!alert) {
      return res.status(404).json({ success: false, message: "Regulatory alert not found." });
    }
    if (alert.status === "RESOLVED") {
      return res.status(400).json({ success: false, message: "Resolved alert cannot be acknowledged." });
    }

    const previousStatus = alert.status;
    alert.status = "ACKNOWLEDGED";
    alert.acknowledgedBy = req.userId || null;
    alert.acknowledgedAt = new Date();
    await alert.save();

    await AuditLog.create({
      userId: req.userId,
      action: "ADMIN_REGULATORY_ALERT_ACKNOWLEDGED",
      ipAddress: req.ip || "",
      userAgent: req.headers["user-agent"] || "",
      metadata: {
        alertId: alert._id,
        alertKey: alert.alertKey,
        indicatorCode: alert.indicatorCode,
        previousStatus,
        nextStatus: alert.status,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Regulatory alert acknowledged.",
      alert,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.resolveRegulatoryAlert = async (req, res) => {
  try {
    const alertId = toObjectId(req.params.alertId);
    if (!alertId) {
      return res.status(400).json({ success: false, message: "Invalid alert identifier." });
    }

    const resolutionNote = String(req.body?.resolutionNote || "")
      .trim()
      .slice(0, 300);
    if (!resolutionNote) {
      return res.status(400).json({ success: false, message: "Resolution note is required." });
    }

    const alert = await RegulatoryAlert.findById(alertId);
    if (!alert) {
      return res.status(404).json({ success: false, message: "Regulatory alert not found." });
    }
    if (alert.status === "RESOLVED") {
      return res.status(400).json({ success: false, message: "Alert is already resolved." });
    }

    const approvalRequired = isApprovalRequired("REGULATORY_ALERT_RESOLVE");
    if (approvalRequired) {
      const existingRequest = await ApprovalRequest.findOne({
        actionType: "REGULATORY_ALERT_RESOLVE",
        targetType: "REGULATORY_ALERT",
        targetId: alert._id,
        status: "PENDING",
      });
      if (existingRequest) {
        return res.status(202).json({
          success: true,
          pendingApproval: true,
          message: "A resolution approval request is already pending for this regulatory alert.",
          approvalRequest: existingRequest,
        });
      }

      const approvalRequest = await ApprovalRequest.create({
        actionType: "REGULATORY_ALERT_RESOLVE",
        targetType: "REGULATORY_ALERT",
        targetId: alert._id,
        payload: {
          alertId: alert._id,
          alertKey: alert.alertKey,
          indicatorCode: alert.indicatorCode,
          previousStatus: alert.status,
          resolutionNote,
        },
        requestNote: `Resolve regulatory alert ${alert.indicatorCode} (${alert.alertKey})`,
        requestedBy: req.userId,
      });

      await AuditLog.create({
        userId: req.userId,
        action: "ADMIN_APPROVAL_REQUEST_CREATED",
        ipAddress: req.ip || "",
        userAgent: req.headers["user-agent"] || "",
        metadata: {
          approvalRequestId: approvalRequest._id,
          actionType: approvalRequest.actionType,
          targetType: approvalRequest.targetType,
          targetId: approvalRequest.targetId,
          alertKey: alert.alertKey,
          indicatorCode: alert.indicatorCode,
        },
      });

      return res.status(202).json({
        success: true,
        pendingApproval: true,
        message: "Regulatory alert resolve request submitted for maker-checker approval.",
        approvalRequest,
      });
    }

    const resolvedAlert = await resolveRegulatoryAlertFromPayload({
      payload: { alertId: alert._id, resolutionNote },
      actorUserId: req.userId || null,
      source: "ADMIN_DIRECT",
      approvalRequestId: null,
      ipAddress: req.ip || "",
      userAgent: req.headers["user-agent"] || "",
    });

    return res.status(200).json({
      success: true,
      pendingApproval: false,
      message: "Regulatory alert resolved.",
      alert: resolvedAlert,
    });
  } catch (error) {
    const message = String(error?.message || "");
    if (
      message.includes("Invalid alert identifier") ||
      message.includes("Resolution note is required") ||
      message.includes("already resolved")
    ) {
      return res.status(400).json({ success: false, message });
    }
    if (message.includes("Regulatory alert not found")) {
      return res.status(404).json({ success: false, message });
    }
    return res.status(500).json({ success: false, message });
  }
};

exports.exportRegulatoryReportCsv = async (req, res) => {
  try {
    const report = await buildRegulatoryReportData({
      fromDate: req.query.fromDate,
      toDate: req.query.toDate,
      cashThreshold: req.query.cashThreshold,
    });
    const csv = buildRegulatoryReportCsvContent(report);
    const fromPart = dayjs(report?.range?.from).isValid() ? dayjs(report.range.from).format("YYYYMMDD") : "from";
    const toPart = dayjs(report?.range?.to).isValid() ? dayjs(report.range.to).format("YYYYMMDD") : "to";
    const fileName = `regulatory-report-${fromPart}-${toPart}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.status(200).send(`\uFEFF${csv}`);
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.runRegulatoryBreachMonitorJob = async (req, res) => {
  try {
    const result = await runRegulatoryBreachMonitor({
      fromDate: req.body?.fromDate || req.query?.fromDate,
      toDate: req.body?.toDate || req.query?.toDate,
      cashThreshold: req.body?.cashThreshold || req.query?.cashThreshold,
      source: "ADMIN_MANUAL",
      monitorDate: new Date(),
      actorUserId: req.userId || null,
      ipAddress: req.ip || "",
      userAgent: req.headers["user-agent"] || "",
    });

    return res.status(200).json({
      success: true,
      message: "Regulatory breach monitor completed.",
      result,
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.autoPublishMonthlyRegulatoryReport = async ({ forDate = new Date(), cashThreshold } = {}) => {
  const referenceDate = dayjs(forDate);
  if (!referenceDate.isValid()) {
    throw new Error("Invalid auto-publish date.");
  }

  const monthStart = referenceDate.subtract(1, "month").startOf("month");
  const monthEnd = monthStart.endOf("month");
  const monthKey = monthStart.format("YYYY-MM");
  const fromIso = monthStart.toDate().toISOString();
  const toIso = monthEnd.toDate().toISOString();
  const policy = getRegulatoryPolicy();
  const threshold = Number(cashThreshold || policy.ctrCashThreshold || process.env.REGULATORY_CTR_THRESHOLD || 1000000);
  const normalizedThreshold = Number.isFinite(threshold) && threshold > 0 ? threshold : 1000000;

  const existingPublication = await AuditLog.findOne({
    action: "ADMIN_REGULATORY_REPORT_PUBLISHED",
    "metadata.source": "SCHEDULER_MONTHLY",
    "metadata.range.from": fromIso,
    "metadata.range.to": toIso,
  })
    .sort({ createdAt: -1 })
    .lean();

  if (existingPublication) {
    return {
      published: false,
      skipped: true,
      reason: "already_published",
      monthKey,
      publicationId: existingPublication._id,
    };
  }

  const report = await buildRegulatoryReportData({
    fromDate: fromIso,
    toDate: toIso,
    cashThreshold: normalizedThreshold,
  });
  const publishPayload = buildRegulatoryPublishPayload({
    report,
    publishNote: `Monthly automated regulatory publication for ${monthStart.format("MMMM YYYY")}`,
  });
  const publication = await publishRegulatoryReportFromPayload({
    payload: publishPayload,
    actorUserId: null,
    source: "SCHEDULER_MONTHLY",
    approvalRequestId: null,
    ipAddress: "SYSTEM",
    userAgent: "core-banking-scheduler/monthly",
  });

  return {
    published: true,
    skipped: false,
    monthKey,
    publication,
  };
};

const shouldUseCurrentFdRenewalRate = () => {
  const value = String(process.env.FD_AUTO_RENEW_USE_CURRENT_RATE || "false")
    .trim()
    .toLowerCase();
  return ["true", "1", "yes", "on"].includes(value);
};

const runFixedDepositAutoRenewalJob = async ({
  forDate = new Date(),
  maxBatch = 200,
  source = "SCHEDULER_AUTO_RENEW",
  actorUserId = null,
  ipAddress = "",
  userAgent = "",
} = {}) => {
  const referenceDate = dayjs(forDate);
  if (!referenceDate.isValid()) {
    throw new Error("Invalid FD maturity processing date.");
  }

  const effectiveDate = referenceDate.toDate();
  const limit = Math.min(500, Math.max(1, Number(maxBatch || 200)));

  const candidates = await FixedDeposit.find({
    status: "ACTIVE",
    autoRenewEnabled: true,
    maturityDate: { $lte: effectiveDate },
  })
    .sort({ maturityDate: 1, createdAt: 1 })
    .limit(limit)
    .select("_id userId accountId principal annualRate tenureMonths compoundingPerYear renewalTenureMonths renewalCount");

  const result = {
    processed: candidates.length,
    renewed: 0,
    skipped: 0,
    failed: 0,
    asOfDate: effectiveDate.toISOString(),
    source,
    renewalRecords: [],
    errors: [],
  };

  for (const candidate of candidates) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const fd = await FixedDeposit.findById(candidate._id).session(session);
      if (!fd) {
        result.skipped += 1;
        await session.abortTransaction();
        session.endSession();
        continue;
      }

      if (fd.status !== "ACTIVE" || !fd.autoRenewEnabled || dayjs(effectiveDate).isBefore(dayjs(fd.maturityDate))) {
        result.skipped += 1;
        await session.abortTransaction();
        session.endSession();
        continue;
      }

      const principal = Number(fd.principal || 0);
      if (!Number.isFinite(principal) || principal <= 0) {
        result.skipped += 1;
        await session.abortTransaction();
        session.endSession();
        continue;
      }

      const yearsCompleted = Math.max(1, Number(fd.tenureMonths || 1)) / 12;
      const maturityAmount = calculateCompoundMaturity({
        principal,
        annualRate: Number(fd.annualRate || 0),
        years: yearsCompleted,
        compoundingPerYear: Number(fd.compoundingPerYear || 4),
      });
      const interestAmount = round2(Math.max(0, maturityAmount - principal));
      const renewalTenureMonths = Math.max(1, Number(fd.renewalTenureMonths || fd.tenureMonths || 1));
      const renewalAnnualRate = shouldUseCurrentFdRenewalRate()
        ? toPositiveNumber(process.env.FD_INTEREST_RATE_DEFAULT, Number(fd.annualRate || 0))
        : Number(fd.annualRate || 0);

      const renewedFd = await FixedDeposit.create(
        [
          {
            userId: fd.userId,
            accountId: fd.accountId,
            principal: maturityAmount,
            annualRate: renewalAnnualRate,
            tenureMonths: renewalTenureMonths,
            compoundingPerYear: Number(fd.compoundingPerYear || 4),
            startDate: effectiveDate,
            maturityDate: dayjs(effectiveDate).add(renewalTenureMonths, "month").toDate(),
            maturityAmountProjected: calculateCompoundMaturity({
              principal: maturityAmount,
              annualRate: renewalAnnualRate,
              years: renewalTenureMonths / 12,
              compoundingPerYear: Number(fd.compoundingPerYear || 4),
            }),
            status: "ACTIVE",
            autoRenewEnabled: true,
            renewalTenureMonths,
            renewalCount: Math.max(0, Number(fd.renewalCount || 0)) + 1,
            renewedFromFdId: fd._id,
            metadata: {
              autoRenewedFromFdId: fd._id,
              source,
            },
          },
        ],
        { session }
      ).then((items) => items[0]);

      fd.status = "RENEWED";
      fd.penaltyAmount = 0;
      fd.payoutAmount = maturityAmount;
      fd.closedAt = effectiveDate;
      fd.lastRenewedAt = effectiveDate;
      fd.renewedToFdId = renewedFd._id;
      fd.metadata = {
        ...(fd.metadata || {}),
        autoRenewed: true,
        source,
        renewedToFdId: renewedFd._id,
        renewalAt: effectiveDate.toISOString(),
        interestCapitalized: interestAmount,
      };
      await fd.save({ session });

      await postFixedDepositRenewalJournal({
        interestAmount,
        referenceType: "FD_RENEWAL",
        referenceId: renewedFd._id,
        metadata: {
          userId: fd.userId,
          accountId: fd.accountId,
          previousFdId: fd._id,
          renewedFdId: renewedFd._id,
          source,
        },
        session,
      });

      await AuditLog.create(
        [
          {
            userId: actorUserId || fd.userId,
            action: "FD_AUTO_RENEWED",
            ipAddress,
            userAgent,
            metadata: {
              source,
              previousFdId: fd._id,
              renewedFdId: renewedFd._id,
              userId: fd.userId,
              accountId: fd.accountId,
              principal,
              maturityAmount,
              interestAmount,
              renewalAnnualRate,
              renewalTenureMonths,
            },
          },
        ],
        { session }
      );

      await session.commitTransaction();
      session.endSession();

      result.renewed += 1;
      result.renewalRecords.push({
        previousFdId: String(fd._id),
        renewedFdId: String(renewedFd._id),
        userId: String(fd.userId),
        maturityAmount,
        interestAmount,
        renewalAnnualRate,
        renewalTenureMonths,
      });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      result.failed += 1;
      result.errors.push({
        fdId: String(candidate?._id || ""),
        message: error.message,
      });
    }
  }

  if (result.renewalRecords.length) {
    try {
      const notifications = result.renewalRecords.map((entry) => ({
        userId: entry.userId,
        title: "FD Auto-Renewed",
        message: `Your fixed deposit has been auto-renewed with principal Rs ${Number(
          entry.maturityAmount || 0
        ).toFixed(2)} for ${entry.renewalTenureMonths} month(s).`,
        category: "ACCOUNT",
        type: "INFO",
        actionLink: "/core-banking?module=fd",
        metadata: {
          previousFdId: entry.previousFdId,
          renewedFdId: entry.renewedFdId,
          maturityAmount: entry.maturityAmount,
          renewalTenureMonths: entry.renewalTenureMonths,
          source,
        },
      }));
      await createNotifications(notifications);
    } catch (_) {}
  }

  return result;
};

exports.runFixedDepositAutoRenewalJob = runFixedDepositAutoRenewalJob;

exports.runFixedDepositMaturityJob = async (req, res) => {
  try {
    const result = await runFixedDepositAutoRenewalJob({
      forDate: req.body?.forDate || req.query?.forDate || new Date(),
      maxBatch: req.body?.limit || req.query?.limit || 200,
      source: "ADMIN_MANUAL",
      actorUserId: req.userId || null,
      ipAddress: req.ip || "",
      userAgent: req.headers["user-agent"] || "",
    });

    return res.status(200).json({
      success: true,
      message: "FD maturity processing completed.",
      result,
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.executeApprovedFixedDepositBooking = async ({
  approvalRequest,
  reviewerId = null,
  ipAddress = "",
  userAgent = "",
} = {}) => {
  if (!approvalRequest) {
    throw new Error("Approval request context is required for FD execution.");
  }

  const payload = parseFixedDepositRequestPayload(approvalRequest.payload || {});
  const userId = toObjectId(approvalRequest.payload?.userId || approvalRequest.requestedBy);
  const accountId = toObjectId(approvalRequest.targetId || approvalRequest.payload?.accountId);
  if (!userId || !accountId) {
    throw new Error("Invalid FD approval target.");
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const account = await Account.findById(accountId).session(session);
    if (!account) {
      throw new Error("Account not found.");
    }
    if (String(account.userId || "") !== String(userId)) {
      throw new Error("Approval target account does not belong to requester.");
    }
    if (account.status !== "ACTIVE") {
      throw new Error("Account is not active.");
    }
    if (Number(account.balance || 0) < payload.principal) {
      throw new Error("Insufficient balance for FD booking.");
    }

    const startDate = new Date();
    const years = payload.tenureMonths / 12;
    const maturityAmountProjected = calculateCompoundMaturity({
      principal: payload.principal,
      annualRate: payload.annualRate,
      years,
      compoundingPerYear: payload.compoundingPerYear,
    });

    account.balance = round2(Number(account.balance || 0) - payload.principal);
    await account.save({ session });

    const fd = await FixedDeposit.create(
      [
        {
          userId,
          accountId: account._id,
          principal: payload.principal,
          annualRate: payload.annualRate,
          tenureMonths: payload.tenureMonths,
          compoundingPerYear: payload.compoundingPerYear,
          startDate,
          maturityDate: dayjs(startDate).add(payload.tenureMonths, "month").toDate(),
          maturityAmountProjected,
          status: "ACTIVE",
          autoRenewEnabled: payload.autoRenewEnabled,
          renewalTenureMonths: payload.autoRenewEnabled ? payload.renewalTenureMonths : 0,
          metadata: {
            approvalRequestId: approvalRequest._id,
            approvedBy: reviewerId || null,
            approvedAt: new Date().toISOString(),
            source: "ADMIN_APPROVAL",
          },
        },
      ],
      { session }
    ).then((items) => items[0]);

    const tx = await Transaction.create(
      [
        {
          accountId: account._id,
          userId,
          type: "FD_BOOKING",
          amount: payload.principal,
          description: `Fixed deposit booked (${payload.tenureMonths} months)`,
          status: "SUCCESS",
          balanceAfterTransaction: account.balance,
        },
      ],
      { session }
    ).then((items) => items[0]);

    await LedgerEntry.create(
      [
        {
          accountId: account._id,
          transactionId: tx._id,
          type: "DEBIT",
          amount: payload.principal,
          balanceAfter: account.balance,
          description: "FD booking amount blocked",
        },
      ],
      { session }
    );

    await postFixedDepositBookingJournal({
      amount: payload.principal,
      referenceType: "FD_BOOKING",
      referenceId: tx._id,
      metadata: {
        userId,
        accountId: account._id,
        fdId: fd._id,
        approvalRequestId: approvalRequest._id,
      },
      session,
    });

    await AuditLog.create(
      [
        {
          userId: reviewerId || userId,
          action: "FD_BOOKING_APPROVAL_EXECUTED",
          ipAddress,
          userAgent,
          metadata: {
            approvalRequestId: approvalRequest._id,
            fdId: fd._id,
            accountId: account._id,
            userId,
            principal: payload.principal,
            tenureMonths: payload.tenureMonths,
            annualRate: payload.annualRate,
            balanceAfter: account.balance,
          },
        },
      ],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    try {
      await createNotifications([
        {
          userId,
          title: "FD Booking Approved",
          message: `Your fixed deposit booking request has been approved. Rs ${Number(payload.principal || 0).toFixed(
            2
          )} is now booked.`,
          category: "ACCOUNT",
          type: "SUCCESS",
          actionLink: "/core-banking?module=fd",
          metadata: {
            approvalRequestId: approvalRequest._id,
            fdId: fd._id,
            principal: payload.principal,
            tenureMonths: payload.tenureMonths,
          },
        },
      ]);
    } catch (_) {}

    return {
      executed: true,
      result: {
        fdId: fd._id,
        accountId: account._id,
        userId,
        principal: payload.principal,
        tenureMonths: payload.tenureMonths,
        annualRate: payload.annualRate,
        balanceAfter: account.balance,
      },
      message: "FD booking request approved and executed successfully.",
    };
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

exports.executeApprovedRecurringDepositCreation = async ({
  approvalRequest,
  reviewerId = null,
  ipAddress = "",
  userAgent = "",
} = {}) => {
  if (!approvalRequest) {
    throw new Error("Approval request context is required for RD execution.");
  }

  const payload = parseRecurringDepositRequestPayload(approvalRequest.payload || {});
  const userId = toObjectId(approvalRequest.payload?.userId || approvalRequest.requestedBy);
  const accountId = toObjectId(approvalRequest.targetId || approvalRequest.payload?.accountId);
  if (!userId || !accountId) {
    throw new Error("Invalid RD approval target.");
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const account = await Account.findById(accountId).session(session);
    if (!account) {
      throw new Error("Account not found.");
    }
    if (String(account.userId || "") !== String(userId)) {
      throw new Error("Approval target account does not belong to requester.");
    }
    if (account.status !== "ACTIVE") {
      throw new Error("Account is not active.");
    }
    if (Number(account.balance || 0) < payload.monthlyInstallment) {
      throw new Error("Insufficient balance for first RD installment.");
    }

    const startDate = new Date();
    const maturityAmountProjected = calculateRdMaturity({
      monthlyInstallment: payload.monthlyInstallment,
      annualRate: payload.annualRate,
      months: payload.tenureMonths,
    });

    account.balance = round2(Number(account.balance || 0) - payload.monthlyInstallment);
    await account.save({ session });

    const rd = await RecurringDeposit.create(
      [
        {
          userId,
          accountId: account._id,
          monthlyInstallment: payload.monthlyInstallment,
          annualRate: payload.annualRate,
          tenureMonths: payload.tenureMonths,
          totalDeposited: payload.monthlyInstallment,
          installmentsPaid: 1,
          startDate,
          nextDueDate: dayjs(startDate).add(1, "month").toDate(),
          maturityDate: dayjs(startDate).add(payload.tenureMonths, "month").toDate(),
          maturityAmountProjected,
          autoDebit: payload.autoDebit,
          status: payload.tenureMonths === 1 ? "MATURED" : "ACTIVE",
          lastInstallmentAt: startDate,
          metadata: {
            approvalRequestId: approvalRequest._id,
            approvedBy: reviewerId || null,
            approvedAt: new Date().toISOString(),
            source: "ADMIN_APPROVAL",
          },
        },
      ],
      { session }
    ).then((items) => items[0]);

    const tx = await Transaction.create(
      [
        {
          accountId: account._id,
          userId,
          type: "RD_INSTALLMENT",
          amount: payload.monthlyInstallment,
          description: "Recurring deposit first installment",
          status: "SUCCESS",
          balanceAfterTransaction: account.balance,
        },
      ],
      { session }
    ).then((items) => items[0]);

    await LedgerEntry.create(
      [
        {
          accountId: account._id,
          transactionId: tx._id,
          type: "DEBIT",
          amount: payload.monthlyInstallment,
          balanceAfter: account.balance,
          description: "Recurring deposit installment",
        },
      ],
      { session }
    );

    await postRecurringDepositInstallmentJournal({
      amount: payload.monthlyInstallment,
      referenceType: "RD_INSTALLMENT",
      referenceId: tx._id,
      metadata: {
        rdId: rd._id,
        userId,
        accountId: account._id,
        installmentNumber: 1,
        source: "ADMIN_APPROVAL",
        approvalRequestId: approvalRequest._id,
      },
      session,
    });

    await AuditLog.create(
      [
        {
          userId: reviewerId || userId,
          action: "RD_CREATION_APPROVAL_EXECUTED",
          ipAddress,
          userAgent,
          metadata: {
            approvalRequestId: approvalRequest._id,
            rdId: rd._id,
            accountId: account._id,
            userId,
            monthlyInstallment: payload.monthlyInstallment,
            tenureMonths: payload.tenureMonths,
            annualRate: payload.annualRate,
            balanceAfter: account.balance,
          },
        },
      ],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    try {
      await createNotifications([
        {
          userId,
          title: "RD Request Approved",
          message: `Your recurring deposit request has been approved. First installment of Rs ${Number(
            payload.monthlyInstallment || 0
          ).toFixed(2)} is debited.`,
          category: "ACCOUNT",
          type: "SUCCESS",
          actionLink: "/core-banking?module=rd",
          metadata: {
            approvalRequestId: approvalRequest._id,
            rdId: rd._id,
            monthlyInstallment: payload.monthlyInstallment,
            tenureMonths: payload.tenureMonths,
          },
        },
      ]);
    } catch (_) {}

    return {
      executed: true,
      result: {
        rdId: rd._id,
        accountId: account._id,
        userId,
        monthlyInstallment: payload.monthlyInstallment,
        tenureMonths: payload.tenureMonths,
        annualRate: payload.annualRate,
        balanceAfter: account.balance,
      },
      message: "RD creation request approved and executed successfully.",
    };
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

exports.createFixedDeposit = async (req, res) => {
  let fdInput;
  try {
    fdInput = parseFixedDepositRequestPayload(req.body || {});
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }

  const {
    principal,
    tenureMonths,
    annualRate,
    compoundingPerYear,
    autoRenewEnabled,
    renewalTenureMonths,
  } = fdInput;

  const approvalRequired = isApprovalRequired("FD_BOOKING_CREATE");
  if (approvalRequired) {
    try {
      const account = await Account.findOne({ userId: req.userId }).select("_id userId balance status");
      if (!account) {
        return res.status(404).json({ success: false, message: "Account not found." });
      }
      if (account.status !== "ACTIVE") {
        return res.status(400).json({ success: false, message: "Account is not active." });
      }
      if (Number(account.balance || 0) < principal) {
        return res.status(400).json({ success: false, message: "Insufficient balance for FD booking." });
      }

      const existingRequest = await ApprovalRequest.findOne({
        actionType: "FD_BOOKING_CREATE",
        targetType: "ACCOUNT",
        targetId: account._id,
        requestedBy: req.userId,
        status: "PENDING",
        "payload.principal": principal,
        "payload.tenureMonths": tenureMonths,
        "payload.annualRate": annualRate,
        "payload.compoundingPerYear": compoundingPerYear,
        "payload.autoRenewEnabled": autoRenewEnabled,
        "payload.renewalTenureMonths": autoRenewEnabled ? renewalTenureMonths : 0,
      });

      if (existingRequest) {
        return res.status(202).json({
          success: true,
          pendingApproval: true,
          message: "An approval request is already pending for this FD booking.",
          approvalRequest: existingRequest,
        });
      }

      const approvalRequest = await ApprovalRequest.create({
        actionType: "FD_BOOKING_CREATE",
        targetType: "ACCOUNT",
        targetId: account._id,
        payload: {
          userId: req.userId,
          accountId: account._id,
          principal,
          tenureMonths,
          annualRate,
          compoundingPerYear,
          autoRenewEnabled,
          renewalTenureMonths: autoRenewEnabled ? renewalTenureMonths : 0,
        },
        requestNote: `FD booking requested for Rs ${Number(principal).toFixed(2)} (${tenureMonths} months)`,
        requestedBy: req.userId,
      });

      await AuditLog.create({
        userId: req.userId,
        action: "ADMIN_APPROVAL_REQUEST_CREATED",
        ipAddress: req.ip || "",
        userAgent: req.headers["user-agent"] || "",
        metadata: {
          approvalRequestId: approvalRequest._id,
          actionType: approvalRequest.actionType,
          targetType: approvalRequest.targetType,
          targetId: approvalRequest.targetId,
          principal,
          tenureMonths,
          annualRate,
        },
      });

      return res.status(202).json({
        success: true,
        pendingApproval: true,
        message: "FD booking request submitted for admin approval.",
        approvalRequest,
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const account = await Account.findOne({ userId: req.userId }).session(session);
    if (!account) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: "Account not found." });
    }
    if (account.status !== "ACTIVE") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: "Account is not active." });
    }
    if (Number(account.balance || 0) < principal) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: "Insufficient balance for FD booking." });
    }

    const years = tenureMonths / 12;
    const maturityAmountProjected = calculateCompoundMaturity({
      principal,
      annualRate,
      years,
      compoundingPerYear,
    });

    account.balance = round2(Number(account.balance || 0) - principal);
    await account.save({ session });

    const fd = await FixedDeposit.create(
      [
        {
          userId: req.userId,
          accountId: account._id,
          principal,
          annualRate,
          tenureMonths,
          compoundingPerYear,
          startDate: new Date(),
          maturityDate: dayjs().add(tenureMonths, "month").toDate(),
          maturityAmountProjected,
          status: "ACTIVE",
          autoRenewEnabled,
          renewalTenureMonths,
        },
      ],
      { session }
    ).then((items) => items[0]);

    const tx = await Transaction.create(
      [
        {
          accountId: account._id,
          userId: req.userId,
          type: "FD_BOOKING",
          amount: principal,
          description: `Fixed deposit booked (${tenureMonths} months)`,
          status: "SUCCESS",
          balanceAfterTransaction: account.balance,
        },
      ],
      { session }
    ).then((items) => items[0]);

    await LedgerEntry.create(
      [
        {
          accountId: account._id,
          transactionId: tx._id,
          type: "DEBIT",
          amount: principal,
          balanceAfter: account.balance,
          description: `FD booking amount blocked`,
        },
      ],
      { session }
    );

    await postFixedDepositBookingJournal({
      amount: principal,
      referenceType: "FD_BOOKING",
      referenceId: tx._id,
      metadata: {
        userId: req.userId,
        accountId: account._id,
        fdId: fd._id,
      },
      session,
    });

    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({
      success: true,
      message: "Fixed deposit created successfully.",
      fd,
      newBalance: account.balance,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    const message = String(error?.message || "");
    if (message.includes("Insufficient balance for RD installment.")) {
      return res.status(400).json({ success: false, message });
    }
    return res.status(500).json({ success: false, message });
  }
};

exports.getMyFixedDeposits = async (req, res) => {
  try {
    await FixedDeposit.updateMany(
      {
        userId: req.userId,
        status: "ACTIVE",
        autoRenewEnabled: { $ne: true },
        maturityDate: { $lte: new Date() },
      },
      { $set: { status: "MATURED" } }
    );
    const list = await FixedDeposit.find({ userId: req.userId }).sort({ createdAt: -1 });
    return res.status(200).json({ success: true, total: list.length, fixedDeposits: list });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.closeFixedDeposit = async (req, res) => {
  const fdId = toObjectId(req.params.fdId);
  if (!fdId) {
    return res.status(400).json({ success: false, message: "Invalid FD reference." });
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const fd = await FixedDeposit.findOne({ _id: fdId, userId: req.userId }).session(session);
    if (!fd) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: "Fixed deposit not found." });
    }
    if (fd.status !== "ACTIVE" && fd.status !== "MATURED") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: "Only active FD can be closed." });
    }

    const account = await Account.findById(fd.accountId).session(session);
    if (!account) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: "Linked account not found." });
    }
    if (account.status !== "ACTIVE") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: "Linked account is not active." });
    }

    const now = dayjs();
    const maturityReached = !now.isBefore(dayjs(fd.maturityDate));
    const completedMonths = Math.max(1, now.diff(dayjs(fd.startDate), "month"));
    const yearsCompleted = completedMonths / 12;
    const prematurePenaltyRate = toPositiveNumber(
      req.body.prematurePenaltyRate,
      Number(process.env.FD_PREMATURE_PENALTY_RATE || 1)
    );
    const effectiveRate = maturityReached ? Number(fd.annualRate || 0) : Math.max(0, Number(fd.annualRate || 0) - prematurePenaltyRate);

    const payoutAmount = calculateCompoundMaturity({
      principal: Number(fd.principal || 0),
      annualRate: effectiveRate,
      years: yearsCompleted,
      compoundingPerYear: Number(fd.compoundingPerYear || 4),
    });
    const interestAmount = round2(Math.max(0, payoutAmount - Number(fd.principal || 0)));
    const penaltyAmount = maturityReached
      ? 0
      : round2(
          Number(fd.principal || 0) *
            ((Math.max(0, Number(fd.annualRate || 0) - effectiveRate) / 100) *
              yearsCompleted)
        );

    account.balance = round2(Number(account.balance || 0) + payoutAmount);
    await account.save({ session });

    const tx = await Transaction.create(
      [
        {
          accountId: account._id,
          userId: req.userId,
          type: "FD_CLOSURE",
          amount: payoutAmount,
          description: maturityReached ? "Fixed deposit maturity payout" : "Fixed deposit premature closure payout",
          status: "SUCCESS",
          balanceAfterTransaction: account.balance,
        },
      ],
      { session }
    ).then((items) => items[0]);

    await LedgerEntry.create(
      [
        {
          accountId: account._id,
          transactionId: tx._id,
          type: "CREDIT",
          amount: payoutAmount,
          balanceAfter: account.balance,
          description: maturityReached ? "FD maturity payout credited" : "FD premature payout credited",
        },
      ],
      { session }
    );

    await postFixedDepositClosureJournal({
      principalAmount: Number(fd.principal || 0),
      interestAmount,
      payoutAmount,
      referenceType: "FD_CLOSURE",
      referenceId: tx._id,
      metadata: {
        userId: req.userId,
        accountId: account._id,
        fdId: fd._id,
        maturityReached,
        penaltyAmount,
      },
      session,
    });

    fd.status = maturityReached ? "CLOSED" : "PREMATURE_CLOSED";
    fd.penaltyAmount = penaltyAmount;
    fd.payoutAmount = payoutAmount;
    fd.payoutTransactionId = tx._id;
    fd.closedAt = new Date();
    await fd.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      success: true,
      message: maturityReached ? "Fixed deposit closed on maturity." : "Fixed deposit closed prematurely.",
      fd,
      payoutAmount,
      interestAmount,
      penaltyAmount,
      newBalance: account.balance,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getRecurringAutoDebitPolicy = () => {
  const retryDelayHoursRaw = Number(process.env.RD_AUTO_DEBIT_RETRY_DELAY_HOURS || 24);
  const maxConsecutiveFailuresRaw = Number(process.env.RD_AUTO_DEBIT_MAX_CONSECUTIVE_FAILURES || 3);
  const retryDelayHours = Number.isFinite(retryDelayHoursRaw)
    ? Math.min(720, Math.max(1, Math.round(retryDelayHoursRaw)))
    : 24;
  const maxConsecutiveFailures = Number.isFinite(maxConsecutiveFailuresRaw)
    ? Math.min(12, Math.max(1, Math.round(maxConsecutiveFailuresRaw)))
    : 3;
  return {
    retryDelayHours,
    maxConsecutiveFailures,
  };
};

const postRecurringInstallmentInternal = async ({ rd, account, session, source = "MANUAL" } = {}) => {
  const installmentAmount = Number(rd?.monthlyInstallment || 0);
  if (!Number.isFinite(installmentAmount) || installmentAmount <= 0) {
    throw new Error("Invalid recurring installment amount.");
  }
  if (Number(account?.balance || 0) < installmentAmount) {
    throw new Error("Insufficient balance for RD installment.");
  }

  account.balance = round2(Number(account.balance || 0) - installmentAmount);
  await account.save({ session });

  rd.totalDeposited = round2(Number(rd.totalDeposited || 0) + installmentAmount);
  rd.installmentsPaid = Number(rd.installmentsPaid || 0) + 1;
  rd.lastInstallmentAt = new Date();
  rd.autoDebitConsecutiveFailures = 0;
  rd.autoDebitLastFailureAt = null;
  rd.autoDebitLastFailureReason = "";
  rd.autoDebitNextRetryAt = null;
  rd.nextDueDate = dayjs(rd.nextDueDate || new Date()).add(1, "month").toDate();
  if (rd.installmentsPaid >= rd.tenureMonths) {
    rd.status = "MATURED";
    rd.nextDueDate = rd.maturityDate;
  }
  await rd.save({ session });

  const description =
    source === "AUTO_DEBIT"
      ? "Recurring deposit auto-debit installment payment"
      : source === "ADMIN_FORCE_DEBIT"
      ? "Recurring deposit installment payment by admin"
      : "Recurring deposit installment payment";
  const tx = await Transaction.create(
    [
      {
        accountId: account._id,
        userId: rd.userId,
        type: "RD_INSTALLMENT",
        amount: installmentAmount,
        description,
        status: "SUCCESS",
        balanceAfterTransaction: account.balance,
      },
    ],
    { session }
  ).then((items) => items[0]);

  await LedgerEntry.create(
    [
      {
        accountId: account._id,
        transactionId: tx._id,
        type: "DEBIT",
        amount: installmentAmount,
        balanceAfter: account.balance,
        description:
          source === "AUTO_DEBIT"
            ? "Recurring deposit auto-debit installment"
            : source === "ADMIN_FORCE_DEBIT"
            ? "Recurring deposit installment by admin"
            : "Recurring deposit installment",
      },
    ],
    { session }
  );

  await postRecurringDepositInstallmentJournal({
    amount: installmentAmount,
    referenceType: "RD_INSTALLMENT",
    referenceId: tx._id,
    metadata: {
      rdId: rd._id,
      userId: rd.userId,
      accountId: account._id,
      installmentNumber: rd.installmentsPaid,
      source,
    },
    session,
  });

  return {
    installmentAmount,
    tx,
  };
};

exports.createRecurringDeposit = async (req, res) => {
  let rdInput;
  try {
    rdInput = parseRecurringDepositRequestPayload(req.body || {});
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }

  const { monthlyInstallment, tenureMonths, annualRate, autoDebit } = rdInput;
  const approvalRequired = isApprovalRequired("RD_CREATION");
  if (approvalRequired) {
    try {
      const account = await Account.findOne({ userId: req.userId }).select("_id userId balance status");
      if (!account) {
        return res.status(404).json({ success: false, message: "Account not found." });
      }
      if (account.status !== "ACTIVE") {
        return res.status(400).json({ success: false, message: "Account is not active." });
      }
      if (Number(account.balance || 0) < monthlyInstallment) {
        return res.status(400).json({ success: false, message: "Insufficient balance for first RD installment." });
      }

      const existingRequest = await ApprovalRequest.findOne({
        actionType: "RD_CREATION",
        targetType: "ACCOUNT",
        targetId: account._id,
        requestedBy: req.userId,
        status: "PENDING",
        "payload.monthlyInstallment": monthlyInstallment,
        "payload.tenureMonths": tenureMonths,
        "payload.annualRate": annualRate,
        "payload.autoDebit": autoDebit,
      });
      if (existingRequest) {
        return res.status(202).json({
          success: true,
          pendingApproval: true,
          message: "An approval request is already pending for this RD plan.",
          approvalRequest: existingRequest,
        });
      }

      const approvalRequest = await ApprovalRequest.create({
        actionType: "RD_CREATION",
        targetType: "ACCOUNT",
        targetId: account._id,
        payload: {
          userId: req.userId,
          accountId: account._id,
          monthlyInstallment,
          tenureMonths,
          annualRate,
          autoDebit,
        },
        requestNote: `RD creation requested for Rs ${Number(monthlyInstallment).toFixed(2)} x ${tenureMonths} months`,
        requestedBy: req.userId,
      });

      await AuditLog.create({
        userId: req.userId,
        action: "ADMIN_APPROVAL_REQUEST_CREATED",
        ipAddress: req.ip || "",
        userAgent: req.headers["user-agent"] || "",
        metadata: {
          approvalRequestId: approvalRequest._id,
          actionType: approvalRequest.actionType,
          targetType: approvalRequest.targetType,
          targetId: approvalRequest.targetId,
          monthlyInstallment,
          tenureMonths,
          annualRate,
          autoDebit,
        },
      });

      return res.status(202).json({
        success: true,
        pendingApproval: true,
        message: "RD creation request submitted for admin approval.",
        approvalRequest,
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const account = await Account.findOne({ userId: req.userId }).session(session);
    if (!account) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: "Account not found." });
    }
    if (account.status !== "ACTIVE") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: "Account is not active." });
    }
    if (Number(account.balance || 0) < monthlyInstallment) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: "Insufficient balance for first RD installment." });
    }

    const maturityAmountProjected = calculateRdMaturity({
      monthlyInstallment,
      annualRate,
      months: tenureMonths,
    });

    account.balance = round2(Number(account.balance || 0) - monthlyInstallment);
    await account.save({ session });

    const rd = await RecurringDeposit.create(
      [
        {
          userId: req.userId,
          accountId: account._id,
          monthlyInstallment,
          annualRate,
          tenureMonths,
          totalDeposited: monthlyInstallment,
          installmentsPaid: 1,
          startDate: new Date(),
          nextDueDate: dayjs().add(1, "month").toDate(),
          maturityDate: dayjs().add(tenureMonths, "month").toDate(),
          maturityAmountProjected,
          autoDebit,
          status: tenureMonths === 1 ? "MATURED" : "ACTIVE",
          lastInstallmentAt: new Date(),
        },
      ],
      { session }
    ).then((items) => items[0]);

    const tx = await Transaction.create(
      [
        {
          accountId: account._id,
          userId: req.userId,
          type: "RD_INSTALLMENT",
          amount: monthlyInstallment,
          description: "Recurring deposit first installment",
          status: "SUCCESS",
          balanceAfterTransaction: account.balance,
        },
      ],
      { session }
    ).then((items) => items[0]);

    await LedgerEntry.create(
      [
        {
          accountId: account._id,
          transactionId: tx._id,
          type: "DEBIT",
          amount: monthlyInstallment,
          balanceAfter: account.balance,
          description: "Recurring deposit installment",
        },
      ],
      { session }
    );

    await postRecurringDepositInstallmentJournal({
      amount: monthlyInstallment,
      referenceType: "RD_INSTALLMENT",
      referenceId: tx._id,
      metadata: {
        rdId: rd._id,
        userId: req.userId,
        accountId: account._id,
        installmentNumber: 1,
      },
      session,
    });

    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({
      success: true,
      message: "Recurring deposit created successfully.",
      recurringDeposit: rd,
      newBalance: account.balance,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getMyRecurringDeposits = async (req, res) => {
  try {
    await RecurringDeposit.updateMany(
      {
        userId: req.userId,
        status: "ACTIVE",
        installmentsPaid: { $gte: 1 },
        $expr: { $gte: ["$installmentsPaid", "$tenureMonths"] },
      },
      { $set: { status: "MATURED" } }
    );
    const list = await RecurringDeposit.find({ userId: req.userId }).sort({ createdAt: -1 });
    return res.status(200).json({ success: true, total: list.length, recurringDeposits: list });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getMyApprovalRequests = async (req, res) => {
  try {
    const requesterId = toObjectId(req.userId);
    if (!requesterId) {
      return res.status(400).json({ success: false, message: "Invalid requester context." });
    }

    const rawLimit = Number(req.query.limit || 100);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 500) : 100;
    const pageRaw = Number(req.query.page || 1);
    const page = Number.isFinite(pageRaw) ? Math.max(1, pageRaw) : 1;

    const status = String(req.query.status || "")
      .trim()
      .toUpperCase();
    const actionType = String(req.query.actionType || "")
      .trim()
      .toUpperCase();
    const queryText = String(req.query.q || "")
      .trim()
      .slice(0, 120);
    const fromDateRaw = String(req.query.fromDate || "").trim();
    const toDateRaw = String(req.query.toDate || "").trim();

    const filter = { requestedBy: requesterId };
    if (["PENDING", "EXECUTED", "REJECTED", "FAILED"].includes(status)) {
      filter.status = status;
    }
    if (actionType) {
      filter.actionType = actionType;
    }
    if (fromDateRaw || toDateRaw) {
      const fromDate = fromDateRaw ? dayjs(fromDateRaw).startOf("day") : null;
      const toDate = toDateRaw ? dayjs(toDateRaw).endOf("day") : null;
      if ((fromDateRaw && !fromDate?.isValid()) || (toDateRaw && !toDate?.isValid())) {
        return res.status(400).json({ success: false, message: "Invalid date filter. Use YYYY-MM-DD." });
      }
      if (fromDate && toDate && fromDate.isAfter(toDate)) {
        return res.status(400).json({ success: false, message: "fromDate cannot be greater than toDate." });
      }
      filter.createdAt = {};
      if (fromDate) filter.createdAt.$gte = fromDate.toDate();
      if (toDate) filter.createdAt.$lte = toDate.toDate();
    }
    if (queryText) {
      const escaped = queryText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escaped, "i");
      const searchConditions = [
        { actionType: { $regex: regex } },
        { targetType: { $regex: regex } },
        { requestNote: { $regex: regex } },
        { reviewNote: { $regex: regex } },
        { failureReason: { $regex: regex } },
      ];
      if (mongoose.Types.ObjectId.isValid(queryText)) {
        const objectId = new mongoose.Types.ObjectId(queryText);
        searchConditions.push({ _id: objectId }, { targetId: objectId }, { reviewedBy: objectId });
      }
      filter.$or = searchConditions;
    }

    const skip = (page - 1) * limit;
    const [requests, total, summary] = await Promise.all([
      ApprovalRequest.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("reviewedBy", "firstName lastName email")
        .lean(),
      ApprovalRequest.countDocuments(filter),
      ApprovalRequest.aggregate([
        { $match: filter },
        {
          $group: {
            _id: { status: "$status", actionType: "$actionType" },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    return res.status(200).json({
      success: true,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      requests,
      summary,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.cancelMyApprovalRequest = async (req, res) => {
  try {
    const approvalId = toObjectId(req.params.approvalId);
    if (!approvalId) {
      return res.status(400).json({ success: false, message: "Invalid approval request reference." });
    }

    const approvalRequest = await ApprovalRequest.findOne({ _id: approvalId, requestedBy: req.userId });
    if (!approvalRequest) {
      return res.status(404).json({ success: false, message: "Approval request not found." });
    }
    if (approvalRequest.status !== "PENDING") {
      return res.status(400).json({ success: false, message: "Only pending requests can be cancelled." });
    }

    approvalRequest.status = "REJECTED";
    approvalRequest.reviewedBy = req.userId;
    approvalRequest.reviewedAt = new Date();
    approvalRequest.reviewNote = "Cancelled by requester.";
    approvalRequest.failureReason = "Request cancelled by requester.";
    await approvalRequest.save();

    await AuditLog.create({
      userId: req.userId,
      action: "USER_APPROVAL_REQUEST_CANCELLED",
      ipAddress: req.ip || "",
      userAgent: req.headers["user-agent"] || "",
      metadata: {
        approvalRequestId: approvalRequest._id,
        actionType: approvalRequest.actionType,
        targetType: approvalRequest.targetType,
        targetId: approvalRequest.targetId,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Approval request cancelled successfully.",
      approvalRequest,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const runRecurringDepositAutoDebitEngine = async ({
  forDate = new Date(),
  maxBatch = 200,
  source = "SCHEDULER_AUTO_DEBIT",
  actorUserId = null,
  ipAddress = "",
  userAgent = "",
} = {}) => {
  const referenceDate = dayjs(forDate);
  if (!referenceDate.isValid()) {
    throw new Error("Invalid RD auto-debit processing date.");
  }

  const policy = getRecurringAutoDebitPolicy();
  const effectiveDate = referenceDate.toDate();
  const limit = Math.min(500, Math.max(1, Number(maxBatch || 200)));

  const candidates = await RecurringDeposit.find({
    status: "ACTIVE",
    autoDebit: true,
    $expr: { $lt: ["$installmentsPaid", "$tenureMonths"] },
    $or: [{ nextDueDate: { $lte: effectiveDate } }, { autoDebitNextRetryAt: { $lte: effectiveDate } }],
  })
    .sort({ autoDebitNextRetryAt: 1, nextDueDate: 1, createdAt: 1 })
    .limit(limit)
    .select("_id userId accountId monthlyInstallment tenureMonths installmentsPaid nextDueDate autoDebitConsecutiveFailures");

  const result = {
    processed: candidates.length,
    succeeded: 0,
    failed: 0,
    defaulted: 0,
    matured: 0,
    skipped: 0,
    retryDelayHours: policy.retryDelayHours,
    maxConsecutiveFailures: policy.maxConsecutiveFailures,
    asOfDate: effectiveDate.toISOString(),
    source,
    details: [],
    errors: [],
  };

  const notificationQueue = [];

  for (const candidate of candidates) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const rd = await RecurringDeposit.findById(candidate._id).session(session);
      if (!rd) {
        result.skipped += 1;
        await session.abortTransaction();
        session.endSession();
        continue;
      }
      if (rd.status !== "ACTIVE" || !rd.autoDebit) {
        result.skipped += 1;
        await session.abortTransaction();
        session.endSession();
        continue;
      }

      if (Number(rd.installmentsPaid || 0) >= Number(rd.tenureMonths || 0)) {
        rd.status = "MATURED";
        await rd.save({ session });
        await session.commitTransaction();
        session.endSession();
        result.matured += 1;
        result.skipped += 1;
        continue;
      }

      const dueBySchedule = !dayjs(rd.nextDueDate || new Date()).isAfter(referenceDate);
      const dueByRetry = rd.autoDebitNextRetryAt ? !dayjs(rd.autoDebitNextRetryAt).isAfter(referenceDate) : false;
      if (!dueBySchedule && !dueByRetry) {
        result.skipped += 1;
        await session.abortTransaction();
        session.endSession();
        continue;
      }

      rd.autoDebitLastAttemptAt = effectiveDate;

      const account = await Account.findById(rd.accountId).session(session);
      if (!account || account.status !== "ACTIVE") {
        rd.autoDebitConsecutiveFailures = Number(rd.autoDebitConsecutiveFailures || 0) + 1;
        rd.autoDebitLastFailureAt = effectiveDate;
        rd.autoDebitLastFailureReason = "Linked account is not active.";
        rd.autoDebitNextRetryAt = dayjs(effectiveDate).add(policy.retryDelayHours, "hour").toDate();
        if (rd.autoDebitConsecutiveFailures >= policy.maxConsecutiveFailures) {
          rd.status = "DEFAULTED";
          rd.autoDebitNextRetryAt = null;
          result.defaulted += 1;
        }
        await rd.save({ session });

        await AuditLog.create(
          [
            {
              userId: actorUserId || rd.userId,
              action: "RD_AUTO_DEBIT_FAILED",
              ipAddress,
              userAgent,
              metadata: {
                source,
                rdId: rd._id,
                userId: rd.userId,
                accountId: rd.accountId,
                reason: rd.autoDebitLastFailureReason,
                failureCount: rd.autoDebitConsecutiveFailures,
                defaulted: rd.status === "DEFAULTED",
              },
            },
          ],
          { session }
        );

        await session.commitTransaction();
        session.endSession();

        result.failed += 1;
        result.details.push({
          rdId: String(rd._id),
          status: rd.status,
          reason: rd.autoDebitLastFailureReason,
          failureCount: rd.autoDebitConsecutiveFailures,
        });
        notificationQueue.push({
          userId: rd.userId,
          title: rd.status === "DEFAULTED" ? "RD Auto-Debit Defaulted" : "RD Auto-Debit Failed",
          message:
            rd.status === "DEFAULTED"
              ? "Your RD auto-debit has been defaulted after repeated failures. Please contact support."
              : `RD auto-debit failed due to account issue. Next retry at ${dayjs(rd.autoDebitNextRetryAt).format(
                  "DD MMM YYYY, hh:mm A"
                )}.`,
          category: "ACCOUNT",
          type: rd.status === "DEFAULTED" ? "WARNING" : "INFO",
          actionLink: "/core-banking?module=rd",
          metadata: {
            rdId: rd._id,
            source,
            status: rd.status,
            failureCount: rd.autoDebitConsecutiveFailures,
          },
        });
        continue;
      }

      try {
        const postingResult = await postRecurringInstallmentInternal({
          rd,
          account,
          session,
          source: "AUTO_DEBIT",
        });

        await AuditLog.create(
          [
            {
              userId: actorUserId || rd.userId,
              action: "RD_AUTO_DEBIT_SUCCESS",
              ipAddress,
              userAgent,
              metadata: {
                source,
                rdId: rd._id,
                userId: rd.userId,
                accountId: rd.accountId,
                transactionId: postingResult.tx?._id,
                installmentAmount: postingResult.installmentAmount,
                installmentsPaid: rd.installmentsPaid,
                status: rd.status,
              },
            },
          ],
          { session }
        );

        await session.commitTransaction();
        session.endSession();

        result.succeeded += 1;
        if (rd.status === "MATURED") result.matured += 1;
        result.details.push({
          rdId: String(rd._id),
          status: rd.status,
          installmentAmount: postingResult.installmentAmount,
          installmentsPaid: rd.installmentsPaid,
        });
        notificationQueue.push({
          userId: rd.userId,
          title: "RD Auto-Debit Success",
          message: `Your RD installment of Rs ${Number(postingResult.installmentAmount || 0).toFixed(2)} was auto-debited successfully.`,
          category: "TRANSACTION",
          type: "SUCCESS",
          actionLink: "/core-banking?module=rd",
          metadata: {
            rdId: rd._id,
            source,
            installmentAmount: postingResult.installmentAmount,
            installmentsPaid: rd.installmentsPaid,
          },
        });
      } catch (error) {
        rd.autoDebitConsecutiveFailures = Number(rd.autoDebitConsecutiveFailures || 0) + 1;
        rd.autoDebitLastFailureAt = effectiveDate;
        rd.autoDebitLastFailureReason = String(error?.message || "RD auto-debit failed.").slice(0, 240);
        rd.autoDebitNextRetryAt = dayjs(effectiveDate).add(policy.retryDelayHours, "hour").toDate();
        if (rd.autoDebitConsecutiveFailures >= policy.maxConsecutiveFailures) {
          rd.status = "DEFAULTED";
          rd.autoDebitNextRetryAt = null;
          result.defaulted += 1;
        }
        await rd.save({ session });

        await AuditLog.create(
          [
            {
              userId: actorUserId || rd.userId,
              action: "RD_AUTO_DEBIT_FAILED",
              ipAddress,
              userAgent,
              metadata: {
                source,
                rdId: rd._id,
                userId: rd.userId,
                accountId: rd.accountId,
                reason: rd.autoDebitLastFailureReason,
                failureCount: rd.autoDebitConsecutiveFailures,
                defaulted: rd.status === "DEFAULTED",
              },
            },
          ],
          { session }
        );

        await session.commitTransaction();
        session.endSession();

        result.failed += 1;
        result.details.push({
          rdId: String(rd._id),
          status: rd.status,
          reason: rd.autoDebitLastFailureReason,
          failureCount: rd.autoDebitConsecutiveFailures,
        });
        notificationQueue.push({
          userId: rd.userId,
          title: rd.status === "DEFAULTED" ? "RD Auto-Debit Defaulted" : "RD Auto-Debit Failed",
          message:
            rd.status === "DEFAULTED"
              ? "Your RD auto-debit has been defaulted after repeated failures. Please contact support."
              : `RD auto-debit failed. Next retry at ${dayjs(rd.autoDebitNextRetryAt).format("DD MMM YYYY, hh:mm A")}.`,
          category: "ACCOUNT",
          type: rd.status === "DEFAULTED" ? "WARNING" : "INFO",
          actionLink: "/core-banking?module=rd",
          metadata: {
            rdId: rd._id,
            source,
            status: rd.status,
            failureCount: rd.autoDebitConsecutiveFailures,
          },
        });
      }
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      result.failed += 1;
      result.errors.push({
        rdId: String(candidate?._id || ""),
        message: error.message,
      });
    }
  }

  if (notificationQueue.length) {
    try {
      await createNotifications(notificationQueue);
    } catch (_) {}
  }

  return result;
};

exports.runRecurringDepositAutoDebitEngine = runRecurringDepositAutoDebitEngine;

exports.runRecurringDepositAutoDebitJob = async (req, res) => {
  try {
    const result = await runRecurringDepositAutoDebitEngine({
      forDate: req.body?.forDate || req.query?.forDate || new Date(),
      maxBatch: req.body?.limit || req.query?.limit || 200,
      source: "ADMIN_MANUAL",
      actorUserId: req.userId || null,
      ipAddress: req.ip || "",
      userAgent: req.headers["user-agent"] || "",
    });
    return res.status(200).json({
      success: true,
      message: "RD auto-debit processing completed.",
      result,
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.listDefaultedRecurringDeposits = async (req, res) => {
  try {
    const rawLimit = Number(req.query.limit || 50);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 50;
    const filter = { status: "DEFAULTED" };

    if (req.query.userId && mongoose.Types.ObjectId.isValid(String(req.query.userId))) {
      filter.userId = new mongoose.Types.ObjectId(String(req.query.userId));
    }

    const recurringDeposits = await RecurringDeposit.find(filter)
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(limit)
      .populate("userId", "firstName lastName email phone")
      .populate("accountId", "accountNumber status");

    return res.status(200).json({
      success: true,
      total: recurringDeposits.length,
      recurringDeposits,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.recoverDefaultedRecurringDeposit = async (req, res) => {
  const rdId = toObjectId(req.params.rdId);
  if (!rdId) {
    return res.status(400).json({ success: false, message: "Invalid RD reference." });
  }

  const retryNow = req.body?.retryNow !== false;
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const rd = await RecurringDeposit.findById(rdId).session(session);
    if (!rd) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: "Recurring deposit not found." });
    }
    if (rd.status !== "DEFAULTED") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: "Only defaulted RD can be recovered." });
    }

    if (Number(rd.installmentsPaid || 0) >= Number(rd.tenureMonths || 0)) {
      rd.status = "MATURED";
      rd.autoDebitConsecutiveFailures = 0;
      rd.autoDebitLastFailureAt = null;
      rd.autoDebitLastFailureReason = "";
      rd.autoDebitNextRetryAt = null;
      await rd.save({ session });
      await session.commitTransaction();
      session.endSession();
      return res.status(200).json({
        success: true,
        message: "RD moved to matured state as tenure is already completed.",
        recurringDeposit: rd,
      });
    }

    const account = await Account.findById(rd.accountId).session(session);
    if (!account || account.status !== "ACTIVE") {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ success: false, message: "Linked account must be active before RD recovery." });
    }

    const now = new Date();
    const previousStatus = rd.status;
    rd.status = "ACTIVE";
    rd.autoDebitConsecutiveFailures = 0;
    rd.autoDebitLastAttemptAt = now;
    rd.autoDebitLastFailureAt = null;
    rd.autoDebitLastFailureReason = "";
    rd.autoDebitNextRetryAt = retryNow ? now : dayjs(now).add(1, "day").toDate();
    if (!rd.nextDueDate || dayjs(rd.nextDueDate).isBefore(dayjs(now).subtract(1, "day"))) {
      rd.nextDueDate = now;
    }
    rd.metadata = {
      ...(rd.metadata || {}),
      lastRecoveredByAdminAt: now.toISOString(),
      lastRecoveredByAdminId: req.userId || null,
    };
    await rd.save({ session });

    await AuditLog.create(
      [
        {
          userId: req.userId,
          action: "RD_DEFAULT_RECOVERED_BY_ADMIN",
          ipAddress: req.ip || "",
          userAgent: req.headers["user-agent"] || "",
          metadata: {
            rdId: rd._id,
            userId: rd.userId,
            accountId: rd.accountId,
            previousStatus,
            nextStatus: rd.status,
            retryNow,
            nextRetryAt: rd.autoDebitNextRetryAt,
          },
        },
      ],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    try {
      await createNotifications([
        {
          userId: rd.userId,
          title: "RD Recovery Completed",
          message: retryNow
            ? "Your defaulted RD has been recovered by bank admin and will retry auto-debit now."
            : "Your defaulted RD has been recovered by bank admin and scheduled for next retry.",
          category: "ACCOUNT",
          type: "INFO",
          actionLink: "/core-banking?module=rd",
          metadata: {
            rdId: rd._id,
            recoveredBy: req.userId || null,
            retryNow,
          },
        },
      ]);
    } catch (_) {}

    return res.status(200).json({
      success: true,
      message: "Defaulted RD recovered successfully.",
      recurringDeposit: rd,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.forceDebitRecurringDepositByAdmin = async (req, res) => {
  const rdId = toObjectId(req.params.rdId);
  if (!rdId) {
    return res.status(400).json({ success: false, message: "Invalid RD reference." });
  }

  const recoverIfDefaulted = req.body?.recoverIfDefaulted !== false;
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const rd = await RecurringDeposit.findById(rdId).session(session);
    if (!rd) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: "Recurring deposit not found." });
    }

    if (rd.status === "CLOSED") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: "Closed RD cannot be debited." });
    }

    if (Number(rd.installmentsPaid || 0) >= Number(rd.tenureMonths || 0) || rd.status === "MATURED") {
      rd.status = "MATURED";
      rd.autoDebitConsecutiveFailures = 0;
      rd.autoDebitLastFailureAt = null;
      rd.autoDebitLastFailureReason = "";
      rd.autoDebitNextRetryAt = null;
      rd.nextDueDate = rd.maturityDate;
      await rd.save({ session });
      await session.commitTransaction();
      session.endSession();
      return res.status(200).json({
        success: true,
        message: "RD already matured. No installment debited.",
        recurringDeposit: rd,
      });
    }

    if (rd.status === "DEFAULTED" && !recoverIfDefaulted) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "RD is defaulted. Recover it first before force debit.",
      });
    }

    const account = await Account.findById(rd.accountId).session(session);
    if (!account) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: "Linked account not found." });
    }
    if (account.status !== "ACTIVE") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: "Linked account is not active." });
    }

    const now = new Date();
    const recoveredFromDefaulted = rd.status === "DEFAULTED";
    if (recoveredFromDefaulted) {
      rd.status = "ACTIVE";
      rd.autoDebitConsecutiveFailures = 0;
      rd.autoDebitLastAttemptAt = now;
      rd.autoDebitLastFailureAt = null;
      rd.autoDebitLastFailureReason = "";
      rd.autoDebitNextRetryAt = null;
      rd.metadata = {
        ...(rd.metadata || {}),
        lastRecoveredByAdminAt: now.toISOString(),
        lastRecoveredByAdminId: req.userId || null,
      };
      await rd.save({ session });
    }

    const postingResult = await postRecurringInstallmentInternal({
      rd,
      account,
      session,
      source: "ADMIN_FORCE_DEBIT",
    });

    await AuditLog.create(
      [
        {
          userId: req.userId,
          action: "RD_ADMIN_FORCE_DEBIT_SUCCESS",
          ipAddress: req.ip || "",
          userAgent: req.headers["user-agent"] || "",
          metadata: {
            rdId: rd._id,
            userId: rd.userId,
            accountId: rd.accountId,
            transactionId: postingResult.tx?._id,
            installmentAmount: postingResult.installmentAmount,
            installmentsPaid: rd.installmentsPaid,
            status: rd.status,
            recoveredFromDefaulted,
          },
        },
      ],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    try {
      await createNotifications([
        {
          userId: rd.userId,
          title: "RD Installment Debited",
          message: recoveredFromDefaulted
            ? "Your defaulted RD was recovered and one installment was debited by bank admin."
            : "One RD installment was debited by bank admin.",
          category: "TRANSACTION",
          type: "SUCCESS",
          actionLink: "/core-banking?module=rd",
          metadata: {
            rdId: rd._id,
            recoveredFromDefaulted,
            installmentAmount: postingResult.installmentAmount,
            transactionId: postingResult.tx?._id || null,
          },
        },
      ]);
    } catch (_) {}

    return res.status(200).json({
      success: true,
      message: recoveredFromDefaulted
        ? "Defaulted RD recovered and installment debited successfully."
        : "RD installment debited successfully.",
      recurringDeposit: rd,
      installmentAmount: postingResult.installmentAmount,
      newBalance: account.balance,
      transactionId: postingResult.tx?._id || null,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    const message = String(error?.message || "");
    const isClientError =
      message.includes("Insufficient balance") ||
      message.includes("not active") ||
      message.includes("not found") ||
      message.includes("Invalid");
    return res.status(isClientError ? 400 : 500).json({
      success: false,
      message: message || "Unable to force debit recurring deposit.",
    });
  }
};

exports.payRecurringInstallment = async (req, res) => {
  const rdId = toObjectId(req.params.rdId);
  if (!rdId) {
    return res.status(400).json({ success: false, message: "Invalid RD reference." });
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const rd = await RecurringDeposit.findOne({ _id: rdId, userId: req.userId }).session(session);
    if (!rd) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: "Recurring deposit not found." });
    }
    if (rd.status !== "ACTIVE") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: "Only active RD can accept installments." });
    }
    if (Number(rd.installmentsPaid || 0) >= Number(rd.tenureMonths || 0)) {
      rd.status = "MATURED";
      await rd.save({ session });
      await session.commitTransaction();
      session.endSession();
      return res.status(200).json({ success: true, message: "RD already matured.", recurringDeposit: rd });
    }

    const account = await Account.findById(rd.accountId).session(session);
    if (!account) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: "Linked account not found." });
    }
    if (account.status !== "ACTIVE") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: "Linked account is not active." });
    }

    const postingResult = await postRecurringInstallmentInternal({
      rd,
      account,
      session,
      source: "MANUAL",
    });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      success: true,
      message: "RD installment paid successfully.",
      recurringDeposit: rd,
      installmentAmount: postingResult.installmentAmount,
      newBalance: account.balance,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.closeRecurringDeposit = async (req, res) => {
  const rdId = toObjectId(req.params.rdId);
  if (!rdId) {
    return res.status(400).json({ success: false, message: "Invalid RD reference." });
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const rd = await RecurringDeposit.findOne({ _id: rdId, userId: req.userId }).session(session);
    if (!rd) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: "Recurring deposit not found." });
    }
    if (rd.status === "CLOSED") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: "Recurring deposit already closed." });
    }

    const account = await Account.findById(rd.accountId).session(session);
    if (!account) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: "Linked account not found." });
    }

    const matured = rd.status === "MATURED" || !dayjs().isBefore(dayjs(rd.maturityDate));
    const completedMonths = Math.max(1, Number(rd.installmentsPaid || 0));
    const totalDeposited = Number(rd.totalDeposited || 0);
    const prematurePenaltyRate = toPositiveNumber(
      req.body.prematurePenaltyRate,
      Number(process.env.RD_PREMATURE_PENALTY_RATE || 1)
    );
    const effectiveRate = matured ? Number(rd.annualRate || 0) : Math.max(0, Number(rd.annualRate || 0) - prematurePenaltyRate);
    const projected = calculateRdMaturity({
      monthlyInstallment: Number(rd.monthlyInstallment || 0),
      annualRate: effectiveRate,
      months: completedMonths,
    });
    const payoutAmount = round2(Math.max(totalDeposited, projected));
    const interestAmount = round2(Math.max(0, payoutAmount - totalDeposited));

    account.balance = round2(Number(account.balance || 0) + payoutAmount);
    await account.save({ session });

    const tx = await Transaction.create(
      [
        {
          accountId: account._id,
          userId: req.userId,
          type: "RD_CLOSURE",
          amount: payoutAmount,
          description: matured ? "Recurring deposit maturity payout" : "Recurring deposit premature closure payout",
          status: "SUCCESS",
          balanceAfterTransaction: account.balance,
        },
      ],
      { session }
    ).then((items) => items[0]);

    await LedgerEntry.create(
      [
        {
          accountId: account._id,
          transactionId: tx._id,
          type: "CREDIT",
          amount: payoutAmount,
          balanceAfter: account.balance,
          description: matured ? "RD maturity payout" : "RD premature payout",
        },
      ],
      { session }
    );

    await postRecurringDepositClosureJournal({
      principalAmount: totalDeposited,
      interestAmount,
      payoutAmount,
      referenceType: "RD_CLOSURE",
      referenceId: tx._id,
      metadata: {
        rdId: rd._id,
        userId: req.userId,
        accountId: account._id,
        matured,
      },
      session,
    });

    rd.status = "CLOSED";
    rd.payoutAmount = payoutAmount;
    rd.payoutTransactionId = tx._id;
    rd.closedAt = new Date();
    await rd.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      success: true,
      message: matured ? "Recurring deposit closed on maturity." : "Recurring deposit closed prematurely.",
      recurringDeposit: rd,
      payoutAmount,
      interestAmount,
      newBalance: account.balance,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createVpaHandle = async (req, res) => {
  try {
    const account = await Account.findOne({ userId: req.userId });
    if (!account) {
      return res.status(404).json({ success: false, message: "Account not found." });
    }

    const user = await User.findById(req.userId).select("firstName phone");
    const domain = String(process.env.UPI_HANDLE_DOMAIN || "bankease").trim().toLowerCase();
    const providedPrefix = String(req.body.handlePrefix || "").trim().toLowerCase();
    const defaultPrefix = String(user?.firstName || "user")
      .replace(/[^a-z0-9._-]/gi, "")
      .toLowerCase();

    let prefix = (providedPrefix || defaultPrefix || "user").replace(/[^a-z0-9._-]/gi, "");
    if (prefix.length < 3) prefix = `${prefix}001`;
    prefix = prefix.slice(0, 32);

    let handle = `${prefix}@${domain}`;
    let collision = await VpaHandle.findOne({ handle });
    if (collision) {
      handle = `${prefix}${Math.floor(10 + Math.random() * 90)}@${domain}`;
      collision = await VpaHandle.findOne({ handle });
      if (collision) {
        handle = `${prefix}${Date.now().toString().slice(-4)}@${domain}`;
      }
    }

    await VpaHandle.updateMany({ userId: req.userId, isPrimary: true }, { $set: { isPrimary: false } });
    const vpa = await VpaHandle.create({
      userId: req.userId,
      accountId: account._id,
      handle,
      linkedMobile: user?.phone || "",
      isPrimary: true,
      status: "ACTIVE",
    });

    return res.status(201).json({
      success: true,
      message: "UPI handle created successfully.",
      vpa,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getMyVpaHandles = async (req, res) => {
  try {
    const handles = await VpaHandle.find({ userId: req.userId }).sort({ isPrimary: -1, createdAt: -1 });
    return res.status(200).json({ success: true, total: handles.length, handles });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createRailTransfer = async (req, res) => {
  try {
    const rail = normalizeRail(req.body.rail);
    const direction = normalizeRail(req.body.direction || "OUTBOUND");
    const amount = toPositiveNumber(req.body.amount);
    const destination = String(req.body.destination || "").trim();
    const notes = String(req.body.notes || "").trim();

    if (!["UPI", "IMPS", "NEFT", "RTGS", "NACH", "BBPS"].includes(rail)) {
      return res.status(400).json({ success: false, message: "Unsupported rail." });
    }
    if (!["INBOUND", "OUTBOUND"].includes(direction)) {
      return res.status(400).json({ success: false, message: "Direction must be INBOUND or OUTBOUND." });
    }
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid amount." });
    }
    if (!destination) {
      return res.status(400).json({ success: false, message: "Destination is required." });
    }

    const tPlusDays = rail === "NEFT" || rail === "NACH" || rail === "BBPS" ? 1 : 0;
    const account = await Account.findOne({ userId: req.userId }).select("_id");
    const record = await SettlementRecord.create({
      direction,
      rail,
      amount,
      currency: "INR",
      settlementDate: dayjs().add(tPlusDays, "day").toDate(),
      tPlusDays,
      externalReference: buildReferenceId(`SET-${rail}`),
      partnerReference: buildReferenceId(`SWITCH-${rail}`),
      status: "QUEUED",
      userId: req.userId,
      accountId: account?._id || null,
      notes,
      metadata: {
        destination,
        simulated: true,
        switch: "NPCI_SPONSOR_SIMULATION",
      },
    });

    return res.status(201).json({
      success: true,
      message: `${rail} transfer queued for settlement.`,
      settlementRecord: record,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.listSettlementRecords = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = String(req.query.status).trim().toUpperCase();
    if (req.query.rail) filter.rail = String(req.query.rail).trim().toUpperCase();
    const records = await SettlementRecord.find(filter).sort({ createdAt: -1 }).limit(500);
    return res.status(200).json({ success: true, total: records.length, records });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.reconcileSettlementRecord = async (req, res) => {
  try {
    const settlementId = toObjectId(req.params.settlementId);
    if (!settlementId) {
      return res.status(400).json({ success: false, message: "Invalid settlement reference." });
    }

    const status = String(req.body.status || "").trim().toUpperCase();
    if (!["SENT", "SETTLED", "FAILED", "REVERSED", "MANUAL_REVIEW"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid settlement status." });
    }

    const record = await SettlementRecord.findById(settlementId);
    if (!record) {
      return res.status(404).json({ success: false, message: "Settlement record not found." });
    }

    record.status = status;
    record.failureReason = String(req.body.failureReason || "").trim();
    record.notes = String(req.body.notes || record.notes || "").trim();
    if (status === "SETTLED") {
      record.settlementDate = new Date();
    }
    await record.save();

    return res.status(200).json({
      success: true,
      message: "Settlement status updated.",
      settlementRecord: record,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.runAmlScanJob = async (req, res) => {
  try {
    const result = await runAmlScan({ userId: req.body?.userId || "" });
    return res.status(200).json({
      success: true,
      message: "AML scan completed.",
      result,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAmlAlerts = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = String(req.query.status).trim().toUpperCase();
    if (req.query.ruleCode) filter.ruleCode = String(req.query.ruleCode).trim().toUpperCase();
    if (req.query.severity) filter.severity = String(req.query.severity).trim().toUpperCase();
    if (req.query.userId && mongoose.Types.ObjectId.isValid(String(req.query.userId))) {
      filter.userId = new mongoose.Types.ObjectId(String(req.query.userId));
    }

    const alerts = await AMLAlert.find(filter).sort({ createdAt: -1 }).limit(500);
    return res.status(200).json({ success: true, total: alerts.length, alerts });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
