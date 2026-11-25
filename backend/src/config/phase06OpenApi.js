
import { assignmentStatuses, curriculumStatuses, priorities, taskStatuses, taskTypes } from '../modules/work/workInput.js';

const uuid = { type: 'string', format: 'uuid' };
const dateTime = { type: 'string', format: 'date-time' };
const date = { type: 'string', format: 'date', description: 'Asia/Kolkata calendar date' };
const text = (maxLength, options = {}) => ({ type: 'string', maxLength, ...options });
const integer = (minimum, maximum) => ({ type: 'integer', minimum, maximum });
const enumeration = (choices) => ({ type: 'string', enum: choices });
const obj = (properties, required = []) => ({
  type: 'object', additionalProperties: false, properties, ...(required.length ? { required } : {})
});
const array = (items, maxItems) => ({ type: 'array', items, maxItems });
const index = integer(1, 2147483647);
const yes = { type: 'boolean', enum: [true] };
const boolean = { type: 'boolean' };
const nullableScore = { ...integer(1, 10000), nullable: true };
const url = text(1500, { format: 'uri', description: 'HTTP(S) URL without embedded credentials' });
const link = obj({ title: text(180), url }, ['title', 'url']);
const criterion = obj({ criterion: text(180), points: integer(1, 10000) }, ['criterion', 'points']);
const confirm = obj({ confirmActiveChange: yes }, ['confirmActiveChange']);
const expected = obj({ expectedRevision: index }, ['expectedRevision']);
const empty = obj({});
const list = { page: integer(1, 10000), limit: integer(1, 100), search: text(120), sort: enumeration(['asc', 'desc']) };
const scoped = { ...list, departmentId: uuid };
const assignmentQuery = { ...scoped, internshipId: uuid, status: enumeration(assignmentStatuses),
  overdue: enumeration(['true', 'false']) };
const performanceQuery = { ...scoped, from: date, to: date };
const recipients = { recipients: array(obj({ internshipId: uuid, dueAt: dateTime }, ['internshipId']), 250),
  expectedRevision: index, previewToken: text(64), confirmActiveChange: boolean };
const task = { title: text(180), description: text(8000), instructions: text(8000), deliverables: text(8000),
  taskType: enumeration(taskTypes), priority: enumeration(priorities), availableFrom: dateTime, dueAt: dateTime,
  maximumScore: nullableScore, resources: array(link, 20), rubric: array(criterion, 12) };
const fields = { title: text(180), description: text(8000) };
const module = { ...fields, sequence: integer(1, 10000), estimatedMinutes: { ...integer(1, 10000), nullable: true },
  isRequired: boolean };
const lesson = { title: module.title, sequence: module.sequence, estimatedMinutes: module.estimatedMinutes,
  isRequired: module.isRequired, content: text(8000) };
const resource = { ...fields, resourceUrl: url, sequence: module.sequence };
const draft = { writtenResponse: text(8000, { nullable: true }), projectUrl: { ...url, nullable: true },
  repositoryUrl: { ...url, nullable: true }, additionalLinks: array(link, 10), expectedRevision: index };

const standard = { 'application/json': { schema: { $ref: '#/components/schemas/StandardSuccessResponse' } } };
const binary = { schema: { type: 'string', format: 'binary' } };
export const phase06Paths = {};

function operation(tag, path, method, summary, { body, query = {}, status = 200, upload = false, download = false } = {}) {
  const keys = [...path.matchAll(/\{(\w+)\}/g)].map((match) => match[1]);
  const parameters = keys.map((name) => ({ in: 'path', name, required: true, schema: uuid }));
  parameters.push(...Object.entries(query).map(([name, schema]) => ({ in: 'query', name, schema,
    ...(name === 'departmentId' && path.endsWith('eligible-recipients') || path.endsWith('templates') ? { required: true } : {}) })));
  if (upload) parameters.push(
    { in: 'header', name: 'x-attachment-name', required: true, schema: { type: 'string' }, description: 'Percent-encoded .txt or .png filename' },
    { in: 'header', name: 'x-expected-revision', required: true, schema: index }
  );
  const content = upload ? { 'application/octet-stream': binary } : body ? { 'application/json': { schema: body } } : null;
  (phase06Paths['/api/v1/' + path] ??= {})[method] = {
    tags: [tag], summary, security: [{ BearerAuth: [] }], parameters,
    ...(content ? { requestBody: { required: upload || Boolean(body?.required?.length), content } } : {}),
    responses: {
      [status]: { description: 'Operation succeeded', content: download ? { 'text/plain': binary, 'image/png': binary } : standard },
      400: { description: 'Validation error' }, 401: { description: 'Authentication required' },
      403: { description: 'Account, role or permission restriction' }, 404: { description: 'Resource unavailable in this scope' },
      409: { description: 'State, eligibility, or revision conflict' }, 429: { description: 'Request rate limit' },
      ...(upload ? { 413: { description: 'File size limit' }, 415: { description: 'Unsupported file content' } } : {})
    }
  };
}

const t = 'Tasks';
operation(t, 'tasks', 'get', 'List task definitions in authorized scope', { query: { ...scoped, status: enumeration(taskStatuses) } });
operation(t, 'tasks', 'post', 'Create task draft', { status: 201,
  body: obj({ ...task, departmentId: uuid, templateKey: text(100) },
    ['title', 'instructions', 'deliverables', 'taskType', 'availableFrom', 'dueAt', 'departmentId']) });
operation(t, 'tasks/templates', 'get', 'List recovered exercises and rubrics', { query: { departmentId: uuid } });
operation(t, 'tasks/eligible-recipients', 'get', 'List eligible recipient internships', { query: { ...list, departmentId: uuid } });
operation(t, 'tasks/{id}', 'get', 'Read a task definition');
operation(t, 'tasks/{id}', 'patch', 'Edit draft or confirm changes to published task', { body: obj({ ...task,
  ...expected.properties, confirmActiveChange: boolean }, ['expectedRevision']) });
operation(t, 'tasks/{id}/preview', 'post', 'Preview current eligible recipients', { body: obj(recipients) });
operation(t, 'tasks/{id}/publish', 'post', 'Publish and insert assignments atomically', { body: obj(recipients, ['expectedRevision', 'previewToken']) });
for (const action of ['close', 'cancel', 'archive']) operation(t, 'tasks/{id}/' + action, 'post', 'Confirm and ' + action + ' task', { body: confirm });
operation(t, 'tasks/{id}/assignments', 'get', 'List assignments of a task', { query: assignmentQuery });
operation(t, 'tasks/{id}/assignments', 'post', 'Assign additional selected eligible internships',
  { body: obj(recipients, ['recipients', 'expectedRevision', 'previewToken', 'confirmActiveChange']), status: 201 });
operation(t, 'tasks/{id}/attachments', 'post', 'Upload private resource to task draft', { upload: true, status: 201 });
operation(t, 'task-assignments', 'get', 'List authorized assignment progress', { query: assignmentQuery });
operation(t, 'task-assignments/me', 'get', 'List own assignments and deadline indicators', { query: assignmentQuery });
operation(t, 'task-assignments/{id}', 'get', 'Read an authorized assignment');
operation(t, 'task-assignments/{id}/start', 'post', 'Start own eligible assignment', { body: empty });
operation(t, 'task-assignments/{id}/extend', 'post', 'Confirm and extend an individual deadline', {
  body: obj({ dueAt: dateTime, confirmActiveChange: yes }, ['dueAt', 'confirmActiveChange'])
});
operation(t, 'task-assignments/{id}/cancel', 'post', 'Cancel an unfinished assignment with its history retained', {
  body: obj({ reason: text(1000, { minLength: 8 }), confirmActiveChange: yes }, ['reason', 'confirmActiveChange'])
});
operation(t, 'task-assignments/{id}/submissions', 'get', 'List own versions or authorized submitted versions', { query: list });
operation(t, 'task-assignments/{id}/submissions', 'post', 'Create or retrieve own current draft', { body: empty, status: 201 });
operation(t, 'task-submissions/{id}', 'get', 'Read permitted submission version');
operation(t, 'task-submissions/{id}', 'patch', 'Save current own draft', { body: obj(draft, ['expectedRevision']) });
operation(t, 'task-submissions/{id}/submit', 'post', 'Submit draft with immutable timing and rubric snapshot', { body: expected });
operation(t, 'task-submissions/{id}/attachments', 'post', 'Upload to eligible own draft', { upload: true, status: 201 });
operation(t, 'task-submissions/{id}/reviews', 'get', 'List permitted review history', { query: list });
operation(t, 'task-submissions/{id}/review', 'post', 'Review the latest submitted version', {
  body: obj({ decision: enumeration(['APPROVED', 'REVISION_REQUESTED']), feedback: text(4000, { minLength: 8 }),
    score: { ...integer(0, 10000), nullable: true }, criterionScores: array(integer(0, 10000), 12) }, ['decision', 'feedback']), status: 201
});
operation(t, 'attachments/{id}/download', 'get', 'Download a private authorized attachment', { download: true });

const l = 'Learning';
operation(l, 'learning/tracks', 'get', 'List curriculum versions within scope', { query: { ...scoped, status: enumeration(curriculumStatuses) } });
operation(l, 'learning/tracks', 'post', 'Create curriculum draft', { body: obj({ ...fields, departmentId: uuid },
  ['departmentId', 'title']), status: 201 });
operation(l, 'learning/tracks/{id}', 'get', 'Read curriculum outline within staff scope');
operation(l, 'learning/tracks/{id}', 'patch', 'Edit curriculum draft metadata', { body: obj(fields) });
operation(l, 'learning/tracks/{id}/versions', 'post', 'Copy latest published or archived curriculum to a new draft version', { body: empty, status: 201 });
for (const action of ['publish', 'archive']) operation(l, 'learning/tracks/{id}/' + action, 'post', 'Confirm and ' + action + ' curriculum', {
  body: confirm
});
const modules = 'learning/tracks/{trackId}/modules';
const lessons = modules + '/{moduleId}/lessons';
for (const [path, entity, properties, keys] of [
  [modules, 'module', module, ['title', 'sequence']],
  [lessons, 'lesson', lesson, ['title', 'sequence', 'content']],
  [modules + '/{moduleId}/resources', 'resource', resource, ['title', 'sequence', 'resourceUrl']],
  [lessons + '/{lessonId}/resources', 'resource', resource, ['title', 'sequence', 'resourceUrl']]
]) {
  operation(l, path, 'post', 'Add draft ' + entity, { body: obj(properties, keys), status: 201 });
  operation(l, path + '/{id}', 'patch', 'Edit or reorder draft ' + entity, { body: obj(properties) });
  if (entity === 'resource') operation(l, path + '/{id}', 'delete', 'Remove draft resource');
}
operation(l, 'learning/eligible-recipients', 'get', 'List eligible enrollment recipients', { query: { ...list, departmentId: uuid } });
operation(l, 'learning/tracks/{id}/enrollments', 'post', 'Enroll eligible same-department internship', {
  body: obj({ internshipId: uuid }, ['internshipId']), status: 201
});
operation(l, 'learning/me/sync', 'post', 'Enroll own eligible internship if one track is available', { body: empty });
operation(l, 'learning/me', 'get', 'Read own curriculum versions and persisted lesson progress', { query: list });
operation(l, 'learning/me/progress', 'get', 'Read own progress totals', { query: list });
operation(l, 'learning/progress', 'get', 'List learning progress within authorized scope', { query: { ...scoped, internshipId: uuid } });
for (const action of ['start', 'complete']) operation(l, 'learning/lessons/{id}/' + action, 'post',
  action === 'start' ? 'Start own eligible lesson' : 'Record self-reported lesson completion',
  { body: obj({ enrollmentId: uuid }, ['enrollmentId']) });

const p = 'Performance';
operation(p, 'performance/me', 'get', 'Own totals, denominators and paginated evaluation history', { query: performanceQuery });
operation(p, 'performance/internships/{id}', 'get', 'Scoped intern totals and permitted evaluation history', { query: performanceQuery });
const bounded = { ...performanceQuery, limit: integer(1, 30) };
operation(p, 'performance/departments/{id}', 'get', 'Scoped department metrics and paginated intern metrics', { query: bounded });
operation(p, 'performance/summary', 'get', 'Authorized organization or department-level reporting', { query: bounded });
