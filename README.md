# IntelliCore — Modular Monolith Platform

**Application Version:** 2.0.0  
**Target Environment:** Local Development / Windows 11  
**Architecture:** Single Repository Modular Monolith  
**Tech Stack:** Node.js 24 LTS, Express.js 5, MySQL 8.4 LTS, Prisma ORM, Docker Compose, phpMyAdmin  

---

## 🌟 Overview

IntelliCore 2.0.0 is an enterprise-grade IT startup platform engineered as a secure, maintainable **Modular Monolith**. It unites the existing client web application, student onboarding, curriculum tracks, and internal dashboards into a single origin development environment backed by a containerized MySQL database and managed by Prisma ORM.

---

## 🚀 Quick Start Guide (Windows)

This project is configured for effortless operation on Windows. You **do not** need to install MySQL, PHP, or phpMyAdmin on your host machine — everything runs inside isolated Docker containers.

### Prerequisites:
1. **Docker Desktop for Windows:** [Download Docker Desktop](https://www.docker.com/products/docker-desktop).
   - Ensure Docker Desktop is installed and running (whale icon in system tray).
2. **Node.js 24 LTS (Optional on host):** [Download Node.js](https://nodejs.org).

---

### Step 1: Initialize the Environment (`setup.ps1`)

Open PowerShell in the project directory (`d:\IntelliCore\Website\IntelliCore`) and run:

```powershell
.\scripts\setup.ps1
```

**What this does automatically:**
- Verifies Docker CLI and Docker Engine availability.
- Generates a secure, cryptographically random `.env` file from `.env.example` (if one doesn't exist).
- Creates persistent storage folders (`backups/`, `secrets/`, `backend/uploads/`).
- Validates your `docker-compose.yml` configuration.

---

### Step 2: Start All Services (`start.ps1`)

```powershell
.\scripts\start.ps1
```

Docker will build the application image, pull MySQL 8.4 and phpMyAdmin, run initial Prisma migrations, and start all services in the background.

---

### Step 3: Accessing the Application

Once started, the following services are live:

| Service / Tool | URL | Description |
| :--- | :--- | :--- |
| **Public Website** | [http://localhost:3000](http://localhost:3000) | Main landing page, courses, track roadmap, team |
| **Founder Command Center** | [http://localhost:3000/founder-dashboard.html](http://localhost:3000/founder-dashboard.html) | Founder management & administration |
| **HR Operations Dashboard** | [http://localhost:3000/hr-dashboard.html](http://localhost:3000/hr-dashboard.html) | Intern roster & attendance oversight |
| **Team Leader Dashboard** | [http://localhost:3000/tl-dashboard.html](http://localhost:3000/tl-dashboard.html) | Domain track mentoring & task review |
| **Intern Workspace** | [http://localhost:3000/Intern-dashboard.html](http://localhost:3000/Intern-dashboard.html) | Intern tasks, attendance, and progress |
| **AI Notes Studio** | [http://localhost:3000/notes.html](http://localhost:3000/notes.html) | Video-to-notes generator with PDF export |
| **REST API Gateway** | [http://localhost:3000/api/v1](http://localhost:3000/api/v1) | Versioned REST API entrypoint |
| **Swagger API Docs** | [http://localhost:3000/api-docs](http://localhost:3000/api-docs) | Interactive OpenAPI 3.0 specification |
| **Liveness Check** | [http://localhost:3000/health](http://localhost:3000/health) | Application process health probe |
| **Readiness Check** | [http://localhost:3000/ready](http://localhost:3000/ready) | Active database connection probe |
| **phpMyAdmin Web GUI** | [http://localhost:8080](http://localhost:8080) | Visual MySQL database management |

---

## 🛑 Stopping the Application (`stop.ps1`)

To stop all running containers safely without losing any database records:

```powershell
.\scripts\stop.ps1
```

> [!NOTE]
> All MySQL tables and uploaded documents are safely persisted inside Docker named volumes (`intellicore_mysql_data` and `intellicore_uploads_data`).

---

## 🗄️ Database Administration (phpMyAdmin)

1. Open your browser and navigate to: **[http://localhost:8080](http://localhost:8080)**
2. Log in using your credentials from `.env`:
   - **Server:** `mysql`
   - **Username:** `intellicore_app`
   - **Password:** As set in your `.env` (`MYSQL_PASSWORD`)
3. Inside phpMyAdmin, you can:
   - Browse tables in `intellicore_db`.
   - Inspect the `system_settings` table and verify seeded infrastructure settings.
   - Run custom SQL queries.
   - Export database dumps.

---

## 💾 Backups & Disaster Recovery

### Create a Database Backup:
```powershell
.\scripts\backup.ps1
```
Creates a timestamped SQL dump in the `backups/` directory (e.g. `backups/db-backup-20261124-120000.sql`).

### Restore from a Backup:
```powershell
.\scripts\restore.ps1 -BackupFile "backups\db-backup-YYYYMMDD-HHMMSS.sql"
```
Prompts for explicit confirmation before restoring data to prevent accidental overwrites.

---

## 🧪 Running Automated Tests

To execute the test suite (Vitest and Supertest):

```powershell
npm test
```

This validates:
- Application startup and HTTP listeners
- API health and readiness probes
- Security headers and rate limiting
- Sensitive file access blocks (`.env`, `prisma/`)
- Static site routing and dashboard aliases

---

## 🔍 Checking Application Logs

```powershell
# View logs from all services:
docker compose logs -f

# View application server logs only:
docker compose logs -f app

# View MySQL database logs only:
docker compose logs -f mysql
```

---

## 📚 Complete Project Documentation

Detailed technical documentation is maintained in the `docs/` directory:
- [docs/PROJECT_AUDIT.md](docs/PROJECT_AUDIT.md) — Comprehensive pre-migration codebase audit
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — Modular Monolith architectural specification
- [docs/SETUP.md](docs/SETUP.md) — Detailed Windows installation and troubleshooting guide
- [docs/DATABASE.md](docs/DATABASE.md) — Database schema, Prisma migrations, and conventions
- [docs/API.md](docs/API.md) — REST API endpoints, schemas, and Swagger usage
- [docs/SECURITY.md](docs/SECURITY.md) — Hardening policies, CSP, rate limiting, and secret management
- [docs/TESTING.md](docs/TESTING.md) — Automated testing guide and test scenarios
- [docs/BUSINESS_RULES.md](docs/BUSINESS_RULES.md) — Approved business logic specification for future phases

---

## 🛡️ License & Copyright

&copy; 2026 **IntelliCore Technologies**. All rights reserved.

