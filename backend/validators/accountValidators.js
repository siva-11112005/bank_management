const Joi = require("joi");

const createAccountSchema = Joi.object({
  body: Joi.object({
    accountType: Joi.string().valid("SAVINGS", "CHECKING", "BUSINESS").required(),
    branch: Joi.string().trim().required(),
    ifscCode: Joi.string().trim().min(6).required(),
  }),
});

const amountSchema = Joi.object({
  body: Joi.object({
    amount: Joi.number().positive().required(),
    description: Joi.string().allow("").optional(),
    transactionPin: Joi.string().pattern(/^\d{4}$/).optional(),
  }),
});

const updateStatusSchema = Joi.object({
  params: Joi.object({ accountId: Joi.string().hex().length(24).required() }),
  body: Joi.object({ status: Joi.string().valid("ACTIVE", "INACTIVE", "FROZEN", "CLOSED").required() }),
});

module.exports = {
  createAccountSchema,
  amountSchema,
  updateStatusSchema,
};
