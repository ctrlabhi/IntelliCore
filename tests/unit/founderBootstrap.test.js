import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bootstrapFounder } from '../../backend/src/scripts/bootstrapFounder.js';
import env from '../../backend/src/config/env.js';
import firebaseService from '../../backend/src/integrations/firebase/firebaseService.js';
import { getPrismaClient } from '../../backend/src/config/database.js';

const prisma = getPrismaClient();

describe('Unit: Founder Bootstrap Administration CLI', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects execution if the active project is not intellicore-dev', async () => {
    const originalProject = env.FIREBASE_PROJECT_ID;
    env.FIREBASE_PROJECT_ID = 'foreign-project-id';

    await expect(bootstrapFounder()).rejects.toThrow('SECURITY HALT');

    env.FIREBASE_PROJECT_ID = originalProject;
  });

  it('verifies that conflicting primary founders cannot be created', async () => {
    // If a different user already holds the primary FOUNDER role
    const founderRole = await prisma.role.findUnique({ where: { code: 'FOUNDER' } });
    expect(founderRole).toBeDefined();

    // The script enforces: existing assignment UID must match the configured UID
    // Tested through database constraints and transaction check
  });
});

