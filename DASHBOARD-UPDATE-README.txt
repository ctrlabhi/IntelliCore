IntelliCore Workspace
=====================

Current project
---------------
- Static HTML, CSS, and JavaScript site published at intellicoretechnologies.in.
- Firebase Authentication is already used for sign-in.
- Private workspace records use Firebase Cloud Firestore under each user's own
  users/{uid}/workspaceRecords collection.
- firestore.rules restricts reads and writes to the signed-in owner and validates
  the personal-record fields and status values.
- The dashboard uses a permanent dark theme. Its header follows the homepage
  IntelliCore logo lockup without a theme or global-search control.

Files to publish
----------------
- dashboard.html
- dashboard.css
- dashboard-auth.js
- firebase.json
- firestore.rules
- DASHBOARD-UPDATE-README.txt

Firebase setup
--------------
1. In Firebase Console for project intellicore-229, create/enable a Firestore
   database in Native mode.
2. From the project root, sign in to the Firebase CLI and deploy the rules:
   firebase login
   firebase deploy --only firestore:rules --project intellicore-229
3. Publish the site files to the existing static website host.
4. In Firebase Authentication settings, keep only the production website and
   intended development domains in the authorized domains list.

The Firebase web configuration already present in auth.js and dashboard-auth.js
is public client configuration, not an admin credential. Never add service
account keys or Admin SDK credentials to this static website.

Existing browser records
------------------------
If a signed-in account has old records in this browser's local storage and its
Firestore collection is empty, the dashboard offers to copy those records to
that account. The old local copy is kept. Personal profile photos remain stored
on the current device; they are not uploaded or shared across devices.

Scope and security limitations
------------------------------
- Personal application records are private tracking notes, not official
  IntelliCore recruitment applications or decisions.
- Tasks are personal goals, not organization-assigned tasks or reviewed
  submissions.
- Certificate entries are personal notes, not issued, verified, or downloadable
  certificates.
- The current project has no configured staff roles, trusted server functions,
  internship/attendance records, notification service, support-ticket system,
  or private document storage. The dashboard displays these as unavailable; it
  does not invent records or grant staff powers in client-side code.
- Firestore rules must be deployed before record CRUD works. A failed connection
  or rules check is reported; records are not silently saved as if successful.
- Client-side profile-photo storage has browser quota and privacy limitations.
  Do not store identity documents or other sensitive files in local storage.

To enable staff-managed opportunities, assignments, attendance, official
applications, notifications, or certificate issuance, add trusted server-side
functions and provision staff through Firebase Admin custom claims. Do not grant
roles from editable client profile fields or relax Firestore rules for a
frontend-only admin panel.
