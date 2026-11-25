# Account deletion architecture & operational guide

## 1. Overview

IntelliCore V2.0 provides an audited, Founder-only permanent account deletion workflow. The implementation satisfies strict data privacy requirements (GDPR/Right to Erasure) while preserving organizational operational history (shared meetings, rubric evaluations, task assignments, and audit logs).

---

## 2. Security Guardrails

Permanent account deletion is subject to four mandatory server-side controls:

1. **Role Ceiling**:
   - Only the primary authenticated Founder can preview or execute permanent deletion (`requirePrimaryFounder`).
   - Co-Founders, Admins, and HR Managers receive HTTP 403 Forbidden.

2. **Protection of Founder Accounts**:
   - Self-deletion by the authenticated Founder is strictly prohibited.
   - Any attempt to delete the primary Founder account (`ctrlabhishek@gmail.com`) is rejected with HTTP 403.

3. **Confirmation Text Requirement**:
   - Exact string `'PERMANENTLY DELETE'` must be provided in the request body. Case-insensitive or partial matches are rejected with HTTP 400.

4. **Preview Hash & Freshness Window**:
   - Deletion must be preceded by generating a preview.
   - A SHA-256 preview hash binds the target identity, record impact breakdown, and timestamp.
   - Previews older than 15 minutes are rejected as stale (`STALE_PREVIEW`), requiring regeneration.

5. **Recent Authentication**:
   - Requires verified Firebase ID token issued within the last 15 minutes (`assertRecentAuthentication`).

---

## 3. Two-Phase Execution Workflow

### Phase 1: Deletion Impact Preview
`POST /api/v1/users/:id/deletion-preview` (also accessible via `GET`)

Returns:
- User identity summary (`id`, `email`, `fullName`, `roles`).
- Quantitative impact breakdown (applications, internships, attendance, daily reports, tasks, private files, enrollments).
- Shared organizational assets to be preserved (shared tasks, meetings, reviewed reports, reviewed leaves).
- Cryptographic `previewHash` and ISO timestamp.
- Explicit confirmation requirement instructions.

### Phase 2: Permanent Deletion Execution
`POST /api/v1/users/:id/permanent-deletion`

Request body:
```json
{
  "confirmationText": "PERMANENTLY DELETE",
  "reason": "Administrative deletion request per owner directive",
  "previewHash": "<sha256-hash>",
  "previewTimestamp": "2026-11-25T12:00:00.000Z"
}
```

Transactional Steps:
1. Revoke Firebase refresh tokens immediately (`revokeRefreshTokens`).
2. Unlink and permanently delete physical private file attachments from disk storage (`storage.removePrivate`).
3. Reassign ownership of shared records (tasks, meetings, reviews, certificate dispatches) to the acting Founder.
4. Anonymize reviewer foreign keys on daily reports, leaves, and attendance corrections.
5. Transactionally delete user's internship records and direct personal rows.
6. Delete User row from MySQL.
7. Record sanitized audit entry (`USER_PERMANENT_DELETION`).
8. Delete user from Firebase Authentication (`firebaseService.deleteUser`).
9. Mark job `COMPLETED`. If Firebase deletion fails, status is set to `RETRY_REQUIRED` with a retry endpoint.

---

## 4. Re-Registration Prevention

When an account is permanently deleted, its record is added to `account_deletion_jobs` with status `COMPLETED`. 

Any subsequent sign-in or bootstrap attempt with the same email or Firebase UID is intercepted by `authService.bootstrapAccount`, which throws:
```json
{
  "code": "ACCOUNT_DELETED",
  "message": "This account was permanently deleted and cannot be re-registered."
}
```

---

## 5. Administrative Endpoints

- `GET /api/v1/admin/deletion-jobs`: List recorded deletion jobs with pagination and status filtering.
- `GET /api/v1/admin/deletion-jobs/:id`: Fetch individual deletion job details.
- `POST /api/v1/admin/deletion-jobs/:id/retry`: Retry pending external operations (Firebase auth deletion) for failed jobs.
