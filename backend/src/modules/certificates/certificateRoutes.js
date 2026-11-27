import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireAuth, requireRole, requireStatus, requireVerifiedEmail } from '../../middleware/auth.js';
import { endpoint, uuid } from '../../utils/phase04.js';
import certificateService from './certificateService.js';
import { sendSuccess } from '../../utils/response.js';
import { NotFoundError } from '../../utils/errors.js';

const router = Router();
const id = (req) => uuid.parse(req.params.id);
const approveSchema = z.object({
  internshipId: uuid.optional(),
  notes: z.string().trim().min(1).max(500).optional()
}).strict();

const guardCertificateCode = (req, res, next) => {
  if (req.params.code && ['me', 'qr-code'].includes(req.params.code.toLowerCase())) {
    return next('route');
  }
  next();
};

// -----------------------------------------------------------------------------
// 1. Public Online Certificate Verification (No authentication required)
// -----------------------------------------------------------------------------
router.get('/certificates/verify/:code', async (req, res, next) => {
  try {
    const code = req.params.code;
    const result = await certificateService.verifyCertificatePublic(code);
    return sendSuccess(res, result, result.valid ? 'Certificate successfully verified.' : 'Invalid certificate.');
  } catch (error) {
    next(error);
  }
});

router.get('/verify-certificate', async (req, res, next) => {
  try {
    const code = (req.query.code || '').toString();
    const result = await certificateService.verifyCertificatePublic(code);
    return sendSuccess(res, result, result.valid ? 'Certificate successfully verified.' : 'Invalid certificate.');
  } catch (error) {
    next(error);
  }
});

// -----------------------------------------------------------------------------
// 2. HR & Staff Manual Certificate Approval
// -----------------------------------------------------------------------------
router.post(
  ['/certificates/approve', '/internships/:id/certificate/approve'],
  authenticate,
  requireAuth,
  requireVerifiedEmail,
  requireStatus(['ACTIVE']),
  requireRole('FOUNDER', 'CO_FOUNDER', 'HR_MANAGER', 'HR_EXECUTIVE'),
  endpoint(async (req) => {
    const input = approveSchema.parse(req.body ?? {});
    const targetId = req.params.id ? id(req) : input.internshipId;
    if (!targetId) {
      throw new Error('Internship ID is required.');
    }
    return certificateService.approveAndIssueCertificate(req, targetId, input);
  }, 201)
);

// -----------------------------------------------------------------------------
// 3. Certificate Generation Endpoint
// -----------------------------------------------------------------------------
router.post(
  ['/certificates/generate', '/internships/:id/certificate/generate'],
  authenticate,
  requireAuth,
  requireVerifiedEmail,
  requireStatus(['ACTIVE']),
  requireRole('FOUNDER', 'CO_FOUNDER', 'HR_MANAGER', 'HR_EXECUTIVE'),
  endpoint(async (req) => {
    const input = approveSchema.parse(req.body ?? {});
    const targetId = req.params.id ? id(req) : input.internshipId;
    return certificateService.generateCertificate(req, { internshipId: targetId, notes: input.notes });
  }, 201)
);

// -----------------------------------------------------------------------------
// 4. Internship Certificate Metadata Read
// -----------------------------------------------------------------------------
router.get(
  ['/certificates/:code', '/internships/:id/certificate'],
  guardCertificateCode,
  authenticate,
  requireAuth,
  requireVerifiedEmail,
  requireStatus(['ACTIVE', 'PENDING']),
  endpoint(async (req) => {
    if (req.params.id) {
      const metadata = await certificateService.getCertificateMetadata(id(req), req);
      if (!metadata) throw new NotFoundError('No certificate issued for this internship yet.');
      return metadata;
    }
    const metadata = await certificateService.getCertificateByCode(req.params.code, req);
    if (!metadata) throw new NotFoundError('Certificate record not found.');
    return metadata;
  })
);

// -----------------------------------------------------------------------------
// 5. On-Demand Vector PDF Certificate Download Stream
// -----------------------------------------------------------------------------
router.get(
  [
    '/certificates/download',
    '/certificates/:code/download',
    '/internships/:id/certificate/download'
  ],
  guardCertificateCode,
  authenticate,
  requireAuth,
  requireVerifiedEmail,
  requireStatus(['ACTIVE']),
  async (req, res, next) => {
    try {
      let result;
      if (req.params.id) {
        result = await certificateService.generateCertificatePdf(req, id(req));
      } else if (req.params.code) {
        result = await certificateService.generateCertificatePdfByCode(req, req.params.code);
      } else if (req.query.code) {
        result = await certificateService.generateCertificatePdfByCode(req, req.query.code.toString());
      } else if (req.query.internshipId) {
        result = await certificateService.generateCertificatePdf(req, uuid.parse(req.query.internshipId.toString()));
      } else {
        return res.status(400).json({ success: false, message: 'Provide either certificate code or internshipId.' });
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.setHeader('Content-Length', result.pdfBuffer.length);
      return res.end(result.pdfBuffer);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
