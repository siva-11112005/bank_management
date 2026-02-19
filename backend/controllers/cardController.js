const Card = require("../models/Card");
const CardRequest = require("../models/CardRequest");
const Account = require("../models/Account");
const AuditLog = require("../models/AuditLog");
const { createNotification } = require("../utils/notificationService");

const cardActionRequestTypes = ["BLOCK", "UNBLOCK", "REISSUE", "PIN_RESET", "LIMIT_UPDATE"];

const toMaskedCardNumber = (network = "VISA") => {
  const networkPrefixMap = {
    VISA: "4",
    MASTERCARD: "5",
    RUPAY: "6",
  };
  const prefix = networkPrefixMap[String(network || "").toUpperCase()] || "4";
  const randomDigits = Array.from({ length: 15 }, () => Math.floor(Math.random() * 10)).join("");
  const full = `${prefix}${randomDigits}`;
  const last4 = full.slice(-4);
  return {
    last4,
    cardNumberMasked: `XXXX XXXX XXXX ${last4}`,
  };
};

const generateCardExpiry = () => {
  const now = new Date();
  return {
    expiryMonth: now.getMonth() + 1,
    expiryYear: now.getFullYear() + 5,
  };
};

const createAuditLogSafe = async ({ userId, action, req, metadata = {} }) => {
  try {
    await AuditLog.create({
      userId,
      action,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"] || "",
      metadata,
    });
  } catch (_) {}
};

const createUserNotificationSafe = async ({ userId, title, message, type = "INFO", category = "ACCOUNT", metadata = {} }) => {
  try {
    await createNotification({
      userId,
      title,
      message,
      type,
      category,
      actionLink: "/cards",
      metadata,
    });
  } catch (_) {}
};

exports.getMyCards = async (req, res) => {
  try {
    const cards = await Card.find({ userId: req.userId }).sort({ createdAt: -1 });
    return res.status(200).json({
      success: true,
      cards,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getMyCardRequests = async (req, res) => {
  try {
    const requests = await CardRequest.find({ userId: req.userId }).populate("cardId").sort({ createdAt: -1 }).limit(200);
    return res.status(200).json({
      success: true,
      requests,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.applyCard = async (req, res) => {
  try {
    const { cardType, network, variantName = "", reason = "" } = req.body;

    const account = await Account.findOne({ userId: req.userId });
    if (!account) {
      return res.status(404).json({ success: false, message: "Bank account not found." });
    }
    if (account.status !== "ACTIVE") {
      return res.status(400).json({ success: false, message: "Only active accounts can apply for cards." });
    }

    const existingPending = await CardRequest.findOne({
      userId: req.userId,
      requestType: "APPLY",
      status: "PENDING",
      cardType,
    });
    if (existingPending) {
      return res.status(202).json({
        success: true,
        message: "An apply request for this card type is already pending.",
        request: existingPending,
      });
    }

    const request = await CardRequest.create({
      userId: req.userId,
      accountId: account._id,
      requestType: "APPLY",
      cardType,
      network,
      variantName: String(variantName || "").trim(),
      reason: String(reason || "").trim(),
      status: "PENDING",
      payload: {},
    });

    await createAuditLogSafe({
      userId: req.userId,
      action: "CARD_APPLY_REQUEST_CREATED",
      req,
      metadata: {
        requestId: request._id,
        cardType,
        network,
      },
    });

    await createUserNotificationSafe({
      userId: req.userId,
      title: "Card Application Submitted",
      message: `${cardType} card request submitted successfully and sent for processing.`,
      type: "INFO",
      category: "ACCOUNT",
      metadata: { requestId: request._id, requestType: "APPLY" },
    });

    return res.status(201).json({
      success: true,
      message: "Card application request submitted successfully.",
      request,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.requestCardAction = async (req, res) => {
  try {
    const { cardId } = req.params;
    const { requestType, reason = "", dailyLimit, contactlessLimit } = req.body;

    if (!cardActionRequestTypes.includes(requestType)) {
      return res.status(400).json({ success: false, message: "Unsupported card action request." });
    }

    const card = await Card.findOne({ _id: cardId, userId: req.userId });
    if (!card) {
      return res.status(404).json({ success: false, message: "Card not found." });
    }

    if (requestType === "BLOCK" && card.status !== "ACTIVE") {
      return res.status(400).json({ success: false, message: "Only active cards can be blocked." });
    }
    if (requestType === "UNBLOCK" && card.status !== "BLOCKED") {
      return res.status(400).json({ success: false, message: "Only blocked cards can be unblocked." });
    }
    if (["REISSUE", "PIN_RESET", "LIMIT_UPDATE"].includes(requestType) && card.status === "CLOSED") {
      return res.status(400).json({ success: false, message: "Card is closed. Action not allowed." });
    }

    const existingPending = await CardRequest.findOne({
      userId: req.userId,
      cardId: card._id,
      requestType,
      status: "PENDING",
    });
    if (existingPending) {
      return res.status(202).json({
        success: true,
        message: "Same card action request is already pending.",
        request: existingPending,
      });
    }

    const requestPayload = {};
    if (requestType === "LIMIT_UPDATE") {
      requestPayload.dailyLimit = Number.isFinite(Number(dailyLimit)) ? Number(dailyLimit) : card.dailyLimit;
      requestPayload.contactlessLimit = Number.isFinite(Number(contactlessLimit))
        ? Number(contactlessLimit)
        : card.contactlessLimit;
    }

    const request = await CardRequest.create({
      userId: req.userId,
      accountId: card.accountId,
      cardId: card._id,
      requestType,
      cardType: card.cardType,
      network: card.network,
      variantName: card.variantName || "",
      reason: String(reason || "").trim(),
      status: "PENDING",
      payload: requestPayload,
    });

    await createAuditLogSafe({
      userId: req.userId,
      action: "CARD_ACTION_REQUEST_CREATED",
      req,
      metadata: {
        requestId: request._id,
        cardId: card._id,
        requestType,
      },
    });

    await createUserNotificationSafe({
      userId: req.userId,
      title: "Card Service Request Submitted",
      message: `${requestType.replace("_", " ")} request submitted for card ending ${card.last4}.`,
      type: "INFO",
      category: "ACCOUNT",
      metadata: { requestId: request._id, requestType },
    });

    return res.status(201).json({
      success: true,
      message: "Card action request submitted successfully.",
      request,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAllCardRequestsAdmin = async (req, res) => {
  try {
    const { status = "", requestType = "", limit = 200 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (requestType) filter.requestType = requestType;

    const requests = await CardRequest.find(filter)
      .populate("userId", "firstName lastName email phone")
      .populate("cardId")
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(Number(limit));

    return res.status(200).json({
      success: true,
      requests,
      totalRequests: requests.length,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.resolveCardRequestAdmin = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { decision, adminNote = "" } = req.body;

    const request = await CardRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({ success: false, message: "Card request not found." });
    }
    if (request.status !== "PENDING") {
      return res.status(400).json({ success: false, message: "Card request already processed." });
    }

    const safeNote = String(adminNote || "").trim();
    let targetCard = request.cardId ? await Card.findById(request.cardId) : null;
    const account = await Account.findById(request.accountId);
    if (!account) {
      return res.status(404).json({ success: false, message: "Linked account not found for card request." });
    }

    if (decision === "REJECT") {
      request.status = "REJECTED";
      request.adminNote = safeNote || "Request rejected by admin.";
      request.resolvedBy = req.userId;
      request.resolvedAt = new Date();
      await request.save();

      await createUserNotificationSafe({
        userId: request.userId,
        title: "Card Request Rejected",
        message: `${request.requestType} request has been rejected.${request.adminNote ? ` Note: ${request.adminNote}` : ""}`,
        type: "ERROR",
        category: "ACCOUNT",
        metadata: { requestId: request._id, requestType: request.requestType },
      });

      await createAuditLogSafe({
        userId: req.userId,
        action: "ADMIN_CARD_REQUEST_REJECTED",
        req,
        metadata: {
          requestId: request._id,
          requestType: request.requestType,
        },
      });

      return res.status(200).json({
        success: true,
        message: "Card request rejected successfully.",
        request,
      });
    }

    if (decision !== "APPROVE") {
      return res.status(400).json({ success: false, message: "Invalid decision." });
    }

    if (request.requestType === "APPLY") {
      const { last4, cardNumberMasked } = toMaskedCardNumber(request.network || "VISA");
      const expiry = generateCardExpiry();
      targetCard = await Card.create({
        userId: request.userId,
        accountId: request.accountId,
        cardType: request.cardType || "DEBIT",
        network: request.network || "VISA",
        variantName: request.variantName || "",
        cardNumberMasked,
        last4,
        expiryMonth: expiry.expiryMonth,
        expiryYear: expiry.expiryYear,
        status: "ACTIVE",
        pinSet: false,
        metadata: {
          issuedFromRequestId: request._id,
        },
      });
      request.cardId = targetCard._id;
    } else {
      if (!targetCard) {
        return res.status(404).json({ success: false, message: "Target card not found for this request." });
      }
      if (request.requestType === "BLOCK") {
        targetCard.status = "BLOCKED";
      }
      if (request.requestType === "UNBLOCK") {
        targetCard.status = "ACTIVE";
      }
      if (request.requestType === "REISSUE") {
        targetCard.status = "CLOSED";
        await targetCard.save();

        const { last4, cardNumberMasked } = toMaskedCardNumber(targetCard.network || "VISA");
        const expiry = generateCardExpiry();
        const reissuedCard = await Card.create({
          userId: targetCard.userId,
          accountId: targetCard.accountId,
          cardType: targetCard.cardType,
          network: targetCard.network,
          variantName: targetCard.variantName || "",
          cardNumberMasked,
          last4,
          expiryMonth: expiry.expiryMonth,
          expiryYear: expiry.expiryYear,
          status: "ACTIVE",
          pinSet: false,
          dailyLimit: targetCard.dailyLimit,
          contactlessLimit: targetCard.contactlessLimit,
          metadata: {
            reissuedFromCardId: targetCard._id,
            issuedFromRequestId: request._id,
          },
        });
        request.cardId = reissuedCard._id;
        targetCard = reissuedCard;
      } else if (request.requestType === "PIN_RESET") {
        targetCard.pinSet = false;
      } else if (request.requestType === "LIMIT_UPDATE") {
        const payload = request.payload || {};
        if (Number.isFinite(Number(payload.dailyLimit))) {
          targetCard.dailyLimit = Number(payload.dailyLimit);
        }
        if (Number.isFinite(Number(payload.contactlessLimit))) {
          targetCard.contactlessLimit = Number(payload.contactlessLimit);
        }
      }
    }

    if (targetCard) {
      await targetCard.save();
    }

    request.status = "COMPLETED";
    request.adminNote = safeNote || "Request completed successfully.";
    request.resolvedBy = req.userId;
    request.resolvedAt = new Date();
    await request.save();

    await createUserNotificationSafe({
      userId: request.userId,
      title: "Card Request Completed",
      message: `${request.requestType.replace("_", " ")} request completed successfully.`,
      type: "SUCCESS",
      category: "ACCOUNT",
      metadata: { requestId: request._id, requestType: request.requestType, cardId: request.cardId },
    });

    await createAuditLogSafe({
      userId: req.userId,
      action: "ADMIN_CARD_REQUEST_COMPLETED",
      req,
      metadata: {
        requestId: request._id,
        requestType: request.requestType,
        cardId: request.cardId,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Card request approved and completed successfully.",
      request,
      card: targetCard,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
