import { getPrismaClient } from '../../config/database.js';
import { AppError } from '../../utils/errors.js';
import { businessToday, lockDepartment, lockUser, readPage, transaction } from '../../utils/phase04.js';
import { departmentSummary } from '../departments/departmentService.js';
import auditService from '../audit/auditService.js';
import { syncAttendanceEligibility } from '../attendance/eligibility.js';
import { policyFor } from '../notifications/notificationPolicy.js';
import { emitNotification } from '../notifications/notificationService.js';
import { activeEnrollments, assertNoOverlap, assertTeamLeader, effectiveStatus, ensureFound, statusFilter } from './internshipPolicy.js';

const prisma = getPrismaClient();
const person = { select: { id: true, profile: { select: { fullName: true } } } };
const internshipSelect = {
  id: true, internshipCode: true, userId: true, user: person, department: { select: departmentSummary },
  assignedTeamLeaderId: true, assignedTeamLeader: person, positionTitle: true, commencementDate: true,
  expectedCompletionDate: true, actualCompletionDate: true, duration: true,
  workMode: true, internshipStatus: true, approvedAt: true, completionApprovedAt: true,
  continuationOf: { select: { internshipId: true } },
  promotions: { where: { status: 'APPROVED', targetRole: null, continuationId: null }, orderBy: [{ effectiveOn: 'desc' }, { id: 'asc' }],
    select: { designation: true, effectiveOn: true } },
  continuationPromotions: { where: { status: 'APPROVED', targetRole: null }, orderBy: [{ effectiveOn: 'desc' }, { id: 'asc' }],
    select: { designation: true, effectiveOn: true } }
};

function presentInternship(internship, today) {
  const { continuationPromotions = [], promotions = [], ...row } = internship;
  const effectiveDesignation = continuationPromotions.find(({ effectiveOn }) => effectiveOn <= today)?.designation ?? row.positionTitle;
  const recordedDesignation = promotions.find(({ effectiveOn }) => effectiveOn <= today) ?? null;
  return { ...row, effectiveDesignation, recordedDesignation, completionRequested: internship.internshipStatus === 'COMPLETION_REVIEW',
    internshipStatus: effectiveStatus(internship, today) };
}

export async function listInternships(query, scope, own = false) {
  const today = businessToday();
  const where = { AND: [scope, statusFilter(query.status, today), {
    departmentId: query.departmentId,
    commencementDate: query.commencementFrom ? { gte: query.commencementFrom } : undefined,
    expectedCompletionDate: query.completionThrough ? { lte: query.completionThrough } : undefined,
    assignedTeamLeaderId: query.teamLeaderId,
    ...(query.search ? { OR: [
      { internshipCode: { contains: query.search } }, { positionTitle: { contains: query.search } },
      { user: { profile: { fullName: { contains: query.search } } } }
    ] } : {})
  }] };
  const page = await readPage(prisma.internship, {
    where, select: own ? { ...internshipSelect, certificateDispatches: {
      orderBy: { sequence: 'desc' }, take: 1, select: { status: true, recordedAt: true } }
    } : internshipSelect, orderBy: [{ commencementDate: 'desc' }, { id: 'asc' }]
  }, query);
  return { ...page, items: page.items.map((internship) => {
    const { certificateDispatches, ...row } = internship;
    const certificateDispatch = certificateDispatches?.[0];
    const result = presentInternship(row, today);
    if (!own || row.internshipStatus !== 'COMPLETED') return result;
    return { ...result, certificateEmailStatus: {
      status: certificateDispatch?.status ?? 'NOT_SENT', recordedAt: certificateDispatch?.recordedAt ?? null,
      message: certificateDispatch?.status === 'SENT' ? policyFor('CERTIFICATE_DISPATCH_RECORDED').message
        : 'Certificate email has not yet been marked as sent.'
    } };
  }) };
}

export async function getInternship(id, scope) {
  return presentInternship(ensureFound(await prisma.internship.findFirst({
    where: { AND: [{ id }, scope] }, select: internshipSelect
  }), 'Internship not found.'));
}

async function editInternship(id, actor, requestId, action, buildUpdate, ownerOnly = false) {
  return transaction(async (tx) => {
    const where = { id, ...(ownerOnly ? { userId: actor.id } : {}) };
    const target = ensureFound(await tx.internship.findFirst({ where, select: { userId: true } }), 'Internship not found.');
    await lockUser(tx, target.userId);
    const before = ensureFound(await tx.internship.findFirst({ where }), 'Internship not found.');
    const today = businessToday();
    const status = effectiveStatus(before, today);
    const data = await buildUpdate(tx, before, status, today);
    const updated = await tx.internship.update({ where: { id }, data, select: internshipSelect });
    await syncAttendanceEligibility(tx, before.userId);
    const audit = await auditService.createAuditLog(tx, {
      actorUserId: actor.id, action, requestId, resourceType: 'INTERNSHIP', resourceId: id,
      beforeState: { status, commencementDate: before.commencementDate, expectedCompletionDate: before.expectedCompletionDate,
        positionTitle: before.positionTitle, assignedTeamLeaderId: before.assignedTeamLeaderId },
      afterState: { status: effectiveStatus(updated, today), commencementDate: updated.commencementDate,
        expectedCompletionDate: updated.expectedCompletionDate, positionTitle: updated.positionTitle,
        assignedTeamLeaderId: updated.assignedTeamLeaderId }
    });
    const changedLeader = action === 'INTERNSHIP_TEAM_LEADER_UPDATED' && before.assignedTeamLeaderId !== updated.assignedTeamLeaderId;
    const event = changedLeader ? 'TEAM_LEADER_CHANGED' : ({
      INTERNSHIP_COMPLETION_APPROVED: 'INTERNSHIP_COMPLETED', INTERNSHIP_TERMINATED: 'INTERNSHIP_TERMINATED'
    })[action];
    if (event) await emitNotification(tx, { event, type: 'INTERNSHIP', resourceId: id,
      recipientIds: [before.userId, ...(changedLeader ? [updated.assignedTeamLeaderId] : [])], version: audit.id });
    return presentInternship(updated, today);
  });
}

function requireInternshipState(status, allowed) {
  if (!allowed.includes(status)) {
    throw new AppError('This action is unavailable in the current internship state.', 409, 'INVALID_INTERNSHIP_TRANSITION');
  }
}

export function updateInternship(id, input, actor, requestId) {
  return editInternship(id, actor, requestId, 'INTERNSHIP_UPDATED', async (tx, before, status) => {
    requireInternshipState(status, ['APPROVED', 'ONGOING']);
    if (status === 'ONGOING' && input.commencementDate && +input.commencementDate !== +before.commencementDate) {
      throw new AppError('Commencement cannot change once the internship is ongoing.', 409, 'COMMENCEMENT_LOCKED');
    }
    if ((input.expectedCompletionDate && input.expectedCompletionDate > before.expectedCompletionDate && status === 'ONGOING')
      || ((input.commencementDate || input.expectedCompletionDate) && await tx.internshipExtension.count({ where: {
        cancelledAt: null, OR: [{ internshipId: id }, { continuationId: id }]
      } }))) throw new AppError('Use the audited extension workflow for date changes.', 409, 'INTERNSHIP_EXTENSION_REQUIRED');
    await assertNoOverlap(tx, {
      userId: before.userId, commencementDate: input.commencementDate ?? before.commencementDate,
      expectedCompletionDate: input.expectedCompletionDate ?? before.expectedCompletionDate
    }, id);
    return input;
  });
}

export function assignTeamLeader(id, assignedTeamLeaderId, actor, requestId) {
  return editInternship(id, actor, requestId, 'INTERNSHIP_TEAM_LEADER_UPDATED', async (tx, before, status) => {
    requireInternshipState(status, activeEnrollments);
    if (assignedTeamLeaderId) {
      await lockDepartment(tx, before.departmentId);
      await assertTeamLeader(tx, assignedTeamLeaderId, before.departmentId);
    }
    return { assignedTeamLeaderId };
  });
}

export function requestCompletion(id, actor, requestId, ownerOnly) {
  return editInternship(id, actor, requestId, 'INTERNSHIP_COMPLETION_REQUESTED', (_tx, before, status) => {
    requireInternshipState(status, ['COMPLETION_REVIEW']);
    if (before.internshipStatus === 'COMPLETION_REVIEW') {
      throw new AppError('Completion review has already been requested.', 409, 'COMPLETION_ALREADY_REQUESTED');
    }
    return { internshipStatus: 'COMPLETION_REVIEW' };
  }, ownerOnly);
}

export function approveCompletion(id, actualCompletionDate, actor, requestId) {
  return editInternship(id, actor, requestId, 'INTERNSHIP_COMPLETION_APPROVED', (_tx, before, status, today) => {
    requireInternshipState(status, ['COMPLETION_REVIEW']);
    if (before.userId === actor.id) {
      throw new AppError('An intern cannot approve their own completion.', 403, 'SELF_REVIEW_FORBIDDEN');
    }
    const date = actualCompletionDate ?? before.expectedCompletionDate;
    if (date < before.commencementDate || date > today) {
      throw new AppError('Choose a completion date from commencement through today.', 400, 'INVALID_COMPLETION_DATE');
    }
    return { internshipStatus: 'COMPLETED', actualCompletionDate: date,
      completionApprovedBy: actor.id, completionApprovedAt: new Date() };
  });
}

export function endInternship(id, status, reason, actor, requestId, ownerOnly) {
  return editInternship(id, actor, requestId, `INTERNSHIP_${status}`, (_tx, _before, current) => {
    requireInternshipState(current, activeEnrollments);
    return { internshipStatus: status, terminationReason: reason };
  }, ownerOnly);
}
