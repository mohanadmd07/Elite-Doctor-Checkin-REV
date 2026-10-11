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
