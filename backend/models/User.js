const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const UserSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: [true, "First name is required"],
      trim: true,
    },
    lastName: {
      type: String,
      required: [true, "Last name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, "Please provide a valid email"],
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 6,
      select: false,
    },
    aadhar: {
      type: String,
      required: [true, "Aadhar number is required"],
      unique: true,
    },
    address: {
      type: String,
      required: [true, "Address is required"],
    },
    role: {
      type: String,
      enum: ["USER", "ADMIN"],
      default: "USER",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    kycStatus: {
      type: String,
      enum: ["NOT_SUBMITTED", "PENDING", "APPROVED", "REJECTED"],
      default: "NOT_SUBMITTED",
      index: true,
    },
    kycReviewedAt: {
      type: Date,
      default: null,
    },
    kycReviewNote: {
      type: String,
      trim: true,
      default: "",
    },
    refreshTokenHash: {
      type: String,
      default: null,
      select: false,
    },
    transactionPinHash: {
      type: String,
      default: null,
      select: false,
    },
    transactionPinUpdatedAt: {
      type: Date,
      default: null,
    },
    transactionPinAttempts: {
      type: Number,
      default: 0,
      select: false,
    },
    transactionPinLockedUntil: {
      type: Date,
      default: null,
      select: false,
    },
    // Login lockout controls
    loginAttempts: {
      type: Number,
      default: 0,
      select: false,
    },
    lockedUntil: {
      type: Date,
      default: null,
      select: false,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Hash password before saving
UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", UserSchema);
