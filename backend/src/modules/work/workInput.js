
import { z } from 'zod';
import { AppError } from '../../utils/errors.js';
import { businessDate, pageFields, uuid } from '../../utils/phase04.js';

export const taskTypes = ['INDIVIDUAL', 'DEPARTMENT'];
export const priorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
export const taskStatuses = ['DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED', 'CANCELLED'];
export const assignmentStatuses = ['ASSIGNED', 'IN_PROGRESS', 'SUBMITTED', 'REVISION_REQUESTED', 'COMPLETED', 'CANCELLED'];
export const curriculumStatuses = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];
export const revision = z.number().int().min(1).max(2147483647);
export const score = z.number().int().min(0).max(10000);
export const title = z.string().trim().min(1).max(180);
export const detail = z.string().trim().max(8000);
export const iso = z.string().datetime({ offset: true }).refine((value) => {
  const year = Number(value.slice(0, 4));
  const localDate = new Date(value.slice(0, 10) + 'T00:00:00.000Z');
  return year >= 1001 && year <= 9998 && Number.isFinite(+new Date(value)) && Number.isFinite(+localDate)
    && localDate.toISOString().slice(0, 10) === value.slice(0, 10);
}, 'Enter an ISO date and time with a valid date and offset.').transform((value) => new Date(value));

export const safeUrl = z.string().trim().max(1500).regex(/^https?:\/\//i)
  .refine((value) => {
    if (/[\x00-\x20\x7f\\]/u.test(value)) return false;
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
    } catch {
      return false;
    }
  }, 'Use an HTTP(S) link without credentials.');

const link = z.object({ title, url: safeUrl }).strict();
const criterion = z.object({ criterion: title, points: score.min(1) }).strict();
export const taskFields = {
  title, description: detail.default(''), instructions: detail.min(1), deliverables: detail.min(1),
  taskType: z.enum(taskTypes), priority: z.enum(priorities).default('MEDIUM'),
  availableFrom: iso, dueAt: iso, maximumScore: score.min(1).nullable().default(null),
  resources: z.array(link).max(20).default([]), rubric: z.array(criterion).max(12).default([])
};
export const taskCreate = z.object({ departmentId: uuid, templateKey: z.string().trim().min(1).max(100).optional(),
  ...taskFields }).strict();
export const taskPatch = z.object(taskFields).partial().extend({ expectedRevision: revision,
  confirmActiveChange: z.boolean().default(false) }).strict();
export const recipient = z.object({ internshipId: uuid, dueAt: iso.optional() }).strict();
export const recipients = z.object({ recipients: z.array(recipient).max(250).default([]),
  expectedRevision: revision.optional(), previewToken: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  confirmActiveChange: z.boolean().default(false) }).strict()
  .superRefine(({ recipients: rows }, ctx) => {
    if (new Set(rows.map((row) => row.internshipId)).size !== rows.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['recipients'], message: 'Recipient internships must be unique.' });
    }
  });
export const draftPatch = z.object({
  writtenResponse: detail.nullable().optional(), projectUrl: safeUrl.nullable().optional(),
  repositoryUrl: safeUrl.nullable().optional(), additionalLinks: z.array(link).max(10).optional(),
  expectedRevision: revision
}).strict();
export const reviewFields = z.object({
  decision: z.enum(['APPROVED', 'REVISION_REQUESTED']), feedback: detail.max(4000).min(8),
  score: score.nullable().optional(), criterionScores: z.array(score).max(12).optional()
}).strict();

const sequence = z.number().int().min(1).max(10000);
export const trackFields = z.object({ title, description: detail.default('') }).strict();
export const moduleFields = z.object({ title, description: detail.default(''), sequence,
  estimatedMinutes: z.number().int().min(1).max(10000).nullable().default(null), isRequired: z.boolean().default(true) }).strict();
export const lessonFields = moduleFields.omit({ description: true }).extend({ content: detail.min(1) });
export const resourceFields = z.object({ title, resourceUrl: safeUrl, description: detail.default(''), sequence }).strict();
export const empty = z.object({}).strict();
export const confirm = z.object({ confirmActiveChange: z.literal(true) }).strict();
export const expectedRevision = z.object({ expectedRevision: revision }).strict();

export const listingFields = { ...pageFields, departmentId: uuid.optional(), sort: z.enum(['asc', 'desc']).default('desc') };
export const taskQuery = z.object({ ...listingFields, status: z.enum(taskStatuses).optional() }).strict();
export const assignmentQuery = z.object({ ...listingFields, internshipId: uuid.optional(),
  status: z.enum(assignmentStatuses).optional(), overdue: z.enum(['true', 'false']).transform((s) => s === 'true').optional() }).strict();
export const trackQuery = z.object({ ...listingFields, status: z.enum(curriculumStatuses).optional() }).strict();
export const performanceQuery = z.object({ ...listingFields, from: businessDate.optional(), to: businessDate.optional() }).strict();
export const enrollmentQuery = z.object({ ...listingFields, internshipId: uuid.optional() }).strict();

export function dateRange(query) {
  const { from, to } = query;
  if (from && to && from > to) throw new AppError('Start date must precede end date.', 400, 'INVALID_DATE_RANGE');
  const istMidnight = (date) => new Date(+date - 330 * 60000);
  return {
    ...(from ? { gte: istMidnight(from) } : {}),
    ...(to ? { lt: istMidnight(new Date(+to + 86400000)) } : {})
  };
}
