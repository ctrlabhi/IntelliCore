# IntelliCore V2.0 final security audit report

- **Audit Date**: 2026-11-25 (Asia/Kolkata)
- **Scope**: Express 5 Application, Prisma ORM, MySQL 8.4, Firebase Authentication, Storage Subsystem, REST API Endpoints
- **Status**: Passed / Hardened

---

## 1. OWASP Top 10 Evaluation

| Vulnerability Category | Mitigation Strategy | Verification Evidence |
| :--- | :--- | :--- |
| **A01: Broken Access Control** | Server-side role ceilings, permission guards (`requirePrimaryFounder`, `requireRole`, `requireDepartmentScope`). Self-elevation and horizontal tenant access strictly blocked. | Passing integration suites (`tests/integration/phase10AccountDeletion.test.js`, `rbac.test.js`, `phase04Rules.test.js`). |
| **A02: Cryptographic Failures** | HTTPS enforced in production, HSTS enabled (`max-age=31536000`), preview hashes use SHA-256, sensitive tokens encrypted at rest via AES-256-GCM. | Cryptographic hash tests passing in unit and integration suites. |
| **A03: Injection (SQL / Command)** | 100% Prisma parameterized queries and parameterized raw SQL (`$executeRawUnsafe` with bind parameters). Strict Zod schema input validation. | All API input endpoints enforce strict Zod schemas with sanitization. |
| **A04: Insecure Design** | Strict separation of concerns: Firebase for identity verification, MySQL as sole authority for roles and state. Founder-only ceiling for irreversible actions. | Architectural ADRs and business rule tests. |
| **A05: Security Misconfiguration** | Helmet security headers (CSP, HSTS, no-sniff, frame-ancestors 'self', XSS protection). CORS restricted to explicit origin. Development errors sanitized before client response. | Header assertions in `apiV1.test.js`. |
| **A06: Vulnerable & Outdated Components** | Audit review of all dependencies (`npm audit`). Identified 12 vulnerabilities in dev/tooling dependencies; runtime mitigations verified. | See Section 3 below. |
| **A07: Identification & Auth Failures** | Strict Firebase ID token verification, session freshness checking (`assertRecentAuthentication`), immediate refresh token revocation upon suspension or deletion. | Multi-point logout and session tests passing. |
| **A08: Software & Data Integrity** | Immutable audit logging for sensitive actions (`USER_PERMANENT_DELETION`, role changes, score amendments). Migration checksums tracked in MySQL. | Audit logging integration tests passing. |
| **A09: Security Logging & Monitoring** | Structured Pino logger with request ID propagation (`x-request-id`), redaction of authorization headers and passwords. | Redaction verified in all logger outputs. |
| **A10: Server-Side Request Forgery** | No outbound webhook capabilities. External integrations limited to Google APIs using official client libraries. Manual links supported. | Verified zero SSRF vectors in meeting and calendar modules. |

---

## 2. Secrets Management & Credential Quarantine

1. **Quarantined Production Firebase**:
   - Production Firebase project `intellicore-229` is strictly quarantined from development, test, and staging environments.
   - Development operates solely against `intellicore-dev`.

2. **Secrets Exclusion**:
   - `.env`, `.env.local`, and credential files are strictly excluded from version control via `.gitignore`.
   - Docker build context excludes credentials and host volumes via `.dockerignore`.

3. **Storage Isolation**:
   - Upload directory (`storage/`) enforces octal permissions (`0o700` directories, `0o600` files).
   - Direct web access to private storage keys is blocked. Path traversal prevention strictly enforced via UUID regex validation (`^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$`).

---

## 3. Dependency Audit Analysis (`npm audit`)

An audit of installed packages reports 12 vulnerabilities (5 moderate, 5 high, 2 critical):
- **Development Tooling**:
  - `tinypool` / `@vitest/mocker` (via `vitest`): Test execution only, not bundled into production.
  - `deepmerge-ts` / `effect` (via `@prisma/config` / `prisma`): CLI schema tools only.
  - `glob` / `minimatch` (via `swagger-jsdoc` / `nodemon`): Dev server and API documentation generation only.
- **Runtime Dependency**:
  - `zod` (`GHSA-mrhx-c7xc-m3w5`): Pertains to memory exhaustion on unbounded collections. Mitigated at the gateway level by Express body parser payload limits (`100kb`) and bounded schema array constraints. Upgrading to Zod 4 represents a breaking change scheduled for future major cycle.
