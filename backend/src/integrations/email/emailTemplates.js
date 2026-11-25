import { isActionPath, policyFor } from '../../modules/notifications/notificationPolicy.js';
import { applicationOrigin } from './emailConfig.js';

export const templateVersion = 1;
const escape = (value) => String(value).replace(/[&<>"']/g, (character) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

export function renderEmail({ templateKey, version, event, path, baseUrl, development = true }) {
  const policy = policyFor(event);
  const origin = applicationOrigin(baseUrl);
  if (!policy.templateKey || templateKey !== policy.templateKey || version !== templateVersion || !origin || !isActionPath(path)) {
    throw new Error('INVALID_EMAIL_TEMPLATE');
  }
  const url = new URL(path, origin).href;
  const subject = (development ? '[IntelliCore development] ' : 'IntelliCore · ') + policy.title;
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname);
  const footer = local ? 'This local workspace link is available on the computer running IntelliCore.' : 'Sign in to view authorized information.';
  const text = ['Hello,', '', policy.message, '', 'Open IntelliCore', url, '', footer, 'IntelliCore'].join('\n');
  const html = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">' +
    '<body style="margin:0;background:#eef4f9;color:#142b43;font:16px Arial,sans-serif">' +
    '<main style="max-width:560px;margin:24px auto;padding:24px;background:#fff;border:1px solid #c4d7e7">' +
    '<h1 style="margin:0 0 18px;color:#075a84;font-size:25px">IntelliCore</h1><h2 style="font-size:19px">' +
    escape(policy.title) + '</h2><p>Hello,</p><p>' + escape(policy.message) + '</p>' +
    '<p><a style="display:inline-block;padding:10px 15px;background:#075a84;color:#fff" href="' + escape(url) +
    '">Open IntelliCore</a></p><p style="font-size:13px;color:#435a71">' + escape(footer) + '</p></main></body></html>';
  return { subject, text, html };
}
