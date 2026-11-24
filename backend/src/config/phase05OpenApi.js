const uuid = { type: 'string', format: 'uuid' };
const date = { type: 'string', format: 'date', description: 'Asia/Kolkata business date' };
const instant = { type: 'string', format: 'date-time' };
const text = (maxLength) => ({ type: 'string', maxLength });
const enumerated = (...values) => ({ type: 'string', enum: values });
const object = (properties, required = Object.keys(properties)) => ({
  type: 'object', additionalProperties: false, properties, ...(required.length ? { required } : {})
});
const report = Object.fromEntries(['workCompleted', 'learningSummary', 'progressSummary', 'blockers', 'nextDayPlan']
  .map((key) => [key, text(4000)]));
const states = enumerated('PRESENT', 'INCOMPLETE', 'ABSENT', 'ON_LEAVE', 'WEEKLY_OFF');
const leaveTypes = enumerated('SICK_LEAVE', 'CASUAL_LEAVE', 'EMERGENCY_LEAVE', 'OTHER');
const notes = { ...text(2000), minLength: 8 };
const baseFilters = {
  from: date, to: date, search: text(120), departmentId: uuid, internshipId: uuid,
  page: { type: 'integer', minimum: 1 }, limit: { type: 'integer', minimum: 1 }
};
const attendanceFilters = { ...baseFilters, sort: enumerated('asc', 'desc'), status: states };
const reportFilters = { ...baseFilters, status: enumerated('DRAFT', 'SUBMITTED', 'REVIEWED') };
const reviewFilters = { ...baseFilters, status: enumerated('PENDING', 'APPROVED', 'REJECTED') };
const leaveFilters = { ...reviewFilters, status: enumerated('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'), leaveType: leaveTypes };
const correctionFields = { internshipId: uuid, businessDate: date, reason: notes };
export const phase05Paths = {};

function route(tag, path, method, summary, { body, query = {}, status = 200, csv = false } = {}) {
  const parameters = Object.entries(query).map(([name, schema]) => ({ in: 'query', name, schema }));
  if (path.includes('{id}')) parameters.push({ in: 'path', name: 'id', required: true, schema: uuid });
  (phase05Paths[`/api/v1/${path}`] ??= {})[method] = {
    tags: [tag], summary, security: [{ BearerAuth: [] }], parameters,
    ...(body ? { requestBody: { required: true, content: { 'application/json': { schema: body } } } } : {}),
    responses: {
      [status]: { description: 'Operation succeeded', content: csv ? { 'text/csv': { schema: { type: 'string' } } }
        : { 'application/json': { schema: { $ref: '#/components/schemas/StandardSuccessResponse' } } } },
      400: { description: 'Validation or bounded query error' }, 401: { description: 'Authentication required' },
      403: { description: 'Account, role or verification restriction' }, 404: { description: 'Resource outside authorized scope' },
      409: { description: 'Date, state or scheduling conflict' }
    }
  };
}

const attendance = 'Attendance';
route(attendance, 'attendance/check-in', 'post', 'Record eligible dashboard access using server time');
route(attendance, 'attendance/check-out', 'post', 'Record explicit same-business-day logout using server time');
route(attendance, 'attendance/me/today', 'get', 'Read own attendance and status for the current IST date');
route(attendance, 'attendance/me', 'get', 'List own attendance history', { query: attendanceFilters });
route(attendance, 'attendance/me/summary', 'get', 'Summarize own attendance history', { query: attendanceFilters });
route(attendance, 'attendance', 'get', 'List attendance within assigned or organization scope', { query: attendanceFilters });
route(attendance, 'attendance/summary', 'get', 'Summarize classifications and independent attendance flags', { query: attendanceFilters });
route(attendance, 'attendance/export', 'get', 'Download authorized attendance CSV', { query: attendanceFilters, csv: true });
route(attendance, 'attendance/{id}', 'get', 'Read a recorded attendance day within scope');
route(attendance, 'attendance/policies', 'get', 'List effective-dated attendance policies as primary Founder');
route(attendance, 'attendance/policies', 'post', 'Publish a future approved schedule version as primary Founder', {
  body: object({ name: text(100), effectiveFrom: date }), status: 201
});

const daily = 'Daily work reports';
route(daily, 'daily-work-reports/me/today', 'get', 'Read the own current-day draft or submission');
route(daily, 'daily-work-reports/me/today', 'put', 'Save an own current-day report draft', { body: object(report, []) });
route(daily, 'daily-work-reports/me/today/submit', 'post', 'Submit the saved complete draft before 20:00 IST');
route(daily, 'daily-work-reports/me', 'get', 'List own report history', { query: reportFilters });
route(daily, 'daily-work-reports', 'get', 'List submitted reports in authorized scope', { query: reportFilters });
route(daily, 'daily-work-reports/{id}', 'get', 'Read a report in own or authorized submitted scope');
route(daily, 'daily-work-reports/{id}/review', 'post', 'Review a submitted report as authorized HR or Founder', { body: object({ remarks: notes }) });

const leaves = 'Leave';
route(leaves, 'leave-requests/me', 'get', 'List own leave requests', { query: leaveFilters });
route(leaves, 'leave-requests/me/{id}', 'get', 'Read an own leave request and reconciliation status');
route(leaves, 'leave-requests', 'get', 'List authorized leave requests', { query: leaveFilters });
route(leaves, 'leave-requests/{id}', 'get', 'Read leave details and recorded activity for review');
route(leaves, 'leave-requests', 'post', 'Request leave within an eligible internship period', {
  body: object({ internshipId: uuid, leaveType: leaveTypes, startDate: date, endDate: date, reason: notes }), status: 201
});
route(leaves, 'leave-requests/{id}/cancel', 'post', 'Cancel an own pending leave or future approved leave');
route(leaves, 'leave-requests/{id}/approve', 'post', 'Approve leave with explicit reconciliation when activity exists', {
  body: object({ remarks: notes, reconcileActivity: { type: 'boolean', default: false } }, ['remarks'])
});
route(leaves, 'leave-requests/{id}/reject', 'post', 'Reject an eligible pending leave request', { body: object({ remarks: notes }) });

const corrections = 'Attendance corrections';
route(corrections, 'attendance-corrections/me', 'get', 'List own corrections and late-report requests', { query: reviewFilters });
route(corrections, 'attendance-corrections/me/{id}', 'get', 'Read an own correction request');
route(corrections, 'attendance-corrections', 'get', 'List corrections for authorized reviewers', { query: reviewFilters });
route(corrections, 'attendance-corrections/{id}', 'get', 'Read proposed and original values for review');
route(corrections, 'attendance-corrections', 'post', 'Request a timestamp correction or late report', {
  body: { oneOf: [
    object({ ...correctionFields, kind: enumerated('TIMESTAMPS'), proposedChanges: object({ checkInAt: instant, checkOutAt: instant }, []) }),
    object({ ...correctionFields, kind: enumerated('LATE_REPORT'), proposedChanges: object(report) })
  ] }, status: 201
});
for (const action of ['approve', 'reject']) {
  route(corrections, `attendance-corrections/{id}/${action}`, 'post',
    action === 'approve' ? 'Approve and audit the correction atomically' : 'Reject and audit the correction',
    { body: object({ remarks: notes }) });
}
