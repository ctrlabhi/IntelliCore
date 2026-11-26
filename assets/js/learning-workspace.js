
import { api } from '/services/api.js';
import { allItems, check, confirmed, departmentFilter, departmentSelect, disclosure, field, form, inIndia, internName,
  label, link, listing, node, numeric, pct, record, section } from './work-controls.js';

const trackPath = (track) => '/learning/tracks/' + track.id;
const allowed = (context, capability) => context.permissions.includes(capability + '_all')
  || context.permissions.includes(capability + '_department');

function trackFields(track = {}) {
  return [field('title', 'Track title', { value: track.title, required: true, max: 180 }),
    field('description', 'Track description', { type: 'textarea', value: track.description, max: 8000 })];
}

function contentFields(item, kind, sequence) {
  const title = field('title', kind + ' title', { value: item.title, required: true, max: 180 });
  const order = numeric('sequence', 'Sequence', item.sequence ?? sequence, 1, 10000, true);
  const text = field(kind === 'Lesson' ? 'content' : 'description', kind === 'Lesson' ? 'Lesson content' : 'Description', {
    type: 'textarea', value: item.content ?? item.description, max: 8000, required: kind === 'Lesson'
  });
  if (kind === 'Resource') return [title, order, text,
    field('resourceUrl', 'Resource URL', { type: 'url', value: item.resourceUrl, required: true, max: 1500 })];
  return [title, order, text, numeric('estimatedMinutes', 'Estimated minutes', item.estimatedMinutes ?? ''),
    check('isRequired', 'Required ' + kind.toLowerCase(), item.isRequired ?? true)];
}

function values(input) {
  const { sequence, estimatedMinutes, isRequired, ...fields } = input;
  return { ...fields, sequence: Number(sequence), ...('resourceUrl' in fields ? {} : {
    estimatedMinutes: estimatedMinutes ? Number(estimatedMinutes) : null, isRequired: isRequired === 'yes'
  }) };
}

function contentForm(path, item, kind, refresh, sequence = 1) {
  return form(contentFields(item || {}, kind, sequence), item ? 'Save ' + kind.toLowerCase() : 'Add ' + kind.toLowerCase(),
    (input) => item ? api.patch(path + '/' + item.id, values(input)) : api.post(path, values(input)), refresh);
}

function resourceRows(parentPath, resources, editable, refresh) {
  const path = parentPath + '/resources';
  return [
    resources.length ? node('ul', ...resources.map((resource) => node('li',
      link(resource.resourceUrl, resource.title), resource.description ? node('p', resource.description) : null,
      editable ? disclosure('Edit resource', async () => [contentForm(path, resource, 'Resource', refresh),
        form([check('confirmed', 'Confirm removal from this draft', false, true)], 'Remove resource',
          () => api.delete(path + '/' + resource.id), refresh)]) : null))) : null,
    editable ? disclosure('Add resource', async () => [contentForm(path, null, 'Resource', refresh, resources.length + 1)]) : null
  ];
}

function modules(track, editable, refresh) {
  const path = trackPath(track) + '/modules';
  return [
    !track.modules.length ? node('p', 'No modules have been added.') : null,
    ...track.modules.map((module) => disclosure(module.sequence + '. ' + module.title, async () => {
      const parent = path + '/' + module.id;
      const lessons = parent + '/lessons';
      return [
        node('p', (module.isRequired ? 'Required' : 'Optional') + ' module'),
        module.description ? node('p', module.description) : null,
        editable ? disclosure('Edit or reorder module', async () => [contentForm(path, module, 'Module', refresh)]) : null,
        ...resourceRows(parent, module.resources, editable, refresh),
        ...module.lessons.map((lesson) => disclosure(lesson.sequence + '. ' + lesson.title, async () => [
          node('p', lesson.isRequired ? 'Required lesson' : 'Optional lesson'),
          node('p', lesson.content),
          editable ? disclosure('Edit or reorder lesson', async () => [contentForm(lessons, lesson, 'Lesson', refresh)]) : null,
          ...resourceRows(lessons + '/' + lesson.id, lesson.resources, editable, refresh)
        ].filter(Boolean))),
        editable ? disclosure('Add lesson', async () => [contentForm(lessons, null, 'Lesson', refresh, module.lessons.length + 1)]) : null
      ].filter(Boolean);
    })),
    editable ? disclosure('Add module', async () => [contentForm(path, null, 'Module', refresh, track.modules.length + 1)]) : null
  ].filter(Boolean);
}

async function trackActions(track, refresh) {
  const path = trackPath(track);
  const editable = track.status === 'DRAFT';
  const canArchive = track.status !== 'ARCHIVED';
  return [
    editable ? disclosure('Edit track', async () => [form(trackFields(track), 'Save track', (input) => api.patch(path, input), refresh)]) : null,
    editable ? disclosure('Publish curriculum', async () => [
      form([check('confirmed', 'Confirm publication of this curriculum version', false, true)], 'Publish curriculum',
        () => api.post(path + '/publish', confirmed), refresh)
    ]) : form([], 'Create new draft version', () => api.post(path + '/versions', {}), refresh),
    canArchive ? disclosure('Archive curriculum', async () => [
      form([check('confirmed', 'Confirm archival of this curriculum version', false, true)], 'Archive curriculum',
        () => api.post(path + '/archive', confirmed), refresh)
    ]) : null,
    track.status === 'PUBLISHED' ? disclosure('Enroll eligible intern', async () => {
      const eligible = await allItems('/learning/eligible-recipients?departmentId=' + track.departmentId);
      return eligible.length ? [form([field('internshipId', 'Eligible intern', {
        options: [['', 'Select eligible intern'], ...eligible.map((item) => [item.id, internName(item)])], required: true
      })], 'Enroll intern', (input) => api.post(path + '/enrollments', input), refresh)]
        : [node('p', 'No currently eligible internships in this department.')];
    }) : null
  ].filter(Boolean);
}

function learningSummary(item) {
  const { completedRequired, required, completedOptional, optional, percentage, completedModules, totalModules } = item;
  return node('div', node('p', 'Required lessons · ' + completedRequired + '/' + required + ' (' + pct(percentage) + ')'),
    node('p', 'Optional lessons · ' + completedOptional + '/' + optional),
    node('p', 'Modules completed · ' + completedModules + '/' + totalModules));
}

function ownEnrollment(item, refresh) {
  return record(item.track.title + ' · v' + item.track.version,
    node('p', item.track.department.name + ' · ' + label(item.status)),
    learningSummary(item.learning),
    ...item.learning.modules.map((module) => disclosure(module.sequence + '. ' + module.title, async () => [
      node('p', (module.completed ? 'Module completed' : 'Module in progress') + (module.isRequired ? ' · required module' : ' · optional module')),
      module.description ? node('p', module.description) : null,
      ...resourceRows('', module.resources, false, refresh),
      ...module.lessons.map((lesson) => disclosure(lesson.title, async () => {
        const status = lesson.progress.status;
        const path = '/learning/lessons/' + lesson.id;
        return [
          node('p', label(status) + (lesson.requiredForTrack ? ' · required' : ' · optional')),
          lesson.progress.corrections?.length ? node('p', 'An authorized mentor previously corrected this progress.') : null,
          node('p', lesson.content),
          ...resourceRows('', lesson.resources, false, refresh),
          item.canUpdate && status !== 'COMPLETED' ? form([], status === 'NOT_STARTED' ? 'Start lesson' : 'Mark lesson complete',
            () => api.post(path + (status === 'NOT_STARTED' ? '/start' : '/complete'), { enrollmentId: item.id }), refresh) : null
        ].filter(Boolean);
      })),
      !module.lessons.length ? node('p', 'No lessons in this module.') : null
    ].filter(Boolean))),
    !item.learning.modules.length ? node('p', 'This version has no published lessons.') : null);
}

async function staffProgress(item, canCorrect, refresh) {
  const path = '/learning/enrollments/' + item.id;
  const { data: current } = await api.get(path);
  return current.learning.modules.map((module) => disclosure(module.title, async () =>
    module.lessons.map((lesson) => {
      const progress = lesson.progress;
      return record(lesson.title, node('p', label(progress.status)),
        progress.corrections?.length ? node('p', 'Latest correction ' + inIndia(progress.corrections[0].createdAt)) : null,
        canCorrect && progress.status !== 'NOT_STARTED' ? form([
          field('reason', 'Reason for progress correction', { type: 'textarea', max: 1000, required: true }),
          check('confirm', 'Confirm changing this recorded lesson status', false, true)
        ], progress.status === 'COMPLETED' ? 'Correct to in progress' : 'Correct to completed',
        ({ reason }) => api.post(path + '/lessons/' + lesson.id + '/correct', {
          expectedStatus: progress.status, status: progress.status === 'COMPLETED' ? 'IN_PROGRESS' : 'COMPLETED',
          expectedCorrectionId: progress.corrections?.[0]?.id ?? null, reason
        }), refresh) : null);
    })));
}

export function mountLearning(root, context, departments, own, onChanged) {
  const manage = !own && allowed(context, 'learning:manage');
  if (!(own ? context.permissions.includes('learning:own') : allowed(context, 'learning:read'))) return;
  const panel = section(root, 'phase06Learning', own ? 'Learning center' : 'Curriculum and learning progress');
  const notice = node('p');
  notice.setAttribute('role', 'status');
  const body = node('div');
  const progress = node('div');
  const refresh = () => {
    notice.textContent = 'Learning workspace updated.';
    redraw();
    return onChanged();
  };
  function redraw() {
    body.replaceChildren();
    progress.replaceChildren();
    if (own) {
      listing(body, '/learning/me', (item) => ownEnrollment(item, refresh));
      return;
    }
    body.append(node('h4', 'Curriculum directory'));
    listing(body, '/learning/tracks', (track) => record(track.title + ' · v' + track.version, node('p', label(track.status)),
      disclosure('Open curriculum', async () => {
        const { data } = await api.get(trackPath(track));
        return [node('p', data.department.name), data.description ? node('p', data.description) : null,
          ...modules(data, manage && data.status === 'DRAFT', refresh),
          ...(manage ? await trackActions(data, refresh) : [])].filter(Boolean);
      })), { states: ['DRAFT', 'PUBLISHED', 'ARCHIVED'], filters: [departmentFilter(departments)] });
    progress.append(node('h4', 'Intern learning progress'));
    listing(progress, '/learning/progress', (item) => record(internName(item.internship),
      node('p', item.track.title + ' · v' + item.track.version), learningSummary(item.learning),
      disclosure('Inspect lesson progress', () => staffProgress(item, manage && context.permissions.includes('learning:correct_progress'), refresh))),
    { filters: [departmentFilter(departments)] });
  }
  panel.append(notice);
  if (manage) panel.append(disclosure('Create learning track', async () => departments.length
    ? [form([departmentSelect(departments), ...trackFields()], 'Create track draft', (input) => api.post('/learning/tracks', input), refresh)]
    : [node('p', 'No active assigned departments.')]));
  panel.append(body, progress);
  if (own) {
    notice.textContent = 'Checking available curriculum…';
    api.post('/learning/me/sync', {}).then(({ data }) => {
      notice.textContent = {
        NO_CURRICULUM: 'No published curriculum is available for your department.',
        SELECTION_REQUIRED: 'Your department has multiple tracks. An authorized mentor can select yours.',
        INELIGIBLE: 'Learning activity opens during your eligible internship. Historical records appear below when available.'
      }[data.result] ?? 'Lesson progress is self-reported.';
      redraw();
    }).catch((error) => { notice.textContent = error.message; redraw(); });
  } else redraw();
}
