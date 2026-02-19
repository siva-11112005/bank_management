const Joi = require("joi");

const depositWithdrawSchema = Joi.object({
  body: Joi.object({
    amount: Joi.number().positive().required(),
    description: Joi.string().allow("").optional(),
    transactionPin: Joi.string().pattern(/^\d{4}$/).optional(),
  }),
});

const transferSchema = Joi.object({
  body: Joi.object({
    recipientAccountNumber: Joi.string().trim().required(),
    amount: Joi.number().positive().required(),
    description: Joi.string().allow("").optional(),
    transactionPin: Joi.string().pattern(/^\d{4}$/).required(),
    otpSessionId: Joi.string().hex().length(24).optional(),
    otpCode: Joi.string().pattern(/^\d{6}$/).optional(),
  }),
});

const requestTransferOtpSchema = Joi.object({
  body: Joi.object({
    recipientAccountNumber: Joi.string().trim().required(),
    amount: Joi.number().positive().required(),
  }),
});

const resolveRecipientSchema = Joi.object({
  body: Joi.object({
    accountNumber: Joi.string().trim().min(6).required(),
  }),
});

const createStandingInstructionSchema = Joi.object({
  body: Joi.object({
    recipientAccountNumber: Joi.string().trim().min(6).required(),
    amount: Joi.number().positive().required(),
    frequency: Joi.string().valid("DAILY", "WEEKLY", "MONTHLY").required(),
    description: Joi.string().allow("").max(240).optional(),
    startDate: Joi.date().iso().optional(),
    maxExecutions: Joi.number().integer().min(0).max(1000).optional(),
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
