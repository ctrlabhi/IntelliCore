import { describe, expect, it, vi } from 'vitest';
import { addDays, dateRange, evaluateDay, schedule } from '../../backend/src/modules/attendance/attendancePolicy.js';
import { businessToday } from '../../backend/src/utils/phase04.js';
import { signOutWithAttendance } from '../../frontend/services/attendance-logout.js';

const date = new Date('2034-02-06');
const policy = { id: 'policy', workingDays: [1, 2, 3, 4, 5], checkInTime: '09:30',
  checkOutTime: '18:30', reportDeadline: '20:00', graceMinutes: 0, requiresDailyReport: true };
const full = { startsAt: new Date('2034-02-05T00:00:00Z'), endsAt: null, firstDate: date, lastDate: addDays(date, 30) };
const shift = schedule(date, policy);
const checked = { id: 'a', checkInAt: shift.open };
const day = ({ now, ...overrides }) => evaluateDay({ date, now, policy, periods: [full], ...overrides });

describe('attendance policy and historical eligibility', () => {
  it('uses exact zero-grace IST boundaries and rounds only the display minutes', () => {
    expect(shift.open.toISOString()).toBe('2034-02-06T04:00:00.000Z');
    expect(shift.close.toISOString()).toBe('2034-02-06T13:00:00.000Z');
    expect(shift.reportDeadline.toISOString()).toBe('2034-02-06T14:30:00.000Z');
    expect(day({ now: shift.open, attendance: checked }).isLate).toBe(false);
    expect(day({ now: shift.close, attendance: { checkInAt: new Date(+shift.open + 1000) } })).toMatchObject({ isLate: true, lateMinutes: 1 });
    expect(day({ now: shift.close, attendance: { checkInAt: new Date(+shift.open + 900000) } })).toMatchObject({ lateMinutes: 15 });
  });

  it('keeps open sessions live and evaluates missing checkout and report independently', () => {
    expect(day({ now: shift.close, attendance: checked })).toMatchObject({
      state: 'IN_PROGRESS', status: null, missingCheckOut: false, missingDailyReport: false
    });
    expect(day({ now: new Date(+shift.close + 1), attendance: checked })).toMatchObject({
      state: 'AWAITING_REPORT', missingCheckOut: true, missingDailyReport: false
    });
    expect(day({ now: shift.reportDeadline, attendance: checked })).toMatchObject({
      status: 'INCOMPLETE', missingCheckOut: true, missingDailyReport: true
    });
    expect(day({ now: shift.reportDeadline, attendance: checked, report: { status: 'SUBMITTED', submittedAt: shift.close } }))
      .toMatchObject({ status: 'INCOMPLETE', missingCheckOut: true, missingDailyReport: false });
  });

  it('keeps late and early departure flags even after present attendance is complete', () => {
    const attendance = { checkInAt: new Date(+shift.open + 60000), checkOutAt: new Date(+shift.close - 60000) };
    expect(day({ now: shift.close, attendance, report: { status: 'REVIEWED', submittedAt: shift.close } }))
      .toMatchObject({ status: 'PRESENT', isLate: true, isEarlyDeparture: true, earlyDepartureMinutes: 1, finalized: true });
  });

  it('assigns absence only after the shift with evidence covering the whole window', () => {
    expect(day({ now: shift.close }).status).toBeNull();
    expect(day({ now: shift.reportDeadline }).status).toBe('ABSENT');
    expect(day({ now: shift.reportDeadline, periods: [] }).state).toBe('NOT_ELIGIBLE');
    expect(day({ now: shift.reportDeadline, periods: [{ ...full, endsAt: new Date(+shift.open + 1000) }] }).status).toBeNull();
    expect(day({ now: shift.reportDeadline, periods: [{ ...full, startsAt: new Date(+shift.open + 1000) }] }).status).toBeNull();
    const noon = new Date(+shift.open + 7200000);
    expect(day({ now: shift.reportDeadline, periods: [{ ...full, endsAt: noon }, { ...full, startsAt: noon }] }).status).toBe('ABSENT');
    expect(day({ now: shift.reportDeadline, periods: [{ ...full, endsAt: noon }, { ...full, startsAt: new Date(+noon + 1) }] }).status).toBeNull();
  });

  it('keeps leave, weekly days off and classification flags independent', () => {
    expect(day({ now: shift.reportDeadline, leave: true, attendance: checked })).toMatchObject({
      status: 'ON_LEAVE', checkInAt: shift.open, missingCheckOut: false, missingDailyReport: false
    });
    const saturday = addDays(date, 5);
    expect(day({ date: saturday, now: saturday, leave: true }).status).toBe('WEEKLY_OFF');
  });

  it('bounds date processing and rolls the date at midnight IST', () => {
    expect(businessToday(new Date('2034-02-06T18:29:59Z')).toISOString().slice(0, 10)).toBe('2034-02-06');
    expect(businessToday(new Date('2034-02-06T18:30:00Z')).toISOString().slice(0, 10)).toBe('2034-02-07');
    expect(dateRange(date, addDays(date, 30))).toHaveLength(31);
    expect(() => dateRange(date, addDays(date, 31))).toThrow('date range');
  });
});

describe('explicit logout with attendance', () => {
  it('announces a missing report before completing logout', async () => {
    const steps = [];
    await signOutWithAttendance({
      checkOut: async () => { steps.push('checkout'); return { data: { reportReminder: true } }; },
      notify: (notice) => { expect(notice).toMatch(/report is still missing/); steps.push('reminder'); },
      signOut: async () => { steps.push('signout'); }
    });
    expect(steps).toEqual(['checkout', 'reminder', 'signout']);
  });

  it.each([async () => { throw new Error('network'); }, () => new Promise(() => {})])(
    'completes sign-out even when checkout fails or cannot finish', async (checkOut) => {
      const signOut = vi.fn();
      const notify = vi.fn();
      await signOutWithAttendance({ checkOut, signOut, notify, timeoutMs: 5 });
      expect(signOut).toHaveBeenCalledOnce();
      expect(notify).toHaveBeenCalledWith(expect.stringContaining('could not be confirmed'));
    }
  );
});
