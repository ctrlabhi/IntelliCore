import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireAuth, requireStatus, requireVerifiedEmail } from '../../middleware/auth.js';
import { businessDate, endpoint, pageFields, uuid } from '../../utils/phase04.js';
import { iso } from '../work/workInput.js';
import { cancelExtension, completedDirectory, decidePromotion, declareDispatch, extendInternship, extensionHistory, getDispatch,
  promotionDirectory, promotionHistory, requestPromotion } from './followupService.js';

const page = z.object(pageFields).strict();
const reason = z.string().trim().min(1).max(500);
const optionalText = reason.optional();
const mark = z.object({ requestKey: uuid, confirmed: z.literal(true), declaredSentAt: iso, note: optionalText }).strict();
const correction = z.object({ requestKey: uuid, reason }).strict();
const extension = z.object({ startsOn: businessDate, endsOn: businessDate.optional(),
  durationDays: z.number().int().min(1).max(730).optional(), reason, remarks: optionalText }).strict()
  .refine((value) => Boolean(value.endsOn) !== Boolean(value.durationDays), 'Provide either a revised end date or a duration.');
const basePromotion = { designation: z.string().trim().min(2).max(100), effectiveOn: businessDate, reason };
const promotion = z.union([
  z.object({ ...basePromotion, targetRole: z.enum(['HR_MANAGER', 'HR_EXECUTIVE', 'OPERATIONS_EXECUTIVE', 'TEAM_LEADER']),
    departmentId: uuid }).strict(),
  z.object({ ...basePromotion, continuationId: uuid.optional() }).strict()
]);
const id = (req) => uuid.parse(req.params.id);
const decision = z.object({ reason }).strict();
const empty = z.object({}).strict();

export const followupRoutes = Router();
followupRoutes.get('/followups/completed', endpoint((req) => completedDirectory(req, page.extend({
  dispatchStatus: z.enum(['NOT_SENT', 'SENT']).optional()
}).parse(req.query))));
followupRoutes.get('/:id/certificate-email-status', endpoint((req) => getDispatch(req, id(req), page.parse(req.query))));
followupRoutes.post('/:id/certificate-email-status/mark-sent', endpoint((req, requestId) =>
  declareDispatch(req, id(req), mark.parse(req.body), 'SENT', requestId)));
followupRoutes.post('/:id/certificate-email-status/correct', endpoint((req, requestId) =>
  declareDispatch(req, id(req), correction.parse(req.body), 'NOT_SENT', requestId)));
followupRoutes.get('/:id/extensions', endpoint((req) => extensionHistory(req, id(req), page.parse(req.query))));
followupRoutes.post('/:id/extensions', endpoint((req, requestId) => extendInternship(req, id(req), extension.parse(req.body), requestId), 201));
followupRoutes.post('/:id/extensions/:extensionId/cancel', endpoint((req, requestId) =>
  cancelExtension(req, id(req), uuid.parse(req.params.extensionId), decision.parse(req.body).reason, requestId)));
followupRoutes.get('/:id/promotions', endpoint((req) => promotionHistory(req, id(req), page.parse(req.query))));
followupRoutes.post('/:id/promotions', endpoint((req, requestId) => requestPromotion(req, id(req), promotion.parse(req.body), requestId), 201));

export const promotionRoutes = Router();
promotionRoutes.use(authenticate, requireAuth, requireVerifiedEmail, requireStatus());
promotionRoutes.get('/', endpoint((req) => promotionDirectory(req, page.extend({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'PROVISIONED']).optional()
}).parse(req.query))));
for (const [path, status] of [['approve', 'APPROVED'], ['reject', 'REJECTED'], ['cancel', 'CANCELLED'], ['provision', 'PROVISIONED']]) {
  promotionRoutes.post('/:id/' + path, endpoint((req, requestId) => {
    const input = status === 'PROVISIONED' ? empty.parse(req.body ?? {}) : decision.parse(req.body);
    return decidePromotion(req, id(req), status, input.reason, requestId);
  }));
}
