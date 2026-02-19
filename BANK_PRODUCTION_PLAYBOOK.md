# BankIndia Production Playbook

This document explains what is implemented, how to apply it, and the exact steps to run this as a bank-handover ready platform.

## 1) Implemented Feature Set

### Customer Features
- Secure registration/login with lockout controls and token refresh.
- Account creation and account lifecycle (ACTIVE/INACTIVE/FROZEN/CLOSED).
- Deposit, withdraw, transfer, monthly statement PDF.
- Loan application, EMI payment, and loan lifecycle tracking.
- Profile updates and protected identity controls.
- Payment integration module (order creation, verification, webhook callback, failure flow, history).
- Secure 4-digit transaction PIN with hashed storage and lock protection on invalid attempts.
- PIN protection enforced for transfer, withdrawal, and loan EMI payment flows.
- Recipient resolution flow before transfer (account verify + beneficiary visibility).
- Money-out policy controls: single transfer/withdraw limits, daily limits, high-value beneficiary verification.
- High-value transfer OTP authorization with Nodemailer email-based OTP session.
- Easy loan apply UX with quick presets, instant EMI estimate, and secure EMI pay panel.

### Admin Features (Full Control)
- Users management (activate/deactivate with protected admin lock).
- Accounts management (status changes).
- Transactions and loan management.
- Payments management with refund action.
- Optional approval workflow for critical admin actions (refund, account status change, loan status change).
- Approval decision notifications to request owner via existing Nodemailer channel (if configured).
- Approval SLA/overdue/escalation indicators for pending approval operations.
- Payments review queue management for webhook exception resolution.
- Trend analytics + system stats.
- Audit log monitoring for security and operational actions.
- Protected admin identity enforcement.
- Rate limiting for auth, OTP, money-out, and payment write endpoints.
- Health and readiness endpoints for monitoring.

### Homepage / UX
- Before-login and after-login UI consistency.
- PDF-aligned service presentation (NRI, HNI, Wholesale, Agri, MSME).
- Service Explorer enriched with brochure-driven highlights.
- Typed navbar search with query-based service result rendering.
- EMI calculator hardened for direct amount/rate/tenure edits without invalid/static output.

---

## 2) Full Admin Control Behavior

Protected admin identity:
- Email: `sivasakthivelpalanisamy11@gmail.com`
- Phone: `7418042205`

Rules:
1. Admin routes require both `role=ADMIN` and protected identity match.
2. Non-matching admin users are auto-demoted to `USER` during bootstrap/login sync.
3. Protected admin account row is locked in admin users table.

Optional multi-admin mode:
1. Set `ALLOW_EXTRA_ADMINS=true` in backend env.
2. Provide comma-separated `ADMIN_EMAILS` and/or `ADMIN_PHONES`.
3. Restart backend.

---

## 3) Payment Integration (DB-Connected)

Implemented APIs:
- `PUT /api/auth/transaction-pin`
- `POST /api/transactions/resolve-recipient`
- `POST /api/payments/create-order`
- `POST /api/payments/verify`
- `POST /api/payments/webhook` (gateway callback)
- `POST /api/payments/:paymentId/fail`
- `GET /api/payments/my-payments`
- `GET /api/payments` (admin)
- `PUT /api/payments/:paymentId/refund` (admin)
- `GET /api/payments/review-queue` (admin)
- `PUT /api/payments/:paymentId/review-resolve` (admin)
- `GET /api/transactions/security-rules`
- `POST /api/transactions/request-transfer-otp`
- `GET /api/admin/audit-logs`
- `GET /api/admin/audit-logs/export`
- `GET /api/admin/approval-requests`
- `POST /api/admin/approval-requests/:approvalId/approve`
- `POST /api/admin/approval-requests/:approvalId/reject`
- `GET /api/admin/approval-requests/export`

Data persistence:
- User model includes transaction PIN security fields:
  - `transactionPinHash`
  - `transactionPinUpdatedAt`
  - `transactionPinAttempts`
  - `transactionPinLockedUntil`
- Transaction security rules endpoint exposes configured limits and user daily usage.
- Transfer/withdrawal policy enforces max single amount and daily totals.
- High-value transfer threshold enforces verified beneficiary even if global beneficiary enforcement is disabled.
- High-value transfer OTP flow (`TRANSFER_VERIFY`) enforces one-time Nodemailer email authorization when enabled.
- Admin audit logs include login, PIN, transfer, OTP, and payment lifecycle actions.
- Audit logs can be filtered and exported as CSV for compliance evidence.
- New `Payment` model stores gateway order, status, method, amount, metadata.
- Verification credits account balance and writes:
  - `Transaction` (`PAYMENT_CREDIT`)
  - `LedgerEntry` (CREDIT)
- Webhook success events are idempotent and do not double-credit settled payments.
- Webhook refund events attempt automatic balance reversal; if reversal is blocked, payment is flagged for manual review.
- Admin review queue APIs allow secure closure of pending-review webhook exceptions.
- Refund reverses account credit with:
  - `Transaction` (`PAYMENT_REFUND`)
  - `LedgerEntry` (DEBIT)

Gateway modes:
1. `MOCK` for UAT/demo.
2. `RAZORPAY` for live gateway integration via key/secret.

---

## 4) Setup Steps (Apply and Run)

## 4.1 Backend
1. Copy `backend/.env.example` to `backend/.env`.
2. Fill required values: `MONGO_URI`, `JWT_SECRET`, `CORS_ORIGIN`.
3. Configure transaction policy controls as needed:
   - `MAX_SINGLE_TRANSFER`
   - `DAILY_TRANSFER_LIMIT`
   - `HIGH_VALUE_TRANSFER_THRESHOLD`
   - `REQUIRE_TRANSFER_OTP_FOR_HIGH_VALUE`
   - `MAX_SINGLE_WITHDRAWAL`
   - `DAILY_WITHDRAWAL_LIMIT`
4. Configure Nodemailer transport:
   - Service mode: `EMAIL_TRANSPORT=service`, `EMAIL_SERVICE=gmail`, `EMAIL_USER`, `EMAIL_PASSWORD`
   - SMTP mode: `EMAIL_TRANSPORT=smtp`, `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_SECURE`, `EMAIL_REQUIRE_TLS`, optional `EMAIL_USER`/`EMAIL_PASSWORD`
   - Sender identity: `EMAIL_FROM_NAME`, `EMAIL_FROM_ADDRESS`
5. Choose gateway mode:
   - UAT: `PAYMENT_GATEWAY_MODE=MOCK`
   - Live: `PAYMENT_GATEWAY_MODE=RAZORPAY` + `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
6. Install dependencies and run:
```bash
cd backend
npm install
npm run dev
```

7. Optional rate limit tuning:
   - `API_RATE_LIMIT_WINDOW_MINUTES`, `API_RATE_LIMIT_MAX`
   - `AUTH_RATE_LIMIT_WINDOW_MINUTES`, `AUTH_RATE_LIMIT_MAX`
   - `LOGIN_RATE_LIMIT_MAX`, `REGISTER_RATE_LIMIT_MAX`
   - `OTP_RATE_LIMIT_WINDOW_MINUTES`, `OTP_RATE_LIMIT_MAX`
   - `MONEY_OUT_RATE_LIMIT_WINDOW_MINUTES`, `MONEY_OUT_RATE_LIMIT_MAX`
   - `PAYMENT_WRITE_RATE_LIMIT_WINDOW_MINUTES`, `PAYMENT_WRITE_RATE_LIMIT_MAX`

7. Optional approval workflow configuration:
   - `ADMIN_APPROVAL_MODE=DISABLED` for direct action execution
   - `ADMIN_APPROVAL_MODE=ENABLED` to require approval requests before execution
   - `ADMIN_APPROVAL_REQUIRED_ACTIONS` as comma list of:
     - `PAYMENT_REFUND`
     - `LOAN_STATUS_UPDATE`
     - `ACCOUNT_STATUS_UPDATE`
   - If action list is blank and mode is `ENABLED`, all listed actions require approval
   - Optional strict dual-control:
     - `ADMIN_APPROVAL_ENFORCE_DUAL_CONTROL=true` prevents self-approval/self-rejection
     - keep `false` for single-admin demo/UAT
   - Optional review-note enforcement:
     - `ADMIN_APPROVAL_REQUIRE_REVIEW_NOTE=true` requires non-empty reviewer reason on approve/reject
   - Optional SLA windows for approval queue:
     - `ADMIN_APPROVAL_SLA_HOURS` (default `24`)
     - `ADMIN_APPROVAL_ESCALATION_HOURS` (default `48`)

7. Configure gateway webhook (Razorpay dashboard):
   - URL: `https://<your-domain>/api/payments/webhook`
   - Secret: same value as `RAZORPAY_WEBHOOK_SECRET`
   - Subscribe events: `payment.captured`, `order.paid`, `payment.failed`, `refund.processed`

## 4.2 Frontend
1. Copy `frontend/.env.example` to `frontend/.env`.
2. Set backend URL if needed (`REACT_APP_API_URL`).
3. Install and run:
```bash
cd frontend
npm install
npm start
```

## 4.3 Initial Verification
1. Register a normal user and create account.
2. Login with protected admin identity and open `/admin`.
3. User panel: open `/security/transaction-pin`, set transaction PIN.
4. User panel: open `/transactions`, verify recipient, transfer with PIN.
5. User panel: test withdrawal from dashboard/transactions with PIN.
6. User panel: after loan approval, pay EMI from `/loans` with PIN.
7. User panel: open `/payments`, create order, verify success.
8. Check:
   - Account balance increased
   - Transaction history has `PAYMENT_CREDIT`
   - Admin Payments tab shows record
9. From admin, test refund and verify `PAYMENT_REFUND` entry.
10. Verify transfer/withdrawal above configured limits is blocked and shows remaining amount message.
11. Verify high-value transfer requires OTP request, rejects wrong OTP, and accepts correct OTP.
12. Verify admin audit logs show LOGIN_FAILED, TRANSFER_OTP_REQUEST, TRANSFER, and PAYMENT actions.
13. Verify audit log CSV export downloads successfully with action metadata.
14. If approval mode is enabled, perform account/loan/refund admin actions and complete them via Approvals tab.
15. Verify requester receives approval decision email for executed/rejected/failed requests.
16. Call `/api/health` and verify `status=ok`.
17. Call `/api/ready` after DB connect and verify `status=ready`.
18. Open `/transactions` and download monthly statement PDF.

---

## 5) Bank Handover Readiness Checklist

Mandatory before bank production:
1. Move to dedicated production MongoDB cluster with backup + PITR.
2. Enable HTTPS, WAF, and strict CORS by environment.
3. Replace MOCK gateway with live Razorpay credentials.
4. Configure production webhook in Razorpay dashboard and test retry/idempotency behavior.
5. Add CI pipeline with lint/test/build/security scan gates.
6. Add centralized logs, metrics, and alerting (auth failures, payment failures, 5xx spikes).
7. Perform VAPT and fix findings.
8. Define incident response and rollback runbook.
9. Create role matrix and maker-checker controls if bank policy requires.
10. Execute UAT + load test + DR drill and signoff.

---

## 6) UAT Scenario Pack (Recommended)

1. Login lockout after repeated failures.
2. Protected admin cannot be deactivated.
3. Payment create -> verify -> account credit.
4. Payment refund -> account debit reversal.
5. Transfer with/without beneficiary enforcement.
6. Loan apply -> admin approve -> EMI payment.
7. Session expiry and token refresh flow.
8. Unauthorized user attempting admin routes.
9. Single/daily transfer and withdrawal limit enforcement.
10. High-value transfer OTP authorization flow.

---

## 7) Important Note

This project now includes core bank-like functional flows with payment + admin control + DB persistence.  
For a real bank rollout, the checklist in section 5 must be completed and formally approved.
