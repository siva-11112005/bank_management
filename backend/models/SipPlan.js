const mongoose = require("mongoose");

const SipPlanSchema = new mongoose.Schema(
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
    planName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    fundName: {
      type: String,
      default: "Balanced Growth Fund",
      trim: true,
      maxlength: 120,
    },
    monthlyContribution: {
      type: Number,
      required: true,
      min: 100,
    },
    expectedAnnualReturn: {
      type: Number,
      default: 12,
      min: 0,
      max: 100,
    },
    tenureMonths: {
      type: Number,
      required: true,
      min: 1,
      max: 600,
    },
    goalAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    autoDebit: {
      type: Boolean,
      default: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    nextDebitDate: {
      type: Date,
      required: true,
      index: true,
    },
    executedInstallments: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalInvested: {
      type: Number,
      default: 0,
      min: 0,
    },
    projectedMaturity: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ["REQUESTED", "ACTIVE", "PAUSED", "REJECTED", "CANCELLED", "COMPLETED"],
      default: "REQUESTED",
      index: true,
    },
    requestedAt: {
      type: Date,
      default: Date.now,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    rejectedAt: {
      type: Date,
      default: null,
    },
    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    rejectionNote: {
      type: String,
      default: "",
      maxlength: 280,
      trim: true,
    },
    lastDebitAt: {
      type: Date,
      default: null,
    },
    lastFailureReason: {
      type: String,
      default: "",
      maxlength: 240,
      trim: true,
    },
    pausedAt: {
      type: Date,
      default: null,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    completedAt: {
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

SipPlanSchema.index({ userId: 1, createdAt: -1 });
SipPlanSchema.index({ status: 1, nextDebitDate: 1, autoDebit: 1 });

module.exports = mongoose.model("SipPlan", SipPlanSchema);

