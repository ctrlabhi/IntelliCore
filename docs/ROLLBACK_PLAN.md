# IntelliCore V2.0 — Production Rollback Plan

**Target Application:** IntelliCore V2.0 Modular Monolith  
**Objective:** Provide instant, non-destructive rollback procedures in the event of an unexpected regression during or after cloud deployment.

---

## 1. Rollback Scenarios & Triggers

| Trigger | Critical Condition | Action Required |
| :--- | :--- | :--- |
| **Backend Unhealthy** | `/ready` returns 503 or fails to connect to MariaDB | Roll back backend deployment or suspend Render service. |
| **Authentication Failure** | Google Auth token validation fails or CORS errors on live domain | Revert frontend API base URL or update Render CORS settings. |
| **Database Corruption / Data Issue** | Accidental schema alteration or corrupted records | Restore database from `backups/hostinger-production-backup.sql`. |

---

## 2. Component Rollback Procedures

### A. Frontend Rollback (GitHub Pages)
1. **Trigger**: If frontend changes produce visual or authentication regressions on `https://www.intellicoretechnologies.in`:
2. **Procedure**:
   ```bash
   # Revert frontend commit
   git revert <commit-hash>
   # Or switch window.__INTELLICORE_API_BASE_URL__ back to local fallback
   ```
3. **Recovery Time**: < 2 minutes (GitHub Pages re-publishes static commits instantly).
4. **Safety Guarantee**: The existing CNAME file (`intellicoretechnologies.in`) and GoDaddy DNS records are untouched and remain permanently pointed to GitHub Pages.

---

### B. Backend API Rollback (Vercel & Render)
1. **Trigger**: If the deployed cloud backend fails health probes or experiences unhandled runtime exceptions:
2. **Procedure for Vercel Backend (`https://intellicore-six.vercel.app`)**:
   - In Vercel Dashboard > `intellicore` > **Deployments**:
   - Locate the previous known-good deployment (e.g. commit `b10c5eb`).
   - Click the three dots menu `...` > **Promote to Production** (instant zero-downtime rollback).
   - If an immediate halt of external traffic is required: remove `DATABASE_URL` or redeploy a paused maintenance build.
3. **Procedure for Render Free Alternative**:
   - In Render Dashboard > `intellicore-api` > **Deploys**:
   - Click **Rollback** next to the previous deployment, or click **Settings > Suspend Web Service**.
4. **Local Failover**:
   - Start local backend container if needed:
     ```bash
     docker compose up -d app
     ```

---

### C. Database Rollback (Hostinger Remote MariaDB)
1. **Trigger**: If an unintended schema drift or data corruption occurs on the remote database:
2. **Pre-Requisite**: Verified backup file `backups/hostinger-production-backup.sql` (126.95 KB, 1,792 SQL lines).
3. **Execution Command**:
   ```bash
   # Execute restore using mysql client through local Docker or direct MariaDB CLI:
   docker exec -i intellicore_mysql mysql \
     -h srv1824.hstgr.io \
     -P 3306 \
     -u u740799251_intellicore \
     -p"<DB_PASSWORD>" \
     --ssl-mode=REQUIRED \
     u740799251_intellicore < backups/hostinger-production-backup.sql
   ```
4. **Post-Restore Verification**:
   ```bash
   node scripts/verify-hostinger-db.js
   ```

---

## 3. Communication & Incident Logging
- Any rollback action must be documented immediately in `docs/PROJECT_PROGRESS.md`.
- No destructive commands (`DROP DATABASE`, `TRUNCATE TABLE`, `docker compose down -v`) are ever permitted.

---

## 4. Pre-Vercel Cutover Backup & GoDaddy DNS Rollback Snapshot (2026-11-27)

### A. Pre-Migration Production Baseline
- **GitHub Pages Live Branch (`main`)**: `b10c5eb` (untouched)
- **Vercel Pre-Migration Production Deployment**: Deployment ID `3tocvLQH2DJ1FcJx3bkFmV4FAGp9` (`intellicore-six.vercel.app`, commit `b10c5eb`, ready at `2026-11-26T09:01Z`)
- **Database Backup**: `backups/pre-vercel-migration-20261127.sql` (`126.95 KB`, exported from `srv1824.hstgr.io:3306` / `u740799251_intellicore` via `--ssl-mode=REQUIRED --single-transaction`; 49 tables, 11 migrations, 1 `FOUNDER` user)

### B. GoDaddy Authoritative Zone Snapshot (`intellicoretechnologies.in`, NS: `ns13.domaincontrol.com`, `ns14.domaincontrol.com`)
Use these exact records to restore GitHub Pages static hosting if DNS rollback is required (`~10–60 min` propagation based on TTL):

| Type | Name | Value | Priority | TTL | Category |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `A` | `@` | `185.199.108.153` | — | `600s` | GitHub Pages Apex |
| `A` | `@` | `185.199.109.153` | — | `600s` | GitHub Pages Apex |
| `A` | `@` | `185.199.110.153` | — | `600s` | GitHub Pages Apex |
| `A` | `@` | `185.199.111.153` | — | `600s` | GitHub Pages Apex |
| `CNAME` | `www` | `ctrlabhi.github.io.` | — | `3600s` | GitHub Pages `www` |
| `CNAME` | `rsend` | `rsend-apne1.forge.rmta.net.` | — | `3600s` | Mail Relay / Sending (Preserve) |
| `CNAME` | `send` | `send.forge.rmta.net.` | — | `3600s` | Mail Relay / Sending (Preserve) |
| `CNAME` | `_domainconnect` | `_domainconnect.gd.domaincontrol.com.` | — | `3600s` | GoDaddy Domain Connect (Preserve) |
| `MX` | `@` | `mx.zoho.in.` | `10` | `600s` | Zoho Mail (Never Modify) |
| `MX` | `@` | `mx2.zoho.in.` | `20` | `600s` | Zoho Mail (Never Modify) |
| `MX` | `@` | `mx3.zoho.in.` | `50` | `600s` | Zoho Mail (Never Modify) |
| `TXT` | `@` | `google-site-verification=jX4AO8NUl7Cqy3rH2jIPYJaABONn1sySlpIZ6q5FlOo` | — | `3600s` | Google Search Console (Never Modify) |
| `TXT` | `@` | `v=spf1 include:dc-8e814c8572._spfm.intellicoretechnologies.in ~all` | — | `3600s` | SPF Root (Never Modify) |
| `TXT` | `@` | `zoho-verification=zb92602805.zmverify.zoho.in` | — | `600s` | Zoho Verification (Never Modify) |
| `TXT` | `dc-8e814c8572._spfm` | `v=spf1 include:zoho.in ~all` | — | `3600s` | SPF Macro (Never Modify) |
| `TXT` | `resend._domainkey` | `p=MIGfMA0GCSqGSIb3...IDAQAB` | — | `3600s` | DKIM Key (Never Modify) |
| `TXT` | `zoho._domainkey` | `v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3...IDAQAB` (2 records) | — | `3600s` / `600s` | Zoho DKIM (Never Modify) |
| `TXT` | `_dmarc` | `v=DMARC1; p=quarantine; adkim=r; aspf=r; rua=mailto:dmarc_rua@onsecureserver.net;` | — | `3600s` | DMARC Policy (Never Modify) |

### C. DNS Cutover Rollback Steps
1. Delete the Vercel `A` (`@`) and `CNAME` (`www`) records in GoDaddy DNS Management.
2. Restore the 4 GitHub Pages `A` (`@` -> `185.199.108–111.153`, TTL `600s`) and `CNAME` (`www` -> `ctrlabhi.github.io.`, TTL `3600s`) records above (and remove any temporary Vercel `_vercel` verification TXT if no longer needed).
3. Remove `intellicoretechnologies.in` and `www.intellicoretechnologies.in` from Vercel Project Domains if reverting permanently to GitHub Pages, while leaving all `MX`, `SPF`, `DKIM`, `DMARC`, and Google Search Console `TXT` records untouched.
