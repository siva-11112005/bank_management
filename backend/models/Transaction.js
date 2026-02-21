const mongoose = require("mongoose");

const TransactionSchema = new mongoose.Schema(
  {
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: [
        "DEPOSIT",
        "WITHDRAWAL",
        "TRANSFER",
        "LOAN_DISBURSAL",
        "LOAN_PAYMENT",
        "PAYMENT_CREDIT",
        "PAYMENT_REFUND",
        "INTEREST_CREDIT",
        "FD_BOOKING",
        "FD_CLOSURE",
        "RD_INSTALLMENT",
        "RD_CLOSURE",
        "SIP_INSTALLMENT",
      ],
      required: true,
    },
    amount: {
      type: Number,
      required: [true, "Amount is required"],
      min: [0, "Amount cannot be negative"],
    },
    description: {
      type: String,
      default: "",
    },
    recipientAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      default: null,
    },
    recipientName: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["SUCCESS", "FAILED", "PENDING"],
      default: "SUCCESS",
    },
    balanceAfterTransaction: {
      type: Number,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Indexes to optimize transaction queries
TransactionSchema.index({ accountId: 1, createdAt: -1 });
TransactionSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("Transaction", TransactionSchema);
