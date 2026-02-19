import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { login } from "../services/api";
import { isStrictAdminUser } from "../utils/adminIdentity";
import "./Auth.css";

const Login = () => {
  const navigate = useNavigate();
  const { login: loginContext } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const handleChange = (event) => {
    setFormData({ ...formData, [event.target.name]: event.target.value });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await login(formData);
      if (response.data.success) {
        loginContext(response.data.token, response.data.user);
        const destination = isStrictAdminUser(response.data.user) ? "/admin" : "/dashboard";
        navigate(destination);
      }
    } catch (apiError) {
      setError(apiError.response?.data?.message || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-backdrop" aria-hidden="true"></div>
      <div className="auth-form-wrapper">
        <div className="auth-form">
          <div className="auth-form-head">
            <span className="auth-pill">Internet Banking</span>
            <h2>Login to BankIndia</h2>
            <p className="auth-subtitle">Access accounts, transfers, loans, and admin tools from one secure workspace.</p>
          </div>

          {error && <div className="error-message">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Email or Phone</label>
              <input
                type="text"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                placeholder="you@example.com or 7418042205"
                autoComplete="username"
              />
            </div>

            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                placeholder="Enter your password"
                autoComplete="current-password"
              />
            </div>

            <div className="auth-inline-link">
              <Link to="/">Back to Home</Link>
              <span>|</span>
              <Link to="/forgot-password">Forgot password?</Link>
            </div>

            <button type="submit" className="auth-btn" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <p className="auth-link">
            New user? <Link to="/register">Create an account</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
