# IntelliCore REST API Specification

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

