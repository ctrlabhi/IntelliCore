# IntelliCore V2.0 implementation roadmap

**Reconciled on 2026-11-25.** The historical tracker and recovered ChatGPT engineering review agree on the phase order below. The detailed acceptance scope for Phase 04 comes from the approved directive. Exit evidence for Phases 05–10 is planning guidance derived from the existing business rules and phase titles. Record detailed decisions when each phase is specified.

| Phase | Scope | Status |
| --- | --- | --- |
| 01 | Project foundation and Docker infrastructure | Complete per history and present in source. |
| 02A | Isolated Firebase development project setup | Complete per report. |
| 02B | Authentication, identity and foundational RBAC | Implemented. Phase 02C and later reviews carry the remaining acceptance work. |
| 02C | Authentication acceptance, least privilege and Founder initialization | Accepted with outstanding verification requirements. |
| 03 | RBAC enforcement, user management and staff administration | Implemented at `1fe8067`, conditionally accepted. |
| 04 | Internship lifecycle, onboarding and department management | Implemented. Isolated MySQL and synthetic-browser workflows verified. Existing Compose stack and live Firebase sign-in remain open. |
| 05 | Attendance tracking and leave management | Pending. |
| 06 | Task pacing and learning management | Pending. |
| 07 | SMTP email notifications and dispatcher | Pending. |
| 08 | Google Meet integration and certificate generation | Pending. |
| 09 | Full frontend unification and dashboards | Pending. |
| 10 | Security hardening, testing and final delivery | Pending. |

## Phase 04 scope and verification

1. Reconcile the existing schema, local SQL and seed delta with the directive and live migration metadata when the local stack is available. Preserve all existing rows and volumes. Recover repeatable migration tracking, verify grant separation and test isolation, and carry forward unresolved Phase 02C and 03 acceptance items.
2. Implement department CRUD through activation/deactivation and privileged staff assignment. Validate the seed against existing tracks, expose a minimal active department catalog to pending applicants, and enforce active Team Leader assignment on direct API access. Preserve curriculum content and document the track-to-department mapping.
3. Implement verified pending-user onboarding, draft edits, submission, withdrawal, revisions, rejection and atomic approval/enrollment. Enforce authorization, state transitions, department activity, leader eligibility, date validity, protected account status and overlap rules. Use scoped list and detail queries, compatible envelopes, pagination, filtering and safe sorting.
4. Add enrollment management, leader assignment, commencement gating, completion review, manual HR sign-off, termination, withdrawal and history. Audit administrative actions and successful changes in the same transaction. Keep attendance, tasks, learning evaluations, SMTP and certificates on their later phases.
5. Wire Founder, HR, Intern and Team Leader flows to Express and preserve the existing frontend. Verify pending, own-record, department-scoped and organization-wide accesses as applicable. Exercise real MySQL migrations and seed behavior, the existing regression suite, and authorized end-to-end workflows. Document the data model, authorization matrix, APIs and outcome evidence before Phase 05 engineering review.

### Planned Phase 04 API surface

The directive defines the following paths under `/api/v1`. See [Phase 04 API](API.md#phase-04-departments-applications-and-internships) for the implemented contracts, including enrollment withdrawal.

| Group | Planned operations |
| --- | --- |
| Departments | `GET /departments`, `GET /departments/:id`, `POST /departments`, `PATCH /departments/:id`, `PATCH /departments/:id/status`, `GET /departments/:id/staff`, `PUT /departments/:id/staff`. |
| Applications | `GET /internship-applications/me`, `GET /internship-applications`, `GET /internship-applications/:id`, `POST /internship-applications`, `PATCH /internship-applications/:id`, and `POST` actions on `/:id/submit`, `/:id/withdraw`, `/:id/request-changes`, `/:id/approve`, `/:id/reject`. |
| Internships | `GET /internships/me`, `GET /internships`, `GET /internships/:id`, `PATCH /internships/:id`, `PUT /internships/:id/team-leader`, `POST` actions on `/:id/request-completion`, `/:id/approve-completion`, `/:id/terminate`, and an explicitly authorized withdrawal operation. Filter by department, status, date, Team Leader and search. |

### Phase 04 acceptance coverage

- Department creation, edits, duplicate prevention, inactive-department rejection and assignment restrictions.
- Verified onboarding, pending access denial, draft save and edit, submission, invalid transitions, approved withdrawal, revisions and rejection.
- Scoped listings and ownership, HR review, no self-approval, protected roles, valid dates, leader eligibility, cross-department denial and mass-assignment defense.
- Concurrent approval and code generation, rollback, duplicate and overlapping enrollment prevention, manual completion, termination and separation of staff and internship lifecycles.
- Transactional audit for department creation, updates and status, staff assignments, submission, revisions, approval/rejection, enrollment creation, leader assignment, completion and termination.
- Founder department administration and live metrics, intern draft-to-submission and pending boundaries, HR approval and resulting enrollment, and Team Leader authorized access. Use test identities and verify browser console, network/CSP and responsive behavior.
- Real table constraints and migration history, seed repeatability, actual grants, credential separation, isolated MySQL tests and runner safeguards, Docker services, authentication regression and documentation. Validate `/`, `/health`, `/ready`, `/api-docs` and local phpMyAdmin. Capture results individually as PASS, FAIL or NOT VERIFIED.

## Phases 05–10

| Phase | Planned work | Evidence for acceptance |
| --- | --- | --- |
| 05 | Attendance, authenticated check-in/checkout, end-of-day reconciliation, Daily Work Reports and HR leave approval. | Business-calendar and IST boundary coverage, repeat-access and scheduler idempotency, checkout and DWR transitions, leave interaction, ownership and HR scope, and real workflow tests. |
| 06 | Task pacing, curriculum and learning resources, assignments, submissions, review, progress and evaluations. | Legacy curriculum mapping and preservation, scoped Team Leader and intern operations, valid assignment/review states and persisted progress. |
| 07 | SMTP delivery, notification records and in-app alerts for status changes, reviews, leave and announcements. | Validate dispatcher outcomes, failure handling and retry behavior with authorized test delivery and sanitized logs. |
| 08 | Server-mediated Google Calendar/Meet and certificate generation after HR sign-off. | Authorized scoped meetings with real links in development, verifiable certificate PDF with ID, QR code and watermark, and audit and history checks. |
| 09 | Finish same-origin frontend integration across public pages and all authorized role workflows. | End-to-end role routing, multi-role behavior, live metrics, existing branding and URL compatibility, responsive and accessible forms, and error/loading/empty states. |
| 10 | Final security hardening, release verification and delivery. | Verify auth and RBAC, production isolation, secrets and logging, database grants, migration reproducibility, backups and restore on isolated infrastructure, deployment runbook and regression/browser baselines. Production actions require explicit scope. |

Use [Master requirements](MASTER_REQUIREMENTS.md) for approved business behavior and [Project progress](PROJECT_PROGRESS.md) for verification and checkpoints. Phase 05 begins after the user's next implementation prompt.
