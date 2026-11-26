import { api } from '/services/api.js';
import { allItems, button, disclosure, field, form, listing, node, record, section } from './phase04-dashboard.js';

const attendanceStates = ['PRESENT', 'INCOMPLETE', 'ABSENT', 'ON_LEAVE', 'WEEKLY_OFF'];
const decisionStates = ['PENDING', 'APPROVED', 'REJECTED'];
const leaveTypes = ['SICK_LEAVE', 'CASUAL_LEAVE', 'EMERGENCY_LEAVE', 'OTHER'];
const reportLabels = {
  workCompleted: 'Work completed today', learningSummary: 'Learning and skills practiced',
  progressSummary: 'Progress made', blockers: 'Challenges or blockers', nextDayPlan: 'Next working day’s plan'
};
const label = (value) => value?.toLowerCase().replaceAll('_', ' ') || 'Unknown';
const day = (value) => value?.slice(0, 10) || '';
const indiaTime = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const indiaDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
const time = (value) => value ? indiaTime.format(new Date(value)) + ' IST' : '—';
const stateCopy = {
  NOT_ELIGIBLE: 'Attendance opens when your approved internship is ongoing.',
  BEFORE_SHIFT: 'Your workday starts at 09:30 IST.',
  OPEN_SHIFT: 'The shift is open.',
  IN_PROGRESS: 'You are checked in. Check-out is recorded when you sign out.',
  AWAITING_REPORT: 'Your daily work report is due by 20:00 IST.',
  CLOSED: 'The normal check-in window has closed.'
};
const recordName = (internship) => internship?.user?.profile?.fullName || internship?.internshipCode || 'Internship';
const activeMounts = new WeakMap();
const dateFields = () => [field('from', 'From date', { type: 'date' }), field('to', 'Through date', { type: 'date' })];
const reportFields = (value = {}) => Object.entries(reportLabels).map(([name, title]) =>
  field(name, title, { type: 'textarea', max: 4000, value: value[name] }));
const notes = (name = 'remarks', title = 'Review remarks') => field(name, title, { type: 'textarea', max: 2000, required: true });

function flags(item) {
  return [
    item.isLate ? `Late by ${item.lateMinutes} min` : null,
    item.isEarlyDeparture ? `Early departure by ${item.earlyDepartureMinutes} min` : null,
    item.missingCheckOut ? 'Missing checkout' : null,
    item.missingDailyReport ? 'Missing report' : null
  ].filter(Boolean).join(' · ');
}

function attendanceRow(item, own) {
  const status = item.status ? label(item.status) : stateCopy[item.state] || label(item.state);
  const title = own ? day(item.businessDate) : `${recordName(item.internship)} · ${day(item.businessDate)}`;
  const marker = node('strong', status);
  marker.className = 'phase05-attendance-status';
  if (item.status) marker.dataset.status = item.status;
  return record(title,
    marker,
    item.internship?.department ? node('p', item.internship.department.name) : null,
    node('p', `Check-in ${time(item.checkInAt)} · Check-out ${time(item.checkOutAt)}`),
    flags(item) ? node('p', flags(item)) : null);
}

function reportRow(item, reviewer, refresh) {
  return record(`${recordName(item.internship)} · ${day(item.businessDate)}`, node('p', label(item.status)),
    disclosure('Read report', async () => [
      node('dl', ...Object.entries(reportLabels).flatMap(([key, title]) => [node('dt', title), node('dd', item[key] || '—')])),
      item.reviewRemarks ? node('p', item.reviewRemarks) : null
    ].filter(Boolean)),
    reviewer && item.status === 'SUBMITTED'
      ? disclosure('Review report', async () => [form([notes()], 'Record review',
        (data) => api.post(`/daily-work-reports/${item.id}/review`, data), refresh)]) : null);
}

function leaveRow(item, own, reviewer, refresh) {
  const cancel = own && (item.status === 'PENDING' || (item.status === 'APPROVED' && day(item.startDate) > indiaDate.format(new Date())));
  return record(`${label(item.leaveType)} · ${day(item.startDate)} to ${day(item.endDate)}`,
    node('p', `${recordName(item.internship)} · ${item.workingDays} working days · ${label(item.status)}`),
    node('p', item.reason), item.reviewRemarks ? node('p', item.reviewRemarks) : null,
    item.reconciledActivity ? node('p', 'Reviewed as leave with recorded attendance activity retained.') : null,
    cancel ? disclosure('Cancel eligible leave', async () => [
      form([], 'Confirm cancellation', () => api.post(`/leave-requests/${item.id}/cancel`, {}), refresh)
    ]) : null,
    reviewer && item.status === 'PENDING' ? disclosure('Review leave', async () => {
      const { data: detail } = await api.get(`/leave-requests/${item.id}`);
      const reconcile = field('reconcileActivity', 'Approve leave and retain recorded attendance timestamps', { type: 'checkbox' });
      reconcile.querySelector('input').value = 'yes';
      return [
        detail.hasRecordedActivity ? node('p', 'This request overlaps recorded attendance and requires an explicit reconciliation decision.') : null,
        form([notes(), reconcile], 'Approve leave', (data) => api.post(`/leave-requests/${item.id}/approve`,
          { remarks: data.remarks, reconcileActivity: data.reconcileActivity === 'yes' }), refresh),
        form([notes()], 'Reject leave', (data) => api.post(`/leave-requests/${item.id}/reject`, data), refresh)
      ].filter(Boolean);
    }) : null);
}

function correctionRow(item, reviewer, refresh) {
  return record(`${label(item.kind)} · ${day(item.attendance.businessDate)}`,
    node('p', `${recordName(item.attendance.internship)} · ${label(item.status)}`), node('p', item.reason),
    item.resolutionRemarks ? node('p', item.resolutionRemarks) : null,
    disclosure('Inspect original and proposed values', async () => {
      const initial = item.originalValues;
      const original = node('p', `Original check-in ${time(initial.checkInAt)} · Original check-out ${time(initial.checkOutAt)} · Report ${label(initial.reportStatus)}`);
      const proposal = item.kind === 'TIMESTAMPS'
        ? node('p', `Proposed check-in ${time(item.proposedChanges.checkInAt)} · Proposed check-out ${time(item.proposedChanges.checkOutAt)}`)
        : node('dl', ...Object.entries(reportLabels).flatMap(([key, title]) => [node('dt', title), node('dd', item.proposedChanges[key])]));
      const moves = reviewer && item.status === 'PENDING' ? ['approve', 'reject'].map((decision) =>
        form([notes()], decision === 'approve' ? 'Approve correction' : 'Reject correction',
          (data) => api.post(`/attendance-corrections/${item.id}/${decision}`, data), refresh)) : [];
      return [original, proposal, ...moves];
    }));
}

async function internshipField() {
  const internships = await allItems('/internships/me');
  return field('internshipId', 'Internship', { required: true, options: [['', 'Select internship'],
    ...internships.map((item) => [item.id, `${item.department.name} · ${day(item.commencementDate)} · ${item.internshipCode}`])] });
}

function todayReportPanel(root, refreshHistory) {
  const live = node('div');
  root.append(live);
  const sync = async () => {
    try {
      const { data } = await api.get('/daily-work-reports/me/today');
      if (!data.canEdit) {
        live.replaceChildren(data.report ? reportRow(data.report, false)
          : node('p', 'Daily reports can be saved on eligible workdays from 09:30 until 20:00 IST.'));
        return;
      }
      const fields = reportFields(data.report || {});
      const editor = form(fields, 'Save draft', (values) => api.put('/daily-work-reports/me/today', values));
      const submit = button('Save and submit report', async () => {
        if (submit.disabled) return;
        const values = Object.fromEntries(new FormData(editor));
        const feedback = editor.querySelector('[role="status"]');
        if (Object.values(values).some((content) => !content.trim())) {
          feedback.textContent = 'Complete all five fields before submitting. Use “None” if there were no blockers.';
          return;
        }
        submit.disabled = true;
        try {
          await api.put('/daily-work-reports/me/today', values);
          await api.post('/daily-work-reports/me/today/submit', {});
          await Promise.all([sync(), refreshHistory()]);
        } catch (error) {
          feedback.textContent = error.message;
          submit.disabled = false;
        }
      });
      editor.querySelector('[role="status"]').before(submit);
      live.replaceChildren(editor);
    } catch (error) {
      live.replaceChildren(node('p', error.message), button('Retry report', () => void sync()));
    }
  };
  return sync;
}

function bindAutomaticAttendance(todayRoot, syncReport, refreshHistory, signal) {
  const holder = node('div');
  const feedback = node('p');
  feedback.setAttribute('role', 'status');
  todayRoot.append(holder, feedback);
  let refreshing = false;
  let reportWindow;
  let timer;
  async function update() {
    clearTimeout(timer);
    if (refreshing || signal.aborted || document.visibilityState !== 'visible') return;
    refreshing = true;
    let wait = 15 * 60 * 1000;
    try {
      const { data } = await api.post('/attendance/check-in', {}, { signal });
      if (signal.aborted) return;
      holder.replaceChildren(attendanceRow(data, true));
      feedback.textContent = data.reportReminder ? 'Submit your daily work report before 20:00 IST.' : '';
      const boundary = data.nextCheckInAt || (Date.parse(data.closesAt) >= Date.parse(data.serverTime) ? data.closesAt : data.reportDeadlineAt);
      const delay = Date.parse(boundary) - Date.parse(data.serverTime);
      if (delay >= 0) wait = Math.min(wait, delay + 300);
      const key = `${data.businessDate}:${Boolean(data.internship && data.workingDay && !data.nextCheckInAt && data.status !== 'ON_LEAVE')}`;
      if (reportWindow !== key) {
        reportWindow = key;
        void syncReport();
      }
      if (data.recorded) void refreshHistory();
    } catch (error) {
      feedback.textContent = `${error.message} Attendance will retry while the dashboard is open.`;
      wait = 30000;
    } finally {
      refreshing = false;
      if (!signal.aborted) timer = setTimeout(update, wait);
    }
  }
  document.addEventListener('visibilitychange', update, { signal });
  signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
  todayRoot.append(button('Refresh attendance', () => void update()));
  void update();
}

function ownForms(leavePanel, correctionPanel, refresh) {
  leavePanel.append(disclosure('Request leave', async () => [form([
    await internshipField(),
    field('leaveType', 'Leave type', { options: leaveTypes.map((item) => [item, label(item)]), value: leaveTypes[0] }),
    field('startDate', 'Start date', { type: 'date', required: true }), field('endDate', 'End date', { type: 'date', required: true }),
    notes('reason', 'Reason for leave')
  ], 'Submit leave request', async (values) => {
    const { data } = await api.post('/leave-requests', values);
    if (data.hasRecordedActivity) {
      const message = node('p', 'HR must reconcile the request with existing check-in or checkout activity.');
      message.setAttribute('role', 'status');
      leavePanel.prepend(message);
    }
  }, refresh)]));
  correctionPanel.append(disclosure('Request a timestamp correction', async () => [
    form([await internshipField(), field('businessDate', 'Business date', { type: 'date', required: true }),
      field('checkInAt', 'Proposed check-in (IST)', { type: 'datetime-local' }),
      field('checkOutAt', 'Proposed checkout (IST)', { type: 'datetime-local' }), notes('reason', 'Reason for correction')],
    'Submit correction request', ({ internshipId, businessDate, reason, checkInAt, checkOutAt }) =>
      api.post('/attendance-corrections', { internshipId, businessDate, reason, kind: 'TIMESTAMPS',
        proposedChanges: Object.fromEntries(Object.entries({ checkInAt, checkOutAt })
          .filter(([, value]) => value).map(([key, value]) => [key, new Date(value + '+05:30').toISOString()])) }), refresh)
  ]));
  correctionPanel.append(disclosure('Request late report acceptance', async () => [form([
    await internshipField(), field('businessDate', 'Business date', { type: 'date', required: true }),
    ...reportFields(), notes('reason', 'Reason for the late report')
  ], 'Submit late report request', ({ internshipId, businessDate, reason, ...proposedChanges }) =>
    api.post('/attendance-corrections', { internshipId, businessDate, reason, kind: 'LATE_REPORT', proposedChanges }), refresh)]));
}

function analytics(panel, path, filters, canExport) {
  const toolbar = node('form', ...filters, field('search', 'Intern or code', { type: 'search', max: 120 }), button('Refresh totals'));
  toolbar.className = 'phase04-filters';
  const summary = node('p');
  summary.setAttribute('role', 'status');
  const query = () => new URLSearchParams([...new FormData(toolbar)].filter(([, value]) => value));
  const load = async () => {
    try {
      const { data } = await api.get(`${path}/summary?${query()}`);
      summary.textContent = Object.entries(data.counts).map(([status, count]) => `${label(status)} ${count}`).join(' · ');
    } catch (error) {
      summary.textContent = error.message;
    }
  };
  toolbar.addEventListener('submit', (event) => { event.preventDefault(); void load(); });
  panel.append(toolbar, summary);
  if (canExport) panel.append(button('Export filtered CSV', async () => {
    try {
      const csv = await api.get(`/attendance/export?${query()}`);
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = node('a');
      link.href = url;
      link.download = 'attendance.csv';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      summary.textContent = error.message;
    }
  }));
  return load;
}

export function mountAttendance(root, context, own = false) {
  const { roles, permissions } = context;
  const attendance = own || permissions.some((permission) => ['attendance:read_all', 'attendance:read_department'].includes(permission));
  const canReadReports = own || permissions.some((permission) => ['reports:read_all', 'reports:read_department'].includes(permission));
  if (!attendance && !canReadReports) return;
  activeMounts.get(root)?.abort();
  const lifecycle = new AbortController();
  activeMounts.set(root, lifecycle);
  root.classList.add('phase04', 'phase05');
  root.hidden = false;
  root.replaceChildren(node('h2', 'Attendance, reports and leave'));
  const loaders = [];
  const refresh = () => Promise.all(loaders.map((load) => load()));
  const reviewing = roles.some((role) => ['FOUNDER', 'HR_MANAGER'].includes(role));
  const availableDepartments = own ? null : allItems(roles.includes('TEAM_LEADER') && !permissions.includes('attendance:read_all')
    ? '/departments?assigned=true' : '/departments').catch(() => []);
  const filters = () => {
    const dates = dateFields();
    if (own) return dates;
    const control = field('departmentId', 'Department', { options: [['', 'All departments']] });
    void availableDepartments.then((items) => control.querySelector('select')
      .append(...items.map(({ id, name }) => new Option(name, id))));
    return [...dates, control];
  };
  const attendancePath = own ? '/attendance/me' : '/attendance';
  const today = own ? section(root, 'phase05Today', 'Today’s attendance') : null;
  if (own) {
    const notice = node('p');
    notice.id = 'phase05LogoutNotice';
    notice.setAttribute('role', 'status');
    today.append(notice);
  }
  if (attendance) {
    const history = section(root, 'phase05History', 'Attendance history');
    loaders.push(analytics(history, attendancePath, filters(), !own && reviewing && permissions.includes('attendance:export')));
    loaders.push(listing(history, attendancePath, (item) => attendanceRow(item, own),
      { states: attendanceStates, filters: filters() }));
  }
  let syncReport = async () => {};
  if (own) {
    const current = section(root, 'phase05TodayReport', 'Today’s work report');
    syncReport = todayReportPanel(current, refresh);
  }
  if (canReadReports) {
    const reports = section(root, 'phase05Reports', 'Daily work reports');
    loaders.push(listing(reports, own ? '/daily-work-reports/me' : '/daily-work-reports',
      (item) => reportRow(item, reviewing && permissions.includes('reports:review'), refresh),
      { states: own ? ['DRAFT', 'SUBMITTED', 'REVIEWED'] : ['SUBMITTED', 'REVIEWED'], filters: filters() }));
  }
  let leavePanel;
  let correctionPanel;
  if (own || permissions.includes('leaves:read_all')) {
    leavePanel = section(root, 'phase05Leave', 'Leave requests');
    loaders.push(listing(leavePanel, own ? '/leave-requests/me' : '/leave-requests',
      (item) => leaveRow(item, own, reviewing && permissions.includes('leaves:review'), refresh),
      { states: [...decisionStates, 'CANCELLED'], initialStatus: own ? '' : 'PENDING', filters: filters() }));
  }
  if (own || (reviewing && permissions.includes('attendance:review_corrections'))) {
    correctionPanel = section(root, 'phase05Corrections', 'Attendance corrections');
    loaders.push(listing(correctionPanel, own ? '/attendance-corrections/me' : '/attendance-corrections',
      (item) => correctionRow(item, !own, refresh),
      { states: decisionStates, initialStatus: own ? '' : 'PENDING', filters: filters() }));
  }
  if (own) {
    ownForms(leavePanel, correctionPanel, refresh);
    bindAutomaticAttendance(today, syncReport, refresh, lifecycle.signal);
  }
  if (permissions.includes('attendance:manage_policy')) {
    const policies = section(root, 'phase05Policies', 'Attendance policy');
    const status = node('p', 'Loading policy versions…');
    const load = async () => {
      try {
        const { data } = await api.get('/attendance/policies');
        status.textContent = data.map((item) => `${item.name} from ${day(item.effectiveFrom)}`).join(' · ');
      } catch (error) { status.textContent = error.message; }
    };
    policies.append(status, node('p', 'The approved schedule runs Monday through Friday, 09:30 to 18:30 IST. Reports close at 20:00 IST.'),
      form([field('name', 'Policy name', { max: 100, required: true }),
        field('effectiveFrom', 'Future effective date', { type: 'date', required: true })], 'Publish policy version',
      (data) => api.post('/attendance/policies', data), load));
    loaders.push(load);
  }
  void refresh();
}

export function mountStaffAttendance(context, anchor) {
  if (!anchor) return;
  const root = document.getElementById('phase05Attendance') || node('section');
  if (!root.isConnected) {
    root.hidden = true;
    root.className = 'panel';
    root.id = 'phase05Attendance';
    anchor.after(root);
  }
  mountAttendance(root, context);
  document.querySelectorAll('[href="#attendance"], [href="#phase05Attendance"]').forEach((link) => {
    if (!root.hidden) link.setAttribute('href', '#phase05Attendance');
  });
}

export function stopAttendance(root) {
  activeMounts.get(root)?.abort();
}
