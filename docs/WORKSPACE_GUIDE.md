# IntelliCore V2.0 — Unified Workspace Guide

## 1. Introduction & Architecture

IntelliCore V2.0 unifies all application workspaces under a clean, responsive, modular frontend architecture using standard HTML5, CSS3, and modern Vanilla JavaScript (ES Modules). Workspaces operate under the same-origin modular monolith pattern, eliminating cross-origin API complexity and enforcing strict server-side RBAC and session security.

### Canonical Clean URL Routes & Aliases

The Express server serves four specialized workspace shells mapped to user roles with both modern clean routes and legacy path backward compatibility:

| Workspace Shell | Clean Dashboard Route | Role Aliases | Legacy Route |
| :--- | :--- | :--- | :--- |
| **Founder Command Center** | `/dashboards/founder` | `/dashboards/co-founder`<br>`/dashboards/admin`<br>`/cofounder-dashboard`<br>`/admin-dashboard` | `/founder-dashboard.html` |
| **HR Operations Dashboard** | `/dashboards/hr` | `/dashboards/hr-executive`<br>`/dashboards/operations`<br>`/hr-executive-dashboard`<br>`/operations-dashboard` | `/hr-dashboard.html` |
| **Team Leader Dashboard** | `/dashboards/team-leader` | `/tl-dashboard` | `/tl-dashboard.html` |
| **Intern Workspace** | `/dashboards/intern` | `/intern-dashboard` | `/Intern-dashboard.html` |

---

## 2. Shared Workspace Design & Navigation

All workspace shells follow a cohesive design system defined in `frontend/assets/css/variables.css` and `frontend/assets/css/dashboards.css`:

### 2.1 Workspace Structure
1. **Collapsible Sidebar**:
   - Organization branding: IntelliCore V2.0 logo and monogram.
   - User identity snippet: Full name, user avatar/initials, and active role label badge.
   - Semantic navigation menu: Section links with icons and active state indicators.
   - Dedicated Sidebar Logout button with confirmation modal.
2. **Topbar Navigation**:
   - Mobile hamburger menu toggle for viewports below 1024px.
   - Breadcrumb navigation indicating active section.
   - Active status indicator (e.g., `ACTIVE`, `PENDING`, `SUSPENDED`).
   - Quick action bar: Notifications drawer toggle, Theme toggle, and Topbar Logout button.
3. **Workspace Notice Banner (`icWorkspaceNotice`)**:
   - Dynamically injected alert container for state-aware lifecycle messages.
   - **Suspended Alert (Red)**: Warning of restricted account privileges with immediate contact options.
   - **Inactive Alert (Slate)**: Notification of account deactivation or unapproved status.
   - **Pending Review (Amber)**: Information on ongoing application or onboarding review.
4. **Metric Cards Grid**:
   - 100% database-backed metrics derived from MySQL aggregations. Mock and fabricated counters are strictly prohibited.
5. **Main Content Container**:
   - Section views switched dynamically without full-page reloads, preserving client state and scroll position.

### 2.2 Global Logout Architecture
All logout buttons across every shell (`logoutButton`, `topbarLogout`, `sidebarLogout`, `modalLogout`) are wired to a unified, resilient session termination flow in `frontend/assets/js/dashboard-auth.js` and `frontend/services/auth.js`:
1. Triggers Firebase `auth.signOut()`.
2. Clears client session storage, cached tokens, and role context.
3. Removes authorization headers from future fetch requests.
4. Deterministically redirects the browser to `/?auth=login` with a clean history state.

---

## 3. Workspace Shell Walkthroughs

### 3.1 Founder Command Center
- **Target Roles**: `FOUNDER`, `CO_FOUNDER`, `ADMIN`.
- **Primary Modules**:
  - **Executive Analytics**: Total registered users, active staff count, active intern roster, and recent audit activity count.
  - **Staff Management**: Provision new staff members with sequential `STF-XXXX` codes, assign departments, and manage employment status (`ACTIVE`, `SUSPENDED`, `TERMINATED`).
  - **Role & Permission Matrix**: Inspect 8 roles and 34 system permissions; assign non-Founder roles.
  - **Audit Logs Feed**: Immutable chronological trail of system events, logins, and status transitions with sanitized parameters.
  - **Department Overview**: Create and activate organizational departments, assign team leads.
- **Security Boundaries**:
  - Only the primary Founder (`ctrlabhishek@gmail.com`) can provision staff or approve staff promotion recommendations.
  - Founder actions require recent authentication within 5 minutes.

### 3.2 HR Operations Dashboard
- **Target Roles**: `HR_MANAGER`, `HR_EXECUTIVE`, `OPERATIONS_EXECUTIVE`.
- **Primary Modules**:
  - **Onboarding Review**: View incoming internship applications, inspect details, approve enrollments, or request applicant changes.
  - **Attendance Roster**: Real-time daily check-in status, late arrivals, missing check-outs, and Daily Work Report submissions.
  - **Leave & Correction Processing**: Approve or reject intern leave requests and attendance correction timestamp edits.
  - **Followup & Certificate Dispatch**: Review completed internships and record manual external dispatch declarations (`SENT`/`NOT_SENT`).
  - **Meetings & Calendar**: Schedule organizational and departmental meetings with format-validated Google Meet links or integrated Google Calendar.
- **Security Boundaries**:
  - Zero certificate document generation or download buttons exist in the UI.
  - Staff promotion recommendations must be submitted to the Founder for approval.

### 3.3 Team Leader Dashboard
- **Target Roles**: `TEAM_LEADER`.
- **Primary Modules**:
  - **My Department Roster**: View interns enrolled in the team leader's assigned department.
  - **Task Oversight**: Assign domain tasks, inspect versioned intern submissions, and submit structured evaluation reviews.
  - **Attendance Oversight**: Monitor daily check-ins and submit attendance corrections for department members.
  - **Department Meetings**: Schedule and host mentoring sessions and sprint syncs.
- **Security Boundaries**:
  - All views and APIs are strictly department-scoped. Cross-department records are invisible and return 403 Forbidden.
  - Deactivating a team leader's department assignment immediately revokes access to that department's records.

### 3.4 Intern Workspace
- **Target Roles**: `INTERN`.
- **Primary Modules**:
  - **Today's Attendance**: One-click check-in and explicit check-out with time tracking and status indicators.
  - **Daily Work Report (DWR)**: Structured submission of daily achievements, learning points, blockers, and next-day plans before 20:00 IST.
  - **Tasks & Assignments**: View track tasks, download assignment assets, and upload versioned submissions with notes.
  - **Curriculum & Learning Tracks**: Track lesson completion across enrolled domain tracks.
  - **Meeting Hub**: View scheduled team and company meetings with one-click access to Google Meet join links.
  - **Internship Status & Notice**: View enrollment status, duration, completion review status, and external certificate dispatch notice.
- **Security Boundaries**:
  - Strictly self-service: interns can only read and modify their own records.
  - No certificate downloads, PDF links, or verification URLs exist in the workspace.
