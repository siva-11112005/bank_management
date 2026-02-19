const mongoose = require("mongoose");

const LedgerEntrySchema = new mongoose.Schema(
  {
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      index: true,
    },
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["DEBIT", "CREDIT"],
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: [0, "Amount cannot be negative"],
    },
    balanceAfter: {
      type: Number,
      required: true,
    },
    description: {
      type: String,
      default: "",
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

// Immutable entries: disable updates/deletes programmatically (application-level enforcement)
// Consumers should never update or delete ledger entries once created.

module.exports = mongoose.model("LedgerEntry", LedgerEntrySchema);
