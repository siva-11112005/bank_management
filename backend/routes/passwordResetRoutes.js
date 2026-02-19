const express = require('express');
const router = express.Router();
const {
  forgotPassword,
  resetPassword,
  verifyResetToken,
} = require('../controllers/passwordResetController');
const validate = require('../middlewares/validate');
const { forgotPasswordSchema, resetPasswordSchema, verifyTokenSchema } = require('../validators/passwordValidators');
const { authLimiter, otpRequestLimiter } = require("../middleware/rateLimiters");

// Password reset routes
router.post('/forgot-password', otpRequestLimiter, validate(forgotPasswordSchema), forgotPassword);
router.post('/reset-password', authLimiter, validate(resetPasswordSchema), resetPassword);
router.post('/verify-reset-token', authLimiter, validate(verifyTokenSchema), verifyResetToken);

module.exports = router;
