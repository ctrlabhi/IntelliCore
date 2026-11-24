/**
 * IntelliCore Founder Command Center Dashboard Script
 * Version: 2.0.0
 * Architecture: Modular Monolith (Firebase Auth + MySQL RBAC via Express REST API)
 * Phase: MASTER-PHASE-02C (Authentication Acceptance & Security Hardening)
 */

import { authService } from '/services/auth.js';

const $ = (id) => document.getElementById(id);
const authState = $('authState');
const shell = $('dashboardShell');
let toastTimer;

function showToast(message) {
  const toast = $('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 3600);
}

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));

function closeMobileNav() {
  const sidebar = $('sidebar');
  const overlay = $('sidebarOverlay');
  if (sidebar) sidebar.classList.remove('open');
  if (overlay) overlay.hidden = true;
  const mobileMenu = $('mobileMenu');
  if (mobileMenu) mobileMenu.setAttribute('aria-expanded', 'false');
}

function setMobileNavOpen(isOpen) {
  const sidebar = $('sidebar');
  const overlay = $('sidebarOverlay');
  if (sidebar) sidebar.classList.toggle('open', isOpen);
  if (overlay) overlay.hidden = !isOpen;
  const mobileMenu = $('mobileMenu');
  if (mobileMenu) mobileMenu.setAttribute('aria-expanded', String(isOpen));
}

// Attach navigation event handlers
if ($('sidebarClose')) $('sidebarClose').addEventListener('click', closeMobileNav);
if ($('mobileMenu')) $('mobileMenu').addEventListener('click', () => setMobileNavOpen(!$('sidebar')?.classList.contains('open')));
if ($('sidebarOverlay')) $('sidebarOverlay').addEventListener('click', closeMobileNav);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && $('sidebar')?.classList.contains('open')) closeMobileNav();
});

const sidebar = $('sidebar');
if (sidebar) {
  sidebar.querySelectorAll('.nav-link').forEach((link) => {
    link.addEventListener('click', () => {
      sidebar.querySelectorAll('.nav-link').forEach((item) => item.classList.remove('active'));
      link.classList.add('active');
      closeMobileNav();
    });
  });
}

// Quick action buttons
document.querySelectorAll('[data-founder-action]').forEach((button) => {
  button.addEventListener('click', () => {
    const action = button.getAttribute('data-founder-action');
    showToast(`${action} module scheduled for Phase 03 / Phase 04.`);
  });
});

if ($('logoutButton')) {
  $('logoutButton').addEventListener('click', async () => {
    try {
      await authService.logout();
      window.location.replace('/');
    } catch (err) {
      console.error('[FounderDashboard] Sign out error:', err);
      showToast('Sign out failed. Please try again.');
    }
  });
}

function renderFounderDashboard(context) {
  const { appUser, firebaseUser } = context;
  const displayName = appUser?.profile?.displayName || appUser?.profile?.fullName || firebaseUser?.displayName || 'Founder';
  const roleLabel = appUser?.roles?.includes('FOUNDER') ? 'Founder · Super Admin' : 'Co-Founder · Super Admin';
  const email = appUser?.email || firebaseUser?.email || 'Authorized Super Admin';
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'FC';

  if ($('userName')) $('userName').textContent = displayName;
  if ($('welcomeName')) $('welcomeName').textContent = displayName.split(/\s+/)[0];
  if ($('userRole')) $('userRole').textContent = roleLabel;
  if ($('userAvatar')) $('userAvatar').textContent = initials;
  if ($('profileEmail')) $('profileEmail').textContent = `Signed in as ${email}`;

  // Initial stats
  if ($('founderInternCount')) $('founderInternCount').textContent = '0';
  if ($('founderStaffCount')) $('founderStaffCount').textContent = '1';
  if ($('founderPendingTaskCount')) $('founderPendingTaskCount').textContent = '0';
  if ($('founderAttendanceRate')) $('founderAttendanceRate').textContent = '100%';

  // Domain overview
  if ($('founderDomainTotal')) $('founderDomainTotal').textContent = '0';
  if ($('founderDomainLegend')) {
    $('founderDomainLegend').innerHTML = '<li style="color: #8fa0b5;"><span>Domains provisioned in Phase 04</span><b>0</b></li>';
  }

  // Staff list
  if ($('founderStaffList')) {
    $('founderStaffList').innerHTML = `
      <div class="staff-row">
        <span class="staff-avatar avatar-1">${initials}</span>
        <span class="person">
          <strong>${escapeHtml(displayName)}</strong>
          <small>${escapeHtml(roleLabel)} · Verified Primary Account</small>
        </span>
      </div>
      <p style="margin-top: 0.75rem; font-size: 0.82rem; color: #8fa0b5;">
        Staff directory &amp; delegation workflow scheduled for Phase 03.
      </p>
    `;
  }

  // Activity list
  if ($('founderRecentActivity')) {
    $('founderRecentActivity').innerHTML = `
      <li>
        <strong>Security Baseline Initialized</strong>
        <p style="font-size:0.8rem; color:#8fa0b5; margin:0.25rem 0 0;">
          Authentication accepted, least-privilege MySQL verified, Founder account active.
        </p>
      </li>
    `;
  }

  // Approvals list
  if ($('founderApprovalList')) {
    $('founderApprovalList').innerHTML = '<p style="color: #8fa0b5;">No pending approvals. Intern approval workflow active in Phase 04.</p>';
  }

  // Role candidate dropdown
  if ($('roleCandidate')) {
    $('roleCandidate').innerHTML = '<option value="">No eligible candidates (Phase 03 Staff Management)</option>';
  }
  if ($('roleAssignmentStatus')) {
    $('roleAssignmentStatus').textContent = 'Role assignment via MySQL RBAC will be enabled in Phase 03.';
  }
  if ($('assignRoleButton')) {
    $('assignRoleButton').disabled = true;
  }

  // Intern table
  if ($('internRows')) {
    $('internRows').innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 2rem; color: #8fa0b5;">
          Intern management database integration scheduled for Phase 04.
        </td>
      </tr>
    `;
  }

  if (authState) authState.hidden = true;
  if (shell) shell.hidden = false;
}

// Initialize Auth Service listener
authService.onAuthStateChanged((context) => {
  if (context.isInitializing) return;

  if (!context.isAuthenticated) {
    window.location.replace('/?auth=login');
    return;
  }

  if (context.status !== 'ACTIVE') {
    window.location.replace('/#pending-approval');
    return;
  }

  const isFounder = context.roles.includes('FOUNDER') || context.roles.includes('CO_FOUNDER') || context.workspaces.founder;
  if (!isFounder) {
    console.warn('[FounderDashboard] User does not hold FOUNDER role. Redirecting.');
    window.location.replace('/');
    return;
  }

  renderFounderDashboard(context);
});
