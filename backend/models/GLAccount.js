const mongoose = require("mongoose");

const glAccountSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    accountType: {
      type: String,
      enum: ["ASSET", "LIABILITY", "INCOME", "EXPENSE", "EQUITY"],
      required: true,
      index: true,
    },
    normalSide: {
      type: String,
      enum: ["DEBIT", "CREDIT"],
      required: true,
    },
    parentCode: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
    },
    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: 320,
    },
    currentBalance: {
      type: Number,
      default: 0,
    },
    isSystem: {
      type: Boolean,
      default: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

glAccountSchema.index({ accountType: 1, isActive: 1 });

module.exports = mongoose.model("GLAccount", glAccountSchema);
