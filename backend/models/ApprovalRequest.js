const mongoose = require("mongoose");

const ApprovalRequestSchema = new mongoose.Schema(
  {
    actionType: {
      type: String,
      enum: [
        "PAYMENT_REFUND",
        "LOAN_STATUS_UPDATE",
        "ACCOUNT_STATUS_UPDATE",
        "TRANSFER_EXECUTION",
        "SIP_PLAN_CREATION",
        "FD_BOOKING_CREATE",
        "RD_CREATION",
        "GL_MANUAL_JOURNAL",
        "MONEY_OUT_POLICY_UPDATE",
        "REGULATORY_POLICY_UPDATE",
        "TREASURY_SNAPSHOT_CREATE",
        "REGULATORY_REPORT_PUBLISH",
        "REGULATORY_ALERT_RESOLVE",
      ],
      required: true,
      index: true,
    },
    targetType: {
      type: String,
      enum: [
        "PAYMENT",
        "LOAN",
        "ACCOUNT",
        "TRANSFER",
        "SIP_PLAN",
        "GL_JOURNAL",
        "SYSTEM_POLICY",
        "TREASURY_SNAPSHOT",
        "REGULATORY_REPORT",
        "REGULATORY_ALERT",
      ],
      required: true,
      index: true,
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    payload: {
      type: Object,
      default: {},
    },
    status: {
      type: String,
      enum: ["PENDING", "EXECUTED", "REJECTED", "FAILED"],
      default: "PENDING",
      index: true,
    },
    requestNote: {
      type: String,
      default: "",
    },
    reviewNote: {
      type: String,
      default: "",
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    executedAt: {
      type: Date,
      default: null,
    },
    failureReason: {
      type: String,
      default: "",
    },
    escalatedAt: {
      type: Date,
      default: null,
      index: true,
    },
    escalatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    escalationNote: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

ApprovalRequestSchema.index({ status: 1, createdAt: -1 });
ApprovalRequestSchema.index({ actionType: 1, status: 1, createdAt: -1 });
ApprovalRequestSchema.index({ status: 1, escalatedAt: 1, createdAt: -1 });

module.exports = mongoose.model("ApprovalRequest", ApprovalRequestSchema);
