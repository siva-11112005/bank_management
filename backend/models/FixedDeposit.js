const mongoose = require("mongoose");

const fixedDepositSchema = new mongoose.Schema(
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
    principal: {
      type: Number,
      required: true,
      min: 1000,
    },
    annualRate: {
      type: Number,
      required: true,
      min: 0,
    },
    tenureMonths: {
      type: Number,
      required: true,
      min: 1,
    },
    compoundingPerYear: {
      type: Number,
      default: 4,
      min: 1,
      max: 365,
    },
    startDate: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    maturityDate: {
      type: Date,
      required: true,
      index: true,
    },
    maturityAmountProjected: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "MATURED", "CLOSED", "PREMATURE_CLOSED", "RENEWED"],
      default: "ACTIVE",
      index: true,
    },
    autoRenewEnabled: {
      type: Boolean,
      default: false,
      index: true,
    },
    renewalTenureMonths: {
      type: Number,
      default: 0,
      min: 0,
    },
    renewalCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    renewedFromFdId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FixedDeposit",
      default: null,
      index: true,
    },
    renewedToFdId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FixedDeposit",
      default: null,
      index: true,
    },
    lastRenewedAt: {
      type: Date,
      default: null,
      index: true,
    },
    penaltyAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    payoutAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    payoutTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      default: null,
    },
    closedAt: {
      type: Date,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

fixedDepositSchema.index({ userId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("FixedDeposit", fixedDepositSchema);
