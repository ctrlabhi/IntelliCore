
# Task management

Task definitions, individual assignments and submission versions are separate records. An organization-wide task manager can work across departments. A Team Leader can work within active assigned departments. See the [permission matrix](RBAC.md#phase-06-work-and-learning-permissions).

## Definitions and recipients

A task belongs to one department. The author chooses a title, instructions, deliverables, availability, deadline, priority and optional rubric, links or private resources. The recovered exercise catalog supplies exact titles, instructions, deliverables and rubric points where available. Drafts can be revised before publication. Draft task files can be attached privately.

Individual publication requires one or more explicit internship IDs. Department publication previews every eligible internship in that department. Publication validates the current task revision and the exact previewed roster, then creates assignments and audit entries in one transaction. Every assignment records its recipient, internship, assigner and timestamp. A newly eligible intern may be added with a new confirmed preview. The same task and internship can occur once.

Eligibility requires an active, verified, intern-only account without a staff profile and an active department. The approved or ongoing internship dates must include the current IST business date. Application-only, future, suspended, completed, withdrawn and terminated records are ineligible for new assignments.

## Lifecycle

| Record | Transitions and effects |
| --- | --- |
| Definition | Draft can publish or cancel. Published can close or cancel. Closed or cancelled can archive. |
| Assignment | Assigned → In progress → Submitted → Completed. An explicit revision request returns submitted work to Revision requested and allows another submission. |
| Closure | New starts, submissions and revisions stop. Reviewers can approve submitted work. Archival requires that submitted work on a closed task be reviewed or explicitly cancelled. |
| Cancellation | Cancelling a task cancels its unfinished assignments. An authorized manager can also cancel an unfinished assignment individually with a recorded reason. History remains available. |

Published edits require confirmation and the current revision. Department, type and availability are fixed after publication. Deadlines may be extended. An individual override stays effective independently until explicitly extended again. Existing submitted work retains its original deadline, instructions, deliverables and rubric snapshot. Attachment membership of a task is fixed at publication.

Deadlines and submission times are server-generated UTC instants, interpreted and displayed with Asia/Kolkata for business dates. The status and deadline indicator are separate. A published, available assignment awaiting work is overdue strictly after its effective deadline. Late submission remains available while the task is published and the internship is eligible. Late flags do not change marks or internship status.

## Submission and review

Interns can start work, save the current draft, attach permitted private files, and submit written responses, HTTP(S) project or repository URLs and additional labeled links. A draft needs at least one delivery item for submission. The current assignment and draft serialize concurrent edits, attachment additions and submission. The draft revision makes stale changes conflict. Submitted versions are immutable. Each revision creates a new numbered version.

Reviewers can see submitted versions and authorized attachments within scope. The current unreviewed version accepts an approval or revision request with substantive feedback. Review records, assignment status and audit entries commit together. One review per submitted version is preserved. Revision scores and approval scores stay attached to their respective versions.

For tasks with a rubric, reviewers may submit one bounded integer score per criterion. The server sums them and verifies any supplied total. Where a maximum exists and no rubric is defined, reviewers can supply an integer from zero through that maximum. Review feedback and scores are distinct from self-reported progress. A review can be unscored. There is no pass threshold, automatic rejection, certificate issuance or attendance side effect.

## Provisional engineering defaults

An authored task belongs to a single department. A selected-recipient request accepts up to 250 rows. Up to twelve criteria and twenty task reference URLs are supported. The preview token is a deterministic roster fingerprint and never confers authorization. Role, eligible internship and current department membership are checked by the application. See [API contracts](API.md#phase-06-tasks-learning-and-performance), [private file storage](FILE_STORAGE.md) and [performance calculations](PERFORMANCE_EVALUATION.md).
