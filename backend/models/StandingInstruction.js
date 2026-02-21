const mongoose = require("mongoose");

const standingInstructionSchema = new mongoose.Schema(
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
    recipientAccountNumber: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    recipientName: {
      type: String,
      trim: true,
      default: "",
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    frequency: {
      type: String,
      enum: ["DAILY", "WEEKLY", "MONTHLY"],
      required: true,
      default: "MONTHLY",
    },
    startDate: {
      type: Date,
      default: Date.now,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 240,
      default: "",
    },
    status: {
      type: String,
      enum: ["ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"],
      default: "ACTIVE",
      index: true,
    },
    nextRunAt: {
      type: Date,
      default: null,
      index: true,
    },
    lastRunAt: {
      type: Date,
      default: null,
    },
    lastAttemptAt: {
      type: Date,
      default: null,
    },
    lastExecutionStatus: {
      type: String,
      enum: ["PENDING", "SUCCESS", "FAILED"],
      default: "PENDING",
    },
    lastFailureReason: {
      type: String,
      trim: true,
      maxlength: 320,
      default: "",
    },
    executedCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    maxExecutions: {
      type: Number,
      default: 0,
      min: 0,
    },
    failureCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    isProcessing: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

standingInstructionSchema.index({ userId: 1, status: 1, createdAt: -1 });
standingInstructionSchema.index({ status: 1, nextRunAt: 1, isProcessing: 1 });

module.exports = mongoose.model("StandingInstruction", standingInstructionSchema);
