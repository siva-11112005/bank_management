import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  deleteNominee,
  getNominee,
  requestProfileUpdateOtp,
  updateProfile,
  upsertNominee,
} from "../services/api";
import "../Profile.css";

const buildFormFromUser = (user) => ({
  firstName: user?.firstName || "",
  lastName: user?.lastName || "",
  email: user?.email || "",
  phone: user?.phone || "",
  address: user?.address || "",
});

const emptyNomineeForm = {
  fullName: "",
  relationship: "",
  dateOfBirth: "",
  phone: "",
  email: "",
  address: "",
  allocationPercentage: "100",
  isMinor: false,
  guardianName: "",
  guardianRelationship: "",
};

const toDateInputValue = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

const todayDateInputValue = () => new Date().toISOString().slice(0, 10);

const buildNomineeForm = (nominee) => ({
  fullName: nominee?.fullName || "",
  relationship: nominee?.relationship || "",
  dateOfBirth: toDateInputValue(nominee?.dateOfBirth),
  phone: nominee?.phone || "",
  email: nominee?.email || "",
  address: nominee?.address || "",
  allocationPercentage: nominee?.allocationPercentage ? String(nominee.allocationPercentage) : "100",
  isMinor: Boolean(nominee?.isMinor),
  guardianName: nominee?.guardianName || "",
  guardianRelationship: nominee?.guardianRelationship || "",
});

const toPositiveNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const formatInr = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const Profile = () => {
  const { user, logout, updateCurrentUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const nomineeSectionRef = useRef(null);

  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [formData, setFormData] = useState(buildFormFromUser(user));
  const [otpCode, setOtpCode] = useState("");
  const [otpSessionId, setOtpSessionId] = useState("");
  const [otpExpiresAt, setOtpExpiresAt] = useState("");
  const [nomineeLoading, setNomineeLoading] = useState(false);
  const [nomineeSaving, setNomineeSaving] = useState(false);
  const [nominee, setNominee] = useState(null);
  const [nomineeForm, setNomineeForm] = useState(emptyNomineeForm);
  const [calculator, setCalculator] = useState({
    amount: "500000",
    annualRate: "9",
    tenureMonths: "60",
  });

  const calculatorSummary = useMemo(() => {
    const principal = toPositiveNumber(calculator.amount, 0);
    const annualRate = Math.max(0, Number(calculator.annualRate) || 0);
    const months = Math.max(1, Math.round(Number(calculator.tenureMonths) || 1));
    const monthlyRate = annualRate / 12 / 100;

    if (principal <= 0 || months <= 0) {
      return { emi: 0, totalPayable: 0, totalInterest: 0 };
    }

    const emi =
      monthlyRate === 0
        ? principal / months
        : (principal * monthlyRate * (1 + monthlyRate) ** months) / ((1 + monthlyRate) ** months - 1);
    const safeEmi = Number.isFinite(emi) ? emi : 0;
    const totalPayable = safeEmi * months;
    const totalInterest = Math.max(0, totalPayable - principal);

    return { emi: safeEmi, totalPayable, totalInterest };
  }, [calculator]);

  const maxNomineeDob = useMemo(() => todayDateInputValue(), []);

  useEffect(() => {
    if (user) {
      setFormData(buildFormFromUser(user));
      loadNominee();
    }
  }, [user]);

  useEffect(() => {
    const hash = String(location.hash || "").toLowerCase();
    if (hash === "#nominee" && nomineeSectionRef.current) {
      nomineeSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [location.hash]);

  const pushMessage = (type, text) => setMessage({ type, text });

  const loadNominee = async () => {
    setNomineeLoading(true);
    try {
      const response = await getNominee();
      const nomineeData = response.data?.nominee || null;
      setNominee(nomineeData);
      setNomineeForm(buildNomineeForm(nomineeData));
    } catch (_) {
      setNominee(null);
      setNomineeForm(emptyNomineeForm);
    } finally {
      setNomineeLoading(false);
    }
  };

  const clearOtpState = () => {
    setOtpCode("");
    setOtpSessionId("");
    setOtpExpiresAt("");
  };

  const validateRequiredFields = () => {
    if (!formData.firstName || !formData.lastName || !formData.email || !formData.phone) {
      pushMessage("error", "Please complete all required fields.");
      return false;
    }
    return true;
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));

    if (otpSessionId) {
      clearOtpState();
      pushMessage("error", "Profile details changed. Request a fresh OTP before saving.");
    }
  };

  const handleCalculatorChange = (field, value) => {
    if (field === "amount") {
      setCalculator((current) => ({ ...current, amount: value.replace(/[^\d]/g, "").slice(0, 9) }));
      return;
    }
    if (field === "annualRate") {
      const cleaned = value.replace(/[^\d.]/g, "");
      setCalculator((current) => ({ ...current, annualRate: cleaned.slice(0, 5) }));
      return;
    }
    if (field === "tenureMonths") {
      setCalculator((current) => ({ ...current, tenureMonths: value.replace(/[^\d]/g, "").slice(0, 3) }));
    }
  };

  const startEditing = () => {
    setIsEditing(true);
    setMessage(null);
    setFormData(buildFormFromUser(user));
    clearOtpState();
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setFormData(buildFormFromUser(user));
    clearOtpState();
  };

  const handleRequestOtp = async () => {
    if (!validateRequiredFields()) return;

    setOtpLoading(true);
    try {
      const response = await requestProfileUpdateOtp(formData);
      const fallbackOtpCopy =
        response.data?.fallbackOtpMode && response.data?.devOtpCode
          ? ` Fallback OTP: ${response.data.devOtpCode}`
          : "";
      setOtpSessionId(response.data?.otpSessionId || "");
      setOtpExpiresAt(response.data?.expiresAt || "");
      setOtpCode("");
      pushMessage("success", `${response.data?.message || "OTP sent to your registered email."}${fallbackOtpCopy}`);
    } catch (error) {
      pushMessage("error", error.response?.data?.message || "Unable to send OTP.");
    } finally {
      setOtpLoading(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validateRequiredFields()) return;

    if (!otpSessionId) {
      pushMessage("error", "Request OTP before saving profile changes.");
      return;
    }

    if (!/^\d{6}$/.test(otpCode)) {
      pushMessage("error", "Enter valid 6-digit OTP.");
      return;
    }

    setLoading(true);
    try {
      const response = await updateProfile({ otpSessionId, otpCode });
      if (response.data?.token) {
        localStorage.setItem("token", response.data.token);
      }
      if (response.data?.user) {
        updateCurrentUser(response.data.user);
        setFormData(buildFormFromUser(response.data.user));
      }
      setIsEditing(false);
      clearOtpState();
      pushMessage("success", response.data?.message || "Profile updated successfully.");
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      pushMessage("error", error.response?.data?.message || "Failed to update profile.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const handleNomineeChange = (event) => {
    const { name, value, type, checked } = event.target;
    setNomineeForm((current) => {
      const nextValue = type === "checkbox" ? checked : value;
      const next = { ...current, [name]: nextValue };

      if (name === "isMinor" && !checked) {
        next.guardianName = "";
        next.guardianRelationship = "";
      }

      if (name === "allocationPercentage") {
        next.allocationPercentage = value.replace(/[^\d]/g, "").slice(0, 3);
      }

      return next;
    });
  };

  const handleSaveNominee = async (event) => {
    event.preventDefault();
    if (!nomineeForm.fullName || !nomineeForm.relationship || !nomineeForm.dateOfBirth || !nomineeForm.phone) {
      pushMessage("error", "Nominee name, relationship, date of birth, and phone are required.");
      return;
    }
    if (nomineeForm.isMinor && !nomineeForm.guardianName) {
      pushMessage("error", "Guardian name is required for minor nominee.");
      return;
    }
    if (nomineeForm.dateOfBirth > maxNomineeDob) {
      pushMessage("error", "Nominee date of birth cannot be in the future.");
      return;
    }
    const allocation = Number(nomineeForm.allocationPercentage || 100);
    if (!Number.isFinite(allocation) || allocation < 1 || allocation > 100) {
      pushMessage("error", "Allocation percentage must be between 1 and 100.");
      return;
    }

    setNomineeSaving(true);
    try {
      const payload = {
        fullName: nomineeForm.fullName.trim(),
        relationship: nomineeForm.relationship.trim(),
        dateOfBirth: nomineeForm.dateOfBirth,
        phone: nomineeForm.phone.trim(),
        email: nomineeForm.email.trim(),
        address: nomineeForm.address.trim(),
        allocationPercentage: allocation,
        isMinor: nomineeForm.isMinor,
        guardianName: nomineeForm.guardianName.trim(),
        guardianRelationship: nomineeForm.guardianRelationship.trim(),
      };

      const response = await upsertNominee(payload);
      const nomineeData = response.data?.nominee || null;
      setNominee(nomineeData);
      setNomineeForm(buildNomineeForm(nomineeData));
      pushMessage("success", response.data?.message || "Nominee saved successfully.");
    } catch (error) {
      pushMessage("error", error.response?.data?.message || "Unable to save nominee.");
    } finally {
      setNomineeSaving(false);
    }
  };

  const handleRemoveNominee = async () => {
    setNomineeSaving(true);
    try {
      const response = await deleteNominee();
      setNominee(null);
      setNomineeForm(emptyNomineeForm);
      pushMessage("success", response.data?.message || "Nominee removed successfully.");
    } catch (error) {
      pushMessage("error", error.response?.data?.message || "Unable to remove nominee.");
    } finally {
      setNomineeSaving(false);
    }
  };

  if (!user) {
    return <div className="profile-container">Loading profile...</div>;
  }

  return (
    <div className="profile-container">
      <div className="profile-header">
        <h1>My Profile</h1>
        <p>Manage account identity and contact details.</p>
      </div>

      {message && (
        <div className={`message ${message.type}`}>
          <span>{message.text}</span>
          <button type="button" className="close-btn" onClick={() => setMessage(null)}>
            X
          </button>
        </div>
      )}

      <div className="profile-wrapper">
        <div className="profile-card">
          <div className="profile-avatar">
            <div className="avatar-circle">
              {user.firstName && user.firstName[0]}
              {user.lastName && user.lastName[0]}
            </div>
          </div>

          {!isEditing ? (
            <div className="profile-info">
              <div className="info-row">
                <label>Full Name</label>
                <p>
                  {user.firstName} {user.lastName}
                </p>
              </div>
              <div className="info-row">
                <label>Email Address</label>
                <p>{user.email}</p>
              </div>
              <div className="info-row">
                <label>Phone Number</label>
                <p>{user.phone || "Not provided"}</p>
              </div>
              <div className="info-row">
                <label>Address</label>
                <p>{user.address || "Not provided"}</p>
              </div>
              <div className="info-row">
                <label>Aadhar Number</label>
                <p>{user.aadhar || "Not provided"}</p>
              </div>
              <div className="info-row">
                <label>Role</label>
                <p>
                  <span className={`role-badge ${(user.role || "USER").toLowerCase()}`}>{user.role}</span>
                </p>
              </div>
              <div className="info-row">
                <label>Account Status</label>
                <p>
                  <span className={`status-badge ${user.isActive ? "active" : "inactive"}`}>
                    {user.isActive ? "Active" : "Inactive"}
                  </span>
                </p>
              </div>
              <div className="info-row">
                <label>Transaction PIN</label>
                <p>
                  <span className={`status-badge ${user.hasTransactionPin ? "active" : "inactive"}`}>
                    {user.hasTransactionPin ? "Configured" : "Not Set"}
                  </span>
                </p>
              </div>

              <button type="button" className="edit-btn" onClick={startEditing}>
                Edit Profile
              </button>
              <Link to="/dashboard" className="edit-btn profile-dashboard-btn">
                Open Dashboard
              </Link>
              <Link to="/security/transaction-pin" className="edit-btn profile-security-btn">
                Manage Transaction PIN
              </Link>
              <Link to="/support" className="edit-btn profile-support-btn">
                Open Support Center
              </Link>
              <Link to="/cards" className="edit-btn profile-support-btn">
                Open Card Center
              </Link>
              <Link to="/kyc" className="edit-btn profile-support-btn">
                Open KYC Center
              </Link>
              <button type="button" className="edit-btn profile-logout-btn" onClick={handleLogout}>
                Logout
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="edit-form">
              <div className="form-row">
                <div className="form-group">
                  <label>First Name *</label>
                  <input type="text" name="firstName" value={formData.firstName} onChange={handleChange} />
                </div>
                <div className="form-group">
                  <label>Last Name *</label>
                  <input type="text" name="lastName" value={formData.lastName} onChange={handleChange} />
                </div>
              </div>

              <div className="form-group">
                <label>Email Address *</label>
                <input type="email" name="email" value={formData.email} onChange={handleChange} />
              </div>

              <div className="form-group">
                <label>Phone Number *</label>
                <input type="tel" name="phone" value={formData.phone} onChange={handleChange} />
              </div>

              <div className="form-group">
                <label>Address</label>
                <textarea name="address" value={formData.address} onChange={handleChange} rows="3" />
              </div>

              <div className="form-group profile-otp-group">
                <label>Email OTP Verification *</label>
                <p className="profile-otp-note">
                  OTP will be sent to your registered email: <strong>{user.email}</strong>
                </p>
                <div className="profile-otp-actions">
                  <button type="button" className="cancel-btn otp-request-btn" onClick={handleRequestOtp} disabled={otpLoading || loading}>
                    {otpLoading ? "Sending OTP..." : otpSessionId ? "Resend OTP" : "Send OTP"}
                  </button>
                  {otpExpiresAt && (
                    <span className="profile-otp-expiry">
                      Expires: {new Date(otpExpiresAt).toLocaleTimeString("en-IN")}
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  name="otpCode"
                  value={otpCode}
                  onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="Enter 6-digit OTP"
                  inputMode="numeric"
                  maxLength={6}
                />
              </div>

              <div className="form-actions">
                <button type="submit" className="submit-btn" disabled={loading || otpLoading}>
                  {loading ? "Saving..." : "Verify OTP & Save"}
                </button>
                <button type="button" className="cancel-btn" onClick={cancelEditing} disabled={loading || otpLoading}>
                  Cancel
                </button>
              </div>
            </form>
          )}

          <section id="nominee" ref={nomineeSectionRef} className="nominee-panel">
            <div className="nominee-panel-head">
              <h3>Nominee Details</h3>
              <p>Add or update nominee for account continuity.</p>
            </div>

            {nomineeLoading ? (
              <p className="nominee-loading">Loading nominee details...</p>
            ) : (
              <form className="nominee-form-grid" onSubmit={handleSaveNominee}>
                <div className="form-group">
                  <label>Nominee Full Name *</label>
                  <input type="text" name="fullName" value={nomineeForm.fullName} onChange={handleNomineeChange} required />
                </div>
                <div className="form-group">
                  <label>Relationship *</label>
                  <input type="text" name="relationship" value={nomineeForm.relationship} onChange={handleNomineeChange} required />
                </div>
                <div className="form-group">
                  <label>Date Of Birth *</label>
                  <input
                    type="date"
                    name="dateOfBirth"
                    value={nomineeForm.dateOfBirth}
                    onChange={handleNomineeChange}
                    max={maxNomineeDob}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Phone Number *</label>
                  <input type="tel" name="phone" value={nomineeForm.phone} onChange={handleNomineeChange} required />
                </div>
                <div className="form-group">
                  <label>Email (Optional)</label>
                  <input type="email" name="email" value={nomineeForm.email} onChange={handleNomineeChange} />
                </div>
                <div className="form-group">
                  <label>Allocation %</label>
                  <input
                    type="number"
                    name="allocationPercentage"
                    value={nomineeForm.allocationPercentage}
                    onChange={handleNomineeChange}
                    placeholder="100"
                    min="1"
                    max="100"
                  />
                </div>
                <div className="form-group nominee-full-row">
                  <label>Address (Optional)</label>
                  <textarea name="address" value={nomineeForm.address} onChange={handleNomineeChange} rows="2" />
                </div>
                <label className="nominee-minor-check nominee-full-row">
                  <input type="checkbox" name="isMinor" checked={nomineeForm.isMinor} onChange={handleNomineeChange} />
                  Nominee is a minor
                </label>
                {nomineeForm.isMinor && (
                  <>
                    <div className="form-group">
                      <label>Guardian Name *</label>
                      <input
                        type="text"
                        name="guardianName"
                        value={nomineeForm.guardianName}
                        onChange={handleNomineeChange}
                        required={nomineeForm.isMinor}
                      />
                    </div>
                    <div className="form-group">
                      <label>Guardian Relationship</label>
                      <input
                        type="text"
                        name="guardianRelationship"
                        value={nomineeForm.guardianRelationship}
                        onChange={handleNomineeChange}
                      />
                    </div>
                  </>
                )}

                <div className="nominee-actions nominee-full-row">
                  <button type="submit" className="submit-btn" disabled={nomineeSaving}>
                    {nomineeSaving ? "Saving..." : nominee ? "Update Nominee" : "Add Nominee"}
                  </button>
                  <button
                    type="button"
                    className="cancel-btn"
                    onClick={handleRemoveNominee}
                    disabled={nomineeSaving || !nominee}
                  >
                    Remove Nominee
                  </button>
                </div>
              </form>
            )}
          </section>

        </div>

        <div className="profile-stats">
          <h3>Account Overview</h3>
          <div className="profile-stats-grid">
            <div className="profile-stat-item">
              <div className="profile-stat-icon">M</div>
              <div className="profile-stat-text">
                <p className="profile-stat-label">Member Since</p>
                <p className="profile-stat-value">{new Date(user.createdAt).toLocaleDateString("en-IN")}</p>
              </div>
            </div>
            <div className="profile-stat-item">
              <div className="profile-stat-icon">S</div>
              <div className="profile-stat-text">
                <p className="profile-stat-label">Status</p>
                <p className="profile-stat-value">{user.isActive ? "Active" : "Inactive"}</p>
              </div>
            </div>
            <div className="profile-stat-item">
              <div className="profile-stat-icon">R</div>
              <div className="profile-stat-text">
                <p className="profile-stat-label">Role</p>
                <p className="profile-stat-value">{user.role}</p>
              </div>
            </div>
            <div className="profile-stat-item">
              <div className="profile-stat-icon">V</div>
              <div className="profile-stat-text">
                <p className="profile-stat-label">Security</p>
                <p className="profile-stat-value">Verified</p>
              </div>
            </div>
          </div>

          <div className="profile-calc-card">
            <h4>Quick EMI Calculator</h4>
            <div className="profile-calc-grid">
              <label>
                Loan Amount (Rs)
                <input
                  type="text"
                  inputMode="numeric"
                  value={calculator.amount}
                  onChange={(event) => handleCalculatorChange("amount", event.target.value)}
                  placeholder="500000"
                />
              </label>
              <label>
                Interest % (Yearly)
                <input
                  type="text"
                  inputMode="decimal"
                  value={calculator.annualRate}
                  onChange={(event) => handleCalculatorChange("annualRate", event.target.value)}
                  placeholder="9"
                />
              </label>
              <label>
                Tenure (Months)
                <input
                  type="text"
                  inputMode="numeric"
                  value={calculator.tenureMonths}
                  onChange={(event) => handleCalculatorChange("tenureMonths", event.target.value)}
                  placeholder="60"
                />
              </label>
            </div>
            <div className="profile-calc-result">
              <p>Estimated EMI</p>
              <strong>{formatInr(calculatorSummary.emi)}</strong>
              <span>
                Total: {formatInr(calculatorSummary.totalPayable)} | Interest: {formatInr(calculatorSummary.totalInterest)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
