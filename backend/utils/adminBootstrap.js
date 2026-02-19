const User = require("../models/User");
const { isAdminIdentity } = require("./adminIdentity");

const bootstrapAdminIdentities = async () => {
  try {
    const users = await User.find({}, "_id email phone role");
    const promoteIds = [];
    const demoteIds = [];

    users.forEach((entry) => {
      const matchesAdminIdentity = isAdminIdentity({ email: entry.email, phone: entry.phone });
      if (matchesAdminIdentity && entry.role !== "ADMIN") {
        promoteIds.push(entry._id);
      }
      if (!matchesAdminIdentity && entry.role === "ADMIN") {
        demoteIds.push(entry._id);
      }
    });

    if (promoteIds.length) {
      await User.updateMany({ _id: { $in: promoteIds } }, { $set: { role: "ADMIN", isActive: true } });
      console.log(`[admin-bootstrap] Promoted ${promoteIds.length} user(s) to ADMIN.`);
    }

    if (demoteIds.length) {
      await User.updateMany({ _id: { $in: demoteIds } }, { $set: { role: "USER" } });
      console.log(`[admin-bootstrap] Demoted ${demoteIds.length} user(s) to USER.`);
    }

    if (!promoteIds.length && !demoteIds.length) {
      console.log("[admin-bootstrap] Admin identities already in sync.");
    }
  } catch (error) {
    console.error("[admin-bootstrap] Failed:", error.message);
  }
};

module.exports = {
  bootstrapAdminIdentities,
};
