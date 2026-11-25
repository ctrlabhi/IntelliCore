import { randomUUID } from 'node:crypto';
import prisma from '../../config/database.js';
import { AppError, NotFoundError } from '../../utils/errors.js';
import { lockDepartment, readPage, transaction } from '../../utils/phase04.js';
import { calendarConfig } from '../../integrations/google-calendar/calendarService.js';
import auditService from '../audit/auditService.js';
import { currentActor } from '../notifications/notificationAccess.js';
import { digest } from '../notifications/notificationPolicy.js';
import { emitNotification } from '../notifications/notificationService.js';
import { eligibleParticipant, meetingAudience, meetingScope, ownMeetingScope, verifyMeetingScope } from './meetingAccess.js';
import { meetingFields, normalizedMeetUrl } from './meetingRules.js';

const person = { id: true, profile: { select: { fullName: true } } };
const publicFields = { id: true, meetingCode: true, title: true, description: true,
  organizer: { select: person }, department: { select: { id: true, name: true } },
  startAt: true, endAt: true, timezone: true, status: true, providerSyncStatus: true, creationMode: true, cancelledAt: true };
const adminFields = { ...publicFields, organizerId: true, departmentId: true, audienceType: true, selectedUserIds: true,
  version: true, syncError: true, cancellationReason: true, updatedAt: true };
const responseFields = { response: true, invitedAt: true, responseAt: true, joinRequestedAt: true };
const missing = () => new NotFoundError('Meeting not found.');
const conflict = (message, code = 'INVALID_MEETING_TRANSITION') => new AppError(message, 409, code);
const ordering = [{ startAt: 'asc' }, { id: 'asc' }];

async function audit(tx, actor, requestId, action, row, after = {}, beforeState) {
  return auditService.createAuditLog(tx, { actorUserId: actor.user.id, requestId, action, resourceType: 'MEETING',
    resourceId: row.id, beforeState, afterState: { status: row.status, version: row.version, departmentId: row.departmentId,
      audienceType: row.audienceType, startAt: row.startAt, endAt: row.endAt, ...after } });
}

const participantSelect = { ...responseFields, userId: true, user: { select: person } };
function selectedFields(meeting) {
  return meeting.creationMode === 'GOOGLE_CALENDAR' ? { ...meeting, meetingUrl: null } : meeting;
}

function change(req, id, requestId, work) {
  meetingScope(req);
  return transaction(async (tx) => {
    const actor = await currentActor(tx, req.user.id);
    await tx.$queryRaw`SELECT id FROM meetings WHERE id = ${id} FOR UPDATE`;
    const row = await tx.meeting.findFirst({ where: { AND: [{ id }, meetingScope(actor)] } });
    if (!row) throw missing();
    if (row.departmentId) await lockDepartment(tx, row.departmentId);
    const now = new Date();
    return work(tx, actor, row, now, requestId);
  });
}

function checkVersion(row, version, now) {
  if (row.version !== version) throw conflict('The meeting changed. Reload and try again.', 'MEETING_VERSION_CHANGED');
  if (row.providerSyncStatus === 'PROCESSING' && row.syncAfter > now) {
    throw conflict('Calendar synchronization is running. Try again shortly.', 'MEETING_SYNC_IN_PROGRESS');
  }
}

async function audiencePreview(tx, row, data, now) {
  const people = await tx.user.findMany({ where: meetingAudience(data, now), select: person, orderBy: { id: 'asc' }, take: 1001 });
  if (people.length > 1000) throw conflict('Narrow the audience to 1,000 users or fewer.', 'MEETING_AUDIENCE_LIMIT');
  if (data.audienceType === 'SELECTED_USERS' && people.length !== data.selectedUserIds.length) {
    throw conflict('One or more selected people are ineligible.', 'MEETING_AUDIENCE_CHANGED');
  }
  const descriptor = [data.title, data.description, data.audienceType, data.departmentId, data.selectedUserIds,
    data.startAt, data.endAt, data.creationMode, data.meetingUrl];
  return { version: row.version, count: people.length, people: people.slice(0, 100),
    previewToken: digest([row.id, row.version, descriptor, people.map(({ id }) => id)]), ids: people.map(({ id }) => id) };
}

export async function listMeetings(req, query, own = false) {
  const now = new Date();
  const where = { ...(own ? await ownMeetingScope(prisma, req.user.id, now) : meetingScope(req)),
    ...(query.status ? { status: query.status } : {}), ...(query.upcoming ? { endAt: { gt: now } } : {}),
    ...(query.search ? { title: { contains: query.search } } : {}) };
  return readPage(prisma.meeting, { where, select: own ? { ...publicFields,
    participants: { where: { userId: req.user.id }, select: responseFields, take: 1 } } : adminFields, orderBy: ordering }, query);
}

export async function getMeeting(req, id, own = false) {
  const where = { AND: [{ id }, own ? await ownMeetingScope(prisma, req.user.id, new Date()) : meetingScope(req)] };
  const row = await prisma.meeting.findFirst({ where, select: own ? { ...publicFields, participants: {
    where: { userId: req.user.id }, take: 1, select: responseFields } } : {
    ...adminFields, meetingUrl: true, _count: { select: { participants: { where: { revokedAt: null } } } } } });
  if (!row) throw missing();
  if (!own && row.creationMode === 'GOOGLE_CALENDAR') delete row.meetingUrl;
  return row;
}

export async function listParticipants(req, id, query) {
  await getMeeting(req, id);
  return readPage(prisma.meetingParticipant, { where: { meetingId: id, revokedAt: null }, select: participantSelect,
    orderBy: [{ invitedAt: 'asc' }, { userId: 'asc' }] }, query);
}

export function selectMeetingUsers(req, query) {
  if (meetingScope(req).OR) throw new AppError('Your role uses a scoped audience.', 403, 'MEETING_AUDIENCE_RESTRICTED');
  const where = { status: 'ACTIVE', emailVerified: true, ...(query.search ? {
    profile: { fullName: { contains: query.search } } } : {}) };
  return readPage(prisma.user, { where, select: person, orderBy: [{ profile: { fullName: 'asc' } }, { id: 'asc' }] }, query);
}

export function createMeeting(req, input, requestId) {
  meetingScope(req);
  const fields = meetingFields(input);
  return transaction(async (tx) => {
    const actor = await currentActor(tx, req.user.id);
    if (fields.departmentId) await lockDepartment(tx, fields.departmentId);
    const draft = { ...fields, organizerId: actor.user.id };
    await verifyMeetingScope(tx, actor, draft);
    if (fields.startAt <= new Date()) throw new AppError('Choose a future meeting start.', 400, 'INVALID_MEETING_TIME');
    const row = await tx.meeting.create({ data: { ...draft, meetingCode: 'IC-MTG-' + randomUUID().replaceAll('-', '').toUpperCase() },
      select: adminFields });
    await audit(tx, actor, requestId, 'MEETING_CREATED', row);
    return row;
  });
}

export function editDraft(req, id, input, requestId) {
  return change(req, id, requestId, async (tx, actor, row, now) => {
    checkVersion(row, input.expectedVersion, now);
    if (row.status !== 'DRAFT') throw conflict('Only a draft can be edited here.');
    const data = meetingFields({ ...selectedFields(row), ...input });
    if (data.departmentId && data.departmentId !== row.departmentId) await lockDepartment(tx, data.departmentId);
    await verifyMeetingScope(tx, actor, { ...data, organizerId: row.organizerId });
    if (data.startAt <= now) throw new AppError('Choose a future meeting start.', 400, 'INVALID_MEETING_TIME');
    const saved = await tx.meeting.update({ where: { id }, data: { ...data, version: { increment: 1 } }, select: adminFields });
    await audit(tx, actor, requestId, 'MEETING_DRAFT_UPDATED', saved, {}, { version: row.version });
    return saved;
  });
}

export function previewMeeting(req, id, patch, requestId) {
  return change(req, id, requestId, async (tx, actor, row, now) => {
    if (!['DRAFT', 'SCHEDULED'].includes(row.status)) throw conflict('You can preview only a draft or scheduled meeting.');
    if (patch) checkVersion(row, patch.expectedVersion, now);
    const data = meetingFields({ ...selectedFields(row), ...patch });
    if (data.departmentId && data.departmentId !== row.departmentId) await lockDepartment(tx, data.departmentId);
    await verifyMeetingScope(tx, actor, { ...data, organizerId: row.organizerId });
    const { ids, ...preview } = await audiencePreview(tx, row, data, now);
    await audit(tx, actor, requestId, 'MEETING_AUDIENCE_PREVIEWED', { ...row, ...data }, { count: ids.length });
    return preview;
  });
}

export function scheduleMeeting(req, id, input, reschedule, requestId) {
  return change(req, id, requestId, async (tx, actor, row, now) => {
    checkVersion(row, input.expectedVersion, now);
    if (row.status !== (reschedule ? 'SCHEDULED' : 'DRAFT')) throw conflict('The meeting cannot be scheduled in its current state.');
    const data = meetingFields({ ...selectedFields(row), ...(reschedule ? input : {}) });
    if (reschedule && (data.creationMode !== row.creationMode || row.endAt <= now)) {
      throw conflict('A meeting mode is fixed after scheduling and elapsed meetings cannot be rescheduled.');
    }
    if (data.startAt <= now) throw new AppError('Choose a future meeting start.', 400, 'INVALID_MEETING_TIME');
    if (data.departmentId && data.departmentId !== row.departmentId) await lockDepartment(tx, data.departmentId);
    await verifyMeetingScope(tx, actor, { ...data, organizerId: row.organizerId });
    const preview = await audiencePreview(tx, row, data, now);
    if (!preview.count || preview.previewToken !== input.previewToken) {
      throw conflict('Preview the current, nonempty audience again.', 'MEETING_AUDIENCE_CHANGED');
    }

    const previous = await tx.meetingParticipant.findMany({ where: { meetingId: id }, select: { userId: true, revokedAt: true } });
    const activeIds = new Set(previous.filter((item) => !item.revokedAt).map((item) => item.userId));
    const wanted = new Set(preview.ids);
    const removed = [...activeIds].filter((userId) => !wanted.has(userId));
    const added = preview.ids.filter((userId) => !activeIds.has(userId));
    const known = new Set(previous.map(({ userId }) => userId));
    await tx.meetingParticipant.updateMany({ where: { meetingId: id, userId: { in: removed } }, data: { revokedAt: now } });
    const restored = added.filter((userId) => known.has(userId));
    await tx.meetingParticipant.updateMany({ where: { meetingId: id, userId: { in: restored } },
      data: { revokedAt: null, response: 'INVITED', responseAt: null, joinRequestedAt: null, invitedAt: now } });
    const newUsers = added.filter((userId) => !known.has(userId));
    if (newUsers.length) await tx.meetingParticipant.createMany({ data: newUsers.map((userId) => ({ meetingId: id, userId, invitedAt: now })) });

    const sync = {};
    if (data.creationMode === 'GOOGLE_CALENDAR') {
      const config = calendarConfig();
      if (!config?.writeAuthorized) throw conflict('Google Calendar is disabled or unconfigured. Manual meetings remain available.', 'CALENDAR_UNAVAILABLE');
      const connection = row.calendarConnectionId ? await tx.calendarConnection.findUnique({ where: { id: row.calendarConnectionId } })
        : await tx.calendarConnection.findUnique({ where: { organizerId_calendarId: { organizerId: row.organizerId, calendarId: config.calendarId } } });
      if (!connection?.encryptedToken || connection.calendarId !== config.calendarId) {
        throw conflict('Connect the organizer’s approved Calendar first.', 'CALENDAR_CONNECTION_REQUIRED');
      }
      Object.assign(sync, { calendarConnectionId: connection.id, providerSyncStatus: 'PENDING', syncAttempts: 0, syncAfter: now,
        syncLease: null, syncError: null, providerEventId: row.providerEventId ?? 'ic' + id.replaceAll('-', ''),
        conferenceRequestId: row.conferenceRequestId ?? randomUUID() });
      if (row.meetingUrl) data.meetingUrl = row.meetingUrl;
    }
    const saved = await tx.meeting.update({ where: { id }, data: { ...data, ...sync, status: 'SCHEDULED',
      version: { increment: 1 } }, select: adminFields });
    const version = String(saved.version);
    const notification = (event, recipientIds) => emitNotification(tx, { event, recipientIds, type: 'MEETING', resourceId: id, now, version });
    await notification('MEETING_INVITED', added);
    if (reschedule) {
      await notification('MEETING_RESCHEDULED', preview.ids.filter((userId) => activeIds.has(userId)));
      await notification('MEETING_CANCELLED', removed);
    } else {
      await notification('MEETING_SCHEDULED', [row.organizerId].filter((userId) => !wanted.has(userId)));
    }
    await audit(tx, actor, requestId, reschedule ? 'MEETING_RESCHEDULED' : 'MEETING_SCHEDULED', saved,
      { participants: preview.count, removed: removed.length }, { version: row.version, startAt: row.startAt });
    return saved;
  });
}

export function transitionMeeting(req, id, input, status, requestId) {
  return change(req, id, requestId, async (tx, actor, row, now) => {
    checkVersion(row, input.expectedVersion, now);
    if (status === 'COMPLETED' ? row.status !== 'SCHEDULED' || row.endAt > now : !['DRAFT', 'SCHEDULED'].includes(row.status)) {
      throw conflict('This transition is unavailable in the current state.');
    }
    const data = status === 'CANCELLED' ? { cancelledAt: now, cancellationReason: input.reason,
      ...(row.providerEventId ? { providerSyncStatus: 'PENDING', syncAttempts: 0, syncAfter: now, syncLease: null, syncError: null } : {})
    } : {};
    const saved = await tx.meeting.update({ where: { id }, data: { ...data, status, version: { increment: 1 } }, select: adminFields });
    if (row.status === 'SCHEDULED' && status === 'CANCELLED') {
      const people = await tx.meetingParticipant.findMany({ where: { meetingId: id, revokedAt: null }, select: { userId: true } });
      await emitNotification(tx, { event: 'MEETING_CANCELLED', recipientIds: people.map(({ userId }) => userId),
        type: 'MEETING', resourceId: id, version: String(saved.version), now });
    }
    await audit(tx, actor, requestId, 'MEETING_' + status, saved, { reason: input.reason }, { status: row.status });
    return saved;
  });
}

export function retryMeeting(req, id, input, requestId) {
  return change(req, id, requestId, async (tx, actor, row, now) => {
    checkVersion(row, input.expectedVersion, now);
    if (!['FAILED', 'SYNC_REQUIRED'].includes(row.providerSyncStatus) || !calendarConfig()
      || (row.status !== 'CANCELLED' && (row.status !== 'SCHEDULED' || row.endAt <= now))) throw conflict('There is no retryable Calendar change.');
    const saved = await tx.meeting.update({ where: { id }, data: { providerSyncStatus: 'PENDING', syncAfter: now,
      syncAttempts: 0, syncError: null, syncLease: null }, select: adminFields });
    await audit(tx, actor, requestId, 'MEETING_SYNC_RETRIED', saved);
    return saved;
  });
}

export function participantAction(req, id, response) {
  return transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM meetings WHERE id = ${id} FOR UPDATE`;
    const now = new Date();
    const meeting = await tx.meeting.findFirst({ where: { id, status: 'SCHEDULED' } });
    if (!meeting) throw missing();
    const participant = await tx.meetingParticipant.findFirst({ where: { meetingId: id, userId: req.user.id, revokedAt: null } });
    if (!response && meeting.organizerId === req.user.id) {
      await verifyMeetingScope(tx, await currentActor(tx, req.user.id), meeting);
    } else if (!participant || !await eligibleParticipant(tx, meeting, req.user.id, now)) throw missing();
    if (meeting.endAt <= now) throw conflict('This meeting has ended.');
    const where = { meetingId_userId: { meetingId: id, userId: req.user.id } };
    if (response) return tx.meetingParticipant.update({ where, data: { response, responseAt: now }, select: responseFields });
    const url = normalizedMeetUrl(meeting.meetingUrl);
    if (!url || !['NOT_REQUIRED', 'READY'].includes(meeting.providerSyncStatus)) {
      throw conflict('A confirmed meeting link is not yet available.', 'MEETING_LINK_UNAVAILABLE');
    }
    if (participant) await tx.meetingParticipant.update({ where, data: { joinRequestedAt: now } });
    return { meetingUrl: url };
  });
}
