import { randomUUID } from 'node:crypto';
import { getPrismaClient } from '../../config/database.js';
import { AppError } from '../../utils/errors.js';
import { addCalendarMonths, lockDepartment, lockUser, readPage, requireActiveDepartment, transaction } from '../../utils/phase04.js';
import { isProtectedFounder } from '../../utils/founder.js';
import { departmentSummary } from '../departments/departmentService.js';
import auditService from '../audit/auditService.js';
import { syncAttendanceEligibility } from '../attendance/eligibility.js';
import { enrollApprovedInternship } from '../learning/learningService.js';
import { assertNoOverlap, assertTeamLeader, editableApplications, ensureFound, openApplications } from './internshipPolicy.js';

const prisma = getPrismaClient();
const applicationSelect = {
  id: true, applicantUserId: true, department: { select: departmentSummary },
  applicationStatus: true, requestedStartDate: true, requestedDuration: true, qualification: true, institution: true,
  course: true, specialization: true, graduationYear: true, skills: true, motivation: true, contactNumber: true,
  submittedAt: true, reviewedAt: true, reviewRemarks: true, createdAt: true, updatedAt: true,
  internship: { select: { id: true, internshipCode: true } },
  applicantUser: { select: { profile: { select: { fullName: true } } } }
};

export function listApplications(query, applicantUserId) {
  const where = {
    applicantUserId,
    departmentId: query.departmentId,
    applicationStatus: query.status,
    ...(query.search ? { OR: [
      { applicantUser: { profile: { fullName: { contains: query.search } } } },
      { department: { name: { contains: query.search } } },
      { qualification: { contains: query.search } }
    ] } : {})
  };
  return readPage(prisma.internshipApplication, {
    where, select: applicationSelect, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }]
  }, query);
}

export async function getApplication(id, applicantUserId) {
  return ensureFound(await prisma.internshipApplication.findFirst({
    where: { id, applicantUserId }, select: applicationSelect
  }), 'Application not found.');
}

async function lockApplication(tx, id, applicantUserId) {
  const where = { id, applicantUserId };
  const application = ensureFound(await tx.internshipApplication.findFirst({
    where, select: { applicantUserId: true }
  }), 'Application not found.');
  await lockUser(tx, application.applicantUserId);
  return ensureFound(await tx.internshipApplication.findFirst({ where }), 'Application not found.');
}

function requireState(application, allowed) {
  if (!allowed.includes(application.applicationStatus)) {
    throw new AppError('This action is unavailable in the current application state.', 409, 'INVALID_APPLICATION_TRANSITION');
  }
}

async function assertApplicant(tx, userId) {
  const user = ensureFound(await tx.user.findUnique({
    where: { id: userId }, include: { staffProfile: true, userRoles: { include: { role: true } } }
  }), 'Applicant not found.');
  if (!['PENDING', 'ACTIVE'].includes(user.status) || !user.emailVerified || user.staffProfile
    || isProtectedFounder(user) || !user.userRoles.length || user.userRoles.some(({ role }) => role.code !== 'INTERN')) {
    throw new AppError('This account is not eligible for internship applications.', 409, 'APPLICANT_NOT_ELIGIBLE');
  }
  return user;
}

export function saveApplication(id, input, actor) {
  return transaction(async (tx) => {
    await lockUser(tx, actor.id);
    await assertApplicant(tx, actor.id);
    const previous = id && ensureFound(await tx.internshipApplication.findFirst({
      where: { id, applicantUserId: actor.id }
    }), 'Application not found.');
    if (previous) requireState(previous, editableApplications);
    const departmentId = input.departmentId ?? previous.departmentId;
    await lockDepartment(tx, departmentId);
    await requireActiveDepartment(tx, departmentId);
    const duplicate = await tx.internshipApplication.findFirst({
      where: { applicantUserId: actor.id, departmentId, ...(id ? { id: { not: id } } : {}),
        applicationStatus: { in: openApplications } },
      select: { id: true }
    });
    if (duplicate) throw new AppError('An open application already exists for this department.', 409, 'APPLICATION_ALREADY_OPEN');
    const { durationMonths, ...fields } = input;
    const data = { ...fields, ...(durationMonths ? { requestedDuration: String(durationMonths) } : {}) };
    return id
      ? tx.internshipApplication.update({ where: { id }, data, select: applicationSelect })
      : tx.internshipApplication.create({ data: { ...data, applicantUserId: actor.id }, select: applicationSelect });
  });
}

async function applyDecision(tx, application, data, actor, action, requestId) {
  const updated = await tx.internshipApplication.update({ where: { id: application.id }, data, select: applicationSelect });
  await auditService.createAuditLog(tx, {
    actorUserId: actor.id, resourceType: 'INTERNSHIP_APPLICATION', resourceId: application.id, requestId, action,
    beforeState: { status: application.applicationStatus }, afterState: { status: updated.applicationStatus }
  });
  return updated;
}

export function submitApplication(id, actor, requestId) {
  return transaction(async (tx) => {
    const application = await lockApplication(tx, id, actor.id);
    await assertApplicant(tx, actor.id);
    requireState(application, editableApplications);
    await lockDepartment(tx, application.departmentId);
    await requireActiveDepartment(tx, application.departmentId);
    return applyDecision(tx, application, {
      applicationStatus: 'PENDING_APPROVAL', submittedAt: new Date()
    }, actor, 'APPLICATION_SUBMITTED', requestId);
  });
}

export function withdrawApplication(id, actor, requestId) {
  return transaction(async (tx) => {
    const application = await lockApplication(tx, id, actor.id);
    requireState(application, openApplications);
    return applyDecision(tx, application, { applicationStatus: 'WITHDRAWN' }, actor, 'APPLICATION_WITHDRAWN', requestId);
  });
}

function assertReviewable(application, reviewerId) {
  if (application.applicantUserId === reviewerId) {
    throw new AppError('An applicant cannot review their own application.', 403, 'SELF_REVIEW_FORBIDDEN');
  }
  requireState(application, ['PENDING_APPROVAL']);
}

export function reviewApplication(id, status, remarks, actor, requestId) {
  return transaction(async (tx) => {
    const application = await lockApplication(tx, id);
    assertReviewable(application, actor.id);
    return applyDecision(tx, application, {
      applicationStatus: status, reviewedBy: actor.id, reviewedAt: new Date(), reviewRemarks: remarks
    }, actor, status === 'REJECTED' ? 'APPLICATION_REJECTED' : 'APPLICATION_CHANGES_REQUESTED', requestId);
  });
}

export function approveApplication(id, input, actor, requestId) {
  return transaction(async (tx) => {
    const application = await lockApplication(tx, id);
    assertReviewable(application, actor.id);
    const user = await assertApplicant(tx, application.applicantUserId);
    const departmentId = input.departmentId ?? application.departmentId;
    await lockDepartment(tx, departmentId);
    await requireActiveDepartment(tx, departmentId);
    await assertTeamLeader(tx, input.assignedTeamLeaderId, departmentId);
    const months = Number(application.requestedDuration.match(/^\s*(1|2|3|6)(?:\s+months?)?\s*$/i)?.[1]);
    const expectedCompletionDate = input.expectedCompletionDate
      ?? (months && addCalendarMonths(input.commencementDate, months));
    if (!expectedCompletionDate) {
      throw new AppError('Confirm a completion date for this application.', 400, 'COMPLETION_DATE_REQUIRED');
    }
    const dates = { commencementDate: input.commencementDate, expectedCompletionDate };
    await assertNoOverlap(tx, { userId: user.id, ...dates });
    const now = new Date();
    const internship = await tx.internship.create({ data: {
      internshipCode: `IC-INT-${randomUUID().replaceAll('-', '').toUpperCase()}`,
      userId: user.id, applicationId: id, departmentId, assignedTeamLeaderId: input.assignedTeamLeaderId,
      positionTitle: input.positionTitle, duration: application.requestedDuration, ...dates,
      approvedBy: actor.id, approvedAt: now
    }, select: { id: true, internshipCode: true } });
    if (user.status === 'PENDING') {
      await tx.user.update({ where: { id: user.id }, data: { status: 'ACTIVE' } });
    }
    await syncAttendanceEligibility(tx, user.id, now);
    await enrollApprovedInternship(tx, internship.id, now, actor, requestId);
    const result = await applyDecision(tx, application, {
      departmentId, applicationStatus: 'APPROVED', reviewedBy: actor.id, reviewedAt: now, reviewRemarks: input.remarks
    }, actor, 'APPLICATION_APPROVED', requestId);
    await auditService.createAuditLog(tx, {
      actorUserId: actor.id, action: 'INTERNSHIP_ENROLLED', resourceType: 'INTERNSHIP', resourceId: internship.id, requestId,
      afterState: { ...internship, departmentId, applicationId: id, assignedTeamLeaderId: input.assignedTeamLeaderId,
        accountStatus: 'ACTIVE' }
    });
    return result;
  }, { retryUnique: true });
}
