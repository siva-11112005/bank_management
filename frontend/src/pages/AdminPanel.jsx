import React, { useState, useEffect, useMemo } from "react";
import {
  getAdminStats,
  getAllUsers,
  updateAdminUser,
  getAllAccounts,
  getAllTransactions,
  getAdminTrends,
  getAdminAuditLogs,
  getAdminAuditLogsExport,
  getAdminApprovalRequests,
  getAdminApprovalRequestsExport,
  approveAdminApprovalRequest,
  rejectAdminApprovalRequest,
  escalateAdminApprovalRequest,
  escalateOverdueAdminApprovalRequests,
  activateUser,
  unblockUserTransactions,
  deactivateUser,
  updateAccountStatus,
  getAllLoans,
  updateLoanStatus,
  getAllPayments,
  refundPayment,
  getPaymentReviewQueue,
  resolvePaymentReview,
  getAllSupportTicketsAdmin,
  updateSupportTicketAdmin,
  getAllCardRequestsAdmin,
  resolveCardRequestAdmin,
  getAllKycRequestsAdmin,
  resolveKycRequestAdmin,
} from "../services/api";
import { useAuth } from "../context/AuthContext";
import { isAdminIdentity, isStrictAdminUser } from "../utils/adminIdentity";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import "./AdminPanel.css";

const AdminPanel = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [users, setUsers] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loans, setLoans] = useState([]);
  const [payments, setPayments] = useState([]);
  const [cardRequests, setCardRequests] = useState([]);
  const [kycRequests, setKycRequests] = useState([]);
  const [supportTickets, setSupportTickets] = useState([]);
  const [reviewQueue, setReviewQueue] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditActions, setAuditActions] = useState([]);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotalPages, setAuditTotalPages] = useState(1);
  const [approvalRequests, setApprovalRequests] = useState([]);
  const [approvalSummary, setApprovalSummary] = useState([]);
  const [approvalPage, setApprovalPage] = useState(1);
  const [approvalTotalPages, setApprovalTotalPages] = useState(1);
  const [approvalConfig, setApprovalConfig] = useState({
    approvalMode: "DISABLED",
    requiredApprovalActions: [],
    dualControlEnforced: false,
    reviewNoteRequired: false,
    approvalSlaHours: 24,
    approvalEscalationHours: 48,
  });
  const [approvalMetrics, setApprovalMetrics] = useState({
    pendingOverdueApprovals: 0,
    pendingEscalatedApprovals: 0,
  });
  const [approvalReviewNote, setApprovalReviewNote] = useState("");
  const [approvalFilters, setApprovalFilters] = useState({
    status: "PENDING",
    actionType: "",
    overdueOnly: false,
    escalatedOnly: false,
  });
  const [loadingApprovals, setLoadingApprovals] = useState(false);
  const [auditFilters, setAuditFilters] = useState({
    action: "",
    from: "",
    to: "",
  });
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [trends, setTrends] = useState(null);
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [workingId, setWorkingId] = useState("");
  const [tableSearch, setTableSearch] = useState({
    users: "",
    accounts: "",
    transactions: "",
    loans: "",
    payments: "",
    cards: "",
    kyc: "",
    support: "",
  });
  const [editingUserId, setEditingUserId] = useState("");
  const [userEditForm, setUserEditForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    address: "",
    role: "USER",
    isActive: true,
  });

  const filteredUsers = useMemo(() => {
    const query = String(tableSearch.users || "").trim().toLowerCase();
    if (!query) return users;
    return users.filter((rowUser) =>
      matchesAnyQuery(query, [
        `${rowUser.firstName || ""} ${rowUser.lastName || ""}`.trim(),
        rowUser.email,
        rowUser.phone,
        rowUser.role,
        rowUser.isActive ? "active" : "inactive",
      ])
    );
  }, [users, tableSearch.users]);

  const filteredAccounts = useMemo(() => {
    const query = String(tableSearch.accounts || "").trim().toLowerCase();
    if (!query) return accounts;
    return accounts.filter((account) =>
      matchesAnyQuery(query, [account.accountNumber, account.accountType, account.ifscCode, account.status, account.balance])
    );
  }, [accounts, tableSearch.accounts]);

  const filteredTransactions = useMemo(() => {
    const query = String(tableSearch.transactions || "").trim().toLowerCase();
    const source = query ? transactions : transactions.slice(0, 50);
    return source.filter((transaction) =>
      matchesAnyQuery(query, [
        transaction.type,
        transaction.amount,
        transaction.accountId?.accountNumber,
        transaction.status,
        transaction.createdAt ? new Date(transaction.createdAt).toLocaleDateString("en-IN") : "",
        transaction.createdAt ? new Date(transaction.createdAt).toISOString().slice(0, 10) : "",
      ])
    );
  }, [transactions, tableSearch.transactions]);

  const filteredLoans = useMemo(() => {
    const query = String(tableSearch.loans || "").trim().toLowerCase();
    if (!query) return loans;
    return loans.filter((loan) =>
      matchesAnyQuery(query, [
        loan.userId ? `${loan.userId.firstName || ""} ${loan.userId.lastName || ""}`.trim() : "",
        loan.userId?.email || "",
        loan.loanType,
        loan.status,
        loan.principal,
        loan.remainingAmount,
        loan.tenure,
      ])
    );
  }, [loans, tableSearch.loans]);

  const pendingLoanApprovals = useMemo(
    () => loans.filter((loan) => String(loan.status || "").toUpperCase() === "PENDING"),
    [loans]
  );

  const filteredPayments = useMemo(() => {
    const query = String(tableSearch.payments || "").trim().toLowerCase();
    if (!query) return payments;
    return payments.filter((payment) =>
      matchesAnyQuery(query, [
        payment.userId ? `${payment.userId.firstName || ""} ${payment.userId.lastName || ""}`.trim() : "",
        payment.userId?.email || "",
        payment.providerOrderId,
        payment.gateway,
        payment.method,
        payment.status,
        payment.amount,
      ])
    );
  }, [payments, tableSearch.payments]);

  const filteredCardRequests = useMemo(() => {
    const query = String(tableSearch.cards || "").trim().toLowerCase();
    if (!query) return cardRequests;
    return cardRequests.filter((request) =>
      matchesAnyQuery(query, [
        request.requestType,
        request.status,
        request.cardType,
        request.network,
        request.reason,
        request.adminNote,
        request.userId ? `${request.userId.firstName || ""} ${request.userId.lastName || ""}`.trim() : "",
        request.userId?.email || "",
        request.cardId?.cardNumberMasked || "",
        request.cardId?.status || "",
      ])
    );
  }, [cardRequests, tableSearch.cards]);

  const filteredKycRequests = useMemo(() => {
    const query = String(tableSearch.kyc || "").trim().toLowerCase();
    if (!query) return kycRequests;
    return kycRequests.filter((request) =>
      matchesAnyQuery(query, [
        request.status,
        request.panNumber,
        request.occupation,
        request.incomeRange,
        request.idProofType,
        request.addressProofType,
        request.adminNote,
        request.userId ? `${request.userId.firstName || ""} ${request.userId.lastName || ""}`.trim() : "",
        request.userId?.email || "",
      ])
    );
  }, [kycRequests, tableSearch.kyc]);

  const filteredSupportTickets = useMemo(() => {
    const query = String(tableSearch.support || "").trim().toLowerCase();
    if (!query) return supportTickets;
    return supportTickets.filter((ticket) =>
      matchesAnyQuery(query, [
        ticket.ticketNumber,
        ticket.category,
        ticket.priority,
        ticket.status,
        ticket.subject,
        ticket.description,
        ticket.userId ? `${ticket.userId.firstName || ""} ${ticket.userId.lastName || ""}`.trim() : "",
        ticket.userId?.email || "",
      ])
    );
  }, [supportTickets, tableSearch.support]);

  const handleTableSearchChange = (key, value) => {
    setTableSearch((current) => ({ ...current, [key]: value }));
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  const fetchAdminData = async () => {
    try {
      const [
        statsRes,
        usersRes,
        accountsRes,
        transactionsRes,
        trendsRes,
        loansRes,
        paymentsRes,
        reviewsRes,
        auditRes,
        approvalsRes,
        supportRes,
        cardRequestsRes,
        kycRequestsRes,
      ] =
        await Promise.all([
        getAdminStats(),
        getAllUsers(),
        getAllAccounts(),
        getAllTransactions(),
        getAdminTrends(),
        getAllLoans(),
        getAllPayments({ limit: 200 }),
        getPaymentReviewQueue({ limit: 200 }),
        getAdminAuditLogs({ limit: 200 }),
        getAdminApprovalRequests({ limit: 200, status: "PENDING" }),
        getAllSupportTicketsAdmin(),
        getAllCardRequestsAdmin({ limit: 300 }),
        getAllKycRequestsAdmin({ limit: 300 }),
      ]);

      if (statsRes.data.success) setStats(statsRes.data.stats);
      if (usersRes.data.success) setUsers(usersRes.data.users);
      if (accountsRes.data.success) setAccounts(accountsRes.data.accounts);
      if (transactionsRes.data.success) setTransactions(transactionsRes.data.transactions);
      if (trendsRes.data.success) setTrends(trendsRes.data.trends);
      if (loansRes.data.success) setLoans(loansRes.data.loans);
      if (paymentsRes.data.success) setPayments(paymentsRes.data.payments);
      if (reviewsRes.data.success) setReviewQueue(reviewsRes.data.payments);
      if (supportRes.data.success) setSupportTickets(supportRes.data.tickets || []);
      if (cardRequestsRes.data.success) setCardRequests(cardRequestsRes.data.requests || []);
      if (kycRequestsRes.data.success) setKycRequests(kycRequestsRes.data.requests || []);
      if (auditRes.data.success) {
        setAuditLogs(auditRes.data.logs || []);
        setAuditActions(auditRes.data.actionCounts || []);
        setAuditPage(auditRes.data.page || 1);
        setAuditTotalPages(auditRes.data.totalPages || 1);
      }
      if (approvalsRes.data.success) {
        setApprovalRequests(approvalsRes.data.requests || []);
        setApprovalSummary(approvalsRes.data.pendingByAction || []);
        setApprovalPage(approvalsRes.data.page || 1);
        setApprovalTotalPages(approvalsRes.data.totalPages || 1);
        setApprovalConfig({
          approvalMode: approvalsRes.data.approvalMode || "DISABLED",
          requiredApprovalActions: approvalsRes.data.requiredApprovalActions || [],
          dualControlEnforced: Boolean(approvalsRes.data.dualControlEnforced),
          reviewNoteRequired: Boolean(approvalsRes.data.reviewNoteRequired),
          approvalSlaHours: Number(approvalsRes.data.approvalSlaHours || 24),
          approvalEscalationHours: Number(approvalsRes.data.approvalEscalationHours || 48),
        });
        setApprovalMetrics({
          pendingOverdueApprovals: Number(approvalsRes.data.pendingOverdueApprovals || 0),
          pendingEscalatedApprovals: Number(approvalsRes.data.pendingEscalatedApprovals || 0),
        });
      }
    } catch (error) {
      console.error("Failed to fetch admin data:", error);
    } finally {
      setLoading(false);
    }
  };

  const buildAuditQuery = ({ page = auditPage, action = auditFilters.action, from = auditFilters.from, to = auditFilters.to } = {}) => {
    return {
      limit: 200,
      page,
      action: action || undefined,
      from: from || undefined,
      to: to || undefined,
    };
  };

  const fetchAuditLogs = async ({ page = auditPage, action = auditFilters.action, from = auditFilters.from, to = auditFilters.to } = {}) => {
    setLoadingAudit(true);
    try {
      const response = await getAdminAuditLogs(buildAuditQuery({ page, action, from, to }));
      if (response.data.success) {
        setAuditLogs(response.data.logs || []);
        setAuditActions(response.data.actionCounts || []);
        setAuditPage(response.data.page || 1);
        setAuditTotalPages(response.data.totalPages || 1);
      }
    } catch (error) {
      setActionError(error.response?.data?.message || "Failed to fetch audit logs");
    } finally {
      setLoadingAudit(false);
    }
  };

  const handleAuditFilterChange = (event) => {
    const { name, value } = event.target;
    setAuditFilters((current) => ({ ...current, [name]: value }));
  };

  const handleApplyAuditFilters = () => {
    fetchAuditLogs({ page: 1 });
  };

  const handleResetAuditFilters = () => {
    const cleared = { action: "", from: "", to: "" };
    setAuditFilters(cleared);
    fetchAuditLogs({ page: 1, ...cleared });
  };

  const handleExportAuditLogs = async () => {
    setActionError("");
    setActionMessage("");
    setWorkingId("audit-export");
    try {
      const response = await getAdminAuditLogsExport(buildAuditQuery({ page: 1 }));
      const blob = new Blob([response.data], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const stamp = new Date().toISOString().slice(0, 10);
      link.setAttribute("download", `audit-logs-${stamp}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setActionMessage("Audit logs exported successfully.");
    } catch (error) {
      setActionError(error.response?.data?.message || "Failed to export audit logs");
    } finally {
      setWorkingId("");
    }
  };

  const buildApprovalQuery = ({
    page = approvalPage,
    status = approvalFilters.status,
    actionType = approvalFilters.actionType,
    overdueOnly = approvalFilters.overdueOnly,
    escalatedOnly = approvalFilters.escalatedOnly,
  } = {}) => ({
    limit: 200,
    page,
    status: status || undefined,
    actionType: actionType || undefined,
    overdueOnly: Boolean(overdueOnly),
    escalatedOnly: Boolean(escalatedOnly),
  });

  const fetchApprovalRequests = async ({
    page = approvalPage,
    status = approvalFilters.status,
    actionType = approvalFilters.actionType,
    overdueOnly = approvalFilters.overdueOnly,
    escalatedOnly = approvalFilters.escalatedOnly,
  } = {}) => {
    setLoadingApprovals(true);
    try {
      const response = await getAdminApprovalRequests(
        buildApprovalQuery({ page, status, actionType, overdueOnly, escalatedOnly })
      );
      if (response.data.success) {
        setApprovalRequests(response.data.requests || []);
        setApprovalSummary(response.data.pendingByAction || []);
        setApprovalPage(response.data.page || 1);
        setApprovalTotalPages(response.data.totalPages || 1);
        setApprovalConfig({
          approvalMode: response.data.approvalMode || "DISABLED",
          requiredApprovalActions: response.data.requiredApprovalActions || [],
          dualControlEnforced: Boolean(response.data.dualControlEnforced),
          reviewNoteRequired: Boolean(response.data.reviewNoteRequired),
          approvalSlaHours: Number(response.data.approvalSlaHours || 24),
          approvalEscalationHours: Number(response.data.approvalEscalationHours || 48),
        });
        setApprovalMetrics({
          pendingOverdueApprovals: Number(response.data.pendingOverdueApprovals || 0),
          pendingEscalatedApprovals: Number(response.data.pendingEscalatedApprovals || 0),
        });
      }
    } catch (error) {
      setActionError(error.response?.data?.message || "Failed to fetch approval requests");
    } finally {
      setLoadingApprovals(false);
    }
  };

  const handleApprovalFilterChange = (event) => {
    const { name, value, type, checked } = event.target;
    setApprovalFilters((current) => ({ ...current, [name]: type === "checkbox" ? checked : value }));
  };

  const handleApplyApprovalFilters = () => {
    fetchApprovalRequests({ page: 1 });
  };

  const handleResetApprovalFilters = () => {
    const cleared = { status: "PENDING", actionType: "", overdueOnly: false, escalatedOnly: false };
    setApprovalFilters(cleared);
    fetchApprovalRequests({ page: 1, ...cleared });
  };

  const handleExportApprovalRequests = async () => {
    setActionError("");
    setActionMessage("");
    setWorkingId("approval-export");
    try {
      const response = await getAdminApprovalRequestsExport(buildApprovalQuery({ page: 1 }));
      const blob = new Blob([response.data], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const stamp = new Date().toISOString().slice(0, 10);
      link.setAttribute("download", `approval-requests-${stamp}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setActionMessage("Approval requests exported successfully.");
    } catch (error) {
      setActionError(error.response?.data?.message || "Failed to export approval requests");
    } finally {
      setWorkingId("");
    }
  };

  const handleApproveRequest = async (approvalRequest) => {
    setActionError("");
    setActionMessage("");
    setWorkingId(approvalRequest._id);
    try {
      const note = String(approvalReviewNote || "").trim();
      if (approvalConfig.reviewNoteRequired && !note) {
        setActionError("Review note is required by approval policy.");
        setWorkingId("");
        return;
      }

      const response = await approveAdminApprovalRequest(approvalRequest._id, note || "Approved from admin panel");
      if (response.data.success) {
        setActionMessage(response.data?.message || "Approval request executed.");
        setApprovalReviewNote("");
        await fetchAdminData();
      }
    } catch (error) {
      setActionError(error.response?.data?.message || "Failed to approve request");
      await fetchApprovalRequests();
    } finally {
      setWorkingId("");
    }
  };

  const handleRejectRequest = async (approvalRequest) => {
    setActionError("");
    setActionMessage("");
    setWorkingId(approvalRequest._id);
    try {
      const note = String(approvalReviewNote || "").trim();
      if (approvalConfig.reviewNoteRequired && !note) {
        setActionError("Review note is required by approval policy.");
        setWorkingId("");
        return;
      }

      const response = await rejectAdminApprovalRequest(approvalRequest._id, note || "Rejected from admin panel");
      if (response.data.success) {
        setActionMessage(response.data?.message || "Approval request rejected.");
        setApprovalReviewNote("");
        await fetchAdminData();
      }
    } catch (error) {
      setActionError(error.response?.data?.message || "Failed to reject request");
      await fetchApprovalRequests();
    } finally {
      setWorkingId("");
    }
  };

  const handleEscalateRequest = async (approvalRequest) => {
    setActionError("");
    setActionMessage("");
    setWorkingId(approvalRequest._id);
    try {
      const note = String(approvalReviewNote || "").trim() || "Escalated by admin";
      const response = await escalateAdminApprovalRequest(approvalRequest._id, note);
      if (response.data.success) {
        setActionMessage(response.data?.message || "Approval request escalated.");
        setApprovalReviewNote("");
        await fetchApprovalRequests();
      }
    } catch (error) {
      setActionError(error.response?.data?.message || "Failed to escalate request");
      await fetchApprovalRequests();
    } finally {
      setWorkingId("");
    }
  };

  const handleEscalateOverdueRequests = async () => {
    setActionError("");
    setActionMessage("");
    setWorkingId("approval-escalate-overdue");
    try {
      const note = String(approvalReviewNote || "").trim() || "Escalated due to pending SLA breach";
      const response = await escalateOverdueAdminApprovalRequests(note, 200);
      if (response.data.success) {
        setActionMessage(response.data?.message || "Overdue approvals escalated.");
        setApprovalReviewNote("");
        await fetchAdminData();
      }
    } catch (error) {
      setActionError(error.response?.data?.message || "Failed to escalate overdue approvals");
      await fetchApprovalRequests();
    } finally {
      setWorkingId("");
    }
  };

  const handleToggleUserStatus = async (targetUser) => {
    setActionError("");
    setActionMessage("");
    setWorkingId(targetUser._id);
    try {
      const request = targetUser.isActive ? deactivateUser(targetUser._id) : activateUser(targetUser._id);
      const response = await request;
      if (response.data.success) {
        setUsers((current) =>
          current.map((entry) => (entry._id === targetUser._id ? { ...entry, isActive: !targetUser.isActive } : entry))
        );
        setActionMessage(`User ${targetUser.isActive ? "deactivated" : "activated"} successfully.`);
      }
    } catch (error) {
      setActionError(error.response?.data?.message || "Failed to update user status");
    } finally {
      setWorkingId("");
    }
  };

  const handleUnblockUserTransactions = async (targetUser) => {
    setActionError("");
    setActionMessage("");
    setWorkingId(`unblock-${targetUser._id}`);
    try {
      const response = await unblockUserTransactions(targetUser._id);
      if (response.data.success) {
        setUsers((current) =>
          current.map((entry) =>
            entry._id === targetUser._id
              ? { ...entry, transactionPinLockedUntil: null, transactionPinAttempts: 0 }
              : entry
          )
        );
        setActionMessage(response.data.message || "Transaction access updated successfully.");
      }
    } catch (error) {
      setActionError(error.response?.data?.message || "Failed to unblock transaction access");
    } finally {
      setWorkingId("");
    }
  };

  const handleStartUserEdit = (targetUser) => {
    setActionError("");
    setActionMessage("");
    setEditingUserId(targetUser._id);
    setUserEditForm({
      firstName: targetUser.firstName || "",
      lastName: targetUser.lastName || "",
      email: targetUser.email || "",
      phone: targetUser.phone || "",
      address: targetUser.address || "",
      role: targetUser.role || "USER",
      isActive: Boolean(targetUser.isActive),
    });
  };

  const handleCancelUserEdit = () => {
    setEditingUserId("");
    setUserEditForm({
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      address: "",
      role: "USER",
      isActive: true,
    });
  };

  const handleUserEditChange = (event) => {
    const { name, value, type, checked } = event.target;
    setUserEditForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSubmitUserEdit = async (event) => {
    event.preventDefault();
    if (!editingUserId) return;

    setActionError("");
    setActionMessage("");
    setWorkingId(`edit-${editingUserId}`);
    try {
      const payload = {
        firstName: String(userEditForm.firstName || "").trim(),
        lastName: String(userEditForm.lastName || "").trim(),
        email: String(userEditForm.email || "").trim().toLowerCase(),
        phone: String(userEditForm.phone || "").trim(),
        address: String(userEditForm.address || "").trim(),
        role: userEditForm.role,
        isActive: Boolean(userEditForm.isActive),
      };
      const response = await updateAdminUser(editingUserId, payload);
      if (response.data.success && response.data.user) {
        setUsers((current) =>
          current.map((entry) => (entry._id === editingUserId ? { ...entry, ...response.data.user } : entry))
        );
        setActionMessage(response.data.message || "User updated successfully.");
        handleCancelUserEdit();
      }
    } catch (error) {
      setActionError(error.response?.data?.message || "Failed to update user details");
    } finally {
      setWorkingId("");
    }
  };

  const handleAccountStatusChange = async (accountId, status) => {
    setActionError("");
    setActionMessage("");
    setWorkingId(accountId);
    try {
      const response = await updateAccountStatus(accountId, status);
      if (response.data.success) {
        if (response.data.pendingApproval) {
          setActionMessage(response.data.message || "Account status update queued for approval.");
          await fetchApprovalRequests({ page: 1, status: "PENDING" });
        } else {
          setAccounts((current) =>
            current.map((entry) => (entry._id === accountId ? { ...entry, status } : entry))
          );
          setActionMessage("Account status updated successfully.");
        }
      }
    } catch (error) {
      setActionError(error.response?.data?.message || "Failed to update account status");
    } finally {
      setWorkingId("");
    }
  };

  const handleLoanStatusChange = async (loanId, status) => {
    setActionError("");
    setActionMessage("");
    setWorkingId(loanId);
    try {
      const response = await updateLoanStatus(loanId, status);
      if (response.data.success) {
        if (response.data.pendingApproval) {
          setActionMessage(response.data.message || "Loan status update queued for approval.");
          await fetchApprovalRequests({ page: 1, status: "PENDING" });
        } else {
          setLoans((current) =>
            current.map((entry) => (entry._id === loanId ? { ...entry, status, approvedBy: response.data.loan.approvedBy } : entry))
          );
          setActionMessage("Loan status updated successfully.");
        }
      }
    } catch (error) {
      setActionError(error.response?.data?.message || "Failed to update loan status");
    } finally {
      setWorkingId("");
    }
  };

  const handleRefundPayment = async (paymentId) => {
    setActionError("");
    setActionMessage("");
    setWorkingId(paymentId);
    try {
      const response = await refundPayment(paymentId, "Refund initiated by admin panel");
      if (response.data.success) {
        if (response.data.pendingApproval) {
          setActionMessage(response.data.message || "Payment refund queued for approval.");
          await fetchApprovalRequests({ page: 1, status: "PENDING" });
        } else {
          setPayments((current) =>
            current.map((entry) =>
              entry._id === paymentId
                ? { ...entry, status: "REFUNDED", refundedAt: new Date().toISOString(), refundReason: "Refund initiated by admin panel" }
                : entry
            )
          );
          setActionMessage("Payment refunded successfully.");
        }
      }
    } catch (error) {
      setActionError(error.response?.data?.message || "Failed to refund payment");
    } finally {
      setWorkingId("");
    }
  };

  const handleResolvePaymentReview = async (paymentId) => {
    setActionError("");
    setActionMessage("");
    setWorkingId(paymentId);
    try {
      const response = await resolvePaymentReview(paymentId, "Reviewed and resolved from admin panel");
      if (response.data.success) {
        setReviewQueue((current) => current.filter((entry) => entry._id !== paymentId));
        setPayments((current) =>
          current.map((entry) =>
            entry._id === paymentId
              ? {
                  ...entry,
                  metadata: {
                    ...(entry.metadata || {}),
                    webhookRefundPendingReview: false,
                    webhookReviewResolutionNote: "Reviewed and resolved from admin panel",
                    webhookReviewResolvedAt: new Date().toISOString(),
                  },
                }
              : entry
          )
        );
        setActionMessage("Payment review resolved successfully.");
      }
    } catch (error) {
      setActionError(error.response?.data?.message || "Failed to resolve payment review");
    } finally {
      setWorkingId("");
    }
  };

  const handleSupportStatusChange = async (ticketId, status) => {
    setActionError("");
    setActionMessage("");
    setWorkingId(ticketId);
    try {
      const response = await updateSupportTicketAdmin(ticketId, {
        status,
        adminNote: "Updated from admin support console",
      });
      if (response.data.success) {
        setSupportTickets((current) =>
          current.map((entry) =>
            entry._id === ticketId
              ? {
                  ...entry,
                  status,
                  adminNote: "Updated from admin support console",
                  lastUpdatedByRole: "ADMIN",
                }
              : entry
          )
        );
        setActionMessage("Support ticket status updated successfully.");
      }
    } catch (error) {
      setActionError(error.response?.data?.message || "Failed to update support ticket");
    } finally {
      setWorkingId("");
    }
  };

  const handleResolveCardRequest = async (requestId, decision) => {
    setActionError("");
    setActionMessage("");
    setWorkingId(`${decision}-${requestId}`);
    try {
      const response = await resolveCardRequestAdmin(requestId, {
        decision,
        adminNote: "Processed from admin card console",
      });
      if (response.data.success) {
        setCardRequests((current) =>
          current.map((entry) =>
            entry._id === requestId
              ? {
                  ...entry,
                  status: response.data.request?.status || (decision === "APPROVE" ? "COMPLETED" : "REJECTED"),
                  adminNote: response.data.request?.adminNote || "Processed from admin card console",
                }
              : entry
          )
        );
        setActionMessage(response.data.message || "Card request updated successfully.");
      }
    } catch (error) {
      setActionError(error.response?.data?.message || "Failed to resolve card request.");
    } finally {
      setWorkingId("");
    }
  };

  const handleResolveKycRequest = async (requestId, decision) => {
    setActionError("");
    setActionMessage("");
    setWorkingId(`KYC-${decision}-${requestId}`);
    try {
      const response = await resolveKycRequestAdmin(requestId, {
        decision,
        adminNote: "Processed from admin KYC console",
      });
      if (response.data.success) {
        setKycRequests((current) =>
          current.map((entry) =>
            entry._id === requestId
              ? {
                  ...entry,
                  status: response.data.request?.status || (decision === "APPROVE" ? "APPROVED" : "REJECTED"),
                  adminNote: response.data.request?.adminNote || "Processed from admin KYC console",
                }
              : entry
          )
        );
        setActionMessage(response.data.message || "KYC request updated successfully.");
      }
    } catch (error) {
      setActionError(error.response?.data?.message || "Failed to resolve KYC request.");
    } finally {
      setWorkingId("");
    }
  };

  if (loading) {
    return (
      <div className="admin-container">
        <p>Loading admin panel...</p>
      </div>
    );
  }

  if (!isStrictAdminUser(user)) {
    return (
      <div className="admin-container">
        <div className="admin-security-banner denied">
          <h2>Admin Identity Verification Failed</h2>
          <p>This account is not mapped to the protected admin identity.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-container">
      <div className="admin-security-banner">
        <h2>Verified Admin Session</h2>
        <p>Secure admin access active for {user?.email || "protected identity"}.</p>
      </div>
      <div className="admin-header">
        <h1>Admin Dashboard</h1>
        <button className="refresh-btn" onClick={fetchAdminData}>
          Refresh Data
        </button>
      </div>

      {actionMessage && <div className="action-message success">{actionMessage}</div>}
      {actionError && <div className="action-message error">{actionError}</div>}

      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <h3>Total Users</h3>
            <p className="stat-number">{stats.totalUsers}</p>
          </div>
          <div className="stat-card">
            <h3>Total Accounts</h3>
            <p className="stat-number">{stats.totalAccounts}</p>
          </div>
          <div className="stat-card">
            <h3>Total Transactions</h3>
            <p className="stat-number">{stats.totalTransactions}</p>
          </div>
          <div className="stat-card">
            <h3>Total Balance</h3>
            <p className="stat-number">Rs {stats.totalBalance.toFixed(2)}</p>
          </div>
          <div className="stat-card">
            <h3>Active Loans</h3>
            <p className="stat-number">{stats.totalLoans}</p>
          </div>
          <div className="stat-card">
            <h3>Total Loan Amount</h3>
            <p className="stat-number">Rs {stats.totalLoanAmount.toFixed(2)}</p>
          </div>
          <div className="stat-card">
            <h3>Total Payments</h3>
            <p className="stat-number">{stats.totalPayments || 0}</p>
          </div>
          <div className="stat-card">
            <h3>Pending Card Requests</h3>
            <p className="stat-number">{stats.totalPendingCardRequests ?? cardRequests.filter((entry) => entry.status === "PENDING").length}</p>
          </div>
          <div className="stat-card">
            <h3>Pending KYC Requests</h3>
            <p className="stat-number">{stats.totalPendingKycRequests ?? kycRequests.filter((entry) => entry.status === "PENDING").length}</p>
          </div>
          <div className="stat-card">
            <h3>Audit Logs</h3>
            <p className="stat-number">{stats.totalAuditLogs || 0}</p>
          </div>
          <div className="stat-card">
            <h3>Failed Login (24h)</h3>
            <p className="stat-number">{stats.failedLoginsLast24h || 0}</p>
          </div>
          <div className="stat-card">
            <h3>Payment Volume</h3>
            <p className="stat-number">Rs {(stats.totalPaymentAmount || 0).toFixed(2)}</p>
          </div>
          <div className="stat-card">
            <h3>Payment Reviews Pending</h3>
            <p className="stat-number">{stats.totalPaymentReviewsPending ?? reviewQueue.length}</p>
          </div>
          <div className="stat-card">
            <h3>Pending Approvals</h3>
            <p className="stat-number">{stats.totalPendingApprovals ?? approvalRequests.length}</p>
          </div>
          <div className="stat-card">
            <h3>Overdue Approvals</h3>
            <p className="stat-number">{stats.pendingOverdueApprovals ?? approvalMetrics.pendingOverdueApprovals}</p>
          </div>
          <div className="stat-card">
            <h3>Escalated Approvals</h3>
            <p className="stat-number">{stats.pendingEscalatedApprovals ?? approvalMetrics.pendingEscalatedApprovals}</p>
          </div>
          <div className="stat-card">
            <h3>Approval Mode</h3>
            <p className="stat-number">{stats.approvalMode || approvalConfig.approvalMode || "DISABLED"}</p>
          </div>
        </div>
      )}

      <div className="admin-tabs">
        <button
          className={`tab-btn ${activeTab === "overview" ? "active" : ""}`}
          onClick={() => setActiveTab("overview")}
        >
          Overview
        </button>
        <button
          className={`tab-btn ${activeTab === "charts" ? "active" : ""}`}
          onClick={() => setActiveTab("charts")}
        >
          Charts
        </button>
        <button className={`tab-btn ${activeTab === "users" ? "active" : ""}`} onClick={() => setActiveTab("users")}>
          Users ({users.length})
        </button>
        <button
          className={`tab-btn ${activeTab === "accounts" ? "active" : ""}`}
          onClick={() => setActiveTab("accounts")}
        >
          Accounts ({accounts.length})
        </button>
        <button
          className={`tab-btn ${activeTab === "transactions" ? "active" : ""}`}
          onClick={() => setActiveTab("transactions")}
        >
          Transactions ({transactions.length})
        </button>
        <button className={`tab-btn ${activeTab === "loans" ? "active" : ""}`} onClick={() => setActiveTab("loans")}>
          Loans ({loans.length})
        </button>
        <button
          className={`tab-btn ${activeTab === "loan-approvals" ? "active" : ""}`}
          onClick={() => setActiveTab("loan-approvals")}
        >
          Loan Approvals ({pendingLoanApprovals.length})
        </button>
        <button className={`tab-btn ${activeTab === "payments" ? "active" : ""}`} onClick={() => setActiveTab("payments")}>
          Payments ({payments.length})
        </button>
        <button className={`tab-btn ${activeTab === "cards" ? "active" : ""}`} onClick={() => setActiveTab("cards")}>
          Cards ({cardRequests.length})
        </button>
        <button className={`tab-btn ${activeTab === "kyc" ? "active" : ""}`} onClick={() => setActiveTab("kyc")}>
          KYC ({kycRequests.length})
        </button>
        <button className={`tab-btn ${activeTab === "support" ? "active" : ""}`} onClick={() => setActiveTab("support")}>
          Support ({supportTickets.length})
        </button>
        <button className={`tab-btn ${activeTab === "approvals" ? "active" : ""}`} onClick={() => setActiveTab("approvals")}>
          Approvals ({approvalRequests.length})
        </button>
        <button className={`tab-btn ${activeTab === "audit" ? "active" : ""}`} onClick={() => setActiveTab("audit")}>
          Audit Logs ({auditLogs.length})
        </button>
      </div>

      <div className="tab-content">
        {activeTab === "overview" && (
          <div className="overview-section">
            <h2>System Overview</h2>
            <div className="overview-cards">
              <div className="info-card">
                <h4>User Snapshot</h4>
                <p>Active: {users.filter((user) => user.isActive).length}</p>
                <p>Inactive: {users.filter((user) => !user.isActive).length}</p>
                <p>Admins: {users.filter((user) => user.role === "ADMIN").length}</p>
              </div>
              <div className="info-card">
                <h4>Account Snapshot</h4>
                <p>Active: {accounts.filter((account) => account.status === "ACTIVE").length}</p>
                <p>Frozen: {accounts.filter((account) => account.status === "FROZEN").length}</p>
                <p>Average Balance: Rs {(stats.totalBalance / accounts.length || 0).toFixed(2)}</p>
              </div>
              <div className="info-card">
                <h4>Recent Activity</h4>
                <p>
                  Today:{" "}
                  {
                    transactions.filter((transaction) => {
                      const today = new Date().toDateString();
                      return new Date(transaction.createdAt).toDateString() === today;
                    }).length
                  }
                </p>
                <p>Total Logged: {transactions.length}</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === "charts" && (
          <div className="charts-section">
            <h2>Trends (Last 30 Days)</h2>
            {!trends ? (
              <p>No trend data available.</p>
            ) : (
              <div className="charts-grid">
                <div className="chart-card">
                  <h3>Transactions by Type</h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={mergeTransactionSeries(trends.transactions)}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="day" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="DEPOSIT" stroke="#1f9b52" dot={false} />
                      <Line type="monotone" dataKey="WITHDRAWAL" stroke="#d64053" dot={false} />
                      <Line type="monotone" dataKey="TRANSFER" stroke="#115c9f" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="chart-card">
                  <h3>New Users Per Day</h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={trends.newUsers}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="day" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="count" fill="#115c9f" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="chart-card">
                  <h3>New Accounts Per Day</h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={trends.newAccounts}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="day" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="count" fill="#cf1e3f" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "users" && (
          <div className="data-table-section">
            <h2>User Management</h2>
            <p className="admin-table-note">
              Protected admin identity rows are locked from email/phone/role/status changes. Admin can unblock user transaction lockouts.
            </p>
            {editingUserId ? (
              <form className="admin-user-edit-card" onSubmit={handleSubmitUserEdit}>
                <h3>Edit User Details</h3>
                <div className="admin-user-edit-grid">
                  <label>
                    First Name
                    <input name="firstName" value={userEditForm.firstName} onChange={handleUserEditChange} required />
                  </label>
                  <label>
                    Last Name
                    <input name="lastName" value={userEditForm.lastName} onChange={handleUserEditChange} required />
                  </label>
                  <label>
                    Email
                    <input type="email" name="email" value={userEditForm.email} onChange={handleUserEditChange} required />
                  </label>
                  <label>
                    Phone
                    <input name="phone" value={userEditForm.phone} onChange={handleUserEditChange} required />
                  </label>
                  <label>
                    Role
                    <select name="role" value={userEditForm.role} onChange={handleUserEditChange}>
                      <option value="USER">USER</option>
                      <option value="ADMIN">ADMIN</option>
                    </select>
                  </label>
                  <label className="admin-user-edit-active">
                    <input
                      type="checkbox"
                      name="isActive"
                      checked={Boolean(userEditForm.isActive)}
                      onChange={handleUserEditChange}
                    />
                    Active User
                  </label>
                </div>
                <label>
                  Address
                  <textarea name="address" value={userEditForm.address} onChange={handleUserEditChange} rows={3} required />
                </label>
                <div className="admin-user-edit-actions">
                  <button type="submit" className="table-action-btn success" disabled={workingId === `edit-${editingUserId}`}>
                    {workingId === `edit-${editingUserId}` ? "Saving..." : "Save Changes"}
                  </button>
                  <button type="button" className="table-action-btn" onClick={handleCancelUserEdit} disabled={workingId === `edit-${editingUserId}`}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : null}
            <div className="admin-inline-filter">
              <input
                type="text"
                value={tableSearch.users}
                onChange={(event) => handleTableSearchChange("users", event.target.value)}
                placeholder="Search users by name, email, phone, role, status"
              />
              <span>{filteredUsers.length} records</span>
              {tableSearch.users ? (
                <button type="button" className="table-action-btn" onClick={() => handleTableSearchChange("users", "")}>
                  Clear
                </button>
              ) : null}
            </div>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Tx Security</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan="7">No users match this filter.</td>
                    </tr>
                  ) : (
                    filteredUsers.map((rowUser) => {
                    const isProtectedAdmin = isAdminIdentity(rowUser);
                    const isUpdating = workingId === rowUser._id;
                    const isActionDisabled = isUpdating || isProtectedAdmin;
                    const isSavingEdit = workingId === `edit-${rowUser._id}`;
                    const isUnblockWorking = workingId === `unblock-${rowUser._id}`;
                    const txLock = getTransactionLockInfo(rowUser);

                    return (
                      <tr key={rowUser._id} className={isProtectedAdmin ? "protected-admin-row" : ""}>
                        <td>
                          {rowUser.firstName} {rowUser.lastName}
                        </td>
                        <td>{rowUser.email}</td>
                        <td>{rowUser.phone}</td>
                        <td>
                          <span className={`role-badge ${rowUser.role.toLowerCase()}`}>{rowUser.role}</span>
                          {isProtectedAdmin && <span className="admin-lock-badge">Protected</span>}
                        </td>
                        <td>
                          <span className={`status-badge ${rowUser.isActive ? "active" : "inactive"}`}>
                            {rowUser.isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td>
                          <div className="tx-security-cell">
                            <span className={`status-badge ${txLock.isLocked ? "inactive" : "active"}`}>
                              {txLock.isLocked ? "Locked" : "Open"}
                            </span>
                            {txLock.isLocked && txLock.lockedUntilText ? <small>Until: {txLock.lockedUntilText}</small> : null}
                            {!txLock.isLocked && txLock.attempts > 0 ? <small>Attempts: {txLock.attempts}</small> : null}
                          </div>
                        </td>
                        <td>
                          <div className="admin-user-actions">
                            <button
                              type="button"
                              className="table-action-btn"
                              onClick={() => handleStartUserEdit(rowUser)}
                              disabled={isSavingEdit}
                            >
                              {editingUserId === rowUser._id ? "Editing..." : "Edit"}
                            </button>
                            <button
                              type="button"
                              className={`table-action-btn ${rowUser.isActive ? "danger" : "success"}`}
                              onClick={() => handleToggleUserStatus(rowUser)}
                              disabled={isActionDisabled}
                              title={isProtectedAdmin ? "Protected admin identity cannot be deactivated." : ""}
                            >
                              {isUpdating ? "Updating..." : isProtectedAdmin ? "Protected" : rowUser.isActive ? "Deactivate" : "Activate"}
                            </button>
                            <button
                              type="button"
                              className="table-action-btn success"
                              onClick={() => handleUnblockUserTransactions(rowUser)}
                              disabled={isUnblockWorking || !txLock.isLocked}
                              title={!txLock.isLocked ? "User transactions are already unblocked." : ""}
                            >
                              {isUnblockWorking ? "Unblocking..." : "Unblock Tx"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "accounts" && (
          <div className="data-table-section">
            <h2>Account Management</h2>
            <div className="admin-inline-filter">
              <input
                type="text"
                value={tableSearch.accounts}
                onChange={(event) => handleTableSearchChange("accounts", event.target.value)}
                placeholder="Search accounts by number, type, IFSC, status, balance"
              />
              <span>{filteredAccounts.length} records</span>
              {tableSearch.accounts ? (
                <button type="button" className="table-action-btn" onClick={() => handleTableSearchChange("accounts", "")}>
                  Clear
                </button>
              ) : null}
            </div>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Account Number</th>
                    <th>Type</th>
                    <th>Balance</th>
                    <th>IFSC</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAccounts.length === 0 ? (
                    <tr>
                      <td colSpan="6">No accounts match this filter.</td>
                    </tr>
                  ) : (
                    filteredAccounts.map((account) => (
                      <tr key={account._id}>
                        <td className="account-number">{account.accountNumber}</td>
                        <td>{account.accountType}</td>
                        <td>Rs {account.balance.toFixed(2)}</td>
                        <td>{account.ifscCode}</td>
                        <td>
                          <span className={`status-badge ${account.status.toLowerCase()}`}>{account.status}</span>
                        </td>
                        <td>
                          <select
                            value={account.status}
                            onChange={(event) => handleAccountStatusChange(account._id, event.target.value)}
                            className="table-select"
                            disabled={workingId === account._id}
                          >
                            <option value="ACTIVE">ACTIVE</option>
                            <option value="INACTIVE">INACTIVE</option>
                            <option value="FROZEN">FROZEN</option>
                          </select>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "transactions" && (
          <div className="data-table-section">
            <h2>Transaction History</h2>
            <div className="admin-inline-filter">
              <input
                type="text"
                value={tableSearch.transactions}
                onChange={(event) => handleTableSearchChange("transactions", event.target.value)}
                placeholder="Search transactions by type, account, date, amount, status"
              />
              <span>{filteredTransactions.length} records</span>
              {tableSearch.transactions ? (
                <button type="button" className="table-action-btn" onClick={() => handleTableSearchChange("transactions", "")}>
                  Clear
                </button>
              ) : null}
            </div>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Account</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan="5">No transactions match this filter.</td>
                    </tr>
                  ) : (
                    filteredTransactions.map((transaction) => (
                      <tr key={transaction._id}>
                        <td>{new Date(transaction.createdAt).toLocaleDateString("en-IN")}</td>
                        <td>{transaction.type}</td>
                        <td>Rs {transaction.amount.toFixed(2)}</td>
                        <td className="account-number">{transaction.accountId?.accountNumber}</td>
                        <td>
                          <span className={`status-badge ${(transaction.status || "PENDING").toLowerCase()}`}>
                            {transaction.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "loans" && (
          <div className="data-table-section">
            <h2>Loan Management</h2>
            <div className="admin-inline-filter">
              <input
                type="text"
                value={tableSearch.loans}
                onChange={(event) => handleTableSearchChange("loans", event.target.value)}
                placeholder="Search loans by customer, type, status, principal, remaining"
              />
              <span>{filteredLoans.length} records</span>
              {tableSearch.loans ? (
                <button type="button" className="table-action-btn" onClick={() => handleTableSearchChange("loans", "")}>
                  Clear
                </button>
              ) : null}
            </div>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Type</th>
                    <th>Principal</th>
                    <th>EMI</th>
                    <th>Remaining</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLoans.length === 0 ? (
                    <tr>
                      <td colSpan="7">No loans match this filter.</td>
                    </tr>
                  ) : (
                    filteredLoans.map((loan) => (
                      <tr key={loan._id}>
                        <td>{loan.userId ? `${loan.userId.firstName} ${loan.userId.lastName}` : "N/A"}</td>
                        <td>{loan.loanType}</td>
                        <td>{formatAmount(loan.principal)}</td>
                        <td>{formatAmount(getLoanEmiDisplay(loan))}</td>
                        <td>{formatAmount(loan.remainingAmount)}</td>
                        <td>
                          <span className={`status-badge ${loan.status.toLowerCase()}`}>{loan.status}</span>
                        </td>
                        <td>
                          <select
                            value={loan.status}
                            onChange={(event) => handleLoanStatusChange(loan._id, event.target.value)}
                            className="table-select"
                            disabled={workingId === loan._id}
                          >
                            <option value="PENDING">PENDING</option>
                            <option value="APPROVED">APPROVED</option>
                            <option value="REJECTED">REJECTED</option>
                            <option value="CLOSED">CLOSED</option>
                          </select>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "loan-approvals" && (
          <div className="data-table-section">
            <h2>Loan Approval Console</h2>
            <p className="admin-table-note">Approve or reject pending loan requests quickly from this queue.</p>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Applied</th>
                    <th>Customer</th>
                    <th>Type</th>
                    <th>Principal</th>
                    <th>Tenure</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingLoanApprovals.length === 0 ? (
                    <tr>
                      <td colSpan="7">No pending loan approvals.</td>
                    </tr>
                  ) : (
                    pendingLoanApprovals.map((loan) => {
                      const isUpdating = workingId === loan._id;
                      return (
                        <tr key={loan._id}>
                          <td>{new Date(loan.createdAt).toLocaleString("en-IN")}</td>
                          <td>{loan.userId ? `${loan.userId.firstName} ${loan.userId.lastName}` : "N/A"}</td>
                          <td>{loan.loanType}</td>
                          <td>{formatAmount(loan.principal)}</td>
                          <td>{loan.tenure} months</td>
                          <td>
                            <span className="status-badge pending">{loan.status}</span>
                          </td>
                          <td>
                            <div className="approval-actions">
                              <button
                                type="button"
                                className="table-action-btn success"
                                onClick={() => handleLoanStatusChange(loan._id, "APPROVED")}
                                disabled={isUpdating}
                              >
                                {isUpdating ? "Working..." : "Approve"}
                              </button>
                              <button
                                type="button"
                                className="table-action-btn danger"
                                onClick={() => handleLoanStatusChange(loan._id, "REJECTED")}
                                disabled={isUpdating}
                              >
                                {isUpdating ? "Working..." : "Reject"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "payments" && (
          <div className="data-table-section">
            <h2>Payment Management</h2>
            <p className="admin-table-note">
              Review queue pending: {reviewQueue.length}. Resolve flagged webhook items before closure.
            </p>
            <div className="admin-inline-filter">
              <input
                type="text"
                value={tableSearch.payments}
                onChange={(event) => handleTableSearchChange("payments", event.target.value)}
                placeholder="Search payments by customer, order, gateway, method, status, amount"
              />
              <span>{filteredPayments.length} records</span>
              {tableSearch.payments ? (
                <button type="button" className="table-action-btn" onClick={() => handleTableSearchChange("payments", "")}>
                  Clear
                </button>
              ) : null}
            </div>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Customer</th>
                    <th>Order</th>
                    <th>Gateway</th>
                    <th>Method</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPayments.length === 0 ? (
                    <tr>
                      <td colSpan="8">No payments match this filter.</td>
                    </tr>
                  ) : (
                    filteredPayments.map((payment) => {
                      const requiresReview = Boolean(payment?.metadata?.webhookRefundPendingReview);
                      const isUpdating = workingId === payment._id;
                      const canRefund = payment.status === "SUCCESS" && !requiresReview;

                      return (
                        <tr key={payment._id} className={requiresReview ? "review-payment-row" : ""}>
                          <td>{new Date(payment.createdAt).toLocaleDateString("en-IN")}</td>
                          <td>{payment.userId ? `${payment.userId.firstName} ${payment.userId.lastName}` : "N/A"}</td>
                          <td className="account-number">{payment.providerOrderId}</td>
                          <td>{payment.gateway}</td>
                          <td>{payment.method}</td>
                          <td>Rs {Number(payment.amount || 0).toFixed(2)}</td>
                          <td>
                            <div className="status-stack">
                              <span className={`status-badge ${String(payment.status || "PENDING").toLowerCase()}`}>
                                {payment.status}
                              </span>
                              {requiresReview && <span className="status-badge pending">Review</span>}
                            </div>
                          </td>
                          <td>
                            {requiresReview ? (
                              <button
                                type="button"
                                className="table-action-btn success"
                                onClick={() => handleResolvePaymentReview(payment._id)}
                                disabled={isUpdating}
                              >
                                {isUpdating ? "Resolving..." : "Resolve Review"}
                              </button>
                            ) : (
                              <button
                                type="button"
                                className={`table-action-btn ${canRefund ? "danger" : "success"}`}
                                onClick={() => handleRefundPayment(payment._id)}
                                disabled={isUpdating || !canRefund}
                              >
                                {isUpdating ? "Processing..." : canRefund ? "Refund" : "No Action"}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "cards" && (
          <div className="data-table-section">
            <h2>Card Request Management</h2>
            <p className="admin-table-note">Approve or reject card applications and card-service requests.</p>
            <div className="admin-inline-filter">
              <input
                type="text"
                value={tableSearch.cards}
                onChange={(event) => handleTableSearchChange("cards", event.target.value)}
                placeholder="Search card requests by customer, request type, status, card number, note"
              />
              <span>{filteredCardRequests.length} records</span>
              {tableSearch.cards ? (
                <button type="button" className="table-action-btn" onClick={() => handleTableSearchChange("cards", "")}>
                  Clear
                </button>
              ) : null}
            </div>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Requested</th>
                    <th>Customer</th>
                    <th>Request</th>
                    <th>Card</th>
                    <th>Status</th>
                    <th>Reason</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCardRequests.length === 0 ? (
                    <tr>
                      <td colSpan="7">No card requests found.</td>
                    </tr>
                  ) : (
                    filteredCardRequests.map((request) => {
                      const isPending = request.status === "PENDING";
                      const approveKey = `APPROVE-${request._id}`;
                      const rejectKey = `REJECT-${request._id}`;
                      const isApproving = workingId === approveKey;
                      const isRejecting = workingId === rejectKey;
                      return (
                        <tr key={request._id}>
                          <td>{new Date(request.createdAt).toLocaleString("en-IN")}</td>
                          <td>
                            {request.userId
                              ? `${request.userId.firstName || ""} ${request.userId.lastName || ""}`.trim() || request.userId.email
                              : "N/A"}
                          </td>
                          <td>
                            <div className="status-stack">
                              <span className="status-badge pending">{request.requestType}</span>
                              <span>{request.cardType || request.cardId?.cardType || "-"}</span>
                            </div>
                          </td>
                          <td className="account-number">{request.cardId?.cardNumberMasked || "-"}</td>
                          <td>
                            <span className={`status-badge ${String(request.status || "PENDING").toLowerCase()}`}>{request.status}</span>
                          </td>
                          <td>{request.reason || request.adminNote || "-"}</td>
                          <td>
                            {isPending ? (
                              <div className="approval-actions">
                                <button
                                  type="button"
                                  className="table-action-btn success"
                                  onClick={() => handleResolveCardRequest(request._id, "APPROVE")}
                                  disabled={isApproving || isRejecting}
                                >
                                  {isApproving ? "Approving..." : "Approve"}
                                </button>
                                <button
                                  type="button"
                                  className="table-action-btn danger"
                                  onClick={() => handleResolveCardRequest(request._id, "REJECT")}
                                  disabled={isApproving || isRejecting}
                                >
                                  {isRejecting ? "Rejecting..." : "Reject"}
                                </button>
                              </div>
                            ) : (
                              <span className="status-badge pending">No Action</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "kyc" && (
          <div className="data-table-section">
            <h2>KYC Verification Console</h2>
            <p className="admin-table-note">Review and decide pending KYC submissions from customers.</p>
            <div className="admin-inline-filter">
              <input
                type="text"
                value={tableSearch.kyc}
                onChange={(event) => handleTableSearchChange("kyc", event.target.value)}
                placeholder="Search KYC by customer, PAN, status, occupation, proof type"
              />
              <span>{filteredKycRequests.length} records</span>
              {tableSearch.kyc ? (
                <button type="button" className="table-action-btn" onClick={() => handleTableSearchChange("kyc", "")}>
                  Clear
                </button>
              ) : null}
            </div>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Submitted</th>
                    <th>Customer</th>
                    <th>PAN</th>
                    <th>KYC Profile</th>
                    <th>Status</th>
                    <th>Notes</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredKycRequests.length === 0 ? (
                    <tr>
                      <td colSpan="7">No KYC requests found.</td>
                    </tr>
                  ) : (
                    filteredKycRequests.map((request) => {
                      const isPending = request.status === "PENDING";
                      const approveKey = `KYC-APPROVE-${request._id}`;
                      const rejectKey = `KYC-REJECT-${request._id}`;
                      const isApproving = workingId === approveKey;
                      const isRejecting = workingId === rejectKey;
                      return (
                        <tr key={request._id}>
                          <td>{new Date(request.createdAt).toLocaleString("en-IN")}</td>
                          <td>
                            {request.userId
                              ? `${request.userId.firstName || ""} ${request.userId.lastName || ""}`.trim() || request.userId.email
                              : "N/A"}
                          </td>
                          <td className="account-number">{request.panNumber || "-"}</td>
                          <td>
                            <div className="status-stack">
                              <span>{request.occupation || "-"}</span>
                              <span>{request.incomeRange || "-"}</span>
                              <span>{request.idProofType || "-"}</span>
                            </div>
                          </td>
                          <td>
                            <span className={`status-badge ${String(request.status || "PENDING").toLowerCase()}`}>{request.status}</span>
                          </td>
                          <td>{request.adminNote || request.notes || "-"}</td>
                          <td>
                            {isPending ? (
                              <div className="approval-actions">
                                <button
                                  type="button"
                                  className="table-action-btn success"
                                  onClick={() => handleResolveKycRequest(request._id, "APPROVE")}
                                  disabled={isApproving || isRejecting}
                                >
                                  {isApproving ? "Approving..." : "Approve"}
                                </button>
                                <button
                                  type="button"
                                  className="table-action-btn danger"
                                  onClick={() => handleResolveKycRequest(request._id, "REJECT")}
                                  disabled={isApproving || isRejecting}
                                >
                                  {isRejecting ? "Rejecting..." : "Reject"}
                                </button>
                              </div>
                            ) : (
                              <span className="status-badge pending">No Action</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "support" && (
          <div className="data-table-section">
            <h2>Support Ticket Management</h2>
            <div className="admin-inline-filter">
              <input
                type="text"
                value={tableSearch.support}
                onChange={(event) => handleTableSearchChange("support", event.target.value)}
                placeholder="Search tickets by number, subject, category, priority, status, customer"
              />
              <span>{filteredSupportTickets.length} records</span>
              {tableSearch.support ? (
                <button type="button" className="table-action-btn" onClick={() => handleTableSearchChange("support", "")}>
                  Clear
                </button>
              ) : null}
            </div>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Updated</th>
                    <th>Ticket</th>
                    <th>Customer</th>
                    <th>Category</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Subject</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSupportTickets.length === 0 ? (
                    <tr>
                      <td colSpan="8">No support tickets match this filter.</td>
                    </tr>
                  ) : (
                    filteredSupportTickets.map((ticket) => (
                      <tr key={ticket._id}>
                        <td>{new Date(ticket.updatedAt).toLocaleString("en-IN")}</td>
                        <td className="account-number">{ticket.ticketNumber}</td>
                        <td>
                          {ticket.userId
                            ? `${ticket.userId.firstName || ""} ${ticket.userId.lastName || ""}`.trim() || ticket.userId.email
                            : "N/A"}
                        </td>
                        <td>{ticket.category}</td>
                        <td>{ticket.priority}</td>
                        <td>
                          <span className={`status-badge ${String(ticket.status || "OPEN").toLowerCase()}`}>{ticket.status}</span>
                        </td>
                        <td>{ticket.subject}</td>
                        <td>
                          <select
                            value={ticket.status}
                            onChange={(event) => handleSupportStatusChange(ticket._id, event.target.value)}
                            className="table-select"
                            disabled={workingId === ticket._id}
                          >
                            <option value="OPEN">OPEN</option>
                            <option value="IN_PROGRESS">IN_PROGRESS</option>
                            <option value="RESOLVED">RESOLVED</option>
                            <option value="CLOSED">CLOSED</option>
                          </select>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "approvals" && (
          <div className="data-table-section">
            <h2>Approval Workflow</h2>
            <p className="admin-table-note">
              Mode: <strong>{approvalConfig.approvalMode}</strong>. Required actions:{" "}
              {approvalConfig.requiredApprovalActions?.length ? approvalConfig.requiredApprovalActions.join(", ") : "None"}. Dual control:{" "}
              <strong>{approvalConfig.dualControlEnforced ? "ENFORCED" : "OFF"}</strong>. Review note:{" "}
              <strong>{approvalConfig.reviewNoteRequired ? "REQUIRED" : "OPTIONAL"}</strong>. SLA:{" "}
              <strong>{approvalConfig.approvalSlaHours}h</strong>. Escalation:{" "}
              <strong>{approvalConfig.approvalEscalationHours}h</strong>. Overdue:{" "}
              <strong>{approvalMetrics.pendingOverdueApprovals}</strong>. Escalated:{" "}
              <strong>{approvalMetrics.pendingEscalatedApprovals}</strong>.
            </p>
            <div className="audit-toolbar">
              <div className="audit-field">
                <label>Status</label>
                <select name="status" value={approvalFilters.status} onChange={handleApprovalFilterChange} className="table-select">
                  <option value="">All</option>
                  <option value="PENDING">PENDING</option>
                  <option value="EXECUTED">EXECUTED</option>
                  <option value="REJECTED">REJECTED</option>
                  <option value="FAILED">FAILED</option>
                </select>
              </div>
              <div className="audit-field">
                <label>Action Type</label>
                <select
                  name="actionType"
                  value={approvalFilters.actionType}
                  onChange={handleApprovalFilterChange}
                  className="table-select"
                >
                  <option value="">All Actions</option>
                  <option value="ACCOUNT_STATUS_UPDATE">ACCOUNT_STATUS_UPDATE</option>
                  <option value="LOAN_STATUS_UPDATE">LOAN_STATUS_UPDATE</option>
                  <option value="PAYMENT_REFUND">PAYMENT_REFUND</option>
                </select>
              </div>
              <div className="audit-field approval-filter-checks">
                <label>
                  <input
                    type="checkbox"
                    name="overdueOnly"
                    checked={Boolean(approvalFilters.overdueOnly)}
                    onChange={handleApprovalFilterChange}
                  />
                  Overdue Only
                </label>
                <label>
                  <input
                    type="checkbox"
                    name="escalatedOnly"
                    checked={Boolean(approvalFilters.escalatedOnly)}
                    onChange={handleApprovalFilterChange}
                  />
                  Escalated Only
                </label>
              </div>
              <div className="audit-actions approval-filter-actions">
                <button
                  type="button"
                  className="table-action-btn success"
                  onClick={handleApplyApprovalFilters}
                  disabled={loadingApprovals}
                >
                  {loadingApprovals ? "Loading..." : "Apply"}
                </button>
                <button type="button" className="table-action-btn" onClick={handleResetApprovalFilters} disabled={loadingApprovals}>
                  Reset
                </button>
                <button
                  type="button"
                  className="table-action-btn danger"
                  onClick={handleEscalateOverdueRequests}
                  disabled={workingId === "approval-escalate-overdue"}
                >
                  {workingId === "approval-escalate-overdue" ? "Escalating..." : "Escalate Overdue"}
                </button>
                <button
                  type="button"
                  className="table-action-btn success"
                  onClick={handleExportApprovalRequests}
                  disabled={workingId === "approval-export"}
                >
                  {workingId === "approval-export" ? "Exporting..." : "Export CSV"}
                </button>
              </div>
            </div>
            <div className="approval-note-box">
              <label>Decision / Escalation Note {approvalConfig.reviewNoteRequired ? "*" : "(Optional)"}</label>
              <textarea
                value={approvalReviewNote}
                onChange={(event) => setApprovalReviewNote(event.target.value)}
                placeholder="Add reason for approve / reject / escalate"
                maxLength={240}
              />
            </div>

            {approvalSummary.length > 0 && (
              <div className="audit-action-chips">
                {approvalSummary.map((item) => (
                  <span key={item.actionType} className="audit-action-chip">
                    {item.actionType} ({item.count})
                  </span>
                ))}
              </div>
            )}

            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Requested</th>
                    <th>Action</th>
                    <th>Target</th>
                    <th>Requested By</th>
                    <th>Status</th>
                    <th>SLA</th>
                    <th>Notes</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {approvalRequests.length === 0 ? (
                    <tr>
                      <td colSpan="8">No approval requests found.</td>
                    </tr>
                  ) : (
                    approvalRequests.map((request) => {
                      const isPending = request.status === "PENDING";
                      const isUpdating = workingId === request._id;
                      const requestedById = String(request.requestedBy?._id || request.requestedBy || "");
                      const isSelfRequested = requestedById && requestedById === String(user?._id || user?.id || "");
                      const isDualControlBlocked = approvalConfig.dualControlEnforced && isSelfRequested;
                      return (
                        <tr key={request._id}>
                          <td>{new Date(request.createdAt).toLocaleString("en-IN")}</td>
                          <td>
                            <span className="status-badge pending">{request.actionType}</span>
                          </td>
                          <td className="account-number">{formatApprovalTarget(request)}</td>
                          <td>
                            {request.requestedBy
                              ? `${request.requestedBy.firstName || ""} ${request.requestedBy.lastName || ""}`.trim() ||
                                request.requestedBy.email
                              : "System"}
                          </td>
                          <td>
                            <span className={`status-badge ${String(request.status || "PENDING").toLowerCase()}`}>
                              {request.status}
                            </span>
                          </td>
                          <td>
                            <div className="approval-sla-stack">
                              <span className="status-badge pending">{Number(request.ageHours || 0).toFixed(1)}h</span>
                              {request.isOverdue && <span className="status-badge failed">Overdue</span>}
                              {request.isEscalated && <span className="status-badge danger">Escalated</span>}
                            </div>
                          </td>
                          <td className="audit-metadata-cell">
                            <code>{formatApprovalNotes(request)}</code>
                          </td>
                          <td>
                            {isPending ? (
                              <div className="approval-actions">
                                <button
                                  type="button"
                                  className="table-action-btn success"
                                  onClick={() => handleApproveRequest(request)}
                                  disabled={isUpdating || isDualControlBlocked}
                                  title={isDualControlBlocked ? "Dual-control policy blocks self-approval." : ""}
                                >
                                  {isDualControlBlocked ? "Self Blocked" : isUpdating ? "Working..." : "Approve"}
                                </button>
                                <button
                                  type="button"
                                  className="table-action-btn danger"
                                  onClick={() => handleRejectRequest(request)}
                                  disabled={isUpdating || isDualControlBlocked}
                                  title={isDualControlBlocked ? "Dual-control policy blocks self-rejection." : ""}
                                >
                                  {isDualControlBlocked ? "Self Blocked" : "Reject"}
                                </button>
                                <button
                                  type="button"
                                  className="table-action-btn"
                                  onClick={() => handleEscalateRequest(request)}
                                  disabled={isUpdating || Boolean(request.isEscalated)}
                                  title={request.isEscalated ? "Already escalated." : "Escalate this request for priority review."}
                                >
                                  {request.isEscalated ? "Escalated" : "Escalate"}
                                </button>
                              </div>
                            ) : (
                              <span className="status-badge pending">No Action</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="audit-pagination">
              <button
                type="button"
                className="table-action-btn"
                onClick={() => fetchApprovalRequests({ page: Math.max(1, approvalPage - 1) })}
                disabled={loadingApprovals || approvalPage <= 1}
              >
                Previous
              </button>
              <span>
                Page {approvalPage} of {approvalTotalPages}
              </span>
              <button
                type="button"
                className="table-action-btn"
                onClick={() => fetchApprovalRequests({ page: Math.min(approvalTotalPages, approvalPage + 1) })}
                disabled={loadingApprovals || approvalPage >= approvalTotalPages}
              >
                Next
              </button>
            </div>
          </div>
        )}

        {activeTab === "audit" && (
          <div className="data-table-section">
            <h2>Audit & Security Logs</h2>
            <p className="admin-table-note">Track login failures, PIN changes, OTP requests, and payment risk events.</p>
            <div className="audit-toolbar">
              <div className="audit-field">
                <label>Action</label>
                <select name="action" value={auditFilters.action} onChange={handleAuditFilterChange} className="table-select">
                  <option value="">All Actions</option>
                  {auditActions.map((item) => (
                    <option key={item.action} value={item.action}>
                      {item.action}
                    </option>
                  ))}
                </select>
              </div>
              <div className="audit-field">
                <label>From</label>
                <input type="date" name="from" value={auditFilters.from} onChange={handleAuditFilterChange} />
              </div>
              <div className="audit-field">
                <label>To</label>
                <input type="date" name="to" value={auditFilters.to} onChange={handleAuditFilterChange} />
              </div>
              <div className="audit-actions">
                <button type="button" className="table-action-btn success" onClick={handleApplyAuditFilters} disabled={loadingAudit}>
                  {loadingAudit ? "Loading..." : "Apply"}
                </button>
                <button type="button" className="table-action-btn" onClick={handleResetAuditFilters} disabled={loadingAudit}>
                  Reset
                </button>
                <button
                  type="button"
                  className="table-action-btn success"
                  onClick={handleExportAuditLogs}
                  disabled={workingId === "audit-export"}
                >
                  {workingId === "audit-export" ? "Exporting..." : "Export CSV"}
                </button>
              </div>
            </div>
            {auditActions.length > 0 && (
              <div className="audit-action-chips">
                {auditActions.slice(0, 8).map((item) => (
                  <span key={item.action} className="audit-action-chip">
                    {item.action} ({item.count})
                  </span>
                ))}
              </div>
            )}
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>User</th>
                    <th>Action</th>
                    <th>IP</th>
                    <th>Metadata</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan="5">No audit logs found.</td>
                    </tr>
                  ) : (
                    auditLogs.map((entry) => (
                      <tr key={entry._id}>
                        <td>{new Date(entry.createdAt).toLocaleString("en-IN")}</td>
                        <td>
                          {entry.userId
                            ? `${entry.userId.firstName || ""} ${entry.userId.lastName || ""}`.trim() || entry.userId.email
                            : "System"}
                        </td>
                        <td>
                          <span className="status-badge pending">{entry.action}</span>
                        </td>
                        <td className="account-number">{entry.ipAddress || "-"}</td>
                        <td className="audit-metadata-cell">
                          <code>{formatAuditMetadata(entry.metadata)}</code>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="audit-pagination">
              <button
                type="button"
                className="table-action-btn"
                onClick={() => fetchAuditLogs({ page: Math.max(1, auditPage - 1) })}
                disabled={loadingAudit || auditPage <= 1}
              >
                Previous
              </button>
              <span>
                Page {auditPage} of {auditTotalPages}
              </span>
              <button
                type="button"
                className="table-action-btn"
                onClick={() => fetchAuditLogs({ page: Math.min(auditTotalPages, auditPage + 1) })}
                disabled={loadingAudit || auditPage >= auditTotalPages}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPanel;

function mergeTransactionSeries(rows) {
  const map = {};
  rows.forEach((row) => {
    if (!map[row.day]) {
      map[row.day] = { day: row.day, DEPOSIT: 0, WITHDRAWAL: 0, TRANSFER: 0 };
    }
    row.byType.forEach((entry) => {
      if (entry.type && map[row.day][entry.type] !== undefined) {
        map[row.day][entry.type] = entry.totalAmount;
      }
    });
  });
  return Object.values(map).sort((a, b) => (a.day < b.day ? -1 : 1));
}

function formatAuditMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return "-";
  const text = JSON.stringify(metadata);
  return text.length > 220 ? `${text.slice(0, 220)}...` : text;
}

function formatApprovalTarget(request) {
  if (!request) return "-";
  const type = request.targetType || "";
  const id = String(request.targetId || "");
  const shortId = id ? id.slice(-8) : "";
  return `${type}:${shortId}`;
}

function formatApprovalNotes(request) {
  if (!request) return "-";
  const notes = [request.requestNote, request.reviewNote, request.failureReason].filter(Boolean).join(" | ");
  if (!notes) return "-";
  return notes.length > 220 ? `${notes.slice(0, 220)}...` : notes;
}

function matchesAnyQuery(query, values = []) {
  if (!query) return true;
  return values.some((value) => String(value ?? "").toLowerCase().includes(query));
}

function getTransactionLockInfo(user = {}) {
  const attempts = Number(user?.transactionPinAttempts || 0);
  const lockedUntilRaw = user?.transactionPinLockedUntil;
  if (!lockedUntilRaw) {
    return { isLocked: false, attempts, lockedUntilText: "" };
  }

  const lockedUntilDate = new Date(lockedUntilRaw);
  if (Number.isNaN(lockedUntilDate.getTime())) {
    return { isLocked: false, attempts, lockedUntilText: "" };
  }

  const isLocked = lockedUntilDate > new Date();
  return {
    isLocked,
    attempts,
    lockedUntilText: lockedUntilDate.toLocaleString("en-IN"),
  };
}

const loanInterestFallbackMap = {
  PERSONAL: 12,
  HOME: 8,
  VEHICLE: 10,
  EDUCATION: 9,
};

function formatAmount(value) {
  return `Rs ${Number(value || 0).toFixed(2)}`;
}

function calculateEmiFallback({ principal, tenure, annualRate }) {
  const p = Number(principal);
  const months = Number(tenure);
  const monthlyRate = Number(annualRate) / 12 / 100;

  if (!Number.isFinite(p) || p <= 0 || !Number.isFinite(months) || months <= 0) {
    return 0;
  }

  if (!Number.isFinite(monthlyRate) || monthlyRate === 0) {
    return p / months;
  }

  const emi = (p * monthlyRate * (1 + monthlyRate) ** months) / ((1 + monthlyRate) ** months - 1);
  return Number.isFinite(emi) ? emi : 0;
}

function getLoanEmiDisplay(loan) {
  const existing = Number(loan?.emi);
  if (Number.isFinite(existing) && existing > 0) {
    return existing;
  }

  const loanType = String(loan?.loanType || "").toUpperCase();
  return calculateEmiFallback({
    principal: loan?.principal,
    tenure: loan?.tenure,
    annualRate: loanInterestFallbackMap[loanType] || 0,
  });
}
