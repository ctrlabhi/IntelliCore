# IntelliCore V2.0 security rules

**Reconciled on 2026-11-25.** These rules apply to implementation, testing and operations. Historical context remains in [SECURITY.md](SECURITY.md), [Architecture decisions](ARCHITECTURE_DECISIONS.md), [Authentication](AUTHENTICATION.md), [RBAC](RBAC.md) and the phase reports.

## Firebase and credential boundaries

- Treat `intellicore-229` as quarantined. Never point local code, browser automation, tests, CLI commands, emulators or Admin SDK instances at it. Never deploy, read, write, reset rules or change configuration in production Firebase from local work. Preserve its historical artifacts under `legacy-firebase/`.
- Use `intellicore-dev` for authorized development Firebase Auth. Require expected project and token issuer/audience verification. Use Firebase for identity, email verification and auth lifecycle only. Authorization, account status and business records come from MySQL through Express.
- Keep Admin credentials in the local ignored secret store and mount them read-only. Keep private URLs, database credentials, service-account keys, OAuth credentials, tokens, session cookies, Founder identifiers and personal records out of output, source control, build context and browser bundles. Use placeholders for examples. Public Firebase Web SDK configuration is distinct from Admin credentials. Avoid repeating key strings in reports.
- Never dump effective Compose config, process environments, backups or live records into logs or reports. Use sanitized diagnostics. Preserve secret ownership and permissions. Keep developer scripts and tests off real Firebase accounts unless an authorized browser acceptance scenario requires them.

## Authorization and request handling

- Use `authenticate` to verify identity and resolve MySQL context, then explicitly enforce account state, required permissions and per-resource ownership or department scope. UI controls and workspace flags are presentation aids. Backend guards determine all protected access.
- Require verified email before workspace access for email/password users. Keep nonactive accounts out of operating workspaces. Explicitly limit verified pending users to the approved self-service profile, onboarding, department catalog and status operations.
- Enforce Founder-only staff role administration and the protected Founder identity across direct and indirect operations, regardless of editable grants. Prevent self-promotion, protected role mutation, Founder demotion and inappropriate self-suspension. Compare [master requirements](MASTER_REQUIREMENTS.md#roles-and-staff-administration) with the existing role matrix.
- Validate payloads, identifiers, filters, dates and state changes on the server. Keep privileged fields outside client-write schemas. Validate record ownership and active department scope before exposing records or writing changes. Treat user-generated values as data, and expose only fields appropriate to the role and purpose.
- Preserve standard response shapes, request IDs, sanitized errors, rate limits, Helmet, restricted CORS and OAuth-compatible popup handling. Verify the actual effective proxy and header settings for the environment. Keep secrets out of errors, audit snapshots and logs.
- Record successful administrative mutations and audit entries in the same transaction. Redact recursively and minimize personal data. Expose audit reads only to authorized roles and preserve an append-only application interface. Database-level audit protection depends on grants, retention and operations.

## Database, volumes and testing

- Use the dedicated application principal with minimal required data privileges. Reserve DDL and development shadow access for the migration principal. Scope both to their required databases, keep migration secrets out of the runtime and keep root for controlled maintenance. Record actual grants before declaring the separation verified.
- Keep MySQL on the internal network and local phpMyAdmin loopback-only. Keep `intellicore_mysql_data` and `intellicore_uploads_data` intact. Never reset the working database, truncate records, delete named volumes or run Compose teardown with volume deletion.
- Preserve historical migration SQL and its checksums. Review forward migrations for record preservation and track them in Git. Use isolated databases for migration rehearsal and restore testing. Do not apply a schema push or force-reset to a database with existing records.
- Review startup behavior before bringing up the existing stack. The application entrypoint attempts migration and seed on boot. The seed updates settings and permission metadata and adds mappings. Department upserts preserve prior edits and inactive status. Treat startup and seeding as state-changing operations.
- Use an isolated MySQL test target with separate credentials, schema, synthetic fixtures and volumes for mutating integration tests. The runner rejects normal development and production targets and configures a synthetic Founder and isolated credentials. See [Testing](TESTING.md#phase-04-isolated-integration-tests).

## Phase 04 verified controls

- Staff provisioning, user role replacement, role-permission editing and department writes require the active primary Founder at the API layer, including the configured Firebase UID and email. Protected permissions are filtered from non-Founder effective grants, blocked in editable role mappings and absent from non-Founder seed defaults. Existing mappings are retained for record preservation and cannot authorize these operations.
- Pending applicant access is limited to verified, scoped onboarding and history. Generic account activation, staff provisioning and role changes check the associated employment or internship workflow. Team Leader reads and assignment eligibility are checked using active department membership and active account, role and employment state.
- Application approvals and enrollment dates are checked within the applicant row lock. Conflict and rollback tests verified that concurrent approvals and failed audit writes preserve a consistent application, enrollment and account state in isolated MySQL.
- Use soft deletion for standard workflows. Permanent deletion requires primary Founder authority and explicit authorization. Preserve existing institutional and audit records and comply with the retention safeguards in [Business rules](BUSINESS_RULES.md#7-data-privacy-retention--deletion-safeguards).

## Open control verification

| Control | Current evidence and remaining work |
| --- | --- |
| Grants and runtime boot | Phase 02C reported scoped app/shadow grants. Phase 03 reported a separate migration principal. The checked-in Compose config builds the app's `DATABASE_URL` from runtime variables, and the entrypoint invokes migration and seeding from that process. Verify effective grants and credential separation before claiming full least privilege. |
| Email verification, project isolation and token revocation | Phase 04 enforces verified tokens for onboarding and email/password workspace operations. Firebase Admin initialization and token middleware enforce `intellicore-dev`. Visible email delivery, session restoration, verified access using real identities and revoked/disabled Firebase account checks remain open. |
| Effective HTTP headers | Helmet and tests currently expect `X-Frame-Options: SAMEORIGIN`, while earlier documentation says `DENY`. OAuth allowances include inline/eval script exceptions. Preserve OAuth functionality while verifying the appropriate CSP, frame and proxy policy for delivery. |
| Audit protection | The API router exposes reads, and Phase 03 service code writes audit entries with administrative transactions. Verify effective database grants and retention controls separately from ordinary API behavior. |
| Existing-stack readiness | Target isolation, synthetic fixtures and live readiness passed on disposable MySQL. The app-container health check covers liveness. Existing Compose readiness and grants remain open. |

Track verification results and follow-up under [Project progress](PROJECT_PROGRESS.md#outstanding-verification).
