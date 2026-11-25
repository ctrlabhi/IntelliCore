# IntelliCore V2.0 agent instructions

## Required reading before implementation

Before planning or implementing any new feature, read these files in order.

1. [Master project context](docs/MASTER_PROJECT_CONTEXT.md)
2. [Master requirements](docs/MASTER_REQUIREMENTS.md)
3. [Implementation roadmap](docs/IMPLEMENTATION_ROADMAP.md)
4. [Project progress](docs/PROJECT_PROGRESS.md)
5. [Security rules](docs/SECURITY_RULES.md)

Read the linked architecture decisions, business rules, phase reports and relevant source and tests for the work. Inspect Git HEAD, working-tree changes and local migrations before deciding where to resume. Preserve existing work, including uncommitted files and local migration SQL. Treat a historical report as evidence from its date. Record discrepancies among requirements, code and runtime evidence in the progress tracker.

## Implementation boundaries

- Follow the phase scope in the roadmap and the current user request. Phase 07 requires the user's next manual implementation prompt.
- Preserve the same-origin modular monolith, HTML/CSS/vanilla JavaScript, Node.js 24 LTS, Express 5, MySQL 8.4 LTS, Prisma, Docker Compose and phpMyAdmin. Preserve branding, responsive layouts and compatible public URLs. Use UTC for stored timestamps and Asia/Kolkata for business dates.
- Keep Firebase authentication-only and use `intellicore-dev` for development identity. Keep production Firebase `intellicore-229` quarantined from local and test activity. Leave `legacy-firebase/` as historical reference. MySQL is authoritative for account state, RBAC and all business records.
- Apply server-side account, role, permission and resource guards. Use strict input validation, Express response helpers and the existing routes/controllers/services layout. Keep related business changes and successful audit entries in the same transaction.
- Never expose credentials, private identifiers or personal records in documentation, logs, messages or tool output. Keep existing database records, migration history and persistent volumes intact. Use isolated databases and synthetic fixtures for mutating tests. Read [Security rules](docs/SECURITY_RULES.md) before any operation that could affect data or infrastructure.

## Verification and history

Use the relevant automated and browser checks for the change, and distinguish mocks, real database integration and browser acceptance. Record commands, outcomes, scope, Git checkpoint and open verification in [Project progress](docs/PROJECT_PROGRESS.md). Record approved architecture changes in the ADRs and business rule changes in their source specifications. Preserve previous phase reports as historical records. Report skipped or blocked checks explicitly.
