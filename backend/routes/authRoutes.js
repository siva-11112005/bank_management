const express = require("express");
const router = express.Router();
const {
  register,
  login,
  getProfile,
  updateProfile,
  requestProfileUpdateOtp,
  logout,
  refresh,
  setTransactionPin,
  getNominee,
  upsertNominee,
  deleteNominee,
} = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");
const {
  authLimiter,
  authLoginLimiter,
  authRegisterLimiter,
  otpRequestLimiter,
} = require("../middleware/rateLimiters");
const validate = require("../middlewares/validate");
const {
  registerSchema,
  loginSchema,
  updateProfileSchema,
  requestProfileUpdateOtpSchema,
  transactionPinSchema,
  nomineeUpsertSchema,
} = require("../validators/authValidators");

// Public routes
router.post("/register", authRegisterLimiter, validate(registerSchema), register);
router.post("/login", authLoginLimiter, validate(loginSchema), login);

// Protected routes
router.get("/profile", protect, getProfile);
router.post("/profile/request-otp", protect, otpRequestLimiter, validate(requestProfileUpdateOtpSchema), requestProfileUpdateOtp);
router.put("/profile", protect, validate(updateProfileSchema), updateProfile);
router.put("/transaction-pin", protect, validate(transactionPinSchema), setTransactionPin);
router.get("/nominee", protect, getNominee);
router.put("/nominee", protect, validate(nomineeUpsertSchema), upsertNominee);
router.delete("/nominee", protect, deleteNominee);
router.post("/logout", protect, authLimiter, logout);
router.post("/refresh", authLimiter, refresh);

module.exports = router;
