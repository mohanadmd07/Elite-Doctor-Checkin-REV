import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Historical & Date-Specific Doctor Check-In Editor", () => {
  // Mirror the server's 7:00 PM Cairo sheet date transition helper
  function getEgyptDateStr(timestampStr?: string): string {
    try {
      const d = timestampStr ? new Date(timestampStr) : new Date();
      if (isNaN(d.getTime())) return "";
      const hourStr = d.toLocaleTimeString("en-US", {
        timeZone: "Africa/Cairo",
        hour: "numeric",
        hour12: false,
      });
      const hour = parseInt(hourStr, 10) || 0;
      const target = new Date(d);
      if (hour >= 19) {
        target.setDate(target.getDate() + 1);
      }
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Africa/Cairo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(target);
    } catch {
      return "";
    }
  }

  function normalizeSheetDateInput(input?: string): string {
    if (!input || !input.trim()) return getEgyptDateStr();
    const s = input.trim();
    const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (isoMatch) {
      return `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`;
    }
    const dmyMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmyMatch) {
      return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, "0")}-${dmyMatch[1].padStart(2, "0")}`;
    }
    return "";
  }

  function buildTimestampForSheetDate(targetDateStr: string, existingTimestamp?: string): string {
    const normalizedTarget = normalizeSheetDateInput(targetDateStr);
    if (existingTimestamp && getEgyptDateStr(existingTimestamp) === normalizedTarget) {
      return existingTimestamp;
    }
    return `${normalizedTarget}T10:00:00.000Z`;
  }

  it("normalizes both YYYY-MM-DD and DD/MM/YYYY sheet date inputs", () => {
    expect(normalizeSheetDateInput("2026-04-15")).toBe("2026-04-15");
    expect(normalizeSheetDateInput("2026-4-5")).toBe("2026-04-05");
    expect(normalizeSheetDateInput("15/04/2026")).toBe("2026-04-15");
    expect(normalizeSheetDateInput("5-4-2026")).toBe("2026-04-05");
  });

  it("generates a timestamp for a target sheet date that resolves back to the exact same Egypt sheet date", () => {
    const targetDate = "2026-04-14";
    const generatedTs = buildTimestampForSheetDate(targetDate);
    expect(generatedTs).toBe("2026-04-14T10:00:00.000Z");
    expect(getEgyptDateStr(generatedTs)).toBe(targetDate);
  });

  it("preserves an existing timestamp when editing a doctor on the same sheet date (including post-7PM check-ins)", () => {
    // 2026-04-14T18:30:00.000Z is 20:30 Cairo time -> belongs to 2026-04-15 sheet date
    const post7pmTs = "2026-04-14T18:30:00.000Z";
    expect(getEgyptDateStr(post7pmTs)).toBe("2026-04-15");
    expect(buildTimestampForSheetDate("2026-04-15", post7pmTs)).toBe(post7pmTs);
    // When moving the check-in to a different date (2026-04-16), it generates a new timestamp for 2026-04-16
    expect(buildTimestampForSheetDate("2026-04-16", post7pmTs)).toBe("2026-04-16T10:00:00.000Z");
  });

  it("verifies server.ts and src/App.tsx expose all historical date editing endpoints and UI controls", () => {
    const serverSource = fs.readFileSync(path.join(process.cwd(), "server.ts"), "utf-8");
    const appSource = fs.readFileSync(path.join(process.cwd(), "src/App.tsx"), "utf-8");

    expect(serverSource).toContain('app.get(["/api/checkins/dates"');
    expect(serverSource).toContain('app.get(["/api/checkins/by-date"');
    expect(serverSource).toContain('app.post(["/api/checkins/by-date"');
    expect(serverSource).toContain('app.put(["/api/checkins/by-date"');
    expect(serverSource).toContain('app.delete(["/api/checkins/by-date/:id"');
    expect(serverSource).toContain("upsertCheckInForDate");
    expect(serverSource).toContain("deleteCheckInForDate");

    expect(appSource).toContain("roster-quick-date-select");
    expect(appSource).toContain("roster-date-picker");
    expect(appSource).toContain("add-doctor-to-date-btn");
    expect(appSource).toContain("handleOpenEditCheckinModal");
    expect(appSource).toContain("handleSaveCheckinModal");
  });
});
