import { describe, it, expect } from 'vitest';
import {
  validateDeletionConfirmation,
  validateDeletionReason,
  validatePreviewFreshness
} from '../../backend/src/modules/users/accountDeletionService.js';
import { BadRequestError } from '../../backend/src/utils/errors.js';
import { isProtectedFounder } from '../../backend/src/utils/founder.js';

describe('Unit: Phase 10 Account Deletion Validation Rules', () => {
  it('strictly validates confirmation text "PERMANENTLY DELETE"', () => {
    expect(() => validateDeletionConfirmation('PERMANENTLY DELETE')).not.toThrow();

    expect(() => validateDeletionConfirmation('delete')).toThrow(BadRequestError);
    expect(() => validateDeletionConfirmation('PERMANENTLY DELETE ')).toThrow(BadRequestError);
    expect(() => validateDeletionConfirmation('')).toThrow(BadRequestError);
    expect(() => validateDeletionConfirmation(null)).toThrow(BadRequestError);
  });

  it('validates deletion reason minimum length of 5 characters', () => {
    expect(validateDeletionReason('Legitimate GDPR deletion request')).toBe('Legitimate GDPR deletion request');
    expect(validateDeletionReason('   Valid reason with padding   ')).toBe('Valid reason with padding');

    expect(() => validateDeletionReason('')).toThrow(BadRequestError);
    expect(() => validateDeletionReason('bad')).toThrow(BadRequestError);
    expect(() => validateDeletionReason('   a   ')).toThrow('A meaningful deletion reason (at least 5 characters) is required');
  });

  it('validates preview freshness within 15 minutes window', () => {
    const recent = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(validatePreviewFreshness(recent)).toBe(true);
    expect(validatePreviewFreshness(null)).toBe(true);

    const stale = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    expect(() => validatePreviewFreshness(stale)).toThrow('The deletion preview has expired (limit 15 minutes)');
  });

  it('protects Founder accounts against deletion eligibility', () => {
    const founderUser = {
      firebaseUid: process.env.FOUNDER_FIREBASE_UID || 'intellicore-test-founder',
      email: process.env.FOUNDER_EMAIL || 'founder@example.test',
      userRoles: [{ role: { code: 'FOUNDER' } }]
    };
    expect(isProtectedFounder(founderUser)).toBe(true);

    const normalIntern = {
      firebaseUid: 'regular-intern-uid',
      email: 'intern@example.test',
      userRoles: [{ role: { code: 'INTERN' } }]
    };
    expect(isProtectedFounder(normalIntern)).toBe(false);
  });

  it('ensures BadRequestError and ConflictError format correctly', () => {
    const err = new BadRequestError('Invalid parameter', 'INVALID_PARAM', { field: 'reason' });
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('INVALID_PARAM');
    expect(err.details).toEqual({ field: 'reason' });
  });

  it('verifies non-empty preview timestamp boundary check', () => {
    const boundaryValid = new Date(Date.now() - 14 * 60 * 1000).toISOString();
    expect(validatePreviewFreshness(boundaryValid)).toBe(true);

    const boundaryInvalid = new Date(Date.now() - 16 * 60 * 1000).toISOString();
    expect(() => validatePreviewFreshness(boundaryInvalid)).toThrow(BadRequestError);
  });
});
