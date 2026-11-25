# IntelliCore V2.0 — Vercel Cloud Deployment Guide

## 1. Overview & Architecture

IntelliCore V2.0 is designed as a high-performance **same-origin modular monolith** running on Node.js 24 LTS and Express 5. For cloud deployment:
- **Compute**: Vercel Serverless Functions (`app.js` entrypoint mounting Express 5).
- **Edge CDN**: Vercel Global Edge Network serving compiled static assets (`public/` directory).
- **Database**: Hostinger remote database (MySQL 8.4 LTS or MariaDB 10.6+) via Prisma ORM with strict TLS encryption.
- **Authentication**: Firebase Authentication (Identity-only; all roles, permissions, and business data live in MySQL).
- **Private Storage**: Private Vercel Blob store (`@vercel/blob`) with UUID access keys and role-gated streaming.
- **Background Processing**: Vercel Cron calling `/api/internal/notification-tick` with database-backed atomic leasing.

```mermaid
flowchart TD
    Client["Browser Client\n(www.intellicoretechnologies.in)"] --> CDN["Vercel Global Edge CDN\n(Static Assets /public)"]
    Client --> API["Vercel Serverless Function\n(Express 5 / app.js)"]
    API --> Firebase["Firebase Auth\n(Identity Only)"]
    API --> Hostinger["Hostinger Remote MySQL / MariaDB\n(Prisma ORM with TLS sslaccept=strict)"]
    API --> Blob["Vercel Blob Storage\n(Private Attachments)"]
    Cron["Vercel Cron Scheduler\n(/api/internal/notification-tick)"] --> API
```

---

## 2. Prerequisites Checklist

Before beginning deployment, ensure you have:
1. A **Vercel Account** ([vercel.com](https://vercel.com)).
2. A **Hostinger Account** with an active MySQL/MariaDB database and Remote MySQL access enabled.
3. Access to your **Firebase Console** ([console.firebase.google.com](https://console.firebase.google.com)) with your production project (`intellicore-229` or dedicated production project).
4. Access to your domain registrar DNS records for `www.intellicoretechnologies.in`.
5. Local Git repository up to date with verified commits.

---

## 3. Project Configuration on Vercel

### Step 3.1: Connect Your Repository to Vercel
1. Log in to the [Vercel Dashboard](https://vercel.com/dashboard).
2. Click **Add New...** -> **Project**.
3. Import your IntelliCore Git repository.

### Step 3.2: Configure Build & Output Settings
In the **Configure Project** screen, set:
- **Framework Preset**: `Express` (or `Other` if Express is not listed)
- **Root Directory**: `./` (leave default repository root)
- **Node.js Version**: `24.x` (navigate to Project Settings -> General -> Node.js Version after creation to confirm Node 24.x)
- **Build Command**: `npm run build` (executes `prisma generate && node scripts/build-vercel-assets.js`)
- **Output Directory**: Leave empty / default
- **Install Command**: `npm install`

---

## 4. Environment Variables Configuration in Vercel

Navigate to **Project Settings** -> **Environment Variables**. Add the following variables for the **Production** environment (and **Preview** if deploying a staging branch with an isolated staging database):

| Variable Name | Value / Placeholder | Sensitive? | Purpose |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | `production` | No | Enables production security guards and error sanitization |
| `APP_BASE_URL` | `https://www.intellicoretechnologies.in` | No | Canonical public domain |
| `APP_TIMEZONE` | `Asia/Kolkata` | No | Business calendar timezone |
| `LOG_LEVEL` | `info` | No | Structured logging level |
| `DB_HOST` | `sql123.main-hosting.eu` *(from Hostinger)* | No | Remote database host |
| `DB_PORT` | `3306` | No | Database port |
| `DB_NAME` | `u123456789_intellicore` *(from Hostinger)* | No | Database name |
| `DB_USER` | `u123456789_app` *(from Hostinger)* | No | Runtime database user |
| `DB_PASSWORD` | `<your_db_password>` | **YES** | Database user password |
| `DB_SSL` | `true` | No | Enforces `sslaccept=strict` |
| `FIREBASE_PROJECT_ID` | `intellicore-229` | No | Production Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | `firebase-adminsdk-xxxxx@...iam.gserviceaccount.com` | **YES** | Firebase Admin service account email |
| `FIREBASE_PRIVATE_KEY` | `"-----BEGIN PRIVATE KEY-----\nMIIEvg...-----END PRIVATE KEY-----\n"` | **YES** | Admin private key (newlines escaped with `\n`) |
| `FIREBASE_API_KEY` | `<your_production_web_api_key>` | No | Web Client API Key |
| `FIREBASE_AUTH_DOMAIN` | `intellicore-229.firebaseapp.com` | No | Firebase Auth domain |
| `FIREBASE_STORAGE_BUCKET` | `intellicore-229.firebasestorage.app` | No | Storage bucket name |
| `FIREBASE_MESSAGING_SENDER_ID`| `<sender_id>` | No | Firebase messaging sender ID |
| `FIREBASE_APP_ID` | `<app_id>` | No | Web App ID |
| `STORAGE_PROVIDER` | `vercel-blob` | No | Enables Vercel Blob cloud storage |
| `BLOB_READ_WRITE_TOKEN` | `<from_vercel_blob_store>` | **YES** | Automatically populated or pasted from Blob tab |
| `CRON_SECRET` | `<32_character_random_hex_string>` | **YES** | Authenticates scheduled Vercel Cron jobs |
| `NOTIFICATION_CRON_ENABLED` | `true` | No | Enables the `/api/internal/notification-tick` endpoint |
| `EMAIL_DELIVERY_MODE` | `CAPTURE` | No | Safe capture default (no outgoing SMTP without approval) |
| `CORS_ORIGIN` | `https://www.intellicoretechnologies.in` | No | Restricts CORS to the production origin |
| `FOUNDER_EMAIL` | `founder@intellicoretechnologies.in` | No | Primary Founder email address |
| `FOUNDER_FIREBASE_UID` | `<your_firebase_uid>` | No | Primary Founder Firebase UID |

> [!IMPORTANT]
> **Database Credentials Note**: You can either enter individual `DB_*` variables as shown above (beginner-friendly), OR provide the complete `DATABASE_URL` connection string:
> `mysql://u123456789_app:<password>@sql123.main-hosting.eu:3306/u123456789_intellicore?sslaccept=strict&connection_limit=2&connect_timeout=5&pool_timeout=5`

---

## 5. Provisioning Vercel Blob Storage

Because Vercel Serverless Functions have ephemeral filesystems, durable private file attachments (task deliverables, assignments) require cloud storage:
1. In the Vercel Dashboard, click the **Storage** tab.
2. Click **Create Database** -> Select **Blob**.
3. Name your store (e.g. `intellicore-storage`).
4. Choose the region matching your deployment.
5. In **Store Settings**, make sure access is set to **Private**.
6. Connect the store to your project. Vercel will automatically inject `BLOB_READ_WRITE_TOKEN`.

---

## 6. Configuring Vercel Cron & Scheduling

The background notification worker is integrated via Vercel Cron:
- `vercel.json` contains:
  ```json
  "crons": [
    {
      "path": "/api/internal/notification-tick",
      "schedule": "0 0 * * *"
    }
  ]
  ```
- Each tick executes scheduled announcements, meeting reminders, task due-date notifications, and email outbox processing with atomic database leasing (`NotificationCronState`).
- The execution is strictly bounded to 45 seconds to prevent function timeouts.

### Hobby (Free) Plan vs Pro Plan Notice
> [!WARNING]
> **Vercel Cron Schedule Limits**:
> - **Vercel Pro Plan ($20/month)** supports minute-by-minute crons (`* * * * *`).
> - **Vercel Hobby (Free) Plan** allows crons to run **at most once per day** (`0 0 * * *`).
>
> **Zero-Cost Workaround for Hobby Plan**:
> If running on the Free Hobby plan, set `schedule: "0 0 * * *"` in `vercel.json`, and set up a free external scheduled runner (such as a GitHub Actions scheduled workflow or free [cron-job.org](https://cron-job.org)) that sends an HTTP GET request every 1 or 5 minutes to:
> `https://www.intellicoretechnologies.in/api/internal/notification-tick`
> with header:
> `Authorization: Bearer <your_CRON_SECRET>`

---

## 7. Custom Domain Setup (`www.intellicoretechnologies.in`)

1. In Vercel Project Settings, navigate to **Domains**.
2. Add both:
   - `www.intellicoretechnologies.in`
   - `intellicoretechnologies.in` (redirects to `www.intellicoretechnologies.in`)
3. In your Domain Registrar DNS Management (Hostinger / GoDaddy):
   - Add a **CNAME** record:
     - **Host / Name**: `www`
     - **Points to / Target**: `cname.vercel-dns.com`
     - **TTL**: `3600` (or Automatic)
   - Add an **A** record for apex domain:
     - **Host / Name**: `@`
     - **Points to**: `76.76.21.21` (Vercel IP)
4. Vercel automatically provisions and renews free SSL/TLS certificates via Let's Encrypt.

---

## 8. Firebase Authorized Domains

To ensure Google Sign-In and email verification work on the live domain:
1. Open the [Firebase Console](https://console.firebase.google.com).
2. Select your production project (`intellicore-229`).
3. Navigate to **Authentication** -> **Settings** -> **Authorized domains**.
4. Click **Add domain** and enter:
   - `www.intellicoretechnologies.in`
   - `intellicoretechnologies.in`
   - `<your-project-name>.vercel.app`

---

## 9. Verification & Acceptance Testing

Once deployed, execute the following verification steps:
1. **Liveness**: Navigate to `https://www.intellicoretechnologies.in/health` -> Expect HTTP 200 `{ "status": "UP" }`.
2. **Readiness**: Navigate to `https://www.intellicoretechnologies.in/ready` -> Expect HTTP 200 `{ "status": "READY", "database": "CONNECTED" }`.
3. **Public Homepage**: Navigate to `https://www.intellicoretechnologies.in/` -> Expect responsive landing page with full CSS and navigation.
4. **Notes AI**: Navigate to `https://www.intellicoretechnologies.in/pages/notes.html` -> Expect interactive Notes AI with YouTube transcription and 10% watermark PDF preview.
5. **Authentication**: Open the Sign-In modal -> Sign in with authorized Founder account -> Verify seamless dashboard redirection to `/dashboards/founder`.
6. **Background Cron**: Verify a test tick:
   ```bash
   curl -i -H "Authorization: Bearer <CRON_SECRET>" https://www.intellicoretechnologies.in/api/internal/notification-tick
   ```
   Expect HTTP 200 `{ "status": "OK" }`.
