const nodemailer = require("nodemailer");

const parseBool = (value, defaultValue = false) => {
  if (value === undefined || value === null || value === "") return defaultValue;
  return String(value).toLowerCase() === "true";
};

const getTransportMode = () => {
  const explicit = String(process.env.EMAIL_TRANSPORT || "").toLowerCase();
  if (explicit === "smtp" || explicit === "service") {
    return explicit;
  }
  return process.env.EMAIL_HOST ? "smtp" : "service";
};

const getTransportSettings = () => {
  const mode = getTransportMode();
  const allowInvalidTls = parseBool(process.env.EMAIL_ALLOW_INVALID_TLS, false);
  const tlsOptions = allowInvalidTls ? { rejectUnauthorized: false } : undefined;

  if (mode === "smtp") {
    const host = process.env.EMAIL_HOST;
    if (!host) return null;

    const port = Number(process.env.EMAIL_PORT || 587);
    const secure = parseBool(process.env.EMAIL_SECURE, port === 465);
    const requireTLS = parseBool(process.env.EMAIL_REQUIRE_TLS, false);

    const config = {
      host,
      port,
      secure,
      requireTLS,
    };

    if (tlsOptions) {
      config.tls = tlsOptions;
    }

    if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
      config.auth = {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      };
    }

    return config;
  }

  const service = process.env.EMAIL_SERVICE || "gmail";
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
    return null;
  }

  return {
    service,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
    ...(tlsOptions ? { tls: tlsOptions } : {}),
  };
};

let transporterInstance = null;
let transporterInitialized = false;
let lastEmailError = null;

const getTransporter = () => {
  if (transporterInitialized) return transporterInstance;
  transporterInitialized = true;

  const transportSettings = getTransportSettings();
  if (!transportSettings) {
    transporterInstance = null;
    return null;
  }

  transporterInstance = nodemailer.createTransport(transportSettings);
  return transporterInstance;
};

const isEmailConfigured = () => Boolean(getTransportSettings());

const getEmailConfigDiagnostics = () => ({
  mode: getTransportMode(),
  service: process.env.EMAIL_SERVICE || "gmail",
  host: process.env.EMAIL_HOST || "",
  port: Number(process.env.EMAIL_PORT || 587),
  secure: parseBool(process.env.EMAIL_SECURE, false),
  requireTLS: parseBool(process.env.EMAIL_REQUIRE_TLS, false),
  allowInvalidTls: parseBool(process.env.EMAIL_ALLOW_INVALID_TLS, false),
  hasEmailUser: Boolean(process.env.EMAIL_USER),
  hasEmailPassword: Boolean(process.env.EMAIL_PASSWORD),
  hasFromAddress: Boolean(process.env.EMAIL_FROM_ADDRESS || process.env.EMAIL_USER),
});

const sanitizeErrorMessage = (value = "") => String(value || "").replace(/\s+/g, " ").trim();

const getLastEmailError = () => {
  if (!lastEmailError) return null;
  return {
    message: sanitizeErrorMessage(lastEmailError.message),
    code: lastEmailError.code || "",
    responseCode: Number(lastEmailError.responseCode || 0),
    response: sanitizeErrorMessage(lastEmailError.response),
    command: lastEmailError.command || "",
  };
};

const deriveEmailFailureHint = (error) => {
  if (!error) {
    return "Email delivery failed. Please verify EMAIL_* configuration.";
  }

  if (error.code === "EAUTH" || error.responseCode === 535 || error.responseCode === 534) {
    return "SMTP authentication failed. For Gmail, enable 2-Step Verification and use a 16-digit App Password in EMAIL_PASSWORD (not normal Gmail password).";
  }

  if (
    error.code === "ESOCKET" ||
    error.code === "ECONNECTION" ||
    error.code === "ETIMEDOUT" ||
    /certificate|self[- ]signed|unable to verify/i.test(`${error.message} ${error.response}`)
  ) {
    return "SMTP TLS/network connection failed. Check EMAIL_HOST/EMAIL_PORT and firewall. Use EMAIL_ALLOW_INVALID_TLS=true only for local testing.";
  }

  if (error.code === "EENVELOPE" || error.responseCode === 550) {
    return "Recipient email was rejected by SMTP server. Verify destination email address and sender domain policy.";
  }

  return `Email delivery failed (${error.code || "SMTP_ERROR"}). Check SMTP settings and provider security restrictions.`;
};

const getEmailFailureHint = (errorDetails = null) => deriveEmailFailureHint(errorDetails || getLastEmailError());

const getFromAddress = () => {
  const fromAddress = process.env.EMAIL_FROM_ADDRESS || process.env.EMAIL_USER || "";
  if (!fromAddress) return "";

  const fromName = process.env.EMAIL_FROM_NAME || "BankEase";
  return fromName ? `"${fromName}" <${fromAddress}>` : fromAddress;
};

const sendMail = async ({ to, subject, html, throwOnError = false }) => {
  const transporter = getTransporter();
  if (!transporter) {
    const error = new Error("Email transporter is not configured. Use Nodemailer env settings.");
    lastEmailError = error;
    if (throwOnError) throw error;
    console.error(error.message);
    return false;
  }

  try {
    await transporter.sendMail({
      from: getFromAddress() || process.env.EMAIL_USER,
      to,
      subject,
      html,
    });
    lastEmailError = null;
    return true;
  } catch (error) {
    lastEmailError = error;
    console.error("Error sending email:", error);
    if (throwOnError) throw error;
    return false;
  }
};

const testEmailTransport = async () => {
  const transporter = getTransporter();
  if (!transporter) {
    return {
      configured: false,
      ok: false,
      message: "Email transporter is not configured. Check EMAIL_* environment values.",
    };
  }

  try {
    await transporter.verify();
    lastEmailError = null;
    return {
      configured: true,
      ok: true,
      message: "Email transporter verification succeeded.",
    };
  } catch (error) {
    lastEmailError = error;
    return {
      configured: true,
      ok: false,
      message: error?.message || "Email transporter verification failed.",
      code: error?.code || "",
      response: error?.response || "",
      responseCode: error?.responseCode || 0,
    };
  }
};

// Send password reset email
const sendPasswordResetEmail = async (email, resetToken, userName) => {
  const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

  const htmlTemplate = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #1e3a8a 0%, #0f766e 100%); color: white; padding: 20px; border-radius: 8px; text-align: center; }
          .content { padding: 20px 0; }
          .button { background: #1e3a8a; color: white; padding: 12px 30px; border-radius: 8px; text-decoration: none; display: inline-block; margin: 20px 0; }
          .footer { color: #666; font-size: 12px; margin-top: 20px; }
          .warning { color: #ef4444; font-size: 12px; margin-top: 10px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>BankEase Password Reset</h1>
          </div>
          <div class="content">
            <p>Hi ${userName},</p>
            <p>We received a request to reset your password. Click the button below to create a new password:</p>
            <a href="${resetLink}" class="button">Reset Password</a>
            <p>Or copy and paste this link in your browser:</p>
            <p style="word-break: break-all; color: #666; font-size: 12px;">${resetLink}</p>
            <div class="warning">
              <p>This link expires in 1 hour and can only be used once.</p>
              <p>If you didn't request a password reset, please ignore this email or contact support.</p>
            </div>
          </div>
          <div class="footer">
            <p>Copyright 2026 BankEase. All rights reserved.</p>
            <p>This is an automated email. Please do not reply.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const sent = await sendMail({
    to: email,
    subject: "BankEase - Password Reset Request",
    html: htmlTemplate,
    throwOnError: true,
  });

  return Boolean(sent);
};

// Send welcome email
const sendWelcomeEmail = async (email, userName) => {
  const htmlTemplate = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #1e3a8a 0%, #0f766e 100%); color: white; padding: 20px; border-radius: 8px; text-align: center; }
          .content { padding: 20px 0; }
          .button { background: #1e3a8a; color: white; padding: 12px 30px; border-radius: 8px; text-decoration: none; display: inline-block; margin: 20px 0; }
          .footer { color: #666; font-size: 12px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to BankEase!</h1>
          </div>
          <div class="content">
            <p>Hi ${userName},</p>
            <p>Thank you for creating an account with BankEase. We're excited to help you manage your finances securely and easily.</p>
            <p>Your account is now active and ready to use. Log in to access your dashboard and start banking with us.</p>
            <a href="${process.env.FRONTEND_URL}/login" class="button">Login to Dashboard</a>
            <p>If you have any questions, feel free to contact our support team.</p>
          </div>
          <div class="footer">
            <p>Copyright 2026 BankEase. All rights reserved.</p>
            <p>This is an automated email. Please do not reply.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendMail({
    to: email,
    subject: "Welcome to BankEase!",
    html: htmlTemplate,
  });
};

const sendOtpEmail = async (email, code, userName, context = {}) => {
  const purpose = context.purpose || "BENEFICIARY_VERIFY";
  const isTransferOtp = purpose === "TRANSFER_VERIFY";
  const isProfileOtp = purpose === "PROFILE_UPDATE_VERIFY";

  let title = "BankEase OTP Verification";
  let subject = "BankEase OTP Verification";
  let message = `Use this OTP to continue your request.`;

  if (isTransferOtp) {
    title = "BankEase Transfer Authorization";
    subject = "BankEase Transfer OTP Verification";
    message = `Use this OTP to authorize your transfer of <strong>Rs ${Number(context.amount || 0).toFixed(2)}</strong> to account <strong>${context.accountNumber || ""}</strong>.`;
  } else if (isProfileOtp) {
    title = "BankEase Profile Update Verification";
    subject = "BankEase Profile Update OTP";
    message = `Use this OTP to confirm changes to your profile. If you did not request profile changes, do not share this OTP.`;
  } else {
    title = "BankEase Beneficiary Verification";
    subject = "BankEase OTP Verification";
    message = `Use the following OTP to verify beneficiary <strong>${context.name || ""}</strong> (${context.accountNumber || ""}):`;
  }

  const html = `
    <html>
      <body style="font-family: Arial, sans-serif;">
        <div style="max-width:600px;margin:0 auto;padding:20px;">
          <div style="background:linear-gradient(135deg,#1e3a8a,#0f766e);color:#fff;padding:16px;border-radius:8px;text-align:center;">
            <h2>${title}</h2>
          </div>
          <p>Hi ${userName},</p>
          <p>${message}</p>
          <div style="font-size:24px;font-weight:bold;letter-spacing:4px;background:#f3f4f6;padding:12px;border-radius:8px;text-align:center;">${code}</div>
          <p>This code expires in 10 minutes.</p>
          <p style="color:#666;font-size:12px;">If you didn't request this, please ignore.</p>
          <p style="color:#666;font-size:12px;">Copyright 2026 BankEase</p>
        </div>
      </body>
    </html>`;

  return sendMail({
    to: email,
    subject,
    html,
  });
};

const sendApprovalDecisionEmail = async ({
  email,
  userName,
  actionType,
  targetType,
  decision,
  reviewNote,
  executionMessage,
  requestId,
}) => {
  const safeDecision = String(decision || "UPDATED").toUpperCase();
  const safeAction = String(actionType || "ADMIN_ACTION").toUpperCase();
  const safeTarget = String(targetType || "TARGET").toUpperCase();
  const note = String(reviewNote || "").trim();
  const result = String(executionMessage || "").trim();

  const subject = `BankIndia Approval Update: ${safeDecision}`;
  const html = `
    <html>
      <body style="font-family: Arial, sans-serif;">
        <div style="max-width:600px;margin:0 auto;padding:20px;">
          <div style="background:linear-gradient(135deg,#1e3a8a,#0f766e);color:#fff;padding:16px;border-radius:8px;text-align:center;">
            <h2>Approval Request ${safeDecision}</h2>
          </div>
          <p>Hi ${userName || "User"},</p>
          <p>Your admin approval request has been reviewed.</p>
          <ul>
            <li><strong>Request ID:</strong> ${requestId || "-"}</li>
            <li><strong>Action Type:</strong> ${safeAction}</li>
            <li><strong>Target Type:</strong> ${safeTarget}</li>
            <li><strong>Decision:</strong> ${safeDecision}</li>
            <li><strong>Review Note:</strong> ${note || "No review note added."}</li>
            <li><strong>Execution Result:</strong> ${result || "No execution details available."}</li>
          </ul>
          <p style="color:#666;font-size:12px;">Copyright 2026 BankEase</p>
        </div>
      </body>
    </html>`;

  return sendMail({
    to: email,
    subject,
    html,
  });
};

module.exports = {
  isEmailConfigured,
  testEmailTransport,
  getEmailConfigDiagnostics,
  getLastEmailError,
  getEmailFailureHint,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendOtpEmail,
  sendApprovalDecisionEmail,
};
