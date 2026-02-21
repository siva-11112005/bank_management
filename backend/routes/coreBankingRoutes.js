const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { adminOnly } = require("../middleware/roleMiddleware");
const {
  bootstrapCoreBanking,
  getGlAccounts,
  getTrialBalanceReport,
  getProfitAndLossReport,
  getBalanceSheetReport,
  requestManualGlJournal,
  runInterestEodJob,
  runFixedDepositMaturityJob,
  listInterestAccruals,
  createTreasurySnapshot,
  listTreasurySnapshots,
  getRegulatoryReport,
  getRegulatoryAlerts,
  exportRegulatoryReportCsv,
  acknowledgeRegulatoryAlert,
  resolveRegulatoryAlert,
  runRegulatoryBreachMonitorJob,
  requestRegulatoryReportPublish,
  listRegulatoryPublications,
  createFixedDeposit,
  getMyFixedDeposits,
  closeFixedDeposit,
  createRecurringDeposit,
  runRecurringDepositAutoDebitJob,
  listDefaultedRecurringDeposits,
  recoverDefaultedRecurringDeposit,
  forceDebitRecurringDepositByAdmin,
  getMyApprovalRequests,
  cancelMyApprovalRequest,
  getMyRecurringDeposits,
  payRecurringInstallment,
  closeRecurringDeposit,
  createVpaHandle,
  getMyVpaHandles,
  createRailTransfer,
  listSettlementRecords,
  reconcileSettlementRecord,
  runAmlScanJob,
  getAmlAlerts,
} = require("../controllers/coreBankingController");
const {
  requestSipPlan,
  getMySipPlans,
  updateMySipPlanStatus,
  paySipInstallment,
  getAdminSipRequests,
  decideSipRequest,
  runSipAutoDebitJob,
} = require("../controllers/sipController");

const router = express.Router();

// Admin: CBS bootstrap and GL reports
router.post("/admin/bootstrap", protect, adminOnly, bootstrapCoreBanking);
router.get("/admin/gl/accounts", protect, adminOnly, getGlAccounts);
router.get("/admin/gl/trial-balance", protect, adminOnly, getTrialBalanceReport);
router.get("/admin/gl/profit-loss", protect, adminOnly, getProfitAndLossReport);
router.get("/admin/gl/balance-sheet", protect, adminOnly, getBalanceSheetReport);
router.post("/admin/gl/manual-journal/request", protect, adminOnly, requestManualGlJournal);

// Admin: interest, settlement, AML operations
router.post("/admin/interest/run-eod", protect, adminOnly, runInterestEodJob);
router.post("/admin/fd/run-maturity", protect, adminOnly, runFixedDepositMaturityJob);
router.get("/admin/interest/accruals", protect, adminOnly, listInterestAccruals);
router.post("/admin/treasury/snapshots", protect, adminOnly, createTreasurySnapshot);
router.get("/admin/treasury/snapshots", protect, adminOnly, listTreasurySnapshots);
router.get("/admin/regulatory/report", protect, adminOnly, getRegulatoryReport);
router.get("/admin/regulatory/report/export.csv", protect, adminOnly, exportRegulatoryReportCsv);
router.get("/admin/regulatory/alerts", protect, adminOnly, getRegulatoryAlerts);
router.put("/admin/regulatory/alerts/:alertId/acknowledge", protect, adminOnly, acknowledgeRegulatoryAlert);
router.put("/admin/regulatory/alerts/:alertId/resolve", protect, adminOnly, resolveRegulatoryAlert);
router.post("/admin/regulatory/monitor/run", protect, adminOnly, runRegulatoryBreachMonitorJob);
router.post("/admin/regulatory/publish-request", protect, adminOnly, requestRegulatoryReportPublish);
router.get("/admin/regulatory/publications", protect, adminOnly, listRegulatoryPublications);
router.get("/admin/settlement", protect, adminOnly, listSettlementRecords);
router.put("/admin/settlement/:settlementId/reconcile", protect, adminOnly, reconcileSettlementRecord);
router.post("/admin/aml/scan", protect, adminOnly, runAmlScanJob);
router.get("/admin/aml/alerts", protect, adminOnly, getAmlAlerts);

// User: FD/RD modules
router.post("/fd", protect, createFixedDeposit);
router.get("/fd/my", protect, getMyFixedDeposits);
router.post("/fd/:fdId/close", protect, closeFixedDeposit);

router.post("/rd", protect, createRecurringDeposit);
router.post("/admin/rd/run-autodebit", protect, adminOnly, runRecurringDepositAutoDebitJob);
router.get("/admin/rd/defaulted", protect, adminOnly, listDefaultedRecurringDeposits);
router.put("/admin/rd/:rdId/recover", protect, adminOnly, recoverDefaultedRecurringDeposit);
router.post("/admin/rd/:rdId/force-debit", protect, adminOnly, forceDebitRecurringDepositByAdmin);
router.get("/rd/my", protect, getMyRecurringDeposits);
router.post("/rd/:rdId/installment", protect, payRecurringInstallment);
router.post("/rd/:rdId/close", protect, closeRecurringDeposit);
router.get("/approvals/my", protect, getMyApprovalRequests);
router.put("/approvals/:approvalId/cancel", protect, cancelMyApprovalRequest);

// User: UPI handle and rail transfer simulation
router.post("/upi/vpa", protect, createVpaHandle);
router.get("/upi/vpa/my", protect, getMyVpaHandles);
router.post("/rails/transfer", protect, createRailTransfer);

// User: SIP request and processing
router.post("/sip/request", protect, requestSipPlan);
router.get("/sip/my", protect, getMySipPlans);
router.put("/sip/:sipId/status", protect, updateMySipPlanStatus);
router.post("/sip/:sipId/installment", protect, paySipInstallment);

// Admin: SIP accept / reject / auto-debit
router.get("/admin/sip/requests", protect, adminOnly, getAdminSipRequests);
router.put("/admin/sip/:sipId/decision", protect, adminOnly, decideSipRequest);
router.post("/admin/sip/run-autodebit", protect, adminOnly, runSipAutoDebitJob);

module.exports = router;
