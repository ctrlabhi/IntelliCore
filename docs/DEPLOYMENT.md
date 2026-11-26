# IntelliCore V2.0 — Production Deployment & Infrastructure Specification

**Document Date:** 2026-11-26 (Asia/Kolkata)  
**Target Environment:** GitHub Pages (Frontend) + Express.js Modular Monolith (Backend) + Hostinger Remote MariaDB (Database) + Firebase Auth (Identity)  
**Canonical Domain:** `https://www.intellicoretechnologies.in` / `https://intellicoretechnologies.in`

---

## 1. System Architecture & Boundaries

IntelliCore V2.0 operates with strict boundary separation across four decoupled layers:

```
[ Client Browser ]
        │
        ├── (1) Static Frontend Assets ────────► [ GitHub Pages: intellicoretechnologies.in ]
        │                                         - HTML5 / CSS3 / Vanilla JavaScript
        │                                         - Orbit Art, Live Clock, Branded Modals
        │                                         - Zero-server build (HTML/CSS/JS)
        │
        ├── (2) Authentication (OAuth & Email) ─► [ Firebase Auth: intellicore-dev ]
        │                                         - Spark Plan ($0/month, free)
        │                                         - Google Sign-In & Email/Password
        │                                         - Returns Firebase Bearer ID Token
        │
        └── (3) Business API & Workspaces ──────► [ Express.js Backend API: /api/v1/* ]
                                                  - Node.js 24 LTS, Express 5
                                                  - Firebase Admin SDK token verification
                                                  - RBAC (8 roles), Zod validation, Helmet
                                                  - CORS restricted to canonical origins
                                                  │
                                                  ▼ (TLS 1.3 / sslaccept=strict)
                                          [ Hostinger Remote MariaDB ]
                                                  - Host: srv1824.hstgr.io:3306
                                                  - DB: u740799251_intellicore
                                                  - 49 tables, 11 Prisma migrations
```

---

## 2. Remote MariaDB Database Configuration

### A. Connection Parameters
| Setting | Production Value | Verification Evidence |
| :--- | :--- | :--- |
| **Engine** | MariaDB `11.8.9-MariaDB-log` | Protocol handshake, `SELECT @@version` |
| **Server Hostname** | `srv1824.hstgr.io` | DNS resolves to `193.203.184.196` |
| **Server IP** | `193.203.184.196` | Verified via DNS A-record |
| **Port** | `3306` | TCP connection verified |
| **Database Name** | `u740799251_intellicore` | Verified via `information_schema.tables` |
| **Database User** | `u740799251_intellicore` | Active grants on `u740799251\_intellicore.*` |
| **TLS Encryption** | `sslaccept=strict` (Active) | Protocol: `TLSv1.2`, Cipher: `ECDHE-ECDSA-AES256-GCM-SHA384` |
| **Certificate CN/SAN** | `*.hstgr.io`, `hstgr.io` | Let's Encrypt CA, valid through 2027 |
| **Charset & Collation** | `utf8mb4` / `utf8mb4_unicode_ci` | Full Unicode and emoji support |

### B. Applied Schema Migrations (11 Total)
1. `20261124000000_init`: `system_settings`
2. `20261124090525_add_auth_rbac_models`: `users`, `profiles`, `roles`, `permissions`, `user_roles`, `role_permissions`
3. `20261124133504_add_staff_and_audit_models`: `staff_profiles`, `audit_logs`
4. `20261124141807_add_internship_and_department_models`: `departments`, `user_departments`, `internship_applications`, `internships`
5. `20261125000000_add_attendance_leave_and_reports`: `attendance_policies`, `attendance_eligibility`, `attendance`, `daily_work_reports`, `leave_requests`, `attendance_corrections`
6. `20261125120000_add_tasks_learning_and_performance`: Task, curriculum, submission, attachment metadata
7. `20261125143000_add_notifications_and_email_outbox`: In-app notifications, delivery logs, announcements
8. `20261125143100_add_assessment_correction_history`: Assessment audit trail
9. `20261125160000_add_meetings_and_internship_followups`: Meetings, promotions, extensions
10. `20261125180000_add_account_deletion_jobs`: Soft & hard deletion audit jobs
11. `20261125190000_add_notification_cron_state`: Background worker heartbeat and outbox lock state

### C. Seed & Foundation Records
- **System Settings**: 10 platform configuration settings.
- **RBAC Roles**: 8 defined roles (`FOUNDER`, `CO_FOUNDER`, `ADMIN`, `HR_MANAGER`, `HR_EXECUTIVE`, `OPERATIONS_EXECUTIVE`, `TEAM_LEADER`, `INTERN`).
- **Permissions**: 75 granular capability keys mapped to roles.
- **Departments**: 9 official business departments.
- **Primary Founder**: Bootstrapped account for `ctrlabhishek@gmail.com` with `FOUNDER` role and `ACTIVE` status.

---

## 3. Verified Backup Strategy

- **Backup Command**:
  ```bash
  docker exec -i -e MYSQL_PWD=$DB_PASSWORD intellicore_mysql mysqldump \
    -h srv1824.hstgr.io -P 3306 -u u740799251_intellicore \
    --ssl-mode=REQUIRED --column-statistics=0 --single-transaction --quick \
    u740799251_intellicore > backups/hostinger-production-backup.sql
  ```
- **Verified Archive**: `backups/hostinger-production-backup.sql` (126.95 KB, 1,792 SQL statements covering all 49 tables, DDL and initial foundation records).
- **Restoration Command**:
  ```bash
  docker exec -i -e MYSQL_PWD=$DB_PASSWORD intellicore_mysql mysql \
    -h srv1824.hstgr.io -P 3306 -u u740799251_intellicore \
    --ssl-mode=REQUIRED u740799251_intellicore < backups/hostinger-production-backup.sql
  ```

---

## 4. Backend Hosting Evaluation & Architecture

### A. Hostinger Shared Hosting Assessment
- **Status**: **Incompatible for Node.js Application Execution**.
- **Reason**: The existing Hostinger shared hosting node (`in-mum-web1824.main-hosting.eu`) operates LiteSpeed Web Server with PHP 8.1-8.4. It lacks a persistent Node.js application daemon manager, long-running process supervisors (PM2/systemd), and does not support native Rust binaries (`query-engine-debian-openssl-3.0.x`) required by Prisma ORM.
- **Database Use**: Port 3306 remains 100% active and approved for remote MariaDB connectivity.

### B. Zero-Cost Commercial Hosting Evaluation
1. **Render Free Web Service**:
   - Genuinely free tier available (750 instance hours/month).
   - Node.js 24 LTS and Express 5 compatible.
   - Outbound MySQL connectivity on port 3306 with TLS supported.
   - Automatic free Let's Encrypt SSL (`*.onrender.com` or custom domain `api.intellicoretechnologies.in`).
   - Ephemeral disk (file attachments must be served via cloud object storage or API streaming).
2. **Koyeb Free Tier**:
   - 1 free Nano instance (512 MB RAM), zero-sleep option.
   - Node.js Docker runtime supported.
3. **Local Docker Compose**:
   - Self-hosted on local infrastructure using `docker-compose up -d`.
   - Node.js 24 backend container, MySQL 8.4 container, phpMyAdmin on port 8080. Zero third-party fees.

---

## 5. Frontend & Backend Cross-Origin Configuration

### A. CORS Configuration (`backend/src/app.js`)
Only authorized origins are permitted to make credentialed requests to `/api/v1/*`:
- `https://intellicoretechnologies.in`
- `https://www.intellicoretechnologies.in`
- `https://ctrlabhi.github.io`
- `http://localhost:3000` / `http://127.0.0.1:3000` (Development)

### B. Frontend API Dispatch (`frontend/services/api.js`)
The frontend client dynamically resolves the API origin:
```javascript
function getDefaultApiBaseUrl() {
  if (typeof window !== 'undefined') {
    if (window.__INTELLICORE_API_BASE_URL__) {
      return window.__INTELLICORE_API_BASE_URL__;
    }
    const host = window.location.hostname;
    if (host.endsWith('github.io')) {
      return 'https://api.intellicoretechnologies.in/api/v1';
    }
  }
  return '/api/v1';
}
```

---

## 6. Security Hardening Summary

1. **CWE-601 Open-Redirect Protection**: All `/frontend` redirects sanitize leading slashes, reject scheme prefixes (`http://`, `https://`), and default unrecognized paths safely to `/`.
2. **Strict TLS 1.3 Validation**: Remote database connection strictly enforces `sslaccept=strict` with validated certificate CN `*.hstgr.io`. Insecure flags (`accept_invalid_certs`) are rejected in all environments.
3. **Least Privilege Grants**: MySQL user `u740799251_intellicore` has grants restricted strictly to schema `u740799251_intellicore`.
4. **Credential Isolation**: No production passwords, Firebase Admin credentials, or service account tokens are exposed in client-facing bundles or public documentation.

---

## 7. Zero-Cost Cloud Backend Deployment Blueprint (Render Free Web Service)

### A. Deployment Settings
- **Service Type**: Web Service (Node.js)
- **Root Directory**: `.` (Repository root)
- **Runtime**: Node.js 24 LTS (`engines: { "node": "24.x" }`)
- **Build Command**: `npm install && npm run build:render` (`npx prisma generate`)
- **Start Command**: `node backend/src/server.js` (listens on `0.0.0.0:${PORT}`)
- **Health Check Path**: `/health` (HTTP 200)
- **Auto-Deploy**: Disabled (manual approval gate)

### B. Environment Variables to Configure in Render Dashboard
| Variable | Value / Format | Security Mode |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Plaintext |
| `APP_TIMEZONE` | `Asia/Kolkata` | Plaintext |
| `PORT` | Set automatically by Render (e.g. 10000) | Injected by platform |
| `CORS_ORIGIN` | `https://www.intellicoretechnologies.in,https://intellicoretechnologies.in` | Plaintext |
| `SWAGGER_ENABLED` | `false` | Plaintext |
| `DB_SSL` | `true` | Plaintext |
| `DATABASE_URL` | `mysql://u740799251_intellicore:<PASSWORD>@srv1824.hstgr.io:3306/u740799251_intellicore?sslaccept=strict&connection_limit=2` | Secret Store |
| `FIREBASE_PROJECT_ID` | `intellicore-dev` | Plaintext |
| `FIREBASE_CLIENT_EMAIL` | `<SERVICE_ACCOUNT_CLIENT_EMAIL>` | Secret Store |
| `FIREBASE_PRIVATE_KEY` | `-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----` | Secret Store |
| `FOUNDER_EMAIL` | `ctrlabhishek@gmail.com` | Plaintext |
| `FOUNDER_FIREBASE_UID` | `svNt0UTSz9N59EzlaTWR7jsCu5c2` | Plaintext |

---

## 8. Controlled Deployment Approval Gate

Before deploying to the public Render environment, the following owner actions and approval gates must be completed:

1. **Database Password Rotation**: Rotate the MySQL password in Hostinger hPanel under Remote MySQL. Update `.env.production.local` locally and prepare the new value for Render's secret store.
2. **Render Account Link**: Connect the GitHub repository `IntelliCore` to Render as a Free Web Service.
3. **Environment Injection**: Paste the rotated `DATABASE_URL` and `FIREBASE_PRIVATE_KEY` into Render's Environment settings.
4. **Owner Authorization**: Explicitly approve the cloud deployment action.

