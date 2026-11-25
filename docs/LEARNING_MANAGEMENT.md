
# Learning management

IntelliCore stores department curricula, immutable published versions, learning enrollments, and individual lesson progress in MySQL. Lesson completions describe the intern’s self-reported activity. Reviewed deliverables and scores are recorded independently in Tasks.

## Recovered curriculum

The original catalog appears in three historical copies in the repository. The canonical server module preserves the exercise prompts, deliverables and rubrics. The historical frontend asset and Firebase Functions copy remain available for reference. The revised dashboards use authorized REST APIs. The original training interface supported assignment, submission, mentor review and aggregate training progress. Its review handler accepts approval and requests for changes. The recovered catalog contains exercises without separate lessons, external reference URLs or WordPress content. [Server source](../backend/src/modules/learning/curriculum.js) · [Legacy workflow](../legacy-firebase/functions/index.js).

| Department | Code | Recovered exercises |
| --- | --- | --- |
| Human Resources | HR | Candidate journey and accessible onboarding guide |
| Web Development | WEB_DEV | Accessible responsive landing page and validated task API |
| Data Analytics | DATA_ANALYTICS | Dataset cleanup audit and analytics dashboard |
| Business Analytics | BIZ_ANALYTICS | Requirements brief and data-backed recommendation |
| Graphic Designing | GRAPHIC_DESIGN | Mini brand system and multi-format campaign assets |
| Content Writing | CONTENT_WRITING | Editorial brief and evidence-led explainer |
| Digital Marketing | DIGITAL_MARKETING | Campaign brief and performance review |
| Social Media Management | SOCIAL_MEDIA | Responsible content calendar and engagement report |
| WordPress Development | WORDPRESS_DEV | None recovered. The department can author a track. |

The permission/content seed imports eight published practice tracks and 16 exercise lessons, one original exercise per module, with the original prompts and deliverables. The original 100-point rubrics remain in the department task templates. This mapping is a Phase 06 engineering default. It does not create assignments, enrollments, submissions or completed lessons. Repeated seed runs preserve authored, published and archived versions. Legacy Firebase learner records were not copied into MySQL.

## Authoring and versions

Founder, Co-Founder and actively assigned Team Leaders with curriculum permissions may manage their authorized scope. Create tracks, modules, lessons and URL resources as drafts. Sequence fields reorder modules, lessons and resources, with a stable tie-break by ID. Modules and lessons can be required or optional. Resources can attach to a module or a lesson. Draft resources can be removed. Draft, published and archived are track-version states shared by the contained items.

A published version is immutable. Copy the latest version to a draft to edit it. Publishing the new version archives the previous publication in the same series. Existing enrollments retain access to their original published version, including after archival. The enrollment uniqueness key is internship plus track version. Explicit selection can enroll an eligible internship in a published track within its department without dropping previous records.

## Enrollment and progress

For an eligible internship approved in its working window, approval selects the sole published department track when one exists. The intern dashboard checks again on eligible use for earlier records, future start dates and newly published department content. The sync operation is idempotent, honors any existing enrollment, and surfaces multiple published choices for authorized staff selection. A pending or future intern cannot read restricted curriculum content. Completion review and completed interns may read their historical published content with an active verified intern account. Starting or completing lessons requires a current eligible internship.

A new lesson has no progress row until it is started. Starting is idempotent. Only a started lesson can be marked complete. Completion is also idempotent. A lesson counts toward the track’s required denominator when both its module and the lesson are required. Other lessons are counted separately. A module completes when all its required lessons are complete, or all its lessons when it has optional lessons only. Empty modules do not complete. A track completes only when it has at least one required lesson and all required lessons are completed. A zero denominator produces a null percentage.

Authoring limits are provisional defaults. A track supports up to 30 modules, a module up to 40 lessons, and each module or lesson up to 20 link resources. No automatic certificate or competency judgment follows lesson completion. See [performance calculations](PERFORMANCE_EVALUATION.md) and [API contracts](API.md#phase-06-tasks-learning-and-performance).
