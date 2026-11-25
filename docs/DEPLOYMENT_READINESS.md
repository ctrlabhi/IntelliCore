# Production deployment readiness checklist

## 1. Architecture & Security Review

- [x] **Modular Monolith Integrity**: Single deployable Express 5 codebase with integrated static asset serving.
- [x] **Zero Frontend Frameworks**: Pure HTML5/CSS/Vanilla JS frontend with no compilation or bundling dependencies.
- [x] **Database Isolation**: MySQL 8.4 LTS configured with persistent named volumes and strict user privilege separation.
- [x] **RBAC Ceilings**: Strict server-side role enforcement with Founder-only privilege for permanent deletions and staff activations.
- [x] **Negative Certificate Invariant**: Exactly 0 certificate PDFs, downloads, QR codes, or outbox jobs.
- [x] **Session Security**: Token freshness validation, immediate refresh token revocation, and multi-point logout.
- [x] **Input Validation**: Strict Zod schemas with sanitized error outputs across 100% of API endpoints.
- [x] **HTTP Hardening**: Helmet security headers, strict Content Security Policy, HSTS, no-sniff, and XSS filtering.

---

## 2. Environment Variables Checklist

Prior to staging or production release, verify the following configuration values:

```ini
# Core Environment
NODE_ENV=production
PORT=3000
APP_URL=https://intellicore.org

# Database Credentials (Use dedicated production user)
DATABASE_URL="mysql://intellicore_prod:STRONG_SECRET@db-host:3306/intellicore_db"

# Storage Subsystem
UPLOAD_DIR="/var/lib/intellicore/storage"

# Security & CORS
CORS_ORIGIN="https://intellicore.org"
SESSION_SECRET="STRONG_RANDOM_SESSION_SECRET_64_CHARS"

# Firebase Identity
FIREBASE_PROJECT_ID="intellicore-229"
FIREBASE_CLIENT_EMAIL="firebase-adminsdk@intellicore-229.iam.gserviceaccount.com"
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Email Configuration
EMAIL_MODE=LIVE
SMTP_HOST=smtp.provider.com
SMTP_PORT=587
SMTP_USER=notifications@intellicore.org
SMTP_PASS=STRONG_SMTP_PASSWORD
SMTP_FROM="IntelliCore <notifications@intellicore.org>"
```

---

## 3. Production Deployment Steps

1. **Host Provisioning**: Provision Linux server (Ubuntu 24.04 LTS or Debian 12) with Docker and Docker Compose v2.
2. **Reverse Proxy & SSL**: Configure Nginx or Caddy with TLS 1.3 certificates (Let's Encrypt).
3. **Volume Persistence**: Mount external persistent storage for MySQL (`/var/lib/mysql`) and uploaded files (`/var/lib/intellicore/storage`).
4. **Deploy Migrations**:
   ```bash
   npx prisma migrate deploy
   ```
5. **Start Application**:
   ```bash
   docker compose -f docker-compose.prod.yml up -d
   ```
6. **Verify Readiness**:
   - Check probe: `curl -I https://intellicore.org/health`
   - Check database: `curl -I https://intellicore.org/ready`
7. **Execute Initial Backup**: Run automated backup and verify SHA-256 archive checksum.
