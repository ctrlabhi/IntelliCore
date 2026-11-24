# IntelliCore V2.0 Phase 05 engineering report

- **Date** 2026-11-25 (Asia/Kolkata)
- **Baseline** `75e329e`, including the conditionally accepted Phase 04 implementation at `b73e6c8`
- **Phase 05 implementation** `4d19095` on local `main`
- **Acceptance state** Implementation verified on disposable MySQL. Existing-stack and actual Firebase checks remain open.

## Delivered

- Verified active interns check in automatically on eligible visible dashboard access. An early-open dashboard schedules its first check-in from the server's supplied opening time. A user row lock and unique enrollment/date key make duplicate requests idempotent.
- Explicit logout records the current-day UTC checkout, reports missing required evidence and proceeds with Firebase sign-out even when checkout fails. No synthetic checkout is written when the working window closes or the business date rolls over.
- Day summaries separate the live state, primary classification and late, early-departure, missing-checkout and missing-report flags. Historical eligibility is tracked as effective intervals across enrollment, account and role changes. A full observed working window is required to infer absence.
- Interns save drafts, submit before 20:00 IST and read their own reports. Authorized staff review submitted reports. Leave requests support validated dates, working-day counts, overlap prevention, approval, rejection and eligible cancellation. Approval over recorded attendance requires an explicit reconciliation decision that retains the original timestamps.
- Timestamp and late-report corrections preserve the original values and proposal. Authorized review requires remarks and writes changes, decisions and audit events in the same transaction. The Founder, HR, Team Leader and Intern dashboards use the real REST endpoints with backend role and resource scope. [Operating rules](ATTENDANCE.md) · [REST and OpenAPI](API.md#phase-05-attendance-leave-and-work-reports).

## Migration and privilege verification

The new migration `20261125000000_add_attendance_leave_and_reports` adds six tables and an initial policy. All four existing SQL files remain byte-identical. The clean disposable schema supported the test suite. A second schema was built from the four Phase 04 migrations, seeded with a separate DML-only account, populated with active and suspended internship fixtures and then upgraded with a separate schema-scoped migration account. The two original users and enrollments remained. Only the qualifying enrollment received eligibility at cutover, and zero attendance events were synthesized. The five completed ledger hashes matched and Prisma reported zero schema drift.

Eight roles remain, with ten additional permission definitions. Leave, report and correction decisions require Founder or HR Manager authority and the matching grant. Team Leaders have read-only access within active assignments. Primary Founder-only policy publication remains protected from permission delegation. Organization summaries and CSV exclude private report and leave content. [Schema](DATABASE.md#phase-05-data-model) · [Security](SECURITY_RULES.md#phase-05-controls).

## Automated and browser evidence

| Category | Result |
| --- | --- |
| Inherited Phase 04 regression baseline | **91 passed** before the new tests were added. |
| Unit tests | **26 passed**, including exact IST checks, historical coverage, finalization, and timeout or network failures during logout. |
| MySQL-dependent suites | **47 passed** on MySQL 8.4.13, including concurrent check-in and leave approval, actual checkout, cutoff enforcement, review, corrections, rollback, scope and export. Firebase tokens used fixtures. |
| Other HTTP and mocked integration suites | **39 passed**. |
| Complete run | **112 passed across 19 files**, with Node.js 24.20.0, Prisma Client 6.19.3 and Vitest 3.2.7. |
| Browser | Headless Edge used the actual dashboard pages and Express/MySQL operations with a synthetic authentication adapter. At 390 px the Intern dashboard opened before the shift, checked in automatically at the exact opening, submitted a report, requested leave and recorded checkout through the logout flow. HR approved the leave and reviewed the submitted report. Team Leader saw scoped attendance and no decision controls. Founder saw organization analytics, CSV and policy controls. The exercised pages had no local script, stylesheet or JavaScript runtime errors. |
| Runtime | Loopback Express liveness, MySQL readiness, Swagger UI and OpenAPI passed. Compose configuration validation passed. The existing Linux engine pipe was absent during the read-only Docker check outside the sandbox. |

## Acceptance and carryover

| Criterion | Status | Evidence |
| --- | --- | --- |
| Verified intern eligibility, exact working window and duplicate protection | PASS | MySQL concurrency and account/date tests, plus the opening-time browser workflow. |
| Checkout, early departure and missing evidence | PASS | Same-date idempotency, overnight protection, independent flags and bounded sign-out tests. |
| Historical absence and leave reconciliation | PASS | Effective eligibility across suspension/reactivation, partial eligibility, weekends, approved leave and concurrent check-in/approval. |
| Reports and authorized corrections | PASS | Draft and submission cutoff, preserved original values, late acceptance and rollback when audit fails. |
| RBAC, audit, filtering and export | PASS | Own and assigned scope, reviewer restrictions, policy guard, rollback and formula-neutral CSV. |
| Data integrity and migrations | PASS | Populated upgrade, preserved historical SQL, five matching ledger checksums and zero drift. |
| Existing containers, migration ledger, runtime and migration grants, authenticated phpMyAdmin | NOT VERIFIED | Existing Docker engine unavailable. Disposable database evidence applies to the isolated test environment. |
| Real Firebase sign-in, email/password registration, verification email, password reset, restoration and revocation | NOT VERIFIED | The browser used synthetic authentication. These checks carry forward with the existing Phase 03 and 04 live acceptance items. |

Verification used disposable infrastructure. Existing databases and volumes, production Firebase and the live website were untouched. Phase 06 requires the user's next manual implementation prompt.
