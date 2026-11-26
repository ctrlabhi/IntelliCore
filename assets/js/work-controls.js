
import { api } from '/services/api.js';
export { allItems, button, disclosure, field, form, node, record, section } from './phase04-dashboard.js';
import { field, form, listing as paginatedList, node } from './phase04-dashboard.js';

export function listing(...args) {
  const refresh = paginatedList(...args);
  void refresh();
  return refresh;
}

export const label = (value) => String(value ?? '').toLowerCase().replaceAll('_', ' ');
export const internName = (internship) => internship.user?.profile?.fullName || internship.internshipCode;
const time = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
export const inIndia = (value) => value ? time.format(new Date(value)) + ' IST' : '—';
export const istFieldValue = (value) => new Date(+new Date(value) + 330 * 60000).toISOString().slice(0, 16);
export const fromIstField = (value) => new Date(value + '+05:30').toISOString();
export const pct = (value) => value === null || value === undefined ? '—' : value + '%';
export const confirmed = { confirmActiveChange: true };
export const departmentSelect = (departments) => field('departmentId', 'Department', {
  options: [['', 'Select department'], ...departments.map(({ id, name }) => [id, name])], required: true
});
export const departmentFilter = (departments) => field('departmentId', 'Department', {
  options: [['', 'All authorized departments'], ...departments.map(({ id, name }) => [id, name])]
});
export const dateFields = () => ['from', 'to'].map((name) => field(name, name === 'from' ? 'From IST date' : 'Through IST date', { type: 'date' }));

export function numeric(name, text, value, minimum = 1, maximum = 10000, required = false) {
  const row = field(name, text, { type: 'number', value, required });
  const control = row.querySelector('input');
  control.min = minimum;
  control.max = maximum;
  control.step = 1;
  return row;
}

export function check(name, text, checked = false, required = false) {
  const row = field(name, text, { type: 'checkbox', required });
  row.querySelector('input').checked = checked;
  row.querySelector('input').value = 'yes';
  return row;
}

export function link(url, title) {
  try {
    const value = new URL(url);
    if (!['https:', 'http:'].includes(value.protocol) || value.username || value.password) return node('span', title);
    const anchor = node('a', title);
    anchor.href = value.href;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    return anchor;
  } catch {
    return node('span', title);
  }
}

export function files(items = []) {
  return items.length ? node('ul', ...items.map((item) => {
    const status = node('span');
    status.setAttribute('role', 'status');
    const control = node('button', 'Download ' + item.originalFilename);
    control.type = 'button';
    control.addEventListener('click', async () => {
      control.disabled = true;
      try {
        const blob = await api.get('/attachments/' + item.id + '/download', { responseType: 'blob' });
        const url = URL.createObjectURL(blob);
        const anchor = node('a');
        anchor.href = url;
        anchor.download = item.originalFilename;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        status.textContent = ' Download ready.';
      } catch (error) {
        status.textContent = ' ' + error.message;
      } finally {
        control.disabled = false;
      }
    });
    return node('li', control, status);
  })) : null;
}

export function uploadForm(path, revision, refresh) {
  const file = field('attachment', 'Attachment (.txt or .png)', { type: 'file', required: true });
  file.querySelector('input').accept = '.txt,.png';
  return form([file], 'Upload private attachment', ({ attachment }) => api.post(path, attachment, {
    timeoutMs: 30000,
    headers: { 'Content-Type': 'application/octet-stream', 'x-attachment-name': encodeURIComponent(attachment.name),
      'x-expected-revision': String(revision) }
  }), refresh);
}

export function pairLines(value, keyName, valueName) {
  if (!value?.trim()) return [];
  return value.trim().split('\n').map((line) => {
    const separator = line.indexOf('|');
    if (separator < 1) throw new Error('Use one label and value per line, separated by |.');
    return { [keyName]: line.slice(0, separator).trim(), [valueName]: line.slice(separator + 1).trim() };
  });
}

export const asLines = (data, keyName, valueName) => (data ?? []).map((row) => row[keyName] + ' | ' + row[valueName]).join('\n');

export function summaryBlock(summary) {
  const { counts, completionRate, learning } = summary;
  return node('dl', ...[
    ['Individual assignments', summary.total], ['Pending work', summary.pending],
    ['Submitted · awaiting review', summary.awaitingReview], ['Approved', counts.COMPLETED],
    ['Revision requested', counts.REVISION_REQUESTED], ['Cancelled', counts.CANCELLED], ['Overdue', summary.overdue],
    ['Task completion', pct(completionRate.percentage) + ' (' + completionRate.numerator + '/' + completionRate.denominator + ')'],
    ['Required lessons', pct(learning.percentage) + ' (' + learning.completedRequired + '/' + learning.required + ')'],
    ['Optional lessons', learning.completedOptional + '/' + learning.optional]
  ].flatMap(([key, value]) => [node('dt', key), node('dd', String(value))]));
}
