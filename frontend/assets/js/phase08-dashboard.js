import { node } from './phase04-dashboard.js';
import { mountMeetings } from './phase08-meetings.js';
import { mountFollowups } from './phase08-followups.js';

const mounted = new WeakMap();

export function mountPhase08(root, context, own = false) {
  if (!root) return;
  root.hidden = context.status !== 'ACTIVE';
  document.querySelectorAll('[data-phase08-link]').forEach((link) => { link.hidden = root.hidden; });
  if (root.hidden || mounted.get(root) === context.appUser.id) return;
  mounted.set(root, context.appUser.id);
  root.replaceChildren();
  root.classList.add('phase04', 'phase06');
  const content = node('div');
  root.append(content);
  void mountMeetings(content, context);
  void mountFollowups(content, context, own);
}
