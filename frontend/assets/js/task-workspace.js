
import { api } from '/services/api.js';
import { allItems, asLines, button, check, confirmed, departmentFilter, departmentSelect, disclosure, field,
  files, form, fromIstField, inIndia, internName, istFieldValue, label, link, listing, node,
  numeric, pairLines, record, section, uploadForm } from './work-controls.js';

const priorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const taskStatuses = ['DRAFT', 'PUBLISHED', 'CLOSED', 'CANCELLED', 'ARCHIVED'];
const assignmentStatuses = ['ASSIGNED', 'IN_PROGRESS', 'SUBMITTED', 'REVISION_REQUESTED', 'COMPLETED', 'CANCELLED'];
const choices = (list) => list.map((value) => [value, label(value)]);
const supports = (context, name) => context.permissions.includes(name + '_all') || context.permissions.includes(name + '_department');
const taskPath = (task) => '/tasks/' + task.id;
const assignmentPath = (row) => '/task-assignments/' + row.id;
const submissionPath = (row) => '/task-submissions/' + row.id;

function taskFields(task = {}, edit = false) {
  const now = Date.now();
  return [
    field('title', 'Task title', { value: task.title, max: 180, required: true }),
    field('description', 'Description', { type: 'textarea', value: task.description, max: 8000 }),
    field('instructions', 'Instructions', { type: 'textarea', value: task.instructions, required: true, max: 8000 }),
    field('deliverables', 'Expected deliverables', { type: 'textarea', value: task.deliverables, required: true, max: 8000 }),
    !edit || task.status === 'DRAFT' ? field('taskType', 'Assignment type', {
      value: task.taskType || 'INDIVIDUAL', options: [['INDIVIDUAL', 'Select one or more interns'], ['DEPARTMENT', 'All eligible department interns']]
    }) : null,
    field('priority', 'Priority', { value: task.priority || 'MEDIUM', options: choices(priorities) }),
    !edit || task.status === 'DRAFT' ? field('availableFrom', 'Available from (IST)', {
      type: 'datetime-local', value: istFieldValue(task.availableFrom ?? now - 60000), required: true
    }) : null,
    field('dueAt', 'Deadline (IST)', { type: 'datetime-local',
      value: istFieldValue(task.dueAt ?? now + 604800000), required: true }),
    numeric('maximumScore', 'Maximum score (optional)', task.maximumScore ?? ''),
    field('rubric', 'Rubric · criterion | points, one per line', {
      type: 'textarea', value: asLines(task.rubric, 'criterion', 'points'), max: 2800
    }),
    field('resources', 'Reference links · title | URL, one per line', {
      type: 'textarea', value: asLines(task.resources, 'title', 'url'), max: 16000
    })
  ].filter(Boolean);
}

function taskValues(input) {
  const { maximumScore, rubric, resources, availableFrom, dueAt, ...values } = input;
  return { ...values, maximumScore: maximumScore ? Number(maximumScore) : null,
    rubric: pairLines(rubric, 'criterion', 'points').map(({ criterion, points }) => ({ criterion, points: Number(points) })),
    resources: pairLines(resources, 'title', 'url'),
    ...(availableFrom ? { availableFrom: fromIstField(availableFrom) } : {}), dueAt: fromIstField(dueAt) };
}

function createTaskForm(departments, refresh) {
  const department = departmentSelect(departments);
  const template = field('templateKey', 'Recovered exercise', { options: [['', 'Start with a blank draft']] });
  const select = template.querySelector('select');
  let records = [];
  const notice = node('p');
  notice.setAttribute('role', 'status');
  const element = form([department, template, notice, ...taskFields()], 'Create task draft', async (input) => {
    const { templateKey, ...values } = input;
    await api.post('/tasks', { ...taskValues(values), ...(templateKey ? { templateKey } : {}) });
  }, refresh);
  department.querySelector('select').addEventListener('change', async (event) => {
    const id = event.target.value;
    records = [];
    select.replaceChildren(new Option('Start with a blank draft', ''));
    notice.textContent = '';
    if (!id) return;
    try {
      const { data } = await api.get('/tasks/templates?departmentId=' + id);
      if (event.target.value !== id) return;
      records = data;
      select.append(...data.map((item) => new Option(item.title, item.templateKey)));
    } catch (error) {
      notice.textContent = error.message;
    }
  });
  select.addEventListener('change', () => {
    const content = records.find((item) => item.templateKey === select.value);
    if (!content) return;
    for (const name of ['title', 'instructions', 'deliverables', 'maximumScore']) element.elements.namedItem(name).value = content[name];
    element.elements.namedItem('rubric').value = asLines(content.rubric, 'criterion', 'points');
    notice.textContent = 'The recovered exercise and rubric will be copied into the draft.';
  });
  return element;
}

function taskContent(task, deleteOptions = null) {
  return [
    task.description ? node('p', task.description) : null,
    task.instructions ? node('div', node('strong', 'Instructions'), node('p', task.instructions)) : null,
    task.deliverables ? node('div', node('strong', 'Expected deliverables'), node('p', task.deliverables)) : null,
    task.rubric?.length ? node('ul', ...task.rubric.map((row) => node('li', row.criterion + ' · ' + row.points + ' points'))) : null,
    task.resources?.length ? node('ul', ...task.resources.map((row) => node('li', link(row.url, row.title)))) : null,
    files(task.attachments, deleteOptions)
  ].filter(Boolean);
}

async function assignmentForm(task, publish, refresh) {
  const departmentWide = publish && task.taskType === 'DEPARTMENT';
  const candidates = departmentWide ? [] : await allItems('/tasks/eligible-recipients?departmentId=' + task.departmentId);
  const roster = node('fieldset', node('legend', 'Eligible interns'));
  roster.className = 'phase06-choices';
  const selected = [];
  for (const intern of candidates) {
    const choice = check(intern.id, internName(intern) + ' · ' + intern.internshipCode);
    const deadline = field('deadline-' + intern.id, 'Individual extension (IST)', { type: 'datetime-local' });
    deadline.hidden = true;
    choice.querySelector('input').addEventListener('change', (event) => { deadline.hidden = !event.target.checked; });
    roster.append(node('div', choice, deadline));
    selected.push(intern.id);
  }
  if (!candidates.length && !departmentWide) roster.append(node('p', 'No currently eligible interns in this department.'));
  const preview = node('div');
  preview.setAttribute('aria-live', 'polite');
  const previewForm = form([
    departmentWide ? node('p', 'Publication assigns the task to every currently eligible intern in this department.') : roster
  ], 'Preview recipients', async (input) => {
    const recipients = selected.filter((id) => input[id] === 'yes').map((internshipId) => ({
      internshipId, ...(input['deadline-' + internshipId] ? { dueAt: fromIstField(input['deadline-' + internshipId]) } : {})
    }));
    const { data } = await api.post(taskPath(task) + '/preview', { recipients });
    const confirmation = form([
      check('publish', publish ? 'Confirm publication and the eligible recipient set' : 'Confirm these additional recipients', false, true)
    ], publish ? 'Publish task' : 'Assign selected interns',
    () => api.post(taskPath(task) + (publish ? '/publish' : '/assignments'), {
      recipients, expectedRevision: data.revision, previewToken: data.previewToken, confirmActiveChange: true
    }), refresh);
    preview.replaceChildren(node('p', data.items.length + ' eligible recipients'), node('ul', ...data.items.map(({ internship, dueAt }) =>
      node('li', internName(internship) + ' · due ' + inIndia(dueAt ?? task.dueAt)))), confirmation);
  });
  previewForm.addEventListener('change', () => preview.replaceChildren());
  return [previewForm, preview];
}

function taskAdmin(task, refresh) {
  const path = taskPath(task);
  const editable = ['DRAFT', 'PUBLISHED'].includes(task.status);
  const actions = {
    DRAFT: [['cancel', 'Cancel draft']],
    PUBLISHED: [['close', 'Close task'], ['cancel', 'Cancel task']],
    CLOSED: [['archive', 'Archive task']],
    CANCELLED: [['archive', 'Archive task']]
  };
  return [
    editable ? disclosure('Edit task', async () => [
      form([...taskFields(task, true), task.status === 'PUBLISHED'
        ? check('confirmActiveChange', 'Confirm changes affecting active assignments', false, true) : null],
      'Save task changes', ({ confirmActiveChange, ...input }) => {
        const values = taskValues(input);
        if (input.dueAt === istFieldValue(task.dueAt)) delete values.dueAt;
        return api.patch(path, { ...values, expectedRevision: task.revision, confirmActiveChange: confirmActiveChange === 'yes' });
      }, refresh)
    ]) : null,
    task.status === 'DRAFT' ? uploadForm(path + '/attachments', task.revision, refresh) : null,
    editable ? disclosure(task.status === 'DRAFT' ? 'Choose recipients and publish' : 'Assign additional interns',
      () => assignmentForm(task, task.status === 'DRAFT', refresh)) : null,
    ...(actions[task.status] ?? []).map(([action, text]) => disclosure(text, async () => [
      form([check('confirm', 'Confirm ' + text.toLowerCase(), false, true)], text, () => api.post(path + '/' + action, confirmed), refresh)
    ]))
  ].filter(Boolean);
}

function taskRow(item, manage, refresh) {
  return record(item.title, node('p', item.taskCode + ' · ' + label(item.taskType) + ' · ' + label(item.status)),
    node('p', 'Due ' + inIndia(item.dueAt)), disclosure('Task details', async () => {
      const { data: task } = await api.get(taskPath(item));
      const assignments = node('div');
      if (task.status !== 'DRAFT') listing(assignments, taskPath(task) + '/assignments',
        (row) => record(internName(row.internship), node('p', label(row.status) + ' · due ' + inIndia(row.effectiveDueAt))),
        { states: assignmentStatuses });
      const deleteOptions = manage && task.status === 'DRAFT' ? { expectedRevision: task.revision, onDeleted: refresh } : null;
      return [node('p', task.department.name + ' · ' + label(task.priority)), ...taskContent(task, deleteOptions), assignments,
        ...(manage ? taskAdmin(task, refresh) : [])];
    }));
}

function timeRemaining(row) {
  if (!row.actionable) return '';
  const remaining = new Date(row.effectiveDueAt) - new Date(row.serverTime);
  if (row.overdue) return ' · overdue';
  const minutes = Math.ceil(remaining / 60000);
  const value = minutes > 1440 ? Math.ceil(minutes / 1440) + ' days left'
    : minutes > 60 ? Math.ceil(minutes / 60) + ' hours left' : minutes + ' minutes left';
  return (row.dueToday ? ' · due today' : '') + ' · ' + value;
}

function reviewed(item) {
  if (!item.review) return null;
  const review = item.review;
  const current = review.amendments?.[0];
  return node('div', node('p', label(review.decision) + ' · ' + inIndia(review.reviewedAt)
    + (review.score == null ? '' : ' · ' + review.score + '/' + review.maximumScore)),
  node('p', review.feedback),
  current ? node('p', 'Amended score ' + current.score + '/' + review.maximumScore + ' · ' + inIndia(current.createdAt)) : null);
}

function historyRow(item, review, amend, refresh) {
  return record('Submission v' + item.submissionVersion,
    node('p', inIndia(item.submittedAt) + ' · deadline ' + inIndia(item.deadlineAt) + (item.late ? ' · late submission' : '')),
    item.writtenResponse ? node('p', item.writtenResponse) : null,
    item.projectUrl ? node('p', link(item.projectUrl, 'Project link')) : null,
    item.repositoryUrl ? node('p', link(item.repositoryUrl, 'Repository link')) : null,
    ...item.additionalLinks.map((item) => node('p', link(item.url, item.title))), files(item.attachments), reviewed(item),
    review ? reviewForm(item, refresh) : null,
    amend ? disclosure('Amend approved score', async () => [amendmentForm(item, refresh)]) : null);
}

function amendmentForm(item, refresh) {
  const rubric = item.taskSnapshot.rubric;
  const previous = item.review.amendments?.[0] ?? item.review;
  return form([
    field('reason', 'Reason for score amendment', { type: 'textarea', required: true, max: 1000 }),
    ...rubric.map((row, index) => numeric('criterion' + index, row.criterion + ' (0–' + row.points + ')',
      previous.criterionScores?.[index] ?? '', 0, row.points, true)),
    !rubric.length ? numeric('score', 'Amended score', previous.score ?? '', 0, item.taskSnapshot.maximumScore, true) : null
  ], 'Record score amendment', ({ reason, score, ...criteria }) => api.post(submissionPath(item) + '/review/amend', {
    reason, expectedRevision: item.review.amendments?.[0]?.revision ?? 0,
    ...(rubric.length ? { criterionScores: Object.values(criteria).map(Number) } : { score: Number(score) })
  }), refresh);
}

function reviewForm(item, refresh) {
  const rubric = item.taskSnapshot.rubric;
  return form([
    field('decision', 'Decision', { value: 'APPROVED', options: [['APPROVED', 'Approve work'], ['REVISION_REQUESTED', 'Request revision']] }),
    field('feedback', 'Reviewer feedback', { type: 'textarea', max: 4000, required: true }),
    ...rubric.map((row, index) => numeric('criterion' + index, row.criterion + ' (0–' + row.points + ')', '', 0, row.points)),
    !rubric.length && item.taskSnapshot.maximumScore ? numeric('score', 'Score', '', 0, item.taskSnapshot.maximumScore) : null
  ], 'Save review', ({ decision, feedback, score, ...criteria }) => {
    const recorded = Object.values(criteria);
    if (recorded.some(Boolean) && !recorded.every(Boolean)) throw new Error('Enter every rubric score or leave all blank.');
    return api.post(submissionPath(item) + '/review', { decision, feedback,
      ...(score ? { score: Number(score) } : {}),
      ...(recorded.some(Boolean) ? { criterionScores: recorded.map(Number) } : {})
    });
  }, refresh);
}

function draftForm(draft, refresh) {
  const path = submissionPath(draft);
  function save(input) {
    return api.patch(path, { expectedRevision: draft.revision, writtenResponse: input.writtenResponse || null,
      projectUrl: input.projectUrl || null, repositoryUrl: input.repositoryUrl || null,
      additionalLinks: pairLines(input.additionalLinks, 'title', 'url') });
  }
  const editable = () => [
    field('writtenResponse', 'Written response', { type: 'textarea', value: draft.writtenResponse, max: 8000 }),
    field('projectUrl', 'Project URL', { type: 'url', value: draft.projectUrl, max: 1500 }),
    field('repositoryUrl', 'Repository URL', { type: 'url', value: draft.repositoryUrl, max: 1500 }),
    field('additionalLinks', 'Additional links · title | URL', {
      type: 'textarea', value: asLines(draft.additionalLinks, 'title', 'url'), max: 8000
    })
  ];
  return record('Submission draft v' + draft.submissionVersion,
    form(editable(), 'Save draft', save, refresh), files(draft.attachments, { expectedRevision: draft.revision, onDeleted: refresh }),
    uploadForm(path + '/attachments', draft.revision, refresh),
    form([check('ready', 'Submit the saved draft for review', false, true)], 'Submit assignment',
      () => api.post(path + '/submit', { expectedRevision: draft.revision }), refresh));
}

function assignmentActions(row, refresh) {
  const path = assignmentPath(row);
  return [
    row.actionable ? disclosure('Extend individual deadline', async () => [
      form([field('dueAt', 'New deadline (IST)', { type: 'datetime-local', required: true }),
        check('confirm', 'Confirm deadline extension', false, true)], 'Extend deadline',
      ({ dueAt }) => api.post(path + '/extend', { ...confirmed, dueAt: fromIstField(dueAt) }), refresh)
    ]) : null,
    ['PUBLISHED', 'CLOSED'].includes(row.task.status) && !['COMPLETED', 'CANCELLED'].includes(row.status)
      ? disclosure('Cancel individual assignment', async () => [
        form([field('reason', 'Reason for cancellation', { type: 'textarea', max: 1000, required: true }),
          check('confirm', 'Confirm cancellation for this intern', false, true)], 'Cancel assignment',
          ({ reason }) => api.post(path + '/cancel', { ...confirmed, reason }), refresh)
      ]) : null
  ].filter(Boolean);
}

async function assignmentDetails(row, policy, refresh) {
  const { data: current } = await api.get(assignmentPath(row));
  const history = await allItems(assignmentPath(row) + '/submissions');
  const draft = history.find((item) => item.status === 'DRAFT');
  const writable = policy.own && current.actionable && ['IN_PROGRESS', 'REVISION_REQUESTED'].includes(current.status);
  const items = [...taskContent(current.task)];
  if (!policy.own) items.push(node('p', internName(current.internship)));
  if (policy.own && current.actionable && current.status === 'ASSIGNED') {
    items.push(form([], 'Start task', () => api.post(assignmentPath(row) + '/start', {}), refresh));
  }
  if (writable) items.push(draft ? draftForm(draft, refresh) : form([],
    current.status === 'REVISION_REQUESTED' ? 'Start revised submission' : 'Create submission draft',
    () => api.post(assignmentPath(row) + '/submissions', {}), refresh));
  if (policy.manage) items.push(...assignmentActions(current, refresh));
  for (const item of history.filter((item) => item.status === 'SUBMITTED')) {
    const reviewAllowed = policy.review && !item.review && current.status === 'SUBMITTED'
      && item.id === history[0]?.id && ['PUBLISHED', 'CLOSED'].includes(current.task.status);
    const amendAllowed = policy.amend && current.status === 'COMPLETED' && item.review?.decision === 'APPROVED'
      && item.taskSnapshot.maximumScore;
    items.push(historyRow(item, reviewAllowed, amendAllowed, refresh));
  }
  if (!items.length) items.push(node('p', 'This task is scheduled for ' + inIndia(current.task.availableFrom) + '.'));
  return items;
}

function assignmentRow(row, policy, refresh) {
  const title = policy.own ? row.task.title : row.task.title + ' · ' + internName(row.internship);
  return record(title,
    node('p', label(row.status) + ' · ' + label(row.task.priority) + ' priority'),
    node('p', 'Due ' + inIndia(row.effectiveDueAt) + timeRemaining(row)),
    row.submittedAt ? node('p', 'Work submitted ' + inIndia(row.submittedAt)) : null,
    policy.own || policy.review || policy.manage ? disclosure(policy.own ? 'Open assignment' : 'Open assignment details',
      () => policy.own || policy.review ? assignmentDetails(row, policy, refresh) : assignmentMonitor(row, policy, refresh)) : null);
}

async function assignmentMonitor(row, policy, refresh) {
  const { data: current } = await api.get(assignmentPath(row));
  return [...taskContent(current.task), ...(policy.manage ? assignmentActions(current, refresh) : [])];
}

export function mountTasks(root, context, departments, own, onChanged) {
  const manage = !own && supports(context, 'tasks:manage');
  const review = !own && supports(context, 'tasks:review');
  const amend = review && context.permissions.includes('tasks:amend_score');
  const view = own ? context.permissions.includes('tasks:own') : supports(context, 'tasks:read');
  if (!view) return;
  const panel = section(root, 'phase06Tasks', own ? 'My tasks' : 'Tasks and assignments');
  const notice = node('p');
  notice.setAttribute('role', 'status');
  panel.append(notice);
  const body = node('div');
  const queue = node('div');
  const refresher = () => {
    notice.textContent = 'Task workspace updated.';
    redraw();
    return onChanged();
  };
  function redraw() {
    body.replaceChildren();
    queue.replaceChildren();
    if (!own) {
      body.append(node('h4', 'Task directory'));
      listing(body, '/tasks', (row) => taskRow(row, manage, refresher),
        { states: taskStatuses, filters: [departmentFilter(departments)] });
    }
    if (review) queue.append(node('h4', 'Assignment and review queue'));
    else if (!own) queue.append(node('h4', 'Intern task progress'));
    listing(queue, own ? '/task-assignments/me' : '/task-assignments',
      (row) => assignmentRow(row, { own, manage, review, amend }, refresher),
      { states: assignmentStatuses, initialStatus: review ? 'SUBMITTED' : '',
        filters: [...(!own ? [departmentFilter(departments)] : []), field('overdue', 'Deadline state', {
          options: [['', 'All deadlines'], ['true', 'Overdue only']]
        })] });
  }
  if (manage) panel.append(disclosure('Create task', async () => departments.length
    ? [createTaskForm(departments, refresher)] : [node('p', 'No active assigned departments.')]));
  panel.append(body, queue);
  redraw();
}
