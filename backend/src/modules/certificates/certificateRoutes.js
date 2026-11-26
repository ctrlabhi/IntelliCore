import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireAuth, requireRole, requireStatus, requireVerifiedEmail } from '../../middleware/auth.js';
import { endpoint, uuid } from '../../utils/phase04.js';
import certificateService from './certificateService.js';
import { sendSuccess } from '../../utils/response.js';

const router = Router();
const id = (req) => uuid.parse(req.params.id);
const approveSchema = z.object({
  notes: z.string().trim().min(1).max(500).optional()
}).strict();

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

// -----------------------------------------------------------------------------
// 2. HR & Staff Manual Certificate Approval
// -----------------------------------------------------------------------------
router.post(
  '/internships/:id/certificate/approve',
  authenticate,
  requireAuth,
  requireVerifiedEmail,
  requireStatus(['ACTIVE']),
  requireRole('FOUNDER', 'CO_FOUNDER', 'HR_MANAGER', 'HR_EXECUTIVE'),
  endpoint(async (req) => {
    const input = approveSchema.parse(req.body ?? {});
    return certificateService.approveAndIssueCertificate(req, id(req), input);
  }, 201)
);

// -----------------------------------------------------------------------------
// 3. Internship Certificate Metadata Read
// -----------------------------------------------------------------------------
router.get(
  '/internships/:id/certificate',
  authenticate,
  requireAuth,
  requireVerifiedEmail,
  requireStatus(['ACTIVE', 'PENDING']),
  endpoint(async (req) => {
    const metadata = await certificateService.getCertificateMetadata(id(req));
    return metadata || { status: 'NOT_ISSUED', message: 'No certificate issued for this internship yet.' };
  })
);

// -----------------------------------------------------------------------------
// 4. On-Demand Vector PDF Certificate Download Stream
// -----------------------------------------------------------------------------
router.get(
  '/internships/:id/certificate/download',
  authenticate,
  requireAuth,
  requireVerifiedEmail,
  requireStatus(['ACTIVE']),
  async (req, res, next) => {
    try {
      const { pdfBuffer, filename } = await certificateService.generateCertificatePdf(req, id(req));
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      return res.end(pdfBuffer);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
