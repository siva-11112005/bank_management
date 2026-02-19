const Notification = require("../models/Notification");

exports.getMyNotifications = async (req, res) => {
  try {
    const { status = "ALL", limit = 40, page = 1 } = req.query;
    const safeLimit = Math.min(Math.max(Number(limit) || 40, 1), 200);
    const safePage = Math.max(Number(page) || 1, 1);

    const filter = { userId: req.userId };
    if (String(status).toUpperCase() === "UNREAD") {
      filter.isRead = false;
    }

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit),
      Notification.countDocuments(filter),
      Notification.countDocuments({ userId: req.userId, isRead: false }),
    ]);

    return res.status(200).json({
      success: true,
      notifications,
      total,
      unreadCount,
      page: safePage,
      limit: safeLimit,
      hasMore: safePage * safeLimit < total,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getUnreadCount = async (req, res) => {
  try {
    const unreadCount = await Notification.countDocuments({ userId: req.userId, isRead: false });
    return res.status(200).json({
      success: true,
      unreadCount,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.markNotificationRead = async (req, res) => {
  try {
    const { notificationId } = req.params;

    const notification = await Notification.findOne({ _id: notificationId, userId: req.userId });
    if (!notification) {
      return res.status(404).json({ success: false, message: "Notification not found." });
    }

    if (!notification.isRead) {
      notification.isRead = true;
      notification.readAt = new Date();
      await notification.save();
    }

    return res.status(200).json({
      success: true,
      message: "Notification marked as read.",
      notification,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.markAllNotificationsRead = async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { userId: req.userId, isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );

    return res.status(200).json({
      success: true,
      message: "All notifications marked as read.",
      updatedCount: result.modifiedCount || 0,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const deleted = await Notification.findOneAndDelete({ _id: notificationId, userId: req.userId });

    if (!deleted) {
      return res.status(404).json({ success: false, message: "Notification not found." });
    }

    return res.status(200).json({
      success: true,
      message: "Notification removed successfully.",
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
