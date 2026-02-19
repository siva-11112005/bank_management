import axios from "axios";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000/api";

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (
      error.response?.status === 401 &&
      !originalRequest?._retry &&
      !originalRequest?.url?.includes("/auth/login") &&
      !originalRequest?.url?.includes("/auth/register")
    ) {
      originalRequest._retry = true;

      try {
        const refreshResponse = await api.post("/auth/refresh");
        const refreshedToken = refreshResponse?.data?.token;

        if (refreshedToken) {
          localStorage.setItem("token", refreshedToken);
          originalRequest.headers.Authorization = `Bearer ${refreshedToken}`;
        }

        return api(originalRequest);
      } catch (refreshError) {
        localStorage.removeItem("token");
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

// Auth APIs
export const register = (data) => api.post("/auth/register", data);
export const login = (data) => api.post("/auth/login", data);
export const logout = () => api.post("/auth/logout");
export const getProfile = () => api.get("/auth/profile");
export const requestProfileUpdateOtp = (data) => api.post("/auth/profile/request-otp", data);
export const updateProfile = (data) => api.put("/auth/profile", data);
export const setTransactionPin = (data) => api.put("/auth/transaction-pin", data);
export const getNominee = () => api.get("/auth/nominee");
export const upsertNominee = (data) => api.put("/auth/nominee", data);
export const deleteNominee = () => api.delete("/auth/nominee");

// Account APIs
export const createAccount = (data) => api.post("/accounts/create", data);
export const getMyAccount = () => api.get("/accounts/my-account");
export const getAllAccounts = () => api.get("/accounts");
export const getAccountById = (accountId) => api.get(`/accounts/${accountId}`);
export const depositMoney = (data) => api.post("/accounts/deposit", data);
export const withdrawMoney = (data) => api.post("/accounts/withdraw", data);
export const updateAccountStatus = (accountId, status) =>
  api.put(`/accounts/${accountId}/status`, { status });

// Transaction APIs
export const getMyTransactions = () => api.get("/transactions/my-transactions");
export const getTransactionSecurityRules = () => api.get("/transactions/security-rules");
export const getAllTransactions = () => api.get("/transactions");
export const deposit = (data) => api.post("/transactions/deposit", data);
export const withdraw = (data) => api.post("/transactions/withdraw", data);
export const transfer = (data, config = {}) => api.post("/transactions/transfer", data, config);
export const resolveRecipient = (data) => api.post("/transactions/resolve-recipient", data);
export const requestTransferOtp = (data) => api.post("/transactions/request-transfer-otp", data);
export const getMonthlyStatementPdf = (year, month) => api.get(`/transactions/statement/${year}/${month}`, { responseType: "blob" });
export const getStandingInstructions = () => api.get("/transactions/standing-instructions");
export const createStandingInstruction = (data) => api.post("/transactions/standing-instructions", data);
export const updateStandingInstructionStatus = (instructionId, active) =>
  api.put(`/transactions/standing-instructions/${instructionId}/status`, { active });
export const executeStandingInstructionNow = (instructionId, transactionPin) =>
  api.post(`/transactions/standing-instructions/${instructionId}/execute-now`, { transactionPin });
export const deleteStandingInstruction = (instructionId) => api.delete(`/transactions/standing-instructions/${instructionId}`);
export const extendStandingInstruction = (instructionId, payload) => api.post(`/transactions/standing-instructions/${instructionId}/extend`, payload);

// Admin APIs
export const getAdminStats = () => api.get("/admin/stats");
export const getAllUsers = () => api.get("/admin/users");
export const updateAdminUser = (userId, data) => api.put(`/admin/users/${userId}`, data);
export const deactivateUser = (userId) => api.put(`/admin/users/${userId}/deactivate`);
export const activateUser = (userId) => api.put(`/admin/users/${userId}/activate`);
export const unblockUserTransactions = (userId) => api.put(`/admin/users/${userId}/unblock-transactions`);
export const getAdminTrends = () => api.get("/admin/trends");
export const getAdminAuditLogs = (query = {}) => api.get("/admin/audit-logs", { params: query });
export const getAdminAuditLogsExport = (query = {}) =>
  api.get("/admin/audit-logs/export", { params: query, responseType: "blob" });
export const getAdminApprovalRequests = (query = {}) => api.get("/admin/approval-requests", { params: query });
export const getAdminApprovalRequestsExport = (query = {}) =>
  api.get("/admin/approval-requests/export", { params: query, responseType: "blob" });
export const approveAdminApprovalRequest = (approvalId, reviewNote = "Approved by admin") =>
  api.post(`/admin/approval-requests/${approvalId}/approve`, { reviewNote });
export const rejectAdminApprovalRequest = (approvalId, reviewNote = "Rejected by admin") =>
  api.post(`/admin/approval-requests/${approvalId}/reject`, { reviewNote });
export const escalateAdminApprovalRequest = (approvalId, escalationNote = "Escalated by admin") =>
  api.post(`/admin/approval-requests/${approvalId}/escalate`, { escalationNote });
export const escalateOverdueAdminApprovalRequests = (escalationNote = "Escalated due to pending SLA breach", limit = 200) =>
  api.post("/admin/approval-requests/escalate-overdue", { escalationNote, limit });
export const getAllLoans = () => api.get("/loans");
export const updateLoanStatus = (loanId, status) => api.put(`/loans/${loanId}/status`, { status });

// Loan APIs (User)
export const applyLoan = (data) => api.post("/loans/apply", data);
export const getMyLoans = () => api.get("/loans/my-loans");
export const payLoanEmi = (loanId, data = {}) => api.post(`/loans/${loanId}/pay`, data);

// Beneficiaries
export const listBeneficiaries = () => api.get("/beneficiaries");
export const addBeneficiary = (data) => api.post("/beneficiaries", data);
export const verifyBeneficiary = (data) => api.post("/beneficiaries/verify", data);
export const resendBeneficiaryOtp = (beneficiaryId) => api.post(`/beneficiaries/${beneficiaryId}/resend-otp`);
export const removeBeneficiary = (beneficiaryId) => api.delete(`/beneficiaries/${beneficiaryId}`);

// Payments
export const createPaymentOrder = (data) => api.post("/payments/create-order", data);
export const verifyPayment = (data) => api.post("/payments/verify", data);
export const markPaymentFailed = (paymentId, reason) => api.post(`/payments/${paymentId}/fail`, { reason });
export const getMyPayments = () => api.get("/payments/my-payments");
export const getAllPayments = (query = {}) => api.get("/payments", { params: query });
export const refundPayment = (paymentId, reason) => api.put(`/payments/${paymentId}/refund`, { reason });
export const getPaymentReviewQueue = (query = {}) => api.get("/payments/review-queue", { params: query });
export const resolvePaymentReview = (paymentId, resolutionNote) =>
  api.put(`/payments/${paymentId}/review-resolve`, { resolutionNote });

// Support tickets
export const createSupportTicket = (data) => api.post("/support/create", data);
export const getMySupportTickets = () => api.get("/support/my-tickets");
export const closeMySupportTicket = (ticketId) => api.put(`/support/${ticketId}/close`);
export const getAllSupportTicketsAdmin = (query = {}) => api.get("/support/admin/tickets", { params: query });
export const updateSupportTicketAdmin = (ticketId, data) => api.put(`/support/admin/tickets/${ticketId}/status`, data);

// Notifications
export const getMyNotifications = (query = {}) => api.get("/notifications/my", { params: query });
export const getUnreadNotificationCount = () => api.get("/notifications/unread-count");
export const markNotificationRead = (notificationId) => api.put(`/notifications/${notificationId}/read`);
export const markAllNotificationsRead = () => api.put("/notifications/mark-all-read");
export const deleteNotification = (notificationId) => api.delete(`/notifications/${notificationId}`);

// Cards
export const getMyCards = () => api.get("/cards/my");
export const getMyCardRequests = () => api.get("/cards/my-requests");
export const applyCard = (data) => api.post("/cards/apply", data);
export const requestCardAction = (cardId, data) => api.post(`/cards/${cardId}/request-action`, data);
export const getAllCardRequestsAdmin = (query = {}) => api.get("/cards/admin/requests", { params: query });
export const resolveCardRequestAdmin = (requestId, data) => api.put(`/cards/admin/requests/${requestId}/resolve`, data);

// KYC
export const getMyKycStatus = () => api.get("/kyc/my-status");
export const getMyKycRequests = () => api.get("/kyc/my-requests");
export const submitKyc = (data) => api.post("/kyc/submit", data);
export const getAllKycRequestsAdmin = (query = {}) => api.get("/kyc/admin/requests", { params: query });
export const resolveKycRequestAdmin = (requestId, data) => api.put(`/kyc/admin/requests/${requestId}/resolve`, data);

export default api;
