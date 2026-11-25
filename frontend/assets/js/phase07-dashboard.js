import { api } from '/services/api.js';
import { mountAnnouncements } from './announcement-dashboard.js';
import { mountNotificationAdmin } from './notification-admin-dashboard.js';
import { check, disclosure, field, form, inIndia, label, listing, node, record, section } from './work-controls.js';

const categories = ['ACCOUNT', 'INTERNSHIP', 'ATTENDANCE', 'LEAVE', 'TASK', 'LEARNING', 'ANNOUNCEMENT'];
const idPattern = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
const safeAction = /^\/dashboards\/(?:intern|founder|hr|team-leader)\?notice=[\da-f-]{36}#phase07Notice$/i;
const mounts = new WeakMap();

export function stopNotifications(root) {
  mounts.get(root)?.stop();
  mounts.delete(root);
}

function actionLink(item) {
  if (!safeAction.test(item.actionPath)) return null;
  const link = node('a', 'Open related record');
  link.href = item.actionPath;
  return link;
}

function ownNotification(item, refresh) {
  const path = '/notifications/' + item.id;
  return record(item.title, node('p', item.message),
    node('small', label(item.category) + ' · ' + inIndia(item.createdAt) + (item.readAt ? ' · Read' : ' · Unread')),
    node('div', actionLink(item)),
    item.readAt ? null : form([], 'Mark as read', () => api.post(path + '/read', {}), refresh),
    item.archivedAt ? null : form([], 'Archive', () => api.post(path + '/archive', {}), refresh));
}

const prefLabels = {
  emailEnabled: 'Optional email updates', taskReminders: 'Task deadline reminders',
  learningUpdates: 'Learning updates', announcements: 'Announcement alerts'
};
function preferencePanel(root) {
  root.append(disclosure('Notification preferences', async () => {
    const { data } = await api.get('/notification-preferences/me');
    return [form(Object.entries(prefLabels).map(([key, title]) => check(key, title, data[key])),
      'Save notification preferences', (input) => api.patch('/notification-preferences/me',
        Object.fromEntries(Object.keys(prefLabels).map((key) => [key, input[key] === 'yes']))))];
  }));
}

async function openNotice(root, context, refresh) {
  const id = new URLSearchParams(location.search).get('notice');
  if (!idPattern.test(id ?? '')) return;
  const target = section(root, 'phase07Notice', 'Related notification');
  target.tabIndex = -1;
  const status = node('p', 'Loading related record…');
  target.append(status);
  try {
    const { data: item } = await api.get('/notifications/' + id);
    status.textContent = item.message;
    await api.post('/notifications/' + id + '/read', {});
    void refresh();
    const resource = item.relatedResourceId;
    if (!idPattern.test(resource)) return;
    const own = context.roles.length === 1 && context.roles[0] === 'INTERN';
    const map = {
      INTERNSHIP_APPLICATION: ['/internship-applications/', '#phase04Applications', 'Applications'],
      INTERNSHIP: ['/internships/', '#phase04Internships', 'Internships'],
      DAILY_WORK_REPORT: ['/daily-work-reports/', '#phase05Reports', 'Daily work reports'],
      LEAVE_REQUEST: [own ? '/leave-requests/me/' : '/leave-requests/', '#phase05Leave', 'Leave requests'],
      ATTENDANCE_CORRECTION: [own ? '/attendance-corrections/me/' : '/attendance-corrections/', '#phase05Corrections', 'Corrections'],
      TASK_ASSIGNMENT: ['/task-assignments/', '#phase06Tasks', 'Tasks'],
      TASK_SUBMISSION: ['/task-submissions/', '#phase06Tasks', 'Tasks'],
      LEARNING_TRACK: ['/learning/tracks/', '#phase06Learning', 'Learning'],
      LEARNING_ENROLLMENT: [own ? '/learning/me/enrollments/' : '/learning/enrollments/', '#phase06Learning', 'Learning'],
      REPORT_DAY: [null, '#phase05TodayReport', 'Today’s report'],
      ANNOUNCEMENT: ['/announcements/me/', '#phase07Announcements', 'Announcements']
    };
    const [route, anchor, title] = map[item.relatedResourceType] ?? [];
    if (!anchor) return;
    const link = node('a', 'Go to ' + title);
    link.href = anchor;
    if (route) {
      const { data } = await api.get(route + resource);
      const heading = data.title || data.task?.title || data.internshipCode || title;
      target.append(record(heading, item.relatedResourceType === 'ANNOUNCEMENT'
        ? node('p', data.message) : node('p', label(data.status ?? data.applicationStatus ?? data.internshipStatus ?? 'available'))));
    }
    target.append(link);
  } catch (error) {
    status.textContent = error.status === 403 || error.status === 404 ? 'This record is unavailable in your current scope.' : error.message;
  } finally {
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'start' });
  }
}

export function mountNotifications(root, context) {
  const bell = document.getElementById('notificationButton');
  if (!root || !bell) return;
  const active = context.isAuthenticated && context.appUser?.emailVerified && context.permissions.includes('notifications:own')
    && ['ACTIVE', 'PENDING'].includes(context.status);
  root.hidden = bell.hidden = !active;
  if (!active) return stopNotifications(root);
  if (mounts.get(root)?.user === context.appUser.id) return;
  stopNotifications(root);
  root.replaceChildren();
  root.classList.add('phase04', 'phase07');
  const menu = node('div');
  menu.className = 'phase04 phase07-notification-menu';
  menu.id = 'phase07Recent';
  menu.hidden = true;
  menu.setAttribute('aria-label', 'Recent notifications');
  bell.after(menu);
  bell.setAttribute('aria-expanded', 'false');
  bell.setAttribute('aria-controls', menu.id);
  const badge = bell.querySelector('.notification-count');
  const abort = new AbortController();
  let timer;
  let loading = false;
  let live = true;
  const seconds = Number(bell.dataset.pollSeconds ?? 60);
  const frequency = Number.isFinite(seconds) ? Math.min(Math.max(seconds, 30), 180) * 1000 : 60000;

  function close() {
    menu.hidden = true;
    bell.setAttribute('aria-expanded', 'false');
  }

  async function refreshCount() {
    if (document.hidden || !live || loading) return;
    loading = true;
    try {
      const { data } = await api.get('/notifications/me/unread-count', { signal: abort.signal });
      if (!live) return;
      badge.textContent = data.count > 99 ? '99+' : String(data.count);
      badge.hidden = !data.count;
      bell.setAttribute('aria-label', 'Notifications, ' + data.count + ' unread');
    } catch {
      if (live) bell.setAttribute('aria-label', 'Notifications, count unavailable');
    } finally { loading = false; }
  }
  function visibility() {
    clearInterval(timer);
    if (document.hidden || !live) return;
    void refreshCount();
    timer = setInterval(refreshCount, frequency);
  }
  function stop() {
    live = false;
    clearInterval(timer);
    abort.abort();
    menu.remove();
  }
  mounts.set(root, { user: context.appUser.id, stop });
  document.addEventListener('visibilitychange', visibility, { signal: abort.signal });
  window.addEventListener('pagehide', stop, { signal: abort.signal });
  for (const logout of document.querySelectorAll('#logoutButton,#icHeaderLogout,[data-action="logout"]')) {
    logout.addEventListener('click', () => stopNotifications(root), { capture: true, signal: abort.signal });
  }
  const targetRoot = node('div');
  root.append(targetRoot);
  const panel = section(root, 'phase07Center', 'Notification center');
  const filter = node('div');
  const refresh = () => Promise.all([refreshListing(), refreshCount()]);
  panel.append(form([], 'Mark all as read', () => api.post('/notifications/me/read-all', {}), refresh), filter);
  const refreshListing = listing(filter, '/notifications/me', (item) => ownNotification(item, refresh), {
    filters: [field('state', 'Read status', { options: [['ALL', 'All notifications'], ['UNREAD', 'Unread'],
      ['READ', 'Read'], ['ARCHIVED', 'Archived']] }),
    field('category', 'Category', { options: [['', 'All categories'], ...categories.map((item) => [item, label(item)])] })]
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !menu.hidden) { close(); bell.focus(); }
  }, { signal: abort.signal });
  document.addEventListener('click', (event) => {
    if (!bell.contains(event.target) && !menu.contains(event.target)) close();
  }, { signal: abort.signal });
  bell.addEventListener('click', async () => {
    if (!menu.hidden) return close();
    menu.hidden = false;
    bell.setAttribute('aria-expanded', 'true');
    const center = node('a', 'Open notification center');
    center.href = '#phase07Center';
    center.addEventListener('click', close);
    menu.replaceChildren(node('p', 'Loading recent notifications…'), center);
    try {
      const { data } = await api.get('/notifications/me?limit=5', { signal: abort.signal });
      if (!live) return;
      menu.replaceChildren(...(data.items.length ? data.items.map((item) =>
        node('div', node('strong', item.title), node('small', label(item.category) + (item.readAt ? '' : ' · Unread')), actionLink(item)))
        : [node('p', 'No notifications yet.')]), center);
    } catch (error) {
      if (live) menu.replaceChildren(node('p', error.message), center);
    }
  }, { signal: abort.signal });
  if (context.status === 'ACTIVE') {
    preferencePanel(panel);
    void mountAnnouncements(root, context, refresh);
    mountNotificationAdmin(root, context);
  }
  visibility();
  void openNotice(targetRoot, context, refresh);
}
