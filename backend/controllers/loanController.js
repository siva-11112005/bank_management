const mongoose = require("mongoose");
const Loan = require("../models/Loan");
const Account = require("../models/Account");
const Transaction = require("../models/Transaction");
const LedgerEntry = require("../models/LedgerEntry");
const AuditLog = require("../models/AuditLog");
const ApprovalRequest = require("../models/ApprovalRequest");
const { verifyTransactionPin } = require("../utils/transactionPin");
const { isApprovalRequired } = require("../utils/adminApprovalPolicy");
const { createNotification } = require("../utils/notificationService");
const { postLoanDisbursalJournal, postLoanRepaymentJournal } = require("../utils/coreBanking/glService");

const typeInterestRateMap = {
  PERSONAL: 12,
  HOME: 8,
  VEHICLE: 10,
  EDUCATION: 9,
  CAR: 10,
  BUSINESS: 11,
  TRACTOR: 9,
  CONSUMER_DURABLE: 13,
  TWO_WHEELER: 11,
  HORTICULTURE: 9,
  ALLIED_ACTIVITIES: 10,
  WORKING_CAPITAL: 11,
};

const loanStatusTransitions = {
  PENDING: ["APPROVED", "REJECTED"],
  APPROVED: ["CLOSED"],
  REJECTED: ["APPROVED"],
  CLOSED: [],
};

const normalizeLoanStatus = (value = "") => String(value || "").trim().toUpperCase();

const isValidLoanStatusTransition = (previousStatus = "", nextStatus = "") => {
  const previous = normalizeLoanStatus(previousStatus);
  const next = normalizeLoanStatus(nextStatus);
  if (!previous || !next) return false;
  if (previous === next) return true;
  const allowed = loanStatusTransitions[previous] || [];
  return allowed.includes(next);
};

const toLoanLabel = (loanType = "") => String(loanType || "").replace(/_/g, " ");

const transitionLoanStatus = async ({
  loanId,
  nextStatus,
  reviewerId,
  ipAddress = "",
  userAgent = "",
  source = "ADMIN_DIRECT",
  approvalRequestId = null,
} = {}) => {
  const normalizedNextStatus = normalizeLoanStatus(nextStatus);
  const loan = await Loan.findById(loanId);
  if (!loan) {
    throw new Error("Loan not found.");
  }

  const previousStatus = normalizeLoanStatus(loan.status);
  if (!isValidLoanStatusTransition(previousStatus, normalizedNextStatus)) {
    throw new Error(`Invalid loan status transition: ${previousStatus} -> ${normalizedNextStatus}.`);
  }

  if (previousStatus === normalizedNextStatus) {
    return {
      executed: false,
      previousStatus,
      nextStatus: normalizedNextStatus,
      loan,
      disbursedNow: false,
      disbursedAmount: Number(loan.disbursedAmount || 0),
      disbursalTransactionId: loan.disbursalTransactionId || null,
      accountBalance: null,
      message: `Loan already in ${normalizedNextStatus} state.`,
    };
  }

  if (normalizedNextStatus === "APPROVED") {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const sessionLoan = await Loan.findById(loanId).session(session);
      if (!sessionLoan) {
        throw new Error("Loan not found.");
      }

      const currentStatus = normalizeLoanStatus(sessionLoan.status);
      if (!isValidLoanStatusTransition(currentStatus, normalizedNextStatus)) {
        throw new Error(`Invalid loan status transition: ${currentStatus} -> ${normalizedNextStatus}.`);
      }

      const account = await Account.findById(sessionLoan.accountId).session(session);
      if (!account) {
        throw new Error("Linked account not found.");
      }
      if (account.status !== "ACTIVE") {
        throw new Error("Linked account is not active.");
      }

      let disbursedNow = false;
      let disbursedAmount = Number(sessionLoan.disbursedAmount || 0);
      let disbursalTransactionId = sessionLoan.disbursalTransactionId || null;

      if (!sessionLoan.disbursalTransactionId) {
        disbursedAmount = Number(sessionLoan.principal || 0);
        if (!Number.isFinite(disbursedAmount) || disbursedAmount <= 0) {
          throw new Error("Invalid loan principal for disbursal.");
        }

        account.balance = Number(account.balance || 0) + disbursedAmount;
        await account.save({ session });

        const disbursalTx = await Transaction.create(
          [
            {
              accountId: account._id,
              userId: sessionLoan.userId,
              type: "LOAN_DISBURSAL",
              amount: disbursedAmount,
              description: `Loan disbursal (${sessionLoan.loanType})`,
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
              transactionId: disbursalTx._id,
              type: "CREDIT",
              amount: disbursedAmount,
              balanceAfter: account.balance,
              description: `Loan disbursal credit (${sessionLoan.loanType})`,
            },
          ],
          { session }
        );

        await postLoanDisbursalJournal({
          amount: disbursedAmount,
          referenceType: "LOAN_DISBURSAL",
          referenceId: disbursalTx._id,
          metadata: {
            loanId: sessionLoan._id,
            userId: sessionLoan.userId,
            accountId: account._id,
            loanType: sessionLoan.loanType,
            source,
            approvalRequestId,
          },
          session,
        });

        sessionLoan.disbursedAt = new Date();
        sessionLoan.disbursedAmount = disbursedAmount;
        sessionLoan.disbursalTransactionId = disbursalTx._id;
        sessionLoan.disbursedBy = reviewerId || null;
        disbursalTransactionId = disbursalTx._id;
        disbursedNow = true;
      }

      sessionLoan.status = "APPROVED";
      if (!sessionLoan.startDate) {
        sessionLoan.startDate = new Date();
      }
      sessionLoan.endDate = null;
      sessionLoan.approvedBy = reviewerId || null;
      await sessionLoan.save({ session });

      await AuditLog.create(
        [
          {
            userId: reviewerId || null,
            action: "ADMIN_LOAN_STATUS_UPDATED",
            ipAddress,
            userAgent,
            metadata: {
              loanId: sessionLoan._id,
              previousStatus: currentStatus,
              nextStatus: "APPROVED",
              loanType: sessionLoan.loanType,
              principal: sessionLoan.principal,
              disbursedNow,
              disbursedAmount,
              disbursalTransactionId,
              source,
              approvalRequestId,
            },
          },
        ],
        { session }
      );

      await session.commitTransaction();
      session.endSession();

      try {
        await createNotification({
          userId: sessionLoan.userId,
          title: "Loan Approved",
          message: disbursedNow
            ? `Your ${toLoanLabel(sessionLoan.loanType)} is approved and Rs ${Number(disbursedAmount || 0).toLocaleString(
                "en-IN"
              )} has been credited to your account.`
            : `Your ${toLoanLabel(sessionLoan.loanType)} is approved.`,
          category: "LOAN",
          type: "SUCCESS",
          actionLink: "/loans",
          metadata: {
            loanId: sessionLoan._id,
            previousStatus: currentStatus,
            currentStatus: "APPROVED",
            disbursedNow,
            disbursedAmount,
            disbursalTransactionId,
            source,
            approvalRequestId,
          },
        });
      } catch (_) {}

      return {
        executed: true,
        previousStatus: currentStatus,
        nextStatus: "APPROVED",
        loan: sessionLoan,
        disbursedNow,
        disbursedAmount,
        disbursalTransactionId,
        accountBalance: account.balance,
        message: disbursedNow ? "Loan approved and disbursed successfully." : "Loan approved successfully.",
      };
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  }

  loan.status = normalizedNextStatus;
  if (normalizedNextStatus === "CLOSED") {
    loan.endDate = new Date();
  }
  loan.approvedBy = reviewerId || null;
  await loan.save();

  try {
    await AuditLog.create({
      userId: reviewerId || null,
      action: "ADMIN_LOAN_STATUS_UPDATED",
      ipAddress,
      userAgent,
      metadata: {
        loanId: loan._id,
        previousStatus,
        nextStatus: normalizedNextStatus,
        loanType: loan.loanType,
        principal: loan.principal,
        source,
        approvalRequestId,
      },
    });
  } catch (_) {}

  try {
    await createNotification({
      userId: loan.userId,
      title: "Loan Status Updated",
      message: `Your ${toLoanLabel(loan.loanType)} request moved from ${previousStatus} to ${normalizedNextStatus}.`,
      category: "LOAN",
      type: normalizedNextStatus === "REJECTED" ? "ERROR" : "INFO",
      actionLink: "/loans",
      metadata: {
        loanId: loan._id,
        previousStatus,
        currentStatus: normalizedNextStatus,
        source,
        approvalRequestId,
      },
    });
  } catch (_) {}

  return {
    executed: true,
    previousStatus,
    nextStatus: normalizedNextStatus,
    loan,
    disbursedNow: false,
    disbursedAmount: Number(loan.disbursedAmount || 0),
    disbursalTransactionId: loan.disbursalTransactionId || null,
    accountBalance: null,
    message: `Loan status updated to ${normalizedNextStatus}.`,
  };
};

exports.transitionLoanStatus = transitionLoanStatus;

exports.applyLoan = async (req, res) => {
  try {
    const { loanType, amount, tenure } = req.body;

    const account = await Account.findOne({ userId: req.userId });
    if (!account) {
      return res.status(404).json({ success: false, message: "Bank account not found. Create account first." });
    }

    if (account.status !== "ACTIVE") {
      return res.status(400).json({ success: false, message: "Your account is not active." });
    }

    const loan = await Loan.create({
      userId: req.userId,
      accountId: account._id,
      loanType,
      principal: amount,
      interestRate: typeInterestRateMap[loanType] || 10,
      tenure,
      status: "PENDING",
    });

    try {
      await createNotification({
        userId: req.userId,
        title: "Loan Application Submitted",
        message: `${loan.loanType.replace(/_/g, " ")} application for Rs ${Number(loan.principal || 0).toLocaleString("en-IN")} submitted successfully.`,
        category: "LOAN",
        type: "INFO",
        actionLink: "/loans",
        metadata: { loanId: loan._id, status: loan.status },
      });
    } catch (_) {}

    res.status(201).json({
      success: true,
      message: "Loan application submitted successfully.",
      loan,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getMyLoans = async (req, res) => {
  try {
    const loans = await Loan.find({ userId: req.userId }).populate("accountId", "accountNumber").sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      totalLoans: loans.length,
      loans,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.payLoanEmi = async (req, res) => {
  const { loanId } = req.params;
  const { amount, transactionPin } = req.body;

  const pinCheck = await verifyTransactionPin({ userId: req.userId, pin: transactionPin });
  if (!pinCheck.success) {
    return res.status(pinCheck.status).json({ success: false, message: pinCheck.message });
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

    const loan = await Loan.findOne({ _id: loanId, userId: req.userId }).session(session);
    if (!loan) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: "Loan not found." });
    }

    if (loan.status !== "APPROVED") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: "Only approved loans can be repaid." });
    }

    if (loan.remainingAmount <= 0) {
      loan.status = "CLOSED";
      loan.endDate = new Date();
      await loan.save({ session });
      await session.commitTransaction();
      session.endSession();
      return res.status(200).json({ success: true, message: "Loan already fully paid.", loan });
    }

    const paymentAmount = Number(amount) || Number(loan.emi.toFixed(2));
    if (!paymentAmount || paymentAmount <= 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: "Invalid payment amount." });
    }

    if (account.balance < paymentAmount) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: "Insufficient account balance." });
    }

    account.balance -= paymentAmount;
    await account.save({ session });

    loan.amountPaid += paymentAmount;
    loan.remainingAmount = Math.max(0, loan.remainingAmount - paymentAmount);

    if (loan.remainingAmount <= 0) {
      loan.status = "CLOSED";
      loan.endDate = new Date();
    }

    await loan.save({ session });

    const transaction = await Transaction.create(
      [
        {
          accountId: account._id,
          userId: req.userId,
          type: "LOAN_PAYMENT",
          amount: paymentAmount,
          description: `Loan EMI payment (${loan.loanType})`,
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
          transactionId: transaction[0]._id,
          type: "DEBIT",
          amount: paymentAmount,
          balanceAfter: account.balance,
          description: `Loan EMI payment for ${loan.loanType}`,
        },
      ],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    try {
      await createNotification({
        userId: req.userId,
        title: loan.status === "CLOSED" ? "Loan Closed Successfully" : "EMI Payment Successful",
        message:
          loan.status === "CLOSED"
            ? `Your ${loan.loanType.replace(/_/g, " ")} is fully repaid and now closed.`
            : `EMI payment of Rs ${Number(paymentAmount || 0).toLocaleString("en-IN")} processed. Remaining loan amount: Rs ${Number(
                loan.remainingAmount || 0
              ).toLocaleString("en-IN")}.`,
        category: "LOAN",
        type: "SUCCESS",
        actionLink: "/loans",
        metadata: { loanId: loan._id, paymentAmount, status: loan.status },
      });
    } catch (_) {}
    try {
      await postLoanRepaymentJournal({
        amount: Number(paymentAmount || 0),
        referenceType: "LOAN_PAYMENT",
        referenceId: transaction[0]?._id || null,
        metadata: {
          userId: req.userId,
          accountId: account._id,
          loanId: loan._id,
          loanType: loan.loanType,
        },
      });
    } catch (_) {}

    res.status(200).json({
      success: true,
      message: "Loan payment successful.",
      paymentAmount,
      loan,
      newBalance: account.balance,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAllLoans = async (req, res) => {
  try {
    const loans = await Loan.find()
      .populate("userId", "firstName lastName email phone")
      .populate("accountId", "accountNumber")
      .populate("approvedBy", "firstName lastName email")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      totalLoans: loans.length,
      loans,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateLoanStatus = async (req, res) => {
  try {
    const { loanId } = req.params;
    const status = normalizeLoanStatus(req.body?.status);

    const loan = await Loan.findById(loanId);
    if (!loan) {
      return res.status(404).json({ success: false, message: "Loan not found." });
    }

    const previousStatus = normalizeLoanStatus(loan.status);
    if (!isValidLoanStatusTransition(previousStatus, status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid loan status transition: ${previousStatus} -> ${status}.`,
      });
    }

    if (previousStatus === status) {
      return res.status(200).json({
        success: true,
        message: `Loan already in ${status} state.`,
        loan,
      });
    }

    if (isApprovalRequired("LOAN_STATUS_UPDATE")) {
      const existingRequest = await ApprovalRequest.findOne({
        actionType: "LOAN_STATUS_UPDATE",
        targetType: "LOAN",
        targetId: loan._id,
        status: "PENDING",
      });

      if (existingRequest) {
        return res.status(202).json({
          success: true,
          pendingApproval: true,
          message: "An approval request is already pending for this loan status update.",
          approvalRequest: existingRequest,
        });
      }

      const approvalRequest = await ApprovalRequest.create({
        actionType: "LOAN_STATUS_UPDATE",
        targetType: "LOAN",
        targetId: loan._id,
        payload: {
          previousStatus,
          nextStatus: status,
          loanType: loan.loanType,
          principal: loan.principal,
        },
        requestNote: `Loan status update requested: ${previousStatus} -> ${status}`,
        requestedBy: req.userId,
      });

      try {
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
          },
        });
      } catch (_) {}

      return res.status(202).json({
        success: true,
        pendingApproval: true,
        message: "Loan status update submitted for approval.",
        approvalRequest,
      });
    }
    const transitionResult = await transitionLoanStatus({
      loanId: loan._id,
      nextStatus: status,
      reviewerId: req.userId,
      ipAddress: req.ip || "",
      userAgent: req.headers["user-agent"] || "",
      source: "ADMIN_DIRECT",
      approvalRequestId: null,
    });

    res.status(200).json({
      success: true,
      message: transitionResult.message || `Loan status updated to ${status}.`,
      loan: transitionResult.loan,
      disbursedNow: Boolean(transitionResult.disbursedNow),
      disbursedAmount: Number(transitionResult.disbursedAmount || 0),
      disbursalTransactionId: transitionResult.disbursalTransactionId || null,
      accountBalance: transitionResult.accountBalance,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
