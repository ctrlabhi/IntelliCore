import { emailAddress } from './emailConfig.js';
import { renderEmail } from './emailTemplates.js';

const timeoutMs = 20_000;

export function classifyDelivery(error) {
  if (error.code === 'DELIVERY_TIMEOUT') return { status: 'FAILED', errorCode: 'DELIVERY_AMBIGUOUS' };
  if (error.code === 'EAUTH' || ['ETLS', 'EREQUIRETLS'].includes(error.code)) {
    return { status: 'FAILED', errorCode: 'SMTP_CONFIGURATION_ERROR', pause: true };
  }
  if (error.responseCode >= 400 && error.responseCode < 500) return { status: 'RETRY_SCHEDULED', errorCode: 'SMTP_TEMPORARY' };
  if (error.responseCode >= 500) return { status: 'FAILED', errorCode: 'SMTP_PERMANENT' };
  if (['ECONNECTION', 'EDNS', 'ETIMEDOUT', 'ESOCKET'].includes(error.code)
      && ['CONN', 'EHLO', 'HELO', 'STARTTLS', 'AUTH', 'MAIL FROM', 'RCPT TO'].some((command) => error.command?.startsWith(command))) {
    return { status: 'RETRY_SCHEDULED', errorCode: 'SMTP_CONNECTION_FAILED' };
  }
  return { status: 'FAILED', errorCode: 'DELIVERY_AMBIGUOUS' };
}

function timedDelivery(send, transport) {
  let timer;
  return Promise.race([send, new Promise((reject) => {
    timer = setTimeout(() => {
      reject(Object.assign(new Error('Delivery deadline reached.'), { code: 'DELIVERY_TIMEOUT' }));
      transport.close({ force: true });
    }, timeoutMs);
  })]).finally(() => clearTimeout(timer));
}

export function previewEmail(job, config) {
  return renderEmail({ templateKey: job.templateKey, version: job.templateVersion,
    event: job.templateData.event, path: job.templateData.actionPath, baseUrl: config.baseUrl });
}

export async function deliverEmail(job, config, { createTransport } = {}) {
  if (config.errorCode) return { status: 'FAILED', errorCode: config.errorCode, pause: true };
  if (config.mode === 'DISABLED') return { status: 'CANCELLED', errorCode: 'DELIVERY_DISABLED' };
  let contents;
  try {
    contents = previewEmail(job, config);
  } catch {
    return { status: 'FAILED', errorCode: 'INVALID_EMAIL_TEMPLATE' };
  }
  if (config.mode === 'CAPTURE') return { status: 'CAPTURED' };
  const smtp = config.smtp;
  const recipient = emailAddress.safeParse(job.recipientEmail);
  if (!recipient.success || !smtp.EMAIL_ALLOWED_RECIPIENTS.includes(recipient.data)) {
    return { status: 'CANCELLED', errorCode: 'RECIPIENT_NOT_ALLOWLISTED' };
  }
  let transport;
  try {
    const factory = createTransport ?? (await import('nodemailer')).default.createTransport;
    transport = factory({
      pool: true, maxConnections: 1, maxMessages: 1, host: smtp.SMTP_HOST, port: smtp.SMTP_PORT,
      secure: smtp.SMTP_SECURE, requireTLS: smtp.SMTP_REQUIRE_TLS,
      auth: { user: smtp.SMTP_USER, pass: smtp.SMTP_PASSWORD },
      tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
      connectionTimeout: 8_000, greetingTimeout: 8_000, socketTimeout: 10_000,
      disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false
    });
    const messageId = '<intellicore.' + job.id + '@' + smtp.EMAIL_FROM_ADDRESS.split('@')[1] + '>';
    const accepted = await timedDelivery(transport.sendMail({
      ...contents, from: { name: smtp.EMAIL_FROM_NAME, address: smtp.EMAIL_FROM_ADDRESS },
      replyTo: smtp.EMAIL_REPLY_TO || undefined, to: [{ address: recipient.data, name: '' }],
      envelope: { from: smtp.EMAIL_FROM_ADDRESS, to: [recipient.data] }, messageId
    }), transport);
    if (!accepted.accepted?.length) return { status: 'FAILED', errorCode: 'SMTP_PERMANENT' };
    return { status: 'SENT', providerMessageId: messageId };
  } catch (error) {
    return classifyDelivery(error);
  } finally {
    transport?.close();
  }
}

