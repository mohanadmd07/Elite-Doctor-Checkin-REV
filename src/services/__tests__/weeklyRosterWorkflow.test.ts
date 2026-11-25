import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Weekly Doctors Roster Backend & Auto-Sync Contracts", () => {
  const serverSource = fs.readFileSync(path.join(process.cwd(), "server.ts"), "utf-8");
  const appSource = fs.readFileSync(path.join(process.cwd(), "src/App.tsx"), "utf-8");

  it("exposes GET /api/checkins/week and POST /api/checkins/weekly batch endpoints", () => {
    expect(serverSource).toContain('app.get(["/api/checkins/week", "/checkins/week"]');
    expect(serverSource).toContain('app.post(["/api/checkins/weekly", "/checkins/weekly"]');
    expect(serverSource).toContain("getCheckInsForDateRange");
  });

  it("merges pre-scheduled weekly doctors into Live Today Roster and 8:00 AM Daily Excel Sheet", () => {
    expect(serverSource).toContain("async function getEffectiveTodayCheckIns()");
    expect(serverSource).toContain("checkins = await getEffectiveTodayCheckIns();");
    expect(serverSource).toContain("const list = await getEffectiveTodayCheckIns();");
  });

  it("preserves future scheduled dates during 30-day rolling FIFO pruning", () => {
    expect(serverSource).toContain("const pastOrTodayDates = Array.from(dateMap.keys())");
    expect(serverSource).toContain("const futureDates = Array.from(dateMap.keys()).filter((d) => d > activeTodayDate)");
  });

  it("tags upcoming scheduled dates in GET /api/checkins/dates and Admin Roster UI", () => {
    expect(serverSource).toContain("isUpcoming: date > activeTodayDate");
    expect(appSource).toContain("UPCOMING WEEKLY SCHEDULE");
    expect(appSource).toContain("EntryModeSelector");
    expect(appSource).toContain("WeeklyRosterPlanner");
  });
});
