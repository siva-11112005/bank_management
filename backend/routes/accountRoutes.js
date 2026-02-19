const express = require("express");
const router = express.Router();
const {
  createAccount,
  getMyAccount,
  getAccountById,
  getAllAccounts,
  updateAccountStatus,
} = require("../controllers/accountController");
const {
  deposit: depositTransaction,
  withdraw: withdrawTransaction,
} = require("../controllers/transactionController");
const { protect } = require("../middleware/authMiddleware");
const { adminOnly } = require("../middleware/roleMiddleware");
const { moneyOutLimiter } = require("../middleware/rateLimiters");
const validate = require("../middlewares/validate");
const { createAccountSchema, amountSchema, updateStatusSchema } = require("../validators/accountValidators");

// User routes
router.post("/create", protect, validate(createAccountSchema), createAccount);
router.get("/my-account", protect, getMyAccount);
router.post("/deposit", protect, moneyOutLimiter, validate(amountSchema), depositTransaction);
router.post("/withdraw", protect, moneyOutLimiter, validate(amountSchema), withdrawTransaction);

// Admin routes
router.get("/", protect, adminOnly, getAllAccounts);
router.get("/:accountId", protect, adminOnly, getAccountById);
router.put("/:accountId/status", protect, adminOnly, validate(updateStatusSchema), updateAccountStatus);

module.exports = router;
