const mongoose = require("mongoose");

const MoneyOutPolicyConfigSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: "DEFAULT",
      trim: true,
      uppercase: true,
      index: true,
    },
    version: {
      type: Number,
      required: true,
      min: 1,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    maxSingleTransfer: {
      type: Number,
      required: true,
      min: 1,
    },
    dailyTransferLimit: {
      type: Number,
      required: true,
      min: 1,
    },
    highValueTransferThreshold: {
      type: Number,
      required: true,
      min: 1,
    },
    requireTransferOtpForHighValue: {
      type: Boolean,
      default: false,
    },
    maxSingleWithdrawal: {
      type: Number,
      required: true,
      min: 1,
    },
    dailyWithdrawalLimit: {
      type: Number,
      required: true,
      min: 1,
    },
    enforceBeneficiary: {
      type: Boolean,
      default: false,
    },
    allowDirectTransferWithPin: {
      type: Boolean,
      default: true,
    },
    requireVerifiedBeneficiary: {
      type: Boolean,
      default: false,
    },
    source: {
      type: String,
      enum: ["ENV_DEFAULT", "ADMIN_DIRECT", "ADMIN_APPROVAL"],
      default: "ADMIN_DIRECT",
      index: true,
    },
    changeNote: {
      type: String,
      default: "",
      maxlength: 240,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

MoneyOutPolicyConfigSchema.index({ key: 1, version: 1 }, { unique: true });
MoneyOutPolicyConfigSchema.index({ key: 1, isActive: 1, updatedAt: -1 });

module.exports = mongoose.model("MoneyOutPolicyConfig", MoneyOutPolicyConfigSchema);
