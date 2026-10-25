import { getSupabase } from "../db/supabase.js";
import { sendGreenApiTextMessage } from "./doctorCallDispatcher.js";

export const PRAYER_NAMES = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"] as const;
export type PrayerName = (typeof PRAYER_NAMES)[number];

export const PRAYER_NAMES_AR: Record<PrayerName, string> = {
  Fajr: "الفجر",
  Dhuhr: "الظهر",
  Asr: "العصر",
  Maghrib: "المغرب",
  Isha: "العشاء",
};

export interface CairoDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: string;
}

/**
 * Extracts date and time components strictly in Africa/Cairo IANA timezone.
 */
export function getCairoParts(date: Date = new Date()): CairoDateTimeParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    weekday: "long",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  return {
    year: parseInt(parts.find((p) => p.type === "year")?.value || "0", 10),
    month: parseInt(parts.find((p) => p.type === "month")?.value || "0", 10),
    day: parseInt(parts.find((p) => p.type === "day")?.value || "0", 10),
    hour: parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10),
    minute: parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10),
    second: parseInt(parts.find((p) => p.type === "second")?.value || "0", 10),
    weekday: parts.find((p) => p.type === "weekday")?.value || "",
  };
}

/**
 * Returns Cairo calendar date as YYYY-MM-DD.
 */
export function getCairoDateString(date: Date = new Date()): string {
  const parts = getCairoParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

/**
 * Returns Cairo local time as HH:mm (24-hour format).
 */
export function getCairoTimeString(date: Date = new Date()): string {
  const parts = getCairoParts(date);
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

/**
 * Generates an array of YYYY-MM-DD dates in Africa/Cairo for the next N days.
 * Handles month/year boundaries and daylight saving transitions safely.
 */
export function getCairoDatesRange(startDate: Date = new Date(), daysCount = 8): string[] {
  const dates: string[] = [];
  const startParts = getCairoParts(startDate);

  for (let i = 0; i < daysCount; i++) {
    // Noon UTC on startParts + i calendar days avoids DST boundary shifts
    const d = new Date(Date.UTC(startParts.year, startParts.month - 1, startParts.day + i, 12, 0, 0));
    const p = getCairoParts(d);
    dates.push(`${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`);
  }

  return dates;
}

/**
 * Converts a YYYY-MM-DD string into DD-MM-YYYY for the Aladhan API path.
 */
export function formatToAladhanDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}-${m}-${y}`;
}

/**
 * Converts HH:mm or HH:mm:ss string into minutes since midnight.
 */
export function parseTimeToMinutes(timeStr: string): number {
  const clean = timeStr.trim().split(" ")[0]; // strip any timezone abbreviation
  const [h, m] = clean.split(":").map((v) => parseInt(v, 10));
  return h * 60 + m;
}

/**
 * Converts a 24-hour time string (HH:mm or HH:mm:ss) into 12-hour format with Arabic period (ص / م).
 * Example: "05:42" -> "05:42 ص", "15:55" -> "03:55 م", "12:00" -> "12:00 م", "00:30" -> "12:30 ص".
 */
export function formatTo12Hour(time24: string): string {
  const clean = time24.trim().split(" ")[0];
  const [hStr, mStr] = clean.split(":");
  let hour = parseInt(hStr, 10);
  const min = (mStr || "00").substring(0, 2);
  const period = hour >= 12 ? "م" : "ص";
  hour = hour % 12;
  if (hour === 0) hour = 12;
  return `${String(hour).padStart(2, "0")}:${min} ${period}`;
}

/**
 * Formats the exact 2-line Arabic WhatsApp notification text with 12-hour formatted time.
 */
export function formatPrayerMessage(prayer: string, scheduledTime: string, isTest = false): string {
  const prayerAr = PRAYER_NAMES_AR[prayer as PrayerName] || prayer;
  const prefix = isTest ? "[TEST] " : "";
  const time12h = formatTo12Hour(scheduledTime);
  return `${prefix}🕌 حان الآن موعد أذان ${prayerAr} بتوقيت الإسكندرية\n🕐 ${time12h}`;
}

export interface PrayerGroupConfig {
  id: string;
  name: string;
  sourceEnv: string;
}

/**
 * Resolves all unique configured WhatsApp groups across environment variables.
 */
export function getAllConfiguredPrayerGroups(): PrayerGroupConfig[] {
  const map = new Map<string, PrayerGroupConfig>();

  const processEnvVar = (val: string | undefined, defaultName: string, envName: string) => {
    if (!val) return;
    const parts = val.split(",").map((s) => s.trim()).filter(Boolean);
    parts.forEach((raw, idx) => {
      const cleanNum = raw.replace(/@.*$/, "").trim();
      if (!cleanNum) return;
      const fullId = `${cleanNum}@g.us`;
      if (!map.has(fullId)) {
        const name = parts.length > 1 ? `${defaultName} #${idx + 1}` : defaultName;
        map.set(fullId, { id: fullId, name, sourceEnv: envName });
      }
    });
  };

  processEnvVar(process.env.WHATSAPP_GROUP_ID, "Hospital Main Group", "WHATSAPP_GROUP_ID");
  processEnvVar(process.env.WHATSAPP_DOCTORS_TARGET_GROUP_ID, "Doctors Target Group", "WHATSAPP_DOCTORS_TARGET_GROUP_ID");
  processEnvVar(process.env.WHATSAPP_CALLS_SOURCE_GROUP_ID, "Nurse Calls Group", "WHATSAPP_CALLS_SOURCE_GROUP_ID");

  return Array.from(map.values());
}

/**
 * Resolves target WhatsApp group IDs from configured groups.
 */
export function resolvePrayerWhatsAppGroupIds(): string[] {
  return getAllConfiguredPrayerGroups().map((g) => g.id);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let isPrayerPausedMemory = false;
let selectedPrayerGroupsMemory: string[] | null = null;

/**
 * Gets the list of currently selected group IDs for prayer notifications.
 * If no custom setting is saved yet, returns null (meaning default: all groups).
 */
export async function getSelectedPrayerGroups(): Promise<string[] | null> {
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data } = await supabase
        .from("prayer_notifications")
        .select("status, group_results")
        .eq("prayer_date", "1970-01-01")
        .eq("prayer", "__SETTINGS__")
        .maybeSingle();

      if (data) {
        if (typeof data.status === "string") {
          isPrayerPausedMemory = data.status === "paused";
        }
        if (data.group_results && Array.isArray((data.group_results as any).selectedGroups)) {
          selectedPrayerGroupsMemory = (data.group_results as any).selectedGroups;
          return selectedPrayerGroupsMemory;
        }
      }
    } catch (_) {}
  }
  return selectedPrayerGroupsMemory;
}

/**
 * Resolves active groups for sending by intersecting configured groups with user selection.
 */
export async function getActivePrayerWhatsAppGroupIds(): Promise<string[]> {
  const allConfigured = getAllConfiguredPrayerGroups().map((g) => g.id);
  const selected = await getSelectedPrayerGroups();

  if (selected === null) {
    return allConfigured;
  }

  return allConfigured.filter((id) => selected.includes(id));
}

/**
 * Updates the selected WhatsApp groups in Supabase and memory.
 */
export async function updatePrayerSelectedGroups(selectedGroups: string[]): Promise<string[]> {
  selectedPrayerGroupsMemory = selectedGroups;
  const supabase = getSupabase();
  if (supabase) {
    try {
      const isPaused = await isPrayerPaused();
      await supabase.from("prayer_notifications").upsert(
        {
          prayer_date: "1970-01-01",
          prayer: "__SETTINGS__",
          status: isPaused ? "paused" : "active",
          group_results: { selectedGroups },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "prayer_date,prayer" }
      );
    } catch (err: any) {
      console.warn("[prayer] Failed to persist selected groups in Supabase:", err.message);
    }
  }
  return selectedPrayerGroupsMemory;
}

/**
 * Checks whether prayer automation (fetching & sending) is paused by admin.
 * Checks Supabase settings row with in-memory fallback.
 */
export async function isPrayerPaused(): Promise<boolean> {
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data } = await supabase
        .from("prayer_notifications")
        .select("status, group_results")
        .eq("prayer_date", "1970-01-01")
        .eq("prayer", "__SETTINGS__")
        .maybeSingle();

      if (data) {
        if (typeof data.status === "string") {
          isPrayerPausedMemory = data.status === "paused";
        }
        if (data.group_results && Array.isArray((data.group_results as any).selectedGroups)) {
          selectedPrayerGroupsMemory = (data.group_results as any).selectedGroups;
        }
      }
    } catch (_) {}
  }
  return isPrayerPausedMemory;
}

/**
 * Persists the pause/resume state in Supabase and memory while preserving selected groups.
 */
export async function setPrayerPaused(paused: boolean): Promise<boolean> {
  isPrayerPausedMemory = paused;
  const status = paused ? "paused" : "active";
  const supabase = getSupabase();
  if (supabase) {
    try {
      const currentSelected = await getSelectedPrayerGroups();
      await supabase.from("prayer_notifications").upsert(
        {
          prayer_date: "1970-01-01",
          prayer: "__SETTINGS__",
          status,
          group_results: currentSelected !== null ? { selectedGroups: currentSelected } : null,
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "prayer_date,prayer" }
      );
    } catch (err: any) {
      console.warn("[prayer] Failed to persist paused state in Supabase:", err.message);
    }
  }
  return isPrayerPausedMemory;
}

/**
 * Fetches prayer timings from Aladhan API for a specific date with retry backoff.
 */
export async function fetchAladhanTimingsForDate(
  dateYMD: string,
  options: { city?: string; country?: string; method?: string; maxRetries?: number } = {}
): Promise<Record<PrayerName, string>> {
  const city = options.city || process.env.PRAYER_CITY || "Alexandria";
  const country = options.country || process.env.PRAYER_COUNTRY || "Egypt";
  const method = options.method || process.env.PRAYER_METHOD || "5";
  const maxRetries = options.maxRetries ?? 3;

  const aladhanDate = formatToAladhanDate(dateYMD);
  const url = `https://api.aladhan.com/v1/timingsByCity/${aladhanDate}?city=${encodeURIComponent(
    city
  )}&country=${encodeURIComponent(country)}&method=${encodeURIComponent(method)}`;

  let lastError: any = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[prayer] Fetching Aladhan timings for ${dateYMD} (attempt ${attempt}/${maxRetries})...`);
      const res = await fetch(url, { redirect: "follow" });
      if (!res.ok) {
        throw new Error(`Aladhan API responded with status ${res.status}`);
      }
      const json: any = await res.json();
      if (!json || json.code !== 200 || !json.data?.timings) {
        throw new Error(`Invalid Aladhan response structure: ${JSON.stringify(json)}`);
      }

      const timings = json.data.timings;
      const result: Record<string, string> = {};

      for (const p of PRAYER_NAMES) {
        const rawTime = timings[p];
        if (!rawTime) {
          throw new Error(`Missing prayer time for ${p} in Aladhan response`);
        }
        // Clean off any suffix (e.g. "05:43 (EEST)" -> "05:43")
        const cleanTime = String(rawTime).split(" ")[0].trim();
        result[p] = cleanTime;
      }

      return result as Record<PrayerName, string>;
    } catch (err: any) {
      lastError = err;
      console.warn(`[prayer] Aladhan fetch failed for ${dateYMD} (attempt ${attempt}): ${err.message}`);
      if (attempt < maxRetries) {
        const backoffMs = attempt === 1 ? 500 : attempt === 2 ? 1000 : 2000;
        await sleep(backoffMs);
      }
    }
  }

  throw new Error(`Failed to fetch Aladhan prayer timings for ${dateYMD} after ${maxRetries} attempts: ${lastError?.message}`);
}

/**
 * Weekly fetch routine for Alexandria, Egypt.
 * Runs each Friday at 06:00 AM Africa/Cairo and pre-fetches 8 days in advance
 * (covers Friday through next Friday inclusive, preventing gaps for early morning Fajr).
 */
export async function executePrayerFetch(options: { force?: boolean; daysCount?: number } = {}): Promise<{
  success: boolean;
  skipped?: boolean;
  due?: boolean;
  reason?: string;
  isPaused?: boolean;
  data?: any;
}> {
  const isEnabled = process.env.PRAYER_NOTIFICATIONS_ENABLED === "true";
  if (!isEnabled) {
    return { skipped: true, success: true, reason: "PRAYER_NOTIFICATIONS_ENABLED is false" };
  }

  // Guard: Pause check
  if (await isPrayerPaused()) {
    return { skipped: true, success: true, due: false, reason: "Prayer automation is paused by admin", isPaused: true };
  }

  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("[prayer] Supabase client is not configured.");
  }

  const cairoParts = getCairoParts();
  const daysCount = options.daysCount ?? 8;
  const datesToFetch = getCairoDatesRange(new Date(), daysCount);
  const startDate = datesToFetch[0];
  const endDate = datesToFetch[datesToFetch.length - 1];

  // Guard: unless force=true, only proceed if today is Friday AND Cairo hour is 06 (06:00 - 06:59 AM)
  if (!options.force) {
    const isFriday = cairoParts.weekday.toLowerCase() === "friday";
    if (!isFriday || cairoParts.hour !== 6) {
      return {
        skipped: true,
        success: true,
        reason: `Weekly fetch is scheduled for Friday at 06:00 AM Cairo time (current: ${cairoParts.weekday} ${String(
          cairoParts.hour
        ).padStart(2, "0")}:${String(cairoParts.minute).padStart(2, "0")})`,
      };
    }

    // Check if the starting date already has 5 prayers stored
    const { data: existingRows } = await supabase
      .from("prayer_times")
      .select("prayer")
      .eq("prayer_date", startDate);

    if (existingRows && existingRows.length >= 5) {
      return {
        skipped: true,
        success: true,
        reason: `Prayer times for the week starting ${startDate} have already been fetched`,
      };
    }
  }

  console.log(
    `[prayer] Executing weekly prayer fetch for ${datesToFetch.length} days (${startDate} to ${endDate})...`
  );

  // Fetch all days in advance
  const resultsByDate: Record<string, Record<PrayerName, string>> = {};
  for (const dateYMD of datesToFetch) {
    resultsByDate[dateYMD] = await fetchAladhanTimingsForDate(dateYMD);
  }

  const rowsToUpsert: { prayer_date: string; prayer: string; prayer_time: string; fetched_at: string }[] = [];
  const notificationsToInit: { prayer_date: string; prayer: string; status: string }[] = [];
  const nowUtc = new Date().toISOString();

  for (const [dateYMD, timings] of Object.entries(resultsByDate)) {
    for (const [prayer, time] of Object.entries(timings)) {
      rowsToUpsert.push({ prayer_date: dateYMD, prayer, prayer_time: time, fetched_at: nowUtc });
      notificationsToInit.push({ prayer_date: dateYMD, prayer, status: "pending" });
    }
  }

  // Idempotent upsert into prayer_times
  const { error: upsertErr } = await supabase
    .from("prayer_times")
    .upsert(rowsToUpsert, { onConflict: "prayer_date,prayer" });

  if (upsertErr) {
    throw new Error(`[prayer] Failed to upsert prayer_times: ${upsertErr.message}`);
  }

  // Idempotently create pending notification rows (ignore existing)
  const { error: notifErr } = await supabase
    .from("prayer_notifications")
    .upsert(notificationsToInit, { onConflict: "prayer_date,prayer", ignoreDuplicates: true });

  if (notifErr) {
    console.warn(`[prayer] Non-fatal: failed to init pending rows in prayer_notifications: ${notifErr.message}`);
  }

  console.log(`[prayer] Successfully stored weekly prayer times from ${startDate} to ${endDate} (${rowsToUpsert.length} records).`);

  return {
    success: true,
    data: {
      startDate,
      endDate,
      daysCount: datesToFetch.length,
      timingsByDate: resultsByDate,
    },
  };
}

/**
 * Dispatcher executed every minute by external scheduler.
 * Checks if any prayer is due (tolerance 0 to +2 minutes late).
 * Uses atomic CAS claim to ensure exactly-once delivery.
 */
export async function executePrayerDispatch(): Promise<{
  success: boolean;
  skipped?: boolean;
  due?: boolean;
  prayer?: string;
  results?: any;
  reason?: string;
  isPaused?: boolean;
}> {
  const isEnabled = process.env.PRAYER_NOTIFICATIONS_ENABLED === "true";
  if (!isEnabled) {
    return { skipped: true, success: true, reason: "PRAYER_NOTIFICATIONS_ENABLED is false" };
  }

  // Guard: Pause check
  if (await isPrayerPaused()) {
    return { skipped: true, success: true, due: false, reason: "Prayer automation is paused by admin", isPaused: true };
  }

  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("[prayer] Supabase client is not configured.");
  }

  const cairoParts = getCairoParts();
  const today = getCairoDateString();
  const currentCairoMinutes = cairoParts.hour * 60 + cairoParts.minute;
  const currentCairoTime = `${String(cairoParts.hour).padStart(2, "0")}:${String(cairoParts.minute).padStart(2, "0")}`;

  // 1. Check self-healing: ensure today is present in prayer_times
  const { data: storedRows, error: fetchErr } = await supabase
    .from("prayer_times")
    .select("prayer_date, prayer, prayer_time")
    .eq("prayer_date", today);

  if (fetchErr) {
    throw new Error(`[prayer] Error querying prayer_times: ${fetchErr.message}`);
  }

  let activeTodayRows = storedRows || [];

  if (activeTodayRows.length < 5) {
    console.log(`[prayer] Missing cached timings for today (${today}). Triggering self-healing fetch for the upcoming week...`);
    try {
      await executePrayerFetch({ force: true });
      const { data: freshToday } = await supabase
        .from("prayer_times")
        .select("prayer_date, prayer, prayer_time")
        .eq("prayer_date", today);
      activeTodayRows = freshToday || [];
    } catch (err: any) {
      console.error(`[prayer] Self-healing fetch failed: ${err.message}`);
    }
  }

  // 2. Identify if any prayer is due right now
  let duePrayerRow: { prayer_date: string; prayer: string; prayer_time: string } | null = null;
  let dueDiffMinutes = 0;

  for (const row of activeTodayRows) {
    const schedMinutes = parseTimeToMinutes(row.prayer_time);
    const diff = currentCairoMinutes - schedMinutes;

    // Tolerance window: 0 to +2 minutes late
    if (diff >= 0 && diff <= 2) {
      duePrayerRow = row;
      dueDiffMinutes = diff;
      break;
    }
  }

  if (!duePrayerRow) {
    return {
      success: true,
      due: false,
      reason: `No prayer due at Cairo time ${currentCairoTime} (today: ${today})`,
    };
  }

  const prayerName = duePrayerRow.prayer as PrayerName;
  const scheduledTime = duePrayerRow.prayer_time.substring(0, 5);

  console.log(
    `[prayer] Prayer "${prayerName}" is due (scheduled: ${scheduledTime}, Cairo now: ${currentCairoTime}, diff: +${dueDiffMinutes}m). Attempting atomic claim...`
  );

  // 3. Exactly-once atomic claim using Conditional Compare-And-Swap (CAS)
  // Ensure a pending record exists first (idempotent)
  await supabase.from("prayer_notifications").upsert(
    { prayer_date: today, prayer: prayerName, status: "pending" },
    { onConflict: "prayer_date,prayer", ignoreDuplicates: true }
  );

  // Atomically claim by transitioning status from 'pending' to 'sending'
  const { data: claimedRows, error: claimErr } = await supabase
    .from("prayer_notifications")
    .update({ status: "sending" })
    .eq("prayer_date", today)
    .eq("prayer", prayerName)
    .eq("status", "pending")
    .select();

  if (claimErr) {
    throw new Error(`[prayer] Failed to execute atomic claim update: ${claimErr.message}`);
  }

  if (!claimedRows || claimedRows.length === 0) {
    console.log(
      `[prayer] Atomic claim skipped for "${prayerName}" on ${today} (already claimed or sent by concurrent execution).`
    );
    return {
      success: true,
      due: true,
      prayer: prayerName,
      skipped: true,
      reason: "Already claimed or sent by another worker",
    };
  }

  console.log(`[prayer] Successfully claimed "${prayerName}" on ${today}. Beginning WhatsApp dispatch...`);

  // 4. Resolve destination WhatsApp groups from active admin selection
  const targetGroupIds = await getActivePrayerWhatsAppGroupIds();
  if (targetGroupIds.length === 0) {
    const msg = "All WhatsApp groups are currently unmarked/excluded in prayer settings. Dispatch skipped.";
    console.log(`[prayer] ${msg}`);
    await supabase
      .from("prayer_notifications")
      .update({
        status: "skipped",
        sent_at: new Date().toISOString(),
        error: msg,
      })
      .eq("prayer_date", today)
      .eq("prayer", prayerName);
    return { success: true, skipped: true, prayer: prayerName, reason: msg };
  }

  // 5. Construct message
  const messageText = formatPrayerMessage(prayerName, scheduledTime, false);
  const groupResults: { targetChatId: string; success: boolean; idMessage?: string; error?: string }[] = [];

  // 6. Sequential send with ~1s delay between groups and 1 retry on failure
  for (let i = 0; i < targetGroupIds.length; i++) {
    const targetChatId = targetGroupIds[i];
    if (i > 0) {
      await sleep(1000); // ~1s delay between groups
    }

    let result = await sendGreenApiTextMessage({ chatId: targetChatId, message: messageText });
    if (!result.success) {
      console.warn(`[prayer] Group ${targetChatId} send failed, retrying once in 500ms...`);
      await sleep(500);
      result = await sendGreenApiTextMessage({ chatId: targetChatId, message: messageText });
    }

    groupResults.push({
      targetChatId,
      success: result.success,
      idMessage: result.idMessage,
      error: result.error,
    });
    console.log(`[prayer] Group ${targetChatId} dispatch result: ${result.success ? "success" : "failed"}`);
  }

  const anySuccess = groupResults.some((r) => r.success);
  const finalStatus = anySuccess ? "sent" : "failed";
  const errorSummary = anySuccess
    ? null
    : groupResults.map((r) => `${r.targetChatId}: ${r.error}`).join("; ");

  // 7. Update prayer_notifications record
  await supabase
    .from("prayer_notifications")
    .update({
      status: finalStatus,
      sent_at: new Date().toISOString(),
      group_results: groupResults,
      error: errorSummary,
    })
    .eq("prayer_date", today)
    .eq("prayer", prayerName);

  return {
    success: anySuccess,
    due: true,
    prayer: prayerName,
    results: groupResults,
  };
}

/**
 * Returns read-only status for today and upcoming stored prayer times along with group selection.
 */
export async function getPrayerStatus(): Promise<{
  enabled: boolean;
  isPaused: boolean;
  cairo_now: string;
  cairo_time: string;
  configured_groups_count: number;
  available_groups: PrayerGroupConfig[];
  selected_groups: string[];
  today: { date: string; times: any[]; notifications: any[] };
  upcoming_days_cached: number;
  upcoming_dates: string[];
}> {
  const isEnabled = process.env.PRAYER_NOTIFICATIONS_ENABLED === "true";
  const isPaused = await isPrayerPaused();
  const cairoParts = getCairoParts();
  const today = getCairoDateString();
  const cairoTime = `${String(cairoParts.hour).padStart(2, "0")}:${String(cairoParts.minute).padStart(2, "0")}:${String(
    cairoParts.second
  ).padStart(2, "0")}`;

  const availableGroups = getAllConfiguredPrayerGroups();
  const activeSelected = await getActivePrayerWhatsAppGroupIds();
  const supabase = getSupabase();

  if (!supabase) {
    return {
      enabled: isEnabled,
      isPaused,
      cairo_now: `${today} ${cairoTime}`,
      cairo_time: cairoTime,
      configured_groups_count: availableGroups.length,
      available_groups: availableGroups,
      selected_groups: activeSelected,
      today: { date: today, times: [], notifications: [] },
      upcoming_days_cached: 0,
      upcoming_dates: [],
    };
  }

  const [timesRes, notifsRes] = await Promise.all([
    supabase.from("prayer_times").select("*").gte("prayer_date", today).order("prayer_date", { ascending: true }),
    supabase.from("prayer_notifications").select("*").eq("prayer_date", today),
  ]);

  const allUpcomingTimes = timesRes.data || [];
  const todayNotifs = notifsRes.data || [];

  const uniqueDates = Array.from(new Set(allUpcomingTimes.map((t) => t.prayer_date))).sort();

  return {
    enabled: isEnabled,
    isPaused,
    cairo_now: `${today} ${cairoTime}`,
    cairo_time: cairoTime,
    configured_groups_count: availableGroups.length,
    available_groups: availableGroups,
    selected_groups: activeSelected,
    today: {
      date: today,
      times: allUpcomingTimes.filter((t) => t.prayer_date === today),
      notifications: todayNotifs,
    },
    upcoming_days_cached: uniqueDates.length,
    upcoming_dates: uniqueDates,
  };
}

/**
 * Sends a single test prayer notification to a single WhatsApp group.
 */
export async function sendTestPrayerMessage(options: {
  chatId?: string;
  prayer?: string;
  time?: string;
} = {}): Promise<{
  success: boolean;
  chatId: string;
  message: string;
  result: any;
}> {
  const isEnabled = process.env.PRAYER_NOTIFICATIONS_ENABLED === "true";
  if (!isEnabled) {
    return {
      success: true,
      chatId: "",
      message: "",
      result: { skipped: true, reason: "PRAYER_NOTIFICATIONS_ENABLED is false" },
    };
  }

  const availableGroups = getAllConfiguredPrayerGroups();
  const activeSelected = await getActivePrayerWhatsAppGroupIds();
  const targetChatId = (options.chatId || activeSelected[0] || availableGroups[0]?.id || "").trim();

  if (!targetChatId) {
    throw new Error("No target WhatsApp group available to send test message.");
  }

  const prayerName = options.prayer || "Dhuhr";
  const cairoTime = options.time || getCairoTimeString();
  const message = formatPrayerMessage(prayerName, cairoTime, true);

  console.log(`[prayer] Sending explicit [TEST] message to single group: ${targetChatId}`);
  const result = await sendGreenApiTextMessage({ chatId: targetChatId, message });

  return {
    success: result.success,
    chatId: targetChatId,
    message,
    result,
  };
}
