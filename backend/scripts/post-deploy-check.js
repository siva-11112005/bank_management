require("dotenv").config();

const http = require("http");
const https = require("https");
const { URL } = require("url");

const getArgValue = (name) => {
  const prefix = `--${name}=`;
  const arg = process.argv.find((entry) => entry.startsWith(prefix));
  return arg ? arg.slice(prefix.length).trim() : "";
};

const normalizeBaseUrl = (value) => String(value || "").trim().replace(/\/+$/, "");

const BASE_URL = normalizeBaseUrl(getArgValue("url") || process.env.API_BASE_URL || process.env.RENDER_API_URL);
const CORS_ORIGIN = String(getArgValue("origin") || process.env.CHECK_CORS_ORIGIN || "").trim();
const LOGIN_EMAIL = String(getArgValue("email") || process.env.CHECK_LOGIN_EMAIL || "").trim();
const LOGIN_PASSWORD = String(getArgValue("password") || process.env.CHECK_LOGIN_PASSWORD || "").trim();

const formatStatus = (ok) => (ok ? "PASS" : "FAIL");

const request = (method, absoluteUrl, { headers = {}, body } = {}) =>
  new Promise((resolve, reject) => {
    const parsedUrl = new URL(absoluteUrl);
    const transport = parsedUrl.protocol === "https:" ? https : http;

    const payload = body ? JSON.stringify(body) : "";
    const requestHeaders = {
      Accept: "application/json",
      ...headers,
    };

    if (payload) {
      requestHeaders["Content-Type"] = "application/json";
      requestHeaders["Content-Length"] = Buffer.byteLength(payload);
    }

    const req = transport.request(
      {
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || undefined,
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        method,
        headers: requestHeaders,
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          let data = raw;
          if ((res.headers["content-type"] || "").includes("application/json")) {
            try {
              data = raw ? JSON.parse(raw) : {};
            } catch (_) {
              // Keep raw body when JSON parse fails.
            }
          }
          resolve({
            status: Number(res.statusCode || 0),
            headers: res.headers || {},
            data,
          });
        });
      }
    );

    req.on("error", reject);
    req.setTimeout(15000, () => {
      req.destroy(new Error(`Request timeout for ${method} ${absoluteUrl}`));
    });

    if (payload) {
      req.write(payload);
    }
    req.end();
  });

const printCheck = ({ label, ok, details }) => {
  const message = `[${formatStatus(ok)}] ${label}${details ? ` -> ${details}` : ""}`;
  console.log(message);
};

const ensureBaseUrl = () => {
  if (!BASE_URL) {
    console.error("Missing API base URL.");
    console.error("Set API_BASE_URL or pass --url=https://your-backend.onrender.com");
    process.exit(1);
  }
};

const run = async () => {
  ensureBaseUrl();
  let failed = 0;
  const api = (path) => `${BASE_URL}${path}`;

  try {
    const health = await request("GET", api("/api/health"));
    const ok = health.status === 200 && health.data && health.data.status === "ok";
    printCheck({
      label: "GET /api/health",
      ok,
      details: `status=${health.status}`,
    });
    if (!ok) failed += 1;
  } catch (error) {
    failed += 1;
    printCheck({ label: "GET /api/health", ok: false, details: error.message });
  }

  try {
    const ready = await request("GET", api("/api/ready"));
    const ok = ready.status === 200 && ready.data && ready.data.status === "ready";
    printCheck({
      label: "GET /api/ready",
      ok,
      details: `status=${ready.status}`,
    });
    if (!ok) failed += 1;
  } catch (error) {
    failed += 1;
    printCheck({ label: "GET /api/ready", ok: false, details: error.message });
  }

  try {
    const csrf = await request("GET", api("/api/csrf-token"));
    const csrfToken = csrf.data && typeof csrf.data.csrfToken === "string" ? csrf.data.csrfToken : "";
    const ok = csrf.status === 200 && csrfToken.length > 0;
    printCheck({
      label: "GET /api/csrf-token",
      ok,
      details: `status=${csrf.status}${ok ? "" : ", csrf token missing"}`,
    });
    if (!ok) failed += 1;
  } catch (error) {
    failed += 1;
    printCheck({ label: "GET /api/csrf-token", ok: false, details: error.message });
  }

  if (CORS_ORIGIN) {
    try {
      const cors = await request("OPTIONS", api("/api/health"), {
        headers: {
          Origin: CORS_ORIGIN,
          "Access-Control-Request-Method": "GET",
        },
      });
      const allowOrigin = String(cors.headers["access-control-allow-origin"] || "");
      const allowCreds = String(cors.headers["access-control-allow-credentials"] || "").toLowerCase() === "true";
      const ok =
        (cors.status === 200 || cors.status === 204) &&
        (allowOrigin === CORS_ORIGIN || allowOrigin === "*") &&
        allowCreds;
      printCheck({
        label: "CORS preflight /api/health",
        ok,
        details: `status=${cors.status}, allow-origin=${allowOrigin || "(missing)"}, credentials=${allowCreds}`,
      });
      if (!ok) failed += 1;
    } catch (error) {
      failed += 1;
      printCheck({ label: "CORS preflight /api/health", ok: false, details: error.message });
    }
  } else {
    console.log("[SKIP] CORS preflight check (set CHECK_CORS_ORIGIN or --origin)");
  }

  if (LOGIN_EMAIL && LOGIN_PASSWORD) {
    try {
      const login = await request("POST", api("/api/auth/login"), {
        body: {
          email: LOGIN_EMAIL,
          password: LOGIN_PASSWORD,
        },
      });
      const token = login.data && login.data.token ? String(login.data.token) : "";
      const loginOk = login.status === 200 && Boolean(token);
      printCheck({
        label: "POST /api/auth/login",
        ok: loginOk,
        details: `status=${login.status}`,
      });
      if (!loginOk) {
        failed += 1;
      } else {
        const profile = await request("GET", api("/api/auth/profile"), {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const profileOk = profile.status === 200 && profile.data && profile.data.success === true;
        printCheck({
          label: "GET /api/auth/profile",
          ok: profileOk,
          details: `status=${profile.status}`,
        });
        if (!profileOk) failed += 1;
      }
    } catch (error) {
      failed += 1;
      printCheck({ label: "Auth flow check", ok: false, details: error.message });
    }
  } else {
    console.log("[SKIP] Login/profile check (set CHECK_LOGIN_EMAIL and CHECK_LOGIN_PASSWORD)");
  }

  if (failed > 0) {
    console.error(`\nPost-deploy checks finished with ${failed} failure(s).`);
    process.exit(1);
  }

  console.log("\nAll post-deploy checks passed.");
};

run().catch((error) => {
  console.error("post-deploy-check crashed:", error.message || error);
  process.exit(1);
});
