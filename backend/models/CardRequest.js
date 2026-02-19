const mongoose = require("mongoose");

const cardRequestSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      index: true,
    },
    cardId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Card",
      default: null,
      index: true,
    },
    requestType: {
      type: String,
      enum: ["APPLY", "BLOCK", "UNBLOCK", "REISSUE", "PIN_RESET", "LIMIT_UPDATE"],
      required: true,
      index: true,
    },
    cardType: {
      type: String,
      enum: ["DEBIT", "CREDIT", "FOREX", "PREPAID", "BUSINESS"],
      default: null,
    },
    network: {
      type: String,
      enum: ["VISA", "MASTERCARD", "RUPAY"],
      default: null,
    },
    variantName: {
      type: String,
      trim: true,
      maxlength: 80,
      default: "",
    },
    reason: {
      type: String,
      trim: true,
      maxlength: 320,
      default: "",
    },
    status: {
      type: String,
      enum: ["PENDING", "COMPLETED", "REJECTED"],
      default: "PENDING",
      index: true,
    },
    adminNote: {
      type: String,
      trim: true,
      maxlength: 320,
      default: "",
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

cardRequestSchema.index({ userId: 1, status: 1, createdAt: -1 });
cardRequestSchema.index({ status: 1, requestType: 1, updatedAt: -1 });

module.exports = mongoose.model("CardRequest", cardRequestSchema);
