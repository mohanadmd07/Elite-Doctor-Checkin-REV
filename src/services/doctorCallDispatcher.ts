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
  status: "dispatched" | "no_doctor_present" | "failed";
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

/**
 * Parses multiline WhatsApp text matching DoctorCall format
 */
export function parseDoctorCallMessage(messageText: string): ParsedDoctorCall | null {
  if (!messageText || typeof messageText !== "string") return null;

  // Verify trigger
  const hasDoctorCall = /category:\s*doctorcall/i.test(messageText);
  if (!hasDoctorCall) return null;

  const getField = (regex: RegExp): string => {
    const m = messageText.match(regex);
    return m ? m[1].trim() : "";
  };

  const category = getField(/category:\s*([^\r\n]+)/i) || "DoctorCall";
  const departmentRaw = getField(/group:\s*([^\r\n]+)/i);
  const callerName = getField(/by:\s*([^\r\n]+)/i);
  const callDate = getField(/date:\s*([^\r\n]+)/i);
  const location = getField(/location:\s*([^\r\n]+)/i);

  // Extract room from Sub.Location or Bed or Room
  let room = getField(/sub\.?\s*location:\s*(?:room\s*)?([^\r\n]+)/i);
  if (!room) {
    room = getField(/room:\s*([^\r\n]+)/i);
  }
  if (!room) {
    room = getField(/bed:\s*(?:bed\s*)?([^\r\n]+)/i);
  }
  if (room) {
    room = room.replace(/^room\s*/i, "").trim();
  } else {
    room = "N/A";
  }

  const patientBarcode = getField(/patient\s*barcode:\s*([^\r\n]+)/i);
  const patientName = getField(/patient\s*name:\s*([^\r\n]+)/i);
  const admittingPhysician = getField(/admitting\s*phys(?:ician)?:\s*([^\r\n]+)/i);
  const bed = getField(/bed:\s*([^\r\n]+)/i);

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
    rawMessage: messageText
  };
}

/**
 * Calculates current active shift(s) according to Africa/Cairo local time
 * Shift definitions:
 * - Long shift: 09:00 AM - 09:00 PM
 * - Evening shift: 03:00 PM - 11:00 PM
 * - Night shift: 11:00 PM - 09:00 AM
 */
export function getCairoActiveShifts(date: Date = new Date()): string[] {
  const cairoTimeStr = date.toLocaleTimeString("en-US", {
    timeZone: "Africa/Cairo",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit"
  });
  const [hourStr, minStr] = cairoTimeStr.split(":");
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minStr, 10);
  const timeInMinutes = hour * 60 + minute;

  const activeShifts: string[] = [];

  // Long shift: 9:00 AM (540 min) - 9:00 PM (1260 min)
  if (timeInMinutes >= 9 * 60 && timeInMinutes < 21 * 60) {
    activeShifts.push("Long shift");
  }

  // Evening shift: 3:00 PM (900 min) - 11:00 PM (1380 min)
  if (timeInMinutes >= 15 * 60 && timeInMinutes < 23 * 60) {
    activeShifts.push("Evening shift");
  }

  // Night shift: 11:00 PM (1380 min) - 9:00 AM (540 min)
  if (timeInMinutes >= 23 * 60 || timeInMinutes < 9 * 60) {
    activeShifts.push("Night shift");
  }

  return activeShifts;
}

/**
 * Determines whether a doctor's registered shifts match current active shift(s)
 */
export function matchesActiveShift(doctorShifts: string[], activeShifts: string[]): boolean {
  if (!doctorShifts || !Array.isArray(doctorShifts) || doctorShifts.length === 0) return false;

  const docShiftsLower = doctorShifts.map(s => (s || "").toLowerCase());

  // 24-hour shift covers all hours
  if (docShiftsLower.some(s => s.includes("24"))) return true;

  for (const active of activeShifts) {
    const activeLower = active.toLowerCase();
    if (activeLower.includes("long")) {
      if (docShiftsLower.some(s => s.includes("long") || s.includes("morning"))) return true;
    }
    if (activeLower.includes("evening")) {
      if (docShiftsLower.some(s => s.includes("evening") || s.includes("eve"))) return true;
    }
    if (activeLower.includes("night")) {
      if (docShiftsLower.some(s => s.includes("night"))) return true;
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
}): string {
  const { doctors, specialty, room } = params;

  if (doctors.length === 1) {
    const doc = doctors[0];
    const mentionTag = doc.waPhone ? `@${doc.waPhone}` : "";
    const phoneDisplay = doc.phone || "N/A";

    return (
      `🚨 *INPATIENT DOCTOR CALL* 🚨\n` +
      `👨‍⚕️ Dr. ${mentionTag} *${doc.name}*\n\n` +
      `📍 *Location:* Room *${room}*\n` +
      `🩺 *Specialty:* ${specialty}\n` +
      `📞 *Phone:* ${phoneDisplay}\n\n` +
      `⚡ _Please attend to the patient promptly._`
    );
  }

  // Multiple doctors on duty
  const mentionsLine = doctors.map(d => `Dr. ${d.waPhone ? `@${d.waPhone}` : ""} *${d.name}*`).join(" & ");
  const phonesLine = doctors.map(d => d.phone || "N/A").join(", ");

  return (
    `🚨 *INPATIENT DOCTOR CALL* 🚨\n` +
    `👨‍⚕️ ${mentionsLine}\n\n` +
    `📍 *Location:* Room *${room}*\n` +
    `🩺 *Specialty:* ${specialty}\n` +
    `📞 *Phones:* ${phonesLine}\n\n` +
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
// GREEN-API REST DISPATCH
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

  const url = `https://api.green-api.com/waInstance${idInstance}/sendMessage/${apiTokenInstance}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatId: params.chatId,
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

// =========================================================================
// PIPELINE WORKFLOW (WEBHOOK INGESTION & DISPATCH)
// =========================================================================

export async function processDoctorCallWebhook(params: {
  rawBody: any;
  getActiveCheckins: () => Promise<any[]>;
}): Promise<{
  handled: boolean;
  reason?: string;
  callRecord?: DoctorCallRecord;
}> {
  const { rawBody, getActiveCheckins } = params;

  if (!rawBody || typeof rawBody !== "object") {
    return { handled: false, reason: "Empty body" };
  }

  // 1. Extract message ID and text from Green-API webhook structure
  const idMessage = rawBody.idMessage || rawBody.messageData?.idMessage || "";
  if (idMessage && isDuplicateMessage(idMessage)) {
    return { handled: false, reason: "Duplicate message ID (already processed)" };
  }

  // Check source group if specified
  const monitoredGroup = process.env.WHATSAPP_CALLS_SOURCE_GROUP_ID?.trim();
  const senderChatId = rawBody.senderData?.chatId || rawBody.chatId || "";
  if (monitoredGroup && senderChatId && monitoredGroup !== senderChatId) {
    return { handled: false, reason: `Ignored message from chat ${senderChatId} (monitored: ${monitoredGroup})` };
  }

  // Extract raw text from Green-API variations
  const messageText =
    rawBody.messageData?.textMessageData?.textMessage ||
    rawBody.messageData?.extendedTextMessageData?.text ||
    rawBody.messageData?.text ||
    rawBody.message ||
    "";

  if (!messageText) {
    return { handled: false, reason: "No text content found in webhook" };
  }

  // 2. Parse DoctorCall format
  const parsed = parseDoctorCallMessage(messageText);
  if (!parsed) {
    return { handled: false, reason: "Message does not match DoctorCall category" };
  }

  // 3. Resolve active shift in Cairo
  const now = new Date();
  const activeShifts = getCairoActiveShifts(now);
  const cairoDate = getCairoDateString(now);

  console.log(`[DoctorCall] Received call for Room ${parsed.room}, Dept: "${parsed.departmentRaw}" -> "${parsed.canonicalDepartment}". Active Cairo Shifts: [${activeShifts.join(", ")}]`);

  // 4. Match checked-in doctors
  const allCheckins = await getActiveCheckins();
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

  const callId = `call_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
  let status: "dispatched" | "no_doctor_present" | "failed" = "no_doctor_present";

  // 5. If no doctors present: silent log on server without sending WhatsApp message
  if (matchingDoctors.length === 0) {
    console.warn(`[DoctorCall] ⚠️ No doctor checked in for department "${parsed.canonicalDepartment}" during active shifts [${activeShifts.join(", ")}]. Logged silently.`);
    status = "no_doctor_present";
  } else {
    // 6. Format alert and dispatch to target group
    const targetGroupId = process.env.WHATSAPP_DOCTORS_TARGET_GROUP_ID?.trim() || process.env.WHATSAPP_GROUP_ID?.trim();
    if (!targetGroupId) {
      console.error("[DoctorCall] Target WhatsApp group ID not configured.");
      status = "failed";
    } else {
      const alertText = formatDoctorCallAlert({
        doctors: matchingDoctors,
        specialty: parsed.canonicalDepartment,
        room: parsed.room
      });

      console.log(`[DoctorCall] Disagreeing alert to target group ${targetGroupId}:\n${alertText}`);
      const dispatchRes = await sendGreenApiTextMessage({
        chatId: targetGroupId,
        message: alertText
      });

      if (dispatchRes.success) {
        console.log(`[DoctorCall] ✅ Alert dispatched successfully (ID: ${dispatchRes.idMessage})`);
        status = "dispatched";
      } else {
        console.error(`[DoctorCall] ❌ Failed to dispatch alert: ${dispatchRes.error}`);
        status = "failed";
      }
    }
  }

  // 7. Save record
  const record: DoctorCallRecord = {
    id: callId,
    callDate: cairoDate,
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
    rawMessage: parsed.rawMessage
  };

  await saveDoctorCallRecord(record);
  return { handled: true, callRecord: record };
}

/**
 * Re-dispatches a call record manually from the admin panel
 */
export async function reDispatchDoctorCall(params: {
  callId: string;
  getActiveCheckins: () => Promise<any[]>;
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
  const allCheckins = await getActiveCheckins();
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

  if (matchingDoctors.length === 0) {
    target.status = "no_doctor_present";
    target.dispatchedDoctors = [];
    await saveDoctorCallRecord(target);
    return {
      success: false,
      message: `No doctor currently checked in for ${target.department} in active shifts [${activeShifts.join(", ")}].`,
      record: target
    };
  }

  const targetGroupId = process.env.WHATSAPP_DOCTORS_TARGET_GROUP_ID?.trim() || process.env.WHATSAPP_GROUP_ID?.trim();
  if (!targetGroupId) {
    return { success: false, message: "Target WhatsApp group ID is not configured." };
  }

  const alertText = formatDoctorCallAlert({
    doctors: matchingDoctors,
    specialty: target.department,
    room: target.room
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
