const mongoose = require("mongoose");

const LoanSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    loanType: {
      type: String,
      enum: [
        "PERSONAL",
        "HOME",
        "VEHICLE",
        "EDUCATION",
        "CAR",
        "BUSINESS",
        "TRACTOR",
        "CONSUMER_DURABLE",
        "TWO_WHEELER",
        "HORTICULTURE",
        "ALLIED_ACTIVITIES",
        "WORKING_CAPITAL",
      ],
      required: true,
    },
    principal: {
      type: Number,
      required: [true, "Loan amount is required"],
      min: [0, "Amount cannot be negative"],
    },
    interestRate: {
      type: Number,
      default: 10,
      min: [0, "Interest rate cannot be negative"],
    },
    tenure: {
      type: Number,
      required: [true, "Tenure (in months) is required"],
    },
    emi: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED", "CLOSED"],
      default: "PENDING",
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    disbursedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    disbursedAmount: {
      type: Number,
      default: 0,
      min: [0, "Disbursed amount cannot be negative"],
    },
    disbursedAt: {
      type: Date,
      default: null,
    },
    disbursalTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      default: null,
    },
    amountPaid: {
      type: Number,
      default: 0,
    },
    remainingAmount: {
      type: Number,
      default: 0,
    },
    startDate: {
      type: Date,
      default: null,
    },
    endDate: {
      type: Date,
      default: null,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Calculate EMI before saving
LoanSchema.pre("save", function (next) {
  if (this.isModified("principal") || this.isModified("interestRate") || this.isModified("tenure")) {
    const monthlyRate = this.interestRate / 12 / 100;
    const numberOfPayments = this.tenure;
    
    if (monthlyRate === 0) {
      this.emi = this.principal / numberOfPayments;
    } else {
      this.emi = 
        (this.principal * monthlyRate * Math.pow(1 + monthlyRate, numberOfPayments)) /
        (Math.pow(1 + monthlyRate, numberOfPayments) - 1);
    }

    this.remainingAmount = this.principal + (this.emi * this.tenure - this.principal) - this.amountPaid;
  }
  next();
});

module.exports = mongoose.model("Loan", LoanSchema);
