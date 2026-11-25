# IntelliCore V2.0 master requirements

**Reconciled on 2026-11-25.** These requirements consolidate [BUSINESS_RULES.md](BUSINESS_RULES.md), the [architecture decisions](ARCHITECTURE_DECISIONS.md), the Phase 03 and Phase 04 engineering directives recovered from local Antigravity artifacts, and the approved phase sequence. See the [progress tracker](PROJECT_PROGRESS.md) for implementation and verification evidence.

## Platform and identity

- Keep the approved single-origin stack and existing public website, Notes AI, responsive design and workspace shells. Preserve compatible legacy URL aliases and legitimate curriculum, without restoring legacy Firebase business-data access. Start with the fresh V2 relational foundation and retain all V2 records.
- Firebase Auth provides Google Sign-In, email/password registration and login, verification email and resend, password reset, session restoration, and logout. Verify email before workspace access for email/password accounts. The backend verifies the Firebase ID token and uses MySQL for identity linkage, profile, access and authorization.
- Self-registration creates a `PENDING` account with `INTERN`, the concrete V2 representation of the applicant or learner. Repeat bootstrap preserves existing account status and roles. Prevent UID/email collisions. Permit only explicitly allowed profile fields and onboarding operations for pending users.
- Keep the primary Founder initialization administrative, opt-in and idempotent. Verify the confirmed development Firebase identity, verified email and enabled state. Set `ACTIVE` and assign `FOUNDER` atomically, preserving protection against conflicting Founder assignment or demotion. HTTP may never grant `FOUNDER`.
- Keep the account, staff employment, internship application and internship enrollment lifecycles independent. Only authorized Founder or HR review can approve legitimate applicant access. Protect against activating a pending applicant through generic role, status or staff actions in lieu of the required approval workflow.

## Roles and staff administration

| Role | Approved responsibility |
| --- | --- |
| `FOUNDER` | Full executive oversight, protected role and personnel administration, department management and privileged assignments, internship oversight and approval. |
| `CO_FOUNDER` | Executive and organization-wide oversight with the approved permissions, subject to protected Founder-only operations. |
| `ADMIN` | Authorized operational and technical administration, with organization-wide internship access within the approved scope. |
| `HR_MANAGER` | Internship application and completion decisions, roster management, leave approval, attendance compliance and certificate issuance through the approved workflow. |
| `HR_EXECUTIVE` | Applicant communication, authorized applications and intern profile review, and attendance monitoring. Independent approval or rejection requires the authorized reviewer role. |
| `OPERATIONS_EXECUTIVE` | Authorized cross-track operations, task allocation and progress monitoring. Independent internship approval remains with authorized reviewers. |
| `TEAM_LEADER` | Mentoring and operational access for assigned domains and interns. Require an active account, active `TEAM_LEADER` role and active assignment for the relevant department. |
| `INTERN` | Own profile, onboarding and application, own internship and history, and own authorized attendance, tasks, reports and learning resources. |

- Enforce permissions in MySQL and on the server for every protected operation. Consult resource ownership and department assignments for scoped records. Preserve Founder-only elevated staff role grants and revocations for `ADMIN`, `HR_MANAGER`, `HR_EXECUTIVE`, `OPERATIONS_EXECUTIVE` and `TEAM_LEADER` as specified in [Business rules](BUSINESS_RULES.md). Protect `CO_FOUNDER` assignment as an executive operation. Dynamic permission changes and indirect flows must preserve Founder-only rules.
- Provide paginated, searchable user and staff administration, staff codes, role assignments, configurable permissions for eligible roles, suspension/reactivation and synchronized employment/account status. Provision staff from an existing registered account, prevent duplicate profiles and identifiers, and keep protected Founder and self-deactivation safeguards. Audit successful administrative mutations transactionally.
- The Phase 04 operational matrix keeps organization-wide reads for Co-Founder and Admin. Authorized Founder, Co-Founder and HR Manager accounts can perform review and enrollment decisions. Primary Founder privileges cover staff-role provisioning and changes, permission matrix edits, and department administration. See [Security rules](SECURITY_RULES.md).

## Phase 04 departments and assignments

- Manage Department records with a UUID, unique code and slug, name, description, active state, creator and timestamps. Seed Human Resources, Web Development, Data Analytics, Business Analytics, Graphic Designing, Content Writing, Digital Marketing, Social Media Management and WordPress Development idempotently. Review other legitimate tracks against the original forms and curriculum before adding them.
- Founder operations create, edit, activate and deactivate departments and manage privileged staff assignments. Preserve history when a department is deactivated and prevent new applications to it. Department membership grants no system role.
- Support staff and Team Leaders in multiple departments and multiple Team Leaders per department. Keep assignment status, actor and timestamps. Maintain one active capacity per user and department. The schema distinguishes historical rows by assigned role as well as user and department.

## Phase 04 onboarding and applications

- A verified pending applicant may access their own profile, own application and status, the approved public fields of active departments, and logout. Active workspace operations, other users' records, administrative data, attendance, tasks and certificates require the applicable active account and resource authorization. Use a narrow onboarding guard.
- Capture the selected department, requested start and duration, relevant qualifications, institution, skills, motivation and necessary contact details. Reuse existing profile data and form design where applicable. Validate fields and limits, and prevent applicants from setting review, status and approval metadata.
- Support own draft save/edit, submission and withdrawal where eligible. Lock submitted content during review. Allow review with reasoned changes requests or rejection. Model `DRAFT → PENDING_APPROVAL → APPROVED`, `PENDING_APPROVAL → CHANGES_REQUESTED → PENDING_APPROVAL`, `PENDING_APPROVAL → REJECTED` and authorized `WITHDRAWN` transitions. Detect duplicate submissions, conflicting actions and self-approval.
- Approval confirms the applicant, department, position, dates and eligible Team Leader where available. In one transaction, recheck application state and department activity, validate dates and leader scope, prevent duplicate or overlapping enrollment, create the internship and update the application, activate an eligible pending account, preserve appropriate roles, and write an audit entry. Suspended and inactive accounts and privileged staff conflicts require explicit handling. Approval email belongs to Phase 07.

## Phase 04 internship enrollment and workspaces

- Model unique, concurrency-safe enrollment codes. The directive recommends `IC-INT-000001` display format. Preserve history and allow at most one overlapping active enrollment per user under the initial policy. Record applicant, source application, department, optional Team Leader, title, dates, duration, work mode, approval/completion actors and timestamps, and termination reason where applicable.
- Preserve the original 1, 2, 3 and 6 month options. Support validated day-based durations where an approved domain rule requires them. Apply calendar-month arithmetic and confirm the final dates during HR approval. Default work mode to `REMOTE` and use additional modes only when approved. Payroll is outside scope.
- Use `APPROVED`, `ONGOING`, `COMPLETION_REVIEW`, `COMPLETED`, `TERMINATED` and `WITHDRAWN`. Termination and withdrawal are authorized lifecycle operations. Gate ongoing operations by commencement date. At the calculated end, send the internship to completion review, corresponding to the original `completion_pending` rule. HR confirms successful completion manually. Completed interns retain authorized historical access. Termination and withdrawal end active internship access and preserve the Firebase identity and records.
- Founder needs department/assignment controls, applications, active and completed enrollment views, Team Leader assignments, completion reviews and real MySQL-derived metrics. HR needs a review queue, applicant details, authorized decisions and completion management. Interns need accessible application and status screens, revision/rejection feedback, enrollment details and history. Team Leaders need authorized assigned departments and interns. Use real APIs with loading, error, empty, search and filter states where applicable.
- Preserve the existing curriculum content and rubrics in the [backend](../backend/src/modules/learning/curriculum.js) and [frontend](../frontend/assets/js/curriculum.js). Phase 04 mapped tracks to departments. Phase 06 uses those mappings for learning delivery, progress and assessment.

## Attendance, leave and learning

- Monday through Friday are working days and Saturday/Sunday are weekly rest days. Business hours are 09:30–18:30 IST. Mark check-ins after 09:30:00 IST late, with zero grace period.
- First authenticated intern workspace access in the eligible working window records check-in. Explicit logout records real UTC checkout for the current IST business date. After closing, a missing checkout is flagged. The Phase 05 directive supersedes synthetic end-of-day checkout.
- Verified active interns submit a Daily Work Report before 20:00 IST. `PRESENT` requires check-in, checkout and a submitted report. Past checked-in days with missing evidence are `INCOMPLETE`. Eligible completed shifts without check-in are `ABSENT` based on historical eligibility.
- Interns request leave with type, reason and dates. Authorized HR Manager or Founder review is required. Approved working days are `ON_LEAVE`, and approval over recorded activity requires an audited reconciliation that preserves timestamps.
- Submitted reports, checkout evidence and historical policy and eligibility are preserved. Authorized corrections retain original values, proposals and reviewer decisions. Team Leader access follows active department scope. [Attendance operating rules](ATTENDANCE.md).
- Provide task pacing, assigned work, submissions, reviews, curriculum resources and learning progress. Team Leaders oversee their assigned scope and interns access their own records. Preserve legitimate tracks, milestones, deliverables and rubrics from the legacy curriculum.

## Phase 06 tasks, learning and evaluations

- Publish scoped tasks to eligible internships atomically. Keep individual status, deadlines and assignment history independent from the task definition and other recipients. Department publication records an explicit recipient set.
- Keep draft work and files private, accept versioned late submissions while tasks remain open, and preserve the deadline and rubric used at submission. Require authorized review to approve work or record scores.
- Preserve recovered curriculum, bind learning progress to immutable published versions, and keep authorized historical enrollments. Report task completion and required learning progress with their denominators.
- Keep attendance, daily reports, task review, learning and internship completion independent. See the [task](TASK_MANAGEMENT.md), [learning](LEARNING_MANAGEMENT.md), [evaluation](PERFORMANCE_EVALUATION.md) and [file storage](FILE_STORAGE.md) specifications.

## Communications, meetings and completion artifacts

- Provide in-app and server-dispatched email notifications for application status, task reviews, leave decisions and company announcements. Persist delivery/notification records and use the SMTP dispatcher in Phase 07.
- Commit business changes, applicable notices and email jobs together. Separate transport from the HTTP transaction, keep capture as the development default and publish company announcements in-app.
- Author, preview, publish and schedule announcements within role and department scope. Revalidate audience, eligibility and preferences for delayed work. Protect read, archive, diagnostics and retry operations.
- Preserve original lesson and review evidence when authorized staff record a learning correction or score amendment. Validate current scope, the recorded rubric and the required reason. [Notification and event rules](NOTIFICATION_MANAGEMENT.md).
- Implement real Google Meet links through server-to-server Google Calendar integration for authorized HR and Team Leaders. Use appropriate domain and meeting scope.
- On HR completion sign-off, generate an official verifiable certificate PDF with unique verification ID, QR code, domain track, completion date and an official digital watermark. Preserve enrollment and certificate history.

## Data protection and release acceptance

- Use soft deletion for standard deletion, including `deleted_at` where the design calls for it. Permanent deletion requires primary Founder authority and an explicitly authorized administrative operation. Preserve all current database records and persistent volumes. Phase 04 excludes permanent deletion and production deployment.
- Keep credentials and personal records private. Require version-controlled, non-destructive migrations, least-privilege database accounts, server validation and authorization, audit logging, safe rendering and sanitized diagnostics. Follow [Security rules](SECURITY_RULES.md).
- Verify changes using regression tests, isolated MySQL integration, browser acceptance for relevant roles and runtime checks. Account for pending items from earlier phases. Record PASS, FAIL or NOT VERIFIED against each acceptance criterion with evidence.
