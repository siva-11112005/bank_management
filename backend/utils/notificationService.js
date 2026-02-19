const Notification = require("../models/Notification");

const createNotification = async ({
  userId,
  title,
  message,
  category = "GENERAL",
  type = "INFO",
  actionLink = "",
  metadata = {},
}) => {
  if (!userId || !title || !message) {
    return null;
  }

  return Notification.create({
    userId,
    title: String(title).trim(),
    message: String(message).trim(),
    category,
    type,
    actionLink: String(actionLink || "").trim(),
    metadata,
  });
};

const createNotifications = async (items = []) => {
  const prepared = (Array.isArray(items) ? items : []).filter((item) => item?.userId && item?.title && item?.message);
  if (!prepared.length) return [];

  return Notification.insertMany(
    prepared.map((item) => ({
      userId: item.userId,
      title: String(item.title).trim(),
      message: String(item.message).trim(),
      category: item.category || "GENERAL",
      type: item.type || "INFO",
      actionLink: String(item.actionLink || "").trim(),
      metadata: item.metadata || {},
    }))
  );
};

module.exports = {
  createNotification,
  createNotifications,
};
