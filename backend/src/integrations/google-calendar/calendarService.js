import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';

const scopes = [
  'https://www.googleapis.com/auth/calendar.events.owned',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly'
];
const loopback = new Set(['localhost', '127.0.0.1']);
export const callbackPath = '/api/v1/calendar/callback';
const timeout = 8000;

export function calendarConfig(source = process.env) {
  if (source.NODE_ENV !== 'development' && source.NODE_ENV !== 'test') return null;
  if (source.GOOGLE_CALENDAR_ENABLED !== 'true') return null;
  const { GOOGLE_CALENDAR_CLIENT_ID: clientId, GOOGLE_CALENDAR_CLIENT_SECRET: clientSecret,
    GOOGLE_CALENDAR_REDIRECT_URI: redirectUri, GOOGLE_CALENDAR_ID: calendarId,
    GOOGLE_CALENDAR_ORGANIZER_UID: organizerUid, GOOGLE_CALENDAR_TOKEN_KEY: key } = source;
  if (!clientId || !clientSecret || !redirectUri || !calendarId || calendarId === 'primary' || calendarId.length > 255
      || !organizerUid || !/^[a-f0-9]{64}$/iu.test(key ?? '')) return null;
  let parsed;
  try { parsed = new URL(redirectUri); } catch { return null; }
  if (!loopback.has(parsed.hostname) || !['https:', 'http:'].includes(parsed.protocol) || parsed.pathname !== callbackPath
    || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.href !== redirectUri) return null;
  return { clientId, clientSecret, redirectUri, calendarId, organizerUid, key: Buffer.from(key, 'hex'),
    writeAuthorized: source.GOOGLE_CALENDAR_EVENT_WRITES_AUTHORIZED === 'true' };
}

function oauthClient(config) {
  return new OAuth2Client({ clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri });
}

const base64 = (value) => value.toString('base64url');
export const newState = () => base64(randomBytes(32));
export const stateDigest = (state) => createHash('sha256').update(state).digest('hex');
const verifier = (state, key) => base64(createHmac('sha256', key).update('calendar-pkce:' + state).digest());

export function validState(value, cookie) {
  if (!/^[A-Za-z0-9_-]{43}$/u.test(value ?? '') || !/^[A-Za-z0-9_-]{43}$/u.test(cookie ?? '')) return false;
  return timingSafeEqual(Buffer.from(value), Buffer.from(cookie));
}

export function consentUrl(config, state) {
  return oauthClient(config).generateAuthUrl({ state, scope: scopes, access_type: 'offline', prompt: 'consent',
    code_challenge_method: 'S256', code_challenge: base64(createHash('sha256').update(verifier(state, config.key)).digest()) });
}

const associatedData = (organizerId, calendarId) => Buffer.from(JSON.stringify([organizerId, calendarId]));
export function protectToken(token, key, organizerId, calendarId) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(associatedData(organizerId, calendarId));
  const value = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return [nonce, cipher.getAuthTag(), value].map(base64).join('.');
}

export function readToken(encrypted, key, organizerId, calendarId) {
  const [nonce, tag, value] = encrypted.split('.').map((part) => Buffer.from(part, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAAD(associatedData(organizerId, calendarId));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(value), decipher.final()]).toString('utf8');
}

export class CalendarError extends Error {
  constructor(code, retryable = false, status = null) {
    super(code);
    this.code = code;
    this.retryable = retryable;
    this.status = status;
  }
}

async function remoteToken(config, parameters, fetcher) {
  let response;
  try {
    response = await fetcher('https://oauth2.googleapis.com/token', { method: 'POST', redirect: 'error',
      signal: AbortSignal.timeout(timeout), body: new URLSearchParams({ ...parameters,
        client_id: config.clientId, client_secret: config.clientSecret }) });
  } catch { throw new CalendarError('CALENDAR_TOKEN_UNREACHABLE', true); }
  if (!response.ok) throw new CalendarError(response.status === 400 ? 'CALENDAR_REAUTH_REQUIRED' : 'CALENDAR_TOKEN_ERROR',
    response.status === 429 || response.status >= 500);
  try { return await response.json(); } catch { throw new CalendarError('CALENDAR_RESPONSE_INVALID', true); }
}

function hasScopes(scope) {
  if (typeof scope !== 'string') return false;
  const granted = new Set(scope.split(/\s+/u));
  return granted.size === scopes.length && scopes.every((required) => granted.has(required));
}

export async function exchangeAuthorization(config, state, code, fetcher = fetch) {
  const credentials = await remoteToken(config, { grant_type: 'authorization_code', code,
    code_verifier: verifier(state, config.key), redirect_uri: config.redirectUri }, fetcher);
  if (typeof credentials.refresh_token !== 'string' || !credentials.refresh_token
    || typeof credentials.access_token !== 'string' || !credentials.access_token || !hasScopes(credentials.scope)) {
    throw new CalendarError('CALENDAR_CONSENT_INCOMPLETE');
  }
  await verifyCalendar(config, credentials.access_token, fetcher);
  return { refreshToken: credentials.refresh_token, scope: scopes.join(' ') };
}

export async function revokeAuthorization(token, fetcher = fetch) {
  let response;
  try {
    response = await fetcher('https://oauth2.googleapis.com/revoke', { method: 'POST', redirect: 'error',
      signal: AbortSignal.timeout(timeout), body: new URLSearchParams({ token }) });
  } catch { throw new CalendarError('CALENDAR_REVOCATION_UNAVAILABLE', true); }
  if (!response.ok && response.status !== 400) throw new CalendarError('CALENDAR_REVOCATION_UNAVAILABLE', true);
}

async function api(path, token, fetcher, { method = 'GET', body, conference = false } = {}) {
  const address = new URL('https://www.googleapis.com/calendar/v3/' + path);
  if (method !== 'GET') address.searchParams.set('sendUpdates', 'none');
  if (conference) address.searchParams.set('conferenceDataVersion', '1');
  let response;
  try {
    response = await fetcher(address, { method, redirect: 'error', signal: AbortSignal.timeout(timeout),
      headers: { authorization: 'Bearer ' + token, ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
  } catch { throw new CalendarError('CALENDAR_PROVIDER_UNREACHABLE', true); }
  if (!response.ok) {
    const status = response.status;
    const detail = status === 403 ? await response.json().catch(() => null) : null;
    const throttled = detail?.error?.errors?.some(({ reason }) => ['rateLimitExceeded', 'userRateLimitExceeded'].includes(reason));
    throw new CalendarError(status === 401 ? 'CALENDAR_REAUTH_REQUIRED' : 'CALENDAR_PROVIDER_ERROR',
      Boolean(throttled) || status === 429 || status >= 500, status);
  }
  if (response.status === 204) return null;
  try { return await response.json(); } catch { throw new CalendarError('CALENDAR_RESPONSE_INVALID', true); }
}

async function verifyCalendar(config, token, fetcher) {
  const calendar = await api('users/me/calendarList/' + encodeURIComponent(config.calendarId), token, fetcher);
  if (calendar.id !== config.calendarId || calendar.accessRole !== 'owner'
      || !calendar.conferenceProperties?.allowedConferenceSolutionTypes?.includes('hangoutsMeet')) {
    throw new CalendarError('CALENDAR_WRITE_OR_MEET_NOT_SUPPORTED');
  }
}

function ownedEvent(event, config, meeting) {
  if (event?.id !== meeting.providerEventId || event.extendedProperties?.private?.intelliCoreMeetingId !== meeting.id
    || (event.organizer?.email && event.organizer.email !== config.calendarId)) throw new CalendarError('CALENDAR_EVENT_OWNERSHIP_MISMATCH');
}

export async function synchronizeCalendar(config, meeting, connection, fetcher = fetch) {
  if (!config.writeAuthorized || config.calendarId !== connection.calendarId) throw new CalendarError('CALENDAR_WRITES_NOT_AUTHORIZED');
  let refreshToken;
  try { refreshToken = readToken(connection.encryptedToken, config.key, connection.organizerId, connection.calendarId); }
  catch { throw new CalendarError('CALENDAR_REAUTH_REQUIRED'); }
  const token = (await remoteToken(config, { grant_type: 'refresh_token', refresh_token: refreshToken }, fetcher)).access_token;
  if (!token) throw new CalendarError('CALENDAR_REAUTH_REQUIRED');
  await verifyCalendar(config, token, fetcher);
  const collection = 'calendars/' + encodeURIComponent(config.calendarId) + '/events';
  const item = collection + '/' + encodeURIComponent(meeting.providerEventId);
  const missing = (error) => [404, 410].includes(error.status);
  let event = await api(item, token, fetcher).catch((error) => { if (!missing(error)) throw error; return null; });
  if (event?.status === 'cancelled') event = null;
  if (event) ownedEvent(event, config, meeting);
  if (meeting.status === 'CANCELLED') {
    if (event) {
      if (event.attendees?.length || event.attendeesOmitted || event.recurringEventId || event.recurrence?.length) {
        throw new CalendarError('CALENDAR_EXTERNAL_ATTENDEES_PRESENT');
      }
      await api(item, token, fetcher, { method: 'DELETE' }).catch((error) => { if (!missing(error)) throw error; });
    }
    return { kind: 'CANCELLED' };
  }

  const body = { summary: meeting.title, description: meeting.description,
    start: { dateTime: meeting.startAt.toISOString(), timeZone: meeting.timezone },
    end: { dateTime: meeting.endAt.toISOString(), timeZone: meeting.timezone },
    extendedProperties: { private: { intelliCoreMeetingId: meeting.id, intelliCoreVersion: String(meeting.version) } } };
  if (!event) {
    try {
      event = await api(collection, token, fetcher, { method: 'POST', conference: true, body: {
        ...body, id: meeting.providerEventId, conferenceData: { createRequest: {
          requestId: meeting.conferenceRequestId, conferenceSolutionKey: { type: 'hangoutsMeet' }
        } }
      } });
    } catch (error) {
      if (error.status !== 409) throw error;
      event = await api(item, token, fetcher);
    }
    ownedEvent(event, config, meeting);
  }
  if (event.extendedProperties?.private?.intelliCoreVersion !== String(meeting.version)) {
    if (event.attendees?.length || event.attendeesOmitted || event.recurringEventId || event.recurrence?.length) {
      throw new CalendarError('CALENDAR_EXTERNAL_ATTENDEES_PRESENT');
    }
    event = await api(item, token, fetcher, { method: 'PATCH', conference: true, body });
    ownedEvent(event, config, meeting);
  }
  const status = event.conferenceData?.createRequest?.status?.statusCode;
  if (status === 'failure') throw new CalendarError('CALENDAR_CONFERENCE_FAILED');
  if (status === 'pending' || event.conferenceData?.conferenceSolution?.key?.type !== 'hangoutsMeet') return { kind: 'PENDING' };
  const meetingUrl = event.conferenceData?.entryPoints?.find(({ entryPointType }) => entryPointType === 'video')?.uri;
  return meetingUrl ? { kind: 'READY', meetingUrl } : { kind: 'PENDING' };
}
