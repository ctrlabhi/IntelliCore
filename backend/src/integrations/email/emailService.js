import logger from '../../config/logger.js';

/**
 * Mailer Integration Abstraction
 * Ready for SMTP configuration in Phase 2.
 */
export class EmailService {
  async sendMail({ to, subject, html, text }) {
    logger.info({ to, subject }, '[EmailService] Phase 1 email stub dispatched (logged only).');
    return { success: true, messageId: 'phase1-stub' };
  }
}

export const emailService = new EmailService();
export default emailService;

