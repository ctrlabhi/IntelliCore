import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireAuth, requirePermission, requirePrimaryFounder, requireRole, requireStatus, requireVerifiedEmail } from '../../middleware/auth.js';
import { AppError } from '../../utils/errors.js';
import { businessDate, endpoint, pageFields, uuid } from '../../utils/phase04.js';
import { canReview, organizationRoles, ownScope, readership, reviewRoles } from './attendanceAccess.js';
import { attendanceCsv, attendanceDetail, attendanceSummary, queryAttendance } from './attendanceQueries.js';
import { recordCheckIn, recordCheckOut, todayAttendance } from './attendanceService.js';
import { listPolicies, publishPolicy } from './attendancePolicy.js';
import { correctionDetail, correctionInput, correctionStatuses, decideCorrection, listCorrections, remarksSchema, requestCorrection } from './correctionService.js';
import { decideLeave, leaveDetail, leaveStatuses, leaves, leaveTypes, submitLeave } from './leaveService.js';
import { draftFields, readTodayReport, reportDetail, reports, reviewReport, saveTodayReport } from './reportService.js';

const signedIn = [authenticate, requireAuth, requireVerifiedEmail, requireStatus()];
const id = (req) => uuid.parse(req.params.id);
const empty = z.object({}).strict();
const remarks = z.object({ remarks: remarksSchema }).strict();
const dates = { from: businessDate.optional(), to: businessDate.optional() };
const filters = { ...pageFields, ...dates, internshipId: uuid.optional(), departmentId: uuid.optional() };
const attendanceFilters = z.object({ ...filters, limit: z.coerce.number().int().min(1).max(50).default(20),
  sort: z.enum(['asc', 'desc']).default('desc'),
  status: z.enum(['PRESENT', 'INCOMPLETE', 'ABSENT', 'ON_LEAVE', 'WEEKLY_OFF']).optional() }).strict();
const reportFilters = z.object({ ...filters, status: z.enum(['DRAFT', 'SUBMITTED', 'REVIEWED']).optional() }).strict();
const leaveFilters = z.object({ ...filters, status: z.enum(leaveStatuses).optional(), leaveType: z.enum(leaveTypes).optional() }).strict();
const correctionFilters = z.object({ ...filters, status: z.enum(correctionStatuses).optional() }).strict();
const leaveInput = z.object({ internshipId: uuid, startDate: businessDate, endDate: businessDate,
  leaveType: z.enum(leaveTypes), reason: remarksSchema }).strict();
const leaveDecision = remarks.extend({ reconcileActivity: z.boolean().default(false) });
const policyInput = z.object({ name: z.string().trim().min(1).max(100), effectiveFrom: businessDate }).strict();

const query = (schema, req) => {
  const result = schema.parse(req.query);
  if (result.from && result.to && result.from > result.to) throw new AppError('Start date must precede end date.', 400, 'INVALID_DATE_RANGE');
  return { ...result, dateFilter: result.from || result.to ? { gte: result.from, lte: result.to } : undefined };
};

export const attendanceRoutes = Router();
attendanceRoutes.use(...signedIn);
attendanceRoutes.post('/check-in', endpoint((req) => {
  empty.parse(req.body ?? {});
  return recordCheckIn(ownScope(req).userId);
}));
attendanceRoutes.post('/check-out', endpoint((req) => {
  empty.parse(req.body ?? {});
  return recordCheckOut(ownScope(req).userId);
}));
attendanceRoutes.get('/me/today', endpoint((req) => todayAttendance(ownScope(req).userId)));
attendanceRoutes.get('/me/summary', endpoint((req) => attendanceSummary(query(attendanceFilters, req), ownScope(req))));
attendanceRoutes.get('/me', endpoint((req) => queryAttendance(query(attendanceFilters, req), ownScope(req))));
attendanceRoutes.get('/summary', endpoint((req) => attendanceSummary(query(attendanceFilters, req), readership(req, 'attendance'))));
attendanceRoutes.get('/export', requireRole(...reviewRoles), requirePermission('attendance:export'), async (req, res) => {
  const contents = await attendanceCsv(query(attendanceFilters, req), readership(req, 'attendance'));
  res.attachment('attendance.csv').type('text/csv').send(contents);
});
attendanceRoutes.get('/policies', requirePrimaryFounder, requirePermission('attendance:manage_policy'), endpoint(() => listPolicies()));
attendanceRoutes.post('/policies', requirePrimaryFounder, requirePermission('attendance:manage_policy'),
  endpoint((req, requestId) => publishPolicy(policyInput.parse(req.body), req.user, requestId), 201));
attendanceRoutes.get('/', endpoint((req) => queryAttendance(query(attendanceFilters, req), readership(req, 'attendance'))));
attendanceRoutes.get('/:id', endpoint((req) => attendanceDetail(id(req),
  req.roles.length === 1 && req.roles[0] === 'INTERN' ? ownScope(req) : readership(req, 'attendance'))));

export const dailyWorkReportRoutes = Router();
dailyWorkReportRoutes.use(...signedIn);
dailyWorkReportRoutes.get('/me/today', endpoint((req) => readTodayReport(ownScope(req).userId)));
dailyWorkReportRoutes.put('/me/today', endpoint((req, requestId) => saveTodayReport(ownScope(req).userId, draftFields.parse(req.body), requestId)));
dailyWorkReportRoutes.post('/me/today/submit', endpoint((req, requestId) => {
  empty.parse(req.body ?? {});
  return saveTodayReport(ownScope(req).userId, null, requestId);
}));
dailyWorkReportRoutes.get('/me', endpoint((req) => reports(query(reportFilters, req), ownScope(req), true)));
dailyWorkReportRoutes.get('/', endpoint((req) => reports(query(reportFilters, req), readership(req, 'reports'), false)));
dailyWorkReportRoutes.get('/:id', endpoint((req) => {
  const own = req.roles.length === 1 && req.roles[0] === 'INTERN';
  return reportDetail(id(req), own ? ownScope(req) : readership(req, 'reports'), own);
}));
dailyWorkReportRoutes.post('/:id/review', ...canReview('reports:review'),
  endpoint((req, requestId) => reviewReport(id(req), remarks.parse(req.body).remarks, req.user, requestId)));

export const leaveRoutes = Router();
leaveRoutes.use(...signedIn);
leaveRoutes.get('/me', endpoint((req) => leaves(query(leaveFilters, req), ownScope(req))));
leaveRoutes.get('/', requireRole(...organizationRoles), requirePermission('leaves:read_all'),
  endpoint((req) => leaves(query(leaveFilters, req), {})));
leaveRoutes.post('/', endpoint((req, requestId) => submitLeave(ownScope(req).userId, leaveInput.parse(req.body), requestId), 201));
leaveRoutes.get('/me/:id', endpoint((req) => leaveDetail(id(req), ownScope(req))));
leaveRoutes.get('/:id', requireRole(...organizationRoles), requirePermission('leaves:read_all'), endpoint((req) => leaveDetail(id(req), {})));
leaveRoutes.post('/:id/cancel', endpoint((req, requestId) => {
  ownScope(req);
  empty.parse(req.body ?? {});
  return decideLeave(id(req), { status: 'CANCELLED' }, req.user, requestId);
}));
leaveRoutes.post('/:id/approve', ...canReview('leaves:review'), endpoint((req, requestId) =>
  decideLeave(id(req), { status: 'APPROVED', ...leaveDecision.parse(req.body) }, req.user, requestId)));
leaveRoutes.post('/:id/reject', ...canReview('leaves:review'), endpoint((req, requestId) =>
  decideLeave(id(req), { status: 'REJECTED', ...remarks.parse(req.body) }, req.user, requestId)));

export const correctionRoutes = Router();
correctionRoutes.use(...signedIn);
correctionRoutes.get('/me', endpoint((req) => listCorrections(query(correctionFilters, req), ownScope(req))));
correctionRoutes.get('/', ...canReview('attendance:review_corrections'), endpoint((req) => listCorrections(query(correctionFilters, req), {})));
correctionRoutes.post('/', endpoint((req, requestId) => requestCorrection(ownScope(req).userId, correctionInput.parse(req.body), requestId), 201));
correctionRoutes.get('/me/:id', endpoint((req) => correctionDetail(id(req), ownScope(req))));
correctionRoutes.get('/:id', ...canReview('attendance:review_corrections'), endpoint((req) => correctionDetail(id(req), {})));
correctionRoutes.post('/:id/approve', ...canReview('attendance:review_corrections'), endpoint((req, requestId) =>
  decideCorrection(id(req), 'APPROVED', remarks.parse(req.body).remarks, req.user, requestId)));
correctionRoutes.post('/:id/reject', ...canReview('attendance:review_corrections'), endpoint((req, requestId) =>
  decideCorrection(id(req), 'REJECTED', remarks.parse(req.body).remarks, req.user, requestId)));
