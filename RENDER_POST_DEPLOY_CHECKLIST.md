# Render Post-Deploy Checklist

Use this checklist after deploying `render.yaml` services (`bankease-api`, `bankease-jobs`, `bankease-frontend`).

## 1) Confirm service health

1. API health:
   - `GET https://<api-service>.onrender.com/api/health`
   - Expected: `{"status":"ok", ...}`
2. API readiness:
   - `GET https://<api-service>.onrender.com/api/ready`
   - Expected: `{"status":"ready"}`
3. Worker logs:
   - Must contain `Worker process started: standing instructions + core banking schedulers are running.`

## 2) Run automated smoke checks

From `backend/` directory:

```bash
API_BASE_URL=https://<api-service>.onrender.com CHECK_CORS_ORIGIN=https://<frontend-service>.onrender.com npm run deploy:check
```

Optional (validates login + profile as well):

```bash
API_BASE_URL=https://<api-service>.onrender.com CHECK_CORS_ORIGIN=https://<frontend-service>.onrender.com CHECK_LOGIN_EMAIL=<test_user_email> CHECK_LOGIN_PASSWORD=<test_user_password> npm run deploy:check
```

## 3) Validate critical env values

API + Worker:
- `MONGO_URI`
- `JWT_SECRET`
- `FRONTEND_URL=https://<frontend-service>.onrender.com`
- `CORS_ORIGIN=https://<frontend-service>.onrender.com`
- `COOKIE_SAME_SITE=none`
- `COOKIE_SECURE=true`

Frontend:
- `REACT_APP_API_URL=https://<api-service>.onrender.com/api`

Email (if OTP/mail required):
- `EMAIL_USER`
- `EMAIL_PASSWORD` (Gmail App Password if using Gmail)
- `EMAIL_FROM_ADDRESS`

## 4) Functional sanity checks in UI

1. Login and logout.
2. Open dashboard and transactions page.
3. Test transfer with MPIN.
4. Test beneficiary flow (if enabled by policy).
5. Verify notification read status updates.
6. Check admin panel loads and approval queue fetches.

## 5) If something fails

1. Check API logs first (auth/cors/cookie errors).
2. Check Worker logs (scheduler/cron errors).
3. Run email diagnostics:
   - `npm run email:test`
4. Re-run:
   - `npm run deploy:check`
