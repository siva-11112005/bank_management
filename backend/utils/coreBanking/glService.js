const GLAccount = require("../../models/GLAccount");
const GLJournal = require("../../models/GLJournal");

const round2 = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const defaultChart = [
  {
    code: "100100",
    name: "Cash and Bank Balances",
    accountType: "ASSET",
    normalSide: "DEBIT",
    description: "Cash, settlement balances, and operating bank balances.",
  },
  {
    code: "110100",
    name: "Loan Portfolio",
    accountType: "ASSET",
    normalSide: "DEBIT",
    description: "Outstanding principal receivable from loans.",
  },
  {
    code: "200100",
    name: "Customer Deposits Liability",
    accountType: "LIABILITY",
    normalSide: "CREDIT",
    description: "Customer CASA balances and payable deposit obligations.",
  },
  {
    code: "200200",
    name: "Term Deposits Liability",
    accountType: "LIABILITY",
    normalSide: "CREDIT",
    description: "Fixed deposit payable balances.",
  },
  {
    code: "200300",
    name: "Recurring Deposits Liability",
    accountType: "LIABILITY",
    normalSide: "CREDIT",
    description: "Recurring deposit payable balances.",
  },
  {
    code: "300100",
    name: "Retained Earnings",
    accountType: "EQUITY",
    normalSide: "CREDIT",
    description: "Accumulated retained earnings.",
  },
  {
    code: "400100",
    name: "Loan Interest Income",
    accountType: "INCOME",
    normalSide: "CREDIT",
    description: "Interest income earned from retail and business loans.",
  },
  {
    code: "400200",
    name: "Fee and Charges Income",
    accountType: "INCOME",
    normalSide: "CREDIT",
    description: "Fee and charges collected from banking operations.",
  },
  {
    code: "500100",
    name: "Savings Interest Expense",
    accountType: "EXPENSE",
    normalSide: "DEBIT",
    description: "Interest expense accrued on savings and deposit products.",
  },
];

const createJournalNumber = () => `JRN-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

const sanitizeLine = (line = {}) => ({
  accountCode: String(line.accountCode || "").trim().toUpperCase(),
  debit: round2(line.debit),
  credit: round2(line.credit),
  narration: String(line.narration || "").trim(),
});

const normalizeAsOfDate = (value) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return new Date();
  }
  return date;
};

const buildAccountIndex = (accounts = []) => {
  const map = new Map();
  accounts.forEach((entry) => {
    map.set(String(entry.code || "").toUpperCase(), entry);
  });
  return map;
};

const getSignedBalanceFromNormal = (normalSide, debit, credit) => {
  const safeDebit = round2(debit);
  const safeCredit = round2(credit);
  if (normalSide === "DEBIT") return round2(safeDebit - safeCredit);
  return round2(safeCredit - safeDebit);
};

const computeLineDelta = ({ normalSide, debit, credit }) => {
  if (normalSide === "DEBIT") return round2(debit - credit);
  return round2(credit - debit);
};

const ensureDefaultChartOfAccounts = async () => {
  const existing = await GLAccount.find({ code: { $in: defaultChart.map((entry) => entry.code) } }).select("code");
  const existingCodes = new Set(existing.map((entry) => entry.code));
  const missing = defaultChart.filter((entry) => !existingCodes.has(entry.code));
  if (!missing.length) return { created: 0, totalDefaults: defaultChart.length };
  await GLAccount.insertMany(missing);
  return { created: missing.length, totalDefaults: defaultChart.length };
};

const postJournal = async ({
  description,
  lines = [],
  referenceType = "",
  referenceId = null,
  source = "SYSTEM",
  metadata = {},
  postingDate = new Date(),
  session = null,
}) => {
  const normalizedLines = lines.map(sanitizeLine).filter((entry) => entry.accountCode && (entry.debit > 0 || entry.credit > 0));
  if (normalizedLines.length < 2) {
    throw new Error("At least two GL lines are required.");
  }

  const totalDebit = round2(normalizedLines.reduce((sum, entry) => sum + Number(entry.debit || 0), 0));
  const totalCredit = round2(normalizedLines.reduce((sum, entry) => sum + Number(entry.credit || 0), 0));
  if (totalDebit <= 0 || totalCredit <= 0 || totalDebit !== totalCredit) {
    throw new Error("GL journal is not balanced.");
  }

  const accountCodes = normalizedLines.map((entry) => entry.accountCode);
  const accountDocs = await GLAccount.find({ code: { $in: accountCodes }, isActive: true }, null, session ? { session } : undefined);
  const accountIndex = buildAccountIndex(accountDocs);

  const missingCodes = accountCodes.filter((code) => !accountIndex.has(code));
  if (missingCodes.length) {
    throw new Error(`Missing GL account codes: ${missingCodes.join(", ")}`);
  }

  const journalLines = normalizedLines.map((entry) => {
    const account = accountIndex.get(entry.accountCode);
    return {
      accountCode: account.code,
      accountName: account.name,
      debit: round2(entry.debit),
      credit: round2(entry.credit),
      narration: entry.narration || description,
    };
  });

  const journalPayload = {
    journalNumber: createJournalNumber(),
    postingDate: normalizeAsOfDate(postingDate),
    description: String(description || "").trim(),
    source: String(source || "SYSTEM").trim() || "SYSTEM",
    referenceType: String(referenceType || "").trim(),
    referenceId: referenceId || null,
    totalDebit,
    totalCredit,
    lines: journalLines,
    metadata: metadata || {},
  };

  const journal = session
    ? await GLJournal.create([journalPayload], { session }).then((items) => items[0])
    : await GLJournal.create(journalPayload);

  for (const line of journalLines) {
    const account = accountIndex.get(line.accountCode);
    const delta = computeLineDelta({
      normalSide: account.normalSide,
      debit: Number(line.debit || 0),
      credit: Number(line.credit || 0),
    });
    account.currentBalance = round2(Number(account.currentBalance || 0) + delta);
    await account.save(session ? { session } : undefined);
  }

  return journal;
};

const getTrialBalance = async ({ asOfDate } = {}) => {
  const asOf = normalizeAsOfDate(asOfDate);
  const accounts = await GLAccount.find({ isActive: true }).sort({ code: 1 });
  const journals = await GLJournal.find({
    status: "POSTED",
    postingDate: { $lte: asOf },
  }).select("lines");

  const sums = new Map();
  journals.forEach((journal) => {
    (journal.lines || []).forEach((line) => {
      const key = String(line.accountCode || "").toUpperCase();
      const existing = sums.get(key) || { debit: 0, credit: 0 };
      existing.debit = round2(existing.debit + Number(line.debit || 0));
      existing.credit = round2(existing.credit + Number(line.credit || 0));
      sums.set(key, existing);
    });
  });

  let totalDebit = 0;
  let totalCredit = 0;
  const rows = accounts.map((account) => {
    const aggregate = sums.get(account.code) || { debit: 0, credit: 0 };
    const signedBalance = getSignedBalanceFromNormal(account.normalSide, aggregate.debit, aggregate.credit);
    const debitBalance = signedBalance > 0 ? round2(signedBalance) : 0;
    const creditBalance = signedBalance < 0 ? round2(Math.abs(signedBalance)) : 0;
    totalDebit = round2(totalDebit + debitBalance);
    totalCredit = round2(totalCredit + creditBalance);
    return {
      code: account.code,
      name: account.name,
      accountType: account.accountType,
      normalSide: account.normalSide,
      debit: round2(aggregate.debit),
      credit: round2(aggregate.credit),
      debitBalance,
      creditBalance,
    };
  });

  return {
    asOfDate: asOf.toISOString(),
    rows,
    totalDebitBalance: totalDebit,
    totalCreditBalance: totalCredit,
    balanced: totalDebit === totalCredit,
  };
};

const getProfitAndLoss = async ({ fromDate, toDate } = {}) => {
  const from = normalizeAsOfDate(fromDate || new Date(new Date().getFullYear(), 0, 1));
  const to = normalizeAsOfDate(toDate || new Date());
  const accounts = await GLAccount.find({ accountType: { $in: ["INCOME", "EXPENSE"] }, isActive: true }).sort({ code: 1 });
  const journals = await GLJournal.find({
    status: "POSTED",
    postingDate: { $gte: from, $lte: to },
  }).select("lines");
  const sums = new Map();
  journals.forEach((journal) => {
    (journal.lines || []).forEach((line) => {
      const key = String(line.accountCode || "").toUpperCase();
      const existing = sums.get(key) || { debit: 0, credit: 0 };
      existing.debit = round2(existing.debit + Number(line.debit || 0));
      existing.credit = round2(existing.credit + Number(line.credit || 0));
      sums.set(key, existing);
    });
  });

  let totalIncome = 0;
  let totalExpense = 0;
  const rows = accounts.map((account) => {
    const aggregate = sums.get(account.code) || { debit: 0, credit: 0 };
    const amount =
      account.accountType === "INCOME"
        ? round2(aggregate.credit - aggregate.debit)
        : round2(aggregate.debit - aggregate.credit);
    if (account.accountType === "INCOME") totalIncome = round2(totalIncome + amount);
    if (account.accountType === "EXPENSE") totalExpense = round2(totalExpense + amount);
    return {
      code: account.code,
      name: account.name,
      accountType: account.accountType,
      amount,
    };
  });

  return {
    fromDate: from.toISOString(),
    toDate: to.toISOString(),
    rows,
    totalIncome,
    totalExpense,
    netProfit: round2(totalIncome - totalExpense),
  };
};

const getBalanceSheet = async ({ asOfDate } = {}) => {
  const trial = await getTrialBalance({ asOfDate });
  const accounts = await GLAccount.find({ isActive: true }).sort({ code: 1 });
  const accountTypeByCode = new Map(accounts.map((entry) => [entry.code, entry.accountType]));

  const assets = [];
  const liabilities = [];
  const equity = [];
  let assetsTotal = 0;
  let liabilitiesTotal = 0;
  let equityTotal = 0;

  trial.rows.forEach((row) => {
    const accountType = accountTypeByCode.get(row.code);
    const value = round2(Number(row.debitBalance || 0) - Number(row.creditBalance || 0));
    if (accountType === "ASSET") {
      assets.push({ ...row, value });
      assetsTotal = round2(assetsTotal + value);
      return;
    }
    if (accountType === "LIABILITY") {
      const amount = round2(Math.abs(value));
      liabilities.push({ ...row, value: amount });
      liabilitiesTotal = round2(liabilitiesTotal + amount);
      return;
    }
    if (accountType === "EQUITY") {
      const amount = round2(Math.abs(value));
      equity.push({ ...row, value: amount });
      equityTotal = round2(equityTotal + amount);
    }
  });

  return {
    asOfDate: trial.asOfDate,
    assets,
    liabilities,
    equity,
    assetsTotal,
    liabilitiesTotal,
    equityTotal,
    liabilitiesAndEquityTotal: round2(liabilitiesTotal + equityTotal),
  };
};

const postCustomerDepositJournal = async ({ amount, referenceType = "DEPOSIT", referenceId = null, metadata = {}, session = null }) =>
  postJournal({
    description: "Customer deposit",
    source: "CORE_BANKING",
    referenceType,
    referenceId,
    metadata,
    session,
    lines: [
      { accountCode: "100100", debit: amount, credit: 0, narration: "Cash/Bank increased" },
      { accountCode: "200100", debit: 0, credit: amount, narration: "Customer deposit liability increased" },
    ],
  });

const postCustomerWithdrawalJournal = async ({ amount, referenceType = "WITHDRAWAL", referenceId = null, metadata = {}, session = null }) =>
  postJournal({
    description: "Customer withdrawal",
    source: "CORE_BANKING",
    referenceType,
    referenceId,
    metadata,
    session,
    lines: [
      { accountCode: "200100", debit: amount, credit: 0, narration: "Customer deposit liability reduced" },
      { accountCode: "100100", debit: 0, credit: amount, narration: "Cash/Bank reduced" },
    ],
  });

const postLoanDisbursalJournal = async ({ amount, referenceType = "LOAN_DISBURSAL", referenceId = null, metadata = {}, session = null }) =>
  postJournal({
    description: "Loan disbursal to customer account",
    source: "CORE_BANKING",
    referenceType,
    referenceId,
    metadata,
    session,
    lines: [
      { accountCode: "110100", debit: amount, credit: 0, narration: "Loan portfolio increased" },
      { accountCode: "200100", debit: 0, credit: amount, narration: "Customer deposit liability increased" },
    ],
  });

const postLoanRepaymentJournal = async ({ amount, referenceType = "LOAN_PAYMENT", referenceId = null, metadata = {}, session = null }) =>
  postJournal({
    description: "Loan repayment from customer account",
    source: "CORE_BANKING",
    referenceType,
    referenceId,
    metadata,
    session,
    lines: [
      { accountCode: "200100", debit: amount, credit: 0, narration: "Customer deposit liability reduced" },
      { accountCode: "110100", debit: 0, credit: amount, narration: "Loan portfolio reduced" },
    ],
  });

const postSavingsInterestJournal = async ({ amount, referenceType = "INTEREST_ACCRUAL", referenceId = null, metadata = {}, session = null }) =>
  postJournal({
    description: "Savings interest accrual",
    source: "INTEREST_ENGINE",
    referenceType,
    referenceId,
    metadata,
    session,
    lines: [
      { accountCode: "500100", debit: amount, credit: 0, narration: "Savings interest expense accrued" },
      { accountCode: "200100", debit: 0, credit: amount, narration: "Customer deposit liability increased" },
    ],
  });

const postFixedDepositBookingJournal = async ({ amount, referenceType = "FD_BOOKING", referenceId = null, metadata = {}, session = null }) =>
  postJournal({
    description: "Fixed deposit booking from CASA",
    source: "CORE_BANKING",
    referenceType,
    referenceId,
    metadata,
    session,
    lines: [
      { accountCode: "200100", debit: amount, credit: 0, narration: "CASA liability reduced for FD booking" },
      { accountCode: "200200", debit: 0, credit: amount, narration: "Term deposit liability increased" },
    ],
  });

const postFixedDepositClosureJournal = async ({
  principalAmount,
  interestAmount,
  payoutAmount,
  referenceType = "FD_CLOSURE",
  referenceId = null,
  metadata = {},
  session = null,
}) =>
  postJournal({
    description: "Fixed deposit closure and payout",
    source: "CORE_BANKING",
    referenceType,
    referenceId,
    metadata,
    session,
    lines: [
      { accountCode: "200200", debit: principalAmount, credit: 0, narration: "Term deposit liability settled" },
      { accountCode: "500100", debit: interestAmount, credit: 0, narration: "FD interest expense recognized" },
      { accountCode: "200100", debit: 0, credit: payoutAmount, narration: "CASA liability credited with FD payout" },
    ],
  });

const postFixedDepositRenewalJournal = async ({
  interestAmount,
  referenceType = "FD_RENEWAL",
  referenceId = null,
  metadata = {},
  session = null,
}) =>
  postJournal({
    description: "Fixed deposit auto-renewal interest capitalization",
    source: "CORE_BANKING",
    referenceType,
    referenceId,
    metadata,
    session,
    lines: [
      { accountCode: "500100", debit: interestAmount, credit: 0, narration: "FD interest expense recognized on renewal" },
      { accountCode: "200200", debit: 0, credit: interestAmount, narration: "Term deposit liability increased via renewal" },
    ],
  });

const postRecurringDepositInstallmentJournal = async ({
  amount,
  referenceType = "RD_INSTALLMENT",
  referenceId = null,
  metadata = {},
  session = null,
}) =>
  postJournal({
    description: "Recurring deposit installment booking",
    source: "CORE_BANKING",
    referenceType,
    referenceId,
    metadata,
    session,
    lines: [
      { accountCode: "200100", debit: amount, credit: 0, narration: "CASA liability reduced for RD installment" },
      { accountCode: "200300", debit: 0, credit: amount, narration: "Recurring deposit liability increased" },
    ],
  });

const postRecurringDepositClosureJournal = async ({
  principalAmount,
  interestAmount,
  payoutAmount,
  referenceType = "RD_CLOSURE",
  referenceId = null,
  metadata = {},
  session = null,
}) =>
  postJournal({
    description: "Recurring deposit closure and payout",
    source: "CORE_BANKING",
    referenceType,
    referenceId,
    metadata,
    session,
    lines: [
      { accountCode: "200300", debit: principalAmount, credit: 0, narration: "Recurring deposit liability settled" },
      { accountCode: "500100", debit: interestAmount, credit: 0, narration: "RD interest expense recognized" },
      { accountCode: "200100", debit: 0, credit: payoutAmount, narration: "CASA liability credited with RD payout" },
    ],
  });

module.exports = {
  round2,
  defaultChart,
  ensureDefaultChartOfAccounts,
  postJournal,
  getTrialBalance,
  getProfitAndLoss,
  getBalanceSheet,
  postCustomerDepositJournal,
  postCustomerWithdrawalJournal,
  postLoanDisbursalJournal,
  postLoanRepaymentJournal,
  postSavingsInterestJournal,
  postFixedDepositBookingJournal,
  postFixedDepositClosureJournal,
  postFixedDepositRenewalJournal,
  postRecurringDepositInstallmentJournal,
  postRecurringDepositClosureJournal,
};
