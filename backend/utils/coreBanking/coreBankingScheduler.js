const dayjs = require("dayjs");
const { runSavingsInterestEod } = require("./interestEngine");
const { runAmlScan } = require("./amlEngine");
const {
  autoPublishMonthlyRegulatoryReport,
  runRegulatoryBreachMonitor,
  runFixedDepositAutoRenewalJob,
  runRecurringDepositAutoDebitEngine,
} = require("../../controllers/coreBankingController");

let schedulerTimer = null;
let lastInterestDateKey = "";
let amlRunning = false;
let lastRegulatoryPublishCheckDateKey = "";
let lastRegulatoryMonitorDateKey = "";
let lastFdAutoRenewDateKey = "";

const shouldEnable = () => {
  const value = String(process.env.CORE_BANKING_SCHEDULER_ENABLED || "true").trim().toLowerCase();
  return !(value === "false" || value === "0" || value === "off");
};

const startCoreBankingScheduler = () => {
  if (!shouldEnable()) {
    console.log("Core banking scheduler is disabled by configuration.");
    return;
  }
  if (schedulerTimer) return;

  const intervalMs = Math.max(30 * 1000, Number(process.env.CORE_BANKING_SCHEDULER_INTERVAL_MS || 60 * 60 * 1000));
  const amlIntervalHours = Math.max(1, Number(process.env.AML_SCAN_INTERVAL_HOURS || 6));
  const regulatoryAutoPublishEnabled = String(process.env.REGULATORY_AUTO_PUBLISH_ENABLED || "true")
    .trim()
    .toLowerCase();
  const autoPublishEnabled = !["false", "0", "off"].includes(regulatoryAutoPublishEnabled);
  const autoPublishDay = Math.min(28, Math.max(1, Number(process.env.REGULATORY_AUTO_PUBLISH_DAY || 1)));
  const autoPublishHour = Math.min(23, Math.max(0, Number(process.env.REGULATORY_AUTO_PUBLISH_HOUR || 6)));
  const autoPublishThreshold = Number(process.env.REGULATORY_AUTO_PUBLISH_CTR_THRESHOLD || 1000000);
  const regulatoryMonitorEnabled = !["false", "0", "off"].includes(
    String(process.env.REGULATORY_BREACH_MONITOR_ENABLED || "true")
      .trim()
      .toLowerCase()
  );
  const regulatoryMonitorHour = Math.min(23, Math.max(0, Number(process.env.REGULATORY_BREACH_MONITOR_HOUR || 7)));
  const regulatoryMonitorThreshold = Number(process.env.REGULATORY_BREACH_MONITOR_CTR_THRESHOLD || 0);
  const fdAutoRenewEnabled = !["false", "0", "off"].includes(
    String(process.env.FD_AUTO_RENEW_SCHEDULER_ENABLED || "true")
      .trim()
      .toLowerCase()
  );
  const fdAutoRenewHour = Math.min(23, Math.max(0, Number(process.env.FD_AUTO_RENEW_HOUR || 8)));
  const fdAutoRenewBatchSize = Math.min(500, Math.max(1, Number(process.env.FD_AUTO_RENEW_BATCH_SIZE || 200)));
  const rdAutoDebitEnabled = !["false", "0", "off"].includes(
    String(process.env.RD_AUTO_DEBIT_SCHEDULER_ENABLED || "true")
      .trim()
      .toLowerCase()
  );
  const rdAutoDebitBatchSize = Math.min(500, Math.max(1, Number(process.env.RD_AUTO_DEBIT_BATCH_SIZE || 200)));
  let cycle = 0;

  const runCycle = async () => {
    cycle += 1;
    const todayKey = dayjs().format("YYYY-MM-DD");
    if (todayKey !== lastInterestDateKey) {
      try {
        const eodResult = await runSavingsInterestEod({ forDate: new Date() });
        lastInterestDateKey = todayKey;
        console.log(
          `[core-banking] Interest EOD ${todayKey} processed=${eodResult.processed} posted=${eodResult.posted} skipped=${eodResult.skipped} failed=${eodResult.failed}`
        );
      } catch (error) {
        console.error("[core-banking] Interest EOD failed:", error.message);
      }
    }

    const amlCycleSpan = Math.max(1, Math.round((amlIntervalHours * 60 * 60 * 1000) / intervalMs));
    if (cycle % amlCycleSpan === 0 && !amlRunning) {
      amlRunning = true;
      try {
        const amlResult = await runAmlScan({});
        if (amlResult.createdCount > 0) {
          console.log(`[core-banking] AML scan created ${amlResult.createdCount} alert(s).`);
        }
      } catch (error) {
        console.error("[core-banking] AML scan failed:", error.message);
      } finally {
        amlRunning = false;
      }
    }

    if (autoPublishEnabled) {
      const now = dayjs();
      const todayDateKey = now.format("YYYY-MM-DD");
      const isPublishWindow = now.date() >= autoPublishDay && now.hour() >= autoPublishHour;
      if (isPublishWindow && todayDateKey !== lastRegulatoryPublishCheckDateKey) {
        try {
          const publishResult = await autoPublishMonthlyRegulatoryReport({
            forDate: now.toDate(),
            cashThreshold: autoPublishThreshold,
          });
          if (publishResult.published) {
            console.log(
              `[core-banking] Monthly regulatory report published for ${publishResult.monthKey} via scheduler.`
            );
          }
          if (publishResult.skipped && publishResult.reason === "already_published") {
            console.log(`[core-banking] Monthly regulatory report already published for ${publishResult.monthKey}.`);
          }
          lastRegulatoryPublishCheckDateKey = todayDateKey;
        } catch (error) {
          console.error("[core-banking] Monthly regulatory auto-publish failed:", error.message);
        }
      }
    }

    if (regulatoryMonitorEnabled) {
      const now = dayjs();
      const todayDateKey = now.format("YYYY-MM-DD");
      const monitorReady = now.hour() >= regulatoryMonitorHour;
      if (monitorReady && todayDateKey !== lastRegulatoryMonitorDateKey) {
        try {
          const monitorResult = await runRegulatoryBreachMonitor({
            source: "SCHEDULER_MONITOR",
            monitorDate: now.toDate(),
            cashThreshold: regulatoryMonitorThreshold > 0 ? regulatoryMonitorThreshold : undefined,
            ipAddress: "SYSTEM",
            userAgent: "core-banking-scheduler/regulatory-monitor",
          });
          console.log(
            `[core-banking] Regulatory monitor ${todayDateKey} attention=${monitorResult.attentionIndicators} alertsCreated=${monitorResult.alertsCreated} emailsSent=${monitorResult.emailsSent}`
          );
          lastRegulatoryMonitorDateKey = todayDateKey;
        } catch (error) {
          console.error("[core-banking] Regulatory breach monitor failed:", error.message);
        }
      }
    }

    if (fdAutoRenewEnabled) {
      const now = dayjs();
      const todayDateKey = now.format("YYYY-MM-DD");
      const renewReady = now.hour() >= fdAutoRenewHour;
      if (renewReady && todayDateKey !== lastFdAutoRenewDateKey) {
        try {
          const renewalResult = await runFixedDepositAutoRenewalJob({
            forDate: now.toDate(),
            maxBatch: fdAutoRenewBatchSize,
            source: "SCHEDULER_AUTO_RENEW",
            ipAddress: "SYSTEM",
            userAgent: "core-banking-scheduler/fd-auto-renew",
          });
          console.log(
            `[core-banking] FD auto-renew ${todayDateKey} processed=${renewalResult.processed} renewed=${renewalResult.renewed} skipped=${renewalResult.skipped} failed=${renewalResult.failed}`
          );
          lastFdAutoRenewDateKey = todayDateKey;
        } catch (error) {
          console.error("[core-banking] FD auto-renew scheduler failed:", error.message);
        }
      }
    }

    if (rdAutoDebitEnabled) {
      try {
        const autoDebitResult = await runRecurringDepositAutoDebitEngine({
          forDate: new Date(),
          maxBatch: rdAutoDebitBatchSize,
          source: "SCHEDULER_AUTO_DEBIT",
          ipAddress: "SYSTEM",
          userAgent: "core-banking-scheduler/rd-auto-debit",
        });
        if (autoDebitResult.processed > 0) {
          console.log(
            `[core-banking] RD auto-debit processed=${autoDebitResult.processed} success=${autoDebitResult.succeeded} failed=${autoDebitResult.failed} defaulted=${autoDebitResult.defaulted}`
          );
        }
      } catch (error) {
        console.error("[core-banking] RD auto-debit scheduler failed:", error.message);
      }
    }
  };

  setTimeout(runCycle, 15000);
  schedulerTimer = setInterval(runCycle, intervalMs);
  console.log(
    `[core-banking] Scheduler started. Interval=${intervalMs}ms, AML every ${amlIntervalHours} hour(s), monthly regulatory auto-publish=${autoPublishEnabled}, regulatory breach monitor=${regulatoryMonitorEnabled}, FD auto-renew=${fdAutoRenewEnabled}, RD auto-debit=${rdAutoDebitEnabled}.`
  );
};

const stopCoreBankingScheduler = () => {
  if (!schedulerTimer) return;
  clearInterval(schedulerTimer);
  schedulerTimer = null;
  lastRegulatoryPublishCheckDateKey = "";
  lastRegulatoryMonitorDateKey = "";
  lastFdAutoRenewDateKey = "";
};

module.exports = {
  startCoreBankingScheduler,
  stopCoreBankingScheduler,
};
