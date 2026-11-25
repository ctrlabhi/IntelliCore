import { api } from '/services/api.js';
import { allItems, button, disclosure, field, form, listing, node, record, section } from './phase04-dashboard.js';

const state = (value) => value?.toLowerCase().replaceAll('_', ' ') ?? '';
const localized = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
const indiaInput = (value) => value ? new Date(+new Date(value) + 330 * 60000).toISOString().slice(0, 16) : '';
const publishPath = (id, action) => '/meetings/' + id + '/' + action;
const timeText = (meeting) => localized.format(new Date(meeting.startAt)) + ' – ' + localized.format(new Date(meeting.endAt)) + ' IST';
const states = ['DRAFT', 'SCHEDULED', 'CANCELLED', 'COMPLETED'];
const newDate = (value) => new Date(value + '+05:30').toISOString();
const managerPermissions = ['meetings:manage_all', 'meetings:manage_hr', 'meetings:manage_operations', 'meetings:manage_department'];

function joinControl(item) {
  const output = node('p');
  output.setAttribute('role', 'status');
  const reveal = button('Get join link', async () => {
    reveal.disabled = true;
    try {
      const { data } = await api.post(publishPath(item.id, 'join'), {});
      const link = node('a', 'Join in Google Meet');
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.href = data.meetingUrl;
      output.replaceChildren(link);
      link.focus();
    } catch (error) {
      output.textContent = error.message;
    } finally { reveal.disabled = false; }
  });
  return node('div', reveal, output);
}

function incoming(item, refresh) {
  const participant = item.participants[0];
  const upcoming = item.status === 'SCHEDULED' && new Date(item.endAt) > new Date();
  const linkReady = ['NOT_REQUIRED', 'READY'].includes(item.providerSyncStatus);
  return record(item.title, node('p', item.description), node('p', timeText(item)),
    node('p', 'Organizer ' + (item.organizer?.profile?.fullName ?? 'IntelliCore')),
    node('p', state(item.status) + (participant ? ' · ' + state(participant.response) : '')),
    upcoming && form([field('response', 'Your response', { options: [['ACCEPTED', 'Accept'], ['DECLINED', 'Decline']],
      value: participant?.response === 'DECLINED' ? 'DECLINED' : 'ACCEPTED' })], 'Save response',
    (data) => api.post(publishPath(item.id, 'respond'), data), refresh),
    upcoming && (linkReady ? joinControl(item) : node('p', 'Awaiting a confirmed meeting link.')));
}

function audienceChoices(context) {
  if (context.permissions.includes('meetings:manage_all')) return [
    ['ALL_ACTIVE_USERS', 'All active users'], ['STAFF', 'Staff'], ['INTERNS', 'Interns'], ['DEPARTMENT', 'Department'],
    ['SELECTED_USERS', 'Selected users']
  ];
  return [...(context.permissions.includes('meetings:manage_hr') ? [['INTERNS', 'Interns']] : []),
    ...(context.permissions.includes('meetings:manage_operations') ? [['STAFF', 'Staff']] : []), ['DEPARTMENT', 'Department']];
}

function meetingEditor(settings, item, label, submit, refresh) {
  const choice = audienceChoices(settings.context);
  const audience = field('audienceType', 'Audience', { options: choice, value: item?.audienceType ?? choice[0][0] });
  const department = field('departmentId', 'Department', { options: [['', 'Choose a department'],
    ...settings.departments.map(({ id, name }) => [id, name])], value: item?.departmentId });
  const people = node('select');
  people.name = 'selectedUserIds';
  people.multiple = true;
  people.size = 6;
  const selected = new Set(item?.selectedUserIds ?? []);
  for (const person of settings.people) {
    const option = node('option', person.profile?.fullName ?? 'Unnamed user');
    option.value = person.id;
    option.selected = selected.has(person.id);
    people.append(option);
  }
  const peopleLabel = node('label', 'Eligible people', people);
  const mode = field('creationMode', 'Conference source', {
    options: [['MANUAL', 'Existing Google Meet link'], ...(settings.calendar.connected && settings.calendar.writeAuthorized
      || item?.creationMode === 'GOOGLE_CALENDAR' ? [['GOOGLE_CALENDAR', 'Create via Google Calendar']] : [])],
    value: item?.creationMode ?? 'MANUAL' });
  const link = field('meetingUrl', 'Google Meet URL', { type: 'url', max: 255, value: item?.meetingUrl ?? '' });
  if (item?.status === 'SCHEDULED') mode.lastElementChild.disabled = true;
  const fields = [
    field('title', 'Meeting title', { value: item?.title, max: 160, required: true }),
    field('description', 'Agenda', { type: 'textarea', max: 4000, required: true, value: item?.description }),
    audience, department, peopleLabel,
    field('startAt', 'Start (India time)', { type: 'datetime-local', required: true, value: indiaInput(item?.startAt) }),
    field('duration', 'Duration (minutes)', { type: 'number', required: true,
      value: item ? Math.round((new Date(item.endAt) - new Date(item.startAt)) / 60000) : 30 }), mode, link
  ];
  const editor = form(fields, label, async (values) => {
    const startAt = newDate(values.startAt);
    const creationMode = values.creationMode ?? item.creationMode;
    const endAt = new Date(Date.parse(startAt) + Number(values.duration) * 60000).toISOString();
    await submit({ title: values.title, description: values.description, startAt, endAt, creationMode,
      audienceType: values.audienceType, departmentId: values.audienceType === 'DEPARTMENT' ? values.departmentId : null,
      selectedUserIds: values.audienceType === 'SELECTED_USERS' ? [...people.selectedOptions].map((option) => option.value) : [],
      meetingUrl: creationMode === 'MANUAL' ? values.meetingUrl : null });
  }, refresh);
  const duration = editor.elements.duration;
  duration.min = 1;
  duration.max = 1440;
  duration.step = 1;
  const update = () => {
    department.hidden = audience.lastElementChild.value !== 'DEPARTMENT';
    department.lastElementChild.required = !department.hidden;
    peopleLabel.hidden = audience.lastElementChild.value !== 'SELECTED_USERS';
    link.hidden = mode.lastElementChild.value !== 'MANUAL';
    link.lastElementChild.required = !link.hidden;
  };
  editor.addEventListener('change', update);
  update();
  return editor;
}

async function preview(item, data, root, refresh) {
  const payload = { ...data, expectedVersion: item.version };
  const confirmation = await api.post(publishPath(item.id, 'preview-audience'), payload);
  const { count, people, previewToken } = confirmation.data;
  const reschedule = item.status === 'SCHEDULED';
  const review = node('div', node('p', 'Eligible participants · ' + count),
    people.length ? node('ul', ...people.map((person) => node('li', person.profile?.fullName ?? 'Unnamed user'))) : null,
    count > people.length ? node('p', 'Showing the first ' + people.length + ' participants.') : null);
  if (count) review.append(form([], reschedule ? 'Confirm reschedule' : 'Schedule meeting', () =>
    api.post(publishPath(item.id, reschedule ? 'reschedule' : 'schedule'), reschedule
      ? { ...payload, previewToken } : { expectedVersion: item.version, previewToken }), refresh));
  root.replaceChildren(review);
}

function managed(item, settings, refresh) {
  const id = item.id;
  const canSchedule = item.status === 'DRAFT' || (item.status === 'SCHEDULED' && new Date(item.endAt) > new Date());
  const review = node('div');
  return record(item.title, node('p', item.description), node('p', timeText(item)),
    node('p', state(item.status) + ' · ' + state(item.audienceType)),
    item.creationMode === 'GOOGLE_CALENDAR' && node('p', 'Calendar synchronization · ' + state(item.providerSyncStatus)),
    item.status === 'SCHEDULED' && item.organizerId === settings.context.appUser.id &&
      new Date(item.endAt) > new Date() && ['NOT_REQUIRED', 'READY'].includes(item.providerSyncStatus) && joinControl(item),
    canSchedule && disclosure(item.status === 'DRAFT' ? 'Edit or schedule draft' : 'Reschedule meeting', async () => {
      const { data } = await api.get('/meetings/' + id);
      const confirm = item.status === 'DRAFT' ? form([], 'Preview audience', () => preview(data, {}, review, refresh)) : null;
      const editor = item.status === 'DRAFT' ? meetingEditor(settings, data, 'Save draft', (values) =>
        api.patch('/meetings/' + id, { ...values, expectedVersion: data.version }), refresh)
        : meetingEditor(settings, data, 'Preview rescheduled audience', (values) => preview(data, values, review, refresh));
      return [editor, confirm, review];
    }),
    item.status !== 'DRAFT' && disclosure('Participants', async () => {
      const root = node('div');
      const load = listing(root, publishPath(id, 'participants'), (person) =>
        record(person.user.profile?.fullName ?? 'Unnamed user', node('p', state(person.response))));
      await load();
      return [root];
    }),
    ['DRAFT', 'SCHEDULED'].includes(item.status) && disclosure('Cancel meeting', async () => [
      form([field('reason', 'Cancellation reason', { max: 500, required: true })], 'Confirm cancellation',
        ({ reason }) => api.post(publishPath(id, 'cancel'), { expectedVersion: item.version, reason }), refresh)
    ]),
    item.status === 'SCHEDULED' && new Date(item.endAt) <= new Date() &&
      form([], 'Mark meeting completed', () => api.post(publishPath(id, 'complete'), { expectedVersion: item.version }), refresh),
    ['FAILED', 'SYNC_REQUIRED'].includes(item.providerSyncStatus) &&
      form([], 'Retry Calendar synchronization', () => api.post(publishPath(id, 'retry-sync'), { expectedVersion: item.version }), refresh));
}

function calendarControls(panel, status, onUpdate) {
  if (!status.available) return;
  const container = node('div');
  const text = status.connected ? 'Calendar connected' : 'Calendar connection available';
  container.append(node('p', text + (status.writeAuthorized ? '' : ' · Event creation disabled')));
  if (status.connected) {
    container.append(form([], 'Disconnect Calendar', async () => {
      const { data } = await api.post('/calendar/disconnect', {});
      if (data.providerRevoked === false) throw new Error('Local access was removed. Revoke IntelliCore at Google Account to finish disconnecting.');
    }, onUpdate));
  } else {
    container.append(form([], 'Authorize Google Calendar', async () => {
      const { data } = await api.post('/calendar/connect', {});
      window.location.assign(data.consentUrl);
    }));
  }
  panel.append(container);
}

export async function mountMeetings(root, context) {
  const panel = section(root, 'phase08Meetings', 'Meetings');
  const own = node('div', node('h4', 'My meetings'));
  panel.append(own);
  const refreshOwn = listing(own, '/meetings/me', (row) => incoming(row, refreshOwn), {
    states: states.filter((value) => value !== 'DRAFT'), filters: [
      field('upcoming', 'Date range', { options: [['', 'Upcoming and history'], ['true', 'Upcoming']] })
    ] });
  void refreshOwn();
  if (!managerPermissions.some((value) => context.permissions.includes(value))) return;
  const group = node('div', node('p', 'Loading meeting controls…'));
  panel.append(group);
  async function load() {
    const scopedLeader = context.permissions.includes('meetings:manage_department')
      && !managerPermissions.slice(0, 3).some((value) => context.permissions.includes(value));
    const [departments, people, calendar] = await Promise.all([
      allItems('/departments' + (scopedLeader ? '?assigned=true' : '')),
      context.permissions.includes('meetings:manage_all') ? allItems('/meetings/eligible-users') : [],
      api.get('/calendar/connection').then(({ data }) => data)
    ]);
    const controls = node('div', node('h4', 'Manage meetings'));
    const settings = { context, departments, people, calendar };
    const changed = () => Promise.all([refreshDirectory(), refreshOwn()]);
    calendarControls(controls, calendar, load);
    controls.append(disclosure('Create meeting', async () => [
      meetingEditor(settings, null, 'Create draft', (values) => api.post('/meetings', values), changed)
    ]));
    const directory = node('div');
    controls.append(directory);
    const refreshDirectory = listing(directory, '/meetings', (row) => managed(row, settings, changed), { states });
    group.replaceChildren(controls);
    await refreshDirectory();
  }
  try { await load(); } catch (error) { group.replaceChildren(node('p', error.message)); }
}
