/**
 * IntelliCore Intern Workspace Dashboard Script
 * Version: 2.0.0
 * Architecture: Modular Monolith (Firebase Auth + MySQL RBAC via Express REST API)
 * Phase: MASTER-PHASE-02C (Authentication Acceptance & Security Hardening)
 */

import { authService } from '/services/auth.js';
import { api } from '/services/api.js';
import { mountPhase04 } from './phase04-dashboard.js';

const $ = (id) => document.getElementById(id);

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
document.querySelectorAll('[data-action="logout"], #icHeaderLogout').forEach((btn) => {
  btn.addEventListener('click', async () => {
    try {
      await authService.logout();
      window.location.replace('/');
    } catch (err) {
      console.error('[InternDashboard] Logout error:', err);
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

  // If status is not ACTIVE, display notice
  if (status !== 'ACTIVE') {
    const noticeEl = $('icWorkspaceNotice');
    if (noticeEl) {
      noticeEl.innerHTML = `
        <div style="background: rgba(255, 184, 0, 0.12); border: 1px solid #ffb800; padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem;">
          <strong style="color: #ffb800;">Account Under Review</strong>
          <p style="margin: 0.25rem 0 0; color: #e2e8f0; font-size: 0.88rem;">
            Your account is currently in <strong>${escapeHtml(status)}</strong> status. Workspace modules will activate upon HR approval.
          </p>
        </div>
      `;
      noticeEl.hidden = false;
    }
  }

  // Development-pending module states
  const tasksEl = $('icTrainingIntro');
  if (tasksEl) {
    tasksEl.textContent = 'Learning modules and assigned projects scheduled for Phase 06 integration.';
  }

  const attendanceSummary = $('icAttendanceSummary');
  if (attendanceSummary) {
    attendanceSummary.textContent = 'Automated attendance logging will be activated in Phase 05.';
  }

  const unfinished = document.querySelectorAll('#icTrainingSection, #icMeetingPanel, #icAttendancePanel, #icProgressPanel, .ic-workspace-stats, .ic-workspace-lower-grid, .ic-dashboard-search, a[href="#icTrainingSection"], a[href="#icAttendancePanel"], a[href="#icProgressPanel"], a[href="#icNotifications"]');
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
