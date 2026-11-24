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
