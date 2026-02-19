const Joi = require("joi");

const createOrderSchema = Joi.object({
  body: Joi.object({
    amount: Joi.number().positive().min(1).max(10000000).required(),
    currency: Joi.string().trim().uppercase().length(3).default("INR"),
    method: Joi.string().valid("UPI", "CARD", "NETBANKING", "WALLET", "IMPS", "NEFT", "RTGS", "OTHER").default("UPI"),
    description: Joi.string().trim().max(160).allow("").default("Account top-up"),
  }),
});

const verifyPaymentSchema = Joi.object({
  body: Joi.object({
    paymentId: Joi.string().required(),
    providerOrderId: Joi.string().required(),
    providerPaymentId: Joi.string().allow("").default(""),
    signature: Joi.string().allow("").default(""),
    status: Joi.string().valid("SUCCESS", "FAILED").default("SUCCESS"),
  }),
});

const markFailedSchema = Joi.object({
  params: Joi.object({
    paymentId: Joi.string().required(),
  }),
  body: Joi.object({
    reason: Joi.string().trim().max(200).allow("").default("Marked failed by user"),
  }),
});

const refundSchema = Joi.object({
  params: Joi.object({
    paymentId: Joi.string().required(),
  }),
  body: Joi.object({
    reason: Joi.string().trim().max(200).allow("").default("Refund by admin"),
  }),
});

const listPaymentsQuerySchema = Joi.object({
  query: Joi.object({
    status: Joi.string().valid("CREATED", "PENDING", "SUCCESS", "FAILED", "CANCELLED", "REFUNDED"),
    gateway: Joi.string().valid("MOCK", "RAZORPAY"),
    limit: Joi.number().integer().min(1).max(200).default(100),
  }),
});

const reviewQueueQuerySchema = Joi.object({
  query: Joi.object({
    limit: Joi.number().integer().min(1).max(200).default(100),
  }),
});

const resolveReviewSchema = Joi.object({
  params: Joi.object({
    paymentId: Joi.string().required(),
  }),
  body: Joi.object({
    resolutionNote: Joi.string().trim().max(240).allow("").default("Reviewed and resolved by admin"),
  }),
});

module.exports = {
  createOrderSchema,
  verifyPaymentSchema,
  markFailedSchema,
  refundSchema,
  listPaymentsQuerySchema,
  reviewQueueQuerySchema,
  resolveReviewSchema,
};
