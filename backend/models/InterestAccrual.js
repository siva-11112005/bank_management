const mongoose = require("mongoose");

const interestAccrualSchema = new mongoose.Schema(
  {
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    dateKey: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    annualRate: {
      type: Number,
      required: true,
      min: 0,
    },
    balanceSnapshot: {
      type: Number,
      required: true,
      min: 0,
    },
    interestAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ["POSTED", "SKIPPED", "FAILED"],
      default: "POSTED",
      index: true,
    },
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      default: null,
    },
    glJournalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GLJournal",
      default: null,
    },
    reason: {
      type: String,
      trim: true,
      default: "",
      maxlength: 320,
    },
  },
  { timestamps: true }
);

interestAccrualSchema.index({ accountId: 1, dateKey: 1 }, { unique: true });
interestAccrualSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("InterestAccrual", interestAccrualSchema);
