const Joi = require("joi");

const approvalStatusValues = ["PENDING", "EXECUTED", "REJECTED", "FAILED"];
const approvalActionValues = [
  "PAYMENT_REFUND",
  "LOAN_STATUS_UPDATE",
  "ACCOUNT_STATUS_UPDATE",
  "TRANSFER_EXECUTION",
  "SIP_PLAN_CREATION",
  "FD_BOOKING_CREATE",
  "RD_CREATION",
  "GL_MANUAL_JOURNAL",
  "MONEY_OUT_POLICY_UPDATE",
  "REGULATORY_POLICY_UPDATE",
  "TREASURY_SNAPSHOT_CREATE",
  "REGULATORY_REPORT_PUBLISH",
  "REGULATORY_ALERT_RESOLVE",
];
const approvalTargetValues = [
  "PAYMENT",
  "LOAN",
  "ACCOUNT",
  "TRANSFER",
  "SIP_PLAN",
  "GL_JOURNAL",
  "SYSTEM_POLICY",
  "TREASURY_SNAPSHOT",
  "REGULATORY_REPORT",
  "REGULATORY_ALERT",
];

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

const moneyOutPolicyUpdateSchema = Joi.object({
  body: Joi.object({
    maxSingleTransfer: Joi.number().positive().optional(),
    dailyTransferLimit: Joi.number().positive().optional(),
    highValueTransferThreshold: Joi.number().positive().optional(),
    requireTransferOtpForHighValue: Joi.boolean().optional(),
    maxSingleWithdrawal: Joi.number().positive().optional(),
    dailyWithdrawalLimit: Joi.number().positive().optional(),
    enforceBeneficiary: Joi.boolean().optional(),
    allowDirectTransferWithPin: Joi.boolean().optional(),
    changeNote: Joi.string().trim().max(240).allow("").default(""),
  })
    .or(
      "maxSingleTransfer",
      "dailyTransferLimit",
      "highValueTransferThreshold",
      "requireTransferOtpForHighValue",
      "maxSingleWithdrawal",
      "dailyWithdrawalLimit",
      "enforceBeneficiary",
      "allowDirectTransferWithPin"
    )
    .required(),
});

const regulatoryPolicyUpdateSchema = Joi.object({
  body: Joi.object({
    ctrCashThreshold: Joi.number().positive().optional(),
    minLcrRatio: Joi.number().min(0).optional(),
    maxLoanToDepositRatio: Joi.number().min(0).optional(),
    openStrAlertThreshold: Joi.number().min(0).optional(),
    criticalStrAlertThreshold: Joi.number().min(0).optional(),
    changeNote: Joi.string().trim().max(240).allow("").default(""),
  })
    .or(
      "ctrCashThreshold",
      "minLcrRatio",
      "maxLoanToDepositRatio",
      "openStrAlertThreshold",
      "criticalStrAlertThreshold"
    )
    .required(),
});

module.exports = {
  approvalRequestsQuerySchema,
  approvalDecisionSchema,
  approvalEscalationSchema,
  approvalEscalationBulkSchema,
  moneyOutPolicyUpdateSchema,
  regulatoryPolicyUpdateSchema,
};
