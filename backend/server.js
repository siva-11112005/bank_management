const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const helmet = require("helmet");
const { apiLimiter } = require("./middleware/rateLimiters");
const cookieParser = require("cookie-parser");
const mongoSanitize = require("express-mongo-sanitize");
const csrf = require("csurf");
const connectDB = require("./config/db");
const { bootstrapAdminIdentities } = require("./utils/adminBootstrap");
const { startStandingInstructionScheduler } = require("./utils/standingInstructionScheduler");

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

// CORS configuration
const allowedOrigins = [process.env.CORS_ORIGIN, "http://localhost:3000", "http://localhost:3001"].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("CORS not allowed"));
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

// CSRF token endpoint (opt-in adoption)
const csrfProtection = csrf({
  cookie: { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production" },
});
app.get("/api/csrf-token", csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

// Health and readiness routes
app.get("/", (req, res) => {
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
  startStandingInstructionScheduler();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer();
