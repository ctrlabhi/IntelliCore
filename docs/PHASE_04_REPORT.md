# IntelliCore V2.0 Phase 04 engineering report

- **Date** 2026-11-25 (Asia/Kolkata)
- **Implementation checkpoint** `b73e6c8` on local `main`
- **Handover checkpoint** `1fe8067`
- **Status** Implemented and verified on disposable MySQL. Existing Docker and live Firebase acceptance remain open.

## Implementation

Phase 04 extends the Antigravity schema and seed work with department administration, staff membership, verified intern onboarding, application review, and the internship lifecycle. Founder, HR, Team Leader and Intern dashboards call the same-origin Express APIs. Organization, application and enrollment statistics are backed by MySQL. The existing curriculum, branding and dashboard URL aliases are preserved. Learning delivery, attendance, notifications and certificates remain in their assigned phases. [Master project context](MASTER_PROJECT_CONTEXT.md).

Department policies preserve inactive records and membership history. Verified interns can save, edit, submit, revise and withdraw their own applications. Authorized reviewers can request changes, reject or approve. Approval validates department and leader eligibility, locks the applicant row, checks duplicate and overlapping enrollment, and writes application status, enrollment, eligible account activation and audit events in a single MySQL transaction.

Enrollment codes use the `IC-INT-` prefix and a UUID-backed suffix. A business-date window determines upcoming, ongoing and due-for-review states. Manual HR sign-off persists completion. Termination and withdrawal preserve the user's identity and enrollment history. Tests confirmed terminal records remain visible to their owner and reject later generic edits. [Database design](DATABASE.md#phase-04-schema-and-migration-tracking).

## RBAC and previous-phase corrections

- Staff provisioning, user role replacement, permission matrix editing and department writes require an active Founder role and the configured primary Founder identity. Protected grants are excluded from non-Founder effective permissions and seed mappings. Older database mappings are retained as records and confer no authority for these routes.
- The primary Founder is protected from HTTP role assignment, role replacement and deactivation, including deactivation through a staff profile. Authorization covers the server's actual role and account state even when a stored permission differs.
- Staff provisioning serializes account decisions and retries unique staff-code collisions. Staff suspension and reactivation synchronize account state. Generic activation cannot take the place of the approved internship or staff process.
- Application review requires an authorized review role and its permission. HR Executive and Admin maintain authorized reads. Team Leaders need active account, role, employment and department assignment. The application and enrollment endpoints apply ownership or department scope before returning details.
- The authentication-only development Firebase boundary is enforced in SDK initialization and token verification. Onboarding requires a verified token, and protected workspace actions enforce verification for email/password identities. Mutating tests require an explicitly scoped isolated MySQL target. [Security rules](SECURITY_RULES.md).

## Migration reproducibility

The Git rule allows only `prisma/migrations/*/migration.sql` through the general SQL ignore rule. Dumps and backups stayed excluded. All four original files and `migration_lock.toml` were present in a fresh local clone of `b73e6c8`. Their SHA-256 checksums matched the pre-handover files and the completed migration ledger in an empty disposable MySQL 8.4.13 schema.

`prisma migrate deploy` applied all four migrations. `prisma migrate status` reported up to date and `prisma migrate diff` reported no difference against the checked-out schema. A separate schema-scoped migration principal performed DDL. A DML-only runtime principal ran the seed and produced nine starting departments. A separate reseed check preserved an edited, inactive department. Historical migration SQL remains byte-identical. [Migration inventory](PROJECT_PROGRESS.md#migrations-and-seed).

## APIs and dashboards

| Surface | Delivered behavior |
| --- | --- |
| `/api/v1/departments` | Active and assigned catalogs, primary Founder creation, metadata and status, staff assignment and eligible leader lookup. |
| `/api/v1/internship-applications` | Paginated own or authorized views, draft creation and updates, submission, withdrawal, revision requests, rejection and transactional approval. |
| `/api/v1/internships` | Paginated and filtered scope-aware views, own history, enrollment updates, leader assignment, completion review and approval, termination and withdrawal. |
| `/api/v1/admin/stats` | Real department, per-department enrollment, application and enrollment lifecycle counts. |
| Founder | Department and assignment management, application decisions, enrollments, staff controls, audit and live metrics. |
| HR | Applicant details and review queue, authorized decisions, leader and date selection, and completion operations. Read-only roles see authorized records. |
| Team Leader | Assigned departments and scoped internship roster with history and leader details. |
| Intern | Profile and verified onboarding, own drafts and revisions, submission and withdrawal, status and enrollment history. |

The complete contract and request fields are in [API.md](API.md#phase-04-departments-applications-and-internships) and the application's OpenAPI document.

## Verification evidence

| Category | Result |
| --- | --- |
| Unit tests | **17 passed**, including business dates, overlap rules, scope construction, retry behavior, fixture isolation and Founder bootstrap guards. |
| MySQL-dependent suites | **35 passed**, including the Phase 03 regression suite and real MySQL workflow, concurrency, role matrix, rollback and audit tests. Firebase verification used synthetic responses. |
| Other HTTP and mocked integration suites | **39 passed**, including all seven non-Founder roles and an identity mismatch on a stored Founder role, pending and unverified access, static serving and API contracts. |
| Complete automated run | **91 passed across 17 files** on Node.js 24.20.0, Vitest 3.2.7 and Prisma Client 6.19.3. |
| Additional lifecycle and seed checks | Applicant withdrawal, owner enrollment withdrawal, manager termination, denial of terminal edits, retained owner history and repeat-seed preservation passed against disposable MySQL. |
| Browser workflow | Headless Edge used the real dashboard pages, Express and disposable MySQL with synthetic Firebase identities. At desktop width, Founder created a department and assigned a Team Leader. A pending Intern saved and submitted a draft at 390 px. HR approved enrollment, the Team Leader saw the scoped roster, and the Intern saw their own enrollment. No local script, stylesheet or JavaScript runtime errors were observed in those flows. |
| Runtime | The loopback app returned success from `/health`, `/ready`, `/api-docs` and `/api-docs.json` with real MySQL readiness. Compose configuration validation passed. Docker's Linux engine pipe was absent even during the read-only check outside the sandbox. |

## Acceptance checklist

| Criterion | Status | Evidence or remaining check |
| --- | --- | --- |
| Versioned migration chain and schema integrity | PASS | Fresh checkout, byte-matched files and ledger, empty-schema migration, zero drift. |
| Department management, staff assignments and Team Leader scope | PASS | Browser creation and assignment, plus database-backed deactivation, eligibility and cross-scope denial tests. |
| Verified pending onboarding, drafts, submission and review | PASS | Browser draft-to-enrollment, MySQL revision/rejection and owner checks, and HTTP verification and mass-assignment tests. |
| Unique enrollment, overlap and audit atomicity | PASS | Concurrent repeated and overlapping approvals, unique enrollment and audit rollback against MySQL. |
| Date-gated internship lifecycle and manual completion | PASS | Timezone and start guards, MySQL manual completion, withdrawal, termination and history checks. |
| Founder-only privilege and primary Founder protection | PASS | Phase 03 and 04 regression tests, including permission conflicts, unauthorized roles, status protection and audit history API protection. |
| Four dashboards, metrics and API documentation | PASS | Real browser workflows with synthetic auth, MySQL stats, and live Swagger/OpenAPI checks. |
| Existing Compose services, phpMyAdmin, active development migration ledger and grants | NOT VERIFIED | Docker engine unavailable. Separate test principals and the disposable ledger were verified. |
| Live Firebase login, email verification and password reset delivery, session restoration and revocation | NOT VERIFIED | Browser workflow used synthetic identity. Actual development Firebase sign-in and delivery remain open. |
| Live Founder staff administration and database audit retention | NOT VERIFIED | Isolated backend coverage passed. The live workflow and existing database grant/retention settings remain open. |

The review used isolated databases and synthetic accounts. Production Firebase, existing database data and persistent Docker volumes were untouched. The commits are local. Phase 05 requires the next manual implementation prompt.
