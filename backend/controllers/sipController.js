const mongoose = require("mongoose");
const Account = require("../models/Account");
const Transaction = require("../models/Transaction");
const LedgerEntry = require("../models/LedgerEntry");
const SipPlan = require("../models/SipPlan");
const ApprovalRequest = require("../models/ApprovalRequest");
const { isApprovalRequired } = require("../utils/adminApprovalPolicy");
const { createNotification } = require("../utils/notificationService");

const SIP_STATUS = {
  REQUESTED: "REQUESTED",
  ACTIVE: "ACTIVE",
  PAUSED: "PAUSED",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
  COMPLETED: "COMPLETED",
};

const SIP_APPROVAL_ACTION = "SIP_PLAN_CREATION";
const SIP_APPROVAL_TARGET = "SIP_PLAN";

const normalizeDateStart = (value) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
};

const addMonthsSafe = (sourceDate, monthsToAdd = 1) => {
  const date = new Date(sourceDate);
  const sourceDay = date.getDate();
  date.setMonth(date.getMonth() + monthsToAdd);
  if (date.getDate() < sourceDay) {
    date.setDate(0);
  }
  return date;
};

const calculateProjectedMaturity = ({ monthlyContribution, tenureMonths, expectedAnnualReturn }) => {
  const monthly = Number(monthlyContribution || 0);
  const months = Number(tenureMonths || 0);
  const annual = Number(expectedAnnualReturn || 0);

  if (!Number.isFinite(monthly) || monthly <= 0 || !Number.isFinite(months) || months <= 0) {
    return 0;
  }

  const monthlyRate = Number.isFinite(annual) ? Math.max(0, annual) / 12 / 100 : 0;
  if (monthlyRate === 0) {
    return Number((monthly * months).toFixed(2));
  }

  const fv = monthly * (((1 + monthlyRate) ** months - 1) / monthlyRate) * (1 + monthlyRate);
  return Number.isFinite(fv) ? Number(fv.toFixed(2)) : 0;
};

const normalizeStatus = (value = "") => String(value || "").trim().toUpperCase();

const syncSipApprovalRequestOnAdminDecision = async ({ sipPlan, reviewerId, decision, reviewNote = "" }) => {
  try {
    const pendingRequest = await ApprovalRequest.findOne({
      actionType: SIP_APPROVAL_ACTION,
      targetType: SIP_APPROVAL_TARGET,
      targetId: sipPlan._id,
      status: "PENDING",
    });

    if (!pendingRequest) {
      return;
    }

    const normalizedDecision = normalizeStatus(decision);
    pendingRequest.reviewedBy = reviewerId;
    pendingRequest.reviewedAt = new Date();
    pendingRequest.reviewNote = reviewNote || (normalizedDecision === "APPROVE" ? "Approved by admin" : "Rejected by admin");

    if (normalizedDecision === "APPROVE") {
      pendingRequest.status = "EXECUTED";
      pendingRequest.executedAt = new Date();
      pendingRequest.failureReason = "";
    } else if (normalizedDecision === "REJECT") {
      pendingRequest.status = "REJECTED";
      pendingRequest.executedAt = null;
      pendingRequest.failureReason = "";
    }

    await pendingRequest.save();
  } catch (_) {}
};

const processSipInstallment = async ({ sipPlan, runAt = new Date(), source = "MANUAL" }) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const plan = await SipPlan.findById(sipPlan._id).session(session);
    if (!plan) {
      throw new Error("SIP plan not found.");
    }

    if (plan.status !== SIP_STATUS.ACTIVE) {
      await session.abortTransaction();
      session.endSession();
      return {
        success: false,
        skipped: true,
        message: "SIP plan is not active.",
      };
    }

    const dueDate = normalizeDateStart(plan.nextDebitDate);
    const executionDate = normalizeDateStart(runAt) || new Date();
    if (dueDate && dueDate > executionDate) {
      await session.abortTransaction();
      session.endSession();
      return {
        success: false,
        skipped: true,
        message: "SIP installment is not due yet.",
      };
    }

    const account = await Account.findById(plan.accountId).session(session);
    if (!account) {
      throw new Error("Linked account not found.");
    }
    if (account.status !== "ACTIVE") {
      throw new Error("Linked account is not active.");
    }

    const installmentAmount = Number(plan.monthlyContribution || 0);
    if (!Number.isFinite(installmentAmount) || installmentAmount <= 0) {
      throw new Error("Invalid SIP monthly contribution.");
    }

    if (account.balance < installmentAmount) {
      plan.lastFailureReason = "Insufficient account balance for SIP installment.";
      await plan.save({ session });
      await session.commitTransaction();
      session.endSession();
      return {
        success: false,
        failed: true,
        message: "Insufficient balance for SIP installment.",
      };
    }

    account.balance -= installmentAmount;
    await account.save({ session });

    const [transaction] = await Transaction.create(
      [
        {
          accountId: account._id,
          userId: plan.userId,
          type: "SIP_INSTALLMENT",
          amount: installmentAmount,
          description: `SIP installment - ${plan.planName}`,
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
          transactionId: transaction._id,
          type: "DEBIT",
          amount: installmentAmount,
          balanceAfter: account.balance,
          description: `SIP installment (${plan.planName})`,
        },
      ],
      { session }
    );

    const nextExecutedInstallments = Number(plan.executedInstallments || 0) + 1;
    const totalMonths = Number(plan.tenureMonths || 0);
    const isCompleted = totalMonths > 0 && nextExecutedInstallments >= totalMonths;

    plan.executedInstallments = nextExecutedInstallments;
    plan.totalInvested = Number((Number(plan.totalInvested || 0) + installmentAmount).toFixed(2));
    plan.lastDebitAt = new Date();
    plan.lastFailureReason = "";
    if (isCompleted) {
      plan.status = SIP_STATUS.COMPLETED;
      plan.completedAt = new Date();
      plan.nextDebitDate = null;
    } else {
      plan.nextDebitDate = addMonthsSafe(dueDate || executionDate, 1);
    }
    await plan.save({ session });

    await session.commitTransaction();
    session.endSession();

    return {
      success: true,
      processed: true,
      completed: isCompleted,
      message: isCompleted
        ? "SIP installment processed. SIP plan completed."
        : "SIP installment processed successfully.",
      transactionId: transaction._id,
      newBalance: account.balance,
      sipPlan: plan,
      source,
    };
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

exports.requestSipPlan = async (req, res) => {
  try {
    const monthlyContribution = Number(req.body?.monthlyContribution || 0);
    const tenureMonths = Number(req.body?.tenureMonths || 0);
    const expectedAnnualReturn = Number(req.body?.expectedAnnualReturn || 0);
    const goalAmount = Number(req.body?.goalAmount || 0);
    const autoDebit = req.body?.autoDebit !== undefined ? Boolean(req.body.autoDebit) : true;
    const planName = String(req.body?.planName || "").trim() || "SIP Plan";
    const fundName = String(req.body?.fundName || "").trim() || "Balanced Growth Fund";

    if (!Number.isFinite(monthlyContribution) || monthlyContribution < 100) {
      return res.status(400).json({
        success: false,
        message: "Monthly SIP contribution must be at least Rs 100.",
      });
    }
    if (!Number.isFinite(tenureMonths) || tenureMonths < 1 || tenureMonths > 600) {
      return res.status(400).json({
        success: false,
        message: "SIP tenure must be between 1 and 600 months.",
      });
    }
    if (!Number.isFinite(expectedAnnualReturn) || expectedAnnualReturn < 0 || expectedAnnualReturn > 100) {
      return res.status(400).json({
        success: false,
        message: "Expected annual return must be between 0 and 100.",
      });
    }
    if (!Number.isFinite(goalAmount) || goalAmount < 0) {
      return res.status(400).json({
        success: false,
        message: "Goal amount must be zero or positive.",
      });
    }

    const account = await Account.findOne({ userId: req.userId });
    if (!account) {
      return res.status(404).json({ success: false, message: "Bank account not found for this user." });
    }
    if (account.status !== "ACTIVE") {
      return res.status(400).json({ success: false, message: "Only active accounts can request SIP plans." });
    }

    const startDate = normalizeDateStart(req.body?.startDate) || normalizeDateStart(new Date());
    if (!startDate) {
      return res.status(400).json({ success: false, message: "Invalid SIP start date." });
    }

    const projectedMaturity = calculateProjectedMaturity({
      monthlyContribution,
      tenureMonths,
      expectedAnnualReturn,
    });
    const approvalRequired = isApprovalRequired(SIP_APPROVAL_ACTION);

    const sipPlan = await SipPlan.create({
      userId: req.userId,
      accountId: account._id,
      planName,
      fundName,
      monthlyContribution,
      expectedAnnualReturn,
      tenureMonths,
      goalAmount,
      autoDebit,
      startDate,
      nextDebitDate: startDate,
      projectedMaturity,
      status: SIP_STATUS.REQUESTED,
      requestedAt: new Date(),
    });

    let approvalRequest = null;
    if (approvalRequired) {
      approvalRequest = await ApprovalRequest.create({
        actionType: SIP_APPROVAL_ACTION,
        targetType: SIP_APPROVAL_TARGET,
        targetId: sipPlan._id,
        payload: {
          sipPlanId: sipPlan._id,
          userId: req.userId,
          accountId: account._id,
          planName,
          fundName,
          monthlyContribution,
          tenureMonths,
          expectedAnnualReturn,
          goalAmount,
          autoDebit,
          startDate,
        },
        requestNote: `SIP request ${planName} (${monthlyContribution}/month for ${tenureMonths} months)`,
        requestedBy: req.userId,
      });

      sipPlan.metadata = {
        ...(sipPlan.metadata || {}),
        approvalRequestId: approvalRequest._id,
      };
      await sipPlan.save();
    }

    try {
      await createNotification({
        userId: req.userId,
        title: "SIP Request Submitted",
        message: `Your SIP plan "${planName}" is submitted and pending admin approval.`,
        category: "ACCOUNT",
        type: "INFO",
        actionLink: "/core-banking?module=sip",
        metadata: {
          sipPlanId: sipPlan._id,
          monthlyContribution,
          tenureMonths,
        },
      });
    } catch (_) {}

    return res.status(201).json({
      success: true,
      pendingApproval: approvalRequired,
      approvalRequest: approvalRequest || undefined,
      message: approvalRequired
        ? "SIP request submitted for maker-checker approval."
        : "SIP request submitted successfully. Wait for admin approval.",
      sipPlan,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getMySipPlans = async (req, res) => {
  try {
    const status = normalizeStatus(req.query?.status);
    const filter = { userId: req.userId };
    if (status) {
      filter.status = status;
    }

    const sipPlans = await SipPlan.find(filter)
      .populate("accountId", "accountNumber")
      .populate("approvedBy", "firstName lastName email")
      .populate("rejectedBy", "firstName lastName email")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      total: sipPlans.length,
      sipPlans,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateMySipPlanStatus = async (req, res) => {
  try {
    const { sipId } = req.params;
    const nextStatus = normalizeStatus(req.body?.status);

    if (!["ACTIVE", "PAUSED", "CANCELLED"].includes(nextStatus)) {
      return res.status(400).json({ success: false, message: "Invalid SIP status update request." });
    }

    const sipPlan = await SipPlan.findOne({ _id: sipId, userId: req.userId });
    if (!sipPlan) {
      return res.status(404).json({ success: false, message: "SIP plan not found." });
    }

    const currentStatus = normalizeStatus(sipPlan.status);
    const allowedTransitions = {
      REQUESTED: ["CANCELLED"],
      ACTIVE: ["PAUSED", "CANCELLED"],
      PAUSED: ["ACTIVE", "CANCELLED"],
      REJECTED: [],
      CANCELLED: [],
      COMPLETED: [],
    };

    if (!allowedTransitions[currentStatus]?.includes(nextStatus)) {
      return res.status(400).json({
        success: false,
        message: `Cannot change SIP status from ${currentStatus} to ${nextStatus}.`,
      });
    }

    sipPlan.status = nextStatus;
    if (nextStatus === SIP_STATUS.PAUSED) {
      sipPlan.pausedAt = new Date();
    }
    if (nextStatus === SIP_STATUS.CANCELLED) {
      sipPlan.cancelledAt = new Date();
      sipPlan.nextDebitDate = null;
    }
    if (nextStatus === SIP_STATUS.ACTIVE) {
      const today = normalizeDateStart(new Date());
      const existingNext = normalizeDateStart(sipPlan.nextDebitDate) || today;
      sipPlan.nextDebitDate = existingNext > today ? existingNext : today;
      sipPlan.pausedAt = null;
    }
    await sipPlan.save();

    try {
      await createNotification({
        userId: req.userId,
        title: "SIP Status Updated",
        message: `SIP plan "${sipPlan.planName}" status changed to ${nextStatus}.`,
        category: "ACCOUNT",
        type: "INFO",
        actionLink: "/core-banking?module=sip",
        metadata: { sipPlanId: sipPlan._id, status: nextStatus },
      });
    } catch (_) {}

    return res.status(200).json({
      success: true,
      message: `SIP status updated to ${nextStatus}.`,
      sipPlan,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.executeApprovedSipPlanCreation = async ({ approvalRequest, reviewerId }) => {
  if (!approvalRequest) {
    throw new Error("Approval request context is required for SIP execution.");
  }

  const sipPlan = await SipPlan.findById(approvalRequest.targetId);
  if (!sipPlan) {
    throw new Error("SIP plan not found.");
  }

  if (sipPlan.status === SIP_STATUS.ACTIVE) {
    return {
      executed: false,
      result: { sipPlanId: sipPlan._id, status: sipPlan.status },
      message: "SIP plan is already active.",
    };
  }

  if (sipPlan.status !== SIP_STATUS.REQUESTED) {
    throw new Error(`Only requested SIP plans can be approved. Current status: ${sipPlan.status}.`);
  }

  const today = normalizeDateStart(new Date());
  const nextDebitDate = normalizeDateStart(sipPlan.startDate) || today;
  sipPlan.status = SIP_STATUS.ACTIVE;
  sipPlan.approvedAt = new Date();
  sipPlan.approvedBy = reviewerId;
  sipPlan.rejectedAt = null;
  sipPlan.rejectedBy = null;
  sipPlan.rejectionNote = "";
  sipPlan.nextDebitDate = nextDebitDate > today ? nextDebitDate : today;
  sipPlan.lastFailureReason = "";
  await sipPlan.save();

  try {
    await createNotification({
      userId: sipPlan.userId,
      title: "SIP Request Approved",
      message: `Your SIP plan "${sipPlan.planName}" is approved and ready.`,
      category: "ACCOUNT",
      type: "SUCCESS",
      actionLink: "/core-banking?module=sip",
      metadata: {
        sipPlanId: sipPlan._id,
        decision: "APPROVE",
      },
    });
  } catch (_) {}

  return {
    executed: true,
    result: {
      sipPlanId: sipPlan._id,
      status: sipPlan.status,
      approvedAt: sipPlan.approvedAt,
      approvedBy: sipPlan.approvedBy,
      nextDebitDate: sipPlan.nextDebitDate,
    },
    message: "SIP request approved successfully.",
  };
};

exports.executeRejectedSipPlanCreation = async ({ approvalRequest, reviewerId, reviewNote = "" }) => {
  if (!approvalRequest) {
    throw new Error("Approval request context is required for SIP rejection.");
  }

  const sipPlan = await SipPlan.findById(approvalRequest.targetId);
  if (!sipPlan) {
    throw new Error("SIP plan not found.");
  }

  if (sipPlan.status === SIP_STATUS.REJECTED) {
    return {
      executed: false,
      result: { sipPlanId: sipPlan._id, status: sipPlan.status },
      message: "SIP plan is already rejected.",
    };
  }

  if (sipPlan.status === SIP_STATUS.ACTIVE) {
    throw new Error("Active SIP plan cannot be rejected from approval queue.");
  }

  sipPlan.status = SIP_STATUS.REJECTED;
  sipPlan.rejectedAt = new Date();
  sipPlan.rejectedBy = reviewerId;
  sipPlan.rejectionNote = reviewNote || "Rejected by admin.";
  sipPlan.nextDebitDate = null;
  await sipPlan.save();

  try {
    await createNotification({
      userId: sipPlan.userId,
      title: "SIP Request Rejected",
      message: `Your SIP plan "${sipPlan.planName}" was rejected. ${sipPlan.rejectionNote}`,
      category: "ACCOUNT",
      type: "WARNING",
      actionLink: "/core-banking?module=sip",
      metadata: {
        sipPlanId: sipPlan._id,
        decision: "REJECT",
        note: sipPlan.rejectionNote,
      },
    });
  } catch (_) {}

  return {
    executed: true,
    result: {
      sipPlanId: sipPlan._id,
      status: sipPlan.status,
      rejectedAt: sipPlan.rejectedAt,
      rejectedBy: sipPlan.rejectedBy,
      rejectionNote: sipPlan.rejectionNote,
    },
    message: "SIP request rejected successfully.",
  };
};

exports.paySipInstallment = async (req, res) => {
  try {
    const { sipId } = req.params;
    const sipPlan = await SipPlan.findOne({ _id: sipId, userId: req.userId });
    if (!sipPlan) {
      return res.status(404).json({ success: false, message: "SIP plan not found." });
    }

    const result = await processSipInstallment({ sipPlan, runAt: new Date(), source: "USER_MANUAL" });
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message,
      });
    }

    try {
      await createNotification({
        userId: req.userId,
        title: "SIP Installment Processed",
        message: `${sipPlan.planName}: installment of Rs ${Number(sipPlan.monthlyContribution).toFixed(
          2
        )} processed successfully.`,
        category: "TRANSACTION",
        type: "SUCCESS",
        actionLink: "/transactions",
        metadata: {
          sipPlanId: sipPlan._id,
          transactionId: result.transactionId,
          balance: result.newBalance,
        },
      });
    } catch (_) {}

    return res.status(200).json({
      success: true,
      message: result.message,
      sipPlan: result.sipPlan,
      transactionId: result.transactionId,
      newBalance: result.newBalance,
      completed: result.completed,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAdminSipRequests = async (req, res) => {
  try {
    const status = normalizeStatus(req.query?.status);
    const limit = Math.min(Math.max(Number(req.query?.limit) || 200, 1), 500);
    const filter = {};
    if (status) {
      filter.status = status;
    }

    const sipPlans = await SipPlan.find(filter)
      .populate("userId", "firstName lastName email phone")
      .populate("accountId", "accountNumber status")
      .populate("approvedBy", "firstName lastName email")
      .populate("rejectedBy", "firstName lastName email")
      .sort({ createdAt: -1 })
      .limit(limit);

    return res.status(200).json({
      success: true,
      approvalRequired: isApprovalRequired(SIP_APPROVAL_ACTION),
      total: sipPlans.length,
      sipPlans,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.decideSipRequest = async (req, res) => {
  try {
    const { sipId } = req.params;
    const decision = normalizeStatus(req.body?.decision);
    const note = String(req.body?.note || "").trim().slice(0, 280);

    if (!["APPROVE", "REJECT"].includes(decision)) {
      return res.status(400).json({ success: false, message: "Decision must be APPROVE or REJECT." });
    }

    const sipPlan = await SipPlan.findById(sipId);
    if (!sipPlan) {
      return res.status(404).json({ success: false, message: "SIP plan not found." });
    }

    if (isApprovalRequired(SIP_APPROVAL_ACTION)) {
      const existingApproval = await ApprovalRequest.findOne({
        actionType: SIP_APPROVAL_ACTION,
        targetType: SIP_APPROVAL_TARGET,
        targetId: sipPlan._id,
        status: "PENDING",
      });
      return res.status(409).json({
        success: false,
        approvalRequired: true,
        message: "SIP decision is controlled by maker-checker approval queue. Use Admin Approval Requests.",
        approvalRequestId: existingApproval?._id || null,
      });
    }
    if (sipPlan.status !== SIP_STATUS.REQUESTED) {
      return res.status(400).json({ success: false, message: "Only requested SIP plans can be decided." });
    }

    if (decision === "APPROVE") {
      const today = normalizeDateStart(new Date());
      const nextDebitDate = normalizeDateStart(sipPlan.startDate) || today;
      sipPlan.status = SIP_STATUS.ACTIVE;
      sipPlan.approvedAt = new Date();
      sipPlan.approvedBy = req.userId;
      sipPlan.rejectedAt = null;
      sipPlan.rejectedBy = null;
      sipPlan.rejectionNote = "";
      sipPlan.nextDebitDate = nextDebitDate > today ? nextDebitDate : today;
      sipPlan.lastFailureReason = "";
    } else {
      sipPlan.status = SIP_STATUS.REJECTED;
      sipPlan.rejectedAt = new Date();
      sipPlan.rejectedBy = req.userId;
      sipPlan.rejectionNote = note || "Rejected by admin.";
      sipPlan.nextDebitDate = null;
    }

    await sipPlan.save();
    await syncSipApprovalRequestOnAdminDecision({
      sipPlan,
      reviewerId: req.userId,
      decision,
      reviewNote: note,
    });

    try {
      await createNotification({
        userId: sipPlan.userId,
        title: decision === "APPROVE" ? "SIP Request Approved" : "SIP Request Rejected",
        message:
          decision === "APPROVE"
            ? `Your SIP plan "${sipPlan.planName}" is approved and ready.`
            : `Your SIP plan "${sipPlan.planName}" was rejected. ${sipPlan.rejectionNote}`,
        category: "ACCOUNT",
        type: decision === "APPROVE" ? "SUCCESS" : "WARNING",
        actionLink: "/core-banking?module=sip",
        metadata: {
          sipPlanId: sipPlan._id,
          decision,
          note: sipPlan.rejectionNote || note,
        },
      });
    } catch (_) {}

    return res.status(200).json({
      success: true,
      message: decision === "APPROVE" ? "SIP request approved successfully." : "SIP request rejected.",
      sipPlan,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.runSipAutoDebitJob = async (req, res) => {
  try {
    const forDate = normalizeDateStart(req.body?.forDate) || normalizeDateStart(new Date());
    const limit = Math.min(Math.max(Number(req.body?.limit) || 300, 1), 1000);

    const duePlans = await SipPlan.find({
      status: SIP_STATUS.ACTIVE,
      autoDebit: true,
      nextDebitDate: { $ne: null, $lte: forDate },
    })
      .sort({ nextDebitDate: 1 })
      .limit(limit);

    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    let completed = 0;
    const failedPlanIds = [];

    for (const plan of duePlans) {
      processed += 1;
      try {
        const result = await processSipInstallment({ sipPlan: plan, runAt: forDate, source: "ADMIN_AUTO_DEBIT" });
        if (result.success) {
          succeeded += 1;
          if (result.completed) completed += 1;
          continue;
        }
        failed += 1;
        failedPlanIds.push(String(plan._id));
      } catch (_) {
        failed += 1;
        failedPlanIds.push(String(plan._id));
      }
    }

    return res.status(200).json({
      success: true,
      message: "SIP auto-debit job completed.",
      result: {
        processed,
        succeeded,
        failed,
        completed,
        failedPlanIds,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
