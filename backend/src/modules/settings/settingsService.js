import { prisma } from '../../config/database.js';
import logger from '../../config/logger.js';

/**
 * Foundation System Settings Service
 * Phase 1: Reads and writes infrastructure settings via Prisma
 */
export class SettingsService {
  /**
   * Retrieve a setting by its unique key
   */
  async get(key) {
    try {
      const record = await prisma.systemSetting.findUnique({
        where: { key }
      });
      return record ? record.value : null;
    } catch (err) {
      logger.warn({ err: err.message, key }, 'Failed to fetch system setting');
      return null;
    }
  }

  /**
   * Retrieve all public system settings
   */
  async getPublicSettings() {
    try {
      return await prisma.systemSetting.findMany({
        where: { isPublic: true },
        select: { key: true, value: true, description: true, category: true }
      });
    } catch (err) {
      logger.warn({ err: err.message }, 'Failed to fetch public settings');
      return [];
    }
  }

  /**
   * Upsert a setting
   */
  async set(key, value, description = null, category = 'general', isPublic = false) {
    return prisma.systemSetting.upsert({
      where: { key },
      update: { value, description, category, isPublic },
      create: { key, value, description, category, isPublic }
    });
  }
}

export const settingsService = new SettingsService();
export default settingsService;

