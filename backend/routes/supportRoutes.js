const express = require("express");
const Joi = require("joi");
const {
  createSupportTicket,
  getMySupportTickets,
  closeMySupportTicket,
  getAllSupportTicketsAdmin,
  updateSupportTicketAdmin,
} = require("../controllers/supportController");
const { protect } = require("../middleware/authMiddleware");
const { adminOnly } = require("../middleware/roleMiddleware");
const validate = require("../middlewares/validate");

const router = express.Router();

const categoryValues = [
  "CONTACT_US",
  "SERVICE_REQUEST",
  "BRANCH_LOCATOR",
  "GRIEVANCE",
  "NRI_MAILBOX",
  "CALL_CHAT_LOCATE",
  "ACCOUNT",
  "CARD",
  "LOAN",
  "PAYMENT",
  "TECHNICAL",
  "OTHER",
];

const createTicketSchema = Joi.object({
  body: Joi.object({
    category: Joi.string()
      .valid(...categoryValues)
      .default("OTHER"),
    subject: Joi.string().trim().min(4).max(180).required(),
    description: Joi.string().trim().min(10).max(3000).required(),
    priority: Joi.string().valid("LOW", "MEDIUM", "HIGH").default("MEDIUM"),
  }),
});

const closeTicketSchema = Joi.object({
  params: Joi.object({
    ticketId: Joi.string().hex().length(24).required(),
  }),
});

const adminQuerySchema = Joi.object({
  query: Joi.object({
    status: Joi.string().valid("OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED").allow("").optional(),
    category: Joi.string()
      .valid(...categoryValues)
      .allow("")
      .optional(),
    priority: Joi.string().valid("LOW", "MEDIUM", "HIGH").allow("").optional(),
    q: Joi.string().trim().allow("").optional(),
  }),
});

const adminUpdateSchema = Joi.object({
  params: Joi.object({
    ticketId: Joi.string().hex().length(24).required(),
  }),
  body: Joi.object({
    status: Joi.string().valid("OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED").required(),
    adminNote: Joi.string().trim().allow("").max(2000).optional(),
  }),
});

router.get("/my-tickets", protect, getMySupportTickets);
router.post("/create", protect, validate(createTicketSchema), createSupportTicket);
router.put("/:ticketId/close", protect, validate(closeTicketSchema), closeMySupportTicket);

router.get("/admin/tickets", protect, adminOnly, validate(adminQuerySchema), getAllSupportTicketsAdmin);
router.put("/admin/tickets/:ticketId/status", protect, adminOnly, validate(adminUpdateSchema), updateSupportTicketAdmin);

module.exports = router;

