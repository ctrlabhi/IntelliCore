# IntelliCore V2.0 — Free Hosting Compatibility Analysis

**Target Platform:** Render Free Web Service (ephemeral container, 0.1 CPU, 512 MB RAM)  
**Cost Constraint:** Strict **$0.00** additional cost  
**Excluded Services:** Vercel, paid databases, paid cloud storage, paid dedicated IPs, paid background workers

---

## 1. Executive Summary

This document evaluates the operational compatibility and security constraints of running the **IntelliCore V2.0 Express.js modular monolith** on a zero-cost cloud hosting tier (specifically Render Free Web Service), backed by the remote Hostinger MariaDB database (`srv1824.hstgr.io:3306`) and Firebase Auth Spark Plan ($0/month).

---

## 2. Feature-by-Feature Compatibility Matrix

| Feature Area | Free-Tier Status | Operational Impact | Zero-Cost Architecture Solution |
| :--- | :--- | :--- | :--- |
| **Express API Runtime** | **COMPATIBLE** | Full Node.js 24 + Express 5 execution. Automatically listens on `0.0.0.0` with dynamic `PORT`. | Configured via `render.yaml` with build command `npm install && npm run build:render`. |
| **Remote MariaDB Connectivity** | **COMPATIBLE** | Round-trip latency ~400–800ms across WAN. Outbound TLS on port 3306 is permitted. | Strict TLS (`sslaccept=strict`) enforced. Prisma pool capped (`connection_limit=2`) to preserve shared Hostinger connection limits (75 user max). Interactive transaction timeouts set to `maxWait: 15000, timeout: 30000`. |
| **Firebase Authentication** | **COMPATIBLE** | Token validation via Firebase Admin SDK over HTTPS (port 443). Free Spark plan ($0/mo). | Authorized domains include `intellicoretechnologies.in` and `*.onrender.com`. Firebase Admin private key loaded from environment variables. |
| **Uploaded Documents & Attachments** | **LIMITED (Ephemeral Disk)** | Render Free does not provide persistent disk volumes. Files uploaded to `backend/uploads/` vanish upon container spindown, redeployment, or restart. | For production persistence, use existing authorized cloud storage or local Docker Compose with persistent named volume `intellicore_uploads_data`. In ephemeral free web service, uploads function only within the active container session. |
| **Certificate PDFs** | **INVARIANT PRESERVED** | Intentionally disabled. Architectural rules strictly forbid in-app certificate generation, downloads, storage, and automated sending. | Negative certificate invariants verified (0 routes, 0 outbox jobs). In-app manual certificate status records dispatch declarations only. Zero storage or PDF compute impact. |
| **Profile Pictures** | **COMPATIBLE** | Stored as Firebase Auth photo URLs or external profile image links. | Zero local disk dependency. |
| **Zoho SMTP Email Delivery** | **BLOCKED (Outbound SMTP)** | Render Free blocks outbound TCP connections on ports **25, 465, and 587** to prevent email spam abuse. | The worker defaults to `CAPTURE` mode (`EMAIL_DELIVERY_MODE=CAPTURE`), logging outbox records in MySQL without external dispatch. If live email is required at $0 cost, run `notificationWorker.js` in the local Docker Compose stack or use an HTTP-based email API (port 443) when approved. |
| **Scheduled Notifications & Reminders** | **PARTIAL (Sleeps on Inactivity)** | Free web services spin down after 15 minutes of HTTP inactivity. In-memory timers (`setInterval`) pause while the container sleeps. | Event-driven actions (e.g. check-in on user login) work instantaneously. For scheduled ticks (`/api/internal/notification-tick`), trigger via zero-cost external webhook cron (e.g. cron-job.org) or run the worker continuously on local Docker Compose. |
| **Attendance Automation** | **COMPATIBLE** | Driven by user workspace access and explicit logout events within IST working hours (09:30–18:30 IST). | Server-side UTC-to-IST calculation runs inside Express request handlers on event receipt. Not dependent on persistent sleep state. |
| **Meeting Management & Meet Links** | **COMPATIBLE** | Scoped manual Google Meet links pasted by staff. | Stored in MySQL `meetings` table. Zero external cloud API dependency. |
| **Google Calendar Sync** | **DISABLED BY DEFAULT** | Disabled by policy (`GOOGLE_CALENDAR_ENABLED=false`). | Zero dependency on cloud background sync. |
| **Permanent Account Deletion** | **COMPATIBLE** | Executed transactionally in MySQL within the request cycle. Purges personal data, reassigns shared artifacts to Founder, unlinks storage, and revokes Firebase tokens. | Operates synchronously inside `POST /api/v1/users/:id/permanent-deletion`. |

---

## 3. Hostinger Remote Database Allowlisting

Because Render Free Web Services use dynamic IP pools (shared outbound IP addresses across AWS/GCP regions), Hostinger Remote MySQL access:
1. In Hostinger hPanel under **Databases > Remote MySQL**, Hostinger requires adding an IP or wildcard (`%`) to allow remote access.
2. The user `u740799251_intellicore` already has `GRANT ... TO 'u740799251_intellicore'@'%'`, allowing authenticated connections over TLS from any remote client with valid credentials.
3. TLS certificate validation (`sslaccept=strict`) ensures that communication is fully encrypted with Let's Encrypt CA validation, preventing eavesdropping and man-in-the-middle attacks across WAN.

---

## 4. Cold Start & Keep-Alive Policy

- **Cold Start Latency:** When waking from sleep, a Render Free service takes approximately 45–55 seconds to load the Node.js 24 runtime, initialize Express, and connect to MariaDB.
- **Rule Adherence:** Per project guidelines, **no artificial keep-alive pings** (e.g. automated uptime bots) will be configured to bypass free hosting limits. The 50-second wake latency on first request is documented as a known free-tier characteristic.
