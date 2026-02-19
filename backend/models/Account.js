const mongoose = require("mongoose");

const AccountSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    accountNumber: {
      type: String,
      unique: true,
      required: true,
    },
    currency: {
      type: String,
      default: "INR",
    },
    accountType: {
      type: String,
      enum: ["SAVINGS", "CHECKING", "BUSINESS"],
      default: "SAVINGS",
    },
    balance: {
      type: Number,
      default: 0,
      min: [0, "Balance cannot be negative"],
    },
    branch: {
      type: String,
      required: true,
    },
    ifscCode: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE", "FROZEN", "CLOSED"],
      default: "ACTIVE",
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Indexes for fintech-grade queries
AccountSchema.index({ userId: 1 });
AccountSchema.index({ accountNumber: 1 }, { unique: true });

module.exports = mongoose.model("Account", AccountSchema);
