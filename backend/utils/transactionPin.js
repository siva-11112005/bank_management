const bcrypt = require("bcryptjs");
const User = require("../models/User");

const verifyTransactionPin = async ({
  userId,
  pin,
  maxAttempts = 3,
  lockMinutes = 24 * 60,
}) => {
  const user = await User.findById(userId).select(
    "+transactionPinHash +transactionPinAttempts +transactionPinLockedUntil"
  );

  if (!user) {
    return { success: false, status: 404, message: "User not found." };
  }

  if (!user.transactionPinHash) {
    return { success: false, status: 400, message: "Set your 4-digit transaction PIN before this operation." };
  }

  if (user.transactionPinLockedUntil && user.transactionPinLockedUntil > new Date()) {
    return {
      success: false,
      status: 423,
      message: "Transaction PIN is blocked for 24 hours due to repeated invalid attempts.",
      lockedUntil: user.transactionPinLockedUntil,
    };
  }

  if (!pin || !/^\d{4}$/.test(String(pin))) {
    return { success: false, status: 400, message: "Valid 4-digit transaction PIN is required." };
  }

  const isValid = await bcrypt.compare(String(pin), user.transactionPinHash);
  if (!isValid) {
    const nextAttempts = (user.transactionPinAttempts || 0) + 1;
    const attemptsLeft = Math.max(0, maxAttempts - nextAttempts);
    const update = { transactionPinAttempts: nextAttempts };

    if (nextAttempts >= maxAttempts) {
      update.transactionPinLockedUntil = new Date(Date.now() + lockMinutes * 60 * 1000);
      update.transactionPinAttempts = 0;
      await User.findByIdAndUpdate(userId, update);
      return {
        success: false,
        status: 423,
        message: "Transaction PIN blocked for 24 hours due to 3 unsuccessful attempts.",
        lockedUntil: update.transactionPinLockedUntil,
      };
    }

    await User.findByIdAndUpdate(userId, update);
    return {
      success: false,
      status: 401,
      message: `Invalid transaction PIN. ${attemptsLeft} attempt(s) remaining before 24-hour block.`,
      attemptsLeft,
    };
  }

  if (user.transactionPinAttempts || user.transactionPinLockedUntil) {
    await User.findByIdAndUpdate(userId, { transactionPinAttempts: 0, transactionPinLockedUntil: null });
  }

  return { success: true, user };
};

module.exports = {
  verifyTransactionPin,
};
