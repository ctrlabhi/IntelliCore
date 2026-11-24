# Attendance, leave and Daily Work Reports

Phase 05 applies to verified, active intern accounts with an eligible enrollment. An internship becomes eligible on its approved commencement date and remains eligible through its expected completion date while its lifecycle permits work. Staff accounts and other roles have no automatic attendance obligation.

## Daily attendance

- The approved schedule is Monday to Friday, 09:30 to 18:30 IST, with zero grace. Saturday and Sunday are weekly off. The Intern dashboard sends an authenticated check-in request on first eligible visible access. If it opens early, it schedules a request using the server's opening time. The recorded check-in is the actual server time.
- Check-in and checkout store UTC timestamps. The unique daily key is enrollment plus IST business date. Concurrent requests share a user row lock and return the existing daily record on refresh or retry.
- Explicit logout records checkout on the current IST date. Same-date logout after 18:30 can supply a real checkout. A session that crosses midnight IST cannot close an older row. Closing a browser, losing a connection, or expiring a session does not supply checkout evidence. If the API fails, the dashboard provides a notice and Firebase sign-out proceeds.
- Arrival after 09:30:00.000 IST is late. Departure before 18:30:00.000 IST is early. The flags use millisecond comparisons. Positive duration labels round up to the next whole minute.

| Daily state | Meaning |
| --- | --- |
| Open shift or in progress | An eligible shift is underway, or evidence can still arrive. The UI can show “awaiting report” separately. |
| `PRESENT` | Actual or approved corrected check-in and checkout, plus a submitted report. Late and early flags remain visible. |
| `INCOMPLETE` | Check-in exists and one or more required items are missing after their deadlines. Missing checkout and report are independent flags. |
| `ABSENT` | A completed working shift with known eligibility covering its full window and no recorded check-in. |
| `ON_LEAVE` | Authorized leave covers this working day. Recorded activity is retained when the reviewer explicitly reconciles it. |
| `WEEKLY_OFF` | A non-working day within an observed eligible period. |

Historical evaluation uses stored eligibility intervals, effective-dated policies, leave decisions and recorded evidence. The migration starts known eligibility at cutover for currently eligible enrollments. Earlier days and partial shifts without evidence do not produce an assumed absence. Continuous eligible intervals that meet at a boundary count as one continuous window. Reporting derives absence on demand, so restarts and repeat requests do not create duplicate absence rows. A late same-day checkout or approved historical decision uses the new evidence on the next read.

## Work reports and leave

Interns can save today's report draft during its working-day window and submit it before 20:00 IST. Required fields cover work, learning, progress, blockers and the next working day. A submitted report is immutable except for review metadata. It never creates attendance. The deadline still applies if an intern logs back in after early checkout.

Leave categories are sick, casual, emergency and other. Requests stay within the eligible internship period, cover at least one scheduled working day and cannot overlap a pending or approved request. Weekend dates do not count toward working-day totals. Owners can cancel a pending request or an approved request before its first date. Reviewers approve or reject with remarks. Approval covering a recorded check-in or checkout requires an explicit decision to classify the day as leave and preserve those events. A rejected or cancelled request grants no exemption.

## Corrections and administration

An intern can request a timestamp correction after the eligible shift closes or a late report after 20:00 IST. The request stores its reason, original values and proposed values. Dates and timestamp ordering remain constrained to the verified historical window. The request itself records no check-in or checkout. An authorized reviewer decides with remarks. Stale proposals require a new request after rejection. Successful approval applies the change and writes the audit event in one transaction. A late report preserves its actual request timestamp and separate approval timestamp.

Founder, Co-Founder, Admin, HR and Operations see their granted organization-level information. Team Leaders may read attendance and submitted reports in their actively assigned departments. Leave, report and correction reviews require Founder or HR Manager authority and the respective grants. Only the primary Founder can publish a future policy version. New versions retain the approved schedule and leave previous versions intact. Exports require Founder or HR Manager authority and the corresponding grant.

History pages paginate by enrollment over a bounded date range, including days without persisted attendance rows. Summaries and CSV use up to 31 dates and 250 matching enrollments, with an explicit request error for wider cohorts. Filter by department, search, or date to narrow larger exports. CSV includes verified attendance evidence and flags and excludes report text and leave reasons. [API](API.md#phase-05-attendance-leave-and-work-reports).
