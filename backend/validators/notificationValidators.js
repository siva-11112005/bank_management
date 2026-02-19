const Joi = require("joi");

const listNotificationsQuerySchema = Joi.object({
  query: Joi.object({
    status: Joi.string().valid("ALL", "UNREAD").default("ALL"),
    limit: Joi.number().integer().min(1).max(200).default(40),
    page: Joi.number().integer().min(1).default(1),
  }),
});

const notificationIdParamSchema = Joi.object({
  params: Joi.object({
    notificationId: Joi.string().hex().length(24).required(),
  }),
});

module.exports = {
  listNotificationsQuerySchema,
  notificationIdParamSchema,
};
