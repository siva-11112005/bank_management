const DEFAULT_ADMIN_EMAILS = ["sivasakthivelpalanisamy11@gmail.com"];
const DEFAULT_ADMIN_PHONES = ["7418042205"];

const normalizeEmail = (value = "") => String(value).trim().toLowerCase();
const normalizePhone = (value = "") => String(value).replace(/\D/g, "");

const getEnvList = (name) =>
  String(process.env[name] || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const getAdminIdentityLists = () => {
  const allowExtraAdmins = String(process.env.ALLOW_EXTRA_ADMINS || "false").toLowerCase() === "true";
  const extraEmails = allowExtraAdmins ? getEnvList("ADMIN_EMAILS") : [];
  const extraPhones = allowExtraAdmins ? getEnvList("ADMIN_PHONES") : [];

  const emailSet = new Set([...DEFAULT_ADMIN_EMAILS, ...extraEmails].map(normalizeEmail));
  const phoneSet = new Set([...DEFAULT_ADMIN_PHONES, ...extraPhones].map(normalizePhone));

  return {
    emails: Array.from(emailSet),
    phones: Array.from(phoneSet),
  };
};

const isAdminIdentity = ({ email, phone }) => {
  const { emails, phones } = getAdminIdentityLists();
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizePhone(phone);
  return emails.includes(normalizedEmail) || phones.includes(normalizedPhone);
};

module.exports = {
  isAdminIdentity,
  getAdminIdentityLists,
  normalizeEmail,
  normalizePhone,
};
