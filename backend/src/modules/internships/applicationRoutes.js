import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireAuth, requirePermission, requireRole, requireStatus, requireVerifiedEmail } from '../../middleware/auth.js';
import { businessDate, endpoint, pageFields, uuid } from '../../utils/phase04.js';
import { applicationReaderRoles, applicationStatuses, reviewRoles } from './internshipPolicy.js';
import { approveApplication, getApplication, listApplications, reviewApplication, saveApplication, submitApplication, withdrawApplication } from './applicationService.js';

const router = Router();
const text = (max) => z.string().trim().min(1).max(max);
const optional = (max) => text(max).nullable().optional();
const fields = z.object({
  departmentId: uuid, requestedStartDate: businessDate, durationMonths: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(6)]),
  qualification: text(150), institution: text(150), course: optional(150), specialization: optional(150),
  graduationYear: z.number().int().min(1900).max(2200).nullable().optional(),
  skills: optional(2000), motivation: optional(4000), contactNumber: z.string().trim().regex(/^\+?[\d ()-]{7,19}$/).nullable().optional()
}).strict();
const approval = z.object({
  departmentId: uuid.optional(), positionTitle: text(100), assignedTeamLeaderId: uuid.nullable().optional(),
  commencementDate: businessDate, expectedCompletionDate: businessDate.optional(), remarks: optional(2000)
}).strict();
const query = z.object({ ...pageFields, departmentId: uuid.optional(), status: z.enum(applicationStatuses).optional() }).strict();
const remarks = z.object({ remarks: text(2000) }).strict();
const empty = z.object({}).strict();
const id = (req) => uuid.parse(req.params.id);
const canReadAll = (req) => req.user.status === 'ACTIVE' && req.permissions.includes('applications:read_all')
  && req.roles.some((role) => applicationReaderRoles.includes(role));
const canReview = [requireRole(...reviewRoles), requirePermission('applications:review')];

router.use(authenticate, requireAuth, requireVerifiedEmail, requireStatus(['PENDING', 'ACTIVE']));
router.get('/me', endpoint((req) => listApplications(query.parse(req.query), req.user.id)));
router.get('/', requireRole(...applicationReaderRoles), requirePermission('applications:read_all'),
  endpoint((req) => listApplications(query.parse(req.query))));
router.get('/:id', endpoint((req) => getApplication(id(req), canReadAll(req) ? undefined : req.user.id)));
router.post('/', endpoint((req) => saveApplication(null, fields.parse(req.body), req.user), 201));
router.patch('/:id', endpoint((req) => saveApplication(id(req),
  fields.partial().refine((value) => Object.keys(value).length > 0, 'Provide an application update.').parse(req.body), req.user)));
router.post('/:id/submit', endpoint((req, requestId) => {
  empty.parse(req.body ?? {});
  return submitApplication(id(req), req.user, requestId);
}));
router.post('/:id/withdraw', endpoint((req, requestId) => {
  empty.parse(req.body ?? {});
  return withdrawApplication(id(req), req.user, requestId);
}));
router.post('/:id/request-changes', ...canReview, endpoint((req, requestId) =>
  reviewApplication(id(req), 'CHANGES_REQUESTED', remarks.parse(req.body).remarks, req.user, requestId)));
router.post('/:id/reject', ...canReview, endpoint((req, requestId) =>
  reviewApplication(id(req), 'REJECTED', remarks.parse(req.body).remarks, req.user, requestId)));
router.post('/:id/approve', ...canReview, endpoint((req, requestId) =>
  approveApplication(id(req), approval.parse(req.body), req.user, requestId)));

export default router;
