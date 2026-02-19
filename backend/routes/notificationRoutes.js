const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const validate = require("../middlewares/validate");
const {
  getMyNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
} = require("../controllers/notificationController");
const { listNotificationsQuerySchema, notificationIdParamSchema } = require("../validators/notificationValidators");

const router = express.Router();

router.get("/my", protect, validate(listNotificationsQuerySchema), getMyNotifications);
router.get("/unread-count", protect, getUnreadCount);
router.put("/mark-all-read", protect, markAllNotificationsRead);
router.put("/:notificationId/read", protect, validate(notificationIdParamSchema), markNotificationRead);
router.delete("/:notificationId", protect, validate(notificationIdParamSchema), deleteNotification);

module.exports = router;
