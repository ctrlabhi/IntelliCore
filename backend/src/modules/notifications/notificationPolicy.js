import { createHash } from 'node:crypto';

const events = {
  APPLICATION_SUBMITTED: ['ACCOUNT', 'Internship application received', 'An internship application was submitted.', 'application-received', true],
  APPLICATION_REVIEW_REQUIRED: ['INTERNSHIP', 'Internship application ready for review', 'A new internship application is awaiting an authorized review.'],
  APPLICATION_APPROVED: ['ACCOUNT', 'Internship application approved', 'Your internship application was approved.', 'application-approved', true],
  APPLICATION_REJECTED: ['ACCOUNT', 'Internship application decision', 'Your internship application was declined. Sign in for the decision.', 'application-decision', true],
  APPLICATION_CHANGES_REQUESTED: ['ACCOUNT', 'Application changes requested', 'Your internship application needs updates. Sign in to view the request.', 'application-decision', true],
  INTERNSHIP_ENROLLED: ['INTERNSHIP', 'Internship enrollment confirmed', 'Your internship enrollment is available in your workspace.'],
  INTERNSHIP_COMMENCING: ['INTERNSHIP', 'Internship starting soon', 'Your internship commencement date is approaching.'],
  INTERNSHIP_COMMENCED: ['INTERNSHIP', 'Internship started', 'Your internship has reached its commencement date.'],
  INTERNSHIP_COMPLETION_DUE: ['INTERNSHIP', 'Internship completion review approaching', 'An internship is approaching the end of its planned period.'],
  CERTIFICATE_DISPATCH_RECORDED: ['INTERNSHIP', 'Certificate email status', 'Your internship certificate has been sent to your registered email address. Please check your inbox and spam folder.'],
  CERTIFICATE_DISPATCH_CORRECTED: ['INTERNSHIP', 'Certificate email status corrected', 'The previous certificate email declaration was corrected. Check your internship timeline for the current status.'],
  INTERNSHIP_EXTENDED: ['INTERNSHIP', 'Internship extended', 'An authorized extension is available in your internship timeline.'],
  INTERNSHIP_EXTENSION_CANCELLED: ['INTERNSHIP', 'Internship extension cancelled', 'An authorized extension was cancelled. Review your internship timeline.'],
  INTERNSHIP_PROMOTION_UPDATED: ['INTERNSHIP', 'Internship promotion updated', 'A designation or promotion decision is available in your internship timeline.'],
  MEETING_SCHEDULED: ['MEETING', 'Meeting scheduled', 'A meeting is available in your workspace.'],
  MEETING_INVITED: ['MEETING', 'Meeting invitation', 'You have been invited to a meeting. Open your workspace for details.', 'meeting-update'],
  MEETING_RESCHEDULED: ['MEETING', 'Meeting rescheduled', 'A meeting invitation was updated. Open your workspace for the current details.', 'meeting-update'],
  MEETING_CANCELLED: ['MEETING', 'Meeting cancelled', 'An upcoming meeting was cancelled. Open your workspace for details.', 'meeting-update'],
  MEETING_REMINDER: ['MEETING', 'Meeting reminder', 'An upcoming meeting is on your schedule.', 'meeting-update'],
  INTERNSHIP_COMPLETED: ['INTERNSHIP', 'Internship completion approved', 'Your internship completion was approved.', 'internship-completed'],
  INTERNSHIP_TERMINATED: ['INTERNSHIP', 'Internship status updated', 'Your internship was terminated. Review your enrollment information.'],
  TEAM_LEADER_CHANGED: ['INTERNSHIP', 'Team Leader assignment updated', 'An internship’s Team Leader assignment changed. Review the enrollment for details.'],
  REPORT_REMINDER: ['ATTENDANCE', 'Daily work report reminder', 'Your daily work report is due today.'],
  REPORT_SUBMITTED: ['ATTENDANCE', 'Daily work report available', 'An intern in your assigned scope submitted a daily work report.'],
  REPORT_REVIEWED: ['ATTENDANCE', 'Daily work report reviewed', 'Your daily work report has been reviewed.'],
  LEAVE_REQUESTED: ['LEAVE', 'Leave request awaiting review', 'An internship leave request is awaiting review.'],
  LEAVE_APPROVED: ['LEAVE', 'Leave request approved', 'Your leave request was approved.', 'leave-approved'],
  LEAVE_REJECTED: ['LEAVE', 'Leave request decision', 'Your leave request was declined. Sign in for the details.', 'leave-rejected'],
  CORRECTION_REQUESTED: ['ATTENDANCE', 'Attendance correction requested', 'An attendance correction request is awaiting review.'],
  CORRECTION_APPROVED: ['ATTENDANCE', 'Attendance correction approved', 'Your attendance correction request was approved.', 'attendance-correction'],
  CORRECTION_REJECTED: ['ATTENDANCE', 'Attendance correction decision', 'Your attendance correction request was declined.', 'attendance-correction'],
  TASK_ASSIGNED: ['TASK', 'Task assigned', 'A task has been assigned to you. View the instructions and deadline in your workspace.', 'task-assigned'],
  TASK_DEADLINE_CHANGED: ['TASK', 'Task deadline extended', 'An assigned task has a new deadline.'],
  TASK_DEADLINE_REMINDER: ['TASK', 'Task deadline approaching', 'An assigned task is due within the next day.', 'task-reminder', false, 'taskReminders'],
  TASK_SUBMITTED: ['TASK', 'Task submission ready for review', 'An authorized assignment has a new submission to review.'],
  TASK_REVISION_REQUESTED: ['TASK', 'Task revision requested', 'A reviewer requested a revision. Sign in to read their feedback.', 'task-revision'],
  TASK_APPROVED: ['TASK', 'Task approved', 'A reviewer approved your task submission.', 'task-approved'],
  TASK_CANCELLED: ['TASK', 'Assignment cancelled', 'One of your task assignments was cancelled.'],
  TASK_SCORE_AMENDED: ['TASK', 'Task score updated', 'An authorized reviewer recorded a score amendment.'],
  LEARNING_ASSIGNED: ['LEARNING', 'Learning track assigned', 'Your workspace has a new learning enrollment.', null, false, 'learningUpdates'],
  LEARNING_VERSION_AVAILABLE: ['LEARNING', 'Updated curriculum published', 'A new curriculum version is available to authorized mentors. Existing enrollments retain their version.', null, false, 'learningUpdates'],
  LEARNING_COMPLETED: ['LEARNING', 'Required learning lessons completed', 'Your required lesson progress has reached completion.', null, false, 'learningUpdates'],
  LEARNING_PROGRESS_CORRECTED: ['LEARNING', 'Learning progress corrected', 'An authorized mentor corrected a learning progress record.'],
  ANNOUNCEMENT_PUBLISHED: ['ANNOUNCEMENT', 'Company announcement', 'An announcement is available in your IntelliCore workspace.',
    'company-announcement']
};

export function policyFor(event) {
  const [category, title, message, templateKey, onboarding = false, preference] = events[event];
  return { category, title, message, templateKey, onboarding, preference };
}

const roleOrder = [
  ['FOUNDER', '/dashboards/founder'], ['CO_FOUNDER', '/dashboards/founder'], ['ADMIN', '/dashboards/hr'],
  ['HR_MANAGER', '/dashboards/hr'], ['HR_EXECUTIVE', '/dashboards/hr'], ['OPERATIONS_EXECUTIVE', '/dashboards/hr'],
  ['TEAM_LEADER', '/dashboards/team-leader']
];
export const categories = ['ACCOUNT', 'INTERNSHIP', 'ATTENDANCE', 'LEAVE', 'TASK', 'LEARNING', 'ANNOUNCEMENT', 'MEETING'];
const pathPattern = /^\/dashboards\/(?:intern|founder|hr|team-leader)\?notice=[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}#phase07Notice$/u;
export const isActionPath = (path) => typeof path === 'string' && pathPattern.test(path);

export function actionPath(roles, id) {
  const page = roleOrder.find(([role]) => roles.includes(role))?.[1] ?? '/dashboards/intern';
  return page + '?notice=' + id + '#phase07Notice';
}

export const digest = (parts) => createHash('sha256').update(JSON.stringify(parts)).digest('hex');

const permission = (code) => ({ rolePermissions: { some: { permission: { code } } } });
const permitted = (roles, code) => ({ userRoles: { some: { role: { code: { in: roles }, ...permission(code) } } } });
const founder = ['FOUNDER'];
const hr = [...founder, 'HR_MANAGER'];

export const recipientRules = {
  APPLICATION_REVIEW: () => permitted([...hr, 'CO_FOUNDER'], 'applications:review'),
  LEAVE_REVIEW: () => permitted(hr, 'leaves:review'),
  CORRECTION_REVIEW: () => permitted(hr, 'attendance:review_corrections'),
  INTERNSHIP_REVIEW: () => permitted([...hr, 'CO_FOUNDER'], 'internships:approve_completion'),
  TASK_REVIEW: (departmentId) => ({ OR: [
    permitted(['FOUNDER', 'CO_FOUNDER'], 'tasks:review_all'),
    leaderScope(departmentId, 'tasks:review_department')
  ] }),
  DEPARTMENT_REPORT: (departmentId) => leaderScope(departmentId, 'reports:read_department'),
  DEPARTMENT_LEARNING: (departmentId) => leaderScope(departmentId, 'learning:read_department')
};

function leaderScope(departmentId, code) {
  return { ...permitted(['TEAM_LEADER'], code), staffProfile: { employmentStatus: 'ACTIVE' },
    userDepartments: { some: { departmentId, isActive: true, assignedRole: 'TEAM_LEADER', department: { isActive: true } } } };
}

export const recipientSelect = { id: true, email: true, status: true, notificationPreference: true,
  userRoles: { select: { role: { select: { code: true } } } } };

export function recipientWhere(rule, departmentId) {
  return { status: 'ACTIVE', emailVerified: true, ...recipientRules[rule](departmentId) };
}
