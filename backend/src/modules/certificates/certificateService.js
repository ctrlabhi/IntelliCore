import { randomUUID } from 'node:crypto';
import { getPrismaClient } from '../../config/database.js';
import { AppError, NotFoundError } from '../../utils/errors.js';
import { buildCertificatePdf } from './certificatePdf.js';
import auditService from '../audit/auditService.js';
import env from '../../config/env.js';

const getPrisma = () => getPrismaClient();

/**
 * Service to manage Certificate Approval, Generation, Download & Public Verification
 */
export class CertificateService {
  /**
   * Manual HR Approval and Certificate Generation
   */
  async approveAndIssueCertificate(req, internshipId, { notes = 'Approved for completion certificate' } = {}) {
    // 1. Verify caller has HR or Founder authority
    const isHrOrFounder = req.roles?.some((r) => ['FOUNDER', 'CO_FOUNDER', 'HR_MANAGER', 'HR_EXECUTIVE'].includes(r));
    if (!isHrOrFounder) {
      throw new AppError('Only HR personnel and Founders can approve and issue certificates.', 403, 'FORBIDDEN');
    }

    // 2. Fetch internship with user and department
    const internship = await getPrisma().internship.findUnique({
      where: { id: internshipId },
      include: {
        user: { include: { profile: true } },
        department: true
      }
    });

    if (!internship) {
      throw new NotFoundError('Internship record not found.');
    }

    if (['TERMINATED', 'WITHDRAWN'].includes(internship.internshipStatus)) {
      throw new AppError('Certificates cannot be issued for terminated or withdrawn internships.', 409, 'INVALID_INTERNSHIP_STATE');
    }

    // Generate unique verifiable certificate code
    const year = new Date().getFullYear();
    const cleanCode = (internship.internshipCode || 'INT').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const uniqueSuffix = randomUUID().substring(0, 6).toUpperCase();
    const certificateCode = `IC-CERT-${year}-${cleanCode}-${uniqueSuffix}`;

    const verificationUrl = `${env.APP_BASE_URL || 'https://www.intellicoretechnologies.in'}/verify?code=${certificateCode}`;

    // Certificate metadata
    const certMetadata = {
      certificateCode,
      internshipId: internship.id,
      internshipCode: internship.internshipCode,
      recipientName: internship.user.profile?.fullName || internship.user.email,
      recipientEmail: internship.user.email,
      departmentName: internship.department?.name || 'Technology',
      positionTitle: internship.positionTitle || 'Intern',
      commencementDate: internship.commencementDate,
      completionDate: internship.actualCompletionDate || internship.expectedCompletionDate,
      issuedAt: new Date().toISOString(),
      issuedBy: req.user.id,
      issuerName: 'IntelliCore Technologies',
      verificationUrl,
      notes
    };

    // Store certificate metadata in SystemSetting and record audit trail atomically
    await getPrisma().$transaction(async (tx) => {
      // 1. Ensure internship is marked completed
      if (internship.internshipStatus !== 'COMPLETED') {
        await tx.internship.update({
          where: { id: internship.id },
          data: {
            internshipStatus: 'COMPLETED',
            actualCompletionDate: internship.actualCompletionDate || new Date(),
            completionApprovedBy: req.user.id,
            completionApprovedAt: new Date()
          }
        });
      }

      // 2. Save metadata in SystemSetting for instant public O(1) lookup
      await tx.systemSetting.upsert({
        where: { key: `cert:${certificateCode}` },
        update: { value: JSON.stringify(certMetadata) },
        create: {
          key: `cert:${certificateCode}`,
          value: JSON.stringify(certMetadata),
          description: `Verified certificate metadata for ${certificateCode}`
        }
      });

      // 3. Also map by internship ID for easy lookup
      await tx.systemSetting.upsert({
        where: { key: `internship_cert:${internship.id}` },
        update: { value: JSON.stringify(certMetadata) },
        create: {
          key: `internship_cert:${internship.id}`,
          value: JSON.stringify(certMetadata),
          description: `Active certificate code for internship ${internship.id}`
        }
      });

      // 4. Write transactional audit trail without polluting manual email dispatch declarations
      await auditService.createAuditLog(tx, {
        actorUserId: req.user.id,
        action: 'CERTIFICATE_APPROVED',
        resourceType: 'INTERNSHIP',
        resourceId: internship.id,
        afterState: { certificateCode, internshipCode: internship.internshipCode, notes }
      });
    });

    return certMetadata;
  }

  /**
   * Alias for Certificate Generation
   */
  async generateCertificate(req, { internshipId, notes = 'Certificate generated' } = {}) {
    if (!internshipId) {
      throw new AppError('Internship ID is required for certificate generation.', 400, 'INVALID_INPUT');
    }
    return this.approveAndIssueCertificate(req, internshipId, { notes });
  }

  /**
   * Retrieve Certificate Metadata for Internship (with resource ownership/role check when req is provided)
   */
  async getCertificateMetadata(internshipId, req = null) {
    if (req) {
      const internship = await getPrisma().internship.findUnique({
        where: { id: internshipId },
        select: { id: true, userId: true }
      });
      if (!internship) throw new NotFoundError('Internship record not found.');
      const isOwner = req.user?.id === internship.userId;
      const isStaff = req.roles?.some((r) => ['FOUNDER', 'CO_FOUNDER', 'ADMIN', 'HR_MANAGER', 'HR_EXECUTIVE', 'TEAM_LEADER'].includes(r));
      if (!isOwner && !isStaff) {
        throw new AppError('Access denied to this certificate.', 403, 'FORBIDDEN');
      }
    }
    const setting = await getPrisma().systemSetting.findUnique({
      where: { key: `internship_cert:${internshipId}` }
    });
    if (!setting) return null;
    try {
      return JSON.parse(setting.value);
    } catch {
      return null;
    }
  }

  /**
   * Retrieve Certificate Metadata by Code
   */
  async getCertificateByCode(certificateCode, req = null) {
    if (!certificateCode) return null;
    const cleanCode = certificateCode.trim().toUpperCase();
    const setting = await getPrisma().systemSetting.findUnique({
      where: { key: `cert:${cleanCode}` }
    });
    if (!setting) return null;
    try {
      const data = JSON.parse(setting.value);
      if (req && data.internshipId) {
        const internship = await getPrisma().internship.findUnique({
          where: { id: data.internshipId },
          select: { userId: true }
        });
        const isOwner = internship && req.user?.id === internship.userId;
        const isStaff = req.roles?.some((r) => ['FOUNDER', 'CO_FOUNDER', 'ADMIN', 'HR_MANAGER', 'HR_EXECUTIVE', 'TEAM_LEADER'].includes(r));
        if (!isOwner && !isStaff) {
          throw new AppError('Access denied to this certificate.', 403, 'FORBIDDEN');
        }
      }
      return data;
    } catch (err) {
      if (err instanceof AppError) throw err;
      return null;
    }
  }

  /**
   * On-Demand Certificate PDF Generation and Download Stream by Internship ID
   */
  async generateCertificatePdf(req, internshipId) {
    const internship = await getPrisma().internship.findUnique({
      where: { id: internshipId },
      include: {
        user: { include: { profile: true } },
        department: true
      }
    });

    if (!internship) throw new NotFoundError('Internship record not found.');

    const isOwner = req.user?.id === internship.userId;
    const isStaff = req.roles?.some((r) => ['FOUNDER', 'CO_FOUNDER', 'HR_MANAGER', 'HR_EXECUTIVE', 'TEAM_LEADER'].includes(r));
    if (!isOwner && !isStaff) {
      throw new AppError('Access denied to this certificate.', 403, 'FORBIDDEN');
    }

    let metadata = await this.getCertificateMetadata(internship.id);
    if (!metadata) {
      if (isStaff) {
        metadata = await this.approveAndIssueCertificate(req, internship.id, { notes: 'Auto-approved upon export' });
      } else {
        throw new AppError('Certificate has not yet been approved by Human Resources.', 400, 'CERTIFICATE_NOT_APPROVED');
      }
    }

    const pdfBuffer = buildCertificatePdf({
      recipientName: metadata.recipientName,
      positionTitle: metadata.positionTitle,
      departmentName: metadata.departmentName,
      commencementDate: metadata.commencementDate,
      completionDate: metadata.completionDate,
      certificateCode: metadata.certificateCode,
      verificationUrl: metadata.verificationUrl
    });

    return {
      pdfBuffer,
      filename: `IntelliCore_Certificate_${metadata.certificateCode}.pdf`,
      metadata
    };
  }

  /**
   * On-Demand Certificate PDF Generation by Certificate Code
   */
  async generateCertificatePdfByCode(req, certificateCode) {
    const metadata = await this.getCertificateByCode(certificateCode);
    if (!metadata) {
      throw new NotFoundError('Certificate not found with this identifier.');
    }

    if (metadata.internshipId) {
      return this.generateCertificatePdf(req, metadata.internshipId);
    }

    const pdfBuffer = buildCertificatePdf({
      recipientName: metadata.recipientName,
      positionTitle: metadata.positionTitle,
      departmentName: metadata.departmentName,
      commencementDate: metadata.commencementDate,
      completionDate: metadata.completionDate,
      certificateCode: metadata.certificateCode,
      verificationUrl: metadata.verificationUrl
    });

    return {
      pdfBuffer,
      filename: `IntelliCore_Certificate_${metadata.certificateCode}.pdf`,
      metadata
    };
  }

  /**
   * Public Online Certificate Verification (No auth required)
   */
  async verifyCertificatePublic(certificateCode) {
    if (!certificateCode || typeof certificateCode !== 'string') {
      return { valid: false, message: 'Invalid certificate code format.' };
    }

    const cleanCode = certificateCode.trim().toUpperCase();
    const setting = await getPrisma().systemSetting.findUnique({
      where: { key: `cert:${cleanCode}` }
    });

    if (!setting) {
      return {
        valid: false,
        certificateCode: cleanCode,
        message: 'No verified certificate found with this identifier.'
      };
    }

    try {
      const data = JSON.parse(setting.value);
      return {
        valid: true,
        certificateCode: data.certificateCode,
        recipientName: data.recipientName,
        departmentName: data.departmentName,
        positionTitle: data.positionTitle,
        commencementDate: data.commencementDate,
        completionDate: data.completionDate,
        issuedAt: data.issuedAt,
        issuer: 'IntelliCore Technologies',
        status: 'OFFICIALLY_VERIFIED'
      };
    } catch {
      return { valid: false, message: 'Certificate record could not be parsed.' };
    }
  }
}

export const certificateService = new CertificateService();
export default certificateService;
