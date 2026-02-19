import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  getMyAccount,
  createAccount,
  deposit,
  withdraw,
  depositMoney,
  withdrawMoney,
  getProfile,
  getTransactionSecurityRules,
  getMonthlyStatementPdf,
} from "../services/api";
import pdfContentMap from "../data/pdfContentMap";
import "./Dashboard.css";

const Dashboard = () => {
  const { user } = useAuth();
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [transactionType, setTransactionType] = useState("deposit");
  const [formData, setFormData] = useState({
    accountType: "SAVINGS",
    branch: "",
    ifscCode: "",
    amount: "",
    description: "",
    transactionPin: "",
  });
  const [message, setMessage] = useState("");
  const [hasTransactionPin, setHasTransactionPin] = useState(Boolean(user?.hasTransactionPin));
  const [securityRules, setSecurityRules] = useState(null);
  const [statementYear, setStatementYear] = useState(String(new Date().getFullYear()));
  const [statementMonth, setStatementMonth] = useState(String(new Date().getMonth() + 1).padStart(2, "0"));
  const [downloadingStatement, setDownloadingStatement] = useState(false);
  const [emiForm, setEmiForm] = useState({
    amount: "500000",
    annualRate: "9.5",
    tenureMonths: "60",
  });

  const dashboardGuides = useMemo(() => {
    const baseGuides = [
      { category: "accounts", route: "/services/accounts/nri-accounts", cta: "Manage Account Services" },
      { category: "loans", route: "/services/loans/emi-calculator", cta: "Plan Loan and EMI" },
      { category: "support", route: "/services/support/contact-us", cta: "Get Banking Support" },
      { category: "regulatory", route: "/services/regulatory/disclosures", cta: "Review Policies" },
    ];

    if (account?.accountType === "BUSINESS") {
      baseGuides.unshift({
        category: "cards",
        route: "/services/cards/credit-cards",
        cta: "Open MSME Card Services",
      });
    }

    return baseGuides.map((entry) => {
      const segment = pdfContentMap[entry.category];
      return {
        key: entry.category,
        title: segment?.title || "Service Guidance",
        summary: segment?.highlights?.[0] || "Explore this service segment.",
        metric: segment?.metrics?.[0] || "Integrated service flow available.",
        route: entry.route,
        cta: entry.cta,
      };
    });
  }, [account]);

  const emiSummary = useMemo(() => {
    const principal = Number(emiForm.amount);
    const annualRate = Number(emiForm.annualRate);
    const months = Number(emiForm.tenureMonths);

    if (!Number.isFinite(principal) || principal <= 0 || !Number.isFinite(months) || months <= 0) {
      return { emi: 0, totalPayable: 0, totalInterest: 0 };
    }

    const monthlyRate = Number.isFinite(annualRate) ? Math.max(0, annualRate) / 12 / 100 : 0;
    const emi =
      monthlyRate === 0
        ? principal / months
        : (principal * monthlyRate * (1 + monthlyRate) ** months) / ((1 + monthlyRate) ** months - 1);
    const safeEmi = Number.isFinite(emi) ? emi : 0;
    const totalPayable = safeEmi * months;
    const totalInterest = Math.max(0, totalPayable - principal);

    return {
      emi: safeEmi,
      totalPayable,
      totalInterest,
    };
  }, [emiForm]);

  useEffect(() => {
    fetchAccount();
  }, []);

  const formatRupee = (value) => `Rs ${Number(value || 0).toFixed(2)}`;

  const fetchAccount = async () => {
    try {
      const [accountResult, profileResult, rulesResult] = await Promise.allSettled([
        getMyAccount(),
        getProfile(),
        getTransactionSecurityRules(),
      ]);

      if (accountResult.status === "fulfilled" && accountResult.value.data.success) {
        setAccount(accountResult.value.data.account);
        setShowCreateForm(false);
      } else if (accountResult.status === "rejected" && accountResult.reason?.response?.status === 404) {
        setShowCreateForm(true);
      }

      if (profileResult.status === "fulfilled" && profileResult.value.data.success) {
        setHasTransactionPin(Boolean(profileResult.value.data.user?.hasTransactionPin));
      }

      if (rulesResult.status === "fulfilled" && rulesResult.value.data.success) {
        setSecurityRules(rulesResult.value.data.rules || null);
      }
    } catch (error) {
      if (error.response?.status === 404) {
        setShowCreateForm(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAccount = async (event) => {
    event.preventDefault();
    try {
      const response = await createAccount(formData);
      if (response.data.success) {
        setMessage("Account created successfully.");
        fetchAccount();
        setFormData({ accountType: "SAVINGS", branch: "", ifscCode: "", amount: "", description: "", transactionPin: "" });
      }
    } catch (error) {
      setMessage(error.response?.data?.message || "Failed to create account");
    }
  };

  const handleTransaction = async (event) => {
    event.preventDefault();
    try {
      const amountValue = parseFloat(formData.amount);
      if (!Number.isFinite(amountValue) || amountValue <= 0) {
        setMessage("Enter a valid amount.");
        return;
      }

      if (transactionType === "withdraw" && securityRules) {
        if (amountValue > Number(securityRules.maxSingleWithdrawal || 0)) {
          setMessage(`Single withdrawal limit is ${formatRupee(securityRules.maxSingleWithdrawal)}.`);
          return;
        }
        if (amountValue > Number(securityRules.remainingWithdrawal || 0)) {
          setMessage(`Daily withdrawal limit reached. Remaining today: ${formatRupee(securityRules.remainingWithdrawal)}.`);
          return;
        }
      }

      if (transactionType === "withdraw" && !/^\d{4}$/.test(String(formData.transactionPin || ""))) {
        setMessage("Enter valid 4-digit transaction PIN.");
        return;
      }

      const transactionData = {
        amount: amountValue,
        description: formData.description,
        transactionPin: transactionType === "withdraw" ? formData.transactionPin : undefined,
      };

      let response;
      if (transactionType === "deposit") {
        try {
          response = await deposit(transactionData);
        } catch (error) {
          // Backward compatibility if transaction routes are not available in older backend runs.
          if (Number(error?.response?.status) === 404) {
            response = await depositMoney(transactionData);
          } else {
            throw error;
          }
        }
      } else {
        try {
          response = await withdraw(transactionData);
        } catch (error) {
          // Backward compatibility if transaction routes are not available in older backend runs.
          if (Number(error?.response?.status) === 404) {
            response = await withdrawMoney(transactionData);
          } else {
            throw error;
          }
        }
      }

      if (response.data.success) {
        setMessage(`${transactionType === "deposit" ? "Deposit" : "Withdrawal"} successful.`);
        fetchAccount();
        setFormData({ ...formData, amount: "", description: "", transactionPin: "" });
        setShowTransactionForm(false);
      }
    } catch (error) {
      setMessage(error.response?.data?.message || "Transaction failed");
    }
  };

  const handleChange = (event) => {
    setFormData({ ...formData, [event.target.name]: event.target.value });
  };

  const handleDownloadStatement = async () => {
    setMessage("");
    const year = String(statementYear || "").trim();
    const month = String(statementMonth || "").trim();
    if (!/^\d{4}$/.test(year) || !/^(0?[1-9]|1[0-2])$/.test(month)) {
      setMessage("Enter a valid year and month to download statement.");
      return;
    }

    setDownloadingStatement(true);
    try {
      const response = await getMonthlyStatementPdf(year, month.padStart(2, "0"));
      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `statement-${year}-${month.padStart(2, "0")}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setMessage("Statement downloaded successfully.");
    } catch (error) {
      setMessage(error.response?.data?.message || "Failed to download statement.");
    } finally {
      setDownloadingStatement(false);
    }
  };

  const handleEmiInputChange = (field, value) => {
    if (field === "amount") {
      setEmiForm((current) => ({ ...current, amount: value.replace(/[^\d]/g, "").slice(0, 9) }));
      return;
    }
    if (field === "annualRate") {
      setEmiForm((current) => ({ ...current, annualRate: value.replace(/[^\d.]/g, "").slice(0, 5) }));
      return;
    }
    if (field === "tenureMonths") {
      setEmiForm((current) => ({ ...current, tenureMonths: value.replace(/[^\d]/g, "").slice(0, 3) }));
    }
  };

  if (loading) {
    return (
      <div className="dashboard-container">
        <p>Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div className="dashboard-header-copy">
          <span className="section-tag">Account Overview</span>
          <h1>Hello, {user?.firstName}</h1>
          <p>Track your balance, move funds, and keep account activity under control.</p>
        </div>
      </div>

      {message && <div className="message-box">{message}</div>}

      {!account && showCreateForm ? (
        <div className="card create-account-card">
          <div className="create-card-head">
            <span className="create-pill">New Account</span>
            <h2>Set up your primary account</h2>
            <p>Complete the details below to activate your account and start transactions.</p>
          </div>
          <form onSubmit={handleCreateAccount} className="dashboard-form create-account-form">
            <div className="create-form-grid">
              <div className="form-group">
                <label>Account Type</label>
                <select name="accountType" value={formData.accountType} onChange={handleChange}>
                  <option value="SAVINGS">Savings</option>
                  <option value="CHECKING">Checking</option>
                  <option value="BUSINESS">Business</option>
                </select>
              </div>

              <div className="form-group">
                <label>Preferred Branch</label>
                <input
                  type="text"
                  name="branch"
                  value={formData.branch}
                  onChange={handleChange}
                  placeholder="Enter your branch"
                  required
                />
              </div>

              <div className="form-group">
                <label>IFSC Code</label>
                <input
                  type="text"
                  name="ifscCode"
                  value={formData.ifscCode}
                  onChange={handleChange}
                  placeholder="Enter IFSC code"
                  required
                />
              </div>
            </div>
            <button type="submit" className="btn-primary">
              Create Account
            </button>
          </form>
        </div>
      ) : (
        <>
          <div className="cards-grid">
            <div className="card account-card">
              <div className="card-header">
                <h2>Account Details</h2>
                <span className={`status ${account.status.toLowerCase()}`}>{account.status}</span>
              </div>
              <div className="account-info">
                <div className="info-item">
                  <label>Account Number</label>
                  <p className="account-number">{account.accountNumber}</p>
                </div>
                <div className="info-item">
                  <label>Account Type</label>
                  <p>{account.accountType}</p>
                </div>
                <div className="info-item">
                  <label>IFSC Code</label>
                  <p>{account.ifscCode}</p>
                </div>
                <div className="info-item">
                  <label>Branch</label>
                  <p>{account.branch}</p>
                </div>
              </div>
            </div>

            <div className="card balance-card">
              <h2>Available Balance</h2>
              <div className="balance-display">
                <p className="balance-amount">Rs {account.balance.toFixed(2)}</p>
              </div>
              <div className="transaction-buttons">
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setTransactionType("deposit");
                    setShowTransactionForm(true);
                  }}
                >
                  Deposit
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setTransactionType("withdraw");
                    setShowTransactionForm(true);
                  }}
                >
                  Withdraw
                </button>
              </div>
            </div>
            <div className="card statement-card">
              <h2>Monthly Statement</h2>
              <p>Select year and month to download PDF.</p>
              <div className="statement-inputs">
                <input
                  type="number"
                  value={statementYear}
                  onChange={(event) => setStatementYear(event.target.value)}
                  placeholder="YYYY"
                  min="2000"
                  max={new Date().getFullYear()}
                />
                <input
                  type="number"
                  value={statementMonth}
                  onChange={(event) => setStatementMonth(event.target.value)}
                  placeholder="MM"
                  min="1"
                  max="12"
                />
              </div>
              <div className="statement-actions">
                <button type="button" className="btn-secondary" onClick={handleDownloadStatement} disabled={downloadingStatement}>
                  {downloadingStatement ? "Downloading..." : "Download PDF"}
                </button>
                <Link to="/transactions" className="btn-secondary">
                  View Transactions
                </Link>
              </div>
            </div>

            <div className="card emi-card">
              <h2>Quick EMI Calculator</h2>
              <p>Estimate monthly EMI directly from dashboard.</p>
              <div className="emi-card-inputs">
                <label>
                  Loan Amount (Rs)
                  <input
                    type="text"
                    inputMode="numeric"
                    value={emiForm.amount}
                    onChange={(event) => handleEmiInputChange("amount", event.target.value)}
                    placeholder="500000"
                  />
                </label>
                <label>
                  Interest % (Yearly)
                  <input
                    type="text"
                    inputMode="decimal"
                    value={emiForm.annualRate}
                    onChange={(event) => handleEmiInputChange("annualRate", event.target.value)}
                    placeholder="9.5"
                  />
                </label>
                <label>
                  Tenure (Months)
                  <input
                    type="text"
                    inputMode="numeric"
                    value={emiForm.tenureMonths}
                    onChange={(event) => handleEmiInputChange("tenureMonths", event.target.value)}
                    placeholder="60"
                  />
                </label>
              </div>
              <div className="emi-card-result">
                <small>Estimated EMI</small>
                <strong>{formatRupee(emiSummary.emi)}</strong>
                <span>
                  Total: {formatRupee(emiSummary.totalPayable)} | Interest: {formatRupee(emiSummary.totalInterest)}
                </span>
              </div>
            </div>
          </div>

          {showTransactionForm && (
            <div className="card transaction-form-card">
              <h3>{transactionType === "deposit" ? "Deposit Funds" : "Withdraw Funds"}</h3>
              <form onSubmit={handleTransaction} className="dashboard-form">
                <div className="form-group">
                  <label>Amount (Rs)</label>
                  {transactionType === "withdraw" && securityRules && (
                    <p className="withdraw-limit-note">
                      Max single: {formatRupee(securityRules.maxSingleWithdrawal)} | Remaining today:{" "}
                      {formatRupee(securityRules.remainingWithdrawal)}
                    </p>
                  )}
                  <input
                    type="number"
                    name="amount"
                    value={formData.amount}
                    onChange={handleChange}
                    placeholder="Enter amount"
                    required
                    step="0.01"
                    min="1"
                    max={transactionType === "withdraw" ? Number(securityRules?.maxSingleWithdrawal || "") || undefined : undefined}
                  />
                </div>

                <div className="form-group">
                  <label>Description (Optional)</label>
                  <input
                    type="text"
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    placeholder="Add a note"
                  />
                </div>

                {transactionType === "withdraw" && (
                  <>
                    {!hasTransactionPin && (
                      <p className="transaction-pin-hint">
                        Set transaction PIN first. <Link to="/security/transaction-pin">Open Security PIN</Link>
                      </p>
                    )}
                    <div className="form-group">
                      <label>4-Digit Transaction PIN</label>
                      <input
                        type="password"
                        name="transactionPin"
                        value={formData.transactionPin || ""}
                        onChange={handleChange}
                        placeholder="Enter secure PIN"
                        required
                        maxLength={4}
                      />
                    </div>
                  </>
                )}

                <div className="form-buttons">
                  <button type="submit" className="btn-primary" disabled={transactionType === "withdraw" && !hasTransactionPin}>
                    Confirm
                  </button>
                  <button type="button" className="btn-cancel" onClick={() => setShowTransactionForm(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="card quick-stats">
            <h3>Account Opened On</h3>
            <p>{new Date(account.createdAt).toLocaleDateString("en-IN")}</p>
          </div>

            <section className="dashboard-guidance">
              <div className="dashboard-guidance-head">
                <span className="guidance-pill">Service Guidance</span>
                <h3>Contextual Banking Guidance</h3>
                <p>Use these service paths to continue with NRI, loan, support, and compliance journeys.</p>
              </div>
            <div className="dashboard-guidance-grid">
              {dashboardGuides.map((guide) => (
                <article key={guide.key} className="dashboard-guidance-card">
                  <h4>{guide.title}</h4>
                  <p>{guide.summary}</p>
                  <span>{guide.metric}</span>
                  <Link to={guide.route}>{guide.cta}</Link>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
};

export default Dashboard;
