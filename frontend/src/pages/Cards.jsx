import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { applyCard, getMyCardRequests, getMyCards, requestCardAction } from "../services/api";
import "./Cards.css";

const cardTypes = ["DEBIT", "CREDIT", "FOREX", "PREPAID", "BUSINESS"];
const cardNetworks = ["VISA", "MASTERCARD", "RUPAY"];

const Cards = () => {
  const [cards, setCards] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submittingApply, setSubmittingApply] = useState(false);
  const [actionLoading, setActionLoading] = useState("");
  const [message, setMessage] = useState({ type: "", text: "" });
  const [applyForm, setApplyForm] = useState({
    cardType: "DEBIT",
    network: "VISA",
    variantName: "",
    reason: "",
  });
  const [actionDrafts, setActionDrafts] = useState({});

  const fetchCardData = async () => {
    try {
      const [cardsRes, requestsRes] = await Promise.all([getMyCards(), getMyCardRequests()]);
      if (cardsRes.data.success) setCards(cardsRes.data.cards || []);
      if (requestsRes.data.success) setRequests(requestsRes.data.requests || []);
    } catch (error) {
      setMessage({ type: "error", text: error.response?.data?.message || "Failed to fetch card data." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCardData();
  }, []);

  const handleApplyChange = (event) => {
    const { name, value } = event.target;
    setApplyForm((current) => ({ ...current, [name]: value }));
  };

  const handleApplyCard = async (event) => {
    event.preventDefault();
    setMessage({ type: "", text: "" });
    setSubmittingApply(true);
    try {
      const response = await applyCard(applyForm);
      if (response.data.success) {
        setMessage({ type: "success", text: response.data.message || "Card apply request submitted." });
        setApplyForm({ cardType: "DEBIT", network: "VISA", variantName: "", reason: "" });
        fetchCardData();
      }
    } catch (error) {
      setMessage({ type: "error", text: error.response?.data?.message || "Card application failed." });
    } finally {
      setSubmittingApply(false);
    }
  };

  const handleActionDraftChange = (cardId, field, value) => {
    setActionDrafts((current) => ({
      ...current,
      [cardId]: {
        ...(current[cardId] || {}),
        [field]: value,
      },
    }));
  };

  const submitCardAction = async (card, requestType) => {
    setActionLoading(`${requestType}-${card._id}`);
    setMessage({ type: "", text: "" });
    try {
      const draft = actionDrafts[card._id] || {};
      const payload = {
        requestType,
        reason: draft.reason || "",
      };

      if (requestType === "LIMIT_UPDATE") {
        if (draft.dailyLimit !== undefined && draft.dailyLimit !== "") payload.dailyLimit = Number(draft.dailyLimit);
        if (draft.contactlessLimit !== undefined && draft.contactlessLimit !== "") payload.contactlessLimit = Number(draft.contactlessLimit);
      }

      const response = await requestCardAction(card._id, payload);
      if (response.data.success) {
        setMessage({ type: "success", text: response.data.message || "Card action request submitted." });
        fetchCardData();
      }
    } catch (error) {
      setMessage({ type: "error", text: error.response?.data?.message || "Failed to submit card action request." });
    } finally {
      setActionLoading("");
    }
  };

  if (loading) {
    return (
      <div className="cards-page">
        <div className="cards-shell">
          <p>Loading card services...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="cards-page">
      <div className="cards-shell">
        <div className="cards-header">
          <div>
            <h1>Card Services</h1>
            <p>Apply and manage debit, credit, forex, prepaid, and business cards with secure request workflow.</p>
          </div>
          <Link to="/services/cards" className="cards-link-btn">
            Explore Card Products
          </Link>
        </div>

        {message.text ? (
          <div className={`cards-message ${message.type === "error" ? "error" : "success"}`}>{message.text}</div>
        ) : null}

        <section className="cards-panel">
          <h3>Apply for New Card</h3>
          <form className="cards-apply-form" onSubmit={handleApplyCard}>
            <select name="cardType" value={applyForm.cardType} onChange={handleApplyChange}>
              {cardTypes.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select name="network" value={applyForm.network} onChange={handleApplyChange}>
              {cardNetworks.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <input
              type="text"
              name="variantName"
              value={applyForm.variantName}
              onChange={handleApplyChange}
              placeholder="Variant (optional)"
            />
            <input
              type="text"
              name="reason"
              value={applyForm.reason}
              onChange={handleApplyChange}
              placeholder="Reason (optional)"
            />
            <button type="submit" disabled={submittingApply}>
              {submittingApply ? "Submitting..." : "Submit Request"}
            </button>
          </form>
        </section>

        <section className="cards-panel">
          <h3>My Cards</h3>
          {cards.length === 0 ? (
            <p className="cards-empty-copy">No active cards yet. Submit a card application request.</p>
          ) : (
            <div className="cards-grid">
              {cards.map((card) => {
                const draft = actionDrafts[card._id] || {};
                return (
                  <article key={card._id} className="card-item">
                    <div className="card-item-head">
                      <h4>{card.cardType} Card</h4>
                      <span className={`card-status ${String(card.status || "").toLowerCase()}`}>{card.status}</span>
                    </div>
                    <p>{card.network} {card.variantName ? `| ${card.variantName}` : ""}</p>
                    <p>Number: {card.cardNumberMasked}</p>
                    <p>Expiry: {String(card.expiryMonth).padStart(2, "0")}/{card.expiryYear}</p>
                    <p>Daily Limit: Rs {Number(card.dailyLimit || 0).toFixed(2)}</p>
                    <p>Contactless Limit: Rs {Number(card.contactlessLimit || 0).toFixed(2)}</p>
                    <div className="card-action-form">
                      <input
                        type="text"
                        placeholder="Reason (optional)"
                        value={draft.reason || ""}
                        onChange={(event) => handleActionDraftChange(card._id, "reason", event.target.value)}
                      />
                      <div className="card-action-row">
                        {card.status === "ACTIVE" ? (
                          <button
                            type="button"
                            onClick={() => submitCardAction(card, "BLOCK")}
                            disabled={actionLoading === `BLOCK-${card._id}`}
                          >
                            {actionLoading === `BLOCK-${card._id}` ? "Submitting..." : "Block"}
                          </button>
                        ) : null}
                        {card.status === "BLOCKED" ? (
                          <button
                            type="button"
                            onClick={() => submitCardAction(card, "UNBLOCK")}
                            disabled={actionLoading === `UNBLOCK-${card._id}`}
                          >
                            {actionLoading === `UNBLOCK-${card._id}` ? "Submitting..." : "Unblock"}
                          </button>
                        ) : null}
                        {card.status !== "CLOSED" ? (
                          <>
                            <button
                              type="button"
                              onClick={() => submitCardAction(card, "REISSUE")}
                              disabled={actionLoading === `REISSUE-${card._id}`}
                            >
                              {actionLoading === `REISSUE-${card._id}` ? "Submitting..." : "Reissue"}
                            </button>
                            <button
                              type="button"
                              onClick={() => submitCardAction(card, "PIN_RESET")}
                              disabled={actionLoading === `PIN_RESET-${card._id}`}
                            >
                              {actionLoading === `PIN_RESET-${card._id}` ? "Submitting..." : "PIN Reset"}
                            </button>
                          </>
                        ) : null}
                      </div>
                      {card.status !== "CLOSED" ? (
                        <div className="card-limit-row">
                          <input
                            type="number"
                            placeholder="Daily limit"
                            value={draft.dailyLimit || ""}
                            onChange={(event) => handleActionDraftChange(card._id, "dailyLimit", event.target.value)}
                          />
                          <input
                            type="number"
                            placeholder="Contactless"
                            value={draft.contactlessLimit || ""}
                            onChange={(event) => handleActionDraftChange(card._id, "contactlessLimit", event.target.value)}
                          />
                          <button
                            type="button"
                            onClick={() => submitCardAction(card, "LIMIT_UPDATE")}
                            disabled={actionLoading === `LIMIT_UPDATE-${card._id}`}
                          >
                            {actionLoading === `LIMIT_UPDATE-${card._id}` ? "Submitting..." : "Update Limits"}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="cards-panel">
          <h3>Card Request History</h3>
          {requests.length === 0 ? (
            <p className="cards-empty-copy">No card requests yet.</p>
          ) : (
            <div className="cards-table-wrap">
              <table className="cards-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Card</th>
                    <th>Status</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((request) => (
                    <tr key={request._id}>
                      <td>{new Date(request.createdAt).toLocaleString("en-IN")}</td>
                      <td>{request.requestType}</td>
                      <td>{request.cardType || request.cardId?.cardType || "-"}</td>
                      <td>
                        <span className={`request-status ${String(request.status || "").toLowerCase()}`}>{request.status}</span>
                      </td>
                      <td>{request.adminNote || request.reason || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default Cards;
