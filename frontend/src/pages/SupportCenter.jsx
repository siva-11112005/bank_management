import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { closeMySupportTicket, createSupportTicket, getMySupportTickets } from "../services/api";
import "./SupportCenter.css";

const categoryOptions = [
  { value: "CONTACT_US", label: "Contact Us" },
  { value: "SERVICE_REQUEST", label: "Service Request" },
  { value: "BRANCH_LOCATOR", label: "Branch / ATM" },
  { value: "GRIEVANCE", label: "Grievance" },
  { value: "NRI_MAILBOX", label: "NRI Mailbox" },
  { value: "CALL_CHAT_LOCATE", label: "Call / Chat / Locate" },
  { value: "ACCOUNT", label: "Account" },
  { value: "CARD", label: "Card" },
  { value: "LOAN", label: "Loan" },
  { value: "PAYMENT", label: "Payment" },
  { value: "TECHNICAL", label: "Technical" },
  { value: "OTHER", label: "Other" },
];

const topicToCategory = {
  "contact-us": "CONTACT_US",
  "service-requests": "SERVICE_REQUEST",
  "branch-locator": "BRANCH_LOCATOR",
  "grievance-redressal": "GRIEVANCE",
  "nri-mailbox": "NRI_MAILBOX",
  "call-chat-locate": "CALL_CHAT_LOCATE",
};

const statusClass = {
  OPEN: "open",
  IN_PROGRESS: "in-progress",
  RESOLVED: "resolved",
  CLOSED: "closed",
};

const toTitleFromSlug = (value = "") =>
  String(value)
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const SupportCenter = () => {
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [closingTicketId, setClosingTicketId] = useState("");
  const [tickets, setTickets] = useState([]);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [formData, setFormData] = useState({
    category: "SERVICE_REQUEST",
    priority: "MEDIUM",
    subject: "",
    description: "",
  });
  const [serviceContext, setServiceContext] = useState(null);

  const openTickets = useMemo(() => tickets.filter((entry) => entry.status === "OPEN" || entry.status === "IN_PROGRESS").length, [tickets]);

  useEffect(() => {
    fetchTickets();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const topic = String(params.get("topic") || "").trim().toLowerCase();
    const serviceCategory = String(params.get("serviceCategory") || "").trim();
    const serviceSlug = String(params.get("serviceSlug") || "").trim();
    const serviceNameRaw = String(params.get("serviceName") || "").trim();
    const serviceName = serviceNameRaw || toTitleFromSlug(serviceSlug);

    if (topic && topicToCategory[topic]) {
      setFormData((current) => ({
        ...current,
        category: topicToCategory[topic],
      }));
    }

    if (serviceCategory || serviceSlug || serviceName) {
      const defaultSubject = `Request: ${serviceName || "Banking Service"}`;
      const defaultDescription = `Please process my request for ${serviceName || "this service"}${
        serviceCategory ? ` under ${toTitleFromSlug(serviceCategory)}` : ""
      }.`;
      setServiceContext({
        serviceCategory,
        serviceSlug,
        serviceName: serviceName || "Banking Service",
      });
      setFormData((current) => ({
        ...current,
        category: "SERVICE_REQUEST",
        subject: current.subject || defaultSubject,
        description: current.description || defaultDescription,
      }));
    } else {
      setServiceContext(null);
    }
  }, [location.search]);

  const fetchTickets = async () => {
    try {
      const response = await getMySupportTickets();
      if (response.data.success) {
        setTickets(response.data.tickets || []);
      }
    } catch (error) {
      setMessage({ type: "error", text: error.response?.data?.message || "Unable to fetch support tickets." });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const handleCreateTicket = async (event) => {
    event.preventDefault();
    setMessage({ type: "", text: "" });
    setSubmitting(true);
    try {
      const contextPrefix = serviceContext
        ? [
            `[Service Category] ${serviceContext.serviceCategory || "-"}`,
            `[Service Name] ${serviceContext.serviceName || "-"}`,
            `[Service Slug] ${serviceContext.serviceSlug || "-"}`,
          ].join("\n")
        : "";
      const response = await createSupportTicket({
        category: formData.category,
        priority: formData.priority,
        subject: String(formData.subject || "").trim(),
        description: [contextPrefix, String(formData.description || "").trim()].filter(Boolean).join("\n\n"),
      });
      if (response.data.success) {
        setMessage({ type: "success", text: response.data.message || "Support ticket created successfully." });
        setFormData((current) => ({ ...current, subject: "", description: "" }));
        fetchTickets();
      }
    } catch (error) {
      setMessage({ type: "error", text: error.response?.data?.message || "Unable to create support ticket." });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseTicket = async (ticketId) => {
    setClosingTicketId(ticketId);
    setMessage({ type: "", text: "" });
    try {
      const response = await closeMySupportTicket(ticketId);
      if (response.data.success) {
        setMessage({ type: "success", text: response.data.message || "Support ticket closed." });
        fetchTickets();
      }
    } catch (error) {
      setMessage({ type: "error", text: error.response?.data?.message || "Unable to close support ticket." });
    } finally {
      setClosingTicketId("");
    }
  };

  if (loading) {
    return (
      <div className="support-center-page">
        <div className="support-center-shell">
          <p>Loading support center...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="support-center-page">
      <div className="support-center-shell">
        <section className="support-head-card">
          <h1>Support Center</h1>
          <p>Raise service requests, track ticket status, and close requests once resolved.</p>
          <div className="support-head-meta">
            <span>Total Tickets: {tickets.length}</span>
            <span>Open Tickets: {openTickets}</span>
          </div>
        </section>

        {serviceContext ? (
          <section className="support-context-card">
            <h2>Service Request Context</h2>
            <p>
              You are raising a request for <strong>{serviceContext.serviceName}</strong>.
            </p>
            <div className="support-context-meta">
              {serviceContext.serviceCategory ? <span>Category: {toTitleFromSlug(serviceContext.serviceCategory)}</span> : null}
              {serviceContext.serviceSlug ? <span>Code: {serviceContext.serviceSlug}</span> : null}
            </div>
          </section>
        ) : null}

        {message.text && <div className={`support-message ${message.type === "error" ? "error" : "success"}`}>{message.text}</div>}

        <section className="support-create-card">
          <h2>Create Support Request</h2>
          <form onSubmit={handleCreateTicket}>
            <div className="support-form-grid">
              <label>
                Category
                <select name="category" value={formData.category} onChange={handleChange}>
                  {categoryOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Priority
                <select name="priority" value={formData.priority} onChange={handleChange}>
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                </select>
              </label>
            </div>
            <label>
              Subject
              <input
                type="text"
                name="subject"
                value={formData.subject}
                onChange={handleChange}
                placeholder="Example: Unable to update mobile number"
                minLength={4}
                maxLength={180}
                required
              />
            </label>
            <label>
              Description
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                placeholder="Describe your issue in detail"
                minLength={10}
                maxLength={3000}
                rows={4}
                required
              />
            </label>
            <button type="submit" disabled={submitting}>
              {submitting ? "Submitting..." : "Submit Request"}
            </button>
          </form>
        </section>

        <section className="support-list-card">
          <h2>My Support Tickets</h2>
          <div className="support-ticket-list">
            {tickets.length === 0 ? (
              <p className="support-empty-copy">No tickets yet. Create your first support request above.</p>
            ) : (
              tickets.map((ticket) => (
                <article key={ticket._id} className="support-ticket-item">
                  <div className="support-ticket-head">
                    <h3>{ticket.subject}</h3>
                    <span className={`support-status ${statusClass[ticket.status] || "open"}`}>{ticket.status}</span>
                  </div>
                  <p className="support-ticket-meta">
                    {ticket.ticketNumber} | {ticket.category} | Priority: {ticket.priority}
                  </p>
                  <p>{ticket.description}</p>
                  {ticket.adminNote ? <p className="support-admin-note">Admin Note: {ticket.adminNote}</p> : null}
                  <div className="support-ticket-foot">
                    <small>Updated: {new Date(ticket.updatedAt).toLocaleString("en-IN")}</small>
                    {(ticket.status === "OPEN" || ticket.status === "IN_PROGRESS") && (
                      <button type="button" onClick={() => handleCloseTicket(ticket._id)} disabled={closingTicketId === ticket._id}>
                        {closingTicketId === ticket._id ? "Closing..." : "Close Ticket"}
                      </button>
                    )}
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default SupportCenter;
