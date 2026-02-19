const { isAdminIdentity } = require("../utils/adminIdentity");

exports.authorize = (requiredRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    if (!requiredRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${requiredRoles.join(", ")}`,
      });
    }

    next();
  };
};

// Shorthand for admin-only routes
exports.adminOnly = (req, res, next) => {
  const hasAdminRole = req.user?.role === "ADMIN";
  const hasAdminIdentity = isAdminIdentity({ email: req.user?.email, phone: req.user?.phone });

  if (!hasAdminRole || !hasAdminIdentity) {
    return res.status(403).json({
      success: false,
      message: "Admin access required",
    });
  }
  next();
};
