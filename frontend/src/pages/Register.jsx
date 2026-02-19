import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { register } from "../services/api";
import { isStrictAdminUser } from "../utils/adminIdentity";
import "./Auth.css";

const Register = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    aadhar: "",
    address: "",
  });

  const handleChange = (event) => {
    setFormData({ ...formData, [event.target.name]: event.target.value });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!formData.firstName?.trim()) {
      setError("First name is required");
      return;
    }
    if (!formData.lastName?.trim()) {
      setError("Last name is required");
      return;
    }
    if (!formData.email?.trim()) {
      setError("Email is required");
      return;
    }
    if (!formData.email.includes("@")) {
      setError("Please enter a valid email");
      return;
    }
    if (!formData.phone?.trim()) {
      setError("Phone number is required");
      return;
    }
    if (formData.phone.trim().length < 7) {
      setError("Phone number must be at least 7 digits");
      return;
    }
    if (!formData.aadhar?.trim()) {
      setError("Aadhar number is required");
      return;
    }
    if (formData.aadhar.trim().length < 6) {
      setError("Aadhar number must be at least 6 characters");
      return;
    }
    if (!formData.address?.trim()) {
      setError("Address is required");
      return;
    }
    if (formData.address.trim().length < 6) {
      setError("Address must be at least 6 characters");
      return;
    }
    if (!formData.password) {
      setError("Password is required");
      return;
    }
    if (formData.password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (!formData.confirmPassword) {
      setError("Confirm password is required");
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      const response = await register(formData);
      if (response.data.success) {
        login(response.data.token, response.data.user);
        const destination = isStrictAdminUser(response.data.user) ? "/admin" : "/dashboard";
        navigate(destination);
      } else {
        setError(response.data.message || "Registration failed");
      }
    } catch (apiError) {
      const errorMessage = apiError.response?.data?.message || apiError.message || "Registration failed. Please try again.";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-backdrop" aria-hidden="true"></div>
      <div className="auth-form-wrapper auth-form-wrapper-wide">
        <div className="auth-form">
          <div className="auth-form-head">
            <span className="auth-pill">Open Account</span>
            <h2>Create Your BankIndia Profile</h2>
            <p className="auth-subtitle">Complete your details to enable secure banking, transactions, and loan requests.</p>
          </div>

          {error && <div className="error-message">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label>First Name</label>
                <input
                  type="text"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleChange}
                  required
                  placeholder="First name"
                  autoComplete="given-name"
                />
              </div>
              <div className="form-group">
                <label>Last Name</label>
                <input
                  type="text"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleChange}
                  required
                  placeholder="Last name"
                  autoComplete="family-name"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>
              <div className="form-group">
                <label>Phone Number</label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  required
                  placeholder="9876543210"
                  autoComplete="tel"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Aadhar Number</label>
                <input
                  type="text"
                  name="aadhar"
                  value={formData.aadhar}
                  onChange={handleChange}
                  required
                  placeholder="123456789012"
                  maxLength="12"
                />
              </div>
              <div className="form-group">
                <label>Address</label>
                <input
                  type="text"
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  required
                  placeholder="City, street, and area"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  placeholder="Minimum 6 characters"
                  minLength="6"
                  autoComplete="new-password"
                />
              </div>
              <div className="form-group">
                <label>Confirm Password</label>
                <input
                  type="password"
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  required
                  placeholder="Re-enter password"
                  minLength="6"
                  autoComplete="new-password"
                />
              </div>
            </div>

            <button type="submit" className="auth-btn" disabled={loading}>
              {loading ? "Creating account..." : "Register"}
            </button>
          </form>

          <p className="auth-link">
            Already registered? <Link to="/login">Sign in</Link> | <Link to="/">Back to Home</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Register;
