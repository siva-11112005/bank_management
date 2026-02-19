const { processDueStandingInstructions } = require("../controllers/transactionController");

let schedulerTimer = null;

const startStandingInstructionScheduler = () => {
  const enabled = String(process.env.STANDING_INSTRUCTION_PROCESSOR_ENABLED || "true")
    .trim()
    .toLowerCase();

  if (enabled === "false" || enabled === "0" || enabled === "off") {
    console.log("Standing instruction scheduler is disabled by configuration.");
    return;
  }

  const intervalMs = Math.max(15000, Number(process.env.STANDING_INSTRUCTION_PROCESS_INTERVAL_MS || 60000));
  const batchLimit = Math.max(1, Number(process.env.STANDING_INSTRUCTION_BATCH_LIMIT || 25));

  const runCycle = async () => {
    try {
      const result = await processDueStandingInstructions({ limit: batchLimit });
      if (result.processed > 0) {
        console.log(
          `Standing instruction cycle: processed=${result.processed}, success=${result.successCount}, failed=${result.failedCount}`
        );
      }
    } catch (error) {
      console.error("Standing instruction scheduler error:", error.message);
    }
  };

  setTimeout(runCycle, 10000);
  schedulerTimer = setInterval(runCycle, intervalMs);
  console.log(`Standing instruction scheduler started. Interval: ${intervalMs}ms, batch limit: ${batchLimit}`);
};

module.exports = {
  startStandingInstructionScheduler,
  stopStandingInstructionScheduler: () => {
    if (schedulerTimer) {
      clearInterval(schedulerTimer);
      schedulerTimer = null;
    }
  },
};
