/**
 * IntelliCore Founder Command Center Dashboard Script
 * Version: 2.0.0
 * Architecture: Modular Monolith (Firebase Auth + MySQL RBAC via Express REST API)
 * Phase: MASTER-PHASE-03 (RBAC Enforcement, User Management & Staff Administration)
 */

import { authService } from '/services/auth.js';
import { api } from '/services/api.js';
import { mountPhase04 } from './phase04-dashboard.js';

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
    if (action === 'Assign staff access') {
      window.location.hash = '#roleAssignments';
      $('roleCandidate')?.focus();
    } else if (action === 'Review approvals' || action === 'View domains') {
      window.location.hash = action === 'Review approvals' ? '#phase04Applications'
        : $('phase04Departments') ? '#phase04Departments' : '#domains';
    } else {
      showToast(`${action} workflow activated.`);
    }
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

/**
 * Loads real-time MySQL administrative metrics, staff, audit logs, and candidate accounts.
 */
async function loadFounderStats() {
  try {
    const statsRes = await api.get('/admin/stats');
    if (statsRes && statsRes.data) {
      const stats = statsRes.data;
      const pending = stats.applications.PENDING_APPROVAL ?? 0;
      const metrics = {
        founderInternCount: stats.internships.ONGOING,
        founderStaffCount: stats.staff.active,
        founderPendingTaskCount: pending,
        founderAttendanceRate: stats.internships.COMPLETED,
        founderDomainTotal: stats.departments.active,
        founderApprovalCount: pending
      };
      for (const [id, value] of Object.entries(metrics)) if ($(id)) $(id).textContent = value;
      if ($('founderApprovalCount')) $('founderApprovalCount').hidden = !pending;
      if ($('founderApprovalList')) $('founderApprovalList').textContent = pending
        ? `${pending} application${pending === 1 ? '' : 's'} await review.` : 'No pending applications.';
      if ($('founderDomainLegend')) {
        $('founderDomainLegend').replaceChildren(...stats.departments.counts.map(({ name, internships }) => {
          const item = document.createElement('li');
          item.textContent = `${name} · ${internships}`;
          return item;
        }));
      }
      if ($('founderLiveOverview')) {
        $('founderLiveOverview').replaceChildren(...[
          ['Approved to start', stats.internships.APPROVED],
          ['Ongoing', stats.internships.ONGOING],
          ['Awaiting completion review', stats.internships.COMPLETION_REVIEW],
          ['Completed', stats.internships.COMPLETED]
        ].map(([label, count]) => {
          const metric = document.createElement('p');
          metric.textContent = `${label} · ${count}`;
          return metric;
        }));
      }
    }
  } catch (err) {
    console.warn('[FounderDashboard] Failed to fetch stats:', err);
  }
}

async function loadLiveDashboardData(canProvision = true) {
  try {
    // 2. Fetch live staff directory
    const staffRes = await api.get('/staff?limit=20');
    if (staffRes && staffRes.data && $('founderStaffList')) {
      const staffList = staffRes.data.staff || [];
      if (staffList.length === 0) {
        $('founderStaffList').innerHTML = '<p style="color: #8fa0b5;">No provisioned staff members yet.</p>';
      } else {
        $('founderStaffList').innerHTML = staffList
          .map((stf, index) => {
            const name = stf.user?.fullName || stf.user?.email || 'Staff';
            const initials = name
              .split(/\s+/)
              .slice(0, 2)
              .map((p) => p[0])
              .join('')
              .toUpperCase() || 'ST';
            const statusClass = stf.employmentStatus === 'ACTIVE' ? 'badge-active' : 'badge-suspended';
            const roleName = stf.user?.roles?.map((r) => r.name).join(', ') || stf.designation;

            return `
              <div class="staff-row">
                <span class="staff-avatar avatar-${(index % 4) + 1}">${escapeHtml(initials)}</span>
                <span class="person">
                  <strong>${escapeHtml(name)}</strong>
                  <small>${escapeHtml(stf.staffCode)} · ${escapeHtml(stf.designation)} (${escapeHtml(roleName)})</small>
                </span>
                <span class="staff-status ${statusClass}" style="margin-left:auto; font-size:0.75rem; padding: 2px 8px; border-radius: 4px; background: rgba(0,214,160,0.12); color: #00d6a0;">${escapeHtml(stf.employmentStatus)}</span>
              </div>
            `;
          })
          .join('');
      }
    }
  } catch (err) {
    console.warn('[FounderDashboard] Failed to fetch staff directory:', err);
  }

  try {
    // 3. Fetch recent audit activity
    const auditRes = await api.get('/audit-logs?limit=5');
    if (auditRes && auditRes.data && $('founderRecentActivity')) {
      const logs = auditRes.data.logs || [];
      if (logs.length === 0) {
        $('founderRecentActivity').innerHTML = '<li><p style="color:#8fa0b5;">No audit log records found.</p></li>';
      } else {
        $('founderRecentActivity').innerHTML = logs
          .map((log) => {
            const timeAgo = new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return `
              <li>
                <strong>${escapeHtml(log.action.replace(/_/g, ' '))}</strong>
                <p style="font-size:0.8rem; color:#8fa0b5; margin:0.25rem 0 0;">
                  By <em>${escapeHtml(log.actor?.name || log.actor?.email || 'System')}</em> on ${escapeHtml(log.resourceType)} (${escapeHtml(timeAgo)})
                </p>
              </li>
            `;
          })
          .join('');
      }
    }
  } catch (err) {
    console.warn('[FounderDashboard] Failed to fetch audit logs:', err);
  }

  if (!canProvision) return;
  try {
    // Load verified accounts eligible for staff review.
    const usersRes = await api.get('/users?limit=50');
    if (usersRes && usersRes.data) {
      const users = usersRes.data.users || [];

      // Filter users who are not yet staff for the role assignment dropdown
      const eligibleCandidates = users.filter((u) => u.emailVerified && ['ACTIVE', 'PENDING'].includes(u.status)
        && !u.isStaff && !u.roles.some((r) => r.code === 'FOUNDER'));
      if ($('roleCandidate')) {
        if (eligibleCandidates.length === 0) {
          $('roleCandidate').innerHTML = '<option value="">No unassigned intern candidates</option>';
          if ($('assignRoleButton')) $('assignRoleButton').disabled = true;
          if ($('roleAssignmentStatus')) $('roleAssignmentStatus').textContent = 'All registered users currently have assigned roles.';
        } else {
          $('roleCandidate').innerHTML =
            '<option value="">Select a registered intern candidate...</option>' +
            eligibleCandidates
              .map((u) => {
                const label = u.profile?.fullName ? `${u.profile.fullName} (${u.email})` : u.email;
                return `<option value="${escapeHtml(u.id)}">${escapeHtml(label)}</option>`;
              })
              .join('');
          if ($('assignRoleButton')) $('assignRoleButton').disabled = false;
          if ($('roleAssignmentStatus')) $('roleAssignmentStatus').textContent = `${eligibleCandidates.length} candidate(s) ready for staff provisioning.`;
        }
      }

    }
  } catch (err) {
    console.warn('[FounderDashboard] Failed to fetch users list:', err);
  }
}

// Role assignment form submission
const roleForm = $('roleAssignmentForm');
if (roleForm) {
  roleForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const candidateId = $('roleCandidate')?.value;
    const selectedRole = $('assignedRole')?.value;

    if (!candidateId) {
      showToast('Please select a candidate user.');
      return;
    }
    if (!selectedRole) {
      showToast('Please select a role to assign.');
      return;
    }

    // Map UI role values to system role codes
    const roleMapping = {
      mentor: 'TEAM_LEADER',
      hr_manager: 'HR_MANAGER',
      hr_executive: 'HR_EXECUTIVE',
      operations_executive: 'OPERATIONS_EXECUTIVE',
      TEAM_LEADER: 'TEAM_LEADER',
      HR_MANAGER: 'HR_MANAGER',
      HR_EXECUTIVE: 'HR_EXECUTIVE',
      OPERATIONS_EXECUTIVE: 'OPERATIONS_EXECUTIVE'
    };

    const roleCode = roleMapping[selectedRole] || selectedRole;
    const designationLabels = {
      TEAM_LEADER: 'Technical Team Leader',
      HR_MANAGER: 'Human Resources Manager',
      HR_EXECUTIVE: 'HR Operations Executive',
      OPERATIONS_EXECUTIVE: 'Operations Executive'
    };

    const designation = designationLabels[roleCode] || 'Staff Member';

    try {
      if ($('assignRoleButton')) $('assignRoleButton').disabled = true;
      if ($('roleAssignmentStatus')) $('roleAssignmentStatus').textContent = 'Provisioning staff account...';

      const res = await api.post('/staff', {
        userId: candidateId,
        designation,
        joiningDate: new Date().toISOString(),
        roleCode
      });

      if (res && res.success) {
        showToast(`Staff member provisioned: ${res.data.staffCode} (${res.data.role?.name || roleCode})`);
        if ($('roleAssignmentStatus')) $('roleAssignmentStatus').textContent = `Successfully provisioned ${res.data.staffCode}!`;
        await Promise.all([loadLiveDashboardData(), loadFounderStats()]);
      }
    } catch (err) {
      console.error('[FounderDashboard] Staff provisioning error:', err);
      showToast(err.message || 'Failed to provision staff member.');
      if ($('roleAssignmentStatus')) $('roleAssignmentStatus').textContent = `Error: ${err.message || 'Provisioning failed'}`;
    } finally {
      if ($('assignRoleButton')) $('assignRoleButton').disabled = false;
    }
  });
}

// Refresh candidates button
if ($('refreshRoleCandidates')) {
  $('refreshRoleCandidates').addEventListener('click', async () => {
    showToast('Refreshing live data...');
    await loadLiveDashboardData();
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

  if (authState) authState.hidden = true;
  if (shell) shell.hidden = false;

  // Load live data from MySQL via Express API
  const canProvision = context.permissions.includes('staff:create');
  if ($('roleAssignments')) $('roleAssignments').hidden = !canProvision;
  document.querySelectorAll('[data-founder-action="Assign staff access"]').forEach((button) => {
    button.hidden = !canProvision;
  });
  mountPhase04($('interns'), context, 'founder', loadFounderStats);
  loadLiveDashboardData(canProvision);
}

// Initialize Auth Service listener
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

  const isFounder = context.roles.includes('FOUNDER') || context.roles.includes('CO_FOUNDER') || context.workspaces.founder;
  if (!isFounder) {
    console.warn('[FounderDashboard] User does not hold FOUNDER role. Redirecting.');
    window.location.replace('/');
    return;
  }

  renderFounderDashboard(context);
});
