import { businessToday } from '../../utils/phase04.js';
import { addDays, dayKey, readPolicy, schedule } from '../attendance/attendancePolicy.js';
import { eligibleWhere } from '../work/workAccess.js';
import { eligibleEnrollmentStates, internAccount } from '../attendance/eligibility.js';
import { waitingForWork } from '../work/taskService.js';
import { audienceReviewers, emitNotifications } from './notificationService.js';

const minute = 60000;
const immediately = (n) => new Date(n);
const defaults = { taskHours: 24, reportMinutes: 30, commencementDays: 2, completionDays: 3 };
const bounded = (value, maximum, fallback) => {
  const result = Number(value);
  return Number.isInteger(result) && result >= 0 && result <= maximum ? result : fallback;
};

export function reminderOptions(source = process.env) {
  return {
    taskHours: bounded(source.NOTIFICATION_TASK_REMINDER_HOURS, 72, defaults.taskHours),
    reportMinutes: bounded(source.NOTIFICATION_REPORT_REMINDER_MINUTES, 120, defaults.reportMinutes),
    commencementDays: bounded(source.NOTIFICATION_COMMENCEMENT_DAYS, 14, defaults.commencementDays),
    completionDays: bounded(source.NOTIFICATION_COMPLETION_DAYS, 14, defaults.completionDays)
  };
}

const own = (event, type, item, userId, version, now) => ({ event, type, resourceId: item.id, recipientIds: [userId], version, now });

export async function runReminders(client, now, cursors, options = reminderOptions(), batch = 50) {
  const date = businessToday(now);
  const available = { department: { isActive: true }, user: internAccount, internshipStatus: { in: eligibleEnrollmentStates } };
  const internshipFields = { id: true, userId: true, commencementDate: true, expectedCompletionDate: true };
  const pendingCursors = {};
  let notifications = 0;
  await client.$transaction(async (tx) => {
    async function scan(key, model, where, select) {
      const rows = await model.findMany({ where: { ...where, ...(cursors[key] ? { id: { gt: cursors[key] } } : {}) },
        select, orderBy: { id: 'asc' }, take: batch });
      pendingCursors[key] = rows.length === batch ? rows.at(-1).id : undefined;
      return rows;
    }
    const newEvents = [];
    if (options.taskHours) {
      const dueAt = { gt: now, lte: immediately(+now + options.taskHours * 60 * minute) };
      const tasks = await scan('tasks', tx.taskAssignment, { internship: eligibleWhere(now), status: { in: waitingForWork },
        task: { status: 'PUBLISHED', availableFrom: { lte: now } }, OR: [{ dueAt }, { dueAt: null, task: { dueAt } }] },
      { id: true, assignedTo: true, dueAt: true, task: { select: { dueAt: true } } });
      for (const row of tasks) newEvents.push(own('TASK_DEADLINE_REMINDER', 'TASK_ASSIGNMENT',
        row, row.assignedTo, (row.dueAt ?? row.task.dueAt).toISOString(), now));
    }
    if (options.reportMinutes) {
      const policy = await readPolicy(date, tx);
      const shift = schedule(date, policy);
      if (policy.requiresDailyReport && shift.workingDay && now < shift.reportDeadline
        && now >= shift.open && +shift.reportDeadline - +now <= options.reportMinutes * minute) {
        const active = await scan('reports', tx.internship, {
          ...eligibleWhere(now), attendanceEligibility: { some: { firstDate: { lte: date }, lastDate: { gte: date },
            startsAt: { lte: now }, endsAt: null } },
          leaveRequests: { none: { status: 'APPROVED', startDate: { lte: date }, endDate: { gte: date } } },
          dailyWorkReports: { none: { businessDate: date, submittedAt: { not: null } } }
        }, internshipFields);
        for (const row of active) newEvents.push(own('REPORT_REMINDER', 'REPORT_DAY', row, row.userId, dayKey(date), now));
      }
    }
    const starting = await scan('starts', tx.internship, { ...available, commencementDate: {
      gte: date, lte: addDays(date, options.commencementDays)
    } }, internshipFields);
    for (const row of starting) newEvents.push(own(+row.commencementDate === +date ? 'INTERNSHIP_COMMENCED' : 'INTERNSHIP_COMMENCING',
      'INTERNSHIP', row, row.userId, dayKey(row.commencementDate), now));
    if (options.completionDays) {
      const completing = await scan('ends', tx.internship, { ...available, commencementDate: { lte: date },
        expectedCompletionDate: { gte: date, lte: addDays(date, options.completionDays) } }, internshipFields);
      if (completing.length) {
        const reviewers = (await audienceReviewers(tx, 'INTERNSHIP_REVIEW')).map(({ id }) => id);
        for (const row of completing) newEvents.push({
          ...own('INTERNSHIP_COMPLETION_DUE', 'INTERNSHIP', row, row.userId, dayKey(row.expectedCompletionDate), now),
          recipientIds: [row.userId, ...reviewers]
        });
      }
    }
    notifications += (await emitNotifications(tx, newEvents)).length;
  }, { isolationLevel: 'ReadCommitted', timeout: 15000 });
  Object.assign(cursors, pendingCursors);
  return notifications;
}
