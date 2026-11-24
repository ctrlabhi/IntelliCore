# IntelliCore Database Architecture & Management

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

