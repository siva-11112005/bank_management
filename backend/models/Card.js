const mongoose = require("mongoose");

const cardSchema = new mongoose.Schema(
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
    cardType: {
      type: String,
      enum: ["DEBIT", "CREDIT", "FOREX", "PREPAID", "BUSINESS"],
      required: true,
      index: true,
    },
    network: {
      type: String,
      enum: ["VISA", "MASTERCARD", "RUPAY"],
      default: "VISA",
    },
    variantName: {
      type: String,
      trim: true,
      maxlength: 80,
      default: "",
    },
    cardNumberMasked: {
      type: String,
      required: true,
      trim: true,
    },
    last4: {
      type: String,
      required: true,
      trim: true,
      minlength: 4,
      maxlength: 4,
    },
    expiryMonth: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
    },
    expiryYear: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "BLOCKED", "CLOSED", "EXPIRED"],
      default: "ACTIVE",
      index: true,
    },
    pinSet: {
      type: Boolean,
      default: false,
    },
    dailyLimit: {
      type: Number,
      default: 50000,
      min: 0,
    },
    contactlessLimit: {
      type: Number,
      default: 5000,
      min: 0,
    },
    issuedAt: {
      type: Date,
      default: Date.now,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

cardSchema.index({ userId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("Card", cardSchema);
