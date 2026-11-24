import logger from '../../config/logger.js';

/**
 * Google Calendar Integration Abstraction
 * Ready for Google Calendar & Meet integration in Phase 2.
 */
export class CalendarService {
  async createMeeting({ summary, startTime, endTime, attendees }) {
    logger.info({ summary, startTime }, '[CalendarService] Phase 1 meeting stub (logged only).');
    return {
      meetLink: 'https://meet.google.com/dev-pending',
      eventId: 'dev-event-id'
    };
  }
}

export const calendarService = new CalendarService();
export default calendarService;

