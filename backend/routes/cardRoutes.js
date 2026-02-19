const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { adminOnly } = require("../middleware/roleMiddleware");
const validate = require("../middlewares/validate");
const {
  getMyCards,
  getMyCardRequests,
  applyCard,
  requestCardAction,
  getAllCardRequestsAdmin,
  resolveCardRequestAdmin,
} = require("../controllers/cardController");
const {
  applyCardSchema,
  requestCardActionSchema,
  adminCardRequestQuerySchema,
  adminResolveCardRequestSchema,
} = require("../validators/cardValidators");

const router = express.Router();

router.get("/my", protect, getMyCards);
router.get("/my-requests", protect, getMyCardRequests);
router.post("/apply", protect, validate(applyCardSchema), applyCard);
router.post("/:cardId/request-action", protect, validate(requestCardActionSchema), requestCardAction);

router.get("/admin/requests", protect, adminOnly, validate(adminCardRequestQuerySchema), getAllCardRequestsAdmin);
router.put("/admin/requests/:requestId/resolve", protect, adminOnly, validate(adminResolveCardRequestSchema), resolveCardRequestAdmin);

module.exports = router;
