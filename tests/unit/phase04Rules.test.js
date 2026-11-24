import { describe, expect, it, vi } from 'vitest';
import { addCalendarMonths, businessDate, businessToday, transaction } from '../../backend/src/utils/phase04.js';
import { assertNoOverlap, effectiveStatus, internshipScope, statusFilter } from '../../backend/src/modules/internships/internshipPolicy.js';
import { isolatedDatabaseUrl } from '../integration/testDatabase.js';
import { getPrismaClient } from '../../backend/src/config/database.js';

describe('Phase 04 domain rules', () => {
  it('validates real calendar days and adds months using the last valid day', () => {
    expect(businessDate.safeParse('2034-02-30').success).toBe(false);
    expect(businessDate.safeParse('2034-01-31T00:00:00Z').success).toBe(false);
    expect(addCalendarMonths(businessDate.parse('2032-01-31'), 1).toISOString().slice(0, 10)).toBe('2032-02-29');
  });

  it('gates commencement and completion on the India business date', () => {
    const enrollment = { internshipStatus: 'APPROVED', commencementDate: new Date('2026-11-25'),
      expectedCompletionDate: new Date('2026-11-26') };
    const before = businessToday(new Date('2026-11-24T18:29:59Z'));
    const start = businessToday(new Date('2026-11-24T18:30:00Z'));
    const after = businessToday(new Date('2026-11-26T18:30:00Z'));
    expect(effectiveStatus(enrollment, before)).toBe('APPROVED');
    expect(effectiveStatus(enrollment, start)).toBe('ONGOING');
    expect(effectiveStatus(enrollment, after)).toBe('COMPLETION_REVIEW');
    expect(effectiveStatus({ ...enrollment, internshipStatus: 'TERMINATED' }, after)).toBe('TERMINATED');
    expect(statusFilter('ONGOING', start)).toHaveProperty('commencementDate.lte', start);
  });

  it('checks inclusive overlaps across departments and ignores terminal states', async () => {
    const query = vi.fn().mockResolvedValue({ id: 'existing' });
    const commencementDate = new Date('2034-01-31');
    const expectedCompletionDate = new Date('2034-02-28');
    await expect(assertNoOverlap({ internship: { findFirst: query } }, {
      userId: 'applicant', commencementDate, expectedCompletionDate
    })).rejects.toMatchObject({ code: 'INTERNSHIP_OVERLAP' });
    expect(query).toHaveBeenCalledWith(expect.objectContaining({ where: {
      userId: 'applicant', internshipStatus: { in: ['APPROVED', 'ONGOING', 'COMPLETION_REVIEW'] },
      commencementDate: { lte: expectedCompletionDate }, expectedCompletionDate: { gte: commencementDate }
    } }));
  });

  it('limits Team Leader reads to active department assignments and never trusts the role alone', () => {
    const actor = { user: { status: 'ACTIVE', id: 'leader' }, roles: ['TEAM_LEADER'] };
    expect(internshipScope({ ...actor, permissions: ['internships:read_all'] })).toEqual({ userId: 'leader' });
    expect(internshipScope({ ...actor, permissions: ['internships:read_department'] }).OR[1]).toMatchObject({
      department: { isActive: true, userDepartments: { some: {
        userId: 'leader', assignedRole: 'TEAM_LEADER', isActive: true
      } } }
    });
  });

  it('retries isolated write contention and unique code races', async () => {
    const prisma = getPrismaClient();
    const spy = vi.spyOn(prisma, '$transaction')
      .mockRejectedValueOnce({ code: 'P2034' }).mockRejectedValueOnce({ code: 'P2002' }).mockResolvedValueOnce('saved');
    try {
      await expect(transaction(() => {}, { retryUnique: true })).resolves.toBe('saved');
      expect(spy).toHaveBeenCalledTimes(3);
    } finally {
      spy.mockRestore();
    }
  });

  it('refuses the normal development schema, privileged users, remote hosts and connection options before fixture writes', () => {
    expect(isolatedDatabaseUrl()).toBeNull();
    expect(isolatedDatabaseUrl('mysql://intellicore_test_user:x@127.0.0.1:33306/intellicore_test_phase04')).toContain('intellicore_test_phase04');
    for (const url of [
      'mysql://intellicore_test_user:x@127.0.0.1:33306/intellicore_db',
      'mysql://root:x@127.0.0.1:33306/intellicore_test_phase04',
      'mysql://intellicore_test_user:x@mysql.example.test:33306/intellicore_test_phase04',
      'mysql://intellicore_test_user:x@127.0.0.1:33306/intellicore_test_phase04?socket=anything'
    ]) expect(() => isolatedDatabaseUrl(url)).toThrow('dedicated intellicore_test_* database');
  });
});
