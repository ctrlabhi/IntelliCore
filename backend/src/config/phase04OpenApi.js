const uuid = { type: 'string', format: 'uuid' };
const date = { type: 'string', format: 'date', description: 'Asia/Kolkata calendar date' };
const text = (maxLength) => ({ type: 'string', maxLength });
const object = (properties, required = []) => ({
  type: 'object', additionalProperties: false, properties, ...(required.length ? { required } : {})
});
const application = {
  departmentId: uuid, requestedStartDate: date, durationMonths: { type: 'integer', enum: [1, 2, 3, 6] },
  qualification: text(150), institution: text(150), course: { ...text(150), nullable: true },
  specialization: { ...text(150), nullable: true }, graduationYear: { type: 'integer', nullable: true },
  skills: { ...text(2000), nullable: true }, motivation: { ...text(4000), nullable: true },
  contactNumber: { ...text(20), nullable: true }
};
const department = { name: text(100), code: text(50), slug: text(100), description: { ...text(255), nullable: true } };
const teamLeader = { assignedTeamLeaderId: { ...uuid, nullable: true } };
const enrollment = { positionTitle: text(100), commencementDate: date, expectedCompletionDate: date };
const rejected = object({ remarks: text(2000) }, ['remarks']);
const end = object({ reason: text(2000) }, ['reason']);

const page = [
  ['page', { type: 'integer', minimum: 1, default: 1 }],
  ['limit', { type: 'integer', minimum: 1, maximum: 100, default: 20 }],
  ['search', text(120)]
];
const applicationFilters = [...page, ['departmentId', uuid], ['status', { type: 'string', enum:
  ['DRAFT', 'PENDING_APPROVAL', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED', 'WITHDRAWN'] }]];
const enrollmentFilters = [...page, ['departmentId', uuid], ['status', { type: 'string', enum:
  ['APPROVED', 'ONGOING', 'COMPLETION_REVIEW', 'COMPLETED', 'TERMINATED', 'WITHDRAWN'] }],
  ['commencementFrom', date], ['completionThrough', date], ['teamLeaderId', uuid]];

export const phase04Paths = {};

function route(tag, path, method, summary, { schema, query = [] } = {}) {
  const fullPath = `/api/v1/${path}`;
  const status = method === 'post' && !path.includes('/') ? 201 : 200;
  const parameters = query.map(([name, definition]) => ({ name, in: 'query', schema: definition }));
  if (path.includes('{id}')) parameters.push({ name: 'id', in: 'path', required: true, schema: uuid });
  const responses = {
    [status]: { description: 'Operation succeeded', content: { 'application/json': { schema: { $ref: '#/components/schemas/StandardSuccessResponse' } } } },
    400: { description: 'Invalid request' }, 401: { description: 'Authentication required' },
    403: { description: 'Verification, status or authorization restriction' }, 404: { description: 'Record unavailable in authorized scope' },
    409: { description: 'Conflict or invalid transition' }
  };
  (phase04Paths[fullPath] ??= {})[method] = {
    tags: [tag], summary, security: [{ BearerAuth: [] }], parameters, responses,
    ...(schema ? { requestBody: { required: !path.endsWith('/approve-completion'),
      content: { 'application/json': { schema } } } } : {})
  };
}

route('Departments', 'departments', 'get', 'List active departments or authorized assignments', {
  query: [...page, ['includeInactive', { type: 'boolean' }], ['assigned', { type: 'boolean' }]]
});
route('Departments', 'departments', 'post', 'Create a department as primary Founder', {
  schema: object(department, ['name', 'code', 'slug'])
});
route('Departments', 'departments/{id}', 'get', 'Read a department in scope');
route('Departments', 'departments/{id}', 'patch', 'Edit a department as primary Founder', { schema: object(department) });
route('Departments', 'departments/{id}/status', 'patch', 'Activate or deactivate a department', {
  schema: object({ isActive: { type: 'boolean' } }, ['isActive'])
});
route('Departments', 'departments/{id}/staff', 'get', 'List assignments or eligible Team Leaders', {
  query: [...page, ['leadersOnly', { type: 'boolean' }]]
});
route('Departments', 'departments/{id}/staff', 'put', 'Assign or deactivate staff membership as primary Founder', {
  schema: object({ userId: uuid, assignedRole: { type: 'string', enum: ['STAFF', 'TEAM_LEADER'] }, isActive: { type: 'boolean' } },
    ['userId', 'assignedRole', 'isActive'])
});

const applications = 'Internship applications';
route(applications, 'internship-applications/me', 'get', 'List own applications', { query: applicationFilters });
route(applications, 'internship-applications', 'get', 'List applications for authorized staff', { query: applicationFilters });
route(applications, 'internship-applications', 'post', 'Create an application draft', {
  schema: object(application, ['departmentId', 'requestedStartDate', 'durationMonths', 'qualification', 'institution'])
});
route(applications, 'internship-applications/{id}', 'get', 'Read own or authorized application');
route(applications, 'internship-applications/{id}', 'patch', 'Edit an own draft or requested revision', { schema: object(application) });
route(applications, 'internship-applications/{id}/submit', 'post', 'Submit an own application for review');
route(applications, 'internship-applications/{id}/withdraw', 'post', 'Withdraw an own open application');
route(applications, 'internship-applications/{id}/request-changes', 'post', 'Request changes as an authorized reviewer', { schema: rejected });
route(applications, 'internship-applications/{id}/reject', 'post', 'Reject an application as an authorized reviewer', { schema: rejected });
route(applications, 'internship-applications/{id}/approve', 'post', 'Approve and enroll atomically as an authorized reviewer', {
  schema: object({ departmentId: uuid, ...enrollment, ...teamLeader, remarks: { ...text(2000), nullable: true } },
    ['positionTitle', 'commencementDate'])
});

route('Internships', 'internships/me', 'get', 'List own enrollments and history', { query: enrollmentFilters });
route('Internships', 'internships', 'get', 'List internships in own, department or organizational scope', { query: enrollmentFilters });
route('Internships', 'internships/{id}', 'get', 'Read an internship in scope');
route('Internships', 'internships/{id}', 'patch', 'Update open enrollment details', { schema: object(enrollment) });
route('Internships', 'internships/{id}/team-leader', 'put', 'Assign or clear an eligible Team Leader', {
  schema: object(teamLeader, ['assignedTeamLeaderId'])
});
route('Internships', 'internships/{id}/request-completion', 'post', 'Request review after the expected end date');
route('Internships', 'internships/{id}/approve-completion', 'post', 'Manually approve completion', {
  schema: object({ actualCompletionDate: date })
});
route('Internships', 'internships/{id}/terminate', 'post', 'Terminate an open enrollment', { schema: end });
route('Internships', 'internships/{id}/withdraw', 'post', 'Withdraw an own or managed enrollment', { schema: end });
