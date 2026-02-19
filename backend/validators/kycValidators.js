const Joi = require("joi");

const submitKycSchema = Joi.object({
  body: Joi.object({
    panNumber: Joi.string().trim().uppercase().pattern(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/).required(),
    occupation: Joi.string().trim().min(2).max(120).required(),
    incomeRange: Joi.string().trim().min(2).max(80).required(),
    idProofType: Joi.string().valid("AADHAAR", "PASSPORT", "DRIVING_LICENSE", "VOTER_ID", "OTHER").required(),
    idProofNumber: Joi.string().trim().min(4).max(40).required(),
    addressProofType: Joi.string().valid("AADHAAR", "PASSPORT", "UTILITY_BILL", "RENT_AGREEMENT", "OTHER").required(),
    addressProofNumber: Joi.string().trim().min(4).max(40).required(),
    notes: Joi.string().trim().allow("").max(500).optional(),
  }),
});

const adminKycQuerySchema = Joi.object({
  query: Joi.object({
    status: Joi.string().valid("PENDING", "APPROVED", "REJECTED").allow("").optional(),
    limit: Joi.number().integer().min(1).max(500).optional(),
  }),
});

const resolveKycSchema = Joi.object({
  params: Joi.object({
    requestId: Joi.string().hex().length(24).required(),
  }),
  body: Joi.object({
    decision: Joi.string().valid("APPROVE", "REJECT").required(),
    adminNote: Joi.string().trim().allow("").max(500).optional(),
  }),
});

module.exports = {
  submitKycSchema,
  adminKycQuerySchema,
  resolveKycSchema,
};
