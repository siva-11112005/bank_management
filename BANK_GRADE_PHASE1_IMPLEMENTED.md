# BankEase Bank-Grade Phase 1 (Implemented)

## Scope Delivered

This phase implements practical core-banking foundations inside the existing MERN stack:

1. General Ledger (GL) chart and journal posting
2. Core finance reports (Trial Balance, Profit & Loss, Balance Sheet)
3. Savings Interest EOD engine
4. Fixed Deposit (FD) module
5. Recurring Deposit (RD) module
6. AML rule-engine (rule-based alerts)
7. Settlement queue + reconciliation workflow (simulation)
8. UPI handle (VPA) creation (simulation)
9. Maker-checker money-out policy management (admin)

## New Backend APIs

Base path: `/api/core-banking`

### Admin APIs

- `POST /admin/bootstrap`
- `GET /admin/gl/accounts`
- `GET /admin/gl/trial-balance?asOfDate=...`
- `GET /admin/gl/profit-loss?fromDate=...&toDate=...`
- `GET /admin/gl/balance-sheet?asOfDate=...`
- `POST /admin/gl/manual-journal/request` (maker-checker request for GL adjustments)
- `POST /admin/interest/run-eod`
- `GET /admin/interest/accruals`
- `POST /admin/treasury/snapshots`
- `GET /admin/treasury/snapshots`
- `GET /admin/regulatory/report?fromDate=...&toDate=...&cashThreshold=...`
- `GET /admin/regulatory/report/export.csv?fromDate=...&toDate=...&cashThreshold=...`
- `POST /admin/regulatory/monitor/run`
- `POST /admin/regulatory/publish-request`
- `GET /admin/regulatory/publications`
- `GET /admin/settlement`
- `PUT /admin/settlement/:settlementId/reconcile`
- `POST /admin/aml/scan`
- `GET /admin/aml/alerts`

### User APIs

- `POST /fd`
- `GET /fd/my`
- `POST /fd/:fdId/close`
- `POST /rd`
- `GET /rd/my`
- `POST /rd/:rdId/installment`
- `POST /rd/:rdId/close`
- `POST /upi/vpa`
- `GET /upi/vpa/my`
- `POST /rails/transfer`

## Notes

- External rails (NPCI/UPI switch/IMPS/NEFT/RTGS settlement files) are simulated in this phase.
- CKYC/FIU-RBI filing cannot be fully completed without licensed external integrations.
- Existing deposit/withdraw/payment/loan repayment flows now post GL journals for accounting continuity.
- Admin policy endpoints (base: `/api/admin`):
  - `GET /policy/money-out`
  - `GET /policy/money-out/history`
  - `POST /policy/money-out/request` (supports maker-checker via `MONEY_OUT_POLICY_UPDATE`)
  - `GET /policy/regulatory`
  - `GET /policy/regulatory/history`
  - `POST /policy/regulatory/request` (supports maker-checker via `REGULATORY_POLICY_UPDATE`)
- Additional maker-checker actions now supported:
  - `TREASURY_SNAPSHOT_CREATE`
  - `REGULATORY_POLICY_UPDATE`
  - `REGULATORY_REPORT_PUBLISH`
- Scheduler enhancement:
  - Monthly regulatory auto-publish for previous month (configurable day/hour)
  - Daily regulatory breach monitor (in-app + email alerts with dedupe)

## Frontend Exposure (Continued)

- Added protected page: `/core-banking`
  - User sections: FD create/close, RD create/installment/close, UPI handle create/list, rail transfer queue
  - Admin sections: COA bootstrap, Interest EOD run, AML scan, GL summary, interest accruals, AML alerts, treasury snapshots, regulatory report, settlement reconciliation
  - Admin maker-checker form: Manual GL adjustment request (`GL_MANUAL_JOURNAL`)
  - Regulatory publish workflow: request report publication + publication history
  - Regulatory export actions: CSV download and print/save as PDF
  - Regulatory monitor action: run manual breach scan from Core Banking admin controls
  - Admin policy tab includes Regulatory Monitor policy (CTR/STR/LCR/LTD thresholds) with history
- Added navigation entry in user profile/mobile menu for `Core Banking`
- Service mapping updated:
  - Deposits category actions now route to core-banking flow
  - Deposit products map to `/core-banking?module=fd` and `/core-banking?module=rd`
