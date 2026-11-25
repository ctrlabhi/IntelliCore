import { describe, expect, it } from 'vitest';
import { determineWorkspaceRoute } from '../../backend/src/utils/workspaceRouting.js';

describe('Phase 09: Workspace Resolution & Account State Routing', () => {
  it('rejects unauthenticated visitors', () => {
    expect(determineWorkspaceRoute(null)).toBeNull();
    expect(determineWorkspaceRoute({ isAuthenticated: false })).toBeNull();
  });

  it('routes unverified accounts to verification state on landing page', () => {
    const context = {
      isAuthenticated: true,
      status: 'PENDING',
      appUser: { emailVerified: false },
      roles: ['INTERN']
    };
    expect(determineWorkspaceRoute(context)).toBe('/?auth=verify');
  });

  it('routes suspended and inactive accounts to informative error states', () => {
    const suspended = {
      isAuthenticated: true,
      status: 'SUSPENDED',
      appUser: { emailVerified: true },
      roles: ['INTERN']
    };
    expect(determineWorkspaceRoute(suspended)).toBe('/?error=suspended');

    const inactive = {
      isAuthenticated: true,
      status: 'INACTIVE',
      appUser: { emailVerified: true },
      roles: ['INTERN']
    };
    expect(determineWorkspaceRoute(inactive)).toBe('/?error=inactive');
  });

  it('routes pending applicant with verified email to onboarding in intern workspace', () => {
    const context = {
      isAuthenticated: true,
      status: 'PENDING',
      appUser: { emailVerified: true },
      roles: ['INTERN'],
      workspaces: { onboarding: true }
    };
    expect(determineWorkspaceRoute(context)).toBe('/dashboards/intern');
  });

  it('routes all eight active system roles to their dedicated authorized workspaces', () => {
    const base = {
      isAuthenticated: true,
      status: 'ACTIVE',
      appUser: { emailVerified: true },
      workspaces: {}
    };

    // 1. Founder
    expect(determineWorkspaceRoute({ ...base, roles: ['FOUNDER'], workspaces: { founder: true } }))
      .toBe('/dashboards/founder');

    // 2. Co-Founder
    expect(determineWorkspaceRoute({ ...base, roles: ['CO_FOUNDER'], workspaces: { founder: true } }))
      .toBe('/dashboards/co-founder');

    // 3. System Administrator
    expect(determineWorkspaceRoute({ ...base, roles: ['ADMIN'], workspaces: { admin: true } }))
      .toBe('/dashboards/admin');

    // 4. HR Manager
    expect(determineWorkspaceRoute({ ...base, roles: ['HR_MANAGER'], workspaces: { hr: true } }))
      .toBe('/dashboards/hr');

    // 5. HR Executive
    expect(determineWorkspaceRoute({ ...base, roles: ['HR_EXECUTIVE'], workspaces: { hr: true } }))
      .toBe('/dashboards/hr-executive');

    // 6. Operations Executive
    expect(determineWorkspaceRoute({ ...base, roles: ['OPERATIONS_EXECUTIVE'], workspaces: { operations: true } }))
      .toBe('/dashboards/operations');

    // 7. Team Leader
    expect(determineWorkspaceRoute({ ...base, roles: ['TEAM_LEADER'], workspaces: { teamLeader: true } }))
      .toBe('/dashboards/team-leader');

    // 8. Intern
    expect(determineWorkspaceRoute({ ...base, roles: ['INTERN'], workspaces: { intern: true } }))
      .toBe('/dashboards/intern');
  });

  it('handles multi-role priority without privilege leakage', () => {
    const founderWithIntern = {
      isAuthenticated: true,
      status: 'ACTIVE',
      appUser: { emailVerified: true },
      roles: ['FOUNDER', 'INTERN'],
      workspaces: { founder: true, intern: true }
    };
    expect(determineWorkspaceRoute(founderWithIntern)).toBe('/dashboards/founder');

    const adminWithOps = {
      isAuthenticated: true,
      status: 'ACTIVE',
      appUser: { emailVerified: true },
      roles: ['ADMIN', 'OPERATIONS_EXECUTIVE'],
      workspaces: { admin: true, operations: true }
    };
    expect(determineWorkspaceRoute(adminWithOps)).toBe('/dashboards/admin');
  });
});
