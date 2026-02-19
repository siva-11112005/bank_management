const express = require("express");
const router = express.Router();
const {
  applyLoan,
  getMyLoans,
  payLoanEmi,
  getAllLoans,
  updateLoanStatus,
} = require("../controllers/loanController");
const { protect } = require("../middleware/authMiddleware");
const { adminOnly } = require("../middleware/roleMiddleware");
const { moneyOutLimiter } = require("../middleware/rateLimiters");
const validate = require("../middlewares/validate");
const { applyLoanSchema, payLoanSchema, updateLoanStatusSchema } = require("../validators/loanValidators");

// User routes
router.post("/apply", protect, moneyOutLimiter, validate(applyLoanSchema), applyLoan);
router.get("/my-loans", protect, getMyLoans);
router.post("/:loanId/pay", protect, moneyOutLimiter, validate(payLoanSchema), payLoanEmi);

// Admin routes
router.get("/", protect, adminOnly, getAllLoans);
router.put("/:loanId/status", protect, adminOnly, validate(updateLoanStatusSchema), updateLoanStatus);

module.exports = router;
