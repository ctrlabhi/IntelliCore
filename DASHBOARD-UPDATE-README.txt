IntelliCore Workspace
=====================

Current project
---------------
- Static HTML, CSS, and JavaScript site published at intellicoretechnologies.in.
- Firebase Authentication is used for sign-in.
- Email/password sign-up sends Firebase's built-in verification link. Users
  must verify their address before the dashboard or protected records are
  available. Unverified users can request a resend; Google sign-in remains
  direct under the existing verified-account access policy.
- Private workspace records use Firestore under each user's own
  users/{uid}/workspaceRecords collection.
- Interns create their own internship profile by selecting one of the eight
  tracks and a duration of 1, 2, 3, or 6 months. The server saves the start
  and end dates using Asia/Kolkata.
- Attendance is an explicit daily check-in. The server allows at most one
  check-in per Asia/Kolkata calendar day and only within the internship dates.
- Founder and Co-founder are Super Admins and can start/end the shared Google
  Meet. A live link is shown to active interns and staff; meetings expire after
  two hours.
- The verified `ctrlabhishek@gmail.com` account is allowlisted as a Founder
  for dashboard routing and trusted callable authorization; other Founder and
  Co-founder accounts use explicit Firebase role claims. Founder and
  Co-founder accounts open `founder-dashboard.html`, a separate
  role-gated command-center UI. Its organization KPIs and sample records are
  illustrative. The Founder-only role assignment form calls trusted Functions
  to grant Team Leader (mentor, with selected track claims), HR Manager, or HR
  Executive to active verified learner accounts. New assignments take effect
  after the target signs in again. Other organization-wide management actions
  on this page are not connected to live data or write operations.
- Admin, HR Manager, HR Executive, and Operations Executive accounts open
  `hr-dashboard.html`, presented as the shared role-gated HR Dashboard.
  Its KPIs and
  records are illustrative. The existing operational tools remain available
  from its "Open secure workspace" link at `dashboard.html?workspace=operations`.
- Senior HR Manager, Senior HR Executive, and Senior Operations Executive are
  not currently provisionable roles. The dashboard does not grant these
  additional role names or permissions.
- Accounts without an explicit trusted Firebase role claim use the learner
  dashboard. Users cannot assign themselves a staff role from the client;
  Founder/Co-founder assignment is enforced by server-side callable Functions.
- Mentor accounts (the currently provisioned role used for Team Leaders) open
  `team-leader-dashboard.html`. Its example metrics are illustrative and its
  track selector is limited to the account's authorized mentor-track claims.
  Task assignment and submission review links open the existing secure
  workspace; other Team Leader workflows remain preview-only.
- All four dashboards display a live date and clock using India Standard Time.
- Admin, HR Manager, HR Executive, and Operations Executive are staff admins.
  They can browse the paginated intern directory grouped by domain and review
  enrolled interns who have not logged in for seven days.
- The intern directory shows name, domain, duration, phone, email, internship
  period, and last login. Deactivation disables sign-in but retains the intern
  profile, attendance, and training records; staff can reactivate the account.
- HR Manager manages internship profiles and attendance. HR Executive views
  intern profiles. Operations Executive views profiles and attendance.
  Mentors assign and review work only for authorised tracks.
- Training assignments, submissions, reviews, profile updates, attendance,
  and meeting operations use trusted callable Cloud Functions and Firebase
  Authentication custom claims. Browser-editable role values never authorize
  access.
- Profile display names are saved to Firebase Authentication. Profile photos
  are stored under a per-user Firebase Storage path.
- Intern profile setup requires a name, phone number, gender, domain, and
  internship duration. Profile photos are optional; the workspace displays
  the user's first initial when no photo is uploaded.

Files to publish
----------------
- index.html
- style.css
- auth.js
- dashboard.html
- dashboard.css
- dashboard-background.css
- dashboard-auth.js
- dashboard-visuals.js
- founder-dashboard.html
- founder-dashboard.css
- founder-dashboard.js
- hr-dashboard.html
- admin-dashboard.css
- admin-dashboard.js
- team-leader-dashboard.html
- team-leader-dashboard.css
- team-leader-dashboard.js
- live-clock.js
- functions/
- firebase.json
- firestore.rules
- firestore.indexes.json
- storage.rules
- storage.cors.json
- DASHBOARD-UPDATE-README.txt

Production setup
----------------
1. Install Node.js 22 and the Firebase CLI. Sign in with an account authorised
   to deploy this Firebase project:
   firebase login
2. In Firebase Console for project intellicore-229, enable Email/Password and
   Google sign-in under Authentication > Sign-in method. Under Authentication
   > Settings > Authorised domains, inspect the allowed hosts:
   the repository's CNAME identifies intellicoretechnologies.in as the
   production website and the Firebase web config uses
   intellicore-229.firebaseapp.com as its auth domain. Add the production
   website domain if it is missing. The repository does not confirm whether
   www.intellicoretechnologies.in is a live website alias; add it only if that
   host is configured to serve the site. Keep the existing Firebase email
   verification template and review its action/continue URL under
   Authentication > Templates > Email address verification. The application
   does not override that URL.
   Also create a Firestore database in Native mode and the default Storage
   bucket if they do not already exist. Email verification uses Firebase
   Authentication directly and does not require Functions, Resend, SMTP, or
   another email provider.
3. The existing workspace callable Functions and Google Calendar integration
   require Cloud Functions deployment; Firebase currently requires the Blaze
   plan for deployment. This billing requirement is unrelated to email
   verification. The updated verified-email guard must be deployed with the
   existing Functions for callable workspace features to accept verified
   password users. If the project remains on Spark, email verification itself
   still works, but this backend update cannot be deployed until the existing
   Functions hosting plan requirement is met. Review quotas and billing alerts
   before deploying Functions.
4. Install the Functions dependencies from the project root:
   npm --prefix functions install
5. Deploy the backend, database rules/indexes, and Storage rules:
   firebase deploy --only functions,firestore:rules,firestore:indexes,storage --project intellicore-229
6. Configure Storage CORS for the website and local development. From the
   project root, apply the included configuration:
   gcloud storage buckets update gs://intellicore-229.firebasestorage.app --cors-file=storage.cors.json --project=intellicore-229
7. Provision the Founder and Co-founder Super Admin accounts explicitly.
   Authenticate with Google
   Application Default Credentials, then run:
   gcloud auth application-default login
   PowerShell:
   $env:FIREBASE_PROJECT_ID = "intellicore-229"
   npm --prefix functions run set-user-role -- <firebase-uid-or-email> founder
   npm --prefix functions run set-user-role -- <firebase-uid-or-email> co_founder
   Never add service-account keys or credentials to this repository.
8. Provision staff using only their required role:
   npm --prefix functions run set-user-role -- <firebase-uid-or-email> hr_manager
   npm --prefix functions run set-user-role -- <firebase-uid-or-email> hr_executive
   npm --prefix functions run set-user-role -- <firebase-uid-or-email> operations_executive
   npm --prefix functions run set-user-role -- <firebase-uid-or-email> admin
   For the requested staff accounts, run:
   npm --prefix functions run set-user-role -- tanu65159@gmail.com operations_executive
   npm --prefix functions run set-user-role -- mikkurwt694@gmail.com hr_executive
   npm --prefix functions run set-user-role -- ashitarohilla32@gmail.com hr_manager
   Sumit Kumar (Web Developer) — administrator access to the HR Dashboard:
   npm --prefix functions run set-user-role -- thesumitsah47@gmail.com admin
9. Provision mentors with only the tracks they are authorised to review:
   npm --prefix functions run set-user-role -- <firebase-uid-or-email> mentor "Web Development Intern,Data Analyst Intern"
   Valid track names are listed in index.html and functions/curriculum.js.
10. After a role change, the user must sign out and sign in again for Firebase
    Authentication to refresh custom claims. Interns must sign in once before
    staff tools can find their account profile.
11. Publish the static site files to the existing website host.

Google Calendar / Meet setup
----------------------------
1. In Google Cloud Console for the Calendar owner account's project, enable
   Google Calendar API and configure an OAuth consent screen and OAuth client.
   The OAuth client must have access to create and delete events in the
   account's primary calendar.
2. Obtain an offline OAuth refresh token with the
   https://www.googleapis.com/auth/calendar.events scope. Keep the client ID,
   client secret, and refresh token private.
3. Store the values as Firebase Functions secrets from the project root:
   firebase functions:secrets:set GOOGLE_CALENDAR_CLIENT_ID --project intellicore-229
   firebase functions:secrets:set GOOGLE_CALENDAR_CLIENT_SECRET --project intellicore-229
   firebase functions:secrets:set GOOGLE_CALENDAR_REFRESH_TOKEN --project intellicore-229
   Enter each value only at the CLI prompt. Do not put credentials in source
   files, static-site configuration, or this document.
4. Deploy Functions again after setting or rotating secrets. Test creating and
   ending a meeting with the authorised Founder/Co-founder account.
5. If the secrets are missing, consent is revoked, or Calendar API is disabled,
   the server reports that the shared meeting could not be created. It does
   not silently publish a placeholder link.

Existing records and accounts
-----------------------------
If a signed-in account has older workspace records in this browser's local
storage and its Firestore collection is empty, the dashboard offers to copy
them to that account. The original local copy is kept. Existing Firebase
accounts get a training profile after signing in once with the deployed
Functions backend. Older track-only profiles can complete the new duration
setup when they have no saved internship dates.
Existing accounts already marked email-verified by Firebase remain verified;
unverified accounts must follow the email link before protected access. Existing
role claims are preserved, and no user-verification claim migration is needed.

Training and internship workflow
--------------------------------
- The eight published internship tracks each have curated starter tasks with
  instructions, deliverables, and 100-point evaluation rubrics.
- Each intern profile includes a phone number and is grouped under its chosen
  domain in staff views. The directory loads in pages so larger cohorts remain
  accessible.
- Enrolled interns with a last login older than seven days appear in the
  separate inactive list. Staff can deactivate or reactivate their Firebase
  sign-in; profile and training history are not deleted.
- Interns choose their track and a duration of 1, 2, 3, or 6 months. Once the
  profile is active, changes must be handled by a Super Admin or HR Manager.
- Super Admins and HR Manager can update an intern's track or duration.
  Duration changes retain the saved start date and recalculate the end date.
- Super Admins, Admins, HR Manager, and mentors can assign tasks to registered
  learner email addresses. Mentors can only assign within their authorised
  tracks. The task must match the intern's current track.
- Email/password learners must verify their email before staff can assign
  tasks; Google-authenticated accounts are accepted as verified.
- Interns submit written notes and/or an HTTPS deliverable link.
- An authorised mentor or training manager records feedback and either
  approves the task or requests changes. Interns can resubmit after a change
  request.
- Attendance and task submissions accept no arbitrary file uploads.

Security and product limitations
--------------------------------
- Custom claims are assigned only by the trusted role-provisioning script.
  Do not expose this script or Admin SDK credentials to the website.
- Firestore, Storage, and callable workspace functions require a trusted
  Firebase Authentication token with a verified email and an enabled sign-in
  provider. Email/password verification is checked from Firebase's
  email_verified token claim. Browser code cannot set that claim or assign
  user roles.
- The website does not contain a custom verification action URL. Firebase
  uses the existing project email-verification template; inspect its template
  and authorized-domain settings in the Firebase Console before production use.
- This repository cannot show the live Firebase Console authorised-domain
  list or the currently saved email-template URL. Confirm both manually in
  project intellicore-229; no production configuration was changed here.
- Training assignment writes, review transitions, internship profile changes,
  attendance records, and meeting state are performed by Cloud Functions.
- Attendance is self-reported check-in, not biometric or location-verified.
- Google Calendar events and Meet links are created using the configured
  Calendar owner's account. The integration does not send separate
  personalised invitations; the dashboard exposes the shared join link.
- Personal application/task/certificate records are private tracking notes,
  not official recruitment decisions or issued certificates.
- Profile photos use an owner-only Storage object with a 3 MB image limit.
  Do not upload identity documents or other sensitive files.
- Push notifications, support tickets, and certificate issuance are not
  connected. The dashboard keeps these unavailable rather than inventing
  records.
- The Firebase web configuration in auth.js and dashboard-auth.js is public
  client configuration, not an admin credential. Never add service-account
  keys or Admin SDK credentials to this static website.
