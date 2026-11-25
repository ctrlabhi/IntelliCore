# IntelliCore Database Architecture & Management

## Phase 07 schema

| Models | Purpose and constraints |
| --- | --- |
| Notification and NotificationPreference | One recipient per notice, unique event fingerprint, recipient/read/archive indexes and one preference row per user. |
| EmailOutbox and EmailDeliveryAttempt | One eligible outbox job per notice, unique job fingerprint, claim/status/lease indexes and unique attempt sequence. |
| Announcement and AnnouncementRecipient | Scoped drafts and schedules, immutable publication details and one receipt per announcement and user. |
| NotificationWorkerState | Per-worker heartbeat and sanitized status. |
| TaskScoreAmendment and LearningProgressCorrection | Append-only records with unique per-review or per-progress revision, original evidence and accountable actor. |

The two additive Phase 07 migrations create nine tables. No legacy activity is backfilled. Separate database identities apply deployment, serve runtime queries, and process notification jobs. [Migration evidence](PHASE_07_REPORT.md#database-and-migration-verification).

**Database Engine:** MySQL 8.4 LTS  
**Character Set:** `utf8mb4`  
**Collation:** `utf8mb4_unicode_ci`  
**ORM:** Prisma ORM  
**Application Database:** `intellicore_db`  
**Application User:** `intellicore_app`  
**GUI Administration:** phpMyAdmin (`http://localhost:8080`)  

---

## 1. Database Configuration Principles

1. **Security & Least Privilege:**
   - The application connects exclusively through the dedicated user `intellicore_app`.
   - The MySQL `root` account is strictly isolated for container maintenance and is never used by the runtime application.
   - MySQL port 3306 is bound exclusively to the internal Docker network `intellicore_net` and is **not** exposed to the public host.
2. **Data Consistency & Types:**
   - Primary keys use UUID v4 strings (`@id @default(uuid()) @db.VarChar(36)`).
   - All timestamps are recorded in UTC (`DateTime @default(now())`).
   - Business calculations (attendance, working hours) map to `Asia/Kolkata` (`UTC+05:30`) via application utilities.
3. **Prisma Versioned Migrations:**
   - Schema evolution is governed exclusively by version-controlled migration files in `prisma/migrations/`.
   - `prisma db push` is strictly forbidden in production and version-controlled environments.

---

## 2. Phase 1 Foundation Schema

In Phase 1, only the infrastructure foundation schema is created:

```prisma
datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model SystemSetting {
  id          String   @id @default(uuid()) @db.VarChar(36)
  key         String   @unique @db.VarChar(100)
  value       String   @db.Text
  description String?  @db.VarChar(255)
  category    String   @default("general") @db.VarChar(50)
  isPublic    Boolean  @default(false) @map("is_public")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  @@map("system_settings")
}
```

---

## 3. Database Administration via phpMyAdmin

- **Access URL:** `http://localhost:8080`
- **Server:** `mysql`
- **Username:** `intellicore_app` (or `root` for administrative maintenance)
- **Password:** As configured in `.env` (`MYSQL_PASSWORD`)
- **Capabilities Available:**
  - Visual inspection of `intellicore_db` and the `system_settings` table.
  - SQL query console.
  - Database schema and data export (SQL dump).
  - Server metrics and process monitor.

---

## 4. Backup & Recovery Operations

Automated PowerShell utilities are located in `scripts/`:
- **Backup:** `scripts/backup.ps1` produces a timestamped SQL dump in `backups/db-backup-YYYYMMDD-HHMMSS.sql`.
- **Restore:** `scripts/restore.ps1` prompts for explicit user confirmation before applying a dump to prevent accidental data loss.

## Phase 04 schema and migration tracking

The original migration chain is tracked from `20261124000000_init` through `20261124141807_add_internship_and_department_models`, along with `migration_lock.toml`. Git ignores SQL dumps and only exempts `prisma/migrations/*/migration.sql`. The original migration bytes are preserved across checkouts.

The Phase 04 migration adds departments, user-to-department memberships, internship applications and internship enrollments. Department codes and slugs are unique. Membership rows are unique by user, department and capacity. Changes of capacity deactivate the previous membership and retain its row. An internship has a unique code and a unique source application. The service takes an applicant row lock in a MySQL transaction before checking application state and overlap, then records approval, enrollment, account activation and audit together.

Internship calendar dates are represented as UTC-midnight dates and compared to the Asia/Kolkata business day. Approval sets the first stored state, and list queries and statistics derive upcoming, ongoing and due-for-review state from the approved dates. Completion, termination and withdrawal persist explicit decisions and keep history. [Project progress](PROJECT_PROGRESS.md).

## Phase 05 data model

Migration `20261125000000_add_attendance_leave_and_reports` appends the following tables and one initial working policy. Existing Phase 01–04 migrations retain their original bytes.

| Table | Integrity rule |
| --- | --- |
| `attendance_policies` | Immutable policy versions with unique effective date. The original timing and working days remain associated through policy foreign keys. |
| `attendance_eligibility` | Enrollment, eligibility start/end UTC instants and applicable business-date bounds. Only open intervals close when applicable state changes. Migration begins verified enrollment evidence at cutover. |
| `attendance` | One row per enrollment and IST business date, storing UTC check-in/checkout, policy, source and revision. |
| `daily_work_reports` | One draft or immutable submission per enrollment and business date, with distinct review and late approval metadata. |
| `leave_requests` | Period, type, working-day count, review result and reconciliation metadata. |
| `attendance_corrections` | Append-preserved original values, proposal, reason and decision. Approval requires a current matching revision. |

The service serializes business writes on the user row and uses the database unique constraints as a second limit against duplicates. Reports derive absent and weekly-off days and incomplete flags from stored eligibility and evidence. The populated upgrade rehearsal checked the migration ledger and verified zero schema drift. [Attendance operating rules](ATTENDANCE.md).

## Phase 06 data model

The sixth migration adds 11 tables and foreign keys while retaining all five prior migration files.

| Table | Relationship and constraints |
| --- | --- |
| `tasks` | Department and creator, unique task code, lifecycle and content revision. |
| `task_assignments` | Task, internship, recipient and assigner. Unique task and internship. |
| `task_submissions` | Assignment and submitter. Unique assignment and version. Immutable snapshot after submission. |
| `task_reviews` | One review per submitted version, with reviewer, decision, feedback and bounded score. |
| `file_attachments` | Owner and exactly one task or submission parent under the service contract. Unique private storage key. |
| `learning_tracks` | Department and versioned track key, unique within department and version. |
| `learning_modules`, `lessons`, `learning_resources` | Ordered content belonging to a track version. Resources link to either module or lesson. |
| `learning_enrollments` | Internship and published track version, unique as a pair. |
| `learning_progress` | Enrollment and lesson, unique as a pair. Both belong to the same track version under the service contract. |

New activity tables start empty. The seed installs the recovered catalog and the first phase permission grants separately from the schema migration. [Migration evidence](PHASE_06_REPORT.md#database-and-migrations).

## Phase 08 schema

Migration `20261125160000_add_meetings_and_internship_followups` adds `meetings`, `meeting_participants`, `calendar_connections`, `calendar_authorizations`, `internship_extensions`, `internship_promotions` and `certificate_dispatch_history`. Enrollment application linkage remains unique when present. It becomes nullable for continuations, which refer to their approved source through the extension decision. The migration preserves prior application links and certificate history is created only through human declarations. The historical migrations are byte-for-byte unchanged.

An intern-row lock serializes enrollments, extensions, declarations and promotions. Meeting edits and reminders serialize by meeting row. Durable Calendar writes use the desired revision and worker lease. Dispatch history uses per-enrollment request and sequence uniqueness. [Runtime recovery](RUNTIME_RECOVERY.md).
