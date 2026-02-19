const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { adminOnly } = require("../middleware/roleMiddleware");
const validate = require("../middlewares/validate");
const {
  submitKyc,
  getMyKycRequests,
  getMyKycStatus,
  getAllKycRequestsAdmin,
  resolveKycRequestAdmin,
} = require("../controllers/kycController");
const { submitKycSchema, adminKycQuerySchema, resolveKycSchema } = require("../validators/kycValidators");

const router = express.Router();

router.get("/my-status", protect, getMyKycStatus);
router.get("/my-requests", protect, getMyKycRequests);
router.post("/submit", protect, validate(submitKycSchema), submitKyc);

router.get("/admin/requests", protect, adminOnly, validate(adminKycQuerySchema), getAllKycRequestsAdmin);
router.put("/admin/requests/:requestId/resolve", protect, adminOnly, validate(resolveKycSchema), resolveKycRequestAdmin);

module.exports = router;
