import React, { useEffect, useState } from "react";
import { getMyKycRequests, getMyKycStatus, submitKyc } from "../services/api";
import "./KycCenter.css";

const idProofOptions = ["AADHAAR", "PASSPORT", "DRIVING_LICENSE", "VOTER_ID", "OTHER"];
const addressProofOptions = ["AADHAAR", "PASSPORT", "UTILITY_BILL", "RENT_AGREEMENT", "OTHER"];

const KycCenter = () => {
  const [statusData, setStatusData] = useState({
    kycStatus: "NOT_SUBMITTED",
    kycReviewNote: "",
    kycReviewedAt: "",
  });
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [formData, setFormData] = useState({
    panNumber: "",
    occupation: "",
    incomeRange: "",
    idProofType: "AADHAAR",
    idProofNumber: "",
    addressProofType: "AADHAAR",
    addressProofNumber: "",
    notes: "",
  });

  const fetchKycData = async () => {
    try {
      const [statusRes, requestsRes] = await Promise.all([getMyKycStatus(), getMyKycRequests()]);
      if (statusRes.data.success) {
        setStatusData({
          kycStatus: statusRes.data.kycStatus || "NOT_SUBMITTED",
          kycReviewNote: statusRes.data.kycReviewNote || "",
          kycReviewedAt: statusRes.data.kycReviewedAt || "",
        });
      }
      if (requestsRes.data.success) {
        setRequests(requestsRes.data.requests || []);
      }
    } catch (error) {
      setMessage({ type: "error", text: error.response?.data?.message || "Unable to load KYC details." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKycData();
  }, []);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: name === "panNumber" ? value.toUpperCase() : value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage({ type: "", text: "" });
    setSubmitting(true);
    try {
      const response = await submitKyc(formData);
      if (response.data.success) {
        setMessage({ type: "success", text: response.data.message || "KYC submitted successfully." });
        fetchKycData();
      }
    } catch (error) {
      setMessage({ type: "error", text: error.response?.data?.message || "KYC submission failed." });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="kyc-page">
        <div className="kyc-shell">
          <p>Loading KYC information...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="kyc-page">
      <div className="kyc-shell">
        <div className="kyc-status-card">
          <h1>KYC Center</h1>
          <p>Submit and track your Know Your Customer compliance details.</p>
          <div className="kyc-status-row">
            <span className={`kyc-status-pill ${String(statusData.kycStatus || "").toLowerCase()}`}>{statusData.kycStatus}</span>
            {statusData.kycReviewedAt ? <span>Reviewed: {new Date(statusData.kycReviewedAt).toLocaleString("en-IN")}</span> : null}
          </div>
          {statusData.kycReviewNote ? <p className="kyc-note-copy">Review Note: {statusData.kycReviewNote}</p> : null}
        </div>

        {message.text ? <div className={`kyc-message ${message.type === "error" ? "error" : "success"}`}>{message.text}</div> : null}

        <section className="kyc-panel">
          <h3>Submit KYC Details</h3>
          <form className="kyc-form-grid" onSubmit={handleSubmit}>
            <input type="text" name="panNumber" value={formData.panNumber} onChange={handleChange} placeholder="PAN Number" required />
            <input type="text" name="occupation" value={formData.occupation} onChange={handleChange} placeholder="Occupation" required />
            <input type="text" name="incomeRange" value={formData.incomeRange} onChange={handleChange} placeholder="Income Range" required />
            <select name="idProofType" value={formData.idProofType} onChange={handleChange}>
              {idProofOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <input
              type="text"
              name="idProofNumber"
              value={formData.idProofNumber}
              onChange={handleChange}
              placeholder="ID Proof Number"
              required
            />
            <select name="addressProofType" value={formData.addressProofType} onChange={handleChange}>
              {addressProofOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <input
              type="text"
              name="addressProofNumber"
              value={formData.addressProofNumber}
              onChange={handleChange}
              placeholder="Address Proof Number"
              required
            />
            <input type="text" name="notes" value={formData.notes} onChange={handleChange} placeholder="Notes (optional)" />
            <button type="submit" disabled={submitting}>
              {submitting ? "Submitting..." : "Submit KYC"}
            </button>
          </form>
        </section>

        <section className="kyc-panel">
          <h3>KYC Request History</h3>
          {requests.length === 0 ? (
            <p className="kyc-empty-copy">No KYC requests yet.</p>
          ) : (
            <div className="kyc-table-wrap">
              <table className="kyc-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>PAN</th>
                    <th>Occupation</th>
                    <th>Status</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((request) => (
                    <tr key={request._id}>
                      <td>{new Date(request.createdAt).toLocaleString("en-IN")}</td>
                      <td>{request.panNumber}</td>
                      <td>{request.occupation}</td>
                      <td>
                        <span className={`kyc-status-pill ${String(request.status || "").toLowerCase()}`}>{request.status}</span>
                      </td>
                      <td>{request.adminNote || request.notes || "-"}</td>
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

export default KycCenter;
