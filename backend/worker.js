const dotenv = require("dotenv");
const connectDB = require("./config/db");
const { bootstrapAdminIdentities } = require("./utils/adminBootstrap");
const { startStandingInstructionScheduler } = require("./utils/standingInstructionScheduler");
const { startCoreBankingScheduler } = require("./utils/coreBanking/coreBankingScheduler");
const { ensureDefaultChartOfAccounts } = require("./utils/coreBanking/glService");
const { refreshMoneyOutPolicyCache } = require("./utils/moneyOutPolicy");
const { refreshRegulatoryPolicyCache } = require("./utils/regulatoryPolicy");

dotenv.config();

const startWorker = async () => {
  await connectDB();
  await bootstrapAdminIdentities();
  await ensureDefaultChartOfAccounts();
  await refreshMoneyOutPolicyCache();
  await refreshRegulatoryPolicyCache();

  startStandingInstructionScheduler();
  startCoreBankingScheduler();

  console.log("Worker process started: standing instructions + core banking schedulers are running.");
};

startWorker().catch((error) => {
  console.error("Worker startup failed:", error?.message || error);
  process.exit(1);
});
