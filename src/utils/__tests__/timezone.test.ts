import { describe, it, expect } from 'vitest';
import { getEgyptDateStr, getEgyptResetTime, getEgyptParts } from '../timezone';

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
});
