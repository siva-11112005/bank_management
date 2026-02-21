import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { transfer } from "../services/api";
import "./TransactionAuthorize.css";

const PENDING_TRANSFER_STORAGE_KEY = "pendingTransferDraft";
const MIN_PROCESS_MS = 2000;
const MAX_PROCESS_MS = 15000;

const normalizeAccountNumber = (value = "") => String(value || "").trim().replace(/\s+/g, "").toUpperCase();
const formatRupee = (value) => `Rs ${Number(value || 0).toFixed(2)}`;
const formatDateTime = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};
const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

const readPendingTransferDraft = () => {
  try {
    const raw = sessionStorage.getItem(PENDING_TRANSFER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (!normalizeAccountNumber(parsed.recipientAccountNumber)) return null;
    if (!Number.isFinite(Number(parsed.amount)) || Number(parsed.amount) <= 0) return null;
    return {
      recipientAccountNumber: normalizeAccountNumber(parsed.recipientAccountNumber),
      amount: Number(parsed.amount),
      description: String(parsed.description || ""),
      otpSessionId: String(parsed.otpSessionId || ""),
      otpCode: String(parsed.otpCode || ""),
      recipientName: String(parsed.recipientName || ""),
      recipientAccountMasked: String(parsed.recipientAccountMasked || ""),
      createdAt: parsed.createdAt || "",
    };
  } catch (_) {
    return null;
  }
};

const TransactionAuthorize = () => {
  const navigate = useNavigate();
  const [draft, setDraft] = useState(null);
  const [mpin, setMpin] = useState("");
  const [phase, setPhase] = useState("ready");
  const [error, setError] = useState("");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [transactionBlocked, setTransactionBlocked] = useState(false);
  const [lockedUntil, setLockedUntil] = useState("");

  const processingSecondsLeft = useMemo(
    () => Math.max(0, Math.ceil((MAX_PROCESS_MS - elapsedMs) / 1000)),
    [elapsedMs]
  );

  useEffect(() => {
    const pendingDraft = readPendingTransferDraft();
    if (!pendingDraft) {
      navigate("/transactions/quick-transfer", { replace: true });
      return;
    }
    setDraft(pendingDraft);
  }, [navigate]);

  useEffect(() => {
    if (phase !== "processing") {
      setElapsedMs(0);
      return;
    }

    const start = Date.now();
    const intervalId = window.setInterval(() => {
      setElapsedMs(Date.now() - start);
    }, 120);

    return () => window.clearInterval(intervalId);
  }, [phase]);

  const handleReenterPin = () => {
    if (transactionBlocked) return;
    setMpin("");
    setError("");
    if (phase !== "success") {
      setPhase("ready");
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!draft) return;
    if (transactionBlocked) {
      setError("Online transactions are currently blocked. Contact support or ask admin to unblock.");
      return;
    }
    if (!/^\d{4}$/.test(mpin)) {
      setError("Enter a valid 4-digit MPIN.");
      return;
    }

    setError("");
    setLockedUntil("");
    setPhase("processing");
    const startTime = Date.now();

    try {
      const response = await Promise.race([
        transfer(
          {
            recipientAccountNumber: draft.recipientAccountNumber,
            amount: draft.amount,
            description: draft.description,
            transactionPin: mpin,
            otpSessionId: draft.otpSessionId || undefined,
            otpCode: draft.otpCode || undefined,
          },
          { timeout: MAX_PROCESS_MS }
        ),
        new Promise((_, reject) => {
          window.setTimeout(() => reject(new Error("TRANSFER_TIMEOUT")), MAX_PROCESS_MS);
        }),
      ]);

      const elapsed = Date.now() - startTime;
      if (elapsed < MIN_PROCESS_MS) {
        await wait(MIN_PROCESS_MS - elapsed);
      }

      const pendingApproval = Boolean(response?.data?.pendingApproval);
      const payload = {
        amount: draft.amount,
        recipientAccountNumber: draft.recipientAccountNumber,
        recipientName: response?.data?.recipientName || draft.recipientName || "Recipient",
        recipientAccountMasked: response?.data?.recipientAccountMasked || draft.recipientAccountMasked || "",
        senderNewBalance: Number(response?.data?.senderNewBalance || 0),
        referenceId: response?.data?.senderTransactionId || "",
        approvalRequestId: response?.data?.approvalRequestId || "",
        pendingApproval,
        statusMessage: response?.data?.message || "",
        processedAt: new Date().toISOString(),
      };

      setPhase("success");
      setMpin("");
      window.setTimeout(() => {
        sessionStorage.removeItem(PENDING_TRANSFER_STORAGE_KEY);
        navigate("/transactions/quick-transfer", {
          replace: true,
          state: { transferResult: payload },
        });
      }, 1200);
    } catch (submitError) {
      const elapsed = Date.now() - startTime;
      if (elapsed < MIN_PROCESS_MS) {
        await wait(MIN_PROCESS_MS - elapsed);
      }

      const status = submitError?.response?.status;
      const message = submitError?.response?.data?.message || "";
      const blockedUntil = submitError?.response?.data?.lockedUntil || "";
      const timeoutHit = submitError?.message === "TRANSFER_TIMEOUT" || submitError?.code === "ECONNABORTED";

      if (timeoutHit) {
        setPhase("timeout");
        setError("Transaction timeout. Please re-enter MPIN and retry. If amount is debited, check transactions first.");
        return;
      }

      if (status === 423) {
        setPhase("ready");
        setTransactionBlocked(true);
        setLockedUntil(blockedUntil);
        setError(message || "Online transactions are blocked for 24 hours due to repeated invalid MPIN attempts.");
        setMpin("");
        return;
      }

      setPhase("ready");
      setTransactionBlocked(false);
      setError(message || "Unable to authorize transfer right now.");
      if (status === 401) {
        setMpin("");
      }
    }
  };

  if (!draft) {
    return (
      <div className="mpin-page">
        <div className="mpin-card">
          <p>Loading secure transfer authorization...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mpin-page">
      <div className="mpin-card">
        <h1>Secure MPIN Authorization</h1>
        <p className="mpin-subtitle">Enter your encrypted MPIN to complete this transfer.</p>

        <div className="mpin-transfer-summary">
          <p><strong>Recipient:</strong> {draft.recipientName || "Recipient"}</p>
          <p><strong>Account:</strong> {draft.recipientAccountMasked || draft.recipientAccountNumber}</p>
          <p><strong>Amount:</strong> {formatRupee(draft.amount)}</p>
          {draft.description ? <p><strong>Note:</strong> {draft.description}</p> : null}
        </div>

        <form className="mpin-form" onSubmit={handleSubmit}>
          <label htmlFor="transfer-mpin">Enter 4-digit MPIN</label>
          <input
            id="transfer-mpin"
            type="password"
            value={mpin}
            onChange={(event) => {
              const value = event.target.value.replace(/\D/g, "").slice(0, 4);
              setMpin(value);
            }}
            placeholder="****"
            maxLength={4}
            inputMode="numeric"
            disabled={phase === "processing" || phase === "success" || transactionBlocked}
            required
          />

          <div className="mpin-actions">
            <button type="submit" disabled={phase === "processing" || phase === "success" || transactionBlocked}>
              {phase === "processing" ? "Authorizing..." : "Authorize Transfer"}
            </button>
            <button
              type="button"
              className="mpin-reenter-btn"
              onClick={handleReenterPin}
              disabled={phase === "processing" || transactionBlocked}
            >
              Re-enter MPIN
            </button>
            <button
              type="button"
              className="mpin-back-btn"
              onClick={() => navigate("/transactions/quick-transfer")}
              disabled={phase === "processing" || phase === "success"}
            >
              Back to Quick Transfer
            </button>
          </div>
        </form>

        {phase === "processing" ? (
          <div className="mpin-processing-box">
            <div className="mpin-spinner" />
            <p>Encrypting MPIN and validating bank network...</p>
            <small>Timeout in {processingSecondsLeft}s</small>
          </div>
        ) : null}

        {error ? <p className="mpin-error">{error}</p> : null}
        {transactionBlocked ? (
          <div className="mpin-lock-help">
            <p>
              Transaction access is locked.{" "}
              {lockedUntil ? <>Try again after {formatDateTime(lockedUntil)} or request unblock support.</> : "Please contact support or admin for unblock."}
            </p>
            <div className="mpin-lock-actions">
              <Link to="/support">Contact Support</Link>
              <Link to="/transactions">Go to Transactions</Link>
            </div>
          </div>
        ) : null}

        <p className="mpin-footnote">
          Security rule: 3 unsuccessful MPIN attempts will block online transactions for 24 hours.
        </p>
        <p className="mpin-footlink">
          MPIN not set? <Link to="/security/transaction-pin">Set/Update MPIN</Link>
        </p>
      </div>

      {phase === "success" ? (
        <div className="mpin-success-overlay" aria-live="polite">
          <div className="mpin-success-card">
            <span className="mpin-success-tick" aria-hidden="true" />
            <h3>Authorized</h3>
            <p>Transfer verified successfully. Redirecting to quick transfer...</p>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default TransactionAuthorize;
