const Account = require("../models/Account");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const ApprovalRequest = require("../models/ApprovalRequest");
const { verifyTransactionPin } = require("../utils/transactionPin");
const { isApprovalRequired } = require("../utils/adminApprovalPolicy");

// Generate unique account number
const generateAccountNumber = () => {
  return "ACC" + Date.now() + Math.floor(Math.random() * 1000);
};

// Create new account
exports.createAccount = async (req, res) => {
  try {
    const { accountType, branch, ifscCode } = req.body;

    if (!accountType || !branch || !ifscCode) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    // Check if user already has account
    const existingAccount = await Account.findOne({ userId: req.userId });
    if (existingAccount) {
      return res.status(400).json({ success: false, message: "You already have an account" });
    }

    const account = new Account({
      userId: req.userId,
      accountNumber: generateAccountNumber(),
      accountType,
      branch,
      ifscCode,
      balance: 0,
      status: "ACTIVE",
    });

    await account.save();

    res.status(201).json({
      success: true,
      message: "Account created successfully",
      account,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get user's account
exports.getMyAccount = async (req, res) => {
  try {
    const account = await Account.findOne({ userId: req.userId }).populate("userId", "firstName lastName email");

    if (!account) {
      return res.status(404).json({ success: false, message: "Account not found" });
    }

    res.status(200).json({
      success: true,
      account,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get account by ID (Admin)
exports.getAccountById = async (req, res) => {
  try {
    const account = await Account.findById(req.params.accountId).populate("userId", "firstName lastName email");

    if (!account) {
      return res.status(404).json({ success: false, message: "Account not found" });
    }

    res.status(200).json({
      success: true,
      account,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get all accounts (Admin only)
exports.getAllAccounts = async (req, res) => {
  try {
    const accounts = await Account.find().populate("userId", "firstName lastName email phone");

    res.status(200).json({
      success: true,
      totalAccounts: accounts.length,
      accounts,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Deposit money
exports.deposit = async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }

    let account = await Account.findOne({ userId: req.userId });
    if (!account) {
      return res.status(404).json({ success: false, message: "Account not found" });
    }

    account.balance += amount;
    await account.save();

    res.status(200).json({
      success: true,
      message: "Deposit successful",
      newBalance: account.balance,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Withdraw money
exports.withdraw = async (req, res) => {
  try {
    const { amount, transactionPin } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }

    const pinCheck = await verifyTransactionPin({ userId: req.userId, pin: transactionPin });
    if (!pinCheck.success) {
      return res.status(pinCheck.status).json({ success: false, message: pinCheck.message });
    }

    let account = await Account.findOne({ userId: req.userId });
    if (!account) {
      return res.status(404).json({ success: false, message: "Account not found" });
    }

    if (account.balance < amount) {
      return res.status(400).json({ success: false, message: "Insufficient balance" });
    }

    account.balance -= amount;
    await account.save();

    res.status(200).json({
      success: true,
      message: "Withdrawal successful",
      newBalance: account.balance,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update account status (Admin)
exports.updateAccountStatus = async (req, res) => {
  try {
    const { status } = req.body;

    if (!["ACTIVE", "INACTIVE", "FROZEN"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    const account = await Account.findById(req.params.accountId);
    if (!account) {
      return res.status(404).json({ success: false, message: "Account not found" });
    }

    const previousStatus = account.status;

    if (isApprovalRequired("ACCOUNT_STATUS_UPDATE")) {
      const existingRequest = await ApprovalRequest.findOne({
        actionType: "ACCOUNT_STATUS_UPDATE",
        targetType: "ACCOUNT",
        targetId: account._id,
        status: "PENDING",
      });

      if (existingRequest) {
        return res.status(202).json({
          success: true,
          pendingApproval: true,
          message: "An approval request is already pending for this account status update.",
          approvalRequest: existingRequest,
        });
      }

      const approvalRequest = await ApprovalRequest.create({
        actionType: "ACCOUNT_STATUS_UPDATE",
        targetType: "ACCOUNT",
        targetId: account._id,
        payload: {
          previousStatus,
          nextStatus: status,
          accountNumber: account.accountNumber,
        },
        requestNote: `Status update requested: ${previousStatus} -> ${status}`,
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
        message: "Account status update submitted for approval.",
        approvalRequest,
      });
    }

    account.status = status;
    await account.save();

    try {
      await AuditLog.create({
        userId: req.userId,
        action: "ADMIN_ACCOUNT_STATUS_UPDATED",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || "",
        metadata: {
          accountId: account._id,
          accountNumber: account.accountNumber,
          previousStatus,
          nextStatus: status,
        },
      });
    } catch (_) {}

    res.status(200).json({
      success: true,
      message: "Account status updated",
      account,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
