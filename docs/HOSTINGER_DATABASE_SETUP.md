# IntelliCore V2.0 — Hostinger Remote Database Setup & Migration Guide

## 1. Overview

IntelliCore V2.0 uses **Prisma ORM** with MySQL / MariaDB relational storage. When deploying on Vercel, the application connects to your existing remote database on Hostinger via a TLS-encrypted connection (`sslaccept=strict`).

This guide provides beginner-friendly, step-by-step instructions for:
1. Finding your Hostinger database parameters.
2. Enabling Hostinger Remote MySQL access safely.
3. Verifying connectivity and database compatibility.
4. Backing up existing database records before making changes.
5. Applying the 11 version-controlled Prisma migrations.
6. Seeding system foundation records (8 roles, permissions, departments, system settings).
7. Bootstrapping the initial Founder account.

---

## 2. Step 1: Locate Database Credentials in Hostinger hPanel

1. Log in to your [Hostinger Control Panel (hPanel)](https://hpanel.hostinger.com).
2. Go to **Websites** -> Click **Manage** next to your hosting plan.
3. In the left navigation, scroll to **Databases** -> Click **Management** (or **MySQL Databases**).
4. Locate or create your database. Note the exact values:
   - **MySQL Host**: Typically `sqlxxx.main-hosting.eu`, `srvxxx.hstgr.io`, or an IP address (e.g. `195.xxx.xxx.xxx`).
   - **MySQL Port**: `3306` (standard MySQL/MariaDB port).
   - **MySQL Database Name**: e.g. `u123456789_intellicore` *(Note: Hostinger automatically prefixes names with your account username)*.
   - **MySQL Username**: e.g. `u123456789_app` or `u123456789_user`.
   - **MySQL Password**: The password you set during user creation.

---

## 3. Step 2: Enable Remote MySQL in Hostinger

By default, Hostinger blocks incoming connections from outside its internal server network. To allow Vercel Serverless Functions to connect:

1. In hPanel, navigate to **Databases** -> **Remote MySQL**.
2. Under **Create Remote MySQL Connection**:
   - **IP (IPv4 or IPv6)**:
     - *Recommended Production Security Strategy*: Enter your deployment egress IP or subnet.
     - *Dynamic Serverless IP Note*: Because Vercel Serverless Functions rotate across dynamic AWS IP pools, enter `%` (wildcard) ONLY if required, paired with a high-entropy password (24+ characters including letters, digits, symbols) and mandatory TLS encryption (`DB_SSL=true`).
   - **Database**: Select your IntelliCore database from the dropdown.
3. Click **Create**.
4. Hostinger will confirm: *"Remote MySQL connection has been successfully created."*

---

## 4. Step 3: Verify Remote Database Connectivity & Compatibility

IntelliCore includes an automated database verification tool that inspects the database engine, version, character set, collation, and existing tables without making any modifications.

Run the verification tool from your terminal:

```bash
# Option A: With individual variables in .env:
# DB_HOST=sqlxxx.main-hosting.eu
# DB_PORT=3306
# DB_NAME=u123456789_intellicore
# DB_USER=u123456789_app
# DB_PASSWORD=your_password
# DB_SSL=true

npm run db:verify
```

### Expected Output:
```text
================================================================
🔍 INTELLICORE V2.0 — HOSTINGER DATABASE VERIFICATION
================================================================
📡 Target Database URL: mysql://u123456789_app:****@sqlxxx.main-hosting.eu:3306/u123456789_intellicore?sslaccept=strict
⏳ Connecting to database...
✅ Connection successful! Latency: 142ms

📊 Database Engine Analysis:
   Engine:  MariaDB (or MySQL)
   Version: 10.11.8-MariaDB-cll-lve
   ℹ️ Note: Hostinger hPanel shared/cloud hosting runs MariaDB.
      Compatible with Prisma MySQL provider, InnoDB storage, JSON as LONGTEXT.
   Charset: utf8mb4
   Collation: utf8mb4_unicode_ci
   ✅ UTF8MB4 supported (required for emojis, full Unicode).

📋 Existing Database Tables (0 found):
   Database is EMPTY. Ready for initial migration (`npx prisma migrate deploy`).
================================================================
🎉 Verification completed successfully.
================================================================
```

---

## 5. Step 4: Backup Database Before Migration

> [!CAUTION]
> If your remote database contains existing tables or historical data, ALWAYS create a backup snapshot before running migrations!

Run `mysqldump` from your terminal or use phpMyAdmin in Hostinger:
```bash
# Command-line backup (replace with your Hostinger host, user, and database):
mysqldump -h sqlxxx.main-hosting.eu -u u123456789_app -p --ssl-mode=REQUIRED u123456789_intellicore > backups/hostinger-backup-pre-migration.sql
```
Alternatively, in Hostinger hPanel -> **phpMyAdmin** -> Select Database -> Click **Export** -> Format: **SQL** -> Click **Export**.

---

## 6. Step 5: Apply Version-Controlled Migrations

IntelliCore V2.0 maintains 11 clean, version-controlled Prisma migrations. Migrations must **never** be applied automatically inside serverless Vercel function invocations. Instead, apply them once from your secure local environment or CI deployment pipeline.

Set your Hostinger database credentials in your local `.env`, then deploy migrations:

```bash
npx prisma migrate deploy
```

### Migrations Inventory:
1. `20261124000000_init`: Creates `system_settings` table.
2. `20261124090525_add_auth_rbac_models`: Creates `users`, `profiles`, `roles`, `permissions`, `user_roles`, `role_permissions`.
3. `20261124133504_add_staff_and_audit_models`: Creates `staff_profiles` and `audit_logs`.
4. `20261124141807_add_internship_and_department_models`: Creates `departments`, `user_departments`, `internship_applications`, `internships`.
5. `20261125000000_add_attendance_leave_and_reports`: Creates attendance policies, daily work reports, leave requests, attendance corrections.
6. `20261125120000_add_tasks_learning_and_performance`: Creates tasks, submissions, rubrics, attachments, curriculum tracks.
7. `20261125143000_add_notifications_and_email_outbox`: Creates notifications, preferences, transactional email outbox.
8. `20261125143100_add_assessment_correction_history`: Adds score amendments and progress correction audit tables.
9. `20261125160000_add_meetings_and_internship_followups`: Creates meetings, participants, extension, promotion, and manual dispatch history.
10. `20261125180000_add_account_deletion_jobs`: Creates permanent account deletion audit jobs table.
11. `20261125190000_add_notification_cron_state`: Creates Vercel Cron state leasing and cursor tracking table.

Verify migration status at any time:
```bash
npx prisma migrate status
```
Expected output: *"Database schema is up to date!"*

---

## 7. Step 6: Seed System Foundation Data

IntelliCore requires foundational relational data before operating:
- **8 System Roles**: `FOUNDER`, `CO_FOUNDER`, `ADMIN`, `HR_MANAGER`, `HR_EXECUTIVE`, `OPERATIONS_EXECUTIVE`, `TEAM_LEADER`, `INTERN`.
- **System Permissions**: Full role-permission capability matrix.
- **9 Core Departments**: Human Resources, Web Development, Data Analytics, Business Analytics, Graphic Designing, Content Writing, Digital Marketing, Social Media Management, WordPress Development.
- **Default System Settings**: Timezone (`Asia/Kolkata`), Working hours, Working days (`Monday - Friday`).

Execute the deterministic seed script:
```bash
npm run prisma:seed
```

> [!NOTE]
> The seed script is strictly idempotent (`upsert`). It creates missing roles, permissions, and departments without overwriting existing customizations or deleting existing records.

---

## 8. Step 7: Founder Identity Bootstrap

After registering the Founder email in Firebase Authentication, bootstrap the primary Founder identity in MySQL:

```bash
# In .env:
# FOUNDER_EMAIL=founder@intellicoretechnologies.in
# FOUNDER_FIREBASE_UID=<your_firebase_uid>

npm run founder:bootstrap
```

This atomically links the verified Firebase identity, assigns the `FOUNDER` role, provisions the Founder profile, and records an audited system event.
