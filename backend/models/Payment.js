const mongoose = require("mongoose");

const PaymentSchema = new mongoose.Schema(
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
    gateway: {
      type: String,
      enum: ["MOCK", "RAZORPAY"],
      default: "MOCK",
      index: true,
    },
    providerOrderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    providerPaymentId: {
      type: String,
      default: "",
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: [1, "Amount must be greater than zero"],
    },
    currency: {
      type: String,
      default: "INR",
    },
    method: {
      type: String,
      enum: ["UPI", "CARD", "NETBANKING", "WALLET", "IMPS", "NEFT", "RTGS", "OTHER"],
      default: "UPI",
    },
    description: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["CREATED", "PENDING", "SUCCESS", "FAILED", "CANCELLED", "REFUNDED"],
      default: "CREATED",
      index: true,
    },
    receipt: {
      type: String,
      required: true,
      index: true,
    },
    signature: {
      type: String,
      default: "",
    },
    failureReason: {
      type: String,
      default: "",
    },
    refundedAt: {
      type: Date,
      default: null,
    },
    refundReason: {
      type: String,
      default: "",
    },
    updatedByAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    metadata: {
      type: Object,
      default: {},
    },
  },
  { timestamps: true }
);

PaymentSchema.index({ userId: 1, createdAt: -1 });
PaymentSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("Payment", PaymentSchema);
