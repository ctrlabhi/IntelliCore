# IntelliCore V2.0 — UI Acceptance Matrix

## 1. Acceptance Overview

This document records the user interface and user experience acceptance testing across all supported viewports, interaction modes, accessibility criteria, and security guardrails for IntelliCore V2.0.

Testing was performed using Headless Edge / Chrome DevTools automation and responsive viewport simulation ranging from 360px mobile viewports up to 1440px wide desktop displays against the Express 5 modular monolith application.

---

## 2. Multi-Viewport Acceptance Grid

| Feature / UI Component | Mobile (360px) | Tablet (768px) | Laptop (1024px) | Desktop (1440px) | Status | Evidence & Verification Notes |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **Public Landing Page** | PASS | PASS | PASS | PASS | ✅ PASS | Responsive hero, track cards wrap cleanly, touch targets ≥ 48px. |
| **Auth Modal (Login/Signup)** | PASS | PASS | PASS | PASS | ✅ PASS | Centered modal, form fields readable, Google OAuth button responsive. |
| **Clean Dashboard URLs** | PASS | PASS | PASS | PASS | ✅ PASS | Express serves clean URLs (`/dashboards/*`) and legacy URLs with HTTP 200. |
| **Custom 404 Error Page** | PASS | PASS | PASS | PASS | ✅ PASS | Nonexistent routes return branded 404 template with home link. |
| **Sidebar Navigation** | PASS | PASS | PASS | PASS | ✅ PASS | Off-canvas drawer on mobile (<1024px); fixed persistent sidebar on desktop. |
| **Topbar & User Profile** | PASS | PASS | PASS | PASS | ✅ PASS | Monogram, user initials, role label badge, and quick action icons aligned. |
| **Multi-Button Logout Wiring** | PASS | PASS | PASS | PASS | ✅ PASS | Topbar logout, sidebar logout, and modal logout cleanly end Firebase session. |
| **MySQL Real Metric Cards** | PASS | PASS | PASS | PASS | ✅ PASS | 1-col on mobile, 2-col on tablet, 4-col on desktop. 100% DB-backed numbers. |
| **Workspace Notice Banner** | PASS | PASS | PASS | PASS | ✅ PASS | State-aware alerts: Red for Suspended, Slate for Inactive, Amber for Pending. |
| **Founder Command Center** | PASS | PASS | PASS | PASS | ✅ PASS | Staff table, role assignment forms, and live audit feed scale responsively. |
| **HR Operations Dashboard** | PASS | PASS | PASS | PASS | ✅ PASS | Application review modals, attendance grid, and dispatch declaration controls. |
| **Team Leader Dashboard** | PASS | PASS | PASS | PASS | ✅ PASS | Department roster, task assignment cards, and review evaluation forms. |
| **Intern Workspace** | PASS | PASS | PASS | PASS | ✅ PASS | Attendance check-in/out buttons, DWR input editor, task submission file picker. |
| **AI Notes Studio** | PASS | PASS | PASS | PASS | ✅ PASS | YouTube URL input, video preview player, notes markdown viewer, PDF export. |

---

## 3. Interaction & Behavioral Validation

| Test Case | Expected Behavior | Actual Result | Status |
| :--- | :--- | :--- | :---: |
| **Unauthenticated Route Access** | Accessing `/dashboards/founder` without login redirects to `/?auth=login`. | Browser redirected to login with return path preserved. | ✅ PASS |
| **Role Authorization Gate** | Intern identity accessing `/dashboards/founder` is rejected. | Redirected to `/dashboards/intern` or displays 403 Access Denied. | ✅ PASS |
| **Suspended Account Access** | Suspended user attempting API actions receives HTTP 403 `ACCOUNT_STATUS_RESTRICTED`. | Red banner rendered in UI; backend APIs reject operations with 403. | ✅ PASS |
| **Multi-Point Logout Action** | Clicking topbar logout or sidebar logout ends session and clears storage. | Firebase token revoked, storage cleared, redirected to `/?auth=login`. | ✅ PASS |
| **Responsive Hamburger Toggle** | Clicking hamburger menu toggles mobile drawer smoothly without jank. | Drawer opens with overlay; closes on link click or outside tap. | ✅ PASS |
| **Strict Negative Certificate Route** | Requesting `/api/v1/certificates` or `/certificates/me` returns 404. | Express returns custom 404 JSON / HTML error; 0 certificate routes exist. | ✅ PASS |
| **Sensitive File Access Block** | Requesting `/.env`, `/.git`, `/secrets/dev.json`, or `/prisma/schema.prisma` returns 403. | Static middleware blocks protected paths with HTTP 403 Forbidden. | ✅ PASS |

---

## 4. Accessibility & UI Quality Standards

- **Color Contrast**: All primary text adheres to WCAG AA minimum 4.5:1 contrast against `#0F0F1A` and `#1A1A2E`.
- **Keyboard Navigation**: Interactive elements (buttons, inputs, links) exhibit visible `:focus-visible` outline rings (`#6C5CE7`).
- **Touch Ergonomics**: All interactive elements on mobile viewports possess a minimum bounding target of 44x44px.
- **Form Validation**: Client-side validation prevents empty submissions; server-side Zod errors render field-level error messages.
