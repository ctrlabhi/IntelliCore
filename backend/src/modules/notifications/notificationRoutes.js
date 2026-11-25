import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { authenticate, requireAuth, requirePermission, requireStatus, requireVerifiedEmail } from '../../middleware/auth.js';
import { AppError, ForbiddenError } from '../../utils/errors.js';
import { endpoint, pageFields, uuid } from '../../utils/phase04.js';
import { sendError } from '../../utils/response.js';
import logger from '../../config/logger.js';
import { categories } from './notificationPolicy.js';
import * as notifications from './notificationService.js';
import * as announcements from './announcementService.js';
import * as administration from './emailAdministration.js';

const signed = [authenticate, requireAuth, requireVerifiedEmail];
const active = [...signed, requireStatus()];
const own = requirePermission('notifications:own');
const allowOwn = (req, res, next) => {
  if (req.user.status === 'ACTIVE') return own(req, res, next);
  if (req.roles.length === 1 && req.roles[0] === 'INTERN' && req.permissions.includes('notifications:own')) return next();
  throw new ForbiddenError();
};
const id = (req) => uuid.parse(req.params.id);
const list = z.object({ ...pageFields, sort: z.enum(['asc', 'desc']).default('desc') }).strict();
const preferences = z.object({
  emailEnabled: z.boolean(), taskReminders: z.boolean(), learningUpdates: z.boolean(), announcements: z.boolean()
}).partial().strict();
const empty = z.object({}).strict();
const confirm = z.object({ confirm: z.literal(true) }).strict();
const retry = confirm.extend({ confirmAmbiguous: z.boolean().default(false) });
const reminders = z.object({ taskHours: z.number().int().min(0).max(72), reportMinutes: z.number().int().min(0).max(120),
  commencementDays: z.number().int().min(0).max(14), completionDays: z.number().int().min(0).max(14) }).strict();
const operationsLimit = rateLimit({ windowMs: 60_000, limit: 12, standardHeaders: 'draft-7', legacyHeaders: false,
  keyGenerator: (req) => req.user.id,
  handler: (req, res) => sendError(res, 'Wait before retrying a notification operation.', 429, 'NOTIFICATION_RATE_LIMIT') });

function errors(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error.name === 'ZodError') return sendError(res, 'Request validation failed.', 400, 'VALIDATION_ERROR',
    error.issues.map(({ path, code }) => ({ path, code })));
  if (error instanceof AppError) return sendError(res, error.message, error.statusCode, error.code);
  logger.error({ requestId: res.locals.requestId, code: error.code, name: error.name }, 'Notification operation failed.');
  return sendError(res, 'The notification operation is temporarily unavailable.', 500, 'NOTIFICATION_OPERATION_FAILED');
}

const feed = Router();
feed.use(...signed, requireStatus(['ACTIVE', 'PENDING', 'REJECTED']), allowOwn);
feed.get('/me', endpoint((req) => notifications.notificationList(req, list.extend({
  category: z.enum(categories).optional(), state: z.enum(['ALL', 'UNREAD', 'READ', 'ARCHIVED']).default('ALL')
}).parse(req.query))));
feed.get('/me/unread-count', endpoint(notifications.unreadCount));
feed.post('/me/read-all', endpoint((req) => {
  empty.parse(req.body ?? {});
  return notifications.markAll(req);
}));
feed.get('/:id', endpoint((req) => notifications.notificationDetail(req, id(req))));
for (const [action, field] of Object.entries({ read: 'readAt', archive: 'archivedAt' })) {
  feed.post('/:id/' + action, endpoint((req) => {
    empty.parse(req.body ?? {});
    return notifications.markNotification(req, id(req), field);
  }));
}
feed.use(errors);

const prefs = Router();
prefs.use(...active, own);
prefs.get('/me', endpoint((req) => notifications.readPreferences(req.user.id)));
prefs.patch('/me', endpoint((req) => notifications.updatePreferences(req.user.id, preferences.parse(req.body))));
prefs.use(errors);

const notice = Router();
notice.use(...active, own);
notice.get('/me', endpoint((req) => announcements.ownAnnouncements(req, list.parse(req.query))));
notice.get('/me/:id', endpoint((req) => announcements.getAnnouncement(req, id(req), true)));
notice.get('/eligible-recipients', endpoint((req) => announcements.selectUsers(req, list.parse(req.query))));
notice.get('/', endpoint((req) => announcements.directory(req, list.extend({
  status: z.enum(announcements.announcementStatuses).optional(), departmentId: uuid.optional()
}).parse(req.query))));
notice.post('/', endpoint((req, requestId) => announcements.saveAnnouncement(req, null, announcements.announcementInput.parse(req.body), requestId), 201));
notice.get('/:id', endpoint((req) => announcements.getAnnouncement(req, id(req))));
notice.patch('/:id', endpoint((req, requestId) => announcements.saveAnnouncement(req, id(req), announcements.announcementPatch.parse(req.body), requestId)));
notice.post('/:id/preview-audience', endpoint((req) => {
  empty.parse(req.body ?? {});
  return announcements.previewAudience(req, id(req));
}));
notice.post('/:id/publish', operationsLimit, endpoint((req, requestId) =>
  announcements.sendAnnouncement(req, id(req), announcements.audienceConfirmation.parse(req.body), requestId)));
notice.post('/:id/schedule', operationsLimit, endpoint((req, requestId) =>
  announcements.sendAnnouncement(req, id(req), announcements.announcementSchedule.parse(req.body), requestId)));
for (const [action, status] of Object.entries({ cancel: 'CANCELLED', archive: 'ARCHIVED' })) {
  notice.post('/:id/' + action, operationsLimit, endpoint((req, requestId) => {
    confirm.parse(req.body);
    return announcements.transitionAnnouncement(req, id(req), status, requestId);
  }));
}
notice.use(errors);

const outbox = Router();
outbox.use(...active);
outbox.get('/', endpoint((req) => administration.outbox(req, list.extend({
  status: z.enum(administration.emailStatuses).optional()
}).parse(req.query))));
outbox.get('/:id', endpoint((req) => administration.emailJob(req, id(req))));
outbox.get('/:id/attempts', endpoint((req) => administration.attempts(req, id(req), list.parse(req.query))));
outbox.post('/:id/retry', operationsLimit, endpoint((req, requestId) =>
  administration.changeJob(req, id(req), 'retry', retry.parse(req.body), requestId)));
outbox.post('/:id/cancel', operationsLimit, endpoint((req, requestId) =>
  administration.changeJob(req, id(req), 'cancel', confirm.parse(req.body), requestId)));
outbox.use(errors);

const health = Router();
health.get('/notification-stats', ...active, endpoint(administration.notificationStats));
health.get('/notification-worker/status', ...active, endpoint(administration.workerStatus));
health.patch('/notification-worker/reminders', ...active, operationsLimit,
  endpoint((req, requestId) => administration.saveReminderSettings(req, reminders.parse(req.body), requestId)));
health.use(errors);

export const notificationRoutes = Router();
notificationRoutes.use('/notifications', feed);
notificationRoutes.use('/notification-preferences', prefs);
notificationRoutes.use('/announcements', notice);
notificationRoutes.use('/admin/email-outbox', outbox);
notificationRoutes.use('/admin', health);
