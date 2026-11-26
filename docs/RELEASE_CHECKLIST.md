# IntelliCore V2.0 — Production Release Checklist

**Release Target:** IntelliCore V2.0 Zero-Cost Production Deployment  
**Hosting Environment:** GitHub Pages (Frontend) + Render Free Web Service (Backend) + Hostinger Remote MariaDB 11.8.9 (Database) + Firebase Spark ($0.00/mo)  
**Approval Gate:** STOP AT GATE BEFORE CLOUD PROVISIONING

---

## 1. Pre-Flight Verification Checklist

- [x] **Git Checkpoint Verified**: HEAD is clean on branch `main`.
- [x] **Repository Security Scan**: Zero `.env`, `.env.production.local`, private keys, or SQL backups committed to Git.
- [x] **Database Connectivity**: `SELECT 1` verified on `srv1824.hstgr.io:3306` with strict TLS 1.2 (`sslaccept=strict`).
- [x] **Database Migrations**: All 11 Prisma migrations verified in `_prisma_migrations` (49 tables).
- [x] **Backup Verified**: Non-destructive SQL backup taken and restored into local isolated MySQL with zero schema drift.
- [x] **Full Regression Suite**: 233 automated tests passed across 33 test files (100% pass rate).
- [x] **Local Acceptance Suite**: 12/12 authentication, session, profile, and authorization criteria verified.
- [x] **CWE-601 Open-Redirect Defense**: Tested and verified.
- [x] **Clean URL Routing**: Universal 301 redirects for `/frontend` and `/frontend/*` verified.
- [x] **Frontend API Client**: Configurable `window.__INTELLICORE_API_BASE_URL__` supported in `api.js`.
- [x] **Zero Additional Cost**: $0.00 incurred. No paid services or subscriptions.

---

## 2. Deployment Approval Gate (Owner Actions Required)

- [ ] **Step 1: Rotate Database Password**
  - Open Hostinger hPanel > Databases > Remote MySQL.
  - Set a new secure password for user `u740799251_intellicore`.
  - Update `.env.production.local` locally and verify via `npm run db:verify`.

- [ ] **Step 2: Connect Render Free Web Service**
  - Log in to Render.com.
  - Create new Web Service using repository `IntelliCore`.
  - Use blueprint settings from `render.yaml` (Region: Singapore, Plan: Free, Build: `npm install && npm run build:render`, Start: `node backend/src/server.js`).

- [ ] **Step 3: Inject Secrets into Render Environment**
  - Add secret `DATABASE_URL`: `mysql://u740799251_intellicore:<NEW_PASSWORD>@srv1824.hstgr.io:3306/u740799251_intellicore?sslaccept=strict&connection_limit=2`
  - Add secret `FIREBASE_CLIENT_EMAIL`: Service account email for `intellicore-dev`.
  - Add secret `FIREBASE_PRIVATE_KEY`: Service account private key for `intellicore-dev`.

- [ ] **Step 4: Explicit Owner Authorization**
  - Provide written authorization to trigger deployment and publish backend URL.

---

## 3. Post-Deployment Verification Sequence

- [ ] **Probe Verification**:
  - `GET https://<render-backend-url>/health` returns HTTP 200 `{ status: "UP" }`.
  - `GET https://<render-backend-url>/ready` returns HTTP 200 `{ status: "READY", database: "CONNECTED" }`.
- [ ] **Frontend Connection Wiring**:
  - Set `window.__INTELLICORE_API_BASE_URL__ = 'https://<render-backend-url>/api/v1'` in `frontend/index.html`.
  - Verify live website authentication via `https://www.intellicoretechnologies.in`.
- [ ] **Live Founder Login Verification**:
  - Authenticate using Google Sign-In with primary Founder account.
  - Confirm redirect to `/dashboards/founder` with active KPI data.
