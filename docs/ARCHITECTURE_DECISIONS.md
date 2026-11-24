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
