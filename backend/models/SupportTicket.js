const mongoose = require("mongoose");

const SupportTicketSchema = new mongoose.Schema(
  {
    ticketNumber: {
      type: String,
      unique: true,
      index: true,
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    category: {
      type: String,
      enum: [
        "CONTACT_US",
        "SERVICE_REQUEST",
        "BRANCH_LOCATOR",
        "GRIEVANCE",
        "NRI_MAILBOX",
        "CALL_CHAT_LOCATE",
        "ACCOUNT",
        "CARD",
        "LOAN",
        "PAYMENT",
        "TECHNICAL",
        "OTHER",
      ],
      default: "OTHER",
      index: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 3000,
    },
    priority: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH"],
      default: "MEDIUM",
      index: true,
    },
    status: {
      type: String,
      enum: ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"],
      default: "OPEN",
      index: true,
    },
    adminNote: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000,
    },
    lastUpdatedByRole: {
      type: String,
      enum: ["USER", "ADMIN"],
      default: "USER",
    },
    closedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

SupportTicketSchema.pre("validate", function (next) {
  if (!this.ticketNumber) {
    const date = new Date();
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    const randomPart = Math.floor(100000 + Math.random() * 900000);
    this.ticketNumber = `SR-${y}${m}${d}-${randomPart}`;
  }
  next();
});

module.exports = mongoose.model("SupportTicket", SupportTicketSchema);

