const mongoose = require("mongoose");

const kycRequestSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    panNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    occupation: {
      type: String,
      trim: true,
      required: true,
      maxlength: 120,
    },
    incomeRange: {
      type: String,
      trim: true,
      required: true,
      maxlength: 80,
    },
    idProofType: {
      type: String,
      enum: ["AADHAAR", "PASSPORT", "DRIVING_LICENSE", "VOTER_ID", "OTHER"],
      required: true,
    },
    idProofNumber: {
      type: String,
      trim: true,
      required: true,
      maxlength: 40,
    },
    addressProofType: {
      type: String,
      enum: ["AADHAAR", "PASSPORT", "UTILITY_BILL", "RENT_AGREEMENT", "OTHER"],
      required: true,
    },
    addressProofNumber: {
      type: String,
      trim: true,
      required: true,
      maxlength: 40,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
      maxlength: 500,
    },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
      index: true,
    },
    adminNote: {
      type: String,
      trim: true,
      default: "",
      maxlength: 500,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

kycRequestSchema.index({ userId: 1, createdAt: -1 });
kycRequestSchema.index({ status: 1, updatedAt: -1 });

module.exports = mongoose.model("KycRequest", kycRequestSchema);
