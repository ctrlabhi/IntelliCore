import { z } from 'zod';
import { Prisma } from '@prisma/client';
import prisma from '../../config/database.js';
import { readPage, transaction, uuid } from '../../utils/phase04.js';
import { AppError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import auditService from '../audit/auditService.js';
import { eligibleWhere } from '../work/workAccess.js';
import { iso, revision } from '../work/workInput.js';
import { announcementScope, canSelectPeople, currentActor } from './notificationAccess.js';
import { digest } from './notificationPolicy.js';
import { emitNotification } from './notificationService.js';

export const audienceTypes = ['ALL_ACTIVE_USERS', 'STAFF', 'INTERNS', 'DEPARTMENT', 'SELECTED_USERS'];
export const announcementStatuses = ['DRAFT', 'SCHEDULED', 'PUBLISHED', 'CANCELLED', 'ARCHIVED'];
const audienceLimit = 1000;
export const announcementInput = z.object({
  title: z.string().trim().min(1).max(160), message: z.string().trim().min(1).max(5000),
  audienceType: z.enum(audienceTypes), departmentId: uuid.nullable().default(null),
  selectedUsers: z.array(uuid).max(250).default([]), expiresAt: iso.nullable().default(null)
}).strict();
export const announcementPatch = announcementInput.partial().extend({ expectedRevision: revision });
export const audienceConfirmation = z.object({ expectedRevision: revision, previewToken: z.string().regex(/^[0-9a-f]{64}$/) }).strict();
export const announcementSchedule = audienceConfirmation.extend({ scheduledAt: iso });

const active = { status: 'ACTIVE', emailVerified: true };
const publicFields = { id: true, title: true, message: true, publishedAt: true, expiresAt: true };
const adminFields = { ...publicFields, departmentId: true, audienceType: true, status: true, revision: true,
  scheduledAt: true, createdAt: true, updatedAt: true, _count: { select: { recipients: true } } };

const conflict = (message, code = 'ANNOUNCEMENT_CONFLICT') => new AppError(message, 409, code);
const missing = () => new NotFoundError('Announcement not available.');

function validate(data, now) {
  const department = data.audienceType === 'DEPARTMENT';
  const selected = data.audienceType === 'SELECTED_USERS';
  const people = data.selectedUsers;
  if (department !== Boolean(data.departmentId) || selected !== Boolean(people.length)
    || new Set(people).size !== people.length || (data.expiresAt && data.expiresAt <= now)) {
    throw new AppError('Choose valid audience fields and a future expiry if needed.', 400, 'INVALID_ANNOUNCEMENT');
  }
}

async function verifyAudience(tx, actor, data, lockDepartment = true) {
  const access = announcementScope(actor);
  if (data.departmentId) {
    if (lockDepartment) await tx.$queryRaw`SELECT id FROM departments WHERE id = ${data.departmentId} FOR UPDATE`;
    if (!await tx.department.count({ where: { id: data.departmentId, isActive: true } })) throw missing();
  }
  if (!access.OR) return;
  const allowed = access.OR.filter((rule) => rule.audienceType === data.audienceType
    || rule.audienceType?.in?.includes(data.audienceType));
  for (const rule of allowed) {
    if (!rule.department || await tx.department.count({
      where: { id: data.departmentId, ...rule.department }
    })) return;
  }
  throw new ForbiddenError('Announcement audience exceeds current scope.');
}

export function eligibleAudienceWhere(data, now) {
  const type = data.audienceType;
  let where = active;
  if (type === 'SELECTED_USERS') where = { ...where, id: { in: data.selectedUsers } };
  if (type === 'STAFF') where = { ...where, staffProfile: { employmentStatus: 'ACTIVE' } };
  if (type === 'INTERNS' || type === 'DEPARTMENT') {
    const eligible = eligibleWhere(now);
    where = { ...where, internships: { some: { ...eligible, ...(data.departmentId ? { departmentId: data.departmentId } : {}) } } };
    if (type === 'DEPARTMENT') {
      where = { ...active, OR: [where, { staffProfile: { employmentStatus: 'ACTIVE' },
        userDepartments: { some: { departmentId: data.departmentId, isActive: true, department: { isActive: true } } } }] };
    }
  }
  return where;
}

async function audience(tx, data, now) {
  const where = eligibleAudienceWhere(data, now);
  const users = await tx.user.findMany({ where, select: { id: true }, orderBy: { id: 'asc' }, take: audienceLimit + 1 });
  if (users.length > audienceLimit) throw conflict('Narrow this audience to at most 1000 people.', 'AUDIENCE_LIMIT');
  return users.map(({ id }) => id);
}

function previewValue(record, ids) {
  return { count: ids.length, revision: record.revision, previewToken: digest([record.id, record.revision, ids]) };
}

async function audit(tx, actor, action, record, requestId, extra = {}) {
  await auditService.createAuditLog(tx, {
    actorUserId: actor.id, action, resourceType: 'ANNOUNCEMENT', resourceId: record.id, requestId,
    afterState: { audienceType: record.audienceType, departmentId: record.departmentId, revision: record.revision,
      status: record.status, ...extra }
  }, { id: true });
}

async function lockedAnnouncement(tx, id) {
  await tx.$queryRaw`SELECT id FROM announcements WHERE id = ${id} FOR UPDATE`;
  const record = await tx.announcement.findUnique({ where: { id } });
  if (!record) throw missing();
  return record;
}

export function directory(req, query) {
  const where = { AND: [announcementScope(req), { status: query.status, departmentId: query.departmentId,
    ...(query.search ? { title: { contains: query.search } } : {}) }] };
  return readPage(prisma.announcement, { where, select: adminFields, orderBy: [{ createdAt: query.sort }, { id: 'asc' }] }, query);
}

const received = (userId, now = new Date()) => ({
  recipients: { some: { userId } }, status: 'PUBLISHED',
  AND: [
    { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    { OR: [{ departmentId: null }, { department: { isActive: true, OR: [
      { userDepartments: { some: { userId, isActive: true, user: { staffProfile: { employmentStatus: 'ACTIVE' } } } } },
      { internships: { some: { userId, ...eligibleWhere(now) } } }
    ] } }] }
  ]
});

export function ownAnnouncements(req, query) {
  return readPage(prisma.announcement, { where: { ...received(req.user.id),
    ...(query.search ? { title: { contains: query.search } } : {}) },
    select: publicFields, orderBy: [{ publishedAt: query.sort }, { id: 'asc' }] }, query);
}

export async function getAnnouncement(req, id, ownOnly = false) {
  const row = ownOnly
    ? await prisma.announcement.findFirst({ where: { id, ...received(req.user.id) }, select: publicFields })
    : await prisma.announcement.findFirst({ where: { id, ...announcementScope(req) },
      select: { ...adminFields, selectedUsers: true } });
  if (!row) throw missing();
  return row;
}

export function selectUsers(req, query) {
  if (!canSelectPeople(req)) throw new ForbiddenError();
  return readPage(prisma.user, { where: { ...active, ...(query.search ? { profile: { fullName: { contains: query.search } } } : {}) },
    select: { id: true, profile: { select: { fullName: true } } }, orderBy: [{ profile: { fullName: 'asc' } }, { id: 'asc' }] }, query);
}

export function saveAnnouncement(req, id, input, requestId) {
  return transaction(async (tx) => {
    const { expectedRevision, ...data } = input;
    const before = id ? await lockedAnnouncement(tx, id) : null;
    if (before) {
      await verifyAudience(tx, req, before);
      if (before.status !== 'DRAFT' || before.revision !== expectedRevision) throw conflict('Reload the current editable draft.');
    }
    const change = { ...before, ...data };
    validate(change, new Date());
    await verifyAudience(tx, req, change);
    const row = before ? await tx.announcement.update({ where: { id }, data: { ...data, revision: { increment: 1 } } })
      : await tx.announcement.create({ data: { ...data, createdBy: req.user.id } });
    const changed = before && (before.audienceType !== row.audienceType || before.departmentId !== row.departmentId
      || JSON.stringify(before.selectedUsers) !== JSON.stringify(row.selectedUsers));
    await audit(tx, req.user, before ? changed ? 'ANNOUNCEMENT_AUDIENCE_CHANGED' : 'ANNOUNCEMENT_UPDATED' : 'ANNOUNCEMENT_CREATED',
      row, requestId, { audienceChanged: Boolean(changed), selectedCount: row.selectedUsers.length });
    return row;
  });
}

export function previewAudience(req, id) {
  return transaction(async (tx) => {
    const record = await lockedAnnouncement(tx, id);
    await verifyAudience(tx, req, record);
    if (record.status !== 'DRAFT') throw conflict('Only a draft can preview a publication.');
    return previewValue(record, await audience(tx, record, new Date()));
  });
}

async function publish(tx, record, ids, now, requestId, actorId) {
  const row = await tx.announcement.update({ where: { id: record.id },
    data: { status: 'PUBLISHED', publishedAt: now, revision: { increment: 1 }, scheduledAudience: Prisma.DbNull } });
  const notifications = await emitNotification(tx, { event: 'ANNOUNCEMENT_PUBLISHED', type: 'ANNOUNCEMENT',
    resourceId: record.id, recipientIds: ids, now });
  await tx.announcementRecipient.createMany({ data: notifications.map((notice) => ({
    announcementId: row.id, userId: notice.recipientUserId, notificationId: notice.id, receivedAt: now
  })) });
  await audit(tx, { id: actorId }, 'ANNOUNCEMENT_PUBLISHED', row, requestId, { recipientCount: notifications.length });
  return { ...row, recipientCount: notifications.length };
}

export function sendAnnouncement(req, id, input, requestId) {
  return transaction(async (tx) => {
    const record = await lockedAnnouncement(tx, id);
    const actor = await currentActor(tx, req.user.id);
    await verifyAudience(tx, actor, record);
    const now = new Date();
    validate(record, now);
    if (record.status !== 'DRAFT' || record.revision !== input.expectedRevision) throw conflict('Reload and preview the current draft.');
    const ids = await audience(tx, record, now);
    if (!ids.length || previewValue(record, ids).previewToken !== input.previewToken) {
      throw conflict('The audience is empty or has changed. Preview it again.', 'ANNOUNCEMENT_AUDIENCE_CHANGED');
    }
    if (!input.scheduledAt) return publish(tx, record, ids, now, requestId, req.user.id);
    if (input.scheduledAt <= now || (record.expiresAt && record.expiresAt <= input.scheduledAt)) {
      throw new AppError('Choose a future publication time before expiry.', 400, 'INVALID_SCHEDULE');
    }
    const row = await tx.announcement.update({ where: { id }, data: { status: 'SCHEDULED',
      scheduledAt: input.scheduledAt, scheduledAudience: { ids, actorId: req.user.id }, revision: { increment: 1 } } });
    await audit(tx, req.user, 'ANNOUNCEMENT_SCHEDULED', row, requestId, { recipientCount: ids.length });
    const { scheduledAudience, ...visible } = row;
    return visible;
  });
}

export function transitionAnnouncement(req, id, status, requestId) {
  return transaction(async (tx) => {
    const record = await lockedAnnouncement(tx, id);
    await verifyAudience(tx, req, record);
    if (!(status === 'CANCELLED' ? ['DRAFT', 'SCHEDULED'] : ['PUBLISHED', 'CANCELLED']).includes(record.status)) {
      throw conflict('That lifecycle change is unavailable.');
    }
    const row = await tx.announcement.update({ where: { id },
      data: { status, revision: { increment: 1 }, scheduledAudience: Prisma.DbNull } });
    await audit(tx, req.user, 'ANNOUNCEMENT_' + status, row, requestId);
    return row;
  });
}

export function publishScheduled(client, id, now) {
  return client.$transaction(async (tx) => {
    const record = await lockedAnnouncement(tx, id);
    if (record.status !== 'SCHEDULED' || record.scheduledAt > now) return null;
    const { ids: originalIds, actorId } = record.scheduledAudience;
    const cancel = async (cause) => {
      const row = await tx.announcement.update({ where: { id },
        data: { status: 'CANCELLED', scheduledAudience: Prisma.DbNull, revision: { increment: 1 } } });
      await audit(tx, { id: actorId }, 'ANNOUNCEMENT_CANCELLED', row, null, { cause });
      return null;
    };
    if (record.expiresAt && record.expiresAt <= now) return cancel('EXPIRED');
    try {
      await verifyAudience(tx, await currentActor(tx, actorId), record, false);
      const original = new Set(originalIds);
      const ids = (await audience(tx, record, now)).filter((recipientId) => original.has(recipientId));
      return ids.length ? publish(tx, record, ids, now, null, actorId) : cancel('NO_ELIGIBLE_AUDIENCE');
    } catch (error) {
      if (error instanceof ForbiddenError || error instanceof NotFoundError || error.code === 'AUDIENCE_LIMIT') return cancel('SCOPE_REVOKED');
      throw error;
    }
  }, { isolationLevel: 'ReadCommitted' });
}
