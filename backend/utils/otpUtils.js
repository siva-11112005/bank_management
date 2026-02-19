const crypto = require("crypto");

const normalizeOtpCode = (code = "") => String(code || "").trim().replace(/\D/g, "").slice(0, 6);

const isValidOtpCode = (code = "") => /^\d{6}$/.test(normalizeOtpCode(code));

const generateOtp = () => String(Math.floor(Math.random() * 1000000)).padStart(6, "0");

const hashOtpCode = (code) => crypto.createHash("sha256").update(normalizeOtpCode(code)).digest("hex");

module.exports = {
  generateOtp,
  normalizeOtpCode,
  isValidOtpCode,
  hashOtpCode,
};
