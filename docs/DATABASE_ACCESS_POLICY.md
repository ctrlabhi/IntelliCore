# IntelliCore V2.0 — External Database Access Policy & Credential Security Notice

**Document Date:** 2026-11-26 (Asia/Kolkata)  
**Classification:** Operational Security & Architecture Policy  
**Target Database:** Hostinger Remote MariaDB 11.8.9 (`srv1824.hstgr.io:3306`)  
**Database Name:** `u740799251_intellicore`  
**User:** `u740799251_intellicore`  

---

## 1. Hosting Ownership & Boundary Policy

Per explicit clarification from the IntelliCore project owner:
1. **Ownership Boundary**: The remote MariaDB database is hosted on a separate external Hostinger hosting account (`u740799251`). The IntelliCore project owner does not hold administrative credentials or dashboard access to that Hostinger account.
2. **Authorized Operational Scope**: Connection credentials were provided to IntelliCore strictly for application development, schema migrations, and business data integration.
3. **Strict Constraints**:
   - **Zero Password Modifications**: The application and engineering agents must NEVER execute `SET PASSWORD`, `ALTER USER`, or automated password rotation scripts against this account.
   - **Zero Dashboard Inquiries**: No further attempts or requests to access Hostinger hPanel will be made.
   - **Connection Authority**: Use the canonical hostname `srv1824.hstgr.io` (port 3306) with strict TLS hostname and CA validation (`sslaccept=strict`).
   - **Isolation**: Read `DB_PASSWORD` exclusively from the local private environment file (`.env.production.local`). Never log, commit, or display credentials.

---

## 2. Disclosed Credential Security Risk & Mitigation

- **Identified Risk**: The database password for `u740799251_intellicore` was shared in earlier conversational communications and must be treated as disclosed.
- **Interim Security Safeguards**:
  - The database is secured with TLS 1.2 encryption (`sslaccept=strict`, cipher `ECDHE-ECDSA-AES256-GCM-SHA384`).
  - Outbound connections are restricted to authorized application hosts (local development loopback and Vercel serverless egress).
  - MySQL user grants are confined strictly to schema `u740799251\_intellicore.*` without `GRANT OPTION` or administrative server privileges.
- **Long-Term Credential Rotation Protocol**:
  Because password rotation must be executed by the actual database owner in Hostinger hPanel, a formal credential request has been prepared below.

---

## 3. Formal Request Template for External Database Owner

```text
Subject: Request for Credential Rotation — IntelliCore Database (u740799251_intellicore)

Dear Database Administrator,

As part of the IntelliCore V2.0 production security hardening and audit process, we are requesting a scheduled rotation of the database password for the development/production user:

- Database Host: srv1824.hstgr.io (Port 3306)
- Database Name: u740799251_intellicore
- Database User: u740799251_intellicore

Recommended Action in Hostinger hPanel:
1. Navigate to Databases > Remote MySQL.
2. Generate and set a new secure password (minimum 32 characters, high entropy).
3. Ensure Remote MySQL IP allowlist remains active for '%' or authorized application IPs.
4. Share the new credentials securely via a private encrypted channel.

Upon receipt, we will update our secure environment configurations (.env.production.local and Vercel project secrets) and verify connectivity via strict TLS.
```

---

## 4. Engineering Status

- Standalone rotation scripts (`scripts/rotate-mariadb-password.js`) are permanently disabled.
- Application integration, regression testing, and frontend verification proceed independently using the existing authorized connection without interruption.
