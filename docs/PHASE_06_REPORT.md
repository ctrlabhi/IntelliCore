
# Phase 06 engineering report

- **Date** 2026-11-25 (Asia/Kolkata)
- **Starting checkpoint** `05c8830` with Phase 05 implementation `4d19095` and a clean working tree
- **Implementation checkpoint** `3085ef8` on local `main`
- **Acceptance** Implemented and verified on isolated infrastructure. Existing-stack and real Firebase acceptance remain open.

## Executive summary

Phase 06 adds departmental task and learning workflows to the IntelliCore modular monolith. Task definitions, assignments, immutable submission versions and reviews have separate lifecycles. Curriculum authoring creates immutable published versions, and learning enrollments preserve their original content. Performance reports render database-backed outcomes and their denominators. Founder, HR, Team Leader and Intern dashboards consume the REST APIs with role, department and ownership restrictions. Node.js, Express, Prisma, MySQL and the existing HTML, CSS and vanilla JavaScript stack remain in use.

## Previous-phase verification and corrections

The exact Phase 05 checkout passed **112 tests across 19 files** on a freshly recreated disposable baseline schema. The Phase 06 suite reran the attendance and work-report cases, including boundary and concurrent check-in, explicit same-day checkout, historical eligibility, bounded logout failure, leave reconciliation and report submission. The inherited staff directory test now searches for its own fixture before asserting pagination. Accumulated synthetic staff previously could move that fixture off the first page.

Founder bootstrap now locks the seeded Founder role before checking for a competing assignment. A real MySQL integration test verifies concurrent same-identity retries and a conflicting candidate. A separate synthetic rehearsal with a vacant Founder role and two competing verified fixture identities left exactly one assignment. Actual Firebase and existing-stack acceptance remains outstanding below.

## Files and entry points

| Area | Files |
| --- | --- |
| Work APIs | [Routes](../backend/src/modules/work/workRoutes.js), [task service](../backend/src/modules/work/taskService.js), [submission service](../backend/src/modules/work/submissionService.js), [file service](../backend/src/modules/work/attachmentService.js), [performance service](../backend/src/modules/work/performanceService.js), [scope](../backend/src/modules/work/workAccess.js), and [input schemas](../backend/src/modules/work/workInput.js) |
| Curriculum | [Learning service](../backend/src/modules/learning/learningService.js), [recovered catalog mapping](../backend/src/modules/learning/curriculumCatalog.js), and [application approval hook](../backend/src/modules/internships/applicationService.js) |
| Database | [Prisma schema](../prisma/schema.prisma), [sixth migration](../prisma/migrations/20261125120000_add_tasks_learning_and_performance/migration.sql), and [seed](../prisma/seed.js) |
| Integration | [REST mounting](../backend/src/routes/apiV1.js), [OpenAPI contracts](../backend/src/config/phase06OpenApi.js), [storage](../backend/src/integrations/storage/storageService.js), [Founder bootstrap](../backend/src/scripts/bootstrapFounder.js), and configuration and logging |
| Dashboards | [Four dashboard shells](../frontend/pages/dashboards), [shared work dashboard](../frontend/assets/js/phase06-dashboard.js), [task UI](../frontend/assets/js/task-workspace.js), [learning UI](../frontend/assets/js/learning-workspace.js), [shared controls](../frontend/assets/js/work-controls.js), [styles](../frontend/assets/css/phase06-dashboard.css), and [API client](../frontend/services/api.js) |
| Testing | [Phase 06 unit checks](../tests/unit/phase06Rules.test.js), [real MySQL suite](../tests/integration/phase06MySql.test.js), and existing fixture, isolation and regression tests |
| Project context | [Agent instructions](../AGENTS.md), [requirements](MASTER_REQUIREMENTS.md), [architecture decisions](ARCHITECTURE_DECISIONS.md), [progress](PROJECT_PROGRESS.md), [security rules](SECURITY_RULES.md), [roadmap](IMPLEMENTATION_ROADMAP.md), and the linked operating specifications |

## Database and migrations

The migration `20261125120000_add_tasks_learning_and_performance` adds 11 tables. The five previous SQL files retain their bytes. The new migration is tracked with its rehearsed line endings and checksum. New SQL defines task/assignment, submission/review and file parent relations with UUID identifiers and indexes. Curriculum versions contain modules, lessons and links. An enrollment binds an internship to a track version, and a lesson progress record binds to the exact enrollment and lesson. Unique keys protect task/recipient assignments, numbered versions, reviews, enrollments, and per-lesson progress. [Data model](DATABASE.md#phase-06-data-model).

MySQL 8.4.13 applied all six migrations to an empty dedicated schema. A separate populated upgrade started with the exact five Phase 05 migrations. Row counts and content hashes matched across ten existing source tables after deployment and after seeding. The comparison included users, profiles, applications, internships, eligibility, attendance, policy, corrections, leave requests and Daily Work Reports. All six ledger checksums matched, and `prisma migrate diff --exit-code` reported zero schema drift. The migration created no task, attachment, submission, review, enrollment or progress rows. The seed imported the eligible catalog independently. A repeated seed preserved an explicitly revoked Phase 06 grant plus eight tracks and 16 exercises.

Rehearsals used separate schema-scoped migration and DML-only runtime accounts on loopback. Prisma schema validation and Client 6.19.3 generation passed.

## Permissions and resource authorization

Phase 06 adds 16 permission codes. Six capabilities support explicit organization and assigned-department grants, three grants cover own tasks, learning and performance, and one grants in-scope review feedback. Founder and Co-Founder receive organization management and review. Operations Executive receives task management within its seeded organization scope. Admin and HR executives receive monitoring access by default, and HR Manager additionally receives evaluation feedback. Active Team Leaders need both stored permission and current department membership. Own routes derive the user from authenticated identity. [Full role matrix](RBAC.md#phase-06-work-and-learning-permissions).

## Tasks, assignment lifecycle and reviews

An author saves a draft, previews recipients, and publishes with the task revision and exact roster fingerprint. One or several selected internships are supported. Department publication inserts an explicit snapshot of eligible recipients. Later recipients require a new authorized action. Staff can extend deadlines, cancel unfinished assignments, close tasks and archive history with audit records. A closed task can accept approval for already submitted work. Revisions require an open published task.

Assignments move from assigned to in progress, submitted and approved. A revision request permits another submitted version while retaining the previous version. Only a current unreviewed submission accepts a review. Score validation uses the version’s rubric and maximum. Late submissions retain their UTC deadline snapshot, display IST context, and carry no automatic deduction. Review, assignment status and audit updates are transactional. Attendance, leave and Daily Work Reports have independent lifecycles. [Task rules](TASK_MANAGEMENT.md).

## Private attachment security

Task drafts and own submission drafts accept bounded UTF-8 text or validated non-interlaced PNG files. Files use generated storage IDs outside frontend directories. Private downloads apply the current resource scope, stream as attachments, set no-store and disable sniffing. API responses and error logs omit host paths and storage keys. Renamed binary, traversal, unsafe markup, oversize input and cross-user or cross-department downloads were checked. Private work stays in task and submission records. [Storage rules](FILE_STORAGE.md).

## Curriculum and performance

Eight recovered tracks contain the 16 original exercises, deliverables and rubric points. The lesson catalog reuses the preserved practice material. WordPress starts with an empty recovered catalog and supports authorized authoring. Published content keeps its original version and any corresponding progress. A sole published track can be assigned to an eligible intern during approval or the dashboard sync. Staff can make an explicit choice where there are multiple tracks.

Individual completion uses approved assignments divided by non-cancelled assignments. Learning uses persisted completed required lessons divided by the total required, with optional activity tracked separately. Empty denominators return null. Includes paginated evaluation history and department or organization reporting with IST dates. These metrics have no automatic effect on internship completion or certification. [Curriculum inventory](LEARNING_MANAGEMENT.md) · [Metric definitions](PERFORMANCE_EVALUATION.md).

## APIs and dashboards

The REST surface includes `/tasks`, `/task-assignments`, `/task-submissions`, `/attachments`, `/learning` and `/performance`. OpenAPI documents methods, strict request shapes, query filters, pagination and secure binary responses. [API contracts](API.md#phase-06-tasks-learning-and-performance).

| Workspace | Verified workflow |
| --- | --- |
| Founder | Created an individual task, selected a recipient, previewed and published it, confirmed the assignment, created and published a curriculum draft, and viewed actual totals. |
| Team Leader | Published a department task, confirmed an unrelated department was unavailable, requested a revision, then approved the current revised work with a score. |
| Intern | At a 390 px mobile viewport, started assigned work, saved a draft, uploaded private text and submitted. Viewed revision feedback, submitted version two, and viewed approval and score. Started and completed a recovered lesson and saw persisted 1 of 2 required lessons at 50%. |
| HR | Viewed authorized task and learning progress, and read permitted evaluation history. HR Manager saw recorded feedback and score. HR Executive received metrics with feedback withheld. HR lacked technical controls. |

Headless Edge used synthetic identities and real dashboard assets, Express, Prisma and disposable MySQL. The final workflow recorded no unexpected same-origin HTTP errors, network failures, JavaScript exceptions or browser security errors. A separate mobile measurement found the layout and document width at 390 px and the work section at 366 px with matching scroll and client widths. The isolated site, `/health`, `/ready`, Swagger UI and OpenAPI JSON responded.

## Automated test results

| Category | Result |
| --- | --- |
| Exact Phase 05 snapshot | 112 passed across 19 files on a fresh isolated Phase 05 schema |
| Full Phase 06 regression | **131 passed across 21 files** with Node.js 24.20.0 and Vitest 3.2.7 |
| Unit tests | 32 passed, including six new Phase 06 unit tests |
| MySQL-dependent integration | 60 passed, including 13 new Phase 06 integration tests with synthetic Firebase verification |
| Other HTTP, security and mocked integration | 39 passed |
| Browser acceptance | Four dashboards passed on isolated Express and MySQL with synthetic identity configuration |

The MySQL suite covered roster and draft concurrency, invalid and out-of-scope recipients, stale requests, eligibility changes, versions, lateness, review rollback, upload and download authorization, and curriculum preservation. [Test instructions](TESTING.md#phase-06-additional-coverage).

## Runtime status and remaining verification

The configured Docker context outside the sandbox was `desktop-linux`. Docker Desktop's Windows service was stopped and the matching Linux engine pipe was absent. Compose configuration passed validation. The existing container health, MySQL migration ledger and grants, authenticated phpMyAdmin, existing upload volume access and normal localhost ports 3000 and 8080 were not verified. Migrations were applied to disposable schemas. Existing database records and volumes, production Firebase `intellicore-229`, and the live website were untouched.

Real development Firebase Google sign-in, email/password registration and sign-in, verification delivery, password reset, session restoration and revoked or disabled identity handling require live acceptance. Synthetic browser evidence covers application flows after identity verification. Earlier protected role, audit-grant, environment and staff acceptance items remain tracked in [Project progress](PROJECT_PROGRESS.md#outstanding-verification).

## Engineering defaults and limits

The initial task scope is one department per definition. Selected-recipient batches are capped at 250. Published deadline changes are extensions. Individual overrides remain effective independently of a definition extension. Reviews retain their recorded scores and feedback. The first attachment allowlist is UTF-8 text and static PNG, with five files at up to five MiB each by default. Learning resources use links. Recovered exercises are delivered as practice modules and rubric-backed task templates. A zero required-lesson denominator produces a null percentage.

A dashboard sync creates an enrollment when an existing or future-start intern becomes eligible and the published choice is unambiguous. Existing enrollments stay pinned. Phase 06 has no separate administrative learning-progress correction or post-review score amendment workflow. Transactional audit events provide stable event names for Phase 07. Email and notification delivery remain in Phase 07.

## Acceptance checklist

| Criterion | Result |
| --- | --- |
| Task creation | PASS |
| Task publication | PASS |
| Individual task assignment | PASS |
| Department task assignment | PASS |
| Duplicate assignment prevention | PASS |
| Deadline management | PASS |
| Overdue calculation | PASS |
| Submission drafts | PASS |
| Written submissions | PASS |
| Project and repository links | PASS |
| Secure private file uploads | PASS |
| Authorized attachment downloads | PASS |
| Submission version history | PASS |
| Task review | PASS |
| Revision requests | PASS |
| Task approval | PASS |
| Score validation | PASS |
| Curriculum management | PASS |
| Existing curriculum preservation | PASS |
| Learning track publication | PASS |
| Learning enrollment | PASS |
| Lesson completion | PASS |
| Accurate learning progress | PASS |
| Curriculum version preservation | PASS |
| Performance reports | PASS |
| Founder dashboard integration | PASS |
| HR dashboard integration | PASS |
| Team Leader dashboard integration | PASS |
| Intern dashboard integration | PASS |
| Department scope enforcement | PASS |
| Previous attendance functionality preserved | PASS |
| Audit logging | PASS |
| Migration reproducibility | PASS |
| Populated database upgrade verification | PASS |
| Existing regression tests passing | PASS |
| New automated tests passing | PASS |
| Real isolated MySQL integration testing | PASS |
| Browser acceptance with synthetic authentication | PASS |
| Live Docker verification | NOT VERIFIED |
| Real development Firebase acceptance | NOT VERIFIED |
| Production isolation | PASS |
| Documentation completeness | PASS |

Phase 07 requires the user's next manual implementation prompt.
