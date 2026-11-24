/**
 * Timezone & Business Hours Utility
 * Configured for Asia/Kolkata (IST = UTC+05:30)
 */

export const BUSINESS_TIMEZONE = 'Asia/Kolkata';

/**
 * Returns current timestamp formatted in Asia/Kolkata
 */
export function getCurrentIstDate(date = new Date()) {
  return new Date(date.toLocaleString('en-US', { timeZone: BUSINESS_TIMEZONE }));
}

/**
 * Formats a Date to YYYY-MM-DD in Asia/Kolkata
 */
export function formatIstDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

/**
 * Validates if the given time is within standard business hours (09:30 - 18:30 IST)
 */
export function isWithinBusinessHours(date = new Date()) {
  const ist = getCurrentIstDate(date);
  const day = ist.getDay(); // 0 is Sun, 6 is Sat

  // Monday to Friday
  if (day === 0 || day === 6) return false;

  const hours = ist.getHours();
  const minutes = ist.getMinutes();
  const totalMinutes = hours * 60 + minutes;

  // 09:30 = 570 mins, 18:30 = 1110 mins
  return totalMinutes >= 570 && totalMinutes <= 1110;
}

