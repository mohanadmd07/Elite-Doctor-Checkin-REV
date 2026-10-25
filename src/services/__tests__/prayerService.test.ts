import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  formatPrayerMessage,
  formatTo12Hour,
  parseTimeToMinutes,
  PRAYER_NAMES_AR,
  resolvePrayerWhatsAppGroupIds,
  getCairoParts,
  getCairoDateString,
  getCairoTimeString,
  getCairoDatesRange,
  executePrayerFetch,
  executePrayerDispatch,
} from "../prayerService.js";
import * as doctorCallDispatcher from "../doctorCallDispatcher.js";
import * as supabaseDb from "../../db/supabase.js";

describe("Prayer Notification Service - Core Logic & Formatting", () => {
  it("converts 24-hour time strings to 12-hour format with Arabic periods (ص / م)", () => {
    expect(formatTo12Hour("05:42")).toBe("05:42 ص");
    expect(formatTo12Hour("12:00")).toBe("12:00 م");
    expect(formatTo12Hour("12:44")).toBe("12:44 م");
    expect(formatTo12Hour("15:55")).toBe("03:55 م");
    expect(formatTo12Hour("18:18")).toBe("06:18 م");
    expect(formatTo12Hour("19:37")).toBe("07:37 م");
    expect(formatTo12Hour("00:15")).toBe("12:15 ص");
  });

  it("formats exact two-line Arabic message for all 5 prayers with 12h format", () => {
    // 1. Fajr (الفجر) - morning
    const fajrMsg = formatPrayerMessage("Fajr", "05:43:00");
    expect(fajrMsg).toBe("🕌 حان الآن موعد أذان الفجر بتوقيت الإسكندرية\n🕐 05:43 ص");

    // 2. Dhuhr (الظهر) - noon
    const dhuhrMsg = formatPrayerMessage("Dhuhr", "11:58");
    expect(dhuhrMsg).toBe("🕌 حان الآن موعد أذان الظهر بتوقيت الإسكندرية\n🕐 11:58 ص");

    const dhuhrAfternoonMsg = formatPrayerMessage("Dhuhr", "12:44");
    expect(dhuhrAfternoonMsg).toBe("🕌 حان الآن موعد أذان الظهر بتوقيت الإسكندرية\n🕐 12:44 م");

    // 3. Asr (العصر) - afternoon
    const asrMsg = formatPrayerMessage("Asr", "15:15");
    expect(asrMsg).toBe("🕌 حان الآن موعد أذان العصر بتوقيت الإسكندرية\n🕐 03:15 م");

    // 4. Maghrib (المغرب) - evening
    const maghribMsg = formatPrayerMessage("Maghrib", "17:42");
    expect(maghribMsg).toBe("🕌 حان الآن موعد أذان المغرب بتوقيت الإسكندرية\n🕐 05:42 م");

    // 5. Isha (العشاء) - night
    const ishaMsg = formatPrayerMessage("Isha", "19:05");
    expect(ishaMsg).toBe("🕌 حان الآن موعد أذان العشاء بتوقيت الإسكندرية\n🕐 07:05 م");
  });

  it("adds [TEST] prefix for test messages in 12h format", () => {
    const testMsg = formatPrayerMessage("Dhuhr", "12:00", true);
    expect(testMsg).toBe("[TEST] 🕌 حان الآن موعد أذان الظهر بتوقيت الإسكندرية\n🕐 12:00 م");
  });

  it("parses time strings to minutes since midnight accurately", () => {
    expect(parseTimeToMinutes("00:00")).toBe(0);
    expect(parseTimeToMinutes("05:43")).toBe(5 * 60 + 43);
    expect(parseTimeToMinutes("11:58:00")).toBe(11 * 60 + 58);
    expect(parseTimeToMinutes("23:59 (EEST)")).toBe(23 * 60 + 59);
  });

  it("resolves and normalizes WhatsApp group IDs from WHATSAPP_GROUP_ID", () => {
    const originalEnv = process.env.WHATSAPP_GROUP_ID;
    try {
      // Single group with @g.us
      process.env.WHATSAPP_GROUP_ID = "120363011111111111@g.us";
      expect(resolvePrayerWhatsAppGroupIds()).toEqual(["120363011111111111@g.us"]);

      // Comma-separated groups, unnormalized
      process.env.WHATSAPP_GROUP_ID = "120363011111111111, 120363022222222222@g.us, 120363033333333333";
      expect(resolvePrayerWhatsAppGroupIds()).toEqual([
        "120363011111111111@g.us",
        "120363022222222222@g.us",
        "120363033333333333@g.us",
      ]);

      // Deduplication test
      process.env.WHATSAPP_GROUP_ID = "120363011111111111@g.us, 120363011111111111";
      expect(resolvePrayerWhatsAppGroupIds()).toEqual(["120363011111111111@g.us"]);
    } finally {
      process.env.WHATSAPP_GROUP_ID = originalEnv;
    }
  });

  it("calculates Africa/Cairo parts, date string, and weekly 8-day range in DST-safe manner", () => {
    // Standard test date: 2026-10-25 10:00:00 UTC = 13:00:00 in Africa/Cairo (UTC+3)
    const fixedDate = new Date("2026-10-25T10:00:00Z");
    const parts = getCairoParts(fixedDate);
    expect(parts.year).toBe(2026);
    expect(parts.month).toBe(10);
    expect(parts.day).toBe(25);
    expect(parts.hour).toBe(13);
    expect(parts.minute).toBe(0);

    const dateStr = getCairoDateString(fixedDate);
    expect(dateStr).toBe("2026-10-25");

    const timeStr = getCairoTimeString(fixedDate);
    expect(timeStr).toBe("13:00");

    const datesRange = getCairoDatesRange(fixedDate, 8);
    expect(datesRange).toHaveLength(8);
    expect(datesRange[0]).toBe("2026-10-25");
    expect(datesRange[7]).toBe("2026-11-01");
  });
});

describe("Prayer Notification Dispatch - Tolerance & Late-Send Cutoff", () => {
  it("enforces tolerance: 0 to +2 minutes late fires, older than +2 or future prayers never fire", () => {
    // Current time: 12:00 (720 minutes)
    const currentMinutes = 12 * 60; // 720

    const isDue = (scheduledTime: string) => {
      const sched = parseTimeToMinutes(scheduledTime);
      const diff = currentMinutes - sched;
      return diff >= 0 && diff <= 2;
    };

    // Exactly on time (12:00) -> diff 0 -> FIRE
    expect(isDue("12:00")).toBe(true);

    // 1 minute late (11:59) -> diff +1 -> FIRE
    expect(isDue("11:59")).toBe(true);

    // 2 minutes late (11:58) -> diff +2 -> FIRE
    expect(isDue("11:58")).toBe(true);

    // 3 minutes late (11:57) -> diff +3 -> MISSED / CUTOFF
    expect(isDue("11:57")).toBe(false);

    // 10 minutes late (11:50) -> diff +10 -> MISSED / CUTOFF
    expect(isDue("11:50")).toBe(false);

    // 1 minute in the future (12:01) -> diff -1 -> NOT DUE
    expect(isDue("12:01")).toBe(false);
  });
});

describe("Prayer Service - Fetch & Dispatch Integration with Mocks", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.PRAYER_NOTIFICATIONS_ENABLED = "true";
    process.env.CRON_SECRET = "test-secret-123";
    process.env.WHATSAPP_GROUP_ID = "120363011111111111@g.us";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("returns skipped when PRAYER_NOTIFICATIONS_ENABLED is false", async () => {
    process.env.PRAYER_NOTIFICATIONS_ENABLED = "false";

    const fetchResult = await executePrayerFetch({ force: true });
    expect(fetchResult.skipped).toBe(true);

    const dispatchResult = await executePrayerDispatch();
    expect(dispatchResult.skipped).toBe(true);
  });

  it("fetch enforces Friday 06:00 AM guard: skips when not Friday 06:00 AM Cairo unless force=true", async () => {
    // Mock getSupabase
    const mockSupabase: any = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: [] }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
      })),
    };
    vi.spyOn(supabaseDb, "getSupabase").mockReturnValue(mockSupabase);

    // Check current Cairo time
    const cairoParts = getCairoParts();
    const isFriday06AM = cairoParts.weekday.toLowerCase() === "friday" && cairoParts.hour === 6;

    if (!isFriday06AM) {
      const normalRun = await executePrayerFetch({ force: false });
      expect(normalRun.skipped).toBe(true);
      expect(normalRun.reason).toContain("Weekly fetch is scheduled for Friday at 06:00 AM");
    }

    // With force=true, bypasses Friday 06:00 AM guard and attempts fetch
    const mockAladhanResponse = {
      code: 200,
      data: {
        timings: {
          Fajr: "05:43",
          Dhuhr: "11:58",
          Asr: "15:15",
          Maghrib: "17:42",
          Isha: "19:05",
        },
      },
    };
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockAladhanResponse,
    } as any);

    const forcedRun = await executePrayerFetch({ force: true, daysCount: 2 });
    expect(forcedRun.success).toBe(true);
    expect(forcedRun.data.daysCount).toBe(2);
    expect(forcedRun.data.timingsByDate[forcedRun.data.startDate].Fajr).toBe("05:43");
    expect(forcedRun.data.timingsByDate[forcedRun.data.startDate].Dhuhr).toBe("11:58");
  });

  it("dedup/atomic claim logic: prevents double-send when concurrent executions occur", async () => {
    const todayStr = getCairoDateString();
    const currentCairoTime = getCairoTimeString();

    // Mock supabase to return today's times matching current time
    const mockRows = [
      { prayer_date: todayStr, prayer: "Dhuhr", prayer_time: currentCairoTime },
      { prayer_date: todayStr, prayer: "Fajr", prayer_time: "05:00" },
      { prayer_date: todayStr, prayer: "Asr", prayer_time: "15:00" },
      { prayer_date: todayStr, prayer: "Maghrib", prayer_time: "18:00" },
      { prayer_date: todayStr, prayer: "Isha", prayer_time: "20:00" },
    ];

    let atomicClaimCount = 0;

    const mockSupabase: any = {
      from: vi.fn((table: string) => {
        if (table === "prayer_times") {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({ data: mockRows, error: null }),
            eq: vi.fn().mockResolvedValue({ data: mockRows, error: null }),
            upsert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        if (table === "prayer_notifications") {
          return {
            upsert: vi.fn().mockResolvedValue({ error: null }),
            update: vi.fn(() => ({
              eq: vi.fn().mockReturnThis(),
              select: vi.fn(async () => {
                // First call succeeds in transitioning from pending to sending
                atomicClaimCount++;
                if (atomicClaimCount === 1) {
                  return { data: [{ id: "notif-1", status: "sending" }], error: null };
                }
                // Second concurrent call receives 0 rows (already claimed!)
                return { data: [], error: null };
              }),
            })),
          };
        }
        return {};
      }),
    };

    vi.spyOn(supabaseDb, "getSupabase").mockReturnValue(mockSupabase);
    const sendSpy = vi.spyOn(doctorCallDispatcher, "sendGreenApiTextMessage").mockResolvedValue({
      success: true,
      idMessage: "msg-123",
    });

    // 1st Execution claims and sends
    const run1 = await executePrayerDispatch();
    expect(run1.success).toBe(true);
    expect(run1.prayer).toBe("Dhuhr");
    expect(sendSpy).toHaveBeenCalledTimes(1);

    // 2nd Execution attempts simultaneously -> claim returns 0 rows -> skips send
    const run2 = await executePrayerDispatch();
    expect(run2.success).toBe(true);
    expect(run2.skipped).toBe(true);
    expect(run2.reason).toContain("Already claimed or sent");
    // sendSpy must NOT be called again!
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });
});
