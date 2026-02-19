const Joi = require("joi");

const approvalStatusValues = ["PENDING", "EXECUTED", "REJECTED", "FAILED"];
const approvalActionValues = ["PAYMENT_REFUND", "LOAN_STATUS_UPDATE", "ACCOUNT_STATUS_UPDATE"];
const approvalTargetValues = ["PAYMENT", "LOAN", "ACCOUNT"];

const approvalRequestsQuerySchema = Joi.object({
  query: Joi.object({
    limit: Joi.number().integer().min(1).max(10000).default(100),
    page: Joi.number().integer().min(1).default(1),
    status: Joi.string()
      .trim()
      .uppercase()
      .valid(...approvalStatusValues)
      .allow(""),
    actionType: Joi.string()
      .trim()
      .uppercase()
      .valid(...approvalActionValues)
      .allow(""),
    targetType: Joi.string()
      .trim()
      .uppercase()
      .valid(...approvalTargetValues)
      .allow(""),
    overdueOnly: Joi.boolean().default(false),
    escalatedOnly: Joi.boolean().default(false),
    requestedBy: Joi.string().trim().hex().length(24).allow(""),
    reviewedBy: Joi.string().trim().hex().length(24).allow(""),
  }),
});

const approvalDecisionSchema = Joi.object({
  params: Joi.object({
    approvalId: Joi.string().trim().hex().length(24).required(),
  }),
  body: Joi.object({
    reviewNote: Joi.string().trim().max(240).allow("").default(""),
  }),
});

const approvalEscalationSchema = Joi.object({
  params: Joi.object({
    approvalId: Joi.string().trim().hex().length(24).required(),
  }),
  body: Joi.object({
    escalationNote: Joi.string().trim().max(240).allow("").default("Escalated by admin"),
  }),
});

const approvalEscalationBulkSchema = Joi.object({
  body: Joi.object({
    escalationNote: Joi.string().trim().max(240).allow("").default("Escalated due to pending SLA breach"),
    limit: Joi.number().integer().min(1).max(500).default(200),
  }),
});

module.exports = {
  approvalRequestsQuerySchema,
  approvalDecisionSchema,
  approvalEscalationSchema,
  approvalEscalationBulkSchema,
};
