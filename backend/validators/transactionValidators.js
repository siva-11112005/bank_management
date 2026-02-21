const Joi = require("joi");

const accountNumberSchema = Joi.string()
  .trim()
  .uppercase()
  .pattern(/^[A-Z0-9]{6,32}$/)
  .messages({
    "string.pattern.base": "Account number must be 6-32 characters and contain only letters and digits.",
  });

const depositWithdrawSchema = Joi.object({
  body: Joi.object({
    amount: Joi.number().min(1).precision(2).required(),
    description: Joi.string().max(240).allow("").optional(),
    transactionPin: Joi.string().pattern(/^\d{4}$/).optional(),
  }),
});

const transferSchema = Joi.object({
  body: Joi.object({
    recipientAccountNumber: accountNumberSchema.required(),
    amount: Joi.number().min(1).precision(2).required(),
    description: Joi.string().trim().max(240).allow("").optional(),
    transactionPin: Joi.string().pattern(/^\d{4}$/).required(),
    otpSessionId: Joi.string().hex().length(24).optional(),
    otpCode: Joi.string().pattern(/^\d{6}$/).optional(),
  })
    .with("otpSessionId", "otpCode")
    .with("otpCode", "otpSessionId"),
});

const requestTransferOtpSchema = Joi.object({
  body: Joi.object({
    recipientAccountNumber: accountNumberSchema.required(),
    amount: Joi.number().min(1).precision(2).required(),
  }),
});

const resolveRecipientSchema = Joi.object({
  body: Joi.object({
    accountNumber: accountNumberSchema.required(),
  }),
});

const createStandingInstructionSchema = Joi.object({
  body: Joi.object({
    recipientAccountNumber: accountNumberSchema.required(),
    amount: Joi.number().min(1).precision(2).required(),
    frequency: Joi.string().valid("DAILY", "WEEKLY", "MONTHLY").required(),
    description: Joi.string().allow("").max(240).optional(),
    startDate: Joi.date().iso().optional(),
    maxExecutions: Joi.number().integer().min(1).max(10).optional(),
    transactionPin: Joi.string().pattern(/^\d{4}$/).required(),
  }),
});

const instructionIdParamSchema = Joi.object({
  params: Joi.object({
    instructionId: Joi.string().hex().length(24).required(),
  }),
});

const updateStandingInstructionStatusSchema = Joi.object({
  params: Joi.object({
    instructionId: Joi.string().hex().length(24).required(),
  }),
  body: Joi.object({
    active: Joi.boolean().required(),
  }),
});

const executeStandingInstructionNowSchema = Joi.object({
  params: Joi.object({
    instructionId: Joi.string().hex().length(24).required(),
  }),
  body: Joi.object({
    transactionPin: Joi.string().pattern(/^\d{4}$/).required(),
  }),
});

const extendStandingInstructionSchema = Joi.object({
  params: Joi.object({
    instructionId: Joi.string().hex().length(24).required(),
  }),
  body: Joi.object({
    additionalExecutions: Joi.number().integer().min(1).max(10).required(),
    mpin: Joi.string().pattern(/^\d{4}$/).required(),
  }),
});

module.exports = {
  depositWithdrawSchema,
  transferSchema,
  requestTransferOtpSchema,
  resolveRecipientSchema,
  createStandingInstructionSchema,
  instructionIdParamSchema,
  updateStandingInstructionStatusSchema,
  executeStandingInstructionNowSchema,
  extendStandingInstructionSchema,
};
