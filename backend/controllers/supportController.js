const SupportTicket = require("../models/SupportTicket");
const AuditLog = require("../models/AuditLog");
const { createNotification } = require("../utils/notificationService");

const buildSearchRegex = (value = "") => {
  const escaped = String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped, "i");
};

const toCategoryLabel = (value = "OTHER") =>
  String(value)
    .split("_")
    .map((token) => token.charAt(0) + token.slice(1).toLowerCase())
    .join(" ");

exports.createSupportTicket = async (req, res) => {
  try {
    const { category, subject, description, priority } = req.body;

    const ticket = await SupportTicket.create({
      userId: req.userId,
      category,
      subject,
      description,
      priority,
      status: "OPEN",
      lastUpdatedByRole: "USER",
    });

    try {
      await createNotification({
        userId: req.userId,
        title: "Support Ticket Created",
        message: `Ticket ${ticket.ticketNumber} was created successfully. Our team will update you soon.`,
        category: "SUPPORT",
        type: "INFO",
        actionLink: "/support",
        metadata: { ticketId: ticket._id, ticketNumber: ticket.ticketNumber },
      });
    } catch (_) {}

    try {
      await AuditLog.create({
        userId: req.userId,
        action: "SUPPORT_TICKET_CREATED",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || "",
        metadata: {
          ticketId: ticket._id,
          ticketNumber: ticket.ticketNumber,
          category: ticket.category,
          priority: ticket.priority,
        },
      });
    } catch (_) {}

    return res.status(201).json({
      success: true,
      message: `Support request created successfully (${ticket.ticketNumber}).`,
      ticket,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getMySupportTickets = async (req, res) => {
  try {
    const tickets = await SupportTicket.find({ userId: req.userId }).sort({ updatedAt: -1 });
    return res.status(200).json({
      success: true,
      totalTickets: tickets.length,
      tickets,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.closeMySupportTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const ticket = await SupportTicket.findOne({ _id: ticketId, userId: req.userId });
    if (!ticket) {
      return res.status(404).json({ success: false, message: "Support ticket not found." });
    }

    if (ticket.status === "CLOSED") {
      return res.status(200).json({ success: true, message: "Ticket already closed.", ticket });
    }

    ticket.status = "CLOSED";
    ticket.closedAt = new Date();
    ticket.lastUpdatedByRole = "USER";
    await ticket.save();

    try {
      await createNotification({
        userId: req.userId,
        title: "Support Ticket Closed",
        message: `Ticket ${ticket.ticketNumber} has been closed by you.`,
        category: "SUPPORT",
        type: "SUCCESS",
        actionLink: "/support",
        metadata: { ticketId: ticket._id, ticketNumber: ticket.ticketNumber },
      });
    } catch (_) {}

    try {
      await AuditLog.create({
        userId: req.userId,
        action: "SUPPORT_TICKET_CLOSED_BY_USER",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || "",
        metadata: {
          ticketId: ticket._id,
          ticketNumber: ticket.ticketNumber,
        },
      });
    } catch (_) {}

    return res.status(200).json({
      success: true,
      message: "Support ticket closed.",
      ticket,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAllSupportTicketsAdmin = async (req, res) => {
  try {
    const { status = "", category = "", priority = "", q = "" } = req.query;
    const filter = {};

    if (status) filter.status = status;
    if (category) filter.category = category;
    if (priority) filter.priority = priority;
    if (q) {
      const regex = buildSearchRegex(q);
      filter.$or = [{ ticketNumber: regex }, { subject: regex }, { description: regex }];
    }

    const tickets = await SupportTicket.find(filter).populate("userId", "firstName lastName email phone").sort({ updatedAt: -1 });
    return res.status(200).json({
      success: true,
      totalTickets: tickets.length,
      tickets,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateSupportTicketAdmin = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { status, adminNote = "" } = req.body;

    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) {
      return res.status(404).json({ success: false, message: "Support ticket not found." });
    }

    const previousStatus = ticket.status;
    if (status) ticket.status = status;
    ticket.adminNote = String(adminNote || "").trim();
    ticket.lastUpdatedByRole = "ADMIN";
    if (status === "CLOSED" || status === "RESOLVED") {
      ticket.closedAt = ticket.closedAt || new Date();
    } else {
      ticket.closedAt = null;
    }
    await ticket.save();

    try {
      await createNotification({
        userId: ticket.userId,
        title: "Support Ticket Updated",
        message: `Ticket ${ticket.ticketNumber} status is now ${ticket.status}.${ticket.adminNote ? " Note: " + ticket.adminNote : ""}`,
        category: "SUPPORT",
        type: ticket.status === "RESOLVED" || ticket.status === "CLOSED" ? "SUCCESS" : "INFO",
        actionLink: "/support",
        metadata: { ticketId: ticket._id, ticketNumber: ticket.ticketNumber, status: ticket.status },
      });
    } catch (_) {}

    try {
      await AuditLog.create({
        userId: req.userId,
        action: "ADMIN_SUPPORT_TICKET_UPDATED",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || "",
        metadata: {
          ticketId: ticket._id,
          ticketNumber: ticket.ticketNumber,
          previousStatus,
          nextStatus: ticket.status,
          category: ticket.category,
          categoryLabel: toCategoryLabel(ticket.category),
        },
      });
    } catch (_) {}

    return res.status(200).json({
      success: true,
      message: "Support ticket updated successfully.",
      ticket,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
