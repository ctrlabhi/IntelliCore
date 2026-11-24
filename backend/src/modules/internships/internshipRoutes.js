import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireAuth, requirePermission, requireRole, requireStatus, requireVerifiedEmail } from '../../middleware/auth.js';
import { businessDate, endpoint, pageFields, uuid } from '../../utils/phase04.js';
import { internshipScope, internshipStatuses, reviewRoles } from './internshipPolicy.js';
import { approveCompletion, assignTeamLeader, endInternship, getInternship, listInternships, requestCompletion, updateInternship } from './internshipService.js';

const router = Router();
const query = z.object({ ...pageFields, departmentId: uuid.optional(), status: z.enum(internshipStatuses).optional(),
  commencementFrom: businessDate.optional(), completionThrough: businessDate.optional(), teamLeaderId: uuid.optional()
}).strict();
const fields = z.object({
  positionTitle: z.string().trim().min(1).max(100).optional(), commencementDate: businessDate.optional(),
  expectedCompletionDate: businessDate.optional()
}).strict().refine((value) => Object.keys(value).length > 0, 'Provide an internship update.');
const leader = z.object({ assignedTeamLeaderId: uuid.nullable() }).strict();
const completion = z.object({ actualCompletionDate: businessDate.optional() }).strict();
const reason = z.object({ reason: z.string().trim().min(1).max(2000) }).strict();
const empty = z.object({}).strict();
const id = (req) => uuid.parse(req.params.id);
const managers = [requireRole(...reviewRoles), requirePermission('internships:manage')];
const canManage = (req) => req.permissions.includes('internships:manage') && req.roles.some((role) => reviewRoles.includes(role));

router.use(authenticate, requireAuth, requireVerifiedEmail);
router.get('/me', requireStatus(['PENDING', 'ACTIVE']), endpoint((req) => listInternships(query.parse(req.query), { userId: req.user.id })));
router.use(requireStatus());
router.get('/', endpoint((req) => listInternships(query.parse(req.query), internshipScope(req))));
router.get('/:id', endpoint((req) => getInternship(id(req), internshipScope(req))));
router.patch('/:id', ...managers, endpoint((req, requestId) => updateInternship(id(req), fields.parse(req.body), req.user, requestId)));
router.put('/:id/team-leader', ...managers, endpoint((req, requestId) =>
  assignTeamLeader(id(req), leader.parse(req.body).assignedTeamLeaderId, req.user, requestId)));
router.post('/:id/request-completion', endpoint((req, requestId) => {
  empty.parse(req.body ?? {});
  return requestCompletion(id(req), req.user, requestId, !canManage(req));
}));
router.post('/:id/approve-completion', requireRole(...reviewRoles), requirePermission('internships:approve_completion'),
  endpoint((req, requestId) => approveCompletion(id(req), completion.parse(req.body ?? {}).actualCompletionDate, req.user, requestId)));
router.post('/:id/terminate', ...managers, endpoint((req, requestId) =>
  endInternship(id(req), 'TERMINATED', reason.parse(req.body).reason, req.user, requestId, false)));
router.post('/:id/withdraw', endpoint((req, requestId) =>
  endInternship(id(req), 'WITHDRAWN', reason.parse(req.body).reason, req.user, requestId, !canManage(req))));

export default router;
