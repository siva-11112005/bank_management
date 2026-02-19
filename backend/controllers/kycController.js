const KycRequest = require("../models/KycRequest");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const { createNotification } = require("../utils/notificationService");

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

const createUserNotificationSafe = async ({ userId, title, message, type = "INFO", category = "SECURITY", metadata = {} }) => {
  try {
    await createNotification({
      userId,
      title,
      message,
      type,
      category,
      actionLink: "/kyc",
      metadata,
    });
  } catch (_) {}
};

exports.submitKyc = async (req, res) => {
  try {
    const payload = req.body;
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const existingPending = await KycRequest.findOne({ userId: req.userId, status: "PENDING" });
    if (existingPending) {
      return res.status(202).json({
        success: true,
        message: "A KYC request is already pending for review.",
        request: existingPending,
      });
    }

    const request = await KycRequest.create({
      userId: req.userId,
      panNumber: payload.panNumber,
      occupation: payload.occupation,
      incomeRange: payload.incomeRange,
      idProofType: payload.idProofType,
      idProofNumber: payload.idProofNumber,
      addressProofType: payload.addressProofType,
      addressProofNumber: payload.addressProofNumber,
      notes: payload.notes || "",
      status: "PENDING",
    });

    user.kycStatus = "PENDING";
    user.kycReviewNote = "";
    user.kycReviewedAt = null;
    await user.save();

    await createAuditLogSafe({
      userId: req.userId,
      action: "KYC_SUBMITTED",
      req,
      metadata: { requestId: request._id, panNumber: payload.panNumber },
    });

    await createUserNotificationSafe({
      userId: req.userId,
      title: "KYC Submitted",
      message: "Your KYC details have been submitted and sent for admin review.",
      type: "INFO",
      category: "SECURITY",
      metadata: { requestId: request._id },
    });

    return res.status(201).json({
      success: true,
      message: "KYC submitted successfully.",
      request,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getMyKycRequests = async (req, res) => {
  try {
    const requests = await KycRequest.find({ userId: req.userId }).sort({ createdAt: -1 });
    return res.status(200).json({
      success: true,
      requests,
      totalRequests: requests.length,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getMyKycStatus = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("kycStatus kycReviewedAt kycReviewNote");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const latestRequest = await KycRequest.findOne({ userId: req.userId }).sort({ createdAt: -1 });
    return res.status(200).json({
      success: true,
      kycStatus: user.kycStatus || "NOT_SUBMITTED",
      kycReviewedAt: user.kycReviewedAt || null,
      kycReviewNote: user.kycReviewNote || "",
      latestRequest,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAllKycRequestsAdmin = async (req, res) => {
  try {
    const { status = "", limit = 300 } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const requests = await KycRequest.find(filter)
      .populate("userId", "firstName lastName email phone kycStatus")
      .populate("reviewedBy", "firstName lastName email")
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

exports.resolveKycRequestAdmin = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { decision, adminNote = "" } = req.body;

    const request = await KycRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({ success: false, message: "KYC request not found." });
    }
    if (request.status !== "PENDING") {
      return res.status(400).json({ success: false, message: "KYC request already processed." });
    }

    const user = await User.findById(request.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found for KYC request." });
    }

    if (decision === "APPROVE") {
      request.status = "APPROVED";
      user.kycStatus = "APPROVED";
    } else if (decision === "REJECT") {
      request.status = "REJECTED";
      user.kycStatus = "REJECTED";
    } else {
      return res.status(400).json({ success: false, message: "Invalid decision." });
    }

    const note = String(adminNote || "").trim();
    request.adminNote = note || (decision === "APPROVE" ? "KYC approved by admin." : "KYC rejected by admin.");
    request.reviewedBy = req.userId;
    request.reviewedAt = new Date();
    await request.save();

    user.kycReviewedAt = new Date();
    user.kycReviewNote = request.adminNote;
    await user.save();

    await createAuditLogSafe({
      userId: req.userId,
      action: "ADMIN_KYC_REQUEST_RESOLVED",
      req,
      metadata: {
        requestId: request._id,
        decision,
        userId: user._id,
      },
    });

    await createUserNotificationSafe({
      userId: user._id,
      title: decision === "APPROVE" ? "KYC Approved" : "KYC Rejected",
      message:
        decision === "APPROVE"
          ? "Your KYC has been approved successfully."
          : `Your KYC was rejected.${request.adminNote ? ` Note: ${request.adminNote}` : ""}`,
      type: decision === "APPROVE" ? "SUCCESS" : "ERROR",
      category: "SECURITY",
      metadata: { requestId: request._id, decision },
    });

    return res.status(200).json({
      success: true,
      message: `KYC request ${decision === "APPROVE" ? "approved" : "rejected"} successfully.`,
      request,
      userKycStatus: user.kycStatus,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
