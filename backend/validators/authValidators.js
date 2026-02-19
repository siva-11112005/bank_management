const Joi = require("joi");

const registerSchema = Joi.object({
  body: Joi.object({
    firstName: Joi.string().trim().min(2).required(),
    lastName: Joi.string().trim().min(2).required(),
    email: Joi.string().email().required(),
    phone: Joi.string().trim().min(7).required(),
    password: Joi.string().min(6).required(),
    confirmPassword: Joi.string().valid(Joi.ref("password")).required(),
    aadhar: Joi.string().trim().min(6).required(),
    address: Joi.string().trim().min(6).required(),
  }),
});

const loginSchema = Joi.object({
  body: Joi.object({
    email: Joi.string().trim().min(4).required(),
    password: Joi.string().min(6).required(),
  }),
});

const updateProfileSchema = Joi.object({
  body: Joi.object({
    otpSessionId: Joi.string().trim().hex().length(24).required(),
    otpCode: Joi.string().trim().pattern(/^\d{6}$/).required(),
  }),
});

const requestProfileUpdateOtpSchema = Joi.object({
  body: Joi.object({
    firstName: Joi.string().trim().min(2),
    lastName: Joi.string().trim().min(2),
    email: Joi.string().trim().email(),
    phone: Joi.string().trim().min(7),
    address: Joi.string().trim().allow(""),
  }).min(1),
});

const transactionPinSchema = Joi.object({
  body: Joi.object({
    currentPin: Joi.string().pattern(/^\d{4}$/).allow("").default(""),
    pin: Joi.string().pattern(/^\d{4}$/).required(),
    confirmPin: Joi.string().valid(Joi.ref("pin")).required(),
  }),
});

const nomineeUpsertSchema = Joi.object({
  body: Joi.object({
    fullName: Joi.string().trim().min(2).required(),
    relationship: Joi.string().trim().min(2).required(),
    dateOfBirth: Joi.date().iso().max("now").required().messages({
      "date.max": "Date of birth cannot be in the future.",
    }),
    phone: Joi.string().trim().min(7).required(),
    email: Joi.string().trim().email().allow(""),
    address: Joi.string().trim().allow(""),
    allocationPercentage: Joi.number().integer().min(1).max(100).default(100),
    isMinor: Joi.boolean().default(false),
    guardianName: Joi.string().trim().when("isMinor", {
      is: true,
      then: Joi.string().trim().min(2).required().messages({
        "any.required": "Guardian name is required for minor nominee.",
        "string.empty": "Guardian name is required for minor nominee.",
      }),
      otherwise: Joi.string().trim().allow(""),
    }),
    guardianRelationship: Joi.string().trim().allow(""),
  }),
});

module.exports = {
  registerSchema,
  loginSchema,
  updateProfileSchema,
  requestProfileUpdateOtpSchema,
  transactionPinSchema,
  nomineeUpsertSchema,
};
