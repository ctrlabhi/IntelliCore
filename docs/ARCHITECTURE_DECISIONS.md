# Architecture Decision Records (ADRs)

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

