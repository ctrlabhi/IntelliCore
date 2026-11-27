import crypto from 'node:crypto';
import prisma from '../../config/database.js';
import env from '../../config/env.js';
import logger from '../../config/logger.js';
import { AppError, NotFoundError, ForbiddenError, ConflictError, BadRequestError } from '../../utils/errors.js';
import { isProtectedFounder } from '../../utils/founder.js';
import firebaseService from '../../integrations/firebase/firebaseService.js';
import storageService from '../../integrations/storage/storageService.js';

const storage = storageService;

let tableInitialized = false;

export function validateDeletionConfirmation(confirmationText) {
  if (confirmationText !== 'PERMANENTLY DELETE') {
    throw new BadRequestError('Explicit confirmation text "PERMANENTLY DELETE" is required to confirm permanent deletion.');
  }
}

export function validateDeletionReason(reason) {
  const sanitized = (reason || '').trim();
  if (sanitized.length < 5) {
    throw new BadRequestError('A meaningful deletion reason (at least 5 characters) is required.');
  }
  return sanitized;
}

export function validatePreviewFreshness(previewTimestamp, maxAgeMs = 15 * 60 * 1000) {
  if (!previewTimestamp) return true;
  const age = Date.now() - new Date(previewTimestamp).getTime();
  if (age > maxAgeMs) {
    throw new BadRequestError('The deletion preview has expired (limit 15 minutes). Please generate a fresh preview.', 'STALE_PREVIEW');
  }
  return true;
}

export async function ensureDeletionJobsTable() {
  // Schema is managed exclusively via version-controlled migration (20261125180000_add_account_deletion_jobs).
  // Zero runtime DDL operations permitted.
}

export class AccountDeletionService {
  async getDeletionPreview(targetUserId, actor) {
    await ensureDeletionJobsTable();

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      include: {
        profile: true,
        staffProfile: true,
        userRoles: { include: { role: true } },
        userDepartments: { include: { department: true } }
      }
    });

    if (!targetUser) {
      throw new NotFoundError('Target user not found for deletion preview.');
    }

    if (isProtectedFounder(targetUser)) {
      throw new ForbiddenError('The primary Founder account cannot be permanently deleted.');
    }

    if (targetUser.id === actor?.id) {
      throw new ForbiddenError('Self-deletion of the authenticated Founder account is strictly prohibited.');
    }

    const internships = await prisma.internship.findMany({
      where: { userId: targetUserId },
      select: { id: true, internshipCode: true }
    });
    const internshipIds = internships.map((i) => i.id);

    const [
      applicationsCount,
      attendanceCount,
      dailyReportsCount,
      leaveRequestsCount,
      correctionsCount,
      taskAssignmentsCount,
      taskSubmissionsCount,
      attachmentsCount,
      learningEnrollmentCount,
      meetingParticipationCount,
      notificationsCount,
      pendingEmailsCount,
      extensionsCount,
      promotionsCount,
      certificateDispatchesCount,
      sharedTasksCount,
      sharedMeetingsCount,
      sharedReportsReviewedCount,
      sharedLeavesReviewedCount
    ] = await Promise.all([
      prisma.internshipApplication.count({ where: { applicantUserId: targetUserId } }),
      internshipIds.length ? prisma.attendance.count({ where: { internshipId: { in: internshipIds } } }) : 0,
      internshipIds.length ? prisma.dailyWorkReport.count({ where: { internshipId: { in: internshipIds } } }) : 0,
      internshipIds.length ? prisma.leaveRequest.count({ where: { internshipId: { in: internshipIds } } }) : 0,
      prisma.attendanceCorrection.count({ where: { requestedBy: targetUserId } }),
      internshipIds.length ? prisma.taskAssignment.count({ where: { internshipId: { in: internshipIds } } }) : 0,
      internshipIds.length ? prisma.taskSubmission.count({ where: { assignment: { internshipId: { in: internshipIds } } } }) : 0,
      prisma.fileAttachment.count({ where: { ownerUserId: targetUserId } }),
      internshipIds.length ? prisma.learningEnrollment.count({ where: { internshipId: { in: internshipIds } } }) : 0,
      prisma.meetingParticipant.count({ where: { userId: targetUserId } }),
      prisma.notification.count({ where: { recipientUserId: targetUserId } }),
      prisma.emailOutbox.count({ where: { recipientUserId: targetUserId, status: { in: ['PENDING', 'PROCESSING', 'RETRY_SCHEDULED'] } } }),
      internshipIds.length ? prisma.internshipExtension.count({ where: { internshipId: { in: internshipIds } } }) : 0,
      internshipIds.length ? prisma.internshipPromotion.count({ where: { internshipId: { in: internshipIds } } }) : 0,
      internshipIds.length ? prisma.certificateDispatch.count({ where: { internshipId: { in: internshipIds } } }) : 0,
      prisma.task.count({ where: { createdBy: targetUserId } }),
      prisma.meeting.count({ where: { organizerId: targetUserId } }),
      prisma.dailyWorkReport.count({ where: { reviewedBy: targetUserId } }),
      prisma.leaveRequest.count({ where: { reviewedBy: targetUserId } })
    ]);

    const impact = {
      userAccount: 1,
      profile: targetUser.profile ? 1 : 0,
      staffProfile: targetUser.staffProfile ? 1 : 0,
      roles: targetUser.userRoles.length,
      departments: targetUser.userDepartments.length,
      internshipApplications: applicationsCount,
      internships: internships.length,
      attendanceRecords: attendanceCount,
      dailyWorkReports: dailyReportsCount,
      leaveRequests: leaveRequestsCount,
      attendanceCorrections: correctionsCount,
      taskAssignments: taskAssignmentsCount,
      taskSubmissions: taskSubmissionsCount,
      privateFileAttachments: attachmentsCount,
      learningEnrollments: learningEnrollmentCount,
      meetingParticipations: meetingParticipationCount,
      notifications: notificationsCount,
      pendingEmailJobs: pendingEmailsCount,
      internshipExtensions: extensionsCount,
      promotions: promotionsCount,
      certificateDispatches: certificateDispatchesCount
    };

    const sharedPreserved = {
      sharedTasksPreserved: sharedTasksCount,
      sharedMeetingsPreserved: sharedMeetingsCount,
      reviewedReportsPreserved: sharedReportsReviewedCount,
      reviewedLeavesPreserved: sharedLeavesReviewedCount
    };

    const timestamp = Date.now();
    const hashPayload = `${targetUserId}:${targetUser.email}:${JSON.stringify(impact)}:${timestamp}`;
    const previewHash = crypto.createHash('sha256').update(hashPayload).digest('hex');

    return {
      targetUser: {
        id: targetUser.id,
        email: targetUser.email,
        fullName: targetUser.profile?.fullName || targetUser.email,
        status: targetUser.status,
        roles: targetUser.userRoles.map((ur) => ur.role.code),
        firebaseUid: targetUser.firebaseUid
      },
      impact,
      sharedPreserved,
      previewHash,
      previewGeneratedAt: new Date(timestamp).toISOString(),
      requiresConfirmationText: 'PERMANENTLY DELETE'
    };
  }

  async executePermanentDeletion({ targetUserId, reason, confirmationText, previewHash, previewTimestamp, actor }) {
    await ensureDeletionJobsTable();

    validateDeletionConfirmation(confirmationText);
    const sanitizedReason = validateDeletionReason(reason);
    validatePreviewFreshness(previewTimestamp);

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      include: {
        profile: true,
        staffProfile: true,
        userRoles: { include: { role: true } },
        privateAttachments: true
      }
    });

    if (!targetUser) {
      throw new NotFoundError('Target user not found.');
    }

    if (isProtectedFounder(targetUser)) {
      throw new ForbiddenError('The primary Founder account cannot be permanently deleted.');
    }

    if (targetUser.id === actor?.id) {
      throw new ForbiddenError('Self-deletion of the authenticated Founder account is strictly prohibited.');
    }

    // Check for existing in-progress deletion job
    const existingJobs = await prisma.$queryRawUnsafe(`
      SELECT id, status FROM \`account_deletion_jobs\`
      WHERE \`user_id\` = ? AND \`status\` IN ('REQUESTED', 'PROCESSING')
      LIMIT 1;
    `, targetUserId);

    if (existingJobs && existingJobs.length > 0) {
      throw new ConflictError('A permanent deletion operation is already processing for this user.', 'DELETION_IN_PROGRESS');
    }

    const jobId = crypto.randomUUID();
    const targetFirebaseUid = targetUser.firebaseUid;
    const targetEmail = targetUser.email;
    const targetName = targetUser.profile?.fullName || targetUser.email;

    // Create deletion job record
    await prisma.$executeRawUnsafe(`
      INSERT INTO \`account_deletion_jobs\`
        (\`id\`, \`user_id\`, \`target_firebase_uid\`, \`target_email\`, \`target_name\`, \`status\`, \`reason\`, \`preview_hash\`, \`impact_summary\`, \`requested_by\`, \`requested_by_email\`, \`retry_count\`, \`created_at\`, \`updated_at\`)
      VALUES
        (?, ?, ?, ?, ?, 'PROCESSING', ?, ?, ?, ?, ?, 0, NOW(3), NOW(3));
    `, jobId, targetUserId, targetFirebaseUid, targetEmail, targetName, sanitizedReason, previewHash || null, JSON.stringify({ reason: sanitizedReason }), actor.id, actor.email);

    // Step 1: Revoke Firebase refresh tokens immediately
    try {
      await firebaseService.revokeRefreshTokens(targetFirebaseUid);
    } catch (tokenErr) {
      logger.warn({ err: tokenErr.message, targetFirebaseUid }, 'Could not revoke refresh tokens during permanent deletion.');
    }

    // Step 2: Unlink and remove user's physical private file attachments from storage disk
    try {
      const attachments = targetUser.privateAttachments || [];
      for (const att of attachments) {
        if (att.storageKey) {
          try {
            await storage.removePrivate(att.storageKey);
          } catch (fileErr) {
            logger.warn({ err: fileErr.message, key: att.storageKey }, 'Could not unlink physical file.');
          }
        }
      }
    } catch (storageErr) {
      logger.warn({ err: storageErr.message }, 'Error purging storage files during deletion.');
    }

    // Step 3: Transactional MySQL deletion & anonymization
    const internships = await prisma.internship.findMany({
      where: { userId: targetUserId },
      select: { id: true }
    });
    const internshipIds = internships.map((i) => i.id);

    try {
      await prisma.$transaction(async (tx) => {
        // Reassign or anonymize foreign keys on shared records
        await tx.taskReview.updateMany({ where: { reviewedBy: targetUserId }, data: { reviewedBy: actor.id } });
        await tx.dailyWorkReport.updateMany({ where: { reviewedBy: targetUserId }, data: { reviewedBy: null } });
        await tx.leaveRequest.updateMany({ where: { reviewedBy: targetUserId }, data: { reviewedBy: null } });
        await tx.attendanceCorrection.updateMany({ where: { reviewedBy: targetUserId }, data: { reviewedBy: null } });
        await tx.task.updateMany({ where: { createdBy: targetUserId }, data: { createdBy: actor.id } });
        await tx.meeting.updateMany({ where: { organizerId: targetUserId }, data: { organizerId: actor.id } });
        await tx.certificateDispatch.updateMany({ where: { actorId: targetUserId }, data: { actorId: actor.id } });
        await tx.internshipExtension.updateMany({ where: { actorId: targetUserId }, data: { actorId: actor.id } });
        await tx.internship.updateMany({ where: { assignedTeamLeaderId: targetUserId }, data: { assignedTeamLeaderId: null } });
        await tx.internshipPromotion.updateMany({ where: { requestedBy: targetUserId }, data: { requestedBy: actor.id } });
        await tx.internshipPromotion.updateMany({ where: { decidedBy: targetUserId }, data: { decidedBy: null } });
        await tx.taskScoreAmendment.updateMany({ where: { amendedBy: targetUserId }, data: { amendedBy: actor.id } });
        await tx.learningProgressCorrection.updateMany({ where: { correctedBy: targetUserId }, data: { correctedBy: actor.id } });

        // Delete user's internship child records
        if (internshipIds.length > 0) {
          await tx.attendanceCorrection.deleteMany({ where: { attendance: { internshipId: { in: internshipIds } } } });
          await tx.attendance.deleteMany({ where: { internshipId: { in: internshipIds } } });
          await tx.attendanceEligibility.deleteMany({ where: { internshipId: { in: internshipIds } } });
          await tx.dailyWorkReport.deleteMany({ where: { internshipId: { in: internshipIds } } });
          await tx.leaveRequest.deleteMany({ where: { internshipId: { in: internshipIds } } });

          await tx.taskScoreAmendment.deleteMany({ where: { review: { submission: { assignment: { internshipId: { in: internshipIds } } } } } });
          await tx.taskReview.deleteMany({ where: { submission: { assignment: { internshipId: { in: internshipIds } } } } });
          await tx.taskSubmission.deleteMany({ where: { assignment: { internshipId: { in: internshipIds } } } });
          await tx.taskAssignment.deleteMany({ where: { internshipId: { in: internshipIds } } });

          await tx.learningProgressCorrection.deleteMany({ where: { progress: { enrollment: { internshipId: { in: internshipIds } } } } });
          await tx.learningProgress.deleteMany({ where: { enrollment: { internshipId: { in: internshipIds } } } });
          await tx.learningEnrollment.deleteMany({ where: { internshipId: { in: internshipIds } } });

          await tx.certificateDispatch.deleteMany({ where: { internshipId: { in: internshipIds } } });
          await tx.internshipPromotion.deleteMany({ where: { internshipId: { in: internshipIds } } });
          await tx.internshipExtension.deleteMany({ where: { internshipId: { in: internshipIds } } });
          await tx.internship.deleteMany({ where: { id: { in: internshipIds } } });
        }

        // Delete user's direct records
        await tx.attendanceCorrection.deleteMany({ where: { requestedBy: targetUserId } });
        await tx.internshipApplication.deleteMany({ where: { applicantUserId: targetUserId } });
        await tx.fileAttachment.deleteMany({ where: { ownerUserId: targetUserId } });
        await tx.meetingParticipant.deleteMany({ where: { userId: targetUserId } });
        await tx.announcementRecipient.deleteMany({ where: { userId: targetUserId } });
        await tx.notification.deleteMany({ where: { recipientUserId: targetUserId } });
        await tx.notificationPreference.deleteMany({ where: { userId: targetUserId } });
        await tx.emailOutbox.deleteMany({ where: { recipientUserId: targetUserId } });
        await tx.userDepartment.deleteMany({ where: { userId: targetUserId } });
        await tx.userRole.deleteMany({ where: { userId: targetUserId } });
        await tx.staffProfile.deleteMany({ where: { userId: targetUserId } });
        await tx.profile.deleteMany({ where: { userId: targetUserId } });
        await tx.calendarConnection.deleteMany({ where: { organizerId: targetUserId } });
        await tx.calendarAuthorization.deleteMany({ where: { organizerId: targetUserId } });

        // Delete user row
        await tx.user.delete({ where: { id: targetUserId } });

        // Minimal sanitized audit entry
        await tx.auditLog.create({
          data: {
            action: 'USER_PERMANENT_DELETION',
            actorUserId: actor.id,
            resourceType: 'USER',
            resourceId: targetUserId,
            sanitizedAfter: JSON.stringify({
              targetUserId,
              reason: sanitizedReason,
              previewHash: previewHash || null,
              deletedAt: new Date().toISOString()
            }),
            result: 'SUCCESS'
          }
        });
      });
    } catch (txErr) {
      await prisma.$executeRawUnsafe(`
        UPDATE \`account_deletion_jobs\`
        SET \`status\` = 'FAILED', \`failed_step\` = 'MYSQL_RECORD_DELETION', \`error_message\` = ?, \`updated_at\` = NOW(3)
        WHERE \`id\` = ?;
      `, txErr.message.slice(0, 990), jobId);
      throw txErr;
    }

    // Step 4: Delete Firebase Authentication identity
    let firebaseDeleted = false;
    try {
      await firebaseService.deleteUser(targetFirebaseUid);
      firebaseDeleted = true;
    } catch (fbErr) {
      logger.error({ err: fbErr.message, targetFirebaseUid }, 'Firebase user deletion failed during account permanent deletion.');
      await prisma.$executeRawUnsafe(`
        UPDATE \`account_deletion_jobs\`
        SET \`status\` = 'RETRY_REQUIRED', \`failed_step\` = 'FIREBASE_AUTH_DELETION', \`error_message\` = ?, \`updated_at\` = NOW(3)
        WHERE \`id\` = ?;
      `, fbErr.message.slice(0, 990), jobId);
    }

    if (firebaseDeleted) {
      await prisma.$executeRawUnsafe(`
        UPDATE \`account_deletion_jobs\`
        SET \`status\` = 'COMPLETED', \`completed_at\` = NOW(3), \`updated_at\` = NOW(3)
        WHERE \`id\` = ?;
      `, jobId);
    }

    return await this.getDeletionJobById(jobId);
  }

  async getDeletionJobs({ page = 1, limit = 20, status } = {}) {
    await ensureDeletionJobsTable();
    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (p - 1) * l;

    let whereClause = '';
    const params = [];
    if (status) {
      whereClause = 'WHERE `status` = ?';
      params.push(status);
    }

    const countRows = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as total FROM \`account_deletion_jobs\` ${whereClause};
    `, ...params);
    const total = Number(countRows[0]?.total || 0);

    const rows = await prisma.$queryRawUnsafe(`
      SELECT id, user_id as userId, target_firebase_uid as targetFirebaseUid, target_email as targetEmail,
             target_name as targetName, status, reason, failed_step as failedStep, error_message as errorMessage,
             retry_count as retryCount, requested_by as requestedBy, requested_by_email as requestedByEmail,
             completed_at as completedAt, created_at as createdAt, updated_at as updatedAt
      FROM \`account_deletion_jobs\`
      ${whereClause}
      ORDER BY \`created_at\` DESC
      LIMIT ? OFFSET ?;
    `, ...params, l, offset);

    return {
      jobs: rows,
      pagination: {
        page: p,
        limit: l,
        total,
        totalPages: Math.ceil(total / l)
      }
    };
  }

  async getDeletionJobById(jobId) {
    await ensureDeletionJobsTable();
    const rows = await prisma.$queryRawUnsafe(`
      SELECT id, user_id as userId, target_firebase_uid as targetFirebaseUid, target_email as targetEmail,
             target_name as targetName, status, reason, failed_step as failedStep, error_message as errorMessage,
             retry_count as retryCount, requested_by as requestedBy, requested_by_email as requestedByEmail,
             completed_at as completedAt, created_at as createdAt, updated_at as updatedAt
      FROM \`account_deletion_jobs\`
      WHERE \`id\` = ?
      LIMIT 1;
    `, jobId);

    if (!rows || rows.length === 0) {
      throw new NotFoundError('Deletion job not found.');
    }
    return rows[0];
  }

  async retryDeletionJob(jobId, actor) {
    await ensureDeletionJobsTable();
    const job = await this.getDeletionJobById(jobId);

    if (job.status === 'COMPLETED') {
      return { message: 'Job is already completed.', job };
    }

    if (job.failedStep === 'FIREBASE_AUTH_DELETION' || job.status === 'RETRY_REQUIRED') {
      try {
        await firebaseService.deleteUser(job.targetFirebaseUid);
        await prisma.$executeRawUnsafe(`
          UPDATE \`account_deletion_jobs\`
          SET \`status\` = 'COMPLETED', \`failed_step\` = NULL, \`error_message\` = NULL, \`completed_at\` = NOW(3),
              \`retry_count\` = \`retry_count\` + 1, \`updated_at\` = NOW(3)
          WHERE \`id\` = ?;
        `, jobId);
        return { message: 'Firebase identity deletion retried successfully.', job: await this.getDeletionJobById(jobId) };
      } catch (err) {
        await prisma.$executeRawUnsafe(`
          UPDATE \`account_deletion_jobs\`
          SET \`retry_count\` = \`retry_count\` + 1, \`error_message\` = ?, \`updated_at\` = NOW(3)
          WHERE \`id\` = ?;
        `, err.message.slice(0, 990), jobId);
        throw new AppError(`Retry failed: ${err.message}`, 502, 'RETRY_FAILED');
      }
    }

    throw new BadRequestError(`Cannot retry job in current state: ${job.status}`);
  }

  async isAccountPermanentlyDeleted({ firebaseUid, email }) {
    await ensureDeletionJobsTable();
    const rows = await prisma.$queryRawUnsafe(`
      SELECT id, status FROM \`account_deletion_jobs\`
      WHERE (\`target_firebase_uid\` = ? OR \`target_email\` = ?)
        AND \`status\` IN ('COMPLETED', 'PROCESSING', 'RETRY_REQUIRED')
      LIMIT 1;
    `, firebaseUid || '', (email || '').toLowerCase());
    return Boolean(rows && rows.length > 0);
  }
}

export const accountDeletionService = new AccountDeletionService();
export default accountDeletionService;
