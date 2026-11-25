export interface EgyptDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function getEgyptParts(timestampStr: string): EgyptDateTimeParts {
  const d = new Date(timestampStr);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  });
  const parts = formatter.formatToParts(d);
  const year = parseInt(parts.find((p) => p.type === "year")?.value || "0", 10);
  const month = parseInt(parts.find((p) => p.type === "month")?.value || "0", 10);
  const day = parseInt(parts.find((p) => p.type === "day")?.value || "0", 10);
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);
  const second = parseInt(parts.find((p) => p.type === "second")?.value || "0", 10);
  return { year, month, day, hour, minute, second };
}

export function getEgyptDateStr(timestampStr: string): string {
  try {
    const parts = getEgyptParts(timestampStr);
    let utcTime = Date.UTC(parts.year, parts.month - 1, parts.day);
    // Inputs added after 7 PM are considered next day's input
    if (parts.hour >= 19) {
      utcTime += 24 * 60 * 60 * 1000;
    }
    const targetDate = new Date(utcTime);
    const y = targetDate.getUTCFullYear();
    const m = String(targetDate.getUTCMonth() + 1).padStart(2, "0");
    const d = String(targetDate.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  } catch (err) {
    try {
      return new Date(timestampStr).toISOString().split("T")[0];
    } catch (e) {
      return new Date().toISOString().split("T")[0];
    }
  }
}

export function getEgyptResetTime(timestampStr: string): Date {
  try {
    const targetDateStr = getEgyptDateStr(timestampStr);
    const [yearStr, monthStr, dayStr] = targetDateStr.split("-");
    const utcYear = parseInt(yearStr, 10);
    const utcMonth = parseInt(monthStr, 10) - 1;
    const utcDay = parseInt(dayStr, 10);

    const checkinDate = new Date(timestampStr);
    const tzString = checkinDate.toLocaleString("en-US", {
      timeZone: "Africa/Cairo",
      timeZoneName: "longOffset",
    });
    const offsetMatch = tzString.match(/GMT([+-])(\d+)(?::(\d+))?/);
    let offsetMinutes = 120; // fallback to UTC+2
    if (offsetMatch) {
      const sign = offsetMatch[1] === "+" ? 1 : -1;
      const hours = parseInt(offsetMatch[2], 10);
      const mins = offsetMatch[3] ? parseInt(offsetMatch[3], 10) : 0;
      offsetMinutes = sign * (hours * 60 + mins);
    }

    // Reset daily sheets at 6:30 PM (18:30:00) of the target day
    const localResetUTC = Date.UTC(utcYear, utcMonth, utcDay, 18, 30, 0);
    return new Date(localResetUTC - offsetMinutes * 60 * 1000);
  } catch (err) {
    console.error("Error in getEgyptResetTime, falling back:", err);
    const d = new Date();
    d.setUTCHours(18, 30, 0, 0);
    return d;
  }
}

export interface WeekDayInfo {
  isoDate: string;
  englishShort: string;
  englishFull: string;
  arabicWeekday: string;
  dayNum: string;
  monthShort: string;
  formattedShort: string;
  isToday: boolean;
}

const ENGLISH_SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const ENGLISH_FULL_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const ARABIC_WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"] as const;
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export function getActiveHospitalSheetDateStr(now: Date = new Date()): string {
  return getEgyptDateStr(now.toISOString());
}

export function shiftIsoDate(isoDate: string, deltaDays: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) return getActiveHospitalSheetDateStr();
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1;
  const day = parseInt(match[3], 10);
  const d = new Date(Date.UTC(year, month, day + deltaDays));
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function buildRollingWeekDates(
  baseIsoDate: string,
  weekOffset = 0,
  daysCount = 7,
  activeTodayIso?: string
): WeekDayInfo[] {
  const safeBase = /^\d{4}-\d{2}-\d{2}$/.test(baseIsoDate.trim())
    ? baseIsoDate.trim()
    : getActiveHospitalSheetDateStr();
  const todayIso = activeTodayIso && /^\d{4}-\d{2}-\d{2}$/.test(activeTodayIso.trim())
    ? activeTodayIso.trim()
    : safeBase;

  const startDate = shiftIsoDate(safeBase, weekOffset * daysCount);
  const result: WeekDayInfo[] = [];

  for (let i = 0; i < daysCount; i++) {
    const iso = shiftIsoDate(startDate, i);
    const [yStr, mStr, dStr] = iso.split("-");
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10) - 1;
    const day = parseInt(dStr, 10);
    const utcDate = new Date(Date.UTC(y, m, day));
    const dow = utcDate.getUTCDay();
    const monthShort = SHORT_MONTHS[m] || "";
    const dayNum = String(day).padStart(2, "0");

    result.push({
      isoDate: iso,
      englishShort: ENGLISH_SHORT_DAYS[dow],
      englishFull: ENGLISH_FULL_DAYS[dow],
      arabicWeekday: ARABIC_WEEKDAYS[dow],
      dayNum,
      monthShort,
      formattedShort: `${dayNum} ${monthShort}`,
      isToday: iso === todayIso,
    });
  }

  return result;
}
