/**
 * IntelliCore Workspace & Account State Routing Engine
 * Version: 2.0.0
 * Architecture: Modular Monolith
 * 
 * Provides deterministic routing across all 8 roles and 13 account lifecycle states.
 */

export function determineWorkspaceRoute(context) {
  if (!context || !context.isAuthenticated) return null;

  const { workspaces = {}, status, roles = [], appUser } = context;

  // 1. Suspended or Inactive Accounts
  if (status === 'SUSPENDED') return '/?error=suspended';
  if (status === 'INACTIVE') return '/?error=inactive';

  // 2. Unverified Email Accounts
  if (!appUser?.emailVerified) {
    return '/?auth=verify';
  }

  // 3. Pending Applicant Onboarding
  if (workspaces.onboarding || (status === 'PENDING' && roles.includes('INTERN'))) {
    return '/dashboards/intern';
  }

  // 4. Non-active accounts cannot access operational workspaces
  if (status !== 'ACTIVE') {
    return '/?auth=login';
  }

  // 5. Role-Specific Workspace Resolution (8 Roles)
  if (roles.includes('FOUNDER')) {
    return '/dashboards/founder';
  }
  if (roles.includes('CO_FOUNDER')) {
    return '/dashboards/co-founder';
  }
  if (roles.includes('ADMIN')) {
    return '/dashboards/admin';
  }
  if (roles.includes('HR_MANAGER')) {
    return '/dashboards/hr';
  }
  if (roles.includes('HR_EXECUTIVE')) {
    return '/dashboards/hr-executive';
  }
  if (roles.includes('OPERATIONS_EXECUTIVE')) {
    return '/dashboards/operations';
  }
  if (roles.includes('TEAM_LEADER') || workspaces.teamLeader) {
    return '/dashboards/team-leader';
  }
  if (roles.includes('INTERN') || workspaces.intern) {
    return '/dashboards/intern';
  }

  // Workspace capability fallbacks
  if (workspaces.founder) return '/dashboards/founder';
  if (workspaces.hr) return '/dashboards/hr';

  return '/';
}
