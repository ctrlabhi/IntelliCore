# IntelliCore V2.0 — Development Log

## 2026-11-24: MASTER-PHASE-02B Execution
- **Infrastructure Fixes Completed**:
  - Configured MySQL server and session default timezone to UTC (`+00:00`) while preserving `Asia/Kolkata` as business application timezone.
  - Replaced `mysqladmin ping` fallback with authenticated `SELECT 1` healthcheck query against `intellicore_db` using `intellicore_app`.
  - Verified persistence: 7 `system_settings` records survived safe container restart.
  - Verified uploads volume writable by application `node` user.
- **Database Schema Expansion**:
  - Extended Prisma schema with `User`, `Profile`, `Role`, `Permission`, `UserRole`, `RolePermission`.
  - Generated and applied versioned migration `20261124090525_add_auth_rbac_models`.
  - Updated `prisma/seed.js` to idempotently seed 8 system roles, 11 foundational permissions, and 49 mappings.
- **Backend Auth Architecture**:
  - Built Express `authenticate`, `requireAuth`, `requireStatus`, `requireRole`, `requirePermission` middlewares in `backend/src/middleware/auth.js`.
  - Implemented `AuthService` handling transactional bootstrap, email collision protection, and user context resolution.
  - Implemented `AuthController` and mounted routes under `/api/v1/auth/*` and `/api/v1/users/me/*`.
  - Created idempotent CLI script `backend/src/scripts/bootstrapFounder.js` for Founder initialization.
- **Frontend Integration**:
  - Implemented client-side `AuthService` in `frontend/services/auth.js` integrating Firebase Web SDK with backend API.
  - Replaced legacy hardcoded `intellicore-229` credentials across `dashboard-auth.js`, `founder-dashboard.js`, `hr-dashboard.js`, `tl-dashboard.js` with isolated `intellicore-dev` config.
  - Mounted `/services` in Express static handler.
  - Built `frontend/assets/js/auth.js` for login/signup modal interactions, Google Sign-In, and dashboard routing.
- **Testing**:
  - Expanded test suite from 26 to 40 passing tests across 9 test files (unit, middleware, endpoints, security, static serving, founder bootstrap).

## 2026-11-24: MASTER-PHASE-02C Execution & Founder Initialization
- **MySQL Privilege Hardening**:
  - Audited grants for `intellicore_app`@`%`. Revoked all global administrative privileges (`ON *.*`).
  - Restricted grants to `intellicore_db.*` and `intellicore_shadow_db.*`. Verified Prisma migrations functional.
- **Zero-Firestore Frontend Architecture**:
  - Rewrote active frontend dashboards (`founder-dashboard.js`, `hr-dashboard.js`, `tl-dashboard.js`, `dashboard-auth.js`).
  - Purged all active Firestore, Storage, and Cloud Functions calls and legacy email allowlists.
  - Connected dashboards directly to `authService` backed by Express REST API and MySQL.
  - Displayed explicit development-pending states for unfinished modules.
- **Authentication Security Hardening**:
  - Hardened `requireRole` and `requirePermission` middleware to enforce `status === 'ACTIVE'`.
  - Configured Helmet with `crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }` and CSP directives for Firebase/Google OAuth.
- **Founder Bootstrap & Real Browser Verification**:
  - Completed legitimate Google OAuth sign-in for `ctrlabhishek@gmail.com` on `http://localhost:3000/?auth=login`.
  - Retrieved verified Firebase UID: `svNt0UTSz9N59EzlaTWR7jsCu5c2`.
  - Initialized Founder account via `npm run founder:bootstrap`; verified `ACTIVE` status and `FOUNDER` role in MySQL.
  - Verified Founder Command Center rendering, zero Firestore network requests, and session logout.
- **Automated Testing Baseline**:
  - Expanded test baseline from 40 to 45 passing automated tests across 9 test suites with 100% pass rate.

