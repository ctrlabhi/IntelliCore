# IntelliCore V2.0 — Environment Variables Reference Dictionary

This document provides the definitive reference for all environment configuration variables used across IntelliCore V2.0.

---

## 1. Complete Environment Variables Matrix

| Variable Name | Required / Optional | Where to Obtain Value | Example / Placeholder | Secret? | Environment Applicability | Description |
| :--- | :--- | :--- | :--- | :---: | :--- | :--- |
| **APPLICATION SETTINGS** | | | | | | |
| `NODE_ENV` | **Required** | Set by developer/host | `production` / `development` | No | Both | Controls security guards, error details, and log formatting. |
| `PORT` | Optional (default 3000) | Local dev or PaaS port | `3000` | No | Local / Docker | Listening port for standalone Express server (`backend/src/server.js`). Ignored by Vercel serverless. |
| `APP_BASE_URL` | **Required** | Your deployment domain | `https://www.intellicoretechnologies.in` | No | Both | Canonical base URL used for links, CORS, and redirects. |
| `APP_TIMEZONE` | Optional (default `Asia/Kolkata`) | Project business rule | `Asia/Kolkata` | No | Both | Canonical timezone for business day calculations (check-in, DWR deadlines). |
| `LOG_LEVEL` | Optional (default `info`) | System preference | `info`, `debug`, `warn` | No | Both | Pino structured logger output threshold. |
| **HOSTINGER DATABASE CONNECTION** | | | | | | |
| `DB_HOST` | **Required*** | Hostinger hPanel -> Databases | `sql123.main-hosting.eu` | No | Both | Remote database hostname or IP address. |
| `DB_PORT` | Optional (default `3306`) | Hostinger hPanel -> Databases | `3306` | No | Both | MySQL / MariaDB connection port. |
| `DB_NAME` | **Required*** | Hostinger hPanel -> Databases | `u123456789_intellicore` | No | Both | Database name created in Hostinger. |
| `DB_USER` | **Required*** | Hostinger hPanel -> Databases | `u123456789_app` | No | Both | Database username created in Hostinger. |
| `DB_PASSWORD` | **Required*** | Hostinger hPanel -> Databases | `SuperSecretPassword123!` | **YES** | Both | Database password. Special characters are auto URL-encoded. |
| `DB_SSL` | Optional (default `true`) | Project security rule | `true` | No | Both | When `true`, enforces strict CA TLS verification (`sslaccept=strict`). |
| `DATABASE_URL` | Optional alternative | Constructed automatically | `mysql://user:pass@host:3306/db?sslaccept=strict` | **YES** | Both | Full Prisma connection string. Overrides individual `DB_*` variables. |
| **DATABASE MIGRATION CREDENTIALS** | | | | | | |
| `MIGRATION_DATABASE_URL`| Optional | Dedicated migration user | `mysql://admin:pass@host:3306/db?sslaccept=strict` | **YES** | Local CLI only | Connection URL with DDL privileges for `npx prisma migrate deploy`. Keep out of Vercel runtime. |
| **BACKGROUND WORKER CREDENTIALS** | | | | | | |
| `NOTIFICATION_DATABASE_URL` | Optional | Dedicated worker user | `mysql://worker:pass@host:3306/db?sslaccept=strict` | **YES** | Both | Connection URL for scheduled notification worker. On single-user plans, uses application database. |
| **FIREBASE CLIENT AUTHENTICATION** | | | | | | |
| `FIREBASE_PROJECT_ID` | **Required** | Firebase Console -> Project Settings | `intellicore-229` (prod) / `intellicore-dev` (dev) | No | Both | Firebase Project ID. Quarantines dev vs prod. |
| `FIREBASE_API_KEY` | **Required** | Firebase Console -> Web App config | `AIzaSy...` | No | Both | Public Web Client API Key (browser-safe). |
| `FIREBASE_AUTH_DOMAIN` | **Required** | Firebase Console -> Web App config | `intellicore-229.firebaseapp.com` | No | Both | Firebase Auth redirect domain. |
| `FIREBASE_STORAGE_BUCKET`| Optional | Firebase Console -> Web App config | `intellicore-229.firebasestorage.app` | No | Both | Default Firebase storage bucket. |
| `FIREBASE_MESSAGING_SENDER_ID` | Optional | Firebase Console -> Web App config | `287532496050` | No | Both | Cloud Messaging sender identifier. |
| `FIREBASE_APP_ID` | Optional | Firebase Console -> Web App config | `1:287532496050:web:015491...` | No | Both | Registered Web Application identifier. |
| **FIREBASE ADMIN SDK CREDENTIALS** | | | | | | |
| `FIREBASE_CLIENT_EMAIL`| **Required** (Vercel) | Firebase Console -> Service Accounts | `firebase-adminsdk-xxxxx@...iam.gserviceaccount.com` | **YES** | Production | Service account email from downloaded JSON. |
| `FIREBASE_PRIVATE_KEY` | **Required** (Vercel) | Firebase Console -> Service Accounts | `"-----BEGIN PRIVATE KEY-----\n..."` | **YES** | Production | Service account private RSA key. Handles escaped newlines (`\n`). |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Optional alternative | Firebase Console -> Service Accounts | `{"type":"service_account",...}` | **YES** | Production | Full raw JSON string alternative for Vercel. |
| `GOOGLE_APPLICATION_CREDENTIALS` | Optional (Local) | Local secrets directory | `secrets/firebase-admin-dev.json` | **YES** | Local dev only | Path to service account file for Docker / local dev. |
| **FOUNDER BOOTSTRAP IDENTITY** | | | | | | |
| `FOUNDER_EMAIL` | **Required for bootstrap** | Founder registered email | `founder@intellicoretechnologies.in` | No | Both | Primary Founder email address. |
| `FOUNDER_FIREBASE_UID` | **Required for bootstrap** | Firebase Console -> Authentication | `abcdef123456...` | No | Both | Primary Founder Firebase UID. |
| **PERSISTENT OBJECT STORAGE** | | | | | | |
| `STORAGE_PROVIDER` | Optional (default `local`) | Architecture setting | `vercel-blob` (prod) / `local` (dev) | No | Both | Storage adapter engine. |
| `BLOB_READ_WRITE_TOKEN`| **Required** if `STORAGE_PROVIDER=vercel-blob` | Vercel Dashboard -> Storage -> Blob | `vercel_blob_rw_xxxxxxxxxxxx` | **YES** | Production | Authentication token for private Vercel Blob store. |
| `UPLOAD_DIR` | Optional (default `./backend/uploads`) | Local filesystem setting | `./backend/uploads` | No | Local dev only | Disk storage directory for local Docker upload volume. |
| `TASK_MAX_FILE_SIZE_MB`| Optional (default 5) | Business rule setting | `5` (capped at 4 on Vercel) | No | Both | Max file size in megabytes for task attachments. |
| `TASK_MAX_ATTACHMENTS` | Optional (default 5) | Business rule setting | `5` | No | Both | Max number of attachment files per task submission. |
| **SCHEDULED JOBS (VERCEL CRON)** | | | | | | |
| `CRON_SECRET` | **Required** if Cron enabled | Generate random 32+ hex | `d4e5f6...` (32+ chars) | **YES** | Production | Bearer secret authenticating `/api/internal/notification-tick`. |
| `NOTIFICATION_CRON_ENABLED` | Optional (default `false`) | Project feature toggle | `true` / `false` | No | Production | Set `true` to activate scheduled background cron processing. |
| **TRANSACTIONAL EMAIL (SMTP)** | | | | | | |
| `EMAIL_DELIVERY_MODE` | Optional (default `CAPTURE`) | Delivery mode policy | `CAPTURE`, `DISABLED`, `SMTP` | No | Both | `CAPTURE` writes emails to outbox/preview without sending. |
| `EMAIL_SMTP_AUTHORIZED` | Optional (default `false`) | Owner authorization gate | `false` / `true` | No | Production | Set `true` only when real external sending is approved. |
| `SMTP_HOST` | Optional | Email provider (Hostinger/SES) | `smtp.hostinger.com` | No | Production | Outbound SMTP server hostname. |
| `SMTP_PORT` | Optional (default 587) | Email provider | `465` or `587` | No | Production | SMTP connection port (465 for SSL, 587 for TLS). |
| `SMTP_SECURE` | Optional (default false) | Email provider | `true` (for 465) / `false` (for 587) | No | Production | Whether to use SSL socket. |
| `SMTP_USER` | Optional | Email mailbox username | `notifications@intellicoretechnologies.in` | **YES** | Production | SMTP authentication username. |
| `SMTP_PASSWORD` | Optional | Email mailbox password | `<smtp_password>` | **YES** | Production | SMTP authentication password. |
| `EMAIL_FROM_NAME` | Optional | Branding preference | `IntelliCore Technologies` | No | Both | Sender display name. |
| `EMAIL_FROM_ADDRESS` | Optional | Mailbox configuration | `notifications@intellicoretechnologies.in` | No | Both | Sender from email address. |
| **SECURITY & CORS** | | | | | | |
| `CORS_ORIGIN` | **Required** | Production domain | `https://www.intellicoretechnologies.in` | No | Both | Allowed CORS origin. |
| `RATE_LIMIT_WINDOW_MS`| Optional (default 900000) | Rate limiter setting | `900000` (15 minutes) | No | Both | Rate limiting time window in milliseconds. |
| `RATE_LIMIT_MAX_REQUESTS`| Optional (default 100) | Rate limiter setting | `100` | No | Both | Max allowed requests per window per IP. |
| `SWAGGER_ENABLED` | Optional (default `false` in prod) | Security setting | `false` (prod) / `true` (dev) | No | Production | When `false`, `/api-docs` returns 404 in production. |

*\*Note: Either provide the individual `DB_*` variables OR provide `DATABASE_URL`.*

---

## 2. Minimal Vercel Production Environment Variables List

When deploying on Vercel, copy and paste this exact minimal list into **Vercel Dashboard** -> **Settings** -> **Environment Variables**:

```env
NODE_ENV=production
APP_BASE_URL=https://www.intellicoretechnologies.in
APP_TIMEZONE=Asia/Kolkata
LOG_LEVEL=info

DB_HOST=sqlxxx.main-hosting.eu
DB_PORT=3306
DB_NAME=u123456789_intellicore
DB_USER=u123456789_app
DB_PASSWORD=your_db_password
DB_SSL=true

FIREBASE_PROJECT_ID=intellicore-229
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@intellicore-229.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvg...-----END PRIVATE KEY-----\n"

FIREBASE_API_KEY=your_web_api_key
FIREBASE_AUTH_DOMAIN=intellicore-229.firebaseapp.com
FIREBASE_STORAGE_BUCKET=intellicore-229.firebasestorage.app
FIREBASE_MESSAGING_SENDER_ID=your_sender_id
FIREBASE_APP_ID=your_app_id

STORAGE_PROVIDER=vercel-blob
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_xxxxxxxxxxxx

CRON_SECRET=generate_random_32_hex_chars_here
NOTIFICATION_CRON_ENABLED=true
EMAIL_DELIVERY_MODE=CAPTURE

CORS_ORIGIN=https://www.intellicoretechnologies.in
FOUNDER_EMAIL=founder@intellicoretechnologies.in
FOUNDER_FIREBASE_UID=your_firebase_uid
```
