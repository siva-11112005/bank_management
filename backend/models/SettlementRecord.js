const mongoose = require("mongoose");

const settlementRecordSchema = new mongoose.Schema(
  {
    direction: {
      type: String,
      enum: ["INBOUND", "OUTBOUND"],
      required: true,
      index: true,
    },
    rail: {
      type: String,
      enum: ["UPI", "IMPS", "NEFT", "RTGS", "NACH", "BBPS", "RAZORPAY", "OTHER"],
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    currency: {
      type: String,
      default: "INR",
    },
    settlementDate: {
      type: Date,
      required: true,
      index: true,
    },
    tPlusDays: {
      type: Number,
      default: 1,
      min: 0,
      max: 30,
    },
    externalReference: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    partnerReference: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    status: {
      type: String,
      enum: ["QUEUED", "SENT", "SETTLED", "FAILED", "REVERSED", "MANUAL_REVIEW"],
      default: "QUEUED",
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      default: null,
    },
    relatedPaymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      default: null,
    },
    relatedTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      default: null,
    },
    failureReason: {
      type: String,
      trim: true,
      default: "",
      maxlength: 400,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
      maxlength: 800,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

settlementRecordSchema.index({ status: 1, settlementDate: 1 });
settlementRecordSchema.index({ rail: 1, createdAt: -1 });

module.exports = mongoose.model("SettlementRecord", settlementRecordSchema);
