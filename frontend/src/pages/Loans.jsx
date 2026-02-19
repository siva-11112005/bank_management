import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { applyLoan, getMyLoans, getProfile, payLoanEmi } from "../services/api";
import "./Loans.css";

const loanProducts = [
  {
    type: "PERSONAL",
    title: "Personal Loan",
    info: "Collateral-free personal loan approvals with quick disbursal.",
    points: ["Interest: ~12% p.a.", "Tenure: 6-60 months", "No collateral", "Fast approval"],
    defaultAmount: 200000,
    defaultTenure: 24,
    interestRate: 12,
  },
  {
    type: "HOME",
    title: "Home Loan",
    info: "Structured home loan options with long tenure and balance transfer.",
    points: ["Interest: ~8% p.a.", "Tenure: 120-360 months", "Higher limits", "Tax support"],
    defaultAmount: 2500000,
    defaultTenure: 180,
    interestRate: 8,
  },
  {
    type: "CAR",
    title: "Car Loan",
    info: "New and used car financing with digital eligibility checks.",
    points: ["Interest: ~10% p.a.", "Tenure: 12-84 months", "Quick sanction", "Dealer support"],
    defaultAmount: 650000,
    defaultTenure: 60,
    interestRate: 10,
  },
  {
    type: "BUSINESS",
    title: "Business Loan",
    info: "Funding support for MSME growth and working capital needs.",
    points: ["Interest: ~11% p.a.", "Tenure: 12-120 months", "Business growth credit", "Minimal paperwork"],
    defaultAmount: 1200000,
    defaultTenure: 72,
    interestRate: 11,
  },
  {
    type: "TRACTOR",
    title: "Tractor Loan",
    info: "Agri-focused tractor financing with dealer network and flexible tenure.",
    points: ["Interest: ~9% p.a.", "Tenure: 12-84 months", "Agri support", "Flexible repayment"],
    defaultAmount: 700000,
    defaultTenure: 60,
    interestRate: 9,
  },
  {
    type: "CONSUMER_DURABLE",
    title: "Consumer Durable Loan",
    info: "Short-tenure financing for eligible consumer durable purchases.",
    points: ["Interest: ~13% p.a.", "Tenure: 6-36 months", "Instant processing", "Easy eligibility"],
    defaultAmount: 120000,
    defaultTenure: 18,
    interestRate: 13,
  },
  {
    type: "TWO_WHEELER",
    title: "Two-Wheeler Loan",
    info: "Fast approval two-wheeler financing with simple repayment structure.",
    points: ["Interest: ~11% p.a.", "Tenure: 12-60 months", "Fast approval", "Low EMI"],
    defaultAmount: 90000,
    defaultTenure: 24,
    interestRate: 11,
  },
  {
    type: "HORTICULTURE",
    title: "Horticulture Loan",
    info: "Financing support for horticulture expansion and crop-linked projects.",
    points: ["Interest: ~9% p.a.", "Tenure: 12-120 months", "Agri project support", "Flexible utilization"],
    defaultAmount: 450000,
    defaultTenure: 48,
    interestRate: 9,
  },
  {
    type: "ALLIED_ACTIVITIES",
    title: "Allied Activities Financing",
    info: "Credit support for fishery, dairy, poultry, and allied rural business.",
    points: ["Interest: ~10% p.a.", "Tenure: 12-120 months", "Rural business focus", "Project funding"],
    defaultAmount: 550000,
    defaultTenure: 60,
    interestRate: 10,
  },
  {
    type: "WORKING_CAPITAL",
    title: "Working Capital Financing",
    info: "Business and MSME working capital limits to support daily operations.",
    points: ["Interest: ~11% p.a.", "Tenure: 12-84 months", "Cashflow support", "Business continuity"],
    defaultAmount: 1000000,
    defaultTenure: 48,
    interestRate: 11,
  },
];

const statusToClass = {
  PENDING: "pending",
  APPROVED: "active",
  REJECTED: "inactive",
  CLOSED: "success",
};

const loanProductMap = loanProducts.reduce((acc, item) => {
  acc[item.type] = item;
  return acc;
}, {});

const defaultLoanType = loanProducts[0].type;

const loanInterestMap = loanProducts.reduce(
  (acc, item) => ({
    ...acc,
    [item.type]: item.interestRate,
  }),
  {
    // Keep legacy compatibility for older records.
    VEHICLE: 10,
    EDUCATION: 9,
  }
);

const getLoanDefaults = (loanType) => {
  if (loanProductMap[loanType]) {
    return {
      amount: loanProductMap[loanType].defaultAmount,
      tenure: loanProductMap[loanType].defaultTenure,
    };
  }
  if (loanType === "VEHICLE") {
    return { amount: 600000, tenure: 60 };
  }
  if (loanType === "EDUCATION") {
    return { amount: 400000, tenure: 84 };
  }
  return { amount: 100000, tenure: 12 };
};

const toLoanLabel = (loanType) => {
  const normalized = String(loanType || "").trim().toUpperCase();
  if (loanProductMap[normalized]) {
    return loanProductMap[normalized].title;
  }
  if (normalized === "VEHICLE") return "Vehicle Loan";
  if (normalized === "EDUCATION") return "Education Loan";
  return normalized
    .split("_")
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0) + chunk.slice(1).toLowerCase())
    .join(" ");
};

const toCurrency = (value) => `Rs ${Number(value || 0).toFixed(2)}`;

const calculateEmi = ({ amount, tenure, annualRate }) => {
  const principal = Number(amount);
  const months = Number(tenure);
  const monthlyRate = Number(annualRate) / 12 / 100;
  if (!Number.isFinite(principal) || principal <= 0 || !Number.isFinite(months) || months <= 0) return 0;
  if (!Number.isFinite(monthlyRate) || monthlyRate === 0) {
    return principal / months;
  }
  const emi = (principal * monthlyRate * (1 + monthlyRate) ** months) / ((1 + monthlyRate) ** months - 1);
  return Number.isFinite(emi) ? emi : 0;
};

const getLoanEmiValue = (loan) => {
  const existingEmi = Number(loan?.emi);
  if (Number.isFinite(existingEmi) && existingEmi > 0) {
    return existingEmi;
  }

  const loanType = String(loan?.loanType || "").toUpperCase();
  return calculateEmi({
    amount: Number(loan?.principal || 0),
    tenure: Number(loan?.tenure || 0),
    annualRate: Number(loanInterestMap[loanType] || 0),
  });
};

const Loans = () => {
  const location = useLocation();
  const loanFormRef = useRef(null);
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showLoanForm, setShowLoanForm] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  const [submitting, setSubmitting] = useState(false);
  const [payingLoanId, setPayingLoanId] = useState("");
  const [hasTransactionPin, setHasTransactionPin] = useState(false);
  const [emiDrafts, setEmiDrafts] = useState({});
  const [formData, setFormData] = useState({
    loanType: defaultLoanType,
    amount: "",
    tenure: "",
    description: "",
  });

  const activeLoanType = formData.loanType || defaultLoanType;
  const estimatedEmi = useMemo(
    () =>
      calculateEmi({
        amount: formData.amount,
        tenure: formData.tenure,
        annualRate: loanInterestMap[activeLoanType] || 10,
      }),
    [formData.amount, formData.tenure, activeLoanType]
  );

  useEffect(() => {
    fetchLoans();
    fetchSecurityState();
  }, []);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const requestedType = String(searchParams.get("type") || "").trim().toUpperCase();
    if (!requestedType) return;

    if (!loanProductMap[requestedType] && requestedType !== "VEHICLE" && requestedType !== "EDUCATION") {
      return;
    }

    const defaults = getLoanDefaults(requestedType);
    setFormData((current) => ({
      ...current,
      loanType: requestedType,
      amount: String(defaults.amount),
      tenure: String(defaults.tenure),
    }));
    setShowLoanForm(true);
    setTimeout(() => {
      loanFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  }, [location.search]);

  const fetchSecurityState = async () => {
    try {
      const response = await getProfile();
      if (response.data.success) {
        setHasTransactionPin(Boolean(response.data.user?.hasTransactionPin));
      }
    } catch (_) {
      // Non-blocking: loan view can still load if profile call fails.
    }
  };

  const fetchLoans = async () => {
    try {
      const response = await getMyLoans();
      if (response.data.success) {
        const nextLoans = response.data.loans || [];
        setLoans(nextLoans);
        setEmiDrafts((current) => {
          const nextDrafts = {};
          nextLoans.forEach((loan) => {
            const defaultEmiAmount = getLoanEmiValue(loan);
            nextDrafts[loan._id] = {
              amount: current[loan._id]?.amount ?? String(defaultEmiAmount.toFixed(2)),
              transactionPin: current[loan._id]?.transactionPin || "",
            };
          });
          return nextDrafts;
        });
      }
    } catch (error) {
      setMessageType("error");
      setMessage(error.response?.data?.message || "Failed to fetch loans");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (event) => {
    setFormData({ ...formData, [event.target.name]: event.target.value });
  };

  const handleQuickApply = (loanType) => {
    const defaults = getLoanDefaults(loanType);
    setFormData({
      loanType,
      amount: String(defaults.amount),
      tenure: String(defaults.tenure),
      description: "",
    });
    setShowLoanForm(true);
    setMessageType("success");
    setMessage("Quick apply details pre-filled. Review and submit.");
    setTimeout(() => {
      loanFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  const handleLoanRequest = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");

    try {
      const payload = {
        loanType: formData.loanType,
        amount: Number(formData.amount),
        tenure: Number(formData.tenure),
      };
      const response = await applyLoan(payload);
      if (response.data.success) {
        setMessageType("success");
        setMessage("Loan application submitted successfully.");
        setShowLoanForm(false);
        setFormData({ loanType: defaultLoanType, amount: "", tenure: "", description: "" });
        fetchLoans();
      }
    } catch (error) {
      setMessageType("error");
      setMessage(error.response?.data?.message || "Loan request failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEmiInputChange = (loanId, field, value) => {
    setEmiDrafts((current) => ({
      ...current,
      [loanId]: {
        ...current[loanId],
        [field]: value,
      },
    }));
  };

  const handlePayEmi = async (loan) => {
    const draft = emiDrafts[loan._id] || {};
    const paymentAmount = Number(draft.amount);
    const transactionPin = String(draft.transactionPin || "");

    if (!paymentAmount || paymentAmount <= 0) {
      setMessageType("error");
      setMessage("Enter a valid EMI payment amount.");
      return;
    }

    if (!/^\d{4}$/.test(transactionPin)) {
      setMessageType("error");
      setMessage("Enter a valid 4-digit transaction PIN.");
      return;
    }

    setPayingLoanId(loan._id);
    setMessage("");

    try {
      const response = await payLoanEmi(loan._id, {
        amount: paymentAmount,
        transactionPin,
      });
      if (response.data.success) {
        setMessageType("success");
        setMessage("Loan EMI payment completed.");
        setEmiDrafts((current) => ({
          ...current,
          [loan._id]: {
            ...current[loan._id],
            transactionPin: "",
          },
        }));
        fetchLoans();
      }
    } catch (error) {
      setMessageType("error");
      setMessage(error.response?.data?.message || "Loan EMI payment failed");
    } finally {
      setPayingLoanId("");
    }
  };

  if (loading) {
    return (
      <div className="loans-container">
        <p>Loading loans...</p>
      </div>
    );
  }

  return (
    <div className="loans-container">
      <div className="loans-header">
        <div>
          <h1>Loan Services</h1>
          <p>Choose a product and use quick apply options for faster loan requests.</p>
        </div>
        <button className="btn-apply" onClick={() => setShowLoanForm((value) => !value)}>
          {showLoanForm ? "Close Apply Form" : "Easy Apply"}
        </button>
      </div>

      {message && <div className={`message-box ${messageType === "error" ? "error" : "success"}`}>{message}</div>}

      {showLoanForm && (
        <div className="loan-form-card" ref={loanFormRef}>
          <h3>Loan Application</h3>
          <p className="loan-form-note">Tip: You can tap any loan card below for one-click pre-fill.</p>
          <form onSubmit={handleLoanRequest}>
            <div className="form-row">
              <div className="form-group">
                <label>Loan Type</label>
                <select name="loanType" value={formData.loanType} onChange={handleChange}>
                  {loanProducts.map((item) => (
                    <option key={item.type} value={item.type}>
                      {item.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Loan Amount (Rs)</label>
                <input
                  type="number"
                  name="amount"
                  value={formData.amount}
                  onChange={handleChange}
                  placeholder="Enter amount"
                  required
                  step="1000"
                  min="10000"
                />
              </div>
            </div>

            <div className="form-group">
              <label>Tenure (Months)</label>
              <input
                type="number"
                name="tenure"
                value={formData.tenure}
                onChange={handleChange}
                placeholder="For example: 12, 24, 36"
                required
                min="6"
                max="360"
              />
            </div>

            <div className="loan-quick-chip-row">
              {loanProducts.map((item) => (
                <button key={item.type} type="button" className="loan-quick-chip" onClick={() => handleQuickApply(item.type)}>
                  {item.title}
                </button>
              ))}
            </div>

            <div className="loan-estimate-card">
              <p>
                Estimated EMI ({loanInterestMap[activeLoanType] || 10}% p.a.):{" "}
                <strong>{estimatedEmi > 0 ? `${toCurrency(estimatedEmi)} / month` : "Enter amount and tenure to see EMI"}</strong>
              </p>
              <span>Actual EMI is finalized during approval process.</span>
            </div>

            <div className="form-buttons">
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? "Submitting..." : "Submit Application"}
              </button>
              <button type="button" className="btn-cancel" onClick={() => setShowLoanForm(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="loan-types-grid">
        {loanProducts.map((item) => (
          <div key={item.type} className="loan-type-card">
            <h3>{item.title}</h3>
            <p className="loan-info">{item.info}</p>
            <ul className="loan-features">
              {item.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <button type="button" className="btn-secondary loan-card-apply-btn" onClick={() => handleQuickApply(item.type)}>
              Quick Apply {item.title}
            </button>
          </div>
        ))}
      </div>

      <div className="loans-content">
        <h2>Your Loans</h2>
        {loans.length === 0 ? (
          <div className="empty-state">
            <p>No active loans found.</p>
          </div>
        ) : (
          <div className="loans-list">
            {loans.map((loan) => {
              const displayEmi = getLoanEmiValue(loan);
              const loanLabel = toLoanLabel(loan.loanType);
              return (
                <div key={loan._id} className="loan-item">
                <div className="loan-item-head">
                  <h4>{loanLabel}</h4>
                  <span className={`status-badge ${statusToClass[loan.status] || "pending"}`}>{loan.status}</span>
                </div>
                <p>Principal: {toCurrency(loan.principal)}</p>
                <p>EMI: {toCurrency(displayEmi)}</p>
                <p>Remaining: {toCurrency(loan.remainingAmount)}</p>
                <p>Tenure: {loan.tenure} months</p>
                {loan.status === "APPROVED" && (loan.remainingAmount || 0) > 0 && (
                  <div className="emi-pay-panel">
                    {!hasTransactionPin && (
                      <p className="emi-pin-hint">
                        Set transaction PIN first.
                        <Link to="/security/transaction-pin">Open Security PIN</Link>
                      </p>
                    )}
                    <div className="emi-pay-grid">
                      <div className="form-group">
                        <label>Payment Amount (Rs)</label>
                        <input
                          type="number"
                          value={emiDrafts[loan._id]?.amount || ""}
                          onChange={(event) => handleEmiInputChange(loan._id, "amount", event.target.value)}
                          min="1"
                          step="0.01"
                          placeholder="Enter amount"
                        />
                      </div>
                      <div className="form-group">
                        <label>4-Digit Transaction PIN</label>
                        <input
                          type="password"
                          value={emiDrafts[loan._id]?.transactionPin || ""}
                          onChange={(event) =>
                            handleEmiInputChange(
                              loan._id,
                              "transactionPin",
                              event.target.value.replace(/\D/g, "").slice(0, 4)
                            )
                          }
                          maxLength={4}
                          inputMode="numeric"
                          placeholder="Enter secure PIN"
                        />
                      </div>
                    </div>
                    <button
                      className="btn-secondary"
                      type="button"
                      onClick={() => handlePayEmi(loan)}
                      disabled={payingLoanId === loan._id || !hasTransactionPin}
                    >
                      {payingLoanId === loan._id ? "Processing..." : "Pay EMI"}
                    </button>
                  </div>
                )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Loans;
