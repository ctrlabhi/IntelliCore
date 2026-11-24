# IntelliCore V2.0 project progress

**Updated on 2026-11-25 (Asia/Kolkata).** Phase 05 builds on `75e329e`. Attendance, leave, Daily Work Reports and corrections are implemented and verified on disposable MySQL. Existing Docker Compose runtime and live Firebase sign-in remain unverified.

## Phase and checkpoint history

| Phase | Status | Evidence and checkpoint |
| --- | --- | --- |
| Pre-01 | Legacy website, Firebase workflows and Notes AI preserved | Git branch and tag `checkpoint-pre-phase1` at `833a549` preserve the pre-migration website with the watermarked PDF feature. [Original audit](PROJECT_AUDIT.md). |
| 01 | Completed | `d128924` introduced the modular monolith, same-origin Express serving, MySQL, Prisma, persistent storage, Compose, phpMyAdmin and test infrastructure. The historical tracker records 26 passing tests. |
| 02A | Completed per report | `c20f4ed` isolated `intellicore-dev`, reported Spark plan, registered the development web app and configured Google and email/password sign-in, localhost and read-only Admin credential mount. The report records 26 passing tests. [Phase 02A report](PHASE_02A_REPORT.md). |
| 02B | Implemented | `2c3a8d8` added six relational identity/RBAC tables, eight roles, 11 permissions and 49 mappings per report, Firebase Bearer authentication, bootstrap and profile endpoints, and shared frontend auth. UTC MySQL, authenticated health check and persistent-volume behavior were reported verified. 40 historical tests passed. [Phase 02B report](PHASE_02B_REPORT.md). |
| 02C | Accepted with outstanding verification | `6dd4d6a` added MySQL privilege hardening, ACTIVE role/permission gates, OAuth CSP/COOP compatibility and zero-Firestore dashboard architecture. Phase report verified development Founder bootstrap, real Google sign-in, Founder dashboard, logout and zero legacy Firebase business-data requests. 45 historical tests passed. Email/password and session acceptance remain open. [Phase 02C validation](PHASE_02C_VALIDATION.md). |
| 03 | Implemented and conditionally accepted | `1fe8067` added staff profiles, audit logs, user and staff administration, role/permission controls, 21 total permissions, administrative stats and Founder dashboard bindings. 65 historical tests passed across 14 files. The recovered Principal Engineer review required follow-up evidence. [Phase 03 report](PHASE_03_REPORT.md). |
| 04 | Conditionally accepted | Department assignments, onboarding, review, enrollment, manual completion, MySQL metrics, auditing and four dashboards. 91 tests passed, plus four synthetic browser role workflows. [Phase 04 engineering report](PHASE_04_REPORT.md). |
| 05 | Implemented, with existing-stack acceptance open | Automatic check-in, explicit checkout, deterministic attendance history, Daily Work Reports, leave, corrections and four dashboards. 112 tests passed across 19 files. |
| 06 | Pending | Task pacing and learning management. Curriculum content exists. |
| 07 | Pending | SMTP email notifications and dispatcher. Email integration is a stub. |
| 08 | Pending | Google Meet and certificate generation. Calendar integration is a stub and a certificate template exists. |
| 09 | Pending | Full frontend unification and role dashboards. |
| 10 | Pending | Security hardening, final verification and delivery. |

Earlier reports use the preceding checkpoint in their headers for Phase 02C and Phase 03. The commit identifiers above are the local Git commits that contain each phase's changes. The prior tracker at `1fe8067` marked Phase 04 pending. The later working-tree and Antigravity evidence supersedes that status. [Development log](DEVELOPMENT_LOG.md).

## Migrations and seed

| Local migration directory | Changes | Historical evidence |
| --- | --- | --- |
| `20261124000000_init` | `system_settings` | Phase 01 foundation and Phase 02B persistence report. |
| `20261124090525_add_auth_rbac_models` | `users`, `profiles`, `roles`, `permissions`, `user_roles`, `role_permissions` | Phase 02B report records successful application. |
| `20261124133504_add_staff_and_audit_models` | `staff_profiles`, `audit_logs` | Phase 03 report records successful application. |
| `20261124141807_add_internship_and_department_models` | `departments`, `user_departments`, `internship_applications`, `internships` | Antigravity Prisma output records successful application and client generation at 19:48 IST on 2026-11-24. A follow-up MySQL command listed all four tables. |
| `20261125000000_add_attendance_leave_and_reports` | `attendance_policies`, `attendance_eligibility`, `attendance`, `daily_work_reports`, `leave_requests`, `attendance_corrections` | Additive migration passed on both an empty schema and a populated Phase 04 fixture. Existing users and enrollments were preserved, and only eligible enrollments received cutover periods. |

The Git exception is limited to `prisma/migrations/*/migration.sql`. All four original SQL files and `migration_lock.toml` are preserved. The five migrations deployed on disposable MySQL and matched the ledger. The existing development stack's ledger and privilege configuration require live confirmation.

The Phase 04 schema retains the four handover models and two lifecycle enums. The seed adds nine departments and 13 permissions (34 definitions), alongside the original settings and eight roles. Isolated tests generated the Prisma client and applied the seed on the disposable schema.

## Context reconciliation verification on 2026-11-25

| Check | Result | Evidence |
| --- | --- | --- |
| Git, route and database source inspection | PASS | HEAD and pre-existing changes verified locally. The Phase 04 diff affects only the Prisma schema and seed, with corresponding ignored local SQL. |
| Prisma schema validation | PASS | `prisma validate --schema prisma/schema.prisma` on the working schema using Node.js 24.20.0 and placeholder database URLs in an isolated copy. |
| Database-independent regression subset | PASS | Vitest 3.2.7, **36 tests across seven files**. Config (4), utilities (5), API v1 (3), auth middleware (10), health (2), security headers/blocked paths (4), static serving (8). Health checks exercised the unavailable database path. Firebase verification scenarios used mocks. |
| Full 65-test baseline | NOT VERIFIED | The 29 tests in auth endpoints, Founder bootstrap, users, staff, roles, audit and admin stats were excluded from the isolated run. Those files depend on a real seeded database for at least part of their coverage, and several expect a pre-existing Founder fixture. The 65/65 result remains historical. |
| Current running stack, migrations and grants | NOT VERIFIED | Docker client is installed, but the local Docker service was stopped and the engine endpoint was unavailable. No live MySQL connection was made. |
| Live browser and Firebase authentication | NOT VERIFIED | This reconciliation used source and the dated phase reports and Antigravity artifacts. No live Firebase or real account actions were performed. |

That reconciliation used a temporary copy without the repository environment file or secrets and pointed health probes at an unreachable loopback port. The Phase 04 implementation ran the additional checks below.

## Phase 04 verification on 2026-11-25

| Check | Result | Evidence |
| --- | --- | --- |
| Prisma schema, client and migrations | PASS | Validated schema, generated Prisma Client 6.19.3, and applied all four original migrations from a fresh clone on disposable MySQL 8.4.13. Source and ledger checksums matched, and Prisma found no schema drift. |
| Complete automated suite | PASS | **91 tests across 17 files**. This includes 17 unit tests, 35 in MySQL-dependent suites and 39 other HTTP and mocked integration tests. Firebase verification used fixtures. |
| Browser workflow | PASS | Headless Edge with fixture Firebase identities, real Express APIs and disposable MySQL. Founder created a department and assigned a leader. Pending Intern submitted a draft at mobile width. HR approved and persisted enrollment. Team Leader saw their scoped roster. The intern saw their own enrollment. |
| Runtime health and API documentation | PASS | Express over loopback returned success from `/health`, `/ready`, `/api-docs` and `/api-docs.json` against disposable MySQL. |
| Existing Docker and live Firebase | NOT VERIFIED | Docker Linux engine pipe was absent, including in the read-only check outside the sandbox. Firebase browser authentication and the existing MySQL ledger, grants and phpMyAdmin remain open. |

## Phase 05 verification on 2026-11-25

| Check | Result | Evidence |
| --- | --- | --- |
| Baseline and complete suite | PASS | The inherited 91 tests passed before Phase 05 tests were added. The final suite passed 112 tests across 19 files. |
| Populated upgrade | PASS | Preserved existing fixture users and enrollments, added only observed eligibility, matched all five ledger checksums, and found zero schema drift. |
| Browser and API runtime | PASS | Headless Edge exercised the four dashboards using synthetic Firebase identities with real Express and disposable MySQL. Liveness, readiness and Swagger endpoints responded. |
| Existing development environment | NOT VERIFIED | Docker Linux engine pipe was absent outside the sandbox as well. Existing service health, grants, ledger, phpMyAdmin and actual Firebase remain open. |

## Outstanding verification

| Area | Evidence still required |
| --- | --- |
| Phase 02C authentication | Actual email/password registration and login, unverified email workspace/API denial, verification email delivery/resend and subsequent access, password reset delivery and completion, session restoration, protected API access and logout. Recheck development-only project and revoked/disabled identity handling in an authorized environment. |
| Phase 03 DB access and reproducibility | Exact runtime and migration grants, absence of runtime DDL/shadow privileges where unnecessary, absence of migration credentials from the normal application process, Prisma migration ledger and repeatable rebuild from a checkout, and healthy app/MySQL/phpMyAdmin with records/volumes preserved. |
| Phase 03 role concurrency and audit grants | The isolated suites verify protected grants, staff concurrency and reactivation, role changes, matrix edits, rollback, and ordinary audit API immutability. Concurrent role replacement and database-level audit retention and grant checks remain open. |
| Phase 03 browser | Founder department work was exercised with synthetic identities. Complete staff provisioning, role change, suspension/reactivation and audit browser workflows under authorized development Firebase identities remain open. |
| Existing runtime acceptance | Verify migration and seed metadata, effective runtime and migration database privileges, authenticated phpMyAdmin, and real browser authentication on the existing development stack when available. Phase 06 requires the next manual implementation prompt. |

Related source-level findings are recorded in [Security rules](SECURITY_RULES.md#open-control-verification).

