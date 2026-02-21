const mongoose = require("mongoose");

const recurringDepositSchema = new mongoose.Schema(
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
    monthlyInstallment: {
      type: Number,
      required: true,
      min: 100,
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
    totalDeposited: {
      type: Number,
      default: 0,
      min: 0,
    },
    installmentsPaid: {
      type: Number,
      default: 0,
      min: 0,
    },
    startDate: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    nextDueDate: {
      type: Date,
      required: true,
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
      enum: ["ACTIVE", "MATURED", "CLOSED", "DEFAULTED"],
      default: "ACTIVE",
      index: true,
    },
    autoDebit: {
      type: Boolean,
      default: false,
    },
    autoDebitConsecutiveFailures: {
      type: Number,
      default: 0,
      min: 0,
    },
    autoDebitLastAttemptAt: {
      type: Date,
      default: null,
      index: true,
    },
    autoDebitLastFailureAt: {
      type: Date,
      default: null,
      index: true,
    },
    autoDebitLastFailureReason: {
      type: String,
      default: "",
      trim: true,
      maxlength: 240,
    },
    autoDebitNextRetryAt: {
      type: Date,
      default: null,
      index: true,
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
    lastInstallmentAt: {
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

recurringDepositSchema.index({ userId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("RecurringDeposit", recurringDepositSchema);
