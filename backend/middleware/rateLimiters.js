const rateLimit = require("express-rate-limit");

const toPositiveNumber = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const buildLimiter = ({ windowMinutes, max, message, standardHeaders = true }) =>
  rateLimit({
    windowMs: toPositiveNumber(windowMinutes, 15) * 60 * 1000,
    max: toPositiveNumber(max, 100),
    standardHeaders,
    legacyHeaders: false,
    message: {
      success: false,
      message,
    },
  });

const apiLimiter = buildLimiter({
  windowMinutes: process.env.API_RATE_LIMIT_WINDOW_MINUTES || 15,
  max: process.env.API_RATE_LIMIT_MAX || 2000,
  message: "Too many API requests from this source. Please try again shortly.",
});

const authLimiter = buildLimiter({
  windowMinutes: process.env.AUTH_RATE_LIMIT_WINDOW_MINUTES || 15,
  max: process.env.AUTH_RATE_LIMIT_MAX || 150,
  message: "Too many authentication requests. Please try again later.",
});

const authLoginLimiter = buildLimiter({
  windowMinutes: process.env.AUTH_RATE_LIMIT_WINDOW_MINUTES || 15,
  max: process.env.LOGIN_RATE_LIMIT_MAX || 25,
  message: "Too many login attempts. Please wait before retrying.",
});

const authRegisterLimiter = buildLimiter({
  windowMinutes: process.env.AUTH_RATE_LIMIT_WINDOW_MINUTES || 15,
  max: process.env.REGISTER_RATE_LIMIT_MAX || 20,
  message: "Too many account registration attempts. Please try again later.",
});

const otpRequestLimiter = buildLimiter({
  windowMinutes: process.env.OTP_RATE_LIMIT_WINDOW_MINUTES || 15,
  max: process.env.OTP_RATE_LIMIT_MAX || 10,
  message: "Too many OTP requests. Please wait before requesting another OTP.",
});

const moneyOutLimiter = buildLimiter({
  windowMinutes: process.env.MONEY_OUT_RATE_LIMIT_WINDOW_MINUTES || 15,
  max: process.env.MONEY_OUT_RATE_LIMIT_MAX || 60,
  message: "Too many transfer or withdrawal requests. Please try again later.",
});

const paymentWriteLimiter = buildLimiter({
  windowMinutes: process.env.PAYMENT_WRITE_RATE_LIMIT_WINDOW_MINUTES || 15,
  max: process.env.PAYMENT_WRITE_RATE_LIMIT_MAX || 100,
  message: "Too many payment operation requests. Please retry shortly.",
});

module.exports = {
  apiLimiter,
  authLimiter,
  authLoginLimiter,
  authRegisterLimiter,
  otpRequestLimiter,
  moneyOutLimiter,
  paymentWriteLimiter,
};
