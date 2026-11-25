import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireAuth, requireStatus, requireVerifiedEmail } from '../../middleware/auth.js';
import { endpoint, pageFields, uuid } from '../../utils/phase04.js';
import { confirmAudience, expectedVersion, meetingInput, meetingPatch, meetingStatus, reasons, rescheduleInput } from './meetingRules.js';
import { createMeeting, editDraft, getMeeting, listMeetings, listParticipants, participantAction, previewMeeting,
  retryMeeting, scheduleMeeting, selectMeetingUsers, transitionMeeting } from './meetingService.js';

const page = z.object(pageFields).strict();
const query = page.extend({ status: z.enum(meetingStatus).optional(),
  upcoming: z.enum(['true', 'false']).transform((value) => value === 'true').optional() }).strict();
const response = z.object({ response: z.enum(['ACCEPTED', 'DECLINED']) }).strict();
const cancel = expectedVersion.extend({ reason: reasons });
const id = (req) => uuid.parse(req.params.id);

export const meetingRoutes = Router();
meetingRoutes.use(authenticate, requireAuth, requireVerifiedEmail, requireStatus());
meetingRoutes.get('/me', endpoint((req) => listMeetings(req, query.parse(req.query), true)));
meetingRoutes.get('/me/:id', endpoint((req) => getMeeting(req, id(req), true)));
meetingRoutes.get('/eligible-users', endpoint((req) => selectMeetingUsers(req, page.parse(req.query))));
meetingRoutes.get('/', endpoint((req) => listMeetings(req, query.parse(req.query))));
meetingRoutes.post('/', endpoint((req, requestId) => createMeeting(req, meetingInput.parse(req.body), requestId), 201));
meetingRoutes.get('/:id', endpoint((req) => getMeeting(req, id(req))));
meetingRoutes.get('/:id/participants', endpoint((req) => listParticipants(req, id(req), page.parse(req.query))));
meetingRoutes.patch('/:id', endpoint((req, requestId) => editDraft(req, id(req), meetingPatch.parse(req.body), requestId)));
meetingRoutes.post('/:id/preview-audience', endpoint((req, requestId) =>
  previewMeeting(req, id(req), Object.keys(req.body ?? {}).length ? meetingPatch.parse(req.body) : null, requestId)));
meetingRoutes.post('/:id/schedule', endpoint((req, requestId) =>
  scheduleMeeting(req, id(req), confirmAudience.parse(req.body), false, requestId)));
meetingRoutes.post('/:id/reschedule', endpoint((req, requestId) =>
  scheduleMeeting(req, id(req), rescheduleInput.parse(req.body), true, requestId)));
meetingRoutes.post('/:id/cancel', endpoint((req, requestId) =>
  transitionMeeting(req, id(req), cancel.parse(req.body), 'CANCELLED', requestId)));
meetingRoutes.post('/:id/complete', endpoint((req, requestId) =>
  transitionMeeting(req, id(req), expectedVersion.parse(req.body), 'COMPLETED', requestId)));
meetingRoutes.post('/:id/respond', endpoint((req) => participantAction(req, id(req), response.parse(req.body).response)));
meetingRoutes.post('/:id/join', endpoint((req) => {
  z.object({}).strict().parse(req.body ?? {});
  return participantAction(req, id(req));
}));
meetingRoutes.post('/:id/retry-sync', endpoint((req, requestId) => retryMeeting(req, id(req), expectedVersion.parse(req.body), requestId)));
