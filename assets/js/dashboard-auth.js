/**
 * IntelliCore Intern Workspace Dashboard Script
 * Version: 2.0.0
 * Architecture: Modular Monolith (Firebase Auth + MySQL RBAC via Express REST API)
 * Phase: MASTER-PHASE-02C (Authentication Acceptance & Security Hardening)
 */

import { authService } from '../../services/auth.js';
import { api } from '../../services/api.js';
import { mountPhase04 } from './phase04-dashboard.js';
import { mountAttendance, stopAttendance } from './phase05-dashboard.js';
import { mountWork } from './phase06-dashboard.js';
import { mountNotifications } from './phase07-dashboard.js';
import { mountPhase08 } from './phase08-dashboard.js';

const $ = (id) => document.getElementById(id);

window.addEventListener('intelliCoreAttendanceNotice', (event) => {
  const notice = $('phase05LogoutNotice');
  if (notice) notice.textContent = event.detail;
});

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

// Navigation and visual handlers
const hamburgerBtn = $('hamburgerBtn');
const mobileDrawer = $('mobileDrawer');
if (hamburgerBtn && mobileDrawer) {
  hamburgerBtn.addEventListener('click', () => {
    const isExpanded = hamburgerBtn.getAttribute('aria-expanded') === 'true';
    hamburgerBtn.setAttribute('aria-expanded', String(!isExpanded));
    mobileDrawer.classList.toggle('open', !isExpanded);
  });
}

// Wire up logout buttons
document.querySelectorAll('[data-action="logout"], #icHeaderLogout, #logoutButton, #topbarLogout, #sidebarLogout').forEach((btn) => {
  btn.addEventListener('click', async () => {
    if (btn.disabled) return;
    btn.disabled = true;
    stopAttendance($('icAttendancePanel'));
    try {
      await authService.logout();
      window.location.replace('/');
    } catch (err) {
      console.error('[InternDashboard] Logout error:', err);
      btn.disabled = false;
    }
  });
});

function renderInternWorkspace(context) {
  const { appUser, firebaseUser, status } = context;
  const displayName = appUser?.profile?.displayName || appUser?.profile?.fullName || firebaseUser?.displayName || 'Intern';
  const email = appUser?.email || firebaseUser?.email || '';

  // Header user info
  const nameEl = $('icUserDisplayName');
  if (nameEl) nameEl.textContent = displayName;
  if ($('icDashboardUserName')) $('icDashboardUserName').textContent = displayName;
  if ($('icInternWelcomeName')) $('icInternWelcomeName').textContent = displayName.split(' ')[0];
  if ($('icDashboardInitial')) $('icDashboardInitial').textContent = displayName[0];
  $('workspaceTop').setAttribute('aria-busy', 'false');

  const emailEl = $('icUserEmail');
  if (emailEl) emailEl.textContent = email;

  const statusBadge = $('icAccountStatusBadge');
  if (statusBadge) {
    statusBadge.textContent = status;
    statusBadge.className = `status-badge ${status.toLowerCase()}`;
  }

  // If status is not ACTIVE, display appropriate notice
  if (status !== 'ACTIVE') {
    const noticeEl = $('icWorkspaceNotice');
    if (noticeEl) {
      const isSuspended = status === 'SUSPENDED';
      const isInactive = status === 'INACTIVE';
      const bg = isSuspended ? 'rgba(239, 68, 68, 0.15)' : isInactive ? 'rgba(148, 163, 184, 0.15)' : 'rgba(255, 184, 0, 0.12)';
      const border = isSuspended ? '#ef4444' : isInactive ? '#94a3b8' : '#ffb800';
      const titleColor = isSuspended ? '#ef4444' : isInactive ? '#94a3b8' : '#ffb800';
      const heading = isSuspended ? 'Account Suspended' : isInactive ? 'Account Inactive' : 'Account Under Review';
      const desc = isSuspended
        ? 'Your account has been suspended. Operational workspace access is disabled. Please contact the administrator.'
        : isInactive
        ? 'Your account is currently inactive. Please contact the administrator to restore access.'
        : `Your account is currently in <strong>${escapeHtml(status)}</strong> status. Workspace modules will activate upon HR approval.`;

      noticeEl.innerHTML = `
        <div style="background: ${bg}; border: 1px solid ${border}; padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem;">
          <strong style="color: ${titleColor};">${heading}</strong>
          <p style="margin: 0.25rem 0 0; color: #e2e8f0; font-size: 0.88rem;">
            ${desc}
          </p>
        </div>
      `;
      noticeEl.hidden = false;
    }
  }

  const unfinished = document.querySelectorAll('#icTrainingSection, #icMeetingPanel, #icProgressPanel, .ic-workspace-stats, .ic-workspace-lower-grid, .ic-dashboard-search, a[href="#icTrainingSection"], a[href="#icProgressPanel"], a[href="#icNotifications"]');
  unfinished.forEach((element) => {
    element.classList.add('phase04-disabled');
    element.hidden = true;
  });
  $('icProfile').classList.add('phase04-disabled');
  $('icProfile').hidden = true;
  document.querySelectorAll('a[href="#icProfile"]').forEach((link) => link.setAttribute('href', '#phase04Profile'));
  const panel = $('icApplications');
  panel.removeAttribute('aria-labelledby');
  panel.setAttribute('aria-label', 'Internship workspace');
  mountPhase04(panel, context, 'intern', async () => {
    if (status !== 'ACTIVE') return;
    try {
      const { data } = await api.get('/internships/me?status=ONGOING&limit=1');
      if (data.items.length) {
        const intro = document.querySelector('#workspaceHome .welcome-copy > p');
        if (intro) intro.textContent = `Your ${data.items[0].department.name} internship is ongoing.`;
      }
    } catch {
      // The enrollment list displays its own connection errors.
    }
  });
  const attendance = $('icAttendancePanel');
  const showAttendance = status === 'ACTIVE' && context.roles.length === 1 && context.roles[0] === 'INTERN';
  document.querySelectorAll('a[href="#icAttendancePanel"]').forEach((link) => {
    link.classList.add('phase04-disabled');
    link.hidden = !showAttendance;
  });
  attendance.classList.add('phase04-disabled');
  attendance.hidden = !showAttendance;
  attendance.removeAttribute('aria-labelledby');
  attendance.setAttribute('aria-label', 'Attendance, reports and leave');
  if (showAttendance) mountAttendance(attendance, context, true);
  else stopAttendance(attendance);
  void mountWork($('phase06Work'), context, true);
  mountNotifications($('phase07Workspace'), context);
  mountPhase08($('phase08Workspace'), context, true);
}

authService.onAuthStateChanged((context) => {
  if (context.isInitializing) return;

  if (!context.isAuthenticated) {
    window.location.replace('/?auth=login');
    return;
  }

  if (!context.appUser.emailVerified || (!context.workspaces.onboarding && context.status !== 'ACTIVE')) {
    window.location.replace('/?auth=login');
    return;
  }
  renderInternWorkspace(context);
});
