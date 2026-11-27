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
    fileAttachment: {
      findUnique: vi.fn(async ({ where }) => {
        return null; // For orphaned cleanup testing
      }),
      aggregate: vi.fn().mockResolvedValue({ _sum: { fileSize: 0 } }),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn()
    },
    certificateDispatch: { findUnique: vi.fn(), create: vi.fn(), findMany: vi.fn(), count: vi.fn().mockResolvedValue(0) },
    auditLog: { create: vi.fn() },
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

describe('Certificate APIs & Hardened Database Storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Hardened DatabaseStorageAdapter (Integrity, Quota & Cleanup)', () => {
    it('persists chunks, verifies SHA-256 integrity, and retrieves accurately', async () => {
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

    it('cleans up orphaned blobs that are not in file_attachments', async () => {
      const adapter = new DatabaseStorageAdapter();
      const orphanedKey = randomUUID();
      await adapter.savePrivate(orphanedKey, Buffer.from('orphaned content'));

      const result = await adapter.cleanupOrphanedBlobs();
      expect(result.cleaned).toBeGreaterThanOrEqual(1);

      // Verify blob is gone
      await expect(adapter.openPrivate(orphanedKey)).rejects.toThrow('Attachment unavailable.');
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

  describe('Active Certificate Endpoints & Public Verification APIs', () => {
    it('allows HR Manager to approve and generate certificates via POST /api/v1/certificates/approve', async () => {
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

      // 1. Approve certificate
      const approveRes = await request(app)
        .post('/api/v1/certificates/approve')
        .set('Authorization', hrAuth.token)
        .send({ internshipId: targetInternshipId, notes: 'Outstanding sprint delivery.' });

      expect(approveRes.status).toBe(201);
      expect(approveRes.body.success).toBe(true);
      const certCode = approveRes.body.data.certificateCode;
      expect(certCode).toMatch(/^IC-CERT-\d{4}-INT2026001-[A-Z0-9]+$/);
      expect(approveRes.body.data.recipientName).toBe('Alex Rivera');

      // 2. Public verification by code (GET /api/v1/certificates/verify/:code)
      const verifyRes = await request(app).get(`/api/v1/certificates/verify/${certCode}`);
      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.success).toBe(true);
      expect(verifyRes.body.data.valid).toBe(true);
      expect(verifyRes.body.data.status).toBe('OFFICIALLY_VERIFIED');
      expect(verifyRes.body.data.recipientName).toBe('Alex Rivera');

      // 3. Public verification via query parameter (GET /api/v1/verify-certificate?code=...)
      const verifyQueryRes = await request(app).get(`/api/v1/verify-certificate?code=${certCode}`);
      expect(verifyQueryRes.status).toBe(200);
      expect(verifyQueryRes.body.data.valid).toBe(true);

      // 4. Download PDF certificate (GET /api/v1/certificates/:code/download)
      const downloadRes = await request(app)
        .get(`/api/v1/certificates/${certCode}/download`)
        .set('Authorization', hrAuth.token);
      expect(downloadRes.status).toBe(200);
      expect(downloadRes.headers['content-type']).toBe('application/pdf');
      expect(downloadRes.headers['content-disposition']).toContain('.pdf');

      // 5. Read metadata (GET /api/v1/certificates/:code and /internships/:id/certificate)
      const metaRes = await request(app)
        .get(`/api/v1/certificates/${certCode}`)
        .set('Authorization', hrAuth.token);
      expect(metaRes.status).toBe(200);
      expect(metaRes.body.data.certificateCode).toBe(certCode);

      // Verify no fake CertificateDispatch record was written during PDF certificate approval
      expect(db.certificateDispatch.create).not.toHaveBeenCalled();
      expect(db.auditLog.create).toHaveBeenCalled();
    });

    it('enforces resource ownership on certificate metadata lookup and blocks terminated internships', async () => {
      const hrAuth = mockAuth('HR_MANAGER');
      const terminatedId = randomUUID();
      db.internship.findUnique.mockResolvedValue({
        id: terminatedId,
        internshipCode: 'INT-TERM-01',
        internshipStatus: 'TERMINATED',
        userId: 'intern-term-01',
        user: { id: 'intern-term-01', email: 'term@example.com', profile: { fullName: 'Terminated User' } },
        department: { name: 'Engineering' }
      });

      const termRes = await request(app)
        .post('/api/v1/certificates/approve')
        .set('Authorization', hrAuth.token)
        .send({ internshipId: terminatedId });
      expect(termRes.status).toBe(409);
      expect(termRes.body.error.code).toBe('INVALID_INTERNSHIP_STATE');

      // Non-owner intern cannot read another intern's certificate metadata
      mockAuth('INTERN');
      db.internship.findUnique.mockResolvedValue({
        id: 'other-intern-int-01',
        userId: 'completely-different-user'
      });
      const forbiddenRes = await request(app)
        .get(`/api/v1/internships/${randomUUID()}/certificate`)
        .set('Authorization', 'Bearer mock-token-INTERN');
      expect(forbiddenRes.status).toBe(403);
    });

    it('rejects unauthenticated certificate approval with 401', async () => {
      const res = await request(app)
        .post('/api/v1/certificates/approve')
        .send({ internshipId: randomUUID() });
      expect(res.status).toBe(401);
    });

    it('returns 404 for unknown subroutes under /api/v1/certificates', async () => {
      const auth = mockAuth('FOUNDER', { isPrimaryFounder: true });
      const res = await request(app)
        .get('/api/v1/certificates/unknown-subroute-999')
        .set('Authorization', auth.token);
      expect(res.status).toBe(404);
    });

    it('serves the public certificate verification page at /verify and /verify.html', async () => {
      const resVerify = await request(app).get('/verify');
      expect(resVerify.status).toBe(200);
      expect(resVerify.text.includes('Certificate Verification')).toBe(true);

      const resVerifyHtml = await request(app).get('/verify.html');
      expect(resVerifyHtml.status).toBe(200);
      expect(resVerifyHtml.text.includes('Certificate Verification')).toBe(true);
    });
  });
});
