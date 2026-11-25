# IntelliCore REST API Specification

## Phase 07 notifications, announcements and delivery

The endpoints use the standard response envelope and explicit Firebase/MySQL authorization.

| Group under `/api/v1` | Contracts |
| --- | --- |
| `/notifications` | GET own paginated list, unread count and detail. POST own read, archive and read-all. State, category and search filters are supported. |
| `/notification-preferences/me` | GET and PATCH optional own email, reminder, learning and announcement alerts. |
| `/announcements` | GET own received list and detail, scoped management list/detail, and authorized eligible recipients. POST draft, audience preview, publish, schedule, cancel and archive. PATCH editable draft revision. |
| `/admin/email-outbox` | GET sanitized list, detail, local capture preview and attempts. POST audited retry or cancel under the operational grant. |
| `/admin/notification-stats` and `/admin/notification-worker` | GET actual delivery-state counts and heartbeat, PATCH audited reminder windows. |
| `/task-submissions/:id/review` | GET amendment history under `/amendments` and POST a revision-checked score amendment under `/amend`. |
| `/learning/enrollments/:id` | GET scoped progress detail and POST `/lessons/:lessonId/correct`. Own detail uses `/learning/me/enrollments/:id`. |

Preview fingerprints and draft revisions protect publication. Ambiguous SMTP retry requires explicit acknowledgment. Details and strict field schemas are in [Phase 07 OpenAPI](../backend/src/config/phase07OpenApi.js).

**Base URL:** `http://localhost:3000/api/v1`  
**Interactive Documentation (Swagger UI):** `http://localhost:3000/api-docs`  
**OpenAPI Specification:** OpenAPI 3.0.3  

---

## 1. Response Envelope Format

All API responses follow a uniform, predictable JSON envelope.

### 1.1 Success Response Schema
```json
{
  "success": true,
  "data": { ... },
  "message": "Optional operational summary message",
  "requestId": "f81d4fae-7dec-11d0-a765-00a0c91e6bf6",
  "timestamp": "2026-11-24T07:30:00.000Z"
}
```

### 1.2 Error Response Schema
```json
{
  "success": false,
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "The requested resource could not be found."
  },
  "requestId": "f81d4fae-7dec-11d0-a765-00a0c91e6bf6",
  "timestamp": "2026-11-24T07:30:00.000Z"
}
```

---

## 2. Implemented Phase 1 Endpoints

### 2.1 `GET /health`
- **Summary:** Fast application liveness probe.
- **Description:** Verifies that the Node.js Express process is active and accepting connections.
- **Response:** HTTP 200 OK
```json
{
  "status": "UP",
  "service": "intellicore-api",
  "version": "2.0.0",
  "timestamp": "2026-11-24T07:30:00.000Z"
}
```

### 2.2 `GET /ready`
- **Summary:** Infrastructure readiness probe.
- **Description:** Executes an active query (`SELECT 1`) against MySQL via Prisma to verify database connectivity.
- **Success Response:** HTTP 200 OK
```json
{
  "status": "READY",
  "database": "CONNECTED",
  "timestamp": "2026-11-24T07:30:00.000Z"
}
```
- **Failure Response (Database Unavailable):** HTTP 503 Service Unavailable
```json
{
  "status": "NOT_READY",
  "database": "DISCONNECTED",
  "timestamp": "2026-11-24T07:30:00.000Z"
}
```

### 2.3 `GET /api/v1`
- **Summary:** API version root metadata.
- **Description:** Returns API version, documentation link, and available system capabilities.
- **Response:** HTTP 200 OK
```json
{
  "success": true,
  "data": {
    "api": "IntelliCore REST API",
    "version": "v1",
    "environment": "development",
    "docs": "/api-docs"
  },
  "requestId": "...",
  "timestamp": "..."
}
```

### 2.4 `GET /api/v1/health`
- **Summary:** Versioned API health diagnostic.
- **Description:** Detailed health status including process uptime, memory usage, and database state.
- **Response:** HTTP 200 OK

---

## 3. Swagger & OpenAPI Documentation

Interactive Swagger documentation is served directly from the application at:
- **`http://localhost:3000/api-docs`**

The specification documents only implemented endpoints. Planned business modules will be added as they are developed in future phases.

## Phase 04 departments, applications and internships

These operations use the development Firebase Bearer token and require a verified email. Protected administration also requires an active MySQL account. The primary Founder is identified by the MySQL role and the configured Founder identity. IDs in the Phase 04 paths are UUIDs. Lists return `data.items` and `data.pagination` with `total`, `page`, `limit` and `totalPages`.

| Method and path under `/api/v1` | Purpose and access |
| --- | --- |
| `GET /departments`, `GET /departments/:id` | Minimal active catalog for verified pending and active accounts. The primary Founder can read inactive records with `includeInactive=true` on the list. Team Leaders can use `assigned=true` for their active assignments. |
| `POST /departments`, `PATCH /departments/:id`, `PATCH /departments/:id/status` | Primary Founder creates, edits or changes `isActive`. Creation requires `name`, unique `code` and unique `slug`. |
| `GET /departments/:id/staff`, `PUT /departments/:id/staff` | Primary Founder reads and upserts assignments with `userId`, `assignedRole` (`STAFF` or `TEAM_LEADER`), and `isActive`. Authorized internship managers can use `leadersOnly=true` for the eligible leader picker. |
| `GET /internship-applications/me`, `GET /internship-applications/:id` | Own applicant records. Authorized reviewers and readers can access organization-wide detail. |
| `GET /internship-applications` | Active Founder, Co-Founder, Admin, HR Manager or HR Executive with `applications:read_all`. |
| `POST /internship-applications`, `PATCH /internship-applications/:id` | Eligible intern creates an own draft or edits an own draft or requested revision. Required on creation are `departmentId`, `requestedStartDate`, `durationMonths` (1, 2, 3 or 6), `qualification`, and `institution`. Other fields are in OpenAPI. |
| `POST /internship-applications/:id/submit`, `POST /internship-applications/:id/withdraw` | Applicant submits a draft or revised application, or withdraws an open application. |
| `POST /internship-applications/:id/request-changes`, `POST /internship-applications/:id/reject` | Founder, Co-Founder or HR Manager with `applications:review` reviews a submitted application. Requires `remarks`. |
| `POST /internship-applications/:id/approve` | Same reviewer scope. Send `positionTitle`, `commencementDate`, optional `expectedCompletionDate`, `departmentId`, `assignedTeamLeaderId` and `remarks`. An omitted completion date uses the requested calendar-month duration. |
| `GET /internships/me`, `GET /internships`, `GET /internships/:id` | Lists own enrollments or reads within own, department or organization scope. Team Leader access requires an active department assignment and active Team Leader account. |
| `PATCH /internships/:id`, `PUT /internships/:id/team-leader` | Authorized managers update open enrollment title and dates, or assign/clear an eligible Team Leader with `assignedTeamLeaderId`. Commencement date is locked once ongoing. |
| `POST /internships/:id/request-completion`, `POST /internships/:id/approve-completion` | Owner or manager can record a due completion review. Authorized managers with `internships:approve_completion` manually approve it and can supply `actualCompletionDate`. |
| `POST /internships/:id/terminate`, `POST /internships/:id/withdraw` | Managers terminate with `reason`. An owner or manager can withdraw an open enrollment with `reason`. |
| `GET /admin/stats` | Existing analytics access, with MySQL department and per-department enrollment counts, application counts by status, and effective enrollment counts by status. |

List filters include `search`, `page` and `limit`. Application and enrollment lists accept `departmentId` and `status`. Enrollment lists also accept `teamLeaderId`, `commencementFrom` and `completionThrough`. Dates are `YYYY-MM-DD` business dates in Asia/Kolkata. Creation returns 201. Validation returns 400, unauthenticated requests return 401, denied actions return 403, out-of-scope details return 404, and duplicates or invalid transitions return 409. [OpenAPI definitions](../backend/src/config/phase04OpenApi.js).

## Phase 05 attendance, leave and work reports

Calls require verified development Firebase identity and active MySQL account state. Self routes derive the user from auth. All dates are IST business dates in `YYYY-MM-DD` format. Timestamp proposals require an explicit UTC offset. JSON lists return `items` and `pagination`. CSV uses `text/csv`.

| Paths under `/api/v1` | Methods and scope |
| --- | --- |
| `/attendance/check-in`, `/attendance/check-out` | `POST`, empty body, active intern. Check-in records the server time in an eligible working window and provides a server opening time for early dashboard access. Checkout records an explicit same-IST-date event. Both are idempotent. |
| `/attendance/me/today`, `/attendance/me`, `/attendance/me/summary` | `GET`, current own state, bounded history and summary. Live state, primary classification and independent flags are distinct fields. |
| `/attendance`, `/attendance/summary`, `/attendance/:id` | `GET`, scoped list, aggregate and persisted record detail. Team Leaders are restricted to current assigned departments. Interns can read their own detail. |
| `/attendance/export` | `GET`, approved Founder/HR scope, formula-safe CSV. |
| `/attendance/policies` | `GET`, `POST`, primary Founder. Create an immutable future version with `name` and `effectiveFrom`, retaining approved schedule semantics. |
| `/daily-work-reports/me/today` | `GET` current draft/submission; `PUT` save draft fields. Date and eligibility are determined on the server. |
| `/daily-work-reports/me/today/submit` | `POST`, empty body, submit a complete current-day draft before 20:00 IST. |
| `/daily-work-reports/me`, `/daily-work-reports`, `/daily-work-reports/:id` | `GET`, own history, authorized submitted report lists, and scoped report detail. |
| `/daily-work-reports/:id/review` | `POST`, authorized Founder/HR review with `remarks`. |
| `/leave-requests/me`, `/leave-requests/me/:id`, `/leave-requests`, `/leave-requests/:id` | `GET` own history/details or authorized staff list/detail. Detail shows whether activity requires reconciliation. |
| `/leave-requests` | `POST`, own `internshipId`, `leaveType`, `startDate`, `endDate`, and `reason`. |
| `/leave-requests/:id/cancel`, `/approve`, `/reject` | `POST` to full record path with action suffix. Cancellation is owner-only with empty body. Founder/HR review requires `remarks`. Explicit `reconcileActivity: true` is required for approval when timestamps exist. |
| `/attendance-corrections/me`, `/attendance-corrections/me/:id`, `/attendance-corrections`, `/attendance-corrections/:id` | `GET`, own or authorized reviewer list and detail. |
| `/attendance-corrections` | `POST`, own `internshipId`, `businessDate`, `reason` and `kind`. `TIMESTAMPS` proposes check-in or checkout in `proposedChanges`; `LATE_REPORT` proposes all five report fields under `proposedChanges`. |
| `/attendance-corrections/:id/approve`, `/attendance-corrections/:id/reject` | `POST`, authorized Founder/HR review with `remarks` and an atomic audit decision. |

Lists accept validated `from`, `to`, `internshipId`, `departmentId`, `search`, `status`, `page` and `limit` as applicable. Attendance also accepts `sort` as `asc` or `desc`. Leave adds `leaveType`. Attendance ranges support 31 days, summary and export support at most 250 enrollments, and a leave request may cover up to 90 calendar days. REST errors use the standard envelope. [Phase 05 OpenAPI](../backend/src/config/phase05OpenApi.js).

## Phase 06 tasks, learning and performance

Routes below are under `/api/v1`. Requests require an active account, verified Firebase identity and MySQL authorization. JSON responses use the standard envelope. Binary downloads send file bytes.

| Resource | Contracts |
| --- | --- |
| `/tasks` | GET directory, POST draft. GET templates and eligible recipients by department. GET/PATCH by ID. POST preview, publish, close, cancel and archive. GET/POST assignments by task ID and POST attachments on drafts. |
| `/task-assignments` | GET staff list, own `/me` or scoped detail. POST start, extend or cancel with the applicable ownership, confirmation and scope. GET submission history and POST an own draft under the assignment. |
| `/task-submissions` | GET a scoped version, PATCH the current draft, POST submit, POST attachment, GET reviews, POST review on current submitted work. |
| `/attachments/:id/download` | GET one authorized attachment as private, no-store bytes. |
| `/learning/tracks` | GET list or detail, POST draft, PATCH draft, POST versions, publish, archive and enrollments. POST/PATCH nested modules, lessons and link resources. DELETE draft links. |
| `/learning` | GET eligible recipients or staff progress. POST `/me/sync` for own eligible enrollment. GET `/me` and `/me/progress`. POST lesson start or complete with the permitted enrollment ID. |
| `/performance` | GET own metrics, scoped internship history, department details or summary. Accepts inclusive IST dates and paginated lists. |

Publish and add-recipient requests use the `revision` and `previewToken` from the latest recipient preview. Submitted versions retain their original deadline and rubric. Stale or invalid state transitions return 409. Upload one binary file per request with `Content-Type: application/octet-stream`, `X-Attachment-Name` as the percent-encoded filename and `X-Expected-Revision` as the draft revision. Oversize and unsupported content return 413 and 415. See [OpenAPI definitions](../backend/src/config/phase06OpenApi.js) and [file storage](FILE_STORAGE.md).

## Phase 08 meetings and internship follow-up

See the concrete Phase 08 request and response contracts in local Swagger at `/api-docs/`. All paths use `/api/v1`.

- `/meetings` lists managed meetings and creates drafts. `/meetings/me` lists own invitations. Managed detail and participant endpoints use current resource scope. Meeting actions preview an audience, schedule, reschedule, cancel, complete, respond, join and retry provider synchronization.
- `/calendar/connection`, `/calendar/connect` and `/calendar/disconnect` expose the configured organizer's connection controls. The browser callback requires one-time state and the same user-agent cookie.
- `/internships/followups/completed` supports the current dispatch status filter. On `/internships/:id`, use `certificate-email-status`, `extensions` and `promotions` histories and explicit state-transition routes.
- `/promotions` provides a scoped recommendation list. Decisions use approve, reject, cancel and provision actions. Provisioning requires an approved recommendation, effective date and recent authentication of the primary Founder.
