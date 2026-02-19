const mongoose = require("mongoose");
const Beneficiary = require("../models/Beneficiary");
const Otp = require("../models/Otp");
const { sendOtpEmail, isEmailConfigured, getEmailFailureHint } = require("../utils/emailService");
const { generateOtp, normalizeOtpCode, isValidOtpCode, hashOtpCode } = require("../utils/otpUtils");
const { getMoneyOutPolicy } = require("../utils/moneyOutPolicy");

const normalizeAccountNumber = (value = "") => String(value || "").trim().replace(/\s+/g, "").toUpperCase();
const normalizeIfscCode = (value = "") => String(value || "").trim().replace(/\s+/g, "").toUpperCase();

const canUseBeneficiaryOtpFallback = () => {
  if (String(process.env.ALLOW_EMAIL_OTP_FALLBACK || "").toLowerCase() === "true") {
    return true;
  }
  const configured = process.env.ALLOW_BENEFICIARY_OTP_FALLBACK;
  if (configured === undefined || configured === null || configured === "") {
    return String(process.env.NODE_ENV || "development").toLowerCase() !== "production";
  }
  return String(configured).toLowerCase() === "true";
};

const createFallbackOtpResponse = ({ message, code }) => {
  const payload = { message, fallbackOtpMode: true };
  const shouldExposeCode =
    String(process.env.NODE_ENV || "development").toLowerCase() !== "production" ||
    String(process.env.ALLOW_EMAIL_OTP_FALLBACK || "").toLowerCase() === "true" ||
    String(process.env.ALLOW_BENEFICIARY_OTP_FALLBACK || "").toLowerCase() === "true";
  if (shouldExposeCode) {
    payload.devOtpCode = code;
  }
  return payload;
};

const isBeneficiaryVerificationMandatory = () => {
  const policy = getMoneyOutPolicy();
  return Boolean(policy.requireVerifiedBeneficiary);
};

const toObjectIdIfValid = (value = "") => {
  const id = String(value || "").trim();
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return new mongoose.Types.ObjectId(id);
};

const buildBeneficiaryOtpMetadataMatch = (beneficiaryId) => {
  const idString = String(beneficiaryId || "").trim();
  const idObject = toObjectIdIfValid(idString);
  const candidates = [
    { "metadata.beneficiaryId": idString },
    { "metadata.beneficiaryObjectId": idString },
  ];

  if (idObject) {
    candidates.push({ "metadata.beneficiaryId": idObject });
    candidates.push({ "metadata.beneficiaryObjectId": idObject });
  }

  return { $or: candidates };
};

const buildBeneficiaryOtpMetadata = (beneficiaryId) => ({
  beneficiaryId: String(beneficiaryId),
  beneficiaryObjectId: beneficiaryId,
});

exports.listBeneficiaries = async (req, res) => {
  try {
    const list = await Beneficiary.find({ userId: req.userId }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, beneficiaries: list });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.addBeneficiary = async (req, res) => {
  try {
    const mailConfigured = isEmailConfigured();
    const allowFallback = canUseBeneficiaryOtpFallback();
    const verificationRequired = isBeneficiaryVerificationMandatory();

    const name = String(req.body.name || "").trim();
    const accountNumber = normalizeAccountNumber(req.body.accountNumber);
    const ifscCode = normalizeIfscCode(req.body.ifscCode);

    const existing = await Beneficiary.findOne({ userId: req.userId, accountNumber });
    if (existing) {
      return res.status(400).json({ success: false, message: "Beneficiary already exists" });
    }

    const beneficiary = await Beneficiary.create({
      userId: req.userId,
      name,
      accountNumber,
      ifscCode,
      verified: false,
    });

    if (!mailConfigured && !allowFallback) {
      if (verificationRequired) {
        await Beneficiary.findByIdAndDelete(beneficiary._id);
        return res.status(500).json({
          success: false,
          message: "Email service is not configured. Enable Nodemailer settings before beneficiary OTP flow.",
        });
      }

      return res.status(201).json({
        success: true,
        beneficiary,
        verificationRequired: false,
        message:
          "Beneficiary added. Email OTP is unavailable, so beneficiary remains pending. Direct account transfer with MPIN is still available.",
      });
    }

    const code = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const otp = await Otp.create({
      userId: req.userId,
      purpose: "BENEFICIARY_VERIFY",
      codeHash: hashOtpCode(code),
      metadata: buildBeneficiaryOtpMetadata(beneficiary._id),
      expiresAt,
    });

    let sent = false;
    if (mailConfigured) {
      sent = await sendOtpEmail(req.user.email, code, req.user.firstName || "User", {
        purpose: "BENEFICIARY_VERIFY",
        accountNumber,
        name,
      });
    }

    if (sent) {
      return res.status(201).json({
        success: true,
        message: "Beneficiary added. OTP sent for verification.",
        beneficiary,
        verificationRequired,
      });
    }

    if (allowFallback) {
      const fallback = createFallbackOtpResponse({
        message: "Email OTP delivery is unavailable right now. Use the fallback OTP shown below to verify beneficiary.",
        code,
      });
      return res.status(201).json({
        success: true,
        message: fallback.message,
        beneficiary,
        verificationRequired,
        fallbackOtpMode: fallback.fallbackOtpMode,
        devOtpCode: fallback.devOtpCode,
      });
    }

    await Otp.findByIdAndDelete(otp._id);
    if (verificationRequired) {
      await Beneficiary.findByIdAndDelete(beneficiary._id);
      return res.status(500).json({
        success: false,
        message: `Unable to send beneficiary OTP email. ${getEmailFailureHint()}`,
      });
    }

    return res.status(201).json({
      success: true,
      beneficiary,
      verificationRequired: false,
      message:
        "Beneficiary added, but OTP email could not be delivered. You can continue direct transfer using account number + MPIN.",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.verifyBeneficiary = async (req, res) => {
  try {
    const beneficiaryId = String(req.body.beneficiaryId || "").trim();
    const normalizedCode = normalizeOtpCode(req.body.code);
    if (!mongoose.Types.ObjectId.isValid(beneficiaryId)) {
      return res.status(400).json({ success: false, message: "Invalid beneficiary reference." });
    }
    if (!isValidOtpCode(normalizedCode)) {
      return res.status(400).json({ success: false, message: "Enter valid 6-digit OTP." });
    }

    const ben = await Beneficiary.findOne({ _id: beneficiaryId, userId: req.userId });
    if (!ben) {
      return res.status(404).json({ success: false, message: "Beneficiary not found" });
    }

    const otp = await Otp.findOne({
      userId: req.userId,
      purpose: "BENEFICIARY_VERIFY",
      isUsed: false,
      expiresAt: { $gt: new Date() },
      ...buildBeneficiaryOtpMetadataMatch(beneficiaryId),
    }).sort({ createdAt: -1, _id: -1 });

    if (!otp) {
      return res.status(400).json({ success: false, message: "OTP invalid or expired" });
    }

    if (otp.codeHash !== hashOtpCode(normalizedCode)) {
      return res.status(400).json({ success: false, message: "Incorrect OTP" });
    }

    ben.verified = true;
    await ben.save();
    otp.isUsed = true;
    await otp.save();

    await Otp.updateMany(
      {
        userId: req.userId,
        purpose: "BENEFICIARY_VERIFY",
        isUsed: false,
        _id: { $ne: otp._id },
        ...buildBeneficiaryOtpMetadataMatch(beneficiaryId),
      },
      { $set: { isUsed: true } }
    );

    res.status(200).json({ success: true, message: "Beneficiary verified successfully", beneficiary: ben });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.resendBeneficiaryOtp = async (req, res) => {
  try {
    const beneficiaryId = String(req.params.beneficiaryId || "").trim();
    if (!mongoose.Types.ObjectId.isValid(beneficiaryId)) {
      return res.status(400).json({ success: false, message: "Invalid beneficiary reference." });
    }

    const mailConfigured = isEmailConfigured();
    const allowFallback = canUseBeneficiaryOtpFallback();
    const verificationRequired = isBeneficiaryVerificationMandatory();
    if (!mailConfigured && !allowFallback && verificationRequired) {
      return res.status(500).json({
        success: false,
        message: "Email service is not configured. Enable Nodemailer settings before beneficiary OTP flow.",
      });
    }

    const beneficiary = await Beneficiary.findOne({ _id: beneficiaryId, userId: req.userId });
    if (!beneficiary) {
      return res.status(404).json({ success: false, message: "Beneficiary not found" });
    }

    if (beneficiary.verified) {
      return res.status(200).json({
        success: true,
        message: "Beneficiary is already verified.",
        beneficiary,
      });
    }

    if (!mailConfigured && !allowFallback) {
      return res.status(200).json({
        success: true,
        verificationRequired: false,
        message:
          "OTP delivery is unavailable right now. Beneficiary remains pending, but direct transfer with account + MPIN is still available.",
      });
    }

    const existingOtp = await Otp.findOne({
      userId: req.userId,
      purpose: "BENEFICIARY_VERIFY",
      isUsed: false,
      expiresAt: { $gt: new Date() },
      ...buildBeneficiaryOtpMetadataMatch(beneficiary._id),
    }).sort({ createdAt: -1 });

    if (existingOtp) {
      const elapsedMs = Date.now() - new Date(existingOtp.createdAt).getTime();
      if (elapsedMs < 60 * 1000) {
        return res.status(200).json({
          success: true,
          message: "OTP already sent recently. Please check your email.",
        });
      }
      existingOtp.isUsed = true;
      await existingOtp.save();
    }

    const code = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const otp = await Otp.create({
      userId: req.userId,
      purpose: "BENEFICIARY_VERIFY",
      codeHash: hashOtpCode(code),
      metadata: buildBeneficiaryOtpMetadata(beneficiary._id),
      expiresAt,
    });

    let sent = false;
    if (mailConfigured) {
      sent = await sendOtpEmail(req.user.email, code, req.user.firstName || "User", {
        purpose: "BENEFICIARY_VERIFY",
        accountNumber: beneficiary.accountNumber,
        name: beneficiary.name,
      });
    }

    if (sent) {
      return res.status(200).json({
        success: true,
        message: "OTP sent to your registered email for beneficiary verification.",
      });
    }

    if (allowFallback) {
      const fallback = createFallbackOtpResponse({
        message: "Email OTP delivery is unavailable right now. Use the fallback OTP shown below to verify beneficiary.",
        code,
      });
      return res.status(200).json({
        success: true,
        message: fallback.message,
        fallbackOtpMode: fallback.fallbackOtpMode,
        devOtpCode: fallback.devOtpCode,
      });
    }

    await Otp.findByIdAndDelete(otp._id);
    return res.status(500).json({
      success: false,
      message: `Unable to send beneficiary OTP email. ${getEmailFailureHint()}`,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.removeBeneficiary = async (req, res) => {
  try {
    const beneficiaryId = String(req.params.beneficiaryId || "").trim();
    if (!mongoose.Types.ObjectId.isValid(beneficiaryId)) {
      return res.status(400).json({ success: false, message: "Invalid beneficiary reference." });
    }

    const beneficiary = await Beneficiary.findOne({ _id: beneficiaryId, userId: req.userId });
    if (!beneficiary) {
      return res.status(404).json({ success: false, message: "Beneficiary not found" });
    }

    await Beneficiary.deleteOne({ _id: beneficiary._id });
    await Otp.updateMany(
      {
        userId: req.userId,
        purpose: "BENEFICIARY_VERIFY",
        isUsed: false,
        ...buildBeneficiaryOtpMetadataMatch(beneficiary._id),
      },
      { $set: { isUsed: true } }
    );

    return res.status(200).json({
      success: true,
      message: "Beneficiary removed successfully.",
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
