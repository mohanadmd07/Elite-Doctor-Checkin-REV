import dotenv from "dotenv";
dotenv.config();

import express from "express";
import compression from "compression";
import path from "path";
import fs from "fs";
import ExcelJS from "exceljs";
import { DOCTORS_DATABASE } from "./src/data/doctors.js";
import { COMPILED_DOCTORS } from "./src/data/compiledDoctors.js";
import { PRECOMPILED_CODE_PHONES, PRECOMPILED_NAME_PHONES } from "./src/data/compiledPhones.js";
import { getSupabase, getSupabaseConfig, fetchAllRowsFromSupabase, resetSupabaseClient } from "./src/db/supabase.js";

// Ensure local fallback data directory path is defined before boot calls
const DATA_DIR = process.env.VERCEL
  ? path.join("/tmp", "data")
  : path.join(process.cwd(), "data");

// Global Mobile Numbers lookup Maps populated from the Excel sheet
const mobileNumbersByCodeMap = new Map<string, string>();
const mobileNumbersByNameMap = new Map<string, string>();

// Fast indexed maps for O(1) doctor lookups and instant searching
let DOCTORS_BY_ID_MAP = new Map<string, any>();
let DOCTORS_BY_NAME_MAP = new Map<string, any>();
let PREINDEXED_SEARCH_DATABASE: {
  doc: any;
  normId: string;
  normName: string;
  normAra: string;
  normDept: string;
  normMob: string;
}[] = [];

function normalizeId(id: string): string {
  return (id || "").trim().toLowerCase().replace(/^emp\./, "").replace(/^emp/, "");
}

function normalizeName(name: string): string {
  return (name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeArabic(text: string): string {
  if (!text) return "";
  return text
    .trim()
    .toLowerCase()
    // Strip diacritics / Tashkeel
    .replace(/[\u064B-\u065F\u0670]/g, "")
    // Normalize Alefs
    .replace(/[أإآٱ]/g, "ا")
    // Normalize Teh Marbuta
    .replace(/ة/g, "ه")
    // Normalize Alef Maksura
    .replace(/ى/g, "ي")
    // Normalize Hamzas
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ء/g, "")
    // Replace multiple spaces
    .replace(/\s+/g, " ");
}

function getNameTokens(name: string): string[] {
  return (name || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF\s]/g, " ")
    .split(/\s+/)
    .filter(t => t.length > 1);
}

function areDoctorNamesSimilar(name1: string, name2: string): boolean {
  if (!name1 || !name2) return false;
  const n1 = normalizeName(name1);
  const n2 = normalizeName(name2);
  if (n1 === n2 || n1.includes(n2) || n2.includes(n1)) return true;

  const t1 = new Set(getNameTokens(name1));
  const t2 = new Set(getNameTokens(name2));
  let common = 0;
  for (const t of t1) {
    if (t2.has(t)) common++;
  }
  return common >= 2;
}

const COLLATERAL_CONFLICT_BARE_IDS = new Set([
  "238", "258", "272", "274", "277", "295", "3113", "347", "366", "404", "407", "410", "608", "616", "625"
]);

const CACHED_DELETED_KEYS = new Set<string>();
const COMPOSITE_TOMBSTONES_BY_ID = new Map<string, Set<string>>();

function updateCachedDeletedKeys(keys: Iterable<string>) {
  CACHED_DELETED_KEYS.clear();
  COMPOSITE_TOMBSTONES_BY_ID.clear();
  for (const rawKey of keys) {
    if (!rawKey) continue;
    const key = String(rawKey).trim();
    if (!key) continue;
    if (COLLATERAL_CONFLICT_BARE_IDS.has(key)) continue;

    CACHED_DELETED_KEYS.add(key);
    const normK = normalizeId(key);
    if (normK) CACHED_DELETED_KEYS.add(normK);

    if (key.includes("_")) {
      const [kId, ...rest] = key.split("_");
      const kName = rest.join("_").trim().toLowerCase();
      const normKId = normalizeId(kId);
      if (!COMPOSITE_TOMBSTONES_BY_ID.has(normKId)) COMPOSITE_TOMBSTONES_BY_ID.set(normKId, new Set());
      COMPOSITE_TOMBSTONES_BY_ID.get(normKId)!.add(kName);
      if (kId !== normKId) {
        if (!COMPOSITE_TOMBSTONES_BY_ID.has(kId)) COMPOSITE_TOMBSTONES_BY_ID.set(kId, new Set());
        COMPOSITE_TOMBSTONES_BY_ID.get(kId)!.add(kName);
      }
    }
  }
}

function isDoctorDeleted(cleanId: string, name: string, araName?: string): boolean {
  if (CACHED_DELETED_KEYS.size === 0) return false;

  const idKey = normalizeId(cleanId);
  const nameKey = normalizeName(name);
  const araKey = araName ? normalizeArabic(araName) : "";

  // 1. Direct composite match (ID + Name)
  if (idKey && nameKey && CACHED_DELETED_KEYS.has(`${idKey}_${nameKey}`)) return true;
  if (cleanId && nameKey && CACHED_DELETED_KEYS.has(`${cleanId}_${nameKey}`)) return true;
  if (idKey && araKey && CACHED_DELETED_KEYS.has(`${idKey}_${araKey}`)) return true;

  // 2. Direct full name match
  if (nameKey && CACHED_DELETED_KEYS.has(nameKey)) return true;
  if (araKey && CACHED_DELETED_KEYS.has(araKey)) return true;

  // 3. ID match with collateral conflict protection
  if ((idKey && CACHED_DELETED_KEYS.has(idKey)) || (cleanId && CACHED_DELETED_KEYS.has(cleanId))) {
    const compNames = COMPOSITE_TOMBSTONES_BY_ID.get(idKey) || COMPOSITE_TOMBSTONES_BY_ID.get(cleanId);
    if (compNames && compNames.size > 0) {
      let matchesTombstone = false;
      for (const compName of compNames) {
        if (compName === nameKey || (araKey && compName === araKey) || areDoctorNamesSimilar(name, compName)) {
          matchesTombstone = true;
          break;
        }
      }
      if (!matchesTombstone) {
        return false; // Protect active physician from collateral duplicate tombstone!
      }
    }
    return true;
  }

  return false;
}

function searchDoctors(query: string, maxResults = 20): any[] {
  const cleanQuery = query.trim().toLowerCase();
  if (!cleanQuery) return [];

  const normQuery = normalizeArabic(cleanQuery);
  const normIdQuery = normalizeId(cleanQuery);

  // Exact ID match check first (O(1))
  if (normIdQuery && DOCTORS_BY_ID_MAP.has(normIdQuery)) {
    const exact = DOCTORS_BY_ID_MAP.get(normIdQuery);
    if (exact && !isDoctorDeleted(exact.id, exact.name, exact.arabicName)) {
      const rest = PREINDEXED_SEARCH_DATABASE
        .filter(item => item.doc !== exact && !isDoctorDeleted(item.doc.id, item.doc.name, item.doc.arabicName) && matchesItemTerms(item, normQuery))
        .map(i => i.doc)
        .slice(0, maxResults - 1);
      return [exact, ...rest];
    }
  }

  const terms = normQuery.split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  const scored: { doc: any; score: number }[] = [];

  for (let i = 0; i < PREINDEXED_SEARCH_DATABASE.length; i++) {
    const item = PREINDEXED_SEARCH_DATABASE[i];
    if (isDoctorDeleted(item.doc.id, item.doc.name, item.doc.arabicName)) continue;
    let score = 0;

    // Direct ID score
    if (normIdQuery && item.normId === normIdQuery) {
      score += 1000;
    } else if (normIdQuery && item.normId.startsWith(normIdQuery)) {
      score += 500;
    } else if (normIdQuery && item.normId.includes(normIdQuery)) {
      score += 200;
    }

    // Name score
    if (item.normName === normQuery || item.normAra === normQuery) {
      score += 400;
    } else if (item.normName.startsWith(normQuery) || item.normAra.startsWith(normQuery)) {
      score += 300;
    }

    // Check term matches
    const matchesAllTerms = terms.every(term =>
      item.normId.includes(term) ||
      item.normName.includes(term) ||
      item.normAra.includes(term) ||
      item.normDept.includes(term) ||
      item.normMob.includes(term)
    );

    if (matchesAllTerms) {
      score += 100;
      scored.push({ doc: item.doc, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map(s => s.doc).slice(0, maxResults);
}

function matchesItemTerms(item: any, normQuery: string): boolean {
  const terms = normQuery.split(/\s+/).filter(Boolean);
  return terms.every(term =>
    item.normId.includes(term) ||
    item.normName.includes(term) ||
    item.normAra.includes(term) ||
    item.normDept.includes(term) ||
    item.normMob.includes(term)
  );
}

function matchesDoctor(doctor: any, query: string): boolean {
  const cleanQuery = query.trim().toLowerCase();
  if (!cleanQuery) return false;

  const normQuery = normalizeArabic(cleanQuery);
  const normIdQuery = normalizeId(cleanQuery);
  const terms = normQuery.split(/\s+/).filter(Boolean);
  if (terms.length === 0) return false;

  const normId = normalizeId(doctor.id).toLowerCase();
  const normName = normalizeName(doctor.name).toLowerCase();
  const normArabic = normalizeArabic(doctor.arabicName).toLowerCase();
  const normDept = (doctor.department || "").trim().toLowerCase();
  const normMob = (doctor.mobileNumber || "").trim().toLowerCase();

  if (normIdQuery && normId === normIdQuery) return true;

  return terms.every(term => {
    return (
      normId.includes(term) ||
      normName.includes(term) ||
      normArabic.includes(term) ||
      normDept.includes(term) ||
      normMob.includes(term)
    );
  });
}

function initPrecompiledPhones() {
  for (const [code, phone] of Object.entries(PRECOMPILED_CODE_PHONES)) {
    mobileNumbersByCodeMap.set(normalizeId(code), phone);
  }
  for (const [name, phone] of Object.entries(PRECOMPILED_NAME_PHONES)) {
    mobileNumbersByNameMap.set(normalizeName(name), phone);
  }
  console.log(`[Elite Server] Instantly mapped ${mobileNumbersByCodeMap.size} physician mobile numbers from pre-compiled cache.`);
}

// Department mapping utility
import { normalizeSpecialty, CANONICAL_SPECIALTIES } from "./src/data/specialties.js";

// Department mapping utility utilizing canonical 15-specialty hospital taxonomy
function normalizeDepartment(dept: string): string {
  const norm = normalizeSpecialty(dept);
  return norm.department;
}

let NORMALIZED_DOCTORS_DATABASE: any[] = [];

// Clean department utility from our check-in analysis
function cleanDepartment(dept: string): string {
  const norm = normalizeSpecialty(dept);
  return norm.department;
}

function compareDoctorIds(idA: string, idB: string): number {
  const cleanA = (idA || "").trim().replace(/^(emp\.|emp)/i, "");
  const cleanB = (idB || "").trim().replace(/^(emp\.|emp)/i, "");
  const numA = Number(cleanA);
  const numB = Number(cleanB);

  if (!isNaN(numA) && !isNaN(numB)) {
    return numA - numB;
  }
  if (!isNaN(numA)) return -1;
  if (!isNaN(numB)) return 1;
  return cleanA.localeCompare(cleanB, undefined, { numeric: true, sensitivity: "base" });
}

function indexDoctorsList(doctors: any[]) {
  DOCTORS_BY_ID_MAP.clear();
  DOCTORS_BY_NAME_MAP.clear();
  PREINDEXED_SEARCH_DATABASE = [];

  // Filter ONLY active doctors (exclude inactive or non-canonical departments, or deleted doctors)
  const activeOnly = doctors.filter(d => {
    if (d.isActive === false) return false;
    const cleanId = (d.id || "").toString().trim().replace(/^(emp\.|emp)/i, "");
    if (isDoctorDeleted(cleanId, d.name, d.arabicName)) return false;
    const norm = normalizeSpecialty(d.department || "");
    return norm.active;
  });

  NORMALIZED_DOCTORS_DATABASE = activeOnly.sort((a, b) => compareDoctorIds(a.id, b.id));

  for (let i = 0; i < NORMALIZED_DOCTORS_DATABASE.length; i++) {
    const d = NORMALIZED_DOCTORS_DATABASE[i];
    const normId = normalizeId(d.id);
    const normName = normalizeName(d.name);
    const normAra = normalizeArabic(d.arabicName || "");
    const normDept = (d.department || "").trim().toLowerCase();
    const normMob = (d.mobileNumber || "").trim();

    if (normId) {
      DOCTORS_BY_ID_MAP.set(normId, d);
      DOCTORS_BY_ID_MAP.set(d.id.trim().toLowerCase(), d);
    }
    if (normName) DOCTORS_BY_NAME_MAP.set(normName, d);
    if (normAra) DOCTORS_BY_NAME_MAP.set(normAra, d);

    PREINDEXED_SEARCH_DATABASE.push({
      doc: d,
      normId,
      normName,
      normAra,
      normDept,
      normMob
    });
  }
}

function sanitizeLingeringDeletedDoctors() {
  try {
    const rawDeletedList = readDeletedDoctorsLocal();
    // 1. Purge known collateral duplicate bare IDs that belong to active doctors
    const cleanedDeletedList = rawDeletedList.filter(k => !COLLATERAL_CONFLICT_BARE_IDS.has(k));
    if (cleanedDeletedList.length !== rawDeletedList.length) {
      console.log(`[Elite Server] Purged ${rawDeletedList.length - cleanedDeletedList.length} collateral bare ID tombstones.`);
      writeDeletedDoctorsLocal(cleanedDeletedList);
    }
    updateCachedDeletedKeys(cleanedDeletedList);

    const deletedKeys = new Set(cleanedDeletedList.map(k => normalizeId(k) || k));
    const localCustom = readCustomDoctorsLocal();
    const cleanedCustom = localCustom.filter(d => {
      const idKey = normalizeId(d.id);
      const origKey = normalizeId(d.originalId || "");
      const nameKey = normalizeName(d.name);
      if (idKey && nameKey && deletedKeys.has(`${idKey}_${nameKey}`)) return false;
      if (nameKey && deletedKeys.has(nameKey)) return false;
      if (deletedKeys.has(idKey) || deletedKeys.has(d.id.trim())) {
        const compTombstones = cleanedDeletedList.filter(k => k.startsWith(`${idKey}_`));
        if (compTombstones.length > 0) {
          const isDocTombstoned = compTombstones.some(ck => {
            const compName = ck.slice(idKey.length + 1);
            return compName === nameKey || areDoctorNamesSimilar(d.name, compName);
          });
          if (!isDocTombstoned) return true; // keep
        }
        return false;
      }
      if (origKey && deletedKeys.has(origKey)) return false;
      return true;
    });
    if (cleanedCustom.length !== localCustom.length) {
      console.log(`[Elite Server] Sanitized custom_doctors.json: removed ${localCustom.length - cleanedCustom.length} lingering deleted doctors.`);
      writeCustomDoctorsLocal(cleanedCustom);
    }
  } catch (err) {
    console.error("[Elite Server] Error sanitizing lingering deleted doctors:", err);
  }
}

// Immediately initialize the in-memory database with pre-compiled records (0ms startup)
initPrecompiledPhones();
updateCachedDeletedKeys(readDeletedDoctorsLocal());
sanitizeLingeringDeletedDoctors();
indexDoctorsList(COMPILED_DOCTORS);
console.log(`[Elite Server] Instantly initialized ${NORMALIZED_DOCTORS_DATABASE.length} doctors into memory on boot.`);

let doctorsRefreshPromise: Promise<void> | null = null;
let lastDoctorsRefreshTime = 0; // Set to 0 so the initial background delta sync runs immediately!
const DOCTORS_REFRESH_TTL = 60 * 1000; // 60-second in-memory TTL

async function loadEnrichedDoctorsDatabase(force = false): Promise<void> {
  const now = Date.now();
  if (!force && NORMALIZED_DOCTORS_DATABASE.length > 0 && (now - lastDoctorsRefreshTime < DOCTORS_REFRESH_TTL)) {
    return;
  }
  if (doctorsRefreshPromise) {
    return doctorsRefreshPromise;
  }

  doctorsRefreshPromise = (async () => {
    try {
      // Parallel delta fetch from Supabase (small delta tables: custom doctors, phones, deletions)
      const [deletedKeys, customPhones] = await Promise.all([
        loadDeletedDoctorsKeys(),
        loadCustomDoctorsPhones(),
      ]);
      updateCachedDeletedKeys(deletedKeys);
      const customDocs = await loadCustomDoctors(deletedKeys);

      const doctorMap = new Map<string, any>();

      // 1. Seed with base compiled doctors (Active canonical only)
      COMPILED_DOCTORS.forEach(doc => {
        const cleanId = doc.id.trim().replace(/^(emp\.|emp)/i, "");
        if (isDoctorDeleted(cleanId, doc.name, doc.arabicName)) return;
        const norm = normalizeSpecialty(doc.department || "");
        if (!norm.active) return; // Skip filtered out / inactive records
        const idKey = normalizeId(cleanId);
        const nameKey = normalizeName(doc.name);
        const mob = customPhones[idKey] || doc.mobileNumber || mobileNumbersByCodeMap.get(idKey) || mobileNumbersByNameMap.get(nameKey) || "";
        const mapKey = `${idKey}___${nameKey}`;
        doctorMap.set(mapKey, {
          ...doc,
          id: cleanId,
          department: norm.department,
          mobileNumber: mob,
          isActive: true,
        });
      });

      // 2. Safely sync active records from Supabase doctors table if available
      const supabase = getSupabase();
      if (supabase) {
        try {
          const supabaseDoctors = await fetchAllRowsFromSupabase("doctors", (q) => q.eq("is_active", true));
          if (supabaseDoctors && supabaseDoctors.length > 0) {
            for (const sDoc of supabaseDoctors) {
              const cleanId = sDoc.id.trim().replace(/^(emp\.|emp)/i, "");
              if (isDoctorDeleted(cleanId, sDoc.name, sDoc.arabic_name)) continue;
              const norm = normalizeSpecialty(sDoc.department || "");
              if (!norm.active) continue; // Skip non-canonical / inactive records
              const idKey = normalizeId(cleanId);
              const nameKey = normalizeName(sDoc.name);
              const mob = sDoc.mobile_number || customPhones[idKey] || mobileNumbersByCodeMap.get(idKey) || "";
              const mapKey = `${idKey}___${nameKey}`;
              doctorMap.set(mapKey, {
                id: cleanId,
                name: sDoc.name,
                arabicName: sDoc.arabic_name || sDoc.name,
                department: norm.department,
                mobileNumber: mob,
                isActive: true,
              });
            }
          }
        } catch (err) {
          console.error("[Supabase] Error delta-reading active doctors table:", err);
        }
      }

      // 3. Apply custom doctors overrides with strict duplicate & ghost eviction
      customDocs.forEach(cDoc => {
        const cleanId = cDoc.id.trim().replace(/^(emp\.|emp)/i, "");
        if (isDoctorDeleted(cleanId, cDoc.name, cDoc.arabicName)) return;
        const norm = normalizeSpecialty(cDoc.department || "");
        if (cDoc.isActive === false || !norm.active) return;
        const idKey = normalizeId(cleanId);
        const nameKey = normalizeName(cDoc.name);
        const origIdKey = cDoc.originalId ? normalizeId(cDoc.originalId) : "";
        const origNameKey = cDoc.originalName ? normalizeName(cDoc.originalName) : "";

        // Remove previous versions of this doctor from doctorMap so edits never duplicate or resurrect
        for (const [key, existing] of Array.from(doctorMap.entries())) {
          const exIdKey = normalizeId(existing.id);
          const exNameKey = normalizeName(existing.name);
          
          if (origIdKey && origNameKey && exIdKey === origIdKey && exNameKey === origNameKey) {
            doctorMap.delete(key);
            continue;
          }
          if (origIdKey && exIdKey === origIdKey && (!origNameKey || exNameKey === origNameKey || exNameKey === nameKey)) {
            doctorMap.delete(key);
            continue;
          }
          if (exIdKey === idKey && (exNameKey === nameKey || !cDoc.originalId)) {
            doctorMap.delete(key);
            continue;
          }
        }

        const mob = cDoc.mobileNumber || customPhones[idKey] || mobileNumbersByCodeMap.get(idKey) || "";
        const mapKey = `${idKey}___${nameKey}`;
        doctorMap.set(mapKey, {
          id: cleanId,
          name: cDoc.name,
          arabicName: cDoc.arabicName || cDoc.name,
          department: norm.department,
          mobileNumber: mob,
          isActive: true,
          originalId: cDoc.originalId || "",
          originalName: cDoc.originalName || "",
        });
      });

      // 4. Update global indexes in memory
      const updatedList = Array.from(doctorMap.values());
      indexDoctorsList(updatedList);
      lastDoctorsRefreshTime = Date.now();
      console.log(`[Elite Server] Delta-synced unified doctors database (${NORMALIZED_DOCTORS_DATABASE.length} physicians).`);
    } catch (err) {
      console.error("[Elite Server] Error in loadEnrichedDoctorsDatabase delta sync:", err);
    } finally {
      doctorsRefreshPromise = null;
    }
  })();

  return doctorsRefreshPromise;
}

// Interface definitions
interface CheckIn {
  id: string;
  doctorName: string;
  doctorArabicName: string;
  department: string;
  shifts: string[];
  timestamp: string;
  mobileNumber?: string;
}

function enrichCheckIn(c: CheckIn): CheckIn {
  if (!c) return c;
  const cleanId = (c.id || "").trim().replace(/^(emp\.|emp)/i, "");
  const idKey = normalizeId(cleanId);
  const nameKey = normalizeName(c.doctorName || "");

  // Look up doctor from authoritative memory index (O(1))
  const doc = (idKey ? DOCTORS_BY_ID_MAP.get(idKey) : null) ||
              (nameKey ? DOCTORS_BY_NAME_MAP.get(nameKey) : null) ||
              (cleanId ? DOCTORS_BY_ID_MAP.get(cleanId.toLowerCase()) : null);

  const hasArabicChars = (str?: string) => Boolean(str && /[\u0600-\u06FF]/.test(str));

  // 1. Resolve Arabic name:
  // If doctor in registry has authentic Arabic characters, and check-in's arabic name either lacks Arabic chars
  // or was just identical to English name, always prioritize the registry's authentic Arabic name!
  let resolvedArabicName = (c.doctorArabicName || "").trim();
  if (doc?.arabicName && hasArabicChars(doc.arabicName)) {
    if (!hasArabicChars(resolvedArabicName) || resolvedArabicName.toLowerCase() === (c.doctorName || "").toLowerCase()) {
      resolvedArabicName = doc.arabicName;
    }
  } else if (!resolvedArabicName && doc?.arabicName) {
    resolvedArabicName = doc.arabicName;
  }

  // 2. Resolve Mobile phone number:
  let resolvedMobile = (c.mobileNumber || "").trim();
  if (!resolvedMobile || resolvedMobile === "N/A" || resolvedMobile === "undefined") {
    resolvedMobile = (doc?.mobileNumber || "").trim() ||
                     (idKey ? (mobileNumbersByCodeMap.get(idKey) || "").trim() : "") ||
                     (nameKey ? (mobileNumbersByNameMap.get(nameKey) || "").trim() : "") ||
                     "";
  }

  // 3. Resolve Specialty / Department
  const resolvedDept = doc?.department ? normalizeSpecialty(doc.department).department : normalizeSpecialty(c.department || "").department;

  return {
    ...c,
    id: cleanId || c.id,
    doctorName: doc?.name || c.doctorName,
    doctorArabicName: resolvedArabicName || c.doctorArabicName,
    department: resolvedDept,
    mobileNumber: resolvedMobile || ""
  };
}

const app = express();
const PORT = 3000;

app.use(compression());
app.use(express.json());

// Local fallback data files
const CHECKINS_FILE = path.join(DATA_DIR, "checkins.json");

function ensureLocalData() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(CHECKINS_FILE)) {
    fs.writeFileSync(CHECKINS_FILE, JSON.stringify([], null, 2), "utf-8");
  }
}

function readCheckInsLocal(): CheckIn[] {
  try {
    ensureLocalData();
    if (fs.existsSync(CHECKINS_FILE)) {
      const data = fs.readFileSync(CHECKINS_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Error reading local checkins file:", error);
  }
  return [];
}

function writeCheckInsLocal(checkins: CheckIn[]) {
  try {
    ensureLocalData();
    fs.writeFileSync(CHECKINS_FILE, JSON.stringify(checkins, null, 2), "utf-8");
  } catch (error) {
    console.error("Error writing local checkins file:", error);
  }
}

function getEgyptParts(timestampStr: string) {
  const d = new Date(timestampStr);
  if (isNaN(d.getTime())) {
    throw new Error("Invalid date");
  }
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false
  });
  const parts = formatter.formatToParts(d);
  const year = parseInt(parts.find(p => p.type === "year")?.value || "0", 10);
  const month = parseInt(parts.find(p => p.type === "month")?.value || "0", 10);
  const day = parseInt(parts.find(p => p.type === "day")?.value || "0", 10);
  const hour = parseInt(parts.find(p => p.type === "hour")?.value || "0", 10);
  const minute = parseInt(parts.find(p => p.type === "minute")?.value || "0", 10);
  const second = parseInt(parts.find(p => p.type === "second")?.value || "0", 10);
  return { year, month, day, hour, minute, second };
}

function getEgyptDateStr(timestampStr: string): string {
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
      return new Date(timestampStr).toISOString().split('T')[0];
    } catch (e) {
      return new Date().toISOString().split('T')[0];
    }
  }
}

function getEgyptResetTime(timestampStr: string): Date {
  try {
    const targetDateStr = getEgyptDateStr(timestampStr);
    const [yearStr, monthStr, dayStr] = targetDateStr.split("-");
    const utcYear = parseInt(yearStr, 10);
    const utcMonth = parseInt(monthStr, 10) - 1;
    const utcDay = parseInt(dayStr, 10);

    const checkinDate = new Date(timestampStr);
    const tzString = checkinDate.toLocaleString("en-US", { timeZone: "Africa/Cairo", timeZoneName: "longOffset" });
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
    return new Date(localResetUTC - (offsetMinutes * 60 * 1000));
  } catch (err) {
    console.error("Error in getEgyptResetTime, falling back:", err);
    const d = new Date();
    d.setUTCHours(18, 30, 0, 0);
    return d;
  }
}

async function cleanupExpiredCheckIns(): Promise<void> {
  try {
    const list = await readCheckInsRaw();
    const now = new Date();
    const expiredCheckins: CheckIn[] = [];
    
    for (const c of list) {
      const resetTime = getEgyptResetTime(c.timestamp);
      if (now >= resetTime) {
        expiredCheckins.push(c);
      }
    }
    
    if (expiredCheckins.length > 0) {
      console.log(`[Elite Server] Auto-resetting ${expiredCheckins.length} expired daily check-ins at 6:30 PM Egypt Time:`, expiredCheckins.map(c => c.id));
      await Promise.all(
        expiredCheckins.map(async (c) => {
          try {
            // Make sure it is included in the weekly sheet before deleting
            await addWeeklyCheckIn(c);
            await deleteCheckIn(c.id);
          } catch (err) {
            console.error(`[Elite Server] Failed to archive and clear expired check-in ${c.id}:`, err);
          }
        })
      );
    }
  } catch (err) {
    console.error("Error in cleanupExpiredCheckIns:", err);
  }
}

let checkinsCache: CheckIn[] | null = null;
let lastCheckinsFetchTime = 0;
const CHECKINS_CACHE_TTL = 2500; // 2.5 seconds cache

function invalidateCheckinsCache() {
  checkinsCache = null;
  lastCheckinsFetchTime = 0;
}

// Low-level read check-ins helper that queries Supabase directly first, with local backup sync
async function readCheckInsRaw(): Promise<CheckIn[]> {
  const now = Date.now();
  if (checkinsCache && (now - lastCheckinsFetchTime < CHECKINS_CACHE_TTL)) {
    return checkinsCache;
  }

  const supabase = getSupabase();
  if (supabase) {
    try {
      // Direct single query with limit 200 (sub-100ms response vs pagination)
      const { data, error } = await supabase
        .from("checkins")
        .select("*")
        .order("checkin_timestamp", { ascending: false })
        .limit(200);

      if (!error && Array.isArray(data)) {
        const mapped: CheckIn[] = data.map((row: any) => ({
          id: row.doctor_id,
          doctorName: row.doctor_name,
          doctorArabicName: row.doctor_arabic_name || row.doctor_name,
          department: row.department,
          shifts: Array.isArray(row.shifts) ? row.shifts : [],
          timestamp: row.checkin_timestamp,
          mobileNumber: row.mobile_number || "",
        }));
        writeCheckInsLocal(mapped);
        checkinsCache = mapped;
        lastCheckinsFetchTime = Date.now();
        return mapped;
      }
    } catch (err: any) {
      console.error("[Supabase] readCheckInsRaw failed, falling back to local:", err);
    }
  }
  const local = readCheckInsLocal();
  checkinsCache = local;
  lastCheckinsFetchTime = Date.now();
  return local;
}

// Fetch all checkins (asynchronous cloud/local) with auto-reset filter for 6:30 PM Egypt Time
async function readCheckIns(): Promise<CheckIn[]> {
  const list = await readCheckInsRaw();
  const now = new Date();

  // Filter out any expired check-ins based on 6:30 PM Egypt Time reset rule
  const validList = list.filter(c => {
    try {
      const resetTime = getEgyptResetTime(c.timestamp);
      return now < resetTime;
    } catch (e) {
      return true; // Keep if there's an error parsing
    }
  });

  // If there are expired ones, clean them up in the background
  if (validList.length < list.length) {
    const expiredList = list.filter(c => {
      try {
        const resetTime = getEgyptResetTime(c.timestamp);
        return now >= resetTime;
      } catch (e) {
        return false;
      }
    });
    // Trigger async deletion
    Promise.all(expiredList.map(c => deleteCheckIn(c.id))).catch(err => {
      console.error("Async delete expired check-ins failed:", err);
    });
  }

  // Always return normalized department names and map details for the canonical physicians
  return validList
    .map(c => {
      let id = c.id.replace(/^(emp\.|emp)/i, "");
      let dept = c.department;
      
      if (c.doctorName === "Amr Mohamed Sabry" || id === "201") {
        id = "201";
        dept = "Physical Medicine";
      } else if (c.doctorName === "Beshoy Nagy Farag Gerges" || id === "2310") {
        dept = "Physical Medicine";
      } else if (c.doctorName === "Omar Ahmed Osama Ebrahim" || id === "2120") {
        dept = "Internal Medicine";
      } else if (c.doctorName === "Abdelrahman Mahmoud Bassyoni Mohamed" || id === "2956") {
        dept = "Radiology";
      } else if (c.doctorName === "kareem Mohamed Abdelkader Mohamed" || id === "347") {
        dept = "Radiology";
      } else if (c.doctorName === "Moustafa Mohamed Mahmoud AbdelMagid" || id === "3365") {
        dept = "Pediatrics";
      } else if (c.doctorName === "Amany Mansour Elsayed Mohamed" || id === "724") {
        dept = "Nephrology";
      }

      const idKey = normalizeId(id);
      const nameKey = normalizeName(c.doctorName);
      const mobileNumber = c.mobileNumber || mobileNumbersByCodeMap.get(idKey) || mobileNumbersByNameMap.get(nameKey) || "";

      return {
        ...c,
        id,
        department: normalizeDepartment(dept),
        mobileNumber
      };
    })
    .filter(c => c.id.toLowerCase().trim() !== "emp");
}

// Custom Doctors Phones local storage and Supabase persistence helpers
const CUSTOM_DOCTORS_PHONES_FILE = path.join(DATA_DIR, "custom_doctors_phones.json");

function ensureCustomPhonesLocal() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(CUSTOM_DOCTORS_PHONES_FILE)) {
    fs.writeFileSync(CUSTOM_DOCTORS_PHONES_FILE, JSON.stringify({}, null, 2), "utf-8");
  }
}

function readCustomPhonesLocal(): Record<string, string> {
  try {
    ensureCustomPhonesLocal();
    if (fs.existsSync(CUSTOM_DOCTORS_PHONES_FILE)) {
      const data = fs.readFileSync(CUSTOM_DOCTORS_PHONES_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Error reading local custom phones file:", error);
  }
  return {};
}

function writeCustomPhonesLocal(phones: Record<string, string>) {
  try {
    ensureCustomPhonesLocal();
    fs.writeFileSync(CUSTOM_DOCTORS_PHONES_FILE, JSON.stringify(phones, null, 2), "utf-8");
  } catch (error) {
    console.error("Error writing local custom phones file:", error);
  }
}

async function loadCustomDoctorsPhones(): Promise<Record<string, string>> {
  const phones = readCustomPhonesLocal();
  const supabase = getSupabase();
  if (supabase) {
    try {
      const data = await fetchAllRowsFromSupabase("custom_doctor_phones");
      if (data && data.length > 0) {
        data.forEach((row: any) => {
          if (row.id && row.mobile_number) {
            phones[normalizeId(row.id)] = row.mobile_number;
          }
        });
        writeCustomPhonesLocal(phones);
      }
    } catch (err: any) {
      console.error("[Supabase] loadCustomDoctorsPhones failed, using local fallback:", err);
    }
  }
  return phones;
}

async function saveCustomDoctorPhone(id: string, mobileNumber: string): Promise<void> {
  const cleanId = id.trim().replace(/^(emp\.|emp)/i, "");
  const idKey = normalizeId(cleanId);
  const nameKey = normalizeName(cleanId);
  
  // Update global lookup maps
  mobileNumbersByCodeMap.set(idKey, mobileNumber);
  
  // Update NORMALIZED_DOCTORS_DATABASE in memory
  const docInDb = NORMALIZED_DOCTORS_DATABASE.find(d => normalizeId(d.id) === idKey || normalizeName(d.name) === nameKey);
  if (docInDb) {
    docInDb.mobileNumber = mobileNumber;
  }

  // Update local file
  const localPhones = readCustomPhonesLocal();
  localPhones[idKey] = mobileNumber;
  writeCustomPhonesLocal(localPhones);

  // Update Supabase immediately with cascading updates
  const supabase = getSupabase();
  if (supabase) {
    try {
      await Promise.all([
        supabase.from("custom_doctor_phones").upsert({
          id: cleanId,
          mobile_number: mobileNumber,
          updated_at: new Date().toISOString(),
        }, { onConflict: "id" }),
        supabase.from("doctors").update({ mobile_number: mobileNumber, updated_at: new Date().toISOString() }).eq("id", cleanId),
        supabase.from("checkins").update({ mobile_number: mobileNumber }).or(`doctor_id.eq.${cleanId},doctor_id.eq.${id}`),
        supabase.from("monthly_checkins").update({ mobile_number: mobileNumber }).or(`doctor_id.eq.${cleanId},doctor_id.eq.${id}`)
      ]);
    } catch (err) {
      console.error("[Supabase] saveCustomDoctorPhone failed:", err);
    }
  }

  // Update in-memory daily check-in phone if active
  const dailyCheckins = readCheckInsLocal();
  let dailyPhoneChanged = false;
  for (const c of dailyCheckins) {
    if (normalizeId(c.id) === idKey || (nameKey && normalizeName(c.doctorName) === nameKey)) {
      c.mobileNumber = mobileNumber;
      dailyPhoneChanged = true;
    }
  }
  if (dailyPhoneChanged) writeCheckInsLocal(dailyCheckins);

  // Update in-memory and local monthly check-in phone
  const monthlyCheckins = readMonthlyCheckInsLocal();
  let monthlyPhoneChanged = false;
  for (const c of monthlyCheckins) {
    if (normalizeId(c.id) === idKey || (nameKey && normalizeName(c.doctorName) === nameKey)) {
      c.mobileNumber = mobileNumber;
      monthlyPhoneChanged = true;
    }
  }
  if (monthlyPhoneChanged) writeMonthlyCheckInsLocal(monthlyCheckins);

  // Update custom_doctors.json so persistent custom doctor store stays in sync
  const localCustom = readCustomDoctorsLocal();
  const targetDoc = localCustom.find(d => normalizeId(d.id) === idKey || (nameKey && normalizeName(d.name) === nameKey));
  if (targetDoc) {
    targetDoc.mobileNumber = mobileNumber;
    writeCustomDoctorsLocal(localCustom);
  }

  // Invalidate in-memory caches immediately
  invalidateCheckinsCache();
  invalidateMonthlyCache();
  lastDoctorsRefreshTime = 0;
  doctorsRefreshPromise = null;

  // Re-synchronize the unified doctors database with force=true
  await loadEnrichedDoctorsDatabase(true);
}

// Custom Doctors persistent store helpers
const CUSTOM_DOCTORS_FILE = path.join(DATA_DIR, "custom_doctors.json");
const DELETED_DOCTORS_FILE = path.join(DATA_DIR, "deleted_doctors.json");

interface CustomDoctorRecord {
  id: string;
  name: string;
  arabicName: string;
  department: string;
  mobileNumber: string;
  originalId?: string;
  originalName?: string;
  updatedAt?: string;
  isActive?: boolean;
}

function ensureCustomDoctorsLocal() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(CUSTOM_DOCTORS_FILE)) {
    fs.writeFileSync(CUSTOM_DOCTORS_FILE, JSON.stringify([], null, 2), "utf-8");
  }
}

function ensureDeletedDoctorsLocal() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DELETED_DOCTORS_FILE)) {
    fs.writeFileSync(DELETED_DOCTORS_FILE, JSON.stringify([], null, 2), "utf-8");
  }
}

function readCustomDoctorsLocal(): CustomDoctorRecord[] {
  try {
    ensureCustomDoctorsLocal();
    if (fs.existsSync(CUSTOM_DOCTORS_FILE)) {
      const data = fs.readFileSync(CUSTOM_DOCTORS_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Error reading local custom doctors file:", error);
  }
  return [];
}

function writeCustomDoctorsLocal(doctors: CustomDoctorRecord[]) {
  try {
    ensureCustomDoctorsLocal();
    fs.writeFileSync(CUSTOM_DOCTORS_FILE, JSON.stringify(doctors, null, 2), "utf-8");
  } catch (error) {
    console.error("Error writing local custom doctors file:", error);
  }
}

function readDeletedDoctorsLocal(): string[] {
  try {
    ensureDeletedDoctorsLocal();
    if (fs.existsSync(DELETED_DOCTORS_FILE)) {
      const data = fs.readFileSync(DELETED_DOCTORS_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Error reading local deleted doctors file:", error);
  }
  return [];
}

function writeDeletedDoctorsLocal(list: string[]) {
  try {
    ensureDeletedDoctorsLocal();
    fs.writeFileSync(DELETED_DOCTORS_FILE, JSON.stringify(list, null, 2), "utf-8");
  } catch (error) {
    console.error("Error writing local deleted doctors file:", error);
  }
}

async function loadDeletedDoctorsKeys(): Promise<Set<string>> {
  const keysSet = new Set<string>();
  const localList = readDeletedDoctorsLocal();
  localList.forEach((k) => {
    if (!COLLATERAL_CONFLICT_BARE_IDS.has(k)) keysSet.add(k);
  });

  const supabase = getSupabase();
  if (supabase) {
    try {
      const data = await fetchAllRowsFromSupabase("deleted_doctors");
      if (data && data.length > 0) {
        const collateralToPurge: string[] = [];
        data.forEach((row: any) => {
          if (row.id) {
            if (COLLATERAL_CONFLICT_BARE_IDS.has(row.id)) {
              collateralToPurge.push(row.id);
            } else {
              keysSet.add(row.id);
            }
          }
        });
        if (collateralToPurge.length > 0) {
          console.log(`[Supabase] Purging ${collateralToPurge.length} collateral bare ID tombstones from deleted_doctors.`);
          await supabase.from("deleted_doctors").delete().in("id", collateralToPurge);
          await supabase.from("doctors").update({ is_active: true, updated_at: new Date().toISOString() }).in("id", collateralToPurge);
        }
        writeDeletedDoctorsLocal(Array.from(keysSet));
      }
    } catch (err: any) {
      console.error("[Supabase] loadDeletedDoctorsKeys failed:", err);
    }
  }
  updateCachedDeletedKeys(keysSet);
  return keysSet;
}

async function markDoctorAsDeleted(id: string, name?: string) {
  const cleanId = id.trim().replace(/^(emp\.|emp)/i, "");
  const idKey = normalizeId(cleanId);
  const nameKey = name ? normalizeName(name) : "";

  const keysToAdd = new Set<string>();
  if (nameKey) keysToAdd.add(nameKey);
  if (idKey && nameKey) keysToAdd.add(`${idKey}_${nameKey}`);
  if (cleanId && nameKey) keysToAdd.add(`${cleanId}_${nameKey}`);

  // Only add bare ID tombstone if NO OTHER active doctor in the system has a different name
  const otherDoctorsShareId = NORMALIZED_DOCTORS_DATABASE.some(d => {
    const dIdKey = normalizeId(d.id);
    const dNameKey = normalizeName(d.name);
    return (dIdKey === idKey || d.id === cleanId) && nameKey && dNameKey !== nameKey;
  });

  if (!otherDoctorsShareId) {
    if (cleanId) keysToAdd.add(cleanId);
    if (idKey) keysToAdd.add(idKey);
  }

  const localList = readDeletedDoctorsLocal();
  const updatedSet = new Set([...localList, ...Array.from(keysToAdd)]);
  writeDeletedDoctorsLocal(Array.from(updatedSet));
  updateCachedDeletedKeys(updatedSet);

  const supabase = getSupabase();
  if (supabase) {
    try {
      const payload = Array.from(keysToAdd).map(k => ({ id: k, deleted_at: new Date().toISOString() }));
      const { error: delErr } = await supabase.from("deleted_doctors").upsert(payload, { onConflict: "id" });
      if (delErr) console.error("[Supabase] deleted_doctors upsert error:", delErr.message);

      if (cleanId && !otherDoctorsShareId) {
        const { error: docErr } = await supabase.from("doctors").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", cleanId);
        if (docErr) console.error("[Supabase] doctors deactivation error:", docErr.message);
      }
    } catch (err) {
      console.error("[Supabase] markDoctorAsDeleted failed:", err);
    }
  }
}

async function unmarkDoctorAsDeleted(id: string, name?: string) {
  const cleanId = id.trim().replace(/^(emp\.|emp)/i, "");
  const idKey = normalizeId(cleanId);
  const nameKey = name ? normalizeName(name) : "";

  const keysToRemove = new Set<string>();
  if (cleanId) keysToRemove.add(cleanId);
  if (idKey) keysToRemove.add(idKey);
  if (nameKey) keysToRemove.add(nameKey);
  if (idKey && nameKey) keysToRemove.add(`${idKey}_${nameKey}`);
  if (cleanId && nameKey) keysToRemove.add(`${cleanId}_${nameKey}`);

  const localList = readDeletedDoctorsLocal();
  const updatedList = localList.filter((k) => !keysToRemove.has(k));
  writeDeletedDoctorsLocal(updatedList);
  updateCachedDeletedKeys(updatedList);

  const supabase = getSupabase();
  if (supabase) {
    try {
      const keysArray = Array.from(keysToRemove);
      if (keysArray.length > 0) {
        const { error: delErr } = await supabase.from("deleted_doctors").delete().in("id", keysArray);
        if (delErr) console.error("[Supabase] deleted_doctors delete error:", delErr.message);
      }
      if (cleanId) {
        const { error: docErr } = await supabase.from("doctors").update({ is_active: true, updated_at: new Date().toISOString() }).eq("id", cleanId);
        if (docErr) console.error("[Supabase] doctors reactivate error:", docErr.message);
      }
    } catch (err) {
      console.error("[Supabase] unmarkDoctorAsDeleted failed:", err);
    }
  }
}

async function loadCustomDoctors(deletedKeysArg?: Set<string>): Promise<CustomDoctorRecord[]> {
  const deletedKeys = deletedKeysArg || (await loadDeletedDoctorsKeys());
  const doctorsMap = new Map<string, CustomDoctorRecord>();
  const localList = readCustomDoctorsLocal();

  const isDoctorTombstoned = (id: string, name: string) => {
    const cleanId = (id || "").trim().replace(/^(emp\.|emp)/i, "");
    const idKey = normalizeId(cleanId);
    const nameKey = normalizeName(name);
    if (idKey && deletedKeys.has(idKey)) return true;
    if (cleanId && deletedKeys.has(cleanId)) return true;
    if (nameKey && deletedKeys.has(nameKey)) return true;
    if (idKey && nameKey && deletedKeys.has(`${idKey}_${nameKey}`)) return true;
    return false;
  };

  localList.forEach((d) => {
    if (isDoctorTombstoned(d.id, d.name) || (d.originalId && isDoctorTombstoned(d.originalId, d.name))) {
      return;
    }
    const key = normalizeId(d.id) || normalizeName(d.name);
    if (key) doctorsMap.set(key, d);
  });

  const supabase = getSupabase();
  if (supabase) {
    try {
      const data = await fetchAllRowsFromSupabase("custom_doctors");
      if (data && data.length > 0) {
        const idsToDeleteFromSupabase: string[] = [];
        data.forEach((row: any) => {
          const docRec: CustomDoctorRecord = {
            id: row.id,
            name: row.name,
            arabicName: row.arabic_name || row.name,
            department: row.department || "General",
            mobileNumber: row.mobile_number || "",
            originalId: row.original_id || "",
            updatedAt: row.updated_at || new Date().toISOString(),
          };
          if (isDoctorTombstoned(docRec.id, docRec.name) || (docRec.originalId && isDoctorTombstoned(docRec.originalId, docRec.name))) {
            idsToDeleteFromSupabase.push(row.id);
            return;
          }
          const key = normalizeId(docRec.id) || normalizeName(docRec.name);
          if (key) doctorsMap.set(key, docRec);
        });
        if (idsToDeleteFromSupabase.length > 0) {
          await supabase.from("custom_doctors").delete().in("id", idsToDeleteFromSupabase);
        }
      }
    } catch (err: any) {
      console.error("[Supabase] loadCustomDoctors failed, using local fallback:", err);
    }
  }

  const validCustomDocs = Array.from(doctorsMap.values());
  writeCustomDoctorsLocal(validCustomDocs);
  return validCustomDocs;
}

async function saveCustomDoctorRecord(docRecord: CustomDoctorRecord): Promise<void> {
  const cleanId = docRecord.id.trim().replace(/^(emp\.|emp)/i, "");
  const idKey = normalizeId(cleanId);
  const nameKey = normalizeName(docRecord.name);
  const origCleanId = docRecord.originalId ? docRecord.originalId.trim().replace(/^(emp\.|emp)/i, "") : "";
  const origKey = origCleanId ? normalizeId(origCleanId) : "";
  const origName = docRecord.originalName ? docRecord.originalName.trim() : "";
  const origNameKey = origName ? normalizeName(origName) : "";

  // 1. If this is an edit of an existing doctor and either ID or name changed, tombstone the old entry
  if (origCleanId && (origKey !== idKey || (origNameKey && origNameKey !== nameKey))) {
    await markDoctorAsDeleted(origCleanId, origName || undefined);
  }

  // 2. Unmark any previous deletion tombstones for this doctor or ID
  await unmarkDoctorAsDeleted(cleanId, docRecord.name);
  if (origCleanId && origKey === idKey) {
    await unmarkDoctorAsDeleted(origCleanId, docRecord.name);
  }

  // Ensure department is strictly a valid canonical specialty for database constraint safety
  const normDept = normalizeSpecialty(docRecord.department);
  let canonicalDepartment = normDept.department;
  if (!CANONICAL_SPECIALTIES.includes(canonicalDepartment as any)) {
    canonicalDepartment = "General Surgery";
  }

  const recordToSave: CustomDoctorRecord = {
    id: cleanId,
    name: docRecord.name.trim(),
    arabicName: docRecord.arabicName.trim() || docRecord.name.trim(),
    department: canonicalDepartment,
    mobileNumber: docRecord.mobileNumber ? docRecord.mobileNumber.trim() : "",
    originalId: origCleanId || "",
    originalName: origName || "",
    updatedAt: new Date().toISOString()
  };

  // 3. Update in-memory database targeting the exact record being edited
  let existingIndex = NORMALIZED_DOCTORS_DATABASE.findIndex(
    d => (origKey && normalizeId(d.id) === origKey && (!origNameKey || normalizeName(d.name) === origNameKey)) ||
         (origKey && normalizeId(d.id) === origKey) ||
         (idKey && normalizeId(d.id) === idKey && (!origNameKey || normalizeName(d.name) === nameKey)) ||
         (idKey && normalizeId(d.id) === idKey)
  );

  if (existingIndex !== -1) {
    NORMALIZED_DOCTORS_DATABASE[existingIndex] = {
      ...NORMALIZED_DOCTORS_DATABASE[existingIndex],
      id: cleanId,
      name: recordToSave.name,
      arabicName: recordToSave.arabicName,
      department: recordToSave.department,
      mobileNumber: recordToSave.mobileNumber
    };
  } else {
    NORMALIZED_DOCTORS_DATABASE.push({
      id: cleanId,
      name: recordToSave.name,
      arabicName: recordToSave.arabicName,
      department: recordToSave.department,
      mobileNumber: recordToSave.mobileNumber
    });
  }

  indexDoctorsList(NORMALIZED_DOCTORS_DATABASE);

  // Update lookup maps
  if (idKey) mobileNumbersByCodeMap.set(idKey, recordToSave.mobileNumber);
  if (nameKey) mobileNumbersByNameMap.set(nameKey, recordToSave.mobileNumber);
  if (origKey && origKey !== idKey) {
    mobileNumbersByCodeMap.delete(origKey);
  }
  if (origNameKey && origNameKey !== nameKey) {
    mobileNumbersByNameMap.delete(origNameKey);
  }

  // Also sync to custom_doctors_phones.json immediately
  const localPhones = readCustomPhonesLocal();
  if (recordToSave.mobileNumber) {
    localPhones[idKey] = recordToSave.mobileNumber;
    localPhones[cleanId] = recordToSave.mobileNumber;
  } else {
    delete localPhones[idKey];
    delete localPhones[cleanId];
  }
  if (origKey && origKey !== idKey) {
    delete localPhones[origKey];
    delete localPhones[origCleanId];
  }
  writeCustomPhonesLocal(localPhones);

  // 4. Update local custom doctors list
  const localList = readCustomDoctorsLocal();
  const existingLocalIdx = localList.findIndex(
    d => (origKey && normalizeId(d.id) === origKey && (!origNameKey || normalizeName(d.name) === origNameKey)) ||
         (origKey && normalizeId(d.id) === origKey) ||
         (idKey && normalizeId(d.id) === idKey)
  );

  if (existingLocalIdx !== -1) {
    localList[existingLocalIdx] = recordToSave;
  } else {
    localList.push(recordToSave);
  }
  writeCustomDoctorsLocal(localList);

  // 5. Atomic write to Supabase
  const supabase = getSupabase();
  if (supabase) {
    try {
      const operations: PromiseLike<any>[] = [];
      if (origCleanId && origKey !== idKey) {
        operations.push(supabase.from("custom_doctors").delete().eq("id", origCleanId));
        operations.push(supabase.from("doctors").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", origCleanId));
        operations.push(supabase.from("custom_doctor_phones").delete().eq("id", origCleanId));
      }

      // Upsert to custom_doctors
      operations.push(supabase.from("custom_doctors").upsert({
        id: recordToSave.id,
        name: recordToSave.name,
        arabic_name: recordToSave.arabicName,
        department: recordToSave.department,
        mobile_number: recordToSave.mobileNumber,
        original_id: recordToSave.originalId || "",
        updated_at: recordToSave.updatedAt || new Date().toISOString(),
      }, { onConflict: "id" }));

      // Upsert to doctors
      operations.push(supabase.from("doctors").upsert({
        id: recordToSave.id,
        name: recordToSave.name,
        arabic_name: recordToSave.arabicName,
        department: recordToSave.department,
        mobile_number: recordToSave.mobileNumber,
        is_active: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" }));

      // Upsert or delete custom_doctor_phones
      if (recordToSave.mobileNumber) {
        operations.push(supabase.from("custom_doctor_phones").upsert({
          id: cleanId,
          mobile_number: recordToSave.mobileNumber,
          updated_at: new Date().toISOString(),
        }, { onConflict: "id" }));
      } else {
        operations.push(supabase.from("custom_doctor_phones").delete().eq("id", cleanId));
      }

      // Cascade update checkins and monthly_checkins
      operations.push(supabase.from("checkins").update({
        doctor_name: recordToSave.name,
        doctor_arabic_name: recordToSave.arabicName,
        department: recordToSave.department,
        mobile_number: recordToSave.mobileNumber,
      }).or(`doctor_id.eq.${cleanId}${origCleanId ? `,doctor_id.eq.${origCleanId}` : ""}`));

      operations.push(supabase.from("monthly_checkins").update({
        doctor_name: recordToSave.name,
        doctor_arabic_name: recordToSave.arabicName,
        department: recordToSave.department,
        mobile_number: recordToSave.mobileNumber,
      }).or(`doctor_id.eq.${cleanId}${origCleanId ? `,doctor_id.eq.${origCleanId}` : ""}`));

      const results = await Promise.all(operations);
      for (const res of results) {
        if (res?.error) {
          console.error("[Supabase save error]:", res.error.message);
        }
      }
    } catch (err) {
      console.error("[Supabase] saveCustomDoctorRecord failed:", err);
    }
  }

  // 6. Cascade update in-memory daily and monthly check-ins
  const dailyCheckins = readCheckInsLocal();
  let dailyChanged = false;
  for (const c of dailyCheckins) {
    const idMatch = normalizeId(c.id) === idKey || (origKey && normalizeId(c.id) === origKey);
    const nameMatch = (nameKey && normalizeName(c.doctorName) === nameKey) || (origNameKey && normalizeName(c.doctorName) === origNameKey);
    if (idMatch || nameMatch) {
      c.id = cleanId;
      c.doctorName = recordToSave.name;
      c.doctorArabicName = recordToSave.arabicName;
      c.department = recordToSave.department;
      c.mobileNumber = recordToSave.mobileNumber;
      dailyChanged = true;
    }
  }
  if (dailyChanged) writeCheckInsLocal(dailyCheckins);

  const monthlyCheckins = readMonthlyCheckInsLocal();
  let monthlyChanged = false;
  for (const c of monthlyCheckins) {
    const idMatch = normalizeId(c.id) === idKey || (origKey && normalizeId(c.id) === origKey);
    const nameMatch = (nameKey && normalizeName(c.doctorName) === nameKey) || (origNameKey && normalizeName(c.doctorName) === origNameKey);
    if (idMatch || nameMatch) {
      c.id = cleanId;
      c.doctorName = recordToSave.name;
      c.doctorArabicName = recordToSave.arabicName;
      c.department = recordToSave.department;
      c.mobileNumber = recordToSave.mobileNumber;
      monthlyChanged = true;
    }
  }
  if (monthlyChanged) writeMonthlyCheckInsLocal(monthlyCheckins);

  invalidateCheckinsCache();
  invalidateMonthlyCache();
  lastDoctorsRefreshTime = 0;
  doctorsRefreshPromise = null;
}

async function deleteCustomDoctorRecord(id: string, name?: string): Promise<void> {
  const cleanId = id.trim().replace(/^(emp\.|emp)/i, "");
  const idKey = normalizeId(cleanId);

  let targetName = name;
  let targetArabicName: string | undefined;
  if (!targetName) {
    const existing = NORMALIZED_DOCTORS_DATABASE.find(d => normalizeId(d.id) === idKey || d.id === cleanId);
    if (existing) {
      targetName = existing.name;
      targetArabicName = existing.arabicName;
    }
  }

  const nameKey = targetName ? normalizeName(targetName) : "";

  // Check if other active doctors share this ID (duplicate conflict case)
  const otherDoctorsShareId = NORMALIZED_DOCTORS_DATABASE.some(d => {
    const dIdKey = normalizeId(d.id);
    const dNameKey = normalizeName(d.name);
    return (dIdKey === idKey || d.id === cleanId) && nameKey && dNameKey !== nameKey;
  });

  // 1. Mark as deleted in tombstones (both locally and Supabase)
  await markDoctorAsDeleted(cleanId, targetName);

  // 2. Remove from in-memory NORMALIZED_DOCTORS_DATABASE targeting this specific doctor
  NORMALIZED_DOCTORS_DATABASE = NORMALIZED_DOCTORS_DATABASE.filter(d => {
    const dIdKey = normalizeId(d.id);
    const dNameKey = normalizeName(d.name);
    if (nameKey) {
      if ((dIdKey === idKey || d.id === cleanId) && dNameKey === nameKey) return false;
      return true;
    }
    return dIdKey !== idKey && d.id !== cleanId;
  });

  // 3. Clean up custom_doctors.json
  const localList = readCustomDoctorsLocal();
  const updatedList = localList.filter(d => {
    const dIdKey = normalizeId(d.id);
    const dOrigKey = normalizeId(d.originalId || "");
    const dNameKey = normalizeName(d.name);
    if (nameKey) {
      if ((dIdKey === idKey || dOrigKey === idKey || d.id === cleanId) && dNameKey === nameKey) return false;
      return true;
    }
    if (dIdKey === idKey || dOrigKey === idKey || d.id === cleanId) return false;
    return true;
  });
  writeCustomDoctorsLocal(updatedList);

  // 4. Clean up custom_doctors_phones.json and phone maps only if no other doctor shares this ID
  if (idKey && !otherDoctorsShareId) {
    mobileNumbersByCodeMap.delete(idKey);
    const localPhones = readCustomPhonesLocal();
    if (localPhones[idKey] || localPhones[cleanId]) {
      delete localPhones[idKey];
      delete localPhones[cleanId];
      writeCustomPhonesLocal(localPhones);
    }
  }

  // 5. Atomic write to Supabase
  const supabase = getSupabase();
  if (supabase) {
    try {
      const tombstones: { id: string; deleted_at: string }[] = [];
      if (!otherDoctorsShareId) {
        tombstones.push({ id: cleanId, deleted_at: new Date().toISOString() });
        if (idKey && idKey !== cleanId) tombstones.push({ id: idKey, deleted_at: new Date().toISOString() });
      }
      if (idKey && nameKey) tombstones.push({ id: `${idKey}_${nameKey}`, deleted_at: new Date().toISOString() });
      if (cleanId && nameKey && `${cleanId}_${nameKey}` !== `${idKey}_${nameKey}`) {
        tombstones.push({ id: `${cleanId}_${nameKey}`, deleted_at: new Date().toISOString() });
      }

      const results = await Promise.all([
        !otherDoctorsShareId
          ? supabase.from("doctors").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", cleanId)
          : Promise.resolve({ error: null }),
        tombstones.length > 0
          ? supabase.from("deleted_doctors").upsert(tombstones, { onConflict: "id" })
          : Promise.resolve({ error: null }),
        !otherDoctorsShareId
          ? supabase.from("custom_doctors").delete().or(`id.eq.${cleanId},original_id.eq.${cleanId}`)
          : (nameKey && targetName
              ? supabase.from("custom_doctors").delete().match({ id: cleanId, name: targetName })
              : supabase.from("custom_doctors").delete().eq("id", cleanId)),
        !otherDoctorsShareId
          ? supabase.from("custom_doctor_phones").delete().eq("id", cleanId)
          : Promise.resolve({ error: null }),
        nameKey && targetName
          ? supabase.from("checkins").delete().match({ doctor_id: cleanId, doctor_name: targetName })
          : supabase.from("checkins").delete().or(`doctor_id.eq.${cleanId},doctor_id.eq.${id}`)
      ]);
      for (const res of results) {
        if (res?.error) {
          console.error(`[Supabase delete error]:`, res.error.message);
        }
      }
    } catch (err) {
      console.error("[Supabase] deleteCustomDoctorRecord failed:", err);
    }
  }

  // 6. Remove from daily check-ins targeting this specific doctor
  const dailyCheckins = readCheckInsLocal();
  const filteredDaily = dailyCheckins.filter(c => {
    const cIdKey = normalizeId(c.id);
    const cNameKey = normalizeName(c.doctorName);
    if (nameKey) {
      return !((cIdKey === idKey || c.id === cleanId) && cNameKey === nameKey);
    }
    return cIdKey !== idKey && c.id !== cleanId;
  });
  if (filteredDaily.length !== dailyCheckins.length) {
    writeCheckInsLocal(filteredDaily);
  }

  // 7. Re-index in memory immediately
  updateCachedDeletedKeys(readDeletedDoctorsLocal());
  indexDoctorsList(NORMALIZED_DOCTORS_DATABASE);
  lastDoctorsRefreshTime = 0;
  doctorsRefreshPromise = null;
}

// High-performance batch deletion: executes batch Supabase operations, updates memory and disk once
async function deleteCustomDoctorsBatch(items: Array<{ id: string; name?: string } | string>): Promise<number> {
  if (!items || items.length === 0) return 0;

  const parsedItems: { cleanId: string; idKey: string; nameKey: string; name?: string }[] = [];
  const keysToAdd: string[] = [];
  const cleanIdsToDeactivate: string[] = [];

  for (const item of items) {
    const rawId = typeof item === "object" && item !== null ? item.id : String(item);
    let rawName = typeof item === "object" && item !== null ? item.name : undefined;
    const cleanId = rawId.trim().replace(/^(emp\.|emp)/i, "");
    const idKey = normalizeId(cleanId);

    if (!rawName) {
      const existing = NORMALIZED_DOCTORS_DATABASE.find(d => normalizeId(d.id) === idKey || d.id === cleanId);
      if (existing) rawName = existing.name;
    }

    const nameKey = rawName ? normalizeName(rawName) : "";

    const otherDoctorsShareId = NORMALIZED_DOCTORS_DATABASE.some(d => {
      const dIdKey = normalizeId(d.id);
      const dNameKey = normalizeName(d.name);
      return (dIdKey === idKey || d.id === cleanId) && nameKey && dNameKey !== nameKey;
    });

    if (!otherDoctorsShareId) {
      if (cleanId) {
        keysToAdd.push(cleanId);
        cleanIdsToDeactivate.push(cleanId);
      }
      if (idKey && idKey !== cleanId) keysToAdd.push(idKey);
    }

    if (idKey && nameKey) keysToAdd.push(`${idKey}_${nameKey}`);
    if (cleanId && nameKey && `${cleanId}_${nameKey}` !== `${idKey}_${nameKey}`) keysToAdd.push(`${cleanId}_${nameKey}`);
    if (nameKey) keysToAdd.push(nameKey);

    parsedItems.push({ cleanId, idKey, nameKey, name: rawName });
  }

  // 1. Update local deleted list
  const localDeleted = readDeletedDoctorsLocal();
  const updatedDeletedSet = new Set([...localDeleted, ...keysToAdd]);
  writeDeletedDoctorsLocal(Array.from(updatedDeletedSet));
  updateCachedDeletedKeys(updatedDeletedSet);

  // 2. Filter local custom doctors targeting specific records
  const localCustom = readCustomDoctorsLocal();
  const updatedCustom = localCustom.filter(d => {
    const dIdKey = normalizeId(d.id);
    const dOrigKey = normalizeId(d.originalId || "");
    const dNameKey = normalizeName(d.name);
    for (const p of parsedItems) {
      if (p.nameKey) {
        if ((dIdKey === p.idKey || dOrigKey === p.idKey || d.id === p.cleanId) && dNameKey === p.nameKey) return false;
      } else {
        if (dIdKey === p.idKey || dOrigKey === p.idKey || d.id === p.cleanId) return false;
      }
    }
    return true;
  });
  writeCustomDoctorsLocal(updatedCustom);

  // 3. Filter phones for non-shared IDs
  const localPhones = readCustomPhonesLocal();
  let phonesChanged = false;
  for (const p of parsedItems) {
    const isShared = NORMALIZED_DOCTORS_DATABASE.some(d => {
      const dIdKey = normalizeId(d.id);
      const dNameKey = normalizeName(d.name);
      return (dIdKey === p.idKey || d.id === p.cleanId) && p.nameKey && dNameKey !== p.nameKey;
    });
    if (!isShared) {
      mobileNumbersByCodeMap.delete(p.idKey);
      if (localPhones[p.idKey]) { delete localPhones[p.idKey]; phonesChanged = true; }
      if (localPhones[p.cleanId]) { delete localPhones[p.cleanId]; phonesChanged = true; }
    }
  }
  if (phonesChanged) writeCustomPhonesLocal(localPhones);

  // 4. Filter in-memory database targeting specific records
  NORMALIZED_DOCTORS_DATABASE = NORMALIZED_DOCTORS_DATABASE.filter(d => {
    const dIdKey = normalizeId(d.id);
    const dNameKey = normalizeName(d.name);
    for (const p of parsedItems) {
      if (p.nameKey) {
        if ((dIdKey === p.idKey || d.id === p.cleanId) && dNameKey === p.nameKey) return false;
      } else {
        if (dIdKey === p.idKey || d.id === p.cleanId) return false;
      }
    }
    return true;
  });

  // 5. Batch update Supabase
  const supabase = getSupabase();
  if (supabase) {
    try {
      const deletedEntries = keysToAdd.map(k => ({ id: k, deleted_at: new Date().toISOString() }));
      const promises: any[] = [];
      if (deletedEntries.length > 0) {
        promises.push(supabase.from("deleted_doctors").upsert(deletedEntries, { onConflict: "id" }));
      }
      if (cleanIdsToDeactivate.length > 0) {
        promises.push(supabase.from("doctors").update({ is_active: false, updated_at: new Date().toISOString() }).in("id", cleanIdsToDeactivate));
        promises.push(supabase.from("custom_doctor_phones").delete().in("id", cleanIdsToDeactivate));
      }
      for (const p of parsedItems) {
        if (p.name) {
          promises.push(supabase.from("custom_doctors").delete().match({ id: p.cleanId, name: p.name }));
        } else {
          promises.push(supabase.from("custom_doctors").delete().eq("id", p.cleanId));
        }
      }
      await Promise.all(promises);
    } catch (err) {
      console.error("[Supabase] deleteCustomDoctorsBatch failed:", err);
    }
  }

  // 6. Filter daily checkins
  const dailyCheckins = readCheckInsLocal();
  const filteredDaily = dailyCheckins.filter(c => {
    const cIdKey = normalizeId(c.id);
    const cNameKey = normalizeName(c.doctorName);
    for (const p of parsedItems) {
      if (p.nameKey) {
        if ((cIdKey === p.idKey || c.id === p.cleanId) && cNameKey === p.nameKey) return false;
      } else {
        if (cIdKey === p.idKey || c.id === p.cleanId) return false;
      }
    }
    return true;
  });
  if (filteredDaily.length !== dailyCheckins.length) {
    writeCheckInsLocal(filteredDaily);
  }

  // 7. Re-index in memory once!
  indexDoctorsList(NORMALIZED_DOCTORS_DATABASE);
  lastDoctorsRefreshTime = 0;
  doctorsRefreshPromise = null;

  return parsedItems.length;
}

// Monthly Check-Ins (30-Day Rolling Attendance Roster) and backward-compatible weekly helpers
const MONTHLY_CHECKINS_FILE = path.join(DATA_DIR, "monthly_checkins.json");
const WEEKLY_CHECKINS_FILE = path.join(DATA_DIR, "weekly_checkins.json");

function ensureLocalMonthlyData() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(MONTHLY_CHECKINS_FILE)) {
    if (fs.existsSync(WEEKLY_CHECKINS_FILE)) {
      try {
        const raw = fs.readFileSync(WEEKLY_CHECKINS_FILE, "utf-8");
        const parsed: CheckIn[] = JSON.parse(raw);
        // Prune initial migration to 30 days immediately if needed
        const distinctDates = Array.from(new Set(parsed.map(c => getEgyptDateStr(c.timestamp)))).sort();
        let initialData = parsed;
        if (distinctDates.length > 30) {
          const keepDates = new Set(distinctDates.slice(distinctDates.length - 30));
          initialData = parsed.filter(c => keepDates.has(getEgyptDateStr(c.timestamp)));
        }
        fs.writeFileSync(MONTHLY_CHECKINS_FILE, JSON.stringify(initialData, null, 2), "utf-8");
      } catch (e) {
        fs.writeFileSync(MONTHLY_CHECKINS_FILE, JSON.stringify([], null, 2), "utf-8");
      }
    } else {
      fs.writeFileSync(MONTHLY_CHECKINS_FILE, JSON.stringify([], null, 2), "utf-8");
    }
  }
  if (!fs.existsSync(WEEKLY_CHECKINS_FILE)) {
    fs.writeFileSync(WEEKLY_CHECKINS_FILE, JSON.stringify([], null, 2), "utf-8");
  }
}

function ensureLocalWeeklyData() {
  ensureLocalMonthlyData();
}

function readMonthlyCheckInsLocal(): CheckIn[] {
  try {
    ensureLocalMonthlyData();
    if (fs.existsSync(MONTHLY_CHECKINS_FILE)) {
      const data = fs.readFileSync(MONTHLY_CHECKINS_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Error reading local monthly checkins file:", error);
  }
  return [];
}

function writeMonthlyCheckInsLocal(checkins: CheckIn[]) {
  try {
    ensureLocalMonthlyData();
    fs.writeFileSync(MONTHLY_CHECKINS_FILE, JSON.stringify(checkins, null, 2), "utf-8");
    // Keep weekly_checkins.json synchronized for backward compatibility
    fs.writeFileSync(WEEKLY_CHECKINS_FILE, JSON.stringify(checkins, null, 2), "utf-8");
  } catch (error) {
    console.error("Error writing local monthly checkins file:", error);
  }
}

const readWeeklyCheckInsLocal = readMonthlyCheckInsLocal;
const writeWeeklyCheckInsLocal = writeMonthlyCheckInsLocal;

// 30-Day FIFO Sliding Window: strictly enforces maximum 30 distinct calendar days.
// When 31+ distinct days exist, all records for the oldest day(s) are purged from Supabase & local storage.
async function pruneMonthlyCheckInsTo30Days(checkins: CheckIn[]): Promise<CheckIn[]> {
  const dateMap = new Map<string, CheckIn[]>();
  for (const c of checkins) {
    const d = getEgyptDateStr(c.timestamp);
    if (!dateMap.has(d)) dateMap.set(d, []);
    dateMap.get(d)!.push(c);
  }

  const sortedDates = Array.from(dateMap.keys()).sort();
  if (sortedDates.length <= 30) {
    return checkins;
  }

  const excessCount = sortedDates.length - 30;
  const datesToDelete = sortedDates.slice(0, excessCount);
  const datesToKeep = new Set(sortedDates.slice(excessCount));

  console.log(`[Elite Server] 30-Day Rolling Window: Pruning ${datesToDelete.length} oldest dates (${datesToDelete.join(", ")}). Keeping newest 30 days.`);

  // 1. Purge oldest dates from Supabase
  const supabase = getSupabase();
  if (supabase) {
    try {
      await Promise.all([
        supabase.from("monthly_checkins").delete().in("checkin_date", datesToDelete),
        supabase.from("weekly_checkins").delete().in("checkin_date", datesToDelete),
      ]);
    } catch (err) {
      console.error("[Supabase] Failed to prune oldest dates in monthly_checkins:", err);
    }
  }

  // 2. Retain only the newest 30 days in local memory/file
  const pruned = checkins.filter(c => datesToKeep.has(getEgyptDateStr(c.timestamp)));
  return pruned;
}

let monthlyCheckinsCache: CheckIn[] | null = null;
let lastMonthlyFetchTime = 0;
const MONTHLY_CACHE_TTL = 30000; // 30 seconds cache

function invalidateMonthlyCache() {
  monthlyCheckinsCache = null;
  lastMonthlyFetchTime = 0;
}
const invalidateWeeklyCache = invalidateMonthlyCache;

// Fetch all monthly checkins (30-day rolling window, cloud/local)
async function readMonthlyCheckIns(): Promise<CheckIn[]> {
  const now = Date.now();
  if (monthlyCheckinsCache && (now - lastMonthlyFetchTime < MONTHLY_CACHE_TTL)) {
    return monthlyCheckinsCache;
  }

  let list: CheckIn[] = [];
  const supabase = getSupabase();
  if (supabase) {
    try {
      let data = await fetchAllRowsFromSupabase("monthly_checkins", (q) =>
        q.order("checkin_timestamp", { ascending: false })
      );

      // If monthly_checkins table is empty, check legacy weekly_checkins table
      if (!Array.isArray(data) || data.length === 0) {
        const weeklyData = await fetchAllRowsFromSupabase("weekly_checkins", (q) =>
          q.order("checkin_timestamp", { ascending: false })
        );
        if (Array.isArray(weeklyData) && weeklyData.length > 0) {
          data = weeklyData;
        }
      }
      
      if (Array.isArray(data) && data.length > 0) {
        list = data.map((row: any) => ({
          id: row.doctor_id,
          doctorName: row.doctor_name,
          doctorArabicName: row.doctor_arabic_name || row.doctor_name,
          department: row.department,
          shifts: Array.isArray(row.shifts) ? row.shifts : [],
          timestamp: row.checkin_timestamp,
          mobileNumber: row.mobile_number || "",
        }));
      } else {
        list = readMonthlyCheckInsLocal();
      }
    } catch (err: any) {
      console.error("[Supabase] readMonthlyCheckIns failed, falling back to local:", err);
      list = readMonthlyCheckInsLocal();
    }
  } else {
    list = readMonthlyCheckInsLocal();
  }

  // Enforce 30-day FIFO sliding window
  list = await pruneMonthlyCheckInsTo30Days(list);
  writeMonthlyCheckInsLocal(list);

  // Normalize details
  const result = list
    .map(c => {
      let id = c.id.replace(/^(emp\.|emp)/i, "");
      let dept = c.department;
      
      if (c.doctorName === "Amr Mohamed Sabry" || id === "201") {
        id = "201";
        dept = "Physical Medicine";
      } else if (c.doctorName === "Beshoy Nagy Farag Gerges" || id === "2310") {
        dept = "Physical Medicine";
      } else if (c.doctorName === "Omar Ahmed Osama Ebrahim" || id === "2120") {
        dept = "Internal Medicine";
      } else if (c.doctorName === "Abdelrahman Mahmoud Bassyoni Mohamed" || id === "2956") {
        dept = "Radiology";
      } else if (c.doctorName === "kareem Mohamed Abdelkader Mohamed" || id === "347") {
        dept = "Radiology";
      } else if (c.doctorName === "Moustafa Mohamed Mahmoud AbdelMagid" || id === "3365") {
        dept = "Pediatrics";
      } else if (c.doctorName === "Amany Mansour Elsayed Mohamed" || id === "724") {
        dept = "Nephrology";
      }

      const idKey = normalizeId(id);
      const nameKey = normalizeName(c.doctorName);
      const mobileNumber = c.mobileNumber || mobileNumbersByCodeMap.get(idKey) || mobileNumbersByNameMap.get(nameKey) || "";

      return {
        ...c,
        id,
        department: normalizeDepartment(dept),
        mobileNumber
      };
    })
    .filter(c => c.id.toLowerCase().trim() !== "emp");

  monthlyCheckinsCache = result;
  lastMonthlyFetchTime = Date.now();
  return result;
}

const readWeeklyCheckIns = readMonthlyCheckIns;

// Add or update check-in (atomic upsert or clean replace)
async function addCheckIn(checkin: CheckIn): Promise<void> {
  invalidateCheckinsCache();
  const cleanId = checkin.id.trim().replace(/^(emp\.|emp)/i, "");
  const normalizedCheckIn: CheckIn = {
    ...checkin,
    id: cleanId,
  };

  const supabase = getSupabase();
  if (supabase) {
    try {
      const payload = {
        doctor_id: cleanId,
        doctor_name: checkin.doctorName,
        doctor_arabic_name: checkin.doctorArabicName || checkin.doctorName,
        department: checkin.department,
        shifts: checkin.shifts,
        mobile_number: checkin.mobileNumber || "",
        checkin_timestamp: checkin.timestamp,
        checkin_date: getEgyptDateStr(checkin.timestamp),
      };

      // Try atomic upsert first
      const { error: upsertErr } = await supabase
        .from("checkins")
        .upsert(payload, { onConflict: "doctor_id" });

      if (upsertErr) {
        // Fallback for schemas without unique constraint
        await supabase.from("checkins").delete().or(`doctor_id.eq.${cleanId},doctor_id.eq.${checkin.id}`);
        await supabase.from("checkins").insert(payload);
      }
    } catch (err) {
      console.error("[Supabase] addCheckIn failed:", err);
    }
  }

  const list = readCheckInsLocal();
  const filtered = list.filter(c => normalizeId(c.id) !== normalizeId(cleanId));
  filtered.push(normalizedCheckIn);
  writeCheckInsLocal(filtered);
}

// Add or update monthly check-in (cumulative 30-day roster, one row per doctor per day)
async function addMonthlyCheckIn(checkin: CheckIn): Promise<void> {
  invalidateMonthlyCache();
  const cleanId = checkin.id.trim().replace(/^(emp\.|emp)/i, "");
  const dateStr = getEgyptDateStr(checkin.timestamp);
  const normalizedCheckIn: CheckIn = {
    ...checkin,
    id: cleanId,
  };

  const supabase = getSupabase();
  if (supabase) {
    try {
      const payload = {
        doctor_id: cleanId,
        doctor_name: checkin.doctorName,
        doctor_arabic_name: checkin.doctorArabicName || checkin.doctorName,
        department: checkin.department,
        shifts: checkin.shifts,
        mobile_number: checkin.mobileNumber || "",
        checkin_timestamp: checkin.timestamp,
        checkin_date: dateStr,
      };

      // Atomic upsert to monthly_checkins
      const { error: upsertErr } = await supabase
        .from("monthly_checkins")
        .upsert(payload, { onConflict: "doctor_id,checkin_date" });

      if (upsertErr) {
        await supabase.from("monthly_checkins").delete().eq("doctor_id", cleanId).eq("checkin_date", dateStr);
        await supabase.from("monthly_checkins").insert(payload);
      }

      // Also upsert to legacy weekly_checkins for backward compatibility
      try {
        await supabase.from("weekly_checkins").upsert(payload, { onConflict: "doctor_id,checkin_date" });
      } catch {}
    } catch (err) {
      console.error("[Supabase] addMonthlyCheckIn failed:", err);
    }
  }

  const list = readMonthlyCheckInsLocal();
  const filtered = list.filter(c => {
    const cDate = getEgyptDateStr(c.timestamp);
    return !(normalizeId(c.id) === normalizeId(cleanId) && cDate === dateStr);
  });
  filtered.push(normalizedCheckIn);

  // Enforce 30-day FIFO sliding window on additions
  const pruned = await pruneMonthlyCheckInsTo30Days(filtered);
  writeMonthlyCheckInsLocal(pruned);
}

const addWeeklyCheckIn = addMonthlyCheckIn;

// Delete a single daily check-in
async function deleteCheckIn(id: string): Promise<boolean> {
  invalidateCheckinsCache();
  const cleanId = id.trim().replace(/^(emp\.|emp)/i, "");
  const idNorm = normalizeId(cleanId);

  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.from("checkins").delete().or(`doctor_id.eq.${cleanId},doctor_id.eq.${id}`);
    } catch (err) {
      console.error("[Supabase] deleteCheckIn failed:", err);
    }
  }

  const list = readCheckInsLocal();
  const filtered = list.filter(c => normalizeId(c.id) !== idNorm);
  if (filtered.length === list.length) {
    return false;
  }
  writeCheckInsLocal(filtered);
  return true;
}

// Delete a monthly/weekly check-in matching doctor ID AND target date
async function deleteMonthlyCheckIn(id: string, timestamp: string): Promise<void> {
  invalidateMonthlyCache();
  const cleanId = id.trim().replace(/^(emp\.|emp)/i, "");
  const idNorm = normalizeId(cleanId);
  const dateStr = getEgyptDateStr(timestamp);

  const supabase = getSupabase();
  if (supabase) {
    try {
      await Promise.all([
        supabase.from("monthly_checkins").delete().eq("doctor_id", cleanId).eq("checkin_date", dateStr),
        supabase.from("weekly_checkins").delete().eq("doctor_id", cleanId).eq("checkin_date", dateStr),
      ]);
    } catch (err) {
      console.error("[Supabase] deleteMonthlyCheckIn failed:", err);
    }
  }

  const list = readMonthlyCheckInsLocal();
  const filtered = list.filter(c => {
    const cDate = getEgyptDateStr(c.timestamp);
    return !(normalizeId(c.id) === idNorm && cDate === dateStr);
  });
  writeMonthlyCheckInsLocal(filtered);
}

const deleteWeeklyCheckIn = deleteMonthlyCheckIn;

// Clear all daily check-ins
async function clearAllCheckIns(): Promise<void> {
  invalidateCheckinsCache();
  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.from("checkins").delete().neq("doctor_id", "__none__");
    } catch (err) {
      console.error("[Supabase] clearAllCheckIns failed:", err);
    }
  }

  writeCheckInsLocal([]);
}

// Clear all monthly check-ins (and legacy weekly check-ins)
async function clearMonthlyCheckIns(): Promise<void> {
  invalidateMonthlyCache();
  const supabase = getSupabase();
  if (supabase) {
    try {
      await Promise.all([
        supabase.from("monthly_checkins").delete().neq("doctor_id", "__none__"),
        supabase.from("weekly_checkins").delete().neq("doctor_id", "__none__"),
      ]);
    } catch (err) {
      console.error("[Supabase] clearMonthlyCheckIns failed:", err);
    }
  }

  writeMonthlyCheckInsLocal([]);
}

const clearWeeklyCheckIns = clearMonthlyCheckIns;

// API Endpoints
app.get("/header_bg.png", (req, res) => {
  // Support Node.js backend parameters: query parameters for responsive sizing (?w=600 or ?size=compact)
  const widthParam = parseInt(String(req.query.w || req.query.width || ""), 10);
  const sizeParam = String(req.query.size || "").toLowerCase();
  const wantsCompact = (widthParam > 0 && widthParam <= 600) || sizeParam === "compact" || sizeParam === "mobile";

  // Set high-performance HTTP cache headers to prevent bandwidth waste
  res.setHeader("Cache-Control", "public, max-age=604800, stale-while-revalidate=86400");
  res.setHeader("Content-Type", "image/png");

  // Candidate paths in prioritized resolution order
  const candidatePaths = wantsCompact
    ? [
        path.join(process.cwd(), "public", "header_bg_compact.png"),
        path.join(process.cwd(), "public", "header_bg.png"),
        path.join(process.cwd(), "header_bg.png"),
        path.join(process.cwd(), "dist", "header_bg.png")
      ]
    : [
        path.join(process.cwd(), "public", "header_bg.png"),
        path.join(process.cwd(), "header_bg.png"),
        path.join(process.cwd(), "dist", "header_bg.png")
      ];

  for (const filePath of candidatePaths) {
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath, { maxAge: "7d", etag: true, lastModified: true });
      return;
    }
  }
  
  // If no physical file, serve a beautiful, modern high-fidelity dark-emerald hospital OS theme banner as SVG
  const svg = `<svg width="1920" height="120" viewBox="0 0 1920 120" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <!-- Background Linear Gradient -->
      <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#021c17" />
        <stop offset="50%" stop-color="#063b30" />
        <stop offset="100%" stop-color="#041f1a" />
      </linearGradient>
      
      <!-- Tech Grid Pattern -->
      <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#10b981" stroke-width="0.5" opacity="0.08" />
      </pattern>
      
      <!-- Subtle diagonal lines -->
      <pattern id="diagonal" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="10" stroke="#10b981" stroke-width="0.5" opacity="0.04" />
      </pattern>

      <!-- Glow Filters -->
      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="30" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>

    <!-- Base Gradient Rect -->
    <rect width="1920" height="120" fill="url(#bgGrad)" />

    <!-- Patterns -->
    <rect width="1920" height="120" fill="url(#grid)" />
    <rect width="1920" height="120" fill="url(#diagonal)" />

    <!-- Abstract Medical/Pulse Waves (Dynamic Bezier curves) -->
    <!-- Wave 1 (Teal/Emerald pulse) -->
    <path d="M 0 80 Q 250 120, 500 60 T 1000 70 T 1500 50 T 1920 80 L 1920 120 L 0 120 Z" fill="#10b981" opacity="0.04" />
    <path d="M 0 60 Q 300 20, 600 80 T 1200 40 T 1800 90 T 1920 50" fill="none" stroke="#10b981" stroke-width="1.5" stroke-dasharray="1 5" opacity="0.15" />
    
    <!-- Heartbeat pulse wave (glowing line) -->
    <path d="M -50 60 L 300 60 L 330 60 L 340 30 L 350 90 L 360 10 L 370 70 L 380 60 L 410 60 L 800 60 L 820 60 L 830 20 L 840 100 L 850 0 L 860 75 L 870 60 L 900 60 L 1400 60 L 1420 60 L 1430 40 L 1440 90 L 1450 20 L 1460 70 L 1470 60 L 1970 60" 
          fill="none" stroke="#34d399" stroke-width="2" opacity="0.25" filter="url(#glow)" />

    <!-- Tech HUD Elements in top corners -->
    <circle cx="100" cy="30" r="4" fill="#34d399" opacity="0.4" />
    <circle cx="100" cy="30" r="12" fill="none" stroke="#34d399" stroke-width="1" opacity="0.2" />
    <line x1="120" y1="30" x2="220" y2="30" stroke="#34d399" stroke-width="1" opacity="0.15" />
    
    <circle cx="1820" cy="30" r="3" fill="#34d399" opacity="0.4" />
    <circle cx="1820" cy="30" r="8" fill="none" stroke="#34d399" stroke-width="1" opacity="0.2" />
    <line x1="1700" y1="30" x2="1800" y2="30" stroke="#34d399" stroke-width="1" opacity="0.15" />

    <!-- Ambient glowing light spots -->
    <circle cx="300" cy="60" r="150" fill="#10b981" opacity="0.1" filter="url(#glow)" />
    <circle cx="1500" cy="40" r="180" fill="#047857" opacity="0.12" filter="url(#glow)" />
  </svg>`;

  res.setHeader("Content-Type", "image/svg+xml");
  res.send(svg);
});

// Endpoint serving the official Elite logo PNG with caching headers
app.get("/elite_logo.png", (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=604800, stale-while-revalidate=86400");
  res.setHeader("Content-Type", "image/png");
  const candidatePaths = [
    path.join(process.cwd(), "public", "elite_logo.png"),
    path.join(process.cwd(), "elite_logo.png"),
    path.join(process.cwd(), "dist", "elite_logo.png")
  ];
  for (const filePath of candidatePaths) {
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath, { maxAge: "7d", etag: true, lastModified: true });
      return;
    }
  }
  res.status(404).send("Logo not found");
});

// Helper to escape XML characters for safe SVG text embedding
function escapeXml(unsafe: string): string {
  return String(unsafe || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Memory cache for user-included header image to eliminate repeated disk I/O
let cachedHeaderBgBase64: string | null = null;
function getHeaderBgBase64(): string {
  if (cachedHeaderBgBase64) return cachedHeaderBgBase64;
  const candidatePaths = [
    path.join(process.cwd(), "public", "header_bg.png"),
    path.join(process.cwd(), "header_bg.png"),
    path.join(process.cwd(), "dist", "header_bg.png")
  ];
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      try {
        cachedHeaderBgBase64 = fs.readFileSync(p).toString("base64");
        return cachedHeaderBgBase64;
      } catch (err) {
        console.error("Error reading header_bg.png:", err);
      }
    }
  }
  return "";
}

// Memory cache for elite_logo.png transparent emblem
let cachedEliteLogoBase64: string | null = null;
function getEliteLogoBase64(): string {
  if (cachedEliteLogoBase64) return cachedEliteLogoBase64;
  const candidatePaths = [
    path.join(process.cwd(), "public", "elite_logo.png"),
    path.join(process.cwd(), "elite_logo.png"),
    path.join(process.cwd(), "dist", "elite_logo.png")
  ];
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      try {
        cachedEliteLogoBase64 = fs.readFileSync(p).toString("base64");
        return cachedEliteLogoBase64;
      } catch (err) {
        console.error("Error reading elite_logo.png:", err);
      }
    }
  }
  return "";
}

const ARABIC_TO_ENGLISH_WEEKDAYS: Record<string, string> = {
  "السبت": "Saturday",
  "الأحد": "Sunday",
  "الاحد": "Sunday",
  "الإثنين": "Monday",
  "الاثنين": "Monday",
  "الثلاثاء": "Tuesday",
  "الأربعاء": "Wednesday",
  "الاربعاء": "Wednesday",
  "الخميس": "Thursday",
  "الجمعة": "Friday"
};

interface EgyptDateOptions {
  autoReset?: boolean;
  cutoff?: string; // e.g. "18:30" (6:30 PM Cairo Time)
  nextDay?: boolean;
}

// Helper to get localized Egypt (Africa/Cairo) weekday and formatted date
function getEgyptDateInfo(dateInput?: string | Date, options?: EgyptDateOptions) {
  let d: Date;
  let isExplicitDate = false;
  if (!dateInput) {
    d = new Date();
  } else if (typeof dateInput === "string") {
    const trimmed = dateInput.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      d = new Date(trimmed + "T12:00:00+02:00");
      isExplicitDate = true;
    } else {
      // Support DD/MM/YYYY or DD-MM-YYYY (e.g. 08/10/2026) to prevent US MM/DD swap
      const ddmmyyyy = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
      if (ddmmyyyy) {
        const day = ddmmyyyy[1].padStart(2, "0");
        const month = ddmmyyyy[2].padStart(2, "0");
        const year = ddmmyyyy[3];
        d = new Date(`${year}-${month}-${day}T12:00:00+02:00`);
        isExplicitDate = true;
      } else {
        d = new Date(trimmed);
        if (!isNaN(d.getTime())) isExplicitDate = true;
      }
    }
  } else {
    d = dateInput;
    isExplicitDate = true;
  }
  if (isNaN(d.getTime())) {
    d = new Date();
    isExplicitDate = false;
  }

  // Handle autoReset / nextDay when date is not explicitly locked, or when options.nextDay is requested
  const autoReset = options?.autoReset !== false;
  const nextDayExplicit = options?.nextDay === true;

  if (nextDayExplicit) {
    d.setDate(d.getDate() + 1);
  } else if (!isExplicitDate && autoReset) {
    // Check if current time in Egypt is past the reset cutoff (default 18:30 / 6:30 PM Cairo Time)
    const cutoffStr = options?.cutoff || "18:30";
    const [cHourStr, cMinStr] = cutoffStr.split(":");
    const cutoffHour = parseInt(cHourStr || "18", 10);
    const cutoffMin = parseInt(cMinStr || "30", 10);

    const nowInEgypt = new Date();
    const egyptHourStr = nowInEgypt.toLocaleTimeString("en-US", { timeZone: "Africa/Cairo", hour: "numeric", hour12: false });
    const egyptMinStr = nowInEgypt.toLocaleTimeString("en-US", { timeZone: "Africa/Cairo", minute: "numeric" });
    const curEgyptHour = parseInt(egyptHourStr, 10) || 0;
    const curEgyptMin = parseInt(egyptMinStr, 10) || 0;

    const isAfterReset = curEgyptHour > cutoffHour || (curEgyptHour === cutoffHour && curEgyptMin >= cutoffMin);
    if (isAfterReset) {
      d.setDate(d.getDate() + 1);
    }
  }

  const arabicWeekday = new Intl.DateTimeFormat("ar-EG", {
    weekday: "long",
    timeZone: "Africa/Cairo"
  }).format(d);

  const englishWeekday = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: "Africa/Cairo"
  }).format(d);

  const formattedDate = new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Africa/Cairo"
  }).format(d);

  const isoDate = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Africa/Cairo"
  }).format(d);

  return { arabicWeekday, englishWeekday, formattedDate, isoDate };
}

interface SheetHeaderOptions {
  title?: string;
  day?: string;
  date?: string;
  englishWeekday?: string;
  subTitle?: string;
  width?: number;
  height?: number;
  autoReset?: boolean;
  cutoff?: string;
  nextDay?: boolean;
}

// Build header SVG integrating user-provided picture with words: "الأطباء المتواجدين عن يوم [اليوم] [التاريخ]"
function buildSheetHeaderSvg(options: SheetHeaderOptions = {}): string {
  const dateInfo = getEgyptDateInfo(options.date, {
    autoReset: options.autoReset,
    cutoff: options.cutoff,
    nextDay: options.nextDay
  });
  const arabicWeekday = options.day && options.day.trim() ? options.day.trim() : dateInfo.arabicWeekday;
  const formattedDate = options.date && options.date.trim() ? options.date.trim() : dateInfo.formattedDate;

  // Resolve englishWeekday with absolute accuracy: check explicit options, Arabic mapping, or dateInfo
  let englishWeekday = options.englishWeekday && options.englishWeekday.trim() ? options.englishWeekday.trim() : "";
  if (!englishWeekday && arabicWeekday) {
    const cleanAr = arabicWeekday.replace(/^يوم\s+/, "").trim();
    if (ARABIC_TO_ENGLISH_WEEKDAYS[cleanAr]) {
      englishWeekday = ARABIC_TO_ENGLISH_WEEKDAYS[cleanAr];
    }
  }
  if (!englishWeekday) {
    englishWeekday = dateInfo.englishWeekday;
  }

  // De-duplicate Arabic title: ensure "الأطباء المتواجدين عن يوم [اليوم] [التاريخ]" appears strictly once
  let fullArabicTitle = "";
  const basePrefix = "الأطباء المتواجدين عن يوم";
  if (options.title && options.title.trim()) {
    let t = options.title.trim();
    if (t.includes(formattedDate) || t.includes(arabicWeekday)) {
      fullArabicTitle = t;
    } else {
      fullArabicTitle = `${t} ${arabicWeekday} ${formattedDate}`;
    }
  } else {
    fullArabicTitle = `${basePrefix} ${arabicWeekday} ${formattedDate}`;
  }

  // Scrub any duplicate weekday or date tokens
  const token = `${arabicWeekday} ${formattedDate}`;
  while (fullArabicTitle.includes(`${token} ${token}`)) {
    fullArabicTitle = fullArabicTitle.replace(`${token} ${token}`, token);
  }
  while (fullArabicTitle.includes(`${arabicWeekday} ${arabicWeekday}`)) {
    fullArabicTitle = fullArabicTitle.replace(`${arabicWeekday} ${arabicWeekday}`, arabicWeekday);
  }
  while (fullArabicTitle.includes(`${formattedDate} ${formattedDate}`)) {
    fullArabicTitle = fullArabicTitle.replace(`${formattedDate} ${formattedDate}`, formattedDate);
  }

  const subTitle = options.subTitle || `Attending Physicians • ${englishWeekday}, ${formattedDate}`;

  const width = Number(options.width) || 1200;
  const height = Number(options.height) || 150;
  const b64 = getHeaderBgBase64();

  const imageElement = b64
    ? `<image href="data:image/png;base64,${b64}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" />`
    : `<rect width="${width}" height="${height}" fill="#063b30" />`;

  // Left badge: x=30, y=26, width=220, height=98, rx=10 (ends at x=250)
  // Right badge: x=width-128=1072, y=26, width=98, height=98, rx=10 (ends at x=1170, 30px right margin)
  // Center between badges: (250 + 1072) / 2 = 661
  const centerX = Math.round((250 + (width - 128)) / 2);

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="headerGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#021c17" stop-opacity="0.95" />
      <stop offset="25%" stop-color="#063b30" stop-opacity="0.82" />
      <stop offset="65%" stop-color="#0a4d3f" stop-opacity="0.75" />
      <stop offset="100%" stop-color="#063b30" stop-opacity="0.92" />
    </linearGradient>
    <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.5"/>
    </filter>
    <clipPath id="roundedClip">
      <rect x="0" y="0" width="${width}" height="${height}" rx="8" ry="8" />
    </clipPath>
  </defs>

  <g clip-path="url(#roundedClip)">
    ${imageElement}
    <rect x="0" y="0" width="${width}" height="${height}" fill="url(#headerGrad)" opacity="0.82" />
    <rect x="0" y="0" width="${width}" height="3" fill="#10b981" />
    <rect x="0" y="${height - 2}" width="${width}" height="2" fill="#0f766e" />
    <path d="M 0 ${height - 25} L 150 ${height - 25} L 165 ${height - 40} L 175 ${height - 10} L 185 ${height - 45} L 195 ${height - 20} L 205 ${height - 25} L ${width - 250} ${height - 25} L ${width - 235} ${height - 45} L ${width - 225} ${height - 15} L ${width - 215} ${height - 35} L ${width - 205} ${height - 25} L ${width} ${height - 25}" 
          fill="none" stroke="#34d399" stroke-width="1.5" opacity="0.35" />

    <!-- Left Brand Badge / Logo Pill -->
    <g transform="translate(30, 26)">
      <rect x="0" y="0" width="220" height="98" rx="10" fill="rgba(2, 28, 23, 0.75)" stroke="#10b981" stroke-width="1" stroke-opacity="0.3" filter="url(#shadow)" />
      <text x="110" y="38" font-family="'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="20" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="3">ELITE</text>
      <text x="110" y="58" font-family="'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="10" font-weight="700" fill="#34d399" text-anchor="middle" letter-spacing="2">HOSPITAL SYSTEM</text>
      <line x1="30" y1="68" x2="190" y2="68" stroke="#10b981" stroke-width="0.8" opacity="0.4" />
      <text x="110" y="84" font-family="'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="10" font-weight="600" fill="#a7f3d0" text-anchor="middle">PHYSICIAN ROSTER</text>
    </g>

    <!-- Center Title Area: Balanced & Symmetric with 180px+ clear margin on each side -->
    <g transform="translate(${centerX}, 0)">
      <text x="0" y="62" font-family="'Cairo', 'Segoe UI', Tahoma, 'Traditional Arabic', Arial, sans-serif" font-size="24" font-weight="800" fill="#ffffff" text-anchor="middle" filter="url(#shadow)">
        ${escapeXml(fullArabicTitle)}
      </text>
      <text x="0" y="94" font-family="'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif" font-size="14" font-weight="700" fill="#6ee7b7" text-anchor="middle">
        ${escapeXml(subTitle)}
      </text>
    </g>

    <!-- Right-aligned Elite Hospital Emblem Badge: Symmetrically aligned with left badge (y=26, height=98, rx=10) -->
    <g transform="translate(${width - 128}, 26)">
      <rect x="0" y="0" width="98" height="98" rx="10" fill="rgba(2, 28, 23, 0.75)" stroke="#10b981" stroke-width="1" stroke-opacity="0.3" filter="url(#shadow)" />
      ${getEliteLogoBase64() ? `<image href="data:image/png;base64,${getEliteLogoBase64()}" x="12" y="12" width="74" height="74" preserveAspectRatio="xMidYMid meet" />` : ''}
    </g>
  </g>
</svg>`;
}

// Endpoint supporting Node.js backend parameters (?date=..., ?day=..., ?title=..., ?w=..., ?h=..., ?format=..., ?autoReset=..., ?cutoff=..., ?nextDay=...)
app.get(["/api/sheet-header.svg", "/sheet-header.svg", "/api/header.svg"], (req, res) => {
  const widthParam = parseInt(String(req.query.w || req.query.width || "1200"), 10) || 1200;
  const heightParam = parseInt(String(req.query.h || req.query.height || "150"), 10) || 150;
  const dateParam = typeof req.query.date === "string" ? req.query.date.trim() : undefined;
  const dayParam = typeof req.query.day === "string" ? req.query.day.trim() : (typeof req.query.weekday === "string" ? req.query.weekday.trim() : undefined);
  const englishWeekdayParam = typeof req.query.englishWeekday === "string" 
    ? req.query.englishWeekday.trim() 
    : (typeof req.query.enDay === "string" ? req.query.enDay.trim() : (typeof req.query.enWeekday === "string" ? req.query.enWeekday.trim() : undefined));
  const titleParam = typeof req.query.title === "string" ? req.query.title.trim() : undefined;
  const subTitleParam = typeof req.query.subTitle === "string" ? req.query.subTitle.trim() : undefined;
  const formatParam = String(req.query.format || "").toLowerCase();
  const autoResetParam = req.query.autoReset !== "false";
  const cutoffParam = typeof req.query.cutoff === "string" ? req.query.cutoff.trim() : "18:30";
  const nextDayParam = req.query.nextDay === "true" || req.query.afterReset === "true";

  const svg = buildSheetHeaderSvg({
    title: titleParam,
    day: dayParam,
    date: dateParam,
    englishWeekday: englishWeekdayParam,
    subTitle: subTitleParam,
    width: widthParam,
    height: heightParam,
    autoReset: autoResetParam,
    cutoff: cutoffParam,
    nextDay: nextDayParam
  });

  if (formatParam === "json") {
    const dateInfo = getEgyptDateInfo(dateParam, {
      autoReset: autoResetParam,
      cutoff: cutoffParam,
      nextDay: nextDayParam
    });
    const day = dayParam || dateInfo.arabicWeekday;
    const date = dateParam || dateInfo.formattedDate;
    const englishWeekday = englishWeekdayParam || ARABIC_TO_ENGLISH_WEEKDAYS[day.replace(/^يوم\s+/, "").trim()] || dateInfo.englishWeekday;
    const title = titleParam || "الأطباء المتواجدين عن يوم";
    res.json({
      svg,
      title,
      day,
      date,
      englishWeekday,
      fullTitle: `${title} ${day} ${date}`
    });
    return;
  }

  res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=43200");
  res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
  res.send(svg);
});

// JSON / Metadata endpoint for sheet header parameters
app.get("/api/sheet-header", (req, res) => {
  const format = String(req.query.format || "").toLowerCase();
  if (format === "svg") {
    const queryStr = new URLSearchParams(req.query as any).toString();
    res.redirect(`/api/sheet-header.svg?${queryStr}`);
    return;
  }

  const widthParam = parseInt(String(req.query.w || req.query.width || "1200"), 10) || 1200;
  const heightParam = parseInt(String(req.query.h || req.query.height || "150"), 10) || 150;
  const dateParam = typeof req.query.date === "string" ? req.query.date.trim() : undefined;
  const dayParam = typeof req.query.day === "string" ? req.query.day.trim() : (typeof req.query.weekday === "string" ? req.query.weekday.trim() : undefined);
  const englishWeekdayParam = typeof req.query.englishWeekday === "string" 
    ? req.query.englishWeekday.trim() 
    : (typeof req.query.enDay === "string" ? req.query.enDay.trim() : (typeof req.query.enWeekday === "string" ? req.query.enWeekday.trim() : undefined));
  const titleParam = typeof req.query.title === "string" ? req.query.title.trim() : undefined;
  const subTitleParam = typeof req.query.subTitle === "string" ? req.query.subTitle.trim() : undefined;
  const autoResetParam = req.query.autoReset !== "false";
  const cutoffParam = typeof req.query.cutoff === "string" ? req.query.cutoff.trim() : "18:30";
  const nextDayParam = req.query.nextDay === "true" || req.query.afterReset === "true";

  const dateInfo = getEgyptDateInfo(dateParam, {
    autoReset: autoResetParam,
    cutoff: cutoffParam,
    nextDay: nextDayParam
  });
  const arabicWeekday = dayParam || dateInfo.arabicWeekday;
  const formattedDate = dateParam || dateInfo.formattedDate;
  const englishWeekday = englishWeekdayParam || ARABIC_TO_ENGLISH_WEEKDAYS[arabicWeekday.replace(/^يوم\s+/, "").trim()] || dateInfo.englishWeekday;
  const title = titleParam || "الأطباء المتواجدين عن يوم";
  const fullTitle = `${title} ${arabicWeekday} ${formattedDate}`;

  const svg = buildSheetHeaderSvg({
    title,
    day: arabicWeekday,
    date: formattedDate,
    englishWeekday,
    subTitle: subTitleParam,
    width: widthParam,
    height: heightParam,
    autoReset: autoResetParam,
    cutoff: cutoffParam,
    nextDay: nextDayParam
  });

  res.json({
    svg,
    title,
    day: arabicWeekday,
    date: formattedDate,
    englishWeekday,
    fullTitle
  });
});

// Interface for daily sheet generation options
interface DailySheetGenOptions {
  dateParam?: string;
  dayParam?: string;
  titleParam?: string;
  autoReset?: boolean;
  cutoff?: string;
  nextDay?: boolean;
}

// Reusable function to build the daily sheet Excel workbook buffer
async function buildDailySheetWorkbook(options: DailySheetGenOptions = {}) {
  const rawCheckins = await readCheckIns();
  const checkins = rawCheckins.map(c => enrichCheckIn(c));
  const autoReset = options.autoReset !== false;
  const cutoff = options.cutoff || "18:30";
  const nextDay = options.nextDay === true;
  const title = options.titleParam || "الأطباء المتواجدين عن يوم";

  const dateInfo = getEgyptDateInfo(options.dateParam, {
    autoReset,
    cutoff,
    nextDay
  });
  const arabicWeekday = options.dayParam || dateInfo.arabicWeekday;
  const formattedDate = dateInfo.formattedDate;
  const fullTitle = `${title} ${arabicWeekday} ${formattedDate}`;

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Roster Report", {
    views: [{ showGridLines: true }]
  });

  worksheet.columns = [
    { key: "id", width: 18 },
    { key: "timestamp", width: 22 },
    { key: "arabicName", width: 35 },
    { key: "speciality", width: 25 },
    { key: "shift", width: 22 },
    { key: "mobileNumber", width: 22 }
  ];

  for (let r = 1; r <= 5; r++) {
    worksheet.getRow(r).height = 25;
  }

  worksheet.mergeCells(2, 1, 4, 6);
  const titleCell = worksheet.getCell("A2");
  titleCell.value = fullTitle;
  titleCell.font = { name: "Segoe UI", size: 16, bold: true, color: { argb: "FF063B30" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };

  const headerImgB64 = getHeaderBgBase64();
  if (headerImgB64) {
    const imgId = workbook.addImage({
      base64: headerImgB64,
      extension: "png"
    });
    worksheet.addImage(imgId, "A1:F5");
  }

  worksheet.getRow(6).height = 10;

  const headerRow = worksheet.getRow(7);
  headerRow.height = 32;
  headerRow.values = ["ID", "Timestamp", "Arabic name", "Speciality", "shift", "Phone Number"];
  headerRow.eachCell((cell) => {
    cell.font = { name: "Segoe UI", color: { argb: "FF063B30" }, bold: true, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF6EE7B7" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      top: { style: "thin", color: { argb: "FF34D399" } },
      left: { style: "thin", color: { argb: "FF34D399" } },
      bottom: { style: "thin", color: { argb: "FF34D399" } },
      right: { style: "thin", color: { argb: "FF34D399" } }
    };
  });

  // Group by specialty
  const grouped: { [key: string]: CheckIn[] } = {};
  checkins.forEach((c) => {
    if (!grouped[c.department]) grouped[c.department] = [];
    grouped[c.department].push(c);
  });

  let currentRowNum = 8;
  Object.keys(grouped).forEach((dept) => {
    const sepRow = worksheet.getRow(currentRowNum);
    sepRow.height = 26;
    worksheet.mergeCells(currentRowNum, 1, currentRowNum, 6);
    sepRow.getCell(1).value = `■ ${dept} ■`;
    sepRow.eachCell((cell) => {
      cell.font = { name: "Segoe UI", color: { argb: "FF063B30" }, bold: true, size: 11 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFA7F3D0" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = {
        top: { style: "thin", color: { argb: "FF6EE7B7" } },
        left: { style: "thin", color: { argb: "FF6EE7B7" } },
        bottom: { style: "thin", color: { argb: "FF6EE7B7" } },
        right: { style: "thin", color: { argb: "FF6EE7B7" } }
      };
    });
    currentRowNum++;

    grouped[dept].forEach((c, idx) => {
      const row = worksheet.getRow(currentRowNum);
      row.height = 22;
      row.values = [
        c.id,
        formatTimestampForDisplay(c.timestamp),
        c.doctorArabicName,
        c.department,
        Array.isArray(c.shifts) ? c.shifts.join(" + ") : (c.shifts || ""),
        c.mobileNumber || "N/A"
      ];
      const isEven = idx % 2 === 0;
      const rowBgColor = isEven ? "FFFFFFFF" : "FFF0FDF9";
      row.eachCell((cell, colNumber) => {
        cell.font = { name: "Segoe UI", color: { argb: "FF063B30" }, bold: colNumber !== 2, size: 10 };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowBgColor } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = {
          top: { style: "thin", color: { argb: "FFCBDAD5" } },
          left: { style: "thin", color: { argb: "FFCBDAD5" } },
          bottom: { style: "thin", color: { argb: "FFCBDAD5" } },
          right: { style: "thin", color: { argb: "FFCBDAD5" } }
        };
      });
      currentRowNum++;
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return {
    buffer: Buffer.from(buffer),
    fileName: `Physician_Checkins_${dateInfo.isoDate}.xlsx`,
    dateInfo,
    arabicWeekday,
    formattedDate,
    totalCheckins: checkins.length,
    departmentsCount: Object.keys(grouped).length
  };
}

// Server-side daily sheet downloadable endpoint with Node.js backend parameters
app.get(["/api/download/daily-sheet", "/download/daily-sheet"], async (req, res) => {
  try {
    const dateParam = typeof req.query.date === "string" ? req.query.date.trim() : undefined;
    const dayParam = typeof req.query.day === "string" ? req.query.day.trim() : undefined;
    const titleParam = typeof req.query.title === "string" ? req.query.title.trim() : undefined;
    const autoReset = req.query.autoReset !== "false";
    const cutoff = typeof req.query.cutoff === "string" ? req.query.cutoff.trim() : "18:30";
    const nextDay = req.query.nextDay === "true" || req.query.afterReset === "true";

    const result = await buildDailySheetWorkbook({
      dateParam,
      dayParam,
      titleParam,
      autoReset,
      cutoff,
      nextDay
    });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${result.fileName}"`);
    res.send(result.buffer);
  } catch (err: any) {
    console.error("Error generating server daily sheet:", err);
    res.status(500).json({ error: "Failed to generate daily sheet", message: err?.message });
  }
});

// Helper to parse and normalize multiple comma-separated WhatsApp Group IDs
function parseAndNormalizeGroupIds(raw: string): string[] {
  return raw
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
    .map(id => {
      // Strip everything after first '@' to handle unnormalized inputs or accidental duplicates
      const cleanNum = id.replace(/@.*$/, "").trim();
      return `${cleanNum}@g.us`;
    })
    .filter((id, idx, arr) => arr.indexOf(id) === idx);
}

// Helper function to dispatch daily sheet to WhatsApp via Green-API
async function sendDailySheetToWhatsApp(options: { targetDate?: string; customCaption?: string } = {}) {
  const idInstance = process.env.GREEN_API_ID_INSTANCE?.trim();
  const apiTokenInstance = process.env.GREEN_API_API_TOKEN_INSTANCE?.trim();
  const rawGroupId = process.env.WHATSAPP_GROUP_ID?.trim();

  if (!idInstance || !apiTokenInstance || !rawGroupId) {
    throw new Error(
      "WhatsApp credentials incomplete. Please set GREEN_API_ID_INSTANCE, GREEN_API_API_TOKEN_INSTANCE, and WHATSAPP_GROUP_ID in environment variables."
    );
  }

  const targetChatIds = parseAndNormalizeGroupIds(rawGroupId);
  if (targetChatIds.length === 0) {
    throw new Error("No valid WhatsApp group IDs found in WHATSAPP_GROUP_ID.");
  }

  const { buffer, fileName, arabicWeekday, formattedDate, totalCheckins, departmentsCount } =
    await buildDailySheetWorkbook({ dateParam: options.targetDate });

  // Clean, focused morning briefing message requested by user
  const caption =
    options.customCaption ||
    `📋 كشف الأطباء اليومي\n` +
    `📅 اليوم: ${arabicWeekday} (${formattedDate})\n` +
    `👨‍⚕️ إجمالي الأطباء المسجلين: ${totalCheckins}`;

  const url = `https://api.green-api.com/waInstance${idInstance}/sendFileByUpload/${apiTokenInstance}`;

  const dispatchResults: { targetChatId: string; success: boolean; idMessage?: string; error?: string }[] = [];

  for (const targetChatId of targetChatIds) {
    try {
      const formData = new FormData();
      formData.append("chatId", targetChatId);
      formData.append("fileName", fileName);
      formData.append("caption", caption);

      const fileBlob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      });
      formData.append("file", fileBlob, fileName);

      const response = await fetch(url, {
        method: "POST",
        body: formData
      });

      const responseData: any = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorDetails = typeof responseData === "object" ? JSON.stringify(responseData) : String(responseData);
        console.error(`Green-API returned error for group ${targetChatId} (${response.status}): ${errorDetails}`);
        dispatchResults.push({ targetChatId, success: false, error: errorDetails });
      } else {
        dispatchResults.push({
          targetChatId,
          success: true,
          idMessage: responseData?.idMessage || null
        });
      }
    } catch (err: any) {
      console.error(`Failed to send daily sheet to group ${targetChatId}:`, err);
      dispatchResults.push({ targetChatId, success: false, error: err?.message || String(err) });
    }
  }

  const anySuccess = dispatchResults.some(r => r.success);
  if (!anySuccess && dispatchResults.length > 0) {
    throw new Error(`Failed to deliver to any WhatsApp group: ${JSON.stringify(dispatchResults)}`);
  }

  return {
    success: anySuccess,
    fileName,
    targetChatIds,
    totalCheckins,
    departmentsCount,
    formattedDate,
    results: dispatchResults
  };
}

// WhatsApp configuration status check endpoint
app.get(["/api/whatsapp/status", "/whatsapp/status"], (req, res) => {
  const hasInstanceId = Boolean(process.env.GREEN_API_ID_INSTANCE?.trim());
  const hasToken = Boolean(process.env.GREEN_API_API_TOKEN_INSTANCE?.trim());
  const rawGroupId = process.env.WHATSAPP_GROUP_ID?.trim() || "";
  const groups = parseAndNormalizeGroupIds(rawGroupId);
  const isConfigured = hasInstanceId && hasToken && groups.length > 0;

  res.json({
    configured: isConfigured,
    hasInstanceId,
    hasToken,
    groupsCount: groups.length,
    groups
  });
});

// Manual UI trigger endpoint: POST /api/whatsapp/send-daily-sheet
app.post(["/api/whatsapp/send-daily-sheet", "/whatsapp/send-daily-sheet"], async (req, res) => {
  try {
    const targetDate = typeof req.body?.targetDate === "string" ? req.body.targetDate.trim() : undefined;
    const result = await sendDailySheetToWhatsApp({ targetDate });
    res.json({
      success: true,
      message: `Daily sheet successfully delivered to WhatsApp (${result.targetChatIds.length} group${result.targetChatIds.length > 1 ? "s" : ""})`,
      data: result
    });
  } catch (err: any) {
    console.error("Manual WhatsApp daily sheet dispatch failed:", err);
    res.status(500).json({
      success: false,
      error: "Failed to send daily sheet to WhatsApp",
      message: err?.message || String(err)
    });
  }
});

// Vercel Cron automated scheduled endpoint: GET /api/cron/send-daily-sheet
app.get(["/api/cron/send-daily-sheet", "/cron/send-daily-sheet"], async (req, res) => {
  try {
    // Optional CRON_SECRET verification
    const cronSecret = process.env.CRON_SECRET?.trim();
    const authHeader = req.headers.authorization;
    const isVercelCron = req.headers["x-vercel-cron"] === "1";

    if (cronSecret && !isVercelCron && authHeader !== `Bearer ${cronSecret}`) {
      console.warn("Unauthorized attempt to invoke cron endpoint /api/cron/send-daily-sheet");
      return res.status(401).json({ error: "Unauthorized cron execution" });
    }

    console.log(`[Vercel Cron] Triggering automated daily sheet dispatch at ${new Date().toISOString()}...`);
    const result = await sendDailySheetToWhatsApp();
    console.log("[Vercel Cron] Daily sheet sent successfully:", result);

    res.json({
      success: true,
      invokedAt: new Date().toISOString(),
      result
    });
  } catch (err: any) {
    console.error("[Vercel Cron] Automated daily sheet dispatch failed:", err);
    res.status(500).json({
      success: false,
      error: "Automated daily sheet dispatch failed",
      message: err?.message || String(err)
    });
  }
});


// Helper for formatting timestamp in server
function formatTimestampForDisplay(timestampStr: string): string {
  try {
    const d = new Date(timestampStr);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const year = String(d.getFullYear()).slice(-2);
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${month}/${day}/${year} ${hours}:${minutes}`;
  } catch {
    return timestampStr;
  }
}

// Server-side monthly sheet downloadable endpoint with Node.js backend parameters
app.get(["/api/download/monthly-sheet", "/download/monthly-sheet"], async (req, res) => {
  try {
    const rawMonthly = await readMonthlyCheckIns();
    const monthlyData = rawMonthly.map(c => enrichCheckIn(c));
    const titleParam = typeof req.query.title === "string" ? req.query.title.trim() : "الأطباء المتواجدين عن يوم";
    const workbook = new ExcelJS.Workbook();
    const headerImgB64 = getHeaderBgBase64();

    if (monthlyData.length === 0) {
      const d = new Date();
      const dateInfo = getEgyptDateInfo(d);
      const sheetName = `${dateInfo.englishWeekday} ${dateInfo.isoDate}`;
      const worksheet = workbook.addWorksheet(sheetName, { views: [{ showGridLines: true }] });
      worksheet.columns = [
        { key: "id", width: 18 },
        { key: "timestamp", width: 22 },
        { key: "arabicName", width: 35 },
        { key: "speciality", width: 25 },
        { key: "shift", width: 22 },
        { key: "mobileNumber", width: 22 }
      ];
      for (let r = 1; r <= 5; r++) worksheet.getRow(r).height = 25;
      worksheet.mergeCells(2, 1, 4, 6);
      const titleCell = worksheet.getCell("A2");
      titleCell.value = `${titleParam} ${dateInfo.arabicWeekday} ${dateInfo.formattedDate}`;
      titleCell.font = { name: "Segoe UI", size: 16, bold: true, color: { argb: "FF063B30" } };
      titleCell.alignment = { horizontal: "center", vertical: "middle" };
      if (headerImgB64) {
        const imgId = workbook.addImage({ base64: headerImgB64, extension: "png" });
        worksheet.addImage(imgId, "A1:F5");
      }
      worksheet.getRow(6).height = 10;
      const headerRow = worksheet.getRow(7);
      headerRow.height = 32;
      headerRow.values = ["ID", "Timestamp", "Arabic name", "Speciality", "shift", "Phone Number"];
      headerRow.eachCell((cell) => {
        cell.font = { name: "Segoe UI", color: { argb: "FF063B30" }, bold: true, size: 11 };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF6EE7B7" } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = {
          top: { style: "thin", color: { argb: "FF34D399" } },
          left: { style: "thin", color: { argb: "FF34D399" } },
          bottom: { style: "thin", color: { argb: "FF34D399" } },
          right: { style: "thin", color: { argb: "FF34D399" } }
        };
      });
    } else {
      // Group by date with 7 PM transition rule
      const groupedByDate: { [key: string]: CheckIn[] } = {};
      const dateMetaMap: { [key: string]: { date: Date; sheetName: string } } = {};
      monthlyData.forEach((c) => {
        const d = new Date(c.timestamp);
        const hourStr = d.toLocaleTimeString("en-US", { timeZone: "Africa/Cairo", hour: "numeric", hour12: false });
        const hour = parseInt(hourStr, 10) || 0;
        const targetDate = new Date(d);
        if (hour >= 19) targetDate.setDate(targetDate.getDate() + 1);
        const meta = getEgyptDateInfo(targetDate);
        const sheetName = `${meta.englishWeekday} ${meta.isoDate}`;
        if (!groupedByDate[sheetName]) {
          groupedByDate[sheetName] = [];
          dateMetaMap[sheetName] = { date: targetDate, sheetName };
        }
        groupedByDate[sheetName].push(c);
      });

      const sortedSheetNames = Object.keys(groupedByDate).sort((a, b) => {
        return (dateMetaMap[a]?.date.getTime() || 0) - (dateMetaMap[b]?.date.getTime() || 0);
      });

      sortedSheetNames.forEach((sheetName) => {
        const dayCheckins = groupedByDate[sheetName];
        const tabDateMeta = dateMetaMap[sheetName] ? getEgyptDateInfo(dateMetaMap[sheetName].date) : getEgyptDateInfo();
        const tabTitle = `${titleParam} ${tabDateMeta.arabicWeekday} ${tabDateMeta.formattedDate}`;

        const worksheet = workbook.addWorksheet(sheetName, { views: [{ showGridLines: true }] });
        worksheet.columns = [
          { key: "id", width: 18 },
          { key: "timestamp", width: 22 },
          { key: "arabicName", width: 35 },
          { key: "speciality", width: 25 },
          { key: "shift", width: 22 },
          { key: "mobileNumber", width: 22 }
        ];

        for (let r = 1; r <= 5; r++) worksheet.getRow(r).height = 25;
        worksheet.mergeCells(2, 1, 4, 6);
        const titleCell = worksheet.getCell("A2");
        titleCell.value = tabTitle;
        titleCell.font = { name: "Segoe UI", size: 16, bold: true, color: { argb: "FF063B30" } };
        titleCell.alignment = { horizontal: "center", vertical: "middle" };

        if (headerImgB64) {
          const imgId = workbook.addImage({ base64: headerImgB64, extension: "png" });
          worksheet.addImage(imgId, "A1:F5");
        }

        worksheet.getRow(6).height = 10;
        const headerRow = worksheet.getRow(7);
        headerRow.height = 32;
        headerRow.values = ["ID", "Timestamp", "Arabic name", "Speciality", "shift", "Phone Number"];
        headerRow.eachCell((cell) => {
          cell.font = { name: "Segoe UI", color: { argb: "FF063B30" }, bold: true, size: 11 };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF6EE7B7" } };
          cell.alignment = { horizontal: "center", vertical: "middle" };
          cell.border = {
            top: { style: "thin", color: { argb: "FF34D399" } },
            left: { style: "thin", color: { argb: "FF34D399" } },
            bottom: { style: "thin", color: { argb: "FF34D399" } },
            right: { style: "thin", color: { argb: "FF34D399" } }
          };
        });

        const grouped: { [key: string]: CheckIn[] } = {};
        dayCheckins.forEach((c) => {
          if (!grouped[c.department]) grouped[c.department] = [];
          grouped[c.department].push(c);
        });

        let currentRowNum = 8;
        Object.keys(grouped).forEach((dept) => {
          const sepRow = worksheet.getRow(currentRowNum);
          sepRow.height = 26;
          worksheet.mergeCells(currentRowNum, 1, currentRowNum, 6);
          sepRow.getCell(1).value = `■ ${dept} ■`;
          sepRow.eachCell((cell) => {
            cell.font = { name: "Segoe UI", color: { argb: "FF063B30" }, bold: true, size: 11 };
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFA7F3D0" } };
            cell.alignment = { horizontal: "center", vertical: "middle" };
            cell.border = {
              top: { style: "thin", color: { argb: "FF6EE7B7" } },
              left: { style: "thin", color: { argb: "FF6EE7B7" } },
              bottom: { style: "thin", color: { argb: "FF6EE7B7" } },
              right: { style: "thin", color: { argb: "FF6EE7B7" } }
            };
          });
          currentRowNum++;

          grouped[dept].forEach((c, idx) => {
            const row = worksheet.getRow(currentRowNum);
            row.height = 22;
            row.values = [
              c.id,
              formatTimestampForDisplay(c.timestamp),
              c.doctorArabicName,
              c.department,
              Array.isArray(c.shifts) ? c.shifts.join(" + ") : (c.shifts || ""),
              c.mobileNumber || "N/A"
            ];
            const isEven = idx % 2 === 0;
            const rowBgColor = isEven ? "FFFFFFFF" : "FFF0FDF9";
            row.eachCell((cell, colNumber) => {
              cell.font = { name: "Segoe UI", color: { argb: "FF063B30" }, bold: colNumber !== 2, size: 10 };
              cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowBgColor } };
              cell.alignment = { horizontal: "center", vertical: "middle" };
              cell.border = {
                top: { style: "thin", color: { argb: "FFCBDAD5" } },
                left: { style: "thin", color: { argb: "FFCBDAD5" } },
                bottom: { style: "thin", color: { argb: "FFCBDAD5" } },
                right: { style: "thin", color: { argb: "FFCBDAD5" } }
              };
            });
            currentRowNum++;
          });
        });
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const todayInfo = getEgyptDateInfo();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="Monthly_Cumulative_Roster_${todayInfo.isoDate}.xlsx"`);
    res.send(Buffer.from(buffer));
  } catch (err: any) {
    console.error("Error generating server monthly sheet:", err);
    res.status(500).json({ error: "Failed to generate monthly sheet", message: err?.message });
  }
});

app.get(["/api/doctors", "/doctors"], async (req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  if (req.query.refresh === "true" || NORMALIZED_DOCTORS_DATABASE.length === 0 || lastDoctorsRefreshTime === 0) {
    try {
      await loadEnrichedDoctorsDatabase(true);
    } catch (err) {
      console.error("Error refreshing doctors database on GET:", err);
    }
  }
  const enriched = NORMALIZED_DOCTORS_DATABASE.map(doc => {
    const idKey = normalizeId(doc.id);
    const nameKey = normalizeName(doc.name);
    const mobileNumber = doc.mobileNumber || mobileNumbersByCodeMap.get(idKey) || mobileNumbersByNameMap.get(nameKey) || "";
    return { ...doc, mobileNumber };
  });
  res.json(enriched);
});

// Search doctors by English name, Arabic name, or ID
app.get("/api/doctors/search", (req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  const query = String(req.query.q || "").trim();
  if (!query) {
    return res.json([]);
  }

  const results = searchDoctors(query, 20);
  res.json(results);
});

// Get a single doctor by ID, English name, or Arabic name fallback
app.get(["/api/doctors/:id", "/doctors/:id"], (req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  const { id } = req.params;
  const lookupId = id.trim();
  const normLook = normalizeId(lookupId);
  const normName = normalizeName(lookupId);
  const normAra = normalizeArabic(lookupId);
  
  // 1. O(1) exact ID lookup
  let doctor = DOCTORS_BY_ID_MAP.get(normLook) || DOCTORS_BY_ID_MAP.get(lookupId.toLowerCase());

  // 2. O(1) exact Name / Arabic lookup
  if (!doctor && normName) {
    doctor = DOCTORS_BY_NAME_MAP.get(normName);
  }
  if (!doctor && normAra) {
    doctor = DOCTORS_BY_NAME_MAP.get(normAra);
  }

  // 3. Fallback to ranked search
  if (!doctor) {
    const searchResults = searchDoctors(lookupId, 1);
    if (searchResults.length > 0) {
      doctor = searchResults[0];
    }
  }

  if (doctor && doctor.isActive !== false && normalizeSpecialty(doctor.department || "").active && !isDoctorDeleted(doctor.id, doctor.name, doctor.arabicName)) {
    const idKey = normalizeId(doctor.id);
    const nameKey = normalizeName(doctor.name);
    const mobileNumber = doctor.mobileNumber || mobileNumbersByCodeMap.get(idKey) || mobileNumbersByNameMap.get(nameKey) || "";
    res.json({ 
      found: true, 
      doctor: {
        ...doctor,
        mobileNumber
      } 
    });
  } else {
    res.json({ found: false });
  }
});

// Get current check-ins
// Get current check-ins
app.get(["/api/checkins", "/checkins"], async (req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  try {
    const list = await readCheckIns();
    res.json(list.map(c => enrichCheckIn(c)));
  } catch (err) {
    res.status(500).json({ error: "Failed to read check-ins." });
  }
});

// Get cumulative monthly check-ins (30-day rolling window) with active daily check-ins merged in
app.get(["/api/monthly-checkins", "/monthly-checkins", "/api/weekly-checkins", "/weekly-checkins"], async (req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  try {
    const monthlyList = await readMonthlyCheckIns();
    const dailyList = await readCheckIns();

    const mergedMap = new Map<string, CheckIn>();

    // First populate with 30-day rolling monthly check-ins
    monthlyList.forEach(c => {
      const enriched = enrichCheckIn(c);
      const dateStr = getEgyptDateStr(enriched.timestamp);
      const key = `${enriched.id.toLowerCase()}_${dateStr}`;
      mergedMap.set(key, enriched);
    });

    // Then overwrite or add with daily check-ins (ensuring latest data for today)
    dailyList.forEach(c => {
      const enriched = enrichCheckIn(c);
      const dateStr = getEgyptDateStr(enriched.timestamp);
      const key = `${enriched.id.toLowerCase()}_${dateStr}`;
      mergedMap.set(key, enriched);
    });

    res.json(Array.from(mergedMap.values()));
  } catch (err) {
    console.error("Error fetching merged monthly check-ins:", err);
    res.status(500).json({ error: "Failed to read monthly check-ins." });
  }
});

// Submit a check-in
app.post(["/api/checkins", "/checkins"], async (req, res) => {
  const { id, doctorName, doctorArabicName, department, shifts } = req.body;

  if (!id || !doctorName || !doctorArabicName || !department) {
    return res.status(400).json({ error: "Missing required fields: ID, names, or department." });
  }

  if (!shifts || !Array.isArray(shifts) || shifts.length === 0) {
    return res.status(400).json({ error: "Please select at least one shift." });
  }

  let finalShifts = [...shifts];
  
  // If the doctor chooses all 3 shifts, save the output as "24 shift"
  if (finalShifts.length === 3 && 
      finalShifts.includes("Morning shift") && 
      finalShifts.includes("Evening shift") && 
      finalShifts.includes("Night shift")) {
    finalShifts = ["24 shift"];
  }

  if (finalShifts.length > 3) {
    return res.status(400).json({ error: "You can select a maximum of 3 shifts." });
  }

  // Validate shift values
  const validShifts = ["Morning shift", "Long shift", "Evening shift", "Night shift", "24 shift"];
  const invalidShifts = finalShifts.filter(s => !validShifts.includes(s));
  if (invalidShifts.length > 0) {
    return res.status(400).json({ error: `Invalid shift selected: ${invalidShifts.join(", ")}` });
  }

  // Create new check-in with normalized department and look up mobile number
  const cleanId = id.trim().replace(/^(emp\.|emp)/i, "");
  const idKey = normalizeId(cleanId);
  const nameKey = normalizeName(doctorName);
  const docInDb = DOCTORS_BY_ID_MAP.get(idKey) || DOCTORS_BY_NAME_MAP.get(nameKey);

  // Detect if incoming Arabic name lacks Arabic characters while authoritative DB has real Arabic
  let resolvedArabicName = (doctorArabicName || "").trim();
  const hasArabic = (s: string) => /[\u0600-\u06FF]/.test(s);
  if (docInDb?.arabicName && hasArabic(docInDb.arabicName) && !hasArabic(resolvedArabicName)) {
    resolvedArabicName = docInDb.arabicName;
  }

  const mobileNumber = (req.body.mobileNumber ? String(req.body.mobileNumber).trim() : "") ||
                       (docInDb?.mobileNumber || "") ||
                       mobileNumbersByCodeMap.get(idKey) ||
                       mobileNumbersByNameMap.get(nameKey) ||
                       "";

  const newCheckIn: CheckIn = {
    id: cleanId,
    doctorName: (docInDb?.name || doctorName).trim(),
    doctorArabicName: resolvedArabicName || (docInDb?.arabicName || doctorName).trim(),
    department: normalizeDepartment(department),
    shifts: finalShifts,
    timestamp: new Date().toISOString(),
    mobileNumber
  };

  try {
    // Add to daily AND monthly 30-day cumulative check-ins
    await addCheckIn(newCheckIn);
    await addMonthlyCheckIn(newCheckIn);
    res.status(201).json({ success: true, checkIn: newCheckIn });
  } catch (err) {
    res.status(500).json({ error: "Failed to register check-in." });
  }
});

// Remove a check-in
app.delete(["/api/checkins/:id", "/checkins/:id"], async (req, res) => {
  const { id } = req.params;
  try {
    // Find the daily check-in first to get its timestamp for matching monthly record deletion
    const dailyCheckIns = await readCheckIns();
    const targetCheckIn = dailyCheckIns.find(c => c.id.toLowerCase() === id.toLowerCase());

    const deleted = await deleteCheckIn(id);
    if (!deleted) {
      return res.status(404).json({ error: "Check-in not found." });
    }

    if (targetCheckIn) {
      await deleteMonthlyCheckIn(targetCheckIn.id, targetCheckIn.timestamp);
    }

    res.json({ success: true, message: "Check-in deleted from daily and monthly sheets." });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete check-in." });
  }
});

// Clear all active daily check-ins (leaves monthly check-ins intact!)
app.post(["/api/checkins/clear", "/checkins/clear"], async (req, res) => {
  try {
    await clearAllCheckIns();
    res.json({ success: true, message: "All daily check-ins cleared." });
  } catch (err) {
    res.status(500).json({ error: "Failed to clear check-ins." });
  }
});

// Clear all monthly check-ins (with backward compatible clear-weekly route)
app.post(["/api/checkins/clear-monthly", "/checkins/clear-monthly", "/api/checkins/clear-weekly", "/checkins/clear-weekly"], async (req, res) => {
  try {
    await clearMonthlyCheckIns();
    res.json({ success: true, message: "All cumulative monthly check-ins cleared." });
  } catch (err) {
    res.status(500).json({ error: "Failed to clear monthly check-ins." });
  }
});

// Add/Update doctor phone number in persistent database
app.post("/api/doctors/phone", async (req, res) => {
  const { id, mobileNumber } = req.body;
  if (!id) {
    return res.status(400).json({ error: "Doctor ID is required." });
  }
  try {
    await saveCustomDoctorPhone(id, mobileNumber || "");
    res.json({ success: true, message: "Doctor phone number updated in persistent database." });
  } catch (err) {
    res.status(500).json({ error: "Failed to update doctor phone number." });
  }
});

// Edit check-in doctor's phone number (and update persistent database)
app.put("/api/checkins/:id/phone", async (req, res) => {
  const { id } = req.params;
  const { mobileNumber } = req.body;
  try {
    // Find the daily check-in
    const dailyCheckIns = await readCheckIns();
    const targetCheckIn = dailyCheckIns.find(c => c.id.toLowerCase() === id.toLowerCase());
    if (!targetCheckIn) {
      return res.status(404).json({ error: "Active check-in not found." });
    }

    // Update check-in mobile number
    const updatedCheckIn = {
      ...targetCheckIn,
      mobileNumber: mobileNumber || ""
    };

    // Update daily AND weekly check-in records!
    await addCheckIn(updatedCheckIn);
    await addWeeklyCheckIn(updatedCheckIn);

    // Also save to the persistent doctors database so future check-ins reuse it
    await saveCustomDoctorPhone(id, mobileNumber || "");

    res.json({ success: true, message: "Checked-in doctor phone number updated successfully." });
  } catch (err) {
    res.status(500).json({ error: "Failed to update checked-in doctor phone number." });
  }
});

// Save or update doctor in persistent database (IDs, names, department, phone)
app.post("/api/doctors/upsert", async (req, res) => {
  const { originalId, originalName, id, name, arabicName, department, mobileNumber } = req.body;
  if (!id || !name) {
    return res.status(400).json({ error: "ID and English Name are required." });
  }
  try {
    await saveCustomDoctorRecord({
      originalId: originalId || "",
      originalName: originalName || "",
      id,
      name,
      arabicName: arabicName || name,
      department: department || "General",
      mobileNumber: mobileNumber || ""
    });
    res.json({ success: true, message: "Doctor record saved successfully in persistent database." });
  } catch (err: any) {
    console.error("Error in /api/doctors/upsert:", err);
    res.status(500).json({ error: err?.message || "Failed to save doctor record." });
  }
});

// Delete doctor from persistent database
app.delete("/api/doctors/delete/:id", async (req, res) => {
  const { id } = req.params;
  const name = typeof req.query.name === "string" ? req.query.name : undefined;
  if (!id) {
    return res.status(400).json({ error: "Doctor ID is required." });
  }
  try {
    await deleteCustomDoctorRecord(id, name);
    res.json({ success: true, message: "Doctor removed from persistent database." });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete doctor record." });
  }
});

// Batch Delete doctors from persistent database
app.post("/api/doctors/delete-batch", async (req, res) => {
  const { ids, items } = req.body;
  const listToDelete = items || ids;
  if (!listToDelete || !Array.isArray(listToDelete) || listToDelete.length === 0) {
    return res.status(400).json({ error: "An array of Doctor IDs or items is required." });
  }
  try {
    const deletedCount = await deleteCustomDoctorsBatch(listToDelete);
    res.json({ success: true, message: `${deletedCount} physician(s) removed from database successfully.` });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete selected doctor records." });
  }
});

// Supabase Connection Status and Table Counts
app.get("/api/supabase/status", async (req, res) => {
  const config = getSupabaseConfig();
  if (!config.isConfigured) {
    return res.json({
      configured: false,
      message: "Supabase credentials not configured in environment variables (SUPABASE_URL and SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY).",
      counts: null,
    });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return res.json({
      configured: false,
      message: "Failed to initialize Supabase client.",
      counts: null,
    });
  }

  try {
    const [
      doctorsRes,
      checkinsRes,
      monthlyRes,
      weeklyRes,
      customDocsRes,
      customPhonesRes,
      deletedDocsRes,
    ] = await Promise.all([
      supabase.from("doctors").select("*", { count: "exact", head: true }),
      supabase.from("checkins").select("*", { count: "exact", head: true }),
      supabase.from("monthly_checkins").select("*", { count: "exact", head: true }),
      supabase.from("weekly_checkins").select("*", { count: "exact", head: true }),
      supabase.from("custom_doctors").select("*", { count: "exact", head: true }),
      supabase.from("custom_doctor_phones").select("*", { count: "exact", head: true }),
      supabase.from("deleted_doctors").select("*", { count: "exact", head: true }),
    ]);

    const hasError =
      doctorsRes.error ||
      checkinsRes.error ||
      (monthlyRes.error && weeklyRes.error) ||
      customDocsRes.error ||
      customPhonesRes.error ||
      deletedDocsRes.error;

    return res.json({
      configured: true,
      url: config.url,
      connected: !hasError,
      errors: hasError
        ? {
            doctors: doctorsRes.error?.message,
            checkins: checkinsRes.error?.message,
            monthly_checkins: monthlyRes.error?.message,
            weekly_checkins: weeklyRes.error?.message,
            custom_doctors: customDocsRes.error?.message,
            custom_doctor_phones: customPhonesRes.error?.message,
            deleted_doctors: deletedDocsRes.error?.message,
          }
        : null,
      counts: {
        doctors: doctorsRes.count ?? 0,
        checkins: checkinsRes.count ?? 0,
        monthly_checkins: monthlyRes.count ?? weeklyRes.count ?? 0,
        weekly_checkins: weeklyRes.count ?? 0,
        custom_doctors: customDocsRes.count ?? 0,
        custom_doctor_phones: customPhonesRes.count ?? 0,
        deleted_doctors: deletedDocsRes.count ?? 0,
      },
    });
  } catch (err: any) {
    return res.status(500).json({
      configured: true,
      url: config.url,
      connected: false,
      error: err.message || "Failed to query Supabase status",
    });
  }
});

// Save and update Supabase configuration in runtime and .env
app.post("/api/supabase/config", async (req, res) => {
  const { url, key, serviceRoleKey } = req.body;
  if (!url || !key) {
    return res.status(400).json({ error: "Supabase URL and Key are required." });
  }
  try {
    const cleanUrl = String(url).trim();
    const cleanKey = String(key).trim();
    const cleanRoleKey = serviceRoleKey ? String(serviceRoleKey).trim() : "";

    process.env.SUPABASE_URL = cleanUrl;
    process.env.SUPABASE_ANON_KEY = cleanKey;
    if (cleanRoleKey) {
      process.env.SUPABASE_SERVICE_ROLE_KEY = cleanRoleKey;
    }

    // Save to .env file if running in Node environment
    try {
      const envPath = path.join(process.cwd(), ".env");
      let envContent = "";
      if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, "utf-8");
      }
      const setVar = (content: string, k: string, v: string) => {
        const regex = new RegExp(`^${k}=.*$`, "m");
        if (regex.test(content)) {
          return content.replace(regex, `${k}="${v}"`);
        }
        return `${content.trim()}\n${k}="${v}"\n`;
      };
      envContent = setVar(envContent, "SUPABASE_URL", cleanUrl);
      envContent = setVar(envContent, "SUPABASE_ANON_KEY", cleanKey);
      if (cleanRoleKey) {
        envContent = setVar(envContent, "SUPABASE_SERVICE_ROLE_KEY", cleanRoleKey);
      }
      fs.writeFileSync(envPath, envContent.trim() + "\n", "utf-8");
    } catch (e) {
      console.warn("[Elite Server] Could not write .env file:", e);
    }

    // Reset supabase instance to pick up new config
    resetSupabaseClient();
    const client = getSupabase();
    if (!client) {
      return res.status(500).json({ error: "Failed to initialize Supabase client." });
    }

    // Test query
    const testRes = await client.from("doctors").select("id", { count: "exact", head: true });
    if (testRes.error) {
      return res.json({
        success: true,
        warning: `Credentials saved, but test query returned: ${testRes.error.message}. Please run the SQL schema migration in Supabase if tables do not exist yet.`,
        connected: false,
      });
    }

    // Re-synchronize memory and disk with Supabase
    await loadEnrichedDoctorsDatabase(true);

    return res.json({
      success: true,
      message: "Supabase connected and verified successfully!",
      connected: true,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to configure Supabase." });
  }
});

// Trigger Full Database Migration to Supabase
app.post("/api/supabase/migrate", async (req, res) => {
  const config = getSupabaseConfig();
  if (!config.isConfigured) {
    return res.status(400).json({
      success: false,
      error: "Supabase environment variables (SUPABASE_URL and SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY) are not configured.",
    });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return res.status(500).json({
      success: false,
      error: "Supabase client failed to initialize.",
    });
  }

  try {
    const results: any = {};

    // 1. Doctors Database - Deduplicate by unique primary key ID to guarantee no duplicate IDs in any batch
    const uniqueDoctorMap = new Map<string, any>();
    for (const d of NORMALIZED_DOCTORS_DATABASE) {
      const cleanId = String(d.id || "").trim();
      if (!cleanId) continue;
      uniqueDoctorMap.set(cleanId, {
        id: cleanId,
        name: d.name ? String(d.name).trim() : "",
        arabic_name: d.arabicName ? String(d.arabicName).trim() : (d.name ? String(d.name).trim() : ""),
        department: normalizeDepartment(cleanDepartment(d.department || "General")),
        mobile_number: d.mobileNumber ? String(d.mobileNumber).trim() : "",
        is_active: true,
      });
    }

    const doctorRecords = Array.from(uniqueDoctorMap.values());
    const BATCH_SIZE = 100;
    let insertedDoctors = 0;
    for (let i = 0; i < doctorRecords.length; i += BATCH_SIZE) {
      const batch = doctorRecords.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from("doctors").upsert(batch, { onConflict: "id" });
      if (error) {
        if (error.message && error.message.toLowerCase().includes("permission denied")) {
          throw new Error(`Permission denied for table 'doctors'. Please run the updated SQL Schema from the 'Supabase Migration' tab in your Supabase SQL Editor (to grant table access to anon and authenticated roles) or provide the SUPABASE_SERVICE_ROLE_KEY.`);
        }
        throw new Error(`Failed to upsert doctors table in Supabase: ${error.message}`);
      }
      insertedDoctors += batch.length;
    }
    results.doctors = insertedDoctors;

    // 2. Custom Doctors - Deduplicate by ID
    const customDocs = await loadCustomDoctors();
    if (customDocs.length > 0) {
      const uniqueCustomMap = new Map<string, any>();
      for (const c of customDocs) {
        const cleanId = String(c.id || "").trim();
        if (!cleanId) continue;
        uniqueCustomMap.set(cleanId, {
          id: cleanId,
          name: c.name ? String(c.name).trim() : "",
          arabic_name: c.arabicName ? String(c.arabicName).trim() : (c.name ? String(c.name).trim() : ""),
          department: c.department ? String(c.department).trim() : "General",
          mobile_number: c.mobileNumber ? String(c.mobileNumber).trim() : "",
          original_id: c.originalId ? String(c.originalId).trim() : "",
          updated_at: c.updatedAt || new Date().toISOString(),
        });
      }
      const formattedCustom = Array.from(uniqueCustomMap.values());
      const { error } = await supabase.from("custom_doctors").upsert(formattedCustom, { onConflict: "id" });
      if (error) throw new Error(`Failed to upsert custom_doctors in Supabase: ${error.message}`);
      results.custom_doctors = formattedCustom.length;
    } else {
      results.custom_doctors = 0;
    }

    // 3. Custom Doctor Phones - Deduplicate by ID
    const customPhones = await loadCustomDoctorsPhones();
    const uniquePhonesMap = new Map<string, any>();
    for (const [id, mobileNumber] of Object.entries(customPhones)) {
      const cleanId = String(id || "").trim();
      if (!cleanId) continue;
      uniquePhonesMap.set(cleanId, {
        id: cleanId,
        mobile_number: String(mobileNumber || "").trim(),
        updated_at: new Date().toISOString(),
      });
    }
    const phoneEntries = Array.from(uniquePhonesMap.values());
    if (phoneEntries.length > 0) {
      const { error } = await supabase.from("custom_doctor_phones").upsert(phoneEntries, { onConflict: "id" });
      if (error) throw new Error(`Failed to upsert custom_doctor_phones in Supabase: ${error.message}`);
      results.custom_doctor_phones = phoneEntries.length;
    } else {
      results.custom_doctor_phones = 0;
    }

    // 4. Deleted Doctors - Deduplicate by ID
    const deletedKeysSet = await loadDeletedDoctorsKeys();
    const uniqueDeletedMap = new Map<string, any>();
    for (const id of deletedKeysSet) {
      const cleanId = String(id || "").trim();
      if (!cleanId) continue;
      uniqueDeletedMap.set(cleanId, {
        id: cleanId,
        deleted_at: new Date().toISOString(),
      });
    }
    const deletedList = Array.from(uniqueDeletedMap.values());
    if (deletedList.length > 0) {
      const { error } = await supabase.from("deleted_doctors").upsert(deletedList, { onConflict: "id" });
      if (error) throw new Error(`Failed to upsert deleted_doctors in Supabase: ${error.message}`);
      results.deleted_doctors = deletedList.length;
    } else {
      results.deleted_doctors = 0;
    }

    // 5. Daily Check-ins - Deduplicate by doctor_id
    const dailyCheckins = readCheckInsLocal();
    if (dailyCheckins.length > 0) {
      await supabase.from("checkins").delete().neq("doctor_id", "__none__");
      const uniqueDaily = new Map<string, any>();
      for (const c of dailyCheckins) {
        const cleanId = String(c.id || "").trim();
        if (!cleanId) continue;
        uniqueDaily.set(cleanId.toLowerCase(), {
          doctor_id: cleanId,
          doctor_name: c.doctorName || "",
          doctor_arabic_name: c.doctorArabicName || c.doctorName || "",
          department: c.department || "General",
          shifts: Array.isArray(c.shifts) ? c.shifts : [],
          mobile_number: c.mobileNumber || "",
          checkin_timestamp: c.timestamp || new Date().toISOString(),
          checkin_date: getEgyptDateStr(c.timestamp || new Date().toISOString()),
        });
      }
      const formattedDaily = Array.from(uniqueDaily.values());
      const { error } = await supabase.from("checkins").upsert(formattedDaily, { onConflict: "doctor_id" });
      if (error) {
        // Fallback to insert
        const { error: insErr } = await supabase.from("checkins").insert(formattedDaily);
        if (insErr) throw new Error(`Failed to insert checkins in Supabase: ${insErr.message}`);
      }
      results.checkins = formattedDaily.length;
    } else {
      results.checkins = 0;
    }

    // 6. Monthly Check-ins (30-day rolling window) & Weekly Check-ins
    const monthlyCheckins = await pruneMonthlyCheckInsTo30Days(readMonthlyCheckInsLocal());
    if (monthlyCheckins.length > 0) {
      await Promise.all([
        supabase.from("monthly_checkins").delete().neq("doctor_id", "__none__"),
        supabase.from("weekly_checkins").delete().neq("doctor_id", "__none__"),
      ]);

      const uniqueMonthly = new Map<string, any>();
      for (const w of monthlyCheckins) {
        const cleanId = String(w.id || "").trim();
        if (!cleanId) continue;
        const ts = w.timestamp || new Date().toISOString();
        const dateStr = getEgyptDateStr(ts);
        const key = `${cleanId.toLowerCase()}_${dateStr}`;
        uniqueMonthly.set(key, {
          doctor_id: cleanId,
          doctor_name: w.doctorName || "",
          doctor_arabic_name: w.doctorArabicName || w.doctorName || "",
          department: w.department || "General",
          shifts: Array.isArray(w.shifts) ? w.shifts : [],
          mobile_number: w.mobileNumber || "",
          checkin_timestamp: ts,
          checkin_date: dateStr,
        });
      }
      const formattedMonthly = Array.from(uniqueMonthly.values());
      for (let i = 0; i < formattedMonthly.length; i += 100) {
        const batch = formattedMonthly.slice(i, i + 100);
        const { error: monErr } = await supabase.from("monthly_checkins").upsert(batch, { onConflict: "doctor_id,checkin_date" });
        if (monErr) {
          const { error: insErr } = await supabase.from("monthly_checkins").insert(batch);
          if (insErr) console.error("Warning: monthly_checkins insert:", insErr.message);
        }
        // Also keep legacy weekly table synchronized
        const { error: wkErr } = await supabase.from("weekly_checkins").upsert(batch, { onConflict: "doctor_id,checkin_date" });
        if (wkErr) {
          try {
            await supabase.from("weekly_checkins").insert(batch);
          } catch {}
        }
      }
      results.monthly_checkins = formattedMonthly.length;
      results.weekly_checkins = formattedMonthly.length;
    } else {
      results.monthly_checkins = 0;
      results.weekly_checkins = 0;
    }

    res.json({
      success: true,
      message: "Database migration to Supabase completed successfully!",
      results,
    });
  } catch (err: any) {
    console.error("[Supabase Migration Error]:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Database migration failed.",
    });
  }
});


// Serve Frontend using Vite or static assets
async function startServer() {
  // Non-blocking background delta sync with Supabase
  loadEnrichedDoctorsDatabase(true).catch(err => {
    console.warn("[Elite Server] Background doctors delta sync:", err);
  });

  // Periodically check and clean up expired check-ins every 30 seconds
  setInterval(() => {
    cleanupExpiredCheckIns().catch(err => {
      console.error("[Elite Server] Background cleanup check-ins failed:", err);
    });
  }, 30000);

  if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else if (!process.env.VERCEL) {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Only bind to app port if we are not deployed on Vercel as a serverless function
  if (!process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`[Elite Server] Hospital Check-In running on http://0.0.0.0:${PORT}`);
    });
  }
}

startServer();

export default app;
