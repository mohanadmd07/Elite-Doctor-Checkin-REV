import { describe, it, expect } from 'vitest';
import {
  getEgyptDateStr,
  getEgyptResetTime,
  getEgyptParts,
  shiftIsoDate,
  buildRollingWeekDates,
  getActiveHospitalSheetDateStr,
} from '../timezone';

describe('Egypt Timezone Calculations', () => {
  it('extracts correct date parts for a midday timestamp', () => {
    // 2026-10-11T12:00:00Z -> In Cairo (UTC+3) is 15:00
    const ts = '2026-10-11T12:00:00.000Z';
    const parts = getEgyptParts(ts);
    expect(parts.year).toBe(2026);
    expect(parts.month).toBe(10);
    expect(parts.day).toBe(11);
    expect(parts.hour).toBe(15);
  });

  it('keeps the same date when checkin is before 19:00 Cairo time', () => {
    // 10:00 UTC = 13:00 Cairo
    const ts = '2026-10-11T10:00:00.000Z';
    expect(getEgyptDateStr(ts)).toBe('2026-10-11');
  });

  it('advances date to next calendar day when checkin is at or after 19:00 Cairo time (night shift convention)', () => {
    // 17:00 UTC = 20:00 Cairo (>= 19:00)
    const ts = '2026-10-11T17:00:00.000Z';
    expect(getEgyptDateStr(ts)).toBe('2026-10-12');
  });

  it('calculates 18:30 Cairo reset time as a valid Date object', () => {
    const ts = '2026-10-11T10:00:00.000Z';
    const resetTime = getEgyptResetTime(ts);
    expect(resetTime).toBeInstanceOf(Date);
    expect(isNaN(resetTime.getTime())).toBe(false);
  });

  it('shifts ISO dates accurately across month and year boundaries', () => {
    expect(shiftIsoDate('2026-11-28', 7)).toBe('2026-12-05');
    expect(shiftIsoDate('2026-12-29', 5)).toBe('2027-01-03');
    expect(shiftIsoDate('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('builds a rolling 7-day window starting from the active hospital sheet date with Arabic & English weekdays', () => {
    const days = buildRollingWeekDates('2026-11-25', 0, 7, '2026-11-25');
    expect(days).toHaveLength(7);
    expect(days[0].isoDate).toBe('2026-11-25');
    expect(days[0].englishShort).toBe('Wed');
    expect(days[0].arabicWeekday).toBe('الأربعاء');
    expect(days[0].isToday).toBe(true);
    expect(days[6].isoDate).toBe('2026-12-01');
    expect(days[6].isToday).toBe(false);

    const nextWeek = buildRollingWeekDates('2026-11-25', 1, 7, '2026-11-25');
    expect(nextWeek[0].isoDate).toBe('2026-12-02');
    expect(nextWeek.every((d) => !d.isToday)).toBe(true);
  });

  it('computes active hospital sheet date respecting 19:00 Cairo cutoff', () => {
    const beforeCutoff = new Date('2026-11-25T10:00:00.000Z'); // 12:00 Cairo
    const afterCutoff = new Date('2026-11-25T18:00:00.000Z'); // 20:00 Cairo
    expect(getActiveHospitalSheetDateStr(beforeCutoff)).toBe('2026-11-25');
    expect(getActiveHospitalSheetDateStr(afterCutoff)).toBe('2026-11-26');
  });
});
