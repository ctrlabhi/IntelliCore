# Announcement management

An announcement starts as a draft with title, plain-text message, audience and optional expiry. Authorization applies to both audience type and current department. Preview returns the current recipient count and a content revision fingerprint. Immediate publication checks the preview again and writes the publication, explicit recipient snapshot, notifications and audit record in one transaction.

| Author | Default ceiling |
| --- | --- |
| Founder and Co-Founder | Organization, staff, interns, a department or explicit selected active users |
| HR Manager | Eligible interns or a department |
| Operations Executive | Staff or a department |
| Team Leader | Current assigned active departments |
| HR Executive and Intern | Received announcements |
| Admin | Received announcements by default. Organization authoring also requires an explicit grant |

Announcement audiences contain verified eligible active users with the applicable staff, internship or membership criteria. An audience limited to selected people accepts up to 250 recipients. Publication is capped at 1,000. Each published recipient has a durable receipt. Recipients can read their own active announcement and never receive other recipients’ identities.

Scheduling records the authorized audience snapshot. The worker checks the author’s current authorization and intersects the snapshot with current eligibility at publication. New members need a separately authorized announcement. An expired or unauthorized schedule is cancelled with an audit outcome. Draft and scheduled announcements can be cancelled. Published or cancelled announcements can be archived. Publication history and prior receipts persist. [Notification channels](NOTIFICATION_MANAGEMENT.md) · [API contracts](API.md#phase-07-notifications-announcements-and-delivery).
