# IntelliCore Security & Hardening Policy

## Phase 07 notification and email controls

Use authenticated ownership and current departmental scope for feed links, scheduled audiences and administrative changes. Store event metadata and delivery attempts without raw provider responses. Keep SMTP configuration on the worker, require explicit TLS and an approved allowlist, and preserve pending jobs when configuration is invalid. New Compose startup does not run application-schema migrations with runtime credentials. [Security rules](SECURITY_RULES.md) · [Email integration](EMAIL_INTEGRATION.md).

**Standard:** OWASP Top 10 Compliance  
**Framework:** Express.js 5 Security Baseline  
**Scope:** Phase 1 Foundation & Architecture  

---

## 1. Security Architecture Overview

The IntelliCore platform enforces defense-in-depth across the client, networking, API, database, and container layers.

---

## 2. API & Network Security Controls

1. **Helmet HTTP Headers:**
   - Enforces secure HTTP headers on all incoming responses:
     - `Content-Security-Policy` (CSP): Allows required Google fonts, styles, inline canvas animators, and CDN libraries (`html2pdf.js`) while blocking arbitrary code execution.
     - `X-Frame-Options`: `DENY` to prevent clickjacking.
     - `X-Content-Type-Options`: `nosniff` to prevent MIME-sniffing.
     - `Referrer-Policy`: `strict-origin-when-cross-origin`.
2. **API Rate Limiting:**
   - Managed via `express-rate-limit`.
   - General API endpoints (`/api/v1/*`): 100 requests per 15-minute window per IP.
   - Standard 429 status response with standardized JSON error payload when exceeded.
3. **Structured Request Logging & Request IDs:**
   - Every request is tagged with a unique `X-Request-Id` UUID v4 header.
   - Structured JSON logging via `pino` and `pino-http`.
   - Sensitive headers (`authorization`, `cookie`) are sanitized and redacted from log output.
4. **Error Handling & Information Disclosure Prevention:**
   - Production error responses never disclose stack traces, SQL queries, or internal file paths.
   - API error responses conform to the standard payload:
     ```json
     {
       "success": false,
       "error": {
         "code": "ERROR_CODE",
         "message": "Human-readable description"
       },
       "requestId": "uuid-v4",
       "timestamp": "2026-11-24T07:30:00.000Z"
     }
     ```

---

## 3. Database & Secret Isolation

1. **Restricted Application Credentials:**
   - The application does not connect to MySQL as `root`.
   - Access is restricted to `intellicore_app` with privileges limited to `intellicore_db` and development shadow database `intellicore_shadow_db`. All global administrative superuser privileges (`ON *.*`) have been revoked.
2. **Zero Plaintext Secrets in Repository:**
   - `.env`, `secrets/`, and `backups/` are strictly ignored by `.gitignore` and `.dockerignore`.
   - Example blueprints are published in `.env.example`.
3. **Cross-Origin Opener Policy & Authentication Security:**
   - Helmet configured with `crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }` to allow secure Firebase/Google OAuth popups while preserving isolation.
   - `requireRole` and `requirePermission` strictly gate access on `status === 'ACTIVE'`, rejecting non-active accounts.
4. **Firebase Production Quarantine:**
   - The new local application is blocked from issuing read/write requests to the production Firebase project (`intellicore-229`). All business data uses MySQL.

---

## 4. Container Security

1. **Non-Public Database Ports:**
   - MySQL port 3306 is not published to the host network interface. Communication occurs exclusively over the isolated internal Docker bridge network (`intellicore_net`).
2. **Minimal Docker Build Context:**
   - Host `node_modules`, `.git`, temporary files, and local logs are excluded from Docker builds via `.dockerignore`.

## Phase 06 application security

Technical work, attachments and published learning content use verified identity, active account checks, explicit MySQL permissions and ownership or department scope. The module validates transition inputs and rejects stale writes. Private work stays out of diagnostic logs and staff reports without technical permission. Files live under the existing upload volume and are provided by authenticated download with conservative content validation. [Security rules](SECURITY_RULES.md#phase-06-controls) · [Private file storage](FILE_STORAGE.md).

