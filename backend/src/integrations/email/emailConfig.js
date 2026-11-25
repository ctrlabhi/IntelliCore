import { z } from 'zod';

const mode = z.enum(['CAPTURE', 'DISABLED', 'SMTP']);
const hostName = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const mailbox = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;
export const emailAddress = z.string().max(191).email().regex(mailbox).transform((value) => value.toLowerCase());
const headerText = z.string().trim().min(1).max(90).regex(/^[^\u0000-\u001f\u007f]+$/u);
const boolean = z.enum(['true', 'false']).transform((value) => value === 'true');
const smtpSchema = z.object({
  SMTP_HOST: z.string().regex(hostName), SMTP_PORT: z.coerce.number().int().min(1).max(65535),
  SMTP_SECURE: boolean, SMTP_REQUIRE_TLS: boolean,
  SMTP_USER: headerText, SMTP_PASSWORD: z.string().min(1).max(512).regex(/^[^\r\n\u0000]+$/),
  EMAIL_FROM_NAME: headerText.default('IntelliCore'), EMAIL_FROM_ADDRESS: emailAddress,
  EMAIL_REPLY_TO: z.union([z.literal(''), emailAddress]).optional(),
  EMAIL_SMTP_AUTHORIZED: z.literal('true'),
  EMAIL_ALLOWED_RECIPIENTS: z.string().transform((value) => value.split(',').map((item) => item.trim()))
    .pipe(z.array(emailAddress).min(1).max(10))
}).refine((config) => config.SMTP_SECURE || config.SMTP_REQUIRE_TLS);

export function applicationOrigin(value) {
  try {
    const url = new URL(value || 'http://localhost:3000');
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    if (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
      return url.origin;
    }
  } catch {
    // Configuration errors return only fixed reason codes.
  }
  return null;
}

export function deliveryConfiguration(source = process.env) {
  const requested = mode.safeParse(source.EMAIL_DELIVERY_MODE ?? 'CAPTURE');
  if (!requested.success) return { mode: 'DISABLED', errorCode: 'INVALID_DELIVERY_MODE' };
  if (source.NODE_ENV === 'production' && requested.data !== 'DISABLED') {
    return { mode: 'DISABLED', errorCode: 'PRODUCTION_DELIVERY_LOCKED' };
  }
  const baseUrl = applicationOrigin(source.APP_BASE_URL);
  if (requested.data === 'DISABLED') return { mode: requested.data };
  if (!baseUrl) return { mode: requested.data, errorCode: 'INVALID_APP_BASE_URL' };
  if (requested.data === 'CAPTURE') return { mode: requested.data, baseUrl };
  const parsed = smtpSchema.safeParse(source);
  if (!parsed.success) return { mode: 'SMTP', errorCode: 'SMTP_CONFIGURATION_INVALID' };
  return { mode: 'SMTP', baseUrl, smtp: parsed.data };
}
