const mongoose = require("mongoose");
const dayjs = require("dayjs");
const Account = require("../../models/Account");
const Transaction = require("../../models/Transaction");
const LedgerEntry = require("../../models/LedgerEntry");
const InterestAccrual = require("../../models/InterestAccrual");
const { postSavingsInterestJournal, round2 } = require("./glService");

const getSavingsAnnualRate = () => {
  const parsed = Number(process.env.SAVINGS_INTEREST_ANNUAL_RATE || 3.5);
  if (!Number.isFinite(parsed) || parsed < 0) return 3.5;
  return parsed;
};

const toDateKey = (value) => dayjs(value).format("YYYY-MM-DD");

const runSavingsInterestEod = async ({ forDate = new Date() } = {}) => {
  const postingDate = dayjs(forDate).startOf("day");
  const dateKey = toDateKey(postingDate);
  const annualRate = getSavingsAnnualRate();

  const accounts = await Account.find({
    accountType: "SAVINGS",
    status: "ACTIVE",
    balance: { $gt: 0 },
  }).select("_id userId balance accountNumber");

  let processed = 0;
  let posted = 0;
  let skipped = 0;
  let failed = 0;
  const details = [];

  for (const account of accounts) {
    processed += 1;

    const existingAccrual = await InterestAccrual.findOne({ accountId: account._id, dateKey });
    if (existingAccrual) {
      skipped += 1;
      details.push({
        accountId: account._id,
        accountNumber: account.accountNumber,
        status: "SKIPPED",
        reason: "Already accrued for this date.",
      });
      continue;
    }

    const balanceSnapshot = Number(account.balance || 0);
    const interestAmount = round2((balanceSnapshot * annualRate) / 36500);

    if (!Number.isFinite(interestAmount) || interestAmount <= 0) {
      skipped += 1;
      await InterestAccrual.create({
        accountId: account._id,
        userId: account.userId,
        dateKey,
        annualRate,
        balanceSnapshot,
        interestAmount: 0,
        status: "SKIPPED",
        reason: "Insufficient interest amount after rounding.",
      });
      details.push({
        accountId: account._id,
        accountNumber: account.accountNumber,
        status: "SKIPPED",
        reason: "Rounded interest is zero.",
      });
      continue;
    }

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const lockedAccount = await Account.findById(account._id).session(session);
      if (!lockedAccount || lockedAccount.status !== "ACTIVE") {
        throw new Error("Account unavailable for interest posting.");
      }

      lockedAccount.balance = round2(Number(lockedAccount.balance || 0) + interestAmount);
      await lockedAccount.save({ session });

      const tx = await Transaction.create(
        [
          {
            accountId: lockedAccount._id,
            userId: lockedAccount.userId,
            type: "INTEREST_CREDIT",
            amount: interestAmount,
            description: `Savings interest accrual (${dateKey})`,
            status: "SUCCESS",
            balanceAfterTransaction: lockedAccount.balance,
          },
        ],
        { session }
      );

      await LedgerEntry.create(
        [
          {
            accountId: lockedAccount._id,
            transactionId: tx[0]._id,
            type: "CREDIT",
            amount: interestAmount,
            balanceAfter: lockedAccount.balance,
            description: `Savings interest accrual (${dateKey})`,
          },
        ],
        { session }
      );

      const journal = await postSavingsInterestJournal({
        amount: interestAmount,
        referenceType: "INTEREST_ACCRUAL",
        referenceId: tx[0]._id,
        metadata: {
          accountId: lockedAccount._id,
          accountNumber: lockedAccount.accountNumber,
          userId: lockedAccount.userId,
          dateKey,
        },
        session,
      });

      await InterestAccrual.create(
        [
          {
            accountId: lockedAccount._id,
            userId: lockedAccount.userId,
            dateKey,
            annualRate,
            balanceSnapshot,
            interestAmount,
            status: "POSTED",
            transactionId: tx[0]._id,
            glJournalId: journal._id,
          },
        ],
        { session }
      );

      await session.commitTransaction();
      posted += 1;
      details.push({
        accountId: lockedAccount._id,
        accountNumber: lockedAccount.accountNumber,
        status: "POSTED",
        interestAmount,
      });
    } catch (error) {
      await session.abortTransaction();
      failed += 1;
      await InterestAccrual.create({
        accountId: account._id,
        userId: account.userId,
        dateKey,
        annualRate,
        balanceSnapshot,
        interestAmount: Math.max(0, interestAmount),
        status: "FAILED",
        reason: String(error.message || "Interest posting failed"),
      });
      details.push({
        accountId: account._id,
        accountNumber: account.accountNumber,
        status: "FAILED",
        reason: String(error.message || "Interest posting failed"),
      });
    } finally {
      session.endSession();
    }
  }

  return {
    dateKey,
    annualRate,
    processed,
    posted,
    skipped,
    failed,
    details,
  };
};

module.exports = {
  runSavingsInterestEod,
  getSavingsAnnualRate,
};
