const Joi = require("joi");

const cardTypeValues = ["DEBIT", "CREDIT", "FOREX", "PREPAID", "BUSINESS"];
const cardNetworkValues = ["VISA", "MASTERCARD", "RUPAY"];
const requestTypeValues = ["BLOCK", "UNBLOCK", "REISSUE", "PIN_RESET", "LIMIT_UPDATE"];

const applyCardSchema = Joi.object({
  body: Joi.object({
    cardType: Joi.string()
      .valid(...cardTypeValues)
      .required(),
    network: Joi.string()
      .valid(...cardNetworkValues)
      .default("VISA"),
    variantName: Joi.string().trim().allow("").max(80).optional(),
    reason: Joi.string().trim().allow("").max(320).optional(),
  }),
});

const cardIdParamSchema = Joi.object({
  params: Joi.object({
    cardId: Joi.string().hex().length(24).required(),
  }),
});

const requestCardActionSchema = Joi.object({
  params: Joi.object({
    cardId: Joi.string().hex().length(24).required(),
  }),
  body: Joi.object({
    requestType: Joi.string()
      .valid(...requestTypeValues)
      .required(),
    reason: Joi.string().trim().allow("").max(320).optional(),
    dailyLimit: Joi.number().min(0).max(2000000).optional(),
    contactlessLimit: Joi.number().min(0).max(200000).optional(),
  }),
});

const adminCardRequestQuerySchema = Joi.object({
  query: Joi.object({
    status: Joi.string().valid("PENDING", "COMPLETED", "REJECTED").allow("").optional(),
    requestType: Joi.string()
      .valid("APPLY", ...requestTypeValues)
      .allow("")
      .optional(),
    limit: Joi.number().integer().min(1).max(500).optional(),
  }),
});

const adminResolveCardRequestSchema = Joi.object({
  params: Joi.object({
    requestId: Joi.string().hex().length(24).required(),
  }),
  body: Joi.object({
    decision: Joi.string().valid("APPROVE", "REJECT").required(),
    adminNote: Joi.string().trim().allow("").max(320).optional(),
  }),
});

module.exports = {
  applyCardSchema,
  cardIdParamSchema,
  requestCardActionSchema,
  adminCardRequestQuerySchema,
  adminResolveCardRequestSchema,
};
