# BankIndia UI + Feature Implementation Summary (Updated 2026-02-12)

This document captures what has been implemented for your requirements:
- Add PDF-driven content/features to home and services.
- Keep before-login and after-login UI consistency.
- Ensure all key banking features remain available after login.
- Enforce strict full-admin control for your protected admin identity.
- Integrate payment flow with DB-backed accounting entries.

## 1) Final Scope Delivered

- Homepage redesigned with a consistent premium banking UI and unified navigation.
- Service Explorer expanded with large feature catalog and brochure-driven presentation.
- After login, same design language is preserved through shared navbar, cards, actions, and service links.
- Full admin control enabled through protected identity checks on backend and frontend.
- Payment integration implemented with persistent `Payment` records and account balance settlement logic.
- Admin panel expanded with payments tab, refund flow, and payment-level analytics in stats.
- Loan section upgraded with quick-apply presets and EMI estimate preview for easier application.
- Dashboard now includes a quick EMI calculator card with live EMI/interest/total payoff preview.
- Service Explorer calculators pages now render live EMI/FD/RD/SIP calculator widgets with real-time results.
- Service Explorer service cards now use product-specific banking CTAs (Apply, Book, Track, Request, Report, Find Branch) instead of only static `View Details`.
- Card services now map to explicit actions (`Apply Credit Card`, `Manage Debit Card`, `Apply Forex Card`, `Track Card Request`, `Set Card PIN`, `Block or Reissue`, `Apply Business Card`) for real-bank behavior.
- Loan apply flow now includes full product coverage from service catalog (personal, home, car, business, tractor, consumer durable, two-wheeler, horticulture, allied activities, and working capital) with deep-link prefill from service cards.
- All major service categories now have explicit product-level CTA mapping (accounts, deposits, cards, loans, insurance, investments, wholesale, agri, MSME, schemes, trade, support, security, calculators, offers, about, and regulatory) for bank-like action behavior.
- Transactions page now includes complete Beneficiary Management (add, verify via OTP, resend OTP, remove, and one-click use in transfer).
- New Support Center page (`/support`) added with ticket creation, tracking, and user-side closure workflow.
- Notification Center added with unread badge in navbar, real-time banking alerts, mark-read/mark-all-read/remove actions, and deep links to related pages.
- Standing Instructions (scheduled transfers) module added with create/list/pause/resume/execute-now/cancel actions and automated background execution cycle.
- Card Lifecycle module added with card application, block/unblock, reissue, PIN-reset, and limit-update request workflows plus admin approval controls.
- KYC Center module added with customer KYC submission/history/status tracking and full admin approve/reject controls.
- Admin panel now includes a dedicated `Support` tab to search tickets and update support ticket status (`OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`).
- Admin panel now includes dedicated `Cards` and `KYC` tabs with searchable queues and decision actions.
- Transactions section upgraded with recipient verification, beneficiary quick select, and PIN-protected transfer/withdraw flow.
- Monthly statement PDF download added to transactions page (year/month selection).
- Monthly statement PDF generation corrected for ledger-accurate opening/closing balances and clean tabular debit/credit formatting.
- Dashboard now includes a statement download card with quick access to transactions.
- Secure transaction PIN page added (`/security/transaction-pin`) with encrypted-hash storage behavior.
- Navbar cleaned for authenticated users with profile menu access and logout moved under profile actions.
- Navbar search upgraded to typed search input with query-based service results.
- Navbar search now provides recommendations and up to 4 live matching services on desktop and mobile.
- Top navbar includes Support, About, and Regulatory categories again with one-line horizontal-scroll access.
- Navbar search supports keyboard navigation (`ArrowUp/ArrowDown/Enter/Escape`) with active suggestion highlight.
- Navbar search now includes `See all results for "<query>"` action in desktop/mobile suggestions for direct full-page result navigation.
- Navbar search dropdown now separates `Matching Services` and `Recommended` groups and supports scroll-safe popup behavior (no viewport cut-off).
- Calculator pages now include short plain-language explainers for EMI, FD, RD, and SIP so users understand results.
- Calculators category page now includes a quick explanation grid with direct links to each calculator.
- Top navbar quick actions now remove direct Dashboard/Transactions buttons and move Dashboard access under profile menu as requested.
- Admin access button style aligned with other top action buttons (transactions/payments style consistency).
- Desktop navbar layout now keeps logo pinned left and wraps menu rows so all service categories remain visible.
- EMI calculator input behavior fixed to avoid static/invalid zero outputs and support direct amount entry.
- Desktop navbar search input no longer collapses to icon-only state on medium-wide screens.
- Loan/admin EMI display now uses computed fallback when stored EMI is missing, avoiding repetitive static `0` values.
- Dashboard account details card now handles long account numbers safely (no overlap with account type or other fields).
- Profile update flow upgraded to mandatory email OTP verification (`request OTP -> verify OTP -> apply changes`).
- Profile `Account Overview` card layout refined to 2-column stat tiles with overflow-safe text to avoid broken popup/card rendering.
- Profile page now includes direct `Open Dashboard` and `Open Transactions` shortcuts for easier access after navbar simplification.
- Loan EMI payment flow upgraded with secure PIN input and amount control per approved loan.
- Service CTAs now route non-transaction product flows into context-aware support requests (`/support`) with auto-prefilled service category/name.
- Docker stack upgraded for one-command full app launch (`mongo + backend + frontend`) with health checks and readiness-based startup ordering.
- Money-out policy controls added with single/daily limits and high-value beneficiary checks.
- High-value transfer OTP authorization added (email OTP challenge before transfer execution).
- Optional approval workflow added for critical admin actions (refund, loan status update, account status update).
- Approval decision notifications can be sent to request owner email through existing Nodemailer setup.
- Approval workflow now supports SLA/overdue/escalation visibility in admin panel and export data.
- Admin audit monitoring added with security/event log visibility in admin panel.
- Production-safe rate limiting added for auth, OTP, money-out, and payment write actions.
- Health/readiness endpoints added for monitoring and orchestration (`/api/health`, `/api/ready`).
- Legacy non-banking role wording has been removed and replaced with correct banking domain terminology.

## 2) Admin Identity (Confirmed)

Protected admin identity is enforced as:
- Email: `sivasakthivelpalanisamy11@gmail.com`
- Phone: `7418042205`

Behavior:
1. User gets admin role only when identity matches protected email/phone rule.
2. Admin route access requires `role=ADMIN` plus strict identity validation.
3. Protected admin cannot be deactivated from admin user controls.
4. On login/bootstrap sync, invalid admin identities are demoted to `USER`.

## 3) Homepage + Post-Login UX Consistency

Implemented:
1. Same top-level visual system is used before and after login (shared `HomeNavbar`, consistent CTA styling, and service access).
2. Post-login `WorkspaceActions` now includes:
   - Dashboard
   - Transactions
   - Payments
   - Loans
   - Service Explorer
   - Profile
3. Admin users get direct `Admin Command Center` entry from post-login workspace.

## 4) PDF Feature Coverage Added

All brochure-mapped segments are now represented in home/service navigation flow:
1. Accounts / NRI
2. Investments / HNI
3. Loans / Agri Financing
4. Cards
5. Wholesale Banking
6. MSME Banking
7. Government Schemes
8. Trade Services
9. Support
10. Regulatory / Compliance

`ServiceCatalog` coverage has been expanded with detailed items including:
- NRI flows: subsequent NRE, PAN/mobile/signature/name updates, nominee changes.
- Wholesale flows: CBX, corporates, government, institutions, API banking.
- Agri flows: Kisan services, tractor/crop/allied financing, rural banking.
- MSME flows: working capital, business cards, one-place business banking.
- Government schemes: PM FME, CGTMSE, startup guarantee, PMEGP, PMFBY.
- Trade flows: import/export, buyers credit, bill discounting, multi-currency.
- Support/compliance flows: contact, grievance, NRI mailbox, policy/disclosures.

## 5) Payment Integration + DB Logic

Implemented API endpoints:
1. `POST /api/payments/create-order`
2. `POST /api/payments/verify`
3. `POST /api/payments/webhook` (gateway callback)
4. `POST /api/payments/:paymentId/fail`
5. `GET /api/payments/my-payments`
6. `GET /api/payments` (admin)
7. `PUT /api/payments/:paymentId/refund` (admin)
8. `GET /api/payments/review-queue` (admin)
9. `PUT /api/payments/:paymentId/review-resolve` (admin)
10. `GET /api/transactions/security-rules`
11. `POST /api/transactions/request-transfer-otp`
12. `GET /api/admin/audit-logs`
13. `GET /api/admin/audit-logs/export`
14. `POST /api/auth/profile/request-otp`
15. `PUT /api/auth/profile` (OTP-verified update)
16. `GET /api/admin/approval-requests`
17. `POST /api/admin/approval-requests/:approvalId/approve`
18. `POST /api/admin/approval-requests/:approvalId/reject`
19. `GET /api/admin/approval-requests/export`
20. `POST /api/beneficiaries/:beneficiaryId/resend-otp`
21. `DELETE /api/beneficiaries/:beneficiaryId`
22. `POST /api/support/create`
23. `GET /api/support/my-tickets`
24. `PUT /api/support/:ticketId/close`
25. `GET /api/support/admin/tickets` (admin)
26. `PUT /api/support/admin/tickets/:ticketId/status` (admin)
27. `GET /api/notifications/my`
28. `GET /api/notifications/unread-count`
29. `PUT /api/notifications/mark-all-read`
30. `PUT /api/notifications/:notificationId/read`
31. `DELETE /api/notifications/:notificationId`
32. `GET /api/transactions/standing-instructions`
33. `POST /api/transactions/standing-instructions`
34. `PUT /api/transactions/standing-instructions/:instructionId/status`
35. `POST /api/transactions/standing-instructions/:instructionId/execute-now`
36. `DELETE /api/transactions/standing-instructions/:instructionId`
37. `GET /api/cards/my`
38. `GET /api/cards/my-requests`
39. `POST /api/cards/apply`
40. `POST /api/cards/:cardId/request-action`
41. `GET /api/cards/admin/requests` (admin)
42. `PUT /api/cards/admin/requests/:requestId/resolve` (admin)
43. `GET /api/kyc/my-status`
44. `GET /api/kyc/my-requests`
45. `POST /api/kyc/submit`
46. `GET /api/kyc/admin/requests` (admin)
47. `PUT /api/kyc/admin/requests/:requestId/resolve` (admin)

Data and accounting behavior:
1. Payment order stored in `Payment` model with gateway order reference.
2. Verify success:
   - marks payment `SUCCESS`
   - credits account balance
   - inserts `Transaction` type `PAYMENT_CREDIT`
   - inserts matching `LedgerEntry` credit
3. Refund from admin:
   - validates refundable state
   - debits account balance
   - marks payment `REFUNDED`
   - inserts `Transaction` type `PAYMENT_REFUND`
   - inserts matching `LedgerEntry` debit
4. Gateway webhook:
   - validates `x-razorpay-signature` using raw payload + webhook secret
   - idempotently settles `payment.captured` / `order.paid` events
   - handles `payment.failed` updates
   - handles `refund.processed` with auto-reversal or manual-review flag when reversal fails
5. Manual review controls:
   - review queue endpoint returns payments with pending webhook review flags
   - admin can resolve/close review items from admin payments panel

Transaction security behavior:
1. `PUT /api/auth/transaction-pin` sets/updates 4-digit transaction PIN.
2. PIN is stored as hash (`transactionPinHash`) and never stored in plain text.
3. Money-out flows now require `transactionPin`:
   - transfer
   - withdrawal
   - loan EMI payment
4. Repeated invalid PIN entries trigger temporary lock (`transactionPinLockedUntil`).
5. `POST /api/transactions/resolve-recipient` returns recipient verification details before transfer.
6. `GET /api/transactions/security-rules` returns current transaction limits and today's usage.
7. Transfers and withdrawals enforce single and daily limits from env policy.
8. High-value transfers enforce beneficiary verification even when global beneficiary enforcement is off.
9. High-value transfers can require Nodemailer email OTP (`TRANSFER_VERIFY`) before transaction execution.
10. Profile change requests now issue email OTP (`PROFILE_UPDATE_VERIFY`) and apply changes only after OTP verification.

Gateway modes:
1. `MOCK` for testing/UAT
2. `RAZORPAY` for live integration with key/secret

## 6) Full Admin Control (What Admin Can Do)

Admin panel now supports:
1. View system stats (users, accounts, transactions, loans, payments, balances, payment volume).
2. View pending payment review count (`metadata.webhookRefundPendingReview`).
3. Manage users (activate/deactivate except protected admin account).
4. Manage account status (`ACTIVE`, `INACTIVE`, `FROZEN`).
5. View transactions.
6. Approve/reject/close loans.
7. View all payments, resolve review queue items, and trigger refunds for successful payments.
8. View trends (transactions/new users/new accounts).
9. View audit logs (login failures, PIN updates, OTP requests, transfer/payment actions).
10. Filter audit logs by action/date and export CSV for compliance evidence.
11. Operate approval queue for critical admin actions when approval mode is enabled.
12. Optionally enforce dual-control policy so requester cannot self-approve/self-reject.
13. Approval APIs now include strict ID/query validation for safer admin operations.
14. Optional policy can enforce non-empty reviewer note for approval decisions.
15. Approval queue includes age/SLA/escalation indicators for operational follow-up.
16. Manage full card request lifecycle from admin `Cards` tab.
17. Review and decide customer KYC requests from admin `KYC` tab.

User convenience additions:
1. Quick apply from each loan card (auto-prefilled amount + tenure).
2. EMI estimate card in loan form for faster decision making.
3. Beneficiary pick + recipient verify in transfer form.
4. Direct secure PIN management access from profile and transactions pages.
5. Profile edit now uses OTP-assisted save and session token refresh for role changes.
6. Admin panel now has a dedicated `Approvals` tab with filter/paging/approve/reject controls.
7. Admin panel now has quick search filters in Users, Accounts, Transactions, Loans, and Payments tabs for faster control.
8. Users now get centralized notifications for deposits, withdrawals, transfers, loan updates, payment updates/refunds, and support ticket updates.
9. Users can configure standing instructions for recurring transfers and manage them with PIN-protected controls.
10. Users can manage full card lifecycle from `Card Center` with request history and admin decision tracking.
11. Users can submit KYC details and track approval/rejection status from `KYC Center`.
12. Service links now prefill support requests with product context for faster processing.

## 7) Step-by-Step: How to Apply

## 7.1 Backend setup
1. Copy `backend/.env.example` to `backend/.env`.
2. Fill minimum required env:
   - `PORT`
   - `MONGO_URI`
   - `JWT_SECRET`
   - `JWT_EXPIRE`
   - `CORS_ORIGIN`
   - Transaction policy controls (`MAX_SINGLE_TRANSFER`, `DAILY_TRANSFER_LIMIT`, `HIGH_VALUE_TRANSFER_THRESHOLD`, `MAX_SINGLE_WITHDRAWAL`, `DAILY_WITHDRAWAL_LIMIT`)
   - OTP policy control (`REQUIRE_TRANSFER_OTP_FOR_HIGH_VALUE`)
   - Nodemailer config (`EMAIL_TRANSPORT`, `EMAIL_SERVICE` or `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_SECURE`, `EMAIL_REQUIRE_TLS`, `EMAIL_USER`, `EMAIL_PASSWORD`, `EMAIL_FROM_NAME`, `EMAIL_FROM_ADDRESS`)
   - Rate limiting controls (optional override):
     - `API_RATE_LIMIT_WINDOW_MINUTES`, `API_RATE_LIMIT_MAX`
     - `AUTH_RATE_LIMIT_WINDOW_MINUTES`, `AUTH_RATE_LIMIT_MAX`
     - `LOGIN_RATE_LIMIT_MAX`, `REGISTER_RATE_LIMIT_MAX`
     - `OTP_RATE_LIMIT_WINDOW_MINUTES`, `OTP_RATE_LIMIT_MAX`
     - `MONEY_OUT_RATE_LIMIT_WINDOW_MINUTES`, `MONEY_OUT_RATE_LIMIT_MAX`
     - `PAYMENT_WRITE_RATE_LIMIT_WINDOW_MINUTES`, `PAYMENT_WRITE_RATE_LIMIT_MAX`
   - Standing instruction scheduler controls (optional):
     - `STANDING_INSTRUCTION_PROCESSOR_ENABLED=true`
     - `STANDING_INSTRUCTION_PROCESS_INTERVAL_MS=60000`
     - `STANDING_INSTRUCTION_BATCH_LIMIT=25`
3. Set payment mode:
   - UAT: `PAYMENT_GATEWAY_MODE=MOCK`
   - Live: `PAYMENT_GATEWAY_MODE=RAZORPAY`, plus `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
4. Start backend:
```bash
cd backend
npm install
npm run dev
```

5. Optional admin approval mode (for bank governance):
   - `ADMIN_APPROVAL_MODE=DISABLED` -> actions execute immediately (default)
   - `ADMIN_APPROVAL_MODE=ENABLED` -> selected critical actions create approval requests first
   - `ADMIN_APPROVAL_REQUIRED_ACTIONS=` (comma-separated):
     - `PAYMENT_REFUND`
     - `LOAN_STATUS_UPDATE`
     - `ACCOUNT_STATUS_UPDATE`
   - If the list is empty and mode is `ENABLED`, all above actions require approval
   - Optional strict maker-checker:
     - `ADMIN_APPROVAL_ENFORCE_DUAL_CONTROL=true` blocks self-approval/self-rejection
     - Keep `false` for single-admin demo mode
   - Optional review note policy:
     - `ADMIN_APPROVAL_REQUIRE_REVIEW_NOTE=true` requires reviewer note before approve/reject
   - Optional approval SLA windows:
     - `ADMIN_APPROVAL_SLA_HOURS` (default `24`)
     - `ADMIN_APPROVAL_ESCALATION_HOURS` (default `48`)

5. In Razorpay dashboard, configure webhook:
   - URL: `https://<your-domain>/api/payments/webhook`
   - Secret: same value as `RAZORPAY_WEBHOOK_SECRET`
   - Events: `payment.captured`, `order.paid`, `payment.failed`, `refund.processed`

## 7.2 Frontend setup
1. Copy `frontend/.env.example` to `frontend/.env`.
2. Set `REACT_APP_API_URL` (for example `http://localhost:5000/api`).
3. Start frontend:
```bash
cd frontend
npm install
npm start
```

## 7.4 Profile OTP flow (must-configure)
1. Ensure Nodemailer env values are valid in `backend/.env` (`EMAIL_USER`, `EMAIL_PASSWORD`, and either `EMAIL_SERVICE` or SMTP host settings).
2. Login user and open `/profile`.
3. Click `Edit Profile`, change fields, then click `Send OTP`.
4. Enter OTP received to registered email.
5. Click `Verify OTP & Save`.
6. Confirm updated profile data appears immediately in UI.

## 7.3 Build verification
```bash
cd frontend
npm run build
```

## 7.5 Navbar and EMI UX validation
1. Login and open home page on desktop (1366px to 1920px width).
2. Confirm navbar search shows editable input field (not icon-only).
3. Type keyword (example: `loan`) and confirm dropdown shows live suggestions plus `See all results for "loan"`.
4. Press `Enter` on selected suggestion or on `See all results` row.
5. Confirm redirect to `/services?q=loan` and matching results render.
6. Open `/loans` and change amount/tenure in apply form.
7. Verify EMI preview changes dynamically and does not stay at static zero.
8. Open `/admin` -> `Loans` tab and confirm EMI column shows computed values even when backend EMI field is empty.

## 7.6 Notifications module validation
1. Login user and open `/notifications`.
2. Complete one deposit/withdraw/transfer/loan-payment/payment action.
3. Return to `/notifications` and confirm a new alert appears with correct category/status.
4. Click `Mark Read` and confirm unread count decreases in page and navbar bell badge.
5. Click `Mark All Read` and confirm all entries become read.
6. Click `Remove` on one entry and confirm it is deleted from the list.

## 7.7 Standing instruction validation
1. Open `/transactions` and create a verified beneficiary.
2. In `Standing Instructions`, create one schedule with PIN and frequency (`DAILY` / `WEEKLY` / `MONTHLY`).
3. Confirm new instruction appears with status `ACTIVE` and `next run` timestamp.
4. Use `Execute Now` with valid PIN and confirm transfer executes plus balance/transaction update.
5. Click `Pause`, confirm status changes to `PAUSED`, then click `Resume` and verify status returns to `ACTIVE`.
6. Click `Cancel` and confirm status changes to `CANCELLED`.

## 7.8 Card lifecycle validation
1. Open `/cards` and submit a new card application request.
2. Login as admin and open `/admin` -> `Cards` tab.
3. Approve the pending `APPLY` request and confirm status moves to `COMPLETED`.
4. Return to `/cards` and verify issued card appears in `My Cards`.
5. Submit `BLOCK`, `UNBLOCK`, `REISSUE`, `PIN_RESET`, and `LIMIT_UPDATE` requests from card controls.
6. Resolve each request in admin tab and verify card status/details update correctly.

## 7.9 KYC validation
1. Open `/kyc` and submit KYC with PAN + proof details.
2. Confirm status changes to `PENDING` in user KYC center.
3. Login as admin and open `/admin` -> `KYC` tab.
4. Approve or reject request and confirm request status changes in admin table.
5. Return to `/kyc` and verify user status/note reflects admin decision.

## 7.10 Service request routing validation
1. Open any non-transaction service page (for example `/services/investments/mutual-funds`).
2. Click main CTA and confirm redirect to `/support` with service context query parameters.
3. Verify support form is prefilled with `SERVICE_REQUEST` category and service-based subject/description.
4. Submit request and confirm ticket is created with service context details in description.

## 7.11 Docker full-stack startup
1. Open project root (`bank-management-mern`) and run `docker compose build`.
2. Run `docker compose up -d`.
3. Verify status with `docker compose ps`.
4. Confirm:
   - Frontend: `http://localhost:3000`
   - Backend health: `http://localhost:5000/api/health`
   - Backend ready: `http://localhost:5000/api/ready`
5. Check logs if needed using `docker compose logs -f`.
6. Stop using `docker compose down` (or `docker compose down -v` to remove DB volume).

## 8) Functional Verification Steps

1. Register normal user and create account.
2. Login as protected admin (`sivasakthivelpalanisamy11@gmail.com` or `7418042205` with matching account password).
3. Open `/admin` and verify all tabs load.
4. From user account, open `/payments`, create order, verify success.
5. Confirm:
   - balance increased
   - `PAYMENT_CREDIT` in transactions
   - payment visible in admin payments tab
6. Trigger admin refund and confirm:
   - payment becomes `REFUNDED`
   - account balance reversed
   - `PAYMENT_REFUND` appears in transactions
7. Open `/services` and verify all PDF-mapped categories are visible and navigable.
8. Open `/security/transaction-pin`, set PIN, then complete transfer/withdrawal from `/transactions` or dashboard.
9. Verify transfer/withdrawal fails with wrong PIN and succeeds with correct PIN.
10. Approve a loan from admin, then pay EMI from `/loans` using transaction PIN.
11. Validate that transfer/withdrawal above configured single or daily limits is blocked with correct message.
12. Initiate a high-value transfer and confirm OTP is required, then verify wrong OTP fails and correct OTP succeeds.
13. Open admin audit tab and confirm transfer OTP request, transfer success/failure, and login events are visible.
14. Export audit logs CSV from admin and verify file contains metadata for compliance review.
15. Open `/profile`, edit name/phone/email/address, request OTP, verify OTP, and confirm profile is updated.
16. Enable approval mode, perform refund/loan/account action from admin tabs, and confirm request appears under `Approvals`.
17. Approve or reject a pending request from `Approvals` tab and verify status/target data changes accordingly.
18. Type in navbar search and verify `/services?q=<keyword>` results show matching categories/items.
19. Update EMI values (amount/rate/tenure) and verify calculated values update without static/invalid zero state.
20. In Approvals tab, enter reviewer note, approve/reject request, and verify decision email to requester.
21. Export approvals CSV and verify fields include requester/reviewer/decision notes.
22. Keep one approval pending beyond SLA/escalation hours and verify overdue/escalated flags appear in Approvals tab.
23. Call `/api/health` and confirm status `ok`.
24. Call `/api/ready` after DB connection and confirm status `ready`.
25. Trigger multiple OTP requests and confirm rate limit response appears when threshold is exceeded.
26. Open `/transactions`, download monthly statement PDF, and confirm:
   - opening/closing balance is correct for selected month
   - debit and credit columns are separated correctly
   - table columns are aligned and readable across pages
27. Open `/admin` and test quick search in users/accounts/transactions/loans/payments tabs; verify filtered rows and clear action.
28. Open `/notifications` and verify unread badge count sync, mark-read/mark-all-read behavior, remove action, and action-link navigation.
29. Create/execute/pause/resume/cancel standing instructions from `/transactions` and verify resulting transfer entries + notification alerts.
30. Complete card lifecycle flow (`/cards` user + `/admin` cards tab) and verify request statuses + card state updates.
31. Submit a KYC request from `/kyc`, decide it in `/admin` -> `KYC`, and verify status sync in both screens.
32. Open service pages across categories and verify CTA redirects to `/support` with service-prefilled context for request creation.

## 9) Bank-Handover Readiness Notes

Core functional architecture is now bank-like for demo/UAT and controlled deployment.

Before live bank production, complete:
1. HTTPS + secure deployment topology.
2. Configure and test production webhook delivery/retry behavior in Razorpay dashboard.
3. Centralized logs + alerting + incident runbook.
4. CI/CD quality gates (lint/test/build/security scan).
5. VAPT and compliance sign-off.
6. Backup/restore and DR drill.

---

Status: Implemented and aligned to your requested direction (PDF features + full admin control + payment DB integration + UI continuity).
