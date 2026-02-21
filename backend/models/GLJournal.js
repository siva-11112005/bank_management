const mongoose = require("mongoose");

const glLineSchema = new mongoose.Schema(
  {
    accountCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    accountName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    debit: {
      type: Number,
      default: 0,
      min: 0,
    },
    credit: {
      type: Number,
      default: 0,
      min: 0,
    },
    narration: {
      type: String,
      trim: true,
      default: "",
      maxlength: 240,
    },
  },
  { _id: false }
);

const glJournalSchema = new mongoose.Schema(
  {
    journalNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    postingDate: {
      type: Date,
      default: Date.now,
      index: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 240,
    },
    source: {
      type: String,
      trim: true,
      default: "SYSTEM",
      maxlength: 80,
      index: true,
    },
    referenceType: {
      type: String,
      trim: true,
      default: "",
      maxlength: 80,
      index: true,
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    totalDebit: {
      type: Number,
      required: true,
      min: 0,
    },
    totalCredit: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ["POSTED", "REVERSED"],
      default: "POSTED",
      index: true,
    },
    lines: {
      type: [glLineSchema],
      validate: {
        validator: (lines = []) => Array.isArray(lines) && lines.length >= 2,
        message: "Journal must contain at least two lines.",
      },
      required: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

glJournalSchema.index({ source: 1, postingDate: -1 });
glJournalSchema.index({ referenceType: 1, referenceId: 1 });

module.exports = mongoose.model("GLJournal", glJournalSchema);
