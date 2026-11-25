# Meeting management

Create a draft with a title, agenda, date, duration, eligible audience and conference source. The dashboards display India time. APIs accept offset-aware ISO timestamps and MySQL stores UTC. Preview the current audience before publishing or changing an invitation. The preview fingerprint includes the proposed meeting, revision and ordered recipients. Scheduling rejects a stale fingerprint or empty audience. Selected users are deduplicated. Preview displays up to 100 names and a total. The audience limit is 1,000 and the meeting duration limit is 24 hours.

Manual scheduling accepts canonical HTTPS Google Meet links in the form `https://meet.google.com/abc-defg-hij`. IntelliCore parses and validates the link format and never retrieves it to establish availability. Optional Calendar-created links appear only after the worker confirms provider conference readiness.

Founder, Co-Founder and Admin need organization meeting permission. HR Managers manage their own HR/internship audiences. Operations Executives manage their own staff/department audiences. Team Leaders manage assigned active departments. HR Executives and interns use their own invitations. A participant must still qualify for the selected audience to respond or retrieve a link. A revoked Team Leader assignment removes management authority.

Meeting lifecycle is Draft, Scheduled, Cancelled or Completed. Provider synchronization status is independent. A cancellation never implies the provider cancelled successfully until the worker completes the change. Schedule changes and participant removal retain their auditable history. Participant response and a join link request record user intent. Meeting completion and elapsed time do not verify attendance.

Participant invitations, reschedules, cancellations and due reminders use the shared Phase 07 notification and outbox service. Worker authorization rechecks meeting revision, participant eligibility and response. Reminder defaults are 1,440, 60 and 10 minutes before start, configurable through `MEETING_REMINDER_MINUTES`. A worker has a five-minute delivery window. Reminders are deduplicated by meeting, revision, lead and recipient, and are suppressed for elapsed, cancelled, declined or out-of-scope invitations. Email defaults to CAPTURE.

See [Google Calendar integration](GOOGLE_CALENDAR_INTEGRATION.md) and [API](API.md#phase-08-meetings-and-internship-follow-up).
