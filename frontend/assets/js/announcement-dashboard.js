import { api } from '/services/api.js';
import { allItems, button, check, disclosure, field, form, fromIstField, inIndia, istFieldValue,
  label, listing, node, record, section } from './work-controls.js';

const states = ['DRAFT', 'SCHEDULED', 'PUBLISHED', 'CANCELLED', 'ARCHIVED'];
const policy = {
  'announcements:manage_all': ['ALL_ACTIVE_USERS', 'STAFF', 'INTERNS', 'DEPARTMENT', 'SELECTED_USERS'],
  'announcements:manage_interns': ['INTERNS', 'DEPARTMENT'],
  'announcements:manage_operations': ['STAFF', 'DEPARTMENT'],
  'announcements:manage_department': ['DEPARTMENT']
};
const labels = { ALL_ACTIVE_USERS: 'All active users', STAFF: 'Staff', INTERNS: 'Active interns',
  DEPARTMENT: 'Department', SELECTED_USERS: 'Selected users' };

function noticeForm(context, departments, people, kinds, item, refresh) {
  const path = item ? '/announcements/' + item.id : '/announcements';
  const audience = field('audienceType', 'Audience', { value: item?.audienceType ?? kinds[0], options: kinds.map((kind) => [kind, labels[kind]]) });
  const dept = field('departmentId', 'Department', { value: item?.departmentId, options: [['', 'Select department'],
    ...departments.map((d) => [d.id, d.name])] });
  const selected = node('fieldset', node('legend', 'Recipients'));
  selected.className = 'phase07-audience';
  for (const user of people) {
    selected.append(check('person-' + user.id, user.profile?.fullName || 'Active user', item?.selectedUsers?.includes(user.id)));
  }
  const element = form([
    field('title', 'Announcement title', { required: true, max: 160, value: item?.title }),
    field('message', 'Announcement message', { type: 'textarea', required: true, max: 5000, value: item?.message }),
    audience, dept, selected,
    field('expiresAt', 'Expires (IST, optional)', { type: 'datetime-local',
      value: item?.expiresAt ? istFieldValue(item.expiresAt) : '' })
  ], item ? 'Save announcement' : 'Create announcement draft', (data) => {
    const type = data.audienceType;
    const payload = { title: data.title, message: data.message, audienceType: type,
      departmentId: type === 'DEPARTMENT' ? data.departmentId : null,
      selectedUsers: type === 'SELECTED_USERS' ? people.filter(({ id }) => data['person-' + id] === 'yes').map(({ id }) => id) : [],
      expiresAt: data.expiresAt ? (item?.expiresAt && data.expiresAt === istFieldValue(item.expiresAt)
        ? item.expiresAt : fromIstField(data.expiresAt)) : null };
    if (item) return api.patch(path, { ...payload, expectedRevision: item.revision });
    return api.post(path, payload);
  }, refresh);
  const scope = audience.querySelector('select');
  function show() {
    dept.hidden = scope.value !== 'DEPARTMENT';
    selected.hidden = scope.value !== 'SELECTED_USERS';
    dept.querySelector('select').required = !dept.hidden;
  }
  scope.addEventListener('change', show);
  show();
  return element;
}

function publication(item, refresh) {
  const path = '/announcements/' + item.id;
  const area = node('div');
  area.setAttribute('aria-live', 'polite');
  const preview = form([], 'Preview audience', async () => {
    const { data } = await api.post(path + '/preview-audience', {});
    const body = { expectedRevision: data.revision, previewToken: data.previewToken };
    area.replaceChildren(node('p', data.count + ' eligible recipients'), ...(data.count ? [
      form([check('confirm', 'Confirm publication to this audience', false, true)], 'Publish announcement',
        () => api.post(path + '/publish', body), refresh),
      form([field('scheduledAt', 'Publication time (IST)', { type: 'datetime-local', required: true }),
        check('confirm', 'Confirm scheduled publication', false, true)], 'Schedule announcement',
      ({ scheduledAt }) => api.post(path + '/schedule', { ...body, scheduledAt: fromIstField(scheduledAt) }), refresh)
    ] : []));
  });
  return [preview, area];
}

export async function mountAnnouncements(root, context, refreshNotifications) {
  const received = section(root, 'phase07Announcements', 'Announcements');
  listing(received, '/announcements/me', (item) => record(item.title, node('p', item.message),
    node('small', 'Published ' + inIndia(item.publishedAt))));
  const kinds = [...new Set(context.permissions.flatMap((perm) => policy[perm] ?? []))];
  if (!kinds.length) return;
  const wrapper = section(root, 'phase07ManageAnnouncements', 'Manage announcements');
  const status = node('p', 'Loading audience options…');
  status.setAttribute('role', 'status');
  wrapper.append(status);
  try {
    const onlyDepartment = context.roles.includes('TEAM_LEADER') && kinds.length === 1 && kinds[0] === 'DEPARTMENT';
    const departments = await allItems('/departments' + (onlyDepartment ? '?assigned=true' : ''));
    const getPeople = () => kinds.includes('SELECTED_USERS') ? allItems('/announcements/eligible-recipients') : [];
    status.textContent = '';
    const results = node('div');
    const refresh = () => {
      status.textContent = 'Announcements updated.';
      return Promise.all([refreshList(), refreshNotifications()]);
    };
    wrapper.append(disclosure('Create announcement', async () => [noticeForm(context, departments, await getPeople(), kinds, null, refresh)]), results);
    const refreshList = listing(results, '/announcements', (row) => record(row.title,
      node('p', label(row.status) + ' · ' + labels[row.audienceType]),
      row.scheduledAt ? node('p', 'Scheduled ' + inIndia(row.scheduledAt)) : null,
      row.status === 'PUBLISHED' ? node('p', row._count.recipients + ' recipients · Published ' + inIndia(row.publishedAt)) : null,
      disclosure('Announcement details', async () => {
        const { data: item } = await api.get('/announcements/' + row.id);
        const action = ['DRAFT', 'SCHEDULED'].includes(row.status) ? 'cancel' : row.status !== 'ARCHIVED' ? 'archive' : null;
        return [node('p', item.message), ...(item.status === 'DRAFT' ? [
          disclosure('Edit announcement draft', async () => [noticeForm(context, departments, await getPeople(), kinds, item, refresh)]),
          disclosure('Publish or schedule', async () => publication(item, refresh))
        ] : []), ...(action ? [disclosure(action === 'cancel' ? 'Cancel draft or schedule' : 'Archive announcement', async () => [
          form([check('confirm', 'Confirm ' + action, false, true)], action === 'cancel' ? 'Cancel announcement' : 'Archive announcement',
            () => api.post('/announcements/' + item.id + '/' + action, { confirm: true }), refresh)
        ])] : [])];
      })), { states });
  } catch (error) {
    status.textContent = error.message;
  }
}
