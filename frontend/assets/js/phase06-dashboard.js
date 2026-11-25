
import { api } from '/services/api.js';
import { mountTasks } from './task-workspace.js';
import { mountLearning } from './learning-workspace.js';
import { allItems, button, dateFields, disclosure, form, inIndia, internName, label, listing, node, record,
  section, summaryBlock } from './work-controls.js';

const mounts = new WeakMap();
const capabilities = ['tasks:read', 'tasks:manage', 'learning:read', 'learning:manage', 'performance:read'];
const hasScope = (context, capability) => context.permissions.includes(capability + '_all')
  || context.permissions.includes(capability + '_department');
const feedback = (review) => record(review.submission.assignment.task.title + ' · v' + review.submission.submissionVersion,
  node('p', label(review.decision) + ' · ' + inIndia(review.reviewedAt)),
  review.score === null ? null : node('p', review.score + '/' + review.maximumScore),
  node('p', review.feedback), review.reviewer?.profile?.fullName ? node('p', 'Reviewed by ' + review.reviewer.profile.fullName) : null);

function individualPerformance(path, heading) {
  const panel = node('div');
  const status = node('p');
  status.setAttribute('role', 'status');
  const results = node('div');
  let page = 1;
  let filter = {};
  let version = 0;
  const previous = button('Previous evaluations', () => { page -= 1; void render(); });
  const next = button('Next evaluations', () => { page += 1; void render(); });
  previous.hidden = true;
  next.hidden = true;
  panel.append(form(dateFields(), 'Apply dates', (filters) => { filter = filters; page = 1; return render(); }),
    status, results, node('div', previous, next));

  async function render() {
    const request = ++version;
    status.textContent = 'Loading performance…';
    const query = new URLSearchParams(Object.entries(filter).filter(([, value]) => value));
    query.set('page', page);
    query.set('limit', '10');
    previous.disabled = next.disabled = true;
    try {
      const { data } = await api.get(path + '?' + query);
      if (request !== version) return;
      status.textContent = '';
      results.replaceChildren(summaryBlock(data.summary));
      if (data.evaluations) results.append(node('h4', heading), ...(data.evaluations.items.length
        ? data.evaluations.items.map(feedback) : [node('p', 'No review records in this period.')]));
      const pages = data.evaluations?.pagination.totalPages ?? 0;
      previous.hidden = next.hidden = pages < 2;
      previous.disabled = page <= 1;
      next.disabled = page >= pages;
    } catch (error) {
      if (request !== version) return;
      status.textContent = error.message;
      results.replaceChildren();
    }
  }
  void render();
  return { panel, render };
}

function departmentRow(item) {
  return record(item.department.name, node('p', item.publishedTasks + ' published tasks'), summaryBlock(item.summary),
    disclosure('Intern performance', async () => {
      const content = node('div');
      listing(content, '/performance/departments/' + item.department.id, (row) => record(internName(row.internship),
        summaryBlock(row.summary), disclosure('Evaluation history', async () => [
          individualPerformance('/performance/internships/' + row.internship.id, 'Evaluation history').panel
        ])), { filters: dateFields() });
      return [content];
    }));
}

function mountPerformance(root, context, own) {
  const permitted = own ? context.permissions.includes('performance:own') : hasScope(context, 'performance:read');
  if (!permitted) return async () => {};
  const panel = section(root, 'phase06Performance', own ? 'My performance' : 'Performance reports');
  if (own) {
    const current = individualPerformance('/performance/me', 'My evaluation history');
    panel.append(current.panel);
    return current.render;
  }
  const summary = node('div', node('p', 'Loading performance…'));
  const directory = node('div', node('h4', 'Department performance'));
  panel.append(summary, directory);
  const refreshDirectory = listing(directory, '/performance/summary', departmentRow, { filters: dateFields() });
  async function refresh() {
    try {
      const { data } = await api.get('/performance/summary?limit=1');
      summary.replaceChildren(node('p', data.publishedTasks + ' currently published task definitions'), summaryBlock(data.summary));
      const values = { tlPendingTasks: data.summary.pending + data.summary.awaitingReview,
        tlCompletedTasks: data.summary.counts.COMPLETED, liveOpenTaskCount: data.summary.pending + data.summary.awaitingReview };
      for (const [id, value] of Object.entries(values)) {
        const element = document.getElementById(id);
        if (element) element.textContent = String(value);
      }
      const teamSummary = document.getElementById('tlTaskSummary');
      if (teamSummary) teamSummary.replaceChildren(summaryBlock(data.summary));
    } catch (error) {
      summary.replaceChildren(node('p', error.message));
    }
  }
  void refresh();
  return async () => { await Promise.all([refresh(), refreshDirectory()]); };
}

export async function mountWork(root, context, own = false) {
  if (!root) return;
  const active = context.status === 'ACTIVE' && (own ? context.roles.length === 1 && context.roles[0] === 'INTERN'
    : capabilities.some((capability) => hasScope(context, capability)));
  root.hidden = !active;
  document.querySelectorAll('[data-phase06-link]').forEach((element) => { element.hidden = !active; });
  if (!active || mounts.get(root) === context.appUser) return;
  mounts.set(root, context.appUser);
  root.replaceChildren();
  root.classList.add('phase04', 'phase06');
  const nav = node('nav');
  nav.setAttribute('aria-label', 'Work and learning');
  for (const [id, title] of [['Tasks', own ? 'My tasks' : 'Tasks'], ['Learning', own ? 'Learning center' : 'Curriculum'], ['Performance', 'Performance']]) {
    const anchor = node('a', title);
    anchor.href = '#phase06' + id;
    nav.append(anchor);
  }
  root.append(nav);
  let departments = [];
  if (!own) {
    const loading = node('p', 'Loading authorized departments…');
    root.append(loading);
    try {
      const assigned = context.roles.includes('TEAM_LEADER') && !capabilities.some((capability) =>
        context.permissions.includes(capability + '_all'));
      departments = await allItems('/departments' + (assigned ? '?assigned=true' : ''));
      loading.remove();
    } catch (error) {
      loading.textContent = error.message;
    }
    if (mounts.get(root) !== context.appUser) return;
  }
  let updated = async () => {};
  mountTasks(root, context, departments, own, () => updated());
  mountLearning(root, context, departments, own, () => updated());
  updated = mountPerformance(root, context, own);
}
