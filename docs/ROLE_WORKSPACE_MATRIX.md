# IntelliCore V2.0 — Role & Workspace Matrix

## Executive Overview

IntelliCore V2.0 enforces deterministic, role-aware, and lifecycle-aware routing and workspace access across all eight system roles and 13 distinct account and enrollment lifecycle states. Security guards operate server-side at the route, controller, and database transaction layers, while frontend shells dynamically adapt navigation, UI panels, metrics, and action controls based on verified MySQL user state and permissions.

---

## 1. System Roles Directory

IntelliCore defines eight distinct RBAC roles stored in the MySQL relational database:

| Role Identifier | Role Label | Primary Workspace Shell | Canonical Clean Route | Scope & Mandate |
| :--- | :--- | :--- | :--- | :--- |
| `FOUNDER` | Founder · Super Admin | Founder Command Center | `/dashboards/founder` | Complete organizational governance, system settings, staff role creation & promotion provisioning, immutable audit access. |
| `CO_FOUNDER` | Co-Founder · Executive | Founder Command Center | `/dashboards/co-founder` | Executive administrative oversight, departmental monitoring, meeting management, staff promotion review. |
| `ADMIN` | System Administrator | Founder Command Center | `/dashboards/admin` | User status management, RBAC matrix configuration, system diagnostics, audit log inspection. |
| `HR_MANAGER` | HR Operations Manager | HR Operations Dashboard | `/dashboards/hr` | Complete intern lifecycle management, onboarding review, attendance policies, leave approvals, extension/promotion recommendations. |
| `HR_EXECUTIVE` | HR Operations Specialist | HR Operations Dashboard | `/dashboards/hr-executive` | Day-to-day applicant review, attendance tracking, correction processing, manual certificate dispatch declarations. |
| `OPERATIONS_EXECUTIVE` | Operations Specialist | HR Operations Dashboard | `/dashboards/operations` | Departmental logistics, attendance audits, meeting coordination, operational analytics. |
| `TEAM_LEADER` | Team Lead / Mentor | Team Leader Dashboard | `/dashboards/team-leader` | Strictly department-scoped intern mentorship, task assignments, submission reviews, curriculum guidance, team meetings. |
| `INTERN` | Intern Member | Intern Workspace | `/dashboards/intern` | Self-service attendance check-in/out, daily work reports, task submissions, meeting participation, learning track progress. |

---

## 2. Account & Enrollment Lifecycle States

The routing engine evaluates 13 distinct lifecycle states to resolve access deterministically:

| Lifecycle State | Description | API Access Gate | Workspace Resolution | UI Notice / Banner |
| :--- | :--- | :--- | :--- | :--- |
| `UNAUTHENTICATED` | Visitor without active Firebase session. | Public routes only | Redirects to `/?auth=login` or public home. | Login modal triggered. |
| `UNVERIFIED_EMAIL` | Firebase user authenticated but email not verified. | Blocked with 403 `EMAIL_VERIFICATION_REQUIRED` | Blocked at login | Email verification modal. |
| `PENDING_ONBOARDING` | Intern registration submitted; pending HR approval. | Scoped to own application reads & edits | `/dashboards/intern` | Amber Banner: "Application Under Review". |
| `CHANGES_REQUESTED` | HR requested edits to application. | Scoped to own application update | `/dashboards/intern` | Amber Banner: "Action Required: Update Application". |
| `APPROVED_FUTURE` | Application approved; start date is in the future. | Scoped to own profile | `/dashboards/intern` | Blue Banner: "Enrollment Approved. Starts on [Date]". |
| `ONGOING` | Active verified intern within valid enrollment dates. | Full intern API permissions | `/dashboards/intern` | Green Badge: "Active Internship" + Live metrics. |
| `COMPLETION_REVIEW` | Required duration met; pending final HR sign-off. | Read-only tasks & reports | `/dashboards/intern` | Purple Banner: "Under Completion Review". |
| `COMPLETED` | Internship approved and marked completed. | Historical read-only access | `/dashboards/intern` | Emerald Banner: "Internship Successfully Completed". |
| `EXTENDED` | Active extension (date update or continuation). | Full active intern permissions | `/dashboards/intern` | Blue Banner: "Extended Period Active". |
| `PROMOTED` | Promoted to staff role or non-privileged intern title. | Role-dependent permissions | Target staff or intern workspace | Role-specific title badge. |
| `ACTIVE_STAFF` | Provisioned staff member in active status. | Role & permission gates | Target staff dashboard | Staff designation badge & active controls. |
| `SUSPENDED` | Account suspended by Administrator or Founder. | Blocked with 403 `ACCOUNT_STATUS_RESTRICTED` | Blocked / Read-only notice | Red Banner: "Account Suspended. Contact HR/Admin". |
| `INACTIVE_REJECTED` | Application rejected or account deactivated. | Blocked with 403 `ACCOUNT_STATUS_RESTRICTED` | Blocked / Notice | Slate Banner: "Account Inactive". |

---

## 3. Role-Workspace Access & Permission Matrix

| Workspace Section / Feature | FOUNDER | CO_FOUNDER | ADMIN | HR_MANAGER | HR_EXECUTIVE | OPERATIONS_EXEC | TEAM_LEADER | INTERN |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **System Settings & Grants** | ✅ Full | ❌ Blocked | ❌ Blocked | ❌ Blocked | ❌ Blocked | ❌ Blocked | ❌ Blocked | ❌ Blocked |
| **Staff Role Provisioning** | ✅ Solo | ❌ Blocked | ❌ Blocked | ❌ Blocked | ❌ Blocked | ❌ Blocked | ❌ Blocked | ❌ Blocked |
| **Staff Promotion Approval** | ✅ Solo | ✅ Dual | ❌ Blocked | ❌ Blocked | ❌ Blocked | ❌ Blocked | ❌ Blocked | ❌ Blocked |
| **Role & Permission Matrix** | ✅ Read/Write | ✅ Read | ✅ Read/Write | ❌ Blocked | ❌ Blocked | ❌ Blocked | ❌ Blocked | ❌ Blocked |
| **Audit Log Inspection** | ✅ Full Org | ✅ Full Org | ✅ Full Org | ❌ Blocked | ❌ Blocked | ❌ Blocked | ❌ Blocked | ❌ Blocked |
| **User Status Management** | ✅ Full Org | ✅ Full Org | ✅ Full Org | ❌ Blocked | ❌ Blocked | ❌ Blocked | ❌ Blocked | ❌ Blocked |
| **Department Management** | ✅ Org-wide | ✅ Org-wide | ✅ Org-wide | ✅ Read/Manage | ✅ Read | ✅ Read | ❌ Scoped Only | ❌ Scoped Only |
| **Staff Directory** | ✅ Read/Write | ✅ Read/Write | ✅ Read/Write | ✅ Read/Write | ✅ Read | ✅ Read | ❌ Blocked | ❌ Blocked |
| **Onboarding Application Review** | ✅ Org-wide | ✅ Org-wide | ❌ Blocked | ✅ Full Org | ✅ Full Org | ✅ Org Read | ❌ Blocked | ❌ Own Only |
| **Attendance Policies & Roster** | ✅ Org-wide | ✅ Org-wide | ❌ Blocked | ✅ Full Org | ✅ Full Org | ✅ Org Read | ❌ Dept-Scoped | ❌ Own Only |
| **Attendance Corrections & Leave** | ✅ Org-wide | ✅ Org-wide | ❌ Blocked | ✅ Full Org | ✅ Full Org | ❌ Blocked | ❌ Dept Review | ❌ Own Requests |
| **Task & Review Management** | ✅ Org-wide | ✅ Org-wide | ❌ Blocked | ✅ Org-wide | ✅ Org-wide | ❌ Blocked | ✅ Dept-Scoped | ❌ Own Submissions |
| **Curriculum Track Authoring** | ✅ Org-wide | ✅ Org-wide | ❌ Blocked | ✅ Org-wide | ❌ Blocked | ❌ Blocked | ❌ Blocked | ❌ Own Enrolled |
| **Meeting Scheduling** | ✅ Org-wide | ✅ Org-wide | ❌ Blocked | ✅ Org-wide | ✅ Org-wide | ✅ Org-wide | ✅ Dept-Scoped | ❌ Invitee Only |
| **Certificate Dispatch Decl.** | ✅ Org-wide | ✅ Org-wide | ❌ Blocked | ✅ Org-wide | ✅ Org-wide | ❌ Blocked | ❌ Blocked | ❌ Notice Only |
| **Certificate File / PDF Actions** | 🚫 ZERO | 🚫 ZERO | 🚫 ZERO | 🚫 ZERO | 🚫 ZERO | 🚫 ZERO | 🚫 ZERO | 🚫 ZERO |

---

## 4. Mandatory Security Boundaries & Anti-Patterns

1. **Strict Negative Certificate Boundary**:
   - Zero certificate generation, PDF rendering, file uploads, file downloads, QR codes, verification endpoints, or automated email outbox entries exist anywhere in the application.
   - Any HTTP request to `/api/v1/certificates/*` or `/certificates/*` returns HTTP 404 Not Found.
   - Dispatch declarations are purely human audited records (`SENT`/`NOT_SENT`) that trigger an atomic in-app notification to the intern.

2. **Cross-Department Isolation**:
   - Team Leaders are strictly constrained to their active assigned department. Any attempt to inspect, assign, or review interns from other departments is rejected with HTTP 403 Forbidden.
   - Revoking a Team Leader's department membership immediately terminates their operational scope on that department.

3. **Founder Privilege Protection**:
   - Primary Founder (`ctrlabhishek@gmail.com`) status and roles cannot be modified or demoted via API.
   - Staff creation and promotion provisioning strictly require the primary Founder identity with recent authentication within 5 minutes (`RECENT_AUTHENTICATION_REQUIRED`).
