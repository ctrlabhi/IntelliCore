# IntelliCore V2.0 master project context

**Updated on 2026-11-25 (Asia/Kolkata).** Phase 07 extends checkpoint `af38bcd` with in-app notifications, announcements, a transactional email outbox and a separate MySQL-backed worker. [Project progress](PROJECT_PROGRESS.md).

## Product and repository

IntelliCore combines a public site and Notes AI utility with an internal internship operations platform. The operating sequence is applicant onboarding, HR review and enrollment, department and Team Leader assignment, attendance and tasks, learning, completion and authorized follow-up. Founder, HR, Team Leader and Intern workspaces share a branded, responsive frontend. Admin and Operations roles already exist in RBAC. Their complete workspace routing and workflows remain a later integration concern.

| Area | Current entry points and role |
| --- | --- |
| Public site and Notes AI | [frontend/index.html](../frontend/index.html), [notes.html](../frontend/pages/notes.html), [notes.js](../frontend/assets/js/notes.js). The pre-Phase 01 notes feature includes YouTube link input and 10% IntelliCore PDF watermark. |
| Dashboards | [frontend/pages/dashboards](../frontend/pages/dashboards) and [frontend/assets/js](../frontend/assets/js). Founder manages departments, staff assignments, applications, enrollments and existing staff controls. HR reviews applications and enrollment history. Team Leaders see their assigned departments and scoped enrollments. Verified interns manage their own applications and see their enrollment history. |
| Browser runtime | [frontend/services](../frontend/services) contains Firebase Web Auth, the shared auth state service and same-origin API client. The login modal and dashboards consume server-provided workspace flags. |
| HTTP runtime | [app.js](../backend/src/app.js) configures middleware, health probes, static and legacy URL aliases, and errors. [server.js](../backend/src/server.js) owns server startup and shutdown. `/health` checks liveness. `/ready` and `/api/v1/health` report database status. Swagger is served at `/api-docs` with JSON at `/api-docs.json`. |
| Business services | [apiV1.js](../backend/src/routes/apiV1.js) mounts auth, users, staff, roles, permissions, audit logs, admin stats, departments, internships, attendance, daily reports, leave and corrections. Routes validate and authorize requests. Services implement transactions and query Prisma. |
| Integration boundaries | [backend/src/integrations](../backend/src/integrations) has Firebase Admin Auth, private file storage, optional Calendar OAuth and worker-controlled email. The archived certificate template in [templates](../templates) is inactive. Certificate creation and sending take place outside the application. |
| Operational tools | [docker-compose.yml](../docker-compose.yml), [Dockerfile](../backend/Dockerfile), [entrypoint](../backend/entrypoint.sh), [scripts](../scripts) and [SETUP.md](SETUP.md). The application and phpMyAdmin map to loopback ports 3000 and 8080. MySQL stays on the Compose network. The runtime runs as the non-root `node` user. |
| Legacy reference | [legacy-firebase](../legacy-firebase) preserves Firebase rules, indexes, Functions, curriculum and historical onboarding, attendance, task and meeting logic. `/functions/curriculum.js` is a compatibility URL served from the current frontend asset. Reuse legitimate requirements and curriculum through the V2 architecture. |

## Architecture decisions to preserve

| Source | Decision and application |
| --- | --- |
| [Architecture specification](ARCHITECTURE.md) and Phase 01 | Single repository, same-origin modular monolith. HTML, CSS and vanilla JavaScript with Node.js 24 LTS, Express 5, MySQL 8.4 LTS, Prisma, Docker Compose and phpMyAdmin. Preserve existing branding and compatible URLs. The approved Phase 04 directive also excludes React, TypeScript application code, Redis, microservices and new paid services. |
| [ADR-001 and ADR-004](ARCHITECTURE_DECISIONS.md) | Firebase handles identity only. Browser sends a Firebase Bearer ID token and Express resolves identity, account state and RBAC in MySQL on request. Application data flows through Express and MySQL. Keep Firebase custom claims, Firestore, Storage and Functions out of V2 authorization and business-data flows. |
| [ADR-002](ARCHITECTURE_DECISIONS.md) | Store timestamps and run MySQL in UTC. Interpret working hours, business dates and displayed times in Asia/Kolkata. |
| [ADR-003](ARCHITECTURE_DECISIONS.md) and [Phase 03 report](PHASE_03_REPORT.md) | MySQL has scoped grants and a dedicated development shadow schema. Phase 02C documented grants on the application and shadow schemas. Phase 03 reports a separate migration principal. The target is a runtime principal with only required data access and separate migration credentials. Verify effective grants and process separation before treating that target as achieved. |
| [Database specification](DATABASE.md) and [Business rules](BUSINESS_RULES.md) | Begin V2 with fresh relational storage and preserve all records created in it. Version schema changes as reviewed Prisma migrations. Keep MySQL and upload data on persistent named volumes. Use controlled backup and restore. |

## Database shape

| Layer | Models in [schema.prisma](../prisma/schema.prisma) | Important constraints |
| --- | --- | --- |
| Phase 01 settings | `SystemSetting` | Unique setting key. Seven seed settings include application metadata and working calendar. |
| Phase 02 identity and RBAC | `User`, `Profile`, `Role`, `Permission`, `UserRole`, `RolePermission` | Unique Firebase UID and email. One profile per user. Unique role and permission codes and composite join keys. Account states are `PENDING`, `ACTIVE`, `REJECTED`, `SUSPENDED`, `INACTIVE`. |
| Phase 03 operations | `StaffProfile`, `AuditLog` | One staff profile per user and unique `STF-XXXX` code. Employment states are `ACTIVE`, `SUSPENDED`, `INACTIVE`. Audit history preserves the record if the actor reference is cleared. |
| Phase 04 | `Department`, `UserDepartment`, `InternshipApplication`, `Internship` | Unique department code and slug. Membership is unique by user, department and assigned role. The service keeps one active capacity per user and department. A unique application and code identify each enrollment. Application writes, role and staff changes and enrollment approval serialize on the applicant row. |

Phase 05 adds effective-dated policies, enrollment eligibility intervals, unique daily attendance and report rows, leave, and corrections. Check-in, checkout, lifecycle changes and review decisions use the same user row lock. Reporting derives absences, weekends and missing evidence from stored facts. [Attendance operating rules](ATTENDANCE.md).

Phase 06 adds tasks, assignments, submission versions, reviews and private file metadata. Curriculum joins versioned content to internship enrollments and lesson progress. [Data model](DATABASE.md#phase-06-data-model).

Tables use Prisma mappings, UUID identifiers, MySQL `utf8mb4` with `utf8mb4_unicode_ci`, and UTC event timestamps. Phase 06 adds 16 permission codes to the eight-role model and seeds eight recovered curricula across the nine existing departments. Seed re-runs preserve existing department edits and Phase 06 permission revocations. [Migration inventory and evidence](PROJECT_PROGRESS.md#migrations-and-seed).

## Current HTTP surface

In addition to health and Swagger routes, the following groups are mounted under `/api/v1`. See [API conventions](API.md), [Authentication](AUTHENTICATION.md), [Staff management](STAFF_MANAGEMENT.md) and [Phase 03 API catalog](PHASE_03_REPORT.md#2-api-endpoints-catalog-phase-03-additions).

| Group | Implemented paths and behavior |
| --- | --- |
| Identity | `POST /auth/bootstrap`, `GET /auth/me`, `GET /auth/status`, `PATCH /users/me/profile`. Bootstrap links a verified token subject to MySQL, checks email collisions, and preserves existing privileges and account status. |
| Users | `GET /users`, `GET /users/:id`, `PATCH /users/:id/status`, `GET` and `PUT /users/:id/roles`. Includes directory search, pagination, status controls and role updates. |
| Staff | `GET` and `POST /staff`, `GET` and `PATCH /staff/:id`, `PATCH /staff/:id/status`. Staff provisioning uses an existing registered user and writes related account, role and audit updates transactionally. |
| Roles and permissions | `GET /roles`, `GET /roles/:id`, `PUT /roles/:id/permissions`, `GET /permissions`. Role mutation and Founder protections require continued acceptance checks. |
| Audit and metrics | `GET /audit-logs` and `GET /admin/stats`. Stats include user and staff status, departments, applications and effective enrollment counts. |
| Phase 04 | `/departments`, `/internship-applications` and `/internships`. See the [Phase 04 API](API.md#phase-04-departments-applications-and-internships) for methods, resources and authorization. |
| Phase 05 | `/attendance`, `/daily-work-reports`, `/leave-requests` and `/attendance-corrections`. [Phase 05 API](API.md#phase-05-attendance-leave-and-work-reports). |
| Phase 06 | `/tasks`, `/task-assignments`, `/task-submissions`, `/attachments`, `/learning` and `/performance`. [Phase 06 API](API.md#phase-06-tasks-learning-and-performance). |
| Phase 07 | `/notifications`, `/notification-preferences`, `/announcements`, authorized admin email and worker endpoints, and assessment corrections. [Phase 07 API](API.md#phase-07-notifications-announcements-and-delivery). |

## Phase 08 boundaries

Meeting management supports manually supplied Meet links and disabled-by-default Calendar OAuth. Completed internships have independent dispatch declarations, extensions and promotion histories. The primary Founder alone controls staff activation and privileged role assignment. [Phase 08 engineering report](PHASE_08_REPORT.md).

## Source records

- Approved rules and architecture are preserved in [BUSINESS_RULES.md](BUSINESS_RULES.md), [ARCHITECTURE.md](ARCHITECTURE.md), [ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md), [RBAC.md](RBAC.md) and the Phase 04 directive recovered from the local Antigravity capture of the IntelliCore ChatGPT engineering review. The requirements and roadmap carry forward its approved scope and acceptance gates.
- [PROJECT_AUDIT.md](PROJECT_AUDIT.md), [DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md), [PHASE_02A_REPORT.md](PHASE_02A_REPORT.md), [PHASE_02B_REPORT.md](PHASE_02B_REPORT.md), [PHASE_02C_VALIDATION.md](PHASE_02C_VALIDATION.md) and [PHASE_03_REPORT.md](PHASE_03_REPORT.md) preserve the historical decisions, reported verification and implementation details. Some technical guides still describe their original phase.
- [FIREBASE_SETUP.md](FIREBASE_SETUP.md), [SECURITY.md](SECURITY.md), [TESTING.md](TESTING.md) and [SETUP.md](SETUP.md) document setup and original controls. Consult [Security rules](SECURITY_RULES.md) and [Project progress](PROJECT_PROGRESS.md) for current boundaries and verified coverage before following operational examples.

## Curriculum mapping

The legacy track content and rubrics remain in the [backend curriculum](../backend/src/modules/learning/curriculum.js) and [frontend curriculum](../frontend/assets/js/curriculum.js). The department codes below give Phase 06 a stable reference for the existing track names.

| Existing track | Department code |
| --- | --- |
| Business Analyst Intern | `BIZ_ANALYTICS` |
| Web Development Intern | `WEB_DEV` |
| Data Analyst Intern | `DATA_ANALYTICS` |
| Digital Marketing Intern | `DIGITAL_MARKETING` |
| Graphic Designer Intern | `GRAPHIC_DESIGN` |
| Social Media Intern | `SOCIAL_MEDIA` |
| Content Writing Intern | `CONTENT_WRITING` |
| Human Resources Intern | `HR` |

Phase 06 imports eight recovered practice tracks and their 16 exercises. The approved WordPress Development department, `WORDPRESS_DEV`, has an empty recovered catalog and supports authorized authoring. [Curriculum inventory](LEARNING_MANAGEMENT.md).
