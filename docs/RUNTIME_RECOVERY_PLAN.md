# Sanitized development database recovery plan

## 1. Overview & Objectives

This document presents the exact recovery plan for the local development database `intellicore_db` hosted in `intellicore_mysql`. It addresses the historical failed migration entry in the Prisma ledger without deleting volumes, resetting the database, rewriting historical migrations, or granting administrative DDL privileges to the runtime application user.

---

## 2. Current State Diagnosis

### 2.1 Prisma Migration Ledger (`_prisma_migrations`)
| Migration Name | Status | Started At | Finished At | Applied Steps |
| :--- | :--- | :--- | :--- | :--- |
| `20261124000000_init` | APPLIED | 2026-11-24 08:17:02 | 2026-11-24 08:17:02 | 1 |
| `20261124090525_add_auth_rbac_models` | APPLIED | 2026-11-24 09:05:25 | 2026-11-24 09:05:26 | 1 |
| `20261124133504_add_staff_and_audit_models` | APPLIED | 2026-11-24 13:35:04 | 2026-11-24 13:35:04 | 1 |
| `20261124141807_add_internship_and_department_models` | APPLIED | 2026-11-24 14:18:07 | 2026-11-24 14:18:09 | 1 |
| `20261125000000_add_attendance_leave_and_reports` | **FAILED** | 2026-11-25 03:04:37 | **NULL** | **0** |

### 2.2 Root Cause Analysis
The migration failed at step 0 with MySQL error:
`CREATE command denied to user 'intellicore_app'@'172.18.0.4' for table 'attendance_policies'`

Effective grants for runtime account:
```sql
GRANT USAGE ON *.* TO `intellicore_app`@`%`;
GRANT SELECT, INSERT, UPDATE, DELETE ON `intellicore_db`.* TO `intellicore_app`@`%`;
```
By security architecture, `intellicore_app` has zero DDL privileges (`CREATE`, `ALTER`, `DROP`). The failure occurred because the migration was triggered using the runtime user instead of the dedicated migration account.

### 2.3 Existing Preserved Data Inventory
The database contains 14 tables with active business records:
- `users`: 1 (Verified canonical Founder `ctrlabhishek@gmail.com`)
- `roles`: 8 system roles
- `permissions`: 60 system permissions
- `departments`: 9 operational departments
- `system_settings`: 8 core settings
- `audit_logs`: 5 immutable audit entries

---

## 3. Pre-Recovery Backup & Validation

### 3.1 Verified Dump
- Backup file: `backups/db-backup-20261125-122305-4387.sql`
- Size: 54,398 bytes
- SHA-256 Checksum: `6fe1ee98eec882c42d3efae37c2ee7300c1737be704ecdfbb148962c0192e212`

### 3.2 Isolated Restoration Proof
A full test restoration of this backup was rehearsed into an isolated database schema (`rehearsal_db`):
- Restored all 14 tables cleanly.
- Verified exact matching record counts across all tables.
- Zero data loss or corruption detected.

---

## 4. Proposed Recovery Sequence

### Phase A: Configure Migration Credentials
Set the dedicated migration URL in `.env` (kept private, excluded from git):
```ini
MIGRATION_DATABASE_URL="mysql://intellicore_migration:<MIGRATION_PASSWORD>@mysql:3306/intellicore_db"
MIGRATION_SHADOW_DATABASE_URL="mysql://intellicore_migration:<MIGRATION_PASSWORD>@mysql:3306/intellicore_shadow_db"
```
*(Or use `mysql://root:<MYSQL_ROOT_PASSWORD>@mysql:3306/intellicore_db` for the maintenance container run).*

### Phase B: Ledger Resolution (Resolve Phase 05)
Because `applied_steps_count` is 0, the failed migration left no partial tables. Run:
```bash
docker compose run --rm --no-deps migrate node backend/src/scripts/migrateDatabase.js resolve-phase05
```
**Underlying command**:
`npx prisma migrate resolve --rolled-back 20261125000000_add_attendance_leave_and_reports`
This updates `_prisma_migrations` to set `rolled_back_at = NOW(3)` on the failed record, allowing clean re-application.

### Phase C: Apply All Pending Migrations (5 through 9)
```bash
docker compose run --rm --no-deps migrate node backend/src/scripts/migrateDatabase.js deploy
```
This applies:
1. `20261125000000_add_attendance_leave_and_reports` (Attendance, Daily Reports, Leaves)
2. `20261125120000_add_tasks_learning_and_performance` (Tasks, Rubrics, Private Attachments)
3. `20261125143000_add_notifications_and_email_outbox` (Notifications, Email Outbox, Worker State)
4. `20261125143100_add_assessment_correction_history` (Task Score Amendments, Progress Corrections)
5. `20261125160000_add_meetings_and_internship_followups` (Meetings, Extensions, Promotions, Dispatches, Calendar)

### Phase D: Post-Recovery Integrity Verification
1. Run status:
   ```bash
   docker compose run --rm --no-deps migrate node backend/src/scripts/migrateDatabase.js status
   ```
   *Expected output*: `Database schema is up to date!`
2. Verify table count: 32 tables.
3. Verify preserved records:
   - `SELECT COUNT(*) FROM users;` -> 1
   - `SELECT COUNT(*) FROM roles;` -> 8
   - `SELECT COUNT(*) FROM departments;` -> 9
   - `SELECT COUNT(*) FROM audit_logs;` -> $\ge 5$

---

## 5. Rollback Procedure

If any error occurs during Phase B or C:
1. Terminate the maintenance process.
2. Execute the verified restore utility:
   ```powershell
   .\scripts\restore.ps1 -BackupFile db-backup-20261125-122305-4387.sql
   ```
3. Type `RESTORE` at the confirmation prompt.
4. Verify that the database is restored to its 14-table pre-recovery baseline.
