/**
 * DOCTOR CALL DISPATCHER SERVICE
 * Elite Hospital Physician Check-in System
 * 
 * Handles incoming WhatsApp Doctor Calls via Green-API webhook:
 * 1. Parses DoctorCall metadata (category, room, department, patient, etc.)
 * 2. Resolves active shift according to Africa/Cairo time
 * 3. Matches attending doctors from today's check-ins
 * 4. Normalizes Egyptian phone numbers and dispatches WhatsApp alert with @mentions
 * 5. Persists call records to Supabase & local JSON fallback
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { normalizeSpecialty } from "../data/specialties.js";
import { getSupabase } from "../db/supabase.js";

const DATA_DIR = path.join(process.cwd(), "data");
const DOCTOR_CALLS_FILE = path.join(DATA_DIR, "doctor_calls.json");

export interface ParsedDoctorCall {
  category: string;
  departmentRaw: string;
  canonicalDepartment: string;
  room: string;
  location?: string;
  callerName?: string;
  callDate?: string;
  patientBarcode?: string;
  patientName?: string;
  admittingPhysician?: string;
  bed?: string;
  notes?: string;
  rawMessage: string;
}

export interface DispatchedDoctorInfo {
  id: string;
  name: string;
  arabicName?: string;
  phone: string;
  waPhone: string;
  shifts: string[];
}

export interface DoctorCallRecord {
  id: string;
  callDate: string; // YYYY-MM-DD in Cairo
  createdAt: string; // ISO string
  room: string;
  department: string;
  rawDepartment: string;
  patientName: string;
  patientBarcode: string;
  admittingPhysician: string;
  callerName: string;
  dispatchedDoctors: DispatchedDoctorInfo[];
  status: "dispatched" | "no_doctor_present" | "failed" | "paused";
  notes?: string;
  rawMessage: string;
}

// In-memory deduplication cache (15-min TTL)
const processedMessageIds = new Map<string, number>();
const DEDUPLICATION_TTL_MS = 15 * 60 * 1000;

export function isDuplicateMessage(messageId: string): boolean {
  if (!messageId) return false;
  const now = Date.now();
  // Clean up expired items
  for (const [id, timestamp] of processedMessageIds.entries()) {
    if (now - timestamp > DEDUPLICATION_TTL_MS) {
      processedMessageIds.delete(id);
    }
  }

  if (processedMessageIds.has(messageId)) {
    return true;
  }
  processedMessageIds.set(messageId, now);
  return false;
}

// =========================================================================
// REAL-TIME AUDIT LOGGING FOR INCOMING WEBHOOKS & POLLS
// =========================================================================

export interface WebhookAuditLog {
  id: string;
  timestamp: string; // ISO string
  displayTime: string; // Cairo time
  source: "webhook" | "poll" | "simulation";
  senderChatId: string;
  senderName?: string;
  typeWebhook: string;
  textSnippet: string;
  handled: boolean;
  status?: string;
  reason?: string;
  matchedDoctors?: string[];
}

const RECENT_WEBHOOK_LOGS: WebhookAuditLog[] = [];
const MAX_AUDIT_LOGS = 25;

export function recordWebhookAuditLog(log: Omit<WebhookAuditLog, "id" | "timestamp" | "displayTime">) {
  const now = new Date();
  const cairoTime = now.toLocaleTimeString("en-US", { timeZone: "Africa/Cairo" });
  const entry: WebhookAuditLog = {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: now.toISOString(),
    displayTime: cairoTime,
    ...log
  };
  RECENT_WEBHOOK_LOGS.unshift(entry);
  if (RECENT_WEBHOOK_LOGS.length > MAX_AUDIT_LOGS) {
    RECENT_WEBHOOK_LOGS.pop();
  }
}

export function getRecentWebhookAuditLogs(): WebhookAuditLog[] {
  return [...RECENT_WEBHOOK_LOGS];
}

/**
 * Clean invisible unicode formatting characters common in WhatsApp and Arabic text,
 * as well as WhatsApp markdown formatting characters (*, ~, `, _)
 */
export function cleanWhatsAppText(text: string): string {
  if (!text || typeof text !== "string") return "";
  return text
    // Strip invisible zero-width chars and bidirectional marks with EMPTY STRING
    .replace(/[\u200B-\u200F\u061C\uFEFF\u202A-\u202E]/g, "")
    // Normalize line endings
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    // Strip WhatsApp markdown formatting delimiters (*bold*, ~strike~, `code`)
    .replace(/[*~`]/g, "")
    // Strip markdown formatting underscores around words (_italic_)
    .replace(/(^|[\s:：\-])_+([^_]+)_+($|[\s:：\-])/g, "$1$2$3");
}

/**
 * Parses multiline WhatsApp text matching DoctorCall format
 */
export function parseDoctorCallMessage(rawMessageText: string): ParsedDoctorCall | null {
  if (!rawMessageText || typeof rawMessageText !== "string") return null;

  const messageText = cleanWhatsAppText(rawMessageText);

  // Flexible triggers:
  // 1. Explicit doctor call keywords (English & Arabic)
  const hasDoctorCallKeyword =
    /doctor[\s_-]*call/i.test(messageText) ||
    /(?:category|الفئة)\s*[:：-]?\s*doctor/i.test(messageText) ||
    /(?:طلب\s*)?استدعاء(?:\s*(?:طبيب|دكتور|أخصائي|اخصائي|استشاري))?/i.test(messageText) ||
    /مرور\s*على\s*الحالة/i.test(messageText) ||
    /(?:طلب\s*)?مرور(?:\s*(?:طبيب|دكتور))?/i.test(messageText) ||
    /(?:طلب\s*)?مناظرة(?:\s*(?:حالة|مريض))?/i.test(messageText) ||
    /كول\s*(?:طبيب|دكتور)/i.test(messageText) ||
    /طلب\s*استشارة/i.test(messageText);

  // 2. Structured hospital nurse request: "Type: Request" + department/group header + location/patient
  const isStructuredNurseRequest =
    /(?:type|نوع)\s*[:：-]?\s*(?:request|طلب)/i.test(messageText) &&
    /(?:group|specialty|speciality|department|dept|القسم|قسم|التخصص|تخصص|المجموعة)\s*[:：-]/i.test(messageText) &&
    /(?:room|bed|sub\.?\s*location|location|patient|غرفة|سرير|مريض|المريض|الدور)\s*[:：-]/i.test(messageText);

  if (!hasDoctorCallKeyword && !isStructuredNurseRequest) return null;

  const getField = (regex: RegExp): string => {
    const m = messageText.match(regex);
    return m ? m[1].trim() : "";
  };

  const category = getField(/(?:category|الفئة)\s*[:：-]\s*([^\r\n]+)/i) || "DoctorCall";
  let departmentRaw =
    getField(/(?:group|specialty|speciality|department|dept|service|القسم|قسم|التخصص|تخصص|المجموعة)\s*[:：-]\s*([^\r\n]+)/i);

  // Fallback: If department header was not explicitly labelled, search text against known specialties
  if (!departmentRaw) {
    for (const opt of SPECIALTY_OPTIONS) {
      if (opt.labelAr && messageText.includes(opt.labelAr)) {
        departmentRaw = opt.labelAr;
        break;
      }
      if (opt.labelEn && new RegExp(`\\b${opt.labelEn}\\b`, "i").test(messageText)) {
        departmentRaw = opt.labelEn;
        break;
      }
    }
  }

  const callerName =
    getField(/(?:by|caller|from|بواسطة|التمريض|ممرض|ممرضة)\s*[:：-]\s*([^\r\n]+)/i);
  const callDate =
    getField(/(?:date|التاريخ|وقت)\s*[:：-]\s*([^\r\n]+)/i);
  const location =
    getField(/(?:location|المكان|الدور)\s*[:：-]\s*([^\r\n]+)/i);

  // Extract room from Sub.Location or Bed or Room
  let room = getField(/(?:sub\.?\s*location|الغرفة|غرفة)\s*[:：-]\s*(?:room\s*)?([^\r\n]+)/i);
  if (!room) {
    room = getField(/(?:room|غرفة)\s*[:：-]\s*([^\r\n]+)/i);
  }
  if (!room) {
    room = getField(/(?:bed|سرير)\s*[:：-]\s*(?:bed\s*)?([^\r\n]+)/i);
  }
  if (!room) {
    const freeRoomMatch = messageText.match(/(?:غرفة|room|سرير|bed)\s*([A-Za-z0-9\-]+)/i);
    if (freeRoomMatch) {
      room = freeRoomMatch[1].trim();
    }
  }
  if (room) {
    room = room.replace(/^(?:room|غرفة|bed|سرير)\s*/i, "").trim();
  } else {
    room = "N/A";
  }

  const patientBarcode =
    getField(/(?:patient\s*barcode|barcode|باركود)\s*[:：-]\s*([^\r\n]+)/i);
  const patientName =
    getField(/(?:patient\s*name|patient|المريض|اسم\s*المريض)\s*[:：-]\s*([^\r\n]+)/i);
  const admittingPhysician =
    getField(/(?:admitting\s*phys(?:ician)?|physician|طبيب\s*الدخول)\s*[:：-]\s*([^\r\n]+)/i);
  const bed = getField(/(?:bed|سرير)\s*[:：-]\s*([^\r\n]+)/i);

  // Extract trailing notes / clinical request reason (e.g. "المرور على الحالة")
  let notes = "";
  const bedMatch = messageText.match(/(?:bed|سرير)\s*[:：-]\s*[^\r\n]+/i);
  if (bedMatch && bedMatch.index !== undefined) {
    const afterBed = messageText.slice(bedMatch.index + bedMatch[0].length).trim();
    if (afterBed) {
      notes = afterBed;
    }
  } else if (/مرور\s*على\s*الحالة/i.test(messageText)) {
    notes = "المرور على الحالة";
  }

  // Normalize Department to canonical hospital specialty
  const { department: canonicalDepartment } = normalizeSpecialty(departmentRaw);

  return {
    category,
    departmentRaw,
    canonicalDepartment,
    room,
    location,
    callerName,
    callDate,
    patientBarcode,
    patientName,
    admittingPhysician,
    bed,
    notes,
    rawMessage: rawMessageText
  };
}

/**
 * Parses diverse date formats found in DoctorCall messages into ISO YYYY-MM-DD
 * Handles:
 * - Egyptian/Arabic date strings: "14‏/10‏/2026 9:23:12 م" -> "2026-10-14"
 * - US formatted date strings: "10/14/2026, 7:16:39 PM" -> "2026-10-14"
 * - ISO date strings: "2026-10-14" -> "2026-10-14"
 * - Normalizes Arabic numerals (٠-٩) and Unicode RTL/LTR markers
 */
export function parseDoctorCallDate(dateStr?: string): string | null {
  if (!dateStr || typeof dateStr !== "string") return null;

  // Convert Arabic numerals to ASCII
  const asciiStr = dateStr.replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  // Strip RTL/LTR marks, zero-width characters, and BOM (replace with EMPTY STRING, NOT SPACE)
  const cleaned = asciiStr.replace(/[\u200B-\u200F\u061C\uFEFF\u202A-\u202E]/g, "").trim();

  // 1. Check for standard ISO format: YYYY-MM-DD
  const isoMatch = cleaned.match(/(\d{4})\s*[-\/\.]\s*(\d{1,2})\s*[-\/\.]\s*(\d{1,2})/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = isoMatch[2].padStart(2, "0");
    const d = isoMatch[3].padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // 2. Check for DD/MM/YYYY or MM/DD/YYYY
  const partsMatch = cleaned.match(/(\d{1,2})\s*[-\/\.]\s*(\d{1,2})\s*[-\/\.]\s*(\d{4})/);
  if (partsMatch) {
    const first = parseInt(partsMatch[1], 10);
    const second = parseInt(partsMatch[2], 10);
    const year = partsMatch[3];

    // If first part > 12, it must be the day: DD/MM/YYYY
    if (first > 12 && second <= 12) {
      return `${year}-${String(second).padStart(2, "0")}-${String(first).padStart(2, "0")}`;
    }
    // If second part > 12, it must be the day: MM/DD/YYYY
    if (second > 12 && first <= 12) {
      return `${year}-${String(first).padStart(2, "0")}-${String(second).padStart(2, "0")}`;
    }
    // In Egypt hospital context, day/month/year (DD/MM/YYYY) is standard
    return `${year}-${String(second).padStart(2, "0")}-${String(first).padStart(2, "0")}`;
  }

  return null;
}

/**
 * Returns hospital operational duty date in Africa/Cairo (YYYY-MM-DD).
 * Hospital shift boundary rule:
 * A hospital day's shifts (including Night and 24-hr shifts) conclude at 08:00 AM the following morning.
 * Therefore, any time between 00:00:00 and 07:59:59 Egypt time belongs to the PREVIOUS day's duty roster.
 * From 08:00:00 onward belongs to CURRENT day's duty roster.
 */
export function getHospitalDutyDate(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    hourCycle: "h23"
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find(p => p.type === "year")?.value || "";
  const month = parts.find(p => p.type === "month")?.value || "";
  const day = parts.find(p => p.type === "day")?.value || "";
  const hour = parseInt(parts.find(p => p.type === "hour")?.value || "0", 10);

  const d = new Date(`${year}-${month}-${day}T12:00:00Z`);
  if (hour < 8) {
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return d.toISOString().split("T")[0];
}

/**
 * Resolves the operational hospital roster date from a call message.
 * Extracts the calendar date and the time from the message string.
 * If the time is before 08:00 AM Egypt time (or if no time is in the message and referenceTime is before 08:00 AM),
 * the duty date is resolved to the PREVIOUS day (calendar date minus 1 day).
 * This ensures night shifts and early morning calls (00:00 - 08:00 AM) match the active on-duty doctors.
 */
export function resolveHospitalDutyDate(callDateStr?: string, referenceTime: Date = new Date()): string {
  if (!callDateStr || typeof callDateStr !== "string") {
    return getHospitalDutyDate(referenceTime);
  }

  const asciiStr = callDateStr.replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  const cleaned = asciiStr.replace(/[\u200B-\u200F\u061C\uFEFF\u202A-\u202E]/g, "").trim();

  let year = "";
  let month = "";
  let day = "";

  const isoMatch = cleaned.match(/(\d{4})\s*[-\/\.]\s*(\d{1,2})\s*[-\/\.]\s*(\d{1,2})/);
  if (isoMatch) {
    year = isoMatch[1];
    month = isoMatch[2].padStart(2, "0");
    day = isoMatch[3].padStart(2, "0");
  } else {
    const partsMatch = cleaned.match(/(\d{1,2})\s*[-\/\.]\s*(\d{1,2})\s*[-\/\.]\s*(\d{4})/);
    if (partsMatch) {
      const first = parseInt(partsMatch[1], 10);
      const second = parseInt(partsMatch[2], 10);
      year = partsMatch[3];
      if (first > 12 && second <= 12) {
        day = String(first).padStart(2, "0");
        month = String(second).padStart(2, "0");
      } else if (second > 12 && first <= 12) {
        month = String(first).padStart(2, "0");
        day = String(second).padStart(2, "0");
      } else {
        day = String(first).padStart(2, "0");
        month = String(second).padStart(2, "0");
      }
    }
  }

  if (!year || !month || !day) {
    return getHospitalDutyDate(referenceTime);
  }

  // Extract time from the string if present (e.g. "9:23:12 م", "02:15:00 ص", "7:16:39 PM", "14:30")
  let callHour: number | null = null;
  const timeMatch = cleaned.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*([^\d\s\r\n]+)?/);
  if (timeMatch) {
    let h = parseInt(timeMatch[1], 10);
    const meridian = (timeMatch[3] || "").trim().toLowerCase();
    const isPM = meridian === "م" || meridian === "pm" || meridian === "مساء" || meridian.startsWith("p");
    const isAM = meridian === "ص" || meridian === "am" || meridian === "صباح" || meridian.startsWith("a");

    if (isPM && h < 12) h += 12;
    if (isAM && h === 12) h = 0;
    callHour = h;
  }

  // If time was not specified in the date string, assume noon (12:00) so the explicit date is preserved as-is
  if (callHour === null) {
    callHour = 12;
  }

  const d = new Date(`${year}-${month}-${day}T12:00:00Z`);
  // If before 08:00 AM, operational duty date belongs to the PREVIOUS day
  if (callHour < 8) {
    d.setUTCDate(d.getUTCDate() - 1);
  }

  return d.toISOString().split("T")[0];
}

/**
 * Calculates current active shift(s) according to Africa/Cairo local time
 * Hospital shifts defined in Elite Hospital:
 * - Morning shift: 08:00 AM - 04:00 PM (480 - 960 min)
 * - Long shift:    08:00 AM - 09:00 PM (480 - 1260 min)
 * - Evening shift: 03:00 PM - 12:00 AM (midnight) (900 - 1440 min)
 * - Night shift:   11:00 PM - 09:00 AM (1380 - 540 min next day)
 * - 24 shift:      Covers all 24 hours
 */
export function getCairoActiveShifts(date: Date = new Date()): string[] {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Cairo",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23"
  });
  const parts = formatter.formatToParts(date);
  const hour = parseInt(parts.find(p => p.type === "hour")?.value || "0", 10);
  const minute = parseInt(parts.find(p => p.type === "minute")?.value || "0", 10);
  const timeInMinutes = hour * 60 + minute;

  const activeShifts: string[] = [];

  // Morning shift: 8:00 AM (480 min) - 4:00 PM (960 min)
  if (timeInMinutes >= 8 * 60 && timeInMinutes < 16 * 60) {
    activeShifts.push("Morning shift");
  }

  // Long shift: 8:00 AM (480 min) - 9:00 PM (1260 min)
  if (timeInMinutes >= 8 * 60 && timeInMinutes < 21 * 60) {
    activeShifts.push("Long shift");
  }

  // Evening shift: 3:00 PM (900 min) - 12:00 AM (midnight / 1440 min)
  if (timeInMinutes >= 15 * 60 && timeInMinutes <= 24 * 60) {
    activeShifts.push("Evening shift");
  }

  // Night shift: 11:00 PM (1380 min) - 9:00 AM (540 min)
  if (timeInMinutes >= 23 * 60 || timeInMinutes < 9 * 60) {
    activeShifts.push("Night shift");
  }

  // 24 shift covers all hours
  activeShifts.push("24 shift");

  return activeShifts;
}

/**
 * Determines whether a doctor's registered shifts match current active shift(s)
 */
export function matchesActiveShift(doctorShifts: string[], activeShifts: string[]): boolean {
  if (!doctorShifts || !Array.isArray(doctorShifts) || doctorShifts.length === 0) return false;

  const docShiftsLower = doctorShifts.map(s => (s || "").toLowerCase());

  // 24-hour shift covers all hours
  if (docShiftsLower.some(s => s.includes("24") || s.includes("يوم كامل") || s.includes("full"))) return true;

  for (const active of activeShifts) {
    const activeLower = active.toLowerCase();
    if (activeLower.includes("morning")) {
      if (docShiftsLower.some(s => s.includes("morning") || s.includes("صباح") || s.includes("مورنينج"))) return true;
    }
    if (activeLower.includes("long")) {
      if (docShiftsLower.some(s => s.includes("long") || s.includes("لونج"))) return true;
    }
    if (activeLower.includes("evening")) {
      if (docShiftsLower.some(s => s.includes("evening") || s.includes("eve") || s.includes("مساء") || s.includes("ايڤينينج"))) return true;
    }
    if (activeLower.includes("night")) {
      if (docShiftsLower.some(s => s.includes("night") || s.includes("ليل") || s.includes("نايت"))) return true;
    }
  }

  return false;
}

/**
 * Normalizes Egyptian local phone number into WhatsApp international format
 * Example: "01001234567" -> "201001234567"
 */
export function toWhatsAppPhone(phone?: string): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("0")) {
    return "20" + digits.slice(1);
  }
  if (digits.startsWith("20")) {
    return digits;
  }
  if (digits.length === 10 && digits.startsWith("1")) {
    return "20" + digits;
  }
  return digits;
}

/**
 * Formats the alert message strictly matching user requirements
 */
export function formatDoctorCallAlert(params: {
  doctors: DispatchedDoctorInfo[];
  specialty: string;
  room: string;
  notes?: string;
  isOffShiftCoverage?: boolean;
}): string {
  const { doctors, specialty, room, notes, isOffShiftCoverage } = params;
  const coverageNote = isOffShiftCoverage ? ` _(On-duty coverage)_` : "";
  const notesLine = notes ? `📝 *Notes:* ${notes}\n` : "";

  if (doctors.length === 1) {
    const doc = doctors[0];
    const mentionTag = doc.waPhone ? `@${doc.waPhone}` : "";
    const phoneDisplay = doc.phone || "N/A";

    return (
      `🚨 *INPATIENT DOCTOR CALL* 🚨\n` +
      `👨‍⚕️ Dr. ${mentionTag} *${doc.name}*${coverageNote}\n\n` +
      `📍 *Location:* Room *${room}*\n` +
      `🩺 *Specialty:* ${specialty}\n` +
      `📞 *Phone:* ${phoneDisplay}\n` +
      notesLine + `\n` +
      `⚡ _Please attend to the patient promptly._`
    );
  }

  // Multiple doctors on duty
  const mentionsLine = doctors.map(d => `Dr. ${d.waPhone ? `@${d.waPhone}` : ""} *${d.name}*`).join(" & ");
  const phonesLine = doctors.map(d => d.phone || "N/A").join(", ");

  return (
    `🚨 *INPATIENT DOCTOR CALL* 🚨\n` +
    `👨‍⚕️ ${mentionsLine}${coverageNote}\n\n` +
    `📍 *Location:* Room *${room}*\n` +
    `🩺 *Specialty:* ${specialty}\n` +
    `📞 *Phones:* ${phonesLine}\n` +
    notesLine + `\n` +
    `⚡ _Please attend to the patient promptly._`
  );
}

/**
 * Helper to get current Cairo date string (YYYY-MM-DD)
 */
export function getCairoDateString(date: Date = new Date()): string {
  return date.toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
}

// =========================================================================
// AUTOMATION PAUSE & STATE MANAGEMENT
// =========================================================================

const SETTINGS_FILE = path.join(DATA_DIR, "call_automation_settings.json");
let isPausedMemory = false;

// Initialize from disk if available
try {
  if (fs.existsSync(SETTINGS_FILE)) {
    const raw = fs.readFileSync(SETTINGS_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (typeof parsed.paused === "boolean") {
      isPausedMemory = parsed.paused;
    }
  }
} catch (_) {}

export function isAutomationPaused(): boolean {
  return isPausedMemory;
}

export function setAutomationPaused(paused: boolean): boolean {
  isPausedMemory = paused;
  try {
    ensureDataFile();
    fs.writeFileSync(
      SETTINGS_FILE,
      JSON.stringify({ paused: isPausedMemory, updatedAt: new Date().toISOString() }, null, 2),
      "utf-8"
    );
  } catch (err) {
    console.warn("[DoctorCall] Error saving automation settings to disk:", err);
  }
  return isPausedMemory;
}

// =========================================================================
// LOCAL STORAGE & PERSISTENCE
// =========================================================================

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (_) {}
  }
  if (!fs.existsSync(DOCTOR_CALLS_FILE)) {
    try { fs.writeFileSync(DOCTOR_CALLS_FILE, JSON.stringify([], null, 2), "utf-8"); } catch (_) {}
  }
}

export function readDoctorCallsLocal(): DoctorCallRecord[] {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(DOCTOR_CALLS_FILE, "utf-8");
    return JSON.parse(raw) || [];
  } catch (err) {
    console.error("[DoctorCalls] Error reading local calls file:", err);
    return [];
  }
}

export function writeDoctorCallsLocal(calls: DoctorCallRecord[]) {
  ensureDataFile();
  try {
    fs.writeFileSync(DOCTOR_CALLS_FILE, JSON.stringify(calls, null, 2), "utf-8");
  } catch (err) {
    console.error("[DoctorCalls] Error writing local calls file:", err);
  }
}

export async function saveDoctorCallRecord(record: DoctorCallRecord): Promise<void> {
  // 1. Local storage first
  const localCalls = readDoctorCallsLocal();
  const existingIdx = localCalls.findIndex(c => c.id === record.id);
  if (existingIdx >= 0) {
    localCalls[existingIdx] = record;
  } else {
    localCalls.unshift(record); // newest first
  }
  writeDoctorCallsLocal(localCalls);

  // 2. Supabase Cloud persistence
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { error } = await supabase.from("doctor_calls").upsert({
        id: record.id,
        call_date: record.callDate,
        created_at: record.createdAt,
        room: record.room,
        department: record.department,
        raw_department: record.rawDepartment,
        patient_name: record.patientName,
        patient_barcode: record.patientBarcode,
        admitting_physician: record.admittingPhysician,
        caller_name: record.callerName,
        dispatched_doctors: record.dispatchedDoctors,
        status: record.status,
        raw_message: record.rawMessage
      });
      if (error) {
        console.warn("[DoctorCalls] Supabase upsert error:", error.message);
      }
    } catch (err: any) {
      console.warn("[DoctorCalls] Supabase write failed, retained locally:", err.message);
    }
  }
}

export async function getDoctorCallRecords(filter?: {
  date?: string;
  department?: string;
  status?: string;
  search?: string;
}): Promise<DoctorCallRecord[]> {
  const supabase = getSupabase();
  let calls: DoctorCallRecord[] = [];

  if (supabase) {
    try {
      let query = supabase.from("doctor_calls").select("*").order("created_at", { ascending: false });
      if (filter?.date) {
        query = query.eq("call_date", filter.date);
      }
      if (filter?.department && filter.department !== "All") {
        query = query.eq("department", filter.department);
      }
      if (filter?.status && filter.status !== "All") {
        query = query.eq("status", filter.status);
      }
      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        calls = data.map(row => ({
          id: row.id,
          callDate: row.call_date,
          createdAt: row.created_at,
          room: row.room,
          department: row.department,
          rawDepartment: row.raw_department,
          patientName: row.patient_name,
          patientBarcode: row.patient_barcode,
          admittingPhysician: row.admitting_physician,
          callerName: row.caller_name,
          dispatchedDoctors: row.dispatched_doctors || [],
          status: row.status,
          rawMessage: row.raw_message
        }));
      }
    } catch (err: any) {
      console.warn("[DoctorCalls] Supabase query failed, falling back to local:", err.message);
    }
  }

  // Fallback to local if empty or Supabase not reachable
  if (calls.length === 0) {
    calls = readDoctorCallsLocal();
    if (filter?.date) {
      calls = calls.filter(c => c.callDate === filter.date);
    }
    if (filter?.department && filter.department !== "All") {
      calls = calls.filter(c => c.department.toLowerCase() === filter.department!.toLowerCase());
    }
    if (filter?.status && filter.status !== "All") {
      calls = calls.filter(c => c.status === filter.status);
    }
  }

  if (filter?.search) {
    const s = filter.search.toLowerCase().trim();
    calls = calls.filter(c =>
      c.room.toLowerCase().includes(s) ||
      c.patientName.toLowerCase().includes(s) ||
      c.patientBarcode.toLowerCase().includes(s) ||
      c.admittingPhysician.toLowerCase().includes(s) ||
      c.dispatchedDoctors.some(d => d.name.toLowerCase().includes(s) || (d.phone && d.phone.includes(s)))
    );
  }

  return calls;
}

// =========================================================================
// GREEN-API REST DISPATCH & SETTINGS
// =========================================================================

export async function sendGreenApiTextMessage(params: {
  chatId: string;
  message: string;
}): Promise<{ success: boolean; idMessage?: string; error?: string }> {
  const idInstance = process.env.GREEN_API_ID_INSTANCE?.trim();
  const apiTokenInstance = process.env.GREEN_API_API_TOKEN_INSTANCE?.trim();

  if (!idInstance || !apiTokenInstance) {
    return { success: false, error: "Green-API instance credentials missing from environment variables." };
  }

  let targetChatId = (params.chatId || "").trim();
  if (targetChatId && !targetChatId.includes("@")) {
    targetChatId = `${targetChatId}@g.us`;
  }

  const url = `https://api.green-api.com/waInstance${idInstance}/sendMessage/${apiTokenInstance}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatId: targetChatId,
        message: params.message
      })
    });

    const data: any = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { success: false, error: typeof data === "object" ? JSON.stringify(data) : String(data) };
    }

    return { success: true, idMessage: data?.idMessage };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Reads instance webhook settings directly from Green-API
 */
export async function getGreenApiSettings(): Promise<{
  success: boolean;
  settings?: {
    webhookUrl?: string;
    incomingWebhook?: string;
    stateWebhook?: string;
    outgoingWebhook?: string;
  };
  error?: string;
}> {
  const idInstance = process.env.GREEN_API_ID_INSTANCE?.trim();
  const apiTokenInstance = process.env.GREEN_API_API_TOKEN_INSTANCE?.trim();

  if (!idInstance || !apiTokenInstance) {
    return { success: false, error: "Missing Green-API credentials" };
  }

  try {
    const url = `https://api.green-api.com/waInstance${idInstance}/getSettings/${apiTokenInstance}`;
    const res = await fetch(url);
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { success: false, error: data?.message || "Failed to fetch Green-API settings" };
    }
    return { success: true, settings: data };
  } catch (err: any) {
    return { success: false, error: err?.message || "Network error fetching Green-API settings" };
  }
}

/**
 * Auto-registers the Webhook URL in Green-API with incoming webhooks enabled
 */
export async function setGreenApiWebhookUrl(webhookUrl: string): Promise<{
  success: boolean;
  message: string;
}> {
  const idInstance = process.env.GREEN_API_ID_INSTANCE?.trim();
  const apiTokenInstance = process.env.GREEN_API_API_TOKEN_INSTANCE?.trim();

  if (!idInstance || !apiTokenInstance) {
    return { success: false, message: "Missing Green-API credentials in environment variables." };
  }

  const cleanUrl = webhookUrl.trim();
  if (!cleanUrl || !cleanUrl.startsWith("http")) {
    return { success: false, message: "Invalid Webhook URL. Must begin with https:// or http://" };
  }

  try {
    const url = `https://api.green-api.com/waInstance${idInstance}/setSettings/${apiTokenInstance}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        webhookUrl: cleanUrl,
        incomingWebhook: "yes",
        stateWebhook: "yes"
      })
    });

    const data: any = await res.json().catch(() => ({}));
    if (!res.ok || data?.saveSettings !== true) {
      return {
        success: false,
        message: data?.message || `Failed to update Green-API settings: ${JSON.stringify(data)}`
      };
    }

    return {
      success: true,
      message: `Webhook URL successfully set to "${cleanUrl}" in Green-API with incoming webhooks enabled!`
    };
  } catch (err: any) {
    return { success: false, message: err?.message || "Failed to set Green-API webhook" };
  }
}

/**
 * Checks Green-API connection state and configuration parameters
 */
export async function checkWhatsAppAutomationStatus(): Promise<{
  configured: boolean;
  hasInstanceId: boolean;
  hasToken: boolean;
  sourceGroup: string;
  targetGroup: string;
  stateInstance: string;
  isPaused: boolean;
  statusMessage: string;
  greenApiWebhookUrl?: string;
  incomingWebhookEnabled?: boolean;
}> {
  const idInstance = process.env.GREEN_API_ID_INSTANCE?.trim() || "";
  const apiTokenInstance = process.env.GREEN_API_API_TOKEN_INSTANCE?.trim() || "";
  const sourceGroup = process.env.WHATSAPP_CALLS_SOURCE_GROUP_ID?.trim() || "";
  const targetGroup = process.env.WHATSAPP_DOCTORS_TARGET_GROUP_ID?.trim() || process.env.WHATSAPP_GROUP_ID?.trim() || "";

  const hasInstanceId = Boolean(idInstance);
  const hasToken = Boolean(apiTokenInstance);
  const isPaused = isAutomationPaused();

  if (!hasInstanceId || !hasToken) {
    return {
      configured: false,
      hasInstanceId,
      hasToken,
      sourceGroup,
      targetGroup,
      stateInstance: "missing_credentials",
      isPaused,
      statusMessage: "Green-API instance ID or API token missing in environment variables."
    };
  }

  let stateInstance = "unknown";
  try {
    const url = `https://api.green-api.com/waInstance${idInstance}/getStateInstance/${apiTokenInstance}`;
    const res = await fetch(url);
    const data: any = await res.json().catch(() => ({}));
    stateInstance = data?.stateInstance || "unknown";
  } catch (err: any) {
    stateInstance = `error: ${err?.message || "network error"}`;
  }

  let greenApiWebhookUrl: string | undefined;
  let incomingWebhookEnabled: boolean | undefined;

  const settingsRes = await getGreenApiSettings();
  if (settingsRes.success && settingsRes.settings) {
    greenApiWebhookUrl = settingsRes.settings.webhookUrl || "";
    incomingWebhookEnabled = settingsRes.settings.incomingWebhook === "yes";
  }

  const isConnected = stateInstance === "authorized";
  const configured = isConnected && Boolean(targetGroup);

  let statusMessage = "";
  if (!isConnected) {
    statusMessage = `WhatsApp is not connected (state: ${stateInstance}). Scan QR code in Green-API console.`;
  } else if (!targetGroup) {
    statusMessage = "Target WhatsApp group ID is missing in environment variables.";
  } else if (!greenApiWebhookUrl) {
    statusMessage = "WhatsApp is authorized, but Green-API Webhook URL is not set. Use 'Auto-Set Webhook' to activate.";
  } else if (incomingWebhookEnabled !== true) {
    statusMessage = "WhatsApp is authorized, but 'incomingWebhook' is disabled in Green-API. Enable it via 'Auto-Set Webhook'.";
  } else {
    statusMessage = `WhatsApp is connected & authorized (${stateInstance}) • Webhook active • Target Group Set.`;
  }

  return {
    configured,
    hasInstanceId,
    hasToken,
    sourceGroup,
    targetGroup,
    stateInstance,
    isPaused,
    statusMessage,
    greenApiWebhookUrl,
    incomingWebhookEnabled
  };
}

/**
 * Sends an instant test WhatsApp message to the target doctors group
 */
export async function sendTestDoctorCallAlert(): Promise<{
  success: boolean;
  message: string;
  idMessage?: string;
}> {
  const targetGroupId = process.env.WHATSAPP_DOCTORS_TARGET_GROUP_ID?.trim() || process.env.WHATSAPP_GROUP_ID?.trim();
  if (!targetGroupId) {
    return {
      success: false,
      message: "Target WhatsApp group ID (WHATSAPP_DOCTORS_TARGET_GROUP_ID or WHATSAPP_GROUP_ID) is not configured in environment variables."
    };
  }

  const testAlertText =
    `🧪 *TEST DOCTOR CALL ALERT* 🧪\n` +
    `👨‍⚕️ *Elite Hospital Systems Check*\n\n` +
    `📍 *Location:* Room *TEST-101*\n` +
    `🩺 *Specialty:* Testing & Diagnostics\n` +
    `📞 *Status:* Operational\n\n` +
    `⚡ _This is a verified test dispatch confirming Green-API automation is working correctly._`;

  const dispatchRes = await sendGreenApiTextMessage({
    chatId: targetGroupId,
    message: testAlertText
  });

  if (!dispatchRes.success) {
    return {
      success: false,
      message: `Failed to deliver test message: ${dispatchRes.error}`
    };
  }

  return {
    success: true,
    message: `Test message delivered successfully to WhatsApp group! (Message ID: ${dispatchRes.idMessage})`,
    idMessage: dispatchRes.idMessage
  };
}

// =========================================================================
// PIPELINE WORKFLOW (WEBHOOK INGESTION & DISPATCH)
// =========================================================================

export async function processDoctorCallWebhook(params: {
  rawBody: any;
  getActiveCheckins: (callDate?: string) => Promise<any[]>;
  source?: "webhook" | "poll" | "simulation";
}): Promise<{
  handled: boolean;
  reason?: string;
  callRecord?: DoctorCallRecord;
}> {
  const { rawBody, getActiveCheckins, source = "webhook" } = params;

  if (!rawBody || typeof rawBody !== "object") {
    recordWebhookAuditLog({
      source,
      senderChatId: "unknown",
      typeWebhook: "invalid",
      textSnippet: "",
      handled: false,
      reason: "Empty or invalid request body"
    });
    return { handled: false, reason: "Empty or invalid body" };
  }

  // 1. Extract message ID and check deduplication
  const idMessage = rawBody.idMessage || rawBody.messageData?.idMessage || "";
  const senderChatId = (rawBody.senderData?.chatId || rawBody.chatId || rawBody.messageData?.chatId || rawBody.chat || rawBody.from || "").trim().toLowerCase();
  const senderName = rawBody.senderData?.senderName || rawBody.senderData?.chatName || rawBody.senderName || "";
  const typeWebhook = rawBody.typeWebhook || rawBody.typeMessage || rawBody.messageData?.typeMessage || "incomingMessage";

  // Fast skip for non-message notifications (delivery/read receipts, authorization state changes)
  const nonMessageTypes = ["outgoingmessagestatus", "stateinstancechanged", "deviceinfo", "incomingcall", "outgoingcall"];
  if (nonMessageTypes.includes(typeWebhook.toLowerCase())) {
    return { handled: false, reason: `Ignored event notification: ${typeWebhook}` };
  }

  // Extract raw text from all Green-API payload variations (flat payload, extended text, quoted, captions, buttons)
  const messageText =
    rawBody.messageData?.textMessageData?.textMessage ||
    rawBody.messageData?.extendedTextMessageData?.text ||
    rawBody.messageData?.extendedTextMessageData?.description ||
    rawBody.messageData?.editedMessageData?.textMessage ||
    rawBody.messageData?.fileMessageData?.caption ||
    rawBody.messageData?.imageMessageData?.caption ||
    rawBody.messageData?.caption ||
    rawBody.messageData?.quotedMessage?.textMessage ||
    rawBody.messageData?.quotedMessage?.text ||
    rawBody.messageData?.buttonsResponseMessageData?.selectedDisplayText ||
    rawBody.messageData?.listResponseMessageData?.title ||
    rawBody.messageData?.text ||
    rawBody.textMessage ||
    rawBody.text ||
    rawBody.caption ||
    rawBody.message ||
    "";

  const textSnippet = (messageText || "").slice(0, 120);

  if (idMessage && isDuplicateMessage(idMessage)) {
    recordWebhookAuditLog({
      source,
      senderChatId,
      senderName,
      typeWebhook,
      textSnippet,
      handled: false,
      reason: "Duplicate message ID (already processed within TTL)"
    });
    return { handled: false, reason: "Duplicate message ID (already processed within TTL)" };
  }

  // Candidate chat IDs associated with this message
  const candidateChatIds = [
    rawBody.senderData?.chatId,
    rawBody.chatId,
    rawBody.messageData?.chatId,
    rawBody.chat,
    rawBody.from,
    senderChatId
  ].filter(Boolean).map(s => String(s).trim().toLowerCase());

  // Prevent infinite loops: Never process messages originating from the target doctors alerts group
  const targetGroupId = (process.env.WHATSAPP_DOCTORS_TARGET_GROUP_ID?.trim() || process.env.WHATSAPP_GROUP_ID?.trim() || "").toLowerCase();
  if (targetGroupId) {
    const cleanTargetId = targetGroupId.replace(/@(g|c)\.us$/i, "");
    const isFromTargetGroup = candidateChatIds.some(cid => {
      const cleanCid = cid.replace(/@(g|c)\.us$/i, "");
      return cid === targetGroupId || cleanCid === cleanTargetId;
    });
    if (isFromTargetGroup) {
      return { handled: false, reason: "Ignored message originating from the target doctors group" };
    }
  }

  // Check source group if specified (supports comma/semicolon/space separated list of monitored groups)
  const monitoredGroupRaw = process.env.WHATSAPP_CALLS_SOURCE_GROUP_ID?.trim() || "";

  if (monitoredGroupRaw && monitoredGroupRaw.toLowerCase() !== "all" && monitoredGroupRaw !== "*") {
    const monitoredGroups = monitoredGroupRaw
      .split(/[,;\s]+/)
      .map(g => g.trim().toLowerCase().replace(/['"]/g, ""))
      .filter(Boolean);

    if (monitoredGroups.length > 0) {
      const matchesMonitored = candidateChatIds.some(cid => {
        const cleanCid = cid.replace(/@(g|c)\.us$/i, "");
        return monitoredGroups.some(mg => {
          const cleanMg = mg.replace(/@(g|c)\.us$/i, "");
          return cid === mg || cleanCid === cleanMg || cleanCid.includes(cleanMg) || cleanMg.includes(cleanCid);
        });
      });

      if (!matchesMonitored) {
        const skipReason = `Ignored message from chat ${senderChatId} (monitored: ${monitoredGroups.join(", ")})`;
        recordWebhookAuditLog({
          source,
          senderChatId,
          senderName,
          typeWebhook,
          textSnippet,
          handled: false,
          reason: skipReason
        });
        return { handled: false, reason: skipReason };
      }
    }
  }

  if (!messageText) {
    const typeMsg = rawBody.messageData?.typeMessage || typeWebhook;
    let skipReason = "No text content found in webhook payload";
    if (typeMsg === "reactionMessage") skipReason = "Ignored reaction emoji";
    else if (typeMsg === "deletedMessage") skipReason = "Ignored deleted message";
    else if (typeMsg === "stickerMessage") skipReason = "Ignored sticker";
    else if (typeMsg === "audioMessage") skipReason = "Ignored audio message";
    else if (typeMsg === "pollMessage" || typeMsg === "pollUpdateMessage") skipReason = "Ignored poll message";
    else if (typeMsg === "locationMessage") skipReason = "Ignored location message";
    else if (typeMsg === "contactMessage" || typeMsg === "contactsArrayMessage") skipReason = "Ignored contact card";

    recordWebhookAuditLog({
      source,
      senderChatId,
      senderName,
      typeWebhook,
      textSnippet: "",
      handled: false,
      reason: skipReason
    });
    return { handled: false, reason: skipReason };
  }

  // 2. Parse DoctorCall format
  const parsed = parseDoctorCallMessage(messageText);
  if (!parsed) {
    const skipReason = "Message does not match DoctorCall category pattern";
    recordWebhookAuditLog({
      source,
      senderChatId,
      senderName,
      typeWebhook,
      textSnippet,
      handled: false,
      reason: skipReason
    });
    return { handled: false, reason: skipReason };
  }

  // 3. Resolve active shift and call date in Cairo using 8:00 AM hospital shift cutoff
  // Calls occurring between 00:00 and 07:59:59 AM belong to the previous day's roster
  const now = new Date();
  const activeShifts = getCairoActiveShifts(now);
  const targetCallDate = resolveHospitalDutyDate(parsed.callDate, now);

  console.log(`[DoctorCall] Received call for Room ${parsed.room}, Dept: "${parsed.departmentRaw}" -> "${parsed.canonicalDepartment}". Resolved Duty Date: "${targetCallDate}". Active Cairo Shifts: [${activeShifts.join(", ")}]`);

  // 4. Match checked-in doctors for this exact date from monthly roster
  const allCheckins = await getActiveCheckins(targetCallDate);
  const matchingDoctors: DispatchedDoctorInfo[] = [];

  for (const c of allCheckins) {
    const docDept = normalizeSpecialty(c.department).department;
    if (docDept.toLowerCase() === parsed.canonicalDepartment.toLowerCase()) {
      if (matchesActiveShift(c.shifts, activeShifts)) {
        matchingDoctors.push({
          id: c.id,
          name: c.doctorName,
          arabicName: c.doctorArabicName,
          phone: c.mobileNumber || "",
          waPhone: toWhatsAppPhone(c.mobileNumber),
          shifts: c.shifts || []
        });
      }
    }
  }

  // Resilient Fallback: If no doctor matched current active shift window, but a doctor in that department
  // checked in today, include them as on-duty coverage so urgent calls are never missed!
  let usedShiftFallback = false;
  if (matchingDoctors.length === 0) {
    for (const c of allCheckins) {
      const docDept = normalizeSpecialty(c.department).department;
      if (docDept.toLowerCase() === parsed.canonicalDepartment.toLowerCase()) {
        matchingDoctors.push({
          id: c.id,
          name: c.doctorName,
          arabicName: c.doctorArabicName,
          phone: c.mobileNumber || "",
          waPhone: toWhatsAppPhone(c.mobileNumber),
          shifts: c.shifts || []
        });
        usedShiftFallback = true;
      }
    }
  }

  const callId = `call_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
  let status: "dispatched" | "no_doctor_present" | "failed" | "paused" = "no_doctor_present";
  let dispatchReason = "";

  // 5. Check if automation is paused by admin
  if (isAutomationPaused()) {
    console.log(`[DoctorCall] ⏸️ Automation is currently PAUSED by admin. Recording call silently without dispatch.`);
    status = "paused";
    dispatchReason = "Automation paused by admin in settings";
  } else if (matchingDoctors.length === 0) {
    console.warn(`[DoctorCall] ⚠️ No doctor checked in for department "${parsed.canonicalDepartment}". Logged silently.`);
    status = "no_doctor_present";
    dispatchReason = `No doctor registered/checked-in today for ${parsed.canonicalDepartment}`;
  } else {
    // 6. Format alert and dispatch to target group
    const targetGroupId = process.env.WHATSAPP_DOCTORS_TARGET_GROUP_ID?.trim() || process.env.WHATSAPP_GROUP_ID?.trim();
    if (!targetGroupId) {
      console.error("[DoctorCall] Target WhatsApp group ID not configured in environment variables.");
      status = "failed";
      dispatchReason = "WHATSAPP_DOCTORS_TARGET_GROUP_ID not configured";
    } else {
      const alertText = formatDoctorCallAlert({
        doctors: matchingDoctors,
        specialty: parsed.canonicalDepartment,
        room: parsed.room,
        notes: parsed.notes,
        isOffShiftCoverage: usedShiftFallback
      });

      console.log(`[DoctorCall] Dispatching alert to target group ${targetGroupId}:\n${alertText}`);
      const dispatchRes = await sendGreenApiTextMessage({
        chatId: targetGroupId,
        message: alertText
      });

      if (dispatchRes.success) {
        console.log(`[DoctorCall] ✅ Alert dispatched successfully (ID: ${dispatchRes.idMessage})`);
        status = "dispatched";
        dispatchReason = `Alert delivered to ${matchingDoctors.map(d => d.name).join(", ")}`;
      } else {
        console.error(`[DoctorCall] ❌ Failed to dispatch alert: ${dispatchRes.error}`);
        status = "failed";
        dispatchReason = `Green-API dispatch failed: ${dispatchRes.error}`;
      }
    }
  }

  // Record audit log
  recordWebhookAuditLog({
    source,
    senderChatId,
    senderName,
    typeWebhook,
    textSnippet,
    handled: true,
    status,
    reason: dispatchReason,
    matchedDoctors: matchingDoctors.map(d => d.name)
  });

  // 7. Save record
  const record: DoctorCallRecord = {
    id: callId,
    callDate: targetCallDate,
    createdAt: now.toISOString(),
    room: parsed.room,
    department: parsed.canonicalDepartment,
    rawDepartment: parsed.departmentRaw,
    patientName: parsed.patientName || "N/A",
    patientBarcode: parsed.patientBarcode || "N/A",
    admittingPhysician: parsed.admittingPhysician || "N/A",
    callerName: parsed.callerName || "N/A",
    dispatchedDoctors: matchingDoctors,
    status,
    notes: parsed.notes,
    rawMessage: parsed.rawMessage
  };

  await saveDoctorCallRecord(record);
  return { handled: true, callRecord: record };
}

/**
 * Polls Green-API receiveNotification queue as a failsafe when webhooks cannot reach the server
 */
export async function pollGreenApiNotifications(params: {
  getActiveCheckins: (callDate?: string) => Promise<any[]>;
  maxCount?: number;
}): Promise<{
  polledCount: number;
  handledCount: number;
  results: any[];
}> {
  const idInstance = process.env.GREEN_API_ID_INSTANCE?.trim();
  const apiTokenInstance = process.env.GREEN_API_API_TOKEN_INSTANCE?.trim();

  if (!idInstance || !apiTokenInstance) {
    return { polledCount: 0, handledCount: 0, results: [] };
  }

  const { getActiveCheckins, maxCount = 5 } = params;
  let polled = 0;
  let handled = 0;
  const results: any[] = [];

  for (let i = 0; i < maxCount; i++) {
    try {
      const receiveUrl = `https://api.green-api.com/waInstance${idInstance}/receiveNotification/${apiTokenInstance}`;
      const res = await fetch(receiveUrl);
      const data: any = await res.json().catch(() => null);

      if (!data || !data.receiptId) {
        break; // Queue is empty
      }

      polled++;
      const receiptId = data.receiptId;
      const rawBody = data.body;

      console.log(`[Green-API Poller] Found queued notification (Receipt ID: ${receiptId}, type: ${rawBody?.typeWebhook})`);

      const processResult = await processDoctorCallWebhook({
        rawBody,
        getActiveCheckins,
        source: "poll"
      });

      results.push({ receiptId, ...processResult });
      if (processResult.handled) {
        handled++;
      }

      // Delete receipt from Green-API queue so it won't be delivered again
      const deleteUrl = `https://api.green-api.com/waInstance${idInstance}/deleteNotification/${apiTokenInstance}/${receiptId}`;
      await fetch(deleteUrl, { method: "DELETE" }).catch(() => {});
    } catch (err: any) {
      console.warn("[Green-API Poller] Error polling notification:", err.message);
      break;
    }
  }

  return { polledCount: polled, handledCount: handled, results };
}

/**
 * Re-dispatches a call record manually from the admin panel
 */
export async function reDispatchDoctorCall(params: {
  callId: string;
  getActiveCheckins: (callDate?: string) => Promise<any[]>;
}): Promise<{
  success: boolean;
  message: string;
  record?: DoctorCallRecord;
}> {
  const { callId, getActiveCheckins } = params;
  const existingCalls = await getDoctorCallRecords();
  const target = existingCalls.find(c => c.id === callId);

  if (!target) {
    return { success: false, message: "Doctor call record not found." };
  }

  const now = new Date();
  const activeShifts = getCairoActiveShifts(now);
  const targetDate = target.callDate || getCairoDateString(now);
  const allCheckins = await getActiveCheckins(targetDate);
  const matchingDoctors: DispatchedDoctorInfo[] = [];

  for (const c of allCheckins) {
    const docDept = normalizeSpecialty(c.department).department;
    if (docDept.toLowerCase() === target.department.toLowerCase()) {
      if (matchesActiveShift(c.shifts, activeShifts)) {
        matchingDoctors.push({
          id: c.id,
          name: c.doctorName,
          arabicName: c.doctorArabicName,
          phone: c.mobileNumber || "",
          waPhone: toWhatsAppPhone(c.mobileNumber),
          shifts: c.shifts || []
        });
      }
    }
  }

  let usedShiftFallback = false;
  if (matchingDoctors.length === 0) {
    for (const c of allCheckins) {
      const docDept = normalizeSpecialty(c.department).department;
      if (docDept.toLowerCase() === target.department.toLowerCase()) {
        matchingDoctors.push({
          id: c.id,
          name: c.doctorName,
          arabicName: c.doctorArabicName,
          phone: c.mobileNumber || "",
          waPhone: toWhatsAppPhone(c.mobileNumber),
          shifts: c.shifts || []
        });
        usedShiftFallback = true;
      }
    }
  }

  if (matchingDoctors.length === 0) {
    target.status = "no_doctor_present";
    target.dispatchedDoctors = [];
    await saveDoctorCallRecord(target);
    return {
      success: false,
      message: `No doctor currently checked in for ${target.department}.`,
      record: target
    };
  }

  const targetGroupId = process.env.WHATSAPP_DOCTORS_TARGET_GROUP_ID?.trim() || process.env.WHATSAPP_GROUP_ID?.trim();
  if (!targetGroupId) {
    return { success: false, message: "Target WhatsApp group ID is not configured in environment variables." };
  }

  const alertText = formatDoctorCallAlert({
    doctors: matchingDoctors,
    specialty: target.department,
    room: target.room,
    notes: target.notes,
    isOffShiftCoverage: usedShiftFallback
  });

  const dispatchRes = await sendGreenApiTextMessage({
    chatId: targetGroupId,
    message: alertText
  });

  if (!dispatchRes.success) {
    target.status = "failed";
    await saveDoctorCallRecord(target);
    return { success: false, message: `Green-API error: ${dispatchRes.error}` };
  }

  target.status = "dispatched";
  target.dispatchedDoctors = matchingDoctors;
  await saveDoctorCallRecord(target);

  return {
    success: true,
    message: `Dispatched to ${matchingDoctors.length} doctor(s) successfully!`,
    record: target
  };
}

export interface CustomDoctorCallPayload {
  room: string;
  department: string;
  date?: string;
  patientName?: string;
  patientBarcode?: string;
  admittingPhysician?: string;
  callerName?: string;
  notes?: string;
  customMessage?: string;
  selectedDoctorIds?: string[];
}

export interface CustomDoctorCallPreviewResult {
  success: boolean;
  canonicalDepartment: string;
  callDate: string;
  activeShifts: string[];
  matchingDoctors: DispatchedDoctorInfo[];
  allDepartmentDoctors: DispatchedDoctorInfo[];
  isOffShiftCoverage: boolean;
  formattedMessage: string;
  targetGroupId?: string;
  error?: string;
}

/**
 * Previews the matched attending physicians from the monthly sheet
 * and generates the WhatsApp message alert for review before sending.
 */
export async function previewCustomDoctorCall(params: {
  payload: CustomDoctorCallPayload;
  getActiveCheckins: (callDate?: string) => Promise<any[]>;
}): Promise<CustomDoctorCallPreviewResult> {
  const { payload, getActiveCheckins } = params;
  const rawDept = (payload.department || "").trim();
  const { department: canonicalDepartment } = normalizeSpecialty(rawDept);

  const now = new Date();
  const targetDate = resolveHospitalDutyDate(payload.date, now);
  const activeShifts = getCairoActiveShifts(now);

  const allCheckins = await getActiveCheckins(targetDate);
  const onShiftDoctors: DispatchedDoctorInfo[] = [];
  const allDeptDoctors: DispatchedDoctorInfo[] = [];

  for (const c of allCheckins) {
    const docDept = normalizeSpecialty(c.department).department;
    if (docDept.toLowerCase() === canonicalDepartment.toLowerCase()) {
      const docInfo: DispatchedDoctorInfo = {
        id: c.id,
        name: c.doctorName,
        arabicName: c.doctorArabicName,
        phone: c.mobileNumber || "",
        waPhone: toWhatsAppPhone(c.mobileNumber),
        shifts: c.shifts || []
      };
      allDeptDoctors.push(docInfo);

      if (matchesActiveShift(c.shifts, activeShifts)) {
        onShiftDoctors.push(docInfo);
      }
    }
  }

  let finalMatching = onShiftDoctors.length > 0 ? onShiftDoctors : allDeptDoctors;
  const isOffShiftCoverage = onShiftDoctors.length === 0 && allDeptDoctors.length > 0;

  // If user explicitly pre-selected doctor IDs, filter to those
  if (payload.selectedDoctorIds && payload.selectedDoctorIds.length > 0) {
    const selectedSet = new Set(payload.selectedDoctorIds.map(id => String(id).toLowerCase().trim()));
    finalMatching = finalMatching.filter(d => selectedSet.has(String(d.id).toLowerCase().trim()));
  }

  const targetGroupId = process.env.WHATSAPP_DOCTORS_TARGET_GROUP_ID?.trim() || process.env.WHATSAPP_GROUP_ID?.trim() || "";

  // If user provided custom message text, use it; otherwise auto-format
  let formattedMessage = (payload.customMessage || "").trim();
  if (!formattedMessage) {
    formattedMessage = formatDoctorCallAlert({
      doctors: finalMatching,
      specialty: canonicalDepartment,
      room: payload.room || "N/A",
      notes: payload.notes,
      isOffShiftCoverage
    });
  }

  return {
    success: true,
    canonicalDepartment,
    callDate: targetDate,
    activeShifts,
    matchingDoctors: finalMatching,
    allDepartmentDoctors: allDeptDoctors,
    isOffShiftCoverage,
    formattedMessage,
    targetGroupId
  };
}

/**
 * Confirms and dispatches the customized Doctor Call message to WhatsApp group,
 * records the call in the database, and creates an audit log entry.
 */
export async function sendCustomDoctorCall(params: {
  payload: CustomDoctorCallPayload;
  getActiveCheckins: (callDate?: string) => Promise<any[]>;
}): Promise<{
  success: boolean;
  message: string;
  idMessage?: string;
  callRecord?: DoctorCallRecord;
  error?: string;
}> {
  const { payload, getActiveCheckins } = params;
  const preview = await previewCustomDoctorCall({ payload, getActiveCheckins });

  const targetGroupId = preview.targetGroupId;
  if (!targetGroupId) {
    return {
      success: false,
      message: "Target WhatsApp group ID is not configured in environment variables (WHATSAPP_DOCTORS_TARGET_GROUP_ID).",
      error: "Target WhatsApp group ID missing"
    };
  }

  const finalMessage = (payload.customMessage || "").trim() || preview.formattedMessage;
  const now = new Date();
  const callId = `call_custom_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;

  console.log(`[Custom DoctorCall] Dispatching to ${targetGroupId} for Room ${payload.room}, Dept ${preview.canonicalDepartment}:`);
  console.log(finalMessage);

  const dispatchRes = await sendGreenApiTextMessage({
    chatId: targetGroupId,
    message: finalMessage
  });

  const status: "dispatched" | "no_doctor_present" | "failed" = dispatchRes.success
    ? "dispatched"
    : (preview.matchingDoctors.length === 0 ? "no_doctor_present" : "failed");

  const callRecord: DoctorCallRecord = {
    id: callId,
    callDate: preview.callDate,
    createdAt: now.toISOString(),
    room: payload.room || "N/A",
    department: preview.canonicalDepartment,
    rawDepartment: payload.department || preview.canonicalDepartment,
    patientName: payload.patientName || "N/A",
    patientBarcode: payload.patientBarcode || "N/A",
    admittingPhysician: payload.admittingPhysician || "N/A",
    callerName: payload.callerName || "Manual / Custom Dispatch",
    dispatchedDoctors: preview.matchingDoctors,
    status,
    notes: payload.notes,
    rawMessage: finalMessage
  };

  await saveDoctorCallRecord(callRecord);

  recordWebhookAuditLog({
    source: "simulation",
    senderChatId: targetGroupId,
    senderName: payload.callerName || "Manual Custom Dispatch",
    typeWebhook: "customMessageDispatch",
    textSnippet: finalMessage.slice(0, 120),
    handled: true,
    status,
    reason: dispatchRes.success
      ? `Custom alert delivered to group (paged: ${preview.matchingDoctors.map(d => d.name).join(", ") || "No doctors matched"})`
      : `Green-API dispatch failed: ${dispatchRes.error}`,
    matchedDoctors: preview.matchingDoctors.map(d => d.name)
  });

  if (!dispatchRes.success) {
    return {
      success: false,
      message: `Failed to deliver WhatsApp message: ${dispatchRes.error}`,
      error: dispatchRes.error,
      callRecord
    };
  }

  return {
    success: true,
    message: `Custom Doctor Call delivered successfully to WhatsApp group! (ID: ${dispatchRes.idMessage})`,
    idMessage: dispatchRes.idMessage,
    callRecord
  };
}

