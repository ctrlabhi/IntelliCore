# Notification management

IntelliCore creates in-app notifications and eligible email outbox jobs in the same MySQL transaction as a successful business operation. Commit precedes any transport call. SMTP availability has no effect on application or attendance writes. MySQL holds the recipient, message category, resource scope and independent read/archive state. Browser polling refreshes the unread count while the authenticated dashboard is visible. The notification center supports filtering, pagination, read-all and archive.

## Recipients and channels

| Event | Trusted recipients | Channel |
| --- | --- | --- |
| Application received, approved, declined or changes requested | The applicant, including eligible verified pending applicants | In-app and optional email |
| Application ready to review | Active authorized application reviewers | In-app |
| Internship enrollment, start and termination | The intern | In-app |
| Mentor change | The intern and newly assigned mentor when applicable | In-app |
| Internship completion review reminder | The intern and authorized completion reviewers | In-app |
| Internship completion approved | The intern | In-app and optional email |
| Daily report due | Eligible intern with a missing report, within the policy window | In-app |
| Daily report submitted | Active Team Leaders with report-read permission for the department | In-app |
| Daily report reviewed | The intern | In-app |
| Leave or attendance correction request | Active authorized HR Manager or Founder reviewers | In-app |
| Leave or correction decision | The requesting intern | In-app and optional email |
| Task assigned or due soon | The explicitly assigned intern | In-app and optional email |
| Deadline extended, task or assignment cancelled | The affected intern | In-app |
| Task submitted | Authorized organization reviewers or active Team Leaders in the task department | In-app |
| Task changes requested or approved | The assigned intern | In-app and optional email |
| Approved score amended | The assessed intern | In-app |
| Curriculum assigned or required learning completed | The enrolled intern, with completion available to authorized department mentors | In-app |
| New curriculum publication | Authorized department mentors. Existing learners retain their pinned curriculum | In-app |
| Learning progress corrected | The enrolled intern | In-app |
| Announcement | Recipients on the authorized publication snapshot | In-app |

Deduplication hashes the event, resource, meaningful revision or reminder window, and recipient. Background claims and delivery attempts use the persisted job and never construct a second notification. Applications and technical submissions use current role/permission queries for reviewer discovery. Learning, tasks and attendance retain their separate business models.

In-app operational notices are enabled. Email for configured operational events is optional and preference-controlled. Task reminders and learning updates are optional and enabled by default. Announcement alerts are enabled by default. Disabling announcement alerts removes future bell alerts while keeping the authorized announcement available in the announcement inbox. Verified pending accounts can only read and manage their own onboarding notices. Firebase retains verification and password reset.

## Navigation and privacy

The generated action path opens one dashboard-owned notice. On navigation the browser rechecks notification ownership and then fetches the linked resource through the existing protected endpoint. A role change, departmental revocation or an inactive record can make the linked resource unavailable. Subjects and feed previews use fixed summaries and exclude private reports and feedback. Actual announcement content remains in the authorized announcement endpoint. [API contracts](API.md#phase-07-notifications-announcements-and-delivery).

## Phase 08 events

Meeting invitations, reschedules, cancellations and reminders have in-app and policy-controlled email channels. The worker checks scope, lifecycle, revision and reminder eligibility. Scheduled meeting notices for organizers are in-app.

Certificate dispatch declarations and corrections, internship extensions and promotion decisions are in-app. Dispatch events have no email template or outbox producer. The worker refuses dispatch events even if an outbox record is injected. Earlier internship-completion event behavior stays in place. [Manual certificate email status](MANUAL_CERTIFICATE_EMAIL_STATUS.md).
