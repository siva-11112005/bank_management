const express = require("express");
const router = express.Router();
const {
  getMyTransactions,
  getAllTransactions,
  getSecurityRules,
  deposit,
  withdraw,
  transfer,
  resolveRecipient,
  requestTransferOtp,
  listStandingInstructions,
  createStandingInstruction,
  updateStandingInstructionStatus,
  executeStandingInstructionNow,
  deleteStandingInstruction,
  extendStandingInstruction,
} = require("../controllers/transactionController");
const { protect } = require("../middleware/authMiddleware");
const { adminOnly } = require("../middleware/roleMiddleware");
const { moneyOutLimiter, otpRequestLimiter } = require("../middleware/rateLimiters");
const {
  depositWithdrawSchema,
  transferSchema,
  resolveRecipientSchema,
  requestTransferOtpSchema,
  createStandingInstructionSchema,
  instructionIdParamSchema,
  updateStandingInstructionStatusSchema,
  executeStandingInstructionNowSchema,
  extendStandingInstructionSchema,
} = require("../validators/transactionValidators");
const Joi = require("joi");
const validate = require("../middlewares/validate");

const statementParams = Joi.object({
  params: Joi.object({
    year: Joi.string().regex(/^\d{4}$/).required(),
    month: Joi.string().regex(/^(0?[1-9]|1[0-2])$/).required(),
  }),
});

// User routes
router.get("/my-transactions", protect, getMyTransactions);
router.get("/security-rules", protect, getSecurityRules);
router.get("/statement/:year/:month", protect, validate(statementParams), require("../controllers/transactionController").getMonthlyStatementPdf);
router.post("/deposit", protect, moneyOutLimiter, validate(depositWithdrawSchema), deposit);
router.post("/withdraw", protect, moneyOutLimiter, validate(depositWithdrawSchema), withdraw);
router.post("/resolve-recipient", protect, validate(resolveRecipientSchema), resolveRecipient);
router.post("/request-transfer-otp", protect, otpRequestLimiter, validate(requestTransferOtpSchema), requestTransferOtp);
router.post("/transfer", protect, moneyOutLimiter, validate(transferSchema), transfer);
router.get("/standing-instructions", protect, listStandingInstructions);
router.post(
  "/standing-instructions",
  protect,
  moneyOutLimiter,
  validate(createStandingInstructionSchema),
  createStandingInstruction
);
router.put(
  "/standing-instructions/:instructionId/status",
  protect,
  validate(updateStandingInstructionStatusSchema),
  updateStandingInstructionStatus
);
router.post(
  "/standing-instructions/:instructionId/execute-now",
  protect,
  moneyOutLimiter,
  validate(executeStandingInstructionNowSchema),
  executeStandingInstructionNow
);
router.delete(
  "/standing-instructions/:instructionId",
  protect,
  validate(instructionIdParamSchema),
  deleteStandingInstruction
);
router.post(
  "/standing-instructions/:instructionId/extend",
  protect,
  validate(extendStandingInstructionSchema),
  extendStandingInstruction
);

// Admin routes
router.get("/", protect, adminOnly, getAllTransactions);

module.exports = router;
