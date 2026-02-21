const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const User = require("../models/User");
const Account = require("../models/Account");
const Transaction = require("../models/Transaction");
const Loan = require("../models/Loan");
const Payment = require("../models/Payment");
const LedgerEntry = require("../models/LedgerEntry");
const AuditLog = require("../models/AuditLog");
const ApprovalRequest = require("../models/ApprovalRequest");
const MoneyOutPolicyConfig = require("../models/MoneyOutPolicyConfig");
const RegulatoryPolicyConfig = require("../models/RegulatoryPolicyConfig");
const RegulatoryAlert = require("../models/RegulatoryAlert");
const CardRequest = require("../models/CardRequest");
const KycRequest = require("../models/KycRequest");
const { protect } = require("../middleware/authMiddleware");
const { adminOnly } = require("../middleware/roleMiddleware");
const validate = require("../middlewares/validate");
const { isAdminIdentity } = require("../utils/adminIdentity");
const {
  getApprovalMode,
  getRequiredApprovalActions,
  isApprovalRequired,
  isDualControlEnforced,
  isReviewNoteRequired,
  getApprovalSlaHours,
  getApprovalEscalationHours,
} = require("../utils/adminApprovalPolicy");
const {
  approvalRequestsQuerySchema,
  approvalDecisionSchema,
  approvalEscalationSchema,
  approvalEscalationBulkSchema,
  moneyOutPolicyUpdateSchema,
  regulatoryPolicyUpdateSchema,
} = require("../validators/adminValidators");
const { isEmailConfigured, sendApprovalDecisionEmail } = require("../utils/emailService");
const { createNotification } = require("../utils/notificationService");
const { postJournal } = require("../utils/coreBanking/glService");
const {
  createTreasurySnapshotFromPayload,
  publishRegulatoryReportFromPayload,
  resolveRegulatoryAlertFromPayload,
  executeApprovedFixedDepositBooking,
  executeApprovedRecurringDepositCreation,
} = require("../controllers/coreBankingController");
const { executeApprovedTransferExecution } = require("../controllers/transactionController");
const { transitionLoanStatus } = require("../controllers/loanController");
const { executeApprovedSipPlanCreation, executeRejectedSipPlanCreation } = require("../controllers/sipController");
const {
  getMoneyOutPolicyState,
  normalizePolicyPayload,
  applyMoneyOutPolicy,
} = require("../utils/moneyOutPolicy");
const {
  getRegulatoryPolicyState,
  normalizeRegulatoryPolicyPayload,
  applyRegulatoryPolicy,
} = require("../utils/regulatoryPolicy");

const SYSTEM_POLICY_TARGET_ID = new mongoose.Types.ObjectId("000000000000000000000001");

const parseAuditDate = (value, endOfDay = false) => {
  const raw = String(value || "").trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const date = new Date(`${raw}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
};

const buildAuditFilterFromQuery = (query = {}) => {
  const filter = {};
  const action = String(query.action || "").trim();
  const userId = String(query.userId || "").trim();
  const from = parseAuditDate(query.from, false);
  const to = parseAuditDate(query.to, true);

  if (action) {
    filter.action = action;
  }

  if (userId) {
    filter.userId = userId;
  }

  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = from;
    if (to) filter.createdAt.$lte = to;
  }

  return filter;
};

const csvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

const createAdminAudit = async ({ req, action, metadata = {} }) => {
  try {
    await AuditLog.create({
      userId: req.userId,
      action,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"] || "",
      metadata,
    });
  } catch (_) {}
};

const buildApprovalFilterFromQuery = (query = {}) => {
  const filter = {};
  const status = String(query.status || "").trim().toUpperCase();
  const actionType = String(query.actionType || "").trim().toUpperCase();
  const targetType = String(query.targetType || "").trim().toUpperCase();
  const requestedBy = String(query.requestedBy || "").trim();
  const reviewedBy = String(query.reviewedBy || "").trim();
  const overdueOnly = Boolean(query.overdueOnly);
  const escalatedOnly = Boolean(query.escalatedOnly);

  if (status) filter.status = status;
  if (actionType) filter.actionType = actionType;
  if (targetType) filter.targetType = targetType;
  if (requestedBy) filter.requestedBy = requestedBy;
  if (reviewedBy) filter.reviewedBy = reviewedBy;

  if (overdueOnly) {
    filter.status = "PENDING";
    const cutoff = new Date(Date.now() - getApprovalSlaHours() * 60 * 60 * 1000);
    filter.createdAt = { ...(filter.createdAt || {}), $lte: cutoff };
  }

  if (escalatedOnly) {
    filter.status = "PENDING";
    filter.escalatedAt = { $ne: null };
  }

  return filter;
};

const annotateApprovalRequest = (entry) => {
  const requestObject = entry && typeof entry.toObject === "function" ? entry.toObject() : entry;
  if (!requestObject) return entry;

  const now = Date.now();
  const createdAtMs = new Date(requestObject.createdAt || now).getTime();
  const ageHours = Math.max(0, (now - createdAtMs) / (60 * 60 * 1000));
  const slaHours = getApprovalSlaHours();
  const escalationHours = getApprovalEscalationHours();
  const isPending = String(requestObject.status || "").toUpperCase() === "PENDING";
  const manuallyEscalated = Boolean(requestObject.escalatedAt);

  return {
    ...requestObject,
    ageHours: Number(ageHours.toFixed(2)),
    slaHours,
    escalationHours,
    isOverdue: isPending && ageHours > slaHours,
    isEscalated: isPending && (ageHours > escalationHours || manuallyEscalated),
  };
};

const executeAccountStatusUpdate = async ({ approvalRequest, reviewerId }) => {
  const payload = approvalRequest.payload || {};
  const nextStatus = String(payload.nextStatus || "").toUpperCase();
  const allowedStatuses = ["ACTIVE", "INACTIVE", "FROZEN", "CLOSED"];
  if (!allowedStatuses.includes(nextStatus)) {
    throw new Error("Invalid target account status in approval payload.");
  }

  const account = await Account.findById(approvalRequest.targetId);
  if (!account) {
    throw new Error("Account not found.");
  }

  const previousStatus = account.status;
  if (previousStatus === nextStatus) {
    return {
      executed: false,
      result: { previousStatus, nextStatus, accountId: account._id, accountNumber: account.accountNumber },
      message: "Account already in requested status.",
    };
  }

  account.status = nextStatus;
  await account.save();

  await AuditLog.create({
    userId: reviewerId,
    action: "ADMIN_ACCOUNT_STATUS_UPDATED",
    metadata: {
      accountId: account._id,
      accountNumber: account.accountNumber,
      previousStatus,
      nextStatus,
      approvalRequestId: approvalRequest._id,
    },
  });

  return {
    executed: true,
    result: { previousStatus, nextStatus, accountId: account._id, accountNumber: account.accountNumber },
    message: "Account status updated from approved request.",
  };
};

const executeLoanStatusUpdate = async ({ approvalRequest, reviewerId }) => {
  const payload = approvalRequest.payload || {};
  const nextStatus = String(payload.nextStatus || "").toUpperCase();
  const allowedStatuses = ["APPROVED", "REJECTED", "CLOSED"];
  if (!allowedStatuses.includes(nextStatus)) {
    throw new Error("Invalid target loan status in approval payload.");
  }
  const transitionResult = await transitionLoanStatus({
    loanId: approvalRequest.targetId,
    nextStatus,
    reviewerId,
    source: "ADMIN_APPROVAL",
    approvalRequestId: approvalRequest._id,
  });

  return {
    executed: Boolean(transitionResult.executed),
    result: {
      previousStatus: transitionResult.previousStatus,
      nextStatus: transitionResult.nextStatus,
      loanId: transitionResult.loan?._id,
      loanType: transitionResult.loan?.loanType,
      principal: transitionResult.loan?.principal,
      disbursedNow: Boolean(transitionResult.disbursedNow),
      disbursedAmount: Number(transitionResult.disbursedAmount || 0),
      disbursalTransactionId: transitionResult.disbursalTransactionId || null,
      accountBalance: transitionResult.accountBalance,
    },
    message: transitionResult.message || `Loan status updated to ${nextStatus} from approved request.`,
  };
};

const executePaymentRefund = async ({ approvalRequest, reviewerId }) => {
  const payload = approvalRequest.payload || {};
  const reason = String(payload.reason || approvalRequest.requestNote || "Refund by admin").slice(0, 200);

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const payment = await Payment.findById(approvalRequest.targetId).session(session);
    if (!payment) {
      throw new Error("Payment not found.");
    }

    if (payment.status === "REFUNDED") {
      await session.commitTransaction();
      session.endSession();
      return {
        executed: false,
        result: { paymentId: payment._id, status: payment.status, amount: payment.amount },
        message: "Payment already refunded.",
      };
    }

    if (payment.status !== "SUCCESS") {
      throw new Error("Only successful payments can be refunded.");
    }

    const account = await Account.findById(payment.accountId).session(session);
    if (!account) {
      throw new Error("Linked account not found.");
    }

    if (account.balance < payment.amount) {
      throw new Error("Insufficient account balance for refund reversal.");
    }

    account.balance -= payment.amount;
    await account.save({ session });

    const refundTx = await Transaction.create(
      [
        {
          accountId: account._id,
          userId: payment.userId,
          type: "PAYMENT_REFUND",
          amount: payment.amount,
          description: reason,
          status: "SUCCESS",
          balanceAfterTransaction: account.balance,
        },
      ],
      { session }
    );

    await LedgerEntry.create(
      [
        {
          accountId: account._id,
          transactionId: refundTx[0]._id,
          type: "DEBIT",
          amount: payment.amount,
          balanceAfter: account.balance,
          description: reason,
        },
      ],
      { session }
    );

    payment.status = "REFUNDED";
    payment.refundedAt = new Date();
    payment.refundReason = reason;
    payment.updatedByAdmin = reviewerId;
    await payment.save({ session });

    await session.commitTransaction();
    session.endSession();

    await AuditLog.create({
      userId: reviewerId,
      action: "PAYMENT_REFUNDED",
      metadata: {
        paymentId: payment._id,
        refundedUserId: payment.userId,
        amount: payment.amount,
        reason,
        approvalRequestId: approvalRequest._id,
      },
    });

    return {
      executed: true,
      result: { paymentId: payment._id, amount: payment.amount, accountBalance: account.balance, status: payment.status },
      message: "Payment refunded from approved request.",
    };
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

const executeGlManualJournal = async ({ approvalRequest, reviewerId }) => {
  const payload = approvalRequest.payload || {};
  const description = String(payload.description || "Manual GL adjustment").trim();
  const lines = Array.isArray(payload.lines) ? payload.lines : [];
  const postingDate = payload.postingDate ? new Date(payload.postingDate) : new Date();
  const referenceType = String(payload.referenceType || "GL_MANUAL_ADJUSTMENT").trim().toUpperCase();
  const metadata = typeof payload.metadata === "object" && payload.metadata !== null ? payload.metadata : {};

  if (!description) {
    throw new Error("Manual GL journal description is missing.");
  }
  if (!Array.isArray(lines) || lines.length < 2) {
    throw new Error("Manual GL journal lines are missing.");
  }
  if (Number.isNaN(postingDate.getTime())) {
    throw new Error("Manual GL journal posting date is invalid.");
  }

  const journal = await postJournal({
    description,
    lines,
    postingDate,
    referenceType,
    referenceId: approvalRequest._id,
    source: "ADMIN_APPROVAL",
    metadata: {
      ...metadata,
      approvalRequestId: approvalRequest._id,
      requestedBy: approvalRequest.requestedBy,
      reviewedBy: reviewerId,
    },
  });

  await AuditLog.create({
    userId: reviewerId,
    action: "ADMIN_GL_MANUAL_JOURNAL_EXECUTED",
    metadata: {
      approvalRequestId: approvalRequest._id,
      journalId: journal._id,
      journalNumber: journal.journalNumber,
      totalDebit: journal.totalDebit,
      totalCredit: journal.totalCredit,
      description,
    },
  });

  return {
    executed: true,
    result: {
      journalId: journal._id,
      journalNumber: journal.journalNumber,
      totalDebit: journal.totalDebit,
      totalCredit: journal.totalCredit,
      postingDate: journal.postingDate,
    },
    message: "Manual GL journal executed from approved request.",
  };
};

const executeMoneyOutPolicyUpdate = async ({ approvalRequest, reviewerId }) => {
  const payload = approvalRequest.payload || {};
  const nextPolicyRaw = payload.nextPolicy || {};
  const changeNote = String(payload.changeNote || approvalRequest.requestNote || "Money-out policy update")
    .trim()
    .slice(0, 240);
  const nextPolicy = normalizePolicyPayload(nextPolicyRaw);

  const config = await applyMoneyOutPolicy({
    nextPolicy,
    updatedBy: reviewerId,
    source: "ADMIN_APPROVAL",
    changeNote,
  });

  await AuditLog.create({
    userId: reviewerId,
    action: "ADMIN_MONEY_OUT_POLICY_UPDATED",
    metadata: {
      approvalRequestId: approvalRequest._id,
      policyConfigId: config._id,
      version: config.version,
      source: config.source,
      changeNote,
      policy: {
        maxSingleTransfer: config.maxSingleTransfer,
        dailyTransferLimit: config.dailyTransferLimit,
        highValueTransferThreshold: config.highValueTransferThreshold,
        requireTransferOtpForHighValue: config.requireTransferOtpForHighValue,
        maxSingleWithdrawal: config.maxSingleWithdrawal,
        dailyWithdrawalLimit: config.dailyWithdrawalLimit,
        enforceBeneficiary: config.enforceBeneficiary,
        allowDirectTransferWithPin: config.allowDirectTransferWithPin,
        requireVerifiedBeneficiary: config.requireVerifiedBeneficiary,
      },
    },
  });

  return {
    executed: true,
    result: {
      policyConfigId: config._id,
      version: config.version,
      source: config.source,
      changeNote: config.changeNote,
    },
    message: "Money-out policy updated from approved request.",
  };
};

const executeRegulatoryPolicyUpdate = async ({ approvalRequest, reviewerId }) => {
  const payload = approvalRequest.payload || {};
  const nextPolicyRaw = payload.nextPolicy || {};
  const changeNote = String(payload.changeNote || approvalRequest.requestNote || "Regulatory policy update")
    .trim()
    .slice(0, 240);
  const nextPolicy = normalizeRegulatoryPolicyPayload(nextPolicyRaw);

  const config = await applyRegulatoryPolicy({
    nextPolicy,
    updatedBy: reviewerId,
    source: "ADMIN_APPROVAL",
    changeNote,
  });

  await AuditLog.create({
    userId: reviewerId,
    action: "ADMIN_REGULATORY_POLICY_UPDATED",
    metadata: {
      approvalRequestId: approvalRequest._id,
      policyConfigId: config._id,
      version: config.version,
      source: config.source,
      changeNote,
      policy: {
        ctrCashThreshold: config.ctrCashThreshold,
        minLcrRatio: config.minLcrRatio,
        maxLoanToDepositRatio: config.maxLoanToDepositRatio,
        openStrAlertThreshold: config.openStrAlertThreshold,
        criticalStrAlertThreshold: config.criticalStrAlertThreshold,
      },
    },
  });

  return {
    executed: true,
    result: {
      policyConfigId: config._id,
      version: config.version,
      source: config.source,
      changeNote: config.changeNote,
    },
    message: "Regulatory policy updated from approved request.",
  };
};

const executeTreasurySnapshotCreate = async ({ approvalRequest, reviewerId }) => {
  const payload = approvalRequest.payload || {};
  const snapshot = await createTreasurySnapshotFromPayload({
    payload,
    actorUserId: reviewerId,
    source: "ADMIN_APPROVAL",
    approvalRequestId: approvalRequest._id,
  });

  return {
    executed: true,
    result: {
      snapshotId: snapshot._id,
      asOfDate: snapshot.asOfDate,
      crrRatio: snapshot.crrRatio,
      slrRatio: snapshot.slrRatio,
      lcrRatio: snapshot.lcrRatio,
      netLiquidity: snapshot.netLiquidity,
    },
    message: "Treasury snapshot created from approved request.",
  };
};

const executeRegulatoryReportPublish = async ({ approvalRequest, reviewerId }) => {
  const payload = approvalRequest.payload || {};
  const publication = await publishRegulatoryReportFromPayload({
    payload,
    actorUserId: reviewerId,
    source: "ADMIN_APPROVAL",
    approvalRequestId: approvalRequest._id,
  });

  return {
    executed: true,
    result: publication,
    message: "Regulatory report published from approved request.",
  };
};

const executeRegulatoryAlertResolve = async ({ approvalRequest, reviewerId }) => {
  const payload = approvalRequest.payload || {};
  const requestedAlertId = payload.alertId || approvalRequest.targetId;
  const resolutionNote = String(
    payload.resolutionNote || approvalRequest.reviewNote || approvalRequest.requestNote || "Resolved by admin approval"
  )
    .trim()
    .slice(0, 300);

  const existingAlert = await RegulatoryAlert.findById(requestedAlertId);
  if (!existingAlert) {
    throw new Error("Regulatory alert not found.");
  }
  if (existingAlert.status === "RESOLVED") {
    return {
      executed: false,
      result: {
        alertId: existingAlert._id,
        alertKey: existingAlert.alertKey,
        indicatorCode: existingAlert.indicatorCode,
        status: existingAlert.status,
      },
      message: "Regulatory alert already resolved.",
    };
  }

  const alert = await resolveRegulatoryAlertFromPayload({
    payload: {
      alertId: existingAlert._id,
      resolutionNote: resolutionNote || "Resolved by admin approval",
    },
    actorUserId: reviewerId,
    source: "ADMIN_APPROVAL",
    approvalRequestId: approvalRequest._id,
  });

  return {
    executed: true,
    result: {
      alertId: alert._id,
      alertKey: alert.alertKey,
      indicatorCode: alert.indicatorCode,
      status: alert.status,
      resolvedAt: alert.resolvedAt,
    },
    message: "Regulatory alert resolved from approved request.",
  };
};

const executeApprovedAction = async ({ approvalRequest, reviewerId, req }) => {
  if (approvalRequest.actionType === "ACCOUNT_STATUS_UPDATE") {
    return executeAccountStatusUpdate({ approvalRequest, reviewerId });
  }
  if (approvalRequest.actionType === "LOAN_STATUS_UPDATE") {
    return executeLoanStatusUpdate({ approvalRequest, reviewerId });
  }
  if (approvalRequest.actionType === "TRANSFER_EXECUTION") {
    return executeApprovedTransferExecution({
      approvalRequest,
      reviewerId,
      ipAddress: req?.ip || "",
      userAgent: req?.headers?.["user-agent"] || "",
    });
  }
  if (approvalRequest.actionType === "SIP_PLAN_CREATION") {
    return executeApprovedSipPlanCreation({
      approvalRequest,
      reviewerId,
    });
  }
  if (approvalRequest.actionType === "FD_BOOKING_CREATE") {
    return executeApprovedFixedDepositBooking({
      approvalRequest,
      reviewerId,
      ipAddress: req?.ip || "",
      userAgent: req?.headers?.["user-agent"] || "",
    });
  }
  if (approvalRequest.actionType === "RD_CREATION") {
    return executeApprovedRecurringDepositCreation({
      approvalRequest,
      reviewerId,
      ipAddress: req?.ip || "",
      userAgent: req?.headers?.["user-agent"] || "",
    });
  }
  if (approvalRequest.actionType === "PAYMENT_REFUND") {
    return executePaymentRefund({ approvalRequest, reviewerId });
  }
  if (approvalRequest.actionType === "GL_MANUAL_JOURNAL") {
    return executeGlManualJournal({ approvalRequest, reviewerId });
  }
  if (approvalRequest.actionType === "MONEY_OUT_POLICY_UPDATE") {
    return executeMoneyOutPolicyUpdate({ approvalRequest, reviewerId });
  }
  if (approvalRequest.actionType === "REGULATORY_POLICY_UPDATE") {
    return executeRegulatoryPolicyUpdate({ approvalRequest, reviewerId });
  }
  if (approvalRequest.actionType === "TREASURY_SNAPSHOT_CREATE") {
    return executeTreasurySnapshotCreate({ approvalRequest, reviewerId });
  }
  if (approvalRequest.actionType === "REGULATORY_REPORT_PUBLISH") {
    return executeRegulatoryReportPublish({ approvalRequest, reviewerId });
  }
  if (approvalRequest.actionType === "REGULATORY_ALERT_RESOLVE") {
    return executeRegulatoryAlertResolve({ approvalRequest, reviewerId });
  }
  throw new Error("Unsupported approval action type.");
};

const notifyApprovalRequester = async ({ approvalRequest, decision, reviewNote, executionMessage }) => {
  try {
    const requester = await User.findById(approvalRequest.requestedBy).select("firstName email");
    if (!requester?._id) return;

    const normalizedDecision = String(decision || "").toUpperCase();
    const titleMap = {
      EXECUTED: "Approval Request Executed",
      FAILED: "Approval Request Failed",
      REJECTED: "Approval Request Rejected",
      ESCALATED: "Approval Request Escalated",
    };
    const typeMap = {
      EXECUTED: "SUCCESS",
      FAILED: "WARNING",
      REJECTED: "WARNING",
      ESCALATED: "INFO",
    };
    const title = titleMap[normalizedDecision] || "Approval Request Updated";
    const fallbackMessage =
      normalizedDecision === "EXECUTED"
        ? "Your request has been approved and executed."
        : normalizedDecision === "FAILED"
        ? "Your request was approved but failed during execution."
        : normalizedDecision === "REJECTED"
        ? "Your request was rejected by reviewer."
        : normalizedDecision === "ESCALATED"
        ? "Your request has been escalated for priority review."
        : "Your request status has been updated.";

    await createNotification({
      userId: requester._id,
      title,
      message: executionMessage || fallbackMessage,
      category: "ACCOUNT",
      type: typeMap[normalizedDecision] || "INFO",
      actionLink: "/core-banking?module=approvals",
      metadata: {
        approvalRequestId: approvalRequest._id,
        actionType: approvalRequest.actionType,
        targetType: approvalRequest.targetType,
        decision: normalizedDecision || decision,
        reviewNote: reviewNote || "",
      },
    });

    if (!isEmailConfigured() || !requester.email) {
      return;
    }

    await sendApprovalDecisionEmail({
      email: requester.email,
      userName: requester.firstName || "User",
      actionType: approvalRequest.actionType,
      targetType: approvalRequest.targetType,
      decision,
      reviewNote,
      executionMessage,
      requestId: approvalRequest._id,
    });
  } catch (_) {}
};

const normalizeOptionalString = (value) => {
  if (typeof value !== "string") return undefined;
  return value.trim();
};

const escalateApprovalRequest = async ({ approvalRequest, req, escalatedBy, escalationNote }) => {
  if (!approvalRequest) {
    throw new Error("Approval request not found.");
  }
  if (String(approvalRequest.status || "").toUpperCase() !== "PENDING") {
    throw new Error("Only pending approval requests can be escalated.");
  }

  if (approvalRequest.escalatedAt) {
    return { escalated: false, message: "Approval request is already escalated." };
  }

  const note = String(escalationNote || "Escalated by admin").trim();
  approvalRequest.escalatedAt = new Date();
  approvalRequest.escalatedBy = escalatedBy;
  approvalRequest.escalationNote = note;
  await approvalRequest.save();

  await createAdminAudit({
    req,
    action: "ADMIN_APPROVAL_ESCALATED",
    metadata: {
      approvalRequestId: approvalRequest._id,
      actionType: approvalRequest.actionType,
      targetType: approvalRequest.targetType,
      targetId: approvalRequest.targetId,
      escalationNote: note,
    },
  });

  await notifyApprovalRequester({
    approvalRequest,
    decision: "ESCALATED",
    reviewNote: note,
    executionMessage: "Approval request has been escalated for priority review.",
  });

  return { escalated: true, message: "Approval request escalated successfully." };
};

// Get all users
router.get("/users", protect, adminOnly, async (req, res) => {
  try {
    const users = await User.find().select("+transactionPinLockedUntil +transactionPinAttempts");
    res.status(200).json({
      success: true,
      totalUsers: users.length,
      users,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get all accounts
router.get("/accounts", protect, adminOnly, async (req, res) => {
  try {
    const accounts = await Account.find().populate("userId", "firstName lastName email");
    res.status(200).json({
      success: true,
      totalAccounts: accounts.length,
      accounts,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get all transactions
router.get("/transactions", protect, adminOnly, async (req, res) => {
  try {
    const transactions = await Transaction.find()
      .populate("userId", "firstName lastName")
      .populate("accountId", "accountNumber")
      .sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      totalTransactions: transactions.length,
      transactions,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get dashboard stats
router.get("/stats", protect, adminOnly, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalAccounts = await Account.countDocuments();
    const totalTransactions = await Transaction.countDocuments();
    const totalLoans = await Loan.countDocuments();
    const totalPayments = await Payment.countDocuments();
    const totalCardRequests = await CardRequest.countDocuments();
    const totalPendingCardRequests = await CardRequest.countDocuments({ status: "PENDING" });
    const totalKycRequests = await KycRequest.countDocuments();
    const totalPendingKycRequests = await KycRequest.countDocuments({ status: "PENDING" });
    const totalAuditLogs = await AuditLog.countDocuments();
    const totalPendingApprovals = await ApprovalRequest.countDocuments({ status: "PENDING" });
    const pendingApprovalRequests = await ApprovalRequest.find({ status: "PENDING" }).select("createdAt");
    const totalPaymentReviewsPending = await Payment.countDocuments({ "metadata.webhookRefundPendingReview": true });
    const failedLoginsLast24h = await AuditLog.countDocuments({
      action: "LOGIN_FAILED",
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });

    const totalBalance = await Account.aggregate([
      { $group: { _id: null, totalBalance: { $sum: "$balance" } } },
    ]);

    const totalLoanAmount = await Loan.aggregate([
      { $group: { _id: null, totalAmount: { $sum: "$principal" } } },
    ]);
    const totalPaymentAmount = await Payment.aggregate([
      { $match: { status: "SUCCESS" } },
      { $group: { _id: null, totalAmount: { $sum: "$amount" } } },
    ]);

    const slaHours = getApprovalSlaHours();
    const escalationHours = getApprovalEscalationHours();
    const approvalAges = pendingApprovalRequests.map((entry) =>
      Math.max(0, (Date.now() - new Date(entry.createdAt || Date.now()).getTime()) / (60 * 60 * 1000))
    );
    const pendingOverdueApprovals = approvalAges.filter((ageHours) => ageHours > slaHours).length;
    const pendingEscalatedApprovals = approvalAges.filter((ageHours) => ageHours > escalationHours).length;

    res.status(200).json({
      success: true,
      stats: {
        totalUsers,
        totalAccounts,
        totalTransactions,
        totalLoans,
        totalPayments,
        totalCardRequests,
        totalPendingCardRequests,
        totalKycRequests,
        totalPendingKycRequests,
        totalAuditLogs,
        totalPendingApprovals,
        pendingOverdueApprovals,
        pendingEscalatedApprovals,
        failedLoginsLast24h,
        totalPaymentReviewsPending,
        approvalMode: getApprovalMode(),
        requiredApprovalActions: getRequiredApprovalActions(),
        dualControlEnforced: isDualControlEnforced(),
        reviewNoteRequired: isReviewNoteRequired(),
        approvalSlaHours: slaHours,
        approvalEscalationHours: escalationHours,
        totalBalance: totalBalance[0]?.totalBalance || 0,
        totalLoanAmount: totalLoanAmount[0]?.totalAmount || 0,
        totalPaymentAmount: totalPaymentAmount[0]?.totalAmount || 0,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get active money-out policy
router.get("/policy/money-out", protect, adminOnly, async (req, res) => {
  try {
    const state = getMoneyOutPolicyState();
    const activeConfig = await MoneyOutPolicyConfig.findOne({ key: "DEFAULT", isActive: true })
      .populate("updatedBy", "firstName lastName email phone role")
      .sort({ version: -1 });

    return res.status(200).json({
      success: true,
      policy: state.policy,
      source: state.source,
      version: state.version,
      updatedAt: state.updatedAt,
      config: activeConfig,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Get money-out policy history
router.get("/policy/money-out/history", protect, adminOnly, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 200);
    const history = await MoneyOutPolicyConfig.find({ key: "DEFAULT" })
      .populate("updatedBy", "firstName lastName email phone role")
      .sort({ version: -1 })
      .limit(limit);

    return res.status(200).json({
      success: true,
      total: history.length,
      history,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Request / apply money-out policy update (maker-checker aware)
router.post("/policy/money-out/request", protect, adminOnly, validate(moneyOutPolicyUpdateSchema), async (req, res) => {
  try {
    const currentState = getMoneyOutPolicyState();
    const nextPolicy = normalizePolicyPayload(req.body || {}, currentState.policy);
    const changeNote = String(req.body?.changeNote || "Money-out policy update requested")
      .trim()
      .slice(0, 240);

    if (nextPolicy.dailyTransferLimit < nextPolicy.maxSingleTransfer) {
      return res.status(400).json({
        success: false,
        message: "Daily transfer limit must be greater than or equal to single transfer limit.",
      });
    }
    if (nextPolicy.dailyWithdrawalLimit < nextPolicy.maxSingleWithdrawal) {
      return res.status(400).json({
        success: false,
        message: "Daily withdrawal limit must be greater than or equal to single withdrawal limit.",
      });
    }
    if (nextPolicy.highValueTransferThreshold > nextPolicy.maxSingleTransfer) {
      return res.status(400).json({
        success: false,
        message: "High-value threshold cannot exceed single transfer limit.",
      });
    }

    if (isApprovalRequired("MONEY_OUT_POLICY_UPDATE")) {
      const existingRequest = await ApprovalRequest.findOne({
        actionType: "MONEY_OUT_POLICY_UPDATE",
        targetType: "SYSTEM_POLICY",
        targetId: SYSTEM_POLICY_TARGET_ID,
        status: "PENDING",
      });

      if (existingRequest) {
        return res.status(202).json({
          success: true,
          pendingApproval: true,
          message: "An approval request is already pending for money-out policy update.",
          approvalRequest: existingRequest,
        });
      }

      const approvalRequest = await ApprovalRequest.create({
        actionType: "MONEY_OUT_POLICY_UPDATE",
        targetType: "SYSTEM_POLICY",
        targetId: SYSTEM_POLICY_TARGET_ID,
        payload: {
          previousPolicy: currentState.policy,
          nextPolicy,
          changeNote,
        },
        requestNote: changeNote,
        requestedBy: req.userId,
      });

      await createAdminAudit({
        req,
        action: "ADMIN_APPROVAL_REQUEST_CREATED",
        metadata: {
          approvalRequestId: approvalRequest._id,
          actionType: approvalRequest.actionType,
          targetType: approvalRequest.targetType,
          targetId: approvalRequest.targetId,
          changeNote,
        },
      });

      return res.status(202).json({
        success: true,
        pendingApproval: true,
        message: "Money-out policy update submitted for approval.",
        approvalRequest,
      });
    }

    const config = await applyMoneyOutPolicy({
      nextPolicy,
      updatedBy: req.userId,
      source: "ADMIN_DIRECT",
      changeNote,
    });

    await createAdminAudit({
      req,
      action: "ADMIN_MONEY_OUT_POLICY_UPDATED",
      metadata: {
        policyConfigId: config._id,
        version: config.version,
        source: config.source,
        changeNote: config.changeNote,
      },
    });

    return res.status(200).json({
      success: true,
      pendingApproval: false,
      message: "Money-out policy updated successfully.",
      config,
      policy: getMoneyOutPolicyState().policy,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Get active regulatory policy
router.get("/policy/regulatory", protect, adminOnly, async (req, res) => {
  try {
    const state = getRegulatoryPolicyState();
    const activeConfig = await RegulatoryPolicyConfig.findOne({ key: "DEFAULT", isActive: true })
      .populate("updatedBy", "firstName lastName email phone role")
      .sort({ version: -1 });

    return res.status(200).json({
      success: true,
      policy: state.policy,
      source: state.source,
      version: state.version,
      updatedAt: state.updatedAt,
      config: activeConfig,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Get regulatory policy history
router.get("/policy/regulatory/history", protect, adminOnly, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 200);
    const history = await RegulatoryPolicyConfig.find({ key: "DEFAULT" })
      .populate("updatedBy", "firstName lastName email phone role")
      .sort({ version: -1 })
      .limit(limit);

    return res.status(200).json({
      success: true,
      total: history.length,
      history,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Request / apply regulatory policy update (maker-checker aware)
router.post(
  "/policy/regulatory/request",
  protect,
  adminOnly,
  validate(regulatoryPolicyUpdateSchema),
  async (req, res) => {
    try {
      const currentState = getRegulatoryPolicyState();
      const nextPolicy = normalizeRegulatoryPolicyPayload(req.body || {}, currentState.policy);
      const changeNote = String(req.body?.changeNote || "Regulatory policy update requested")
        .trim()
        .slice(0, 240);

      if (nextPolicy.criticalStrAlertThreshold > nextPolicy.openStrAlertThreshold) {
        return res.status(400).json({
          success: false,
          message: "Critical STR alert threshold cannot be greater than open STR threshold.",
        });
      }

      if (isApprovalRequired("REGULATORY_POLICY_UPDATE")) {
        const existingRequest = await ApprovalRequest.findOne({
          actionType: "REGULATORY_POLICY_UPDATE",
          targetType: "SYSTEM_POLICY",
          targetId: SYSTEM_POLICY_TARGET_ID,
          status: "PENDING",
        });

        if (existingRequest) {
          return res.status(202).json({
            success: true,
            pendingApproval: true,
            message: "An approval request is already pending for regulatory policy update.",
            approvalRequest: existingRequest,
          });
        }

        const approvalRequest = await ApprovalRequest.create({
          actionType: "REGULATORY_POLICY_UPDATE",
          targetType: "SYSTEM_POLICY",
          targetId: SYSTEM_POLICY_TARGET_ID,
          payload: {
            previousPolicy: currentState.policy,
            nextPolicy,
            changeNote,
          },
          requestNote: changeNote,
          requestedBy: req.userId,
        });

        await createAdminAudit({
          req,
          action: "ADMIN_APPROVAL_REQUEST_CREATED",
          metadata: {
            approvalRequestId: approvalRequest._id,
            actionType: approvalRequest.actionType,
            targetType: approvalRequest.targetType,
            targetId: approvalRequest.targetId,
            changeNote,
          },
        });

        return res.status(202).json({
          success: true,
          pendingApproval: true,
          message: "Regulatory policy update submitted for approval.",
          approvalRequest,
        });
      }

      const config = await applyRegulatoryPolicy({
        nextPolicy,
        updatedBy: req.userId,
        source: "ADMIN_DIRECT",
        changeNote,
      });

      await createAdminAudit({
        req,
        action: "ADMIN_REGULATORY_POLICY_UPDATED",
        metadata: {
          policyConfigId: config._id,
          version: config.version,
          source: config.source,
          changeNote: config.changeNote,
        },
      });

      return res.status(200).json({
        success: true,
        pendingApproval: false,
        message: "Regulatory policy updated successfully.",
        config,
        policy: getRegulatoryPolicyState().policy,
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }
);

// Get audit logs with filters
router.get("/audit-logs", protect, adminOnly, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const skip = (page - 1) * limit;
    const filter = buildAuditFilterFromQuery(req.query);

    const [logs, totalLogs, actionCounts] = await Promise.all([
      AuditLog.find(filter)
        .populate("userId", "firstName lastName email phone role")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      AuditLog.countDocuments(filter),
      AuditLog.aggregate([
        { $match: filter },
        { $group: { _id: "$action", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 25 },
      ]),
    ]);

    res.status(200).json({
      success: true,
      page,
      limit,
      totalLogs,
      totalPages: Math.max(1, Math.ceil(totalLogs / limit)),
      actionCounts: actionCounts.map((entry) => ({ action: entry._id, count: entry.count })),
      logs,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Export audit logs as CSV
router.get("/audit-logs/export", protect, adminOnly, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 2000, 1), 10000);
    const filter = buildAuditFilterFromQuery(req.query);

    const logs = await AuditLog.find(filter)
      .populate("userId", "firstName lastName email phone role")
      .sort({ createdAt: -1 })
      .limit(limit);

    const headers = [
      "createdAt",
      "action",
      "actorName",
      "actorEmail",
      "actorPhone",
      "actorRole",
      "ipAddress",
      "userAgent",
      "metadata",
    ];

    const rows = logs.map((entry) => {
      const actor = entry.userId || {};
      const actorName = `${actor.firstName || ""} ${actor.lastName || ""}`.trim();
      return [
        entry.createdAt ? new Date(entry.createdAt).toISOString() : "",
        entry.action || "",
        actorName || "System",
        actor.email || "",
        actor.phone || "",
        actor.role || "",
        entry.ipAddress || "",
        entry.userAgent || "",
        JSON.stringify(entry.metadata || {}),
      ]
        .map((cell) => csvCell(cell))
        .join(",");
    });

    const csvContent = `${headers.join(",")}\n${rows.join("\n")}`;
    const fileDate = new Date().toISOString().slice(0, 10);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=\"audit-logs-${fileDate}.csv\"`);
    return res.status(200).send(csvContent);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// List approval requests
router.get("/approval-requests", protect, adminOnly, validate(approvalRequestsQuerySchema), async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const skip = (page - 1) * limit;
    const filter = buildApprovalFilterFromQuery(req.query);

    const [requests, totalRequests, pendingByAction] = await Promise.all([
      ApprovalRequest.find(filter)
        .populate("requestedBy", "firstName lastName email phone role")
        .populate("reviewedBy", "firstName lastName email phone role")
        .populate("escalatedBy", "firstName lastName email phone role")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      ApprovalRequest.countDocuments(filter),
      ApprovalRequest.aggregate([
        { $match: { status: "PENDING" } },
        { $group: { _id: "$actionType", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    const annotatedRequests = requests.map((entry) => annotateApprovalRequest(entry));
    const pendingOverdueApprovals = annotatedRequests.filter((entry) => entry.isOverdue).length;
    const pendingEscalatedApprovals = annotatedRequests.filter((entry) => entry.isEscalated).length;

    return res.status(200).json({
      success: true,
      page,
      limit,
      totalRequests,
      totalPages: Math.max(1, Math.ceil(totalRequests / limit)),
      pendingByAction: pendingByAction.map((entry) => ({ actionType: entry._id, count: entry.count })),
      pendingOverdueApprovals,
      pendingEscalatedApprovals,
      approvalMode: getApprovalMode(),
      requiredApprovalActions: getRequiredApprovalActions(),
      dualControlEnforced: isDualControlEnforced(),
      reviewNoteRequired: isReviewNoteRequired(),
      approvalSlaHours: getApprovalSlaHours(),
      approvalEscalationHours: getApprovalEscalationHours(),
      requests: annotatedRequests,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Export approval requests as CSV
router.get("/approval-requests/export", protect, adminOnly, validate(approvalRequestsQuerySchema), async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 2000, 1), 10000);
    const filter = buildApprovalFilterFromQuery(req.query);

    const requests = await ApprovalRequest.find(filter)
      .populate("requestedBy", "firstName lastName email phone role")
      .populate("reviewedBy", "firstName lastName email phone role")
      .populate("escalatedBy", "firstName lastName email phone role")
      .sort({ createdAt: -1 })
      .limit(limit);

    const headers = [
      "createdAt",
      "actionType",
      "targetType",
      "targetId",
      "status",
      "ageHours",
      "slaHours",
      "escalationHours",
      "isOverdue",
      "isEscalated",
      "requestedByName",
      "requestedByEmail",
      "reviewedByName",
      "reviewedByEmail",
      "escalatedByName",
      "escalatedByEmail",
      "escalatedAt",
      "escalationNote",
      "requestNote",
      "reviewNote",
      "failureReason",
      "reviewedAt",
      "executedAt",
      "payload",
    ];

    const rows = requests.map((entry) => {
      const annotated = annotateApprovalRequest(entry);
      const requestedBy = annotated.requestedBy || {};
      const reviewedBy = annotated.reviewedBy || {};
      const escalatedBy = annotated.escalatedBy || {};
      const requestedByName = `${requestedBy.firstName || ""} ${requestedBy.lastName || ""}`.trim();
      const reviewedByName = `${reviewedBy.firstName || ""} ${reviewedBy.lastName || ""}`.trim();
      const escalatedByName = `${escalatedBy.firstName || ""} ${escalatedBy.lastName || ""}`.trim();

      return [
        annotated.createdAt ? new Date(annotated.createdAt).toISOString() : "",
        annotated.actionType || "",
        annotated.targetType || "",
        annotated.targetId || "",
        annotated.status || "",
        annotated.ageHours ?? "",
        annotated.slaHours ?? "",
        annotated.escalationHours ?? "",
        annotated.isOverdue ? "true" : "false",
        annotated.isEscalated ? "true" : "false",
        requestedByName || "System",
        requestedBy.email || "",
        reviewedByName || "",
        reviewedBy.email || "",
        escalatedByName || "",
        escalatedBy.email || "",
        annotated.escalatedAt ? new Date(annotated.escalatedAt).toISOString() : "",
        annotated.escalationNote || "",
        annotated.requestNote || "",
        annotated.reviewNote || "",
        annotated.failureReason || "",
        annotated.reviewedAt ? new Date(annotated.reviewedAt).toISOString() : "",
        annotated.executedAt ? new Date(annotated.executedAt).toISOString() : "",
        JSON.stringify(annotated.payload || {}),
      ]
        .map((cell) => csvCell(cell))
        .join(",");
    });

    const csvContent = `${headers.join(",")}\n${rows.join("\n")}`;
    const fileDate = new Date().toISOString().slice(0, 10);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=\"approval-requests-${fileDate}.csv\"`);
    return res.status(200).send(csvContent);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Escalate single approval request
router.post("/approval-requests/:approvalId/escalate", protect, adminOnly, validate(approvalEscalationSchema), async (req, res) => {
  try {
    const { approvalId } = req.params;
    const escalationNote = String(req.body?.escalationNote || "Escalated by admin").trim();

    const approvalRequest = await ApprovalRequest.findById(approvalId);
    if (!approvalRequest) {
      return res.status(404).json({ success: false, message: "Approval request not found." });
    }

    const result = await escalateApprovalRequest({
      approvalRequest,
      req,
      escalatedBy: req.userId,
      escalationNote,
    });

    return res.status(result.escalated ? 200 : 200).json({
      success: true,
      escalated: result.escalated,
      message: result.message,
      approvalRequest: annotateApprovalRequest(approvalRequest),
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

// Escalate overdue pending approvals in bulk
router.post("/approval-requests/escalate-overdue", protect, adminOnly, validate(approvalEscalationBulkSchema), async (req, res) => {
  try {
    const escalationNote = String(req.body?.escalationNote || "Escalated due to pending SLA breach").trim();
    const limit = Math.min(Math.max(Number(req.body?.limit) || 200, 1), 500);
    const cutoff = new Date(Date.now() - getApprovalSlaHours() * 60 * 60 * 1000);

    const pendingOverdue = await ApprovalRequest.find({
      status: "PENDING",
      createdAt: { $lte: cutoff },
      $or: [{ escalatedAt: null }, { escalatedAt: { $exists: false } }],
    })
      .sort({ createdAt: 1 })
      .limit(limit);

    const escalatedIds = [];
    const skippedIds = [];
    for (const request of pendingOverdue) {
      try {
        const result = await escalateApprovalRequest({
          approvalRequest: request,
          req,
          escalatedBy: req.userId,
          escalationNote,
        });
        if (result.escalated) {
          escalatedIds.push(String(request._id));
        } else {
          skippedIds.push(String(request._id));
        }
      } catch (_) {
        skippedIds.push(String(request._id));
      }
    }

    await createAdminAudit({
      req,
      action: "ADMIN_APPROVAL_ESCALATED_BULK",
      metadata: {
        escalationNote,
        considered: pendingOverdue.length,
        escalatedCount: escalatedIds.length,
        skippedCount: skippedIds.length,
      },
    });

    return res.status(200).json({
      success: true,
      message: `Bulk escalation complete. Escalated ${escalatedIds.length} request(s).`,
      considered: pendingOverdue.length,
      escalatedCount: escalatedIds.length,
      skippedCount: skippedIds.length,
      escalatedIds,
      skippedIds,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Approve and execute approval request
router.post("/approval-requests/:approvalId/approve", protect, adminOnly, validate(approvalDecisionSchema), async (req, res) => {
  try {
    const { approvalId } = req.params;
    const providedReviewNote = String(req.body?.reviewNote || "").trim();
    if (isReviewNoteRequired() && !providedReviewNote) {
      return res.status(400).json({
        success: false,
        message: "Review note is required by approval policy.",
      });
    }
    const reviewNote = providedReviewNote || "Approved by admin";

    const approvalRequest = await ApprovalRequest.findById(approvalId);
    if (!approvalRequest) {
      return res.status(404).json({ success: false, message: "Approval request not found." });
    }

    if (approvalRequest.status !== "PENDING") {
      return res.status(400).json({ success: false, message: "Only pending approval requests can be approved." });
    }

    if (isDualControlEnforced() && String(approvalRequest.requestedBy) === String(req.userId)) {
      await createAdminAudit({
        req,
        action: "ADMIN_APPROVAL_BLOCKED_DUAL_CONTROL",
        metadata: {
          approvalRequestId: approvalRequest._id,
          actionType: approvalRequest.actionType,
          targetType: approvalRequest.targetType,
          targetId: approvalRequest.targetId,
        },
      });
      return res.status(403).json({
        success: false,
        message: "Dual-control policy enabled. Requester cannot approve own request.",
      });
    }

    let executionResult = null;
    try {
      executionResult = await executeApprovedAction({
        approvalRequest,
        reviewerId: req.userId,
        req,
      });
      approvalRequest.status = "EXECUTED";
      approvalRequest.executedAt = new Date();
      approvalRequest.failureReason = "";
    } catch (executeError) {
      approvalRequest.status = "FAILED";
      approvalRequest.failureReason = executeError.message || "Execution failed.";
      executionResult = { message: approvalRequest.failureReason, executed: false, result: {} };
    }

    approvalRequest.reviewedBy = req.userId;
    approvalRequest.reviewedAt = new Date();
    approvalRequest.reviewNote = reviewNote;
    await approvalRequest.save();

    await createAdminAudit({
      req,
      action: approvalRequest.status === "EXECUTED" ? "ADMIN_APPROVAL_EXECUTED" : "ADMIN_APPROVAL_FAILED",
      metadata: {
        approvalRequestId: approvalRequest._id,
        actionType: approvalRequest.actionType,
        targetType: approvalRequest.targetType,
        targetId: approvalRequest.targetId,
        reviewNote,
        executionMessage: executionResult?.message || "",
      },
    });

    await notifyApprovalRequester({
      approvalRequest,
      decision: approvalRequest.status === "EXECUTED" ? "EXECUTED" : "FAILED",
      reviewNote,
      executionMessage: executionResult?.message || "",
    });

    if (approvalRequest.status !== "EXECUTED") {
      return res.status(400).json({
        success: false,
        message: executionResult?.message || "Approved request failed during execution.",
        approvalRequest,
      });
    }

    return res.status(200).json({
      success: true,
      message: executionResult?.message || "Approval request executed successfully.",
      approvalRequest,
      executionResult: executionResult?.result || {},
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Reject approval request
router.post("/approval-requests/:approvalId/reject", protect, adminOnly, validate(approvalDecisionSchema), async (req, res) => {
  try {
    const { approvalId } = req.params;
    const providedReviewNote = String(req.body?.reviewNote || "").trim();
    if (isReviewNoteRequired() && !providedReviewNote) {
      return res.status(400).json({
        success: false,
        message: "Review note is required by approval policy.",
      });
    }
    const reviewNote = providedReviewNote || "Rejected by admin";

    const approvalRequest = await ApprovalRequest.findById(approvalId);
    if (!approvalRequest) {
      return res.status(404).json({ success: false, message: "Approval request not found." });
    }

    if (approvalRequest.status !== "PENDING") {
      return res.status(400).json({ success: false, message: "Only pending approval requests can be rejected." });
    }

    if (isDualControlEnforced() && String(approvalRequest.requestedBy) === String(req.userId)) {
      await createAdminAudit({
        req,
        action: "ADMIN_APPROVAL_BLOCKED_DUAL_CONTROL",
        metadata: {
          approvalRequestId: approvalRequest._id,
          actionType: approvalRequest.actionType,
          targetType: approvalRequest.targetType,
          targetId: approvalRequest.targetId,
        },
      });
      return res.status(403).json({
        success: false,
        message: "Dual-control policy enabled. Requester cannot reject own request.",
      });
    }

    if (approvalRequest.actionType === "SIP_PLAN_CREATION") {
      await executeRejectedSipPlanCreation({
        approvalRequest,
        reviewerId: req.userId,
        reviewNote,
      });
    }

    approvalRequest.status = "REJECTED";
    approvalRequest.reviewedBy = req.userId;
    approvalRequest.reviewedAt = new Date();
    approvalRequest.reviewNote = reviewNote;
    approvalRequest.failureReason = "";
    await approvalRequest.save();

    await createAdminAudit({
      req,
      action: "ADMIN_APPROVAL_REJECTED",
      metadata: {
        approvalRequestId: approvalRequest._id,
        actionType: approvalRequest.actionType,
        targetType: approvalRequest.targetType,
        targetId: approvalRequest.targetId,
        reviewNote,
      },
    });

    await notifyApprovalRequester({
      approvalRequest,
      decision: "REJECTED",
      reviewNote,
      executionMessage: "Request was rejected by reviewer.",
    });

    return res.status(200).json({
      success: true,
      message: "Approval request rejected successfully.",
      approvalRequest,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Deactivate user account
router.put("/users/:userId/deactivate", protect, adminOnly, async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.userId);

    if (!targetUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (String(targetUser._id) === String(req.userId)) {
      return res.status(400).json({ success: false, message: "You cannot deactivate your own account" });
    }

    if (isAdminIdentity({ email: targetUser.email, phone: targetUser.phone })) {
      return res.status(400).json({ success: false, message: "Protected admin account cannot be deactivated" });
    }

    const user = await User.findByIdAndUpdate(req.params.userId, { isActive: false }, { new: true });

    await createAdminAudit({
      req,
      action: "ADMIN_USER_DEACTIVATED",
      metadata: {
        targetUserId: user._id,
        targetEmail: user.email,
        targetPhone: user.phone,
      },
    });

    res.status(200).json({
      success: true,
      message: "User deactivated successfully",
      user,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Activate user account
router.put("/users/:userId/activate", protect, adminOnly, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.userId, { isActive: true }, { new: true });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    await createAdminAudit({
      req,
      action: "ADMIN_USER_ACTIVATED",
      metadata: {
        targetUserId: user._id,
        targetEmail: user.email,
        targetPhone: user.phone,
      },
    });

    res.status(200).json({
      success: true,
      message: "User activated successfully",
      user,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Unblock transaction PIN for user (admin action)
router.put("/users/:userId/unblock-transactions", protect, adminOnly, async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.userId).select("+transactionPinLockedUntil +transactionPinAttempts +transactionPinHash");
    if (!targetUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (!targetUser.transactionPinHash) {
      return res.status(400).json({ success: false, message: "User has not configured transaction PIN yet." });
    }

    const wasLocked = Boolean(
      targetUser.transactionPinLockedUntil && new Date(targetUser.transactionPinLockedUntil) > new Date()
    );
    const previousLockedUntil = targetUser.transactionPinLockedUntil;
    const previousAttempts = Number(targetUser.transactionPinAttempts || 0);

    targetUser.transactionPinLockedUntil = null;
    targetUser.transactionPinAttempts = 0;
    await targetUser.save();

    await createAdminAudit({
      req,
      action: "ADMIN_USER_TRANSACTION_UNBLOCKED",
      metadata: {
        targetUserId: targetUser._id,
        targetEmail: targetUser.email,
        targetPhone: targetUser.phone,
        previousLockedUntil,
        previousAttempts,
        wasLocked,
      },
    });

    return res.status(200).json({
      success: true,
      message: wasLocked
        ? "User transaction access unblocked successfully."
        : "Transaction PIN attempts reset successfully.",
      user: {
        _id: targetUser._id,
        transactionPinLockedUntil: null,
        transactionPinAttempts: 0,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Update user details (Admin)
router.put("/users/:userId", protect, adminOnly, async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.userId);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const updates = {};

    const firstName = normalizeOptionalString(req.body.firstName);
    const lastName = normalizeOptionalString(req.body.lastName);
    const email = normalizeOptionalString(req.body.email);
    const phone = normalizeOptionalString(req.body.phone);
    const address = normalizeOptionalString(req.body.address);
    const role = normalizeOptionalString(req.body.role);
    const isActive = typeof req.body.isActive === "boolean" ? req.body.isActive : undefined;

    if (firstName !== undefined) {
      if (!firstName) return res.status(400).json({ success: false, message: "First name cannot be empty" });
      updates.firstName = firstName;
    }

    if (lastName !== undefined) {
      if (!lastName) return res.status(400).json({ success: false, message: "Last name cannot be empty" });
      updates.lastName = lastName;
    }

    if (address !== undefined) {
      if (!address) return res.status(400).json({ success: false, message: "Address cannot be empty" });
      updates.address = address;
    }

    const isProtectedAdmin = isAdminIdentity({ email: targetUser.email, phone: targetUser.phone });
    if (isProtectedAdmin && (email !== undefined || phone !== undefined || role !== undefined || isActive !== undefined)) {
      return res.status(400).json({
        success: false,
        message: "Protected admin identity fields (email/phone/role/status) cannot be modified.",
      });
    }

    if (email !== undefined) {
      const normalizedEmail = email.toLowerCase();
      if (!normalizedEmail) return res.status(400).json({ success: false, message: "Email cannot be empty" });
      const emailOwner = await User.findOne({ email: normalizedEmail, _id: { $ne: targetUser._id } }).select("_id");
      if (emailOwner) {
        return res.status(400).json({ success: false, message: "Email already used by another user." });
      }
      updates.email = normalizedEmail;
    }

    if (phone !== undefined) {
      if (!phone) return res.status(400).json({ success: false, message: "Phone cannot be empty" });
      const phoneOwner = await User.findOne({ phone, _id: { $ne: targetUser._id } }).select("_id");
      if (phoneOwner) {
        return res.status(400).json({ success: false, message: "Phone already used by another user." });
      }
      updates.phone = phone;
    }

    if (role !== undefined) {
      const normalizedRole = role.toUpperCase();
      if (!["USER", "ADMIN"].includes(normalizedRole)) {
        return res.status(400).json({ success: false, message: "Invalid role value" });
      }
      if (String(targetUser._id) === String(req.userId) && normalizedRole !== "ADMIN") {
        return res.status(400).json({ success: false, message: "You cannot remove your own admin role." });
      }
      updates.role = normalizedRole;
    }

    if (isActive !== undefined) {
      if (String(targetUser._id) === String(req.userId) && !isActive) {
        return res.status(400).json({ success: false, message: "You cannot deactivate your own account." });
      }
      updates.isActive = isActive;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: "No valid fields provided for update." });
    }

    const updatedUser = await User.findByIdAndUpdate(req.params.userId, updates, { new: true });

    await createAdminAudit({
      req,
      action: "ADMIN_USER_UPDATED",
      metadata: {
        targetUserId: updatedUser._id,
        targetEmail: updatedUser.email,
        targetPhone: updatedUser.phone,
        updatedFields: Object.keys(updates),
      },
    });

    return res.status(200).json({
      success: true,
      message: "User updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Admin trends (last 30 days)
router.get("/trends", protect, adminOnly, async (req, res) => {
  try {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);

    // Transactions by day & type
    const txAgg = await Transaction.aggregate([
      { $match: { createdAt: { $gte: start } } },
      { $project: { day: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, type: 1, amount: 1 } },
      { $group: {
          _id: { day: "$day", type: "$type" },
          totalAmount: { $sum: "$amount" },
          count: { $sum: 1 }
      }},
      { $group: {
          _id: "$_id.day",
          byType: { $push: { type: "$_id.type", totalAmount: "$totalAmount", count: "$count" } },
      }},
      { $sort: { _id: 1 } }
    ]);

    // New users per day
    const usersAgg = await User.aggregate([
      { $match: { createdAt: { $gte: start } } },
      { $project: { day: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } } } },
      { $group: { _id: "$day", count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    // New accounts per day
    const accountsAgg = await Account.aggregate([
      { $match: { createdAt: { $gte: start } } },
      { $project: { day: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } } } },
      { $group: { _id: "$day", count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    res.status(200).json({
      success: true,
      trends: {
        transactions: txAgg.map(d => ({ day: d._id, byType: d.byType })),
        newUsers: usersAgg.map(d => ({ day: d._id, count: d.count })),
        newAccounts: accountsAgg.map(d => ({ day: d._id, count: d.count })),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
