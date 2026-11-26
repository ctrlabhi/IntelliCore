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

### B. Backend API Rollback (Render Free Web Service)
1. **Trigger**: If the deployed cloud backend fails health probes or experiences unhandled runtime exceptions:
2. **Procedure**:
   - In Render Dashboard > `intellicore-api` > **Deploys**:
   - Click **Rollback** next to the previous known-good deployment.
   - Alternatively, click **Settings > Suspend Web Service** to immediately halt traffic without deleting the configuration.
3. **Local Failover**:
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
