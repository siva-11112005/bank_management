const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const { adminOnly } = require("../middleware/roleMiddleware");
const validate = require("../middlewares/validate");
const { paymentWriteLimiter } = require("../middleware/rateLimiters");
const {
  createOrderSchema,
  verifyPaymentSchema,
  markFailedSchema,
  refundSchema,
  listPaymentsQuerySchema,
  reviewQueueQuerySchema,
  resolveReviewSchema,
} = require("../validators/paymentValidators");
const {
  createOrder,
  verifyPayment,
  markFailed,
  getMyPayments,
  getAllPayments,
  refundPayment,
  handleGatewayWebhook,
  getPaymentReviewQueue,
  resolvePaymentReview,
} = require("../controllers/paymentController");

// Gateway webhook route (public, signature-verified)
router.post("/webhook", handleGatewayWebhook);

// User payment routes
router.post("/create-order", protect, paymentWriteLimiter, validate(createOrderSchema), createOrder);
router.post("/verify", protect, paymentWriteLimiter, validate(verifyPaymentSchema), verifyPayment);
router.post("/:paymentId/fail", protect, paymentWriteLimiter, validate(markFailedSchema), markFailed);
router.get("/my-payments", protect, getMyPayments);

// Admin payment routes
router.get("/", protect, adminOnly, validate(listPaymentsQuerySchema), getAllPayments);
router.get("/review-queue", protect, adminOnly, validate(reviewQueueQuerySchema), getPaymentReviewQueue);
router.put("/:paymentId/review-resolve", protect, adminOnly, paymentWriteLimiter, validate(resolveReviewSchema), resolvePaymentReview);
router.put("/:paymentId/refund", protect, adminOnly, paymentWriteLimiter, validate(refundSchema), refundPayment);

module.exports = router;
