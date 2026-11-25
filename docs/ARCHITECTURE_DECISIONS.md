# Architecture Decision Records (ADRs)

## ADR-007 Calendar consent and auditable internship follow-up

The final Phase 08 owner specification supersedes the earlier certificate document design. The application tracks an external-dispatch declaration and corrections, with in-app notification. Completed enrollment periods remain separate from continuation periods. Non-privileged titles are independent of RBAC. Protected staff and role changes share the existing service transaction with promotion evidence.

Calendar is an optional separate OAuth integration with browser-bound one-time state, protected refresh tokens, and a durable meeting revision and synchronization lease. The worker sends provider requests only for the configured organizer and designated calendar. [Calendar integration](GOOGLE_CALENDAR_INTEGRATION.md).

## ADR-006 Transactional notifications and isolated transport

Business changes and their notices and outbox entries commit together in MySQL. Keep transport and scheduled work in a separately authorized process sharing the application image. Persist job claims, attempt history and auditable audience snapshots. Use capture by default and record SMTP ambiguity separately from successful acceptance. Keep app, worker and migration credentials apart. [Background processing](BACKGROUND_PROCESSING.md) · [Notification routes](API.md#phase-07-notifications-announcements-and-delivery).

## ADR-001: Split-Plane Authentication & Relational MySQL RBAC
- **Status:** Approved & Implemented in Phase 2B
- **Context:** IntelliCore requires secure authentication without storing passwords in MySQL, while demanding relational RBAC where role changes and account states are immediately authoritative without waiting for Firebase JWT refresh cycles.
- **Decision:** Use Firebase Auth exclusively for public authentication (OAuth / email passwords), and MySQL 8.4 LTS for user identity, profiles, account status (`PENDING`, `ACTIVE`, etc.), and role/permission mappings.
- **Consequences:** Firebase Custom Claims are not used as the source of truth. Every authenticated request verifies the Firebase Bearer token and evaluates the MySQL user state and permissions in real time.

## ADR-002: Server Timezone UTC with Business Timezone Asia/Kolkata
- **Status:** Approved & Implemented in Phase 2B
- **Context:** In Phase 1, MySQL was configured with default timezone `+05:30`.
- **Decision:** Set MySQL server default timezone to UTC (`+00:00`) for all database operations, while storing and displaying timestamps in `Asia/Kolkata` as the business operation timezone.
- **Consequences:** All Prisma and database timestamps are strictly normalized in UTC across distributed services.

## ADR 003: MySQL Least-Privilege Model & Shadow Database Isolation (Phase 02C)
- **Status:** Accepted
- **Context:** During Phase 02B, global database privileges on `*.*` were inadvertently granted to `intellicore_app`.
- **Decision:** Revoke all global superuser privileges on `*.*`. Restrict `intellicore_app` strictly to `intellicore_db.*` and an explicitly provisioned `intellicore_shadow_db.*` for Prisma development migration diffing.
- **Consequences:** Runtime database credentials follow least-privilege principles, preventing accidental damage or administrative tampering outside the application scope.

## ADR 004: Firebase Authentication-Only Architecture & Zero-Firestore Quarantine (Phase 02C)
- **Status:** Accepted
- **Context:** Legacy frontend dashboards retained unmigrated imports to Firestore, Storage, and Cloud Functions.
- **Decision:** Purge all Firestore/Storage/Functions imports from frontend dashboards. Connect all dashboards strictly through the Express REST API (`/api/v1/*`) backed by MySQL. Use Firebase exclusively for identity token issuance via Google OAuth and email/password.
- **Consequences:** Strict architectural decoupling: MySQL is the sole source of truth for business data and RBAC. Zero Firestore requests or rules dependencies in development or production.

## ADR-005 Task and curriculum history

Task definitions, assignments, submission versions and reviews have separate states and identities. The submission stores the deadline and rubric used for review. A curriculum version is immutable after publication and an enrollment retains its exact version. Scope checks and writes use existing MySQL relations. Private binary content uses the persistent local upload volume with MySQL metadata and authenticated access. Transactional audit events identify publication, assignment, deadline, submission, revision, approval and curriculum enrollment for Phase 07 integration. [Task rules](TASK_MANAGEMENT.md) · [Learning rules](LEARNING_MANAGEMENT.md).

