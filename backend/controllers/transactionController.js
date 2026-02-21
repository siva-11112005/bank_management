const mongoose = require("mongoose");
const Transaction = require("../models/Transaction");
const Account = require("../models/Account");
const User = require("../models/User");
const Otp = require("../models/Otp");
const PDFDocument = require("pdfkit");
const dayjs = require("dayjs");
const LedgerEntry = require("../models/LedgerEntry");
const Beneficiary = require("../models/Beneficiary");
const AuditLog = require("../models/AuditLog");
const StandingInstruction = require("../models/StandingInstruction");
const ApprovalRequest = require("../models/ApprovalRequest");
const { verifyTransactionPin } = require("../utils/transactionPin");
const { sendOtpEmail, isEmailConfigured, getEmailFailureHint } = require("../utils/emailService");
const { generateOtp, normalizeOtpCode, isValidOtpCode, hashOtpCode } = require("../utils/otpUtils");
const { getMoneyOutPolicy, getUserDailyTotal } = require("../utils/moneyOutPolicy");
const { isApprovalRequired } = require("../utils/adminApprovalPolicy");
const { createNotification, createNotifications } = require("../utils/notificationService");
const { postCustomerDepositJournal, postCustomerWithdrawalJournal } = require("../utils/coreBanking/glService");

const maskAccountNumber = (value = "") => {
  const account = String(value);
  if (account.length <= 4) return account;
  return `${"*".repeat(account.length - 4)}${account.slice(-4)}`;
};
const normalizeAccountNumber = (value = "") => String(value || "").trim().replace(/\s+/g, "").toUpperCase();

const formatRupee = (value) => `Rs ${Number(value || 0).toFixed(2)}`;
const formatStatementAmount = (value) =>
  `Rs ${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
const canUseEmailOtpFallback = () => {
  const configured = process.env.ALLOW_EMAIL_OTP_FALLBACK;
  if (configured === undefined || configured === null || configured === "") {
    return String(process.env.NODE_ENV || "development").toLowerCase() !== "production";
  }
  return String(configured).toLowerCase() === "true";
};
const shouldExposeFallbackOtpCode = () =>
  String(process.env.NODE_ENV || "development").toLowerCase() !== "production" ||
  String(process.env.ALLOW_EMAIL_OTP_FALLBACK || "").toLowerCase() === "true";

const inferLegacyLedgerType = (transaction = {}) => {
  const txType = String(transaction.type || "").toUpperCase();
  const desc = String(transaction.description || "").trim();

  if (
    txType === "DEPOSIT" ||
    txType === "PAYMENT_CREDIT" ||
    txType === "INTEREST_CREDIT" ||
    txType === "LOAN_DISBURSAL" ||
    txType === "FD_CLOSURE" ||
    txType === "RD_CLOSURE"
  )
    return "CREDIT";
  if (txType === "WITHDRAWAL" || txType === "LOAN_PAYMENT" || txType === "PAYMENT_REFUND" || txType === "FD_BOOKING" || txType === "RD_INSTALLMENT")
    return "DEBIT";
  if (txType === "TRANSFER") return /^received from/i.test(desc) ? "CREDIT" : "DEBIT";
  return "DEBIT";
};

const statementTypeLabel = (transactionType = "", direction = "", description = "") => {
  const txType = String(transactionType || "").toUpperCase();
  if (txType === "DEPOSIT") return "Deposit";
  if (txType === "WITHDRAWAL") return "Withdrawal";
  if (txType === "LOAN_DISBURSAL") return "Loan Disbursal";
  if (txType === "LOAN_PAYMENT") return "Loan EMI";
  if (txType === "PAYMENT_CREDIT") return "Payment Credit";
  if (txType === "PAYMENT_REFUND") return "Payment Refund";
  if (txType === "INTEREST_CREDIT") return "Interest Credit";
  if (txType === "FD_BOOKING") return "FD Booking";
  if (txType === "FD_CLOSURE") return "FD Closure";
  if (txType === "RD_INSTALLMENT") return "RD Installment";
  if (txType === "RD_CLOSURE") return "RD Closure";
  if (txType === "TRANSFER") {
    return direction === "CREDIT" || /^received from/i.test(String(description || "")) ? "Transfer In" : "Transfer Out";
  }
  return txType || "Transaction";
};

// Create transaction
const createTransaction = async (
  accountId,
  userId,
  type,
  amount,
  description,
  balanceAfter,
  recipientAccountId = null,
  recipientName = "",
  session = null
) => {
  const transaction = new Transaction({
    accountId,
    userId,
    type,
    amount,
    description,
    balanceAfterTransaction: balanceAfter,
    recipientAccountId,
    recipientName,
    status: "SUCCESS",
  });

  return await transaction.save(session ? { session } : undefined);
};

const getNextInstructionRunAt = ({ fromDate = new Date(), frequency = "MONTHLY" }) => {
  const start = dayjs(fromDate);
  if (frequency === "DAILY") return start.add(1, "day").toDate();
  if (frequency === "WEEKLY") return start.add(1, "week").toDate();
  return start.add(1, "month").toDate();
};

const resolveStandingStartDate = (value) => {
  if (value === undefined || value === null || String(value).trim() === "") {
    return dayjs().startOf("day");
  }
  const parsed = dayjs(value);
  if (!parsed.isValid()) {
    return null;
  }
  return parsed.startOf("day");
};

const resolveTransferErrorStatus = (message = "") => {
  const text = String(message || "").toLowerCase();
  if (text.includes("not found")) return 404;
  if (
    text.includes("insufficient") ||
    text.includes("invalid") ||
    text.includes("cannot") ||
    text.includes("inactive") ||
    text.includes("limit") ||
    text.includes("verified beneficiary")
  ) {
    return 400;
  }
  return 500;
};

const buildPinFailurePayload = (pinCheck = {}) => ({
  success: false,
  message: pinCheck.message || "Transaction PIN verification failed.",
  ...(pinCheck.attemptsLeft !== undefined ? { attemptsLeft: pinCheck.attemptsLeft } : {}),
  ...(pinCheck.lockedUntil ? { lockedUntil: pinCheck.lockedUntil } : {}),
});

const parsePositiveInt = (value, fallback, { min = 1, max = 500 } = {}) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

const parseDateOrNull = (value, { endOfDay = false } = {}) => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  let date = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    date = new Date(`${raw}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  } else {
    date = new Date(raw);
  }
  return Number.isNaN(date.getTime()) ? null : date;
};

const executeStandingInstructionTransfer = async ({
  instructionId,
  initiatedBy = "SYSTEM",
  requestMeta = {},
  keepPausedStatus = false,
}) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  let senderAccount;
  let recipientAccount;
  let senderUser;
  let recipientUser;
  let senderTx;
  let recipientTx;
  let instructionSnapshot;

  try {
    const instruction = await StandingInstruction.findById(instructionId).session(session);
    if (!instruction) {
      throw new Error("Standing instruction not found.");
    }

    instructionSnapshot = instruction;

    if (instruction.status === "CANCELLED" || instruction.status === "COMPLETED") {
      throw new Error("Standing instruction is not executable.");
    }

    const transferAmount = Number(instruction.amount || 0);
    if (!Number.isFinite(transferAmount) || transferAmount <= 0) {
      throw new Error("Invalid instruction amount.");
    }

    const policy = getMoneyOutPolicy();
    if (transferAmount > policy.maxSingleTransfer) {
      throw new Error(`Single transfer limit is ${formatRupee(policy.maxSingleTransfer)}.`);
    }

    const todayTransfer = await getUserDailyTotal({ userId: instruction.userId, type: "TRANSFER" });
    if (todayTransfer + transferAmount > policy.dailyTransferLimit) {
      const remaining = Math.max(0, policy.dailyTransferLimit - todayTransfer);
      throw new Error(`Daily transfer limit exceeded. Remaining today: ${formatRupee(remaining)}.`);
    }

    senderAccount = await Account.findById(instruction.accountId).session(session);
    if (!senderAccount) {
      throw new Error("Sender account not found.");
    }
    if (senderAccount.status !== "ACTIVE") {
      throw new Error("Sender account is not active.");
    }
    if (senderAccount.balance < transferAmount) {
      throw new Error("Insufficient balance.");
    }

    if (senderAccount.accountNumber === instruction.recipientAccountNumber) {
      throw new Error("Cannot transfer to the same account.");
    }

    const beneficiary = await Beneficiary.findOne({
      userId: instruction.userId,
      accountNumber: instruction.recipientAccountNumber,
      verified: true,
    }).session(session);
    if (!beneficiary) {
      throw new Error("Recipient is not a verified beneficiary.");
    }

    recipientAccount = await Account.findOne({ accountNumber: instruction.recipientAccountNumber }).session(session);
    if (!recipientAccount) {
      throw new Error("Recipient account not found.");
    }
    if (recipientAccount.status !== "ACTIVE") {
      throw new Error("Recipient account is not active.");
    }

    senderUser = await User.findById(instruction.userId).session(session);
    recipientUser = await User.findById(recipientAccount.userId).session(session);
    const senderDisplayName = `${senderUser?.firstName || ""} ${senderUser?.lastName || ""}`.trim();
    const recipientDisplayName = `${recipientUser?.firstName || ""} ${recipientUser?.lastName || ""}`.trim();

    senderAccount.balance -= transferAmount;
    recipientAccount.balance += transferAmount;
    await senderAccount.save({ session });
    await recipientAccount.save({ session });

    const senderNarration = instruction.description || `Standing instruction transfer`;
    senderTx = await createTransaction(
      senderAccount._id,
      instruction.userId,
      "TRANSFER",
      transferAmount,
      senderNarration,
      senderAccount.balance,
      recipientAccount._id,
      recipientDisplayName,
      session
    );
    recipientTx = await createTransaction(
      recipientAccount._id,
      recipientAccount.userId,
      "TRANSFER",
      transferAmount,
      `Received from ${senderDisplayName || "BankIndia customer"}`,
      recipientAccount.balance,
      senderAccount._id,
      senderDisplayName,
      session
    );

    await LedgerEntry.create(
      [
        {
          accountId: senderAccount._id,
          transactionId: senderTx._id,
          type: "DEBIT",
          amount: transferAmount,
          balanceAfter: senderAccount.balance,
          description: senderNarration,
        },
        {
          accountId: recipientAccount._id,
          transactionId: recipientTx._id,
          type: "CREDIT",
          amount: transferAmount,
          balanceAfter: recipientAccount.balance,
          description: `Received from ${senderDisplayName || "BankIndia customer"}`,
        },
      ],
      { session }
    );

    instruction.lastAttemptAt = new Date();
    instruction.lastRunAt = new Date();
    instruction.lastExecutionStatus = "SUCCESS";
    instruction.lastFailureReason = "";
    instruction.failureCount = 0;
    instruction.executedCount = Number(instruction.executedCount || 0) + 1;
    instruction.isProcessing = false;

    const maxExecutions = Number(instruction.maxExecutions || 0);
    const reachedMax = maxExecutions > 0 && instruction.executedCount >= maxExecutions;
    if (reachedMax) {
      instruction.status = "COMPLETED";
    } else if (instruction.status === "PAUSED" && keepPausedStatus) {
      instruction.status = "PAUSED";
    } else {
      instruction.status = "ACTIVE";
    }
    instruction.nextRunAt = reachedMax ? null : getNextInstructionRunAt({ fromDate: new Date(), frequency: instruction.frequency });

    await instruction.save({ session });
    await session.commitTransaction();
    session.endSession();

    try {
      await createNotifications([
        {
          userId: instruction.userId,
          title: "Standing Instruction Executed",
          message: `${formatRupee(transferAmount)} sent to ${maskAccountNumber(
            recipientAccount.accountNumber
          )} via scheduled transfer.`,
          category: "TRANSACTION",
          type: "SUCCESS",
          actionLink: "/transactions",
          metadata: { instructionId: instruction._id, transactionId: senderTx._id },
        },
        {
          userId: recipientAccount.userId,
          title: "Amount Received",
          message: `${formatRupee(transferAmount)} received from ${senderDisplayName || "BankIndia customer"} via standing instruction.`,
          category: "TRANSACTION",
          type: "INFO",
          actionLink: "/transactions",
          metadata: { instructionId: instruction._id, transactionId: recipientTx._id },
        },
      ]);
    } catch (_) {}

    try {
      await AuditLog.create({
        userId: instruction.userId,
        action: "STANDING_INSTRUCTION_EXECUTED",
        ipAddress: requestMeta.ipAddress || "system",
        userAgent: requestMeta.userAgent || "system",
        metadata: {
          instructionId: instruction._id,
          initiatedBy,
          amount: transferAmount,
          recipientAccountNumber: instruction.recipientAccountNumber,
        },
      });
    } catch (_) {}

    return {
      success: true,
      instructionId: String(instruction._id),
      senderBalance: senderAccount.balance,
      recipientName: recipientUser ? `${recipientUser.firstName || ""} ${recipientUser.lastName || ""}`.trim() : "",
    };
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    if (instructionSnapshot?._id) {
      try {
        const failedInstruction = await StandingInstruction.findById(instructionSnapshot._id);
        if (failedInstruction) {
          failedInstruction.isProcessing = false;
          failedInstruction.lastAttemptAt = new Date();
          failedInstruction.lastExecutionStatus = "FAILED";
          failedInstruction.lastFailureReason = String(error.message || "Execution failed").slice(0, 300);
          failedInstruction.failureCount = Number(failedInstruction.failureCount || 0) + 1;
          if (failedInstruction.failureCount >= 3 && failedInstruction.status === "ACTIVE") {
            failedInstruction.status = "PAUSED";
          }
          await failedInstruction.save();
          if (failedInstruction.failureCount >= 3 && failedInstruction.status === "PAUSED") {
            try {
              await createNotification({
                userId: failedInstruction.userId,
                title: "Standing Instruction Paused",
                message: "Your standing instruction was paused after repeated execution failures. Please review and resume.",
                category: "TRANSACTION",
                type: "WARNING",
                actionLink: "/transactions",
                metadata: { instructionId: failedInstruction._id },
              });
            } catch (_) {}
          }
        }
      } catch (_) {}
    }

    return {
      success: false,
      status: resolveTransferErrorStatus(error.message),
      message: error.message || "Standing instruction execution failed.",
    };
  }
};

// Monthly statement PDF
exports.getMonthlyStatementPdf = async (req, res) => {
  try {
    const { year, month } = req.params;
    const y = parseInt(year, 10);
    const m = parseInt(month, 10);
    if (isNaN(y) || isNaN(m) || m < 1 || m > 12) {
      return res.status(400).json({ success: false, message: "Invalid year/month" });
    }

    const account = await Account.findOne({ userId: req.userId });
    if (!account) {
      return res.status(404).json({ success: false, message: "Account not found" });
    }

    const statementMonth = String(m).padStart(2, "0");
    const start = dayjs(`${y}-${statementMonth}-01`).startOf("month").toDate();
    const end = dayjs(start).endOf("month").toDate();
    const [ledgerEntries, lastLedgerBeforeStart, lastLedgerTillEnd] = await Promise.all([
      LedgerEntry.find({ accountId: account._id, createdAt: { $gte: start, $lte: end } })
        .populate("transactionId", "type description status")
        .sort({ createdAt: 1, _id: 1 })
        .lean(),
      LedgerEntry.findOne({ accountId: account._id, createdAt: { $lt: start } })
        .sort({ createdAt: -1, _id: -1 })
        .lean(),
      LedgerEntry.findOne({ accountId: account._id, createdAt: { $lte: end } })
        .sort({ createdAt: -1, _id: -1 })
        .lean(),
    ]);

    let openingBalance = Number(lastLedgerBeforeStart?.balanceAfter || 0);
    let closingBalance = Number(lastLedgerTillEnd?.balanceAfter || openingBalance);

    let statementRows = ledgerEntries.map((entry) => {
      const txDoc = entry.transactionId && typeof entry.transactionId === "object" ? entry.transactionId : null;
      const direction = entry.type === "CREDIT" ? "CREDIT" : "DEBIT";
      const description = String(entry.description || txDoc?.description || "").trim() || "-";
      const debit = direction === "DEBIT" ? Number(entry.amount || 0) : 0;
      const credit = direction === "CREDIT" ? Number(entry.amount || 0) : 0;
      const balance = Number(entry.balanceAfter || 0);

      return {
        date: dayjs(entry.createdAt).format("DD MMM YYYY"),
        description,
        type: statementTypeLabel(txDoc?.type, direction, description),
        debit,
        credit,
        balance,
      };
    });

    // Fallback for older data where ledger entries may not exist.
    if (!statementRows.length) {
      const [transactionsInRange, lastTxBeforeStart, lastTxTillEnd] = await Promise.all([
        Transaction.find({ accountId: account._id, createdAt: { $gte: start, $lte: end } })
          .sort({ createdAt: 1, _id: 1 })
          .lean(),
        Transaction.findOne({ accountId: account._id, createdAt: { $lt: start } })
          .sort({ createdAt: -1, _id: -1 })
          .lean(),
        Transaction.findOne({ accountId: account._id, createdAt: { $lte: end } })
          .sort({ createdAt: -1, _id: -1 })
          .lean(),
      ]);

      if (!lastLedgerBeforeStart && lastTxBeforeStart) {
        openingBalance = Number(lastTxBeforeStart.balanceAfterTransaction || openingBalance);
      }

      if (!lastLedgerTillEnd && lastTxTillEnd) {
        closingBalance = Number(lastTxTillEnd.balanceAfterTransaction || closingBalance);
      }

      statementRows = transactionsInRange.map((tx) => {
        const direction = inferLegacyLedgerType(tx);
        const description = String(tx.description || "").trim() || "-";
        const debit = direction === "DEBIT" ? Number(tx.amount || 0) : 0;
        const credit = direction === "CREDIT" ? Number(tx.amount || 0) : 0;
        const balance = Number(tx.balanceAfterTransaction || 0);

        return {
          date: dayjs(tx.createdAt).format("DD MMM YYYY"),
          description,
          type: statementTypeLabel(tx.type, direction, description),
          debit,
          credit,
          balance,
        };
      });
    }

    if (statementRows.length) {
      closingBalance = Number(statementRows[statementRows.length - 1].balance || closingBalance);
    } else {
      closingBalance = Number(lastLedgerTillEnd?.balanceAfter || closingBalance || openingBalance);
    }

    const totalDebit = statementRows.reduce((sum, row) => sum + Number(row.debit || 0), 0);
    const totalCredit = statementRows.reduce((sum, row) => sum + Number(row.credit || 0), 0);
    const periodLabel = dayjs(start).format("MMMM YYYY");
    const generatedLabel = dayjs().format("DD MMM YYYY hh:mm A");

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=statement-${y}-${statementMonth}.pdf`);

    const doc = new PDFDocument({ size: "A4", margin: 50 });
    doc.pipe(res);

    const left = 50;
    const right = 50;
    const bottom = 50;
    const tableWidth = doc.page.width - left - right;
    const columns = [
      { key: "date", label: "Date", x: 50, width: 72, align: "left" },
      { key: "description", label: "Narration", x: 122, width: 181, align: "left" },
      { key: "type", label: "Type", x: 303, width: 68, align: "left" },
      { key: "debit", label: "Debit (Rs)", x: 371, width: 58, align: "right" },
      { key: "credit", label: "Credit (Rs)", x: 429, width: 58, align: "right" },
      { key: "balance", label: "Balance (Rs)", x: 487, width: 58, align: "right" },
    ];
    const headerHeight = 24;

    const drawTableHeader = () => {
      const y = doc.y;

      doc.save();
      doc.rect(left, y, tableWidth, headerHeight).fill("#eef3fb");
      doc.restore();

      doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#173d7a");
      columns.forEach((column) => {
        doc.text(column.label, column.x + 3, y + 7, {
          width: column.width - 6,
          align: column.align,
        });
      });

      doc.moveTo(left, y + headerHeight).lineTo(left + tableWidth, y + headerHeight).strokeColor("#d9e2ef").lineWidth(1).stroke();
      doc.y = y + headerHeight + 4;
      doc.font("Helvetica").fontSize(9.5).fillColor("#102a43");
    };

    const addContinuationHeader = () => {
      doc.font("Helvetica-Bold").fontSize(12).fillColor("#0b2d5c").text(`Monthly Statement - ${periodLabel} (continued)`, left, 50, {
        width: tableWidth,
      });
      doc.moveDown(0.6);
    };

    const ensureSpaceForRow = (rowHeight) => {
      if (doc.y + rowHeight > doc.page.height - bottom) {
        doc.addPage();
        addContinuationHeader();
        drawTableHeader();
      }
    };

    doc.font("Helvetica-Bold").fontSize(18).fillColor("#0b2d5c").text("BankEase Monthly Statement", { align: "center" });
    doc.moveDown(0.5);
    doc.font("Helvetica").fontSize(10).fillColor("#334e68");
    doc.text(`Account Number: ${maskAccountNumber(account.accountNumber)}`, left, doc.y, { width: tableWidth });
    doc.text(`Statement Period: ${periodLabel}`, left, doc.y, { width: tableWidth });
    doc.text(`Generated On: ${generatedLabel}`, left, doc.y, { width: tableWidth });

    const summaryY = doc.y + 8;
    const summaryHeight = 62;
    doc.save();
    doc.roundedRect(left, summaryY, tableWidth, summaryHeight, 6).fill("#f7f9fd");
    doc.restore();
    doc.roundedRect(left, summaryY, tableWidth, summaryHeight, 6).strokeColor("#dce4f0").lineWidth(1).stroke();

    doc.font("Helvetica").fontSize(10).fillColor("#334e68");
    doc.text(`Opening Balance: ${formatStatementAmount(openingBalance)}`, left + 12, summaryY + 12, { width: 220 });
    doc.text(`Closing Balance: ${formatStatementAmount(closingBalance)}`, left + 250, summaryY + 12, { width: 220 });
    doc.text(`Total Debit: ${formatStatementAmount(totalDebit)}`, left + 12, summaryY + 34, { width: 220 });
    doc.text(`Total Credit: ${formatStatementAmount(totalCredit)}`, left + 250, summaryY + 34, { width: 220 });

    doc.y = summaryY + summaryHeight + 14;
    drawTableHeader();

    if (!statementRows.length) {
      ensureSpaceForRow(32);
      const emptyRowY = doc.y;
      doc.font("Helvetica-Oblique").fontSize(10).fillColor("#6b7c93").text("No transactions recorded for this month.", left + 6, emptyRowY + 8, {
        width: tableWidth - 12,
      });
      doc.moveTo(left, emptyRowY + 30).lineTo(left + tableWidth, emptyRowY + 30).strokeColor("#ecf0f6").lineWidth(1).stroke();
      doc.y = emptyRowY + 32;
    } else {
      statementRows.forEach((row) => {
        const rowCells = {
          date: row.date,
          description: row.description,
          type: row.type,
          debit: row.debit > 0 ? formatStatementAmount(row.debit) : "-",
          credit: row.credit > 0 ? formatStatementAmount(row.credit) : "-",
          balance: formatStatementAmount(row.balance),
        };

        const rowHeight =
          Math.max(
            20,
            ...columns.map((column) =>
              doc.heightOfString(String(rowCells[column.key] || "-"), {
                width: column.width - 6,
                align: column.align,
              })
            )
          ) + 8;

        ensureSpaceForRow(rowHeight + 2);
        const rowY = doc.y;
        doc.font("Helvetica").fontSize(9.5).fillColor("#102a43");
        columns.forEach((column) => {
          doc.text(String(rowCells[column.key] || "-"), column.x + 3, rowY + 4, {
            width: column.width - 6,
            align: column.align,
          });
        });

        doc.moveTo(left, rowY + rowHeight).lineTo(left + tableWidth, rowY + rowHeight).strokeColor("#ecf0f6").lineWidth(1).stroke();
        doc.y = rowY + rowHeight;
      });
    }

    if (doc.y + 36 > doc.page.height - bottom) {
      doc.addPage();
    }

    doc.moveDown(0.8);
    doc.font("Helvetica").fontSize(9).fillColor("#6b7c93");
    doc.text("This is a system-generated statement and does not require signature.", left, doc.y, { width: tableWidth });
    doc.moveDown(0.2);
    doc.text(`Generated by BankEase on ${generatedLabel}`, left, doc.y, { width: tableWidth });
    doc.end();
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
// Get user transactions
exports.getMyTransactions = async (req, res) => {
  try {
    const account = await Account.findOne({ userId: req.userId });
    if (!account) {
      return res.status(404).json({ success: false, message: "Account not found" });
    }

    const page = parsePositiveInt(req.query.page, 1, { min: 1, max: 100000 });
    const limit = parsePositiveInt(req.query.limit, 200, { min: 1, max: 500 });
    const skip = (page - 1) * limit;
    const type = String(req.query.type || "").trim().toUpperCase();
    const fromDate = parseDateOrNull(req.query.from, { endOfDay: false });
    const toDate = parseDateOrNull(req.query.to, { endOfDay: true });

    const filter = { accountId: account._id };
    if (type) {
      filter.type = type;
    }
    if (fromDate || toDate) {
      filter.createdAt = {};
      if (fromDate) filter.createdAt.$gte = fromDate;
      if (toDate) filter.createdAt.$lte = toDate;
    }

    const [transactions, totalTransactions] = await Promise.all([
      Transaction.find(filter)
        .populate("recipientAccountId", "accountNumber")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Transaction.countDocuments(filter),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalTransactions / limit));

    res.status(200).json({
      success: true,
      totalTransactions,
      page,
      limit,
      totalPages,
      hasMore: page < totalPages,
      transactions,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get all transactions (Admin)
exports.getAllTransactions = async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1, { min: 1, max: 100000 });
    const limit = parsePositiveInt(req.query.limit, 200, { min: 1, max: 500 });
    const skip = (page - 1) * limit;
    const type = String(req.query.type || "").trim().toUpperCase();
    const userId = String(req.query.userId || "").trim();
    const accountId = String(req.query.accountId || "").trim();
    const fromDate = parseDateOrNull(req.query.from, { endOfDay: false });
    const toDate = parseDateOrNull(req.query.to, { endOfDay: true });

    const filter = {};
    if (type) {
      filter.type = type;
    }
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      filter.userId = userId;
    }
    if (accountId && mongoose.Types.ObjectId.isValid(accountId)) {
      filter.accountId = accountId;
    }
    if (fromDate || toDate) {
      filter.createdAt = {};
      if (fromDate) filter.createdAt.$gte = fromDate;
      if (toDate) filter.createdAt.$lte = toDate;
    }

    const [transactions, totalTransactions] = await Promise.all([
      Transaction.find(filter)
        .populate("userId", "firstName lastName email")
        .populate("accountId", "accountNumber")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Transaction.countDocuments(filter),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalTransactions / limit));

    res.status(200).json({
      success: true,
      totalTransactions,
      page,
      limit,
      totalPages,
      hasMore: page < totalPages,
      transactions,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Deposit transaction (atomic with ledger entry)
exports.deposit = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { amount, description } = req.body;

    if (!amount || amount <= 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }

    let account = await Account.findOne({ userId: req.userId }).session(session);
    if (!account) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: "Account not found" });
    }

    if (account.status !== "ACTIVE") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: "Account is not active" });
    }

    account.balance += amount;
    await account.save({ session });

    const transaction = await createTransaction(
      account._id,
      req.userId,
      "DEPOSIT",
      amount,
      description || "Deposit",
      account.balance,
      null,
      "",
      session
    );

    // Ledger credit entry
    await LedgerEntry.create([
      {
        accountId: account._id,
        transactionId: transaction._id,
        type: "CREDIT",
        amount,
        balanceAfter: account.balance,
        description: description || "Deposit",
      },
    ], { session });

    await session.commitTransaction();
    session.endSession();

    try {
      await createNotification({
        userId: req.userId,
        title: "Deposit Successful",
        message: `${formatRupee(amount)} credited to your account. Updated balance: ${formatRupee(account.balance)}.`,
        category: "TRANSACTION",
        type: "SUCCESS",
        actionLink: "/transactions",
        metadata: { transactionId: transaction._id, amount },
      });
    } catch (_) {}
    try {
      await postCustomerDepositJournal({
        amount: Number(amount || 0),
        referenceType: "DEPOSIT",
        referenceId: transaction._id,
        metadata: {
          userId: req.userId,
          accountId: account._id,
          accountNumber: account.accountNumber,
        },
      });
    } catch (_) {}

    res.status(201).json({
      success: true,
      message: "Deposit successful",
      transaction,
      newBalance: account.balance,
    });
    try {
      await AuditLog.create({
        userId: req.userId,
        action: "DEPOSIT",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || "",
        metadata: { amount, accountId: account._id },
      });
    } catch (_) {}
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ success: false, message: error.message });
  }
};

// Withdrawal transaction (atomic with ledger entry)
exports.withdraw = async (req, res) => {
  const { amount, description, transactionPin } = req.body;
  const withdrawalAmount = Number(amount);

  if (!Number.isFinite(withdrawalAmount) || withdrawalAmount <= 0) {
    return res.status(400).json({ success: false, message: "Invalid amount" });
  }

  const pinCheck = await verifyTransactionPin({ userId: req.userId, pin: transactionPin });
  if (!pinCheck.success) {
    return res.status(pinCheck.status).json({ success: false, message: pinCheck.message });
  }

  const policy = getMoneyOutPolicy();
  if (withdrawalAmount > policy.maxSingleWithdrawal) {
    return res.status(400).json({
      success: false,
      message: `Single withdrawal limit is ${formatRupee(policy.maxSingleWithdrawal)}.`,
    });
  }

  const todayWithdrawal = await getUserDailyTotal({ userId: req.userId, type: "WITHDRAWAL" });
  if (todayWithdrawal + withdrawalAmount > policy.dailyWithdrawalLimit) {
    const remaining = Math.max(0, policy.dailyWithdrawalLimit - todayWithdrawal);
    return res.status(400).json({
      success: false,
      message: `Daily withdrawal limit exceeded. Remaining today: ${formatRupee(remaining)}.`,
    });
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    let account = await Account.findOne({ userId: req.userId }).session(session);
    if (!account) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: "Account not found" });
    }

    if (account.status !== "ACTIVE") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: "Account is not active" });
    }

    if (account.balance < withdrawalAmount) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: "Insufficient balance" });
    }

    account.balance -= withdrawalAmount;
    await account.save({ session });

    const transaction = await createTransaction(
      account._id,
      req.userId,
      "WITHDRAWAL",
      withdrawalAmount,
      description || "Withdrawal",
      account.balance,
      null,
      "",
      session
    );

    // Ledger debit entry
    await LedgerEntry.create(
      [
        {
          accountId: account._id,
          transactionId: transaction._id,
          type: "DEBIT",
          amount: withdrawalAmount,
          balanceAfter: account.balance,
          description: description || "Withdrawal",
        },
      ],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    try {
      await createNotification({
        userId: req.userId,
        title: "Withdrawal Successful",
        message: `${formatRupee(withdrawalAmount)} debited from your account. Available balance: ${formatRupee(account.balance)}.`,
        category: "TRANSACTION",
        type: "WARNING",
        actionLink: "/transactions",
        metadata: { transactionId: transaction._id, amount: withdrawalAmount },
      });
    } catch (_) {}
    try {
      await postCustomerWithdrawalJournal({
        amount: Number(withdrawalAmount || 0),
        referenceType: "WITHDRAWAL",
        referenceId: transaction._id,
        metadata: {
          userId: req.userId,
          accountId: account._id,
          accountNumber: account.accountNumber,
        },
      });
    } catch (_) {}

    res.status(201).json({
      success: true,
      message: "Withdrawal successful",
      transaction,
      newBalance: account.balance,
    });
    try {
      await AuditLog.create({
        userId: req.userId,
        action: "WITHDRAWAL",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || "",
        metadata: { amount: withdrawalAmount, accountId: account._id },
      });
    } catch (_) {}
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ success: false, message: error.message });
  }
};

// Transfer money to another account (atomic with dual ledger entries)
exports.resolveRecipient = async (req, res) => {
  try {
    const accountNumber = normalizeAccountNumber(req.body.accountNumber);
    if (!accountNumber) {
      return res.status(400).json({ success: false, message: "Account number is required." });
    }

    const senderAccount = await Account.findOne({ userId: req.userId });
    if (!senderAccount) {
      return res.status(404).json({ success: false, message: "Sender account not found." });
    }

    if (senderAccount.accountNumber === accountNumber) {
      return res.status(400).json({ success: false, message: "Cannot transfer to your own account." });
    }

    const recipientAccount = await Account.findOne({ accountNumber }).populate("userId", "firstName lastName");
    if (!recipientAccount) {
      return res.status(404).json({ success: false, message: "Recipient account not found." });
    }

    if (recipientAccount.status !== "ACTIVE") {
      return res.status(400).json({ success: false, message: "Recipient account is not active." });
    }

    const beneficiary = await Beneficiary.findOne({ userId: req.userId, accountNumber });

    res.status(200).json({
      success: true,
      recipient: {
        accountNumber: recipientAccount.accountNumber,
        fullName: `${recipientAccount.userId?.firstName || ""} ${recipientAccount.userId?.lastName || ""}`.trim(),
        accountNumberMasked: maskAccountNumber(recipientAccount.accountNumber),
        status: recipientAccount.status,
        isVerifiedBeneficiary: Boolean(beneficiary?.verified),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getSecurityRules = async (req, res) => {
  try {
    const policy = getMoneyOutPolicy();
    const [todayTransfer, todayWithdrawal] = await Promise.all([
      getUserDailyTotal({ userId: req.userId, type: "TRANSFER" }),
      getUserDailyTotal({ userId: req.userId, type: "WITHDRAWAL" }),
    ]);

    const remainingTransfer = Math.max(0, policy.dailyTransferLimit - todayTransfer);
    const remainingWithdrawal = Math.max(0, policy.dailyWithdrawalLimit - todayWithdrawal);

    res.status(200).json({
      success: true,
      rules: {
        maxSingleTransfer: policy.maxSingleTransfer,
        dailyTransferLimit: policy.dailyTransferLimit,
        highValueTransferThreshold: policy.highValueTransferThreshold,
        requireTransferOtpForHighValue: policy.requireTransferOtpForHighValue,
        maxSingleWithdrawal: policy.maxSingleWithdrawal,
        dailyWithdrawalLimit: policy.dailyWithdrawalLimit,
        enforceBeneficiary: policy.enforceBeneficiary,
        allowDirectTransferWithPin: policy.allowDirectTransferWithPin,
        requireVerifiedBeneficiary: policy.requireVerifiedBeneficiary,
        todayTransfer,
        todayWithdrawal,
        remainingTransfer,
        remainingWithdrawal,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.requestTransferOtp = async (req, res) => {
  try {
    const { recipientAccountNumber, amount } = req.body;
    const normalizedRecipientAccountNumber = normalizeAccountNumber(recipientAccountNumber);
    const transferAmount = Number(amount);
    const normalizedAmount = Number(Number(amount).toFixed(2));
    const policy = getMoneyOutPolicy();

    if (!normalizedRecipientAccountNumber || !Number.isFinite(transferAmount) || transferAmount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid transfer request." });
    }

    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid transfer amount." });
    }

    if (normalizedAmount > policy.maxSingleTransfer) {
      return res.status(400).json({
        success: false,
        message: `Single transfer limit is ${formatRupee(policy.maxSingleTransfer)}.`,
      });
    }

    const todayTransfer = await getUserDailyTotal({ userId: req.userId, type: "TRANSFER" });
    if (todayTransfer + normalizedAmount > policy.dailyTransferLimit) {
      const remaining = Math.max(0, policy.dailyTransferLimit - todayTransfer);
      return res.status(400).json({
        success: false,
        message: `Daily transfer limit exceeded. Remaining today: ${formatRupee(remaining)}.`,
      });
    }

    const highValueTransfer = normalizedAmount >= policy.highValueTransferThreshold;
    if (!policy.requireTransferOtpForHighValue || !highValueTransfer) {
      return res.status(200).json({
        success: true,
        otpRequired: false,
        message: "OTP not required for this transfer amount.",
      });
    }

    const allowFallback = canUseEmailOtpFallback();
    if (!isEmailConfigured() && !allowFallback) {
      return res.status(500).json({
        success: false,
        message: "Email service is not configured. Enable Nodemailer settings before transfer OTP flow.",
      });
    }

    const senderAccount = await Account.findOne({ userId: req.userId });
    if (!senderAccount) {
      return res.status(404).json({ success: false, message: "Sender account not found." });
    }

    if (senderAccount.status !== "ACTIVE") {
      return res.status(400).json({ success: false, message: "Sender account is not active." });
    }

    if (senderAccount.accountNumber === normalizedRecipientAccountNumber) {
      return res.status(400).json({ success: false, message: "Cannot transfer to the same account." });
    }

    if (senderAccount.balance < normalizedAmount) {
      return res.status(400).json({ success: false, message: "Insufficient balance for this transfer." });
    }

    const recipientAccount = await Account.findOne({ accountNumber: normalizedRecipientAccountNumber });
    if (!recipientAccount) {
      return res.status(404).json({ success: false, message: "Recipient account not found." });
    }

    if (recipientAccount.status !== "ACTIVE") {
      return res.status(400).json({ success: false, message: "Recipient account is not active." });
    }

    if (policy.requireVerifiedBeneficiary) {
      const beneficiary = await Beneficiary.findOne({
        userId: req.userId,
        accountNumber: normalizedRecipientAccountNumber,
        verified: true,
      });
      if (!beneficiary) {
        return res.status(403).json({
          success: false,
          message: "Recipient not verified. Please add and verify beneficiary first.",
        });
      }
    }

    const existingOtp = await Otp.findOne({
      userId: req.userId,
      purpose: "TRANSFER_VERIFY",
      isUsed: false,
      expiresAt: { $gt: new Date() },
      "metadata.recipientAccountNumber": normalizedRecipientAccountNumber,
      "metadata.amount": normalizedAmount,
    }).sort({ createdAt: -1 });

    if (existingOtp) {
      const elapsedMs = Date.now() - new Date(existingOtp.createdAt).getTime();
      if (elapsedMs < 60 * 1000) {
        return res.status(200).json({
          success: true,
          otpRequired: true,
          otpSessionId: existingOtp._id,
          expiresAt: existingOtp.expiresAt,
          message: "OTP already sent recently. Please check your email.",
        });
      }
    }

    const otpCode = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const otp = await Otp.create({
      userId: req.userId,
      purpose: "TRANSFER_VERIFY",
      codeHash: hashOtpCode(otpCode),
      metadata: {
        recipientAccountNumber: normalizedRecipientAccountNumber,
        amount: normalizedAmount,
      },
      expiresAt,
    });

    const emailSent = await sendOtpEmail(req.user.email, otpCode, req.user.firstName || "User", {
      purpose: "TRANSFER_VERIFY",
      accountNumber: normalizedRecipientAccountNumber,
      amount: normalizedAmount,
    });

    if (!emailSent) {
      if (!allowFallback) {
        await Otp.findByIdAndDelete(otp._id);
        return res.status(500).json({
          success: false,
          message: `Unable to send transfer OTP right now. ${getEmailFailureHint()}`,
        });
      }

      return res.status(200).json({
        success: true,
        otpRequired: true,
        otpSessionId: otp._id,
        expiresAt: otp.expiresAt,
        fallbackOtpMode: true,
        devOtpCode: shouldExposeFallbackOtpCode() ? otpCode : undefined,
        message: "Email OTP delivery is unavailable right now. Use the fallback OTP shown below to authorize transfer.",
      });
    }

    try {
      await AuditLog.create({
        userId: req.userId,
        action: "TRANSFER_OTP_REQUEST",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || "",
        metadata: {
          amount: normalizedAmount,
          recipientAccountNumber: normalizedRecipientAccountNumber,
          otpId: otp._id,
        },
      });
    } catch (_) {}

    return res.status(200).json({
      success: true,
      otpRequired: true,
      otpSessionId: otp._id,
      expiresAt: otp.expiresAt,
      message: "OTP sent to your registered email for transfer authorization.",
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.transfer = async (req, res) => {
  const { recipientAccountNumber, amount, description, transactionPin, otpCode, otpSessionId } = req.body;
  const normalizedRecipientAccountNumber = normalizeAccountNumber(recipientAccountNumber);
  const transferAmount = Number(amount);
  const normalizedOtpCode = normalizeOtpCode(otpCode);
  const transferDescription = String(description || "").trim().slice(0, 240);

  if (!normalizedRecipientAccountNumber || !Number.isFinite(transferAmount) || transferAmount <= 0) {
    return res.status(400).json({ success: false, message: "Invalid input" });
  }

  const pinCheck = await verifyTransactionPin({ userId: req.userId, pin: transactionPin });
  if (!pinCheck.success) {
    return res.status(pinCheck.status).json(buildPinFailurePayload(pinCheck));
  }

  const senderUser = pinCheck.user;
  const policy = getMoneyOutPolicy();
  const highValueTransfer = transferAmount >= policy.highValueTransferThreshold;

  if (transferAmount > policy.maxSingleTransfer) {
    return res.status(400).json({
      success: false,
      message: `Single transfer limit is ${formatRupee(policy.maxSingleTransfer)}.`,
    });
  }

  const todayTransfer = await getUserDailyTotal({ userId: req.userId, type: "TRANSFER" });
  if (todayTransfer + transferAmount > policy.dailyTransferLimit) {
    const remaining = Math.max(0, policy.dailyTransferLimit - todayTransfer);
    return res.status(400).json({
      success: false,
      message: `Daily transfer limit exceeded. Remaining today: ${formatRupee(remaining)}.`,
    });
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // Get sender's account
    let senderAccount = await Account.findOne({ userId: req.userId }).session(session);
    if (!senderAccount) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: "Sender account not found" });
    }

    if (senderAccount.status !== "ACTIVE") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: "Sender account is not active" });
    }

    // Prevent self-transfer
    if (senderAccount.accountNumber === normalizedRecipientAccountNumber) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: "Cannot transfer to the same account" });
    }

    if (senderAccount.balance < transferAmount) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: "Insufficient balance" });
    }

    // Enforce beneficiary verification only when explicit policy is enabled.
    const requiresVerifiedBeneficiary = policy.requireVerifiedBeneficiary;
    if (requiresVerifiedBeneficiary) {
      const ben = await Beneficiary.findOne({ userId: req.userId, accountNumber: normalizedRecipientAccountNumber }).session(session);
      if (!ben || !ben.verified) {
        await session.abortTransaction();
        session.endSession();
        return res.status(403).json({
          success: false,
          message: "Recipient not verified. Please add and verify beneficiary first.",
        });
      }
    }

    if (highValueTransfer && policy.requireTransferOtpForHighValue) {
      if (!otpSessionId || !otpCode) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: "OTP verification is required for this high-value transfer.",
        });
      }

      if (!isValidOtpCode(normalizedOtpCode)) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: "Enter valid 6-digit transfer OTP.",
        });
      }

      const transferOtp = await Otp.findOne({
        _id: otpSessionId,
        userId: req.userId,
        purpose: "TRANSFER_VERIFY",
        isUsed: false,
        expiresAt: { $gt: new Date() },
      }).session(session);

      if (!transferOtp) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: "Transfer OTP invalid or expired. Request a new OTP.",
        });
      }

      const otpAmount = Number(transferOtp.metadata?.amount || 0);
      const otpRecipient = normalizeAccountNumber(String(transferOtp.metadata?.recipientAccountNumber || ""));
      if (
        otpRecipient !== normalizedRecipientAccountNumber ||
        Math.abs(otpAmount - Number(transferAmount.toFixed(2))) > 0.001
      ) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: "Transfer OTP session does not match this transfer request.",
        });
      }

      if (transferOtp.codeHash !== hashOtpCode(normalizedOtpCode)) {
        await session.abortTransaction();
        session.endSession();
        return res.status(401).json({
          success: false,
          message: "Incorrect transfer OTP.",
        });
      }

      transferOtp.isUsed = true;
      await transferOtp.save({ session });
    }

    // Get recipient's account
    const recipientAccount = await Account.findOne({ accountNumber: normalizedRecipientAccountNumber }).session(session);
    if (!recipientAccount) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: "Recipient account not found" });
    }

    if (recipientAccount.status !== "ACTIVE") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: "Recipient account is not active" });
    }

    // Get recipient user details
    const recipientUser = await User.findById(recipientAccount.userId).session(session);
    const recipientName = `${recipientUser?.firstName || ""} ${recipientUser?.lastName || ""}`.trim();
    const normalizedTransferAmount = Number(transferAmount.toFixed(2));

    if (highValueTransfer && isApprovalRequired("TRANSFER_EXECUTION")) {
      const existingRequest = await ApprovalRequest.findOne({
        actionType: "TRANSFER_EXECUTION",
        targetType: "TRANSFER",
        targetId: senderAccount._id,
        requestedBy: req.userId,
        status: "PENDING",
        "payload.recipientAccountNumber": normalizedRecipientAccountNumber,
        "payload.amount": normalizedTransferAmount,
      }).session(session);

      if (existingRequest) {
        await session.abortTransaction();
        session.endSession();
        return res.status(202).json({
          success: true,
          pendingApproval: true,
          message: "A transfer approval request is already pending for this recipient and amount.",
          approvalRequest: existingRequest,
          approvalRequestId: existingRequest._id,
          amount: normalizedTransferAmount,
          recipientName,
          recipientAccountMasked: maskAccountNumber(normalizedRecipientAccountNumber),
          recipientAccountNumber: normalizedRecipientAccountNumber,
        });
      }

      const [approvalRequest] = await ApprovalRequest.create(
        [
          {
            actionType: "TRANSFER_EXECUTION",
            targetType: "TRANSFER",
            targetId: senderAccount._id,
            payload: {
              senderUserId: req.userId,
              senderAccountId: senderAccount._id,
              senderAccountNumber: senderAccount.accountNumber,
              recipientAccountId: recipientAccount._id,
              recipientUserId: recipientAccount.userId,
              recipientAccountNumber: normalizedRecipientAccountNumber,
              recipientName,
              amount: normalizedTransferAmount,
              description: transferDescription || "Transfer",
              highValueTransfer: true,
              otpSessionId: otpSessionId || "",
            },
            requestNote: `High-value transfer request for ${formatRupee(normalizedTransferAmount)} to ${maskAccountNumber(
              normalizedRecipientAccountNumber
            )}`,
            requestedBy: req.userId,
          },
        ],
        { session }
      );

      await session.commitTransaction();
      session.endSession();

      try {
        await createNotification({
          userId: req.userId,
          title: "Transfer Request Submitted",
          message: `${formatRupee(normalizedTransferAmount)} transfer to ${maskAccountNumber(
            normalizedRecipientAccountNumber
          )} is pending admin approval.`,
          category: "TRANSACTION",
          type: "INFO",
          actionLink: "/core-banking?module=approvals",
          metadata: {
            approvalRequestId: approvalRequest._id,
            actionType: "TRANSFER_EXECUTION",
            amount: normalizedTransferAmount,
            recipientAccountNumber: normalizedRecipientAccountNumber,
          },
        });
      } catch (_) {}

      try {
        await AuditLog.create({
          userId: req.userId,
          action: "TRANSFER_APPROVAL_REQUEST_CREATED",
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"] || "",
          metadata: {
            approvalRequestId: approvalRequest._id,
            actionType: approvalRequest.actionType,
            targetType: approvalRequest.targetType,
            targetId: approvalRequest.targetId,
            amount: normalizedTransferAmount,
            recipientAccountNumber: normalizedRecipientAccountNumber,
          },
        });
      } catch (_) {}

      return res.status(202).json({
        success: true,
        pendingApproval: true,
        message: "Transfer request submitted for admin approval.",
        approvalRequest,
        approvalRequestId: approvalRequest._id,
        amount: normalizedTransferAmount,
        recipientName,
        recipientAccountMasked: maskAccountNumber(normalizedRecipientAccountNumber),
        recipientAccountNumber: normalizedRecipientAccountNumber,
      });
    }

    // Deduct from sender
    senderAccount.balance -= transferAmount;
    await senderAccount.save({ session });

    // Add to recipient
    recipientAccount.balance += transferAmount;
    await recipientAccount.save({ session });

    // Create sender transaction
    const senderTx = await createTransaction(
      senderAccount._id,
      req.userId,
      "TRANSFER",
      transferAmount,
      transferDescription || "Transfer",
      senderAccount.balance,
      recipientAccount._id,
      recipientName,
      session
    );

    // Create recipient transaction
    const senderDisplayName = `${senderUser.firstName || ""} ${senderUser.lastName || ""}`.trim();
    const recipientTx = await createTransaction(
      recipientAccount._id,
      recipientAccount.userId,
      "TRANSFER",
      transferAmount,
      `Received from ${senderDisplayName}`,
      recipientAccount.balance,
      senderAccount._id,
      senderDisplayName,
      session
    );

    // Ledger entries: sender DEBIT, recipient CREDIT
    await LedgerEntry.create([
      {
        accountId: senderAccount._id,
        transactionId: senderTx._id,
        type: "DEBIT",
        amount: transferAmount,
        balanceAfter: senderAccount.balance,
        description: transferDescription || `Transfer to ${recipientAccount.accountNumber}`,
      },
      {
        accountId: recipientAccount._id,
        transactionId: recipientTx._id,
        type: "CREDIT",
        amount: transferAmount,
        balanceAfter: recipientAccount.balance,
        description: `Received from ${senderDisplayName}`,
      },
    ], { session });

    await session.commitTransaction();
    session.endSession();

    try {
      await createNotifications([
        {
          userId: req.userId,
          title: "Transfer Successful",
          message: `${formatRupee(transferAmount)} sent to ${maskAccountNumber(recipientAccount.accountNumber)}. Balance: ${formatRupee(
            senderAccount.balance
          )}.`,
          category: "TRANSACTION",
          type: "SUCCESS",
          actionLink: "/transactions",
          metadata: { transactionId: senderTx._id, recipientAccountNumber: recipientAccount.accountNumber, amount: transferAmount },
        },
        {
          userId: recipientAccount.userId,
          title: "Amount Received",
          message: `${formatRupee(transferAmount)} received from ${senderDisplayName || "BankIndia customer"}.`,
          category: "TRANSACTION",
          type: "INFO",
          actionLink: "/transactions",
          metadata: { transactionId: recipientTx._id, senderAccountNumber: senderAccount.accountNumber, amount: transferAmount },
        },
      ]);
    } catch (_) {}

    res.status(201).json({
      success: true,
      message: "Transfer successful",
      senderNewBalance: senderAccount.balance,
      recipientName,
      recipientAccountMasked: maskAccountNumber(recipientAccount.accountNumber),
      senderTransactionId: senderTx._id,
    });
    try {
      await AuditLog.create({
        userId: req.userId,
        action: "TRANSFER",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || "",
        metadata: {
          amount: transferAmount,
          to: normalizedRecipientAccountNumber,
          fromAccountId: senderAccount._id,
          highValueTransfer,
          otpSessionId: otpSessionId || "",
        },
      });
    } catch (_) {}
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.executeApprovedTransferExecution = async ({ approvalRequest, reviewerId, ipAddress = "", userAgent = "" }) => {
  if (!approvalRequest) {
    throw new Error("Approval request context is required for transfer execution.");
  }

  const payload = approvalRequest.payload || {};
  const senderUserId = String(payload.senderUserId || approvalRequest.requestedBy || "").trim();
  const senderAccountId = String(payload.senderAccountId || approvalRequest.targetId || "").trim();
  const normalizedRecipientAccountNumber = normalizeAccountNumber(payload.recipientAccountNumber);
  const transferAmount = Number(payload.amount);
  const transferDescription = String(payload.description || "Transfer").trim().slice(0, 240);

  if (!senderUserId || !senderAccountId || !normalizedRecipientAccountNumber) {
    throw new Error("Invalid transfer approval payload.");
  }

  if (!Number.isFinite(transferAmount) || transferAmount <= 0) {
    throw new Error("Invalid transfer approval amount.");
  }

  const policy = getMoneyOutPolicy();
  if (transferAmount > policy.maxSingleTransfer) {
    throw new Error(`Single transfer limit is ${formatRupee(policy.maxSingleTransfer)}.`);
  }

  const todayTransfer = await getUserDailyTotal({ userId: senderUserId, type: "TRANSFER" });
  if (todayTransfer + transferAmount > policy.dailyTransferLimit) {
    const remaining = Math.max(0, policy.dailyTransferLimit - todayTransfer);
    throw new Error(`Daily transfer limit exceeded. Remaining today: ${formatRupee(remaining)}.`);
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const senderAccount = await Account.findById(senderAccountId).session(session);
    if (!senderAccount) {
      throw new Error("Sender account not found.");
    }

    if (String(senderAccount.userId || "") !== senderUserId) {
      throw new Error("Transfer approval payload does not match sender account owner.");
    }

    if (senderAccount.status !== "ACTIVE") {
      throw new Error("Sender account is not active.");
    }

    if (senderAccount.accountNumber === normalizedRecipientAccountNumber) {
      throw new Error("Cannot transfer to the same account.");
    }

    if (senderAccount.balance < transferAmount) {
      throw new Error("Insufficient balance for this transfer.");
    }

    if (policy.requireVerifiedBeneficiary) {
      const beneficiary = await Beneficiary.findOne({
        userId: senderUserId,
        accountNumber: normalizedRecipientAccountNumber,
        verified: true,
      }).session(session);
      if (!beneficiary) {
        throw new Error("Recipient not verified. Please add and verify beneficiary first.");
      }
    }

    const recipientAccount = await Account.findOne({ accountNumber: normalizedRecipientAccountNumber }).session(session);
    if (!recipientAccount) {
      throw new Error("Recipient account not found.");
    }

    if (recipientAccount.status !== "ACTIVE") {
      throw new Error("Recipient account is not active.");
    }

    const senderUser = await User.findById(senderUserId).session(session);
    const recipientUser = await User.findById(recipientAccount.userId).session(session);
    const senderDisplayName = `${senderUser?.firstName || ""} ${senderUser?.lastName || ""}`.trim();
    const recipientDisplayName = `${recipientUser?.firstName || ""} ${recipientUser?.lastName || ""}`.trim();

    senderAccount.balance -= transferAmount;
    recipientAccount.balance += transferAmount;
    await senderAccount.save({ session });
    await recipientAccount.save({ session });

    const senderTx = await createTransaction(
      senderAccount._id,
      senderUserId,
      "TRANSFER",
      transferAmount,
      transferDescription || "Transfer",
      senderAccount.balance,
      recipientAccount._id,
      recipientDisplayName,
      session
    );

    const recipientTx = await createTransaction(
      recipientAccount._id,
      recipientAccount.userId,
      "TRANSFER",
      transferAmount,
      `Received from ${senderDisplayName}`,
      recipientAccount.balance,
      senderAccount._id,
      senderDisplayName,
      session
    );

    await LedgerEntry.create(
      [
        {
          accountId: senderAccount._id,
          transactionId: senderTx._id,
          type: "DEBIT",
          amount: transferAmount,
          balanceAfter: senderAccount.balance,
          description: transferDescription || `Transfer to ${recipientAccount.accountNumber}`,
        },
        {
          accountId: recipientAccount._id,
          transactionId: recipientTx._id,
          type: "CREDIT",
          amount: transferAmount,
          balanceAfter: recipientAccount.balance,
          description: `Received from ${senderDisplayName}`,
        },
      ],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    try {
      await createNotifications([
        {
          userId: senderUserId,
          title: "Transfer Successful",
          message: `${formatRupee(transferAmount)} sent to ${maskAccountNumber(recipientAccount.accountNumber)}. Balance: ${formatRupee(
            senderAccount.balance
          )}.`,
          category: "TRANSACTION",
          type: "SUCCESS",
          actionLink: "/transactions",
          metadata: {
            transactionId: senderTx._id,
            recipientAccountNumber: recipientAccount.accountNumber,
            amount: transferAmount,
            approvalRequestId: approvalRequest._id,
          },
        },
        {
          userId: recipientAccount.userId,
          title: "Amount Received",
          message: `${formatRupee(transferAmount)} received from ${senderDisplayName || "BankIndia customer"}.`,
          category: "TRANSACTION",
          type: "INFO",
          actionLink: "/transactions",
          metadata: {
            transactionId: recipientTx._id,
            senderAccountNumber: senderAccount.accountNumber,
            amount: transferAmount,
            approvalRequestId: approvalRequest._id,
          },
        },
      ]);
    } catch (_) {}

    try {
      await AuditLog.create({
        userId: reviewerId,
        action: "TRANSFER_APPROVAL_EXECUTED",
        ipAddress,
        userAgent,
        metadata: {
          approvalRequestId: approvalRequest._id,
          amount: transferAmount,
          to: normalizedRecipientAccountNumber,
          fromAccountId: senderAccount._id,
          senderTransactionId: senderTx._id,
          recipientTransactionId: recipientTx._id,
        },
      });
    } catch (_) {}

    return {
      executed: true,
      result: {
        senderNewBalance: senderAccount.balance,
        recipientName: recipientDisplayName,
        recipientAccountMasked: maskAccountNumber(recipientAccount.accountNumber),
        senderTransactionId: senderTx._id,
        recipientTransactionId: recipientTx._id,
        amount: transferAmount,
      },
      message: "Transfer request approved and executed successfully.",
    };
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

exports.listStandingInstructions = async (req, res) => {
  try {
    const instructions = await StandingInstruction.find({ userId: req.userId }).sort({ createdAt: -1 });
    const activeCount = instructions.filter((entry) => entry.status === "ACTIVE").length;
    const pausedCount = instructions.filter((entry) => entry.status === "PAUSED").length;
    const completedCount = instructions.filter((entry) => entry.status === "COMPLETED").length;

    return res.status(200).json({
      success: true,
      instructions,
      summary: {
        total: instructions.length,
        active: activeCount,
        paused: pausedCount,
        completed: completedCount,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createStandingInstruction = async (req, res) => {
  try {
    const { recipientAccountNumber, amount, frequency, description, startDate, maxExecutions, transactionPin } = req.body;
    const normalizedRecipientAccountNumber = normalizeAccountNumber(recipientAccountNumber);
    const transferAmount = Number(amount);
    const hasMaxExecutionsInput =
      !(maxExecutions === undefined || maxExecutions === null || String(maxExecutions).trim() === "");
    const parsedMaxExecutions = hasMaxExecutionsInput ? Number(maxExecutions) : 10;

    if (!Number.isFinite(transferAmount) || transferAmount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid transfer amount." });
    }
    if (!Number.isInteger(parsedMaxExecutions) || parsedMaxExecutions < 1 || parsedMaxExecutions > 10) {
      return res.status(400).json({
        success: false,
        message: "Max runs must be an integer between 1 and 10.",
      });
    }

    const pinCheck = await verifyTransactionPin({ userId: req.userId, pin: transactionPin });
    if (!pinCheck.success) {
      return res.status(pinCheck.status).json(buildPinFailurePayload(pinCheck));
    }

    const senderAccount = await Account.findOne({ userId: req.userId });
    if (!senderAccount) {
      return res.status(404).json({ success: false, message: "Sender account not found." });
    }
    if (senderAccount.status !== "ACTIVE") {
      return res.status(400).json({ success: false, message: "Sender account is not active." });
    }
    if (senderAccount.accountNumber === normalizedRecipientAccountNumber) {
      return res.status(400).json({ success: false, message: "Cannot transfer to the same account." });
    }

    const policy = getMoneyOutPolicy();
    if (transferAmount > policy.maxSingleTransfer) {
      return res.status(400).json({
        success: false,
        message: `Single transfer limit is ${formatRupee(policy.maxSingleTransfer)}.`,
      });
    }

    const recipientAccount = await Account.findOne({ accountNumber: normalizedRecipientAccountNumber }).populate("userId", "firstName lastName");
    if (!recipientAccount) {
      return res.status(404).json({ success: false, message: "Recipient account not found." });
    }
    if (recipientAccount.status !== "ACTIVE") {
      return res.status(400).json({ success: false, message: "Recipient account is not active." });
    }

    const beneficiary = await Beneficiary.findOne({ userId: req.userId, accountNumber: normalizedRecipientAccountNumber, verified: true });
    if (!beneficiary) {
      return res.status(403).json({
        success: false,
        message: "Recipient must be a verified beneficiary before setting standing instruction.",
      });
    }

    const startAt = resolveStandingStartDate(startDate);
    if (!startAt || !startAt.isValid()) {
      return res.status(400).json({ success: false, message: "Invalid start date." });
    }
    const now = dayjs();
    const scheduleBackdated = startAt.isBefore(now.startOf("day"));
    const firstRunAt = startAt.isBefore(now) ? now.toDate() : startAt.toDate();

    const recipientName = `${recipientAccount.userId?.firstName || ""} ${recipientAccount.userId?.lastName || ""}`.trim();
    const instruction = await StandingInstruction.create({
      userId: req.userId,
      accountId: senderAccount._id,
      recipientAccountNumber: normalizedRecipientAccountNumber,
      recipientName,
      amount: transferAmount,
      frequency,
      startDate: startAt.toDate(),
      description: String(description || "").trim(),
      status: "ACTIVE",
      nextRunAt: firstRunAt,
      maxExecutions: parsedMaxExecutions,
      lastExecutionStatus: "PENDING",
    });

    try {
      await createNotification({
        userId: req.userId,
        title: "Standing Instruction Created",
        message: `${formatRupee(transferAmount)} scheduled as ${frequency.toLowerCase()} transfer to ${maskAccountNumber(
          normalizedRecipientAccountNumber
        )}.${scheduleBackdated ? " Start date was in the past, so first run is queued now." : ""}`,
        category: "TRANSACTION",
        type: "SUCCESS",
        actionLink: "/transactions",
        metadata: {
          instructionId: instruction._id,
          frequency,
          nextRunAt: instruction.nextRunAt,
          startDate: instruction.startDate,
          maxExecutions: parsedMaxExecutions,
          scheduleBackdated,
        },
      });
    } catch (_) {}

    try {
      await AuditLog.create({
        userId: req.userId,
        action: "STANDING_INSTRUCTION_CREATED",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || "",
        metadata: {
          instructionId: instruction._id,
          amount: transferAmount,
          recipientAccountNumber: normalizedRecipientAccountNumber,
          frequency,
          startDate: instruction.startDate,
          maxExecutions: parsedMaxExecutions,
          scheduleBackdated,
        },
      });
    } catch (_) {}

    return res.status(201).json({
      success: true,
      message: scheduleBackdated
        ? "Standing instruction created. Start date was in the past, so first run is queued now."
        : "Standing instruction created successfully.",
      instruction,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateStandingInstructionStatus = async (req, res) => {
  try {
    const { instructionId } = req.params;
    const { active } = req.body;

    const instruction = await StandingInstruction.findOne({ _id: instructionId, userId: req.userId });
    if (!instruction) {
      return res.status(404).json({ success: false, message: "Standing instruction not found." });
    }

    if (instruction.status === "CANCELLED" || instruction.status === "COMPLETED") {
      return res.status(400).json({ success: false, message: "Instruction can no longer be modified." });
    }

    const previousStatus = instruction.status;
    if (active) {
      instruction.status = "ACTIVE";
      if (!instruction.nextRunAt || dayjs(instruction.nextRunAt).isBefore(dayjs())) {
        instruction.nextRunAt = new Date();
      }
    } else {
      instruction.status = "PAUSED";
    }
    await instruction.save();

    try {
      await createNotification({
        userId: req.userId,
        title: active ? "Standing Instruction Resumed" : "Standing Instruction Paused",
        message: active
          ? "Your standing instruction is active and will run on schedule."
          : "Your standing instruction is paused and will not run until resumed.",
        category: "TRANSACTION",
        type: "INFO",
        actionLink: "/transactions",
        metadata: { instructionId: instruction._id, previousStatus, currentStatus: instruction.status },
      });
    } catch (_) {}

    return res.status(200).json({
      success: true,
      message: `Instruction ${active ? "resumed" : "paused"} successfully.`,
      instruction,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.executeStandingInstructionNow = async (req, res) => {
  try {
    const { instructionId } = req.params;
    const { transactionPin } = req.body;

    const pinCheck = await verifyTransactionPin({ userId: req.userId, pin: transactionPin });
    if (!pinCheck.success) {
      return res.status(pinCheck.status).json(buildPinFailurePayload(pinCheck));
    }

    const lockedInstruction = await StandingInstruction.findOneAndUpdate(
      {
        _id: instructionId,
        userId: req.userId,
        status: { $in: ["ACTIVE", "PAUSED"] },
        isProcessing: false,
      },
      {
        $set: { isProcessing: true, lastAttemptAt: new Date() },
      },
      { new: true }
    );

    if (!lockedInstruction) {
      return res.status(404).json({
        success: false,
        message: "Standing instruction not found or currently busy.",
      });
    }

    const result = await executeStandingInstructionTransfer({
      instructionId: lockedInstruction._id,
      initiatedBy: "USER_MANUAL",
      requestMeta: { ipAddress: req.ip, userAgent: req.headers["user-agent"] || "" },
      keepPausedStatus: lockedInstruction.status === "PAUSED",
    });

    if (!result.success) {
      return res.status(result.status || 500).json({ success: false, message: result.message });
    }

    return res.status(200).json({
      success: true,
      message: "Standing instruction executed successfully.",
      senderBalance: result.senderBalance,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteStandingInstruction = async (req, res) => {
  try {
    const { instructionId } = req.params;
    const instruction = await StandingInstruction.findOne({ _id: instructionId, userId: req.userId });

    if (!instruction) {
      return res.status(404).json({ success: false, message: "Standing instruction not found." });
    }

    instruction.status = "CANCELLED";
    instruction.isProcessing = false;
    await instruction.save();

    try {
      await createNotification({
        userId: req.userId,
        title: "Standing Instruction Cancelled",
        message: "Your scheduled transfer has been cancelled successfully.",
        category: "TRANSACTION",
        type: "WARNING",
        actionLink: "/transactions",
        metadata: { instructionId: instruction._id },
      });
    } catch (_) {}

    return res.status(200).json({
      success: true,
      message: "Standing instruction cancelled successfully.",
      instruction,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.extendStandingInstruction = async (req, res) => {
  try {
    const { instructionId } = req.params;
    const { additionalExecutions, mpin } = req.body;

    const additionalExec = Number(additionalExecutions || 0);
    if (!Number.isFinite(additionalExec) || additionalExec <= 0 || additionalExec > 10) {
      return res.status(400).json({
        success: false,
        message: "Additional executions must be between 1 and 10.",
      });
    }

    const mpinCheck = await verifyTransactionPin({ userId: req.userId, pin: mpin });
    if (!mpinCheck.success) {
      return res.status(mpinCheck.status).json(buildPinFailurePayload(mpinCheck));
    }

    const instruction = await StandingInstruction.findOne({ _id: instructionId, userId: req.userId });
    if (!instruction) {
      return res.status(404).json({ success: false, message: "Standing instruction not found." });
    }

    if (instruction.status !== "COMPLETED") {
      return res.status(400).json({
        success: false,
        message: "Only completed standing instructions can be extended.",
      });
    }

    const currentMaxExecutions = instruction.maxExecutions || 0;
    const newMaxExecutions = currentMaxExecutions + additionalExec;

    if (newMaxExecutions > 100) {
      return res.status(400).json({
        success: false,
        message: "Total executions cannot exceed 100.",
      });
    }

    instruction.status = "ACTIVE";
    instruction.maxExecutions = newMaxExecutions;
    instruction.nextRunAt = dayjs().add(1, instruction.frequency.toLowerCase()).toDate();
    instruction.failureCount = 0;
    instruction.lastFailureReason = "";

    await instruction.save();

    try {
      await createNotification({
        userId: req.userId,
        title: "Standing Instruction Extended",
        message: `Your standing instruction has been extended by ${additionalExec} additional executions. New total: ${newMaxExecutions}.`,
        category: "TRANSACTION",
        type: "SUCCESS",
        actionLink: "/transactions",
        metadata: { instructionId: instruction._id, extensionCount: additionalExec },
      });
    } catch (_) {}

    try {
      await AuditLog.create({
        userId: req.userId,
        action: "STANDING_INSTRUCTION_EXTENDED",
        ipAddress: req.ip || "",
        userAgent: req.headers["user-agent"] || "",
        metadata: {
          instructionId: instruction._id,
          additionalExecutions: additionalExec,
          newMaxExecutions,
        },
      });
    } catch (_) {}

    return res.status(200).json({
      success: true,
      message: `Standing instruction extended by ${additionalExec} executions.`,
      instruction,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

exports.processDueStandingInstructions = async ({ limit = 25 } = {}) => {
  const now = new Date();
  const dueInstructions = await StandingInstruction.find({
    status: "ACTIVE",
    isProcessing: false,
    nextRunAt: { $lte: now },
  })
    .sort({ nextRunAt: 1, _id: 1 })
    .limit(Math.max(1, Number(limit) || 25))
    .select("_id");

  let processed = 0;
  let successCount = 0;
  let failedCount = 0;

  for (const entry of dueInstructions) {
    const lockedInstruction = await StandingInstruction.findOneAndUpdate(
      {
        _id: entry._id,
        status: "ACTIVE",
        isProcessing: false,
        nextRunAt: { $lte: now },
      },
      {
        $set: { isProcessing: true, lastAttemptAt: new Date() },
      },
      { new: true }
    );

    if (!lockedInstruction) continue;
    processed += 1;

    const result = await executeStandingInstructionTransfer({
      instructionId: lockedInstruction._id,
      initiatedBy: "SYSTEM_SCHEDULER",
      requestMeta: { ipAddress: "system", userAgent: "standing-instruction-processor" },
      keepPausedStatus: false,
    });

    if (result.success) {
      successCount += 1;
    } else {
      failedCount += 1;
    }
  }

  return {
    processed,
    successCount,
    failedCount,
  };
};
