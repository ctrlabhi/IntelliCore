import { api } from '/services/api.js';
import { check, disclosure, form, inIndia, label, listing, node, numeric, record, section } from './work-controls.js';

const statuses = ['PENDING', 'PROCESSING', 'RETRY_SCHEDULED', 'SENT', 'FAILED', 'CANCELLED', 'CAPTURED'];
const deliveryState = (status) => status === 'SENT' ? 'Accepted by SMTP' : label(status);
const reminderFields = { taskHours: ['Task reminder hours', 72], reportMinutes: ['Report reminder minutes', 120],
  commencementDays: ['Commencement reminder days', 14], completionDays: ['Completion review reminder days', 14] };

function emailDetails(item, operate, refresh) {
  const path = '/admin/email-outbox/' + item.id;
  return disclosure('Email job details', async () => {
    const { data } = await api.get(path);
    const history = node('div', node('h4', 'Delivery attempts'));
    listing(history, path + '/attempts', (attempt) => record('Attempt ' + attempt.sequence,
      node('p', label(attempt.outcome) + ' · ' + inIndia(attempt.startedAt)),
      attempt.errorCode ? node('small', label(attempt.errorCode)) : null));
    const available = ['PENDING', 'RETRY_SCHEDULED', 'FAILED'].includes(data.status);
    return [
      node('p', 'Created ' + inIndia(data.createdAt)),
      data.sentAt ? node('p', 'Accepted by SMTP ' + inIndia(data.sentAt)) : null,
      data.preview ? record('Captured preview · local only', node('p', data.preview.subject), node('pre', data.preview.text)) : null,
      history,
      operate && data.status === 'FAILED' ? form([
        check('confirm', 'Confirm retry', false, true),
        data.lastErrorCode === 'DELIVERY_AMBIGUOUS' ? check('confirmAmbiguous', 'Confirm possible duplication after ambiguous delivery', false, true) : null
      ], 'Retry email job', (body) => api.post(path + '/retry', { confirm: true, confirmAmbiguous: body.confirmAmbiguous === 'yes' }), refresh) : null,
      operate && available ? form([check('confirm', 'Confirm cancellation', false, true)], 'Cancel email job',
        () => api.post(path + '/cancel', { confirm: true }), refresh) : null
    ].filter(Boolean);
  });
}

export function mountNotificationAdmin(root, context) {
  if (!context.permissions.includes('notifications:admin')) return;
  const operate = context.permissions.includes('notifications:operate');
  const wrapper = section(root, 'phase07EmailAdmin', 'Email outbox and worker');
  const totals = node('div', node('p', 'Loading notification metrics…'));
  const worker = node('div', node('p', 'Checking worker status…'));
  const results = node('div', node('h4', 'Email jobs'));
  wrapper.append(totals, worker, results);
  const refresh = () => Promise.all([refreshOverview(), refreshListing()]);
  const refreshListing = listing(results, '/admin/email-outbox', (item) => record(item.templateKey,
    node('p', deliveryState(item.status) + ' · ' + item.attemptCount + '/' + item.maximumAttempts + ' attempts'),
    item.lastErrorCode ? node('p', label(item.lastErrorCode)) : null,
    emailDetails(item, operate, refresh)), { states: statuses });
  async function refreshOverview() {
    try {
      const [stats, status] = await Promise.all([api.get('/admin/notification-stats'), api.get('/admin/notification-worker/status')]);
      const data = stats.data;
      totals.replaceChildren(node('p', data.total + ' notifications · ' + data.unread + ' unread'), node('ul',
        ...Object.entries(data.emails).map(([key, value]) => node('li', deliveryState(key) + ' · ' + value))));
      const details = status.data;
      worker.replaceChildren(node('h4', 'Worker status'), node('p', label(details.status)),
        ...details.workers.map((row) => node('p', label(row.mode) + ' · ' + label(row.status) + ' · ' + inIndia(row.heartbeatAt)
          + (row.lastErrorCode ? ' · ' + label(row.lastErrorCode) : ''))));
      if (operate) worker.append(disclosure('Reminder settings', async () => [
        form(Object.entries(reminderFields).map(([key, [name, maximum]]) => numeric(key, name, details.reminders[key], 0, maximum, true)),
          'Save reminder settings', (input) => api.patch('/admin/notification-worker/reminders',
            Object.fromEntries(Object.entries(input).map(([key, value]) => [key, Number(value)]))), refreshOverview)
      ]));
    } catch (error) {
      totals.replaceChildren(node('p', error.message));
      worker.replaceChildren();
    }
  }
  void refreshOverview();
}
