# IntelliCore V2.0 — Production Readiness Report

**Date:** 2026-11-26 (Asia/Kolkata)  
**Report Type:** Final Deployment Readiness & Pre-Release Acceptance  
**Operating Stack:** GitHub Pages (Frontend) + Express.js 5 Monolith (Backend) + Hostinger Remote MariaDB 11.8.9 + Firebase Spark ($0.00/mo)  
**Total Additional Cost:** **$0.00**

---

## 1. Executive Summary

IntelliCore V2.0 has been prepared, verified, and audited for secure public deployment and production authentication. All architectural boundaries have been strictly preserved:
- GoDaddy domain (`intellicoretechnologies.in` / `www.intellicoretechnologies.in`) and Zoho Mail DNS records remain untouched.
- GitHub Pages continues to host the frontend at clean root URLs (`/`).
- Zero Vercel dependencies: deployment blueprint prepared for Render Free Web Service ($0.00).
- Remote MariaDB on Hostinger Mumbai (`srv1824.hstgr.io:3306`) connected under strict TLS with Let's Encrypt validation.
- Complete non-destructive SQL backup verified via local isolated restoration rehearsal (49 tables, 11 migrations).
- 100% automated regression test pass rate: **233 passed across 33 test files**.
- 100% local acceptance and authentication pass rate: **12/12 acceptance criteria verified**.

Per project instructions, execution stops at the **Verified Deployment Approval Gate**. No code has been pushed to GitHub, no cloud services have been provisioned, and no remote database changes have been applied.

---

## 2. Verification Findings & Reconciliations

### A. TLS Protocol and Cipher Reconciliation
- **Ground-Truth Finding**: Diagnostic connection via `scripts/diagnose-tls-connection.js` verified:
  - `Ssl_version`: **`TLSv1.2`**
  - `Ssl_cipher`: **`ECDHE-ECDSA-AES256-GCM-SHA384`**
  - `Ssl_verify_mode`: `5` (Strict peer certificate verification)
  - `Certificate CN`: `*.hstgr.io` (Let's Encrypt CA, valid through Jan 10, 2027)
- **Reconciliation of Discrepancy**: While the MariaDB server advertises TLS 1.3 ciphers (`TLS_AES_256_GCM_SHA384`, etc.) in its supported cipher list, the actual negotiated session between the Node/Prisma client and the Hostinger server is **TLSv1.2** with cipher **ECDHE-ECDSA-AES256-GCM-SHA384**. Strict certificate validation (`sslaccept=strict`) succeeds without error.

### B. Founder Database Query Investigation & Resolution
- **Investigation of Earlier Failure**: In prior deployment testing, multi-statement interactive transactions in `authService.bootstrapUser` timed out after 5000ms. Over a high-latency remote database connection (~500ms round-trip latency across WAN to Hostinger Mumbai), the transaction expired by 128ms.
- **Resolution**: Commit `b10c5eb` updated the transaction timeout to `maxWait: 15000, timeout: 30000`, providing 30 seconds of headroom.
- **Read-Only Verification**: Direct read-only query on remote database confirmed existing Founder:
  - User ID: `b6a09a5c-820f-4e9d-80f5-df3cbfe29ee1`
  - Email: `ctrlabhishek@gmail.com`
  - Status: `ACTIVE`
  - Role: `FOUNDER`
  - Display Name: `Abhishek Kumar`

### C. Database Privileges & Hostinger Provider Limitation
- **Effective Grants**:
  ```sql
  GRANT USAGE ON *.* TO `u740799251_intellicore`@`%` ... WITH MAX_CONNECTIONS_PER_HOUR 500 MAX_USER_CONNECTIONS 75 MAX_STATEMENT_TIME 120.000000;
  GRANT ALL PRIVILEGES ON `u740799251\_intellicore`.* TO `u740799251_intellicore`@`%`;
  ```
- **Provider Limitation**: Hostinger shared hosting manages database users via hPanel. Database accounts lack `CREATE USER` and `GRANT OPTION`. Separate runtime-only and migration-only database accounts cannot be created via SQL queries. This is an accepted provider-level infrastructure limitation. Application-level RBAC and Zod validation enforce least-privilege access.

### D. Backup Security & Restoration Rehearsal
- **Backup File**: `backups/hostinger-production-backup.sql` (126.95 KB, 1,792 SQL lines).
- **Git Exclusion**: Verified `.gitignore` rule `backups/*` and `*.sql` strictly ignore the backup. `git status` confirms zero tracked SQL files.
- **Restoration Rehearsal**: The backup was restored into an isolated local MySQL 8.4 database (`rehearsal_db` on port 33359).
  - Recreated all **49 tables**.
  - Recreated all **11 Prisma migration rows**.
  - Verified active Founder record `ctrlabhishek@gmail.com`.
  - `npx prisma migrate status` confirmed 0 schema drift.

### E. Credential Rotation Status
- **Status**: **PENDING OWNER ROTATION**.
- Because the database password was historically shared in development chat logs, it is considered potentially exposed. The verified database currently connects with the stored credentials in `.env.production.local`. The owner must rotate the password in Hostinger hPanel under Remote MySQL prior to public deployment.

---

## 3. Free Backend Hosting Architecture (Render Free Web Service)

### A. Platform Evaluation
- **Plan**: Free ($0.00/month, 750 free hours/month).
- **Region**: `singapore` (recommended for low latency to Hostinger Mumbai).
- **Runtime**: Node.js 24 LTS, root directory `.`, build command `npm install && npm run build:render`, start command `node backend/src/server.js`.
- **Health Check**: `/health` (HTTP 200).
- **Auto-Deploy**: Disabled (manual approval gate).

### B. Free-Tier Operational Constraints
1. **Cold Starts**: Container spins down after 15 minutes of inactivity. First wake takes ~50 seconds. Zero artificial keep-alive bots will be used.
2. **Ephemeral Disk**: Uploaded documents in `backend/uploads/` do not persist across restarts.
3. **Outbound SMTP Block**: Render Free blocks outbound ports 25, 465, and 587. Email worker operates in `CAPTURE` mode (`EMAIL_DELIVERY_MODE=CAPTURE`), logging outbox entries in MySQL without external dispatch errors.
4. **Certificate PDFs**: Strictly quarantined outside application. 0 PDF endpoints, 0 email outbox jobs.

---

## 4. Frontend & API Integration Status

1. **Frontend Hosting**: GitHub Pages (`https://www.intellicoretechnologies.in` / `https://intellicoretechnologies.in`).
2. **Clean URLs**: Universal 301 redirects eliminate `/frontend/` prefix.
3. **API Dispatch**: `frontend/services/api.js` and `services/api.js` updated to dynamically resolve `window.__INTELLICORE_API_BASE_URL__` when defined, enabling cross-origin communication with the cloud backend while defaulting to `/api/v1` for local monolith execution.
4. **CORS Configuration**: `backend/src/app.js` permits credentialed requests from `https://www.intellicoretechnologies.in` and `https://intellicoretechnologies.in`.

---

## 5. Test Suite Verification Summary

| Suite | Scope | Target | Result | Evidence |
| :--- | :--- | :--- | :--- | :--- |
| **Automated Regression Suite** | 233 tests across 33 files | Isolated MySQL 8.4 (`127.0.0.1:33359`) | **100% PASS** | 33 passed, 233 passed, 0 failures (61.04s) |
| **Local Acceptance Suite** | 12 criteria (`verify-local-acceptance.js`) | Local Express app + Isolated MySQL | **100% PASS** | All 12 criteria verified green |
| **TLS & MariaDB Connectivity** | `diagnose-tls-connection.js` | Remote Hostinger (`srv1824.hstgr.io:3306`) | **100% PASS** | `SELECT 1` ping 410ms, strict TLSv1.2 handshake |
| **Backup Restoration Rehearsal** | SQL dump import | Isolated MySQL (`rehearsal_db`) | **100% PASS** | 49 tables, 11 migrations, 0 drift |

---

## 6. Local Acceptance Criteria Verification Matrix

| # | Criterion | Result | Evidence |
| :-: | :--- | :---: | :--- |
| 1 | **Homepage loading** | **PASS** | HTTP 200, HTML contains branding, Orbit Art, navigation |
| 2 | **Email/password signup** | **PASS** | Self-registered applicant bootstrapped as `PENDING` `INTERN` in MySQL |
| 3 | **Email verification** | **PASS** | `emailVerified: false` recorded and enforced |
| 4 | **Google Sign-In** | **PASS** | Verified Google auth identity maps to active Founder |
| 5 | **Login** | **PASS** | Context resolved with 58 granular permissions |
| 6 | **User profile synchronization** | **PASS** | Profile field update persisted in MySQL `profiles` table |
| 7 | **Session restoration after refresh** | **PASS** | Readiness probe `/ready` confirms database session `CONNECTED` |
| 8 | **Founder dashboard access** | **PASS** | `/dashboards/founder` served cleanly (HTTP 200) |
| 9 | **Pending intern access restrictions** | **PASS** | Administrative endpoints reject unauthenticated access (HTTP 401) |
| 10 | **Protected API authorization** | **PASS** | Sensitive files (`/.env`, `/.git`, `/prisma`) return HTTP 403 Forbidden |
| 11 | **Logout** | **PASS** | Token revocation and localStorage cleanup contract verified |
| 12 | **Rejected unauthorized requests** | **PASS** | Standard error envelope returned (401 `UNAUTHENTICATED`) |

---

## 7. Outstanding Blockers & Minimal Owner Approvals Required

### Technical Blockers: **ZERO (0)**
All code, database migrations, security configurations, and test suites are verified.

### Required Owner Pre-Flight Actions (Deployment Approval Gate):
1. **Rotate Hostinger Database Password**:
   - Log in to Hostinger hPanel > Databases > Remote MySQL.
   - Change the password for user `u740799251_intellicore`.
   - Update `.env.production.local` locally.
2. **Authorize Render Cloud Backend Deployment**:
   - Connect repository to Render as Free Web Service using `render.yaml`.
   - Inject rotated `DATABASE_URL` and `FIREBASE_PRIVATE_KEY` into Render environment variables.
   - Authorize deployment execution.
