# IntelliCore Architecture Specification

**Application Version:** 2.0.0  
**Architecture Pattern:** Modular Monolith  
**Runtime:** Node.js 24 LTS with Express.js 5  
**Database:** MySQL 8.4 LTS via Prisma ORM  
**Target Environment:** Local Development / Docker  
**Timezone:** Asia/Kolkata (`+05:30`)  

---

## 1. Architectural Principles

IntelliCore 2.0.0 is architected as a **Single Repository Modular Monolith**. It consolidates the previously fragmented frontend and serverless cloud functions into a unified, maintainable, containerized system.

### Key Architectural Tenets:
1. **Single Origin Model:**
   - Both the static frontend application and the REST API are served from the same HTTP origin (`http://localhost:3000`).
   - This eliminates complex CORS issues in local development and standardizes reverse proxy deployment in production.
2. **Modular Encapsulation:**
   - The backend code (`backend/src/modules/`) is split into independent feature domains (auth, users, roles, departments, internships, attendance, leaves, tasks, reports, learning, meetings, certificates, announcements, notifications, dashboard, files, audit, settings).
   - In Phase 1, the infrastructure foundation is established with minimal coupling. Domain business logic is prepared for incremental implementation in subsequent phases.
3. **Layered Separation of Concerns:**
   - **Routes Layer:** HTTP request parsing, route guards, input validation (Zod).
   - **Controller Layer:** Orchestration and standardized HTTP response generation.
   - **Service Layer:** Pure business logic and transactions.
   - **Data Access Layer:** Prisma Client communicating with MySQL 8.4 LTS.
4. **Resilient Local Infrastructure:**
   - Powered by Docker Desktop and Docker Compose.
   - Multi-container architecture isolating the Application, MySQL Database, and phpMyAdmin.
   - Persistent named Docker volumes for zero data loss during restarts.

---

## 2. System Architecture Diagram

```
+-----------------------------------------------------------------------------------+
|                                  USER BROWSER                                     |
|  +--------------------------------+          +---------------------------------+  |
|  |       Public Landing Page      |          |       Internal Dashboards       |  |
|  |     (HTML5 / CSS3 / Vanilla)   |          |  (Founder, HR, TL, Intern, AI)  |  |
|  +--------------------------------+          +---------------------------------+  |
|                                     \      /                                      |
|                             http://localhost:3000                                 |
+---------------------------------------\--/----------------------------------------+
                                         ||
                                         \/
+-----------------------------------------------------------------------------------+
|                           DOCKER CONTAINER: app                                   |
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  |                         EXPRESS.JS 5 APPLICATION                            |  |
|  |                                                                             |  |
|  |  [Security Middlewares]                                                     |  |
|  |  - Helmet (CSP, HSTS, frameguard, etc.)                                     |  |
|  |  - Express Rate Limit                                                       |  |
|  |  - Request ID (UUID) & Pino Structured Logger                               |  |
|  |                                                                             |  |
|  |  [Routing Subsystems]                                                       |  |
|  |  - Static Asset Server (/assets, /pages, backward-compatible aliases)       |  |
|  |  - API Gateway: /api/v1 (RESTful endpoints, Zod validation)                 |  |
|  |  - Swagger Documentation: /api-docs                                         |  |
|  |  - Health & Readiness Probes: /health, /ready, /api/v1/health               |  |
|  +-----------------------------------------------------------------------------+  |
|                                         ||                                        |
|                               [Prisma ORM Client]                                 |
+-----------------------------------------\-----------------------------------------+
                                           ||
                                (Internal Docker Network)
                                           ||
                                           \/
+-----------------------------------------------------------------------------------+
|                          DOCKER CONTAINER: mysql                                  |
|                                                                                   |
|  MySQL 8.4 LTS Server                                                             |
|  - Database: intellicore_db                                                       |
|  - Dedicated App User: intellicore_app (Restricted Privileges)                    |
|  - Character Set: utf8mb4 / Collation: utf8mb4_unicode_ci                         |
|  - Named Persistent Volume: mysql_data                                            |
+-----------------------------------------------------------------------------------+
                                           ||
                                (Internal Docker Network)
                                           ||
                                           \/
+-----------------------------------------------------------------------------------+
|                        DOCKER CONTAINER: phpmyadmin                               |
|                                                                                   |
|  phpMyAdmin Web GUI (http://localhost:8080)                                       |
|  - Direct visual management for intellicore_db                                    |
|  - Authenticated via intellicore_app credentials                                  |
+-----------------------------------------------------------------------------------+
```

---

## 3. Directory Layout Specification

```
IntelliCore/
├── frontend/                     # Pure static client assets
│   ├── index.html                # Main public landing page
│   ├── pages/                    # Sub-pages and dashboards
│   │   ├── notes.html            # AI notes studio
│   │   ├── 404.html              # Custom not-found error page
│   │   └── dashboards/
│   │       ├── founder/          # Founder Command Center
│   │       ├── hr/               # HR Operations Dashboard
│   │       ├── team-leader/      # Team Leader Dashboard
│   │       └── intern/           # Intern Workspace Dashboard
│   ├── components/               # Modular reusable UI widgets
│   ├── services/                 # Frontend client services
│   │   ├── api.js                # Universal API fetch client
│   │   ├── auth.js               # Safe dev authentication stub
│   │   └── firebase.js           # Isolated Firebase placeholder
│   └── assets/                   # Public static media & code
│       ├── css/                  # Stylesheets
│       ├── js/                   # Client scripts
│       ├── images/               # Photographic assets & brand logos
│       └── icons/                # Vector icons
├── backend/                      # Node.js 24 + Express 5 Server
│   ├── src/
│   │   ├── config/               # App configuration & env validation
│   │   ├── middleware/           # Security, logging, errors, rate limits
│   │   ├── modules/              # 18 modular monolith feature domains
│   │   ├── integrations/         # Storage, email, calendar abstractions
│   │   ├── jobs/                 # Cron & background worker hooks
│   │   ├── utils/                # Response helpers, custom errors, timezone
│   │   ├── routes/               # API routes & Swagger setup
│   │   ├── app.js                # Express app factory & middleware stack
│   │   └── server.js             # HTTP server entrypoint & graceful shutdown
│   └── Dockerfile                # Multi-stage reproducible container image
├── prisma/                       # Database schema & migrations
│   ├── schema.prisma             # Declarative MySQL schema
│   ├── migrations/               # Version-controlled SQL migrations
│   └── seed.js                   # Idempotent database seeder
├── tests/                        # Automated testing suite
│   ├── unit/                     # Unit tests
│   └── integration/              # Supertest HTTP integration tests
├── templates/                    # Server-rendered email & cert templates
│   ├── emails/
│   └── certificates/
├── scripts/                      # Windows PowerShell operations
│   ├── setup.ps1                 # Environment initialization & validation
│   ├── start.ps1                 # Container startup
│   ├── stop.ps1                  # Container graceful shutdown
│   ├── backup.ps1                # Database & files backup
│   └── restore.ps1               # Controlled point-in-time restore
├── secrets/                      # Excluded credentials directory
├── backups/                      # Excluded database snapshots
├── docs/                         # System documentation
├── docker-compose.yml            # Multi-service infrastructure definition
├── .env.example                  # Documented environment blueprint
├── .gitignore                    # Git exclusions
├── .dockerignore                 # Docker context exclusions
├── package.json                  # Root project manifest (ES Modules)
└── README.md                     # Project overview and quick start guide
```

---

## 4. Operational Boundaries for Phase 1

- **Scope Delimitation:** Phase 1 delivers strictly the foundation, container infrastructure, database integration, API harness, static asset reorganization, and operational documentation.
- **Business Modules:** Business logic (full RBAC enforcement, dynamic attendance tracking, automatic leave approval workflows, certificate compilation) is intentionally stubbed or documented for Phase 2 implementation.
- **Firebase Isolation:** The legacy production Firebase configuration is strictly isolated from the local runtime environment.

