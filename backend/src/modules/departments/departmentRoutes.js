import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireAuth, requirePermission, requirePrimaryFounder, requireRole, requireStatus, requireVerifiedEmail } from '../../middleware/auth.js';
import { endpoint, pageFields, uuid } from '../../utils/phase04.js';
import { ForbiddenError } from '../../utils/errors.js';
import { reviewRoles } from '../internships/internshipPolicy.js';
import { getDepartment, listDepartments, listStaffAssignments, saveDepartment, saveStaffAssignment } from './departmentService.js';

const router = Router();
const fields = z.object({
  name: z.string().trim().min(1).max(100),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_]{0,49}$/),
  slug: z.string().trim().max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().max(255).nullable().optional()
}).strict();
const assignment = z.object({ userId: uuid, assignedRole: z.enum(['STAFF', 'TEAM_LEADER']), isActive: z.boolean() }).strict();
const status = z.object({ isActive: z.boolean() }).strict();
const query = z.object(pageFields).strict();
const catalogQuery = query.extend({ includeInactive: z.enum(['true', 'false']).optional(), assigned: z.literal('true').optional() });
const staffQuery = query.extend({ leadersOnly: z.literal('true').optional() });

router.use(authenticate, requireAuth, requireVerifiedEmail, requireStatus(['PENDING', 'ACTIVE']));
const canViewInactive = (req) => req.user.status === 'ACTIVE' && req.permissions.includes('departments:update');

router.get('/', endpoint((req) => {
  const filters = catalogQuery.parse(req.query);
  if (filters.assigned && (req.user.status !== 'ACTIVE' || !req.roles.includes('TEAM_LEADER')
    || !req.permissions.includes('internships:read_department'))) throw new ForbiddenError();
  return listDepartments(filters, !filters.assigned && filters.includeInactive === 'true' && canViewInactive(req),
    filters.assigned ? req.user.id : undefined);
}));
router.get('/:id', endpoint((req) => getDepartment(uuid.parse(req.params.id), canViewInactive(req))));
router.post('/', requirePrimaryFounder, requirePermission('departments:create'),
  endpoint((req, requestId) => saveDepartment(null, fields.parse(req.body), req.user, requestId), 201));
router.patch('/:id', requirePrimaryFounder, requirePermission('departments:update'),
  endpoint((req, requestId) => saveDepartment(uuid.parse(req.params.id),
    fields.partial().refine((value) => Object.keys(value).length > 0, 'Provide a department update.').parse(req.body), req.user, requestId)));
router.patch('/:id/status', requirePrimaryFounder, requirePermission('departments:update'),
  endpoint((req, requestId) => saveDepartment(uuid.parse(req.params.id), status.parse(req.body), req.user, requestId)));
router.get('/:id/staff', requireRole(...reviewRoles), endpoint((req) => {
  const filters = staffQuery.parse(req.query);
  const leadersOnly = filters.leadersOnly === 'true';
  if (!req.permissions.includes(leadersOnly ? 'internships:manage' : 'departments:assign_staff')) {
    throw new ForbiddenError();
  }
  return listStaffAssignments(uuid.parse(req.params.id), filters, leadersOnly);
}));
router.put('/:id/staff', requirePrimaryFounder, requirePermission('departments:assign_staff'),
  endpoint((req, requestId) => saveStaffAssignment(uuid.parse(req.params.id), assignment.parse(req.body), req.user, requestId)));

export default router;
