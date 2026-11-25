import { Router } from 'express';
import { z } from 'zod';
import prisma from '../../config/database.js';
import { authenticate, requireAuth, requireStatus, requireVerifiedEmail } from '../../middleware/auth.js';
import { AppError, ForbiddenError } from '../../utils/errors.js';
import { sendSuccess } from '../../utils/response.js';
import { assertRecentAuthentication } from '../../utils/recentAuth.js';
import { endpoint, lockUser, transaction } from '../../utils/phase04.js';
import auditService from '../audit/auditService.js';
import { currentActor } from '../notifications/notificationAccess.js';
import { callbackPath, calendarConfig, consentUrl, exchangeAuthorization, newState, protectToken, readToken,
  revokeAuthorization, stateDigest, validState } from '../../integrations/google-calendar/calendarService.js';
import { meetingScope } from './meetingAccess.js';

const stateCookie = 'intellicore_calendar_oauth';
const cookieOptions = { httpOnly: true, sameSite: 'lax', path: callbackPath };
const noStore = (_req, res, next) => { res.set('Cache-Control', 'no-store').set('Referrer-Policy', 'no-referrer'); next(); };
const auth = [authenticate, requireAuth, requireVerifiedEmail, requireStatus()];
const empty = z.object({}).strict();

function approvedOrganizer(req, config) {
  if (!config || config.organizerUid !== req.user.firebaseUid) throw new ForbiddenError('Calendar access is limited to the configured organizer.');
  meetingScope(req);
}

function oauthAudit(tx, actor, action, id, requestId) {
  return auditService.createAuditLog(tx, { actorUserId: actor.user.id, action, resourceType: 'CALENDAR_CONNECTION',
    resourceId: id, requestId });
}

export const calendarRoutes = Router();
calendarRoutes.use(noStore);
calendarRoutes.get('/connection', ...auth, endpoint(async (req) => {
  const config = calendarConfig();
  if (!config || config.organizerUid !== req.user.firebaseUid) return { available: false, connected: false, writeAuthorized: false };
  approvedOrganizer(req, config);
  const connection = await prisma.calendarConnection.findUnique({ where: { organizerId_calendarId: {
    organizerId: req.user.id, calendarId: config.calendarId } }, select: { disconnectedAt: true, connectedAt: true } });
  return { available: true, connected: Boolean(connection && !connection.disconnectedAt),
    connectedAt: connection?.connectedAt ?? null, writeAuthorized: config.writeAuthorized };
}));

calendarRoutes.post('/connect', ...auth, async (req, res) => {
  empty.parse(req.body ?? {});
  const config = calendarConfig();
  approvedOrganizer(req, config);
  assertRecentAuthentication(req);
  if (new URL(config.redirectUri).host !== req.get('host')) throw new AppError('Use the configured local Calendar origin.', 400, 'CALENDAR_ORIGIN_MISMATCH');
  const state = newState();
  const now = new Date();
  await transaction(async (tx) => {
    await lockUser(tx, req.user.id);
    await tx.calendarAuthorization.deleteMany({ where: { OR: [{ organizerId: req.user.id }, { expiresAt: { lte: now } }] } });
    await tx.calendarAuthorization.create({ data: { id: stateDigest(state), organizerId: req.user.id,
      expiresAt: new Date(+now + 600000) } });
  });
  res.cookie(stateCookie, state, { ...cookieOptions, secure: config.redirectUri.startsWith('https:'), maxAge: 600000 });
  return sendSuccess(res, { consentUrl: consentUrl(config, state) });
});

calendarRoutes.get('/callback', async (req, res) => {
  const config = calendarConfig();
  const cookie = req.headers.cookie?.split(';').map((value) => value.trim())
    .find((value) => value.startsWith(stateCookie + '='))?.slice(stateCookie.length + 1);
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const valid = config && new URL(config.redirectUri).host === req.get('host') && validState(state, cookie);
  res.clearCookie(stateCookie, { ...cookieOptions, secure: config?.redirectUri.startsWith('https:') ?? false });
  if (!valid) return res.status(400).type('text').send('Calendar authorization could not be completed. Return to your dashboard.');
  try {
    const attempt = await transaction(async (tx) => {
      const id = stateDigest(state);
      const row = await tx.calendarAuthorization.findUnique({ where: { id } });
      if (!row || (await tx.calendarAuthorization.deleteMany({ where: { id, expiresAt: { gt: new Date() } } })).count !== 1) {
        throw new ForbiddenError();
      }
      approvedOrganizer(await currentActor(tx, row.organizerId), config);
      return row;
    });
    if (!code || code.length > 2048) throw new ForbiddenError();
    const token = await exchangeAuthorization(config, state, code);
    const route = await transaction(async (tx) => {
      await lockUser(tx, attempt.organizerId);
      const actor = await currentActor(tx, attempt.organizerId);
      approvedOrganizer(actor, config);
      const { calendarId, key } = config;
      const data = { encryptedToken: protectToken(token.refreshToken, key, attempt.organizerId, calendarId),
        scope: token.scope, connectedAt: new Date(), disconnectedAt: null };
      const saved = await tx.calendarConnection.upsert({ where: { organizerId_calendarId: { organizerId: attempt.organizerId, calendarId } },
        create: { organizerId: attempt.organizerId, calendarId, ...data }, update: data, select: { id: true } });
      await oauthAudit(tx, actor, 'CALENDAR_CONNECTED', saved.id, res.locals.requestId);
      if (actor.roles.some((role) => ['FOUNDER', 'CO_FOUNDER'].includes(role))) return 'founder';
      return actor.roles.includes('TEAM_LEADER') ? 'team-leader' : 'hr';
    });
    return res.redirect(303, '/dashboards/' + route + '#phase08Meetings');
  } catch {
    return res.status(400).type('text').send('Calendar authorization could not be completed. Return to your dashboard.');
  }
});

calendarRoutes.post('/disconnect', ...auth, endpoint(async (req, requestId) => {
  empty.parse(req.body ?? {});
  const config = calendarConfig();
  approvedOrganizer(req, config);
  assertRecentAuthentication(req);
  const result = await transaction(async (tx) => {
    await lockUser(tx, req.user.id);
    const actor = await currentActor(tx, req.user.id);
    approvedOrganizer(actor, config);
    const row = await tx.calendarConnection.findUnique({ where: { organizerId_calendarId: {
      organizerId: req.user.id, calendarId: config.calendarId } } });
    await tx.calendarAuthorization.deleteMany({ where: { organizerId: req.user.id } });
    if (!row?.encryptedToken) return { token: null };
    await tx.calendarConnection.update({ where: { id: row.id }, data: { encryptedToken: null, disconnectedAt: new Date() } });
    await oauthAudit(tx, actor, 'CALENDAR_DISCONNECTED', row.id, requestId);
    return { token: row.encryptedToken };
  });
  if (!result.token) return { connected: false, providerRevoked: null };
  try {
    await revokeAuthorization(readToken(result.token, config.key, req.user.id, config.calendarId));
    return { connected: false, providerRevoked: true };
  } catch {
    return { connected: false, providerRevoked: false };
  }
}));
