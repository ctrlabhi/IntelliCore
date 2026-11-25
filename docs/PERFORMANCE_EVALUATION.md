
# Performance evaluation

Reports use persisted task assignments, reviews and lesson progress. Founder and other explicitly authorized staff can view organization-wide metrics. Team Leaders receive their current departments. Interns receive their own eligible or historical records. HR Manager can see recorded evaluation feedback and scores within reporting scope. HR Executive, Admin and Operations Executive receive aggregate and status information by default. The private submission body and attachments use separate technical reviewer authorization. [Phase 06 permission matrix](RBAC.md#phase-06-work-and-learning-permissions).

| Measure | Definition |
| --- | --- |
| Published task definitions | Number of definitions currently in Published state. A separate lifetime publication count includes closed, cancelled or archived definitions that were published. |
| Individual assignments | Number of assignment rows, including cancelled rows. Status groups use current state. |
| Pending work | Assigned + In progress + Revision requested. |
| Awaiting review | Submitted assignments in the current Submitted state. |
| Approved | Completed assignments, reached only by authorized approval. |
| Overdue | Published and available assignments awaiting intern work with an effective deadline strictly earlier than the server instant. Awaiting review work is excluded. |
| Task completion rate | Completed assignments divided by all assignments excluding cancelled. Closed unresolved work remains in the denominator. A zero denominator gives a null percentage. |
| Required learning progress | Completed required lessons divided by required lessons in the selected enrollments. Aggregate percentages use total lesson counts, weighted by their denominator. |
| Optional learning progress | Count of completed and total optional lessons, independent of required progress. |
| Evaluation history | Recorded review decisions, version, feedback, reviewer and nullable scores. Revision scores and approved scores remain distinct. |

Date filters use inclusive IST calendar dates. The task cohort uses assignment time, publication counts use publication time, and learning groups use enrollment time. Evaluation history uses the selected assignment cohort and is sorted by review time. State and progress describe the current records in that cohort. Percentages round to two decimal places. The API returns counts, denominators and null percentages for empty denominators.

The product has no approved overall score, ranking, automatic score deduction, automatic internship decision or certificate threshold. The system leaves unreviewed work without a score. [API contracts](API.md#phase-06-tasks-learning-and-performance).
