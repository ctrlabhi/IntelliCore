import { describe, expect, it, vi } from 'vitest';
import { calendarConfig, CalendarError, consentUrl, exchangeAuthorization, newState, protectToken,
  readToken, stateDigest, synchronizeCalendar, validState } from '../../backend/src/integrations/google-calendar/calendarService.js';
import { normalizedMeetUrl } from '../../backend/src/modules/meetings/meetingRules.js';
import { assertRecentAuthentication } from '../../backend/src/utils/recentAuth.js';
import { renderEmail } from '../../backend/src/integrations/email/emailTemplates.js';
import { meetingReminderMinutes } from '../../backend/src/modules/meetings/meetingWorker.js';

const env = { NODE_ENV: 'test', GOOGLE_CALENDAR_ENABLED: 'true', GOOGLE_CALENDAR_EVENT_WRITES_AUTHORIZED: 'true',
  GOOGLE_CALENDAR_CLIENT_ID: 'test-client', GOOGLE_CALENDAR_CLIENT_SECRET: 'test-secret',
  GOOGLE_CALENDAR_REDIRECT_URI: 'http://localhost:3000/api/v1/calendar/callback', GOOGLE_CALENDAR_ID: 'fixture@example.test',
  GOOGLE_CALENDAR_ORGANIZER_UID: 'fixture-uid', GOOGLE_CALENDAR_TOKEN_KEY: 'f'.repeat(64) };
const config = calendarConfig(env);
const scopes = 'https://www.googleapis.com/auth/calendar.events.owned https://www.googleapis.com/auth/calendar.calendarlist.readonly';
const connection = { id: 'connection', organizerId: 'organizer', calendarId: config.calendarId,
  encryptedToken: protectToken('synthetic-refresh', config.key, 'organizer', config.calendarId) };
const meeting = { id: 'meeting', title: 'An authorized fixture', description: 'Agenda', status: 'SCHEDULED', version: 1,
  providerEventId: 'ic0123456', conferenceRequestId: 'fixture-request', startAt: new Date('2042-01-01T10:00:00Z'),
  endAt: new Date('2042-01-01T10:20:00Z'), timezone: 'Asia/Kolkata' };
const list = { id: config.calendarId, accessRole: 'owner', conferenceProperties: { allowedConferenceSolutionTypes: ['hangoutsMeet'] } };
const event = { id: meeting.providerEventId, organizer: { email: config.calendarId },
  extendedProperties: { private: { intelliCoreMeetingId: meeting.id, intelliCoreVersion: '1' } } };
const ready = { ...event, conferenceData: { createRequest: { status: { statusCode: 'success' } },
  conferenceSolution: { key: { type: 'hangoutsMeet' } },
  entryPoints: [{ entryPointType: 'video', uri: 'https://meet.google.com/abc-defg-hij' }] } };
const response = (value, status = 200) => new Response(JSON.stringify(value), { status });
const mockProvider = () => vi.fn().mockResolvedValueOnce(response({ access_token: 'ephemeral' })).mockResolvedValueOnce(response(list));

describe('Phase 08 Calendar and notification boundaries', () => {
  it('uses a loopback callback and independent explicit event-write authorization', () => {
    expect(calendarConfig({ ...env, GOOGLE_CALENDAR_ENABLED: 'false' })).toBeNull();
    expect(calendarConfig({ ...env, NODE_ENV: 'production' })).toBeNull();
    expect(calendarConfig({ ...env, GOOGLE_CALENDAR_REDIRECT_URI: 'https://externalsite.example/api/v1/calendar/callback' })).toBeNull();
    expect(calendarConfig({ ...env, GOOGLE_CALENDAR_REDIRECT_URI: env.GOOGLE_CALENDAR_REDIRECT_URI + '?secret=bad' })).toBeNull();
    expect(calendarConfig({ ...env, GOOGLE_CALENDAR_EVENT_WRITES_AUTHORIZED: 'false' }).writeAuthorized).toBe(false);
  });

  it('generates one-time random state and a matching S256 challenge with minimal scopes', async () => {
    const state = newState();
    expect(validState(state, state)).toBe(true);
    expect(validState(state, newState())).toBe(false);
    expect(validState(state, '')).toBe(false);
    expect(stateDigest(state)).toMatch(/^[a-f0-9]{64}$/u);
    const params = new URL(consentUrl(config, state)).searchParams;
    expect(params.get('state')).toBe(state);
    expect(params.get('code_challenge_method')).toBe('S256');
    expect(params.get('scope')).toBe(scopes);
    const provider = vi.fn().mockResolvedValueOnce(response({ refresh_token: 'synthetic-refresh', access_token: 'ephemeral', scope: scopes }))
      .mockResolvedValueOnce(response(list));
    await expect(exchangeAuthorization(config, state, 'synthetic-code', provider)).resolves.toMatchObject({ scope: scopes });
    const verifier = provider.mock.calls[0][1].body.get('code_verifier');
    const { createHash } = await import('node:crypto');
    expect(createHash('sha256').update(verifier).digest('base64url')).toBe(params.get('code_challenge'));
  });

  it('encrypts refresh credentials and binds them to the specific organizer and calendar', () => {
    const first = protectToken('fixture-token', config.key, 'organizer', 'calendar');
    const second = protectToken('fixture-token', config.key, 'organizer', 'calendar');
    expect(first).not.toEqual(second);
    expect(first).not.toContain('fixture-token');
    expect(readToken(first, config.key, 'organizer', 'calendar')).toBe('fixture-token');
    expect(() => readToken(first, config.key, 'other', 'calendar')).toThrow();
    expect(() => readToken(first, Buffer.from('b'.repeat(64), 'hex'), 'organizer', 'calendar')).toThrow();
  });

  it('creates one meeting on the approved calendar and recovers from an ambiguous duplicate', async () => {
    const provider = mockProvider().mockResolvedValueOnce(response({}, 404))
      .mockResolvedValueOnce(response({}, 409)).mockResolvedValueOnce(response(ready));
    await expect(synchronizeCalendar(config, meeting, connection, provider)).resolves.toEqual({
      kind: 'READY', meetingUrl: 'https://meet.google.com/abc-defg-hij'
    });
    const [, , [, lookup], [url, write], [, recovered]] = provider.mock.calls;
    const body = JSON.parse(write.body);
    expect(url.hostname).toBe('www.googleapis.com');
    expect(url.searchParams.get('sendUpdates')).toBe('none');
    expect(url.searchParams.get('conferenceDataVersion')).toBe('1');
    expect(write.method).toBe('POST');
    expect(body).not.toHaveProperty('attendees');
    expect(body.id).toBe(meeting.providerEventId);
    expect(body.conferenceData.createRequest).toEqual({ requestId: meeting.conferenceRequestId,
      conferenceSolutionKey: { type: 'hangoutsMeet' } });
    expect(lookup.method).toBe('GET');
    expect(recovered.method).toBe('GET');
  });

  it('polls pending conferences and handles missing authorization and retryable timeouts safely', async () => {
    const pending = { ...event, conferenceData: { createRequest: { status: { statusCode: 'pending' } } } };
    await expect(synchronizeCalendar(config, meeting, connection, mockProvider().mockResolvedValueOnce(response(pending))))
      .resolves.toEqual({ kind: 'PENDING' });
    const timeout = mockProvider().mockRejectedValueOnce(new Error('Network fixture timeout'));
    await expect(synchronizeCalendar(config, meeting, connection, timeout))
      .rejects.toMatchObject({ code: 'CALENDAR_PROVIDER_UNREACHABLE', retryable: true });
    const revoked = vi.fn().mockResolvedValueOnce(response({}, 400));
    await expect(synchronizeCalendar(config, meeting, connection, revoked)).rejects.toMatchObject({ code: 'CALENDAR_REAUTH_REQUIRED' });
    await expect(synchronizeCalendar({ ...config, writeAuthorized: false }, meeting, connection, vi.fn()))
      .rejects.toBeInstanceOf(CalendarError);
  });

  it('protects unrelated events and refuses to mutate events that have external attendees', async () => {
    const other = mockProvider().mockResolvedValueOnce(response({ ...event, extendedProperties: {} }));
    await expect(synchronizeCalendar(config, { ...meeting, status: 'CANCELLED' }, connection, other))
      .rejects.toMatchObject({ code: 'CALENDAR_EVENT_OWNERSHIP_MISMATCH' });
    expect(other).toHaveBeenCalledTimes(3);
    const guests = mockProvider().mockResolvedValueOnce(response({ ...event, attendees: [{ email: 'guest@example.test' }] }));
    await expect(synchronizeCalendar(config, { ...meeting, version: 2 }, connection, guests))
      .rejects.toMatchObject({ code: 'CALENDAR_EXTERNAL_ATTENDEES_PRESENT' });
    expect(guests).toHaveBeenCalledTimes(3);
    const cancelled = mockProvider().mockResolvedValueOnce(response(event)).mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(synchronizeCalendar(config, { ...meeting, status: 'CANCELLED' }, connection, cancelled)).resolves.toEqual({ kind: 'CANCELLED' });
    expect(cancelled.mock.calls[3][1].method).toBe('DELETE');
  });

  it('only accepts canonical Meet links and enforces recent authentication where required', () => {
    expect(normalizedMeetUrl('https://meet.google.com/abc-defg-hij/')).toBe('https://meet.google.com/abc-defg-hij');
    for (const bad of ['https://meet.google.com/redirect?url=bad', 'http://meet.google.com/abc-defg-hij',
      'https://meet.google.com.evil.test/abc-defg-hij', 'javascript:alert(1)', 'https://user@example.test/abc-defg-hij']) {
      expect(normalizedMeetUrl(bad)).toBeNull();
    }
    expect(() => assertRecentAuthentication({ firebaseUser: { auth_time: 59 } }, 600000)).not.toThrow();
    expect(() => assertRecentAuthentication({ firebaseUser: { auth_time: 1 } }, 602000)).toThrow();
    expect(() => assertRecentAuthentication({ firebaseUser: { auth_time: 640 } }, 600000)).toThrow();
  });

  it('keeps certificate events out of email templates and allows meeting reminder configuration', () => {
    for (const event of ['CERTIFICATE_DISPATCH_RECORDED', 'CERTIFICATE_DISPATCH_CORRECTED']) {
      expect(() => renderEmail({ event, version: 1, baseUrl: 'http://localhost:3000',
        path: '/dashboards/intern?notice=00000000-0000-0000-0000-000000000001#phase07Notice' })).toThrow('INVALID_EMAIL_TEMPLATE');
    }
    expect(meetingReminderMinutes({})).toEqual([10, 60, 1440]);
    expect(meetingReminderMinutes({ MEETING_REMINDER_MINUTES: '30,5,30' })).toEqual([5, 30]);
    expect(meetingReminderMinutes({ MEETING_REMINDER_MINUTES: '' })).toEqual([]);
  });
});
