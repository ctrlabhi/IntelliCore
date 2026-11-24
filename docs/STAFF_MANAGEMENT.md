# Staff Management & Administrative Delegation Architecture

**Version:** 2.0.0  
**Status:** Implemented & Verified (Phase 03)  
**Database Tables:** `staff_profiles`, `audit_logs`, `users`, `user_roles`, `roles`

---

## 1. Overview & Data Model

Staff Management in IntelliCore V2.0 operates strictly on MySQL via Prisma ORM and Express REST APIs. Staff members are created by provisioning an existing registered user account into the `staff_profiles` table, generating a sequential staff code (`STF-XXXX`), setting employment status to `ACTIVE`, ensuring account status is `ACTIVE`, and atomically assigning one of the authorized staff roles (`HR_MANAGER`, `HR_EXECUTIVE`, `OPERATIONS_EXECUTIVE`, `TEAM_LEADER`).

### Schema Definition (`prisma/schema.prisma`)
```prisma
enum StaffEmploymentStatus {
  ACTIVE
  SUSPENDED
  INACTIVE
}

model StaffProfile {
  id               String                @id @default(uuid()) @db.VarChar(36)
  userId           String                @unique @map("user_id") @db.VarChar(36)
  staffCode        String                @unique @map("staff_code") @db.VarChar(50)
  designation      String                @db.VarChar(100)
  joiningDate      DateTime              @map("joining_date")
  employmentStatus StaffEmploymentStatus @default(ACTIVE) @map("employment_status")
  createdBy        String?               @map("created_by") @db.VarChar(36)
  createdAt        DateTime              @default(now()) @map("created_at")
  updatedAt        DateTime              @updatedAt @map("updated_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([employmentStatus])
  @@map("staff_profiles")
}
```

---

## 2. Staff Code Generation Strategy

To ensure zero collisions and clean sequential identifiers, `staffCode` generation executes inside an atomic transaction:
1. Queries the latest `staffCode` with prefix `STF-`.
2. Extracts numeric suffix: e.g. `STF-0001` -> `1`.
3. Increments integer by 1 and zero-pads to 4 digits: `STF-0002`.
4. Stored under unique index on `staff_profiles(staff_code)`.

---

## 3. Provisioning Workflow (`POST /api/v1/staff`)

1. **Authorization Gate:**
   - Requires valid JWT token (`authenticate`).
   - Requires synchronized active user account (`requireAuth`, `requireStatus(['ACTIVE'])`).
   - Requires `staff:create` permission (held by `FOUNDER` and `CO_FOUNDER`).

2. **Validation:**
   - `userId`: Target user must exist in `users`.
   - `staffProfile`: Target user must not already have an existing staff profile (HTTP 409 `STAFF_ALREADY_EXISTS`).
   - `designation`: String (minimum 2 characters).
   - `joiningDate`: Valid ISO date string.
   - `roleCode`: Restricted to `['HR_MANAGER', 'HR_EXECUTIVE', 'OPERATIONS_EXECUTIVE', 'TEAM_LEADER']`.

3. **Atomic Transaction:**
   - Generates sequential `staffCode`.
   - Inserts record into `staff_profiles`.
   - Ensures `users.status = ACTIVE`.
   - Assigns role to `user_roles`.
   - Cleans up inappropriate default `INTERN` role.
   - Appends audit entry into `audit_logs` table (`action: 'STAFF_PROVISIONED'`).

---

## 4. Security & Privilege Escalation Guardrails

1. **Founder Demotion Protection:**
   - `FOUNDER` account status can never be set to `SUSPENDED`, `INACTIVE`, or `REJECTED` via API.
   - `FOUNDER` role cannot be assigned via the HTTP REST API (strictly prohibited with HTTP 403 `CANNOT_ASSIGN_FOUNDER_ROLE`).

2. **Self-Suspension Protection:**
   - An administrator or staff member cannot suspend or deactivate their own user account or staff employment status (HTTP 400 `CANNOT_SELF_DEACTIVATE`).

3. **Status Synchronization:**
   - Toggling `staff_profiles.employmentStatus` to `SUSPENDED` automatically synchronizes `users.status = SUSPENDED`, immediately restricting workspace and API access across the board.

---

## 5. Audit Logging Architecture (`audit_logs`)

Every mutating administrative operation (`USER_STATUS_UPDATED`, `STAFF_PROVISIONED`, `STAFF_UPDATED`, `STAFF_STATUS_UPDATED`, `USER_ROLES_UPDATED`, `ROLE_PERMISSIONS_UPDATED`) automatically writes an immutable log entry:
- `actorUserId`: UUID of the authenticated actor.
- `action`: Specific action code.
- `resourceType`: Entity type (`USER`, `STAFF_PROFILE`, `USER_ROLE`, etc.).
- `resourceId`: Identifier of affected resource.
- `sanitizedBefore` / `sanitizedAfter`: JSON snapshots with all passwords, tokens, and secrets automatically redacted.
- `requestId`: Distributed tracing UUID matching `X-Request-Id`.
- `result`: Outcome (`SUCCESS` or `FAILURE`).
