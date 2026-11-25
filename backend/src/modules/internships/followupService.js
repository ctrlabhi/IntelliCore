import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import prisma from '../../config/database.js';
import { AppError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { businessToday, lockDepartment, lockUser, readPage, requireActiveDepartment, transaction } from '../../utils/phase04.js';
import { assertRecentAuthentication } from '../../utils/recentAuth.js';
import { internAccount, syncAttendanceEligibility } from '../attendance/eligibility.js';
import auditService from '../audit/auditService.js';
import { saveStaffAssignment } from '../departments/departmentService.js';
import { currentActor } from '../notifications/notificationAccess.js';
import { policyFor } from '../notifications/notificationPolicy.js';
import { emitNotification } from '../notifications/notificationService.js';
import roleService from '../roles/roleService.js';
import staffService from '../staff/staffService.js';
import { activeEnrollments, assertNoOverlap, effectiveStatus, ensureFound, teamLeaderDepartmentScope } from './internshipPolicy.js';
import { assertFollowupManager, followupScope, primaryFounder } from './followupAccess.js';

const day = 86400000;
const nextDay = (date) => new Date(+date + day);
const conflict = (message, code) => new AppError(message, 409, code);
const dispatchEvent = 'CERTIFICATE_DISPATCH_RECORDED';
const promotionEvent = 'INTERNSHIP_PROMOTION_UPDATED';
const pendingStatus = 'Certificate email has not yet been marked as sent.';
const periods = { id: true, internshipCode: true, positionTitle: true, commencementDate: true, expectedCompletionDate: true,
  actualCompletionDate: true, internshipStatus: true, completionApprovedAt: true };

function scopeFor(req, id, certificate = false) {
  return { AND: [{ id }, followupScope(req, certificate)] };
}

async function scopedInternship(client, req, id, certificate) {
  return ensureFound(await client.internship.findFirst({ where: scopeFor(req, id, certificate), select: { ...periods,
    userId: true, departmentId: true } }), 'Internship not found.');
}

function completed(internship) {
  if (internship.internshipStatus !== 'COMPLETED' || !internship.completionApprovedAt || !internship.actualCompletionDate) {
    throw conflict('This action requires a completed internship with HR approval.', 'INTERNSHIP_COMPLETION_REQUIRED');
  }
}

function change(req, id, operation) {
  assertFollowupManager(req);
  if (primaryFounder(req)) assertRecentAuthentication(req);
  return transaction(async (tx) => {
    const target = await scopedInternship(tx, req, id);
    await lockUser(tx, target.userId);
    const actor = await currentActor(tx, req.user.id);
    assertFollowupManager(actor);
    if (target.userId === actor.user.id) throw new ForbiddenError();
    return operation(tx, actor, await tx.internship.findUniqueOrThrow({ where: { id } }), new Date());
  }, { retryUnique: true });
}

function recordAudit(tx, actor, requestId, action, resourceType, resourceId, afterState, beforeState) {
  return auditService.createAuditLog(tx, { actorUserId: actor.user.id, requestId, action, resourceType, resourceId, beforeState, afterState });
}

function notice(tx, internship, event, id, now) {
  return emitNotification(tx, { event, type: 'INTERNSHIP', resourceId: internship.id,
    recipientIds: [internship.userId], version: id, now });
}

const latestFirst = { sequence: 'desc' };
const certificateReaders = (req) => primaryFounder(req) || req.roles.some((role) => ['HR_MANAGER', 'HR_EXECUTIVE'].includes(role));
const dispatchView = (row) => ({ status: row?.status ?? 'NOT_SENT', declaredSentAt: row?.declaredSentAt ?? null,
  recordedAt: row?.recordedAt ?? null, recordedByAuthorizedTeam: Boolean(row),
  message: row?.status === 'SENT' ? policyFor(dispatchEvent).message : pendingStatus });

async function dispatchStatus(client, id) {
  return dispatchView(await client.certificateDispatch.findFirst({ where: { internshipId: id }, orderBy: latestFirst }));
}

export async function completedDirectory(req, query) {
  if (!certificateReaders(req) || !req.permissions.includes('internships:read_followups')) throw new ForbiddenError();
  const { page, limit, search, dispatchStatus } = query;
  const dispatch = Prisma.sql`COALESCE((SELECT d.status FROM certificate_dispatch_history d
    WHERE d.internship_id = i.id ORDER BY d.sequence DESC LIMIT 1), 'NOT_SENT')`;
  const term = '%' + search + '%';
  const conditions = Prisma.sql`FROM internships i LEFT JOIN profiles p ON p.user_id = i.user_id
    WHERE i.internship_status = 'COMPLETED' AND i.completion_approved_at IS NOT NULL
    ${search ? Prisma.sql`AND (i.internship_code LIKE ${term} OR i.position_title LIKE ${term} OR p.full_name LIKE ${term})` : Prisma.empty}
    ${dispatchStatus ? Prisma.sql`AND ${dispatch} = ${dispatchStatus}` : Prisma.empty}`;
  return prisma.$transaction(async (tx) => {
    const [counts, ids] = await Promise.all([
      tx.$queryRaw`SELECT COUNT(*) AS total ${conditions}`,
      tx.$queryRaw`SELECT i.id, ${dispatch} AS dispatchStatus ${conditions}
        ORDER BY i.completion_approved_at DESC, i.id ASC LIMIT ${limit} OFFSET ${(page - 1) * limit}`
    ]);
    const rows = await tx.internship.findMany({ where: { id: { in: ids.map(({ id }) => id) } }, select: { ...periods,
      department: { select: { name: true } }, continuationOf: { select: { internshipId: true } },
      user: { select: { profile: { select: { fullName: true } }, status: true,
        staffProfile: { select: { designation: true, employmentStatus: true } } } } } });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const items = ids.flatMap(({ id, dispatchStatus }) => {
      const row = byId.get(id);
      return row ? [{ ...row, dispatchStatus, candidate: { status: row.user.status, staffProfile: row.user.staffProfile } }] : [];
    });
    const total = Number(counts[0].total);
    return { items, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  });
}

export async function getDispatch(req, id, query, client = prisma) {
  await scopedInternship(client, req, id, true);
  const status = await dispatchStatus(client, id);
  if (!certificateReaders(req) || !req.permissions.includes('internships:read_followups')) return status;
  const history = await readPage(client.certificateDispatch, { where: { internshipId: id }, orderBy: latestFirst,
    select: { id: true, status: true, declaredSentAt: true, recordedAt: true, note: true,
      actor: { select: { id: true, profile: { select: { fullName: true } } } } } }, query);
  return { ...status, history };
}

export function declareDispatch(req, id, input, status, requestId) {
  return change(req, id, async (tx, actor, internship, now) => {
    completed(internship);
    const previous = await tx.certificateDispatch.findFirst({ where: { internshipId: id }, orderBy: latestFirst });
    const retry = await tx.certificateDispatch.findUnique({ where: { internshipId_requestKey: {
      internshipId: id, requestKey: input.requestKey } } });
    if (retry) {
      if (retry.status !== status || retry.actorId !== actor.user.id) throw conflict('This request has already been used.', 'DISPATCH_REQUEST_CONFLICT');
      return dispatchView(previous);
    }
    if ((previous?.status ?? 'NOT_SENT') === status) {
      throw conflict('The current dispatch status already matches this action.', 'DISPATCH_ALREADY_CURRENT');
    }

    if (status === 'SENT') {
      const recipient = await tx.user.findFirst({ where: { id: internship.userId, status: 'ACTIVE', emailVerified: true },
        select: { id: true } });
      if (!recipient) throw conflict('Only an eligible account can receive this declaration.', 'DISPATCH_RECIPIENT_UNAVAILABLE');
      if (input.declaredSentAt > now) {
        throw new AppError('Choose a sent time at or before now.', 400, 'INVALID_DISPATCH_DATE');
      }
    }

    const row = await tx.certificateDispatch.create({ data: { internshipId: id, actorId: actor.user.id,
      sequence: (previous?.sequence ?? 0) + 1, requestKey: input.requestKey, status, recordedAt: now,
      declaredSentAt: status === 'SENT' ? input.declaredSentAt : null, note: input.note ?? input.reason } });
    if (status === 'NOT_SENT') {
      await tx.notification.updateMany({ where: { eventType: dispatchEvent, relatedResourceId: id, recipientUserId: internship.userId },
        data: { archivedAt: now, message: 'This certificate email declaration was superseded. Check your internship timeline for the current status.' } });
    }
    await notice(tx, internship, status === 'SENT' ? dispatchEvent : 'CERTIFICATE_DISPATCH_CORRECTED', row.id, now);
    await recordAudit(tx, actor, requestId, 'CERTIFICATE_DISPATCH_' + status, 'INTERNSHIP', id,
      { declarationId: row.id, status, declaredSentAt: row.declaredSentAt, ...(status === 'NOT_SENT' ? { reason: input.reason } : {}) }, { status: previous?.status ?? 'NOT_SENT' });
    return dispatchView(row);
  });
}

async function assertEligibleIntern(tx, internship) {
  if (!await tx.user.count({ where: { id: internship.userId, ...internAccount } })) {
    throw conflict('Choose an active verified intern without staff employment.', 'FOLLOWUP_ACCOUNT_NOT_ELIGIBLE');
  }
  await lockDepartment(tx, internship.departmentId);
  await requireActiveDepartment(tx, internship.departmentId);
}

const extensionSelect = { id: true, previousEnd: true, startsOn: true, endsOn: true, reason: true, remarks: true,
  createdAt: true, cancelledAt: true, cancellationNote: true, continuation: { select: periods } };

export async function extensionHistory(req, id, query) {
  const internship = await scopedInternship(prisma, req, id);
  return readPage(prisma.internshipExtension, { where: { OR: [{ internshipId: id }, { continuationId: internship.id }] },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], select: extensionSelect }, query);
}

export function extendInternship(req, id, input, requestId) {
  return change(req, id, async (tx, actor, internship, now) => {
    const today = businessToday(now);
    const startsOn = input.startsOn;
    const endsOn = input.endsOn ?? new Date(+startsOn + (input.durationDays - 1) * day);
    const isCompleted = internship.internshipStatus === 'COMPLETED';
    const previousEnd = isCompleted ? internship.actualCompletionDate : internship.expectedCompletionDate;
    if (isCompleted) completed(internship);
    else if (!activeEnrollments.includes(effectiveStatus(internship, today)) || internship.internshipStatus === 'COMPLETION_REVIEW') {
      throw conflict('This internship cannot be extended in its current state.', 'INTERNSHIP_EXTENSION_UNAVAILABLE');
    }
    if (startsOn < today || startsOn <= previousEnd || endsOn < startsOn || endsOn.getUTCFullYear() > 9998
        || (!isCompleted && +startsOn !== +nextDay(previousEnd))) {
      throw new AppError('Choose a valid extension period. An open internship extension starts the day after its current end.', 400, 'INVALID_EXTENSION_DATES');
    }
    await assertEligibleIntern(tx, internship);
    if (isCompleted && await tx.internshipExtension.count({ where: { internshipId: id, continuationId: { not: null }, cancelledAt: null } })) {
      throw conflict('This period already has a continuation.', 'CONTINUATION_EXISTS');
    }
    await assertNoOverlap(tx, { userId: internship.userId,
      commencementDate: isCompleted ? startsOn : internship.commencementDate, expectedCompletionDate: endsOn }, id, { includeCompleted: true });
    let continuationId = null;
    if (isCompleted) {
      const leaderId = internship.assignedTeamLeaderId;
      const leader = leaderId && await tx.department.count({ where: { id: internship.departmentId, ...teamLeaderDepartmentScope(leaderId).department } });
      const continuation = await tx.internship.create({ data: {
        internshipCode: 'IC-INT-' + randomUUID().replaceAll('-', '').toUpperCase(), userId: internship.userId,
        departmentId: internship.departmentId, assignedTeamLeaderId: leader ? leaderId : null, positionTitle: internship.positionTitle,
        workMode: internship.workMode, commencementDate: startsOn, expectedCompletionDate: endsOn,
        duration: String(Math.round((endsOn - startsOn) / day) + 1) + ' days', approvedBy: actor.user.id, approvedAt: now
      }, select: { id: true } });
      continuationId = continuation.id;
    } else {
      await tx.internship.update({ where: { id }, data: { expectedCompletionDate: endsOn } });
    }
    const row = await tx.internshipExtension.create({ data: { internshipId: id, continuationId, actorId: actor.user.id,
      previousEnd, startsOn, endsOn, reason: input.reason, remarks: input.remarks, createdAt: now }, select: extensionSelect });
    await syncAttendanceEligibility(tx, internship.userId, now);
    await recordAudit(tx, actor, requestId, 'INTERNSHIP_EXTENDED', 'INTERNSHIP', id,
      { extensionId: row.id, continuationId, startsOn, endsOn, reason: input.reason }, { expectedCompletionDate: previousEnd });
    await notice(tx, internship, 'INTERNSHIP_EXTENDED', row.id, now);
    return row;
  });
}

export function cancelExtension(req, id, extensionId, reason, requestId) {
  return change(req, id, async (tx, actor, internship, now) => {
    const item = await tx.internshipExtension.findFirst({ where: { id: extensionId, internshipId: id }, include: { continuation: true } });
    if (!item) throw new NotFoundError('Internship extension not found.');
    if (item.cancelledAt) return tx.internshipExtension.findUnique({ where: { id: item.id }, select: extensionSelect });
    if (item.startsOn <= businessToday(now) || (item.continuation && item.continuation.internshipStatus !== 'APPROVED')
      || (!item.continuation && +internship.expectedCompletionDate !== +item.endsOn)
      || (item.continuation && await tx.internshipPromotion.count({ where: { continuationId: item.continuationId, status: 'APPROVED' } }))) {
      throw conflict('Only a future, unused extension can be cancelled.', 'EXTENSION_CANCELLATION_UNAVAILABLE');
    }
    if (item.continuation) {
      await tx.internship.update({ where: { id: item.continuationId }, data: { internshipStatus: 'WITHDRAWN', terminationReason: reason } });
    } else {
      await tx.internship.update({ where: { id }, data: { expectedCompletionDate: item.previousEnd } });
    }
    const row = await tx.internshipExtension.update({ where: { id: item.id },
      data: { cancelledAt: now, cancellationNote: reason }, select: extensionSelect });
    await syncAttendanceEligibility(tx, internship.userId, now);
    await recordAudit(tx, actor, requestId, 'INTERNSHIP_EXTENSION_CANCELLED', 'INTERNSHIP', id, { extensionId, reason });
    await notice(tx, internship, 'INTERNSHIP_EXTENSION_CANCELLED', extensionId, now);
    return row;
  });
}

const promotionSelect = { id: true, internshipId: true, continuationId: true, designation: true, effectiveOn: true,
  department: { select: { id: true, name: true } }, targetRole: true, reason: true, status: true, decisionReason: true,
  createdAt: true, decidedAt: true, provisionedAt: true, provisionedStaffId: true, requestedBy: true, decidedBy: true,
  internship: { select: { internshipCode: true, user: { select: { profile: { select: { fullName: true } } } } } } };
const promotionOrder = [{ createdAt: 'desc' }, { id: 'asc' }];

export async function promotionHistory(req, id, query) {
  await scopedInternship(prisma, req, id);
  return readPage(prisma.internshipPromotion, { where: { OR: [{ internshipId: id }, { continuationId: id }] },
    orderBy: promotionOrder, select: promotionSelect }, query);
}

export function promotionDirectory(req, query) {
  if (!certificateReaders(req) || !req.permissions.includes('internships:read_followups')) throw new ForbiddenError();
  return readPage(prisma.internshipPromotion, { where: { targetRole: { not: null }, status: query.status,
    ...(query.search ? { OR: [{ designation: { contains: query.search } }, { internship: {
      user: { profile: { fullName: { contains: query.search } } } } }] } : {}) }, orderBy: promotionOrder, select: promotionSelect }, query);
}

export function requestPromotion(req, id, input, requestId) {
  return change(req, id, async (tx, actor, internship, now) => {
    completed(internship);
    if (input.effectiveOn < businessToday(now)) throw new AppError('Choose an effective date of today or later.', 400, 'INVALID_EFFECTIVE_DATE');
    const isStaff = Boolean(input.targetRole);
    if (!isStaff) {
      await assertEligibleIntern(tx, internship);
      if (input.continuationId && !await tx.internship.count({ where: {
        id: input.continuationId, userId: internship.userId, continuationOf: { internshipId: id, cancelledAt: null },
        internshipStatus: { in: activeEnrollments }, commencementDate: { lte: input.effectiveOn },
        expectedCompletionDate: { gte: input.effectiveOn }
      } })) throw conflict('Choose an eligible continuation for this effective date.', 'PROMOTION_CONTINUATION_UNAVAILABLE');
    } else {
      await lockDepartment(tx, input.departmentId);
      await requireActiveDepartment(tx, input.departmentId);
      const active = await tx.user.count({ where: { id: internship.userId, status: 'ACTIVE', emailVerified: true,
        OR: [internAccount, { staffProfile: { employmentStatus: 'ACTIVE' } }] } });
      if (!active) throw conflict('Choose an eligible active account.', 'PROMOTION_CANDIDATE_UNAVAILABLE');
    }
    const duplicate = await tx.internshipPromotion.findFirst({ where: { internship: { userId: internship.userId },
      ...(isStaff ? { targetRole: { not: null }, status: { in: ['PENDING', 'APPROVED'] } } : {
        targetRole: null, status: 'APPROVED', continuationId: input.continuationId ?? null,
        internshipId: id, effectiveOn: input.effectiveOn
      }) } });
    if (duplicate) throw conflict('A conflicting promotion already exists.', 'PROMOTION_ALREADY_EXISTS');
    const row = await tx.internshipPromotion.create({ data: { ...input, internshipId: id,
      requestedBy: actor.user.id, createdAt: now, status: isStaff ? 'PENDING' : 'APPROVED',
      ...(!isStaff ? { decidedBy: actor.user.id, decidedAt: now } : {}) }, select: promotionSelect });
    await recordAudit(tx, actor, requestId, isStaff ? 'STAFF_PROMOTION_RECOMMENDED' : 'INTERN_DESIGNATION_APPROVED',
      'INTERNSHIP_PROMOTION', row.id, { internshipId: id, status: row.status, targetRole: row.targetRole,
        designation: row.designation, effectiveOn: row.effectiveOn, reason: input.reason });
    await notice(tx, internship, promotionEvent, row.id, now);
    return row;
  });
}

export async function decidePromotion(req, id, status, reason, requestId) {
  const founder = primaryFounder(req);
  if (status !== 'CANCELLED' && !founder) throw new ForbiddenError();
  assertFollowupManager(req);
  const existing = await prisma.internshipPromotion.findFirst({ where: { id, targetRole: { not: null } },
    select: { internshipId: true } });
  if (!existing) throw new NotFoundError('Staff recommendation not found.');
  return change(req, existing.internshipId, async (tx, actor, internship, now) => {
    const item = await tx.internshipPromotion.findUniqueOrThrow({ where: { id } });
    const isFounder = primaryFounder(actor);
    if ((status === 'CANCELLED' && !isFounder && item.requestedBy !== actor.user.id)
      || (status !== 'CANCELLED' && (!isFounder || actor.user.id === item.requestedBy))) throw new ForbiddenError();
    if (item.status === status) return tx.internshipPromotion.findUnique({ where: { id }, select: promotionSelect });
    const allowed = status === 'PROVISIONED' ? ['APPROVED'] : status === 'CANCELLED' && isFounder ? ['PENDING', 'APPROVED'] : ['PENDING'];
    if (!allowed.includes(item.status)) throw conflict('This recommendation cannot change in its current state.', 'INVALID_PROMOTION_TRANSITION');
    let provisioned;
    if (status === 'PROVISIONED') {
      if (!actor.permissions.includes('staff:create') || !actor.permissions.includes('roles:assign')
          || !actor.permissions.includes('departments:assign_staff')) throw new ForbiddenError();
      if (item.effectiveOn > businessToday(now)) throw conflict('Provisioning is available on or after the approved joining date.', 'PROMOTION_NOT_EFFECTIVE');
      const current = await tx.user.findUniqueOrThrow({ where: { id: internship.userId }, include: { staffProfile: true } });
      if (current.status !== 'ACTIVE' || !current.emailVerified
          || (current.staffProfile && current.staffProfile.employmentStatus !== 'ACTIVE')) throw conflict('The account is no longer eligible.', 'PROMOTION_CANDIDATE_UNAVAILABLE');
      await lockDepartment(tx, item.departmentId);
      await requireActiveDepartment(tx, item.departmentId);
      if (current.staffProfile) {
        await roleService.assignUserRoles(current.id, [item.targetRole], actor, requestId, tx);
        provisioned = await staffService.updateStaff(current.staffProfile.id, { designation: item.designation }, actor.user.id, requestId, tx);
        const memberships = await tx.userDepartment.findMany({ where: { userId: current.id, assignedRole: 'TEAM_LEADER', isActive: true,
          ...(item.targetRole === 'TEAM_LEADER' ? { departmentId: { not: item.departmentId } } : {}) }, select: { departmentId: true } });
        for (const { departmentId } of memberships) {
          await saveStaffAssignment(departmentId, { userId: current.id, assignedRole: 'TEAM_LEADER', isActive: false }, actor.user, requestId, tx);
        }
      } else {
        provisioned = await staffService.provisionStaff({ userId: current.id, designation: item.designation,
          joiningDate: item.effectiveOn, roleCode: item.targetRole, createdBy: actor.user.id, requestId }, tx);
      }
      await saveStaffAssignment(item.departmentId, { userId: current.id,
        assignedRole: item.targetRole === 'TEAM_LEADER' ? 'TEAM_LEADER' : 'STAFF', isActive: true }, actor.user, requestId, tx);
    }
    const row = await tx.internshipPromotion.update({ where: { id }, select: promotionSelect, data: {
      status, ...(provisioned ? { provisionedAt: now, provisionedStaffId: provisioned.id } :
        { decidedBy: actor.user.id, decidedAt: now, decisionReason: reason })
    } });
    await recordAudit(tx, actor, requestId, 'STAFF_PROMOTION_' + status, 'INTERNSHIP_PROMOTION', id,
      { internshipId: internship.id, status, reason, provisionedStaffId: provisioned?.id }, { status: item.status });
    await notice(tx, internship, promotionEvent, id + ':' + status, now);
    return row;
  });
}
