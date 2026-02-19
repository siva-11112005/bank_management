import React, { useEffect, useState } from "react";
import { getProfile, setTransactionPin } from "../services/api";
import { useAuth } from "../context/AuthContext";
import "./TransactionSecurity.css";

const TransactionSecurity = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [hasPin, setHasPin] = useState(false);
  const [pinUpdatedAt, setPinUpdatedAt] = useState(null);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [formData, setFormData] = useState({
    currentPin: "",
    pin: "",
    confirmPin: "",
  });

  const fetchSecurityState = async () => {
    try {
      const response = await getProfile();
      if (response.data.success) {
        setHasPin(Boolean(response.data.user?.hasTransactionPin));
        setPinUpdatedAt(response.data.user?.transactionPinUpdatedAt || null);
      }
    } catch (_) {
      setMessage({ type: "error", text: "Unable to load security details." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSecurityState();
  }, []);

  const handleChange = (event) => {
    const { name, value } = event.target;
    if (!/^\d*$/.test(value)) return;
    if (value.length > 4) return;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage({ type: "", text: "" });

    if (formData.pin.length !== 4 || formData.confirmPin.length !== 4) {
      setMessage({ type: "error", text: "PIN must be exactly 4 digits." });
      return;
    }

    if (formData.pin !== formData.confirmPin) {
      setMessage({ type: "error", text: "PIN and confirm PIN do not match." });
      return;
    }

    setSubmitting(true);
    try {
      const response = await setTransactionPin({
        currentPin: formData.currentPin,
        pin: formData.pin,
        confirmPin: formData.confirmPin,
      });
      if (response.data.success) {
        setMessage({ type: "success", text: response.data.message || "Transaction PIN saved." });
        setFormData({ currentPin: "", pin: "", confirmPin: "" });
        setHasPin(true);
        setPinUpdatedAt(response.data.transactionPinUpdatedAt || new Date().toISOString());
      }
    } catch (error) {
      setMessage({ type: "error", text: error.response?.data?.message || "Failed to update transaction PIN." });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="transaction-security-container">
        <p>Loading transaction security...</p>
      </div>
    );
  }

  return (
    <div className="transaction-security-container">
      <header className="transaction-security-head">
        <div>
          <h1>Transaction PIN Security</h1>
          <p>Secure every money transfer with your private 4-digit PIN, similar to UPI payment flow.</p>
        </div>
      </header>

      {message.text && <div className={`transaction-security-message ${message.type}`}>{message.text}</div>}

      <section className="transaction-security-grid">
        <article className="transaction-security-card">
          <h2>Security Status</h2>
          <div className="transaction-security-status">
            <span className={`security-status-pill ${hasPin ? "active" : "inactive"}`}>
              {hasPin ? "PIN Active" : "PIN Not Set"}
            </span>
            <p>User: {user?.firstName} {user?.lastName}</p>
            <p>Phone: {user?.phone}</p>
            {pinUpdatedAt && <p>Last Updated: {new Date(pinUpdatedAt).toLocaleString("en-IN")}</p>}
          </div>
          <ul className="transaction-security-points">
            <li>PIN is stored as encrypted hash in backend storage.</li>
            <li>Wrong PIN attempts are monitored with temporary lock.</li>
            <li>Never share this PIN over call, message, or email.</li>
          </ul>
        </article>

        <article className="transaction-security-card">
          <h2>{hasPin ? "Reset Transaction PIN" : "Set Transaction PIN"}</h2>
          <form onSubmit={handleSubmit} className="transaction-security-form">
            {hasPin && (
              <div className="form-group">
                <label>Current PIN</label>
                <input
                  type="password"
                  name="currentPin"
                  value={formData.currentPin}
                  onChange={handleChange}
                  placeholder="Enter current PIN"
                  maxLength={4}
                  required
                />
              </div>
            )}

            <div className="form-group">
              <label>New 4-Digit PIN</label>
              <input
                type="password"
                name="pin"
                value={formData.pin}
                onChange={handleChange}
                placeholder="Enter new PIN"
                maxLength={4}
                required
              />
            </div>

            <div className="form-group">
              <label>Confirm PIN</label>
              <input
                type="password"
                name="confirmPin"
                value={formData.confirmPin}
                onChange={handleChange}
                placeholder="Re-enter PIN"
                maxLength={4}
                required
              />
            </div>

            <button type="submit" className="transaction-security-btn" disabled={submitting}>
              {submitting ? "Saving..." : hasPin ? "Update PIN" : "Set PIN"}
            </button>
          </form>
        </article>
      </section>
    </div>
  );
};

export default TransactionSecurity;
