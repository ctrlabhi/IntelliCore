import { expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { actionPath, isActionPath } from '../../backend/src/modules/notifications/notificationPolicy.js';
import { deliveryConfiguration } from '../../backend/src/integrations/email/emailConfig.js';
import { deliverEmail, classifyDelivery } from '../../backend/src/integrations/email/emailService.js';
import { renderEmail } from '../../backend/src/integrations/email/emailTemplates.js';
import { retryAt } from '../../backend/src/modules/notifications/emailQueue.js';

const smtp = { NODE_ENV: 'test', EMAIL_DELIVERY_MODE: 'SMTP', EMAIL_SMTP_AUTHORIZED: 'true',
  APP_BASE_URL: 'http://localhost:3000', SMTP_HOST: 'smtp.example.test', SMTP_PORT: '587',
  SMTP_SECURE: 'false', SMTP_REQUIRE_TLS: 'true', SMTP_USER: 'fixture', SMTP_PASSWORD: 'synthetic-private',
  EMAIL_FROM_ADDRESS: 'sender@example.test', EMAIL_ALLOWED_RECIPIENTS: 'authorized@example.test' };
const job = () => ({ id: randomUUID(), templateKey: 'task-assigned', templateVersion: 1, recipientEmail: 'authorized@example.test',
  templateData: { event: 'TASK_ASSIGNED', actionPath: actionPath(['INTERN'], randomUUID()) } });
const config = () => deliveryConfiguration(smtp);

it('validates internal action paths and trusted HTML and plain text template links', () => {
  const item = job();
  expect(isActionPath(item.templateData.actionPath)).toBe(true);
  for (const unsafe of ['//example.test/a', 'https://example.test', '/dashboards/intern?notice=x#phase07Notice',
    '/dashboards/intern?notice=' + randomUUID() + '#external']) expect(isActionPath(unsafe)).toBe(false);
  const input = { templateKey: item.templateKey, version: 1, event: 'TASK_ASSIGNED',
    path: item.templateData.actionPath, baseUrl: 'http://localhost:3000' };
  const result = renderEmail(input);
  expect(result.subject).toContain('[IntelliCore development]');
  expect(result.html).not.toContain('https:');
  expect(result.html).toContain('http://localhost:3000');
  expect(result.text).toContain('local workspace');
  expect(() => renderEmail({ ...input, baseUrl: 'https://user:pass@example.test' })).toThrow();
  expect(() => renderEmail({ ...input, path: '\"<iframe>' })).toThrow();
});

it('defaults to capture and fails closed on bad config, unauthorized SMTP and header injection', () => {
  expect(deliveryConfiguration({})).toMatchObject({ mode: 'CAPTURE' });
  expect(deliveryConfiguration({ ...smtp, NODE_ENV: 'production' })).toMatchObject({ mode: 'DISABLED', errorCode: 'PRODUCTION_DELIVERY_LOCKED' });
  for (const change of [{ EMAIL_SMTP_AUTHORIZED: 'false' }, { SMTP_REQUIRE_TLS: 'false' },
    { EMAIL_FROM_NAME: 'Person\r\nBcc: example@example.test' }, { SMTP_HOST: 'https://example.test' },
    { EMAIL_ALLOWED_RECIPIENTS: 'unverified@test' }, { EMAIL_ALLOWED_RECIPIENTS: 'x@exa mple.test' }]) {
    const result = deliveryConfiguration({ ...smtp, ...change });
    expect(result.errorCode).toBe('SMTP_CONFIGURATION_INVALID');
    expect(JSON.stringify(result)).not.toContain(smtp.SMTP_PASSWORD);
  }
});

it('does not instantiate a transport for capture, disabled or an unallowlisted address', async () => {
  const createTransport = vi.fn();
  expect(await deliverEmail(job(), deliveryConfiguration({}), { createTransport })).toEqual({ status: 'CAPTURED' });
  expect(await deliverEmail(job(), { mode: 'DISABLED' }, { createTransport })).toMatchObject({ status: 'CANCELLED' });
  expect(await deliverEmail({ ...job(), recipientEmail: 'unrelated@example.test' }, config(), { createTransport }))
    .toMatchObject({ status: 'CANCELLED', errorCode: 'RECIPIENT_NOT_ALLOWLISTED' });
  expect(createTransport).not.toHaveBeenCalled();
});

it('uses authenticated TLS and an explicit single-recipient envelope with a stable message ID in mocked SMTP', async () => {
  const fixture = job();
  const close = vi.fn();
  const sendMail = vi.fn().mockResolvedValue({ accepted: [fixture.recipientEmail], messageId: 'provider-internal' });
  const createTransport = vi.fn(() => ({ sendMail, close }));
  const result = await deliverEmail(fixture, config(), { createTransport });
  expect(createTransport.mock.calls[0][0]).toMatchObject({ requireTLS: true, tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
    disableFileAccess: true, disableUrlAccess: true, debug: false, logger: false });
  expect(sendMail.mock.calls[0][0]).toMatchObject({ envelope: { from: 'sender@example.test', to: [fixture.recipientEmail] },
    messageId: '<intellicore.' + fixture.id + '@example.test>' });
  expect(result.status).toBe('SENT');
  expect(result.providerMessageId).toBe(sendMail.mock.calls[0][0].messageId);
  expect(close).toHaveBeenCalled();
});

it('classifies transport failures without leaking provider content and caps retry delays', () => {
  expect(classifyDelivery({ responseCode: 451, message: 'provider secret' })).toEqual({
    status: 'RETRY_SCHEDULED', errorCode: 'SMTP_TEMPORARY'
  });
  expect(classifyDelivery({ responseCode: 550 })).toEqual({ status: 'FAILED', errorCode: 'SMTP_PERMANENT' });
  expect(classifyDelivery({ code: 'ETIMEDOUT', command: 'CONN' }).status).toBe('RETRY_SCHEDULED');
  expect(classifyDelivery({ code: 'ETIMEDOUT', command: 'DATA' }).errorCode).toBe('DELIVERY_AMBIGUOUS');
  expect(classifyDelivery({ code: 'EAUTH' }).pause).toBe(true);
  const options = { retryBaseMs: 60000, retryCapMs: 120000 };
  expect(+retryAt(new Date(0), 3, options, () => 1)).toBe(120000);
  expect(+retryAt(new Date(0), 1, options, () => 0)).toBe(48000);
});
