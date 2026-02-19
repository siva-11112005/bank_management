const User = require('../models/User');
const PasswordReset = require('../models/PasswordReset');
const { sendPasswordResetEmail } = require('../utils/emailService');
const crypto = require('crypto');

// Request password reset
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    // Validate email
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    // Find user by email
    const user = await User.findOne({ email });

    if (!user) {
      // Security: Don't reveal if email exists
      return res
        .status(400)
        .json({
          message: 'If this email exists, a reset link has been sent',
        });
    }

    // Delete any existing reset tokens for this user
    await PasswordReset.deleteMany({ userId: user._id });

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Create password reset record
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour expiry
    await PasswordReset.create({
      userId: user._id,
      email: user.email,
      token: hashedToken,
      expiresAt,
    });

    // Send email with reset token
    try {
      await sendPasswordResetEmail(user.email, resetToken, user.firstName);
    } catch (emailError) {
      await PasswordReset.deleteOne({ token: hashedToken });
      return res.status(500).json({
        message: 'Failed to send reset email. Please try again later.',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Password reset link sent to your email',
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      message: 'Error processing password reset request',
      error: error.message,
    });
  }
};

// Reset password with token
exports.resetPassword = async (req, res) => {
  try {
    const { token, newPassword, confirmPassword } = req.body;

    // Validate inputs
    if (!token || !newPassword || !confirmPassword) {
      return res.status(400).json({
        message: 'Token and new password are required',
      });
    }

    // Validate password match
    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        message: 'Passwords do not match',
      });
    }

    // Validate password strength
    if (newPassword.length < 6) {
      return res.status(400).json({
        message: 'Password must be at least 6 characters long',
      });
    }

    // Hash the token to find it in database
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Find password reset record
    const passwordReset = await PasswordReset.findOne({
      token: hashedToken,
      isUsed: false,
      expiresAt: { $gt: new Date() }, // Token not expired
    });

    if (!passwordReset) {
      return res.status(400).json({
        message: 'Invalid or expired reset link',
      });
    }

    // Find user and update password
    const user = await User.findById(passwordReset.userId);

    if (!user) {
      return res.status(404).json({
        message: 'User not found',
      });
    }

    // Update password (will be hashed by pre-save hook)
    user.password = newPassword;
    await user.save();

    // Mark reset token as used
    passwordReset.isUsed = true;
    await passwordReset.save();

    res.status(200).json({
      success: true,
      message: 'Password reset successfully',
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      message: 'Error resetting password',
      error: error.message,
    });
  }
};

// Verify reset token
exports.verifyResetToken = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ message: 'Token is required' });
    }

    // Hash the token
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Find password reset record
    const passwordReset = await PasswordReset.findOne({
      token: hashedToken,
      isUsed: false,
      expiresAt: { $gt: new Date() },
    });

    if (!passwordReset) {
      return res.status(400).json({
        valid: false,
        message: 'Invalid or expired reset link',
      });
    }

    res.status(200).json({
      valid: true,
      message: 'Reset token is valid',
    });
  } catch (error) {
    console.error('Verify token error:', error);
    res.status(500).json({
      message: 'Error verifying token',
      error: error.message,
    });
  }
};
