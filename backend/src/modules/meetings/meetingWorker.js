import { randomUUID } from 'node:crypto';
import { ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { CalendarError, calendarConfig, synchronizeCalendar } from '../../integrations/google-calendar/calendarService.js';
import { currentActor } from '../notifications/notificationAccess.js';
import { emitNotification } from '../notifications/notificationService.js';
import { eligibleParticipant, meetingAudience, verifyMeetingScope } from './meetingAccess.js';
import { normalizedMeetUrl } from './meetingRules.js';

const maximumAttempts = 8;
const leaseMillis = 90000;
const meetingVersion = (meeting) => String(meeting.version);
const activeProviderStates = ['PENDING', 'PROCESSING'];
const reminderWindow = 5 * 60000;

export function meetingReminderMinutes(source = process.env) {
  const raw = source.MEETING_REMINDER_MINUTES ?? '1440,60,10';
  if (raw === '') return [];
  const chosen = raw.split(',').map(Number);
  return chosen.length <= 8 && chosen.every((item) => Number.isInteger(item) && item >= 1 && item <= 10080)
    ? [...new Set(chosen)].sort((a, b) => a - b) : [10, 60, 1440];
}

export async function runMeetingReminders(client, now, minutes = meetingReminderMinutes(), { acceptJobs = () => true, cursors = {} } = {}) {
  if (!minutes.length) return 0;
  const windows = minutes.map((lead) => {
    const deadline = +now + lead * 60000;
    return { startAt: { gt: new Date(Math.max(+now, deadline - reminderWindow)), lte: new Date(deadline) } };
  });
  let total = 0;
  let cursor = cursors.meetings;
  do {
    const rows = await client.meeting.findMany({ where: { status: 'SCHEDULED', providerSyncStatus: { in: ['NOT_REQUIRED', 'READY'] },
      OR: windows, ...(cursor ? { id: { gt: cursor } } : {}) }, select: { id: true }, orderBy: { id: 'asc' }, take: 25 });
    for (const { id } of rows) {
      if (!acceptJobs()) return total;
      total += await client.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM meetings WHERE id = ${id} FOR UPDATE`;
        const meeting = await tx.meeting.findFirst({ where: { id, status: 'SCHEDULED',
          providerSyncStatus: { in: ['NOT_REQUIRED', 'READY'] } } });
        if (!meeting || meeting.startAt <= now) return 0;
        const duration = +meeting.startAt - +now;
        const lead = minutes.find((item) => duration <= item * 60000 && duration > item * 60000 - reminderWindow);
        if (!lead) return 0;
        const people = await tx.user.findMany({ where: { AND: [meetingAudience(meeting, now), {
          meetingParticipations: { some: { meetingId: id, revokedAt: null, response: { not: 'DECLINED' } } }
        }] }, select: { id: true } });
        const rows = await emitNotification(tx, { event: 'MEETING_REMINDER', type: 'MEETING', resourceId: id, now,
          version: meetingVersion(meeting) + ':' + lead, recipientIds: people.map((row) => row.id) });
        return rows.length;
      }, { isolationLevel: 'ReadCommitted' });
      cursors.meetings = id;
    }
    cursor = rows.length === 25 ? rows.at(-1).id : undefined;
  } while (cursor);
  delete cursors.meetings;
  return total;
}

export async function isMeetingEmailAuthorized(client, id, userId, event, version, now) {
  const row = await client.meeting.findFirst({ where: { id, participants: { some: { userId } } } });
  if (!row || meetingVersion(row) !== String(version).split(':')[0]) return false;
  const part = await client.meetingParticipant.findUnique({ where: { meetingId_userId: { meetingId: id, userId } } });
  if (event === 'MEETING_CANCELLED') return row.status === 'CANCELLED' || Boolean(part?.revokedAt);
  return row.status === 'SCHEDULED' && row.startAt > now && Boolean(part && !part.revokedAt)
    && (event !== 'MEETING_REMINDER' || part.response !== 'DECLINED') && await eligibleParticipant(client, row, userId, now);
}

async function claim(client, now) {
  const due = { creationMode: 'GOOGLE_CALENDAR', status: { in: ['SCHEDULED', 'CANCELLED'] },
    providerSyncStatus: { in: activeProviderStates }, syncAfter: { lte: now } };
  const row = await client.meeting.findFirst({ where: due, select: { id: true, version: true },
    orderBy: [{ syncAfter: 'asc' }, { id: 'asc' }] });
  if (!row) return null;
  const syncLease = randomUUID();
  const change = await client.meeting.updateMany({ where: { ...row, ...due }, data: { syncLease,
    providerSyncStatus: 'PROCESSING', syncAttempts: { increment: 1 }, syncAfter: new Date(+now + leaseMillis) } });
  if (!change.count) return null;
  return client.meeting.findFirst({ where: { id: row.id, syncLease }, include: { calendarConnection: true } });
}

function outcome(meeting, result, now, error) {
  if (!error && result.kind === 'READY') {
    const meetingUrl = normalizedMeetUrl(result.meetingUrl);
    if (meetingUrl) return { providerSyncStatus: 'READY', meetingUrl, syncAfter: null, syncError: null };
    error = new CalendarError('CALENDAR_LINK_INVALID');
  }
  if (!error && result.kind === 'CANCELLED') {
    return { providerSyncStatus: 'READY', meetingUrl: null, syncAfter: null, syncError: null };
  }
  const code = error?.code ?? 'CALENDAR_CONFERENCE_PENDING';
  if ((!error || error.retryable) && meeting.syncAttempts < maximumAttempts) {
    return { providerSyncStatus: 'PENDING', syncAfter: new Date(+now + Math.min(300000, 5000 * 2 ** (meeting.syncAttempts - 1))), syncError: code };
  }
  return { providerSyncStatus: meeting.status === 'CANCELLED' || meeting.version > 1 ? 'SYNC_REQUIRED' : 'FAILED',
    syncAfter: null, syncError: code };
}

export async function processCalendarMeeting(client, { clock = () => new Date(), config = calendarConfig(),
  synchronize = synchronizeCalendar } = {}) {
  if (!config?.writeAuthorized) return false;
  const meeting = await claim(client, clock());
  if (!meeting) return false;
  let result;
  let error;
  try {
    if (meeting.syncAttempts > maximumAttempts) throw new CalendarError('CALENDAR_RETRY_EXHAUSTED');
    if (meeting.status !== 'CANCELLED' && meeting.endAt <= clock()) throw new CalendarError('CALENDAR_MEETING_ELAPSED');
    const actor = await currentActor(client, meeting.organizerId);
    await verifyMeetingScope(client, actor, meeting);
    const connection = meeting.calendarConnection;
    if (!connection?.encryptedToken || actor.user.firebaseUid !== config.organizerUid) throw new CalendarError('CALENDAR_REAUTH_REQUIRED');
    result = await synchronize(config, meeting, connection);
  } catch (cause) {
    if (cause instanceof CalendarError) error = cause;
    else if (cause instanceof ForbiddenError || cause instanceof NotFoundError) error = new CalendarError('CALENDAR_ORGANIZER_NOT_AUTHORIZED');
    else error = new CalendarError('CALENDAR_SYNC_INTERRUPTED', true);
  }
  await client.meeting.updateMany({ where: { id: meeting.id, version: meeting.version, syncLease: meeting.syncLease,
    providerSyncStatus: 'PROCESSING', syncAfter: { gt: clock() } },
  data: { ...outcome(meeting, result, clock(), error), syncLease: null } });
  return true;
}
