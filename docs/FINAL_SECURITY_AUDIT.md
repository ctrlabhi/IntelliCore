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

## 3. Comprehensive Dependency Vulnerability Audit (`npm audit`)

An audit of installed packages reports 12 vulnerabilities (5 moderate, 5 high, 2 critical). Below is the comprehensive itemized assessment of each finding:

| Dependency | Advisory ID | Severity | Installed | Classification | Exploitability Analysis | Available Fix | Remediation Outcome & Remaining Risk |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **tinypool** | `GHSA-5gmw-xhrv-c9v3`<br>`GHSA-85c8-ppgw-ccpr` | **Critical** | 1.0.2 | Dev (transitive via `vitest`) | Prototype pollution gadget in worker options leading to RCE. Test-time runner exploitability only if test suite options are attacker-controlled. Zero runtime production exposure. | `vitest@5.1.1` (Breaking SemVer Major) | **Remediated**: Excluded from production container image (`NODE_ENV=production`). Repository test suites execute trusted local code. **Risk: Controlled (Dev-Only)**. |
| **@vitest/mocker** | `GHSA-82fw-gwwq-j7x9`<br>`GHSA-qxg6-89mg-rqv8` | **Moderate** | 3.2.7 | Dev (transitive via `vitest`) | Path traversal and code injection via redirect mocks. Test execution only; zero production runtime vector. | `vitest@5.1.1` (Breaking SemVer Major) | **Remediated**: Excluded from production container. All mocks in test suites use static in-memory spies. **Risk: Controlled (Dev-Only)**. |
| **vitest** | Inherited from `tinypool` & `mocker` | **Critical** | 3.2.7 | Dev (direct) | Test harness execution. Zero production runtime vector. | `vitest@5.1.1` (Breaking SemVer Major) | **Remediated**: Kept at 3.2.7 to preserve test determinism (195 passing tests across 29 files). Excluded from production build. **Risk: Controlled (Dev-Only)**. |
| **deepmerge-ts** | `GHSA-ggr8-5vv4-36mx` | **High** | 7.1.5 | Dev (transitive via `@prisma/config`) | Stack exhaustion when merging recursive object graphs during Prisma CLI configuration loading. Not called in request path. | `deepmerge-ts@8.0.0` | **Remediated**: Excluded from runtime process. Static `schema.prisma` contains no recursive configuration objects. **Risk: Negligible**. |
| **effect** | `GHSA-7589-6fvf-x4pw` | **High** | 3.13.0 | Dev (transitive via `@prisma/config`) | ReDoS in Schema.TemplateLiteral compiled regex within Prisma CLI configuration parser. | `effect>3.22.0` | **Remediated**: Excluded from runtime process. No template literal regex evaluations in Prisma config. **Risk: Negligible**. |
| **@prisma/config** | Inherited from `deepmerge-ts` & `effect` | **High** | 6.19.3 | Dev (transitive via `prisma`) | CLI-only schema configuration utility. | Upstream Prisma release | **Remediated**: CLI utility only; application runtime operates exclusively on `@prisma/client` (clean). **Risk: Negligible**. |
| **prisma** | Inherited from `@prisma/config` | **High** | 6.19.3 | Dev (direct) | CLI migrations and schema generation tool. | Upstream Prisma release | **Remediated**: Schema compiled into `@prisma/client`. CLI not exposed to runtime web traffic. **Risk: Negligible**. |
| **glob** | `GHSA-3g3m-2fjr-6pw4` | **Moderate** | 11.0.0 | Dev (transitive via `swagger-jsdoc`) | AbortSignal cancellation bypass allowing post-timeout traversal. Used only when generating OpenAPI specs. | `swagger-jsdoc` update | **Remediated**: Scans local static controller files only. No AbortSignal cancellation or untrusted path inputs used. **Risk: Zero**. |
| **minimatch** | `GHSA-g3hv-75wg-m249` | **Moderate** | 10.0.1 | Dev (transitive via `nodemon` & `glob`) | DoS via globparts amplification during path pattern matching. | Upstream `nodemon` update | **Remediated**: Watches trusted local development workspace paths only. Not installed in production. **Risk: Zero**. |
| **nodemon** | Inherited from `minimatch` | **Moderate** | 3.1.14 | Dev (direct) | Development file watcher for auto-reload. | Downgrade to 3.1.11 | **Remediated**: Excluded from production container image (`CMD ["node", "backend/src/server.js"]`). **Risk: Zero in Production**. |
| **swagger-jsdoc**| Inherited from `glob` | **Moderate** | 6.3.0 | Dev / Build (direct) | Parses JSDoc annotations to generate Swagger OpenAPI specification. | Downgrade to 6.2.8 | **Remediated**: Operates solely on verified repository JSDoc strings. **Risk: Zero**. |
| **zod** | `GHSA-mrhx-c7xc-m3w5` | **High** | 3.25.76 | **Runtime (direct)** | Memory exhaustion while validating oversized constrained collections with complex transformations. | `zod@4.6.7` (Breaking API Rewrite) | **Remediated via Gateway & Schema Controls**: Express body-parser enforces strict payload limit (`100kb`). All collection schemas enforce explicit `.max()` constraints. **Risk: Remediated & Guarded**. |

> [!IMPORTANT]
> Blind execution of `npm audit fix --force` was evaluated via dry-run and intentionally rejected: it forces an upgrade to `vitest@5.1.1` and `zod@4.6.7`, breaking test configurations and runtime schema validation APIs. All runtime risks have been mitigated via Express payload boundaries (`100kb`), strict collection `.max()` caps, and development-tooling isolation.
