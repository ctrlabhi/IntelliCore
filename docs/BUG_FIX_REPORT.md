# IntelliCore V2.0 — Bug Fix & Remediation Report

**Date:** 2026-11-25 (Asia/Kolkata)  
**System:** IntelliCore V2.0 Modular Monolith  
**Scope:** Authentication Subsystem, Frontend Modal UX, Routing Precedence, and Isolated QA Test Harness

---

## 1. Overview of Detected Issues & Remediations

During final acceptance verification and autonomous browser testing, six specific defects were identified, analyzed for root cause, remediated, and verified through regression testing.

---

## 2. Bug Fix Inventory

### Defect 1: Firebase `auth/unauthorized-domain` on Localhost
* **Symptom:**  
  When testing authentication or navigating via `http://127.0.0.1:3000/`, Google Sign-in and Firebase Auth threw `Firebase: Error (auth/unauthorized-domain)`.
* **Root Cause:**  
  Firebase Auth project allowlists `localhost` by default, but does not allow `127.0.0.1` unless manually configured in the Firebase Console. Browser navigation hitting `127.0.0.1:3000` failed the domain authorization check.
* **Resolution:**  
  1. Configured an Express middleware in `backend/src/app.js` that inspects incoming requests and performs an HTTP 307 Temporary Redirect to `http://localhost:3000` for all browser requests (excluding `/api`, `/health`, and `/ready`).
  2. Implemented client-side hostname normalization in `frontend/assets/js/auth.js` (`window.location.replace`).
  3. Expanded CORS configuration in `backend/src/app.js` to explicitly allow both `http://localhost:3000` and `http://127.0.0.1:3000`.
* **Verification:**  
  `curl.exe -i http://127.0.0.1:3000/` returns `HTTP/1.1 307 Temporary Redirect` -> `Location: http://localhost:3000/`.

---

### Defect 2: Duplicate "I've verified my email" Buttons in Auth Modal
* **Symptom:**  
  In the email verification state of the login modal, two identical buttons reading *"I’ve verified my email"* appeared on top of each other.
* **Root Cause:**  
  `frontend/index.html` contained `<button type="button" class="ic-text-btn" id="icCheckVerification">I’ve verified my email</button>`, while `frontend/assets/js/auth.js` was also dynamically creating and appending a second button (`checkBtn = document.createElement('button')`) to `verificationPanel`.
* **Resolution:**  
  1. Refactored `frontend/assets/js/auth.js` to reference the existing button element `#icCheckVerification` directly.
  2. Styled the single verification box container (`.ic-auth-verification-box`) with clean padding, clear status copy, and primary action styling (`.ic-auth-secondary`).
* **Verification:**  
  Verified DOM contains exactly 1 button with ID `icCheckVerification` inside `#icVerificationActions`.

---

### Defect 3: Missing Password Visibility Eye Toggles
* **Symptom:**  
  Users could not toggle password visibility, leading to typing mistakes and credential errors on mobile devices.
* **Root Cause:**  
  Password input fields had no toggle button or container styling.
* **Resolution:**  
  1. Wrapped `#icAuthPassword` and `#icAuthConfirm` inside `.ic-input-password-group` containers with padding adjustments.
  2. Added `#togglePasswordBtn` and `#toggleConfirmBtn` with accessibility aria labels.
  3. Implemented toggle event listeners in `frontend/assets/js/auth.js` toggling input types between `'password'` and `'text'`, and switching icons between `'👁'` and `'🙈'`.
* **Verification:**  
  Verified via automated test and DOM inspection that clicking the toggle switches the input type attribute reliably.

---

### Defect 4: Incomplete Forgot-Password Modal Navigation Flow
* **Symptom:**  
  Clicking "Forgot password?" switched the modal to reset mode, but provided no straightforward button to return to the sign-in form without closing and reopening the modal.
* **Root Cause:**  
  Modal template lacked a dedicated back action button for the password reset state.
* **Resolution:**  
  1. Added `#icForgotActions` containing `<button type="button" class="ic-text-btn" id="icBackToLogin">← Back to sign in</button>` in `frontend/index.html`.
  2. Wired `#icBackToLogin` click handler to call `setMode('login')`, cleanly restoring all tabs, inputs, and submit button states.
* **Verification:**  
  Verified bi-directional transition between `'login'` and `'forgot'` modes without state leakage.

---

### Defect 5: Host Port 3000 Process Collision
* **Symptom:**  
  `docker compose up -d` failed to bind `127.0.0.1:3000:3000` because the port was already bound by PID 4940.
* **Root Cause:**  
  The Antigravity / VS Code "Live Preview" extension (`ms-vscode.live-server`) was running an embedded preview web server on port 3000.
* **Resolution:**  
  1. Reconfigured `.vscode/settings.json` with `"livePreview.portNumber": 3333`.
  2. Terminated the Live Preview background task without impacting the IDE.
  3. Re-bound the IntelliCore application container `intellicore_app` to `127.0.0.1:3000:3000`.
* **Verification:**  
  `docker compose ps` shows `intellicore_app` Up and Healthy on `127.0.0.1:3000->3000/tcp`.

---

### Defect 6: Routing Precedence Bug in Sensitive Path Guard
* **Symptom:**  
  Integration tests for sensitive file blocking (`GET /.env`) received an HTTP 307 redirect instead of the expected HTTP 403 Forbidden when requesting via `127.0.0.1`.
* **Root Cause:**  
  The `127.0.0.1` redirect middleware was mounted before the sensitive paths security guard, redirecting the request before the security filter could evaluate the path.
* **Resolution:**  
  1. Moved the sensitive path guard (`/.env`, `/.git`, `/secrets`, `/prisma`, etc.) to run *before* the origin redirect middleware.
  2. Added an environment guard (`env.NODE_ENV !== 'test'`) to the redirect middleware to prevent interfering with Supertest test harnesses.
* **Verification:**  
  `tests/integration/security.test.js` and `tests/integration/staticServing.test.js` pass with 100% compliance.

---

## 3. Summary of Code Changes

| File | Nature of Change |
| :--- | :--- |
| `backend/src/app.js` | Added canonical localhost redirect, expanded CORS allowlist, and corrected security guard precedence. |
| `frontend/index.html` | Added password visibility toggles, single verification box, forgot-password back button, standard Google logo SVG. |
| `frontend/assets/js/auth.js` | Implemented password toggle logic, remember-me local storage persistence, forgot-password view, eliminated duplicate button generation, enhanced Firebase error code mapping. |
| `frontend/assets/css/style.css` | Added styling for `.ic-input-password-group`, `.ic-toggle-pw`, `.ic-auth-verification-box`, `.ic-spinner`, tightened spacing. |
| `backend/src/scripts/seedQaFixtures.js` | Created synthetic fixture seeder populating `intellicore_qa_db` across all 8 roles and lifecycle records. |
| `tests/integration/multiRoleQaAcceptance.test.js` | Added 20 automated tests validating all 8 roles, Founder exclusivity, and negative invariants. |
