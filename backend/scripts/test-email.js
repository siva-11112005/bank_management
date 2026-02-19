require("dotenv").config();

const {
  isEmailConfigured,
  testEmailTransport,
  getEmailConfigDiagnostics,
  getLastEmailError,
  getEmailFailureHint,
} = require("../utils/emailService");

const mask = (value = "") => {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= 4) return "*".repeat(text.length);
  return `${text.slice(0, 2)}${"*".repeat(Math.max(1, text.length - 4))}${text.slice(-2)}`;
};

const printDiagnostics = () => {
  const diagnostics = getEmailConfigDiagnostics();
  console.log("Email config diagnostics:");
  console.log(`- mode: ${diagnostics.mode}`);
  console.log(`- service: ${diagnostics.service}`);
  console.log(`- host: ${diagnostics.host || "(not set)"}`);
  console.log(`- port: ${diagnostics.port}`);
  console.log(`- secure: ${diagnostics.secure}`);
  console.log(`- requireTLS: ${diagnostics.requireTLS}`);
  console.log(`- allowInvalidTls: ${diagnostics.allowInvalidTls}`);
  console.log(`- hasEmailUser: ${diagnostics.hasEmailUser}`);
  console.log(`- hasEmailPassword: ${diagnostics.hasEmailPassword}`);
  console.log(`- hasFromAddress: ${diagnostics.hasFromAddress}`);
  console.log(`- EMAIL_USER (masked): ${mask(process.env.EMAIL_USER || "") || "(not set)"}`);
};

const run = async () => {
  printDiagnostics();

  if (!isEmailConfigured()) {
    console.error("\nEmail transport is not configured. Set EMAIL_USER and EMAIL_PASSWORD in backend/.env.");
    process.exit(1);
  }

  const result = await testEmailTransport();
  if (result.ok) {
    console.log("\nEmail transport verification succeeded.");
    process.exit(0);
  }

  console.error("\nEmail transport verification failed.");
  console.error(`- message: ${result.message || "Unknown error"}`);
  if (result.code) console.error(`- code: ${result.code}`);
  if (result.responseCode) console.error(`- responseCode: ${result.responseCode}`);
  if (result.response) console.error(`- response: ${String(result.response).replace(/\s+/g, " ").trim()}`);

  const lastError = getLastEmailError();
  if (lastError?.command) {
    console.error(`- smtpCommand: ${lastError.command}`);
  }
  console.error(`- hint: ${getEmailFailureHint()}`);
  process.exit(1);
};

run().catch((error) => {
  console.error("email:test crashed:", error.message || error);
  process.exit(1);
});
