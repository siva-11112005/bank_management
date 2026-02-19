const mongoose = require("mongoose");

const normalizeAccountNumber = (value = "") => String(value || "").trim().replace(/\s+/g, "").toUpperCase();
const normalizeIfscCode = (value = "") => String(value || "").trim().replace(/\s+/g, "").toUpperCase();

const BeneficiarySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    accountNumber: {
      type: String,
      required: true,
      trim: true,
      set: normalizeAccountNumber,
    },
    ifscCode: {
      type: String,
      required: true,
      trim: true,
      set: normalizeIfscCode,
    },
    verified: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

BeneficiarySchema.index({ userId: 1, accountNumber: 1 }, { unique: true });

module.exports = mongoose.model("Beneficiary", BeneficiarySchema);
