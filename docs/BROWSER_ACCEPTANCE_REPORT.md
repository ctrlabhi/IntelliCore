# IntelliCore V2.0 — Browser Acceptance Report

**Date:** 2026-11-25 (Asia/Kolkata)  
**Target Environment:** Localhost (`http://localhost:3000/`)  
**Database:** MySQL 8.4 LTS (`intellicore_db` production-ready + `intellicore_qa_db` isolated QA fixtures)  
**Firebase Identity Provider:** `intellicore-dev` (Production `intellicore-229` quarantined)  
**Auditor:** Principal Software Engineer, Senior QA Automation Engineer & UI/UX Architect

---

## 1. Executive Summary

IntelliCore V2.0 has successfully passed comprehensive autonomous browser acceptance testing across all primary public web pages, responsive viewports, the unified authentication modal, and all role-scoped dashboard shells.

Localhost port 3000 conflicts were resolved by reconfiguring the IDE Live Preview server to an isolated port (`3333`), allowing `intellicore_app` to bind cleanly to `127.0.0.1:3000:3000`. Firebase `auth/unauthorized-domain` errors were permanently mitigated through canonical origin normalization, redirecting all non-API browser requests from `127.0.0.1:3000` to `http://localhost:3000/` via an HTTP 307 Temporary Redirect.

All authentication modal usability issues (clipped headings, nested scrollbars, duplicate email verification buttons, raw Firebase error codes, absence of password visibility toggles, and missing forgot-password navigation) were remediated and verified.

---

## 2. Browser Verification Matrix

| Area / Component | Viewport / Route | Acceptance Criterion | Result | Evidence |
| :--- | :--- | :--- | :--- | :--- |
| **Homepage Serving** | `http://localhost:3000/` | HTTP 200 OK, full DOM hydration, zero 404 assets | **PASS** | Express static serving and `/` route handler return index.html with all CSS/JS bundles. |
| **Glassmorphism Header** | Desktop (1280x800) | Sticky header, brand logo, 11 primary links, "Login ↗" button | **PASS** | Fully visible, correct CSS backdrop-filter blur, smooth transitions. |
| **Mobile Drawer** | Mobile (390x844) | Hamburger menu toggle, slide-in drawer, scroll lock, aria attributes | **PASS** | `#hamburgerBtn` opens `#mobileDrawer` with backdrop overlay; body receives scroll lock. |
| **Scroll Rocket Runner** | All viewports | Animated SVG rocket with gradient hull, fins, and cockpit | **PASS** | `#rocketRunner` tracks scroll progress across `#scrollProgressBar` smoothly. |
| **Auth Modal Shell** | Desktop & Mobile | Centered on viewport, no outer clipping, single thin scrollbar | **PASS** | `.ic-auth-shell` uses fluid clamp dimensions (`max-height: min(84dvh, 650px)`), responsive single-column on mobile. |
| **Password Eye Toggle** | Modal Password Fields | Eye toggle icon switches input between `password` and `text` | **PASS** | `#togglePasswordBtn` and `#toggleConfirmBtn` toggle input type and flip icon between `👁` and `🙈`. |
| **Remember Me** | Modal Login Form | Persists email locally across sessions | **PASS** | `#icRemember` pre-fills `#icAuthEmail` from `localStorage` on subsequent visits. |
| **Forgot Password View** | Modal Workflow | Transitions cleanly to reset view and returns via "Back to Sign In" | **PASS** | `#icForgotPassword` switches mode to 'forgot', `#icBackToLogin` smoothly restores login form. |
| **Signup Tab Switching** | Modal Workflow | Full Name and Confirm Password fields toggle with required validation | **PASS** | Switching between Login and Signup tabs toggles `#icNameLabel` and `#icConfirmLabel` cleanly. |
| **Email Verification** | Modal Status | Single unified verification box with zero duplicate buttons | **PASS** | Exactly one `#icCheckVerification` button inside `.ic-auth-verification-box`. |
| **Google Sign-In** | Modal Social Auth | Official 4-color Google SVG logo and canonical redirect | **PASS** | High-contrast button with SVG logo, redirecting via authorized `localhost` domain. |
| **Founder Dashboard** | `/founder-dashboard.html` | 16 administrative links, KPI cards, KPI charts, ⌘K search | **PASS** | Correctly resolved via clean route `/dashboards/founder` and legacy alias. |
| **HR Dashboard** | `/hr-dashboard.html` | Internship management, domain donut chart, cross-workspace operations | **PASS** | Correctly resolved via clean route `/dashboards/hr` and legacy alias. |
| **Team Leader Dashboard**| `/tl-dashboard.html` | Domain selector, mentor roster, task progress chart | **PASS** | Correctly resolved via clean route `/dashboards/team-leader` and legacy alias. |
| **Intern Dashboard** | `/Intern-dashboard.html` | Personal profile, attendance check-in, task submissions, mobile drawer | **PASS** | Correctly resolved via clean route `/dashboards/intern` and legacy alias. |
| **AI Notes Studio** | `/notes.html` | YouTube URL parser, sample buttons, 10% visible IntelliCore watermark | **PASS** | Watermarked client-side PDF export engine verified intact. |

---

## 3. Negative Invariant & Security Verification

1. **Certificate PDF Invariants:**
   - Probing `/api/v1/certificates/generate`, `/api/v1/certificates/download`, and `/certificates/download.pdf` returns `HTTP 404 Not Found`.
   - In-app certificate dispatch declarations via `POST /api/v1/internships/:id/certificate-dispatch` create zero `EmailOutbox` jobs and perform zero external dispatch.
2. **Quarantine Invariants:**
   - `FIREBASE_PROJECT_ID` verified as `intellicore-dev`.
   - Production Firebase project `intellicore-229` strictly quarantined from all local and test processes.
3. **Sensitive Path Blocks:**
   - `GET /.env` -> `HTTP 403 Access Denied`
   - `GET /.git/config` -> `HTTP 403 Access Denied`
   - `GET /prisma/schema.prisma` -> `HTTP 403 Access Denied`
   - `GET /package.json` -> `HTTP 403 Access Denied`
   - `GET /docker-compose.yml` -> `HTTP 403 Access Denied`
   - `GET /secrets/firebase-admin-dev.json` -> `HTTP 403 Access Denied`

---

## 4. Conclusion & Acceptance Status

**Acceptance Status: FULLY ACCEPTED (Local Development Environment)**  
The frontend, authentication subsystem, responsive mobile layouts, and role dashboards meet all user acceptance and technical criteria.
