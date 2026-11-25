const uuid = { type: 'string', format: 'uuid' };
const time = { type: 'string', format: 'date-time' };
const bool = { type: 'boolean' };
const number = { type: 'integer', minimum: 1 };
const text = (maxLength) => ({ type: 'string', maxLength });
const select = (values) => ({ type: 'string', enum: values });
const object = (properties, required = []) => ({ type: 'object', additionalProperties: false, properties,
  ...(required.length ? { required } : {}) });
const confirm = object({ confirm: { type: 'boolean', enum: [true] } }, ['confirm']);
const list = { page: number, limit: { ...number, maximum: 100 }, search: text(120), sort: select(['asc', 'desc']) };
const categories = ['ACCOUNT', 'INTERNSHIP', 'ATTENDANCE', 'LEAVE', 'TASK', 'LEARNING', 'ANNOUNCEMENT', 'MEETING'];
const states = ['DRAFT', 'SCHEDULED', 'PUBLISHED', 'CANCELLED', 'ARCHIVED'];
const emailStates = ['PENDING', 'PROCESSING', 'RETRY_SCHEDULED', 'SENT', 'FAILED', 'CANCELLED', 'CAPTURED'];
const audience = { title: text(160), message: text(5000),
  audienceType: select(['ALL_ACTIVE_USERS', 'STAFF', 'INTERNS', 'DEPARTMENT', 'SELECTED_USERS']),
  departmentId: { ...uuid, nullable: true }, selectedUsers: { type: 'array', items: uuid, maxItems: 250 },
  expiresAt: { ...time, nullable: true } };
const preview = { expectedRevision: number, previewToken: text(64) };
export const phase07Paths = {};

function add(tag, method, path, summary, { query = {}, body, status = 200 } = {}) {
  const parameters = Object.entries(query).map(([name, schema]) => ({ in: 'query', name, schema }));
  for (const match of path.matchAll(/\{(\w+)\}/g)) parameters.unshift({ in: 'path', name: match[1], required: true, schema: uuid });
  (phase07Paths['/api/v1/' + path] ??= {})[method] = {
    tags: [tag], summary, security: [{ BearerAuth: [] }], parameters,
    ...(body ? { requestBody: { required: Boolean(body.required?.length), content: { 'application/json': { schema: body } } } } : {}),
    responses: {
      [status]: { description: 'Operation succeeded', content: { 'application/json': {
        schema: { $ref: '#/components/schemas/StandardSuccessResponse' }
      } } },
      400: { description: 'Strict request validation failed' }, 401: { description: 'Authentication required' },
      403: { description: 'Account or permission restriction' }, 404: { description: 'Record unavailable in this scope' },
      409: { description: 'Changed audience, revision or lifecycle conflict' }
    }
  };
}

const n = 'Notifications';
add(n, 'get', 'notifications/me', 'List own notifications with category and read filters',
  { query: { ...list, category: select(categories), state: select(['ALL', 'READ', 'UNREAD', 'ARCHIVED']) } });
add(n, 'get', 'notifications/me/unread-count', 'Count own unread notifications');
add(n, 'get', 'notifications/{id}', 'Read own notification detail');
add(n, 'post', 'notifications/{id}/read', 'Idempotently mark own notification read');
add(n, 'post', 'notifications/{id}/archive', 'Idempotently archive own notification');
add(n, 'post', 'notifications/me/read-all', 'Mark own unread, non-archived notifications read');
add(n, 'get', 'notification-preferences/me', 'Read effective own preferences');
add(n, 'patch', 'notification-preferences/me', 'Update own optional preferences',
  { body: object({ emailEnabled: bool, taskReminders: bool, learningUpdates: bool, announcements: bool }) });

const a = 'Announcements';
add(a, 'get', 'announcements/me', 'List active announcements received by the caller', { query: list });
add(a, 'get', 'announcements/me/{id}', 'Read one currently authorized received announcement');
add(a, 'get', 'announcements/eligible-recipients', 'List eligible recipient names for authorized selected-person audiences', { query: list });
add(a, 'get', 'announcements', 'List managed announcements within audience scope',
  { query: { ...list, departmentId: uuid, status: select(states) } });
add(a, 'post', 'announcements', 'Create an announcement draft', {
  body: object(audience, ['title', 'message', 'audienceType']), status: 201
});
add(a, 'get', 'announcements/{id}', 'Read managed announcement within scope');
add(a, 'patch', 'announcements/{id}', 'Edit and audit the current announcement draft',
  { body: object({ ...audience, expectedRevision: number }, ['expectedRevision']) });
add(a, 'post', 'announcements/{id}/preview-audience', 'Preview audience count and obtain a current fingerprint');
add(a, 'post', 'announcements/{id}/publish', 'Publish to the confirmed current audience',
  { body: object(preview, ['expectedRevision', 'previewToken']) });
add(a, 'post', 'announcements/{id}/schedule', 'Schedule publication to still-eligible recipients in the approved snapshot',
  { body: object({ ...preview, scheduledAt: time }, ['expectedRevision', 'previewToken', 'scheduledAt']) });
for (const action of ['cancel', 'archive']) add(a, 'post', 'announcements/{id}/' + action, 'Confirm and ' + action + ' announcement', { body: confirm });

const e = 'Notification administration';
add(e, 'get', 'admin/email-outbox', 'List sanitized email job metadata', { query: { ...list, status: select(emailStates) } });
add(e, 'get', 'admin/email-outbox/{id}', 'Read job metadata and permitted local capture preview');
add(e, 'get', 'admin/email-outbox/{id}/attempts', 'List sanitized delivery attempts', { query: list });
add(e, 'post', 'admin/email-outbox/{id}/retry', 'Authorize a bounded retry of a failed job',
  { body: object({ ...confirm.properties, confirmAmbiguous: bool }, ['confirm']) });
add(e, 'post', 'admin/email-outbox/{id}/cancel', 'Cancel an eligible queued or failed job', { body: confirm });
add(e, 'get', 'admin/notification-stats', 'Read counts by real delivery state');
add(e, 'get', 'admin/notification-worker/status', 'Read worker heartbeat and effective reminder windows');
add(e, 'patch', 'admin/notification-worker/reminders', 'Set audited reminder windows',
  { body: object({ taskHours: { type: 'integer', minimum: 0, maximum: 72 }, reportMinutes: { type: 'integer', minimum: 0, maximum: 120 },
    commencementDays: { type: 'integer', minimum: 0, maximum: 14 }, completionDays: { type: 'integer', minimum: 0, maximum: 14 } },
  ['taskHours', 'reportMinutes', 'commencementDays', 'completionDays']) });

add('Task reviews', 'get', 'task-submissions/{id}/review/amendments', 'List retained authorized score amendments', { query: list });
add('Task reviews', 'post', 'task-submissions/{id}/review/amend', 'Amend an approval score using its original rubric', {
  status: 201, body: object({ expectedRevision: { type: 'integer', minimum: 0 }, reason: text(1000),
    score: { type: 'integer', minimum: 0, maximum: 10000 },
    criterionScores: { type: 'array', maxItems: 12, items: { type: 'integer', minimum: 0, maximum: 10000 } }
  }, ['expectedRevision', 'reason'])
});
add('Learning', 'get', 'learning/enrollments/{id}', 'Read a scoped recorded enrollment and its lesson progress');
add('Learning', 'get', 'learning/me/enrollments/{id}', 'Read one own published enrollment and its lesson progress');
const progressState = select(['IN_PROGRESS', 'COMPLETED']);
add('Learning', 'post', 'learning/enrollments/{id}/lessons/{lessonId}/correct', 'Correct an observed lesson with retained history', {
  status: 201, body: object({ expectedStatus: progressState, status: progressState, expectedCorrectionId: { ...uuid, nullable: true },
    reason: text(1000) }, ['expectedStatus', 'status', 'expectedCorrectionId', 'reason'])
});
