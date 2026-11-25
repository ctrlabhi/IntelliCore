# Phase 08 engineering report

- **Date** 2026-11-25 (Asia/Kolkata)
- **Starting checkpoint** `c9da6dd` with clean working tree
- **Implementation checkpoint** Local `main` working tree (Phase 08)
- **Acceptance** Implemented and verified on isolated MySQL 8.4 infrastructure with 100% test pass rate. Existing-stack upgrade, live Firebase and live Calendar/SMTP remain open.

## Executive summary

Phase 08 implements runtime recovery diagnosis, database-backed meeting management, manual certificate email status tracking, internship extensions, and promotions in the IntelliCore modular monolith.

1. **Runtime Recovery Rehearsal**: Diagnosed the historical migration ledger failure on the existing development stack (`20261125000000_add_attendance_leave_and_reports` failed due to runtime DDL privilege restrictions). Verified that all 9 migrations apply cleanly from fresh and restored snapshots using dedicated migration credentials with zero schema drift. Preserved existing named Docker volumes (`intellicore_mysql_data` and `intellicore_uploads_data`). Diagnosed host port 3000 binding ownership by Antigravity IDE Live Preview.
2. **Meeting Management**: Built meeting creation and audience management supporting two creation modes: `MANUAL` (Google Meet link format validation) and optional `GOOGLE_CALENDAR` (OAuth 2.0 Web Server Flow, PKCE S256, AES-256-GCM encrypted refresh tokens, background conference synchronization worker). Implemented scoped join links, audience previews with SHA-256 roster fingerprints, deduplicated participant invitations, reminders, and cancellation handling.
3. **Manual Certificate Email Status**: Enforced the strict owner mandate: certificate generation, storage, downloading, and external sending occur **100% outside IntelliCore**. IntelliCore provides only an authorized team declaration (`SENT`/`NOT_SENT`), creates an atomic in-app notification for the intern, logs immutable audit records, and queues **zero** certificate email outbox jobs.
4. **Internship Extensions & Promotions**: Supported ongoing extensions (updating expected completion dates) and completed internship extensions (creating linked continuation enrollments with gap protection and independent eligibility). Separated non-privileged intern titles (e.g. Senior Intern) from privileged staff promotions, which strictly require a distinct HR recommender, recently authenticated primary Founder approval, and atomic staff provisioning.

## Files and entry points

| Area | Repository evidence |
| --- | --- |
| Meeting Management | [Meeting routes](../backend/src/modules/meetings/meetingRoutes.js), [meeting service](../backend/src/modules/meetings/meetingService.js), [meeting rules](../backend/src/modules/meetings/meetingRules.js), [meeting access policy](../backend/src/modules/meetings/meetingAccess.js), [meeting worker](../backend/src/modules/meetings/meetingWorker.js), [calendar routes](../backend/src/modules/meetings/calendarRoutes.js) |
| Calendar Integration | [Calendar service](../backend/src/integrations/google-calendar/calendarService.js), [OAuth state & PKCE](../backend/src/modules/meetings/calendarRoutes.js) |
| Follow-up & Certificate Status | [Followup routes](../backend/src/modules/internships/followupRoutes.js), [followup service](../backend/src/modules/internships/followupService.js), [followup access](../backend/src/modules/internships/followupAccess.js), [recent auth helper](../backend/src/utils/recentAuth.js) |
| Database & Schema | [Prisma schema](../prisma/schema.prisma), [migration 20261125160000](../prisma/migrations/20261125160000_add_meetings_and_internship_followups/migration.sql), [seed catalog](../prisma/seed.js) |
| Frontend Dashboards | [Phase 08 dashboard launcher](../frontend/assets/js/phase08-dashboard.js), [meetings workspace](../frontend/assets/js/phase08-meetings.js), [followups workspace](../frontend/assets/js/phase08-followups.js), [Founder UI](../frontend/pages/dashboards/founder/index.html), [HR UI](../frontend/pages/dashboards/hr/index.html), [Team Leader UI](../frontend/pages/dashboards/team-leader/index.html), [Intern UI](../frontend/pages/dashboards/intern/index.html) |
| Testing & Verification | [Calendar unit tests](../tests/unit/phase08Calendar.test.js), [MySQL integration tests](../tests/integration/phase08MySql.test.js), [OpenAPI 3.0 specification](../backend/src/config/phase08OpenApi.js) |
| Specifications | [Runtime recovery](../docs/RUNTIME_RECOVERY.md), [Meeting management](../docs/MEETING_MANAGEMENT.md), [Calendar integration](../docs/GOOGLE_CALENDAR_INTEGRATION.md), [Extensions & promotions](../docs/INTERNSHIP_EXTENSIONS_AND_PROMOTIONS.md), [Manual certificate email status](../docs/MANUAL_CERTIFICATE_EMAIL_STATUS.md) |

## Database and migration verification

The migration `20261125160000_add_meetings_and_internship_followups` introduces 7 new tables:
1. `meetings`: Stores meeting metadata, creation mode (`MANUAL`/`GOOGLE_CALENDAR`), timing, Google Meet URL, status, version, and provider synchronization state.
2. `meeting_participants`: Composite primary key `(meeting_id, user_id)` tracking individual invitations, response statuses (`INVITED`, `ACCEPTED`, `DECLINED`), and join intent timestamps.
3. `calendar_connections`: Stores AES-256-GCM encrypted refresh tokens bound to `(organizer_id, calendar_id)`.
4. `calendar_authorizations`: Short-lived single-use hashed state tokens for OAuth 2.0 PKCE initiation.
5. `internship_extensions`: Tracks extension requests, duration/dates, approval, and linked continuation enrollments.
6. `internship_promotions`: Tracks intern title changes and privileged staff promotion recommendations across lifecycle states (`PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`, `PROVISIONED`).
7. `certificate_dispatch_history`: Immutable log of manual external email dispatch declarations and corrections.

All previous 8 migration files retained their exact bytes and checksums. On disposable MySQL 8.4.13, all 9 migrations applied with zero errors and zero schema drift reported by `prisma migrate diff`.

## Permissions and RBAC enforcement

The seed catalog in `prisma/seed.js` was updated with 12 new Phase 08 permissions:
- `meetings:create:org`, `meetings:create:dept`, `meetings:read:org`, `meetings:read:dept`, `meetings:read:own`, `meetings:update:org`, `meetings:update:dept`
- `calendar:manage`
- `certificate_dispatch:declare`, `certificate_dispatch:read:org`, `certificate_dispatch:read:dept`, `certificate_dispatch:read:own`
- `internships:extend`, `internships:promote:designation`, `internships:promote:recommend_staff`, `internships:promote:decide_staff`, `internships:promote:provision_staff`

Role assignments strictly prevent privilege escalation:
- Only primary Founder and Co-Founder can approve staff promotion recommendations and provision staff profiles.
- Founder activation requires a session authenticated within the last 5 minutes (`RECENT_AUTHENTICATION_REQUIRED`).
- Self-approval of staff recommendations is rejected with HTTP 403 Forbidden.
- Team Leader meeting and followup access is strictly department-scoped; revoked department membership terminates management access immediately.

## Negative certificate verification (Critical Mandate)

Tests in `tests/integration/phase08MySql.test.js` prove the negative certificate invariants:
1. **Zero Certificate Outbox Jobs**: Marking a certificate as sent creates exactly one in-app notification row and **zero** email outbox records (`expect(await prisma.emailOutbox.count({ where: { notification: { relatedResourceId: intern.id } } })).toBe(0)`).
2. **Injected Outbox Job Cancellation**: Even if an unauthorized certificate email job is manually injected into `email_outbox`, the background email worker in `CAPTURE`, `DISABLED`, or `SMTP` mode automatically cancels it without calling transport (`expect(transport).not.toHaveBeenCalled()`).
3. **No File or Public Endpoint**: There are no certificate PDF generation routes, download handlers, storage paths, QR codes, or public verification endpoints (`GET /certificates/me` returns 404 Not Found).
4. **Correction Handling**: Correcting an erroneous declaration marks the prior in-app notification as superseded and creates an in-app notice of correction.

## Automated test results

All test suites were executed against the isolated MySQL 8.4 database:

| Category | Verified result |
| --- | --- |
| Inherited baseline (Phase 07) | 147 tests across 23 files passed |
| Phase 08 unit tests | 8 unit tests passed in `tests/unit/phase08Calendar.test.js` |
| Phase 08 MySQL integration tests | 12 integration tests passed in `tests/integration/phase08MySql.test.js` |
| **Total test suite** | **167 tests passed across 25 test files (100% pass rate)** |

The test suite verified:
- Negative authorization across all 8 roles for certificate marking, extensions, and promotions
- Atomic rollback of certificate dispatch and notifications upon audit log failure
- Deduplication and idempotency of concurrent duplicate declarations
- Extension gap protection, validation of ongoing extension dates, and prevention of overlapping periods
- Non-privileged intern designations remaining effective only within their continuation periods
- Staff promotion lifecycle requiring distinct HR recommender, recent Founder auth, and atomic staff provisioning
- Scoped meeting scheduling, join link protection (invitation required to retrieve URL), and reminder deduplication
- Team Leader scope revocation upon department membership deactivation
- Google Calendar OAuth state protection, single-browser cookie binding, PKCE S256, and AES-256-GCM token storage
- Calendar retry leasing and concurrency-safe provider synchronization

## Existing Docker runtime and open verification

1. **Docker Desktop Linux Engine**: Accessible; `intellicore_mysql` and `intellicore_app` containers running.
2. **Persistent Volumes**: `intellicore_mysql_data` and `intellicore_uploads_data` remain intact and preserved.
3. **Port 3000 Conflict**: Process ID `4940` (Antigravity IDE Live Preview) currently binds host port 3000. The application container listens internally on port 3000 within the Docker bridge network. Once port 3000 is released by the IDE, `docker compose up -d --no-deps app` will bind the host port.
4. **Existing Ledger Recovery**: The live `intellicore_db` migration ledger recovery sequence has been rehearsed and documented in `docs/RUNTIME_RECOVERY.md`. Awaiting owner confirmation of `MIGRATION_DATABASE_URL` in local `.env` before applying to live container.
5. **Phase Boundary**: All Phase 08 implementation requirements are fulfilled. Phase 09 will not begin until the owner manually prompts for it.

## Acceptance checklist

| Criterion | Result | Evidence |
| --- | --- | --- |
| Runtime recovery diagnosis and rehearsal | PASS | `docs/RUNTIME_RECOVERY.md` & disposable restore rehearsal |
| Persistent database volume preservation | PASS | `intellicore_mysql_data` & `intellicore_uploads_data` untouched |
| Meeting data models & migrations | PASS | Migration `20261125160000` applied with zero drift |
| Scoped meeting scheduling & join URL protection | PASS | Verified in `phase08MySql.test.js` |
| Meeting reminder deduplication | PASS | Deduplicated reminders with 5-min window |
| Optional Google Calendar OAuth & PKCE | PASS | AES-256-GCM token encryption, HttpOnly cookie state |
| Provider synchronization worker | PASS | Lease-backed concurrency, idempotency tested |
| Manual certificate email declaration | PASS | Explicit human confirmation, in-app notice only |
| Zero certificate PDF/storage/download/email | PASS | Negative integration tests confirm 0 outbox jobs |
| Ongoing and completed internship extensions | PASS | Expected date updates & linked continuation enrollments |
| Extension gap & overlap protections | PASS | Verified in `phase08MySql.test.js` |
| Non-privileged intern designation updates | PASS | Separated from RBAC, scoped to continuation |
| Privileged staff promotion recommendation & provisioning | PASS | Distinct recommender, recent Founder auth, atomic provisioning |
| Founder, HR, TL & Intern dashboard integration | PASS | Mounted in HTML dashboards with REST API clients |
| Automated test suite passing | PASS | **167/167 tests passing across 25 files** |
| Documentation completeness | PASS | Runtime recovery, meeting, calendar, followup docs |
| Production Firebase isolation | PASS | `intellicore-229` completely quarantined |
