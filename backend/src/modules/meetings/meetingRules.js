import { z } from 'zod';
import { AppError } from '../../utils/errors.js';
import { uuid } from '../../utils/phase04.js';
import { audienceTypes } from '../notifications/announcementService.js';
import { iso } from '../work/workInput.js';

export const meetingMode = ['MANUAL', 'GOOGLE_CALENDAR'];
export const meetingStatus = ['DRAFT', 'SCHEDULED', 'CANCELLED', 'COMPLETED'];
export const syncStatus = ['NOT_REQUIRED', 'PENDING', 'PROCESSING', 'READY', 'FAILED', 'SYNC_REQUIRED'];
export const reasons = z.string().trim().min(1).max(500);
export const meetPattern = /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}\/?$/u;

export function normalizedMeetUrl(value) {
  if (typeof value !== 'string' || !meetPattern.test(value)) return null;
  const url = new URL(value);
  return url.origin + url.pathname.replace(/\/$/u, '');
}

export const meetingInput = z.object({
  title: z.string().trim().min(1).max(160), description: z.string().trim().min(1).max(4000),
  audienceType: z.enum(audienceTypes), departmentId: uuid.nullable().default(null),
  selectedUserIds: z.array(uuid).max(250).default([]), startAt: iso, endAt: iso,
  creationMode: z.enum(meetingMode).default('MANUAL'), meetingUrl: z.string().trim().max(255).nullable().default(null)
}).strict();

const revision = z.number().int().min(0).max(2147483647);
export const meetingPatch = meetingInput.partial().extend({ expectedVersion: revision }).strict();
export const confirmAudience = z.object({ expectedVersion: revision, previewToken: z.string().regex(/^[a-f0-9]{64}$/u) }).strict();
export const expectedVersion = z.object({ expectedVersion: revision }).strict();
export const rescheduleInput = meetingPatch.extend({ previewToken: z.string().regex(/^[a-f0-9]{64}$/u) }).strict();

export function meetingFields(value) {
  const { title, description, audienceType, departmentId, selectedUserIds, startAt, endAt, creationMode } = value;
  const meetingUrl = normalizedMeetUrl(value.meetingUrl);
  if ((audienceType === 'DEPARTMENT') !== Boolean(departmentId) || (audienceType === 'SELECTED_USERS') !== Boolean(selectedUserIds.length)
      || (creationMode === 'MANUAL' ? !meetingUrl : Boolean(value.meetingUrl))
      || endAt <= startAt || +endAt - +startAt > 86400000) {
    throw new AppError('Choose a valid audience, meeting link and duration of up to 24 hours.', 400, 'INVALID_MEETING');
  }
  return { title, description, audienceType, departmentId, selectedUserIds: [...new Set(selectedUserIds)].sort(), startAt, endAt,
    creationMode, meetingUrl };
}
