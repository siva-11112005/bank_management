const mongoose = require("mongoose");

const OtpSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    purpose: {
      type: String,
      enum: ["BENEFICIARY_VERIFY", "TRANSFER_VERIFY", "PROFILE_UPDATE_VERIFY"],
      required: true,
      index: true,
    },
    codeHash: {
      type: String,
      required: true,
      index: true,
    },
    metadata: {
      type: Object,
      default: {},
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 },
    },
    isUsed: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Otp", OtpSchema);
