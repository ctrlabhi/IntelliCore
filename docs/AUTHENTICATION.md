# IntelliCore Authentication Architecture & Identity Specification

**Version:** 2.0.0  
**Phase:** MASTER-PHASE-02B  
**Environment:** Local Development (intellicore-dev)  
**Date:** 2026-11-24  

---

## 1. Architectural Philosophy: Split-Plane Security

IntelliCore V2.0 employs a **split-plane authentication and authorization architecture**:
- **Authentication (Identity Verification)**: Delegated to Firebase Authentication (`intellicore-dev`). Firebase handles user identity verification, OAuth handshakes (Google Sign-In), password salting/hashing, session persistence, and email verification.
- **Authorization (Access Control & Permissions)**: Exclusively managed by MySQL 8.4 LTS via Prisma ORM. Roles, permissions, account lifecycles, and tenant memberships reside strictly within MySQL.
- **Rule of Isolation**: Firebase Custom Claims are **never** trusted as authoritative permissions. Frontend-supplied role values are completely discarded. The backend always resolves identity via Firebase ID tokens and validates permissions through MySQL relational tables.

---

## 2. Token Lifecycle & Transport

```
+---------------+        1. ID Token (OAuth/Email)       +---------------------+
| Web Browser / | -------------------------------------> | Firebase Auth Cloud |
| Client SDK    | <------------------------------------- |  (intellicore-dev)  |
+---------------+              ID Token JWT              +---------------------+
        |
        | 2. Authorization: Bearer <ID_TOKEN>
        v
+-------------------------------------------------------------------------------+
| Express.js Backend (port 3000)                                                |
|                                                                               |
|  [authenticate middleware]                                                    |
|    - Validates Bearer token format                                            |
|    - Calls Firebase Admin SDK (firebaseService.verifyIdToken)                 |
|    - Enforces aud == 'intellicore-dev' (rejects foreign projects)             |
|    - Resolves MySQL User by firebase_uid                                      |
|    - Loads Profile, UserRoles, and Permissions                                |
|    - Injects req.user, req.profile, req.roles, req.permissions                |
|                                                                               |
|  [requireStatus middleware]                                                   |
|    - Enforces status == 'ACTIVE' (rejects PENDING, SUSPENDED, REJECTED)       |
|                                                                               |
|  [requireRole / requirePermission]                                            |
|    - Evaluates server-side RBAC matrix                                        |
+-------------------------------------------------------------------------------+
```

---

## 3. Account Lifecycle State Machine

Each user in MySQL has a discrete `status` column governed by `enum AccountStatus`:

```
                       +---------------------------------------+
                       |   New User Self-Registration / OAuth  |
                       +---------------------------------------+
                                           |
                                           v
                       +---------------------------------------+
                       |               PENDING                 |
                       |  - Restricted to onboarding shell     |
                       |  - Cannot access active workspaces    |
                       |  - Cannot execute staff operations    |
                       +---------------------------------------+
                                      /        \
                    (HR Approval)    /          \    (HR Rejection)
                                    v            v
           +---------------------------+      +---------------------------+
           |          ACTIVE           |      |         REJECTED          |
           |  - Full workspace access  |      |  - Explicit 403 response  |
           |  - Authorized operations  |      |  - Account deactivated    |
           +---------------------------+      +---------------------------+
                    |                 |
     (Admin Action) |                 | (Administrative Suspension)
                    v                 v
           +-------------------+   +--------------------+
           |     INACTIVE      |   |     SUSPENDED      |
           |  - Offboarded     |   |  - Access Revoked  |
           +-------------------+   +--------------------+
```

> [!IMPORTANT]
> **Subsequent Authentication Invariant**: Subsequent `POST /api/v1/auth/bootstrap` calls update `last_login_at` and `email_verified` but **never** overwrite or escalate an existing user's `status` or `roles`. A `SUSPENDED` or `REJECTED` user cannot self-activate by logging in again.

---

## 4. API Endpoints Reference

### 1. `POST /api/v1/auth/bootstrap`
- **Security:** Requires valid Firebase ID token in `Authorization: Bearer <token>`.
- **Purpose:** Synchronizes authenticated identity into MySQL.
- **Payload (Optional):** `{ "fullName": "string", "photoUrl": "string" }`
- **Behavior:**
  - If new user: Creates record in `users` with `status: PENDING`, assigns `INTERN` role, creates `profiles` record.
  - If existing user: Updates `last_login_at` and `email_verified`.
  - Collision check: Throws HTTP 409 `EMAIL_ALREADY_REGISTERED` if email is claimed by a different Firebase UID.

### 2. `GET /api/v1/auth/me`
- **Security:** `authenticate` + `requireAuth`.
- **Response:** Current user identity, sanitized profile, assigned roles, permissions list, and workspace authorization flags.

### 3. `GET /api/v1/auth/status`
- **Security:** `authenticate` + `requireAuth`.
- **Response:** Access authorization summary: `{ status, emailVerified, roles, workspaces, isAccessGranted }`.

### 4. `PATCH /api/v1/users/me/profile`
- **Security:** `authenticate` + `requireAuth`.
- **Validation:** Zod `.strict()` schema. Permits only: `fullName`, `displayName`, `profilePhotoUrl`.
- **Mass Assignment Protection:** Rejects any attempt to modify `id`, `firebaseUid`, `email`, `status`, `role`, or `permissions` with HTTP 400 `VALIDATION_ERROR`.

---

## 5. Security & Rate Limiting Controls

1. **Project ID Allowlist**: Enforces `token.aud === 'intellicore-dev'`. Tokens issued for `intellicore-229` or arbitrary projects return HTTP 403 `WRONG_PROJECT`.
2. **Credential Mount**: Mounted read-only at `/run/secrets/firebase-admin-dev.json:ro`. File permissions restricted.
3. **Rate Limiting**: Configured globally with `express-rate-limit` (100 requests per 15-minute window per IP).
4. **Token Revocation Check**: Tokens verified with Firebase Admin SDK handle revoked/disabled accounts properly.
