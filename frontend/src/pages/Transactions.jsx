import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  getMyTransactions,
  listBeneficiaries,
  addBeneficiary,
  verifyBeneficiary,
  resendBeneficiaryOtp,
  removeBeneficiary,
  resolveRecipient,
  getProfile,
  getTransactionSecurityRules,
  requestTransferOtp,
  getMonthlyStatementPdf,
  getStandingInstructions,
  createStandingInstruction,
  updateStandingInstructionStatus,
  executeStandingInstructionNow,
  deleteStandingInstruction,
  extendStandingInstruction,
} from "../services/api";
import "./Transactions.css";

const typeToLabel = {
  DEPOSIT: "Deposit",
  WITHDRAWAL: "Withdrawal",
  TRANSFER: "Transfer",
  LOAN_PAYMENT: "Loan Payment",
  PAYMENT_CREDIT: "Payment Credit",
  PAYMENT_REFUND: "Payment Refund",
};

const typeToClass = {
  DEPOSIT: "deposit",
  WITHDRAWAL: "withdrawal",
  TRANSFER: "transfer",
  LOAN_PAYMENT: "loan",
  PAYMENT_CREDIT: "deposit",
  PAYMENT_REFUND: "withdrawal",
};

const quickAmounts = [1000, 5000, 10000];
const formatRupee = (value) => `Rs ${Number(value || 0).toFixed(2)}`;
const standingFrequencies = ["DAILY", "WEEKLY", "MONTHLY"];
const normalizeAccountNumber = (value = "") => String(value || "").replace(/\s+/g, "").toUpperCase();
const PENDING_TRANSFER_STORAGE_KEY = "pendingTransferDraft";

const normalizeDateInput = (value = "") => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{2}-\d{2}-\d{4}$/.test(raw)) {
    const [day, month, year] = raw.split("-");
    return `${year}-${month}-${day}`;
  }
  return raw;
};

const toIsoStartOfDay = (value = "") => {
  const raw = normalizeDateInput(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";

  const [yearText, monthText, dayText] = raw.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return "";
  if (year < 1900 || year > 2100) return "";
  if (month < 1 || month > 12) return "";
  if (day < 1 || day > 31) return "";

  const date = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  const isSameDate =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;

  if (!isSameDate) return "";
  return date.toISOString();
};

const Transactions = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState([]);
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [resolvingRecipient, setResolvingRecipient] = useState(false);
  const [requestingTransferOtp, setRequestingTransferOtp] = useState(false);
  const [hasTransactionPin, setHasTransactionPin] = useState(false);
  const [securityRules, setSecurityRules] = useState(null);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [recipientPreview, setRecipientPreview] = useState(null);
  const [recipientConfirmed, setRecipientConfirmed] = useState(false);
  const [transferResult, setTransferResult] = useState(null);
  const [otpExpiresAt, setOtpExpiresAt] = useState("");
  const [statementYear, setStatementYear] = useState(String(new Date().getFullYear()));
  const [statementMonth, setStatementMonth] = useState(String(new Date().getMonth() + 1).padStart(2, "0"));
  const [downloadingStatement, setDownloadingStatement] = useState(false);
  const [beneficiarySubmitting, setBeneficiarySubmitting] = useState(false);
  const [beneficiaryActionLoading, setBeneficiaryActionLoading] = useState("");
  const [beneficiaryForm, setBeneficiaryForm] = useState({
    name: "",
    accountNumber: "",
    ifscCode: "",
  });
  const [beneficiaryVerification, setBeneficiaryVerification] = useState({
    beneficiaryId: "",
    code: "",
  });
  const [formData, setFormData] = useState({
    beneficiaryAccountNumber: "",
    recipientAccountNumber: "",
    amount: "",
    description: "",
    otpSessionId: "",
    otpCode: "",
  });
  const [standingInstructions, setStandingInstructions] = useState([]);
  const [standingSummary, setStandingSummary] = useState({ total: 0, active: 0, paused: 0, completed: 0 });
  const [standingSubmitting, setStandingSubmitting] = useState(false);
  const [standingActionLoading, setStandingActionLoading] = useState("");
  const [standingExecutePins, setStandingExecutePins] = useState({});
  const [standingForm, setStandingForm] = useState({
    beneficiaryAccountNumber: "",
    recipientAccountNumber: "",
    amount: "",
    frequency: "MONTHLY",
    description: "",
    startDate: "",
    maxExecutions: "",
    transactionPin: "",
  });
  const [pendingStandingInstruction, setPendingStandingInstruction] = useState(null);
  const [extendForm, setExtendForm] = useState({
    instructionId: "",
    additionalExecutions: "",
    mpin: "",
    isEncrypting: false,
  });
  const [extendLoading, setExtendLoading] = useState(false);
  const [extendingInstructionId, setExtendingInstructionId] = useState("");

  const transferAmount = parseFloat(formData.amount);
  const isQuickTransferPage = location.pathname === "/transactions/quick-transfer";
  const isStandingInstructionSecurePage = location.pathname === "/transactions/standing-instruction-secure";
  const requiresVerifiedBeneficiary = Boolean(
    securityRules?.requireVerifiedBeneficiary ?? securityRules?.enforceBeneficiary
  );
  const highValueOtpRequired =
    Boolean(securityRules?.requireTransferOtpForHighValue) &&
    Number.isFinite(transferAmount) &&
    transferAmount >= Number(securityRules?.highValueTransferThreshold || 0);

  useEffect(() => {
    if (isStandingInstructionSecurePage) {
      document.body.classList.add("transfer-modal-open");
    } else {
      document.body.classList.remove("transfer-modal-open");
    }
    return () => {
      document.body.classList.remove("transfer-modal-open");
    };
  }, [isStandingInstructionSecurePage]);

  useEffect(() => {
    if (!isStandingInstructionSecurePage) return;
    const pendingData = location.state?.pendingInstruction;
    if (!pendingData) return;
    setPendingStandingInstruction(pendingData);
  }, [isStandingInstructionSecurePage, location.state]);

  useEffect(() => {
    if (isQuickTransferPage) {
      document.body.classList.add("transfer-modal-open");
    } else {
      document.body.classList.remove("transfer-modal-open");
    }
    return () => {
      document.body.classList.remove("transfer-modal-open");
    };
  }, [isQuickTransferPage]);

  useEffect(() => {
    if (!isQuickTransferPage) return;

    const params = new URLSearchParams(location.search);
    const recipient = normalizeAccountNumber(params.get("recipient") || "");
    if (!recipient) return;

    setFormData((current) => ({
      ...current,
      beneficiaryAccountNumber: recipient,
      recipientAccountNumber: recipient,
      otpSessionId: "",
      otpCode: "",
    }));
    setRecipientPreview(null);
    setRecipientConfirmed(false);
    setOtpExpiresAt("");
    handleResolveRecipient(recipient, { silentMessage: true });
  }, [isQuickTransferPage, location.search]);

  useEffect(() => {
    const result = location.state?.transferResult;
    if (!isQuickTransferPage || !result) return;
    setTransferResult(result);
  }, [isQuickTransferPage, location.state]);

  useEffect(() => {
    fetchTransactions();
    fetchBeneficiaries();
    fetchTransactionSecurity();
    fetchStandingInstructions();
  }, []);

  const fetchTransactionSecurity = async () => {
    try {
      const [profileResponse, rulesResponse] = await Promise.all([getProfile(), getTransactionSecurityRules()]);

      if (profileResponse.data.success) {
        setHasTransactionPin(Boolean(profileResponse.data.user?.hasTransactionPin));
      }

      if (rulesResponse.data.success) {
        setSecurityRules(rulesResponse.data.rules || null);
      }
    } catch (_) {}
  };

  const fetchTransactions = async () => {
    try {
      const response = await getMyTransactions();
      if (response.data.success) {
        setTransactions(response.data.transactions || []);
      }
    } catch (error) {
      setMessage({ type: "error", text: error.response?.data?.message || "Failed to fetch transactions" });
    } finally {
      setLoading(false);
    }
  };

  const fetchBeneficiaries = async () => {
    try {
      const response = await listBeneficiaries();
      if (response.data.success) {
        setBeneficiaries(response.data.beneficiaries || []);
      }
    } catch (_) {}
  };

  const fetchStandingInstructions = async () => {
    try {
      const response = await getStandingInstructions();
      if (response.data.success) {
        setStandingInstructions(response.data.instructions || []);
        setStandingSummary(response.data.summary || { total: 0, active: 0, paused: 0, completed: 0 });
      }
    } catch (_) {}
  };

  const pickBeneficiaryAccount = (accountNumber) => {
    const recipient = normalizeAccountNumber(accountNumber);
    if (!recipient) {
      navigate("/transactions/quick-transfer");
      return;
    }
    navigate(`/transactions/quick-transfer?recipient=${encodeURIComponent(recipient)}`);
  };

  const closeQuickTransfer = () => {
    sessionStorage.removeItem(PENDING_TRANSFER_STORAGE_KEY);
    setRecipientPreview(null);
    setRecipientConfirmed(false);
    setTransferResult(null);
    setOtpExpiresAt("");
    navigate("/transactions");
  };

  const closeStandingInstructionSecure = () => {
    setPendingStandingInstruction(null);
    setStandingForm({
      beneficiaryAccountNumber: "",
      recipientAccountNumber: "",
      amount: "",
      frequency: "MONTHLY",
      description: "",
      startDate: "",
      maxExecutions: "",
      transactionPin: "",
    });
    navigate("/transactions");
  };

  const handleStandingInstructionMpinChange = (value) => {
    if (!/^\d*$/.test(value) || value.length > 4) return;
    setStandingForm((current) => ({ ...current, transactionPin: value }));
  };

  const handleSubmitStandingInstructionWithMpin = async (event) => {
    event?.preventDefault?.();
    setMessage({ type: "", text: "" });

    if (!pendingStandingInstruction) {
      setMessage({ type: "error", text: "Invalid standing instruction data." });
      return;
    }

    if (!/^\d{4}$/.test(standingForm.transactionPin)) {
      setMessage({ type: "error", text: "Enter your 4-digit MPIN to authorize." });
      return;
    }

    setStandingSubmitting(true);
    setStandingForm((current) => ({ ...current, isEncrypting: true }));

    try {
      // Simulate encryption
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const payload = {
        ...pendingStandingInstruction,
        transactionPin: standingForm.transactionPin,
      };

      const response = await createStandingInstruction(payload);
      if (response.data.success) {
        setMessage({ type: "success", text: response.data.message || "Standing instruction created successfully." });
        await new Promise((resolve) => setTimeout(resolve, 1500));
        closeStandingInstructionSecure();
        fetchStandingInstructions();
      }
    } catch (error) {
      setMessage({ type: "error", text: error.response?.data?.message || "Unable to create standing instruction." });
    } finally {
      setStandingSubmitting(false);
      setStandingForm((current) => ({ ...current, isEncrypting: false }));
    }
  };

  const handleBeneficiaryFormChange = (event) => {
    const { name, value } = event.target;
    setBeneficiaryForm((current) => ({
      ...current,
      [name]: name === "ifscCode" ? value.toUpperCase() : value,
    }));
  };

  const handleAddBeneficiary = async (event) => {
    event.preventDefault();
    setMessage({ type: "", text: "" });
    setBeneficiarySubmitting(true);
    try {
      const payload = {
        name: String(beneficiaryForm.name || "").trim(),
        accountNumber: normalizeAccountNumber(beneficiaryForm.accountNumber || ""),
        ifscCode: String(beneficiaryForm.ifscCode || "").trim().toUpperCase(),
      };
      const response = await addBeneficiary(payload);
      if (response.data.success) {
        const fallbackOtpCopy =
          response.data.fallbackOtpMode && response.data.devOtpCode
            ? ` Fallback OTP: ${response.data.devOtpCode}`
            : "";
        setMessage({
          type: "success",
          text: `${response.data.message || "Beneficiary added. Verify using OTP."}${fallbackOtpCopy}`,
        });
        setBeneficiaryForm({ name: "", accountNumber: "", ifscCode: "" });
        setBeneficiaryVerification({
          beneficiaryId: response.data.beneficiary?._id || "",
          code: "",
        });
        fetchBeneficiaries();
      }
    } catch (error) {
      setMessage({ type: "error", text: error.response?.data?.message || "Unable to add beneficiary." });
    } finally {
      setBeneficiarySubmitting(false);
    }
  };

  const handleVerifyBeneficiary = async (event) => {
    event.preventDefault();
    if (!beneficiaryVerification.beneficiaryId || !/^\d{6}$/.test(beneficiaryVerification.code)) {
      setMessage({ type: "error", text: "Enter valid beneficiary and 6-digit OTP." });
      return;
    }

    setBeneficiaryActionLoading(`verify-${beneficiaryVerification.beneficiaryId}`);
    try {
      const response = await verifyBeneficiary({
        beneficiaryId: beneficiaryVerification.beneficiaryId,
        code: beneficiaryVerification.code,
      });
      if (response.data.success) {
        setMessage({ type: "success", text: response.data.message || "Beneficiary verified." });
        setBeneficiaryVerification({ beneficiaryId: "", code: "" });
        fetchBeneficiaries();
      }
    } catch (error) {
      setMessage({ type: "error", text: error.response?.data?.message || "Beneficiary verification failed." });
    } finally {
      setBeneficiaryActionLoading("");
    }
  };

  const handleResendBeneficiaryOtp = async (beneficiaryId) => {
    setBeneficiaryActionLoading(`resend-${beneficiaryId}`);
    try {
      const response = await resendBeneficiaryOtp(beneficiaryId);
      if (response.data.success) {
        const fallbackOtpCopy =
          response.data.fallbackOtpMode && response.data.devOtpCode
            ? ` Fallback OTP: ${response.data.devOtpCode}`
            : "";
        setMessage({ type: "success", text: `${response.data.message || "OTP sent successfully."}${fallbackOtpCopy}` });
      }
    } catch (error) {
      setMessage({ type: "error", text: error.response?.data?.message || "Unable to resend OTP." });
    } finally {
      setBeneficiaryActionLoading("");
    }
  };

  const handleDeleteBeneficiary = async (beneficiaryId) => {
    setBeneficiaryActionLoading(`delete-${beneficiaryId}`);
    try {
      const response = await removeBeneficiary(beneficiaryId);
      if (response.data.success) {
        setMessage({ type: "success", text: response.data.message || "Beneficiary removed." });
        if (beneficiaryVerification.beneficiaryId === beneficiaryId) {
          setBeneficiaryVerification({ beneficiaryId: "", code: "" });
        }
        fetchBeneficiaries();
      }
    } catch (error) {
      setMessage({ type: "error", text: error.response?.data?.message || "Unable to remove beneficiary." });
    } finally {
      setBeneficiaryActionLoading("");
    }
  };

  const handleResolveRecipient = async (accountNumber, options = {}) => {
    const normalizedAccount = normalizeAccountNumber(accountNumber);
    if (!normalizedAccount) return;
    if (!options.silentMessage) {
      setMessage({ type: "", text: "" });
    }
    setResolvingRecipient(true);
    setRecipientPreview(null);
    setRecipientConfirmed(false);
    try {
      const response = await resolveRecipient({ accountNumber: normalizedAccount });
      if (response.data.success) {
        const responseRecipient = response.data.recipient || {};
        const recipient = {
          ...responseRecipient,
          accountNumber: normalizeAccountNumber(responseRecipient.accountNumber || normalizedAccount),
          accountNumberMasked: responseRecipient.accountNumberMasked || normalizedAccount,
        };
        setFormData((current) => ({
          ...current,
          beneficiaryAccountNumber: current.beneficiaryAccountNumber || normalizedAccount,
          recipientAccountNumber: normalizedAccount,
          otpSessionId: "",
          otpCode: "",
        }));
        setRecipientPreview(recipient);
        if (!options.silentMessage) {
          const verifiedName = recipient.fullName || "Recipient";
          setMessage({
            type: "success",
            text: `Recipient details found: ${verifiedName}. You can proceed with MPIN.`,
          });
        }
      }
    } catch (error) {
      setMessage({ type: "error", text: error.response?.data?.message || "Unable to verify recipient." });
    } finally {
      setResolvingRecipient(false);
    }
  };

  const handleTransfer = async (event) => {
    event.preventDefault();
    setMessage({ type: "", text: "" });
    const normalizedRecipient = normalizeAccountNumber(formData.recipientAccountNumber);

    if (!normalizedRecipient) {
      setMessage({ type: "error", text: "Enter valid recipient account number." });
      return;
    }

    if (!hasTransactionPin) {
      setMessage({ type: "error", text: "Set your transaction PIN before sending money." });
      return;
    }

    if (!Number.isFinite(transferAmount) || transferAmount <= 0) {
      setMessage({ type: "error", text: "Enter a valid amount." });
      return;
    }

    if (securityRules && transferAmount > Number(securityRules.maxSingleTransfer || 0)) {
      setMessage({
        type: "error",
        text: `Single transfer limit is ${formatRupee(securityRules.maxSingleTransfer)}.`,
      });
      return;
    }

    if (securityRules && transferAmount > Number(securityRules.remainingTransfer || 0)) {
      setMessage({
        type: "error",
        text: `Daily transfer limit reached. Remaining today: ${formatRupee(securityRules.remainingTransfer)}.`,
      });
      return;
    }

    if (securityRules && requiresVerifiedBeneficiary && !recipientPreview?.isVerifiedBeneficiary) {
      setMessage({
        type: "error",
        text: "This transfer requires a verified beneficiary. Verify recipient first.",
      });
      return;
    }

    if (highValueOtpRequired) {
      if (!formData.otpSessionId || !/^\d{6}$/.test(formData.otpCode)) {
        setMessage({ type: "error", text: "High-value transfer requires valid email OTP verification." });
        return;
      }
    }

    setSubmitting(true);
    try {
      const draftPayload = {
        recipientAccountNumber: normalizedRecipient,
        amount: transferAmount,
        description: formData.description,
        otpSessionId: highValueOtpRequired ? formData.otpSessionId : undefined,
        otpCode: highValueOtpRequired ? formData.otpCode : undefined,
        recipientName: recipientPreview?.fullName || "",
        recipientAccountMasked: recipientPreview?.accountNumberMasked || "",
        isVerifiedBeneficiary: Boolean(recipientPreview?.isVerifiedBeneficiary),
        createdAt: new Date().toISOString(),
      };
      sessionStorage.setItem(PENDING_TRANSFER_STORAGE_KEY, JSON.stringify(draftPayload));
      navigate("/transactions/authorize");
    } catch (error) {
      setMessage({ type: "error", text: error.response?.data?.message || "Unable to continue to MPIN authorization." });
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    if (name === "otpCode") {
      if (!/^\d*$/.test(value) || value.length > 6) return;
    }

    const nextValue = name === "recipientAccountNumber" ? normalizeAccountNumber(value) : value;
    setFormData((current) => {
      const next = { ...current, [name]: nextValue };
      if (name === "recipientAccountNumber" || name === "amount") {
        next.otpSessionId = "";
        next.otpCode = "";
      }
      return next;
    });

    if (name === "recipientAccountNumber" || name === "amount") {
      setOtpExpiresAt("");
    }

    if (name === "recipientAccountNumber") {
      setRecipientPreview(null);
      setRecipientConfirmed(false);
    }
  };

  const handleBeneficiaryPick = (event) => {
    const accountNumber = normalizeAccountNumber(event.target.value);
    setFormData((current) => ({
      ...current,
      beneficiaryAccountNumber: accountNumber,
      recipientAccountNumber: accountNumber,
      otpSessionId: "",
      otpCode: "",
    }));
    setRecipientPreview(null);
    setRecipientConfirmed(false);
    setOtpExpiresAt("");
    if (accountNumber) {
      handleResolveRecipient(accountNumber, { silentMessage: true });
    }
  };

  const handleQuickAmount = (value) => {
    setFormData((current) => ({ ...current, amount: String(value), otpSessionId: "", otpCode: "" }));
    setOtpExpiresAt("");
  };

  const handleStandingChange = (event) => {
    const { name, value } = event.target;
    if (name === "maxExecutions") {
      if (!/^\d*$/.test(value)) return;
      if (value && Number(value) > 10) return; // Max 10 executions
    }
    if (name === "amount" && !/^\d*\.?\d*$/.test(value)) return;
    setStandingForm((current) => ({ ...current, [name]: value }));
  };

  const handleStandingBeneficiaryPick = (event) => {
    const accountNumber = normalizeAccountNumber(event.target.value);
    setStandingForm((current) => ({
      ...current,
      beneficiaryAccountNumber: accountNumber,
      recipientAccountNumber: accountNumber,
    }));
  };

  const getMinDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const handleCreateStandingInstruction = async (event) => {
    event.preventDefault();
    setMessage({ type: "", text: "" });

    if (!hasTransactionPin) {
      setMessage({ type: "error", text: "Set your transaction PIN before creating standing instructions." });
      return;
    }

    const amountValue = Number(standingForm.amount);
    if (!standingForm.recipientAccountNumber) {
      setMessage({ type: "error", text: "Enter recipient account number." });
      return;
    }
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setMessage({ type: "error", text: "Enter valid standing instruction amount." });
      return;
    }
    if (standingForm.maxExecutions && Number(standingForm.maxExecutions) > 10) {
      setMessage({ type: "error", text: "Maximum executions cannot exceed 10." });
      return;
    }

    // Navigate to secure page for MPIN entry
    const pendingData = {
      recipientAccountNumber: normalizeAccountNumber(standingForm.recipientAccountNumber),
      amount: amountValue,
      frequency: standingForm.frequency,
      description: standingForm.description,
      startDate: standingForm.startDate ? new Date(`${standingForm.startDate}T00:00:00`).toISOString() : undefined,
      maxExecutions: standingForm.maxExecutions ? Number(standingForm.maxExecutions) : undefined,
    };

    navigate("/transactions/standing-instruction-secure", {
      state: { pendingInstruction: pendingData },
    });
  };

  const handleToggleStandingInstruction = async (instruction, active) => {
    setStandingActionLoading(`status-${instruction._id}`);
    try {
      const response = await updateStandingInstructionStatus(instruction._id, active);
      if (response.data.success) {
        setMessage({ type: "success", text: response.data.message || "Instruction status updated." });
        fetchStandingInstructions();
      }
    } catch (error) {
      setMessage({ type: "error", text: error.response?.data?.message || "Unable to update instruction status." });
    } finally {
      setStandingActionLoading("");
    }
  };

  const handleStandingExecutePinChange = (instructionId, value) => {
    if (!/^\d*$/.test(value) || value.length > 4) return;
    setStandingExecutePins((current) => ({ ...current, [instructionId]: value }));
  };

  const handleExecuteStandingNow = async (instructionId) => {
    const pin = standingExecutePins[instructionId] || "";
    if (!/^\d{4}$/.test(pin)) {
      setMessage({ type: "error", text: "Enter valid 4-digit PIN to execute instruction now." });
      return;
    }

    setStandingActionLoading(`run-${instructionId}`);
    try {
      const response = await executeStandingInstructionNow(instructionId, pin);
      if (response.data.success) {
        setMessage({ type: "success", text: response.data.message || "Standing instruction executed." });
        setStandingExecutePins((current) => ({ ...current, [instructionId]: "" }));
        fetchStandingInstructions();
        fetchTransactions();
        fetchTransactionSecurity();
      }
    } catch (error) {
      setMessage({ type: "error", text: error.response?.data?.message || "Unable to execute standing instruction." });
    } finally {
      setStandingActionLoading("");
    }
  };

  const handleDeleteStandingInstruction = async (instructionId) => {
    setStandingActionLoading(`delete-${instructionId}`);
    try {
      const response = await deleteStandingInstruction(instructionId);
      if (response.data.success) {
        setMessage({ type: "success", text: response.data.message || "Instruction cancelled successfully." });
        fetchStandingInstructions();
      }
    } catch (error) {
      setMessage({ type: "error", text: error.response?.data?.message || "Unable to cancel standing instruction." });
    } finally {
      setStandingActionLoading("");
    }
  };

  const handleOpenExtendForm = (instructionId) => {
    setExtendingInstructionId(instructionId);
    setExtendForm({
      instructionId,
      additionalExecutions: "",
      mpin: "",
      isEncrypting: false,
    });
  };

  const handleCloseExtendForm = () => {
    setExtendingInstructionId("");
    setExtendForm({
      instructionId: "",
      additionalExecutions: "",
      mpin: "",
      isEncrypting: false,
    });
  };

  const handleExtendChange = (event) => {
    const { name, value } = event.target;
    if (name === "mpin" && (!/^\d*$/.test(value) || value.length > 4)) return;
    if (name === "additionalExecutions" && !/^\d*$/.test(value)) return;
    setExtendForm((current) => ({ ...current, [name]: value }));
  };

  const handleExtendStandingInstruction = async (event) => {
    event?.preventDefault?.();
    setMessage({ type: "", text: "" });

    if (!extendForm.instructionId) {
      setMessage({ type: "error", text: "Invalid instruction." });
      return;
    }

    const additionalExec = Number(extendForm.additionalExecutions || 0);
    if (!Number.isFinite(additionalExec) || additionalExec <= 0) {
      setMessage({ type: "error", text: "Enter valid additional executions." });
      return;
    }

    if (additionalExec > 10) {
      setMessage({ type: "error", text: "Cannot extend by more than 10 executions." });
      return;
    }

    if (!/^\d{4}$/.test(extendForm.mpin)) {
      setMessage({ type: "error", text: "Enter your 4-digit MPIN to authorize extension." });
      return;
    }

    setExtendLoading(true);
    setExtendForm((current) => ({ ...current, isEncrypting: true }));

    try {
      // Simulate encryption delay
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const payload = {
        additionalExecutions: additionalExec,
        mpin: extendForm.mpin,
      };

      // Call API to extend standing instruction
      const response = await extendStandingInstruction(extendForm.instructionId, payload);
      if (response.data.success) {
        const instruction = response.data.instruction;
        const newMaxExecutions = instruction.maxExecutions || 0;
        setMessage({
          type: "success",
          text: response.data.message || `Extended by ${additionalExec} executions. New total: ${newMaxExecutions}`,
        });
        handleCloseExtendForm();
        await new Promise((resolve) => setTimeout(resolve, 1000));
        fetchStandingInstructions();
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: error.response?.data?.message || "Unable to extend standing instruction.",
      });
    } finally {
      setExtendLoading(false);
      setExtendForm((current) => ({ ...current, isEncrypting: false }));
    }
  };

  const formatDateTime = (value) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleRequestOtp = async () => {
    setMessage({ type: "", text: "" });
    const normalizedRecipient = normalizeAccountNumber(formData.recipientAccountNumber);

    if (!Number.isFinite(transferAmount) || transferAmount <= 0 || !normalizedRecipient) {
      setMessage({ type: "error", text: "Enter recipient and amount before requesting OTP." });
      return;
    }

    if (!highValueOtpRequired) {
      setMessage({ type: "error", text: "OTP is required only for high-value transfers." });
      return;
    }

    setRequestingTransferOtp(true);
    try {
      const response = await requestTransferOtp({
        recipientAccountNumber: normalizedRecipient,
        amount: transferAmount,
      });
      if (response.data.success) {
        const fallbackOtpCopy =
          response.data.fallbackOtpMode && response.data.devOtpCode
            ? ` Fallback OTP: ${response.data.devOtpCode}`
            : "";
        setFormData((current) => ({
          ...current,
          otpSessionId: response.data.otpSessionId || current.otpSessionId,
          otpCode: "",
        }));
        setOtpExpiresAt(response.data.expiresAt || "");
        setMessage({
          type: "success",
          text: `${response.data.message || "OTP sent to your registered email."}${fallbackOtpCopy}`,
        });
      }
    } catch (error) {
      setMessage({ type: "error", text: error.response?.data?.message || "Failed to request OTP." });
    } finally {
      setRequestingTransferOtp(false);
    }
  };

  const resetTransferForm = (recipientAccountNumber = "") => {
    const normalizedRecipient = normalizeAccountNumber(recipientAccountNumber);
    setFormData({
      beneficiaryAccountNumber: normalizedRecipient,
      recipientAccountNumber: normalizedRecipient,
      amount: "",
      description: "",
      otpSessionId: "",
      otpCode: "",
    });
    setRecipientPreview(null);
    setRecipientConfirmed(false);
    setOtpExpiresAt("");
  };

  const handleSendAgain = () => {
    sessionStorage.removeItem(PENDING_TRANSFER_STORAGE_KEY);
    const recipientAccountNumber = normalizeAccountNumber(transferResult?.recipientAccountNumber || "");
    setTransferResult(null);
    setMessage({ type: "", text: "" });
    resetTransferForm(recipientAccountNumber);
    if (recipientAccountNumber) {
      handleResolveRecipient(recipientAccountNumber, { silentMessage: true });
    }
  };

  const handleSendToAnotherPerson = () => {
    sessionStorage.removeItem(PENDING_TRANSFER_STORAGE_KEY);
    setTransferResult(null);
    setMessage({ type: "", text: "" });
    resetTransferForm("");
  };

  const handleDownloadStatement = async () => {
    setMessage({ type: "", text: "" });
    const year = String(statementYear || "").trim();
    const month = String(statementMonth || "").trim();
    if (!/^\d{4}$/.test(year) || !/^(0?[1-9]|1[0-2])$/.test(month)) {
      setMessage({ type: "error", text: "Enter a valid year and month to download statement." });
      return;
    }

    setDownloadingStatement(true);
    try {
      const response = await getMonthlyStatementPdf(year, month.padStart(2, "0"));
      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `statement-${year}-${month.padStart(2, "0")}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setMessage({ type: "success", text: "Statement downloaded successfully." });
    } catch (error) {
      setMessage({ type: "error", text: error.response?.data?.message || "Failed to download statement." });
    } finally {
      setDownloadingStatement(false);
    }
  };

  if (loading) {
    return (
      <div className="transactions-container">
        <p>Loading transactions...</p>
      </div>
    );
  }

  return (
    <div className="transactions-container">
      <div className="transactions-header">
        <div>
          <h1>Transaction History</h1>
          <p>Review movement in your account and send money securely with account number + MPIN.</p>
        </div>
        <div className="transaction-header-actions">
          <Link className="btn-transfer" to="/transactions/quick-transfer">
            Quick Transfer
          </Link>
          <Link className="btn-lite-link" to="/loans">
            Easy Loan Apply
          </Link>
        </div>
      </div>

      <div className="statement-panel">
        <div>
          <h3>Monthly Statement</h3>
          <p>Download a PDF statement for a selected month.</p>
        </div>
        <div className="statement-actions">
          <input
            type="number"
            value={statementYear}
            onChange={(event) => setStatementYear(event.target.value)}
            placeholder="YYYY"
            min="2000"
            max={new Date().getFullYear()}
          />
          <input
            type="number"
            value={statementMonth}
            onChange={(event) => setStatementMonth(event.target.value)}
            placeholder="MM"
            min="1"
            max="12"
          />
          <button type="button" onClick={handleDownloadStatement} disabled={downloadingStatement}>
            {downloadingStatement ? "Downloading..." : "Download PDF"}
          </button>
        </div>
      </div>

      {!hasTransactionPin && (
        <div className="pin-warning-banner">
          <p>Transaction PIN not set. Set your encrypted 4-digit PIN before transfer.</p>
          <Link to="/security/transaction-pin">Set PIN Now</Link>
        </div>
      )}

      {securityRules && (
        <div className="security-rules-banner">
          <p>Single transfer: <strong>{formatRupee(securityRules.maxSingleTransfer)}</strong></p>
          <p>Daily transfer: <strong>{formatRupee(securityRules.dailyTransferLimit)}</strong></p>
          <p>Remaining today: <strong>{formatRupee(securityRules.remainingTransfer)}</strong></p>
          <p>Beneficiary verify: <strong>{requiresVerifiedBeneficiary ? "Required" : "Not required"}</strong></p>
          <p>Direct account transfer: <strong>{securityRules.allowDirectTransferWithPin ? "Enabled" : "Disabled"}</strong></p>
          <p>OTP verify from: <strong>{securityRules.requireTransferOtpForHighValue ? formatRupee(securityRules.highValueTransferThreshold) : "Disabled"}</strong></p>
        </div>
      )}

      {message.text && <div className={`message-box ${message.type === "error" ? "error" : "success"}`}>{message.text}</div>}

      <div className="beneficiary-management-panel">
        <div className="beneficiary-panel-head">
          <div>
            <h3>Beneficiary Management</h3>
            <p>Add, verify, and maintain beneficiaries for faster secure transfers.</p>
          </div>
          <span className="beneficiary-count-chip">
            Verified: {beneficiaries.filter((entry) => entry.verified).length}/{beneficiaries.length}
          </span>
        </div>

        <form className="beneficiary-form-grid" onSubmit={handleAddBeneficiary}>
          <input
            type="text"
            name="name"
            value={beneficiaryForm.name}
            onChange={handleBeneficiaryFormChange}
            placeholder="Beneficiary Name"
            required
          />
          <input
            type="text"
            name="accountNumber"
            value={beneficiaryForm.accountNumber}
            onChange={handleBeneficiaryFormChange}
            placeholder="Account Number"
            required
          />
          <input
            type="text"
            name="ifscCode"
            value={beneficiaryForm.ifscCode}
            onChange={handleBeneficiaryFormChange}
            placeholder="IFSC Code"
            required
          />
          <button type="submit" disabled={beneficiarySubmitting}>
            {beneficiarySubmitting ? "Adding..." : "Add Beneficiary"}
          </button>
        </form>

        {beneficiaryVerification.beneficiaryId && (
          <form className="beneficiary-otp-form" onSubmit={handleVerifyBeneficiary}>
            <p>Enter OTP sent to email to verify beneficiary.</p>
            <input
              type="text"
              value={beneficiaryVerification.code}
              onChange={(event) =>
                setBeneficiaryVerification((current) => ({
                  ...current,
                  code: event.target.value.replace(/\D/g, "").slice(0, 6),
                }))
              }
              maxLength={6}
              inputMode="numeric"
              placeholder="6-digit OTP"
              required
            />
            <button type="submit" disabled={beneficiaryActionLoading === `verify-${beneficiaryVerification.beneficiaryId}`}>
              {beneficiaryActionLoading === `verify-${beneficiaryVerification.beneficiaryId}` ? "Verifying..." : "Verify Beneficiary"}
            </button>
            <button type="button" className="otp-cancel-btn" onClick={() => setBeneficiaryVerification({ beneficiaryId: "", code: "" })}>
              Cancel
            </button>
          </form>
        )}

        <div className="beneficiary-list-grid">
          {beneficiaries.length === 0 ? (
            <p className="beneficiary-empty-copy">No beneficiaries yet. Add one to speed up transfers.</p>
          ) : (
            beneficiaries.map((entry) => (
              <article key={entry._id} className="beneficiary-card">
                <div className="beneficiary-card-head">
                  <h4>{entry.name}</h4>
                  <span className={`beneficiary-status ${entry.verified ? "verified" : "pending"}`}>
                    {entry.verified ? "Verified" : "Pending"}
                  </span>
                </div>
                <p>Account: {entry.accountNumber}</p>
                <p>IFSC: {entry.ifscCode}</p>
                <div className="beneficiary-card-actions">
                  <button type="button" onClick={() => pickBeneficiaryAccount(entry.accountNumber)}>
                    Use in Transfer
                  </button>
                  {!entry.verified && (
                    <>
                      <button
                        type="button"
                        onClick={() => setBeneficiaryVerification({ beneficiaryId: entry._id, code: "" })}
                        disabled={beneficiaryActionLoading === `verify-${entry._id}`}
                      >
                        Verify OTP
                      </button>
                      <button
                        type="button"
                        onClick={() => handleResendBeneficiaryOtp(entry._id)}
                        disabled={beneficiaryActionLoading === `resend-${entry._id}`}
                      >
                        {beneficiaryActionLoading === `resend-${entry._id}` ? "Sending..." : "Resend OTP"}
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className="beneficiary-remove-btn"
                    onClick={() => handleDeleteBeneficiary(entry._id)}
                    disabled={beneficiaryActionLoading === `delete-${entry._id}`}
                  >
                    {beneficiaryActionLoading === `delete-${entry._id}` ? "Removing..." : "Remove"}
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </div>

      <div className="standing-instruction-panel">
        <div className="standing-panel-head">
          <div>
            <h3>Standing Instructions</h3>
            <p>Schedule automatic transfers for rent, EMI, subscriptions, and recurring payments.</p>
          </div>
          <div className="standing-summary-chips">
            <span>Total {standingSummary.total || 0}</span>
            <span>Active {standingSummary.active || 0}</span>
            <span>Paused {standingSummary.paused || 0}</span>
          </div>
        </div>

        <form className="standing-form-grid" onSubmit={handleCreateStandingInstruction}>
          <select
            name="beneficiaryAccountNumber"
            value={standingForm.beneficiaryAccountNumber}
            onChange={handleStandingBeneficiaryPick}
          >
            <option value="">Choose verified beneficiary</option>
            {beneficiaries
              .filter((entry) => entry.verified)
              .map((entry) => (
                <option key={entry._id} value={entry.accountNumber}>
                  {entry.name} - {entry.accountNumber}
                </option>
              ))}
          </select>
          <input
            type="text"
            name="recipientAccountNumber"
            value={standingForm.recipientAccountNumber}
            onChange={handleStandingChange}
            placeholder="Recipient Account Number"
            required
          />
          <input
            type="text"
            name="amount"
            value={standingForm.amount}
            onChange={handleStandingChange}
            placeholder="Amount"
            required
          />
          <select name="frequency" value={standingForm.frequency} onChange={handleStandingChange}>
            {standingFrequencies.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <input
            type="date"
            name="startDate"
            value={standingForm.startDate}
            onChange={handleStandingChange}
            min={getMinDate()}
            title="Date cannot be in the past"
          />
          <input
            type="text"
            name="maxExecutions"
            value={standingForm.maxExecutions}
            onChange={handleStandingChange}
            placeholder="Max runs (max 10)"
            maxLength={2}
          />
          <input
            type="text"
            name="description"
            value={standingForm.description}
            onChange={handleStandingChange}
            placeholder="Description (optional)"
          />
          <button type="submit" disabled={standingSubmitting}>
            {standingSubmitting ? "Creating..." : "Create Instruction"}
          </button>
        </form>

        <div className="standing-list-grid">
          {standingInstructions.length === 0 ? (
            <p className="standing-empty-copy">No standing instructions yet.</p>
          ) : (
            standingInstructions.map((item) => {
              const canModify = !["COMPLETED", "CANCELLED"].includes(String(item.status || "").toUpperCase());
              const executeLoading = standingActionLoading === `run-${item._id}`;
              const statusLoading = standingActionLoading === `status-${item._id}`;
              const deleteLoading = standingActionLoading === `delete-${item._id}`;
              const isPaused = item.status === "PAUSED";

              return (
                <article key={item._id} className="standing-card">
                  <div className="standing-card-head">
                    <h4>{formatRupee(item.amount)} / {item.frequency}</h4>
                    <span className={`standing-status status-${String(item.status || "").toLowerCase()}`}>{item.status}</span>
                  </div>
                  <p>Recipient: {item.recipientName || "-"} ({item.recipientAccountNumber})</p>
                  <p>Next Run: {formatDateTime(item.nextRunAt)}</p>
                  <p>Last Run: {formatDateTime(item.lastRunAt)}</p>
                  <p>Executions: {item.executedCount || 0}{item.maxExecutions ? ` / ${item.maxExecutions}` : ""}</p>
                  {item.lastExecutionStatus === "FAILED" && item.lastFailureReason ? (
                    <p className="standing-failure-copy">Last failure: {item.lastFailureReason}</p>
                  ) : null}
                  {extendingInstructionId === item._id ? (
                    <form className="standing-extend-section" onSubmit={handleExtendStandingInstruction}>
                      <div className="extend-input-group">
                        <input
                          type="text"
                          name="additionalExecutions"
                          value={extendForm.additionalExecutions}
                          onChange={handleExtendChange}
                          placeholder="Additional executions (max 10)"
                          required
                        />
                      </div>
                      <div className="extend-mpin-row">
                        <input
                          type="password"
                          name="mpin"
                          value={extendForm.mpin}
                          onChange={handleExtendChange}
                          placeholder="4-digit MPIN"
                          maxLength={4}
                          required
                        />
                        <button
                          type="submit"
                          disabled={extendLoading || extendForm.isEncrypting}
                          className="extend-verify-btn"
                        >
                          {extendForm.isEncrypting
                            ? "🔒 Encrypting..."
                            : extendLoading
                            ? "Processing..."
                            : "Verify & Extend"}
                        </button>
                      </div>
                      <p className="extend-mpin-help">🔒 Enter your encrypted 4-digit MPIN to securely extend</p>
                      <button
                        type="button"
                        className="extend-cancel-inline-btn"
                        onClick={handleCloseExtendForm}
                        disabled={extendLoading}
                      >
                        Cancel
                      </button>
                    </form>
                  ) : null}
                  {canModify && (
                    <div className="standing-run-row">
                      <input
                        type="password"
                        placeholder="PIN"
                        maxLength={4}
                        value={standingExecutePins[item._id] || ""}
                        onChange={(event) => handleStandingExecutePinChange(item._id, event.target.value)}
                      />
                      <button type="button" onClick={() => handleExecuteStandingNow(item._id)} disabled={executeLoading}>
                        {executeLoading ? "Running..." : "Execute Now"}
                      </button>
                    </div>
                  )}
                  <div className="standing-card-actions">
                    {canModify && (
                      <button
                        type="button"
                        onClick={() => handleToggleStandingInstruction(item, isPaused)}
                        disabled={statusLoading}
                      >
                        {statusLoading ? "Updating..." : isPaused ? "Resume" : "Pause"}
                      </button>
                    )}
                    {item.status === "COMPLETED" && (
                      <button
                        type="button"
                        className="standing-extend-btn"
                        onClick={() => handleOpenExtendForm(item._id)}
                      >
                        Extend
                      </button>
                    )}
                    {item.status !== "CANCELLED" && item.status !== "COMPLETED" && (
                      <button
                        type="button"
                        className="standing-cancel-btn"
                        onClick={() => handleDeleteStandingInstruction(item._id)}
                        disabled={deleteLoading}
                      >
                        {deleteLoading ? "Cancelling..." : "Cancel"}
                      </button>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>

      {isQuickTransferPage && (
        <div className="transfer-modal-overlay" role="dialog" aria-modal="true" aria-label="Quick transfer">
          <button type="button" className="transfer-modal-backdrop" onClick={closeQuickTransfer} aria-label="Close quick transfer" />
          <div className="transfer-modal-panel">
            <div className="transfer-modal-head">
              <h3>Quick Transfer</h3>
              <button type="button" className="transfer-modal-close" onClick={closeQuickTransfer}>
                Close
              </button>
            </div>
            <div className="transfer-form-card transfer-form-card-modal">
              {transferResult ? (
                <div className="transfer-result-card">
                  <h4>Transfer Successful</h4>
                  <p><strong>Recipient:</strong> {transferResult.recipientName || "Recipient"}</p>
                  <p><strong>Account:</strong> {transferResult.recipientAccountMasked || "-"}</p>
                  <p><strong>Amount:</strong> {formatRupee(transferResult.amount)}</p>
                  <p><strong>Available Balance:</strong> {formatRupee(transferResult.senderNewBalance)}</p>
                  <p><strong>Time:</strong> {new Date(transferResult.processedAt || new Date()).toLocaleString("en-IN")}</p>
                  {transferResult.referenceId ? <p><strong>Reference ID:</strong> {transferResult.referenceId}</p> : null}
                  <div className="transfer-result-actions">
                    <button type="button" onClick={handleSendAgain}>
                      Send Again
                    </button>
                    <button type="button" onClick={handleSendToAnotherPerson}>
                      Send To Another Person
                    </button>
                    <button type="button" className="transfer-result-close" onClick={closeQuickTransfer}>
                      Close
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleTransfer}>
                  <div className="form-group">
                    <label>Select Beneficiary (Optional)</label>
                    <select
                      name="beneficiaryAccountNumber"
                      value={formData.beneficiaryAccountNumber}
                      onChange={handleBeneficiaryPick}
                      className="transfer-select"
                    >
                      <option value="">Choose from saved beneficiaries</option>
                      {beneficiaries.map((item) => (
                        <option key={item._id} value={item.accountNumber}>
                          {item.name} - {item.accountNumber} {item.verified ? "(Verified)" : "(Pending)"}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Recipient Account Number</label>
                    <p className="limit-note">
                      {requiresVerifiedBeneficiary
                        ? "Recipient verification is required for transfer policy."
                        : "Verification is optional. You can send directly using MPIN."}
                    </p>
                    <div className="recipient-input-wrap">
                      <input
                        type="text"
                        name="recipientAccountNumber"
                        value={formData.recipientAccountNumber}
                        onChange={handleChange}
                        placeholder="Enter recipient account number"
                        required
                      />
                      <button
                        type="button"
                        className="verify-recipient-btn"
                        onClick={() => handleResolveRecipient(formData.recipientAccountNumber)}
                        disabled={!formData.recipientAccountNumber || resolvingRecipient}
                      >
                        {resolvingRecipient ? "Checking..." : "Verify (Optional)"}
                      </button>
                    </div>
                  </div>

                  {recipientPreview && (
                    <div className="recipient-preview-card">
                      <p><strong>Recipient Name:</strong> {recipientPreview.fullName || "N/A"}</p>
                      <p><strong>Account:</strong> {recipientPreview.accountNumberMasked || "N/A"}</p>
                      <p>
                        <strong>Beneficiary Verified:</strong>{" "}
                        {recipientPreview.isVerifiedBeneficiary
                          ? "Yes"
                          : requiresVerifiedBeneficiary
                          ? "No (required)"
                          : "No (optional)"}
                      </p>
                      <label className="recipient-confirm-check">
                        <input
                          type="checkbox"
                          checked={recipientConfirmed}
                          onChange={(event) => setRecipientConfirmed(event.target.checked)}
                        />
                        <span>
                          Optional confirmation: I am sending money to <strong>{recipientPreview.fullName || "this recipient"}</strong> (
                          {recipientPreview.accountNumberMasked || "N/A"}).
                        </span>
                      </label>
                    </div>
                  )}

                  <div className="form-group">
                    <label>Amount (Rs)</label>
                    {securityRules && (
                      <p className="limit-note">
                        Max per transfer: {formatRupee(securityRules.maxSingleTransfer)} | Remaining today:{" "}
                        {formatRupee(securityRules.remainingTransfer)}
                      </p>
                    )}
                    <input
                      type="number"
                      name="amount"
                      value={formData.amount}
                      onChange={handleChange}
                      placeholder="Enter amount"
                      required
                      step="0.01"
                      min="1"
                      max={Number(securityRules?.maxSingleTransfer || "") || undefined}
                    />
                    <div className="quick-amount-row">
                      {quickAmounts.map((value) => (
                        <button key={value} type="button" onClick={() => handleQuickAmount(value)}>
                          Rs {value}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Description (Optional)</label>
                    <input
                      type="text"
                      name="description"
                      value={formData.description}
                      onChange={handleChange}
                      placeholder="Add a note"
                    />
                  </div>

                  {highValueOtpRequired && (
                    <div className="form-group form-group-otp">
                      <label>Transfer OTP (Email Verification)</label>
                      <p className="otp-note">
                        High-value transfer requires OTP. Check your registered email.
                        {otpExpiresAt ? ` Expires at ${new Date(otpExpiresAt).toLocaleTimeString("en-IN")}.` : ""}
                      </p>
                      <div className="otp-action-row">
                        <input
                          type="text"
                          name="otpCode"
                          value={formData.otpCode}
                          onChange={handleChange}
                          placeholder="Enter 6-digit OTP"
                          maxLength={6}
                          inputMode="numeric"
                        />
                        <button
                          type="button"
                          className="request-otp-btn"
                          onClick={handleRequestOtp}
                          disabled={requestingTransferOtp}
                        >
                          {requestingTransferOtp ? "Sending..." : "Send OTP"}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="form-buttons">
                    <button
                      type="submit"
                      className="btn-primary"
                      disabled={submitting || !hasTransactionPin}
                    >
                      {submitting ? "Please wait..." : "Send Money"}
                    </button>
                    <button type="button" className="btn-cancel" onClick={closeQuickTransfer}>
                      Cancel
                    </button>
                    <Link className="btn-inline-link" to="/security/transaction-pin">
                      Manage PIN
                    </Link>
                  </div>
                  <p className="mpin-next-note">You will enter MPIN on the next secure encrypted screen.</p>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {isStandingInstructionSecurePage && pendingStandingInstruction && (
        <div className="transfer-modal-overlay" role="dialog" aria-modal="true" aria-label="Standing instruction MPIN">
          <button type="button" className="transfer-modal-backdrop" onClick={closeStandingInstructionSecure} aria-label="Close standing instruction" />
          <div className="transfer-modal-panel">
            <div className="transfer-modal-head">
              <h3>Secure Standing Instruction</h3>
              <button type="button" className="transfer-modal-close" onClick={closeStandingInstructionSecure}>
                Close
              </button>
            </div>
            <div className="transfer-form-card transfer-form-card-modal">
              <form onSubmit={handleSubmitStandingInstructionWithMpin}>
                <div className="form-group">
                  <h4 style={{ marginBottom: "12px", fontSize: "14px", color: "#555" }}>Instruction Details</h4>
                  <p><strong>Recipient:</strong> {pendingStandingInstruction.recipientAccountNumber}</p>
                  <p><strong>Amount:</strong> {formatRupee(pendingStandingInstruction.amount)}</p>
                  <p><strong>Frequency:</strong> {pendingStandingInstruction.frequency}</p>
                  {pendingStandingInstruction.startDate && (
                    <p><strong>Start Date:</strong> {new Date(pendingStandingInstruction.startDate).toLocaleDateString("en-IN")}</p>
                  )}
                  {pendingStandingInstruction.maxExecutions && (
                    <p><strong>Max Executions:</strong> {pendingStandingInstruction.maxExecutions}</p>
                  )}
                  {pendingStandingInstruction.description && (
                    <p><strong>Description:</strong> {pendingStandingInstruction.description}</p>
                  )}
                </div>

                <div className="form-group">
                  <label>Enter MPIN</label>
                  <input
                    type="password"
                    name="transactionPin"
                    value={standingForm.transactionPin}
                    onChange={handleStandingInstructionMpinChange}
                    placeholder="4-digit MPIN"
                    maxLength={4}
                    inputMode="numeric"
                    required
                    autoFocus
                  />
                  <p className="standing-pin-help">🔒 Enter your encrypted 4-digit MPIN</p>
                </div>

                {standingForm.isEncrypting && (
                  <div className="form-group" style={{ textAlign: "center" }}>
                    <p style={{ fontSize: "14px", color: "#0066cc", fontWeight: "500" }}>🔒 Encrypting...</p>
                  </div>
                )}

                <div className="form-buttons">
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={standingForm.isEncrypting || !standingForm.transactionPin || standingForm.transactionPin.length !== 4}
                  >
                    {standingForm.isEncrypting ? "Processing..." : "Create Standing Instruction"}
                  </button>
                  <button type="button" className="btn-cancel" onClick={closeStandingInstructionSecure}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      <div className="transactions-content">
        {transactions.length === 0 ? (
          <div className="empty-state">
            <p>No transactions available.</p>
          </div>
        ) : (
          <div className="transactions-list">
            {transactions.map((transaction) => {
              const normalizedType = transaction.type || "TRANSFER";
              const typeClass = typeToClass[normalizedType] || "transfer";
              const typeLabel = typeToLabel[normalizedType] || normalizedType;
              const isOut = normalizedType === "WITHDRAWAL" || normalizedType === "PAYMENT_REFUND";

              return (
                <div key={transaction._id} className={`transaction-item ${typeClass}`}>
                  <div className="transaction-icon">{typeLabel.slice(0, 1)}</div>
                  <div className="transaction-details">
                    <h4>{typeLabel}</h4>
                    <p className="transaction-description">{transaction.description || `${typeLabel} transaction`}</p>
                    {transaction.recipientName && <p className="recipient-info">To: {transaction.recipientName}</p>}
                    <p className="transaction-date">{new Date(transaction.createdAt).toLocaleDateString("en-IN")}</p>
                  </div>
                  <div className="transaction-amount">
                    <p className={isOut ? "amount-out" : "amount-in"}>
                      {isOut ? "-" : "+"}Rs {transaction.amount.toFixed(2)}
                    </p>
                    <p className="running-balance">Bal: Rs {transaction.balanceAfterTransaction.toFixed(2)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Transactions;
