const mongoose = require("mongoose");

const regulatoryAlertSchema = new mongoose.Schema(
  {
    alertKey: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      unique: true,
      index: true,
    },
    indicatorCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    indicatorMessage: {
      type: String,
      required: true,
      trim: true,
      maxlength: 320,
    },
    source: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 64,
      index: true,
    },
    status: {
      type: String,
      enum: ["OPEN", "ACKNOWLEDGED", "RESOLVED"],
      default: "OPEN",
      index: true,
    },
    monitorDateKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: 16,
      index: true,
    },
    reportRange: {
      from: { type: Date, default: null },
      to: { type: Date, default: null },
      cashThreshold: { type: Number, default: 0 },
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    acknowledgedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    acknowledgedAt: {
      type: Date,
      default: null,
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    resolutionNote: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300,
    },
  },
  { timestamps: true }
);

regulatoryAlertSchema.index({ status: 1, createdAt: -1 });
regulatoryAlertSchema.index({ source: 1, status: 1, createdAt: -1 });
regulatoryAlertSchema.index({ indicatorCode: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("RegulatoryAlert", regulatoryAlertSchema);
