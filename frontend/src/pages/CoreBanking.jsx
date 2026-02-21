import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { isStrictAdminUser } from "../utils/adminIdentity";
import {
  bootstrapCoreBanking,
  closeFixedDeposit,
  closeRecurringDeposit,
  createFixedDeposit,
  createTreasurySnapshot,
  createRailTransfer,
  createRecurringDeposit,
  getMyApprovalRequests,
  cancelMyApprovalRequest,
  downloadRegulatoryReportCsv,
  createVpaHandle,
  getDefaultedRecurringDeposits,
  forceDebitRecurringDepositByAdmin as forceDebitRecurringDepositByAdminApi,
  getRegulatoryAlerts,
  getAmlAlerts,
  getGlAccounts,
  getGlBalanceSheet,
  getGlProfitAndLoss,
  getGlTrialBalance,
  getInterestAccruals,
  getMyFixedDeposits,
  getMyRecurringDeposits,
  getMyVpaHandles,
  acknowledgeRegulatoryAlert,
  getRegulatoryPublications,
  getRegulatoryReport,
  getSettlementRecords,
  getTreasurySnapshots,
  payRecurringInstallment,
  recoverDefaultedRecurringDeposit,
  runRecurringDepositAutoDebitJob as runRecurringDepositAutoDebitJobApi,
  runSipAutoDebitJob as runSipAutoDebitJobApi,
  reconcileSettlementRecord,
  resolveRegulatoryAlert,
  requestRegulatoryReportPublish,
  requestManualGlJournalApproval,
  requestSipPlan,
  runFixedDepositMaturityJob as runFixedDepositMaturityJobApi,
  runAmlScan,
  runRegulatoryBreachMonitor as runRegulatoryBreachMonitorApi,
  runInterestEod,
  getMySipPlans,
  getAdminSipRequests,
  updateMySipPlanStatus,
  paySipInstallment,
  decideSipRequest,
} from "../services/api";
import "./CoreBanking.css";

const initialFdForm = {
  principal: "100000",
  tenureMonths: "12",
  annualRate: "6.8",
  compoundingPerYear: "4",
  autoRenewEnabled: false,
  renewalTenureMonths: "12",
};

const initialRdForm = {
  monthlyInstallment: "5000",
  tenureMonths: "12",
  annualRate: "6.5",
  autoDebit: true,
};

const initialSipForm = {
  planName: "",
  fundName: "Balanced Growth Fund",
  monthlyContribution: "5000",
  tenureMonths: "120",
  expectedAnnualReturn: "12",
  goalAmount: "",
  autoDebit: true,
  startDate: "",
};

const initialRailForm = {
  rail: "UPI",
  direction: "OUTBOUND",
  amount: "1000",
  destination: "",
  notes: "",
};

const APPROVAL_ACTION_FILTER_OPTIONS = [
  "ACCOUNT_STATUS_UPDATE",
  "LOAN_STATUS_UPDATE",
  "TRANSFER_EXECUTION",
  "SIP_PLAN_CREATION",
  "FD_BOOKING_CREATE",
  "RD_CREATION",
  "PAYMENT_REFUND",
  "GL_MANUAL_JOURNAL",
  "MONEY_OUT_POLICY_UPDATE",
  "REGULATORY_POLICY_UPDATE",
  "TREASURY_SNAPSHOT_CREATE",
  "REGULATORY_REPORT_PUBLISH",
  "REGULATORY_ALERT_RESOLVE",
];

const APPROVAL_REQUEST_PAGE_SIZE = 12;

const initialManualGlForm = {
  description: "Manual GL adjustment",
  debitAccountCode: "100100",
  creditAccountCode: "200100",
  amount: "1000",
  narration: "",
  postingDate: "",
  requestNote: "",
};

const initialTreasuryForm = {
  asOfDate: "",
  cashInVault: "5000000",
  rbiBalance: "2000000",
  nostroBalance: "750000",
  interbankObligations: "1000000",
  remarks: "",
};

const toInputDate = (value) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatInr = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const formatDateTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
};

const formatUserLabel = (entry) => {
  if (!entry) return "--";
  const name = `${entry.firstName || ""} ${entry.lastName || ""}`.trim();
  return name || entry.email || "--";
};

const maskAccountNumber = (value = "") => {
  const account = String(value || "").trim();
  if (!account) return "--";
  if (account.length <= 4) return account;
  return `${"*".repeat(account.length - 4)}${account.slice(-4)}`;
};

const normalizeError = (error, fallback = "Request failed. Please try again.") =>
  error?.response?.data?.message || error?.message || fallback;

const escapeHtml = (value = "") =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const CoreBanking = () => {
  const location = useLocation();
  const { user } = useAuth();
  const canAccessAdmin = isStrictAdminUser(user);

  const [banner, setBanner] = useState({ type: "", text: "" });
  const [isBusy, setIsBusy] = useState(false);

  const [fdForm, setFdForm] = useState(initialFdForm);
  const [rdForm, setRdForm] = useState(initialRdForm);
  const [sipForm, setSipForm] = useState(() => ({
    ...initialSipForm,
    startDate: toInputDate(new Date()),
  }));
  const [sipDecisionNotes, setSipDecisionNotes] = useState({});
  const [vpaPrefix, setVpaPrefix] = useState("");
  const [railForm, setRailForm] = useState(initialRailForm);
  const [manualGlForm, setManualGlForm] = useState({ ...initialManualGlForm, postingDate: toInputDate(new Date()) });
  const [treasuryForm, setTreasuryForm] = useState({ ...initialTreasuryForm, asOfDate: toInputDate(new Date()) });
  const [interestDate, setInterestDate] = useState(toInputDate(new Date()));
  const [adminScanUserId, setAdminScanUserId] = useState("");
  const [regulatoryPublishForm, setRegulatoryPublishForm] = useState(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      fromDate: toInputDate(monthStart),
      toDate: toInputDate(now),
      cashThreshold: "1000000",
      publishNote: "",
    };
  });

  const [fixedDeposits, setFixedDeposits] = useState([]);
  const [recurringDeposits, setRecurringDeposits] = useState([]);
  const [myApprovalRequests, setMyApprovalRequests] = useState([]);
  const [myApprovalSummaryRows, setMyApprovalSummaryRows] = useState([]);
  const [myApprovalFilters, setMyApprovalFilters] = useState({
    status: "",
    actionType: "",
    q: "",
    fromDate: "",
    toDate: "",
  });
  const [myApprovalPagination, setMyApprovalPagination] = useState({
    total: 0,
    page: 1,
    pages: 1,
  });
  const [sipPlans, setSipPlans] = useState([]);
  const [adminSipRequests, setAdminSipRequests] = useState([]);
  const [sipMakerCheckerRequired, setSipMakerCheckerRequired] = useState(false);
  const [defaultedRecurringDeposits, setDefaultedRecurringDeposits] = useState([]);
  const [vpaHandles, setVpaHandles] = useState([]);
  const [glAccounts, setGlAccounts] = useState([]);
  const [trialBalance, setTrialBalance] = useState(null);
  const [profitAndLoss, setProfitAndLoss] = useState(null);
  const [balanceSheet, setBalanceSheet] = useState(null);
  const [interestAccruals, setInterestAccruals] = useState([]);
  const [amlAlerts, setAmlAlerts] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [treasurySnapshots, setTreasurySnapshots] = useState([]);
  const [regulatoryReport, setRegulatoryReport] = useState(null);
  const [regulatoryPublications, setRegulatoryPublications] = useState([]);
  const [regulatoryAlerts, setRegulatoryAlerts] = useState([]);
  const [settlementStatusDrafts, setSettlementStatusDrafts] = useState({});
  const [regulatoryResolveDrafts, setRegulatoryResolveDrafts] = useState({});
  const hasBootstrappedRef = useRef(false);

  const setStatus = (type, text) => setBanner({ type, text });

  const refreshMyApprovalRequests = useCallback(
    async (overrides = {}) => {
      const status = overrides.status ?? myApprovalFilters.status;
      const actionType = overrides.actionType ?? myApprovalFilters.actionType;
      const q = overrides.q ?? myApprovalFilters.q;
      const fromDate = overrides.fromDate ?? myApprovalFilters.fromDate;
      const toDate = overrides.toDate ?? myApprovalFilters.toDate;
      const page = Number(overrides.page || myApprovalPagination.page || 1);
      const safePage = Number.isFinite(page) ? Math.max(1, page) : 1;

      const response = await getMyApprovalRequests({
        limit: APPROVAL_REQUEST_PAGE_SIZE,
        page: safePage,
        status: status || undefined,
        actionType: actionType || undefined,
        q: q || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      });

      if (!response?.data?.success) return;

      const requests = Array.isArray(response.data.requests) ? response.data.requests : [];
      const summaryRows = Array.isArray(response.data.summary) ? response.data.summary : [];
      const total = Number(response.data.total || 0);
      const pages = Math.max(1, Number(response.data.pages || 1));
      const currentPage = Math.min(Math.max(1, Number(response.data.page || safePage)), pages);

      setMyApprovalRequests(requests);
      setMyApprovalSummaryRows(summaryRows);
      setMyApprovalPagination({ total, page: currentPage, pages });
    },
    [
      myApprovalFilters.actionType,
      myApprovalFilters.status,
      myApprovalFilters.q,
      myApprovalFilters.fromDate,
      myApprovalFilters.toDate,
      myApprovalPagination.page,
    ]
  );

  const refreshUserData = useCallback(async () => {
    const [fdRes, rdRes, sipRes, vpaRes] = await Promise.allSettled([
      getMyFixedDeposits(),
      getMyRecurringDeposits(),
      getMySipPlans(),
      getMyVpaHandles(),
    ]);

    if (fdRes.status === "fulfilled" && fdRes.value?.data?.success) {
      setFixedDeposits(fdRes.value.data.fixedDeposits || []);
    }
    if (rdRes.status === "fulfilled" && rdRes.value?.data?.success) {
      setRecurringDeposits(rdRes.value.data.recurringDeposits || []);
    }
    if (sipRes.status === "fulfilled" && sipRes.value?.data?.success) {
      setSipPlans(sipRes.value.data.sipPlans || []);
    }
    if (vpaRes.status === "fulfilled" && vpaRes.value?.data?.success) {
      setVpaHandles(vpaRes.value.data.handles || []);
    }
  }, []);

  const refreshAdminData = useCallback(async () => {
    if (!canAccessAdmin) return;
    const [
      glRes,
      tbRes,
      plRes,
      bsRes,
      accrualRes,
      amlRes,
      settlementRes,
      treasuryRes,
      regulatoryRes,
      publicationsRes,
      alertsRes,
      defaultedRdRes,
      sipRequestsRes,
    ] =
      await Promise.allSettled([
      getGlAccounts(),
      getGlTrialBalance(),
      getGlProfitAndLoss(),
      getGlBalanceSheet(),
      getInterestAccruals({ limit: 25 }),
      getAmlAlerts({ limit: 25 }),
      getSettlementRecords({ limit: 40 }),
      getTreasurySnapshots({ limit: 8 }),
      getRegulatoryReport(),
      getRegulatoryPublications({ limit: 10 }),
      getRegulatoryAlerts({ limit: 40 }),
      getDefaultedRecurringDeposits({ limit: 60 }),
      getAdminSipRequests({ limit: 200 }),
    ]);

    if (glRes.status === "fulfilled" && glRes.value?.data?.success) {
      setGlAccounts(glRes.value.data.accounts || []);
    }
    if (tbRes.status === "fulfilled" && tbRes.value?.data?.success) {
      setTrialBalance(tbRes.value.data.report || null);
    }
    if (plRes.status === "fulfilled" && plRes.value?.data?.success) {
      setProfitAndLoss(plRes.value.data.report || null);
    }
    if (bsRes.status === "fulfilled" && bsRes.value?.data?.success) {
      setBalanceSheet(bsRes.value.data.report || null);
    }
    if (accrualRes.status === "fulfilled" && accrualRes.value?.data?.success) {
      setInterestAccruals(accrualRes.value.data.accruals || []);
    }
    if (amlRes.status === "fulfilled" && amlRes.value?.data?.success) {
      setAmlAlerts(amlRes.value.data.alerts || []);
    }
    if (settlementRes.status === "fulfilled" && settlementRes.value?.data?.success) {
      const records = settlementRes.value.data.records || [];
      setSettlements(records);
      setSettlementStatusDrafts(
        records.reduce((accumulator, record) => {
          accumulator[record._id] = record.status;
          return accumulator;
        }, {})
      );
    }
    if (treasuryRes.status === "fulfilled" && treasuryRes.value?.data?.success) {
      setTreasurySnapshots(treasuryRes.value.data.snapshots || []);
    }
    if (regulatoryRes.status === "fulfilled" && regulatoryRes.value?.data?.success) {
      setRegulatoryReport(regulatoryRes.value.data.report || null);
    }
    if (publicationsRes.status === "fulfilled" && publicationsRes.value?.data?.success) {
      setRegulatoryPublications(publicationsRes.value.data.publications || []);
    }
    if (alertsRes.status === "fulfilled" && alertsRes.value?.data?.success) {
      const nextAlerts = alertsRes.value.data.alerts || [];
      setRegulatoryAlerts(nextAlerts);
      setRegulatoryResolveDrafts((current) =>
        nextAlerts.reduce((accumulator, alert) => {
          accumulator[alert._id] = current[alert._id] || "Reviewed and closed by admin.";
          return accumulator;
        }, {})
      );
    }
    if (defaultedRdRes.status === "fulfilled" && defaultedRdRes.value?.data?.success) {
      setDefaultedRecurringDeposits(defaultedRdRes.value.data.recurringDeposits || []);
    }
    if (sipRequestsRes.status === "fulfilled" && sipRequestsRes.value?.data?.success) {
      const requests = sipRequestsRes.value.data.sipPlans || [];
      setAdminSipRequests(requests);
      setSipMakerCheckerRequired(Boolean(sipRequestsRes.value.data.approvalRequired));
      setSipDecisionNotes((current) =>
        requests.reduce((accumulator, entry) => {
          accumulator[entry._id] = current[entry._id] || "";
          return accumulator;
        }, {})
      );
    } else {
      setSipMakerCheckerRequired(false);
    }
  }, [canAccessAdmin]);

  useEffect(() => {
    if (hasBootstrappedRef.current) return;
    hasBootstrappedRef.current = true;
    let mounted = true;
    const bootstrap = async () => {
      try {
        setIsBusy(true);
        await Promise.all([refreshUserData(), refreshAdminData()]);
        await refreshMyApprovalRequests({ page: 1, status: "", actionType: "", q: "", fromDate: "", toDate: "" });
      } catch (_) {
        if (mounted) setStatus("error", "Unable to load core banking data.");
      } finally {
        if (mounted) setIsBusy(false);
      }
    };
    bootstrap();
    return () => {
      mounted = false;
    };
  }, [refreshAdminData, refreshUserData, refreshMyApprovalRequests]);

  useEffect(() => {
    const module = new URLSearchParams(location.search).get("module");
    const map = {
      fd: "core-section-fd",
      rd: "core-section-rd",
      approvals: "core-section-approvals",
      sip: "core-section-sip",
      upi: "core-section-upi",
      rails: "core-section-rails",
      gl: "core-section-gl-approval",
      treasury: "core-section-treasury",
      regulatory: "core-section-regulatory",
    };
    const target = map[module];
    if (!target) return;
    const element = document.getElementById(target);
    if (element) {
      window.setTimeout(() => {
        element.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 120);
    }
  }, [location.search]);

  const fdSummary = useMemo(() => {
    const active = fixedDeposits.filter((item) => item.status === "ACTIVE" || item.status === "MATURED").length;
    const principal = fixedDeposits.reduce((sum, item) => sum + Number(item.principal || 0), 0);
    return { total: fixedDeposits.length, active, principal };
  }, [fixedDeposits]);

  const rdSummary = useMemo(() => {
    const active = recurringDeposits.filter((item) => item.status === "ACTIVE" || item.status === "MATURED").length;
    const deposited = recurringDeposits.reduce((sum, item) => sum + Number(item.totalDeposited || 0), 0);
    return { total: recurringDeposits.length, active, deposited };
  }, [recurringDeposits]);

  const myApprovalSummary = useMemo(() => {
    const summary = {
      total: 0,
      pending: 0,
      executed: 0,
      rejected: 0,
      failed: 0,
    };
    myApprovalSummaryRows.forEach((entry) => {
      const status = String(entry?._id?.status || "").toUpperCase();
      const count = Number(entry?.count || 0);
      summary.total += count;
      if (status === "PENDING") summary.pending += count;
      if (status === "EXECUTED") summary.executed += count;
      if (status === "REJECTED") summary.rejected += count;
      if (status === "FAILED") summary.failed += count;
    });
    if (!summary.total && myApprovalPagination.total > 0) {
      summary.total = Number(myApprovalPagination.total || 0);
    }
    return summary;
  }, [myApprovalPagination.total, myApprovalSummaryRows]);

  const myApprovalActionSummary = useMemo(() => {
    const actionMap = myApprovalSummaryRows.reduce((accumulator, entry) => {
      const actionType = String(entry?._id?.actionType || "").toUpperCase();
      if (!actionType) return accumulator;
      accumulator[actionType] = (accumulator[actionType] || 0) + Number(entry?.count || 0);
      return accumulator;
    }, {});

    return Object.entries(actionMap)
      .map(([actionType, count]) => ({ actionType, count }))
      .sort((a, b) => b.count - a.count);
  }, [myApprovalSummaryRows]);

  const myApprovalStatusFilterOptions = useMemo(
    () => [
      { value: "", label: "All Status" },
      { value: "PENDING", label: "Pending" },
      { value: "EXECUTED", label: "Executed" },
      { value: "REJECTED", label: "Rejected" },
      { value: "FAILED", label: "Failed" },
    ],
    []
  );

  const myApprovalActionFilterOptions = useMemo(
    () => [{ value: "", label: "All Actions" }, ...APPROVAL_ACTION_FILTER_OPTIONS.map((value) => ({ value, label: value }))],
    []
  );

  const myApprovalPageLabel = useMemo(() => {
    const page = Number(myApprovalPagination.page || 1);
    const pages = Number(myApprovalPagination.pages || 1);
    const total = Number(myApprovalPagination.total || 0);
    return `Page ${page} of ${pages} (Total ${total})`;
  }, [myApprovalPagination.page, myApprovalPagination.pages, myApprovalPagination.total]);

  const sipSummary = useMemo(() => {
    const active = sipPlans.filter((item) => item.status === "ACTIVE").length;
    const requested = sipPlans.filter((item) => item.status === "REQUESTED").length;
    const completed = sipPlans.filter((item) => item.status === "COMPLETED").length;
    const invested = sipPlans.reduce((sum, item) => sum + Number(item.totalInvested || 0), 0);
    return {
      total: sipPlans.length,
      active,
      requested,
      completed,
      invested,
    };
  }, [sipPlans]);

  const latestTreasurySnapshot = treasurySnapshots[0] || null;
  const regulatoryAlertSummary = useMemo(() => {
    const total = regulatoryAlerts.length;
    const open = regulatoryAlerts.filter((entry) => entry.status === "OPEN").length;
    const acknowledged = regulatoryAlerts.filter((entry) => entry.status === "ACKNOWLEDGED").length;
    const resolved = regulatoryAlerts.filter((entry) => entry.status === "RESOLVED").length;
    return { total, open, acknowledged, resolved };
  }, [regulatoryAlerts]);

  const withBusy = async (runner) => {
    try {
      setIsBusy(true);
      await runner();
    } finally {
      setIsBusy(false);
    }
  };

  const handleCreateFd = async (event) => {
    event.preventDefault();
    await withBusy(async () => {
      try {
        const payload = {
          principal: Number(fdForm.principal || 0),
          tenureMonths: Number(fdForm.tenureMonths || 0),
          annualRate: Number(fdForm.annualRate || 0),
          compoundingPerYear: Number(fdForm.compoundingPerYear || 4),
          autoRenewEnabled: Boolean(fdForm.autoRenewEnabled),
          renewalTenureMonths: Boolean(fdForm.autoRenewEnabled) ? Number(fdForm.renewalTenureMonths || 0) : undefined,
        };
        const response = await createFixedDeposit(payload);
        if (response.data.success) {
          if (response.data.pendingApproval) {
            setStatus("success", response.data.message || "FD request submitted for admin approval.");
          } else {
            setStatus("success", response.data.message || "Fixed deposit created.");
          }
          setFdForm(initialFdForm);
          await refreshUserData();
          await refreshMyApprovalRequests();
          await refreshAdminData();
        }
      } catch (error) {
        setStatus("error", normalizeError(error, "Unable to create fixed deposit."));
      }
    });
  };

  const handleCloseFd = async (fdId) => {
    await withBusy(async () => {
      try {
        const response = await closeFixedDeposit(fdId);
        if (response.data.success) {
          setStatus("success", response.data.message || "Fixed deposit closed.");
          await refreshUserData();
          await refreshAdminData();
        }
      } catch (error) {
        setStatus("error", normalizeError(error, "Unable to close fixed deposit."));
      }
    });
  };

  const handleCreateRd = async (event) => {
    event.preventDefault();
    await withBusy(async () => {
      try {
        const payload = {
          monthlyInstallment: Number(rdForm.monthlyInstallment || 0),
          tenureMonths: Number(rdForm.tenureMonths || 0),
          annualRate: Number(rdForm.annualRate || 0),
          autoDebit: Boolean(rdForm.autoDebit),
        };
        const response = await createRecurringDeposit(payload);
        if (response.data.success) {
          if (response.data.pendingApproval) {
            setStatus("success", response.data.message || "RD request submitted for admin approval.");
          } else {
            setStatus("success", response.data.message || "Recurring deposit created.");
          }
          setRdForm(initialRdForm);
          await refreshUserData();
          await refreshMyApprovalRequests();
          await refreshAdminData();
        }
      } catch (error) {
        setStatus("error", normalizeError(error, "Unable to create recurring deposit."));
      }
    });
  };

  const handlePayRdInstallment = async (rdId) => {
    await withBusy(async () => {
      try {
        const response = await payRecurringInstallment(rdId);
        if (response.data.success) {
          setStatus("success", response.data.message || "Installment posted successfully.");
          await refreshUserData();
        }
      } catch (error) {
        setStatus("error", normalizeError(error, "Unable to post RD installment."));
      }
    });
  };

  const handleCloseRd = async (rdId) => {
    await withBusy(async () => {
      try {
        const response = await closeRecurringDeposit(rdId);
        if (response.data.success) {
          setStatus("success", response.data.message || "Recurring deposit closed.");
          await refreshUserData();
          await refreshAdminData();
        }
      } catch (error) {
        setStatus("error", normalizeError(error, "Unable to close recurring deposit."));
      }
    });
  };

  const handleCancelMyApprovalRequest = async (approvalId) => {
    await withBusy(async () => {
      try {
        const response = await cancelMyApprovalRequest(approvalId);
        if (response.data.success) {
          setStatus("success", response.data.message || "Approval request cancelled.");
          await refreshUserData();
          await refreshMyApprovalRequests();
          await refreshAdminData();
        }
      } catch (error) {
        setStatus("error", normalizeError(error, "Unable to cancel approval request."));
      }
    });
  };

  const handleMyApprovalFilterChange = (field, value) => {
    setMyApprovalFilters((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleApplyMyApprovalFilters = async (event) => {
    event.preventDefault();
    await withBusy(async () => {
      try {
        await refreshMyApprovalRequests({ page: 1 });
        setStatus("success", "Approval request filter applied.");
      } catch (error) {
        setStatus("error", normalizeError(error, "Unable to apply approval filter."));
      }
    });
  };

  const handleResetMyApprovalFilters = async () => {
    await withBusy(async () => {
      try {
        const cleared = { status: "", actionType: "", q: "", fromDate: "", toDate: "" };
        setMyApprovalFilters(cleared);
        await refreshMyApprovalRequests({ ...cleared, page: 1 });
        setStatus("success", "Approval request filters reset.");
      } catch (error) {
        setStatus("error", normalizeError(error, "Unable to reset approval filters."));
      }
    });
  };

  const handleApprovalPageChange = async (nextPage) => {
    await withBusy(async () => {
      try {
        await refreshMyApprovalRequests({ page: nextPage });
      } catch (error) {
        setStatus("error", normalizeError(error, "Unable to change approval request page."));
      }
    });
  };

  const handleCreateSipRequest = async (event) => {
    event.preventDefault();
    await withBusy(async () => {
      try {
        const payload = {
          planName: String(sipForm.planName || "").trim() || "SIP Plan",
          fundName: String(sipForm.fundName || "").trim() || "Balanced Growth Fund",
          monthlyContribution: Number(sipForm.monthlyContribution || 0),
          tenureMonths: Number(sipForm.tenureMonths || 0),
          expectedAnnualReturn: Number(sipForm.expectedAnnualReturn || 0),
          goalAmount: Number(sipForm.goalAmount || 0),
          autoDebit: Boolean(sipForm.autoDebit),
          startDate: sipForm.startDate || undefined,
        };
        const response = await requestSipPlan(payload);
        if (response.data.success) {
          setStatus("success", response.data.message || "SIP request submitted.");
          setSipForm({
            ...initialSipForm,
            startDate: toInputDate(new Date()),
          });
          await refreshUserData();
          await refreshAdminData();
        }
      } catch (error) {
        setStatus("error", normalizeError(error, "Unable to submit SIP request."));
      }
    });
  };

  const handlePaySipInstallmentNow = async (sipId) => {
    await withBusy(async () => {
      try {
        const response = await paySipInstallment(sipId);
        if (response.data.success) {
          setStatus("success", response.data.message || "SIP installment processed.");
          await refreshUserData();
        }
      } catch (error) {
        setStatus("error", normalizeError(error, "Unable to process SIP installment."));
      }
    });
  };

  const handleUpdateSipStatus = async (sipId, status) => {
    await withBusy(async () => {
      try {
        const response = await updateMySipPlanStatus(sipId, status);
        if (response.data.success) {
          setStatus("success", response.data.message || "SIP status updated.");
          await refreshUserData();
        }
      } catch (error) {
        setStatus("error", normalizeError(error, "Unable to update SIP status."));
      }
    });
  };

  const handleAdminSipDecision = async (sipId, decision) => {
    await withBusy(async () => {
      try {
        if (sipMakerCheckerRequired) {
          setStatus("error", "SIP maker-checker is enabled. Use Admin Approval Requests to approve or reject.");
          return;
        }
        const note = String(sipDecisionNotes[sipId] || "").trim();
        const response = await decideSipRequest(sipId, decision, note);
        if (response.data.success) {
          setStatus("success", response.data.message || "SIP decision applied.");
          await refreshAdminData();
          await refreshUserData();
        }
      } catch (error) {
        const approvalRequired = Boolean(error?.response?.data?.approvalRequired);
        if (approvalRequired) {
          setStatus("error", "SIP approval is controlled by maker-checker queue. Use Admin Approval Requests.");
          await refreshMyApprovalRequests({ page: 1 });
          return;
        }
        setStatus("error", normalizeError(error, "Unable to update SIP request decision."));
      }
    });
  };

  const handleRunSipAutoDebitJob = async () => {
    await withBusy(async () => {
      try {
        const response = await runSipAutoDebitJobApi({
          forDate: new Date().toISOString(),
          limit: 500,
        });
        if (response.data.success) {
          const result = response.data.result || {};
          setStatus(
            "success",
            `SIP auto-debit done. Processed ${Number(result.processed || 0)}, success ${Number(
              result.succeeded || 0
            )}, failed ${Number(result.failed || 0)}.`
          );
          await refreshAdminData();
          await refreshUserData();
        }
      } catch (error) {
        setStatus("error", normalizeError(error, "Unable to run SIP auto-debit job."));
      }
    });
  };

  const handleCreateVpa = async (event) => {
    event.preventDefault();
    await withBusy(async () => {
      try {
        const response = await createVpaHandle(vpaPrefix);
        if (response.data.success) {
          setStatus("success", response.data.message || "UPI handle created.");
          setVpaPrefix("");
          await refreshUserData();
        }
      } catch (error) {
        setStatus("error", normalizeError(error, "Unable to create UPI handle."));
      }
    });
  };

  const handleCreateRailTransfer = async (event) => {
    event.preventDefault();
    await withBusy(async () => {
      try {
        const payload = {
          rail: railForm.rail,
          direction: railForm.direction,
          amount: Number(railForm.amount || 0),
          destination: railForm.destination,
          notes: railForm.notes,
        };
        const response = await createRailTransfer(payload);
        if (response.data.success) {
          setStatus("success", response.data.message || "Rail transfer queued.");
          setRailForm(initialRailForm);
          await refreshAdminData();
        }
      } catch (error) {
        setStatus("error", normalizeError(error, "Unable to queue rail transfer."));
      }
    });
  };

  const handleAdminBootstrap = async () => {
    await withBusy(async () => {
      try {
        const response = await bootstrapCoreBanking();
        if (response.data.success) {
          setStatus("success", response.data.message || "Chart of accounts prepared.");
          await refreshAdminData();
        }
      } catch (error) {
        setStatus("error", normalizeError(error, "Unable to initialize chart of accounts."));
      }
    });
  };

  const handleRunInterest = async () => {
    await withBusy(async () => {
      try {
        const response = await runInterestEod(interestDate || undefined);
        if (response.data.success) {
          const processed = Number(response.data?.result?.processedAccounts || 0);
          setStatus("success", `Interest EOD completed. Accounts processed: ${processed}.`);
          await refreshAdminData();
          await refreshUserData();
        }
      } catch (error) {
        setStatus("error", normalizeError(error, "Unable to run interest EOD."));
      }
    });
  };

  const handleRunFdMaturityJob = async () => {
    await withBusy(async () => {
      try {
        const response = await runFixedDepositMaturityJobApi({
          forDate: new Date().toISOString(),
          limit: 300,
        });
        if (response.data.success) {
          const result = response.data.result || {};
          setStatus(
            "success",
            `FD maturity run done. Processed ${Number(result.processed || 0)}, renewed ${Number(
              result.renewed || 0
            )}, failed ${Number(result.failed || 0)}.`
          );
          await refreshUserData();
          await refreshAdminData();
        }
      } catch (error) {
        setStatus("error", normalizeError(error, "Unable to run FD maturity processing."));
      }
    });
  };

  const handleRunRdAutoDebitJob = async () => {
    await withBusy(async () => {
      try {
        const response = await runRecurringDepositAutoDebitJobApi({
          forDate: new Date().toISOString(),
          limit: 300,
        });
        if (response.data.success) {
          const result = response.data.result || {};
          setStatus(
            "success",
            `RD auto-debit run done. Processed ${Number(result.processed || 0)}, success ${Number(
              result.succeeded || 0
            )}, failed ${Number(result.failed || 0)}, defaulted ${Number(result.defaulted || 0)}.`
          );
          await refreshUserData();
          await refreshAdminData();
        }
      } catch (error) {
        setStatus("error", normalizeError(error, "Unable to run RD auto-debit processing."));
      }
    });
  };

  const handleRecoverDefaultedRd = async (rdId) => {
    await withBusy(async () => {
      try {
        const response = await recoverDefaultedRecurringDeposit(rdId, { retryNow: true });
        if (response.data.success) {
          setStatus("success", response.data.message || "Defaulted RD recovered successfully.");
          await refreshAdminData();
          await refreshUserData();
        }
      } catch (error) {
        setStatus("error", normalizeError(error, "Unable to recover defaulted RD."));
      }
    });
  };

  const handleForceDebitDefaultedRd = async (rdId) => {
    await withBusy(async () => {
      try {
        const response = await forceDebitRecurringDepositByAdminApi(rdId, { recoverIfDefaulted: true });
        if (response.data.success) {
          setStatus("success", response.data.message || "RD installment debited successfully.");
          await refreshAdminData();
          await refreshUserData();
        }
      } catch (error) {
        setStatus("error", normalizeError(error, "Unable to force debit RD installment."));
      }
    });
  };

  const handleCreateTreasurySnapshot = async (event) => {
    event.preventDefault();
    await withBusy(async () => {
      try {
        const payload = {
          asOfDate: treasuryForm.asOfDate || undefined,
          cashInVault: Number(treasuryForm.cashInVault || 0),
          rbiBalance: Number(treasuryForm.rbiBalance || 0),
          nostroBalance: Number(treasuryForm.nostroBalance || 0),
          interbankObligations: Number(treasuryForm.interbankObligations || 0),
          remarks: String(treasuryForm.remarks || "").trim(),
        };
        const response = await createTreasurySnapshot(payload);
        if (response.data.success) {
          if (response.data.pendingApproval) {
            setStatus("success", response.data.message || "Treasury snapshot request submitted for approval.");
          } else {
            setStatus("success", response.data.message || "Treasury snapshot created.");
          }
          setTreasuryForm((current) => ({
            ...current,
            asOfDate: toInputDate(new Date()),
            remarks: "",
          }));
          await refreshAdminData();
        }
      } catch (error) {
        setStatus("error", normalizeError(error, "Unable to create treasury snapshot."));
      }
    });
  };

  const handleRequestRegulatoryPublish = async (event) => {
    event.preventDefault();
    await withBusy(async () => {
      try {
        const payload = {
          fromDate: regulatoryPublishForm.fromDate || undefined,
          toDate: regulatoryPublishForm.toDate || undefined,
          cashThreshold: Number(regulatoryPublishForm.cashThreshold || 0),
          publishNote: String(regulatoryPublishForm.publishNote || "").trim(),
        };
        const response = await requestRegulatoryReportPublish(payload);
        if (response.data.success) {
          if (response.data.pendingApproval) {
            setStatus("success", response.data.message || "Regulatory report publish request submitted for approval.");
          } else {
            setStatus("success", response.data.message || "Regulatory report published successfully.");
          }
          setRegulatoryPublishForm((current) => ({
            ...current,
            publishNote: "",
          }));
          await refreshAdminData();
        }
      } catch (error) {
        setStatus("error", normalizeError(error, "Unable to submit regulatory publish request."));
      }
    });
  };

  const buildRegulatoryQueryParams = (override = {}) => {
    const fromDate = override.fromDate || regulatoryPublishForm.fromDate || regulatoryReport?.range?.from;
    const toDate = override.toDate || regulatoryPublishForm.toDate || regulatoryReport?.range?.to;
    const cashThresholdRaw =
      override.cashThreshold ?? regulatoryPublishForm.cashThreshold ?? regulatoryReport?.range?.cashThreshold;
    const cashThreshold = Number(cashThresholdRaw || 0);

    return {
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      cashThreshold: cashThreshold > 0 ? cashThreshold : undefined,
    };
  };

  const handleLoadRegulatoryReport = async (override = {}) => {
    await withBusy(async () => {
      try {
        const params = buildRegulatoryQueryParams(override);
        const response = await getRegulatoryReport(params);
        if (response.data.success) {
          setRegulatoryReport(response.data.report || null);
          if (override && (override.fromDate || override.toDate || override.cashThreshold)) {
            setRegulatoryPublishForm((current) => ({
              ...current,
              fromDate: override.fromDate ? toInputDate(override.fromDate) : current.fromDate,
              toDate: override.toDate ? toInputDate(override.toDate) : current.toDate,
              cashThreshold:
                override.cashThreshold !== undefined && override.cashThreshold !== null
                  ? String(Number(override.cashThreshold || 0) || current.cashThreshold || "1000000")
                  : current.cashThreshold,
            }));
          }
          setStatus("success", "Regulatory report loaded for selected range.");
        }
      } catch (error) {
        setStatus("error", normalizeError(error, "Unable to load regulatory report for selected range."));
      }
    });
  };

  const handleExportRegulatoryCsv = async (override = {}) => {
    await withBusy(async () => {
      try {
        const params = buildRegulatoryQueryParams(override);
        const response = await downloadRegulatoryReportCsv(params);
        const disposition = response?.headers?.["content-disposition"] || "";
        const fileNameMatch = disposition.match(/filename="?([^"]+)"?/i);
        const fileName = fileNameMatch?.[1] || `regulatory-report-${Date.now()}.csv`;
        const blob = response?.data instanceof Blob ? response.data : new Blob([response?.data || ""], { type: "text/csv" });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        setStatus("success", "Regulatory report CSV downloaded.");
      } catch (error) {
        setStatus("error", normalizeError(error, "Unable to download regulatory CSV."));
      }
    });
  };

  const handlePrintRegulatoryReport = () => {
    if (!regulatoryReport) {
      setStatus("error", "Load regulatory report before printing.");
      return;
    }

    const printWindow = window.open("", "_blank", "width=1024,height=768");
    if (!printWindow) {
      setStatus("error", "Pop-up blocked. Allow pop-ups to print report.");
      return;
    }

    const topRules = (regulatoryReport?.str?.topRules || [])
      .map(
        (rule) =>
          `<tr><td>${escapeHtml(rule?._id || "")}</td><td>${Number(rule?.count || 0)}</td><td>${escapeHtml(
            rule?.highestSeverity || ""
          )}</td></tr>`
      )
      .join("");
    const settlementRows = Object.entries(regulatoryReport?.settlement?.byStatus || {})
      .map(
        ([status, summary]) =>
          `<tr><td>${escapeHtml(status)}</td><td>${Number(summary?.count || 0)}</td><td>${escapeHtml(
            formatInr(summary?.totalAmount || 0)
          )}</td></tr>`
      )
      .join("");
    const indicatorRows = (regulatoryReport?.indicators || [])
      .map(
        (indicator) =>
          `<tr><td>${escapeHtml(indicator?.code || "")}</td><td>${escapeHtml(indicator?.status || "")}</td><td>${escapeHtml(
            indicator?.message || ""
          )}</td></tr>`
      )
      .join("");

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Regulatory Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; color: #102a43; }
    h1 { margin: 0 0 4px; font-size: 24px; }
    p { margin: 2px 0 10px; color: #334e68; }
    .meta { margin: 10px 0 18px; font-size: 13px; }
    .kpi { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-bottom: 18px; }
    .kpi div { border: 1px solid #d9e2ec; border-radius: 8px; padding: 10px; }
    .kpi small { display: block; color: #486581; font-size: 11px; text-transform: uppercase; }
    .kpi strong { font-size: 16px; color: #102a43; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0 18px; }
    th, td { border: 1px solid #d9e2ec; padding: 8px; text-align: left; font-size: 12px; }
    th { background: #f0f4f8; }
    h2 { margin: 12px 0 8px; font-size: 16px; }
  </style>
</head>
<body>
  <h1>Regulatory Report (CTR / STR / ALM)</h1>
  <p>BankEase Core Banking Compliance Summary</p>
  <div class="meta">
    <div><strong>Generated:</strong> ${escapeHtml(formatDateTime(regulatoryReport?.generatedAt))}</div>
    <div><strong>Range:</strong> ${escapeHtml(formatDateTime(regulatoryReport?.range?.from))} to ${escapeHtml(
      formatDateTime(regulatoryReport?.range?.to)
    )}</div>
    <div><strong>Cash Threshold:</strong> ${escapeHtml(formatInr(regulatoryReport?.range?.cashThreshold || 0))}</div>
  </div>
  <div class="kpi">
    <div><small>CTR Count</small><strong>${Number(regulatoryReport?.ctr?.count || 0)}</strong></div>
    <div><small>CTR Total Amount</small><strong>${escapeHtml(formatInr(regulatoryReport?.ctr?.totalAmount || 0))}</strong></div>
    <div><small>Open STR Alerts</small><strong>${Number(regulatoryReport?.str?.openAlerts || 0)}</strong></div>
    <div><small>Critical STR Alerts</small><strong>${Number(regulatoryReport?.str?.criticalAlerts || 0)}</strong></div>
    <div><small>LCR Ratio</small><strong>${Number(regulatoryReport?.alm?.liquidity?.lcrRatio || 0).toFixed(2)}%</strong></div>
    <div><small>Loan to Deposit</small><strong>${Number(regulatoryReport?.alm?.loanToDepositRatio || 0).toFixed(2)}%</strong></div>
  </div>
  <h2>Indicators</h2>
  <table>
    <thead><tr><th>Code</th><th>Status</th><th>Message</th></tr></thead>
    <tbody>${indicatorRows || "<tr><td colspan='3'>No indicators</td></tr>"}</tbody>
  </table>
  <h2>Top STR Rules</h2>
  <table>
    <thead><tr><th>Rule Code</th><th>Alert Count</th><th>Highest Severity</th></tr></thead>
    <tbody>${topRules || "<tr><td colspan='3'>No STR rules</td></tr>"}</tbody>
  </table>
  <h2>Settlement Summary</h2>
  <table>
    <thead><tr><th>Status</th><th>Count</th><th>Total Amount</th></tr></thead>
    <tbody>${settlementRows || "<tr><td colspan='3'>No settlement records</td></tr>"}</tbody>
  </table>
</body>
</html>`;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => {
      printWindow.print();
    }, 180);
  };

  const handleRunAml = async () => {
    await withBusy(async () => {
      try {
        const response = await runAmlScan(String(adminScanUserId || "").trim());
        if (response.data.success) {
          const generated = Number(response.data?.result?.alertsGenerated || 0);
          setStatus("success", `AML scan completed. Alerts generated: ${generated}.`);
          await refreshAdminData();
        }
      } catch (error) {
        setStatus("error", normalizeError(error, "Unable to run AML scan."));
      }
    });
  };

  const handleRunRegulatoryMonitor = async () => {
    await withBusy(async () => {
      try {
        const response = await runRegulatoryBreachMonitorApi({
          fromDate: regulatoryPublishForm.fromDate || undefined,
          toDate: regulatoryPublishForm.toDate || undefined,
          cashThreshold: Number(regulatoryPublishForm.cashThreshold || 0) || undefined,
        });
        if (response.data.success) {
          const result = response.data.result || {};
          setStatus(
            "success",
            `Regulatory monitor completed. Attention: ${Number(result.attentionIndicators || 0)}, alerts: ${Number(
              result.alertsCreated || 0
            )}, emails: ${Number(result.emailsSent || 0)}.`
          );
          await refreshAdminData();
        }
      } catch (error) {
        setStatus("error", normalizeError(error, "Unable to run regulatory monitor."));
      }
    });
  };

  const handleAcknowledgeRegulatoryAlert = async (alertId) => {
    await withBusy(async () => {
      try {
        const response = await acknowledgeRegulatoryAlert(alertId);
        if (response.data.success) {
          setStatus("success", response.data.message || "Regulatory alert acknowledged.");
          await refreshAdminData();
        }
      } catch (error) {
        setStatus("error", normalizeError(error, "Unable to acknowledge regulatory alert."));
      }
    });
  };

  const handleResolveRegulatoryAlert = async (alertId) => {
    await withBusy(async () => {
      try {
        const resolutionNote = String(regulatoryResolveDrafts[alertId] || "")
          .trim()
          .slice(0, 300);
        if (!resolutionNote) {
          setStatus("error", "Resolution note is required to close alert.");
          return;
        }
        const response = await resolveRegulatoryAlert(alertId, { resolutionNote });
        if (response.data.success) {
          if (response.data.pendingApproval) {
            setStatus("success", response.data.message || "Regulatory alert resolve request sent for approval.");
          } else {
            setStatus("success", response.data.message || "Regulatory alert resolved.");
          }
          await refreshAdminData();
        }
      } catch (error) {
        setStatus("error", normalizeError(error, "Unable to resolve regulatory alert."));
      }
    });
  };

  const handleRequestManualGlApproval = async (event) => {
    event.preventDefault();
    await withBusy(async () => {
      try {
        const payload = {
          description: String(manualGlForm.description || "").trim(),
          debitAccountCode: String(manualGlForm.debitAccountCode || "")
            .trim()
            .toUpperCase(),
          creditAccountCode: String(manualGlForm.creditAccountCode || "")
            .trim()
            .toUpperCase(),
          amount: Number(manualGlForm.amount || 0),
          narration: String(manualGlForm.narration || "").trim(),
          postingDate: manualGlForm.postingDate || undefined,
          requestNote: String(manualGlForm.requestNote || "").trim(),
        };
        const response = await requestManualGlJournalApproval(payload);
        if (response.data.success) {
          if (response.data.pendingApproval) {
            setStatus("success", "Manual GL entry submitted for approval. Review from Admin Approval Queue.");
          } else {
            setStatus("success", response.data.message || "Manual GL journal posted successfully.");
          }
          setManualGlForm((current) => ({
            ...current,
            amount: "1000",
            narration: "",
            requestNote: "",
            postingDate: toInputDate(new Date()),
          }));
          await refreshAdminData();
        }
      } catch (error) {
        setStatus("error", normalizeError(error, "Unable to submit manual GL request."));
      }
    });
  };

  const handleReconcileSettlement = async (recordId) => {
    await withBusy(async () => {
      try {
        const nextStatus = settlementStatusDrafts[recordId];
        if (!nextStatus) {
          setStatus("error", "Select a settlement status first.");
          return;
        }
        const response = await reconcileSettlementRecord(recordId, { status: nextStatus });
        if (response.data.success) {
          setStatus("success", response.data.message || "Settlement status updated.");
          await refreshAdminData();
        }
      } catch (error) {
        setStatus("error", normalizeError(error, "Unable to reconcile settlement."));
      }
    });
  };

  return (
    <div className="core-banking-container">
      <div className="core-banking-head">
        <div>
          <h1>Core Banking Control Center</h1>
          <p>
            Manage term deposits, recurring deposits, UPI handle onboarding, and payment-rail settlement from one page.
          </p>
        </div>
        <div className="core-banking-head-badges">
          <span>User: {user?.role || "USER"}</span>
          {canAccessAdmin ? <span className="admin-badge">Admin Controls Enabled</span> : null}
        </div>
      </div>

      {banner.text ? <div className={`core-banking-banner ${banner.type || "info"}`}>{banner.text}</div> : null}

      <section className="core-card-grid">
        <article className="core-card" id="core-section-fd">
          <div className="core-card-head">
            <h2>Fixed Deposits (FD)</h2>
            <div className="core-stats">
              <span>Total {fdSummary.total}</span>
              <span>Active {fdSummary.active}</span>
              <span>Booked {formatInr(fdSummary.principal)}</span>
            </div>
          </div>
          <p className="core-card-note">
            Book FD from savings balance and close on maturity or before with penalty rules. If maker-checker is enabled,
            request goes to admin approval queue first.
          </p>
          <form className="core-form-grid" onSubmit={handleCreateFd}>
            <input
              type="number"
              min="1000"
              step="1"
              placeholder="Principal (Rs)"
              value={fdForm.principal}
              onChange={(event) => setFdForm((current) => ({ ...current, principal: event.target.value }))}
              required
            />
            <input
              type="number"
              min="1"
              step="1"
              placeholder="Tenure (Months)"
              value={fdForm.tenureMonths}
              onChange={(event) => setFdForm((current) => ({ ...current, tenureMonths: event.target.value }))}
              required
            />
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Rate %"
              value={fdForm.annualRate}
              onChange={(event) => setFdForm((current) => ({ ...current, annualRate: event.target.value }))}
              required
            />
            <input
              type="number"
              min="1"
              step="1"
              placeholder="Compounds / Year"
              value={fdForm.compoundingPerYear}
              onChange={(event) => setFdForm((current) => ({ ...current, compoundingPerYear: event.target.value }))}
              required
            />
            <label className="core-checkbox">
              <input
                type="checkbox"
                checked={Boolean(fdForm.autoRenewEnabled)}
                onChange={(event) =>
                  setFdForm((current) => ({
                    ...current,
                    autoRenewEnabled: event.target.checked,
                    renewalTenureMonths: event.target.checked
                      ? current.renewalTenureMonths || current.tenureMonths
                      : current.renewalTenureMonths,
                  }))
                }
              />
              Auto-renew on maturity
            </label>
            {fdForm.autoRenewEnabled ? (
              <input
                type="number"
                min="1"
                step="1"
                placeholder="Renewal Tenure (Months)"
                value={fdForm.renewalTenureMonths}
                onChange={(event) => setFdForm((current) => ({ ...current, renewalTenureMonths: event.target.value }))}
                required
              />
            ) : null}
            <button type="submit" disabled={isBusy}>
              Create FD
            </button>
          </form>
          <div className="core-list">
            {fixedDeposits.length ? (
              fixedDeposits.map((fd) => (
                <div key={fd._id} className="core-list-item">
                  <div>
                    <strong>{formatInr(fd.principal)}</strong>
                    <p>
                      Tenure {fd.tenureMonths} months | Rate {fd.annualRate}% | {fd.status}
                    </p>
                    <small>
                      Maturity {formatDateTime(fd.maturityDate)} | Auto-renew {fd.autoRenewEnabled ? "ON" : "OFF"}
                      {fd.autoRenewEnabled && Number(fd.renewalTenureMonths || 0) > 0
                        ? ` (${fd.renewalTenureMonths}m)`
                        : ""}
                    </small>
                    {fd.status === "RENEWED" ? (
                      <small>Renewed count: {Number(fd.renewalCount || 0)}</small>
                    ) : null}
                  </div>
                  {(fd.status === "ACTIVE" || fd.status === "MATURED") && (
                    <button type="button" onClick={() => handleCloseFd(fd._id)} disabled={isBusy}>
                      Close FD
                    </button>
                  )}
                </div>
              ))
            ) : (
              <p className="core-empty">No fixed deposits created yet.</p>
            )}
          </div>
        </article>

        <article className="core-card" id="core-section-rd">
          <div className="core-card-head">
            <h2>Recurring Deposits (RD)</h2>
            <div className="core-stats">
              <span>Total {rdSummary.total}</span>
              <span>Active {rdSummary.active}</span>
              <span>Deposited {formatInr(rdSummary.deposited)}</span>
            </div>
          </div>
          <p className="core-card-note">
            Create monthly RD plans, pay installments, and close matured plans. If maker-checker is enabled, request goes
            to admin approval queue first.
          </p>
          <form className="core-form-grid" onSubmit={handleCreateRd}>
            <input
              type="number"
              min="100"
              step="1"
              placeholder="Monthly Installment (Rs)"
              value={rdForm.monthlyInstallment}
              onChange={(event) => setRdForm((current) => ({ ...current, monthlyInstallment: event.target.value }))}
              required
            />
            <input
              type="number"
              min="1"
              step="1"
              placeholder="Tenure (Months)"
              value={rdForm.tenureMonths}
              onChange={(event) => setRdForm((current) => ({ ...current, tenureMonths: event.target.value }))}
              required
            />
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Rate %"
              value={rdForm.annualRate}
              onChange={(event) => setRdForm((current) => ({ ...current, annualRate: event.target.value }))}
              required
            />
            <label className="core-checkbox">
              <input
                type="checkbox"
                checked={Boolean(rdForm.autoDebit)}
                onChange={(event) => setRdForm((current) => ({ ...current, autoDebit: event.target.checked }))}
              />
              Auto-debit
            </label>
            <button type="submit" disabled={isBusy}>
              Create RD
            </button>
          </form>
          <div className="core-list">
            {recurringDeposits.length ? (
              recurringDeposits.map((rd) => (
                <div key={rd._id} className="core-list-item">
                  <div>
                    <strong>{formatInr(rd.monthlyInstallment)} / month</strong>
                    <p>
                      Paid {rd.installmentsPaid}/{rd.tenureMonths} | Deposited {formatInr(rd.totalDeposited)} | {rd.status}
                    </p>
                    <small>
                      Next due {formatDateTime(rd.nextDueDate)} | Auto-debit {rd.autoDebit ? "ON" : "OFF"}
                    </small>
                    {rd.autoDebit && Number(rd.autoDebitConsecutiveFailures || 0) > 0 ? (
                      <small>
                        Failed attempts: {Number(rd.autoDebitConsecutiveFailures || 0)}
                        {rd.autoDebitNextRetryAt ? ` | Retry ${formatDateTime(rd.autoDebitNextRetryAt)}` : ""}
                      </small>
                    ) : null}
                  </div>
                  <div className="core-inline-actions">
                    {rd.status === "ACTIVE" ? (
                      <button type="button" onClick={() => handlePayRdInstallment(rd._id)} disabled={isBusy}>
                        Pay Installment
                      </button>
                    ) : null}
                    {rd.status !== "CLOSED" ? (
                      <button type="button" onClick={() => handleCloseRd(rd._id)} disabled={isBusy}>
                        Close RD
                      </button>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <p className="core-empty">No recurring deposits created yet.</p>
            )}
          </div>
        </article>

        <article className="core-card" id="core-section-approvals">
          <div className="core-card-head">
            <h2>My Approval Requests</h2>
            <div className="core-stats">
              <span>Total {myApprovalSummary.total}</span>
              <span>Pending {myApprovalSummary.pending}</span>
              <span>Executed {myApprovalSummary.executed}</span>
              <span>Rejected {myApprovalSummary.rejected}</span>
              <span>Failed {myApprovalSummary.failed}</span>
            </div>
          </div>
          <p className="core-card-note">
            Track request-to-approval lifecycle for FD/RD and other maker-checker actions. You can cancel only pending
            requests. Use search and date range to quickly find request history.
          </p>
          <form className="core-form-grid core-approval-filters" onSubmit={handleApplyMyApprovalFilters}>
            <input
              type="text"
              placeholder="Search by request/action/notes/id"
              value={myApprovalFilters.q}
              onChange={(event) => handleMyApprovalFilterChange("q", event.target.value)}
            />
            <select
              value={myApprovalFilters.status}
              onChange={(event) => handleMyApprovalFilterChange("status", event.target.value)}
            >
              {myApprovalStatusFilterOptions.map((option) => (
                <option key={option.value || "ALL"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={myApprovalFilters.actionType}
              onChange={(event) => handleMyApprovalFilterChange("actionType", event.target.value)}
            >
              {myApprovalActionFilterOptions.map((option) => (
                <option key={option.value || "ALL"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={myApprovalFilters.fromDate}
              onChange={(event) => handleMyApprovalFilterChange("fromDate", event.target.value)}
            />
            <input
              type="date"
              value={myApprovalFilters.toDate}
              onChange={(event) => handleMyApprovalFilterChange("toDate", event.target.value)}
            />
            <button type="submit" disabled={isBusy}>
              Apply Filter
            </button>
            <button type="button" onClick={handleResetMyApprovalFilters} disabled={isBusy}>
              Reset Filter
            </button>
          </form>
          {myApprovalActionSummary.length ? (
            <div className="core-approval-chips">
              {myApprovalActionSummary.map((item) => (
                <span key={item.actionType}>
                  {item.actionType} ({item.count})
                </span>
              ))}
            </div>
          ) : null}
          <div className="core-list">
            {myApprovalRequests.length ? (
              myApprovalRequests.map((request) => (
                <div key={request._id} className="core-list-item">
                  <div>
                    <strong>{request.actionType}</strong>
                    <p>
                      <span className={`core-status-badge ${String(request.status || "").toLowerCase()}`}>
                        {request.status}
                      </span>
                      {" | "}Requested {formatDateTime(request.createdAt)}
                    </p>
                    <small>
                      Target {request.targetType}:{String(request.targetId || "").slice(-8)}
                    </small>
                    {String(request.actionType || "").toUpperCase() === "TRANSFER_EXECUTION" ? (
                      <small>
                        Transfer {formatInr(request?.payload?.amount || 0)} to {request?.payload?.recipientName || "Recipient"} (
                        {maskAccountNumber(request?.payload?.recipientAccountNumber || "")})
                      </small>
                    ) : null}
                    {String(request.actionType || "").toUpperCase() === "SIP_PLAN_CREATION" ? (
                      <small>
                        SIP {request?.payload?.planName || "Plan"} | {formatInr(request?.payload?.monthlyContribution || 0)} / month for{" "}
                        {Number(request?.payload?.tenureMonths || 0)} months
                      </small>
                    ) : null}
                    {request.requestNote ? <small>Request note: {request.requestNote}</small> : null}
                    {request.reviewNote ? <small>Review note: {request.reviewNote}</small> : null}
                    {request.failureReason ? <small>Failure: {request.failureReason}</small> : null}
                    {request.reviewedBy ? (
                      <small>
                        Reviewed by {formatUserLabel(request.reviewedBy)} at {formatDateTime(request.reviewedAt)}
                      </small>
                    ) : null}
                    {request.executedAt ? <small>Executed at {formatDateTime(request.executedAt)}</small> : null}
                  </div>
                  <div className="core-inline-actions">
                    {request.status === "PENDING" ? (
                      <button type="button" onClick={() => handleCancelMyApprovalRequest(request._id)} disabled={isBusy}>
                        Cancel Request
                      </button>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <p className="core-empty">No approval requests submitted yet.</p>
            )}
          </div>
          <div className="core-approval-pagination">
            <button
              type="button"
              onClick={() => handleApprovalPageChange(Math.max(1, Number(myApprovalPagination.page || 1) - 1))}
              disabled={isBusy || Number(myApprovalPagination.page || 1) <= 1}
            >
              Previous
            </button>
            <span>{myApprovalPageLabel}</span>
            <button
              type="button"
              onClick={() =>
                handleApprovalPageChange(
                  Math.min(Number(myApprovalPagination.pages || 1), Number(myApprovalPagination.page || 1) + 1)
                )
              }
              disabled={isBusy || Number(myApprovalPagination.page || 1) >= Number(myApprovalPagination.pages || 1)}
            >
              Next
            </button>
          </div>
        </article>

        <article className="core-card" id="core-section-sip">
          <div className="core-card-head">
            <h2>SIP Plans (Request and Approval)</h2>
            <div className="core-stats">
              <span>Total {sipSummary.total}</span>
              <span>Active {sipSummary.active}</span>
              <span>Requested {sipSummary.requested}</span>
              <span>Invested {formatInr(sipSummary.invested)}</span>
            </div>
          </div>
          <p className="core-card-note">
            Submit SIP request, wait for admin approval, then run monthly installment process.
          </p>
          <form className="core-form-grid" onSubmit={handleCreateSipRequest}>
            <input
              type="text"
              placeholder="Plan Name"
              value={sipForm.planName}
              onChange={(event) => setSipForm((current) => ({ ...current, planName: event.target.value }))}
            />
            <input
              type="text"
              placeholder="Fund Name"
              value={sipForm.fundName}
              onChange={(event) => setSipForm((current) => ({ ...current, fundName: event.target.value }))}
            />
            <input
              type="number"
              min="100"
              step="1"
              placeholder="Monthly SIP Amount (Rs)"
              value={sipForm.monthlyContribution}
              onChange={(event) => setSipForm((current) => ({ ...current, monthlyContribution: event.target.value }))}
              required
            />
            <input
              type="number"
              min="1"
              max="600"
              step="1"
              placeholder="Tenure (Months)"
              value={sipForm.tenureMonths}
              onChange={(event) => setSipForm((current) => ({ ...current, tenureMonths: event.target.value }))}
              required
            />
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              placeholder="Expected Return %"
              value={sipForm.expectedAnnualReturn}
              onChange={(event) => setSipForm((current) => ({ ...current, expectedAnnualReturn: event.target.value }))}
              required
            />
            <input
              type="number"
              min="0"
              step="1"
              placeholder="Goal Amount (optional)"
              value={sipForm.goalAmount}
              onChange={(event) => setSipForm((current) => ({ ...current, goalAmount: event.target.value }))}
            />
            <input
              type="date"
              value={sipForm.startDate}
              onChange={(event) => setSipForm((current) => ({ ...current, startDate: event.target.value }))}
              required
            />
            <label className="core-checkbox">
              <input
                type="checkbox"
                checked={Boolean(sipForm.autoDebit)}
                onChange={(event) => setSipForm((current) => ({ ...current, autoDebit: event.target.checked }))}
              />
              Auto-debit
            </label>
            <button type="submit" disabled={isBusy}>
              Submit SIP Request
            </button>
          </form>
          <div className="core-list">
            {sipPlans.length ? (
              sipPlans.map((sip) => {
                const status = String(sip.status || "").toUpperCase();
                return (
                  <div key={sip._id} className="core-list-item">
                    <div>
                      <strong>{sip.planName || "SIP Plan"}</strong>
                      <p>
                        {formatInr(sip.monthlyContribution)} / month | Tenure {sip.tenureMonths}m | Status {status}
                      </p>
                      <small>
                        Fund {sip.fundName || "Balanced Growth Fund"} | Start {formatDateTime(sip.startDate)} | Next debit{" "}
                        {formatDateTime(sip.nextDebitDate)}
                      </small>
                      <small>
                        Invested {formatInr(sip.totalInvested)} | Installments {sip.executedInstallments}/{sip.tenureMonths}
                        {" | "}Projected {formatInr(sip.projectedMaturity)}
                      </small>
                      {sip.rejectionNote ? <small>Rejection note: {sip.rejectionNote}</small> : null}
                      {sip.lastFailureReason ? <small>Last failure: {sip.lastFailureReason}</small> : null}
                    </div>
                    <div className="core-inline-actions">
                      {status === "ACTIVE" ? (
                        <>
                          <button type="button" onClick={() => handlePaySipInstallmentNow(sip._id)} disabled={isBusy}>
                            Pay Installment
                          </button>
                          <button type="button" onClick={() => handleUpdateSipStatus(sip._id, "PAUSED")} disabled={isBusy}>
                            Pause
                          </button>
                          <button type="button" onClick={() => handleUpdateSipStatus(sip._id, "CANCELLED")} disabled={isBusy}>
                            Cancel
                          </button>
                        </>
                      ) : null}
                      {status === "PAUSED" ? (
                        <>
                          <button type="button" onClick={() => handleUpdateSipStatus(sip._id, "ACTIVE")} disabled={isBusy}>
                            Resume
                          </button>
                          <button type="button" onClick={() => handleUpdateSipStatus(sip._id, "CANCELLED")} disabled={isBusy}>
                            Cancel
                          </button>
                        </>
                      ) : null}
                      {status === "REQUESTED" ? (
                        <button type="button" onClick={() => handleUpdateSipStatus(sip._id, "CANCELLED")} disabled={isBusy}>
                          Cancel Request
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="core-empty">No SIP plans requested yet.</p>
            )}
          </div>
        </article>
      </section>

      <section className="core-card-grid">
        <article className="core-card" id="core-section-upi">
          <div className="core-card-head">
            <h2>UPI Handle (VPA)</h2>
            <div className="core-stats">
              <span>Total {vpaHandles.length}</span>
            </div>
          </div>
          <p className="core-card-note">Generate your `name@bankease` style handle for UPI-ready identity mapping.</p>
          <form className="core-form-grid core-form-inline" onSubmit={handleCreateVpa}>
            <input
              type="text"
              placeholder="Handle prefix (optional)"
              value={vpaPrefix}
              onChange={(event) => setVpaPrefix(event.target.value)}
            />
            <button type="submit" disabled={isBusy}>
              Create Handle
            </button>
          </form>
          <div className="core-list">
            {vpaHandles.length ? (
              vpaHandles.map((handle) => (
                <div key={handle._id} className="core-list-item">
                  <div>
                    <strong>{handle.handle}</strong>
                    <p>
                      Status {handle.status} | {handle.isPrimary ? "Primary" : "Secondary"}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="core-empty">No UPI handles linked yet.</p>
            )}
          </div>
        </article>

        <article className="core-card" id="core-section-rails">
          <div className="core-card-head">
            <h2>Payment Rail Queue</h2>
            <div className="core-stats">
              <span>UPI / IMPS / NEFT / RTGS / NACH / BBPS</span>
            </div>
          </div>
          <p className="core-card-note">Submit rail transfer requests. Records flow into settlement reconciliation queue.</p>
          <form className="core-form-grid" onSubmit={handleCreateRailTransfer}>
            <select value={railForm.rail} onChange={(event) => setRailForm((current) => ({ ...current, rail: event.target.value }))}>
              <option value="UPI">UPI</option>
              <option value="IMPS">IMPS</option>
              <option value="NEFT">NEFT</option>
              <option value="RTGS">RTGS</option>
              <option value="NACH">NACH</option>
              <option value="BBPS">BBPS</option>
            </select>
            <select
              value={railForm.direction}
              onChange={(event) => setRailForm((current) => ({ ...current, direction: event.target.value }))}
            >
              <option value="OUTBOUND">OUTBOUND</option>
              <option value="INBOUND">INBOUND</option>
            </select>
            <input
              type="number"
              min="1"
              step="0.01"
              placeholder="Amount (Rs)"
              value={railForm.amount}
              onChange={(event) => setRailForm((current) => ({ ...current, amount: event.target.value }))}
              required
            />
            <input
              type="text"
              placeholder="Destination (VPA/Account/Reference)"
              value={railForm.destination}
              onChange={(event) => setRailForm((current) => ({ ...current, destination: event.target.value }))}
              required
            />
            <input
              type="text"
              placeholder="Notes (optional)"
              value={railForm.notes}
              onChange={(event) => setRailForm((current) => ({ ...current, notes: event.target.value }))}
            />
            <button type="submit" disabled={isBusy}>
              Queue Transfer
            </button>
          </form>
        </article>
      </section>

      {canAccessAdmin ? (
        <section className="core-admin-grid">
          <article className="core-card">
            <div className="core-card-head">
              <h2>Admin Controls</h2>
              <button type="button" onClick={refreshAdminData} disabled={isBusy}>
                Refresh
              </button>
            </div>
            <div className="core-admin-actions">
              <button type="button" onClick={handleAdminBootstrap} disabled={isBusy}>
                Bootstrap COA
              </button>
              <div className="core-admin-inline">
                <input type="date" value={interestDate} onChange={(event) => setInterestDate(event.target.value)} />
                <button type="button" onClick={handleRunInterest} disabled={isBusy}>
                  Run Interest EOD
                </button>
              </div>
              <button type="button" onClick={handleRunFdMaturityJob} disabled={isBusy}>
                Run FD Maturity & Auto-Renew
              </button>
              <button type="button" onClick={handleRunRdAutoDebitJob} disabled={isBusy}>
                Run RD Auto-Debit
              </button>
              <div className="core-admin-inline">
                <input
                  type="text"
                  value={adminScanUserId}
                  onChange={(event) => setAdminScanUserId(event.target.value)}
                  placeholder="User ID (optional)"
                />
                <button type="button" onClick={handleRunAml} disabled={isBusy}>
                  Run AML Scan
                </button>
              </div>
              <button type="button" onClick={handleRunRegulatoryMonitor} disabled={isBusy}>
                Run Regulatory Monitor
              </button>
            </div>
          </article>

          <article className="core-card">
            <div className="core-card-head">
              <h2>Defaulted RD Recovery</h2>
              <div className="core-stats">
                <span>Defaulted {defaultedRecurringDeposits.length}</span>
              </div>
            </div>
            <p className="core-card-note">
              Recover defaulted recurring deposits after customer balance issues are resolved. Use Force Debit Now to
              recover and collect one installment immediately.
            </p>
            <div className="core-list">
              {defaultedRecurringDeposits.length ? (
                defaultedRecurringDeposits.map((rd) => (
                  <div key={rd._id} className="core-list-item">
                    <div>
                      <strong>{formatInr(rd.monthlyInstallment)} / month</strong>
                      <p>
                        {`${rd?.userId?.firstName || ""} ${rd?.userId?.lastName || ""}`.trim() ||
                          rd?.userId?.email ||
                          "User"}{" "}
                        | Paid {rd.installmentsPaid}/{rd.tenureMonths}
                      </p>
                      <small>
                        Failure {Number(rd.autoDebitConsecutiveFailures || 0)} | Reason{" "}
                        {rd.autoDebitLastFailureReason || "Auto-debit failure"}
                      </small>
                      <small>
                        Retry {rd.autoDebitNextRetryAt ? formatDateTime(rd.autoDebitNextRetryAt) : "--"} | Account{" "}
                        {rd?.accountId?.accountNumber || "--"}
                      </small>
                    </div>
                    <div className="core-inline-actions">
                      <button type="button" onClick={() => handleRecoverDefaultedRd(rd._id)} disabled={isBusy}>
                        Recover
                      </button>
                      <button type="button" onClick={() => handleForceDebitDefaultedRd(rd._id)} disabled={isBusy}>
                        Force Debit Now
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="core-empty">No defaulted recurring deposits right now.</p>
              )}
            </div>
          </article>

          <article className="core-card core-card-wide">
            <div className="core-card-head">
              <h2>SIP Approval Queue</h2>
              <div className="core-stats">
                <span>Total {adminSipRequests.length}</span>
                <span>Pending {adminSipRequests.filter((item) => item.status === "REQUESTED").length}</span>
              </div>
            </div>
            <p className="core-card-note">
              SIP requests become active only after admin approval. Rejected requests stay closed with reason.
              {sipMakerCheckerRequired
                ? " Maker-checker is enabled, so use Admin Approval Requests for approve/reject."
                : ""}
            </p>
            <div className="core-inline-actions">
              <button type="button" onClick={handleRunSipAutoDebitJob} disabled={isBusy}>
                Run SIP Auto-Debit
              </button>
            </div>
            <div className="core-list">
              {adminSipRequests.length ? (
                adminSipRequests.map((entry) => {
                  const status = String(entry.status || "").toUpperCase();
                  const customer =
                    `${entry?.userId?.firstName || ""} ${entry?.userId?.lastName || ""}`.trim() ||
                    entry?.userId?.email ||
                    "User";
                  return (
                    <div key={entry._id} className="core-list-item">
                      <div>
                        <strong>{entry.planName || "SIP Plan"}</strong>
                        <p>
                          {customer} | {formatInr(entry.monthlyContribution)} / month | Tenure {entry.tenureMonths}m
                        </p>
                        <small>
                          Status {status} | Start {formatDateTime(entry.startDate)} | Auto-debit{" "}
                          {entry.autoDebit ? "ON" : "OFF"}
                        </small>
                        {entry.rejectionNote ? <small>Rejection note: {entry.rejectionNote}</small> : null}
                      </div>
                      <div className="core-inline-actions">
                        {status === "REQUESTED" && !sipMakerCheckerRequired ? (
                          <>
                            <input
                              type="text"
                              placeholder="Decision note (optional)"
                              value={sipDecisionNotes[entry._id] || ""}
                              onChange={(event) =>
                                setSipDecisionNotes((current) => ({
                                  ...current,
                                  [entry._id]: event.target.value,
                                }))
                              }
                              maxLength={280}
                            />
                            <button type="button" onClick={() => handleAdminSipDecision(entry._id, "APPROVE")} disabled={isBusy}>
                              Approve
                            </button>
                            <button type="button" onClick={() => handleAdminSipDecision(entry._id, "REJECT")} disabled={isBusy}>
                              Reject
                            </button>
                          </>
                        ) : (
                          <span className={`core-status-badge ${status.toLowerCase()}`}>
                            {status === "REQUESTED" && sipMakerCheckerRequired ? "REQUESTED (Use Approval Queue)" : status}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="core-empty">No SIP requests available.</p>
              )}
            </div>
          </article>

          <article className="core-card" id="core-section-treasury">
            <div className="core-card-head">
              <h2>Treasury & Liquidity Snapshot</h2>
              <div className="core-stats">
                <span>Total {treasurySnapshots.length}</span>
                <span>Latest {latestTreasurySnapshot ? formatDateTime(latestTreasurySnapshot.asOfDate) : "--"}</span>
              </div>
            </div>
            <p className="core-card-note">
              Capture daily treasury balances to monitor CRR, SLR, LCR, and net liquidity for ALM supervision.
            </p>
            <form className="core-form-grid" onSubmit={handleCreateTreasurySnapshot}>
              <input
                type="date"
                value={treasuryForm.asOfDate}
                onChange={(event) => setTreasuryForm((current) => ({ ...current, asOfDate: event.target.value }))}
                required
              />
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Cash in Vault"
                value={treasuryForm.cashInVault}
                onChange={(event) => setTreasuryForm((current) => ({ ...current, cashInVault: event.target.value }))}
                required
              />
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="RBI Balance"
                value={treasuryForm.rbiBalance}
                onChange={(event) => setTreasuryForm((current) => ({ ...current, rbiBalance: event.target.value }))}
                required
              />
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Nostro Balance"
                value={treasuryForm.nostroBalance}
                onChange={(event) => setTreasuryForm((current) => ({ ...current, nostroBalance: event.target.value }))}
                required
              />
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Interbank Obligations"
                value={treasuryForm.interbankObligations}
                onChange={(event) =>
                  setTreasuryForm((current) => ({ ...current, interbankObligations: event.target.value }))
                }
                required
              />
              <input
                type="text"
                placeholder="Remarks (optional)"
                value={treasuryForm.remarks}
                onChange={(event) => setTreasuryForm((current) => ({ ...current, remarks: event.target.value }))}
              />
              <button type="submit" disabled={isBusy}>
                Save Snapshot
              </button>
            </form>

            {latestTreasurySnapshot ? (
              <div className="core-kpi-grid">
                <div>
                  <small>CRR Ratio</small>
                  <strong>{Number(latestTreasurySnapshot.crrRatio || 0).toFixed(2)}%</strong>
                </div>
                <div>
                  <small>SLR Ratio</small>
                  <strong>{Number(latestTreasurySnapshot.slrRatio || 0).toFixed(2)}%</strong>
                </div>
                <div>
                  <small>LCR Ratio</small>
                  <strong>{Number(latestTreasurySnapshot.lcrRatio || 0).toFixed(2)}%</strong>
                </div>
                <div>
                  <small>Net Liquidity</small>
                  <strong>{formatInr(latestTreasurySnapshot.netLiquidity)}</strong>
                </div>
              </div>
            ) : null}

            <div className="core-list">
              {treasurySnapshots.length ? (
                treasurySnapshots.map((snapshot) => (
                  <div key={snapshot._id} className="core-list-item">
                    <div>
                      <strong>{formatDateTime(snapshot.asOfDate)}</strong>
                      <p>
                        CRR {Number(snapshot.crrRatio || 0).toFixed(2)}% | SLR {Number(snapshot.slrRatio || 0).toFixed(2)}% |
                        LCR {Number(snapshot.lcrRatio || 0).toFixed(2)}%
                      </p>
                      <small>Deposits {formatInr(snapshot.totalDeposits)} | Loans {formatInr(snapshot.totalLoansOutstanding)}</small>
                    </div>
                    <div className="core-amount-tag">{formatInr(snapshot.netLiquidity)}</div>
                  </div>
                ))
              ) : (
                <p className="core-empty">No treasury snapshots available.</p>
              )}
            </div>
          </article>

          <article className="core-card" id="core-section-gl-approval">
            <div className="core-card-head">
              <h2>Maker-Checker GL Adjustment</h2>
              <div className="core-stats">
                <span>Action GL_MANUAL_JOURNAL</span>
              </div>
            </div>
            <p className="core-card-note">
              Create a manual GL adjustment request. It goes to approval queue and requires reviewer approval based on policy.
            </p>
            <form className="core-form-grid" onSubmit={handleRequestManualGlApproval}>
              <input
                type="text"
                placeholder="Description"
                value={manualGlForm.description}
                onChange={(event) => setManualGlForm((current) => ({ ...current, description: event.target.value }))}
                required
              />
              <input
                type="date"
                value={manualGlForm.postingDate}
                onChange={(event) => setManualGlForm((current) => ({ ...current, postingDate: event.target.value }))}
              />
              <input
                type="text"
                placeholder="Debit Account Code (e.g. 100100)"
                value={manualGlForm.debitAccountCode}
                onChange={(event) =>
                  setManualGlForm((current) => ({ ...current, debitAccountCode: event.target.value.toUpperCase() }))
                }
                required
              />
              <input
                type="text"
                placeholder="Credit Account Code (e.g. 200100)"
                value={manualGlForm.creditAccountCode}
                onChange={(event) =>
                  setManualGlForm((current) => ({ ...current, creditAccountCode: event.target.value.toUpperCase() }))
                }
                required
              />
              <input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Amount (Rs)"
                value={manualGlForm.amount}
                onChange={(event) => setManualGlForm((current) => ({ ...current, amount: event.target.value }))}
                required
              />
              <input
                type="text"
                placeholder="Narration (optional)"
                value={manualGlForm.narration}
                onChange={(event) => setManualGlForm((current) => ({ ...current, narration: event.target.value }))}
              />
              <input
                type="text"
                placeholder="Request note for reviewer (optional)"
                value={manualGlForm.requestNote}
                onChange={(event) => setManualGlForm((current) => ({ ...current, requestNote: event.target.value }))}
              />
              <button type="submit" disabled={isBusy}>
                Submit For Approval
              </button>
            </form>
          </article>

          <article className="core-card">
            <div className="core-card-head">
              <h2>General Ledger</h2>
              <div className="core-stats">
                <span>Accounts {glAccounts.length}</span>
                <span>TB {trialBalance?.balanced ? "Balanced" : "Check"}</span>
              </div>
            </div>
            <div className="core-kpi-grid">
              <div>
                <small>Trial Balance</small>
                <strong>
                  Dr {formatInr(trialBalance?.totalDebitBalance)} | Cr {formatInr(trialBalance?.totalCreditBalance)}
                </strong>
              </div>
              <div>
                <small>P&L Net</small>
                <strong>{formatInr(profitAndLoss?.netProfit)}</strong>
              </div>
              <div>
                <small>Assets</small>
                <strong>{formatInr(balanceSheet?.assetsTotal)}</strong>
              </div>
              <div>
                <small>Liabilities + Equity</small>
                <strong>{formatInr(balanceSheet?.liabilitiesAndEquityTotal)}</strong>
              </div>
            </div>
            <div className="core-list">
              {glAccounts.slice(0, 8).map((account) => (
                <div key={account._id} className="core-list-item">
                  <div>
                    <strong>
                      {account.code} - {account.name}
                    </strong>
                    <p>
                      {account.accountType} | {account.normalSide}
                    </p>
                  </div>
                  <div className="core-amount-tag">{formatInr(account.currentBalance)}</div>
                </div>
              ))}
              {glAccounts.length > 8 ? (
                <p className="core-empty">Showing first 8 GL accounts. Use admin APIs for complete export/reporting.</p>
              ) : null}
            </div>
          </article>

          <article className="core-card">
            <div className="core-card-head">
              <h2>Interest Accruals</h2>
              <div className="core-stats">
                <span>Latest {interestAccruals.length}</span>
              </div>
            </div>
            <div className="core-list">
              {interestAccruals.length ? (
                interestAccruals.map((entry) => (
                  <div key={entry._id} className="core-list-item">
                    <div>
                      <strong>{formatInr(entry.interestAmount)}</strong>
                      <p>
                        {entry.dateKey} | {entry.status}
                      </p>
                      <small>
                        {entry?.userId?.firstName || "User"} {entry?.userId?.lastName || ""}
                      </small>
                    </div>
                  </div>
                ))
              ) : (
                <p className="core-empty">No accruals found.</p>
              )}
            </div>
          </article>

          <article className="core-card">
            <div className="core-card-head">
              <h2>AML Alerts</h2>
              <div className="core-stats">
                <span>Latest {amlAlerts.length}</span>
              </div>
            </div>
            <div className="core-list">
              {amlAlerts.length ? (
                amlAlerts.map((alert) => (
                  <div key={alert._id} className="core-list-item">
                    <div>
                      <strong>{alert.ruleCode}</strong>
                      <p>
                        {alert.severity} | {alert.status}
                      </p>
                      <small>{alert.message}</small>
                    </div>
                  </div>
                ))
              ) : (
                <p className="core-empty">No AML alerts generated.</p>
              )}
            </div>
          </article>

          <article className="core-card core-card-wide" id="core-section-regulatory">
            <div className="core-card-head">
              <h2>Regulatory Reporting (CTR / STR / ALM)</h2>
              <div className="core-stats">
                <span>Publications {regulatoryPublications.length}</span>
                <span>
                  Range {regulatoryReport?.range?.from ? formatDateTime(regulatoryReport.range.from) : "--"} to{" "}
                  {regulatoryReport?.range?.to ? formatDateTime(regulatoryReport.range.to) : "--"}
                </span>
              </div>
            </div>
            <p className="core-card-note">
              Consolidated compliance view for high-value cash transactions, AML suspicious alerts, and treasury liquidity posture.
            </p>
            {regulatoryReport?.policy ? (
              <p className="core-card-note">
                Policy: CTR threshold {formatInr(regulatoryReport.policy.effectiveCashThreshold)} | Min LCR{" "}
                {Number(regulatoryReport.policy.minLcrRatio || 0).toFixed(2)}% | Max Loan/Deposit{" "}
                {Number(regulatoryReport.policy.maxLoanToDepositRatio || 0).toFixed(2)}% | STR(Open/Critical){" "}
                {Number(regulatoryReport.policy.openStrAlertThreshold || 0)}/
                {Number(regulatoryReport.policy.criticalStrAlertThreshold || 0)}
              </p>
            ) : null}
            <form className="core-form-grid" onSubmit={handleRequestRegulatoryPublish}>
              <input
                type="date"
                value={regulatoryPublishForm.fromDate}
                onChange={(event) =>
                  setRegulatoryPublishForm((current) => ({ ...current, fromDate: event.target.value }))
                }
                required
              />
              <input
                type="date"
                value={regulatoryPublishForm.toDate}
                onChange={(event) => setRegulatoryPublishForm((current) => ({ ...current, toDate: event.target.value }))}
                required
              />
              <input
                type="number"
                min="1"
                step="1"
                placeholder="CTR Threshold (Rs)"
                value={regulatoryPublishForm.cashThreshold}
                onChange={(event) =>
                  setRegulatoryPublishForm((current) => ({ ...current, cashThreshold: event.target.value }))
                }
                required
              />
              <input
                type="text"
                placeholder="Publish note for approval/reviewer"
                value={regulatoryPublishForm.publishNote}
                onChange={(event) =>
                  setRegulatoryPublishForm((current) => ({ ...current, publishNote: event.target.value }))
                }
              />
              <button type="submit" disabled={isBusy}>
                Request Report Publish
              </button>
            </form>
            <div className="core-inline-actions core-report-actions">
              <button type="button" onClick={() => handleLoadRegulatoryReport()} disabled={isBusy}>
                Load Selected Range
              </button>
              <button type="button" onClick={() => handleExportRegulatoryCsv()} disabled={isBusy}>
                Export CSV
              </button>
              <button type="button" onClick={handlePrintRegulatoryReport} disabled={isBusy || !regulatoryReport}>
                Print / Save PDF
              </button>
            </div>
            {regulatoryReport ? (
              <>
                <div className="core-kpi-grid">
                  <div>
                    <small>CTR Count</small>
                    <strong>{regulatoryReport?.ctr?.count || 0}</strong>
                  </div>
                  <div>
                    <small>CTR Total Amount</small>
                    <strong>{formatInr(regulatoryReport?.ctr?.totalAmount || 0)}</strong>
                  </div>
                  <div>
                    <small>Open STR Alerts</small>
                    <strong>{regulatoryReport?.str?.openAlerts || 0}</strong>
                  </div>
                  <div>
                    <small>Critical STR Alerts</small>
                    <strong>{regulatoryReport?.str?.criticalAlerts || 0}</strong>
                  </div>
                  <div>
                    <small>LCR Ratio</small>
                    <strong>{Number(regulatoryReport?.alm?.liquidity?.lcrRatio || 0).toFixed(2)}%</strong>
                  </div>
                  <div>
                    <small>Loan to Deposit</small>
                    <strong>{Number(regulatoryReport?.alm?.loanToDepositRatio || 0).toFixed(2)}%</strong>
                  </div>
                </div>

                <div className="core-list">
                  {(regulatoryReport?.indicators || []).map((indicator) => (
                    <div key={indicator.code} className={`core-list-item core-indicator ${indicator.status === "ATTENTION" ? "warning" : "ok"}`}>
                      <div>
                        <strong>{indicator.code}</strong>
                        <p>{indicator.message}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="core-subgrid">
                  <div className="core-subcard">
                    <h3>Regulatory Alert Queue</h3>
                    <div className="core-stats">
                      <span>Total {regulatoryAlertSummary.total}</span>
                      <span>Open {regulatoryAlertSummary.open}</span>
                      <span>Ack {regulatoryAlertSummary.acknowledged}</span>
                      <span>Resolved {regulatoryAlertSummary.resolved}</span>
                    </div>
                    <div className="core-list">
                      {regulatoryAlerts.length ? (
                        regulatoryAlerts.map((alert) => (
                          <div key={alert._id} className="core-list-item">
                            <div>
                              <strong>{alert.indicatorCode}</strong>
                              <p>{alert.indicatorMessage}</p>
                              <small>
                                Created {formatDateTime(alert.createdAt)} | Source {alert.source || "--"} | Status {alert.status}
                              </small>
                              {alert.status === "ACKNOWLEDGED" ? (
                                <small>
                                  Acknowledged by {formatUserLabel(alert.acknowledgedBy)} at{" "}
                                  {formatDateTime(alert.acknowledgedAt)}
                                </small>
                              ) : null}
                              {alert.status === "RESOLVED" ? (
                                <small>
                                  Resolved by {formatUserLabel(alert.resolvedBy)} at {formatDateTime(alert.resolvedAt)} |{" "}
                                  {alert.resolutionNote || "No resolution note"}
                                </small>
                              ) : null}
                            </div>
                            <div className="core-alert-actions">
                              <span className={`core-status-badge ${String(alert.status || "").toLowerCase()}`}>
                                {alert.status}
                              </span>
                              {alert.status === "OPEN" ? (
                                <button
                                  type="button"
                                  onClick={() => handleAcknowledgeRegulatoryAlert(alert._id)}
                                  disabled={isBusy}
                                >
                                  Acknowledge
                                </button>
                              ) : null}
                              {alert.status !== "RESOLVED" ? (
                                <>
                                  <input
                                    type="text"
                                    placeholder="Resolution note"
                                    value={regulatoryResolveDrafts[alert._id] || ""}
                                    onChange={(event) =>
                                      setRegulatoryResolveDrafts((current) => ({
                                        ...current,
                                        [alert._id]: event.target.value,
                                      }))
                                    }
                                    maxLength={300}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleResolveRegulatoryAlert(alert._id)}
                                    disabled={isBusy}
                                  >
                                    Resolve
                                  </button>
                                </>
                              ) : null}
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="core-empty">No regulatory alerts in queue.</p>
                      )}
                    </div>
                  </div>
                  <div className="core-subcard">
                    <h3>Top STR Rules</h3>
                    <div className="core-list">
                      {(regulatoryReport?.str?.topRules || []).length ? (
                        (regulatoryReport?.str?.topRules || []).map((rule) => (
                          <div key={rule._id} className="core-list-item">
                            <div>
                              <strong>{rule._id}</strong>
                              <p>Alerts {rule.count}</p>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="core-empty">No STR rules triggered in selected period.</p>
                      )}
                    </div>
                  </div>
                  <div className="core-subcard">
                    <h3>Published Reports</h3>
                    <div className="core-list">
                      {regulatoryPublications.length ? (
                        regulatoryPublications.map((publication) => (
                          <div key={publication._id} className="core-list-item">
                            <div>
                              <strong>{formatDateTime(publication.publishedAt)}</strong>
                              <p>
                                By{" "}
                                {publication?.publishedBy
                                  ? `${publication.publishedBy.firstName || ""} ${publication.publishedBy.lastName || ""}`.trim() ||
                                    publication.publishedBy.email
                                  : "System"}
                              </p>
                              <small>{publication?.metadata?.publishNote || "No publish note"}</small>
                            </div>
                            <div className="core-inline-actions">
                              <div className="core-amount-tag">CTR {publication?.metadata?.summary?.ctrCount ?? 0}</div>
                              <button
                                type="button"
                                onClick={() =>
                                  handleLoadRegulatoryReport({
                                    fromDate: publication?.metadata?.range?.from,
                                    toDate: publication?.metadata?.range?.to,
                                    cashThreshold: publication?.metadata?.range?.cashThreshold,
                                  })
                                }
                                disabled={isBusy}
                              >
                                Use Range
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleExportRegulatoryCsv({
                                    fromDate: publication?.metadata?.range?.from,
                                    toDate: publication?.metadata?.range?.to,
                                    cashThreshold: publication?.metadata?.range?.cashThreshold,
                                  })
                                }
                                disabled={isBusy}
                              >
                                CSV
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="core-empty">No regulatory reports have been published yet.</p>
                      )}
                    </div>
                  </div>
                  <div className="core-subcard">
                    <h3>Settlement Status Summary</h3>
                    <div className="core-list">
                      {Object.entries(regulatoryReport?.settlement?.byStatus || {}).length ? (
                        Object.entries(regulatoryReport?.settlement?.byStatus || {}).map(([status, summary]) => (
                          <div key={status} className="core-list-item">
                            <div>
                              <strong>{status}</strong>
                              <p>Count {summary.count}</p>
                            </div>
                            <div className="core-amount-tag">{formatInr(summary.totalAmount || 0)}</div>
                          </div>
                        ))
                      ) : (
                        <p className="core-empty">No settlement records in selected period.</p>
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <p className="core-empty">Regulatory report is not available yet.</p>
            )}
          </article>

          <article className="core-card core-card-wide">
            <div className="core-card-head">
              <h2>Settlement Reconciliation</h2>
              <div className="core-stats">
                <span>Queue {settlements.length}</span>
              </div>
            </div>
            <div className="core-list">
              {settlements.length ? (
                settlements.map((record) => (
                  <div key={record._id} className="core-list-item">
                    <div>
                      <strong>
                        {record.rail} {record.direction} - {formatInr(record.amount)}
                      </strong>
                      <p>
                        Current {record.status} | Ref {record.externalReference}
                      </p>
                      <small>Settlement date {formatDateTime(record.settlementDate)}</small>
                    </div>
                    <div className="core-inline-actions">
                      <select
                        value={settlementStatusDrafts[record._id] || record.status}
                        onChange={(event) =>
                          setSettlementStatusDrafts((current) => ({ ...current, [record._id]: event.target.value }))
                        }
                      >
                        <option value="QUEUED">QUEUED</option>
                        <option value="SENT">SENT</option>
                        <option value="SETTLED">SETTLED</option>
                        <option value="FAILED">FAILED</option>
                        <option value="REVERSED">REVERSED</option>
                        <option value="MANUAL_REVIEW">MANUAL_REVIEW</option>
                      </select>
                      <button type="button" onClick={() => handleReconcileSettlement(record._id)} disabled={isBusy}>
                        Update
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="core-empty">No settlement records available.</p>
              )}
            </div>
          </article>
        </section>
      ) : null}

      {isBusy ? <p className="core-loading-text">Processing request...</p> : null}
    </div>
  );
};

export default CoreBanking;
