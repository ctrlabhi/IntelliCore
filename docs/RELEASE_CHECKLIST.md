# IntelliCore V2.0 — Production Release Checklist

**Release Target:** IntelliCore V2.0 Zero-Cost Production Deployment  
**Hosting Environment:** GitHub Pages (Frontend) + Vercel Express Modular Monolith (`https://intellicore-six.vercel.app`) / Render Free (Prepared Alternative) + Hostinger Remote MariaDB 11.8.9 (Database) + Firebase Spark ($0.00/mo)  
**Approval Gate:** STOP AT GATE BEFORE MERGING `release/backend-vercel` INTO `main`

---

## 1. Pre-Flight Verification Checklist

- [x] **Git Checkpoint Verified**: Dedicated release branch `release/backend-vercel` pushed to `origin`. Live publishing branch `main` preserved 100% untouched at `b10c5eb`.
- [x] **Repository Security Scan**: Zero `.env`, `.env.production.local`, private keys, or SQL backups committed to Git.
- [x] **Database Connectivity**: `SELECT 1` verified on `srv1824.hstgr.io:3306` with strict TLS 1.2 (`sslaccept=strict`, cipher `ECDHE-ECDSA-AES256-GCM-SHA384`).
- [x] **Database Schema & Migrations**: All 11 Prisma migrations verified in `_prisma_migrations` (49 tables, 0 drift).
- [x] **Database Integrity**: Verified Founder record (`ctrlabhishek@gmail.com`) intact with ACTIVE status and FOUNDER role.
- [x] **Full Regression Suite**: 233 automated tests passed across 33 test files (100% pass rate).
- [x] **Local Acceptance Suite**: 12/12 authentication, session, profile, and authorization criteria verified (`scripts/verify-local-acceptance.js`).
- [x] **Headless Browser Acceptance**: 5/5 interactive UI checks passed on Edge (`scripts/verify-browser-acceptance.js`): Homepage, Auth Modal, API base URL resolver, all 4 dashboards (`founder`, `hr`, `team-leader`, `intern`), and zero console/CORS errors.
- [x] **Live Vercel Backend Probes**: Verified `https://intellicore-six.vercel.app` (`/health` HTTP 200 UP, `/ready` HTTP 200 READY with database CONNECTED, `/api/v1/auth/config` HTTP 200, protected endpoints HTTP 401, sensitive paths HTTP 403).
- [x] **Frontend API Client**: Configurable `window.__INTELLICORE_API_BASE_URL__` supported; auto-routes `github.io` and `intellicoretechnologies.in` to `https://intellicore-six.vercel.app/api/v1`.
- [x] **Zero Additional Cost**: $0.00 incurred. No paid services, subscriptions, or upgrades activated.

---

## 2. Release Blockers & Owner Actions Required

- [ ] **Blocker 1: Rotate Database Password in Hostinger hPanel**
  - **Issue**: Historical database password was shared in chat logs and is considered compromised. The live Vercel backend currently uses this credential.
  - **Action**:
    1. Open Hostinger hPanel > Databases > Remote MySQL.
    2. Reset password for user `u740799251_intellicore` to a fresh high-entropy secret.
    3. Update `DATABASE_URL` in Vercel Project Settings (`abhishek-kumars-projects-299c681c/intellicore` > Settings > Environment Variables).
    4. Update local private `.env.production.local`.
    5. Re-verify `/ready` returns HTTP 200 `database: CONNECTED`.

- [ ] **Blocker 2: Commercial-Use Eligibility Resolution**
  - **Issue**: Vercel Hobby plan terms of service strictly prohibit commercial business usage. While technical execution is 100% operational at $0.00, IntelliCore Technologies is a commercial business.
  - **Options**:
    - Option A: Retain Vercel Hobby backend for evaluation/staging at $0.00.
    - Option B: Switch backend to Render Free Web Service (prepared in `render.yaml` on branch `release/backend-render`) which permits commercial web applications at $0.00.
    - Option C: Self-host backend via local/VPS Docker Compose at $0.00.

- [ ] **Blocker 3: Staging/Production Prerequisites (Email, Storage, Calendar)**
  - **Email**: Notification worker operates safely in `CAPTURE` mode (outbox queue only, zero external SMTP delivery). Live email delivery requires authorized SMTP credentials and relay service.
  - **File Uploads**: Serverless disk is ephemeral (4.5 MB body limit). Persistent production uploads require `@vercel/blob` token or S3 storage.
  - **Certificates**: Negative boundary strictly preserved. Zero in-app certificate PDF generation or sending. Probes return HTTP 404.

- [ ] **Blocker 4: Final Owner Merge Authorization**
  - Explicit owner approval required before merging `release/backend-vercel` into `main`.

---

## 3. Post-Merge Verification Sequence

- [ ] **Live Domain Verification**:
  - Open `https://www.intellicoretechnologies.in`.
  - Confirm browser network tab dispatches API calls to `https://intellicore-six.vercel.app/api/v1/*`.
- [ ] **Live Founder Login**:
  - Authenticate using Google Sign-In with primary Founder account.
  - Confirm redirect to `/dashboards/founder` with active KPI data.
