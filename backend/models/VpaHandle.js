const mongoose = require("mongoose");

const normalizeHandle = (value = "") => String(value || "").trim().toLowerCase();

const vpaHandleSchema = new mongoose.Schema(
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
    handle: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      set: normalizeHandle,
      index: true,
    },
    linkedMobile: {
      type: String,
      trim: true,
      default: "",
    },
    provider: {
      type: String,
      trim: true,
      default: "BANKEASE_PSP",
      maxlength: 80,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE", "BLOCKED"],
      default: "ACTIVE",
      index: true,
    },
    isPrimary: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

vpaHandleSchema.index({ userId: 1, isPrimary: 1 });

module.exports = mongoose.model("VpaHandle", vpaHandleSchema);
