import { api } from '/services/api.js';
import { allItems, disclosure, field, form, listing, node, record, section } from './phase04-dashboard.js';

const date = (value) => value?.slice(0, 10) ?? '';
const dayAfter = (value) => new Date(Date.parse(date(value)) + 86400000).toISOString().slice(0, 10);
const indiaDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
const localTime = (value) => new Date(+new Date(value) + 330 * 60000).toISOString().slice(0, 16);
const roles = ['TEAM_LEADER', 'HR_EXECUTIVE', 'OPERATIONS_EXECUTIVE', 'HR_MANAGER'];
const label = (value) => value?.toLowerCase().replaceAll('_', ' ') ?? '';
const base = (item, suffix) => '/internships/' + item.id + suffix;
const requiredReason = () => field('reason', 'Reason', { max: 500, required: true, type: 'textarea' });
const periodLabel = (item) => date(item.commencementDate) + ' – ' + date(item.actualCompletionDate ?? item.expectedCompletionDate)
  + ' · ' + (item.department?.name ?? item.internshipCode);
const displayStatus = (row) => row.status === 'SENT' ? 'Sent manually' : 'Not marked as sent';

function confirmationField() {
  const box = node('input');
  box.type = 'checkbox';
  box.name = 'confirmed';
  box.required = true;
  return node('label', box, ' I confirm that I have already emailed this intern’s certificate outside IntelliCore.');
}

function certificatePanel(item, allowed, refresh) {
  return disclosure('Certificate email status', async () => {
    const path = base(item, '/certificate-email-status');
    const { data } = await api.get(path);
    const details = [node('p', data.message)];
    if (data.recordedAt) details.push(node('p', displayStatus(data) + ' · Recorded by the authorized team · ' + localTime(data.recordedAt).replace('T', ' ') + ' IST'));
    if (data.history?.items.length) {
      details.push(node('h5', 'Dispatch history'), node('ul', ...data.history.items.map((event) => node('li',
        displayStatus(event) + ' · ' + (event.actor.profile?.fullName ?? 'Authorized team') + ' · ' + localTime(event.recordedAt).replace('T', ' ') + ' IST'
          + (event.note ? ' · ' + event.note : '')))));
    }
    if (allowed && item.internshipStatus === 'COMPLETED') {
      const key = crypto.randomUUID();
      if (data.status === 'SENT') details.push(form([requiredReason()], 'Correct dispatch status', ({ reason }) =>
        api.post(path + '/correct', { requestKey: key, reason }), refresh));
      else details.push(form([confirmationField(),
        field('sentAt', 'Sent time (India time)', { type: 'datetime-local', value: localTime(new Date()) + ':' + String(new Date().getUTCSeconds()).padStart(2, '0'), required: true }),
        field('note', 'Optional non-sensitive note', { max: 500 })], 'Mark certificate as sent', ({ confirmed, sentAt, note }) =>
        api.post(path + '/mark-sent', { requestKey: key, confirmed: confirmed === 'on',
          declaredSentAt: new Date(sentAt + '+05:30').toISOString(), ...(note ? { note } : {}) }), refresh));
    }
    if (allowed && item.internshipStatus === 'COMPLETED' && data.status !== 'SENT') details.at(-1).elements.sentAt.step = 1;
    return details;
  });
}

function extensionPanel(item, options, refresh) {
  const canExtend = options.canManage && ['APPROVED', 'ONGOING', 'COMPLETED'].includes(item.internshipStatus);
  return disclosure('Extensions and original dates', async () => {
    const path = base(item, '/extensions');
    const { data } = await api.get(path);
    const rows = data.items.map((entry) => record(date(entry.startsOn) + ' – ' + date(entry.endsOn),
      node('p', 'Previous period ended ' + date(entry.previousEnd) + ' · ' + entry.reason),
      entry.remarks && node('p', entry.remarks),
      entry.cancelledAt && node('p', 'Cancelled · ' + entry.cancellationNote),
      entry.continuation && node('p', 'Continuation · ' + entry.continuation.internshipCode),
      canExtend && !entry.cancelledAt && date(entry.startsOn) > options.today &&
      form([requiredReason()], 'Cancel future extension', ({ reason }) => api.post(path + '/' + entry.id + '/cancel', { reason }), refresh)));
    if (!rows.length) rows.push(node('p', 'No extensions recorded.'));
    if (canExtend) {
      const next = dayAfter(item.actualCompletionDate ?? item.expectedCompletionDate);
      rows.push(form([
        field('startsOn', 'Extension start', { type: 'date', required: true, value: next < options.today ? options.today : next }),
        field('endsOn', 'Revised completion date', { type: 'date' }),
        field('durationDays', 'Duration in days, if using a duration', { type: 'number' }),
        requiredReason(), field('remarks', 'Remarks', { type: 'textarea', max: 500 })
      ], 'Approve extension', ({ startsOn, endsOn, durationDays, reason, remarks }) => api.post(path, { startsOn, reason,
        ...(endsOn ? { endsOn } : {}), ...(durationDays ? { durationDays: Number(durationDays) } : {}), ...(remarks ? { remarks } : {}) }), refresh));
    }
    return rows;
  });
}

function promotionRecord(row, controls, refresh) {
  const name = row.internship.user.profile?.fullName;
  const go = (action, message) => form([requiredReason()], message,
    ({ reason }) => api.post('/promotions/' + row.id + '/' + action, { reason }), refresh);
  return record(row.designation + (name ? ' · ' + name : ''), node('p', 'Effective ' + date(row.effectiveOn) + ' · ' + label(row.status)),
    node('p', row.reason), row.decisionReason && node('p', row.decisionReason),
    row.targetRole && node('p', label(row.targetRole) + ' · ' + (row.department?.name ?? 'Department unavailable')),
    row.targetRole && row.status === 'PENDING' && controls.founder && row.requestedBy !== controls.context.appUser.id
      && disclosure('Decision', async () => [go('approve', 'Approve recommendation'), go('reject', 'Reject recommendation')]),
    row.targetRole && (row.status === 'PENDING' && (controls.founder || row.requestedBy === controls.context.appUser.id)
      || row.status === 'APPROVED' && controls.founder) && disclosure('Cancel recommendation', async () => [go('cancel', 'Confirm cancellation')]),
    row.targetRole && row.status === 'APPROVED' && controls.founder &&
      form([], 'Provision approved staff', () => api.post('/promotions/' + row.id + '/provision', {}), refresh));
}

function promotionPanel(item, options, refresh) {
  return disclosure('Designation and promotion history', async () => {
    const path = base(item, '/promotions');
    const { data } = await api.get(path);
    const rows = data.items.map((row) => promotionRecord(row, options, refresh));
    if (!rows.length) rows.push(node('p', 'No promotions recorded.'));
    if (!options.canManage || item.internshipStatus !== 'COMPLETED') return rows;
    const [{ data: extension }, { data: performance }] = await Promise.all([api.get(base(item, '/extensions')),
      api.get('/performance/internships/' + item.id + '?limit=1')]);
    const continuations = extension.items.flatMap((entry) => entry.continuation && !entry.cancelledAt
      ? [[entry.continuation.id, entry.continuation.internshipCode + ' · ' + date(entry.startsOn)]] : []);
    const designation = () => field('designation', 'Proposed designation', { max: 100, required: true });
    const dateOf = () => field('effectiveOn', 'Effective date', { type: 'date', value: options.today, required: true });
    const context = item.candidate;
    rows.push(node('p', 'Current designation · ' + (context?.staffProfile?.designation ?? item.effectiveDesignation ?? item.positionTitle)),
      context && node('p', 'Account · ' + label(context.status) + (context.staffProfile ? ' · Staff ' + label(context.staffProfile.employmentStatus) : '')),
      node('p', 'Completed task assignments · ' + (performance.summary?.counts?.COMPLETED ?? 0)),
      form([designation(), dateOf(), field('continuationId', 'Apply to an eligible continuation', { options: [['', 'Record designation in history'], ...continuations] }),
        requiredReason()], 'Approve intern designation', ({ continuationId, ...input }) =>
        api.post(path, { ...input, ...(continuationId ? { continuationId } : {}) }), refresh),
      form([designation(), dateOf(), field('targetRole', 'Staff role', { options: roles.map((role) => [role, label(role)]) }),
        field('departmentId', 'Assigned department', { required: true, options: [['', 'Choose a department'],
          ...options.departments.map(({ id, name }) => [id, name])] }), requiredReason()],
      'Recommend staff promotion', (input) => api.post(path, input), refresh));
    return rows;
  });
}

function timelineEntry(item, options, refresh) {
  const who = item.user?.profile?.fullName;
  return record((who && !options.own ? who + ' · ' : '') + (item.effectiveDesignation ?? item.positionTitle),
    node('p', periodLabel(item)), node('p', label(item.internshipStatus)),
    item.recordedDesignation && node('p', 'Recorded designation · ' + item.recordedDesignation.designation),
    item.completionApprovedAt && node('p', 'Completion approved ' + date(item.completionApprovedAt)),
    item.continuationOf && node('p', 'Continuation of an earlier approved period'),
    item.certificateEmailStatus && node('p', item.certificateEmailStatus.message),
    item.dispatchStatus && node('p', 'Certificate email · ' + displayStatus({ status: item.dispatchStatus })),
    options.certificates && item.internshipStatus === 'COMPLETED' && certificatePanel(item, options.canManage, refresh),
    extensionPanel(item, options, refresh), promotionPanel(item, options, refresh));
}

export async function mountFollowups(root, context, own = false) {
  const permission = (value) => context.permissions.includes('internships:' + value);
  const canManage = permission('manage_followups');
  const founder = context.roles.includes('FOUNDER') && context.permissions.includes('staff:create');
  const executive = permission('read_followups');
  const leader = context.roles.includes('TEAM_LEADER') && permission('read_department');
  if (!(own || executive || leader)) return;
  const panel = section(root, 'phase08Internships', own ? 'My internship timeline' : 'Internship follow-up');
  const options = { context, own, founder, canManage, certificates: own || executive, today: indiaDate.format(new Date()), departments: [] };
  try { if (canManage) options.departments = await allItems('/departments'); }
  catch (error) { panel.append(node('p', error.message)); }
  let refreshCompleted = () => {};
  let refreshPromotions = () => {};
  const general = node('div', node('h4', 'Internship periods'));
  panel.append(general);
  const changed = () => Promise.all([refresh(), refreshCompleted(), refreshPromotions()]);
  const refresh = listing(general, own ? '/internships/me' : '/internships', (row) => timelineEntry(row, options, changed), {
    states: ['APPROVED', 'ONGOING', 'COMPLETION_REVIEW', 'COMPLETED', 'TERMINATED', 'WITHDRAWN']
  });
  if (executive) {
    const completed = node('div', node('h4', 'Completed internships'));
    panel.append(completed);
    refreshCompleted = listing(completed, '/internships/followups/completed', (row) => timelineEntry(row, options, changed), {
      filters: [field('dispatchStatus', 'Certificate email status', {
        options: [['', 'Any status'], ['NOT_SENT', 'Not marked as sent'], ['SENT', 'Sent manually']]
      })]
    });
    const promotions = node('div', node('h4', 'Staff recommendations'));
    panel.append(promotions);
    refreshPromotions = listing(promotions, '/promotions', (row) => promotionRecord(row, options, changed), {
      states: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'PROVISIONED']
    });
  }
  void changed();
}
