# IntelliCore Business Rules Specification

**Document Version:** 1.0.0  
**Phase Target:** Approved for implementation starting in Phase 2  
**Business Timezone:** Asia/Kolkata (`UTC+05:30`)  

---

## 1. Overview & Scope

This specification enshrines the approved business rules and functional logic governing the IntelliCore Platform. While Phase 1 delivers the containerized architectural and database foundation, these rules serve as the authoritative blueprint for business domain implementation in subsequent phases.

---

## 2. Authentication & Identity Management

1. **Development Firebase Authentication Project:**
   - A dedicated Firebase Authentication project will be provisioned exclusively for local and staging development.
   - The production Firebase project (`intellicore-229`) is permanently quarantined and must never receive local requests.
2. **Authentication Providers:**
   - Google Sign-In (OAuth 2.0).
   - Email and Password Authentication.
   - For email/password accounts, email verification is strictly mandatory before accessing any dashboard or workspace feature.
3. **Self-Registration Workflow:**
   - Any applicant can register an account.
   - Initial user status upon registration is `pending_approval`.
   - Access to internal tools, tasks, and attendance is locked until an authorized HR Manager or Founder reviews and approves the registration.

---

## 3. Role-Based Access Control (RBAC)

1. **Hierarchical Roles:**
   - `founder` / `co_founder`: Super Administrator with complete system authority.
   - `admin`: Operational administrator with access to organization, recruitment, and management tools.
   - `hr_manager`: Human Resources lead managing intern rosters, leave approvals, attendance compliance, and certificate issuance.
   - `hr_executive`: Operational HR personnel handling applicant communications and attendance monitoring.
   - `operations_executive`: Operational personnel monitoring domain tasks and progress.
   - `team_leader`: Domain mentor authorized exclusively to oversee interns assigned to their specified tracks.
   - `learner` / `intern`: Standard intern account with access to their individual tasks, daily attendance, resources, and progress.
2. **Founder-Only Staff Role Assignment:**
   - Elevated staff roles (`admin`, `hr_manager`, `hr_executive`, `operations_executive`, `team_leader`) can **only** be granted or revoked by the `founder`.
   - No HR staff member or administrator may elevate another user or self-assign elevated privileges.
3. **Database-Driven Role Authority:**
   - All authorization checks are evaluated against MySQL database records via server-side middleware, not client-side state.

---

## 4. Attendance & Working Hours Rules

1. **Working Calendar:**
   - Monday to Friday are official working days.
   - Saturday and Sunday are official non-working weekly rest days.
2. **Business Hours:**
   - Official working hours: **09:30 IST to 18:30 IST**.
   - No late check-in grace period is permitted. Check-ins occurring after 09:30:00 IST are flagged as `late`.
3. **Automatic Check-In:**
   - The first authenticated dashboard or workspace access by an intern on an active working day between 09:30 and 18:30 IST automatically records their daily check-in.
4. **Automatic Check-Out:**
   - Logging out of the application records the check-out timestamp.
   - An open record after 18:30 IST carries a missing-checkout flag. The Phase 05 directive requires a real explicit logout event and supersedes synthetic checkout.
   - Checkout lookup uses the current IST business date. Logout proceeds if checkout storage fails or the report is missing.
5. **Mandatory Daily Work Report:**
   - Submit work completed, learning, progress, blockers and the next working day's plan before 20:00 IST. A complete `PRESENT` day requires check-in, checkout and a submitted report.
   - Past checked-in days with missing evidence are `INCOMPLETE`. An eligible completed shift with no check-in is `ABSENT`. Approved leave and weekends have distinct classifications.
   - Attendance applies to eligible ongoing interns. Staff attendance and payroll deductions are outside this policy. Timestamp and late-report corrections require an authorized, audited decision. [Attendance operating rules](ATTENDANCE.md).

---

## 5. Leaves & Internship Life Cycle

1. **Leave Requests:**
   - Interns can submit leave requests through the workspace with a stated reason and requested dates.
   - Every leave request requires formal review and approval by an authorized `hr_manager`.
   - Approved leaves preserve attendance records without penalty.
   - Requests support sick, casual, emergency and other leave. Weekend days are excluded from leave totals, and approval over recorded activity requires explicit reconciliation with timestamps retained.
2. **Internship Completion Workflow:**
   - Internship duration options: 1 month, 2 months, 3 months, or 6 months.
   - Upon reaching the calculated end date, the account transitions to `completion_pending`.
   - Manual review and formal sign-off by HR are required to mark the internship as `completed`.
3. **Automated Certificate Generation:**
   - Upon HR completion sign-off, an official verifiable certificate PDF is compiled automatically.
   - Certificates feature a unique verification ID, QR code, domain track, completion date, and official digital watermark.

---

## 6. Communications & Meetings

1. **In-App & Email Notifications:**
   - Automated system alerts for application status changes, task reviews, leave determinations, and company announcements.
   - Dispatched via server-side mailer and logged in the notifications table.
2. **Google Meet Integration:**
   - Team Leaders and HR staff can generate real Google Meet links for sync meetings and domain reviews.
   - Created via server-to-server Google Calendar API integration.

---

## 7. Data Privacy, Retention & Deletion Safeguards

1. **Founder-Only Permanent Deletion:**
   - Deletion of user accounts, audit trails, or institutional records is strictly restricted to the `founder`.
   - All standard delete operations perform soft deletion (`deleted_at IS NOT NULL`).
2. **Fresh Database Foundation:**
   - No legacy Firestore documents will be imported into MySQL.
   - IntelliCore 2.0.0 starts with a clean relational database.

## Phase 06 tasks, learning and performance

A task definition has a separate assignment per eligible internship. Authorize individual and department recipients, preserve prior submissions and evaluations, and audit changes to deadlines, recipients and lifecycle. Assess the latest submitted version using its original deadline and rubric. Approved work alone reaches completed status. Late work can be submitted while a task remains published and active. Scores and lesson completion never advance attendance, leave, a Daily Work Report or internship completion.

Preserve original practice exercises and rubric points. Published curriculum versions remain accessible to their historical eligible enrollments. Lessons are self-reported progress. Review outcomes and scoring use authorized reviewer decisions. Performance reports expose the recorded denominators and feedback only within approved scope. [Tasks](TASK_MANAGEMENT.md) · [Learning](LEARNING_MANAGEMENT.md) · [Performance](PERFORMANCE_EVALUATION.md).

