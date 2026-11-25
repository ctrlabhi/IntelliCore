/**
 * IntelliCore HR Management Dashboard Script
 * Version: 2.0.0
 * Architecture: Modular Monolith (Firebase Auth + MySQL RBAC via Express REST API)
 * Phase: MASTER-PHASE-02C (Authentication Acceptance & Security Hardening)
 */

import { authService } from '/services/auth.js';
import { loadEnrollmentCounts, mountPhase04 } from './phase04-dashboard.js';
import { mountStaffAttendance } from './phase05-dashboard.js';
import { mountWork } from './phase06-dashboard.js';
import { mountNotifications } from './phase07-dashboard.js';

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
      console.error('[HRDashboard] Sign out error:', err);
      showToast('Sign out failed. Please try again.');
    }
  });
}

function renderHRDashboard(context) {
  const { appUser, firebaseUser } = context;
  const displayName = appUser?.profile?.displayName || appUser?.profile?.fullName || firebaseUser?.displayName || 'HR Manager';
  const roleCode = appUser?.roles?.find((r) => r.startsWith('HR_') || ['ADMIN', 'FOUNDER', 'OPERATIONS_EXECUTIVE'].includes(r)) || 'HR_MANAGER';
  const roleLabel = roleCode.replace(/_/g, ' ');
  const email = appUser?.email || firebaseUser?.email || 'Authorized HR Staff';
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'HR';

  if ($('userName')) $('userName').textContent = displayName;
  if ($('welcomeName')) $('welcomeName').textContent = displayName.split(/\s+/)[0];
  if ($('userRole')) $('userRole').textContent = roleLabel;
  if ($('userAvatar')) $('userAvatar').textContent = initials;
  if ($('profileEmail')) $('profileEmail').textContent = `Signed in as ${email}`;

  if (authState) authState.hidden = true;
  if (shell) shell.hidden = false;
  mountPhase04($('interns'), context, 'hr', () => loadEnrollmentCounts('liveInternCount', 'liveActiveCount'));
  mountStaffAttendance(context, $('interns'));
  void mountWork($('phase06Work'), context);
  mountNotifications($('phase07Workspace'), context);
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
    context.workspaces.hr ||
    context.workspaces.admin ||
    (context.workspaces.operations && context.roles.includes('OPERATIONS_EXECUTIVE')) ||
    context.workspaces.founder ||
    context.roles.some((r) => ['FOUNDER', 'CO_FOUNDER', 'ADMIN', 'HR_MANAGER', 'HR_EXECUTIVE'].includes(r));

  if (!isAuthorized) {
    console.warn('[HRDashboard] User does not have HR authorization. Redirecting.');
    window.location.replace('/');
    return;
  }

  renderHRDashboard(context);
});
