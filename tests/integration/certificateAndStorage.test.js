import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import app from '../../backend/src/app.js';
import firebaseService from '../../backend/src/integrations/firebase/firebaseService.js';
import env from '../../backend/src/config/env.js';
import { buildCertificatePdf } from '../../backend/src/modules/certificates/certificatePdf.js';
import { DatabaseStorageAdapter } from '../../backend/src/integrations/storage/databaseStorageAdapter.js';

// Mock DB
const db = vi.hoisted(() => {
  const store = new Map();
  return {
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    role: { findUnique: vi.fn(), findMany: vi.fn() },
    department: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    staffProfile: { findUnique: vi.fn(), create: vi.fn() },
    internship: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    certificateDispatch: { findUnique: vi.fn(), create: vi.fn(), findMany: vi.fn(), count: vi.fn().mockResolvedValue(0) },
    systemSetting: {
      findUnique: vi.fn(async ({ where }) => {
        const val = store.get(where.key);
        return val ? { id: 's-1', key: where.key, value: val } : null;
      }),
      findMany: vi.fn(async ({ where }) => {
        const prefix = where?.key?.startsWith || '';
        const results = [];
        for (const [k, v] of store.entries()) {
          if (k.startsWith(prefix)) results.push({ key: k, value: v });
        }
        return results.sort((a, b) => a.key.localeCompare(b.key));
      }),
      create: vi.fn(async ({ data }) => {
        store.set(data.key, data.value);
        return { id: 's-1', ...data };
      }),
      upsert: vi.fn(async ({ where, create, update }) => {
        const existing = store.get(where.key);
        const val = existing ? update.value : create.value;
        store.set(where.key, val);
        return { id: 's-1', key: where.key, value: val };
      }),
      deleteMany: vi.fn(async ({ where }) => {
        const prefix = where?.key?.startsWith || '';
        let count = 0;
        for (const k of Array.from(store.keys())) {
          if (k.startsWith(prefix)) {
            store.delete(k);
            count++;
          }
        }
        return { count };
      }),
      delete: vi.fn(async ({ where }) => {
        store.delete(where.key);
        return { key: where.key };
      })
    },
    $transaction: vi.fn(async (fn) => (typeof fn === 'function' ? fn(db) : Promise.all(fn)))
  };
});

vi.mock('../../backend/src/config/database.js', () => ({
  default: db,
  getPrismaClient: () => db,
  checkDatabaseConnection: () => Promise.resolve(true)
}));

function mockAuth(roleCode, { isPrimaryFounder = false } = {}) {
  const uid = isPrimaryFounder ? env.FOUNDER_FIREBASE_UID : `mock-uid-${roleCode.toLowerCase()}`;
  const email = isPrimaryFounder ? env.FOUNDER_EMAIL : `${roleCode.toLowerCase()}@intellicore.test`;
  const userId = `user-id-${roleCode.toLowerCase()}`;

  vi.spyOn(firebaseService, 'verifyIdToken').mockResolvedValue({
    uid,
    email,
    email_verified: true,
    aud: 'intellicore-dev',
    firebase: { sign_in_provider: 'password' }
  });

  const permissionsByRole = {
    FOUNDER: ['*'],
    HR_MANAGER: ['internships:read', 'internships:manage', 'internships:approve_completion'],
    INTERN: ['internships:read_own']
  };

  const rolePerms = (permissionsByRole[roleCode] || []).map((code) => ({
    permission: { code }
  }));

  db.user.findUnique.mockResolvedValue({
    id: userId,
    firebaseUid: uid,
    email,
    status: 'ACTIVE',
    userRoles: [
      {
        role: {
          code: roleCode,
          name: roleCode,
          rolePermissions: rolePerms
        }
      }
    ]
  });

  return { token: `Bearer mock-token-${roleCode}`, userId, email };
}

describe('Certificate Generation, Public Verification & Zero-Cost Document Storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('DatabaseStorageAdapter (Zero-Cost Document Storage)', () => {
    it('persists chunks, streams data accurately, and removes cleanly', async () => {
      const adapter = new DatabaseStorageAdapter();
      const storageKey = randomUUID();
      const payload = Buffer.from('IntelliCore Secure Document Storage Test Content ' + 'X'.repeat(50000));

      // 1. Save
      await adapter.savePrivate(storageKey, payload);

      // 2. Open & Stream
      const stream = await adapter.openPrivate(storageKey);
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      const retrieved = Buffer.concat(chunks);
      expect(retrieved.equals(payload)).toBe(true);

      // 3. Delete
      await adapter.removePrivate(storageKey);

      // 4. Verify Not Found after deletion
      await expect(adapter.openPrivate(storageKey)).rejects.toThrow('Attachment unavailable.');
    });

    it('rejects invalid storage keys with 400', async () => {
      const adapter = new DatabaseStorageAdapter();
      await expect(adapter.savePrivate('invalid-key-format', Buffer.from('test'))).rejects.toThrow(
        'Invalid private attachment identifier.'
      );
    });
  });

  describe('Pure Node.js Vector Certificate PDF Generator', () => {
    it('generates standard PDF-1.4 buffer with correct header and trailer', () => {
      const pdf = buildCertificatePdf({
        recipientName: 'Abhishek Kumar',
        positionTitle: 'Software Engineering Intern',
        departmentName: 'Technology & Architecture',
        commencementDate: '2026-01-01',
        completionDate: '2026-06-30',
        certificateCode: 'IC-CERT-2026-SE-TEST01'
      });

      expect(Buffer.isBuffer(pdf)).toBe(true);
      expect(pdf.length).toBeGreaterThan(500);
      const pdfString = pdf.toString('latin1');
      expect(pdfString.startsWith('%PDF-1.4')).toBe(true);
      expect(pdfString.includes('INTELLICORE TECHNOLOGIES')).toBe(true);
      expect(pdfString.includes('Abhishek Kumar')).toBe(true);
      expect(pdfString.includes('IC-CERT-2026-SE-TEST01')).toBe(true);
      expect(pdfString.includes('%%EOF')).toBe(true);
    });
  });

  describe('Certificate Service & Architecture Boundaries', () => {
    it('allows HR Manager to approve certificate and creates verifiable metadata via service', async () => {
      const hrAuth = mockAuth('HR_MANAGER');
      const targetInternshipId = randomUUID();

      db.internship.findUnique.mockResolvedValue({
        id: targetInternshipId,
        internshipCode: 'INT-2026-001',
        internshipStatus: 'ACTIVE',
        positionTitle: 'Full Stack Intern',
        commencementDate: '2026-01-01',
        expectedCompletionDate: '2026-06-30',
        userId: 'intern-user-01',
        user: { id: 'intern-user-01', email: 'intern@example.com', profile: { fullName: 'Alex Rivera' } },
        department: { name: 'Full Stack Development' }
      });

      db.internship.update.mockResolvedValue({
        id: targetInternshipId,
        internshipStatus: 'COMPLETED'
      });

      const certService = (await import('../../backend/src/modules/certificates/certificateService.js')).default;
      const req = {
        roles: ['HR_MANAGER'],
        user: { id: hrAuth.userId }
      };

      const certData = await certService.approveAndIssueCertificate(req, targetInternshipId, {
        notes: 'Outstanding performance across all sprints.'
      });

      expect(certData.recipientName).toBe('Alex Rivera');
      expect(certData.certificateCode).toMatch(/^IC-CERT-\d{4}-INT2026001-[A-Z0-9]+$/);

      // Verify metadata is now publicly verifiable via service
      const verifyResult = await certService.verifyCertificatePublic(certData.certificateCode);
      expect(verifyResult.valid).toBe(true);
      expect(verifyResult.status).toBe('OFFICIALLY_VERIFIED');
      expect(verifyResult.recipientName).toBe('Alex Rivera');
    });

    it('returns invalid status for unknown certificate codes', async () => {
      const certService = (await import('../../backend/src/modules/certificates/certificateService.js')).default;
      const verifyResult = await certService.verifyCertificatePublic('IC-CERT-NONEXISTENT-999');
      expect(verifyResult.valid).toBe(false);
      expect(verifyResult.message).toBe('No verified certificate found with this identifier.');
    });

    it('serves the public certificate verification page at /verify and /verify.html', async () => {
      const resVerify = await request(app).get('/verify');
      expect(resVerify.status).toBe(200);
      expect(resVerify.text.includes('Certificate Verification')).toBe(true);

      const resVerifyHtml = await request(app).get('/verify.html');
      expect(resVerifyHtml.status).toBe(200);
      expect(resVerifyHtml.text.includes('Certificate Verification')).toBe(true);
    });

    it('strictly preserves negative certificate boundaries across all API routes (returns 404)', async () => {
      const auth = mockAuth('FOUNDER', { isPrimaryFounder: true });
      const forbiddenPaths = [
        '/api/v1/certificates',
        '/api/v1/certificates/me',
        '/api/v1/certificates/verify/12345',
        '/api/v1/certificates/generate',
        '/api/v1/certificates/download',
        '/api/v1/verify-certificate',
        '/certificates/me'
      ];

      for (const p of forbiddenPaths) {
        const res = await request(app).get(p).set('Authorization', auth.token);
        expect(res.status).toBe(404);
      }
    });
  });
});
