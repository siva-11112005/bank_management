const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const helmet = require("helmet");
const fs = require("fs");
const path = require("path");
const { apiLimiter } = require("./middleware/rateLimiters");
const cookieParser = require("cookie-parser");
const mongoSanitize = require("express-mongo-sanitize");
const csrf = require("csurf");
const connectDB = require("./config/db");
const { bootstrapAdminIdentities } = require("./utils/adminBootstrap");
const { startStandingInstructionScheduler } = require("./utils/standingInstructionScheduler");
const { startCoreBankingScheduler } = require("./utils/coreBanking/coreBankingScheduler");
const { ensureDefaultChartOfAccounts } = require("./utils/coreBanking/glService");
const { refreshMoneyOutPolicyCache } = require("./utils/moneyOutPolicy");
const { refreshRegulatoryPolicyCache } = require("./utils/regulatoryPolicy");

// Load environment variables
dotenv.config();

// Initialize express app
const app = express();

// Middleware
app.use(
  express.json({
    limit: "50mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf?.length ? buf.toString("utf8") : "";
    },
  })
);
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(cookieParser());
app.use(helmet());
app.use(mongoSanitize());

const parseOriginList = (...values) =>
  values
    .flatMap((value) => String(value || "").split(","))
    .map((entry) => entry.trim())
    .filter(Boolean);

const resolveCookieSameSite = () => {
  const configured = String(process.env.COOKIE_SAME_SITE || "")
    .trim()
    .toLowerCase();
  if (["strict", "lax", "none"].includes(configured)) {
    return configured;
  }
  return String(process.env.NODE_ENV || "development").toLowerCase() === "production" ? "none" : "strict";
};

const resolveCookieSecure = (sameSite) => {
  const configured = String(process.env.COOKIE_SECURE || "")
    .trim()
    .toLowerCase();
  if (["true", "1", "yes", "on"].includes(configured)) return true;
  if (["false", "0", "no", "off"].includes(configured)) return false;
  if (sameSite === "none") return true;
  return String(process.env.NODE_ENV || "development").toLowerCase() === "production";
};

const resolveFrontendBuildPath = () => {
  const configuredPath = String(process.env.FRONTEND_BUILD_PATH || "").trim();
  if (configuredPath) {
    return path.resolve(process.cwd(), configuredPath);
  }
  return path.resolve(__dirname, "..", "frontend", "build");
};

const frontendBuildPath = resolveFrontendBuildPath();
const frontendIndexPath = path.join(frontendBuildPath, "index.html");
const hasFrontendBuild = fs.existsSync(frontendIndexPath);

// CORS configuration
const allowedOrigins = Array.from(
  new Set([
    ...parseOriginList(process.env.CORS_ORIGIN, process.env.FRONTEND_URL),
    "http://localhost:3000",
    "http://localhost:3001",
  ])
);
const allowAllOrigins = allowedOrigins.includes("*");

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowAllOrigins || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS not allowed for origin: ${origin}`));
      }
    },
    credentials: true,
    optionsSuccessStatus: 200,
  })
);

// Global API rate limit
app.use("/api", apiLimiter);

// Routes
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/accounts", require("./routes/accountRoutes"));
app.use("/api/transactions", require("./routes/transactionRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));
app.use("/api/password", require("./routes/passwordResetRoutes"));
app.use("/api/beneficiaries", require("./routes/beneficiaryRoutes"));
app.use("/api/loans", require("./routes/loanRoutes"));
app.use("/api/payments", require("./routes/paymentRoutes"));
app.use("/api/support", require("./routes/supportRoutes"));
app.use("/api/notifications", require("./routes/notificationRoutes"));
app.use("/api/cards", require("./routes/cardRoutes"));
app.use("/api/kyc", require("./routes/kycRoutes"));
app.use("/api/core-banking", require("./routes/coreBankingRoutes"));

// CSRF token endpoint (opt-in adoption)
const csrfCookieSameSite = resolveCookieSameSite();
const csrfCookieSecure = resolveCookieSecure(csrfCookieSameSite);
const csrfProtection = csrf({
  cookie: { httpOnly: true, sameSite: csrfCookieSameSite, secure: csrfCookieSecure },
});
app.get("/api/csrf-token", csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

if (hasFrontendBuild) {
  app.use(express.static(frontendBuildPath));
}

// Health and readiness routes
app.get("/", (req, res) => {
  if (hasFrontendBuild) {
    return res.sendFile(frontendIndexPath);
  }
  res.json({ message: "Bank Management API is running" });
});
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});
app.get("/api/ready", (req, res) => {
  if (app.locals.dbReady) {
    return res.json({ status: "ready" });
  }
  return res.status(503).json({ status: "not_ready" });
});

if (hasFrontendBuild) {
  app.get(/^\/(?!api(?:\/|$)).*/, (req, res) => res.sendFile(frontendIndexPath));
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: "Internal Server Error" });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

// Start server
const PORT = process.env.PORT || 5000;
const startServer = async () => {
  await connectDB();
  app.locals.dbReady = true;
  await bootstrapAdminIdentities();
  await ensureDefaultChartOfAccounts();
  await refreshMoneyOutPolicyCache();
  await refreshRegulatoryPolicyCache();
  startStandingInstructionScheduler();
  startCoreBankingScheduler();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer();
