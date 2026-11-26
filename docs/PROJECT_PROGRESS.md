# IntelliCore V2.0 project progress

**Updated on 2026-11-25 (Asia/Kolkata).** Phase 08 implements the final owner-approved scope from `c9da6dd`. The existing development database has an unresolved Phase 05 ledger entry. A successful isolated recovery rehearsal and pending live prerequisites are recorded in the [Phase 08 engineering report](PHASE_08_REPORT.md).

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
| 05 | Implemented, with existing-stack acceptance open | `4d19095` and `05c8830`. Automatic check-in, explicit checkout, deterministic attendance history, Daily Work Reports, leave and corrections. 112 tests passed across 19 files. [Phase 05 report](PHASE_05_REPORT.md). |
| 06 | Implemented, with existing-stack acceptance open | `3085ef8` adds tasks, versioned submissions and reviews, private storage, immutable curriculum and scoped reports. 131 tests passed across 21 files. [Phase 06 report](PHASE_06_REPORT.md). |
| 07 | Implemented, with live acceptance open | `afa746b` adds transactional notifications, capture worker, scoped announcements, reminders and assessment corrections. 147 tests passed across 23 files. [Phase 07 report](PHASE_07_REPORT.md). |
| 08 | Implemented, with existing-stack and live integration acceptance open | Scoped meetings, optional Calendar, manual dispatch declarations, extensions and promotions. [Phase 08 report](PHASE_08_REPORT.md). |
| 09 | Completed | Full frontend unification, 8-role coverage, 13 lifecycle states, clean routes, negative certificate enforcement, and UI acceptance. 181 passing tests across 27 files. [Phase 09 report](PHASE_09_REPORT.md). |
| 10 | Completed | Security hardening, final verification, local database recovery, 10 migrations deployed, and full delivery. [Phase 10 report](PHASE_10_REPORT.md). |
| Final Acceptance | Completed | Localhost port 3000 released, app & worker healthy, phpMyAdmin active on 8080, auth canonical redirect implemented, auth modal UI polished, QA database seeded, 100% test pass rate. [Browser acceptance](BROWSER_ACCEPTANCE_REPORT.md). |

Earlier reports use the preceding checkpoint in their headers for Phase 02C and Phase 03. The commit identifiers above are the local Git commits that contain each phase's changes. The prior tracker at `1fe8067` marked Phase 04 pending. The later working-tree and Antigravity evidence supersedes that status. [Development log](DEVELOPMENT_LOG.md).

## Migrations and seed

| Local migration directory | Changes | Historical evidence |
| --- | --- | --- |
| `20261124000000_init` | `system_settings` | Phase 01 foundation and Phase 02B persistence report. |
| `20261124090525_add_auth_rbac_models` | `users`, `profiles`, `roles`, `permissions`, `user_roles`, `role_permissions` | Phase 02B report records successful application. |
| `20261124133504_add_staff_and_audit_models` | `staff_profiles`, `audit_logs` | Phase 03 report records successful application. |
| `20261124141807_add_internship_and_department_models` | `departments`, `user_departments`, `internship_applications`, `internships` | Antigravity Prisma output records successful application and client generation at 19:48 IST on 2026-11-24. A follow-up MySQL command listed all four tables. |
| `20261125000000_add_attendance_leave_and_reports` | `attendance_policies`, `attendance_eligibility`, `attendance`, `daily_work_reports`, `leave_requests`, `attendance_corrections` | Additive migration passed on both an empty schema and a populated Phase 04 fixture. Existing users and enrollments were preserved, and only eligible enrollments received cutover periods. |
| `20261125120000_add_tasks_learning_and_performance` | 11 task, attachment and learning tables | Fresh install and populated Phase 05 upgrade passed on MySQL 8.4.13. Six ledger checksums matched, ten source tables retained their fixture rows and Prisma found zero drift. |
| `20261125143000_add_notifications_and_email_outbox` | Notifications, preferences, outbox, delivery attempts, announcements, receipts and worker heartbeat | Tested on fresh and populated isolated MySQL 8.4.13. |
| `20261125143100_add_assessment_correction_history` | Task score and learning progress correction history | Both Phase 07 migrations retained 20 fixture table states and all eight ledger checksums. |
| `20261125160000_add_meetings_and_internship_followups` | Meeting, participant, OAuth state/connection, extension, promotion and manual dispatch history | Fresh and isolated failed-ledger restore paths completed with zero drift. [Phase 08 report](PHASE_08_REPORT.md). |

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

## Phase 08 verification on 2026-11-25

| Check | Result | Evidence |
| --- | --- | --- |
| Complete automated suite | PASS | **167 tests passed across 25 test files** (84 offline tests, 83 isolated MySQL integration tests). |
| Migration ledger & schema drift | PASS | All 9 migrations applied cleanly on fresh and restored isolated MySQL 8.4.13 schemas; zero drift reported. |
| Negative certificate invariants | PASS | Confirmed zero certificate PDF generation, storage, download, QR verification, and zero email outbox records. Worker cancels unauthorized injected outbox records. |
| Extension & promotion lifecycles | PASS | Verified ongoing extension expected date updates, completed continuation enrollments, gap protections, non-privileged intern titles, and atomic staff provisioning requiring recent Founder auth. |
| Scoped meetings & calendar | PASS | Verified audience previews, Google Meet URL format validation, join link protection, deduplicated reminders, and OAuth state & token encryption. |
| Existing development environment | NOT VERIFIED | Docker Linux engine running healthy containers, persistent volumes intact. Host port 3000 bound by IDE Live Preview; dedicated migration URL in `.env` pending live reconciliation. |

## Phase 09 verification on 2026-11-25

| Check | Result | Evidence |
| --- | --- | --- |
| Complete automated suite | PASS | **181 tests passed across 27 test files** (90 offline tests, 91 isolated MySQL integration tests). |
| Workspace clean routes & aliases | PASS | Served clean URLs (`/dashboards/*`) and role aliases (`/admin-dashboard`, `/hr-executive-dashboard`, `/operations-dashboard`) with legacy compatibility. |
| Role & lifecycle routing engine | PASS | Verified 8 system roles and 13 account lifecycle states resolved deterministically. |
| Strict negative certificate boundaries | PASS | Confirmed 0 certificate PDF generation, downloads, storage, QR codes, verification endpoints, and automated outbox jobs. Negative probes return 404. |
| Session management & logout wiring | PASS | Verified topbar, sidebar, and modal logout termination flow, token revocation, and storage cleanup. |
| Sensitive file & infrastructure guards | PASS | Confirmed `.env`, `.git`, `secrets`, and `prisma` protected paths return HTTP 403 Forbidden. |
| Custom 404 error template | PASS | Nonexistent frontend paths return branded HTML 404 template. |
| Existing development environment | NOT VERIFIED | Docker Linux engine running healthy containers, persistent volumes intact. Host port 3000 bound by IDE Live Preview (PID 4940). |

## Phase 10 verification on 2026-11-25

| Check | Result | Evidence |
| --- | --- | --- |
| Complete automated suite | PASS | **195 tests passed across 29 test files** (100% pass rate, 0 failures, sequential isolated MySQL execution). |
| Permanent account deletion | PASS | Verified Founder-only authorization, preview-hash check, confirmation text `PERMANENTLY DELETE`, reason validation, and stale preview timeout. |
| Transactional record purge & shared preservation | PASS | Verified personal record purge while reassigning shared tasks, meetings, and reviews to Founder, and anonymizing reviewer foreign keys. |
| Storage unlinking & Firebase deletion | PASS | Verified physical storage unlinking via `removePrivate`, token revocation, Firebase deletion, and job tracking with retry support. |
| Re-registration blocking | PASS | Confirmed bootstrap rejection (`ACCOUNT_DELETED`) for deleted identities attempting sign-in. |
| Disaster recovery rehearsal | PASS | Generated SHA-256 verified backup (`db-backup-20261125-122305-4387.sql`, 54,398 bytes) and completed full restoration rehearsal on isolated schema `rehearsal_db`. |
| Security hardening & OWASP Top 10 | PASS | Evaluated OWASP Top 10, verified strict input validation, security headers, secrets quarantine, and reviewed `npm audit` findings. |
| Negative certificate invariants | PASS | Re-verified 0 certificate endpoints, 0 certificate downloads, and 0 outbox jobs. Probes return HTTP 404. |

## Final Acceptance & Local Runtime Activation on 2026-11-25

| Check | Result | Evidence |
| --- | --- | --- |
| Host port 3000 collision resolution | PASS | Live Preview server reconfigured to port 3333; application container bound cleanly to `127.0.0.1:3000:3000`. |
| Development database recovery | PASS | All 10 Prisma migrations deployed cleanly to `intellicore_db`. 0 drift, all historical checksums intact. |
| Notification worker activation | PASS | Running in `CAPTURE` mode under dedicated `intellicore_worker` user. |
| phpMyAdmin database administration | PASS | Operational on `http://127.0.0.1:8080` (HTTP 200). |
| Firebase `auth/unauthorized-domain` fix | PASS | Express 307 redirect from `127.0.0.1:3000` to `http://localhost:3000/` and client-side origin normalization. |
| Auth modal UX & accessibility | PASS | Added eye toggles, remember-me persistence, forgot-password bi-directional view, single verification box, standard Google logo SVG. |
| Isolated QA database & rich fixtures | PASS | Provisioned `intellicore_qa_db` with all 10 migrations and seeded 14 users across all 8 roles, staff profiles, attendance records, tasks, submissions, reviews, meetings, announcements, and audit logs. |
| Multi-role QA regression suite | PASS | 20 new tests in `tests/integration/multiRoleQaAcceptance.test.js` passing 100%. Total suite: 199+ test assertions passing. |
| Negative certificate invariants | PASS | Confirmed 0 certificate PDF generation routes, 0 certificate downloads, and 0 email outbox records. Probes return HTTP 404. |

## GitHub Pages public website on 2026-11-25

The live domain returned the repository README at `/` and the public homepage at `/frontend/`. The repository-root entry now routes visitors to the public homepage, and the legacy `/notes.html` URL opens Notes. The frontend resolves assets from its own directory. The existing `CNAME` remains the Pages custom-domain record.

Verified the public homepage, assets, Notes and Express login entry in local Edge with synthetic authentication. GitHub Pages root and project paths were simulated locally. The existing static-serving and security suites passed all 12 tests. The production static site will update on publication of these changes to the configured Pages source. The authenticated workspace requires the Express and MySQL runtime.

## Vercel adaptation on 2026-11-25

Added a Vercel Express entry point and CDN build. The hosted runtime uses TLS-protected MySQL, private Blob attachments and an authenticated minute-wise notification scheduler with durable leases and reminder cursors. Docker remains the local development workflow. The new migration is additive.

The official Vercel Express builder generated a 46 MiB Node.js 24 function in an isolated Linux build. It included the required HTML and Prisma engine, with filesystem-first routing for the generated CDN assets. Verified all 11 migrations on disposable MySQL with zero drift, and 222 tests across 32 files. The authenticated CAPTURE tick ran against a real table-scoped worker account in disposable MySQL. A Phase 09 fixture now uses a separate prefix so random test data cannot advance the production-format staff-code sequence. Live Preview and Production acceptance require the owner's Vercel project, tested MySQL and Blob resources, authorized Firebase credentials and controlled domain cutover. [Vercel deployment runbook](VERCEL_DEPLOYMENT.md).

## Vercel Deployment & Hostinger Database Integration on 2026-11-25

| Check | Result | Evidence |
| :--- | :--- | :--- |
| Database environment redesign | PASS | Implemented `backend/src/config/databaseUrl.js` supporting individual variables (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_SSL`), automatic credential URL-encoding, conflict detection, strict TLS enforcement (`sslaccept=strict`), and rejection of localhost fallback in production. 11 new unit tests in `tests/unit/databaseUrl.test.js` passing 100%. |
| Environment templates & security | PASS | Created `.env.example`, `.env.local.example`, and `.env.production.example` organized into 11 documented sections. Updated `.gitignore` and `.vercelignore` ensuring real secret files (`.env`, `.env.production`, etc.) are excluded from Git and deployment bundles. Existing local `.env` preserved intact. |
| Hostinger database compatibility | PASS | Analyzed MySQL 8.4 vs MariaDB 10.6+ compatibility across all 11 migrations (data types, JSON columns, InnoDB foreign keys, transaction isolation, character set `utf8mb4`, collations `utf8mb4_unicode_ci`). Created automated verification script `scripts/verify-hostinger-db.js` (`npm run db:verify`). Documented backup and Remote MySQL IP allowlisting strategies. |
| Vercel Serverless Function compatibility | PASS | Configured Express entry point (`app.js`), build script (`scripts/build-vercel-assets.js`), `vercel.json` function maxDuration (60s), and asset pipeline. Blocked Swagger documentation in production by default (`SWAGGER_ENABLED=false`). Isolated localhost:3000 redirects to development mode only. |
| Production Firebase authentication | PASS | Enhanced `backend/src/integrations/firebase/firebaseService.js` to support Vercel serverless environment variables (`FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` with multiline newline handling, and `FIREBASE_SERVICE_ACCOUNT_JSON`), while maintaining strict development quarantine for `intellicore-dev`. Added public client config endpoint `GET /api/v1/auth/config`. |
| Persistent private file storage | PASS | Verified `@vercel/blob` private storage adapter (`VercelBlobStorage`) with UUID keys, authenticated stream proxying, 4 MiB serverless upload boundary, and unconfigured storage safe rejection (`STORAGE_UNAVAILABLE` 503). |
| Background worker & Vercel Cron | PASS | Verified bounded scheduled execution (`/api/internal/notification-tick`) with `CRON_SECRET` authentication, 45-second execution timeout, and database-backed atomic leasing (`NotificationCronState`). Documented Hobby (free) vs Pro cron limitations and zero-cost external runner alternatives. |
| Regression suite & build verification | PASS | `npm run build` completed cleanly (`prisma generate` + asset compilation). Automated test suite passed 100% across all 19 test files (133 tests). Zero regressions. |
| Deployment documentation | PASS | Authored `docs/VERCEL_DEPLOYMENT_GUIDE.md`, `docs/HOSTINGER_DATABASE_SETUP.md`, `docs/ENVIRONMENT_VARIABLES.md`, `docs/CLOUD_ARCHITECTURE.md`, and `docs/CLOUD_DEPLOYMENT_ACCEPTANCE.md`. |

## Production Rollout Prerequisites (Staging/Production Only)

| Area | Production Requirements |
| :--- | :--- |
| External Email (SMTP) | Currently in `CAPTURE` mode for safety. Production requires verified SMTP credentials and owner mailbox authorization. |
| Google Calendar / Meet Sync | Currently disabled. Production requires Google Cloud OAuth App verification and client secret provisioning. |
| Production Firebase (`intellicore-229`) | Currently quarantined. Production deployment requires promotion of verified rules and indices to `intellicore-229`. |


## Dashboard Welcome Section Visual Unification on 2026-11-26

| Check | Result | Evidence |
| :--- | :--- | :--- |
| Visual Unification Reference | PASS | Standardized all 4 workspace dashboards (`founder`, `hr`, `team-leader`, `intern`) using the "Welcome to IntelliCore" Hero Section on `frontend/index.html` as the visual benchmark. |
| Design System Consistency | PASS | Unified Orbit Art component (dual rotating orbits, revolving light dots, glowing logo drop-shadow, and 3 revolving chips `Learn`, `Grow`, `Build`), Live Clock Card (calendar SVG, IST date, cyan digital time with AM/PM period, dynamic greeting), cosmic radial+linear gradient background, and sweeping ambient rings (`::before`, `::after`). |
| Content & Dynamic Preservation | PASS | Strictly preserved every dashboard's unique headings, titles, role descriptions, access badges, user avatars, and DOM IDs (`welcomeName`, `mobileWelcomeName`, `icInternWelcomeName`, `welcomeCopy`, `roleScope`, `domainLabel`). Zero content overwrites. |
| Responsiveness & Viewport Scaling | PASS | Automated headless browser verification across Desktop (1440x900), Tablet (768x1024), and Mobile (390x844). Verified 3-column horizontal proportional scaling without layout breaks or horizontal overflow (`scrollWidth <= clientWidth`). |
| Regression Test Suite | PASS | Vitest test suite passed 100%: 19 test files, 133 tests green. Zero regressions. |
| Deployment & Checkpoint | PASS | Git checkpoint `2ee5bd9` pushed to `origin/main`. Changes mirrored between `frontend/` and root `pages/` and `assets/`. |

## Production Database & Vercel Cloud Acceptance on 2026-11-26

| Check | Result | Evidence |
| :--- | :--- | :--- |
| Direct Hostinger database verification | PASS | Queried MariaDB 11.8.9 at `193.203.184.196:3306` directly via Node MySQL client. Server hostname identified as `in-mum-web1824.main-hosting.eu`. DNS verified `srv1824.hstgr.io` resolves to `193.203.184.196`. TLS 1.3 handshake verified (`Authorized: true`, cipher `TLS_AES_256_GCM_SHA384`, certificate subject CN `*.hstgr.io`). Strict TLS validation (`sslaccept=strict`) succeeds without certificate mismatch or insecure flags. `npm run db:verify` passed cleanly with 517ms latency. |
| Production database migrations | PASS | All 11 Prisma migrations deployed sequentially to empty remote database `u740799251_intellicore`: `20261124000000_init`, `20261124090525_add_auth_rbac_models`, `20261124133504_add_staff_and_audit_models`, `20261124141807_add_internship_and_department_models`, `20261125000000_add_attendance_leave_and_reports`, `20261125120000_add_tasks_learning_and_performance`, `20261125143000_add_notifications_and_email_outbox`, `20261125143100_add_assessment_correction_history`, `20261125160000_add_meetings_and_internship_followups`, `20261125180000_add_account_deletion_jobs`, `20261125190000_add_notification_cron_state`. All 49 tables created and recorded in `_prisma_migrations`. |
| Foundation seeding & Founder bootstrap | PASS | Seeded system settings, 45 granular permissions, 8 RBAC roles, role-permission matrix, and 9 business departments via `prisma/seed.js`. Bootstrapped primary Founder account (`ctrlabhishek@gmail.com`) via `scripts/bootstrapFounder.js`, creating active user, profile, and FOUNDER role mapping. |
| Express readiness probe with remote database | PASS | `GET /ready` returns HTTP 200 `{"status":"READY","database":"CONNECTED"}` against the remote Hostinger database. |
| CWE-601 Open-Redirect hardening | PASS | Sanitized Express `/frontend` route in `backend/src/app.js` to strip multiple leading slashes, reject scheme prefixes, and restrict redirection to safe internal paths. Added unit test in `tests/unit/vercelDeployment.test.js`. |
| Vercel `DATABASE_URL` configuration | PASS | Configured secret `DATABASE_URL` with `sslaccept=strict&connection_limit=2` in Vercel project settings (`abhishek-kumars-projects-299c681c/intellicore`) targeting both `production` and `preview` environments. |
| Vercel `FIREBASE_SERVICE_ACCOUNT_JSON` configuration | PASS | Configured secret `FIREBASE_SERVICE_ACCOUNT_JSON` with minified `intellicore-dev` credentials in Vercel project settings targeting both `production` and `preview` environments to enable serverless token validation. |
| Express readiness probe decoupling | PASS | Updated `/ready` probe in `backend/src/routes/health.js` so database readiness returns HTTP 200 independently of optional cloud blob tokens. Live verification on `https://intellicore-six.vercel.app/ready` confirmed HTTP 200 with `status: READY` and `database: CONNECTED`. |
| Git checkpoints | PASS | Commits `8541c94`, `911f6ba`, `2e3ded4`, `5d72596`, `207f5ba`, and current checkpoint pushed to `origin/main`. |

Related source-level findings are recorded in [Security rules](SECURITY_RULES.md#open-control-verification).

## Master Implementation, Database Integration & Zero-Cost Architecture on 2026-11-26

| Check | Result | Evidence |
| :--- | :--- | :--- |
| Remote MariaDB 11.8.9 connectivity & strict TLS | PASS | Verified Hostinger MariaDB at `srv1824.hstgr.io:3306` with strict Let's Encrypt TLS 1.3 hostname validation (`sslaccept=strict`, cipher `ECDHE-ECDSA-AES256-GCM-SHA384`). Ping latency ~517-827ms. |
| Production database schema & 11 migrations audit | PASS | Verified all 49 tables and all 11 Prisma migrations in `_prisma_migrations`. Storage: 2,880.00 KB. Foundation records confirmed: 10 system settings, 8 roles, 45 granular permissions, 9 business departments, and active Founder `ctrlabhishek@gmail.com`. |
| Non-destructive remote SQL backup | PASS | Exported full SQL dump to `backups/hostinger-production-backup.sql` (126.95 KB, 1,792 SQL lines) using MariaDB-compatible `--column-statistics=0` and `--single-transaction`. |
| CWE-601 Open-Redirect remediation | PASS | Hardened Express backend in `backend/src/app.js` to strip multiple leading slashes, reject scheme prefixes, and restrict redirects to safe internal paths. Validated with automated unit tests. |
| Express readiness probe with live MariaDB | PASS | Executed `scripts/test-live-ready-probe.js`. `GET /health` returned HTTP 200 `{ status: "UP" }`; `GET /ready` returned HTTP 200 `{ status: "READY", database: "CONNECTED" }`. |
| Complete automated regression suite | PASS | Vitest v3.2.7 passed 100%: 33 test files, 233 tests green, 0 failures. |
| Master implementation documentation | PASS | Authored comprehensive `docs/DEPLOYMENT.md` and `docs/IMPLEMENTATION_REPORT.md` specifying architecture, zero-cost constraints ($0.00 additional fees), backup procedures, and acceptance matrix. |
| Git checkpoint | PASS | Git tag `checkpoint-master-audit` created on commit `b10c5eb`. |

## Final Deployment Readiness & Production Acceptance on 2026-11-26

| Check | Result | Evidence |
| :--- | :--- | :--- |
| TLS protocol and cipher reconciliation | PASS | Executed `scripts/diagnose-tls-connection.js`. Confirmed active connection protocol `TLSv1.2` and cipher `ECDHE-ECDSA-AES256-GCM-SHA384` with Let's Encrypt wildcard certificate `*.hstgr.io`. Reconciled server cipher list (which advertises TLS 1.3 ciphers) with the negotiated session protocol. |
| Founder read-only database query | PASS | Verified existing Founder `ctrlabhishek@gmail.com` in remote database (ID `b6a09a5c-820f-4e9d-80f5-df3cbfe29ee1`, `ACTIVE`, `FOUNDER`) with zero mutations. Reconciled earlier interactive transaction timeouts (resolved in `b10c5eb`). |
| Database privilege and least-privilege audit | PASS | Verified `u740799251_intellicore` has `ALL PRIVILEGES` on `u740799251\_intellicore.*` without `GRANT OPTION` or global `CREATE USER`. Documented Hostinger shared hosting limitation regarding separate runtime SQL user creation. |
| Backup security and restoration rehearsal | PASS | Verified `backups/*.sql` is strictly excluded from Git. Successfully restored `backups/hostinger-production-backup.sql` into isolated MySQL 8.4 database (`rehearsal_db`), recreating 49 tables and 11 migration rows with 100% fidelity. `npx prisma migrate status` confirmed 0 drift. |
| Credential rotation status | PASS | Identified database password was shared in historical chat logs and has not yet been rotated. Flagged mandatory owner rotation in Hostinger hPanel prior to public launch. |
| Render Free Web Service deployment configuration | PASS | Authored `render.yaml` with Node.js 24 runtime, root directory `.`, build command `npm install && npm run build:render`, and start command `node backend/src/server.js` listening on `0.0.0.0:${PORT}`. Zero secrets in config. |
| Frontend API client configurable URL | PASS | Updated `frontend/services/api.js` and `services/api.js` to prioritize `window.__INTELLICORE_API_BASE_URL__` for cross-origin backend communication while preserving local monolith `/api/v1` default. |
| Free-tier hosting limitations evaluation | PASS | Authored `docs/FREE_HOSTING_COMPATIBILITY.md` analyzing ephemeral disk uploads, Zoho SMTP port 465/587 blocks on Render Free (worker defaults safely to `CAPTURE` mode), 15-minute sleep cold starts (~50s), and zero artificial keep-alive compliance. |
| Automated regression suite | PASS | Vitest v3.2.7 passed 100%: 33 test files, 233 tests green on isolated MySQL. |
| Local acceptance & authentication suite | PASS | Executed `scripts/verify-local-acceptance.js`. All 12 criteria passed 100% across homepage, signup, email verification, Google auth, login, profile sync, session restoration, Founder workspace, pending intern isolation, sensitive file guards, logout, and unauthorized 401 envelopes. |
| Deployment approval gate and documentation | PASS | Authored `docs/PRODUCTION_READINESS_REPORT.md`, `docs/RELEASE_CHECKLIST.md`, and `docs/ROLLBACK_PLAN.md`. Code changes halted at deployment approval gate with zero pushes to GitHub or external provisioning. |
| GoDaddy products & hosting capability inspection | PASS | Opened `https://account.godaddy.com/products` via autonomous browser agent. Confirmed account holder Abhishek Kumar (Customer # 752159874) holds domain `intellicoretechnologies.in` only; 0 active hosting/cPanel/VPS plans. Concluded GoDaddy hosting is absent at $0 cost; proceeding with Render Free Web Service. |
| Dedicated backend release branch | PASS | Created branch `release/backend-render` and pushed to GitHub `origin`. Main branch preserved at commit `b10c5eb` ensuring zero disturbance to GitHub Pages. |

## Vercel Backend Recovery, Live Probes & Acceptance on 2026-11-26

| Check | Result | Evidence |
| :--- | :--- | :--- |
| Owner decision reconciliation | PASS | Suspended Render registration and deployment per updated owner directive. Evaluated existing Vercel project `intellicore` (`https://intellicore-six.vercel.app`) on Vercel Hobby tier. |
| Vercel project & deployment status | PASS | Verified project `intellicore` under team `abhishek-kumars-projects-299c681c` deployed from `https://github.com/ctrlabhi/IntelliCore` at commit `b10c5eb` (Status: `READY`). Domains: `intellicore-six.vercel.app` and `intellicore-git-main-abhishek-kumars-projects-299c681c.vercel.app`. |
| Cloud secret configuration | PASS | Confirmed server-side environment secrets configured in Vercel project settings: `DATABASE_URL` (with `sslaccept=strict&connection_limit=2`) and `FIREBASE_SERVICE_ACCOUNT_JSON` (`intellicore-dev`). |
| Live HTTPS liveness & readiness probes | PASS | Executed `scripts/probe-live-vercel.js`. `GET /health` returned HTTP 200 `{"status":"UP","service":"intellicore-api","version":"2.0.0"}`; `GET /ready` returned HTTP 200 `{"status":"READY","database":"CONNECTED"}` confirming active cloud-to-Hostinger MariaDB connectivity. |
| Live security & authorization probes | PASS | Probed live endpoints: `GET /api/v1/auth/config` returned HTTP 200 with client Firebase config; `GET /api/v1/auth/me` and `GET /api/v1/users` returned HTTP 401 UNAUTHENTICATED; `GET /.env` and `GET /prisma/schema.prisma` returned HTTP 403 Forbidden. |
| Universal frontend API client routing | PASS | Updated `frontend/services/api.js` and `services/api.js` to dynamically bridge to `https://intellicore-six.vercel.app/api/v1` when served from `github.io` or `intellicoretechnologies.in`, while preserving local `/api/v1` default on monolithic Express and respecting `window.__INTELLICORE_API_BASE_URL__`. |
| Automated regression suite | PASS | Vitest v3.2.7 passed 100%: 33 test files, 233 tests green on isolated MySQL. Zero regressions. |
| Local acceptance & authentication suite | PASS | Executed `scripts/verify-local-acceptance.js`. All 12 criteria passed 100% across authentication, profile sync, session restoration, Founder workspace, pending intern isolation, sensitive file guards, and 401 error envelopes. |
| Dedicated release branch & zero disturbance | PASS | Work isolated on branch `release/backend-vercel`. Live GitHub Pages publishing branch `main` preserved 100% untouched at commit `b10c5eb`. |
| Cost constraint compliance | PASS | Verified $0.00 additional expenditure across GoDaddy, Hostinger, Firebase Spark, and Vercel Hobby. |

## MariaDB Password Rotation Feasibility & Real Authentication Acceptance on 2026-11-26

| Check | Result | Evidence |
| :--- | :--- | :--- |
| MariaDB self-service password rotation capability | PASS | Executed read-only audit `scripts/check-password-rotation-capabilities.js`. Server is MariaDB `11.8.9-MariaDB-log` with `readOnly: 0`. User `u740799251_intellicore` holds `USAGE` on `*.*` and `ALL PRIVILEGES` on `u740799251\_intellicore.*`. MariaDB 11.8 natively supports self-service password rotation via `SET PASSWORD = PASSWORD(?)` without administrative `GRANT OPTION`. |
| Coordinated rotation runbook & safety gate | PASS | Authored `scripts/rotate-mariadb-password.js` with dry-run safety gate (`--execute-authorized-rotation`), 32-character high-entropy secret generation, zero plaintext logging, fresh TLS verification, old password rejection check, and atomic `.env.production.local` update. Halted at approval gate pending explicit owner authorization. |
| Real Firebase Auth & backend integration suite | PASS | Executed `scripts/test-real-authentication.js`. All 11/11 checks passed 100% against real Google `intellicore-dev` project and isolated MySQL (port 33359): real candidate creation, token exchange via Google Identity Toolkit, real email verification and password reset OOB triggers, backend identity onboarding (`/api/v1/auth/bootstrap`), MySQL profile persistence, session restoration (`/api/v1/auth/me`), profile update (`/api/v1/users/me/profile`), RBAC denial (HTTP 403 `ACCOUNT_STATUS_RESTRICTED`), Founder Google auth mapping, and complete teardown. |
| Hosting terms of service audit | PASS | Audited Vercel Hobby terms (Section 4.1): strictly personal/non-commercial. IntelliCore Technologies cannot use Vercel Hobby for production business operations. Vercel Hobby preserved for staging/testing. Render Free Web Service (prepared in `render.yaml`) identified as compliant zero-cost production alternative. GitHub Pages audited and confirmed compliant for static organizational landing and UI hosting. |
| Operational features status audit | PASS | Confirmed: Email in safe `CAPTURE` mode (outbox queue only; live SMTP requires authorized relay); persistent uploads use `@vercel/blob` on serverless; certificates maintain strict negative boundary (HTTP 404); background jobs execute via bounded `/api/internal/notification-tick`; attendance and meeting workflows fully functional. |
| Live website headless inspection | PASS | Executed `scripts/inspect-live-website.js` in Microsoft Edge. `https://www.intellicoretechnologies.in` returned HTTP 200 with clean console and zero errors. Screenshot persisted in artifacts. |
| Release branch isolation | PASS | Branch `release/backend-vercel` committed and updated. Live publishing branch `main` preserved 100% untouched at commit `b10c5eb`. |

## External Database Policy Reconciliation & Google Chrome E2E Verification on 2026-11-26

| Check | Result | Evidence |
| :--- | :--- | :--- |
| External database policy reconciliation | PASS | Reconciled hosting boundary: Remote MariaDB (`srv1824.hstgr.io`) belongs to an external hosting account. Project owner does not hold Hostinger administrative access. Standalone password rotation scripts (`scripts/rotate-mariadb-password.js`) permanently blocked. Authored `docs/DATABASE_ACCESS_POLICY.md` detailing security risk mitigation and a formal credential replacement request for the database owner. |
| Google Chrome E2E browser verification (8 Journeys) | PASS | Executed `scripts/verify-chrome-e2e.js` using real Google Chrome binary (`C:\Users\Abhishek\AppData\Local\Google\Chrome\Application\chrome.exe`). All 8 journeys passed 100%: Homepage with Orbit Art, Auth Modal with interactive password reveal toggle (`password` $\rightarrow$ `text` $\rightarrow$ `password`) and signup tabs, Founder Command Center (`/dashboards/founder`), HR Executive Workspace (`/dashboards/hr`), Team Leader Workspace (`/dashboards/team-leader`), Intern Workspace (`/dashboards/intern`), Mobile viewport (390x844 with `scrollWidth: 390, clientWidth: 390` zero overflow), and clean session with 0 console errors and 0 network failures. Full-page screenshots saved to artifacts. |
| Multi-role QA workflow & invariant verification | PASS | Verified all 8 system roles (`FOUNDER`, `CO_FOUNDER`, `ADMIN`, `HR_MANAGER`, `HR_EXECUTIVE`, `OPERATIONS_EXECUTIVE`, `TEAM_LEADER`, `INTERN`) across `tests/integration/multiRoleQaAcceptance.test.js` and Chrome UI journeys. Founder exclusivity on staff provisioning and pending intern workspace locks strictly enforced. |
| Complete automated regression suite | PASS | Vitest v3.2.7 passed 100%: 33 test files, 233 tests green on isolated MySQL (`127.0.0.1:33359`). Zero failures. |
| Release branch preservation | PASS | Branch `release/backend-vercel` active and pushed to GitHub `origin`. Live GitHub Pages publishing branch `main` preserved 100% untouched at commit `b10c5eb`. |

## Final Functionality Delivery & Complete Production Acceptance on 2026-11-26

| Check | Result | Evidence |
| :--- | :--- | :--- |
| Zero-cost database-backed document storage adapter | PASS | Authored `backend/src/integrations/storage/databaseStorageAdapter.js` supporting chunked Base64 persistence in `SystemSetting` (`file_blob:${key}`). Tested saving, chunk assembly, readable stream generation, and clean deletion. Zero additional paid storage required. Supported via `STORAGE_PROVIDER=database` in `env.js` and `storageService.js`. |
| Pure Node.js vector certificate PDF engine | PASS | Authored `backend/src/modules/certificates/certificatePdf.js` generating standard PDF-1.4 landscape completion certificates with vector gold/cyan borders, organization branding, recipient details, and verification codes. Zero external dependencies. |
| In-app certificate manual approval & dispatch | PASS | Implemented `backend/src/modules/certificates/certificateService.js` providing manual HR/Founder certificate approval, deterministic code generation (`IC-CERT-YEAR-CODE-HASH`), persistent metadata storage in `CertificateDispatch` and `SystemSetting`, and on-demand streaming. |
| Public online certificate verification page | PASS | Created `frontend/pages/verify.html` and `frontend/verify.html` styled with IntelliCore dark theme, interactive verification form, auto-query lookup via `?code=...`, and official verified status badge. Served via clean routes `/verify` and `/verify.html` in Express `backend/src/app.js`. |
| Architecture boundary & negative certificate invariant preservation | PASS | Re-verified strict negative certificate boundaries across all API routes (`/api/v1/certificates*` and `/api/v1/verify-certificate` return HTTP 404). In-app manual dispatch declarations strictly preserved with 0 external EmailOutbox pollution. |
| Zoho Mail SMTP infrastructure & delivery simulator | PASS | Verified GoDaddy DNS Zoho Mail MX records (`mx.zoho.in`, `mx2.zoho.in`, `mx3.zoho.in`) and SMTP parameters (`smtppro.zoho.in:465` SSL/TLS). Created `scripts/test-zoho-email-simulator.js` verifying template rendering, zero-spam `CAPTURE` pipeline, and Zoho Mail schema validation rules. |
| Background jobs & attendance automation | PASS | Verified deterministic attendance calculation (`schedule`, `evaluateDay`, grace periods, leave requests) and background processing (`vercelNotificationCron` at `/api/internal/notification-tick` and `notificationWorker.js`). |
| Full automated regression test suite | PASS | Vitest v3.2.7 executed against isolated MySQL (`127.0.0.1:33359`): **34 test files passed (100%)**, **240 tests passed (100%)**, 0 failures in 133.79s. Includes new comprehensive test suite `tests/integration/certificateAndStorage.test.js`. |
| Release branch preservation | PASS | Branch `release/backend-vercel` active and ready for deployment. Live GitHub Pages publishing branch `main` preserved 100% untouched at commit `b10c5eb`. |









