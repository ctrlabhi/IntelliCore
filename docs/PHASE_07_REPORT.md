# Phase 07 engineering report

- **Date** 2026-11-25 (Asia/Kolkata)
- **Starting checkpoint** `af38bcd`, with Phase 06 implementation `3085ef8` and a clean working tree
- **Implementation checkpoint** `afa746b` on local `main`
- **Acceptance** Verified on isolated infrastructure. Existing-stack upgrade, live Firebase and real SMTP remain open.

## Executive summary

IntelliCore now creates authorized notifications and eligible email jobs transactionally with successful business writes. A separate process running the same application code claims durable MySQL jobs, processes reminders and publishes scheduled announcements. Capture is the default development delivery mode. The Founder, HR, Team Leader and Intern dashboards use genuine REST data for notifications, announcement scope, and the relevant operational controls. No provider availability is required for a successful application, leave, learning or task operation.

## Previous-phase corrections

The Phase 06 baseline contains 131 tests, including all 112 inherited Phase 05 tests. All 131 passed after notification hooks were added. Phase 07 added two explicitly authorized assessment operations. Score amendments verify the current approval and the original rubric, append a revision, and leave the original review unchanged. The performance history displays the effective score with its original. Learning staff may correct recorded lesson progress with a reason and current revision check. Prior timestamps and statuses remain in immutable history, and enrollment progress is recalculated. Existing UTF-8 text and static PNG attachment handling retains its previous limits.

## Files and entry points

| Area | Repository evidence |
| --- | --- |
| Notifications and audiences | [Feed and event persistence](../backend/src/modules/notifications/notificationService.js), [event catalog](../backend/src/modules/notifications/notificationPolicy.js), [role policy](../backend/src/modules/notifications/notificationAccess.js), [announcement service](../backend/src/modules/notifications/announcementService.js), [routes](../backend/src/modules/notifications/notificationRoutes.js) |
| Email and worker | [Configuration](../backend/src/integrations/email/emailConfig.js), [renderer](../backend/src/integrations/email/emailTemplates.js), [transport](../backend/src/integrations/email/emailService.js), [job queue](../backend/src/modules/notifications/emailQueue.js), [worker loop](../backend/src/modules/notifications/notificationWorker.js), [reminder service](../backend/src/modules/notifications/reminderService.js), [admin service](../backend/src/modules/notifications/emailAdministration.js) |
| Database and runtime | [Prisma schema](../prisma/schema.prisma), [notifications migration](../prisma/migrations/20261125143000_add_notifications_and_email_outbox/migration.sql), [assessment migration](../prisma/migrations/20261125143100_add_assessment_correction_history/migration.sql), [seed](../prisma/seed.js), [Compose](../docker-compose.yml), [maintenance launcher](../backend/src/scripts/migrateDatabase.js), [worker launcher](../backend/src/scripts/notificationWorker.js) |
| Assessment and integration | Existing internship, attendance, work and learning services call the shared event producer. [Score amendments](../backend/src/modules/work/submissionService.js) · [Learning corrections](../backend/src/modules/learning/learningService.js) |
| Frontend | [Four dashboard shells](../frontend/pages/dashboards), [notification center](../frontend/assets/js/phase07-dashboard.js), [announcement authoring](../frontend/assets/js/announcement-dashboard.js), [email diagnostics](../frontend/assets/js/notification-admin-dashboard.js), and [responsive styles](../frontend/assets/css/phase07-dashboard.css) |
| Testing and contracts | [Unit checks](../tests/unit/phase07Notifications.test.js), [MySQL suite](../tests/integration/phase07MySql.test.js), [OpenAPI](../backend/src/config/phase07OpenApi.js), and project operating specifications |

## Database and migration verification

Two additive migrations add nine tables. The notification migration adds notices, preferences, email outbox jobs, delivery attempts, announcements, receipt snapshots and worker heartbeats. The assessment migration adds append-only score amendments and learning progress corrections. Recipient, event-fingerprint, attempt-sequence and scope indexes protect ownership and idempotency. All six prior migration files retain their exact bytes.

On disposable MySQL 8.4.13, the fresh schema applied all eight migrations. A second schema began with the exact Phase 06 chain and synthetic users, internships, attendance, leave, reports, task definitions, assignments, submissions, reviews, curriculum and learning progress. Row counts and hashes matched across 20 existing tables before migration, after migration and after reseeding. The ledger matched all eight source checksums and Prisma found zero drift. The migration and seed generated no historical notifications, emails or assessment amendments. The disposable runtime and migration principals were separate. Prisma Client 6.19.3 generated successfully. [Database specification](DATABASE.md#phase-07-schema).

## Notifications, business events and announcements

The event catalog covers application submission and decisions, enrollment, commencement, mentor assignment, completion and termination, daily report availability and review, leave and attendance correction decisions, task assignment/deadline/submission/review/cancellation, learning allocation and completion, announcements and both new assessment operations. Authorized reviewer audiences come from MySQL roles, permissions and active department membership. User notices derive recipients from the business record. The event/resource/revision/recipient fingerprint prevents duplicate writes. [Full event-to-recipient and channel matrix](NOTIFICATION_MANAGEMENT.md#recipients-and-channels).

Organization, staff, interns, department and selected-person announcements use role ceilings and an audience preview. Immediate publishing verifies the revision and exact audience fingerprint. Scheduled publishing stores the approved audience and actor and verifies eligibility and the actor’s access at execution. The publication, receipt rows, in-app notices and audit commit together. Announcements are in-app only. [Announcement lifecycle](ANNOUNCEMENT_MANAGEMENT.md).

## Email modes, templates and worker

Version 1 templates render fixed IntelliCore copy with escaped HTML, plain text and an allowlisted internal action path anchored to the configured application origin. The company-announcement template is present for controlled future use. Captured messages remain local and can be inspected through sanitized Founder diagnostics. The pinned Nodemailer transport requires explicitly approved SMTP mode, an approved exact recipient allowlist, complete credentials and verified TLS. Production delivery remains locked. [Templates](EMAIL_TEMPLATES.md) · [SMTP configuration](EMAIL_INTEGRATION.md).

The worker uses a table-scoped account. It locks bounded job batches with MySQL SKIP LOCKED, records leases and attempts, retries known transient failures with jitter, and stops at the configured limit. It revalidates recipient state, preferences and the linked record before sending. Expired claims recover if transport had yet to begin. Possible SMTP acceptance with no persisted result is held for explicit review. SENT means an SMTP server accepted the message. The worker status endpoint reports heartbeats separately from application health. [Claims, retry and recovery](BACKGROUND_PROCESSING.md#claims-and-retries).

Scheduled reminders use IST business dates and UTC processing times. They cover upcoming tasks, missing reports before cutoff, commencement and approaching internship completion review. Report reminders exclude approved leave and weekly off. Task reminders exclude completed and cancelled work. Configured scan limits, active windows and durable deduplication bound downtime recovery. [Reminder rules](BACKGROUND_PROCESSING.md#reminder-windows).

## API, dashboard and security verification

The versioned REST surface includes the notification feed and preferences, recipient and administration announcement views, sanitized outbox and attempts, worker status and reminder settings, and the score and learning correction endpoints. Zod validates mutations. Firebase establishes identity and MySQL enforces lifecycle, role, permission, ownership and department scope. Notification action links resolve through the existing resource guards. Browser rendering treats content as text. Role-restricted, rate-limited mutations audit status changes while omitting private message content and raw provider errors. [API contracts](API.md#phase-07-notifications-announcements-and-delivery) · [Permission matrix](RBAC.md#phase-07-notification-and-assessment-permissions).

| Workspace | Edge acceptance with synthetic Firebase identities |
| --- | --- |
| Founder | Created, previewed and published a company announcement. Inspected actual outbox and delivery attempts, the capture preview and live worker heartbeat. |
| HR | Approved a leave request through the authenticated application API from the HR browser session. The correct intern received the notice. Outbox administration remained unavailable to HR. |
| Team Leader | Created and published a department announcement and assigned a task through the dashboard. An unrelated department's intern could not read the scoped announcement. |
| Intern | At 390 px, used the visible unread badge, recent menu, Escape dismissal and focus return, notification center, mark-read, authorized task link, announcements and preferences. Another intern's notification returned 404. |

A real separate worker process used a table-scoped MySQL account to capture application jobs and publish a scheduled announcement. The browser had no unexpected same-origin HTTP errors, network failures, JavaScript exceptions or Content Security Policy errors. The disposable app served liveness, readiness and Swagger. Capture evidence proves local processing only.

## Automated and real MySQL results

| Category | Verified result |
| --- | --- |
| Inherited Phase 06 | 131 passed across 21 files, including the 112 Phase 05 tests |
| Final Phase 07 | **147 passed across 23 files** |
| Unit | 37 passed, including five new transport/configuration and notification tests |
| MySQL-dependent integration | 71 passed, including 11 new Phase 07 cases |
| Other HTTP, security and mock integration | 39 passed |
| External SMTP | NOT VERIFIED |

The real MySQL suite verified duplicate and rollback behavior, concurrent claims, stale owners, expired leases, ambiguous transport, retry exhaustion, preferences, scoped audiences, scheduled publishing, reminder windows, and both assessment histories. SMTP factory tests injected a mock transport and never sent email. Real worker tests used CAPTURE.

The final run used Node.js 24.20.0 and Vitest 3.2.7 on a fresh disposable schema with two Vitest workers. An earlier run on reused fixtures hit the default five-second test timeout in two inherited cases. Both passed in the final run.

## Existing Docker runtime and live acceptance

Docker Desktop's `desktop-linux` engine became accessible. The existing app and MySQL containers were healthy, and phpMyAdmin was running. The app returned HTTP 200 for the site, health, readiness and Swagger from inside the app container. The upload mount was readable and writable by the running app identity. Authenticated phpMyAdmin at localhost:8080 passed with the existing development runtime account. The existing app container had no published host port 3000 binding. Probes to host port 3000 reached a listener where health, readiness and Swagger returned 404.

The existing `intellicore_db` is MySQL 8.4.13 in UTC. Its ledger contains four completed migrations and an unfinished Phase 05 entry with a permission-denied error and zero applied steps. The relevant Phase 05 and later tables were absent. The runtime principal has SELECT, INSERT, UPDATE and DELETE on the application schema. A separate migration principal and its schema grants exist. Its credential was unavailable locally. The existing ledger, database contents, uploads and volumes were left intact. The next live migration attempt requires the existing dedicated credential and the approved backup workflow before ledger reconciliation and additive deployment.

Real development Firebase sign-in, email verification and reset, session restoration and disabled or revoked identity checks remain open. Real SMTP is awaiting explicit authorization of the provider, sender mailbox and test address. Production Firebase and the live website were untouched.

## Engineering defaults and limits

The worker initially polls every five seconds and processes five email jobs per batch. The lease is 60 seconds. Automatic retries default to five attempts and a bounded exponential schedule. Email is optional, with capture by default in development. Announcements use an explicit audience cap and per-recipient receipts without bulk SMTP. Task deadline reminders default to 24 hours before due, daily report reminders to the last 30 minutes before cutoff, commencement to two days plus commencement day, and completion review to three days. Changes to these windows are audited. Assessment corrections apply to observed states and original scored work under separate permissions. [Worker configuration](BACKGROUND_PROCESSING.md) · [Private attachment limits](FILE_STORAGE.md).

## Acceptance checklist

| Criterion | Result |
| --- | --- |
| In-app notification persistence | PASS |
| Notification recipient isolation | PASS |
| Notification center | PASS |
| Unread badge | PASS |
| Read and archive operations | PASS |
| Business event integration | PASS |
| Transactional outbox | PASS |
| Event deduplication | PASS |
| Background worker processing | PASS |
| Concurrent worker safety | PASS |
| Restart recovery | PASS |
| Bounded retry handling | PASS |
| Email template rendering | PASS |
| Capture-mode verification | PASS |
| SMTP configuration security | PASS |
| Actual SMTP delivery | NOT VERIFIED |
| Recipient allowlist | PASS |
| Scheduled reminders | PASS |
| Company announcements | PASS |
| Audience authorization | PASS |
| Founder dashboard integration | PASS |
| HR dashboard integration | PASS |
| Team Leader dashboard integration | PASS |
| Intern dashboard integration | PASS |
| Audit logging | PASS |
| Previous business functionality preserved | PASS |
| Migration reproducibility | PASS |
| Populated database upgrade verification | PASS |
| Automated regression tests | PASS |
| New automated tests | PASS |
| Real isolated MySQL testing | PASS |
| Browser acceptance testing | PASS |
| Live Docker runtime verification for Phase 07 | NOT VERIFIED |
| Production isolation | PASS |
| Documentation completeness | PASS |

Phase 08 requires the next manual implementation prompt.
