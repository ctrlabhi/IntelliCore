# IntelliCore Windows Setup & Operations Guide

**Application Version:** 2.0.0  
**Target OS:** Windows 11 / Windows 10  
**Requirements:** Docker Desktop, Node.js 24 LTS, PowerShell 5.1+  

---

## 1. Prerequisites Installation

1. **Docker Desktop for Windows:**
   - Download and install from [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop).
   - Ensure the WSL 2 backend is enabled.
   - Start Docker Desktop and verify the whale icon appears in your Windows system tray.
2. **Node.js 24 LTS (Optional on host, required for local script validation):**
   - Download from [nodejs.org](https://nodejs.org).
   - Verify installation: `node -v` (should report `v24.x`).

---

## 2. One-Click Initialization (`scripts/setup.ps1`)

Open PowerShell in the project root directory (`d:\IntelliCore\Website\IntelliCore`):

```powershell
.\scripts\setup.ps1
```

### What `setup.ps1` Does:
1. Validates that Docker CLI and Docker Engine are running.
2. Checks for Docker Compose capability.
3. Creates required local directory paths (`backups/`, `secrets/`, `backend/uploads/`).
4. Generates a secure `.env` file from `.env.example` with cryptographically secure random passwords if one does not already exist.
5. Validates the `docker-compose.yml` configuration.
6. Displays next steps.

---

## 3. Starting the Application (`scripts/start.ps1`)

Schema deployment runs separately from the web process. For a new development schema, prepare MySQL and the dedicated migration account, then build, migrate and seed before starting the application. For a populated database, verify its identity and ledger and complete the approved backup before applying changes. Use the schema-scoped migration credential in the ignored `.env`. The worker uses a separate table-scoped credential.

```powershell
docker compose up -d mysql
docker compose build app
docker compose --profile maintenance run --rm migrate
docker compose run --rm --no-deps app node prisma/seed.js
```

An unfinished historical ledger entry requires inspection before deployment. The application entrypoint starts the web process with its runtime identity. The worker starts through the optional Compose profile after the schema is ready. [Worker setup](BACKGROUND_PROCESSING.md).

To build container images and start all services in the background:

```powershell
.\scripts\start.ps1
```

Once started:
- **Public Website & Application:** [http://localhost:3000](http://localhost:3000)
- **API Version 1:** [http://localhost:3000/api/v1](http://localhost:3000/api/v1)
- **Interactive Swagger Documentation:** [http://localhost:3000/api-docs](http://localhost:3000/api-docs)
- **Health Check:** [http://localhost:3000/health](http://localhost:3000/health)
- **Readiness Check (Database Verified):** [http://localhost:3000/ready](http://localhost:3000/ready)
- **phpMyAdmin Database GUI:** [http://localhost:8080](http://localhost:8080)

---

## 4. Stopping the Application (`scripts/stop.ps1`)

To stop all services gracefully without losing any database data:

```powershell
.\scripts\stop.ps1
```

> [!NOTE]
> Persistent database records are safely retained in the `mysql_data` Docker volume.

---

## 5. Database Administration (phpMyAdmin)

1. Open your browser and navigate to: **[http://localhost:8080](http://localhost:8080)**
2. Log in using the credentials configured in your `.env`:
   - **Server:** `mysql`
   - **Username:** `intellicore_app`
   - **Password:** `<Value of MYSQL_PASSWORD in .env>`
3. You can visually inspect the `intellicore_db` database, view tables (such as `system_settings`), run SQL queries, and export database dumps.

---

## 6. Backups & Disaster Recovery

### Creating a Database Backup
```powershell
.\scripts\backup.ps1
```
Creates a compressed SQL dump inside the `backups/` directory.

### Restoring from a Backup
```powershell
.\scripts\restore.ps1 -BackupFile "backups\db-backup-YYYYMMDD-HHMMSS.sql"
```
Prompts for explicit confirmation before restoring data.

---

## 7. Troubleshooting Common Errors

### "Docker CLI is not recognized"
- Ensure Docker Desktop is installed.
- Add Docker to your user PATH: `C:\Program Files\Docker\Docker\resources\bin`.
- Restart your PowerShell terminal.

### "Port 3000 is already in use"
- Check what process is occupying port 3000: `netstat -ano | findstr :3000`.
- Terminate the conflicting process or change `PORT=3000` in `.env`.

### "Database connection error (503 Service Unavailable)"
- Check container status: `docker compose ps`.
- Check database logs: `docker compose logs mysql --tail=50`.
- Confirm `mysql` health status is `healthy`.

