import { api } from '/services/api.js';

const applicationStates = ['DRAFT', 'PENDING_APPROVAL', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED', 'WITHDRAWN'];
const internshipStates = ['APPROVED', 'ONGOING', 'COMPLETION_REVIEW', 'COMPLETED', 'TERMINATED', 'WITHDRAWN'];
const labelState = (state) => state.toLowerCase().replaceAll('_', ' ');
const date = (value) => value?.slice(0, 10) ?? '';

export function node(tag, ...children) {
  const element = document.createElement(tag);
  element.append(...children.filter((child) => child !== null && child !== undefined && typeof child !== 'boolean'));
  return element;
}

export function field(name, label, { value = '', options, type = 'text', max, required = false } = {}) {
  const control = node(options ? 'select' : type === 'textarea' ? 'textarea' : 'input');
  if (options) {
    for (const [optionValue, optionLabel] of options) {
      const option = node('option', optionLabel);
      option.value = optionValue;
      control.append(option);
    }
  } else if (type !== 'textarea') {
    control.type = type;
  }
  control.name = name;
  control.value = value ?? '';
  control.required = required;
  if (max) control.maxLength = max;
  return node('label', label, control);
}

export function button(label, action) {
  const control = node('button', label);
  control.type = action ? 'button' : 'submit';
  if (action) control.addEventListener('click', action);
  return control;
}

export function form(fields, label, submit, onChanged) {
  const enabled = button(label);
  const status = node('p');
  status.setAttribute('role', 'status');
  const element = node('form', ...fields, enabled, status);
  element.className = 'phase04-form';
  element.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (enabled.disabled) return;
    enabled.disabled = true;
    status.textContent = 'Saving…';
    try {
      await submit(Object.fromEntries(new FormData(element)));
      status.textContent = 'Saved.';
      await onChanged?.();
    } catch (error) {
      status.textContent = error.message || 'The change could not be saved.';
    } finally {
      enabled.disabled = false;
    }
  });
  return element;
}

export function disclosure(title, load) {
  const body = node('div');
  const details = node('details', node('summary', title), body);
  details.addEventListener('toggle', async () => {
    if (!details.open || body.childNodes.length) return;
    body.append('Loading…');
    try {
      const content = await load();
      body.replaceChildren(...content);
    } catch (error) {
      body.replaceChildren(node('p', error.message), button('Retry', () => {
        body.replaceChildren();
        details.dispatchEvent(new Event('toggle'));
      }));
    }
  });
  return details;
}

export async function allItems(path, itemKey = 'items') {
  const items = [];
  for (let page = 1; ; page += 1) {
    const separator = path.includes('?') ? '&' : '?';
    const { data } = await api.get(`${path}${separator}page=${page}&limit=100`);
    items.push(...data[itemKey]);
    if (page >= data.pagination.totalPages) return items;
  }
}

export function section(root, id, title) {
  const element = node('section', node('h3', title));
  element.id = id;
  element.className = 'phase04-section';
  root.append(element);
  return element;
}

export function listing(root, path, render, { states, initialStatus = '', filters = [] } = {}) {
  const search = field('search', 'Search', { type: 'search', max: 120 });
  const status = states && field('status', 'Status', {
    value: initialStatus, options: [['', 'All statuses'], ...states.map((state) => [state, labelState(state)])]
  });
  const toolbar = node('form', search, status, ...filters, button('Filter'));
  toolbar.className = 'phase04-filters';
  const results = node('div');
  const feedback = node('p');
  feedback.setAttribute('role', 'status');
  let page = 1;
  let revision = 0;
  let query = new FormData(toolbar);
  const previous = button('Previous', () => { page -= 1; void refresh(); });
  const next = button('Next', () => { page += 1; void refresh(); });
  previous.disabled = true;
  next.disabled = true;
  root.append(toolbar, feedback, results, node('div', previous, next));
  toolbar.addEventListener('submit', (event) => {
    event.preventDefault();
    query = new FormData(toolbar);
    page = 1;
    void refresh();
  });

  async function refresh() {
    const version = ++revision;
    const params = new URLSearchParams([...query].filter(([, value]) => value));
    params.set('page', page);
    params.set('limit', '10');
    previous.disabled = true;
    next.disabled = true;
    feedback.textContent = 'Loading…';
    try {
      const { data } = await api.get(`${path}${path.includes('?') ? '&' : '?'}${params}`);
      if (version !== revision) return;
      if (!data.items.length && page > 1) {
        page = Math.max(1, data.pagination.totalPages);
        return refresh();
      }
      feedback.textContent = data.pagination.total
        ? `${data.pagination.total} ${data.pagination.unit || 'records'} · Page ${page} of ${data.pagination.totalPages}`
        : 'No matching records.';
      results.replaceChildren(...data.items.map(render));
      previous.disabled = page <= 1;
      next.disabled = page >= data.pagination.totalPages;
    } catch (error) {
      if (version !== revision) return;
      feedback.textContent = error.message;
      results.replaceChildren();
    }
  }
  return refresh;
}

export function record(title, ...children) {
  const article = node('article', node('h4', title), ...children);
  article.className = 'phase04-record';
  return article;
}

function departmentFields(item = {}) {
  return [
    field('name', 'Name', { value: item.name, max: 100, required: true }),
    field('code', 'Code', { value: item.code, max: 50, required: true }),
    field('slug', 'URL slug', { value: item.slug, max: 100, required: true }),
    field('description', 'Description', { value: item.description, max: 255 })
  ];
}

async function assignmentForms(department, refresh) {
  const path = `/departments/${department.id}/staff`;
  const [members, staff] = await Promise.all([allItems(path), allItems('/staff?status=ACTIVE', 'staff')]);
  const assignments = node('ul', ...members.map((member) => node('li',
    `${member.user.profile?.fullName || member.user.staffProfile?.staffCode || 'Staff member'} · ${labelState(member.assignedRole)} · ${member.isActive ? 'active' : 'inactive'}`,
    member.isActive ? form([], 'End assignment', () => api.put(path, {
      userId: member.user.id, assignedRole: member.assignedRole, isActive: false
    }), refresh) : null
  )));
  return [
    members.length ? assignments : node('p', 'No staff assignments.'),
    ...(department.isActive ? [form([
      field('userId', 'Staff member', {
        options: [['', 'Select staff'], ...staff.map((item) => [item.user.id, `${item.user.fullName} · ${item.staffCode}`])], required: true
      }),
      field('assignedRole', 'Assignment', { value: 'STAFF', options: [['STAFF', 'Staff'], ['TEAM_LEADER', 'Team Leader']] })
    ], 'Save assignment', (data) => api.put(path, { ...data, isActive: true }), refresh)] : [])
  ];
}

function applicantForm(item, departments, refresh) {
  const text = (name, label, max, required = false, type = 'text') =>
    field(name, label, { value: item[name], max, required, type });
  const selected = departments.some(({ id }) => id === item.department?.id) ? item.department.id : '';
  return form([
    field('departmentId', 'Department', { value: selected, options: [['', 'Select department'], ...departments.map(({ id, name }) => [id, name])], required: true }),
    field('requestedStartDate', 'Requested start', { type: 'date', required: true, value: date(item.requestedStartDate) }),
    field('durationMonths', 'Duration', {
      value: item.requestedDuration?.match(/^\s*(1|2|3|6)\b/)?.[1] || '1',
      options: [1, 2, 3, 6].map((months) => [String(months), `${months} month${months === 1 ? '' : 's'}`])
    }),
    text('qualification', 'Qualification', 150, true), text('institution', 'Institution', 150, true),
    text('course', 'Course', 150), text('specialization', 'Specialization', 150),
    text('graduationYear', 'Graduation year', undefined, false, 'number'),
    text('skills', 'Skills', 2000, false, 'textarea'), text('motivation', 'Motivation', 4000, false, 'textarea'),
    text('contactNumber', 'Contact number', 20, false, 'tel')
  ], 'Save draft', (input) => {
    const data = Object.fromEntries(Object.entries(input).map(([key, value]) => [key, value.trim() || null]));
    data.durationMonths = Number(input.durationMonths);
    data.graduationYear = data.graduationYear ? Number(data.graduationYear) : null;
    return item.id ? api.patch(`/internship-applications/${item.id}`, data) : api.post('/internship-applications', data);
  }, refresh);
}

function teamLeaderField() {
  return field('assignedTeamLeaderId', 'Team Leader', { options: [['', 'Unassigned']] });
}

async function loadTeamLeaders(departmentId, fieldLabel, value) {
  const select = fieldLabel.querySelector('select');
  select.dataset.value = departmentId;
  select.disabled = true;
  select.replaceChildren(new Option('Loading Team Leaders…', ''));
  try {
    const members = departmentId ? await allItems(`/departments/${departmentId}/staff?leadersOnly=true`) : [];
    if (select.dataset.value !== departmentId) return;
    select.replaceChildren(new Option('Unassigned', ''), ...members.map(({ user }) =>
      new Option(user.profile?.fullName || user.staffProfile?.staffCode || 'Team Leader', user.id)));
    if (value && members.some(({ user }) => user.id === value)) select.value = value;
    select.disabled = false;
  } catch (error) {
    if (select.dataset.value !== departmentId) return;
    select.replaceChildren(new Option(error.message, ''));
    select.disabled = true;
  }
}

async function applicationApproval(item, refresh) {
  const departments = await allItems('/departments');
  const selected = departments.some(({ id }) => id === item.department.id) ? item.department.id : '';
  const department = field('departmentId', 'Department', { value: selected,
    options: [['', 'Select department'], ...departments.map(({ id, name }) => [id, name])], required: true });
  const leader = teamLeaderField();
  const selector = department.querySelector('select');
  selector.addEventListener('change', () => { void loadTeamLeaders(selector.value, leader); });
  await loadTeamLeaders(selected, leader);
  return form([
    department, leader, field('positionTitle', 'Internship title', { max: 100, required: true }),
    field('commencementDate', 'Commencement', { type: 'date', value: date(item.requestedStartDate), required: true }),
    field('expectedCompletionDate', 'Expected completion (blank uses requested duration)', { type: 'date' }),
    field('remarks', 'Approval notes', { type: 'textarea', max: 2000 })
  ], 'Approve and enroll', (data) => api.post(`/internship-applications/${item.id}/approve`, {
    ...data, expectedCompletionDate: data.expectedCompletionDate || undefined,
    assignedTeamLeaderId: data.assignedTeamLeaderId || null, remarks: data.remarks || null
  }), refresh);
}

function applicationRecord(item, { own, review, refresh }) {
  const path = `/internship-applications/${item.id}`;
  const editable = ['DRAFT', 'CHANGES_REQUESTED'].includes(item.applicationStatus);
  const reviewable = item.applicationStatus === 'PENDING_APPROVAL';
  const duration = /^\d+$/.test(item.requestedDuration) ? `${item.requestedDuration} months` : item.requestedDuration;
  return record(own ? item.department.name : item.applicantUser.profile?.fullName || 'Applicant',
    node('p', `${labelState(item.applicationStatus)} · ${item.department.name} · ${date(item.requestedStartDate)} · ${duration}`),
    item.reviewRemarks ? node('p', item.reviewRemarks) : null,
    disclosure('Application details', async () => [
      node('dl', ...[
        ['Qualification', item.qualification], ['Institution', item.institution], ['Course', item.course],
        ['Specialization', item.specialization], ['Graduation year', item.graduationYear], ['Skills', item.skills],
        ['Motivation', item.motivation], ['Contact number', item.contactNumber]
      ].filter(([, value]) => value).flatMap(([label, value]) => [node('dt', label), node('dd', String(value))])),
      own && editable ? applicantForm(item, await allItems('/departments'), refresh) : null
    ].filter(Boolean)),
    own && editable ? form([], 'Submit for review', () => api.post(`${path}/submit`, {}), refresh) : null,
    own && (editable || reviewable) ? disclosure('Withdraw application', async () => [
      form([], 'Confirm withdrawal', () => api.post(`${path}/withdraw`, {}), refresh)
    ]) : null,
    review && reviewable ? disclosure('Approve', async () => [await applicationApproval(item, refresh)]) : null,
    review && reviewable ? disclosure('Request changes or reject', async () =>
      [['request-changes', 'Request changes'], ['reject', 'Reject application']].map(([action, label]) =>
        form([field('remarks', 'Review comments', { type: 'textarea', max: 2000, required: true })], label,
          (data) => api.post(`${path}/${action}`, data), refresh))) : null
  );
}

function enrollmentRecord(item, { manager, own, refresh }) {
  const path = `/internships/${item.id}`;
  const state = item.internshipStatus;
  const isOpen = internshipStates.slice(0, 3).includes(state);
  return record(own ? item.positionTitle : item.user.profile?.fullName || item.positionTitle,
    node('p', `${item.internshipCode} · ${item.department.name} · ${labelState(state)}`),
    node('p', `${date(item.commencementDate)} to ${date(item.expectedCompletionDate)} · ${item.workMode}`),
    node('p', `Team Leader: ${item.assignedTeamLeader?.profile?.fullName || 'Unassigned'}`),
    item.actualCompletionDate ? node('p', `Completed on ${date(item.actualCompletionDate)}`) : null,
    manager && isOpen ? disclosure('Manage internship', async () => {
      const leader = teamLeaderField();
      await loadTeamLeaders(item.department.id, leader, item.assignedTeamLeaderId);
      return [
        state !== 'COMPLETION_REVIEW' ? form([
          field('positionTitle', 'Internship title', { value: item.positionTitle, max: 100, required: true }),
          ...(state === 'APPROVED' ? [field('commencementDate', 'Commencement', { type: 'date', value: date(item.commencementDate), required: true })] : []),
          field('expectedCompletionDate', 'Expected completion', { type: 'date', value: date(item.expectedCompletionDate), required: true })
        ], 'Save details', (data) => api.patch(path, data), refresh) : null,
        form([leader], 'Save Team Leader', (data) => api.put(`${path}/team-leader`, { assignedTeamLeaderId: data.assignedTeamLeaderId || null }), refresh),
        form([field('reason', 'Reason', { type: 'textarea', required: true, max: 2000 })],
          'Terminate internship', (data) => api.post(`${path}/terminate`, data), refresh)
      ].filter(Boolean);
    }) : null,
    (manager || own) && state === 'COMPLETION_REVIEW' && !item.completionRequested ? form([], 'Request completion review',
      () => api.post(`${path}/request-completion`, {}), refresh) : null,
    manager && state === 'COMPLETION_REVIEW' ? disclosure('Approve completion', async () => [
      form([field('actualCompletionDate', 'Actual completion', { type: 'date', value: date(item.expectedCompletionDate), required: true })],
        'Approve completion', (data) => api.post(`${path}/approve-completion`, data), refresh)
    ]) : null,
    (own || manager) && isOpen ? disclosure('Withdraw enrollment', async () => [
      form([field('reason', 'Reason', { type: 'textarea', required: true, max: 2000 })],
        'Confirm withdrawal', (data) => api.post(`${path}/withdraw`, data), refresh)
    ]) : null
  );
}

export async function loadEnrollmentCounts(totalId, ongoingId) {
  try {
    const [total, ongoing] = await Promise.all([
      api.get('/internships?limit=1'), api.get('/internships?status=ONGOING&limit=1')
    ]);
    document.getElementById(totalId).textContent = total.data.pagination.total;
    document.getElementById(ongoingId).textContent = ongoing.data.pagination.total;
  } catch {
    document.getElementById(totalId).textContent = '—';
    document.getElementById(ongoingId).textContent = '—';
  }
}

export function mountPhase04(root, context, mode, onChanged) {
  root.classList.add('phase04');
  root.replaceChildren();
  const refreshers = [];
  const refresh = () => Promise.all([...refreshers.map((load) => load()), onChanged?.()]);
  const { roles, permissions, appUser, status } = context;
  const own = mode === 'intern';
  const leader = mode === 'leader';
  const review = ['FOUNDER', 'CO_FOUNDER', 'HR_MANAGER'].some((role) => roles.includes(role));
  const manager = review && permissions.includes('internships:manage') && !own && !leader;
  const departmentFilter = () => {
    const label = field('departmentId', 'Department', { options: [['', 'All departments']] });
    const picker = label.querySelector('select');
    const endpoint = leader && roles.includes('TEAM_LEADER') ? '/departments?assigned=true' : '/departments';
    allItems(endpoint).then((items) => {
      picker.append(...items.map(({ id, name }) => new Option(name, id)));
    }).catch(() => {});
    return label;
  };

  if (mode === 'founder' && permissions.includes('departments:create')) {
    const departments = section(root, 'phase04Departments', 'Departments');
    departments.append(disclosure('Create department', async () => [
      form(departmentFields(), 'Create department', (data) => api.post('/departments', data), refresh)
    ]));
    refreshers.push(listing(departments, '/departments?includeInactive=true', (item) => record(item.name,
      node('p', `${item.code} · ${item.isActive ? 'Active' : 'Inactive'}`), item.description ? node('p', item.description) : null,
      disclosure('Edit department', async () => [
        form(departmentFields(item), 'Save department', (data) => api.patch(`/departments/${item.id}`, data), refresh),
        form([], item.isActive ? 'Deactivate department' : 'Reactivate department',
          () => api.patch(`/departments/${item.id}/status`, { isActive: !item.isActive }), refresh)
      ]),
      disclosure('Staff assignments', () => assignmentForms(item, refresh))
    )));
  }
  if (leader && roles.includes('TEAM_LEADER')) {
    const departments = section(root, 'phase04Departments', 'Assigned departments');
    refreshers.push(listing(departments, '/departments?assigned=true', (item) => record(item.name, node('p', item.code))));
  }
  if (own) {
    const profile = section(root, 'phase04Profile', 'My profile');
    profile.append(form([
      field('fullName', 'Full name', { value: appUser.profile?.fullName, max: 150, required: true }),
      field('displayName', 'Preferred name', { value: appUser.profile?.displayName, max: 100 })
    ], 'Save profile', (data) => api.patch('/users/me/profile', { ...data, displayName: data.displayName || null })));
  }
  if (own || (!leader && permissions.includes('applications:read_all'))) {
    const applications = section(root, 'phase04Applications', own ? 'My applications' : 'Internship applications');
    if (own && roles.length === 1 && roles.includes('INTERN')) {
      applications.append(disclosure('Start application', async () => [applicantForm({}, await allItems('/departments'), refresh)]));
    }
    refreshers.push(listing(applications, own ? '/internship-applications/me' : '/internship-applications',
      (item) => applicationRecord(item, { own, review: !own && review && permissions.includes('applications:review'), refresh }),
      { states: applicationStates, initialStatus: own ? '' : 'PENDING_APPROVAL', filters: own ? [] : [departmentFilter()] }));
  }
  const internships = section(root, 'phase04Internships', own ? 'My internships' : leader ? 'Department internships' : 'Internship enrollments');
  refreshers.push(listing(internships, own ? '/internships/me' : '/internships',
    (item) => enrollmentRecord(item, { manager, own: own && status === 'ACTIVE', refresh }),
    { states: internshipStates, filters: own ? [] : [departmentFilter(),
      field('commencementFrom', 'Starts on or after', { type: 'date' }),
      field('completionThrough', 'Ends on or before', { type: 'date' })] }));
  void refresh();
}
