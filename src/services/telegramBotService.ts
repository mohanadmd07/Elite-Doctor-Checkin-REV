/**
 * TELEGRAM BOT DOCTOR CALL DISPATCH SERVICE
 * Elite Hospital Physician Check-in System
 *
 * Listens for Telegram Bot webhook updates containing natural-language call requests
 * (e.g. "call general surgery to ER", "call general surgery to 324"),
 * resolves the canonical specialty and active on-shift doctors in Africa/Cairo time,
 * dispatches the formatted alert to the target WhatsApp group via Green-API,
 * logs the call as "Telegram Call" in Supabase & local JSON, and replies "Call Dispached".
 */

import crypto from "crypto";
import { normalizeSpecialty } from "../data/specialties.js";
import {
  previewCustomDoctorCall,
  sendCustomDoctorCall,
  saveDoctorCallRecord,
  recordWebhookAuditLog,
  isAutomationPaused,
  type DoctorCallRecord,
  type DispatchedDoctorInfo,
} from "./doctorCallDispatcher.js";

export interface ParsedTelegramCallCommand {
  rawDepartment: string;
  canonicalDepartment: string;
  room: string;
  isOpd: boolean;
  notes?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: {
      id: number;
      first_name?: string;
      last_name?: string;
      username?: string;
    };
    chat: {
      id: number;
      type: "private" | "group" | "supergroup" | "channel" | string;
      title?: string;
    };
    text?: string;
  };
}

// Common hospital shorthand aliases -> canonical specialty strings
const SPECIALTY_ABBREVIATIONS: Record<string, string> = {
  gs: "General Surgery",
  "gen surg": "General Surgery",
  "gen surgery": "General Surgery",
  surgery: "General Surgery",
  im: "Internal Medicine",
  "internal med": "Internal Medicine",
  med: "Internal Medicine",
  er: "Emergency Medicine",
  emergency: "Emergency Medicine",
  icu: "ICU",
  cardio: "Cardiology",
  ortho: "Orthopedic Surgery",
  orthopedic: "Orthopedic Surgery",
  orthopedics: "Orthopedic Surgery",
  neuro: "Neurosurgery",
  neurosurg: "Neurosurgery",
  uro: "Urology",
  peds: "Pediatrics",
  pediatric: "Pediatrics",
  obgyn: "Obstetrics and gynecology",
  "ob/gyn": "Obstetrics and gynecology",
  obs: "Obstetrics and gynecology",
  gyn: "Obstetrics and gynecology",
  gyne: "Obstetrics and gynecology",
  ent: "ENT",
  nephro: "Nephrology",
  renal: "Nephrology",
  ct: "Cardiothoracic Surgery",
  cardiothoracic: "Cardiothoracic Surgery",
  anesthesia: "Anesthesiology & Pain Therapy",
  anaesthesia: "Anesthesiology & Pain Therapy",
  pain: "Anesthesiology & Pain Therapy",
  physio: "Physiotherapy",
  pt: "Physiotherapy",
  rad: "Radiology",
  onco: "Oncology",
  nutrition: "Nutrition",
  pharmacy: "Clinical Pharmacy",
};

// In-memory deduplication cache for Telegram update_id (24-hour TTL)
const processedTelegramUpdates = new Map<number, number>();
const UPDATE_TTL_MS = 24 * 60 * 60 * 1000;

export function isDuplicateTelegramUpdate(updateId: number): boolean {
  if (!Number.isFinite(updateId)) return false;
  const now = Date.now();
  for (const [id, ts] of processedTelegramUpdates.entries()) {
    if (now - ts > UPDATE_TTL_MS) {
      processedTelegramUpdates.delete(id);
    }
  }
  if (processedTelegramUpdates.has(updateId)) {
    return true;
  }
  processedTelegramUpdates.set(updateId, now);
  return false;
}

export function clearTelegramDeduplicationCache(): void {
  processedTelegramUpdates.clear();
}

/**
 * Checks whether a Telegram chat ID is permitted to dispatch calls.
 * If TELEGRAM_ALLOWED_CHAT_IDS is unset or empty, all chats are permitted.
 */
export function isTelegramChatAllowed(chatId: number | string): boolean {
  const raw = process.env.TELEGRAM_ALLOWED_CHAT_IDS?.trim();
  if (!raw) return true;
  const allowed = raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowed.length === 0) return true;
  return allowed.includes(String(chatId));
}

/**
 * Resolves a raw specialty string (including shorthand abbreviations) into a canonical active specialty.
 */
function resolveTelegramSpecialty(rawDept: string): { active: boolean; department: string } {
  const cleaned = rawDept.replace(/\s+/g, " ").trim();
  if (!cleaned) return { active: false, department: "" };

  const abbr = SPECIALTY_ABBREVIATIONS[cleaned.toLowerCase()];
  if (abbr) {
    return normalizeSpecialty(abbr);
  }
  return normalizeSpecialty(cleaned);
}

/**
 * Formats a multi-word OPD location string so "OPD" stays uppercase
 * and subsequent words are title-cased (e.g. "opd cardiology center" -> "OPD Cardiology Center").
 */
function formatOpdLocation(rawLocation: string): string {
  const words = rawLocation.trim().split(/\s+/).filter(Boolean);
  return words
    .map((word, idx) => {
      if (idx === 0 || word.toLowerCase() === "opd") return "OPD";
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

/**
 * Formats the WhatsApp alert message for OPD Doctor Calls.
 */
export function formatOpdDoctorCallAlert(params: {
  doctors: DispatchedDoctorInfo[];
  specialty: string;
  location: string;
  notes?: string;
  isOffShiftCoverage?: boolean;
}): string {
  const { doctors, specialty, location, notes, isOffShiftCoverage } = params;
  const coverageNote = isOffShiftCoverage ? ` _(On-duty coverage)_` : "";
  const notesLine = notes ? `📝 *Notes:* ${notes}\n` : "";

  if (doctors.length === 1) {
    const doc = doctors[0];
    const mentionTag = doc.waPhone ? `@${doc.waPhone}` : "";
    const phoneDisplay = doc.phone || "N/A";

    return (
      `🩺🚨 *OPD DOCTOR CALL* 🚨🩺\n` +
      `👨‍⚕️ Dr. ${mentionTag} *${doc.name}*${coverageNote}\n\n` +
      `📍 *Location:* *${location}*\n` +
      `🩺 *Specialty:* ${specialty}\n` +
      `👤 *Patient:* OPD Patient\n` +
      `📞 *Phone:* ${phoneDisplay}\n` +
      notesLine + `\n` +
      `⚡ _Please attend to the patient promptly._`
    );
  }

  const mentionsLine = doctors
    .map((d) => `Dr. ${d.waPhone ? `@${d.waPhone}` : ""} *${d.name}*`)
    .join(" & ");
  const phonesLine = doctors.map((d) => d.phone || "N/A").join(", ");

  return (
    `🩺🚨 *OPD DOCTOR CALL* 🚨🩺\n` +
    `👨‍⚕️ ${mentionsLine}${coverageNote}\n\n` +
    `📍 *Location:* *${location}*\n` +
    `🩺 *Specialty:* ${specialty}\n` +
    `👤 *Patient:* OPD Patient\n` +
    `📞 *Phones:* ${phonesLine}\n` +
    notesLine + `\n` +
    `⚡ _Please attend to the patient promptly._`
  );
}

/**
 * Parses natural-language Telegram doctor call commands such as:
 * - "call general surgery to ER"
 * - "call general surgery to 324"
 * - "call general surgery to 411"
 * - "call cardiology to OPD"
 * - "call cardiology to OPD cardiology center"
 * - "/call cardiology to room 325"
 * - "استدعاء جراحة عامة الى 324"
 */
export function parseTelegramCallCommand(rawText: string): ParsedTelegramCallCommand | null {
  if (!rawText || typeof rawText !== "string") return null;

  const text = rawText
    .replace(/[\u200B-\u200F\u061C\uFEFF\u202A-\u202E]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return null;

  // 1. Check OPD pattern first (allows multi-word OPD locations like "OPD cardiology center")
  const opdEnMatch = text.match(
    /^(?:\/?call(?:@\w+)?|please\s+call|page)\s+(.+?)\s+(?:to|in|at|for)\s+(opd(?:\s+[^-–—:,\n]+)?)(?:\s*[-–—:,]\s*(.+))?$/i
  );
  const opdArMatch = !opdEnMatch
    ? text.match(
        /^(?:\/?استدعاء|نداء)\s+(.+?)\s+(?:الى|إلى|لـ|ل|بقسم)\s+(opd(?:\s+[^-–—:,\n]+)?)(?:\s*[-–—:,]\s*(.+))?$/i
      )
    : null;

  const opdMatch = opdEnMatch || opdArMatch;
  if (opdMatch) {
    const rawDepartment = opdMatch[1].trim();
    const resolved = resolveTelegramSpecialty(rawDepartment);
    if (!resolved.active) return null;

    return {
      rawDepartment,
      canonicalDepartment: resolved.department,
      room: formatOpdLocation(opdMatch[2]),
      isOpd: true,
      notes: opdMatch[3]?.trim() || undefined,
    };
  }

  // 2. Standard inpatient room pattern: (call | /call | /call@bot | page | please call) <specialty> (to|in|at|for) [room|bed] <room> [optional notes]
  const enMatch = text.match(
    /^(?:\/?call(?:@\w+)?|please\s+call|page)\s+(.+?)\s+(?:to|in|at|for)\s+(?:(?:room|bed)\s+)?([a-z0-9\-\/]+)(?:\s*[-–—:,]\s*(.+))?$/i
  );

  // Arabic pattern: (استدعاء | نداء) <specialty> (الى|إلى|لـ|ل|غرفة|غرفه|بقسم) [غرفة|غرفه|سرير] <room> [optional notes]
  const arMatch = !enMatch
    ? text.match(
        /^(?:\/?استدعاء|نداء)\s+(.+?)\s+(?:الى|إلى|لـ|ل|غرفة|غرفه|بقسم)\s+(?:(?:غرفة|غرفه|سرير)\s+)?([a-z0-9\u0660-\u0669\-\/]+)(?:\s*[-–—:,]\s*(.+))?$/i
      )
    : null;

  const match = enMatch || arMatch;
  if (!match) return null;

  const rawDepartment = match[1].trim();
  // Convert Arabic-Indic numerals in room if present
  const room = match[2]
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .trim()
    .toUpperCase();
  const notes = match[3]?.trim() || undefined;

  const resolved = resolveTelegramSpecialty(rawDepartment);
  if (!resolved.active) {
    return null;
  }

  return {
    rawDepartment,
    canonicalDepartment: resolved.department,
    room,
    isOpd: false,
    notes,
  };
}

/**
 * Calls the Telegram Bot API using native fetch.
 */
async function callTelegramApi(
  method: string,
  payload?: Record<string, unknown>
): Promise<{ ok: boolean; result?: any; description?: string; error_code?: number }> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    return { ok: false, description: "TELEGRAM_BOT_TOKEN is not configured." };
  }

  const url = `https://api.telegram.org/bot${token}/${method}`;
  try {
    const res = await fetch(url, {
      method: payload ? "POST" : "GET",
      headers: payload ? { "Content-Type": "application/json" } : undefined,
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      return {
        ok: false,
        description: data?.description || `HTTP ${res.status}`,
        error_code: data?.error_code || res.status,
      };
    }
    return { ok: true, result: data.result };
  } catch (err: any) {
    return { ok: false, description: err?.message || "Network error calling Telegram API" };
  }
}

export async function sendTelegramMessage(params: {
  chatId: number | string;
  text: string;
  replyToMessageId?: number;
  parseMode?: "HTML" | "MarkdownV2";
}): Promise<{ ok: boolean; messageId?: number; error?: string }> {
  const body: Record<string, unknown> = {
    chat_id: params.chatId,
    text: params.text,
  };
  if (params.replyToMessageId) {
    body.reply_parameters = { message_id: params.replyToMessageId };
  }
  if (params.parseMode) {
    body.parse_mode = params.parseMode;
  }

  const res = await callTelegramApi("sendMessage", body);
  if (!res.ok) {
    return { ok: false, error: res.description };
  }
  return { ok: true, messageId: res.result?.message_id };
}

export async function setTelegramWebhook(params: {
  webhookUrl: string;
  secretToken?: string;
}): Promise<{ ok: boolean; description?: string }> {
  const payload: Record<string, unknown> = {
    url: params.webhookUrl.trim(),
    allowed_updates: ["message"],
  };
  if (params.secretToken) {
    payload.secret_token = params.secretToken;
  }
  return callTelegramApi("setWebhook", payload);
}

export async function getTelegramBotStatus(): Promise<{
  configured: boolean;
  bot?: { id: number; username?: string; first_name?: string };
  webhook?: { url?: string; pending_update_count?: number; last_error_message?: string };
  error?: string;
}> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    return { configured: false, error: "TELEGRAM_BOT_TOKEN is missing." };
  }

  const meRes = await callTelegramApi("getMe");
  if (!meRes.ok) {
    return { configured: false, error: meRes.description };
  }

  const webhookRes = await callTelegramApi("getWebhookInfo");
  return {
    configured: true,
    bot: meRes.result,
    webhook: webhookRes.ok ? webhookRes.result : undefined,
    error: webhookRes.ok ? undefined : webhookRes.description,
  };
}

/**
 * Processes an incoming Telegram webhook update end-to-end:
 * 1. Deduplicates by update_id
 * 2. Validates chat authorization
 * 3. Handles /start and /help
 * 4. Parses "call <specialty> to <room>"
 * 5. Fetches on-shift doctors, dispatches WhatsApp alert, logs as "Telegram Call", and replies "Call Dispached"
 */
export async function processTelegramWebhookUpdate(params: {
  update: TelegramUpdate;
  getActiveCheckins: (callDate?: string) => Promise<any[]>;
}): Promise<{
  handled: boolean;
  action?: "dispatched" | "no_doctor_present" | "paused" | "failed" | "help" | "ignored" | "unauthorized";
  replyText?: string;
  callRecord?: DoctorCallRecord;
}> {
  const { update, getActiveCheckins } = params;

  if (!update || typeof update !== "object") {
    return { handled: false, action: "ignored" };
  }

  if (typeof update.update_id === "number" && isDuplicateTelegramUpdate(update.update_id)) {
    return { handled: false, action: "ignored" };
  }

  const msg = update.message;
  const text = msg?.text?.trim();
  const chatId = msg?.chat?.id;
  const messageId = msg?.message_id;

  if (!msg || !chatId || !text) {
    return { handled: false, action: "ignored" };
  }

  if (!isTelegramChatAllowed(chatId)) {
    const replyText = "Unauthorized chat. Contact hospital admin to whitelist this chat ID.";
    await sendTelegramMessage({ chatId, text: replyText, replyToMessageId: messageId });
    return { handled: false, action: "unauthorized", replyText };
  }

  // Handle /start and /help
  if (/^\/(start|help)(?:@\w+)?\b/i.test(text)) {
    const replyText =
      "Elite Hospital Doctor Call Bot\n\n" +
      "Send a message in this format:\n" +
      "call <specialty> to <room>\n\n" +
      "Examples:\n" +
      "• call general surgery to ER\n" +
      "• call general surgery to 324\n" +
      "• call cardiology to 411";
    await sendTelegramMessage({ chatId, text: replyText, replyToMessageId: messageId });
    return { handled: true, action: "help", replyText };
  }

  const parsed = parseTelegramCallCommand(text);
  if (!parsed) {
    // Only send usage hint in private chats or when explicitly prefixed with /call or "call "
    if (msg.chat.type === "private" || /^\/?call\b/i.test(text)) {
      const replyText =
        "Could not recognize specialty or room.\n" +
        "Format: call <specialty> to <room>\n" +
        "Example: call general surgery to ER";
      await sendTelegramMessage({ chatId, text: replyText, replyToMessageId: messageId });
      return { handled: false, action: "ignored", replyText };
    }
    return { handled: false, action: "ignored" };
  }

  const patientLabel = parsed.isOpd ? "OPD Patient" : "Elite Patient";
  const locationDisplay = parsed.isOpd ? parsed.room : `Room ${parsed.room}`;

  // Respect Admin Panel Pause toggle
  if (isAutomationPaused()) {
    const now = new Date();
    const preview = await previewCustomDoctorCall({
      payload: { room: parsed.room, department: parsed.canonicalDepartment },
      getActiveCheckins,
    });
    const pausedRecord: DoctorCallRecord = {
      id: `call_tg_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
      callDate: preview.callDate,
      createdAt: now.toISOString(),
      room: parsed.room,
      department: parsed.canonicalDepartment,
      rawDepartment: parsed.rawDepartment,
      patientName: patientLabel,
      patientBarcode: "N/A",
      admittingPhysician: "N/A",
      callerName: "Telegram Call",
      dispatchedDoctors: preview.matchingDoctors,
      status: "paused",
      notes: parsed.notes,
      rawMessage: text,
    };
    await saveDoctorCallRecord(pausedRecord);
    const replyText = "Automation is currently paused by admin.";
    await sendTelegramMessage({ chatId, text: replyText, replyToMessageId: messageId });
    return { handled: true, action: "paused", replyText, callRecord: pausedRecord };
  }

  // 1. Preview on-shift doctors for this specialty
  const preview = await previewCustomDoctorCall({
    payload: {
      room: parsed.room,
      department: parsed.canonicalDepartment,
      notes: parsed.notes,
    },
    getActiveCheckins,
  });

  // 2. If no doctor is checked in on shift, log as no_doctor_present and notify Telegram (do not send empty alert to WhatsApp)
  if (preview.matchingDoctors.length === 0) {
    const now = new Date();
    const record: DoctorCallRecord = {
      id: `call_tg_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
      callDate: preview.callDate,
      createdAt: now.toISOString(),
      room: parsed.room,
      department: parsed.canonicalDepartment,
      rawDepartment: parsed.rawDepartment,
      patientName: patientLabel,
      patientBarcode: "N/A",
      admittingPhysician: "N/A",
      callerName: "Telegram Call",
      dispatchedDoctors: [],
      status: "no_doctor_present",
      notes: parsed.notes,
      rawMessage: text,
    };

    await saveDoctorCallRecord(record);
    recordWebhookAuditLog({
      source: "simulation",
      senderChatId: `telegram:${chatId}`,
      senderName: "Telegram Call",
      typeWebhook: "telegramBotCall",
      textSnippet: text.slice(0, 120),
      handled: true,
      status: "no_doctor_present",
      reason: `No doctor checked in on shift for ${parsed.canonicalDepartment} (${locationDisplay})`,
      matchedDoctors: [],
    });

    const replyText = `No doctor currently checked in on shift for ${parsed.canonicalDepartment} (${locationDisplay}).`;
    await sendTelegramMessage({ chatId, text: replyText, replyToMessageId: messageId });
    return { handled: true, action: "no_doctor_present", replyText, callRecord: record };
  }

  // 3. Dispatch to WhatsApp via Green-API and log to Supabase + local JSON as "Telegram Call"
  const customMessage = parsed.isOpd
    ? formatOpdDoctorCallAlert({
        doctors: preview.matchingDoctors,
        specialty: parsed.canonicalDepartment,
        location: parsed.room,
        notes: parsed.notes,
        isOffShiftCoverage: preview.isOffShiftCoverage,
      })
    : undefined;

  const dispatchRes = await sendCustomDoctorCall({
    payload: {
      room: parsed.room,
      department: parsed.canonicalDepartment,
      patientName: patientLabel,
      callerName: "Telegram Call",
      notes: parsed.notes,
      customMessage,
    },
    getActiveCheckins,
  });

  if (!dispatchRes.success) {
    const replyText = `Failed to dispatch call: ${dispatchRes.error || dispatchRes.message}`;
    await sendTelegramMessage({ chatId, text: replyText, replyToMessageId: messageId });
    return {
      handled: true,
      action: "failed",
      replyText,
      callRecord: dispatchRes.callRecord,
    };
  }

  const replyText = "Call Dispached";
  await sendTelegramMessage({ chatId, text: replyText, replyToMessageId: messageId });

  return {
    handled: true,
    action: "dispatched",
    replyText,
    callRecord: dispatchRes.callRecord,
  };
}
