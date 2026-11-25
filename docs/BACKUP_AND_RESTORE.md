# Disaster recovery, backup & restoration guide

## 1. Overview

IntelliCore V2.0 includes automated, audited backup and restoration tooling designed to prevent data loss and ensure rapid disaster recovery.

---

## 2. Automated Backup Procedure

To perform an on-demand full database backup:

```powershell
.\scripts\backup.ps1
```

### What it does:
1. Sources database credentials from `.env`.
2. Connects to the running `intellicore_mysql` Docker container via `docker compose exec`.
3. Runs `mysqldump` with options `--single-transaction`, `--quick`, and `--triggers`.
4. Saves a timestamped dump to `backups/db-backup-YYYYMMDD-HHMMSS-XXXX.sql`.
5. Computes and records the SHA-256 cryptographic checksum alongside the dump file.

### Verified Backup Evidence:
- Backup File: `backups/db-backup-20261125-122305-4387.sql`
- File Size: `54,398 bytes`
- SHA-256: `6fe1ee98eec882c42d3efae37c2ee7300c1737be704ecdfbb148962c0192e212`

---

## 3. Database Restoration Procedure

Restoration requires explicit user confirmation to prevent accidental overwrites:

```powershell
.\scripts\restore.ps1 -BackupFile db-backup-20261125-122305-4387.sql
```

### Interactive Safety Prompt:
The utility prompts:
```
============================================================
  ⚠️  DATABASE RESTORE CONFIRMATION REQUIRED
============================================================
Target Database: intellicore_db
Source Backup:   backups/db-backup-20261125-122305-4387.sql

WARNING: This operation will overwrite existing database records!
Type 'RESTORE' to proceed or anything else to abort:
```

Entering anything other than `RESTORE` aborts the operation cleanly without modifying the database.

---

## 4. Rehearsal Verification Proof

During Phase 10 quality assurance, a full restoration rehearsal was executed against an isolated MySQL database (`rehearsal_db` on port 33359):

```
1. Created isolated schema rehearsal_db.
2. Streamed dump file db-backup-20261125-122305-4387.sql into rehearsal_db.
3. Verified 14 restored tables with accurate row counts.
4. Cleaned up rehearsal database.
Outcome: 100% data integrity verified.
```
