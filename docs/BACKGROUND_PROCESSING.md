# Notification background processing

The worker uses the same IntelliCore application image and MySQL database as the web process. Start the optional Compose profile after preparing the dedicated account and applying schema migrations and seed data. The worker has no Firebase credential mount, upload volume or published port.

```powershell
docker compose build app
docker compose --profile notifications up -d notification-worker
```

Provide `NOTIFICATION_DATABASE_URL` for the separate `intellicore_worker` account. Use an isolated schema and a dedicated account suffix for testing. Deployment tooling should grant the following privileges inside the intended MySQL database.

| Access | Tables |
| --- | --- |
| SELECT | users, roles, user_roles, role_permissions, permissions, departments, user_departments, staff_profiles, internship_applications, internships, attendance_policies, attendance_eligibility, attendance_corrections, leave_requests, daily_work_reports, task_assignments, tasks, system_settings, notification_preferences |
| SELECT, INSERT, UPDATE | email_outbox, email_delivery_attempts, notification_worker_state |
| SELECT, UPDATE | announcements |
| SELECT, INSERT | notifications, announcement_recipients |
| INSERT and SELECT on id only | audit_logs |

Keep worker, migration and runtime credentials separate. Confirm the worker can claim and update only its domain records. Worker health is reported through the authenticated administrative heartbeat endpoint. The app readiness check remains independent of worker and SMTP status.

## Claims and retries

Workers claim a bounded batch using MySQL row locks with SKIP LOCKED, persist the owner and 60-second lease, and write the attempt before processing. Jobs retain history through application restarts. The worker stops claiming on shutdown and finishes in-flight bounded operations. A job whose worker stopped before starting transport can be reclaimed when its lease expires. A job that might already have reached SMTP is marked ambiguous. That state requires an explicit authorized retry with acknowledgment of duplicate-delivery risk.

The initial defaults are five jobs per poll, a five-second poll, five automatic attempts, jittered exponential delay starting at 60 seconds and a 3,600-second cap. Parameters are bounded by worker validation. Confirmed transient failures retry, permanent failures stop, and authentication or TLS configuration failures pause new SMTP work. A crash after provider acceptance and before persistence can leave an ambiguous outcome. The message ID is stable. SMTP acceptance is distinct from inbox receipt. Manual retry/cancel uses audited, role-restricted endpoints with bounded limits.

## Reminder windows

Task reminders use the effective due instant for available unfinished assignments. The provisional default sends one reminder per deadline within 24 hours. Daily work reports use the effective attendance policy and business date, defaulting to the last 30 minutes before cutoff. They exclude approved leave, weekly off, ineligible internships, and submitted reports. Internship commencement uses two days of lead time plus the commencement date. Completion-review reminders use a three-day lead time. Launcher defaults can be changed with bounded configuration or the audited Founder settings form. Processing uses UTC timestamps and IST calendar dates.

The worker scans limited batches with cursors and generates notices only inside current windows. It does not replay expired reminder windows after downtime. Scheduled announcements apply their confirmed snapshot, expiry and current authorization separately. [Announcement rules](ANNOUNCEMENT_MANAGEMENT.md).
