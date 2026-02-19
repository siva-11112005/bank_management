const Joi = require("joi");

const applyLoanSchema = Joi.object({
  body: Joi.object({
    loanType: Joi.string()
      .valid(
        "PERSONAL",
        "HOME",
        "VEHICLE",
        "EDUCATION",
        "CAR",
        "BUSINESS",
        "TRACTOR",
        "CONSUMER_DURABLE",
        "TWO_WHEELER",
        "HORTICULTURE",
        "ALLIED_ACTIVITIES",
        "WORKING_CAPITAL"
      )
      .required(),
    amount: Joi.number().positive().min(10000).max(50000000).required(),
    tenure: Joi.number().integer().min(6).max(360).required(),
  }),
});

const payLoanSchema = Joi.object({
  params: Joi.object({
    loanId: Joi.string().required(),
  }),
  body: Joi.object({
    amount: Joi.number().positive().optional(),
    transactionPin: Joi.string().pattern(/^\d{4}$/).required(),
  }),
});

const updateLoanStatusSchema = Joi.object({
  params: Joi.object({
    loanId: Joi.string().required(),
  }),
  body: Joi.object({
    status: Joi.string().valid("APPROVED", "REJECTED", "CLOSED").required(),
  }),
});

module.exports = {
  applyLoanSchema,
  payLoanSchema,
  updateLoanStatusSchema,
};
