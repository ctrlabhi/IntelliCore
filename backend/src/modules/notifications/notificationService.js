import { randomUUID } from 'node:crypto';
import prisma from '../../config/database.js';
import { readPage } from '../../utils/phase04.js';
import { NotFoundError } from '../../utils/errors.js';
import { actionPath, digest, policyFor, recipientSelect, recipientWhere } from './notificationPolicy.js';
import { maximumAttempts } from './emailQueue.js';

export const preferences = { emailEnabled: true, taskReminders: true, learningUpdates: true, announcements: true };
export const notificationFields = {
  id: true, eventType: true, category: true, title: true, message: true, relatedResourceType: true,
  relatedResourceId: true, actionPath: true, readAt: true, archivedAt: true, createdAt: true
};

export async function audienceReviewers(tx, rule, departmentId) {
  return tx.user.findMany({ where: recipientWhere(rule, departmentId), select: { id: true }, orderBy: { id: 'asc' } });
}

export function emitNotification(tx, event) {
  return emitNotifications(tx, [event]);
}

export async function emitNotifications(tx, entries) {
  const ids = [...new Set(entries.flatMap((entry) => entry.recipientIds).filter(Boolean))];
  if (!ids.length) return [];
  const users = await tx.user.findMany({ where: { id: { in: ids }, emailVerified: true,
    status: { in: ['ACTIVE', 'PENDING', 'REJECTED'] } }, select: recipientSelect });
  const perId = new Map(users.map((user) => [user.id, user]));
  const newJobs = new Map();
  const rows = entries.flatMap(({ event, type, resourceId, recipientIds, version = '', rule, departmentId,
    actorId, now = new Date() }) => {
    const policy = policyFor(event);
    return [...new Set(recipientIds)].flatMap((recipientId) => {
      if (recipientId === actorId) return [];
      const user = perId.get(recipientId);
      if (!user || (!policy.onboarding && user.status !== 'ACTIVE')
        || (policy.preference && user.notificationPreference?.[policy.preference] === false)) return [];
      const id = randomUUID();
      const row = { id, category: policy.category, title: policy.title, message: policy.message,
        eventType: event, relatedResourceType: type, relatedResourceId: resourceId, recipientUserId: user.id,
        createdAt: now, onboarding: policy.onboarding,
        archivedAt: event === 'ANNOUNCEMENT_PUBLISHED' && user.notificationPreference?.announcements === false ? now : null,
        actionPath: actionPath(user.userRoles.map(({ role }) => role.code), id),
        deduplicationKey: digest([event, type, resourceId, version, user.id]) };
      if (policy.templateKey && event !== 'ANNOUNCEMENT_PUBLISHED' && user.notificationPreference?.emailEnabled !== false) {
        newJobs.set(id, {
          notificationId: id, recipientUserId: user.id, recipientEmail: user.email,
          templateKey: policy.templateKey, templateData: { event, actionPath: row.actionPath },
          authorization: { type, resourceId, version, ...(rule ? { rule } : {}), ...(departmentId ? { departmentId } : {}) },
          deduplicationKey: digest(['email', row.deduplicationKey]), availableAt: now, nextAttemptAt: now,
          maximumAttempts: maximumAttempts()
        });
      }
      return [row];
    });
  });
  if (!rows.length) return [];
  await tx.notification.createMany({ data: rows, skipDuplicates: true });
  const created = await tx.notification.findMany({ where: { id: { in: rows.map(({ id }) => id) } },
    select: { id: true, recipientUserId: true, actionPath: true, deduplicationKey: true } });
  const jobs = created.flatMap((row) => newJobs.has(row.id) ? [newJobs.get(row.id)] : []);
  if (jobs.length) await tx.emailOutbox.createMany({ data: jobs, skipDuplicates: true });
  return created;
}

export async function emitForReviewers(tx, { rule, departmentId, ...event }) {
  const recipients = await audienceReviewers(tx, rule, departmentId);
  return emitNotification(tx, { ...event, rule, departmentId, recipientIds: recipients.map(({ id }) => id) });
}

export function ownedNotifications(req) {
  return { recipientUserId: req.user.id, ...(req.user.status !== 'ACTIVE' ? { onboarding: true } : {}) };
}

export function notificationList(req, query) {
  const where = { ...ownedNotifications(req), category: query.category,
    archivedAt: query.state === 'ARCHIVED' ? { not: null } : null,
    readAt: query.state === 'UNREAD' ? null : query.state === 'READ' ? { not: null } : undefined,
    ...(query.search ? { OR: [{ title: { contains: query.search } }, { message: { contains: query.search } }] } : {}) };
  return readPage(prisma.notification, { where, select: notificationFields,
    orderBy: [{ createdAt: query.sort }, { id: 'asc' }] }, query);
}

export async function unreadCount(req) {
  return { count: await prisma.notification.count({ where: { ...ownedNotifications(req), readAt: null, archivedAt: null } }) };
}

export async function notificationDetail(req, id) {
  const row = await prisma.notification.findFirst({ where: { id, ...ownedNotifications(req) }, select: notificationFields });
  if (!row) throw new NotFoundError('Notification not found.');
  return row;
}

export async function markNotification(req, id, field) {
  await notificationDetail(req, id);
  await prisma.notification.updateMany({ where: { id, ...ownedNotifications(req), [field]: null }, data: { [field]: new Date() } });
  return notificationDetail(req, id);
}

export async function markAll(req) {
  const { count } = await prisma.notification.updateMany({
    where: { ...ownedNotifications(req), readAt: null, archivedAt: null }, data: { readAt: new Date() }
  });
  return { count };
}

export async function readPreferences(userId) {
  const row = await prisma.notificationPreference.findUnique({ where: { userId },
    select: { emailEnabled: true, taskReminders: true, learningUpdates: true, announcements: true } });
  return row ?? preferences;
}

export function updatePreferences(userId, data) {
  return prisma.notificationPreference.upsert({ where: { userId }, create: { userId, ...data }, update: data,
    select: { emailEnabled: true, taskReminders: true, learningUpdates: true, announcements: true } });
}
