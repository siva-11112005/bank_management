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
    const { status } = req.body;

    const loan = await Loan.findById(loanId);
    if (!loan) {
      return res.status(404).json({ success: false, message: "Loan not found." });
    }

    const previousStatus = loan.status;

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

    loan.status = status;
    if (status === "APPROVED" && !loan.startDate) {
      loan.startDate = new Date();
    }
    if (status === "CLOSED") {
      loan.endDate = new Date();
    }
    loan.approvedBy = req.userId;

    await loan.save();

    try {
      await createNotification({
        userId: loan.userId,
        title: "Loan Status Updated",
        message: `Your ${loan.loanType.replace(/_/g, " ")} request moved from ${previousStatus} to ${status}.`,
        category: "LOAN",
        type: status === "REJECTED" ? "ERROR" : "INFO",
        actionLink: "/loans",
        metadata: { loanId: loan._id, previousStatus, currentStatus: status },
      });
    } catch (_) {}

    try {
      await AuditLog.create({
        userId: req.userId,
        action: "ADMIN_LOAN_STATUS_UPDATED",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || "",
        metadata: {
          loanId: loan._id,
          previousStatus,
          nextStatus: status,
          loanType: loan.loanType,
          principal: loan.principal,
        },
      });
    } catch (_) {}

    res.status(200).json({
      success: true,
      message: `Loan status updated to ${status}.`,
      loan,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
