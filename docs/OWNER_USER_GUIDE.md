# IntelliCore V2.0 owner operational guide

## 1. Introduction

This guide is designed for the Founder and primary administrator of IntelliCore V2.0. It covers essential routine operations, security practices, user management, and disaster recovery procedures.

---

## 2. Accessing the Platform

- **Application URL**: `http://localhost:3000`
- **Founder Command Center**: `http://localhost:3000/dashboards/founder`
- **Database Management (phpMyAdmin)**: `http://localhost:8080` (Docker internal)
- **API Documentation (Swagger)**: `http://localhost:3000/api-docs`
- **Application Health Probe**: `http://localhost:3000/health`
- **Database Readiness Probe**: `http://localhost:3000/ready`

---

## 3. Founder Authentication & Bootstrap

1. Navigate to `http://localhost:3000` and click **Sign in with Google**.
2. Sign in with the verified Founder account: `ctrlabhishek@gmail.com`.
3. The platform verifies identity via Firebase (`intellicore-dev`) and synchronizes with MySQL.
4. The Founder workspace automatically activates with `FOUNDER` role privileges.

> [!IMPORTANT]
> The primary Founder identity cannot be modified, demoted, or deleted by any administrative action.

---

## 4. Founder Operations & Dashboard Controls

### 4.1 Staff Role Provisioning
- Only the primary Founder can provision or activate staff roles (`CO_FOUNDER`, `ADMIN`, `HR_MANAGER`, `HR_EXECUTIVE`, `OPERATIONS_EXECUTIVE`, `TEAM_LEADER`).
- In the Founder Command Center under **Staff Provisioning**, select the target user, specify the designated role, and assign department scoping.

### 4.2 Permanent Account Deletion
1. In the Founder Command Center, navigate to **Permanent Account Deletion**.
2. Select the target user and click **Preview Impact**.
3. Review the breakdown of records to be deleted and shared assets to be preserved.
4. Enter the mandatory confirmation text: `PERMANENTLY DELETE`.
5. Enter a business reason (minimum 5 characters).
6. Click **Confirm Permanent Deletion**.
7. The operation executes transactionally, purges personal data, and permanently blocks re-registration.

### 4.3 Meeting Scheduling & Google Meet Links
- Create and host cross-departmental or intern meetings.
- Enter meeting title, start/end time, agenda, and participant list.
- Google Meet links can be provided manually or generated via authorized Calendar integration. Manual links function reliably without third-party OAuth configuration.

### 4.4 Certificate Dispatch Declarations
- Under business policy invariants, IntelliCore does not generate or email digital certificate files.
- To declare physical or manual dispatch:
  1. Open the intern's completed record.
  2. Record dispatch status as `SENT` with an optional dispatch reference number.
  3. The status is recorded in MySQL, and an in-app notification is delivered to the intern's dashboard.

---

## 5. Routine Maintenance & Backup

Run regular database backups using the automated script:
```powershell
.\scripts\backup.ps1
```
Backups are timestamped and stored in the `backups/` directory with SHA-256 integrity verification.
