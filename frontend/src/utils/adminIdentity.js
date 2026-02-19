const ADMIN_EMAILS = ["sivasakthivelpalanisamy11@gmail.com"];
const ADMIN_PHONES = ["7418042205"];

const normalizeEmail = (value = "") => String(value).trim().toLowerCase();
const normalizePhone = (value = "") => String(value).replace(/\D/g, "");

export const isAdminIdentity = (user) => {
  const email = normalizeEmail(user?.email);
  const phone = normalizePhone(user?.phone);
  return ADMIN_EMAILS.includes(email) || ADMIN_PHONES.includes(phone);
};

export const isStrictAdminUser = (user) => user?.role === "ADMIN" && isAdminIdentity(user);
