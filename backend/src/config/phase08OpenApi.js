const uid = { type: 'string', format: 'uuid' };
const text = (maxLength) => ({ type: 'string', maxLength });
const enumeration = (...values) => ({ type: 'string', enum: values });
const time = { type: 'string', format: 'date-time' };
const date = { type: 'string', format: 'date' };
const integer = (minimum, maximum) => ({ type: 'integer', minimum, maximum });
const bool = { type: 'boolean' };
const reason = text(500);
const page = { page: integer(1, 10000), limit: integer(1, 100), search: text(120) };
const object = (properties, required = []) => ({ type: 'object', additionalProperties: false, properties, ...(required.length ? { required } : {}) });
const status = enumeration('DRAFT', 'SCHEDULED', 'CANCELLED', 'COMPLETED');
const providerStatus = enumeration('NOT_REQUIRED', 'PENDING', 'PROCESSING', 'READY', 'FAILED', 'SYNC_REQUIRED');
const dispatchStatus = enumeration('NOT_SENT', 'SENT');
const promotions = enumeration('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'PROVISIONED');
const audience = enumeration('ALL_ACTIVE_USERS', 'STAFF', 'INTERNS', 'DEPARTMENT', 'SELECTED_USERS');
const mode = enumeration('MANUAL', 'GOOGLE_CALENDAR');
const version = { expectedVersion: integer(0, 2147483647) };
const preview = { ...version, previewToken: { type: 'string', pattern: '^[a-f0-9]{64}$' } };
const meeting = { title: text(160), description: text(4000), startAt: time, endAt: time, audienceType: audience,
  departmentId: { ...uid, nullable: true }, selectedUserIds: { type: 'array', items: uid, maxItems: 250 },
  creationMode: mode, meetingUrl: { type: 'string', format: 'uri', nullable: true } };
const meetingView = object({ id: uid, meetingCode: text(50), title: text(160), description: text(4000), startAt: time, endAt: time,
  status, providerSyncStatus: providerStatus, creationMode: mode, timezone: enumeration('Asia/Kolkata') }, ['id', 'status', 'providerSyncStatus']);
const pagination = object({ page: integer(1, 10000), limit: integer(1, 100), total: { type: 'integer' }, totalPages: { type: 'integer' } });
meetingView.additionalProperties = true;
const listOf = (items = { type: 'object' }) => object({ items: { type: 'array', items }, pagination }, ['items', 'pagination']);
const dispatch = object({ status: dispatchStatus, declaredSentAt: { ...time, nullable: true }, recordedAt: { ...time, nullable: true },
  recordedByAuthorizedTeam: bool, message: text(600), history: listOf() }, ['status', 'message']);
const promotion = { designation: text(100), effectiveOn: date, reason };
const extension = { startsOn: date, endsOn: date, durationDays: integer(1, 730), reason, remarks: text(500) };
const connection = object({ available: bool, connected: bool, writeAuthorized: bool, connectedAt: { ...time, nullable: true },
  providerRevoked: { ...bool, nullable: true } });
const empty = object({});

export const phase08Paths = {};

function add(tag, method, path, summary, { params = {}, input, response, success = 200, callback = false } = {}) {
  const parameters = Object.entries(params).map(([name, schema]) => ({ in: 'query', name, schema }));
  for (const match of path.matchAll(/\{(\w+)\}/g)) parameters.unshift({ in: 'path', name: match[1], required: true, schema: uid });
  (phase08Paths['/api/v1/' + path] ??= {})[method] = { summary, tags: [tag],
    security: callback ? [] : [{ BearerAuth: [] }], parameters,
    ...(input ? { requestBody: { required: Boolean(input.required?.length || input.oneOf), content: { 'application/json': { schema: input } } } } : {}),
    responses: {
      [success]: { description: callback ? 'Redirect to the organizer dashboard after state validation' : 'Operation succeeded',
        ...(!callback ? { content: { 'application/json': { schema: response ? { type: 'object', properties: {
          success: bool, data: response, requestId: { ...text(100), nullable: true }, timestamp: time
        } } : { $ref: '#/components/schemas/StandardSuccessResponse' } } } } : {}) },
      400: { description: 'Validation failed' }, 401: { description: 'Authentication required' },
      403: { description: 'Role, scope, account or recent-sign-in restriction' }, 404: { description: 'Record unavailable in this scope' },
      409: { description: 'Lifecycle, concurrency or configuration conflict' }
    }
  };
}

const meetings = 'Meetings';
for (const [path, summary] of [['meetings', 'List meetings within administrative scope'], ['meetings/me', 'List own meeting invitations']]) {
  add(meetings, 'get', path, summary, { params: { ...page, status, upcoming: bool }, response: listOf(meetingView) });
}
add(meetings, 'post', 'meetings', 'Create a meeting draft', {
  input: object(meeting, ['title', 'description', 'startAt', 'endAt', 'audienceType']), response: meetingView, success: 201
});
add(meetings, 'get', 'meetings/me/{id}', 'Read an own invitation', { response: meetingView });
add(meetings, 'get', 'meetings/eligible-users', 'List eligible people for selected-user audiences', { params: page, response: listOf() });
add(meetings, 'get', 'meetings/{id}', 'Read a managed meeting', { response: meetingView });
add(meetings, 'patch', 'meetings/{id}', 'Update an authorized draft', { input: object({ ...meeting, ...version }, ['expectedVersion']) });
add(meetings, 'get', 'meetings/{id}/participants', 'List current participants in management scope', { params: page, response: listOf() });
add(meetings, 'post', 'meetings/{id}/preview-audience', 'Preview the current or proposed audience', {
  input: { oneOf: [empty, object({ ...meeting, ...version }, ['expectedVersion'])] },
  response: object({ version: integer(0, 2147483647), count: integer(0, 1000), people: { type: 'array', items: { type: 'object' } },
    previewToken: preview.previewToken })
});
add(meetings, 'post', 'meetings/{id}/schedule', 'Schedule the confirmed meeting audience',
  { input: object(preview, ['expectedVersion', 'previewToken']), response: meetingView });
add(meetings, 'post', 'meetings/{id}/reschedule', 'Apply edits and notify the confirmed audience',
  { input: object({ ...meeting, ...preview }, ['expectedVersion', 'previewToken']), response: meetingView });
add(meetings, 'post', 'meetings/{id}/cancel', 'Cancel a meeting and queue authorized provider synchronization',
  { input: object({ ...version, reason }, ['expectedVersion', 'reason']), response: meetingView });
add(meetings, 'post', 'meetings/{id}/complete', 'Record completion of an elapsed meeting', { input: object(version, ['expectedVersion']) });
add(meetings, 'post', 'meetings/{id}/respond', 'Accept or decline an own invitation',
  { input: object({ response: enumeration('ACCEPTED', 'DECLINED') }, ['response']) });
add(meetings, 'post', 'meetings/{id}/join', 'Return an authorized Google Meet URL and record the participant link request',
  { input: empty, response: object({ meetingUrl: { type: 'string', format: 'uri' } }, ['meetingUrl']) });
add(meetings, 'post', 'meetings/{id}/retry-sync', 'Retry a failed or unresolved Calendar synchronization',
  { input: object(version, ['expectedVersion']) });

const calendar = 'Calendar authorization';
add(calendar, 'get', 'calendar/connection', 'Read the organizer’s Calendar connection status', { response: connection });
add(calendar, 'post', 'calendar/connect', 'Start a recently authenticated, browser-bound OAuth flow',
  { input: empty, response: object({ consentUrl: { type: 'string', format: 'uri' } }) });
add(calendar, 'get', 'calendar/callback', 'Consume the one-time OAuth state and connect the approved calendar',
  { params: { state: text(43), code: text(2048), error: text(100) }, callback: true, success: 303 });
add(calendar, 'post', 'calendar/disconnect', 'Remove persistent Calendar credentials and revoke provider consent',
  { input: empty, response: connection });

const follow = 'Internship follow-up';
add(follow, 'get', 'internships/followups/completed', 'List completed enrollments and optional certificate dispatch filters',
  { params: { ...page, dispatchStatus }, response: listOf() });
const prefix = 'internships/{id}/';
add(follow, 'get', prefix + 'certificate-email-status', 'Read authorized manual certificate email status and permitted history',
  { params: page, response: dispatch });
add(follow, 'post', prefix + 'certificate-email-status/mark-sent', 'Record an external dispatch declaration with explicit confirmation',
  { input: object({ requestKey: uid, confirmed: { ...bool, enum: [true] }, declaredSentAt: time, note: text(500) },
    ['requestKey', 'confirmed', 'declaredSentAt']), response: dispatch });
add(follow, 'post', prefix + 'certificate-email-status/correct', 'Correct a prior dispatch declaration while retaining history',
  { input: object({ requestKey: uid, reason }, ['requestKey', 'reason']), response: dispatch });
add(follow, 'get', prefix + 'extensions', 'List original and continuation extension decisions', { params: page, response: listOf() });
add(follow, 'post', prefix + 'extensions', 'Approve revised dates or a linked continuation', { success: 201, input: { oneOf: [
  object({ ...extension, durationDays: undefined }, ['startsOn', 'endsOn', 'reason']),
  object({ ...extension, endsOn: undefined }, ['startsOn', 'durationDays', 'reason'])
] } });
add(follow, 'post', prefix + 'extensions/{extensionId}/cancel', 'Cancel an unused future extension without deleting history',
  { input: object({ reason }, ['reason']) });
add(follow, 'get', prefix + 'promotions', 'List authorized designation and staff promotion history', { params: page, response: listOf() });
add(follow, 'post', prefix + 'promotions', 'Approve an intern designation or submit a staff recommendation', {
  success: 201, input: { oneOf: [object({ ...promotion, continuationId: uid }, ['designation', 'effectiveOn', 'reason']),
    object({ ...promotion, targetRole: enumeration('TEAM_LEADER', 'HR_EXECUTIVE', 'OPERATIONS_EXECUTIVE', 'HR_MANAGER'), departmentId: uid },
      ['designation', 'effectiveOn', 'reason', 'targetRole', 'departmentId'])] }
});
add(follow, 'get', 'promotions', 'List authorized staff recommendations', { params: { ...page, status: promotions }, response: listOf() });
for (const decision of ['approve', 'reject', 'cancel']) {
  add(follow, 'post', 'promotions/{id}/' + decision, 'Record an authorized ' + decision + ' decision',
    { input: object({ reason }, ['reason']) });
}
add(follow, 'post', 'promotions/{id}/provision', 'Activate approved staff through recently authenticated primary-Founder provisioning',
  { input: empty });
