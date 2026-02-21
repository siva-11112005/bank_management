const mongoose = require("mongoose");

const RegulatoryPolicyConfigSchema = new mongoose.Schema(
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
    ctrCashThreshold: {
      type: Number,
      required: true,
      min: 1,
    },
    minLcrRatio: {
      type: Number,
      required: true,
      min: 0,
    },
    maxLoanToDepositRatio: {
      type: Number,
      required: true,
      min: 0,
    },
    openStrAlertThreshold: {
      type: Number,
      required: true,
      min: 0,
    },
    criticalStrAlertThreshold: {
      type: Number,
      required: true,
      min: 0,
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

RegulatoryPolicyConfigSchema.index({ key: 1, version: 1 }, { unique: true });
RegulatoryPolicyConfigSchema.index({ key: 1, isActive: 1, updatedAt: -1 });

module.exports = mongoose.model("RegulatoryPolicyConfig", RegulatoryPolicyConfigSchema);
