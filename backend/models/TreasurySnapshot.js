const mongoose = require("mongoose");

const TreasurySnapshotSchema = new mongoose.Schema(
  {
    asOfDate: {
      type: Date,
      required: true,
      index: true,
    },
    cashInVault: {
      type: Number,
      default: 0,
      min: 0,
    },
    rbiBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    nostroBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    interbankObligations: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalDeposits: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalLoansOutstanding: {
      type: Number,
      default: 0,
      min: 0,
    },
    crrRatio: {
      type: Number,
      default: 0,
    },
    slrRatio: {
      type: Number,
      default: 0,
    },
    lcrRatio: {
      type: Number,
      default: 0,
    },
    netLiquidity: {
      type: Number,
      default: 0,
    },
    remarks: {
      type: String,
      default: "",
      maxlength: 240,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

TreasurySnapshotSchema.index({ asOfDate: -1, createdAt: -1 });

module.exports = mongoose.model("TreasurySnapshot", TreasurySnapshotSchema);
