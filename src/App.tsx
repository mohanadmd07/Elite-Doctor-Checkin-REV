import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Hospital,
  User,
  Clock,
  Search,
  CheckCircle,
  AlertCircle,
  Download,
  Trash2,
  Lock,
  Unlock,
  LogOut,
  Plus,
  Stethoscope,
  Users,
  Layers,
  ChevronRight,
  Info,
  Moon,
  Sunset,
  Sun,
  CalendarDays,
  FileSpreadsheet,
  X,
  HelpCircle,
  Phone,
  Loader2,
  Database,
  UserPlus,
  Edit,
  Copy,
  AlertTriangle,
  ShieldAlert,
  Sparkles,
  RefreshCw,
  UserCheck,
  Check,
  ExternalLink,
  Terminal,
  Server,
  Send
} from "lucide-react";
import { CANONICAL_SPECIALTIES, NEPHROLOGY_DOCTOR_IDS } from "./data/specialties.js";

export const SUPABASE_SQL_SCHEMA_TEXT = `-- ==============================================================================
-- ELITE HOSPITAL ATTENDANCE & PHYSICIAN SYSTEM - SUPABASE DATABASE MIGRATION
-- Run this complete script in the Supabase SQL Editor (SQL Editor -> New query -> Run)
-- ==============================================================================

-- 1. Master Doctors Database
CREATE TABLE IF NOT EXISTS public.doctors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    arabic_name TEXT,
    department TEXT NOT NULL DEFAULT 'General',
    mobile_number TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Daily Active Check-ins (Attendance Roster)
CREATE TABLE IF NOT EXISTS public.checkins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id TEXT NOT NULL,
    doctor_name TEXT NOT NULL,
    doctor_arabic_name TEXT,
    department TEXT NOT NULL,
    shifts TEXT[] NOT NULL DEFAULT '{}',
    mobile_number TEXT,
    checkin_timestamp TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    checkin_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. Monthly Cumulative Check-ins (Rolling 30-day attendance roster with FIFO sliding window)
CREATE TABLE IF NOT EXISTS public.monthly_checkins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id TEXT NOT NULL,
    doctor_name TEXT NOT NULL,
    doctor_arabic_name TEXT,
    department TEXT NOT NULL,
    shifts TEXT[] NOT NULL DEFAULT '{}',
    mobile_number TEXT,
    checkin_timestamp TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    checkin_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Ensure checkin_date exists on monthly_checkins
ALTER TABLE public.monthly_checkins ADD COLUMN IF NOT EXISTS checkin_date DATE NOT NULL DEFAULT CURRENT_DATE;

-- Backward compatibility for weekly_checkins table
CREATE TABLE IF NOT EXISTS public.weekly_checkins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id TEXT NOT NULL,
    doctor_name TEXT NOT NULL,
    doctor_arabic_name TEXT,
    department TEXT NOT NULL,
    shifts TEXT[] NOT NULL DEFAULT '{}',
    mobile_number TEXT,
    checkin_timestamp TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    checkin_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
ALTER TABLE public.weekly_checkins ADD COLUMN IF NOT EXISTS checkin_date DATE NOT NULL DEFAULT CURRENT_DATE;

-- 4. Custom Doctor Overrides (Persisted custom added or edited physicians)
CREATE TABLE IF NOT EXISTS public.custom_doctors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    arabic_name TEXT,
    department TEXT NOT NULL DEFAULT 'General',
    mobile_number TEXT,
    original_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5. Custom Doctor Phone Overrides
CREATE TABLE IF NOT EXISTS public.custom_doctor_phones (
    id TEXT PRIMARY KEY,
    mobile_number TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 6. Deleted Doctors (Blacklist of deleted master records)
CREATE TABLE IF NOT EXISTS public.deleted_doctors (
    id TEXT PRIMARY KEY,
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Indexes for fast querying, deduplication, and atomic operations
CREATE INDEX IF NOT EXISTS idx_doctors_name ON public.doctors (name);
CREATE INDEX IF NOT EXISTS idx_doctors_active ON public.doctors (is_active);
CREATE INDEX IF NOT EXISTS idx_doctors_active_dept_fast ON public.doctors (department) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_doctors_active_dept_name ON public.doctors (department, name) WHERE is_active = true;

-- Enforce canonical medical specialties on active records
DO $$
BEGIN
  -- Pre-sanitization: Ensure all 31 Nephrology physicians are explicitly set to Nephrology
  UPDATE public.doctors
  SET department = 'Nephrology', is_active = true
  WHERE department ILIKE '%nephro%'
     OR department ILIKE '%كلي%'
     OR department ILIKE '%كلى%'
     OR department = 'طبيب باطن وكلي'
     OR department = 'طبيب باطن وكلى'
     OR id IN (
       '55', '56', '57', '58', '251', '252', '348', '401', '724', '1177',
       '2300', '2542', '2631', '2649', '3255', '3536', '030723.09.23.26',
       '030822.11.20.21', '030822.11.21.36', '041123.12.39.10', '041124.05.24.17',
       '051123.02.59.41', '070225.11.20.37', '100824.10.08.23', '110225.01.59.17',
       '160726.01.40.36', '180126.03.03.04', '180726.02.44.44', '200123.04.03.57',
       '260522.05.46.18', '300925.10.01.27'
     );

  -- Pre-sanitization: Activate canonical specialties and deactivate non-canonical
  UPDATE public.doctors
  SET is_active = true
  WHERE department IN (
    'Internal Medicine', 'General Surgery', 'ICU', 'Emergency Medicine',
    'Cardiology', 'Pediatrics', 'Nephrology', 'Nutrition',
    'Cardiothoracic Surgery', 'Urology', 'Orthopedic Surgery',
    'Neurosurgery', 'Oncology', 'ENT', 'Obstetrics and gynecology',
    'Radiology', 'Physiotherapy', 'Anesthesiology & Pain Therapy',
    'Clinical Pharmacy', 'OPD Coordinator'
  );

  UPDATE public.doctors
  SET is_active = false
  WHERE is_active IS NULL 
     OR department NOT IN (
       'Internal Medicine', 'General Surgery', 'ICU', 'Emergency Medicine',
       'Cardiology', 'Pediatrics', 'Nephrology', 'Nutrition',
       'Cardiothoracic Surgery', 'Urology', 'Orthopedic Surgery',
       'Neurosurgery', 'Oncology', 'ENT', 'Obstetrics and gynecology',
       'Radiology', 'Physiotherapy', 'Anesthesiology & Pain Therapy',
       'Clinical Pharmacy', 'OPD Coordinator'
     );

  ALTER TABLE public.doctors DROP CONSTRAINT IF EXISTS chk_active_canonical_dept;
  ALTER TABLE public.doctors ADD CONSTRAINT chk_active_canonical_dept
  CHECK (
    is_active = false OR department IN (
      'Internal Medicine', 'General Surgery', 'ICU', 'Emergency Medicine',
      'Cardiology', 'Pediatrics', 'Nephrology', 'Nutrition',
      'Cardiothoracic Surgery', 'Urology', 'Orthopedic Surgery',
      'Neurosurgery', 'Oncology', 'ENT', 'Obstetrics and gynecology',
      'Radiology', 'Physiotherapy', 'Anesthesiology & Pain Therapy',
      'Clinical Pharmacy', 'OPD Coordinator'
    )
  );
END $$;

-- 1. Daily checkins: Deduplicate keeping newest record per doctor, then create unique index
DELETE FROM public.checkins
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY doctor_id ORDER BY checkin_timestamp DESC, created_at DESC, id DESC
    ) AS rn FROM public.checkins
  ) dupes WHERE dupes.rn > 1
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_checkins_doctor_id_unique ON public.checkins (doctor_id);
CREATE INDEX IF NOT EXISTS idx_checkins_date ON public.checkins (checkin_date);
CREATE INDEX IF NOT EXISTS idx_checkins_timestamp ON public.checkins (checkin_timestamp);

-- 2. Monthly checkins: Deduplicate keeping newest record per (doctor_id, checkin_date), then create unique index
DELETE FROM public.monthly_checkins
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY doctor_id, checkin_date ORDER BY checkin_timestamp DESC, created_at DESC, id DESC
    ) AS rn FROM public.monthly_checkins
  ) dupes WHERE dupes.rn > 1
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_monthly_checkins_doctor_date ON public.monthly_checkins (doctor_id, checkin_date);
CREATE INDEX IF NOT EXISTS idx_monthly_checkins_doctor_id ON public.monthly_checkins (doctor_id);
CREATE INDEX IF NOT EXISTS idx_monthly_checkins_date ON public.monthly_checkins (checkin_date ASC);
CREATE INDEX IF NOT EXISTS idx_monthly_checkins_date_ts ON public.monthly_checkins (checkin_date, checkin_timestamp DESC);

-- 3. Weekly checkins: Deduplicate keeping newest record per (doctor_id, checkin_date), then create unique index
DELETE FROM public.weekly_checkins
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY doctor_id, checkin_date ORDER BY checkin_timestamp DESC, created_at DESC, id DESC
    ) AS rn FROM public.weekly_checkins
  ) dupes WHERE dupes.rn > 1
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_weekly_checkins_doctor_date ON public.weekly_checkins (doctor_id, checkin_date);
CREATE INDEX IF NOT EXISTS idx_weekly_checkins_doctor_id ON public.weekly_checkins (doctor_id);
CREATE INDEX IF NOT EXISTS idx_weekly_checkins_timestamp ON public.weekly_checkins (checkin_timestamp);
CREATE INDEX IF NOT EXISTS idx_weekly_checkins_date_ts ON public.weekly_checkins (checkin_date, checkin_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_custom_doctors_name ON public.custom_doctors (name);

-- Enable Row Level Security (RLS) on all tables
ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_doctor_phones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deleted_doctors ENABLE ROW LEVEL SECURITY;

-- Grant schema and table access permissions to anon, authenticated, and service_role roles
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;

-- Allow public / anon / authenticated full read & write access
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public access to doctors' AND tablename = 'doctors') THEN
    CREATE POLICY "Public access to doctors" ON public.doctors FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public access to checkins' AND tablename = 'checkins') THEN
    CREATE POLICY "Public access to checkins" ON public.checkins FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public access to monthly_checkins' AND tablename = 'monthly_checkins') THEN
    CREATE POLICY "Public access to monthly_checkins" ON public.monthly_checkins FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public access to weekly_checkins' AND tablename = 'weekly_checkins') THEN
    CREATE POLICY "Public access to weekly_checkins" ON public.weekly_checkins FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public access to custom_doctors' AND tablename = 'custom_doctors') THEN
    CREATE POLICY "Public access to custom_doctors" ON public.custom_doctors FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public access to custom_doctor_phones' AND tablename = 'custom_doctor_phones') THEN
    CREATE POLICY "Public access to custom_doctor_phones" ON public.custom_doctor_phones FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public access to deleted_doctors' AND tablename = 'deleted_doctors') THEN
    CREATE POLICY "Public access to deleted_doctors" ON public.deleted_doctors FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;`;


// Shift definition
interface ShiftOption {
  id: string;
  labelEn: string;
  labelAr: string;
  descriptionEn: string;
  descriptionAr: string;
  color: string;
  icon: any;
}

const SHIFT_OPTIONS: ShiftOption[] = [
  {
    id: "Morning shift",
    labelEn: "Morning shift",
    labelAr: "مورنينج",
    descriptionEn: "Morning Shift (8:00 AM - 4:00 PM)",
    descriptionAr: "مناوبة صباحية (٨:٠٠ ص - ٤:٠٠ م)",
    color: "from-sky-400 to-blue-500",
    icon: Sun
  },
  {
    id: "Evening shift",
    labelEn: "Evening shift",
    labelAr: "ايڤينينج",
    descriptionEn: "PM Shift (4:00 PM - 12:00 AM)",
    descriptionAr: "مناوبة مسائية (٤:٠٠ م - ١٢:٠٠ ص)",
    color: "from-amber-500 to-orange-600",
    icon: Sunset
  },
  {
    id: "Night shift",
    labelEn: "Night shift",
    labelAr: "نايت",
    descriptionEn: "Overnight Duty (12:00 AM - 8:00 AM)",
    descriptionAr: "مناوبة ليلية (١٢:٠٠ ص - ٨:٠٠ ص)",
    color: "from-indigo-600 to-blue-800",
    icon: Moon
  }
];

const SHIFT_MAP_AR: Record<string, string> = {
  "Morning shift": "مورنينج",
  "Long shift": "لونج",
  "Evening shift": "ايڤينينج",
  "Night shift": "نايت",
  "24 shift": "24"
};

const formatShiftsForDisplay = (shifts: string[]): string => {
  if (!shifts || shifts.length === 0) return "";
  let finalShifts = [...shifts];
  if (finalShifts.length === 3 && 
      finalShifts.includes("Morning shift") && 
      finalShifts.includes("Evening shift") && 
      finalShifts.includes("Night shift")) {
    finalShifts = ["24 shift"];
  }
  return finalShifts.map((sh) => SHIFT_MAP_AR[sh] || sh).join(", ");
};

const formatTimestamp = (timestampStr?: string): string => {
  if (!timestampStr) return "N/A";
  try {
    const d = new Date(timestampStr);
    if (isNaN(d.getTime())) return "N/A";
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const year = String(d.getFullYear()).slice(-2);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${month}/${day}/${year} ${hours}:${minutes}`;
  } catch (e) {
    return "N/A";
  }
};

function normalizeArabic(text: string): string {
  if (!text) return "";
  return text
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ");
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

// Doctor interface matching server
interface Doctor {
  id: string;
  name: string;
  arabicName: string;
  department: string;
  mobileNumber?: string;
}

// Check-in interface matching server
interface CheckIn {
  id: string;
  doctorName: string;
  doctorArabicName: string;
  department: string;
  shifts: string[];
  timestamp: string;
  mobileNumber?: string;
}

const COMMON_DEPARTMENTS: readonly string[] = CANONICAL_SPECIALTIES;

// Dynamic ExcelJS workbook creator (lazy imports ExcelJS to prevent bundle bloat)
const createExcelWorkbook = async () => {
  const excelModule = await import("exceljs");
  const ExcelClass = (excelModule as any).default || excelModule;
  return new ExcelClass.Workbook();
};

// Isolated Live Clock component to prevent root-level full tree re-renders every 1s
function LiveClock() {
  const [liveTime, setLiveTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setLiveTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const day = String(liveTime.getDate()).padStart(2, '0');
  const month = String(liveTime.getMonth() + 1).padStart(2, '0');
  const year = liveTime.getFullYear();
  let hours = liveTime.getHours();
  const minutes = String(liveTime.getMinutes()).padStart(2, '0');
  const seconds = String(liveTime.getSeconds()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const hoursStr = String(hours).padStart(2, '0');
  const formatted = `${day}/${month}/${year} | ${hoursStr}:${minutes}:${seconds} ${ampm}`;

  return (
    <p className="text-[10px] text-emerald-800 font-bold font-mono bg-white/75 px-3 py-1 rounded border border-[#cbdad5]/50 shadow-inner inline-block backdrop-blur-xs">
      {formatted}
    </p>
  );
}

export default function App() {
  // Navigation & Screen states
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [adminPasscode, setAdminPasscode] = useState("");
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [adminRole, setAdminRole] = useState<"admin" | "coordinator" | null>(null);
  const [adminError, setAdminError] = useState("");
  const [showAdminLogin, setShowAdminLogin] = useState(false);

  // Doctor Form states
  const [inputId, setInputId] = useState("");
  const [searched, setSearched] = useState(false);
  const [foundDoctor, setFoundDoctor] = useState<Doctor | null>(null);
  
  // Custom Registration (if ID is not in predefined database)
  const [isManualReg, setIsManualReg] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualArabicName, setManualArabicName] = useState("");
  const [manualDept, setManualDept] = useState("");

  // Shift selection (maximum of 2)
  const [selectedShifts, setSelectedShifts] = useState<string[]>([]);
  
  // Submission & Alert feedback
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState<CheckIn | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  // Admin Data states
  const [checkins, setCheckins] = useState<CheckIn[]>([]);
  const [adminSearch, setAdminSearch] = useState("");
  const [adminDeptFilter, setAdminDeptFilter] = useState("All");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showMonthlyResetConfirm, setShowMonthlyResetConfirm] = useState(false);
  const showWeeklyResetConfirm = showMonthlyResetConfirm;
  const setShowWeeklyResetConfirm = setShowMonthlyResetConfirm;
  const [suggestions, setSuggestions] = useState<Doctor[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isDownloadingDaily, setIsDownloadingDaily] = useState(false);
  const [isDownloadingMonthly, setIsDownloadingMonthly] = useState(false);
  const isDownloadingWeekly = isDownloadingMonthly;
  const setIsDownloadingWeekly = setIsDownloadingMonthly;
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);

  // Editing active checked-in doctor phone number
  const [editingCheckedInDoctorId, setEditingCheckedInDoctorId] = useState<string | null>(null);
  const [editingCheckedInPhone, setEditingCheckedInPhone] = useState("");
  const [isUpdatingCheckedInPhone, setIsUpdatingCheckedInPhone] = useState(false);

  // Admin Navigation Sub-Tab ("roster" | "database" | "duplicates" | "supabase")
  const [adminTab, setAdminTab] = useState<"roster" | "database" | "duplicates" | "supabase">("roster");

  // Supabase State & Operations
  const [supabaseStatus, setSupabaseStatus] = useState<{
    configured: boolean;
    url?: string;
    connected?: boolean;
    errors?: any;
    counts?: Record<string, number>;
    message?: string;
  } | null>(null);
  const [isCheckingSupabase, setIsCheckingSupabase] = useState(false);
  const [isMigratingSupabase, setIsMigratingSupabase] = useState(false);
  const [supabaseMigrateResult, setSupabaseMigrateResult] = useState<{
    success: boolean;
    message: string;
    results?: any;
    error?: string;
  } | null>(null);
  const [copiedSqlSchema, setCopiedSqlSchema] = useState(false);
  const [supabaseConfigForm, setSupabaseConfigForm] = useState({
    url: "",
    key: "",
    serviceRoleKey: ""
  });
  const [isSavingSupabaseConfig, setIsSavingSupabaseConfig] = useState(false);
  const [supabaseConfigMsg, setSupabaseConfigMsg] = useState("");

  const fetchSupabaseStatus = async () => {
    setIsCheckingSupabase(true);
    try {
      const res = await fetch("/api/supabase/status");
      const data = await res.json();
      setSupabaseStatus(data);
      if (data.url && !supabaseConfigForm.url) {
        setSupabaseConfigForm(prev => ({ ...prev, url: data.url }));
      }
    } catch (err) {
      console.error("Error checking Supabase status:", err);
      setSupabaseStatus({ configured: false, connected: false, message: "Network error connecting to API" });
    } finally {
      setIsCheckingSupabase(false);
    }
  };

  const handleSaveSupabaseConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabaseConfigForm.url.trim() || !supabaseConfigForm.key.trim()) {
      setSupabaseConfigMsg("Supabase URL and Key are required.");
      return;
    }
    setIsSavingSupabaseConfig(true);
    setSupabaseConfigMsg("");
    try {
      const res = await fetch("/api/supabase/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(supabaseConfigForm)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSupabaseConfigMsg(data.warning || "Supabase credentials saved and verified successfully!");
        await fetchSupabaseStatus();
        await fetchFullDoctorsDatabase(true);
      } else {
        setSupabaseConfigMsg(data.error || "Failed to save Supabase config.");
      }
    } catch (err: any) {
      setSupabaseConfigMsg("Network error saving Supabase config.");
    } finally {
      setIsSavingSupabaseConfig(false);
    }
  };

  const handleRunSupabaseMigration = async () => {
    setIsMigratingSupabase(true);
    setSupabaseMigrateResult(null);
    try {
      const res = await fetch("/api/supabase/migrate", { method: "POST" });
      const data = await res.json();
      setSupabaseMigrateResult(data);
      if (res.ok && data.success) {
        await fetchSupabaseStatus();
      }
    } catch (err: any) {
      console.error("Migration error:", err);
      setSupabaseMigrateResult({
        success: false,
        message: "Migration request failed",
        error: err.message || "Network error",
      });
    } finally {
      setIsMigratingSupabase(false);
    }
  };

  const handleCopySqlSchema = () => {
    navigator.clipboard.writeText(SUPABASE_SQL_SCHEMA_TEXT);
    setCopiedSqlSchema(true);
    setTimeout(() => setCopiedSqlSchema(false), 2000);
  };

  // Duplicated IDs Management State
  const [dupSearch, setDupSearch] = useState("");
  const [dupDeptFilter, setDupDeptFilter] = useState("All");
  const [selectedDupItemKeys, setSelectedDupItemKeys] = useState<string[]>([]);

  // Persistent Doctor Database Management State
  const [fullDoctorList, setFullDoctorList] = useState<Doctor[]>([]);
  const [dbSearch, setDbSearch] = useState("");
  const [dbDeptFilter, setDbDeptFilter] = useState("All");
  const [selectedDbDoctorIds, setSelectedDbDoctorIds] = useState<string[]>([]);
  const [deleteModalState, setDeleteModalState] = useState<{
    isOpen: boolean;
    type: "single" | "batch";
    idToDelete?: string;
    nameToDelete?: string;
    doctorToDelete?: Doctor;
    errorMsg?: string;
  }>({ isOpen: false, type: "single" });
  const [isDeletingDoctor, setIsDeletingDoctor] = useState(false);
  const [confirmModalState, setConfirmModalState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmBtnText?: string;
    action: () => Promise<void>;
  }>({
    isOpen: false,
    title: "",
    message: "",
    confirmBtnText: "Confirm",
    action: async () => {}
  });
  const [isConfirmingAction, setIsConfirmingAction] = useState(false);
  const [isDoctorModalOpen, setIsDoctorModalOpen] = useState(false);
  const [doctorModalMode, setDoctorModalMode] = useState<"add" | "edit">("add");
  const [doctorFormData, setDoctorFormData] = useState({
    originalId: "",
    originalName: "",
    id: "",
    name: "",
    arabicName: "",
    department: "General",
    mobileNumber: ""
  });
  const [isSavingDoctor, setIsSavingDoctor] = useState(false);
  const [doctorSaveMsg, setDoctorSaveMsg] = useState("");
  const [isDownloadingDatabase, setIsDownloadingDatabase] = useState(false);

  // Global Escape key listener to close any active modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showAdminLogin) {
          setShowAdminLogin(false);
          setAdminPasscode("");
          setAdminError("");
        }
        if (deleteConfirmId) setDeleteConfirmId(null);
        if (showResetConfirm) setShowResetConfirm(false);
        if (showWeeklyResetConfirm) setShowWeeklyResetConfirm(false);
        if (editingCheckedInDoctorId) setEditingCheckedInDoctorId(null);
        if (isDoctorModalOpen) setIsDoctorModalOpen(false);
        if (deleteModalState.isOpen && !isDeletingDoctor) {
          setDeleteModalState(prev => ({ ...prev, isOpen: false }));
        }
        if (confirmModalState.isOpen && !isConfirmingAction) {
          setConfirmModalState(prev => ({ ...prev, isOpen: false }));
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    showAdminLogin,
    deleteConfirmId,
    showResetConfirm,
    showWeeklyResetConfirm,
    editingCheckedInDoctorId,
    isDoctorModalOpen,
    deleteModalState.isOpen,
    isDeletingDoctor,
    confirmModalState.isOpen,
    isConfirmingAction
  ]);

  const handleToggleSelectDoctor = (id: string) => {
    setSelectedDbDoctorIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllFilteredDoctors = () => {
    const filteredIds = filteredDbDoctors.map((d) => d.id);
    const allSelected =
      filteredIds.length > 0 && filteredIds.every((id) => selectedDbDoctorIds.includes(id));
    if (allSelected) {
      setSelectedDbDoctorIds((prev) => prev.filter((id) => !filteredIds.includes(id)));
    } else {
      setSelectedDbDoctorIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
    }
  };

  const handleOpenSingleDeleteModal = (docOrId: Doctor | string) => {
    const doc = typeof docOrId === "object" ? docOrId : fullDoctorList.find((d) => d.id === docOrId);
    setDeleteModalState({
      isOpen: true,
      type: "single",
      idToDelete: doc ? doc.id : String(docOrId),
      nameToDelete: doc ? doc.name : undefined,
      doctorToDelete: doc,
      errorMsg: ""
    });
  };

  const handleOpenBatchDeleteModal = () => {
    if (selectedDbDoctorIds.length === 0) return;
    setDeleteModalState({
      isOpen: true,
      type: "batch",
      errorMsg: ""
    });
  };

  const handleConfirmDelete = async () => {
    setIsDeletingDoctor(true);
    setDeleteModalState((prev) => ({ ...prev, errorMsg: "" }));
    try {
      if (deleteModalState.type === "single" && deleteModalState.idToDelete) {
        const id = deleteModalState.idToDelete;
        const targetDoc = deleteModalState.doctorToDelete || fullDoctorList.find((d) => d.id === id);
        const targetName = targetDoc?.name || deleteModalState.nameToDelete;
        const nameParam = targetName ? `?name=${encodeURIComponent(targetName)}` : "";
        const res = await fetch(`/api/doctors/delete/${encodeURIComponent(id)}${nameParam}`, {
          method: "DELETE"
        });
        if (res.ok) {
          // Immediately remove ONLY this chosen doctor entry from UI
          setFullDoctorList((prev) => prev.filter((item) => {
            if (targetName) {
              return !(item.id === id && item.name === targetName);
            }
            return item.id !== id;
          }));
          setSelectedDbDoctorIds((prev) => prev.filter((item) => item !== id));
          await fetchFullDoctorsDatabase(true);
          setDeleteModalState({ isOpen: false, type: "single" });
        } else {
          const data = await res.json().catch(() => ({}));
          setDeleteModalState((prev) => ({
            ...prev,
            errorMsg: data.error || "Failed to delete physician."
          }));
        }
      } else if (deleteModalState.type === "batch") {
        const items = selectedDbDoctorIds.map((id) => {
          const doc = fullDoctorList.find((d) => d.id === id);
          return { id, name: doc?.name };
        });
        const res = await fetch("/api/doctors/delete-batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: selectedDbDoctorIds, items })
        });
        if (res.ok) {
          const idSet = new Set(selectedDbDoctorIds);
          setFullDoctorList((prev) => prev.filter((item) => !idSet.has(item.id)));
          setSelectedDbDoctorIds([]);
          await fetchFullDoctorsDatabase(true);
          setDeleteModalState({ isOpen: false, type: "batch" });
        } else {
          const data = await res.json().catch(() => ({}));
          setDeleteModalState((prev) => ({
            ...prev,
            errorMsg: data.error || "Failed to delete selected physicians."
          }));
        }
      }
    } catch (err) {
      console.error("Delete error:", err);
      setDeleteModalState((prev) => ({
        ...prev,
        errorMsg: "Network error occurred while deleting."
      }));
    } finally {
      setIsDeletingDoctor(false);
    }
  };

  const fetchFullDoctorsDatabase = async (forceRefresh = false) => {
    try {
      const url = `/api/doctors?_t=${Date.now()}${forceRefresh ? "&refresh=true" : ""}`;
      const res = await fetch(url, {
        headers: { "Cache-Control": "no-cache", "Pragma": "no-cache" }
      });
      if (res.ok) {
        const data = await res.json();
        const sorted = data.sort((a: Doctor, b: Doctor) => compareDoctorIds(a.id, b.id));
        setFullDoctorList(sorted);
      }
    } catch (err) {
      console.error("Error fetching full doctors database:", err);
    }
  };

  const handleOpenAddDoctor = () => {
    setDoctorModalMode("add");
    setDoctorFormData({
      originalId: "",
      originalName: "",
      id: "",
      name: "",
      arabicName: "",
      department: "General",
      mobileNumber: ""
    });
    setDoctorSaveMsg("");
    setIsDoctorModalOpen(true);
  };

  const handleOpenEditDoctor = (doc: Doctor) => {
    setDoctorModalMode("edit");
    setDoctorFormData({
      originalId: doc.id,
      originalName: doc.name,
      id: doc.id,
      name: doc.name,
      arabicName: doc.arabicName || doc.name,
      department: doc.department || "General",
      mobileNumber: doc.mobileNumber || ""
    });
    setDoctorSaveMsg("");
    setIsDoctorModalOpen(true);
  };

  const handleSaveDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!doctorFormData.id.trim() || !doctorFormData.name.trim()) {
      setDoctorSaveMsg("Employee ID and English Name are required.");
      return;
    }
    setIsSavingDoctor(true);
    setDoctorSaveMsg("");
    try {
      const res = await fetch("/api/doctors/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(doctorFormData)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setDoctorSaveMsg("Physician saved successfully!");
        const cleanNewId = doctorFormData.id.trim().replace(/^(emp\.|emp)/i, "");
        const cleanOrigId = doctorFormData.originalId ? doctorFormData.originalId.trim().replace(/^(emp\.|emp)/i, "") : "";
        const origName = doctorFormData.originalName?.trim();
        const updatedDoc: Doctor = {
          id: cleanNewId,
          name: doctorFormData.name.trim(),
          arabicName: doctorFormData.arabicName.trim() || doctorFormData.name.trim(),
          department: doctorFormData.department.trim() || "General Surgery",
          mobileNumber: doctorFormData.mobileNumber.trim()
        };
        setFullDoctorList((prev) => {
          let replaced = false;
          const newList = prev.map((d) => {
            if ((cleanOrigId && d.id === cleanOrigId && (!origName || d.name === origName)) ||
                (!cleanOrigId && d.id === cleanNewId)) {
              replaced = true;
              return updatedDoc;
            }
            return d;
          });
          if (!replaced) {
            newList.push(updatedDoc);
          }
          return newList.sort((a, b) => compareDoctorIds(a.id, b.id));
        });
        await fetchFullDoctorsDatabase(true);
        await fetchCheckins();
        setTimeout(() => {
          setIsDoctorModalOpen(false);
          setDoctorSaveMsg("");
        }, 600);
      } else {
        setDoctorSaveMsg(data.error || "Failed to save physician.");
      }
    } catch (err) {
      setDoctorSaveMsg("Connection error while saving physician.");
    } finally {
      setIsSavingDoctor(false);
    }
  };

  const downloadPhysiciansDatabaseXLS = async () => {
    try {
      setIsDownloadingDatabase(true);
      let rawDoctors: Doctor[] = fullDoctorList;
      if (!rawDoctors || rawDoctors.length === 0) {
        const res = await fetch("/api/doctors");
        rawDoctors = res.ok ? await res.json() : [];
      }
      const doctors = [...rawDoctors]
        .map((doc) => {
          const cleanId = doc.id.replace(/^(emp\.|emp)/i, "").trim();
          if (cleanId === "347" || (doc.name && doc.name.toLowerCase().includes("kareem mohamed abdelkader"))) {
            return { ...doc, department: "Radiology" };
          }
          if (NEPHROLOGY_DOCTOR_IDS.has(cleanId)) {
            return { ...doc, department: "Nephrology" };
          }
          return doc;
        })
        .sort((a, b) => compareDoctorIds(a.id, b.id));

      const workbook = await createExcelWorkbook();
      const worksheet = workbook.addWorksheet("Physician Database", {
        views: [{ showGridLines: true }]
      });

      worksheet.columns = [
        { header: "Employee ID", key: "id", width: 18 },
        { header: "English Name", key: "name", width: 35 },
        { header: "Arabic Name (اسم الطبيب)", key: "arabicName", width: 35 },
        { header: "Specialty / Department", key: "department", width: 28 },
        { header: "Phone Number (رقم الهاتف)", key: "mobileNumber", width: 22 }
      ];

      const headerRow = worksheet.getRow(1);
      headerRow.height = 28;
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF063B30" }
        };
        cell.font = {
          name: "Segoe UI",
          color: { argb: "FFFFFFFF" },
          bold: true,
          size: 11
        };
        cell.alignment = { vertical: "middle", horizontal: "center" };
      });

      doctors.forEach((doc) => {
        const row = worksheet.addRow({
          id: doc.id,
          name: doc.name,
          arabicName: doc.arabicName,
          department: doc.department,
          mobileNumber: doc.mobileNumber || ""
        });
        row.height = 22;
        row.eachCell((cell, colNumber) => {
          cell.font = {
            name: "Segoe UI",
            size: 10,
            bold: colNumber === 2 || colNumber === 3
          };
          cell.alignment = {
            vertical: "middle",
            horizontal: colNumber === 3 ? "right" : "left"
          };
          cell.border = {
            top: { style: "thin", color: { argb: "FFE0E0E0" } },
            left: { style: "thin", color: { argb: "FFE0E0E0" } },
            bottom: { style: "thin", color: { argb: "FFE0E0E0" } },
            right: { style: "thin", color: { argb: "FFE0E0E0" } }
          };
        });
      });

      const summaryRow = worksheet.addRow({
        id: "TOTAL",
        name: `${doctors.length} Physicians Registered`,
        arabicName: "",
        department: "",
        mobileNumber: ""
      });
      summaryRow.height = 24;
      summaryRow.eachCell((cell) => {
        cell.font = { name: "Segoe UI", bold: true, size: 10, color: { argb: "FF063B30" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE6F2EE" } };
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const dateStr = new Date().toISOString().split("T")[0];
      link.download = `Physicians_Database_${dateStr}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error exporting database:", err);
      alert("Failed to export database.");
    } finally {
      setIsDownloadingDatabase(false);
    }
  };

  const filteredDbDoctors = React.useMemo(() => {
    return fullDoctorList
      .filter((doc) => {
        const searchLower = dbSearch.trim();
        let matchesSearch = true;
        if (searchLower) {
          const normQuery = normalizeArabic(searchLower.toLowerCase());
          const normId = doc.id.toLowerCase();
          const normName = doc.name.toLowerCase();
          const normAra = normalizeArabic(doc.arabicName || "");
          const normMob = doc.mobileNumber || "";

          const terms = normQuery.split(/\s+/).filter(Boolean);
          matchesSearch = terms.every(term => 
            normId.includes(term) ||
            normName.includes(term) ||
            normAra.includes(term) ||
            normMob.includes(term)
          );
        }

        const matchesDept = dbDeptFilter === "All" || doc.department === dbDeptFilter;
        return matchesSearch && matchesDept;
      })
      .sort((a, b) => compareDoctorIds(a.id, b.id));
  }, [fullDoctorList, dbSearch, dbDeptFilter]);

  const duplicateGroups = React.useMemo(() => {
    const map: Record<string, Doctor[]> = {};
    fullDoctorList.forEach((doc) => {
      const normId = doc.id.trim().replace(/^(emp\.|emp)/i, "").toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!normId) return;
      if (!map[normId]) map[normId] = [];
      map[normId].push(doc);
    });

    return Object.entries(map)
      .filter(([_, list]) => list.length > 1)
      .map(([normId, doctors]) => ({
        normId,
        displayId: doctors[0].id,
        doctors
      }));
  }, [fullDoctorList]);

  const filteredDuplicateGroups = React.useMemo(() => {
    return duplicateGroups.filter((group) => {
      if (dupDeptFilter !== "All" && !group.doctors.some((d) => d.department === dupDeptFilter)) {
        return false;
      }
      if (!dupSearch.trim()) return true;
      const q = dupSearch.toLowerCase().trim();
      return (
        group.displayId.toLowerCase().includes(q) ||
        group.normId.includes(q) ||
        group.doctors.some(
          (d) =>
            d.name.toLowerCase().includes(q) ||
            d.arabicName.toLowerCase().includes(q) ||
            d.department.toLowerCase().includes(q) ||
            (d.mobileNumber && d.mobileNumber.includes(q))
        )
      );
    });
  }, [duplicateGroups, dupSearch, dupDeptFilter]);

  const handleToggleSelectDupItem = (doc: Doctor) => {
    const key = `${doc.id}___${doc.name}`;
    setSelectedDupItemKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleSelectAllGroupDupItems = (groupDoctors: Doctor[]) => {
    const keys = groupDoctors.map((d) => `${d.id}___${d.name}`);
    const allSelected = keys.every((k) => selectedDupItemKeys.includes(k));
    if (allSelected) {
      setSelectedDupItemKeys((prev) => prev.filter((k) => !keys.includes(k)));
    } else {
      setSelectedDupItemKeys((prev) => Array.from(new Set([...prev, ...keys])));
    }
  };

  const handleKeepOnlyThisDoctor = (keepDoc: Doctor, groupDocs: Doctor[]) => {
    const docsToDelete = groupDocs.filter((d) => d.name !== keepDoc.name || d.id !== keepDoc.id);
    if (docsToDelete.length === 0) return;

    setConfirmModalState({
      isOpen: true,
      title: "Keep Record & Remove Duplicates",
      message: `Are you sure you want to keep "${keepDoc.name}" and remove the ${docsToDelete.length} other record(s) sharing ID "${keepDoc.id}" from the database?`,
      confirmBtnText: "Keep This & Remove Others",
      action: async () => {
        setIsDeletingDoctor(true);
        try {
          const res = await fetch("/api/doctors/delete-batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: docsToDelete.map((d) => ({ id: d.id, name: d.name })) })
          });
          if (res.ok) {
            await fetchFullDoctorsDatabase(true);
          } else {
            const data = await res.json().catch(() => ({}));
            alert(data.error || "Failed to delete duplicate records.");
          }
        } catch (err) {
          console.error("Keep doctor error:", err);
        } finally {
          setIsDeletingDoctor(false);
        }
      }
    });
  };

  const handleDeleteSingleDupDoctor = (doc: Doctor) => {
    setConfirmModalState({
      isOpen: true,
      title: "Delete Duplicate Record",
      message: `Are you sure you want to delete physician "${doc.name}" (ID: ${doc.id}) from the database?`,
      confirmBtnText: "Delete Record",
      action: async () => {
        setIsDeletingDoctor(true);
        try {
          const res = await fetch(`/api/doctors/delete/${encodeURIComponent(doc.id)}?name=${encodeURIComponent(doc.name)}`, {
            method: "DELETE"
          });
          if (res.ok) {
            setFullDoctorList((prev) => prev.filter((item) => !(item.id === doc.id && item.name === doc.name)));
            await fetchFullDoctorsDatabase(true);
          } else {
            const data = await res.json().catch(() => ({}));
            alert(data.error || "Failed to delete doctor.");
          }
        } catch (err) {
          console.error("Delete error:", err);
        } finally {
          setIsDeletingDoctor(false);
        }
      }
    });
  };

  const handleBatchDeleteSelectedDupItems = () => {
    if (selectedDupItemKeys.length === 0) return;
    const itemsToDelete = selectedDupItemKeys.map((key) => {
      const [id, name] = key.split("___");
      return { id, name };
    });

    setConfirmModalState({
      isOpen: true,
      title: "Batch Delete Selected Duplicates",
      message: `Are you sure you want to delete ${itemsToDelete.length} selected duplicate record(s) from the database?`,
      confirmBtnText: `Delete ${itemsToDelete.length} Selected`,
      action: async () => {
        setIsDeletingDoctor(true);
        try {
          const res = await fetch("/api/doctors/delete-batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: itemsToDelete })
          });
          if (res.ok) {
            setSelectedDupItemKeys([]);
            await fetchFullDoctorsDatabase(true);
          } else {
            const data = await res.json().catch(() => ({}));
            alert(data.error || "Failed to delete selected duplicate records.");
          }
        } catch (err) {
          console.error("Batch delete error:", err);
        } finally {
          setIsDeletingDoctor(false);
        }
      }
    });
  };

  const handleEditCheckedInPhone = (id: string, currentPhone: string) => {
    setEditingCheckedInDoctorId(id);
    setEditingCheckedInPhone(currentPhone);
  };

  const handleSaveCheckedInPhone = async () => {
    if (!editingCheckedInDoctorId) return;
    setIsUpdatingCheckedInPhone(true);
    try {
      const res = await fetch(`/api/checkins/${encodeURIComponent(editingCheckedInDoctorId)}/phone`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobileNumber: editingCheckedInPhone })
      });
      if (res.ok) {
        // Refresh checkins
        fetchCheckins();
        setEditingCheckedInDoctorId(null);
      } else {
        const err = await res.json();
        alert(err.error || "Failed to update phone number.");
      }
    } catch (err) {
      console.error("Error updating phone number:", err);
      alert("Failed to update phone number. Check connection.");
    } finally {
      setIsUpdatingCheckedInPhone(false);
    }
  };

  // Persistent Doctor Directory states
  const [directorySearch, setDirectorySearch] = useState("");
  const [directorySuggestions, setDirectorySuggestions] = useState<Doctor[]>([]);
  const [selectedDirectoryDoctor, setSelectedDirectoryDoctor] = useState<Doctor | null>(null);
  const [directoryPhoneInput, setDirectoryPhoneInput] = useState("");
  const [isSavingDirectoryPhone, setIsSavingDirectoryPhone] = useState(false);
  const [directoryMessage, setDirectoryMessage] = useState("");

  // Handle searching directory doctors
  useEffect(() => {
    const q = directorySearch.trim();
    if (!q) {
      setDirectorySuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/doctors/search?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data = await res.json();
          setDirectorySuggestions(data);
        }
      } catch (err) {
        console.error("Error searching directory:", err);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [directorySearch]);

  const handleSelectDirectoryDoctor = (doc: Doctor) => {
    setSelectedDirectoryDoctor(doc);
    setDirectoryPhoneInput(doc.mobileNumber || "");
    setDirectorySearch("");
    setDirectorySuggestions([]);
    setDirectoryMessage("");
  };

  const handleSaveDirectoryPhone = async () => {
    if (!selectedDirectoryDoctor) return;
    setIsSavingDirectoryPhone(true);
    setDirectoryMessage("");
    try {
      const res = await fetch("/api/doctors/phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedDirectoryDoctor.id,
          mobileNumber: directoryPhoneInput
        })
      });
      if (res.ok) {
        setDirectoryMessage("Saved successfully to database!");
        // Update local object of selected doctor
        setSelectedDirectoryDoctor({
          ...selectedDirectoryDoctor,
          mobileNumber: directoryPhoneInput
        });
        // Refresh active roster too
        fetchCheckins();
      } else {
        const err = await res.json();
        setDirectoryMessage(err.error || "Failed to save.");
      }
    } catch (err) {
      console.error("Error saving persistent phone:", err);
      setDirectoryMessage("Error saving. Check connection.");
    } finally {
      setIsSavingDirectoryPhone(false);
    }
  };

  // Initial load of doctors database and checkins on mount
  useEffect(() => {
    fetchCheckins();
    fetchFullDoctorsDatabase();
  }, []);

  // Fetch and live-sync current checkins if admin is authenticated (polls every 3 seconds)
  useEffect(() => {
    if (!isAdminAuthenticated) return;

    fetchCheckins();
    fetchFullDoctorsDatabase();

    const intervalId = setInterval(() => {
      fetchCheckins();
    }, 3000);

    return () => clearInterval(intervalId);
  }, [isAdminAuthenticated]);

  // Auto-lookup doctor as they type and fetch autocomplete suggestions
  useEffect(() => {
    const query = inputId.trim();
    if (!query) {
      setFoundDoctor(null);
      setIsManualReg(false);
      setSearched(false);
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    // If the input already matches the found doctor's details, do not re-trigger lookup
    if (foundDoctor && (
      foundDoctor.id.toLowerCase() === query.toLowerCase() ||
      foundDoctor.name.toLowerCase() === query.toLowerCase() ||
      foundDoctor.arabicName.toLowerCase() === query.toLowerCase()
    )) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        // 1. Fetch autocomplete suggestions as they type
        const searchRes = await fetch(`/api/doctors/search?q=${encodeURIComponent(query)}`);
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const activeResults = (searchData || []).filter((d: any) => 
            d.isActive !== false && (!d.department || (CANONICAL_SPECIALTIES as readonly string[]).includes(d.department))
          );
          setSuggestions(activeResults);
          setShowSuggestions(activeResults.length > 0);
        }

        // 2. Check exact doctor lookup
        const res = await fetch(`/api/doctors/${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.found && data.doctor && data.doctor.isActive !== false && (!data.doctor.department || (CANONICAL_SPECIALTIES as readonly string[]).includes(data.doctor.department))) {
            setFoundDoctor(data.doctor);
            setIsManualReg(false);
            setSearched(true);
            setErrorMessage("");
            if (data.doctor.id.toLowerCase() === query.toLowerCase()) {
              setSuggestions([]);
              setShowSuggestions(false);
            }
          }
        }
      } catch (err) {
        console.error("Auto-lookup error:", err);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [inputId]);

  // Fetch check-ins list from Express backend
  const fetchCheckins = async () => {
    try {
      const res = await fetch("/api/checkins");
      if (res.ok) {
        const data = await res.json();
        setCheckins(data);
      }
    } catch (err) {
      console.error("Error fetching checkins:", err);
    }
  };

  // Auto-search or click search handler
  const handleSearchDoctor = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputId.trim()) return;

    setErrorMessage("");
    setSubmitSuccess(null);
    
    try {
      const res = await fetch(`/api/doctors/${encodeURIComponent(inputId.trim())}`);
      if (!res.ok) {
        setErrorMessage(`Server error: Status ${res.status} (${res.statusText || "Error"}). Please contact support.`);
        setSearched(true);
        setFoundDoctor(null);
        return;
      }
      const data = await res.json();
      
      setSearched(true);
      if (data.found && data.doctor && data.doctor.isActive !== false && (!data.doctor.department || (CANONICAL_SPECIALTIES as readonly string[]).includes(data.doctor.department))) {
        setFoundDoctor(data.doctor);
        setIsManualReg(false);
        // Reset manual form fields
        setManualName("");
        setManualArabicName("");
        setManualDept("");
      } else {
        setFoundDoctor(null);
        // Suggest manual registration
        setIsManualReg(true);
      }
    } catch (err) {
      console.error("Error looking up doctor:", err);
      setErrorMessage(`Connection error: ${err instanceof Error ? err.message : String(err)}. Please try again.`);
    }
  };

  // Clean form and reset states to allow next check-in
  const handleResetForm = () => {
    setInputId("");
    setSearched(false);
    setFoundDoctor(null);
    setIsManualReg(false);
    setManualName("");
    setManualArabicName("");
    setManualDept("");
    setSelectedShifts([]);
    setErrorMessage("");
    setSubmitSuccess(null);
  };

  // Handle shifts checkbox select
  const handleToggleShift = (shiftId: string) => {
    setErrorMessage("");
    if (selectedShifts.includes(shiftId)) {
      setSelectedShifts(selectedShifts.filter(s => s !== shiftId));
    } else {
      if (selectedShifts.length >= 3) {
        setErrorMessage("You can select a maximum of 3 shifts.");
        return;
      }
      setSelectedShifts([...selectedShifts, shiftId]);
    }
  };

  // Submit doctor check-in to server
  const handleSubmitCheckin = async () => {
    setErrorMessage("");
    const trimmedId = inputId.trim();
    if (!trimmedId) {
      setErrorMessage("Please enter your Employee ID first.");
      return;
    }
    
    // Check validation
    if (selectedShifts.length === 0) {
      setErrorMessage("Please select at least 1 shift.");
      return;
    }

    setSubmitting(true);

    let finalId = "";
    let finalName = "";
    let finalArabicName = "";
    let finalDept = "";

    try {
      let currentDoctor = foundDoctor;
      let currentIsManual = isManualReg;

      // If we haven't loaded a doctor profile yet, perform an on-the-fly check
      if (!currentDoctor && !currentIsManual) {
        const lookupRes = await fetch(`/api/doctors/${encodeURIComponent(trimmedId)}`);
        if (lookupRes.ok) {
          const lookupData = await lookupRes.json();
          if (lookupData.found) {
            currentDoctor = lookupData.doctor;
            setFoundDoctor(lookupData.doctor);
            setSearched(true);
          } else {
            currentIsManual = true;
            setIsManualReg(true);
            setSearched(true);
            setSubmitting(false);
            setErrorMessage("Physician ID not found. Please fill in your name and choose department below to register.");
            return;
          }
        } else {
          setErrorMessage(`Server lookup failed: Status ${lookupRes.status} (${lookupRes.statusText || "Error"}). Please try entering your details manually.`);
          setSearched(true);
          setIsManualReg(true); // fall back to manual registration so the user is not blocked!
          setSubmitting(false);
          return;
        }
      }

      if (currentIsManual) {
        if (!manualName.trim() || !manualArabicName.trim() || !manualDept) {
          setErrorMessage("Please fill in your name in English, Arabic, and choose your Department.");
          setSubmitting(false);
          return;
        }
        finalId = trimmedId;
        finalName = manualName.trim();
        finalArabicName = manualArabicName.trim();
        finalDept = manualDept;
      } else if (currentDoctor) {
        finalId = currentDoctor.id;
        finalName = currentDoctor.name;
        finalArabicName = currentDoctor.arabicName;
        finalDept = currentDoctor.department;
      } else {
        setErrorMessage("No physician profile loaded. Please input your ID.");
        setSubmitting(false);
        return;
      }

      const res = await fetch("/api/checkins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: finalId,
          doctorName: finalName,
          doctorArabicName: finalArabicName,
          department: finalDept,
          shifts: selectedShifts
        })
      });

      const data = await res.json();
      setSubmitting(false);

      if (res.ok) {
        setSubmitSuccess(data.checkIn);
        fetchCheckins();
        // Play success and after 5 seconds clear the form automatically for the next physician
        setTimeout(() => {
          handleResetForm();
        }, 5000);
      } else {
        setErrorMessage(data.error || "An error occurred during check-in.");
      }
    } catch (err) {
      setSubmitting(false);
      setErrorMessage("Server error. Please verify connection.");
    }
  };

  // Delete a single checkin (admin panel) - triggers custom dialog modal
  const handleDeleteCheckin = (id: string) => {
    setDeleteConfirmId(id);
  };

  const confirmDeleteCheckin = async () => {
    if (!deleteConfirmId) return;
    try {
      const res = await fetch(`/api/checkins/${encodeURIComponent(deleteConfirmId)}`, {
        method: "DELETE"
      });
      if (res.ok) {
        fetchCheckins();
      }
    } catch (err) {
      console.error("Error deleting checkin:", err);
    } finally {
      setDeleteConfirmId(null);
    }
  };

  // Clear all check-ins (admin panel) - triggers custom dialog modal
  const handleClearAllCheckins = () => {
    setShowResetConfirm(true);
  };

  const confirmClearAllCheckins = async () => {
    try {
      const res = await fetch("/api/checkins/clear", {
        method: "POST"
      });
      if (res.ok) {
        setCheckins([]);
      }
    } catch (err) {
      console.error("Error clearing checkins:", err);
    } finally {
      setShowResetConfirm(false);
    }
  };

  // Clear monthly cumulative check-ins database
  const handleClearMonthlyCheckins = () => {
    setShowMonthlyResetConfirm(true);
  };
  const handleClearWeeklyCheckins = handleClearMonthlyCheckins;

  const confirmClearMonthlyCheckins = async () => {
    try {
      const res = await fetch("/api/checkins/clear-monthly", {
        method: "POST"
      });
      if (res.ok) {
        alert("Cumulative 30-day monthly check-ins database cleared successfully.");
      }
    } catch (err) {
      console.error("Error clearing monthly checkins:", err);
    } finally {
      setShowMonthlyResetConfirm(false);
    }
  };
  const confirmClearWeeklyCheckins = confirmClearMonthlyCheckins;

  // Helper to fetch SVG from Node.js backend using backend parameters and rasterize to PNG base64 for Excel embedding
  const fetchHeaderImageBase64 = async (
    dateStr?: string,
    weekdayStr?: string,
    titleStr?: string,
    englishWeekdayStr?: string,
    options?: { autoReset?: boolean; cutoff?: string; nextDay?: boolean }
  ): Promise<string> => {
    try {
      const params = new URLSearchParams();
      if (dateStr) params.set("date", dateStr);
      if (weekdayStr) params.set("day", weekdayStr);
      if (titleStr) params.set("title", titleStr);
      if (englishWeekdayStr) params.set("englishWeekday", englishWeekdayStr);
      if (options?.autoReset !== undefined) params.set("autoReset", String(options.autoReset));
      else params.set("autoReset", "true");
      if (options?.cutoff) params.set("cutoff", options.cutoff);
      if (options?.nextDay !== undefined) params.set("nextDay", String(options.nextDay));
      params.set("w", "1200");
      params.set("h", "150");

      const endpoint = `/api/sheet-header.svg?${params.toString()}`;
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error("Failed to fetch header SVG");
      const svgText = await res.text();

      return await new Promise<string>((resolve) => {
        try {
          const img = new Image();
          const svgBlob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
          const url = URL.createObjectURL(svgBlob);
          const timer = setTimeout(() => {
            URL.revokeObjectURL(url);
            resolve("");
          }, 3500);

          img.onload = () => {
            clearTimeout(timer);
            try {
              const canvas = document.createElement("canvas");
              // 2x scale for sharp retina render in Excel
              canvas.width = 2400;
              canvas.height = 300;
              const ctx = canvas.getContext("2d");
              if (!ctx) {
                URL.revokeObjectURL(url);
                resolve("");
                return;
              }
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              URL.revokeObjectURL(url);
              const dataUrl = canvas.toDataURL("image/png");
              resolve(dataUrl.replace(/^data:image\/png;base64,/, ""));
            } catch {
              URL.revokeObjectURL(url);
              resolve("");
            }
          };
          img.onerror = () => {
            clearTimeout(timer);
            URL.revokeObjectURL(url);
            resolve("");
          };
          img.src = url;
        } catch {
          resolve("");
        }
      });
    } catch (err) {
      console.warn("Could not generate header image from backend SVG:", err);
      return "";
    }
  };

  // Helper to apply header banner image, merged title, and table headers to any Excel worksheet
  const applySheetHeaderToWorksheet = (
    worksheet: any,
    workbook: any,
    headerBase64: string,
    titleText: string
  ) => {
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
    titleCell.value = titleText;
    titleCell.font = { name: "Segoe UI", size: 16, bold: true, color: { argb: "FF063B30" } };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };

    if (headerBase64) {
      try {
        const imgId = workbook.addImage({
          base64: headerBase64,
          extension: "png"
        });
        worksheet.addImage(imgId, "A1:F5");
      } catch (err) {
        console.warn("Error embedding header image into sheet:", err);
      }
    }

    worksheet.getRow(6).height = 10;

    const headerRow = worksheet.getRow(7);
    headerRow.height = 32;
    headerRow.values = ["ID", "Timestamp", "Arabic name", "Speciality", "shift", "Phone Number"];
    headerRow.eachCell((cell: any) => {
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
  };

  // Helper to dynamically enrich check-in with authoritative physician details (Arabic name and phone)
  const enrichCheckInClient = (c: CheckIn): CheckIn => {
    if (!c) return c;
    const cleanId = c.id.trim().replace(/^(emp\.|emp)/i, "");
    const doc = fullDoctorList.find(d => 
      d.id.toLowerCase() === cleanId.toLowerCase() || 
      d.name.toLowerCase() === c.doctorName.toLowerCase()
    );
    const hasArabic = (s?: string) => Boolean(s && /[\u0600-\u06FF]/.test(s));
    let arabName = c.doctorArabicName;
    if (doc?.arabicName && hasArabic(doc.arabicName) && (!hasArabic(arabName) || arabName.toLowerCase() === c.doctorName.toLowerCase())) {
      arabName = doc.arabicName;
    }
    let mob = c.mobileNumber;
    if ((!mob || mob === "N/A" || mob === "undefined") && doc?.mobileNumber) {
      mob = doc.mobileNumber;
    }
    let dept = doc?.department || c.department;
    if (cleanId === "347" || (c.doctorName && c.doctorName.toLowerCase().includes("kareem mohamed abdelkader"))) {
      dept = "Radiology";
    } else if (NEPHROLOGY_DOCTOR_IDS.has(cleanId)) {
      dept = "Nephrology";
    }
    return {
      ...c,
      id: cleanId,
      doctorName: doc?.name || c.doctorName,
      doctorArabicName: arabName || c.doctorArabicName,
      department: dept,
      mobileNumber: mob || "N/A"
    };
  };

  // Download Cumulative Monthly Excel Sheet (30-day rolling attendance roster with sub-sheets per weekday date)
  const downloadMonthlyCSVReport = async () => {
    setIsDownloadingMonthly(true);
    try {
      const res = await fetch("/api/monthly-checkins");
      if (!res.ok) {
        alert("Failed to fetch cumulative monthly data.");
        return;
      }
      const monthlyData: CheckIn[] = await res.json();
      if (monthlyData.length === 0) {
        // Create an empty template sheet so it's always ready to download at any time!
        const workbook = await createExcelWorkbook();
        const nowEgypt = new Date();
        const egyptHourStr = nowEgypt.toLocaleTimeString("en-US", { timeZone: "Africa/Cairo", hour: "numeric", hour12: false });
        const egyptMinStr = nowEgypt.toLocaleTimeString("en-US", { timeZone: "Africa/Cairo", minute: "numeric" });
        const egyptHour = parseInt(egyptHourStr, 10) || 0;
        const egyptMin = parseInt(egyptMinStr, 10) || 0;
        const isPastReset = egyptHour > 18 || (egyptHour === 18 && egyptMin >= 30);
        const d = new Date(nowEgypt);
        if (isPastReset) {
          d.setDate(d.getDate() + 1);
        }
        const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Cairo", weekday: "long" }).format(d);
        const dateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
        const arabicWeekday = new Intl.DateTimeFormat("ar-EG", { timeZone: "Africa/Cairo", weekday: "long" }).format(d);
        const formattedDate = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
        const sheetName = `${weekday} ${dateStr}`;
        const worksheet = workbook.addWorksheet(sheetName, {
          views: [{ showGridLines: true }]
        });
        const headerBase64 = await fetchHeaderImageBase64(formattedDate, arabicWeekday, undefined, weekday);
        applySheetHeaderToWorksheet(worksheet, workbook, headerBase64, `الأطباء المتواجدين عن يوم ${arabicWeekday} ${formattedDate}`);

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `Monthly_Cumulative_Roster_${dateStr}.xlsx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        return;
      }

      // Helper to format timestamp: M/D/YY HH:MM
      const formatTimestampStr = (timestampStr: string) => {
        const d = new Date(timestampStr);
        const month = d.getMonth() + 1;
        const day = d.getDate();
        const year = String(d.getFullYear()).slice(-2);
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        return `${month}/${day}/${year} ${hours}:${minutes}`;
      };

      // Helper to format weekday date tab name strictly in Egypt (Africa/Cairo) timezone with 7 PM transition rule to prevent UTC splits
      const getSheetName = (timestampStr: string) => {
        try {
          const d = new Date(timestampStr);
          // Determine the local hour in Egypt
          const hourStr = d.toLocaleTimeString("en-US", {
            timeZone: "Africa/Cairo",
            hour: "numeric",
            hour12: false
          });
          const hour = parseInt(hourStr, 10) || 0;

          // Shift by 1 day if hour is >= 19 (7 PM Egypt Time)
          const targetDate = new Date(d);
          if (hour >= 19) {
            targetDate.setDate(targetDate.getDate() + 1);
          }

          const weekdayFormatter = new Intl.DateTimeFormat("en-US", {
            timeZone: "Africa/Cairo",
            weekday: "long"
          });
          const dateFormatter = new Intl.DateTimeFormat("en-US", {
            timeZone: "Africa/Cairo",
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
          });
          const weekday = weekdayFormatter.format(targetDate);
          
          const parts = dateFormatter.formatToParts(targetDate);
          const year = parts.find(p => p.type === "year")?.value || "";
          const month = parts.find(p => p.type === "month")?.value || "";
          const day = parts.find(p => p.type === "day")?.value || "";
          
          const dateStr = `${year}-${month}-${day}`;
          return `${weekday} ${dateStr}`;
        } catch (err) {
          console.error("Error formatting Egypt sheet name:", err);
          const d = new Date(timestampStr);
          const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, "0");
          const day = String(d.getDate()).padStart(2, "0");
          return `${weekday} ${year}-${month}-${day}`;
        }
      };

      // Group monthly data by weekday date (tab name)
      const groupedByDate: { [key: string]: CheckIn[] } = {};
      monthlyData.forEach((c) => {
        const sheetName = getSheetName(c.timestamp);
        if (!groupedByDate[sheetName]) {
          groupedByDate[sheetName] = [];
        }
        groupedByDate[sheetName].push(c);
      });

      // Sort sheet names chronologically (based on the first checkin's timestamp in each group)
      const sortedSheetNames = Object.keys(groupedByDate).sort((a, b) => {
        const dateA = groupedByDate[a][0]?.timestamp || "";
        const dateB = groupedByDate[b][0]?.timestamp || "";
        return new Date(dateA).getTime() - new Date(dateB).getTime();
      });

      const workbook = await createExcelWorkbook();

      // For every sheet/weekday date, construct following the day sheet template
      for (const sheetName of sortedSheetNames) {
        const dayCheckins = groupedByDate[sheetName];

        const worksheet = workbook.addWorksheet(sheetName, {
          views: [{ showGridLines: true }]
        });

        // Determine specific Egypt date and weekday for this sub-sheet with 7 PM transition rule
        const sampleTimestamp = dayCheckins[0]?.timestamp || "";
        let tabTargetDate = new Date();
        if (sampleTimestamp) {
          const parsedD = new Date(sampleTimestamp);
          const hourStr = parsedD.toLocaleTimeString("en-US", { timeZone: "Africa/Cairo", hour: "numeric", hour12: false });
          const hour = parseInt(hourStr, 10) || 0;
          tabTargetDate = new Date(parsedD);
          if (hour >= 19) tabTargetDate.setDate(tabTargetDate.getDate() + 1);
        }
        const tabArabicWeekday = new Intl.DateTimeFormat("ar-EG", { timeZone: "Africa/Cairo", weekday: "long" }).format(tabTargetDate);
        const tabEnglishWeekday = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Cairo", weekday: "long" }).format(tabTargetDate);
        const tabFormattedDate = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(tabTargetDate);
        const tabTitle = `الأطباء المتواجدين عن يوم ${tabArabicWeekday} ${tabFormattedDate}`;

        // Fetch header SVG from Node.js backend using backend parameters and embed into worksheet
        const headerBase64 = await fetchHeaderImageBase64(tabFormattedDate, tabArabicWeekday, undefined, tabEnglishWeekday);
        applySheetHeaderToWorksheet(worksheet, workbook, headerBase64, tabTitle);

        // Group check-ins under this day by department (Speciality) after authoritative enrichment
        const enrichedDayCheckins = dayCheckins.map((c) => enrichCheckInClient(c));
        const groupedByDept: { [key: string]: CheckIn[] } = {};
        enrichedDayCheckins.forEach((c) => {
          if (!groupedByDept[c.department]) {
            groupedByDept[c.department] = [];
          }
          groupedByDept[c.department].push(c);
        });

        let currentRowNum = 8;

        Object.keys(groupedByDept).forEach((dept) => {
          // Add Specialty separator row
          const separatorRow = worksheet.getRow(currentRowNum);
          separatorRow.height = 26;
          
          // Merge columns 1 to 6
          worksheet.mergeCells(currentRowNum, 1, currentRowNum, 6);
          
          const firstCell = separatorRow.getCell(1);
          firstCell.value = `■ ${dept} ■`;
          
          // Soft mint separator background (#A7F3D0) from the SVG header palette
          const separatorColor = "FFA7F3D0"; 
          
          separatorRow.eachCell((cell) => {
            cell.font = {
              name: "Segoe UI",
              color: { argb: "FF063B30" },
              bold: true,
              size: 11
            };
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: separatorColor }
            };
            cell.alignment = {
              horizontal: "center",
              vertical: "middle"
            };
            cell.border = {
              top: { style: "thin", color: { argb: "FF6EE7B7" } },
              left: { style: "thin", color: { argb: "FF6EE7B7" } },
              bottom: { style: "thin", color: { argb: "FF6EE7B7" } },
              right: { style: "thin", color: { argb: "FF6EE7B7" } }
            };
          });

          currentRowNum++;

          // Add doctor rows under this specialty
          groupedByDept[dept].forEach((c, idx) => {
            const enriched = enrichCheckInClient(c);
            const row = worksheet.getRow(currentRowNum);
            row.height = 22;

            const timestampFormatted = formatTimestampStr(enriched.timestamp);
            const shiftsFormatted = formatShiftsForDisplay(enriched.shifts);

            row.values = [
              enriched.id,
              timestampFormatted,
              enriched.doctorArabicName,
              enriched.department,
              shiftsFormatted,
              enriched.mobileNumber || "N/A"
            ];

            // Zebra striping - alternating white and soft light-mint tint #F0FDF9 from the SVG header
            const isEven = idx % 2 === 0;
            const rowBgColor = isEven ? "FFFFFFFF" : "FFF0FDF9";

            row.eachCell((cell, colNumber) => {
              cell.font = {
                name: "Segoe UI",
                color: { argb: "FF063B30" },
                bold: colNumber !== 2, // All text bolded except dates (col 2 Timestamp)
                size: 10
              };
              cell.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: rowBgColor }
              };
              cell.alignment = {
                horizontal: "center",
                vertical: "middle"
              };
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
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Monthly_Cumulative_Roster_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error exporting monthly excel:", err);
      alert("Failed to export styled monthly Excel sheet.");
    } finally {
      setIsDownloadingMonthly(false);
    }
  };
  const downloadWeeklyCSVReport = downloadMonthlyCSVReport;

  // Admin & Coordinator login handler
  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError("");
    const pin = adminPasscode.trim();
    if (pin === "Mohanad") {
      setAdminRole("admin");
      setIsAdminAuthenticated(true);
      setIsAdminMode(true);
      setShowAdminLogin(false);
      setAdminPasscode("");
      fetchFullDoctorsDatabase(true);
    } else if (pin.toLowerCase() === "coordinator") {
      setAdminRole("coordinator");
      setIsAdminAuthenticated(true);
      setAdminTab("database");
      setIsAdminMode(true);
      fetchFullDoctorsDatabase(true);
      setShowAdminLogin(false);
      setAdminPasscode("");
    } else {
      setAdminError("Invalid admin or coordinator passcode.");
    }
  };

  // Download Excel Sheet (.xlsx) with separators and custom color theme matching the template
  const downloadCSVReport = async () => {
    if (checkins.length === 0) {
      alert("No check-ins available to export.");
      return;
    }

    setIsDownloadingDaily(true);
    // Group check-ins by department (Speciality) after authoritative enrichment
    const enrichedCheckins = checkins.map((c) => enrichCheckInClient(c));
    const grouped: { [key: string]: CheckIn[] } = {};
    enrichedCheckins.forEach((c) => {
      if (!grouped[c.department]) {
        grouped[c.department] = [];
      }
      grouped[c.department].push(c);
    });

    // Helper to format timestamp: M/D/YY HH:MM
    const formatTimestamp = (timestampStr: string) => {
      const d = new Date(timestampStr);
      const month = d.getMonth() + 1;
      const day = d.getDate();
      const year = String(d.getFullYear()).slice(-2);
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      return `${month}/${day}/${year} ${hours}:${minutes}`;
    };

    const workbook = await createExcelWorkbook();
    const worksheet = workbook.addWorksheet("Roster Report", {
      views: [{ showGridLines: true }]
    });

    const nowEgypt = new Date();
    const egyptHourStr = nowEgypt.toLocaleTimeString("en-US", { timeZone: "Africa/Cairo", hour: "numeric", hour12: false });
    const egyptMinStr = nowEgypt.toLocaleTimeString("en-US", { timeZone: "Africa/Cairo", minute: "numeric" });
    const egyptHour = parseInt(egyptHourStr, 10) || 0;
    const egyptMin = parseInt(egyptMinStr, 10) || 0;
    const isPastReset = egyptHour > 18 || (egyptHour === 18 && egyptMin >= 30);
    const d = new Date(nowEgypt);
    if (isPastReset) {
      d.setDate(d.getDate() + 1);
    }

    const arabicWeekday = new Intl.DateTimeFormat("ar-EG", {
      timeZone: "Africa/Cairo",
      weekday: "long"
    }).format(d);
    const englishWeekday = new Intl.DateTimeFormat("en-US", {
      timeZone: "Africa/Cairo",
      weekday: "long"
    }).format(d);
    const formattedDate = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Cairo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(d);
    const targetIsoDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Cairo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(d);
    const dailyTitle = `الأطباء المتواجدين عن يوم ${arabicWeekday} ${formattedDate}`;

    // Fetch header SVG from Node.js backend using backend parameters and embed into worksheet
    const headerBase64 = await fetchHeaderImageBase64(formattedDate, arabicWeekday, undefined, englishWeekday, { autoReset: true });
    applySheetHeaderToWorksheet(worksheet, workbook, headerBase64, dailyTitle);

    let currentRowNum = 8;

    // Process each department
    Object.keys(grouped).forEach((dept) => {
      // Add Specialty separator row
      const separatorRow = worksheet.getRow(currentRowNum);
      separatorRow.height = 26;
      
      // Merge columns 1 to 6
      worksheet.mergeCells(currentRowNum, 1, currentRowNum, 6);
      
      const firstCell = separatorRow.getCell(1);
      firstCell.value = `■ ${dept} ■`;
      
      // Soft mint separator background (#A7F3D0) from the SVG header palette
      const separatorColor = "FFA7F3D0"; 
      
      separatorRow.eachCell((cell) => {
        cell.font = {
          name: "Segoe UI",
          color: { argb: "FF063B30" },
          bold: true,
          size: 11
        };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: separatorColor }
        };
        cell.alignment = {
          horizontal: "center",
          vertical: "middle"
        };
        cell.border = {
          top: { style: "thin", color: { argb: "FF6EE7B7" } },
          left: { style: "thin", color: { argb: "FF6EE7B7" } },
          bottom: { style: "thin", color: { argb: "FF6EE7B7" } },
          right: { style: "thin", color: { argb: "FF6EE7B7" } }
        };
      });

      currentRowNum++;

      // Add doctor rows under this specialty
      grouped[dept].forEach((c, idx) => {
        const enriched = enrichCheckInClient(c);
        const row = worksheet.getRow(currentRowNum);
        row.height = 22;

        const timestampFormatted = formatTimestamp(enriched.timestamp);
        const shiftsFormatted = formatShiftsForDisplay(enriched.shifts);

        row.values = [
          enriched.id,
          timestampFormatted,
          enriched.doctorArabicName,
          enriched.department,
          shiftsFormatted,
          enriched.mobileNumber || "N/A"
        ];

        // Zebra striping - alternating white and soft light-mint tint #F0FDF9 from the SVG header
        const isEven = idx % 2 === 0;
        const rowBgColor = isEven ? "FFFFFFFF" : "FFF0FDF9";

        row.eachCell((cell, colNumber) => {
          cell.font = {
            name: "Segoe UI",
            color: { argb: "FF063B30" },
            bold: colNumber !== 2, // All text bolded except dates (col 2 Timestamp)
            size: 10
          };
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: rowBgColor }
          };
          cell.alignment = {
            horizontal: "center",
            vertical: "middle"
          };
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

    try {
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Physician_Checkins_${targetIsoDate}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error exporting styled excel:", err);
      alert("Failed to export styled Excel sheet. Please try again.");
    } finally {
      setIsDownloadingDaily(false);
    }
  };

  const handleSendWhatsAppSheet = async () => {
    if (isSendingWhatsApp) return;
    setIsSendingWhatsApp(true);
    try {
      const res = await fetch("/api/whatsapp/send-daily-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || "Failed to send to WhatsApp");
      }
      alert(`✅ ${data.message || "Daily sheet successfully sent to the WhatsApp group!"}`);
    } catch (err: any) {
      console.error("Error sending daily sheet to WhatsApp:", err);
      alert(`❌ WhatsApp delivery failed: ${err.message || err}\n\nPlease check GREEN_API_ID_INSTANCE, GREEN_API_API_TOKEN_INSTANCE, and WHATSAPP_GROUP_ID in .env or Vercel Environment Variables.`);
    } finally {
      setIsSendingWhatsApp(false);
    }
  };

  // Filtered checkins in admin grid
  const filteredCheckins = checkins.filter((c) => {
    const matchesSearch =
      c.id.toLowerCase().includes(adminSearch.toLowerCase()) ||
      c.doctorName.toLowerCase().includes(adminSearch.toLowerCase()) ||
      c.doctorArabicName.includes(adminSearch);
    
    const matchesDept = adminDeptFilter === "All" || c.department === adminDeptFilter;
    
    return matchesSearch && matchesDept;
  });

  // Departments list for filter dropdown
  const uniqueDepts = Array.from(new Set(checkins.map((c) => c.department)));

  return (
    <div id="app-root" className="min-h-screen bg-[#d2deda] font-sans flex flex-col text-slate-850">
      
      {/* Top Navigation Bar in Geometric Balance style */}
      <header 
        className="h-20 flex items-center justify-between px-8 bg-[#dae4e1] border-b border-[#cbdad5] shadow-md sticky top-0 z-40 relative overflow-hidden"
        style={{ 
          backgroundImage: "url('/header_bg.png')",
          backgroundSize: "cover",
          backgroundPosition: "center 45%",
          backgroundRepeat: "no-repeat"
        }}
      >
        {/* Impeccable contrast scrim: solid medical sage on left for AAA typography readability, transparent center allowing the heartbeat ECG and hospital telemetry artwork to shine clearly, balanced soft tint on right for actions */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#dae4e1]/95 via-[#dae4e1]/30 to-[#dae4e1]/75 pointer-events-none z-0"></div>
        {/* Subtle hospital tech accent line at top */}
        <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-emerald-600/30 via-emerald-400/50 to-emerald-600/30 pointer-events-none z-0"></div>
        
        <div className="flex items-center gap-3 relative z-10">
          <div className="w-11 h-11 bg-[#063b30] rounded-xl flex items-center justify-center shadow-md border border-emerald-800/10 overflow-hidden p-1">
            <img src="/elite_logo.png" alt="Elite Hospital Logo" className="w-8 h-8 object-contain" />
          </div>
          <div className="leading-none">
            <h1 className="text-lg font-black tracking-tight text-[#063b30] uppercase drop-shadow-sm">Mohanad's Elite Doctors' Registry</h1>
            <p className="text-[10px] text-emerald-800 font-bold tracking-widest uppercase mt-0.5">All rights reserved to Dr. Mohanad El Ma'moun , MSC</p>
          </div>
        </div>
        <div className="flex items-center gap-6 relative z-10">
          <div className="text-right hidden sm:block leading-none">
            <LiveClock />
          </div>
          {isAdminAuthenticated ? (
            <div className="flex items-center gap-2">
              <span className="bg-[#e6f2ee] text-[#063b30] text-[10px] font-black px-2.5 py-1 rounded-full border border-[#cbdad5] flex items-center gap-1 shadow-sm">
                <span className="w-1.5 h-1.5 bg-emerald-600 rounded-full animate-pulse"></span>
                {adminRole === "coordinator" ? "COORDINATOR ACCESS" : "LIVE OVERVIEW"}
              </span>
              <button
                id="admin-logout-btn"
                onClick={() => {
                  setIsAdminAuthenticated(false);
                  setIsAdminMode(false);
                  setAdminRole(null);
                  setAdminPasscode("");
                  setAdminTab("roster");
                }}
                className="px-4 py-2 bg-rose-950/20 hover:bg-rose-950/30 text-rose-800 border border-rose-950/25 text-xs font-bold rounded shadow transition-colors uppercase"
                title={adminRole === "coordinator" ? "Logout Coordinator" : "Logout Admin"}
              >
                {adminRole === "coordinator" ? "COORDINATOR LOGOUT" : "ADMIN LOGOUT"}
              </button>
            </div>
          ) : (
            <button
              id="admin-login-trigger"
              onClick={() => setShowAdminLogin(true)}
              className="px-4 py-2 bg-[#063b30] hover:bg-[#042d24] text-white text-xs font-bold rounded shadow transition-colors uppercase"
            >
              ADMIN PANEL
            </button>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8 flex flex-col justify-center">
        
        {/* Toggle between Patient Check-in and Admin/Coordinator Dashboard if Authenticated */}
        {isAdminAuthenticated && (
          <div className="mb-6 flex justify-center">
            <div className="bg-[#cbdad5]/40 p-1 rounded-xl flex items-center gap-1 border border-[#cbdad5]">
              <button
                onClick={() => setIsAdminMode(false)}
                className={`px-5 py-2 rounded-lg text-xs font-bold uppercase transition-all duration-150 flex items-center gap-2 ${
                  !isAdminMode
                    ? "bg-[#063b30] text-white shadow-sm"
                    : "text-emerald-900 hover:text-[#063b30]"
                }`}
              >
                <Stethoscope className="w-4 h-4" />
                Physician Check-In Screen
              </button>
              <button
                onClick={() => {
                  setIsAdminMode(true);
                  if (adminRole === "coordinator") {
                    setAdminTab("database");
                    fetchFullDoctorsDatabase(true);
                  }
                }}
                className={`px-5 py-2 rounded-lg text-xs font-bold uppercase transition-all duration-150 flex items-center gap-2 ${
                  isAdminMode
                    ? "bg-[#063b30] text-white shadow-sm"
                    : "text-emerald-900 hover:text-[#063b30]"
                }`}
              >
                {adminRole === "coordinator" ? (
                  <>
                    <Database className="w-4 h-4" />
                    Physician Database Management ({fullDoctorList.length})
                  </>
                ) : (
                  <>
                    <Layers className="w-4 h-4" />
                    Control Panel Dashboard ({checkins.length})
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        <AnimatePresence mode="wait">
          {!isAdminMode ? (
            
            /* ======================================================= */
            /*                 PHYSICIAN CHECK-IN VIEW                 */
            /* ======================================================= */
            <motion.div
              key="checkin-screen"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
              className="max-w-2xl mx-auto w-full"
            >
              <div className="bg-white rounded-xl border border-[#cbdad5] p-8 shadow-sm">
                
                <div className="flex items-center gap-2 mb-8 border-l-4 border-[#063b30] pl-4">
                  <h2 className="text-2xl font-bold text-[#063b30]">Personnel Check-In</h2>
                </div>

                <div className="space-y-6">

                  {/* STEP 1: Enter ID / Code */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label htmlFor="physician-id-input" className="text-xs font-extrabold text-slate-700 uppercase tracking-wider block cursor-pointer">
                        Enter Employee ID or Name
                      </label>
                      <span className="text-slate-600 font-bold text-xs font-mono">البحث بالاسم أو الرمز الوظيفي</span>
                    </div>

                    <form onSubmit={handleSearchDoctor} className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                           id="physician-id-input"
                           type="text"
                           placeholder="e.g. 1498, Beshoy, عمرو..."
                           value={inputId}
                           onChange={(e) => {
                             setInputId(e.target.value);
                             setErrorMessage("");
                           }}
                           onFocus={() => setShowSuggestions(true)}
                           onBlur={() => setTimeout(() => setShowSuggestions(false), 250)}
                           disabled={submitting || !!submitSuccess}
                           className="w-full h-14 px-4 bg-[#fbfdfc] border-2 border-[#cbdad5] rounded-lg text-lg font-sans focus:border-[#063b30] focus:bg-white outline-none transition-all"
                        />
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                          <Search className="w-5 h-5" />
                        </div>

                        {/* Search Autocomplete Suggestions Dropdown */}
                        {showSuggestions && suggestions.length > 0 && (
                          <div className="absolute left-0 right-0 mt-1.5 bg-white border border-[#cbdad5] rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto divide-y divide-slate-100">
                            {suggestions.map((doc, idx) => (
                              <button
                                key={`sug-${doc.id}-${idx}`}
                                type="button"
                                onClick={() => {
                                  setInputId(doc.id);
                                  setFoundDoctor(doc);
                                  setIsManualReg(false);
                                  setSearched(true);
                                  setSuggestions([]);
                                  setShowSuggestions(false);
                                }}
                                className="w-full text-left px-4 py-3 hover:bg-emerald-50/50 transition-colors flex justify-between items-center text-sm"
                              >
                                <div className="text-slate-800 font-semibold">
                                  <div>{doc.name}</div>
                                  <div className="text-xs text-slate-500 font-normal">{doc.arabicName}</div>
                                </div>
                                <div className="text-right">
                                  <span className="text-[10px] font-black bg-emerald-50 text-emerald-800 px-2.5 py-0.5 rounded-full uppercase">
                                    {doc.department}
                                  </span>
                                  <div className="text-[10px] text-slate-500 font-mono mt-1">ID: {doc.id}</div>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      
                      <button
                        id="search-doctor-btn"
                        type="submit"
                        disabled={!inputId.trim() || submitting || !!submitSuccess}
                        className="h-14 px-6 bg-[#063b30] hover:bg-[#042d24] text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm shadow-sm cursor-pointer"
                      >
                        Find Profile
                      </button>
                    </form>


                  </div>

                  {/* STEP 2: Doctor Profile details (predefined found, or manual entry) */}
                  <AnimatePresence mode="wait">
                    {searched && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        {foundDoctor ? (
                          /* Predefined Profile Found Visual Card (Geometric Balance) */
                          <div className="p-6 bg-[#e6f2ee] rounded-xl border border-[#cbdad5] flex items-center justify-between">
                            <div className="space-y-1">
                              <h3 className="text-2xl font-bold text-[#063b30]">{foundDoctor.name}</h3>
                              <p className="text-xl text-emerald-800 font-medium font-arabic arabic-font" dir="rtl">{foundDoctor.arabicName}</p>
                            </div>
                            <div className="text-right">
                              <span className="px-3 py-1 bg-emerald-100 text-emerald-900 text-[10px] font-black rounded-full uppercase tracking-wider font-mono">
                                {foundDoctor.department}
                              </span>
                              <p className="text-xs text-slate-500 mt-2 font-semibold">Physician ID: {foundDoctor.id}</p>
                            </div>
                          </div>
                        ) : isManualReg ? (
                          /* Manual Entry Form formatted in Geometric style */
                          <div className="p-6 bg-[#e6f2ee]/50 rounded-xl border border-[#cbdad5] space-y-4">
                            <div className="flex items-center gap-2 text-[#063b30] font-semibold text-sm">
                              <AlertCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                              <div>
                                <span className="font-bold">ID Code not found in default catalog.</span>
                                <p className="text-slate-500 font-medium text-xs">Please manually enter your physician identity to register check-in.</p>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-1">
                                <label htmlFor="manual-doctor-name" className="text-xs font-bold text-slate-700 uppercase tracking-wider block">English Name</label>
                                <input
                                  id="manual-doctor-name"
                                  type="text"
                                  placeholder="Dr. First Last"
                                  value={manualName}
                                  onChange={(e) => setManualName(e.target.value)}
                                  className="w-full px-4 py-2.5 bg-white border border-[#cbdad5] rounded-lg text-sm text-slate-800 focus:border-[#063b30] outline-none"
                                />
                              </div>
                              <div className="space-y-1">
                                <label htmlFor="manual-doctor-arabic-name" className="text-xs font-bold text-slate-700 uppercase tracking-wider block text-right">اسم الطبيب (بالعربية)</label>
                                <input
                                  id="manual-doctor-arabic-name"
                                  type="text"
                                  dir="rtl"
                                  placeholder="د. الاسم الكامل"
                                  value={manualArabicName}
                                  onChange={(e) => setManualArabicName(e.target.value)}
                                  className="w-full px-4 py-2.5 bg-white border border-[#cbdad5] rounded-lg text-sm text-slate-800 focus:border-[#063b30] outline-none text-right font-sans"
                                />
                              </div>
                            </div>

                            <div className="space-y-1">
                              <label htmlFor="manual-doctor-dept" className="text-xs font-bold text-slate-700 uppercase tracking-wider block">Department / Specialty</label>
                              <select
                                id="manual-doctor-dept"
                                value={manualDept}
                                onChange={(e) => setManualDept(e.target.value)}
                                className="w-full px-4 py-2.5 bg-white border border-[#cbdad5] rounded-lg text-sm text-slate-800 focus:border-[#063b30] outline-none"
                              >
                                <option value="">-- Choose Specialization / Department --</option>
                                {COMMON_DEPARTMENTS.map((dept, idx) => (
                                  <option key={`mdept-${dept}-${idx}`} value={dept}>{dept}</option>
                                ))}
                                <option value="Other Clinic">Other Clinic</option>
                              </select>
                            </div>
                          </div>
                        ) : null}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* STEP 3: Shift Selection */}
                  <div className="space-y-3 transition-all duration-200">
                    <div className="flex justify-between items-end">
                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                        Shift Assignment (Select Shifts)
                      </label>
                      <span className="text-xs text-emerald-900 bg-emerald-100 px-2.5 py-0.5 rounded font-bold font-mono">
                        {selectedShifts.length} / 3 SELECTED
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {SHIFT_OPTIONS.map((shift, idx) => {
                        const isSelected = selectedShifts.includes(shift.id);
                        
                        return (
                          <button
                            id={`shift-card-${shift.id.replace(/\s+/g, "-")}`}
                            key={`shift-${shift.id}-${idx}`}
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() => handleToggleShift(shift.id)}
                            className={`flex items-center p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 text-left justify-between ${
                              isSelected
                                ? "border-[#063b30] bg-[#e6f2ee]/30 ring-4 ring-[#063b30]/10 text-[#063b30] font-bold"
                                : "border-[#cbdad5] bg-[#fbfdfc] hover:border-emerald-300 text-slate-600"
                            }`}
                          >
                            <div className="flex items-center">
                              <div className={`w-5 h-5 rounded-full border-2 mr-3 flex items-center justify-center shrink-0 ${
                                isSelected ? "border-4 border-[#063b30] bg-white" : "border-slate-300 bg-white"
                              }`}>
                              </div>
                              <div className="leading-tight">
                                <span className={`text-sm font-bold block ${isSelected ? "text-[#063b30]" : "text-slate-800"}`}>{shift.labelEn}</span>
                                <span className="text-[10px] text-slate-500 block font-medium mt-0.5">{shift.descriptionEn}</span>
                              </div>
                            </div>
                            <span className="font-bold text-xs arabic-font shrink-0 ml-1">{shift.labelAr}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Errors / Warnings */}
                  {errorMessage && (
                    <div role="alert" aria-live="assertive" className="bg-red-50 text-red-800 px-4 py-3 rounded-lg border border-red-200 flex items-start gap-2 text-xs font-semibold">
                      <AlertCircle className="w-4.5 h-4.5 shrink-0 text-red-600" />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  {/* Submission success screen layout */}
                  <AnimatePresence>
                    {submitSuccess && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        className="bg-[#e6f2ee] text-[#063b30] border border-[#cbdad5] rounded-xl p-6 flex flex-col items-center text-center space-y-3"
                      >
                        <div className="w-12 h-12 bg-[#063b30] text-white rounded-full flex items-center justify-center shadow">
                          <CheckCircle className="w-6 h-6 animate-bounce" />
                        </div>
                        <div>
                          <span className="text-[10px] font-black uppercase text-[#063b30] tracking-wider block">Attendance Saved successfully</span>
                          <h4 className="text-xl font-bold text-slate-900 mt-0.5">Thank you, Dr. {submitSuccess.doctorName}</h4>
                          <p className="text-slate-600 font-medium text-sm arabic-font mt-0.5" dir="rtl">تم تسجيل حضوركم بنجاح: د. {submitSuccess.doctorArabicName}</p>
                          <div className="mt-3 inline-flex gap-1.5 flex-wrap justify-center">
                            {(() => {
                              let displayShifts = [...submitSuccess.shifts];
                              if (displayShifts.length === 3 &&
                                  displayShifts.includes("Morning shift") &&
                                  displayShifts.includes("Evening shift") &&
                                  displayShifts.includes("Night shift")) {
                                displayShifts = ["24 shift"];
                              }
                              return displayShifts.map((sh, idx) => (
                                <span key={`sh-${sh}-${idx}`} className="bg-[#cbdad5] text-[#063b30] px-2.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider font-mono">
                                  {SHIFT_MAP_AR[sh] || sh}
                                </span>
                              ));
                            })()}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Bottom Action buttons */}
                  <div className="flex gap-3 pt-4 border-t border-slate-100">
                    <button
                      id="reset-form-btn"
                      type="button"
                      onClick={handleResetForm}
                      disabled={submitting || !inputId}
                      className="px-5 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs uppercase border border-slate-200 transition-all disabled:opacity-40"
                    >
                      Reset Form
                    </button>
                    
                    <button
                      id="submit-checkin-btn"
                      type="button"
                      disabled={!inputId.trim() || selectedShifts.length === 0 || submitting || !!submitSuccess}
                      onClick={handleSubmitCheckin}
                      className="flex-1 h-16 bg-[#7ea198] hover:bg-[#6b8e86] text-white rounded-lg font-bold text-lg tracking-wide transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                    >
                      {submitting ? (
                        <>
                          <div className="w-4.5 h-4.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                          <span>Confirming...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-5 h-5" />
                          <span>Confirm Attendance</span>
                        </>
                      )}
                    </button>
                  </div>

                </div>
              </div>
            </motion.div>
          ) : (
            
            /* ======================================================= */
            /*                 CONTROL PANEL DASHBOARD                 */
            /* ======================================================= */
            <motion.div
              key="admin-dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
              className="space-y-6"
            >
              
              {/* Admin Navigation Sub-Tabs */}
              <div className="bg-white rounded-xl border border-[#cbdad5] p-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  {adminRole === "admin" && (
                    <button
                      onClick={() => setAdminTab("roster")}
                      className={`px-4 py-2.5 rounded-lg text-xs font-bold uppercase transition-all flex items-center gap-2 ${
                        adminTab === "roster"
                          ? "bg-[#063b30] text-white shadow-sm"
                          : "text-slate-600 hover:text-[#063b30] hover:bg-slate-50"
                      }`}
                    >
                      <Layers className="w-4 h-4" />
                      <span>Active Roster & Operations</span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setAdminTab("database");
                      fetchFullDoctorsDatabase(true);
                    }}
                    className={`px-4 py-2.5 rounded-lg text-xs font-bold uppercase transition-all flex items-center gap-2 ${
                      adminTab === "database"
                        ? "bg-[#063b30] text-white shadow-sm"
                        : "text-slate-600 hover:text-[#063b30] hover:bg-slate-50"
                    }`}
                  >
                    <Database className="w-4 h-4" />
                    <span>Physician Database Management ({fullDoctorList.length})</span>
                    {adminRole === "coordinator" && (
                      <span className="ml-1.5 bg-emerald-500/20 text-emerald-300 text-[10px] px-2 py-0.5 rounded font-mono font-bold border border-emerald-400/30">
                        COORDINATOR ACCESS
                      </span>
                    )}
                  </button>

                  {adminRole === "admin" && (
                    <>
                      <button
                        onClick={() => {
                          setAdminTab("duplicates");
                          fetchFullDoctorsDatabase(true);
                        }}
                        className={`px-4 py-2.5 rounded-lg text-xs font-bold uppercase transition-all flex items-center gap-2 ${
                          adminTab === "duplicates"
                            ? "bg-amber-700 text-white shadow-sm"
                            : "text-slate-600 hover:text-amber-800 hover:bg-amber-50"
                        }`}
                      >
                        <Copy className="w-4 h-4 text-amber-500" />
                        <span>Duplicated IDs</span>
                        {duplicateGroups.length > 0 && (
                          <span className="ml-1 bg-rose-600 text-white text-[10px] font-mono px-2 py-0.5 rounded-full font-bold shadow-xs">
                            {duplicateGroups.length}
                          </span>
                        )}
                      </button>

                      <button
                        onClick={() => {
                          setAdminTab("supabase");
                          fetchSupabaseStatus();
                        }}
                        className={`px-4 py-2.5 rounded-lg text-xs font-bold uppercase transition-all flex items-center gap-2 ${
                          adminTab === "supabase"
                            ? "bg-[#063b30] text-emerald-300 shadow-sm border border-emerald-600"
                            : "text-slate-600 hover:text-[#063b30] hover:bg-slate-50"
                        }`}
                      >
                        <Server className="w-4 h-4 text-emerald-500" />
                        <span>Supabase Migration</span>
                        {supabaseStatus?.configured ? (
                          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                        ) : null}
                      </button>
                    </>
                  )}
                </div>

                {adminTab === "database" && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleOpenAddDoctor}
                      className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
                    >
                      <UserPlus className="w-4 h-4" />
                      <span>ADD NEW PHYSICIAN</span>
                    </button>

                    <button
                      onClick={downloadPhysiciansDatabaseXLS}
                      disabled={isDownloadingDatabase}
                      className="px-3.5 py-2 bg-[#063b30] hover:bg-[#042d24] text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                    >
                      {isDownloadingDatabase ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <FileSpreadsheet className="w-4 h-4" />
                      )}
                      <span>{isDownloadingDatabase ? "DOWNLOADING..." : "DOWNLOAD DATABASE XLS"}</span>
                    </button>
                  </div>
                )}
              </div>

              {adminTab === "database" ? (
                /* ======================================================= */
                /*           PHYSICIAN DATABASE MANAGEMENT TAB             */
                /* ======================================================= */
                <div className="space-y-6">
                  {/* Search, Specialty Filter & Add Physician Header */}
                  <div className="bg-white rounded-xl border border-[#cbdad5] p-5 shadow-sm space-y-4">
                    <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
                      <div className="flex flex-col sm:flex-row gap-3 flex-1">
                        <div className="relative flex-1">
                          <input
                            type="text"
                            placeholder="Search database by ID, English Name, Arabic Name, or Phone..."
                            value={dbSearch}
                            onChange={(e) => setDbSearch(e.target.value)}
                            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-[#cbdad5] rounded-lg text-sm text-slate-800 focus:bg-white focus:border-[#063b30] outline-none transition-all"
                          />
                          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        </div>

                        <select
                          value={dbDeptFilter}
                          onChange={(e) => setDbDeptFilter(e.target.value)}
                          className="bg-slate-50 border border-[#cbdad5] text-[#063b30] font-bold text-xs uppercase px-3.5 py-2.5 rounded-lg outline-none focus:border-[#063b30] cursor-pointer"
                        >
                          <option value="All">All Specialities ({fullDoctorList.length})</option>
                          {Array.from(new Set(fullDoctorList.map(d => d.department))).sort().map((dept, idx) => (
                            <option key={`dbdept-${dept}-${idx}`} value={dept}>{dept}</option>
                          ))}
                        </select>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          onClick={handleOpenAddDoctor}
                          className="px-4 py-2.5 bg-[#063b30] hover:bg-[#084c3e] text-white font-bold text-xs uppercase tracking-wider rounded-lg shadow-sm transition-colors flex items-center gap-2 cursor-pointer"
                        >
                          <UserPlus className="w-4 h-4 text-emerald-400" />
                          <span>+ ADD NEW PHYSICIAN</span>
                        </button>

                        <span className="text-xs font-bold text-[#063b30] bg-[#e6f2ee] px-3.5 py-2.5 rounded-lg border border-[#cbdad5] font-mono">
                          Showing {filteredDbDoctors.length} of {fullDoctorList.length} Physicians
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Batch Selection Action Bar */}
                  {selectedDbDoctorIds.length > 0 && (
                    <div className="bg-rose-50 border-2 border-rose-200 p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm animate-fadeIn">
                      <div className="flex items-center gap-2.5 text-rose-900 font-bold text-sm">
                        <span className="bg-rose-600 text-white font-mono text-xs font-bold px-2.5 py-0.5 rounded-full">
                          {selectedDbDoctorIds.length}
                        </span>
                        <span>Physician(s) Selected for Batch Operation</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={handleOpenBatchDeleteModal}
                          disabled={isDeletingDoctor}
                          className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold text-xs uppercase rounded-lg shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete Selected ({selectedDbDoctorIds.length})</span>
                        </button>
                        <button
                          onClick={() => setSelectedDbDoctorIds([])}
                          className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-lg border border-slate-300 transition-colors cursor-pointer"
                        >
                          Deselect All
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Database Physicians Table */}
                  <div className="bg-white rounded-xl border border-[#cbdad5] shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-[#063b30] text-white text-[11px] font-bold uppercase tracking-wider">
                            <th className="py-3.5 px-4 w-10 text-center">
                              <input
                                type="checkbox"
                                checked={
                                  filteredDbDoctors.length > 0 &&
                                  filteredDbDoctors.every((d) => selectedDbDoctorIds.includes(d.id))
                                }
                                onChange={handleSelectAllFilteredDoctors}
                                className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
                                title="Select / Deselect all visible doctors"
                                aria-label="Select or deselect all visible physicians"
                              />
                            </th>
                            <th className="py-3.5 px-4">Emp ID</th>
                            <th className="py-3.5 px-4">English Name</th>
                            <th className="py-3.5 px-4 text-right">اسم الطبيب (Arabic)</th>
                            <th className="py-3.5 px-4">Specialty / Dept</th>
                            <th className="py-3.5 px-4">Phone Number</th>
                            <th className="py-3.5 px-4 text-center">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                          {filteredDbDoctors.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="text-center py-12 text-slate-400">
                                No physicians found matching search criteria.
                              </td>
                            </tr>
                          ) : (
                            filteredDbDoctors.map((doc, idx) => {
                              const isSelected = selectedDbDoctorIds.includes(doc.id);
                              return (
                                <tr
                                  key={`dbdoc-${doc.id}-${idx}`}
                                  className={`transition-colors ${
                                    isSelected ? "bg-amber-50/80" : "hover:bg-slate-50"
                                  }`}
                                >
                                  <td className="py-3 px-4 text-center">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => handleToggleSelectDoctor(doc.id)}
                                      className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                                      aria-label={`Select Dr. ${doc.name}`}
                                    />
                                  </td>
                                  <td className="py-3 px-4 font-mono font-bold text-[#063b30]">
                                    <span className="bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
                                      {doc.id}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4 font-semibold text-slate-900">{doc.name}</td>
                                  <td className="py-3 px-4 text-right font-bold arabic-font text-slate-800" dir="rtl">{doc.arabicName}</td>
                                  <td className="py-3 px-4 font-medium text-slate-600">
                                    <span className="bg-[#e6f2ee] text-[#063b30] px-2 py-0.5 rounded-full text-[10px] font-bold border border-[#cbdad5]">
                                      {doc.department}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4 font-mono">
                                    {doc.mobileNumber ? (
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-emerald-800 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1 w-fit">
                                          <Phone className="w-3 h-3 text-emerald-600" />
                                          {doc.mobileNumber}
                                        </span>
                                        <button
                                          onClick={() => handleOpenEditDoctor(doc)}
                                          className="p-2 min-w-[32px] min-h-[32px] flex items-center justify-center text-slate-500 hover:text-[#063b30] hover:bg-slate-100 rounded transition-colors cursor-pointer"
                                          title="Edit phone number"
                                          aria-label={`Edit phone number for Dr. ${doc.name}`}
                                        >
                                          <Edit className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => handleOpenEditDoctor(doc)}
                                        className="text-xs font-bold text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1.5 min-h-[32px] rounded border border-emerald-200 flex items-center gap-1 transition-colors cursor-pointer"
                                        title="Add phone number for this physician"
                                        aria-label={`Add phone number for Dr. ${doc.name}`}
                                      >
                                        <Phone className="w-3 h-3 text-emerald-600" />
                                        <span>+ Add Phone</span>
                                      </button>
                                    )}
                                  </td>
                                  <td className="py-3 px-4 text-center">
                                    <div className="flex items-center justify-center gap-2">
                                      <button
                                        onClick={() => handleOpenEditDoctor(doc)}
                                        className="px-2.5 py-1.5 min-h-[32px] bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded text-[11px] border border-slate-200 transition-colors flex items-center gap-1 cursor-pointer"
                                        title="Edit physician details (ID, Names, Specialty, Phone)"
                                        aria-label={`Edit physician details for Dr. ${doc.name}`}
                                      >
                                        <Edit className="w-3 h-3 text-slate-600" />
                                        <span>Edit</span>
                                      </button>
                                      <button
                                        onClick={() => handleOpenSingleDeleteModal(doc)}
                                        className="p-2 min-w-[32px] min-h-[32px] flex items-center justify-center text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                                        title="Delete physician from database"
                                        aria-label={`Delete physician Dr. ${doc.name} from database`}
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : adminTab === "duplicates" ? (
                /* ======================================================= */
                /*                 DUPLICATED IDS TAB                      */
                /* ======================================================= */
                <div className="space-y-6">
                  {/* Header Banner & Stats */}
                  <div className="bg-amber-500/10 border-2 border-amber-500/30 rounded-xl p-5 shadow-sm space-y-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="p-3 bg-amber-600 text-white rounded-xl shadow-sm">
                          <Copy className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-amber-950 flex items-center gap-2">
                            <span>Duplicated Employee IDs Audit & Resolution</span>
                            <span className="bg-amber-600 text-white text-xs font-mono px-2.5 py-0.5 rounded-full font-bold">
                              {duplicateGroups.length} Conflict Groups
                            </span>
                          </h3>
                          <p className="text-xs text-amber-900/80 mt-0.5">
                            Review records sharing identical Employee IDs. Take immediate resolution actions: re-assign unique IDs, keep a specific physician, or remove duplicates.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => fetchFullDoctorsDatabase(true)}
                          className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs rounded-lg border border-slate-300 shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5 text-slate-600" />
                          <span>Refresh Audit</span>
                        </button>
                      </div>
                    </div>

                    {/* Filter and Search Bar for Duplicates */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-amber-200/60">
                      <div className="flex flex-col sm:flex-row gap-3 flex-1">
                        <div className="relative flex-1">
                          <input
                            type="text"
                            placeholder="Search duplicated IDs or physician names..."
                            value={dupSearch}
                            onChange={(e) => setDupSearch(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-white border border-amber-300/80 rounded-lg text-sm text-slate-800 focus:border-amber-600 outline-none transition-all"
                          />
                          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        </div>

                        <select
                          value={dupDeptFilter}
                          onChange={(e) => setDupDeptFilter(e.target.value)}
                          className="bg-white border border-amber-300/80 text-amber-950 font-bold text-xs uppercase px-3.5 py-2 rounded-lg outline-none focus:border-amber-600 cursor-pointer"
                        >
                          <option value="All">All Specialities ({duplicateGroups.length} groups)</option>
                          {Array.from(
                            new Set(
                              duplicateGroups.flatMap((g) => g.doctors.map((d) => d.department))
                            )
                          )
                            .sort()
                            .map((dept, idx) => (
                              <option key={`dupdept-${dept}-${idx}`} value={dept}>
                                {dept}
                              </option>
                            ))}
                        </select>
                      </div>

                      <div className="text-xs font-bold text-amber-900 bg-amber-100/80 px-3 py-2 rounded-lg border border-amber-200">
                        Showing {filteredDuplicateGroups.length} of {duplicateGroups.length} Duplicate Groups
                      </div>
                    </div>
                  </div>

                  {/* Batch Operations Bar for Duplicated Items */}
                  {selectedDupItemKeys.length > 0 && (
                    <div className="bg-rose-50 border-2 border-rose-200 p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm animate-fadeIn">
                      <div className="flex items-center gap-2.5 text-rose-900 font-bold text-sm">
                        <span className="bg-rose-600 text-white font-mono text-xs font-bold px-2.5 py-0.5 rounded-full">
                          {selectedDupItemKeys.length}
                        </span>
                        <span>Duplicate Record(s) Selected for Batch Action</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={handleBatchDeleteSelectedDupItems}
                          disabled={isDeletingDoctor}
                          className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold text-xs uppercase rounded-lg shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          {isDeletingDoctor ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                          <span>Delete Selected Duplicate Records</span>
                        </button>
                        <button
                          onClick={() => setSelectedDupItemKeys([])}
                          className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-lg border border-slate-300 transition-colors cursor-pointer"
                        >
                          Deselect All
                        </button>
                      </div>
                    </div>
                  )}

                  {/* List of Duplicate Groups */}
                  {filteredDuplicateGroups.length === 0 ? (
                    <div className="bg-white rounded-xl border border-[#cbdad5] p-12 text-center space-y-3 shadow-sm">
                      <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto">
                        <CheckCircle className="w-6 h-6" />
                      </div>
                      <h4 className="text-lg font-bold text-[#063b30]">No Duplicated IDs Found</h4>
                      <p className="text-xs text-slate-500 max-w-md mx-auto">
                        {dupSearch || dupDeptFilter !== "All"
                          ? "No duplicated ID conflict groups match your current filter criteria."
                          : "All physician records in the database currently have unique Employee IDs!"}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {filteredDuplicateGroups.map((group, groupIdx) => {
                        const isGroupAllSelected = group.doctors.every((d) =>
                          selectedDupItemKeys.includes(`${d.id}___${d.name}`)
                        );

                        return (
                          <div
                            key={`dupgroup-${group.normId}-${groupIdx}`}
                            className="bg-white rounded-xl border-2 border-amber-200/90 shadow-xs overflow-hidden"
                          >
                            {/* Duplicate Group Header */}
                            <div className="bg-amber-50/90 border-b border-amber-200 px-5 py-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <input
                                  type="checkbox"
                                  checked={isGroupAllSelected}
                                  onChange={() => handleSelectAllGroupDupItems(group.doctors)}
                                  className="w-4 h-4 accent-amber-600 rounded cursor-pointer mt-0.5 sm:mt-0"
                                  title="Select all records in this conflict group"
                                />
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold uppercase tracking-wider text-amber-900 bg-amber-200/70 border border-amber-300 px-2.5 py-1 rounded font-mono">
                                    ID Collision: {group.displayId}
                                  </span>
                                  <span className="text-xs font-bold text-amber-800 bg-white px-2 py-0.5 rounded border border-amber-200">
                                    {group.doctors.length} Physicians Share This ID
                                  </span>
                                </div>
                              </div>

                              <div className="text-[11px] font-medium text-amber-900/80">
                                Select "Keep This Record" to automatically retain one physician and remove the duplicates.
                              </div>
                            </div>

                            {/* Group Table */}
                            <div className="overflow-x-auto">
                              <table className="w-full text-left border-collapse">
                                <thead>
                                  <tr className="bg-slate-50 text-slate-600 text-[11px] font-bold uppercase border-b border-slate-200">
                                    <th className="py-2.5 px-4 w-10 text-center">Select</th>
                                    <th className="py-2.5 px-4">Emp ID</th>
                                    <th className="py-2.5 px-4">English Name</th>
                                    <th className="py-2.5 px-4 text-right">اسم الطبيب (Arabic)</th>
                                    <th className="py-2.5 px-4">Specialty / Dept</th>
                                    <th className="py-2.5 px-4">Phone Number</th>
                                    <th className="py-2.5 px-4 text-center">Conflict Resolution Actions</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                                  {group.doctors.map((doc, docIdx) => {
                                    const itemKey = `${doc.id}___${doc.name}`;
                                    const isItemSelected = selectedDupItemKeys.includes(itemKey);

                                    return (
                                      <tr
                                        key={`dupitem-${group.normId}-${docIdx}`}
                                        className={`transition-colors ${
                                          isItemSelected ? "bg-amber-50/80" : "hover:bg-slate-50/80"
                                        }`}
                                      >
                                        <td className="py-3 px-4 text-center">
                                          <input
                                            type="checkbox"
                                            checked={isItemSelected}
                                            onChange={() => handleToggleSelectDupItem(doc)}
                                            className="w-4 h-4 accent-amber-600 rounded cursor-pointer"
                                          />
                                        </td>
                                        <td className="py-3 px-4 font-mono font-bold text-amber-900">
                                          <span className="bg-amber-100/60 border border-amber-200 px-2 py-0.5 rounded">
                                            {doc.id}
                                          </span>
                                        </td>
                                        <td className="py-3 px-4 font-bold text-slate-900">
                                          {doc.name}
                                        </td>
                                        <td className="py-3 px-4 text-right font-medium text-slate-800">
                                          {doc.arabicName || doc.name}
                                        </td>
                                        <td className="py-3 px-4">
                                          <span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded text-[11px] font-medium border border-slate-200">
                                            {doc.department}
                                          </span>
                                        </td>
                                        <td className="py-3 px-4 font-mono">
                                          {doc.mobileNumber ? (
                                            <span className="text-emerald-700 font-semibold">
                                              📞 {doc.mobileNumber}
                                            </span>
                                          ) : (
                                            <span className="text-slate-400 italic">No Phone</span>
                                          )}
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                          <div className="flex items-center justify-center gap-2">
                                            {/* Keep Only This Record */}
                                            <button
                                              onClick={() => handleKeepOnlyThisDoctor(doc, group.doctors)}
                                              className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded text-[11px] transition-colors flex items-center gap-1 cursor-pointer shadow-xs"
                                              title="Keep this physician record and delete all other conflicting entries in this group"
                                            >
                                              <UserCheck className="w-3.5 h-3.5" />
                                              <span>Keep This</span>
                                            </button>

                                            {/* Edit & Re-assign ID */}
                                            <button
                                              onClick={() => handleOpenEditDoctor(doc)}
                                              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded text-[11px] transition-colors flex items-center gap-1 cursor-pointer shadow-xs"
                                              title="Edit physician details or re-assign a unique ID"
                                            >
                                              <Edit className="w-3.5 h-3.5" />
                                              <span>Re-assign ID</span>
                                            </button>

                                            {/* Delete Single Entry */}
                                            <button
                                              onClick={async () => {
                                                if (!window.confirm(`Delete "${doc.name}" (ID: ${doc.id}) from database?`)) return;
                                                setIsDeletingDoctor(true);
                                                try {
                                                  const res = await fetch(`/api/doctors/delete/${encodeURIComponent(doc.id)}?name=${encodeURIComponent(doc.name)}`, {
                                                    method: "DELETE"
                                                  });
                                                  if (res.ok) {
                                                    await fetchFullDoctorsDatabase(true);
                                                  } else {
                                                    const data = await res.json().catch(() => ({}));
                                                    alert(data.error || "Failed to delete doctor.");
                                                  }
                                                } catch (err) {
                                                  console.error("Delete error:", err);
                                                } finally {
                                                  setIsDeletingDoctor(false);
                                                }
                                              }}
                                              className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                                              title="Delete this single duplicate entry"
                                            >
                                              <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : adminTab === "supabase" ? (
                /* ======================================================= */
                /*               SUPABASE DATABASE MIGRATION TAB           */
                /* ======================================================= */
                <div className="space-y-6">
                  {/* Supabase Status Banner */}
                  <div className="bg-white rounded-xl border border-[#cbdad5] p-6 shadow-sm space-y-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                      <div className="flex items-center gap-3">
                        <div className="p-3 bg-emerald-50 text-emerald-800 rounded-xl border border-emerald-200">
                          <Server className="w-6 h-6" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-bold text-slate-900">Supabase Database Connection & Migration</h3>
                            {supabaseStatus?.configured ? (
                              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                                Configured
                              </span>
                            ) : (
                              <span className="bg-amber-100 text-amber-800 text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border border-amber-200 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
                                Setup Required
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {supabaseStatus?.url ? (
                              <span className="font-mono text-emerald-900 font-medium">Target Project: {supabaseStatus.url}</span>
                            ) : (
                              "Connect your Supabase project using environment variables or run the automated migration."
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={fetchSupabaseStatus}
                          disabled={isCheckingSupabase}
                          className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg border border-slate-300 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isCheckingSupabase ? "animate-spin" : ""}`} />
                          <span>Check Status</span>
                        </button>

                        <button
                          onClick={handleCopySqlSchema}
                          className="px-3.5 py-2 bg-[#063b30] hover:bg-[#042d24] text-white font-bold text-xs rounded-lg shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          {copiedSqlSchema ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span>SQL Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy SQL Schema</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Supabase Live Table Counts Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                      <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-center">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">doctors</span>
                        <span className="text-xl font-black text-[#063b30] mt-1 block font-mono">
                          {supabaseStatus?.counts ? supabaseStatus.counts.doctors : "—"}
                        </span>
                        <span className="text-[9px] text-slate-400">Master Roster</span>
                      </div>

                      <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-center">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">checkins</span>
                        <span className="text-xl font-black text-[#063b30] mt-1 block font-mono">
                          {supabaseStatus?.counts ? supabaseStatus.counts.checkins : "—"}
                        </span>
                        <span className="text-[9px] text-slate-400">Active Daily</span>
                      </div>

                      <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-center">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">monthly</span>
                        <span className="text-xl font-black text-[#063b30] mt-1 block font-mono">
                          {supabaseStatus?.counts ? (supabaseStatus.counts.monthly_checkins ?? supabaseStatus.counts.weekly_checkins ?? "—") : "—"}
                        </span>
                        <span className="text-[9px] text-slate-400">30-Day Rolling</span>
                      </div>

                      <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-center">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">custom_docs</span>
                        <span className="text-xl font-black text-[#063b30] mt-1 block font-mono">
                          {supabaseStatus?.counts ? supabaseStatus.counts.custom_doctors : "—"}
                        </span>
                        <span className="text-[9px] text-slate-400">Custom Added</span>
                      </div>

                      <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-center">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">phones</span>
                        <span className="text-xl font-black text-[#063b30] mt-1 block font-mono">
                          {supabaseStatus?.counts ? supabaseStatus.counts.custom_doctor_phones : "—"}
                        </span>
                        <span className="text-[9px] text-slate-400">Phone Overrides</span>
                      </div>

                      <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-center">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">deleted_docs</span>
                        <span className="text-xl font-black text-[#063b30] mt-1 block font-mono">
                          {supabaseStatus?.counts ? supabaseStatus.counts.deleted_doctors : "—"}
                        </span>
                        <span className="text-[9px] text-slate-400">Blacklisted</span>
                      </div>
                    </div>
                  </div>

                  {/* Supabase Connection Configuration Box */}
                  <div className="bg-white rounded-xl border border-[#cbdad5] p-6 shadow-sm space-y-4">
                    <div className="border-b border-slate-100 pb-3">
                      <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <Database className="w-4 h-4 text-emerald-700" />
                        <span>Supabase Credentials & Live Connection</span>
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Configure or update your Supabase project URL and API keys. Any doctor addition, edit, or deletion will immediately synchronize with Supabase with zero fallback to previous state.
                      </p>
                    </div>

                    <form onSubmit={handleSaveSupabaseConfig} className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700 block">
                            Supabase URL *
                          </label>
                          <input
                            type="url"
                            required
                            placeholder="https://your-project.supabase.co"
                            value={supabaseConfigForm.url}
                            onChange={(e) => setSupabaseConfigForm({ ...supabaseConfigForm, url: e.target.value })}
                            className="w-full px-3 py-2 bg-slate-50 border border-[#cbdad5] rounded-lg text-xs font-mono focus:bg-white focus:border-[#063b30] outline-none"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700 block">
                            Anon Key / Service Role Key *
                          </label>
                          <input
                            type="password"
                            required
                            placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
                            value={supabaseConfigForm.key}
                            onChange={(e) => setSupabaseConfigForm({ ...supabaseConfigForm, key: e.target.value })}
                            className="w-full px-3 py-2 bg-slate-50 border border-[#cbdad5] rounded-lg text-xs font-mono focus:bg-white focus:border-[#063b30] outline-none"
                          />
                        </div>
                      </div>

                      {supabaseConfigMsg && (
                        <p className={`text-xs font-bold p-2.5 rounded border ${
                          supabaseConfigMsg.includes("successfully") || supabaseConfigMsg.includes("verified")
                            ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                            : "bg-rose-50 text-rose-800 border-rose-200"
                        }`}>
                          {supabaseConfigMsg}
                        </p>
                      )}

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[11px] text-slate-500">
                          Credentials are saved securely to your server environment for permanent synchronization.
                        </span>
                        <button
                          type="submit"
                          disabled={isSavingSupabaseConfig}
                          className="px-5 py-2.5 bg-[#063b30] hover:bg-[#042d24] text-white font-bold text-xs uppercase tracking-wider rounded-lg shadow-sm transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                        >
                          {isSavingSupabaseConfig ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Testing & Connecting...</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Save & Connect to Supabase</span>
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Migration Trigger Card */}
                  <div className="bg-gradient-to-r from-[#063b30] to-[#0b4d40] rounded-xl p-6 text-white shadow-md space-y-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="space-y-1 max-w-xl">
                        <h4 className="text-lg font-bold flex items-center gap-2">
                          <Sparkles className="w-5 h-5 text-emerald-300" />
                          <span>One-Click Full Database Migration</span>
                        </h4>
                        <p className="text-xs text-emerald-100 leading-relaxed">
                          Pushes all physician records ({fullDoctorList.length} total), custom physician modifications, phone overrides, active daily check-ins, and 30-day rolling monthly check-ins to Supabase with automatic deduplication.
                        </p>
                      </div>

                      <button
                        onClick={handleRunSupabaseMigration}
                        disabled={isMigratingSupabase || !supabaseStatus?.configured}
                        className="px-6 py-3.5 bg-emerald-400 hover:bg-emerald-300 text-[#063b30] font-black text-xs uppercase tracking-wider rounded-lg shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                      >
                        {isMigratingSupabase ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin text-[#063b30]" />
                            <span>Migrating All Tables...</span>
                          </>
                        ) : (
                          <>
                            <Database className="w-4 h-4" />
                            <span>Migrate Now to Supabase</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Migration Feedback Result Toast */}
                    {supabaseMigrateResult && (
                      <div
                        className={`p-4 rounded-lg text-xs font-semibold border ${
                          supabaseMigrateResult.success
                            ? "bg-emerald-950/70 border-emerald-400/50 text-emerald-200"
                            : "bg-rose-950/70 border-rose-400/50 text-rose-200"
                        }`}
                      >
                        <div className="flex items-center gap-2 font-bold text-sm">
                          {supabaseMigrateResult.success ? (
                            <CheckCircle className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-rose-400" />
                          )}
                          <span>{supabaseMigrateResult.message}</span>
                        </div>
                        {supabaseMigrateResult.results && (
                          <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 text-[11px] font-mono">
                            <div className="bg-black/30 p-2 rounded">
                              <span className="text-slate-400 block text-[9px]">Doctors:</span>
                              <span className="text-white font-bold">{supabaseMigrateResult.results.doctors}</span>
                            </div>
                            <div className="bg-black/30 p-2 rounded">
                              <span className="text-slate-400 block text-[9px]">Check-ins:</span>
                              <span className="text-white font-bold">{supabaseMigrateResult.results.checkins}</span>
                            </div>
                            <div className="bg-black/30 p-2 rounded">
                              <span className="text-slate-400 block text-[9px]">Monthly:</span>
                              <span className="text-white font-bold">{supabaseMigrateResult.results.monthly_checkins ?? supabaseMigrateResult.results.weekly_checkins ?? 0}</span>
                            </div>
                            <div className="bg-black/30 p-2 rounded">
                              <span className="text-slate-400 block text-[9px]">Custom:</span>
                              <span className="text-white font-bold">{supabaseMigrateResult.results.custom_doctors}</span>
                            </div>
                            <div className="bg-black/30 p-2 rounded">
                              <span className="text-slate-400 block text-[9px]">Phones:</span>
                              <span className="text-white font-bold">{supabaseMigrateResult.results.custom_doctor_phones}</span>
                            </div>
                            <div className="bg-black/30 p-2 rounded">
                              <span className="text-slate-400 block text-[9px]">Deleted:</span>
                              <span className="text-white font-bold">{supabaseMigrateResult.results.deleted_doctors}</span>
                            </div>
                          </div>
                        )}
                        {supabaseMigrateResult.error && (
                          <div className="mt-2 text-rose-300 font-mono text-[11px]">
                            {supabaseMigrateResult.error}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* SQL Schema Viewer Box */}
                  <div className="bg-white rounded-xl border border-[#cbdad5] p-6 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                          <Terminal className="w-4 h-4 text-emerald-700" />
                          <span>Supabase SQL Editor Schema (One-Chunk SQL)</span>
                        </h4>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Paste this in your Supabase project's SQL Editor to instantiate all tables, indices, and RLS policies at once.
                        </p>
                      </div>

                      <button
                        onClick={handleCopySqlSchema}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded border border-slate-300 transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        {copiedSqlSchema ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy SQL</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="relative">
                      <pre className="p-4 bg-slate-900 text-emerald-300 rounded-lg text-xs font-mono overflow-x-auto max-h-80 select-all border border-slate-800">
                        <code>{SUPABASE_SQL_SCHEMA_TEXT}</code>
                      </pre>
                    </div>
                  </div>

                  {/* Setup & Environment Variables Quick Guide */}
                  <div className="bg-slate-50 rounded-xl border border-slate-200 p-6 space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">Quick Configuration Guide</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-600">
                      <div className="space-y-2">
                        <div className="font-bold text-slate-800">1. Setup in Supabase Dashboard:</div>
                        <ol className="list-decimal list-inside space-y-1 pl-1 text-slate-600">
                          <li>Create a new Supabase project at <span className="font-mono text-emerald-700">supabase.com</span>.</li>
                          <li>Open the <strong>SQL Editor</strong>, paste the schema above, and click <strong>Run</strong>.</li>
                          <li>Navigate to <strong>Project Settings → API</strong>.</li>
                          <li>Copy the <strong>Project URL</strong> and <strong>service_role</strong> / <strong>anon</strong> key.</li>
                        </ol>
                      </div>
                      <div className="space-y-2">
                        <div className="font-bold text-slate-800">2. Configure Environment:</div>
                        <div className="bg-slate-900 text-slate-200 p-3 rounded font-mono text-[11px] space-y-1 border border-slate-800">
                          <div>SUPABASE_URL=https://your-project.supabase.co</div>
                          <div>SUPABASE_ANON_KEY=eyJhbGciOi...</div>
                          <div>SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...</div>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Run <span className="font-mono font-bold text-slate-700">npm run migrate:supabase</span> in the terminal anytime for automated CLI migration.
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* ======================================================= */
                /*               ACTIVE ROSTER & OPERATIONS TAB            */
                /* ======================================================= */
                <div className="space-y-6">
                  {/* Stats Overview in Geometric Style */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                <div className="bg-white rounded-xl border border-[#cbdad5] p-5 flex items-center gap-4 shadow-sm">
                  <div className="bg-[#e6f2ee] text-[#063b30] p-3.5 rounded-lg">
                    <Users className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Total On-Duty</span>
                    <h3 className="text-2xl font-black text-[#063b30] mt-0.5">{checkins.length} Physicians</h3>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-[#cbdad5] p-5 flex items-center gap-4 shadow-sm">
                  <div className="bg-[#e6f2ee] text-[#063b30] p-3.5 rounded-lg">
                    <Clock className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Shifts Scheduled</span>
                    <h3 className="text-2xl font-black text-[#063b30] mt-0.5">
                      {checkins.reduce((acc, curr) => acc + curr.shifts.length, 0)} Slots
                    </h3>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-[#cbdad5] p-5 flex items-center gap-4 shadow-sm">
                  <div className="bg-[#e6f2ee] text-[#063b30] p-3.5 rounded-lg">
                    <Layers className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Departments Active</span>
                    <h3 className="text-2xl font-black text-[#063b30] mt-0.5">
                      {uniqueDepts.length} {uniqueDepts.length === 1 ? "Speciality" : "Specialities"}
                    </h3>
                  </div>
                </div>

              </div>

              {/* Specialty Attendance Dashboard */}
              <div className="bg-white rounded-xl border border-[#cbdad5] p-6 shadow-sm space-y-4">
                <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                  <h3 className="font-extrabold text-slate-950 text-base flex items-center gap-2">
                    <Stethoscope className="w-4.5 h-4.5 text-[#063b30]" />
                    <span>Specialty Attendance Dashboard</span>
                  </h3>
                  <span className="text-[10px] bg-[#e6f2ee] text-[#063b30] font-bold px-2.5 py-1 rounded-full border border-[#cbdad5]">
                    {uniqueDepts.length} ACTIVE {uniqueDepts.length === 1 ? "SPECIALTY" : "SPECIALTIES"}
                  </span>
                </div>

                {checkins.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-6">
                    No active doctors checked in. Once physicians check in, the specialty distribution will appear here.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {uniqueDepts.map((dept, idx) => {
                      const deptCheckins = checkins.filter((c) => c.department === dept);
                      const count = deptCheckins.length;
                      const percentage = Math.round((count / checkins.length) * 100);
                      
                      // Find shift counts for this specialty
                      const shiftCounts: { [key: string]: number } = {};
                      deptCheckins.forEach((c) => {
                        c.shifts.forEach((sh) => {
                          shiftCounts[sh] = (shiftCounts[sh] || 0) + 1;
                        });
                      });

                      return (
                        <div 
                          key={`stat-dept-${dept}-${idx}`} 
                          className="bg-gradient-to-br from-slate-50 to-white rounded-lg border border-[#cbdad5] p-4 flex flex-col justify-between transition-all hover:shadow-md hover:border-[#063b30]/30"
                        >
                          <div className="space-y-2">
                            <div className="flex items-start justify-between">
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block max-w-full truncate" title={dept}>
                                {dept}
                              </span>
                            </div>
                            
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-2xl font-black text-[#063b30]">{count}</span>
                              <span className="text-[10px] text-slate-500 font-medium">
                                {count === 1 ? "doctor" : "doctors"} active
                              </span>
                            </div>

                            {/* visual micro progress bar */}
                            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                              <div 
                                className="bg-[#063b30] h-full rounded-full transition-all duration-500" 
                                style={{ width: `${percentage}%` }}
                              ></div>
                            </div>
                          </div>

                          {/* Mini breakdown of shifts */}
                          <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap gap-1.5">
                            {Object.entries(shiftCounts).map(([shiftName, shiftCount], idx) => {
                              const labelAr = SHIFT_MAP_AR[shiftName] || shiftName;
                              return (
                                <span 
                                  key={`stat-shift-${shiftName}-${idx}`} 
                                  className="text-[9px] bg-slate-100 border border-slate-200 text-slate-600 font-bold px-1.5 py-0.5 rounded flex items-center gap-1"
                                >
                                  <span>{labelAr}:</span>
                                  <span className="text-[#063b30] font-black">{shiftCount}</span>
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Controls and Export Action Row */}
              <div className="bg-white rounded-xl border border-[#cbdad5] p-6 shadow-sm space-y-4">
                <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-4">
                  
                  <div className="flex flex-col sm:flex-row gap-2.5 flex-1 max-w-2xl">
                    {/* ID / Name search */}
                    <div className="relative flex-1">
                      <input
                        id="admin-search-input"
                        type="text"
                        placeholder="Filter by ID, English or Arabic Name..."
                        value={adminSearch}
                        onChange={(e) => setAdminSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-[#cbdad5] rounded-lg text-sm text-slate-800 focus:bg-white focus:border-[#063b30] outline-none transition-all"
                      />
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    </div>

                    {/* Department dropdown */}
                    <select
                      id="admin-dept-filter"
                      value={adminDeptFilter}
                      onChange={(e) => setAdminDeptFilter(e.target.value)}
                      className="bg-slate-50 border border-[#cbdad5] text-[#063b30] font-bold text-xs uppercase px-3.5 py-2 rounded-lg outline-none focus:border-[#063b30] transition-all cursor-pointer"
                    >
                      <option value="All">All Departments</option>
                      {uniqueDepts.map((d, idx) => (
                        <option key={`fltr-dept-${d}-${idx}`} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>

                  {/* Actions (Download report / Reset - Split into Daily & Weekly Operations) */}
                  <div className="flex flex-col md:flex-row md:items-stretch xl:items-center gap-4 w-full xl:w-auto">
                    {/* Daily Operations */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 border-b md:border-b-0 md:border-r border-slate-200 pb-4 md:pb-0 pr-0 md:pr-4">
                      <div className="flex items-center gap-1.5 min-w-[55px]">
                        <span className="text-[10px] font-black text-slate-600 uppercase tracking-wider">Daily:</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          id="download-report-btn"
                          onClick={downloadCSVReport}
                          disabled={checkins.length === 0 || isDownloadingDaily}
                          className="bg-[#063b30] hover:bg-[#042d24] text-white font-bold text-[11px] py-2 px-3 rounded shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                          title="Download today's spreadsheet"
                        >
                          {isDownloadingDaily ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                          )}
                          <span>{isDownloadingDaily ? "DOWNLOADING..." : "DOWNLOAD TODAY XLS"}</span>
                        </button>

                        <button
                          id="send-whatsapp-report-btn"
                          onClick={handleSendWhatsAppSheet}
                          disabled={isSendingWhatsApp}
                          className="bg-[#128C7E] hover:bg-[#075E54] text-white font-bold text-[11px] py-2 px-3 rounded shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                          title="Send today's spreadsheet directly to the WhatsApp group"
                        >
                          {isSendingWhatsApp ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Send className="w-3.5 h-3.5" />
                          )}
                          <span>{isSendingWhatsApp ? "SENDING TO WHATSAPP..." : "SEND TO WHATSAPP"}</span>
                        </button>
                        
                        <button
                          id="clear-all-records-btn"
                          onClick={handleClearAllCheckins}
                          disabled={isDownloadingDaily || isSendingWhatsApp}
                          className="bg-red-50 hover:bg-red-100 text-red-700 font-bold text-[11px] py-2 px-3 rounded border border-red-200 transition-colors disabled:opacity-50 cursor-pointer"
                          title="Clear All Submissions for today only"
                        >
                          RESET TODAY
                        </button>
                      </div>
                    </div>

                    {/* Monthly Operations (30-Day Rolling Window) */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <div className="flex items-center gap-1.5 min-w-[55px]">
                        <span className="text-[10px] font-black text-slate-600 uppercase tracking-wider">Monthly:</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          id="download-monthly-report-btn"
                          onClick={downloadMonthlyCSVReport}
                          disabled={isDownloadingMonthly}
                          className="bg-teal-700 hover:bg-teal-800 text-white font-bold text-[11px] py-2 px-3 rounded shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
                          title="Download monthly cumulative sheet (30-day rolling roster)"
                        >
                          {isDownloadingMonthly ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                          )}
                          <span>{isDownloadingMonthly ? "DOWNLOADING..." : "DOWNLOAD MONTHLY XLS (30 DAYS)"}</span>
                        </button>
                        
                        <button
                          id="clear-monthly-records-btn"
                          onClick={handleClearMonthlyCheckins}
                          disabled={isDownloadingMonthly}
                          className="bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-[11px] py-2 px-3 rounded border border-amber-200 transition-colors disabled:opacity-50"
                          title="Reset monthly cumulative sheet database"
                        >
                          RESET MONTHLY
                        </button>
                      </div>
                    </div>
                  </div>

                </div>

                {/* CSV Format Notice */}
                <div className="bg-[#e6f2ee] rounded-lg p-4 border border-[#cbdad5] flex items-start gap-3 text-xs text-[#063b30]">
                  <Info className="w-4.5 h-4.5 text-emerald-700 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-[#063b30]">Specialty Group Separators Active:</span>
                    <p className="mt-0.5 text-slate-600 font-medium">Exported spreadsheet output is automatically partitioned and sorted into individual specialty sections with clear header dividers for convenient team auditing.</p>
                  </div>
                </div>
              </div>

              {/* Persistent Physician Directory & Phone Manager Card */}
              <div className="bg-white rounded-xl border border-[#cbdad5] p-6 shadow-sm space-y-4">
                <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                  <h3 className="font-extrabold text-slate-950 text-base flex items-center gap-2">
                    <Phone className="w-4.5 h-4.5 text-[#063b30]" />
                    <span>Persistent Physician Phone Database</span>
                  </h3>
                  <span className="text-[10px] bg-[#e6f2ee] text-[#063b30] font-bold px-2.5 py-1 rounded-full border border-[#cbdad5]">
                    DATABASE MANAGEMENT
                  </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Left Column: Search & Select Doctor */}
                  <div className="space-y-3">
                    <label htmlFor="directory-search-input" className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                      Search Persistent Physician Database (ID or Name)
                    </label>
                    <div className="relative">
                      <input
                        id="directory-search-input"
                        type="text"
                        placeholder="Search by ID, name or arabic name..."
                        value={directorySearch}
                        onChange={(e) => setDirectorySearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-[#cbdad5] rounded-lg text-sm text-slate-800 focus:bg-white focus:border-[#063b30] outline-none transition-all"
                      />
                      <Search className="w-4.5 h-4.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>

                    {/* Suggestions list for Directory Search */}
                    <AnimatePresence>
                      {directorySuggestions.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -5 }}
                          className="bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto divide-y divide-slate-100 z-10 relative"
                        >
                          {directorySuggestions.map((doc, idx) => (
                            <button
                              key={`dir-${doc.id}-${idx}`}
                              type="button"
                              onClick={() => handleSelectDirectoryDoctor(doc)}
                              className="w-full px-4 py-2 text-left text-xs hover:bg-slate-50 transition-colors flex items-center justify-between"
                            >
                              <div className="truncate pr-2">
                                <span className="font-mono font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200 text-[10px] mr-2">
                                  {doc.id}
                                </span>
                                <span className="font-semibold text-slate-800">{doc.name}</span>
                              </div>
                              <span className="text-slate-500 font-bold arabic-font text-right shrink-0" dir="rtl">{doc.arabicName}</span>
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Right Column: Update Phone Number Form */}
                  <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 flex flex-col justify-between">
                    {selectedDirectoryDoctor ? (
                      <div className="space-y-4">
                        <div className="flex items-start justify-between">
                          <div className="min-w-0">
                            <h4 className="text-sm font-bold text-slate-900 truncate">{selectedDirectoryDoctor.name}</h4>
                            <p className="text-[10px] text-slate-500 font-mono mt-0.5 uppercase truncate">
                              ID: {selectedDirectoryDoctor.id} | Dept: {selectedDirectoryDoctor.department}
                            </p>
                          </div>
                          <span className="text-xs font-bold text-[#063b30] arabic-font shrink-0" dir="rtl">
                            {selectedDirectoryDoctor.arabicName}
                          </span>
                        </div>

                        <div className="space-y-1.5">
                          <label htmlFor="directory-phone-input" className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                            Set Persistent Phone Number
                          </label>
                          <div className="flex gap-2">
                            <input
                              id="directory-phone-input"
                              type="text"
                              placeholder="e.g. 01012345678"
                              value={directoryPhoneInput}
                              onChange={(e) => setDirectoryPhoneInput(e.target.value)}
                              className="flex-1 px-3 py-2 bg-white border border-[#cbdad5] rounded-lg focus:border-[#063b30] outline-none text-slate-800 text-sm font-semibold transition-all"
                            />
                            <button
                              onClick={handleSaveDirectoryPhone}
                              disabled={isSavingDirectoryPhone}
                              className="px-4 py-2 bg-[#063b30] hover:bg-[#042d24] text-white text-xs font-bold rounded-lg transition-colors uppercase disabled:opacity-50"
                            >
                              {isSavingDirectoryPhone ? "Saving..." : "Save"}
                            </button>
                          </div>
                          {directoryMessage && (
                            <p className="text-[11px] font-semibold text-emerald-700 mt-1 flex items-center gap-1">
                              <CheckCircle className="w-3.5 h-3.5" />
                              <span>{directoryMessage}</span>
                            </p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-6 text-center text-slate-400 h-full">
                        <Phone className="w-8 h-8 text-slate-300 mb-1.5" />
                        <p className="text-xs font-medium">Select a physician from search to manage their persistent phone number.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Live Roster Summary List matching Geometric border style */}
              <div className="bg-white rounded-xl border border-[#cbdad5] shadow-sm overflow-hidden p-6 space-y-6">
                
                <h3 className="font-extrabold text-slate-950 text-base border-b border-slate-100 pb-3 flex items-center gap-2">
                  <Layers className="w-4.5 h-4.5 text-[#063b30]" />
                  <span>Active Roster Grouped by Clinic</span>
                </h3>

                {/* Render grouped department rosters exactly like the design HTML */}
                {(() => {
                  // Group check-ins
                  const grouped: { [key: string]: CheckIn[] } = {};
                  filteredCheckins.forEach((c) => {
                    if (!grouped[c.department]) {
                      grouped[c.department] = [];
                    }
                    grouped[c.department].push(c);
                  });

                  const groupKeys = Object.keys(grouped);
                  if (groupKeys.length === 0) {
                    return (
                      <div className="text-center py-12 text-slate-400">
                        <Users className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                        <p className="text-sm">No personnel checked in yet matching criteria.</p>
                      </div>
                    );
                  }

                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {groupKeys.map((dept, idx) => (
                        <div key={`grp-${dept}-${idx}`} className="space-y-3">
                          <div className="flex items-center gap-2">
                            <div className="h-[1px] flex-1 bg-slate-200"></div>
                            <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{dept}</span>
                            <div className="h-[1px] flex-1 bg-slate-200"></div>
                          </div>
                          
                          <div className="space-y-2">
                            {grouped[dept].map((c, cIdx) => (
                              <div key={`chk-${c.id}-${c.timestamp || ''}-${cIdx}`} className="flex items-center justify-between text-xs p-3 bg-slate-50 hover:bg-slate-100/80 transition-colors rounded border-l-4 border-[#063b30]">
                                <div className="flex flex-col gap-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-mono font-bold bg-white px-2 py-0.5 rounded border border-slate-200 text-[10px] shrink-0">{c.id}</span>
                                    <span className="font-semibold text-slate-800 truncate">{c.doctorName}</span>
                                  </div>
                                  <div className="flex items-center gap-3 text-[10px] text-slate-600 font-mono pl-0.5 flex-wrap">
                                    <div className="flex items-center gap-1">
                                      <Clock className="w-3 h-3 text-[#063b30] opacity-75" />
                                      <span>{formatTimestamp(c.timestamp)}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      {c.mobileNumber ? (
                                        <div className="flex items-center gap-1 text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                                          <Phone className="w-2.5 h-2.5 text-emerald-600" />
                                          <span>{c.mobileNumber}</span>
                                        </div>
                                      ) : (
                                        <span className="text-[9px] text-slate-500 italic bg-slate-100 px-1.5 py-0.5 rounded">No phone</span>
                                      )}
                                      <button
                                        onClick={() => handleEditCheckedInPhone(c.id, c.mobileNumber || "")}
                                        className="p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center text-slate-500 hover:text-[#063b30] hover:bg-slate-200/60 rounded transition-colors cursor-pointer"
                                        title="Edit physician phone number"
                                        aria-label={`Edit phone number for Dr. ${c.doctorName}`}
                                      >
                                        <Phone className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                  <span className="font-bold text-[#063b30] arabic-font" dir="rtl">{c.doctorArabicName}</span>
                                  <span className="bg-[#e6f2ee] text-[#063b30] px-2 py-0.5 rounded text-[9px] font-bold">
                                    {formatShiftsForDisplay(c.shifts)}
                                  </span>
                                  <button
                                    onClick={() => handleDeleteCheckin(c.id)}
                                    className="p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                                    title="Delete physician check-in"
                                    aria-label={`Delete check-in for Dr. ${c.doctorName}`}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}

              </div>
                </div>
              )}

            </motion.div>
          )}
        </AnimatePresence>

      </main>

      {/* Admin Passcode Modal (Geometric Theme) */}
      <AnimatePresence>
        {showAdminLogin && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/45 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-auth-modal-title"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white rounded-xl max-w-sm w-full border border-slate-200 shadow-xl overflow-hidden"
            >
              <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-2">
                  <Lock className="w-4.5 h-4.5 text-[#063b30]" />
                  <span id="admin-auth-modal-title" className="font-extrabold text-slate-900 text-sm uppercase">AUTHENTICATION REQUIRED</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowAdminLogin(false);
                    setAdminPasscode("");
                    setAdminError("");
                  }}
                  className="text-slate-400 hover:text-slate-600 p-1.5 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-full hover:bg-slate-200/50 cursor-pointer"
                  aria-label="Close dialog"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleAdminLogin} className="p-5 space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="admin-passcode-input" className="text-xs font-bold text-slate-700 uppercase tracking-wider block">Admin / Coordinator Passcode</label>
                  <input
                    id="admin-passcode-input"
                    type="password"
                    placeholder="••••••••"
                    value={adminPasscode}
                    onChange={(e) => setAdminPasscode(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-lg focus:bg-white focus:border-[#063b30] text-slate-900 font-semibold outline-none transition-all text-center tracking-widest text-lg"
                    autoFocus
                  />
                </div>

                {adminError && (
                  <p role="alert" aria-live="assertive" className="text-red-600 font-semibold text-xs flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{adminError}</span>
                  </p>
                )}

                <button
                  id="admin-submit-passcode"
                  type="submit"
                  disabled={!adminPasscode}
                  className="w-full bg-[#063b30] hover:bg-[#042d24] text-white font-bold py-2.5 rounded shadow transition-all disabled:opacity-50 text-sm cursor-pointer"
                >
                  Unlock Access
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Record Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirmId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/45 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-attendance-modal-title"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white rounded-xl max-w-sm w-full border border-slate-200 shadow-xl overflow-hidden"
            >
              <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-2 text-red-700">
                  <Trash2 className="w-4.5 h-4.5" />
                  <span id="delete-attendance-modal-title" className="font-extrabold text-slate-900 text-sm uppercase">Delete Attendance Record</span>
                </div>
                <button
                  type="button"
                  onClick={() => setDeleteConfirmId(null)}
                  className="text-slate-400 hover:text-slate-600 p-1.5 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-full hover:bg-slate-200/50 cursor-pointer"
                  aria-label="Close dialog"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <p className="text-sm text-slate-600 leading-relaxed">
                  Are you sure you want to remove the check-in record for physician ID: <span className="font-mono font-bold text-[#063b30] bg-[#e6f2ee] px-2 py-0.5 rounded border border-[#cbdad5]">{deleteConfirmId}</span>?
                </p>
                
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmId(null)}
                    className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded text-xs uppercase border border-slate-200 transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={confirmDeleteCheckin}
                    className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded text-xs uppercase transition-all shadow-sm cursor-pointer"
                  >
                    Delete Record
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reset Today Confirmation Modal */}
      <AnimatePresence>
        {showResetConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/45 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="reset-today-modal-title"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white rounded-xl max-w-sm w-full border border-slate-200 shadow-xl overflow-hidden"
            >
              <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-2 text-amber-600">
                  <AlertCircle className="w-4.5 h-4.5" />
                  <span id="reset-today-modal-title" className="font-extrabold text-slate-900 text-sm uppercase">Reset Daily Roster</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(false)}
                  className="text-slate-400 hover:text-slate-600 p-1.5 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-full hover:bg-slate-200/50 cursor-pointer"
                  aria-label="Close dialog"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div className="bg-amber-50 text-amber-900 px-3.5 py-3 rounded-lg border border-amber-100 text-xs font-semibold leading-relaxed">
                  ⚠️ WARNING: This will permanently delete ALL active doctor check-ins for the day. This action cannot be undone.
                </div>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Are you absolutely sure you want to proceed and reset all active doctor entries?
                </p>
                
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowResetConfirm(false)}
                    className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded text-xs uppercase border border-slate-200 transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={confirmClearAllCheckins}
                    className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded text-xs uppercase transition-all shadow-sm cursor-pointer"
                  >
                    Yes, Reset All
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reset Weekly Confirmation Modal */}
      {/* Reset Monthly Confirmation Modal */}
      <AnimatePresence>
        {showMonthlyResetConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/45 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="reset-monthly-modal-title"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white rounded-xl max-w-sm w-full border border-slate-200 shadow-xl overflow-hidden"
            >
              <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-2 text-red-600">
                  <AlertCircle className="w-4.5 h-4.5" />
                  <span id="reset-monthly-modal-title" className="font-extrabold text-slate-900 text-sm uppercase">Reset Monthly Roster (30 Days)</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMonthlyResetConfirm(false)}
                  className="text-slate-400 hover:text-slate-600 p-1.5 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-full hover:bg-slate-200/50 cursor-pointer"
                  aria-label="Close dialog"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div className="bg-red-50 text-red-900 px-3.5 py-3 rounded-lg border border-red-100 text-xs font-semibold leading-relaxed">
                  ⚠️ WARNING: This will permanently delete the 30-day cumulative monthly check-in sheet database. This action cannot be undone.
                </div>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Are you absolutely sure you want to proceed and clear the monthly check-ins database?
                </p>
                
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setShowMonthlyResetConfirm(false)}
                    className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded text-xs uppercase border border-slate-200 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmClearMonthlyCheckins}
                    className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded text-xs uppercase transition-all shadow-sm"
                  >
                    Yes, Reset Monthly
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Checked In Doctor Phone Modal */}
      <AnimatePresence>
        {editingCheckedInDoctorId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/45 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-phone-modal-title"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white rounded-xl max-w-sm w-full border border-slate-200 shadow-xl overflow-hidden"
            >
              <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-2 text-[#063b30]">
                  <Phone className="w-4.5 h-4.5" />
                  <span id="edit-phone-modal-title" className="font-extrabold text-slate-900 text-sm uppercase">Edit Doctor Phone Number</span>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingCheckedInDoctorId(null)}
                  className="text-slate-400 hover:text-slate-600 p-1.5 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-full hover:bg-slate-200/50 cursor-pointer"
                  aria-label="Close dialog"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <p className="text-xs text-slate-600 leading-relaxed">
                  Update the mobile phone number for checked-in physician ID: <span className="font-mono font-bold text-[#063b30] bg-[#e6f2ee] px-2 py-0.5 rounded border border-[#cbdad5]">{editingCheckedInDoctorId}</span>.
                </p>

                <div className="space-y-1.5">
                  <label htmlFor="checkedin-phone-input" className="text-xs font-bold text-slate-700 uppercase tracking-wider block">Mobile Phone Number</label>
                  <input
                    id="checkedin-phone-input"
                    type="text"
                    placeholder="e.g. 01012345678"
                    value={editingCheckedInPhone}
                    onChange={(e) => setEditingCheckedInPhone(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-[#cbdad5] rounded-lg focus:bg-white focus:border-[#063b30] outline-none text-slate-800 text-sm font-semibold transition-all"
                  />
                </div>
                
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setEditingCheckedInDoctorId(null)}
                    className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded text-xs uppercase border border-slate-200 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveCheckedInPhone}
                    disabled={isUpdatingCheckedInPhone}
                    className="flex-1 px-4 py-2.5 bg-[#063b30] hover:bg-[#042d24] text-white font-bold rounded text-xs uppercase transition-all shadow-sm flex items-center justify-center gap-1"
                  >
                    {isUpdatingCheckedInPhone ? "Saving..." : "Save Phone"}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add / Edit Doctor Modal */}
      <AnimatePresence>
        {isDoctorModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="doctor-edit-modal-title"
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="bg-white rounded-xl border border-[#cbdad5] shadow-2xl max-w-lg w-full overflow-hidden"
            >
              {/* Modal Header */}
              <div className="bg-[#063b30] text-white px-6 py-4 flex items-center justify-between">
                <h3 id="doctor-edit-modal-title" className="font-extrabold text-base flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-emerald-400" />
                  <span>{doctorModalMode === "add" ? "Add New Physician to Database" : "Edit Saved Physician"}</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setIsDoctorModalOpen(false)}
                  className="text-white/70 hover:text-white p-1.5 min-w-[36px] min-h-[36px] flex items-center justify-center rounded transition-colors cursor-pointer"
                  aria-label="Close dialog"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body Form */}
              <form onSubmit={handleSaveDoctor} className="p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* ID */}
                  <div className="space-y-1">
                    <label htmlFor="doctor-form-id" className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                      Employee ID / Code *
                    </label>
                    <input
                      id="doctor-form-id"
                      type="text"
                      required
                      placeholder="e.g. 1498"
                      value={doctorFormData.id}
                      onChange={(e) => setDoctorFormData({ ...doctorFormData, id: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-[#cbdad5] rounded-lg text-sm font-mono font-bold focus:bg-white focus:border-[#063b30] outline-none"
                    />
                  </div>

                  {/* Phone */}
                  <div className="space-y-1">
                    <label htmlFor="doctor-form-phone" className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                      Phone Number (رقم الهاتف)
                    </label>
                    <input
                      id="doctor-form-phone"
                      type="text"
                      placeholder="e.g. 01012345678"
                      value={doctorFormData.mobileNumber}
                      onChange={(e) => setDoctorFormData({ ...doctorFormData, mobileNumber: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-[#cbdad5] rounded-lg text-sm font-semibold focus:bg-white focus:border-[#063b30] outline-none"
                    />
                  </div>
                </div>

                {/* English Name */}
                <div className="space-y-1">
                  <label htmlFor="doctor-form-name" className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                    English Name *
                  </label>
                  <input
                    id="doctor-form-name"
                    type="text"
                    required
                    placeholder="e.g. Dr. John Doe"
                    value={doctorFormData.name}
                    onChange={(e) => setDoctorFormData({ ...doctorFormData, name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-[#cbdad5] rounded-lg text-sm font-semibold focus:bg-white focus:border-[#063b30] outline-none"
                  />
                </div>

                {/* Arabic Name */}
                <div className="space-y-1">
                  <label htmlFor="doctor-form-arabic-name" className="text-xs font-bold text-slate-700 uppercase tracking-wider block text-right" dir="rtl">
                    الاسم باللغة العربية
                  </label>
                  <input
                    id="doctor-form-arabic-name"
                    type="text"
                    dir="rtl"
                    placeholder="مثال: د. جون دو"
                    value={doctorFormData.arabicName}
                    onChange={(e) => setDoctorFormData({ ...doctorFormData, arabicName: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-[#cbdad5] rounded-lg text-sm font-semibold arabic-font focus:bg-white focus:border-[#063b30] outline-none"
                  />
                </div>

                {/* Department */}
                <div className="space-y-1">
                  <label htmlFor="doctor-form-dept" className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                    Specialty / Department
                  </label>
                  <input
                    id="doctor-form-dept"
                    type="text"
                    list="dept-options-list"
                    placeholder="Select or type department..."
                    value={doctorFormData.department}
                    onChange={(e) => setDoctorFormData({ ...doctorFormData, department: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-[#cbdad5] rounded-lg text-sm font-semibold focus:bg-white focus:border-[#063b30] outline-none"
                  />
                  <datalist id="dept-options-list">
                    {COMMON_DEPARTMENTS.map((d, idx) => (
                      <option key={`dl-${d}-${idx}`} value={d} />
                    ))}
                  </datalist>
                </div>

                {doctorSaveMsg && (
                  <p className={`text-xs font-bold p-2.5 rounded border ${
                    doctorSaveMsg.includes("successfully") 
                      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                      : "bg-rose-50 text-rose-800 border-rose-200"
                  }`}>
                    {doctorSaveMsg}
                  </p>
                )}

                {/* Modal Footer Buttons */}
                <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsDoctorModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg uppercase border border-slate-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingDoctor}
                    className="px-5 py-2 bg-[#063b30] hover:bg-[#042d24] text-white font-bold text-xs rounded-lg uppercase transition-colors disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
                  >
                    {isSavingDoctor ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Save Physician</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteModalState.isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-physicians-modal-title"
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="bg-white rounded-xl border border-rose-200 shadow-2xl max-w-md w-full overflow-hidden"
            >
              {/* Header */}
              <div className="bg-rose-700 text-white px-6 py-4 flex items-center justify-between">
                <h3 id="delete-physicians-modal-title" className="font-extrabold text-base flex items-center gap-2">
                  <Trash2 className="w-5 h-5 text-rose-200" />
                  <span>
                    {deleteModalState.type === "single"
                      ? "Delete Physician"
                      : `Delete ${selectedDbDoctorIds.length} Physicians`}
                  </span>
                </h3>
                <button
                  type="button"
                  onClick={() => setDeleteModalState({ ...deleteModalState, isOpen: false })}
                  disabled={isDeletingDoctor}
                  className="text-white/70 hover:text-white p-1.5 min-w-[36px] min-h-[36px] flex items-center justify-center rounded transition-colors cursor-pointer"
                  aria-label="Close dialog"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-4">
                <div className="text-slate-700 text-sm leading-relaxed">
                  {deleteModalState.type === "single" ? (
                    <p>
                      Are you sure you want to permanently remove physician{" "}
                      {deleteModalState.nameToDelete && (
                        <strong className="text-slate-900 font-bold">
                          "{deleteModalState.nameToDelete}"{" "}
                        </strong>
                      )}
                      (ID:{" "}
                      <strong className="font-mono text-rose-700 font-bold bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                        "{deleteModalState.idToDelete}"
                      </strong>
                      ) from the persistent database?
                    </p>
                  ) : (
                    <p>
                      Are you sure you want to permanently remove{" "}
                      <strong className="text-rose-700 font-bold">
                        {selectedDbDoctorIds.length} selected physician(s)
                      </strong>{" "}
                      from the persistent database?
                    </p>
                  )}
                  <p className="text-xs text-slate-500 mt-2">
                    This action cannot be undone. All future search and directory results will be updated.
                  </p>
                </div>

                {deleteModalState.errorMsg && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold p-3 rounded-lg flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{deleteModalState.errorMsg}</span>
                  </div>
                )}

                {/* Footer Buttons */}
                <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setDeleteModalState({ ...deleteModalState, isOpen: false })}
                    disabled={isDeletingDoctor}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded text-xs uppercase transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmDelete}
                    disabled={isDeletingDoctor}
                    className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded text-xs uppercase transition-all shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isDeletingDoctor ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Deleting...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4" />
                        <span>
                          {deleteModalState.type === "single"
                            ? "Delete Physician"
                            : `Delete Selected (${selectedDbDoctorIds.length})`}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Universal Action Confirmation Modal */}
      <AnimatePresence>
        {confirmModalState.isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="universal-confirm-modal-title"
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="bg-white rounded-xl border border-amber-200 shadow-2xl max-w-md w-full overflow-hidden"
            >
              <div className="bg-[#063b30] text-white px-6 py-4 flex items-center justify-between">
                <h3 id="universal-confirm-modal-title" className="font-extrabold text-base flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-amber-300" />
                  <span>{confirmModalState.title}</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setConfirmModalState({ ...confirmModalState, isOpen: false })}
                  disabled={isConfirmingAction || isDeletingDoctor}
                  className="text-white/70 hover:text-white p-1.5 min-w-[36px] min-h-[36px] flex items-center justify-center rounded transition-colors cursor-pointer"
                  aria-label="Close dialog"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-5">
                <p className="text-slate-700 text-sm leading-relaxed font-medium">
                  {confirmModalState.message}
                </p>

                <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setConfirmModalState({ ...confirmModalState, isOpen: false })}
                    disabled={isConfirmingAction || isDeletingDoctor}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded text-xs uppercase transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setIsConfirmingAction(true);
                      try {
                        await confirmModalState.action();
                      } finally {
                        setIsConfirmingAction(false);
                        setConfirmModalState({ ...confirmModalState, isOpen: false });
                      }
                    }}
                    disabled={isConfirmingAction || isDeletingDoctor}
                    className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded text-xs uppercase transition-all shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isConfirmingAction || isDeletingDoctor ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Processing...</span>
                      </>
                    ) : (
                      <span>{confirmModalState.confirmBtnText || "Confirm"}</span>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer Bar in Geometric Balance style */}
      <footer className="h-10 bg-[#cbdad5] flex items-center px-8 border-t border-[#b2c8c0] justify-between text-[10px] text-[#063b30] font-semibold">
        <p>All rights reserved to Dr. Mohanad El Ma'moun , MSC</p>
        <p className="font-bold text-[#063b30] tracking-tighter">ELITE HOSPITAL OS v4.2.1</p>
      </footer>

    </div>
  );
}
