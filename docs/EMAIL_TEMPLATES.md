# Email templates

The versioned application registry is implemented in the [notification policy](../backend/src/modules/notifications/notificationPolicy.js) and [renderer](../backend/src/integrations/email/emailTemplates.js). Version 1 provides IntelliCore HTML and plain-text layouts, a greeting, event summary, an authenticated call to action and a footer.

| Template key | Event |
| --- | --- |
| application-received | Internship application submitted |
| application-approved | Internship application approved |
| application-decision | Internship declined or changes requested |
| task-assigned | Task assigned |
| task-reminder | Task deadline approaching |
| task-revision | A reviewer requests changes |
| task-approved | A reviewer approves submission |
| leave-approved | Leave request approved |
| leave-rejected | Leave decision declined |
| attendance-correction | Attendance correction decision |
| internship-completed | Internship completion approved |
| company-announcement | Versioned template reserved, with current announcement delivery in-app |

Queue data stores template identity, event and fixed-shape application path. The renderer builds the URL from a validated configured application origin. Local messages explain where the workspace link can be opened. Content uses fixed event copy, HTML escaping and a single safe sender envelope. No passwords, Firebase tokens, feedback, personal details or attachments are rendered. Capture previews use the recorded template version under the local admin scope.
