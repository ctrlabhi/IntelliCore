# IntelliCore — Comprehensive Project Audit Report

**Application Version:** 2.0.0  
**Audit Date:** November 2026  
**Auditor:** Principal Software Engineer & Solution Architect  
**Document Classification:** Internal Technical Audit  

---

## 1. Executive Summary

This audit assesses the state of the **IntelliCore** codebase prior to the Phase 1 architectural restructuring. The project is currently structured as a client-heavy, serverless-oriented web application powered by static HTML/CSS/JavaScript files and hosted with direct client-side integration to Google Firebase (Firebase Authentication, Cloud Firestore, Cloud Storage, and Google Cloud Functions).

While the user interface, styling, animations, responsive design, and branding are mature and well-crafted, the architecture contains critical security and scalability liabilities:
- Direct client-side exposure of Firebase credentials and project references.
- Hardcoded administrative and staff email allowlists embedded in frontend JavaScript.
- Direct client access to Firestore and Storage with tight coupling to third-party vendor APIs.
- Scattered dashboard files lacking a cohesive modular structure.
- Absence of a centralized, versioned, containerized backend API.

The approved Master Architecture transitions IntelliCore into a **Modular Monolith** powered by **Node.js 24 LTS, Express.js 5, MySQL 8.4 LTS, Prisma ORM, and Docker Compose**, maintaining the pristine visual fidelity of the existing frontend while establishing a secure, scalable, enterprise-grade foundation.

---

## 2. Complete File Inventory

### 2.1 Public Frontend Pages (HTML)
| File | Size (Bytes) | Purpose & Key Dependencies |
| :--- | :--- | :--- |
| `index.html` | ~232,539 | Main homepage, hero section, IT solutions, internship tracks, team showcase, FAQ, login/signup modal. Loads `style.css`, `live-clock.js`, `script.js`, `login-modal.js`, `auth.js`. |
| `founder-dashboard.html` | ~20,712 | Founder Command Center. Loads `founder-dashboard.css`, `dashboard-background.css`, `dashboard-visuals.js`, `live-clock.js`, `functions/curriculum.js`, `founder-dashboard.js`. |
| `hr-dashboard.html` | ~18,779 | HR Operations Dashboard. Loads `hr-dashboard.css`, `dashboard-background.css`, `dashboard-visuals.js`, `live-clock.js`, `functions/curriculum.js`, `hr-dashboard.js`. |
| `tl-dashboard.html` | ~14,904 | Team Leader Dashboard. Loads `founder-dashboard.css`, `tl-dashboard.css`, `dashboard-background.css`, `dashboard-visuals.js`, `live-clock.js`, `functions/curriculum.js`, `tl-dashboard.js`. |
| `Intern-dashboard.html` | ~34,838 | Intern Workspace Dashboard. Loads `style.css`, `Intern-dashboard.css`, `dashboard-background.css`, `dashboard-visuals.js`, `live-clock.js`, `functions/curriculum.js`, `dashboard-auth.js`. |
| `notes.html` | ~14,685 | IntelliCore Notes AI Studio. Loads `style.css`, `notes.css`, `notes.js`, html2pdf CDN. |
| `404.html` | ~8,945 | Standalone custom 404 error page with internal styles. |

### 2.2 Stylesheets (CSS)
| File | Size (Bytes) | Role & Scope |
| :--- | :--- | :--- |
| `style.css` | ~177,997 | Master design system: color variables, neon glow utilities, typography, welcome hero banner, responsive system. |
| `dashboard-background.css` | ~16,348 | Dynamic neural canvas and particle starfield background styles for all dashboard shells. |
| `founder-dashboard.css` | ~31,126 | Grid layouts, metrics cards, table layouts, and role assignment styling for Founder interface. |
| `hr-dashboard.css` | ~26,909 | Intern directory tables, attendance trackers, announcement composer for HR interface. |
| `tl-dashboard.css` | ~7,351 | Track-scoped domain cards, task review queue for Team Leader interface. |
| `Intern-dashboard.css` | ~152,171 | Complete intern workspace styles: progress rings, assignment cards, daily attendance panel, certificate requests. |
| `notes.css` | ~26,762 | AI video-to-notes generator studio, toolbar, PDF export layout, watermark overlay. |

### 2.3 Client-Side Scripts (JavaScript)
| File | Size (Bytes) | Operational Role |
| :--- | :--- | :--- |
| `script.js` | ~84,331 | Main site interactions: mobile navigation drawer, smooth scrolling, contact modal dialog, stats counter animations. |
| `live-clock.js` | ~2,140 | Real-time Indian Standard Time (IST) clock and contextual greeting ("Good Morning/Afternoon/Evening"). |
| `login-modal.js` | ~1,171 | Lightweight modal toggle handler for the primary navbar "Login" trigger. |
| `auth.js` | ~18,215 | Legacy Firebase Auth client on `index.html`. Direct calls to Google Auth Provider and Firebase client SDK. |
| `dashboard-auth.js` | ~122,860 | Legacy monolithic client controller for intern dashboard; contains Firestore listeners, task rendering, attendance recording. |
| `dashboard-visuals.js` | ~5,198 | Canvas-based neural network node-and-wire visualizer for dashboard backgrounds. |
| `founder-dashboard.js` | ~30,172 | Legacy client logic for staff role assignment, intern activation, and domain management. |
| `hr-dashboard.js` | ~39,225 | Legacy client logic for managing intern rosters, approving activations, exporting records. |
| `tl-dashboard.js` | ~21,461 | Legacy client logic for track-restricted intern views, task reviews. |
| `notes.js` | ~42,463 | Client-side YouTube transcript mock parser, notes editor, and html2pdf compilation. |

### 2.4 Cloud Functions & Curriculum Backend
| File | Size (Bytes) | Description |
| :--- | :--- | :--- |
| `functions/index.js` | ~48,426 | Cloud Functions v2 for Firebase: `saveInternshipProfile`, `setInternAccountStatus`, Google Calendar Meet creation. |
| `functions/curriculum.js` | ~13,316 | Master internship tracks definitions (Web Dev, Data, Business Analyst, etc.) and week-by-week curriculum tasks. |
| `functions/curriculum.test.js` | ~1,064 | Basic Node.js assertions verifying curriculum tracks and tasks structure. |
| `functions/package.json` | ~421 | Node 22 Cloud Functions dependencies (`firebase-admin`, `firebase-functions`, `googleapis`). |
| `functions/scripts/set-user-role.js` | ~2,918 | Admin script to assign Firebase custom user claims via command line. |

### 2.5 Static Media Assets (`Photos/`)
- `favicon.png` (1,198,813 bytes) — High-resolution brand favicon and emblem.
- Team Photographs: `Abhishek.jpeg`, `Ashita Rohilla.jpeg`, `Astuty.jpg`, `Chanda.jpeg`, `Int.jpeg`, `Mahak.jpeg`, `Sumit.jpeg`, `Tanya.jpeg`, `Tara.jpg`.

### 2.6 Firebase Configuration & Rules
- `.firebaserc` — Project alias pointing to `intellicore-229`.
- `firebase.json` — Configuration for Cloud Functions, Firestore indexes/rules, Storage rules, and emulator ports (Auth: 9099, Firestore: 8080, Storage: 9199, UI: 4000).
- `firestore.rules` (38,744 bytes) — Granular Firestore security rules.
- `firestore.indexes.json` — Composite indexes for queries on profiles, attendance, and tasks.
- `storage.rules`, `storage.cors.json` — Bucket security and CORS configuration.

---

## 3. Dependency & Integration Analysis

### 3.1 External CDN Dependencies
1. **Google Firebase SDK v13.1.0** (ES Modules loaded from `https://www.gstatic.com/firebasejs/13.1.0/`):
   - `firebase-app.js`, `firebase-auth.js`, `firebase-firestore.js`, `firebase-storage.js`, `firebase-functions.js`.
   - Used across `auth.js`, `dashboard-auth.js`, `founder-dashboard.js`, `hr-dashboard.js`, `tl-dashboard.js`.
2. **html2pdf.js v0.10.1** (Loaded from `cdnjs.cloudflare.com` on `notes.html`):
   - Client-side DOM-to-canvas-to-PDF rendering engine.

### 3.2 Internal Script Cross-Dependencies
- `curriculum.js` is imported by both `functions/index.js` (server-side CommonJS) and client-side dashboards (`founder-dashboard.html`, `hr-dashboard.html`, `tl-dashboard.html`, `Intern-dashboard.html`) via `<script src="functions/curriculum.js"></script>`.
- `live-clock.js` operates independently and mounts onto `[data-live-time]`, `[data-live-date]`, and `[data-live-greeting]`.
- `dashboard-visuals.js` expects canvas element `#icWorkspaceNeuralCanvas`.

---

## 4. Security, Architectural & Operational Risks

### 4.1 Critical Security Vulnerabilities in Existing Setup
1. **Hardcoded Administrative Allowlist:**
   - In `auth.js`, `dashboard-auth.js`, and `functions/index.js`, specific user emails are hardcoded in plaintext to receive elevated staff roles (`founder`, `admin`, `operations_executive`, `hr_executive`, `hr_manager`).
   - If a client script is compromised or an attacker alters client execution, role verification could be bypassed if not strictly verified on a trusted server.
2. **Client-Exposed Firebase Web Configuration:**
   - Real Firebase Web API Keys, Project IDs, and Messaging Sender IDs are embedded directly in public client-side JavaScript (`auth.js`, `dashboard-auth.js`).
   - The new local architecture must isolate this production configuration immediately.
3. **Google Meet API Tokens in Functions Secrets:**
   - `functions/index.js` references `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, and `GOOGLE_CALENDAR_REFRESH_TOKEN`.
   - These credentials must remain strictly in secure server-side environment variables and never be exposed.

### 4.2 Architectural Deficiencies
1. **Lack of a Unified Backend:**
   - All database reads and writes currently bypass an application server and communicate directly from the browser to Firestore.
   - Business rules (attendance calculation, leave approvals, certificate eligibility) are duplicated across client-side scripts and Firestore rules.
2. **Missing Local Development Infrastructure:**
   - Developers were dependent on Firebase Cloud or local emulators without a unified containerized setup for a relational database.

---

## 5. File Migration & Target Architecture Mapping

To satisfy the approved Modular Monolith structure without breaking any existing page or asset references, files are mapped as follows:

| Current Path | Target Path | Notes |
| :--- | :--- | :--- |
| `index.html` | `frontend/index.html` | Preserved visual identity, asset references updated to `/assets/` |
| `founder-dashboard.html` | `frontend/pages/dashboards/founder/index.html` | Express route alias `/founder-dashboard.html` maintained |
| `hr-dashboard.html` | `frontend/pages/dashboards/hr/index.html` | Express route alias `/hr-dashboard.html` maintained |
| `tl-dashboard.html` | `frontend/pages/dashboards/team-leader/index.html` | Express route alias `/tl-dashboard.html` maintained |
| `Intern-dashboard.html` | `frontend/pages/dashboards/intern/index.html` | Express route alias `/Intern-dashboard.html` maintained |
| `notes.html` | `frontend/pages/notes.html` | Express route alias `/notes.html` maintained |
| `404.html` | `frontend/pages/404.html` | Central 404 handler for unknown public routes |
| `style.css` | `frontend/assets/css/style.css` | Global master stylesheet |
| `dashboard-background.css` | `frontend/assets/css/dashboard-background.css` | Dashboard canvas styles |
| `founder-dashboard.css` | `frontend/assets/css/founder-dashboard.css` | Founder dashboard styles |
| `hr-dashboard.css` | `frontend/assets/css/hr-dashboard.css` | HR dashboard styles |
| `tl-dashboard.css` | `frontend/assets/css/tl-dashboard.css` | TL dashboard styles |
| `Intern-dashboard.css` | `frontend/assets/css/Intern-dashboard.css` | Intern dashboard styles |
| `notes.css` | `frontend/assets/css/notes.css` | Notes studio styles |
| `script.js` | `frontend/assets/js/script.js` | Core interaction logic |
| `live-clock.js` | `frontend/assets/js/live-clock.js` | Clock component |
| `login-modal.js` | `frontend/assets/js/login-modal.js` | Modal toggles |
| `dashboard-visuals.js` | `frontend/assets/js/dashboard-visuals.js` | Neural canvas |
| `functions/curriculum.js` | `frontend/assets/js/curriculum.js` & `backend/src/modules/learning/curriculum.js` | Shared curriculum data |
| `Photos/*` | `frontend/assets/images/*` | All images; Express provides backward-compatible `/Photos/*` alias |
| `favicon.png` | `frontend/assets/images/favicon.png` | Main brand favicon |
| `auth.js` | `frontend/services/auth.js` (isolated) | Production Firebase bypassed; dev-safe auth stub implemented |
| `dashboard-auth.js` | `frontend/assets/js/dashboard-auth.js` | Isolated from production Firebase; dev-pending state |
| `founder-dashboard.js` | `frontend/assets/js/founder-dashboard.js` | Isolated from production Firebase; dev-pending state |
| `hr-dashboard.js` | `frontend/assets/js/hr-dashboard.js` | Isolated from production Firebase; dev-pending state |
| `tl-dashboard.js` | `frontend/assets/js/tl-dashboard.js` | Isolated from production Firebase; dev-pending state |
| `notes.js` | `frontend/assets/js/notes.js` | Fully operational client-side logic |
| `functions/*` | `legacy-firebase/functions/*` (or preserved outside runtime) | Kept strictly outside frontend runtime bundle |
| `firestore.rules` etc. | `legacy-firebase/*` | Archived for reference during Phase 2 migration |

---

## 6. Recommendations for Phase 1 Execution

1. **Strict Origin Isolation:** Under no circumstances should client code in `frontend/` make live requests to the `intellicore-229` production Firebase project.
2. **Reverse Proxy & Route Aliasing:** Express static router must support both new modular paths (`/pages/dashboards/intern/`) and legacy root links (`/Intern-dashboard.html`, `/Photos/favicon.png`) so existing hyperlinks throughout `index.html` and other dashboards never break.
3. **Database Foundation:** Establish MySQL 8.4 LTS via Docker with standard UUID-keyed infrastructure tables (`system_settings`) managed exclusively through versioned Prisma migrations.
4. **Environment Isolation:** Place all secrets and database credentials in `.env`, strictly excluded from version control via `.gitignore` and `.dockerignore`.

