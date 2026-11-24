# IntelliCore Development Firebase Setup & Architecture Guide

**Version:** 2.0.0  
**Phase:** MASTER-PHASE-02A  
**Environment:** Local Development  
**Date:** 2026-11-24  

---

## 1. Cloud Project Overview

| Property | Value |
| :--- | :--- |
| **Project Display Name** | IntelliCore Dev |
| **Firebase Project ID** | `intellicore-dev` |
| **Billing Plan** | Spark (Free, $0/month) |
| **Google Analytics** | Disabled |
| **Production Project Isolation** | Strictly preserved (`intellicore-229` untouched) |
| **Hosting & Cloud Datastores** | Disabled (MySQL 8.4 LTS is sole datastore) |

---

## 2. Web Application Configuration (`IntelliCore Web Dev`)

The public Firebase Web SDK configuration is safely exported in `frontend/services/firebase.js`:

```javascript
export const firebaseConfig = {
  isConfigured: true,
  apiKey: "AIzaSyDOQq-_c84R3W3QbMDeCD0PsRXZL5pq2oc",
  authDomain: "intellicore-dev.firebaseapp.com",
  projectId: "intellicore-dev",
  storageBucket: "intellicore-dev.firebasestorage.app",
  messagingSenderId: "287532496050",
  appId: "1:287532496050:web:015491f32a089ce1d585ab",
  environment: "development"
};
```

> [!NOTE]
> Public web credentials contain only project identifiers and restricted API keys designed for browser use. Sensitive private keys are never exposed in frontend code.

---

## 3. Authentication Configuration

### Enabled Sign-in Providers
1. **Google Sign-In**:
   - Status: Enabled
   - Public-facing project name: `IntelliCore Dev`
   - Project support email: Configured with project administrator
2. **Email / Password**:
   - Status: Enabled
   - Passwordless email-link sign-in: **Disabled**

### Authorized Domains
- `localhost` (Added & Verified for canonical origin `http://localhost:3000`)
- `intellicore-dev.firebaseapp.com`
- `intellicore-dev.web.app`

---

## 4. Backend Admin SDK & Secret Architecture

### Service Account Details
- **Service Account**: `firebase-adminsdk-fbsvc@intellicore-dev.iam.gserviceaccount.com`
- **Key ID**: `c7e589abef7befeca60f2bcd6482db695e8ca31e`
- **Local Secret Path**: `secrets/firebase-admin-dev.json`
- **Container Target Path**: `/run/secrets/firebase-admin-dev.json`

### Security Safeguards
1. **Git & Docker Exclusion**:
   - `secrets/*` and `*.json` excluded in `.gitignore`.
   - `secrets` excluded in `.dockerignore`.
2. **Container Secret Mount**:
   Mounted as a read-only volume in `docker-compose.yml`:
   ```yaml
   volumes:
     - ./secrets/firebase-admin-dev.json:/run/secrets/firebase-admin-dev.json:ro
   ```
3. **Application Guardrail**:
   `backend/src/integrations/firebase/firebaseService.js` actively verifies that `project_id !== 'intellicore-229'` upon initialization, aborting execution if production credentials are ever supplied in development mode.

---

## 5. Environment Variables Reference

| Variable | Scope | Description / Sample Value |
| :--- | :--- | :--- |
| `FIREBASE_PROJECT_ID` | Backend / Docker | `intellicore-dev` |
| `GOOGLE_APPLICATION_CREDENTIALS` | Backend / Docker | `/run/secrets/firebase-admin-dev.json` (or `./secrets/firebase-admin-dev.json` for local host) |
| `FIREBASE_API_KEY` | Public / Frontend | Public web client API key |
| `FIREBASE_AUTH_DOMAIN` | Public / Frontend | `intellicore-dev.firebaseapp.com` |
| `FOUNDER_EMAIL` | Backend Config | `ctrlabhishek@gmail.com` |
| `FOUNDER_FIREBASE_UID` | Backend Config | Explicit UID (pending manual first login) |

---

## 6. Founder Identity Provisioning (Pending Phase 2)

As specified in project security protocols:
- The Founder account must be established with an authentic Firebase UID.
- No dummy or fabricated UIDs are permitted.
- The administrator email `ctrlabhishek@gmail.com` has been prepared in `.env` as the candidate Founder account.
- **Current Status:** Marked **PENDING CONFIRMATION**. The verified Firebase UID will be captured upon first login once the Phase 2 authentication interface is activated.

