import { describe, it, expect } from 'vitest';
import { AppError, NotFoundError, ValidationError } from '../../backend/src/utils/errors.js';
import { formatIstDateString, isWithinBusinessHours } from '../../backend/src/utils/timezone.js';

describe('Unit: Application Utilities', () => {
  describe('Custom Errors', () => {
    it('should create AppError with status and code', () => {
      const err = new AppError('Something broke', 500, 'INTERNAL');
      expect(err.message).toBe('Something broke');
      expect(err.statusCode).toBe(500);
      expect(err.code).toBe('INTERNAL');
    });

    it('should create NotFoundError with 404 status', () => {
      const err = new NotFoundError('Item missing');
      expect(err.statusCode).toBe(404);
      expect(err.code).toBe('NOT_FOUND');
    });

    it('should create ValidationError with 400 status', () => {
      const err = new ValidationError('Bad input');
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Timezone & Business Calendar', () => {
    it('should format date string in YYYY-MM-DD pattern', () => {
      const formatted = formatIstDateString(new Date('2026-11-24T05:00:00Z'));
      expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should return boolean for business hours check', () => {
      const inHours = isWithinBusinessHours(new Date());
      expect(typeof inHours).toBe('boolean');
    });
  });
});

