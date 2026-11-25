/**
 * IntelliCore Team Leader Dashboard Script
 * Version: 2.0.0
 * Architecture: Modular Monolith (Firebase Auth + MySQL RBAC via Express REST API)
 * Phase: MASTER-PHASE-02C (Authentication Acceptance & Security Hardening)
 */

import { authService } from '/services/auth.js';
import { loadEnrollmentCounts, mountPhase04 } from './phase04-dashboard.js';
import { mountStaffAttendance } from './phase05-dashboard.js';
import { mountWork } from './phase06-dashboard.js';
import { mountNotifications } from './phase07-dashboard.js';
import { mountPhase08 } from './phase08-dashboard.js';

const $ = (id) => document.getElementById(id);
const authState = $('authState');
const shell = $('dashboardShell');
let toastTimer;

function showToast(text) {
  const toast = $('toast');
  if (!toast) return;
  toast.textContent = text;
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

if ($('logoutButton')) {
  $('logoutButton').addEventListener('click', async () => {
    try {
      await authService.logout();
      window.location.replace('/');
    } catch (err) {
      console.error('[TLDashboard] Sign out error:', err);
      showToast('Sign out failed. Please try again.');
    }
  });
}

function renderTLDashboard(context) {
  const { appUser, firebaseUser } = context;
  const displayName = appUser?.profile?.displayName || appUser?.profile?.fullName || firebaseUser?.displayName || 'Team Leader';
  const email = appUser?.email || firebaseUser?.email || 'Authorized Team Leader';
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'TL';

  if ($('userName')) $('userName').textContent = displayName;
  if ($('welcomeName')) $('welcomeName').textContent = displayName.split(/\s+/)[0];
  if ($('userRole')) $('userRole').textContent = 'Team Leader';
  if ($('userAvatar')) $('userAvatar').textContent = initials;
  if ($('profileEmail')) $('profileEmail').textContent = `Signed in as ${email}`;

  if (authState) authState.hidden = true;
  if (shell) shell.hidden = false;
  mountPhase04($('interns'), context, 'leader', () => loadEnrollmentCounts('tlInternCount', 'tlActiveCount'));
  mountStaffAttendance(context, $('interns'));
  void mountWork($('phase06Work'), context);
  mountNotifications($('phase07Workspace'), context);
  mountPhase08($('phase08Workspace'), context);
}

authService.onAuthStateChanged((context) => {
  if (context.isInitializing) return;

  if (!context.isAuthenticated) {
    window.location.replace('/?auth=login');
    return;
  }

  if (context.status !== 'ACTIVE' || !context.appUser.emailVerified) {
    window.location.replace(authService.determineDashboardRoute(context));
    return;
  }

  const isAuthorized =
    context.workspaces.teamLeader ||
    context.workspaces.admin ||
    context.workspaces.founder ||
    context.roles.some((r) => ['FOUNDER', 'CO_FOUNDER', 'ADMIN', 'TEAM_LEADER'].includes(r));

  if (!isAuthorized) {
    console.warn('[TLDashboard] User does not have Team Leader authorization. Redirecting.');
    window.location.replace('/');
    return;
  }

  renderTLDashboard(context);
});
