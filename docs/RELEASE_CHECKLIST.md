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

## 2. Release Blockers & Operational Decisions Required

- [x] **Database Policy Resolved: External Database Ownership & Access Boundary**
  - **Clarification**: The remote MariaDB database (`srv1824.hstgr.io`) belongs to an external hosting account. The IntelliCore owner does not hold administrative Hostinger access.
  - **Operational Rule**: Standalone password rotation scripts (`scripts/rotate-mariadb-password.js`) are permanently blocked. Authorized connection parameters are loaded from `.env.production.local` with strict TLS.
  - **Credential Security Request**: A formal request template has been authored in `docs/DATABASE_ACCESS_POLICY.md` for the database owner to issue fresh credentials at a scheduled maintenance window.
  - **Engineering Status**: Development and isolated testing proceed independently with zero downtime and zero risk to database integrity.

- [ ] **Blocker 1: Commercial-Use Eligibility Resolution (Vercel Hobby vs Render Free)**
  - **Issue**: Vercel Hobby plan terms of service strictly prohibit commercial business usage. While technical execution is 100% operational at $0.00, IntelliCore Technologies is a commercial business.
  - **Options**:
    - Option A: Retain Vercel Hobby backend (`https://intellicore-six.vercel.app`) for evaluation/staging at $0.00.
    - Option B: Switch production backend to Render Free Web Service (prepared in `render.yaml` on branch `release/backend-render`) which permits commercial web applications at $0.00.
    - Option C: Self-host backend via local/VPS Docker Compose at $0.00.

- [ ] **Blocker 2: Staging/Production Prerequisites (Email, Storage, Calendar)**
  - **Email**: Notification worker operates safely in `CAPTURE` mode (outbox queue only, zero external SMTP delivery). Live email delivery requires authorized SMTP credentials and relay service.
  - **File Uploads**: Serverless disk is ephemeral (4.5 MB body limit). Persistent production uploads require `@vercel/blob` token or S3 storage.
  - **Certificates**: Negative boundary strictly preserved. Zero in-app certificate PDF generation or sending. Probes return HTTP 404.

- [ ] **Blocker 3: Final Owner Merge Authorization**
  - Explicit owner approval required before merging `release/backend-vercel` into `main`.

---

## 3. Post-Merge Verification Sequence

- [ ] **Live Domain Verification**:
  - Open `https://www.intellicoretechnologies.in`.
  - Confirm browser network tab dispatches API calls to `https://intellicore-six.vercel.app/api/v1/*`.
- [ ] **Live Founder Login**:
  - Authenticate using Google Sign-In with primary Founder account.
  - Confirm redirect to `/dashboards/founder` with active KPI data.
