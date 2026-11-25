# IntelliCore V2.0 — Development Log

## 2026-11-25 MASTER-PHASE-07

Implemented notifications, preference-controlled email outbox, durable worker claim/recovery, reminders, and in-app announcements in the existing modular monolith. Added immutable score and progress correction histories. Checked healthy Docker services and found the existing Phase 05 ledger blocked by a historical permission failure. [Phase 07 report](PHASE_07_REPORT.md).

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

## 2026-11-24: MASTER-PHASE-03 Execution — RBAC Enforcement, User Management & Staff Administration
- **Privilege Separation & Versioned Database Migration**:
  - Configured dedicated migration account `intellicore_migration` with pre-created shadow database `intellicore_shadow_db`.
  - Extended Prisma schema with `StaffProfile` (`staff_profiles`), `AuditLog` (`audit_logs`), and `StaffEmploymentStatus` enum.
  - Successfully generated and applied migration `20261124133504_add_staff_and_audit_models`.
  - Updated seed catalog with 10 new permissions (`users:update_status`, `staff:read`, `staff:create`, `staff:update`, `staff:update_status`, `roles:assign`, `roles:manage_permissions`, `permissions:read`, `audit_logs:read`, `analytics:read`) and updated role mappings.
- **Audit Logging Subsystem**:
  - Built transactional `auditService.createAuditLog` with recursive credential sanitizer (`password`, `token`, `secret`, `credential`).
  - Implemented `GET /api/v1/audit-logs` endpoint with pagination and search.
- **User & Staff Management REST APIs**:
  - Built user directory (`GET /api/v1/users`, `GET /api/v1/users/:id`), status management (`PATCH /api/v1/users/:id/status`) with Founder demotion protection and self-deactivation guardrails.
  - Built staff management (`GET /api/v1/staff`, `GET /api/v1/staff/:id`, `PATCH /api/v1/staff/:id`, `PATCH /api/v1/staff/:id/status`).
  - Built concurrency-safe staff provisioning (`POST /api/v1/staff`) generating sequential `STF-XXXX` codes, atomically updating user status, assigning staff roles, and creating audit logs.
- **Roles & Permissions Management**:
  - Built role listing (`GET /api/v1/roles`), permissions listing (`GET /api/v1/permissions`), role assignment (`PUT /api/v1/users/:id/roles`), and permission management (`PUT /api/v1/roles/:id/permissions`).
  - Enforced security guardrail: HTTP API strictly prohibits assigning `FOUNDER` role; Founder role permissions are immutable.
- **Operational Analytics**:
  - Built `GET /api/v1/admin/stats` returning live MySQL aggregated counts for total users, active accounts, staff members, audit records, and uptime.
- **Founder Command Center UI Integration**:
  - Updated `frontend/assets/js/founder-dashboard.js` to connect directly to Express REST APIs.
  - Wired live metrics cards, staff directory feed, recent audit activity feed, candidate role assignment form, and users table.
- **Automated Testing Suite**:
  - Expanded test coverage from 45 tests to 65 passing automated tests across 14 test suites with 100% pass rate.

## 2026-11-25 MASTER-PHASE-06

Implemented task publication and assignment, versioned submissions and authorized reviews, private files, curriculum authoring and immutable publication, persisted lesson progress and scoped performance reports. Preserved eight recovered curricula and Phase 05 behavior. [Engineering report](PHASE_06_REPORT.md) · [Project progress](PROJECT_PROGRESS.md).

