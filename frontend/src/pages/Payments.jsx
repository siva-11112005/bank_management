import React, { useEffect, useMemo, useState } from "react";
import {
  createPaymentOrder,
  getMyPayments,
  markPaymentFailed,
  verifyPayment,
} from "../services/api";
import "./Payments.css";

const methodOptions = ["UPI", "CARD", "NETBANKING", "WALLET", "IMPS", "NEFT", "RTGS", "OTHER"];

const Payments = () => {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [payments, setPayments] = useState([]);
  const [currentOrder, setCurrentOrder] = useState(null);
  const [gatewayInfo, setGatewayInfo] = useState({ gatewayMode: "MOCK", razorpayKeyId: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({
    amount: "",
    currency: "INR",
    method: "UPI",
    description: "Account top-up",
  });
  const [verifyForm, setVerifyForm] = useState({
    providerPaymentId: "",
    signature: "",
  });

  useEffect(() => {
    fetchPayments();
  }, []);

  const fetchPayments = async () => {
    try {
      const response = await getMyPayments();
      if (response.data.success) {
        setPayments(response.data.payments || []);
      }
    } catch (apiError) {
      setError(apiError.response?.data?.message || "Unable to fetch payments");
    } finally {
      setLoading(false);
    }
  };

  const paymentSummary = useMemo(() => {
    const successAmount = payments.filter((entry) => entry.status === "SUCCESS").reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    const refundAmount = payments.filter((entry) => entry.status === "REFUNDED").reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    return { total: payments.length, successAmount, refundAmount };
  }, [payments]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const handleCreateOrder = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    setError("");
    try {
      const payload = {
        ...formData,
        amount: Number(formData.amount),
      };
      const response = await createPaymentOrder(payload);
      if (response.data.success) {
        setCurrentOrder(response.data.payment);
        setGatewayInfo(response.data.config || { gatewayMode: "MOCK", razorpayKeyId: "" });
        setMessage("Payment order created successfully.");
        fetchPayments();
      }
    } catch (apiError) {
      setError(apiError.response?.data?.message || "Payment order failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify = async (options = {}) => {
    if (!currentOrder?.id) return;
    setVerifying(true);
    setMessage("");
    setError("");
    try {
      const providerPaymentId = options.providerPaymentId || verifyForm.providerPaymentId || `mock_pay_${Date.now()}`;
      const signature = options.signature || verifyForm.signature || (gatewayInfo.gatewayMode === "MOCK" ? "mock_signature" : "");
      const status = options.status || "SUCCESS";
      const response = await verifyPayment({
        paymentId: currentOrder.id,
        providerOrderId: currentOrder.providerOrderId,
        providerPaymentId,
        signature,
        status,
      });
      if (response.data.success) {
        setMessage(response.data.message || "Payment verified.");
        setCurrentOrder((current) => (current ? { ...current, status: response.data.payment?.status || "SUCCESS" } : current));
        setVerifyForm({ providerPaymentId: "", signature: "" });
        fetchPayments();
      }
    } catch (apiError) {
      setError(apiError.response?.data?.message || "Payment verification failed");
    } finally {
      setVerifying(false);
    }
  };

  const handleMarkFailed = async () => {
    if (!currentOrder?.id) return;
    setVerifying(true);
    setMessage("");
    setError("");
    try {
      const response = await markPaymentFailed(currentOrder.id, "Marked failed from user panel");
      if (response.data.success) {
        setMessage("Payment marked as failed.");
        setCurrentOrder((current) => (current ? { ...current, status: "FAILED" } : current));
        fetchPayments();
      }
    } catch (apiError) {
      setError(apiError.response?.data?.message || "Unable to mark payment failed");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="payments-container">
      <div className="payments-head">
        <h1>Payment Integration</h1>
        <p>Create payment orders, verify settlements, and view gateway-linked payment history.</p>
      </div>

      {message && <div className="payment-alert success">{message}</div>}
      {error && <div className="payment-alert error">{error}</div>}

      <div className="payment-summary-grid">
        <article className="payment-summary-card">
          <h3>Total Payment Records</h3>
          <p>{paymentSummary.total}</p>
        </article>
        <article className="payment-summary-card">
          <h3>Successful Credits</h3>
          <p>Rs {paymentSummary.successAmount.toFixed(2)}</p>
        </article>
        <article className="payment-summary-card">
          <h3>Refunded Amount</h3>
          <p>Rs {paymentSummary.refundAmount.toFixed(2)}</p>
        </article>
      </div>

      <div className="payment-layout">
        <section className="payment-card">
          <h2>Create Payment Order</h2>
          <form onSubmit={handleCreateOrder} className="payment-form">
            <div className="form-group">
              <label>Amount (Rs)</label>
              <input type="number" name="amount" min="1" step="1" value={formData.amount} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label>Currency</label>
              <input type="text" name="currency" value={formData.currency} onChange={handleChange} maxLength={3} required />
            </div>
            <div className="form-group">
              <label>Payment Method</label>
              <select name="method" value={formData.method} onChange={handleChange}>
                {methodOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Description</label>
              <input type="text" name="description" value={formData.description} onChange={handleChange} maxLength={160} />
            </div>
            <button type="submit" className="payment-btn primary" disabled={submitting}>
              {submitting ? "Creating..." : "Create Order"}
            </button>
          </form>
        </section>

        <section className="payment-card">
          <h2>Verify and Settle</h2>
          {currentOrder ? (
            <>
              <div className="order-info">
                <p>
                  <strong>Order:</strong> {currentOrder.providerOrderId}
                </p>
                <p>
                  <strong>Amount:</strong> Rs {Number(currentOrder.amount || 0).toFixed(2)}
                </p>
                <p>
                  <strong>Gateway:</strong> {gatewayInfo.gatewayMode}
                </p>
                <p>
                  <strong>Status:</strong> {currentOrder.status}
                </p>
              </div>

              {gatewayInfo.gatewayMode === "MOCK" ? (
                <div className="payment-inline-actions">
                  <button type="button" className="payment-btn primary" onClick={() => handleVerify()} disabled={verifying}>
                    {verifying ? "Processing..." : "Simulate Success"}
                  </button>
                  <button type="button" className="payment-btn danger" onClick={handleMarkFailed} disabled={verifying}>
                    Mark Failed
                  </button>
                </div>
              ) : (
                <div className="payment-form">
                  <div className="form-group">
                    <label>Gateway Payment ID</label>
                    <input
                      type="text"
                      value={verifyForm.providerPaymentId}
                      onChange={(event) => setVerifyForm((current) => ({ ...current, providerPaymentId: event.target.value }))}
                      placeholder="pay_xxxxxxxx"
                    />
                  </div>
                  <div className="form-group">
                    <label>Gateway Signature</label>
                    <input
                      type="text"
                      value={verifyForm.signature}
                      onChange={(event) => setVerifyForm((current) => ({ ...current, signature: event.target.value }))}
                      placeholder="signature from gateway"
                    />
                  </div>
                  <button type="button" className="payment-btn primary" onClick={() => handleVerify()} disabled={verifying}>
                    {verifying ? "Verifying..." : "Verify Payment"}
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="empty-copy">Create an order first to continue payment settlement.</p>
          )}
        </section>
      </div>

      <section className="payment-card payment-history">
        <h2>Payment History</h2>
        {loading ? (
          <p className="empty-copy">Loading payments...</p>
        ) : payments.length === 0 ? (
          <p className="empty-copy">No payment records found.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Order</th>
                  <th>Gateway</th>
                  <th>Method</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((entry) => (
                  <tr key={entry._id}>
                    <td>{new Date(entry.createdAt).toLocaleString("en-IN")}</td>
                    <td className="mono">{entry.providerOrderId}</td>
                    <td>{entry.gateway}</td>
                    <td>{entry.method}</td>
                    <td>Rs {Number(entry.amount || 0).toFixed(2)}</td>
                    <td>
                      <span className={`payment-status ${entry.status.toLowerCase()}`}>{entry.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

export default Payments;
