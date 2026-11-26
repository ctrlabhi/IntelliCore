import { randomUUID } from 'node:crypto';
import prisma from '../../config/database.js';
import { AppError, NotFoundError } from '../../utils/errors.js';
import { buildCertificatePdf } from './certificatePdf.js';
import env from '../../config/env.js';

/**
 * Service to manage Certificate Approval, Generation, Download & Public Verification
 */
export class CertificateService {
  /**
   * Manual HR Approval and Certificate Generation
   */
  async approveAndIssueCertificate(req, internshipId, { notes = 'Approved for completion certificate' } = {}) {
    // 1. Verify caller has HR or Founder authority
    const isHrOrFounder = req.roles.some((r) => ['FOUNDER', 'CO_FOUNDER', 'HR_MANAGER', 'HR_EXECUTIVE'].includes(r));
    if (!isHrOrFounder) {
      throw new AppError('Only HR personnel and Founders can approve and issue certificates.', 403, 'FORBIDDEN');
    }

    // 2. Fetch internship with user and department
    const internship = await prisma.internship.findUnique({
      where: { id: internshipId },
      include: {
        user: { include: { profile: true } },
        department: true
      }
    });

    if (!internship) {
      throw new NotFoundError('Internship record not found.');
    }

    // Generate unique verifiable certificate code
    const year = new Date().getFullYear();
    const cleanCode = internship.internshipCode.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
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

    // Store in CertificateDispatch history and SystemSetting for persistent zero-cost indexing
    await prisma.$transaction(async (tx) => {
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

      // 2. Count existing sequence for this internship
      const count = await tx.certificateDispatch.count({ where: { internshipId: internship.id } });

      // 3. Create dispatch history entry
      await tx.certificateDispatch.create({
        data: {
          internshipId: internship.id,
          actorId: req.user.id,
          requestKey: randomUUID(),
          sequence: count + 1,
          status: 'SENT',
          declaredSentAt: new Date(),
          note: JSON.stringify(certMetadata)
        }
      });

      // 4. Save metadata in SystemSetting for instant public O(1) lookup
      await tx.systemSetting.upsert({
        where: { key: `cert:${certificateCode}` },
        update: { value: JSON.stringify(certMetadata) },
        create: {
          key: `cert:${certificateCode}`,
          value: JSON.stringify(certMetadata),
          description: `Verified certificate metadata for ${certificateCode}`
        }
      });

      // Also map by internship ID for easy lookup
      await tx.systemSetting.upsert({
        where: { key: `internship_cert:${internship.id}` },
        update: { value: JSON.stringify(certMetadata) },
        create: {
          key: `internship_cert:${internship.id}`,
          value: JSON.stringify(certMetadata),
          description: `Active certificate code for internship ${internship.id}`
        }
      });
    });

    return certMetadata;
  }

  /**
   * Retrieve Certificate Metadata for Internship
   */
  async getCertificateMetadata(internshipId) {
    const setting = await prisma.systemSetting.findUnique({
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
   * On-Demand Certificate PDF Generation and Download Stream
   */
  async generateCertificatePdf(req, internshipId) {
    // 1. Verify caller access (intern themselves or staff)
    const internship = await prisma.internship.findUnique({
      where: { id: internshipId },
      include: {
        user: { include: { profile: true } },
        department: true
      }
    });

    if (!internship) throw new NotFoundError('Internship record not found.');

    const isOwner = req.user.id === internship.userId;
    const isStaff = req.roles.some((r) => ['FOUNDER', 'CO_FOUNDER', 'HR_MANAGER', 'HR_EXECUTIVE', 'TEAM_LEADER'].includes(r));
    if (!isOwner && !isStaff) {
      throw new AppError('Access denied to this certificate.', 403, 'FORBIDDEN');
    }

    // 2. Fetch or generate metadata
    let metadata = await this.getCertificateMetadata(internship.id);
    if (!metadata) {
      // If HR/Founder downloads an unapproved completed internship, generate metadata on the fly
      if (isStaff) {
        metadata = await this.approveAndIssueCertificate(req, internship.id, { notes: 'Auto-approved upon export' });
      } else {
        throw new AppError('Certificate has not yet been approved by Human Resources.', 400, 'CERTIFICATE_NOT_APPROVED');
      }
    }

    // 3. Build vector PDF buffer
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
    const setting = await prisma.systemSetting.findUnique({
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
