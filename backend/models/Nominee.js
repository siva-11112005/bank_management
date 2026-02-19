const mongoose = require("mongoose");

const NomineeSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    relationship: {
      type: String,
      required: true,
      trim: true,
    },
    dateOfBirth: {
      type: Date,
      required: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },
    address: {
      type: String,
      trim: true,
      default: "",
    },
    allocationPercentage: {
      type: Number,
      min: 1,
      max: 100,
      default: 100,
    },
    isMinor: {
      type: Boolean,
      default: false,
    },
    guardianName: {
      type: String,
      trim: true,
      default: "",
    },
    guardianRelationship: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Nominee", NomineeSchema);
