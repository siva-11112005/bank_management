const User = require("../models/User");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const AuditLog = require("../models/AuditLog");
const Otp = require("../models/Otp");
const Nominee = require("../models/Nominee");
const {
  sendOtpEmail,
  isEmailConfigured,
  getEmailFailureHint,
} = require("../utils/emailService");
const { generateOtp, normalizeOtpCode, isValidOtpCode, hashOtpCode } = require("../utils/otpUtils");
const { isAdminIdentity, normalizeEmail, normalizePhone } = require("../utils/adminIdentity");

// Generate tokens
const generateAccessToken = (id, role) => {
  const expires = process.env.JWT_EXPIRE || "15m";
  return jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: expires });
};

const generateRefreshToken = () => crypto.randomBytes(64).toString("hex");
const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

const PROFILE_OTP_TTL_MS = 10 * 60 * 1000;
const PROFILE_OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const canUseEmailOtpFallback = () => {
  const configured = process.env.ALLOW_EMAIL_OTP_FALLBACK;
  if (configured === undefined || configured === null || configured === "") {
    return String(process.env.NODE_ENV || "development").toLowerCase() !== "production";
  }
  return String(configured).toLowerCase() === "true";
};
const shouldExposeFallbackOtpCode = () =>
  String(process.env.NODE_ENV || "development").toLowerCase() !== "production" ||
  String(process.env.ALLOW_EMAIL_OTP_FALLBACK || "").toLowerCase() === "true";

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);

const prepareProfileChanges = (existingUser, payload = {}) => {
  const changes = {};

  if (hasOwn(payload, "firstName")) {
    const value = String(payload.firstName || "").trim();
    if (value && value !== existingUser.firstName) {
      changes.firstName = value;
    }
  }

  if (hasOwn(payload, "lastName")) {
    const value = String(payload.lastName || "").trim();
    if (value && value !== existingUser.lastName) {
      changes.lastName = value;
    }
  }

  if (hasOwn(payload, "email")) {
    const normalized = normalizeEmail(payload.email);
    if (normalized && normalized !== existingUser.email) {
      changes.email = normalized;
    }
  }

  if (hasOwn(payload, "phone")) {
    const normalized = normalizePhone(payload.phone);
    if (normalized && normalized !== existingUser.phone) {
      changes.phone = normalized;
    }
  }

  if (hasOwn(payload, "address")) {
    const normalized = String(payload.address || "").trim();
    if (normalized !== (existingUser.address || "")) {
      changes.address = normalized;
    }
  }

  return changes;
};

const areSameChanges = (left = {}, right = {}) => {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();

  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key, index) => key === rightKeys[index] && String(left[key]) === String(right[key]));
};

const buildProfileResponse = (user) => ({
  id: user._id,
  firstName: user.firstName,
  lastName: user.lastName,
  email: user.email,
  phone: user.phone,
  aadhar: user.aadhar,
  address: user.address,
  role: user.role,
  isActive: user.isActive,
  createdAt: user.createdAt,
  hasTransactionPin: Boolean(user.transactionPinHash),
  transactionPinUpdatedAt: user.transactionPinUpdatedAt,
});

const buildNomineeResponse = (nominee) => {
  if (!nominee) return null;
  return {
    id: nominee._id,
    fullName: nominee.fullName,
    relationship: nominee.relationship,
    dateOfBirth: nominee.dateOfBirth,
    phone: nominee.phone,
    email: nominee.email,
    address: nominee.address,
    allocationPercentage: nominee.allocationPercentage,
    isMinor: nominee.isMinor,
    guardianName: nominee.guardianName,
    guardianRelationship: nominee.guardianRelationship,
    updatedAt: nominee.updatedAt,
  };
};

// Register User
exports.register = async (req, res) => {
  try {
    const { firstName, lastName, email, phone, password, confirmPassword, aadhar, address } = req.body;
    const normalizedEmail = normalizeEmail(email);
    const normalizedPhone = normalizePhone(phone);

    // Validation
    if (!firstName || !lastName || !email || !phone || !password || !aadhar || !address) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    if (!normalizedPhone) {
      return res.status(400).json({ success: false, message: "Valid phone number is required" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: "Passwords do not match" });
    }

    // Check if user already exists
    let user = await User.findOne({ email: normalizedEmail });
    if (user) {
      return res.status(400).json({ success: false, message: "User already exists with this email" });
    }

    user = await User.findOne({ aadhar });
    if (user) {
      return res.status(400).json({ success: false, message: "User already exists with this Aadhar" });
    }

    // Create new user
    user = new User({
      firstName,
      lastName,
      email: normalizedEmail,
      phone: normalizedPhone,
      password,
      aadhar,
      address,
      role: isAdminIdentity({ email: normalizedEmail, phone: normalizedPhone }) ? "ADMIN" : "USER",
    });

    await user.save();

    const token = generateAccessToken(user._id, user.role);
    const refreshToken = generateRefreshToken();
    user.refreshTokenHash = hashToken(refreshToken);
    await user.save();

    // Set cookies
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 15 * 60 * 1000,
    });
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/api/auth/refresh",
    });

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        hasTransactionPin: false,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Login User
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const identifier = String(email || "").trim();
    const normalizedEmail = normalizeEmail(identifier);
    const normalizedPhone = normalizePhone(identifier);

    // Validation
    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email/phone and password are required" });
    }

    // Check if user exists
    const user = await User.findOne({
      $or: [{ email: normalizedEmail }, { phone: identifier }, { phone: normalizedPhone }],
    }).select("+password +transactionPinHash");
    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(403).json({ success: false, message: "Your account has been deactivated" });
    }
    // Lockout check
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return res.status(403).json({ success: false, message: "Account locked due to repeated failed logins. Try later." });
    }

    // Match password
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      const attempts = (user.loginAttempts || 0) + 1;
      const update = { loginAttempts: attempts };
      if (attempts >= 5) {
        update.lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
        update.loginAttempts = 0; // reset after lock
      }
      await User.findByIdAndUpdate(user._id, update);
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const shouldBeAdmin = isAdminIdentity({ email: user.email, phone: user.phone });
    if (user.role !== "ADMIN" && shouldBeAdmin) {
      user.role = "ADMIN";
    }
    if (user.role === "ADMIN" && !shouldBeAdmin) {
      user.role = "USER";
    }

    const token = generateAccessToken(user._id, user.role);
    const refreshToken = generateRefreshToken();
    user.refreshTokenHash = hashToken(refreshToken);
    user.loginAttempts = 0;
    user.lockedUntil = null;
    await user.save();

    // Set HTTP-only cookies
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 15 * 60 * 1000,
    });
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/api/auth/refresh",
    });

    // Audit log: login success
    try {
      await AuditLog.create({
        userId: user._id,
        action: "LOGIN_SUCCESS",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || "",
        metadata: { identifier: normalizedEmail || normalizedPhone },
      });
    } catch (_) {}

    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        aadhar: user.aadhar,
        address: user.address,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt,
        hasTransactionPin: Boolean(user.transactionPinHash),
      },
    });
  } catch (error) {
    try {
      await AuditLog.create({
        action: "LOGIN_FAILED",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || "",
        metadata: { email: req.body?.email },
      });
    } catch (_) {}
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get current user profile
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("+transactionPinHash");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        aadhar: user.aadhar,
        address: user.address,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt,
        hasTransactionPin: Boolean(user.transactionPinHash),
        transactionPinUpdatedAt: user.transactionPinUpdatedAt,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Request OTP for profile updates
exports.requestProfileUpdateOtp = async (req, res) => {
  try {
    const allowFallback = canUseEmailOtpFallback();
    if (!isEmailConfigured() && !allowFallback) {
      return res.status(500).json({
        success: false,
        message: "Email service is not configured. Configure Nodemailer before profile OTP flow.",
      });
    }

    const existingUser = await User.findById(req.userId);
    if (!existingUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const changes = prepareProfileChanges(existingUser, req.body);
    if (!Object.keys(changes).length) {
      return res.status(400).json({
        success: false,
        message: "No profile changes detected. Update at least one field before requesting OTP.",
      });
    }

    const isProtectedAdmin = isAdminIdentity({
      email: existingUser.email,
      phone: existingUser.phone,
    });
    if (isProtectedAdmin && (hasOwn(changes, "email") || hasOwn(changes, "phone"))) {
      return res.status(400).json({
        success: false,
        message: "Protected admin email/phone cannot be changed.",
      });
    }

    if (changes.email) {
      const emailInUse = await User.findOne({ email: changes.email, _id: { $ne: req.userId } });
      if (emailInUse) {
        return res.status(400).json({ success: false, message: "Email is already used by another account." });
      }
    }

    if (changes.phone) {
      const phoneInUse = await User.findOne({ phone: changes.phone, _id: { $ne: req.userId } });
      if (phoneInUse) {
        return res.status(400).json({ success: false, message: "Phone number is already used by another account." });
      }
    }

    const latestOtp = await Otp.findOne({
      userId: req.userId,
      purpose: "PROFILE_UPDATE_VERIFY",
      isUsed: false,
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });

    if (latestOtp) {
      const elapsedMs = Date.now() - new Date(latestOtp.createdAt).getTime();
      if (elapsedMs < PROFILE_OTP_RESEND_COOLDOWN_MS && areSameChanges(latestOtp.metadata?.changes || {}, changes)) {
        return res.status(200).json({
          success: true,
          otpSessionId: latestOtp._id,
          expiresAt: latestOtp.expiresAt,
          message: "OTP already sent recently. Please check your email.",
        });
      }
    }

    await Otp.updateMany(
      {
        userId: req.userId,
        purpose: "PROFILE_UPDATE_VERIFY",
        isUsed: false,
      },
      { $set: { isUsed: true } }
    );

    const otpCode = generateOtp();
    const expiresAt = new Date(Date.now() + PROFILE_OTP_TTL_MS);
    const otp = await Otp.create({
      userId: req.userId,
      purpose: "PROFILE_UPDATE_VERIFY",
      codeHash: hashOtpCode(otpCode),
      metadata: { changes },
      expiresAt,
    });

    const sent = await sendOtpEmail(existingUser.email, otpCode, existingUser.firstName || "User", {
      purpose: "PROFILE_UPDATE_VERIFY",
    });

    if (!sent) {
      if (!allowFallback) {
        await Otp.findByIdAndDelete(otp._id);
        return res.status(500).json({
          success: false,
          message: `Unable to send profile update OTP. ${getEmailFailureHint()}`,
        });
      }

      return res.status(200).json({
        success: true,
        otpSessionId: otp._id,
        expiresAt: otp.expiresAt,
        fallbackOtpMode: true,
        devOtpCode: shouldExposeFallbackOtpCode() ? otpCode : undefined,
        message:
          "Email OTP delivery is unavailable right now. Use the fallback OTP shown below to continue profile update.",
      });
    }

    try {
      await AuditLog.create({
        userId: req.userId,
        action: "PROFILE_UPDATE_OTP_REQUEST",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || "",
        metadata: {
          otpId: otp._id,
          fields: Object.keys(changes),
        },
      });
    } catch (_) {}

    return res.status(200).json({
      success: true,
      otpSessionId: otp._id,
      expiresAt: otp.expiresAt,
      message: "OTP sent to your registered email. Verify OTP to apply profile changes.",
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Update profile (OTP verified)
exports.updateProfile = async (req, res) => {
  try {
    const { otpSessionId, otpCode } = req.body;
    const normalizedOtpCode = normalizeOtpCode(otpCode);
    if (!isValidOtpCode(normalizedOtpCode)) {
      return res.status(400).json({ success: false, message: "Enter valid 6-digit OTP." });
    }

    const existingUser = await User.findById(req.userId).select("+transactionPinHash");

    if (!existingUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const otp = await Otp.findOne({
      _id: otpSessionId,
      userId: req.userId,
      purpose: "PROFILE_UPDATE_VERIFY",
      isUsed: false,
      expiresAt: { $gt: new Date() },
    });

    if (!otp) {
      return res.status(400).json({ success: false, message: "OTP session is invalid or expired." });
    }

    if (otp.codeHash !== hashOtpCode(normalizedOtpCode)) {
      return res.status(401).json({ success: false, message: "Incorrect OTP." });
    }

    const changes = otp.metadata?.changes || {};
    if (!Object.keys(changes).length) {
      otp.isUsed = true;
      await otp.save();
      return res.status(400).json({
        success: false,
        message: "No pending profile changes found for this OTP session.",
      });
    }

    const isProtectedAdmin = isAdminIdentity({
      email: existingUser.email,
      phone: existingUser.phone,
    });
    if (isProtectedAdmin && (hasOwn(changes, "email") || hasOwn(changes, "phone"))) {
      otp.isUsed = true;
      await otp.save();
      return res.status(400).json({
        success: false,
        message: "Protected admin email/phone cannot be changed.",
      });
    }

    if (changes.email) {
      const emailInUse = await User.findOne({ email: changes.email, _id: { $ne: req.userId } });
      if (emailInUse) {
        return res.status(400).json({ success: false, message: "Email is already used by another account." });
      }
    }

    if (changes.phone) {
      const phoneInUse = await User.findOne({ phone: changes.phone, _id: { $ne: req.userId } });
      if (phoneInUse) {
        return res.status(400).json({ success: false, message: "Phone number is already used by another account." });
      }
    }

    const nextEmail = changes.email || existingUser.email;
    const nextPhone = changes.phone || existingUser.phone;
    const nextRole = isAdminIdentity({ email: nextEmail, phone: nextPhone }) ? "ADMIN" : "USER";

    const updatePayload = { role: nextRole };
    if (hasOwn(changes, "firstName")) updatePayload.firstName = changes.firstName;
    if (hasOwn(changes, "lastName")) updatePayload.lastName = changes.lastName;
    if (hasOwn(changes, "email")) updatePayload.email = changes.email;
    if (hasOwn(changes, "phone")) updatePayload.phone = changes.phone;
    if (hasOwn(changes, "address")) updatePayload.address = changes.address;

    const user = await User.findByIdAndUpdate(req.userId, updatePayload, { new: true, runValidators: true }).select(
      "+transactionPinHash"
    );

    otp.isUsed = true;
    await otp.save();
    await Otp.updateMany(
      {
        userId: req.userId,
        purpose: "PROFILE_UPDATE_VERIFY",
        isUsed: false,
        _id: { $ne: otp._id },
      },
      { $set: { isUsed: true } }
    );

    const token = generateAccessToken(user._id, user.role);
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 15 * 60 * 1000,
    });

    try {
      await AuditLog.create({
        userId: req.userId,
        action: "PROFILE_UPDATED",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || "",
        metadata: {
          fields: Object.keys(changes),
          role: user.role,
        },
      });
    } catch (_) {}

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully.",
      token,
      user: buildProfileResponse(user),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Set or update transaction PIN
exports.setTransactionPin = async (req, res) => {
  try {
    const { currentPin, pin, confirmPin } = req.body;

    if (!pin || !confirmPin || pin !== confirmPin) {
      return res.status(400).json({ success: false, message: "PIN and confirm PIN must match." });
    }

    const user = await User.findById(req.userId).select(
      "+transactionPinHash +transactionPinAttempts +transactionPinLockedUntil"
    );

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const hasExistingPin = Boolean(user.transactionPinHash);
    if (hasExistingPin) {
      if (!currentPin) {
        return res.status(400).json({ success: false, message: "Current PIN is required to update PIN." });
      }

      const isCurrentPinValid = await bcrypt.compare(currentPin, user.transactionPinHash);
      if (!isCurrentPinValid) {
        return res.status(401).json({ success: false, message: "Current transaction PIN is invalid." });
      }
    }

    const salt = await bcrypt.genSalt(10);
    user.transactionPinHash = await bcrypt.hash(pin, salt);
    user.transactionPinUpdatedAt = new Date();
    user.transactionPinAttempts = 0;
    user.transactionPinLockedUntil = null;
    await user.save();

    try {
      await AuditLog.create({
        userId: user._id,
        action: hasExistingPin ? "TRANSACTION_PIN_UPDATED" : "TRANSACTION_PIN_SET",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || "",
        metadata: { updatedAt: user.transactionPinUpdatedAt },
      });
    } catch (_) {}

    res.status(200).json({
      success: true,
      message: hasExistingPin ? "Transaction PIN updated successfully." : "Transaction PIN set successfully.",
      hasTransactionPin: true,
      transactionPinUpdatedAt: user.transactionPinUpdatedAt,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getNominee = async (req, res) => {
  try {
    const nominee = await Nominee.findOne({ userId: req.userId });
    return res.status(200).json({
      success: true,
      nominee: buildNomineeResponse(nominee),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.upsertNominee = async (req, res) => {
  try {
    const payload = {
      fullName: String(req.body.fullName || "").trim(),
      relationship: String(req.body.relationship || "").trim(),
      dateOfBirth: req.body.dateOfBirth,
      phone: normalizePhone(req.body.phone) || String(req.body.phone || "").trim(),
      email: normalizeEmail(req.body.email) || "",
      address: String(req.body.address || "").trim(),
      allocationPercentage: Number(req.body.allocationPercentage || 100),
      isMinor: Boolean(req.body.isMinor),
      guardianName: String(req.body.guardianName || "").trim(),
      guardianRelationship: String(req.body.guardianRelationship || "").trim(),
    };

    if (payload.isMinor && !payload.guardianName) {
      return res.status(400).json({
        success: false,
        message: "Guardian name is required when nominee is a minor.",
      });
    }

    const existing = await Nominee.findOne({ userId: req.userId });
    const nominee = await Nominee.findOneAndUpdate(
      { userId: req.userId },
      { ...payload, userId: req.userId },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    try {
      await AuditLog.create({
        userId: req.userId,
        action: existing ? "NOMINEE_UPDATED" : "NOMINEE_ADDED",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || "",
        metadata: {
          nomineeId: nominee._id,
          relationship: nominee.relationship,
          isMinor: nominee.isMinor,
          allocationPercentage: nominee.allocationPercentage,
        },
      });
    } catch (_) {}

    return res.status(200).json({
      success: true,
      message: existing ? "Nominee updated successfully." : "Nominee added successfully.",
      nominee: buildNomineeResponse(nominee),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteNominee = async (req, res) => {
  try {
    const nominee = await Nominee.findOneAndDelete({ userId: req.userId });

    if (!nominee) {
      return res.status(200).json({
        success: true,
        message: "No nominee available to remove.",
      });
    }

    try {
      await AuditLog.create({
        userId: req.userId,
        action: "NOMINEE_REMOVED",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || "",
        metadata: {
          nomineeId: nominee._id,
          relationship: nominee.relationship,
        },
      });
    } catch (_) {}

    return res.status(200).json({
      success: true,
      message: "Nominee removed successfully.",
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Logout
exports.logout = async (req, res) => {
  try {
    if (req.userId) {
      await User.findByIdAndUpdate(req.userId, { refreshTokenHash: null });
    }
  } catch (_) {}
  res.clearCookie("token");
  res.clearCookie("refreshToken", { path: "/api/auth/refresh" });
  res.status(200).json({ success: true, message: "Logged out successfully" });
};

// Refresh access token (rotation)
exports.refresh = async (req, res) => {
  try {
    const { refreshToken } = req.cookies || {};
    if (!refreshToken) {
      return res.status(401).json({ success: false, message: "No refresh token" });
    }
    const hashed = hashToken(refreshToken);
    const user = await User.findOne({ refreshTokenHash: hashed });
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: "Invalid refresh token" });
    }
    const newRefreshToken = generateRefreshToken();
    user.refreshTokenHash = hashToken(newRefreshToken);
    await user.save();
    const token = generateAccessToken(user._id, user.role);
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 15 * 60 * 1000,
    });
    res.cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/api/auth/refresh",
    });
    res.status(200).json({ success: true, token });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
