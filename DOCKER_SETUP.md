# Docker Setup (Full Stack)

This runs `frontend + backend + mongo` with one command.

## 1) Prerequisites
1. Install Docker Desktop.
2. Ensure Docker engine is running.
3. Open terminal in `bank-management-mern`.

## 2) Optional environment override
Create project-root `.env` (same folder as `docker-compose.yml`) to override defaults:

```env
JWT_SECRET=replace_with_long_random_secret
JWT_EXPIRE=15m
CORS_ORIGIN=http://localhost:3000
FRONTEND_URL=http://localhost:3000
ENFORCE_BENEFICIARY=true
PAYMENT_GATEWAY_MODE=MOCK
ALLOW_EXTRA_ADMINS=false
```

If `.env` is not present, compose uses safe defaults from `docker-compose.yml`.

## 3) Build and start
```bash
docker compose build
docker compose up -d
```

## 4) Verify services
```bash
docker compose ps
```

Expected ports:
1. Frontend: `http://localhost:3000`
2. Backend API: `http://localhost:5000`
3. Backend health: `http://localhost:5000/api/health`
4. Backend readiness: `http://localhost:5000/api/ready`
5. MongoDB: `localhost:27017`

## 5) Logs and restart
```bash
docker compose logs -f
docker compose restart backend
docker compose restart frontend
```

## 6) Stop and clean
```bash
docker compose down
docker compose down -v
```

`down -v` removes Mongo named volume (`mongo_data`).

## 7) Notes
1. Frontend container serves React build via Nginx.
2. Nginx proxies `/api` to backend service in Docker network.
3. Backend starts only after Mongo health is ready.
4. Frontend starts only after backend readiness is healthy.
