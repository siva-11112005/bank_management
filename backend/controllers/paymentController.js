const crypto = require("crypto");
const mongoose = require("mongoose");
const Payment = require("../models/Payment");
const Account = require("../models/Account");
const Transaction = require("../models/Transaction");
const LedgerEntry = require("../models/LedgerEntry");
const AuditLog = require("../models/AuditLog");
const ApprovalRequest = require("../models/ApprovalRequest");
const { isApprovalRequired } = require("../utils/adminApprovalPolicy");
const { createNotification } = require("../utils/notificationService");
const { postCustomerDepositJournal, postCustomerWithdrawalJournal } = require("../utils/coreBanking/glService");

const getGatewayMode = () => {
  const mode = String(process.env.PAYMENT_GATEWAY_MODE || "MOCK").trim().toUpperCase();
  return mode === "RAZORPAY" ? "RAZORPAY" : "MOCK";
};

const generateReceipt = (userId) => `rcpt_${String(userId).slice(-6)}_${Date.now()}`;

const createMockOrderId = () => `mock_order_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

const createProviderOrder = async ({ amount, currency, receipt, userId }) => {
  const mode = getGatewayMode();
  if (mode !== "RAZORPAY") {
    return {
      gateway: "MOCK",
      providerOrderId: createMockOrderId(),
      providerResponse: { mock: true, receipt },
    };
  }

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    return {
      gateway: "MOCK",
      providerOrderId: createMockOrderId(),
      providerResponse: { fallback: "RAZORPAY_CONFIG_MISSING", receipt },
    };
  }

  const authToken = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${authToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: Math.round(Number(amount) * 100),
      currency,
      receipt,
      notes: { userId: String(userId) },
    }),
  });

  if (!response.ok) {
    const errorPayload = await response.text();
    throw new Error(`Razorpay order create failed: ${errorPayload || response.statusText}`);
  }

  const data = await response.json();
  return {
    gateway: "RAZORPAY",
    providerOrderId: data.id,
    providerResponse: data,
  };
};

const verifyRazorpaySignature = ({ providerOrderId, providerPaymentId, signature }) => {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret || !providerPaymentId || !signature) return false;
  const payload = `${providerOrderId}|${providerPaymentId}`;
  const generated = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return generated === signature;
};

const verifyRazorpayWebhookSignature = ({ rawBody, signature }) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET;
  if (!secret || !rawBody || !signature) return false;
  const generated = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return generated === signature;
};

const createAudit = async ({ userId, action, req, metadata }) => {
  try {
    await AuditLog.create({
      userId,
      action,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"] || "",
      metadata: metadata || {},
    });
  } catch (_) {}
};

const resolveBusinessErrorStatus = (message = "") => {
  const text = String(message).toLowerCase();
  if (text.includes("not found")) return 404;
  if (
    text.includes("already") ||
    text.includes("cannot") ||
    text.includes("invalid") ||
    text.includes("insufficient") ||
    text.includes("only successful") ||
    text.includes("not active") ||
    text.includes("cancelled")
  ) {
    return 400;
  }
  return 500;
};

const creditPaymentToAccount = async ({ payment, providerPaymentId, signature, session }) => {
  if (!payment) {
    throw new Error("Payment not found.");
  }

  if (payment.status === "SUCCESS") {
    if (providerPaymentId && !payment.providerPaymentId) {
      payment.providerPaymentId = providerPaymentId;
    }
    if (signature && !payment.signature) {
      payment.signature = signature;
    }
    if (payment.isModified()) {
      await payment.save({ session });
    }
    const existingAccount = await Account.findById(payment.accountId).session(session);
    return { alreadySettled: true, account: existingAccount };
  }

  if (payment.status === "REFUNDED") {
    throw new Error("Payment is already refunded.");
  }

  if (payment.status === "CANCELLED") {
    throw new Error("Cancelled payment cannot be settled.");
  }

  const account = await Account.findById(payment.accountId).session(session);
  if (!account) {
    throw new Error("Linked account not found.");
  }

  if (account.status !== "ACTIVE") {
    throw new Error("Account is not active.");
  }

  account.balance += payment.amount;
  await account.save({ session });

  const creditTx = await Transaction.create(
    [
      {
        accountId: account._id,
        userId: payment.userId,
        type: "PAYMENT_CREDIT",
        amount: payment.amount,
        description: payment.description || "Payment top-up credit",
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
        transactionId: creditTx[0]._id,
        type: "CREDIT",
        amount: payment.amount,
        balanceAfter: account.balance,
        description: payment.description || "Payment top-up credit",
      },
    ],
    { session }
  );

  await postCustomerDepositJournal({
    amount: Number(payment.amount || 0),
    referenceType: "PAYMENT_CREDIT",
    referenceId: creditTx[0]._id,
    metadata: {
      userId: payment.userId,
      accountId: account._id,
      paymentId: payment._id,
      gateway: payment.gateway,
    },
    session,
  });

  payment.status = "SUCCESS";
  payment.providerPaymentId = providerPaymentId || payment.providerPaymentId;
  payment.signature = signature || payment.signature;
  payment.failureReason = "";
  await payment.save({ session });

  return { alreadySettled: false, account };
};

const reversePaymentCredit = async ({ payment, reason, session, updatedByAdmin = null }) => {
  if (!payment) {
    throw new Error("Payment not found.");
  }

  if (payment.status === "REFUNDED") {
    const existingAccount = await Account.findById(payment.accountId).session(session);
    return { alreadyRefunded: true, account: existingAccount };
  }

  if (payment.status !== "SUCCESS") {
    throw new Error("Only successful payments can be refunded.");
  }

  const account = await Account.findById(payment.accountId).session(session);
  if (!account) {
    throw new Error("Linked account not found.");
  }

  if (account.balance < payment.amount) {
    throw new Error("Insufficient account balance for refund reversal. Manual review required.");
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
        description: reason || "Payment refund reversal",
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
        description: reason || "Payment refund reversal",
      },
    ],
    { session }
  );

  await postCustomerWithdrawalJournal({
    amount: Number(payment.amount || 0),
    referenceType: "PAYMENT_REFUND",
    referenceId: refundTx[0]._id,
    metadata: {
      userId: payment.userId,
      accountId: account._id,
      paymentId: payment._id,
      gateway: payment.gateway,
    },
    session,
  });

  payment.status = "REFUNDED";
  payment.refundedAt = new Date();
  payment.refundReason = reason || "Refund by admin";
  if (updatedByAdmin) {
    payment.updatedByAdmin = updatedByAdmin;
  }
  await payment.save({ session });

  return { alreadyRefunded: false, account };
};

const findPaymentForWebhook = async ({ providerOrderId, providerPaymentId }) => {
  if (providerOrderId) {
    const byOrder = await Payment.findOne({ providerOrderId });
    if (byOrder) return byOrder;
  }

  if (providerPaymentId) {
    const byPayment = await Payment.findOne({ providerPaymentId });
    if (byPayment) return byPayment;
  }

  return null;
};

exports.createOrder = async (req, res) => {
  try {
    const { amount, currency, method, description } = req.body;
    const account = await Account.findOne({ userId: req.userId });

    if (!account) {
      return res.status(404).json({ success: false, message: "Account not found. Create an account first." });
    }

    if (account.status !== "ACTIVE") {
      return res.status(400).json({ success: false, message: "Account is not active." });
    }

    const receipt = generateReceipt(req.userId);
    const provider = await createProviderOrder({ amount, currency, receipt, userId: req.userId });

    const payment = await Payment.create({
      userId: req.userId,
      accountId: account._id,
      gateway: provider.gateway,
      providerOrderId: provider.providerOrderId,
      amount,
      currency,
      method,
      description,
      status: "CREATED",
      receipt,
      metadata: provider.providerResponse,
    });

    await createAudit({
      userId: req.userId,
      action: "PAYMENT_ORDER_CREATED",
      req,
      metadata: { paymentId: payment._id, gateway: payment.gateway, amount: payment.amount },
    });

    try {
      await createNotification({
        userId: req.userId,
        title: "Payment Order Created",
        message: `Order created for Rs ${Number(payment.amount || 0).toLocaleString("en-IN")} via ${payment.gateway}. Complete verification to add funds.`,
        category: "PAYMENT",
        type: "INFO",
        actionLink: "/payments",
        metadata: { paymentId: payment._id, status: payment.status },
      });
    } catch (_) {}

    res.status(201).json({
      success: true,
      message: "Payment order created.",
      payment: {
        id: payment._id,
        amount: payment.amount,
        currency: payment.currency,
        gateway: payment.gateway,
        providerOrderId: payment.providerOrderId,
        receipt: payment.receipt,
        status: payment.status,
      },
      config: {
        gatewayMode: payment.gateway,
        razorpayKeyId: payment.gateway === "RAZORPAY" ? process.env.RAZORPAY_KEY_ID || "" : "",
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.verifyPayment = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { paymentId, providerOrderId, providerPaymentId, signature, status } = req.body;
    const payment = await Payment.findOne({ _id: paymentId, userId: req.userId }).session(session);

    if (!payment) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: "Payment not found." });
    }

    if (payment.providerOrderId !== providerOrderId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: "Payment order mismatch." });
    }

    if (status === "FAILED") {
      payment.status = "FAILED";
      payment.failureReason = "Gateway reported failure";
      payment.providerPaymentId = providerPaymentId || payment.providerPaymentId;
      payment.signature = signature || payment.signature;
      await payment.save({ session });
      await session.commitTransaction();
      session.endSession();
      await createAudit({
        userId: req.userId,
        action: "PAYMENT_FAILED",
        req,
        metadata: { paymentId: payment._id, providerOrderId: payment.providerOrderId },
      });
      try {
        await createNotification({
          userId: req.userId,
          title: "Payment Failed",
          message: "Your payment was marked as failed by gateway verification.",
          category: "PAYMENT",
          type: "ERROR",
          actionLink: "/payments",
          metadata: { paymentId: payment._id, status: payment.status },
        });
      } catch (_) {}
      return res.status(200).json({ success: true, message: "Payment marked as failed.", payment });
    }

    if (payment.gateway === "RAZORPAY") {
      const isValid = verifyRazorpaySignature({ providerOrderId, providerPaymentId, signature });
      if (!isValid) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ success: false, message: "Invalid payment signature." });
      }
    }

    const settlement = await creditPaymentToAccount({
      payment,
      providerPaymentId,
      signature,
      session,
    });

    await session.commitTransaction();
    session.endSession();

    await createAudit({
      userId: req.userId,
      action: settlement.alreadySettled ? "PAYMENT_VERIFY_IDEMPOTENT" : "PAYMENT_VERIFIED",
      req,
      metadata: {
        paymentId: payment._id,
        amount: payment.amount,
        newBalance: settlement.account?.balance,
      },
    });

    if (!settlement.alreadySettled) {
      try {
        await createNotification({
          userId: req.userId,
          title: "Payment Credited",
          message: `Rs ${Number(payment.amount || 0).toLocaleString("en-IN")} credited successfully to your account.`,
          category: "PAYMENT",
          type: "SUCCESS",
          actionLink: "/payments",
          metadata: { paymentId: payment._id, status: payment.status },
        });
      } catch (_) {}
    }

    res.status(200).json({
      success: true,
      message: settlement.alreadySettled ? "Payment already verified." : "Payment verified and wallet credited.",
      payment,
      newBalance: settlement.account?.balance || 0,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    const statusCode = resolveBusinessErrorStatus(error.message);
    res.status(statusCode).json({ success: false, message: statusCode === 500 ? "Internal Server Error" : error.message });
  }
};

exports.markFailed = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { reason } = req.body;
    const payment = await Payment.findOne({ _id: paymentId, userId: req.userId });
    if (!payment) {
      return res.status(404).json({ success: false, message: "Payment not found." });
    }

    if (payment.status === "SUCCESS" || payment.status === "REFUNDED") {
      return res.status(400).json({ success: false, message: "Completed payments cannot be marked failed." });
    }

    payment.status = "FAILED";
    payment.failureReason = reason || "Marked failed by user";
    await payment.save();

    await createAudit({
      userId: req.userId,
      action: "PAYMENT_MARKED_FAILED",
      req,
      metadata: { paymentId: payment._id, reason: payment.failureReason },
    });

    try {
      await createNotification({
        userId: req.userId,
        title: "Payment Marked Failed",
        message: payment.failureReason || "Payment was marked as failed.",
        category: "PAYMENT",
        type: "WARNING",
        actionLink: "/payments",
        metadata: { paymentId: payment._id, status: payment.status },
      });
    } catch (_) {}

    res.status(200).json({ success: true, message: "Payment updated.", payment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getMyPayments = async (req, res) => {
  try {
    const payments = await Payment.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(150);
    res.status(200).json({
      success: true,
      totalPayments: payments.length,
      payments,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAllPayments = async (req, res) => {
  try {
    const { status, gateway, limit = 100 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (gateway) filter.gateway = gateway;

    const payments = await Payment.find(filter)
      .populate("userId", "firstName lastName email phone")
      .populate("accountId", "accountNumber status")
      .sort({ createdAt: -1 })
      .limit(Number(limit));

    res.status(200).json({
      success: true,
      totalPayments: payments.length,
      payments,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getPaymentReviewQueue = async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const payments = await Payment.find({ "metadata.webhookRefundPendingReview": true })
      .populate("userId", "firstName lastName email phone")
      .populate("accountId", "accountNumber status")
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(Number(limit));

    res.status(200).json({
      success: true,
      totalPayments: payments.length,
      payments,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.resolvePaymentReview = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { resolutionNote } = req.body;
    const payment = await Payment.findById(paymentId);

    if (!payment) {
      return res.status(404).json({ success: false, message: "Payment not found." });
    }

    const currentMetadata = payment.metadata || {};
    if (!currentMetadata.webhookRefundPendingReview) {
      return res.status(400).json({ success: false, message: "Payment is not in review queue." });
    }

    const history = Array.isArray(currentMetadata.webhookReviewHistory) ? currentMetadata.webhookReviewHistory : [];
    history.push({
      resolvedAt: new Date(),
      resolvedBy: String(req.userId),
      resolutionNote: resolutionNote || "Reviewed and resolved by admin",
      previousReason: currentMetadata.webhookRefundReason || "",
    });

    payment.metadata = {
      ...currentMetadata,
      webhookRefundPendingReview: false,
      webhookReviewResolvedAt: new Date(),
      webhookReviewResolvedBy: String(req.userId),
      webhookReviewResolutionNote: resolutionNote || "Reviewed and resolved by admin",
      webhookReviewHistory: history.slice(-25),
    };
    await payment.save();

    await createAudit({
      userId: req.userId,
      action: "PAYMENT_REVIEW_RESOLVED",
      req,
      metadata: {
        paymentId: payment._id,
        providerOrderId: payment.providerOrderId,
        resolutionNote: resolutionNote || "Reviewed and resolved by admin",
      },
    });

    res.status(200).json({
      success: true,
      message: "Payment review resolved successfully.",
      payment,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.refundPayment = async (req, res) => {
  let session = null;
  try {
    const { paymentId } = req.params;
    const { reason } = req.body;

    if (isApprovalRequired("PAYMENT_REFUND")) {
      const payment = await Payment.findById(paymentId);
      if (!payment) {
        return res.status(404).json({ success: false, message: "Payment not found." });
      }

      if (payment.status !== "SUCCESS" && payment.status !== "REFUNDED") {
        return res.status(400).json({ success: false, message: "Only successful payments can be refunded." });
      }

      const existingRequest = await ApprovalRequest.findOne({
        actionType: "PAYMENT_REFUND",
        targetType: "PAYMENT",
        targetId: payment._id,
        status: "PENDING",
      });

      if (existingRequest) {
        return res.status(202).json({
          success: true,
          pendingApproval: true,
          message: "An approval request is already pending for this payment refund.",
          approvalRequest: existingRequest,
        });
      }

      const approvalRequest = await ApprovalRequest.create({
        actionType: "PAYMENT_REFUND",
        targetType: "PAYMENT",
        targetId: payment._id,
        payload: {
          reason: reason || "Refund by admin",
          amount: payment.amount,
          paymentStatus: payment.status,
          providerOrderId: payment.providerOrderId,
        },
        requestNote: reason || "Refund by admin",
        requestedBy: req.userId,
      });

      await createAudit({
        userId: req.userId,
        action: "ADMIN_APPROVAL_REQUEST_CREATED",
        req,
        metadata: {
          approvalRequestId: approvalRequest._id,
          actionType: approvalRequest.actionType,
          targetType: approvalRequest.targetType,
          targetId: approvalRequest.targetId,
        },
      });

      return res.status(202).json({
        success: true,
        pendingApproval: true,
        message: "Payment refund submitted for approval.",
        approvalRequest,
      });
    }

    session = await mongoose.startSession();
    session.startTransaction();

    const payment = await Payment.findById(paymentId).session(session);
    if (!payment) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: "Payment not found." });
    }

    const refundResult = await reversePaymentCredit({
      payment,
      reason: reason || "Refund by admin",
      session,
      updatedByAdmin: req.userId,
    });

    await session.commitTransaction();
    session.endSession();

    await createAudit({
      userId: req.userId,
      action: refundResult.alreadyRefunded ? "PAYMENT_REFUND_IDEMPOTENT" : "PAYMENT_REFUNDED",
      req,
      metadata: {
        paymentId: payment._id,
        refundedUserId: payment.userId,
        amount: payment.amount,
        reason: payment.refundReason,
      },
    });

    if (!refundResult.alreadyRefunded) {
      try {
        await createNotification({
          userId: payment.userId,
          title: "Payment Refunded",
          message: `Rs ${Number(payment.amount || 0).toLocaleString("en-IN")} refunded to bank balance. Reason: ${payment.refundReason}.`,
          category: "PAYMENT",
          type: "WARNING",
          actionLink: "/payments",
          metadata: { paymentId: payment._id, status: payment.status },
        });
      } catch (_) {}
    }

    res.status(200).json({
      success: true,
      message: refundResult.alreadyRefunded ? "Payment already refunded." : "Payment refunded successfully.",
      payment,
      accountBalance: refundResult.account?.balance || 0,
    });
  } catch (error) {
    if (session?.inTransaction?.()) {
      await session.abortTransaction();
      session.endSession();
    }
    const statusCode = resolveBusinessErrorStatus(error.message);
    res.status(statusCode).json({ success: false, message: statusCode === 500 ? "Internal Server Error" : error.message });
  }
};

exports.handleGatewayWebhook = async (req, res) => {
  try {
    if (getGatewayMode() !== "RAZORPAY") {
      return res.status(200).json({ success: true, message: "Webhook ignored in mock mode." });
    }

    const signature = req.headers["x-razorpay-signature"];
    const rawBody = req.rawBody || "";
    if (!signature || !rawBody) {
      return res.status(400).json({ success: false, message: "Missing webhook signature or payload." });
    }

    const signatureOk = verifyRazorpayWebhookSignature({ rawBody, signature });
    if (!signatureOk) {
      return res.status(401).json({ success: false, message: "Invalid webhook signature." });
    }

    const payload = req.body || {};
    const event = String(payload.event || "").trim();
    const paymentEntity = payload?.payload?.payment?.entity || {};
    const orderEntity = payload?.payload?.order?.entity || {};
    const refundEntity = payload?.payload?.refund?.entity || {};

    const providerOrderId = paymentEntity.order_id || orderEntity.id || "";
    const providerPaymentId = paymentEntity.id || refundEntity.payment_id || "";
    const mappedPayment = await findPaymentForWebhook({ providerOrderId, providerPaymentId });

    if (!mappedPayment) {
      await createAudit({
        action: "PAYMENT_WEBHOOK_UNMAPPED",
        req,
        metadata: { event, providerOrderId, providerPaymentId },
      });
      return res.status(200).json({ success: true, message: "Webhook acknowledged." });
    }

    if (event === "payment.captured" || event === "order.paid") {
      const session = await mongoose.startSession();
      session.startTransaction();
      try {
        const payment = await Payment.findById(mappedPayment._id).session(session);
        const settlement = await creditPaymentToAccount({
          payment,
          providerPaymentId,
          signature: "",
          session,
        });

        await session.commitTransaction();
        session.endSession();

        await createAudit({
          userId: payment.userId,
          action: settlement.alreadySettled ? "PAYMENT_WEBHOOK_IDEMPOTENT" : "PAYMENT_WEBHOOK_SETTLED",
          req,
          metadata: { event, paymentId: payment._id, providerOrderId, providerPaymentId },
        });

        if (!settlement.alreadySettled) {
          try {
            await createNotification({
              userId: payment.userId,
              title: "Payment Credited",
              message: `Rs ${Number(payment.amount || 0).toLocaleString("en-IN")} credited through gateway webhook settlement.`,
              category: "PAYMENT",
              type: "SUCCESS",
              actionLink: "/payments",
              metadata: { paymentId: payment._id, event },
            });
          } catch (_) {}
        }

        return res.status(200).json({
          success: true,
          message: settlement.alreadySettled ? "Payment already settled." : "Webhook payment settled.",
        });
      } catch (error) {
        await session.abortTransaction();
        session.endSession();
        throw error;
      }
    }

    if (event === "payment.failed") {
      if (mappedPayment.status !== "SUCCESS" && mappedPayment.status !== "REFUNDED") {
        mappedPayment.status = "FAILED";
        mappedPayment.providerPaymentId = providerPaymentId || mappedPayment.providerPaymentId;
        mappedPayment.failureReason =
          paymentEntity.error_description || paymentEntity.error_reason || "Gateway payment failed";
        await mappedPayment.save();
      }

      await createAudit({
        userId: mappedPayment.userId,
        action: "PAYMENT_WEBHOOK_FAILED",
        req,
        metadata: { event, paymentId: mappedPayment._id, providerOrderId, providerPaymentId },
      });

      try {
        await createNotification({
          userId: mappedPayment.userId,
          title: "Payment Failed",
          message: mappedPayment.failureReason || "Gateway reported payment failure.",
          category: "PAYMENT",
          type: "ERROR",
          actionLink: "/payments",
          metadata: { paymentId: mappedPayment._id, event },
        });
      } catch (_) {}

      return res.status(200).json({ success: true, message: "Failure webhook processed." });
    }

    if (event === "refund.processed" || event === "payment.refunded") {
      const session = await mongoose.startSession();
      session.startTransaction();
      try {
        const payment = await Payment.findById(mappedPayment._id).session(session);
        let resultMessage = "Refund webhook acknowledged.";
        let action = "PAYMENT_WEBHOOK_REFUND_IDEMPOTENT";

        if (payment.status === "SUCCESS") {
          try {
            await reversePaymentCredit({
              payment,
              reason: "Gateway refund processed (webhook)",
              session,
            });
            resultMessage = "Webhook refund processed.";
            action = "PAYMENT_WEBHOOK_REFUND_SETTLED";
          } catch (error) {
            payment.metadata = {
              ...(payment.metadata || {}),
              webhookRefundPendingReview: true,
              webhookRefundReason: error.message,
              lastWebhookEvent: event,
            };
            await payment.save({ session });
            resultMessage = "Webhook refund captured; manual review required.";
            action = "PAYMENT_WEBHOOK_REFUND_PENDING_REVIEW";
          }
        } else if (payment.status === "REFUNDED") {
          resultMessage = "Payment already refunded.";
        } else {
          payment.metadata = {
            ...(payment.metadata || {}),
            webhookRefundPendingReview: true,
            webhookRefundReason: "Payment is not in SUCCESS state.",
            lastWebhookEvent: event,
          };
          await payment.save({ session });
          resultMessage = "Webhook refund captured; manual review required.";
          action = "PAYMENT_WEBHOOK_REFUND_PENDING_REVIEW";
        }

        await session.commitTransaction();
        session.endSession();

        await createAudit({
          userId: payment.userId,
          action,
          req,
          metadata: {
            event,
            paymentId: payment._id,
            providerOrderId,
            providerPaymentId,
            refundId: refundEntity.id || "",
          },
        });

        if (action === "PAYMENT_WEBHOOK_REFUND_SETTLED") {
          try {
            await createNotification({
              userId: payment.userId,
              title: "Refund Processed",
              message: `Payment refund processed for Rs ${Number(payment.amount || 0).toLocaleString("en-IN")}.`,
              category: "PAYMENT",
              type: "WARNING",
              actionLink: "/payments",
              metadata: { paymentId: payment._id, event },
            });
          } catch (_) {}
        }

        return res.status(200).json({ success: true, message: resultMessage });
      } catch (error) {
        await session.abortTransaction();
        session.endSession();
        throw error;
      }
    }

    await createAudit({
      userId: mappedPayment.userId,
      action: "PAYMENT_WEBHOOK_IGNORED",
      req,
      metadata: { event, paymentId: mappedPayment._id, providerOrderId, providerPaymentId },
    });

    return res.status(200).json({ success: true, message: "Webhook event ignored." });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
