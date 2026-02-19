import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../services/api";
import "./Auth.css";

const ForgotPassword = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  const handleRequestReset = async (event) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    if (!email) {
      setMessage({ type: "error", text: "Email is required" });
      setLoading(false);
      return;
    }

    try {
      await api.post("/password/forgot-password", { email });
      setMessage({
        type: "success",
        text: "Reset link sent to your email. Check inbox and paste token below.",
      });
      setTimeout(() => setStep("reset"), 1200);
    } catch (error) {
      setMessage({
        type: "error",
        text: error.response?.data?.message || "Failed to send reset email",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (event) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    if (!resetToken || !newPassword || !confirmPassword) {
      setMessage({ type: "error", text: "All fields are required" });
      setLoading(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage({ type: "error", text: "Passwords do not match" });
      setLoading(false);
      return;
    }

    if (newPassword.length < 6) {
      setMessage({ type: "error", text: "Password must be at least 6 characters" });
      setLoading(false);
      return;
    }

    try {
      await api.post("/password/reset-password", {
        token: resetToken,
        newPassword,
        confirmPassword,
      });

      setMessage({
        type: "success",
        text: "Password reset successful. Redirecting to login.",
      });

      setTimeout(() => navigate("/login"), 1600);
    } catch (error) {
      setMessage({
        type: "error",
        text: error.response?.data?.message || "Failed to reset password",
      });
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
            <span className="auth-pill">Account Security</span>
            <h2>{step === "email" ? "Forgot Password" : "Reset Password"}</h2>
            <p className="auth-subtitle">
              {step === "email"
                ? "Enter your registered email to receive reset instructions."
                : "Paste your reset token and set a new password."}
            </p>
          </div>

          {message && <div className={`${message.type}-message`}>{message.text}</div>}

          {step === "email" ? (
            <form onSubmit={handleRequestReset}>
              <div className="form-group">
                <label>Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  disabled={loading}
                  autoComplete="email"
                />
              </div>

              <button type="submit" className="auth-btn" disabled={loading}>
                {loading ? "Sending..." : "Send Reset Link"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleResetPassword}>
              <div className="form-group">
                <label>Reset Token</label>
                <input
                  type="text"
                  value={resetToken}
                  onChange={(event) => setResetToken(event.target.value)}
                  placeholder="Paste token from email"
                  disabled={loading}
                />
              </div>

              <div className="form-group">
                <label>New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="Minimum 6 characters"
                  disabled={loading}
                />
              </div>

              <div className="form-group">
                <label>Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Confirm password"
                  disabled={loading}
                />
              </div>

              <button type="submit" className="auth-btn" disabled={loading}>
                {loading ? "Resetting..." : "Reset Password"}
              </button>
            </form>
          )}

          <div className="auth-link auth-link-row">
            <Link to="/login">Back to login</Link>
            {step === "reset" && (
              <button
                type="button"
                className="inline-action-btn"
                onClick={() => {
                  setStep("email");
                  setResetToken("");
                  setNewPassword("");
                  setConfirmPassword("");
                  setEmail("");
                  setMessage(null);
                }}
              >
                Resend email
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
