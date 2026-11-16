import React, { useState, useEffect, useRef } from "react";
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
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Info,
  Moon,
  Sunset,
  Sun,
  Sunrise,
  CloudSun,
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
  Send,
  PhoneCall,
  Play,
  Pause,
  Activity,
  Eye,
  Edit3,
  MessageSquare,
  Command,
  Ban
} from "lucide-react";
import { CANONICAL_SPECIALTIES, NEPHROLOGY_DOCTOR_IDS, SPECIALTY_OPTIONS } from "./data/specialties.js";
import { useToast } from "./components/common/Toast.tsx";
import { EmptyState } from "./components/common/EmptyState.tsx";
import { TableSkeleton, CardGridSkeleton } from "./components/common/TableSkeleton.tsx";
import { CommandPalette } from "./components/common/CommandPalette.tsx";

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
    color: "bg-sky-50 text-sky-900 border-sky-200",
    icon: Sun
  },
  {
    id: "Evening shift",
    labelEn: "Evening shift",
    labelAr: "ايڤينينج",
    descriptionEn: "PM Shift (4:00 PM - 12:00 AM)",
    descriptionAr: "مناوبة مسائية (٤:٠٠ م - ١٢:٠٠ ص)",
    color: "bg-amber-50 text-amber-900 border-amber-200",
    icon: Sunset
  },
  {
    id: "Night shift",
    labelEn: "Night shift",
    labelAr: "نايت",
    descriptionEn: "Overnight Duty (12:00 AM - 8:00 AM)",
    descriptionAr: "مناوبة ليلية (١٢:٠٠ ص - ٨:٠٠ ص)",
    color: "bg-emerald-950 text-emerald-100 border-emerald-900",
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
  const toast = useToast();

  // Convenience & Ergonomics Refs & States
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const physicianInputRef = useRef<HTMLInputElement>(null);
  const submitResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [activeSuggestionIdx, setActiveSuggestionIdx] = useState(0);
  const [adminShiftFilter, setAdminShiftFilter] = useState<string>("All");
  const [dbPhoneFilter, setDbPhoneFilter] = useState<"all" | "has_phone" | "missing_phone">("all");
  const [isPhoneManagerExpanded, setIsPhoneManagerExpanded] = useState(false);

  // Live Cairo Shift Recommendation helper
  const getRecommendedCairoShift = (): string => {
    try {
      const hourStr = new Intl.DateTimeFormat("en-US", {
        timeZone: "Africa/Cairo",
        hour: "numeric",
        hour12: false
      }).format(new Date());
      const hour = parseInt(hourStr, 10);
      if (hour >= 8 && hour < 16) return "Morning shift";
      if (hour >= 16 && hour < 24) return "Evening shift";
      return "Night shift";
    } catch {
      return "Morning shift";
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied", `${label} copied to clipboard.`);
    } catch {
      toast.error("Copy Failed", "Could not access clipboard.");
    }
  };

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
  const [loadingCheckins, setLoadingCheckins] = useState(false);
  const [checkinsError, setCheckinsError] = useState<string | null>(null);
  const [isDeletingCheckin, setIsDeletingCheckin] = useState(false);
  const [isClearingAllCheckins, setIsClearingAllCheckins] = useState(false);
  const [isClearingMonthlyCheckins, setIsClearingMonthlyCheckins] = useState(false);
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

  // Historical / Date-Specific Roster Selection & Editing states
  const [rosterDateFilter, setRosterDateFilter] = useState<string>(""); // "" = Live Today, "YYYY-MM-DD" = Specific Date
  const [rosterDatesList, setRosterDatesList] = useState<Array<{
    date: string;
    englishWeekday: string;
    arabicWeekday: string;
    formattedDate: string;
    doctorsCount: number;
    departmentsCount: number;
    isToday: boolean;
  }>>([]);
  const [activeTodaySheetDate, setActiveTodaySheetDate] = useState<string>("");
  const [dateCheckins, setDateCheckins] = useState<CheckIn[]>([]);
  const [loadingDateCheckins, setLoadingDateCheckins] = useState<boolean>(false);
  const [deleteConfirmTimestamp, setDeleteConfirmTimestamp] = useState<string>("");

  // Full Add / Edit Check-In Modal state (works for any previous date or today)
  const [isCheckinModalOpen, setIsCheckinModalOpen] = useState<boolean>(false);
  const [checkinModalMode, setCheckinModalMode] = useState<"add" | "edit">("edit");
  const [isSavingCheckinModal, setIsSavingCheckinModal] = useState<boolean>(false);
  const [checkinModalSearch, setCheckinModalSearch] = useState<string>("");
  const [checkinModalSuggestions, setCheckinModalSuggestions] = useState<Doctor[]>([]);
  const [checkinFormData, setCheckinFormData] = useState<{
    originalId: string;
    originalDate: string;
    originalTimestamp: string;
    id: string;
    doctorName: string;
    doctorArabicName: string;
    department: string;
    shifts: string[];
    mobileNumber: string;
    date: string;
    syncMasterProfile: boolean;
  }>({
    originalId: "",
    originalDate: "",
    originalTimestamp: "",
    id: "",
    doctorName: "",
    doctorArabicName: "",
    department: "Internal Medicine",
    shifts: ["Morning shift"],
    mobileNumber: "",
    date: "",
    syncMasterProfile: true,
  });

  // Admin Navigation Sub-Tab ("roster" | "database" | "duplicates" | "supabase" | "calls" | "prayer")
  const [adminTab, setAdminTab] = useState<"roster" | "database" | "duplicates" | "calls" | "prayer">("roster");

  // Inpatient Ward Doctor Calls states
  const [doctorCalls, setDoctorCalls] = useState<any[]>([]);
  const [loadingDoctorCalls, setLoadingDoctorCalls] = useState(false);
  const [callsSearch, setCallsSearch] = useState("");
  const [callsDeptFilter, setCallsDeptFilter] = useState("All");
  const [callsStatusFilter, setCallsStatusFilter] = useState("All");
  const [callsDateFilter, setCallsDateFilter] = useState(() => {
    try {
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "Africa/Cairo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "numeric",
        hourCycle: "h23"
      });
      const parts = formatter.formatToParts(new Date());
      const year = parts.find(p => p.type === "year")?.value || "";
      const month = parts.find(p => p.type === "month")?.value || "";
      const day = parts.find(p => p.type === "day")?.value || "";
      const hour = parseInt(parts.find(p => p.type === "hour")?.value || "0", 10);
      const d = new Date(`${year}-${month}-${day}T12:00:00Z`);
      if (hour < 8) {
        d.setUTCDate(d.getUTCDate() - 1);
      }
      return d.toISOString().split("T")[0];
    } catch {
      return "";
    }
  });
  const [redispatchingCallId, setRedispatchingCallId] = useState<string | null>(null);
  const [callActionFeedback, setCallActionFeedback] = useState<{ id: string; success: boolean; message: string } | null>(null);

  // WhatsApp Automation Diagnostics & Controls
  const [automationStatus, setAutomationStatus] = useState<{
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
    outgoingMessageWebhookEnabled?: boolean;
    supabaseTableStatus?: "ready" | "missing_table" | "error" | "not_configured";
    supabaseErrorMessage?: string;
  } | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);

  // Muslim Prayer Times WhatsApp Automation states
  const [prayerStatus, setPrayerStatus] = useState<{
    enabled: boolean;
    isPaused: boolean;
    cairo_now: string;
    cairo_time: string;
    configured_groups_count: number;
    available_groups?: Array<{ id: string; name: string; sourceEnv: string }>;
    selected_groups?: string[];
    today: {
      date: string;
      times: Array<{ id?: string; prayer: string; prayer_time: string }>;
      notifications: Array<{ id?: string; prayer: string; status: string; sent_at?: string; error?: string }>;
    };
    upcoming_days_cached: number;
    upcoming_dates: string[];
  } | null>(null);
  const [loadingPrayerStatus, setLoadingPrayerStatus] = useState(false);
  const [isTogglingPrayerPause, setIsTogglingPrayerPause] = useState(false);
  const [isTriggeringPrayerFetch, setIsTriggeringPrayerFetch] = useState(false);
  const [isSendingPrayerTest, setIsSendingPrayerTest] = useState(false);
  const [isUpdatingPrayerGroups, setIsUpdatingPrayerGroups] = useState(false);
  const [testingGroupId, setTestingGroupId] = useState<string | null>(null);
  const [copiedPrayerSql, setCopiedPrayerSql] = useState(false);
  const [prayerActionFeedback, setPrayerActionFeedback] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);

  const PRAYER_MIGRATION_SQL = `-- Alexandria Egypt Prayer Times Schema
CREATE TABLE IF NOT EXISTS public.prayer_times (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prayer_date DATE NOT NULL,
  prayer TEXT NOT NULL,
  prayer_time TIME NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (prayer_date, prayer)
);

CREATE TABLE IF NOT EXISTS public.prayer_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prayer_date DATE NOT NULL,
  prayer TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  group_results JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (prayer_date, prayer)
);

CREATE INDEX IF NOT EXISTS idx_prayer_times_lookup ON public.prayer_times (prayer_date, prayer);
CREATE INDEX IF NOT EXISTS idx_prayer_notifications_lookup ON public.prayer_notifications (prayer_date, prayer, status);

ALTER TABLE public.prayer_times ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prayer_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read-write for prayer_times" ON public.prayer_times
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow public read-write for prayer_notifications" ON public.prayer_notifications
  FOR ALL USING (true) WITH CHECK (true);`;

  const DOCTOR_CALLS_SQL = `-- Execute this script in your Supabase SQL Editor:
CREATE TABLE IF NOT EXISTS public.doctor_calls (
  id TEXT PRIMARY KEY,
  call_date TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  room TEXT NOT NULL,
  department TEXT NOT NULL,
  raw_department TEXT,
  patient_name TEXT,
  patient_barcode TEXT,
  admitting_physician TEXT,
  caller_name TEXT,
  dispatched_doctors JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'received',
  raw_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_doctor_calls_date ON public.doctor_calls (call_date);
CREATE INDEX IF NOT EXISTS idx_doctor_calls_dept ON public.doctor_calls (department);
CREATE INDEX IF NOT EXISTS idx_doctor_calls_status ON public.doctor_calls (status);

ALTER TABLE public.doctor_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to doctor_calls" ON public.doctor_calls FOR ALL USING (true) WITH CHECK (true);`;
  const [isCheckingAutomation, setIsCheckingAutomation] = useState(false);
  const [isSendingTestMessage, setIsSendingTestMessage] = useState(false);
  const [isConfiguringWebhook, setIsConfiguringWebhook] = useState(false);
  const [isSimulatingCall, setIsSimulatingCall] = useState(false);
  const [isTogglingPause, setIsTogglingPause] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [isPollingQueue, setIsPollingQueue] = useState(false);

  // Helper: Hospital operational duty date in Africa/Cairo (before 08:00 AM belongs to previous day's roster)
  const getHospitalDutyDateClient = (date: Date = new Date()): string => {
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
  };

  // Custom Doctor Call Modal state
  const [showCustomCallModal, setShowCustomCallModal] = useState(false);
  const [customCallForm, setCustomCallForm] = useState({
    room: "",
    department: "General Surgery",
    date: getHospitalDutyDateClient(),
    patientName: "",
    patientBarcode: "",
    admittingPhysician: "",
    callerName: "Ward Nurse",
    notes: "",
    customMessage: "",
    isEditingMessageText: false
  });
  const [customCallPreview, setCustomCallPreview] = useState<{
    canonicalDepartment: string;
    callDate: string;
    activeShifts: string[];
    matchingDoctors: any[];
    allDepartmentDoctors: any[];
    isOffShiftCoverage: boolean;
    formattedMessage: string;
    targetGroupId?: string;
  } | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isSendingCustomCall, setIsSendingCustomCall] = useState(false);
  const [customCallSuccess, setCustomCallSuccess] = useState<string | null>(null);
  const [selectedCustomDoctorIds, setSelectedCustomDoctorIds] = useState<string[]>([]);

  const fetchCustomCallPreview = async (formOverride?: Partial<typeof customCallForm>, doctorIdsOverride?: string[]) => {
    const f = { ...customCallForm, ...(formOverride || {}) };
    const docIds = doctorIdsOverride !== undefined ? doctorIdsOverride : selectedCustomDoctorIds;
    setIsLoadingPreview(true);
    try {
      const res = await fetch("/api/doctor-calls/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room: f.room || "N/A",
          department: f.department,
          date: f.date,
          patientName: f.patientName,
          patientBarcode: f.patientBarcode,
          admittingPhysician: f.admittingPhysician,
          callerName: f.callerName,
          notes: f.notes,
          customMessage: f.isEditingMessageText ? f.customMessage : "",
          selectedDoctorIds: docIds
        })
      });
      const json = await res.json();
      if (json.success) {
        setCustomCallPreview(json);
        setCustomCallForm(prev => ({
          ...prev,
          date: json.callDate || prev.date,
          customMessage: f.isEditingMessageText ? prev.customMessage : json.formattedMessage
        }));
      }
    } catch (err) {
      console.error("Error previewing custom call:", err);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleSendCustomCall = async () => {
    if (!customCallForm.room.trim()) {
      toast.error("Room Required", "Please specify a Room or Bed number before dispatching.");
      return;
    }
    setIsSendingCustomCall(true);
    setCustomCallSuccess(null);
    try {
      const res = await fetch("/api/doctor-calls/send-custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room: customCallForm.room.trim(),
          department: customCallForm.department,
          date: customCallForm.date,
          patientName: customCallForm.patientName.trim(),
          patientBarcode: customCallForm.patientBarcode.trim(),
          admittingPhysician: customCallForm.admittingPhysician.trim(),
          callerName: customCallForm.callerName.trim(),
          notes: customCallForm.notes.trim(),
          customMessage: customCallForm.customMessage.trim(),
          selectedDoctorIds: selectedCustomDoctorIds
        })
      });
      const json = await res.json();
      if (json.success) {
        setCustomCallSuccess(json.message || "Custom Doctor Call delivered successfully!");
        toast.success("Alert Dispatched", "Doctor Call message sent to WhatsApp group.");
        fetchDoctorCalls();
      } else {
        toast.error("Dispatch Failed", json.message || "Failed to dispatch WhatsApp message.");
      }
    } catch (err: any) {
      toast.error("Network Error", err?.message || "Failed to send custom doctor call.");
    } finally {
      setIsSendingCustomCall(false);
    }
  };



  // Inpatient Ward Doctor Calls data fetching & re-dispatch
  const fetchDoctorCalls = async () => {
    setLoadingDoctorCalls(true);
    try {
      const params = new URLSearchParams();
      if (callsDateFilter) params.append("date", callsDateFilter);
      if (callsDeptFilter && callsDeptFilter !== "All") params.append("department", callsDeptFilter);
      if (callsStatusFilter && callsStatusFilter !== "All") params.append("status", callsStatusFilter);
      if (callsSearch.trim()) params.append("search", callsSearch.trim());

      const res = await fetch(`/api/doctor-calls?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setDoctorCalls(json.data);
      }
    } catch (err) {
      console.error("Failed to fetch doctor calls:", err);
    } finally {
      setLoadingDoctorCalls(false);
    }
  };

  const handleRedispatchCall = async (callId: string) => {
    setRedispatchingCallId(callId);
    setCallActionFeedback(null);
    try {
      const res = await fetch(`/api/doctor-calls/${encodeURIComponent(callId)}/redispatch`, { method: "POST" });
      const json = await res.json();
      setCallActionFeedback({
        id: callId,
        success: Boolean(json.success),
        message: json.message || (json.success ? "Re-dispatched successfully" : "Failed to re-dispatch")
      });
      fetchDoctorCalls();
    } catch (err: any) {
      setCallActionFeedback({
        id: callId,
        success: false,
        message: err?.message || "Failed to re-dispatch call"
      });
    } finally {
      setRedispatchingCallId(null);
    }
  };

  const fetchAutomationStatus = async () => {
    setIsCheckingAutomation(true);
    try {
      const res = await fetch("/api/doctor-calls/status", { cache: "no-store" });
      const json = await res.json();
      if (json.success && json.status) {
        setAutomationStatus(json.status);
      }
    } catch (err) {
      console.error("Failed to check automation status:", err);
    } finally {
      setIsCheckingAutomation(false);
    }
  };

  const handleTogglePauseAutomation = async () => {
    setIsTogglingPause(true);
    try {
      const res = await fetch("/api/doctor-calls/toggle-pause", { method: "POST" });
      const json = await res.json();
      if (json.success) {
        setCallActionFeedback({
          id: "pause_toggle",
          success: true,
          message: json.message
        });
        await fetchAutomationStatus();
        fetchDoctorCalls();
      }
    } catch (err: any) {
      setCallActionFeedback({
        id: "pause_toggle",
        success: false,
        message: err?.message || "Failed to toggle pause state"
      });
    } finally {
      setIsTogglingPause(false);
    }
  };

  const handleSendTestMessage = async () => {
    setIsSendingTestMessage(true);
    setCallActionFeedback(null);
    try {
      const res = await fetch("/api/doctor-calls/test-message", { method: "POST" });
      const json = await res.json();
      setCallActionFeedback({
        id: "test_msg",
        success: Boolean(json.success),
        message: json.message || (json.success ? "Test message delivered!" : "Failed to send test message")
      });
    } catch (err: any) {
      setCallActionFeedback({
        id: "test_msg",
        success: false,
        message: err?.message || "Error sending test message"
      });
    } finally {
      setIsSendingTestMessage(false);
    }
  };

  const handleConfigureWebhook = async () => {
    setIsConfiguringWebhook(true);
    setCallActionFeedback(null);
    try {
      const webhookUrl = `${window.location.origin}/api/whatsapp/webhook`;
      const res = await fetch("/api/doctor-calls/set-webhook-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookUrl })
      });
      const json = await res.json();
      setCallActionFeedback({
        id: "webhook_config",
        success: Boolean(json.success),
        message: json.message || (json.success ? "Webhook URL configured in Green-API!" : "Failed to configure webhook")
      });
      await fetchAutomationStatus();
    } catch (err: any) {
      setCallActionFeedback({
        id: "webhook_config",
        success: false,
        message: err?.message || "Error setting Green-API webhook"
      });
    } finally {
      setIsConfiguringWebhook(false);
    }
  };

  const handleSimulateCall = async () => {
    setIsSimulatingCall(true);
    setCallActionFeedback(null);
    try {
      const res = await fetch("/api/doctor-calls/simulate-call", { method: "POST" });
      const json = await res.json();
      const statusResult = json.result?.callRecord?.status || "processed";
      setCallActionFeedback({
        id: "sim_call",
        success: Boolean(json.success && json.result?.handled),
        message: json.result?.handled
          ? `Simulation completed! Status: ${statusResult}. Checked record in calls table.`
          : `Simulation skipped: ${json.result?.reason || "Unknown reason"}`
      });
      fetchDoctorCalls();
    } catch (err: any) {
      setCallActionFeedback({
        id: "sim_call",
        success: false,
        message: err?.message || "Error simulating call"
      });
    } finally {
      setIsSimulatingCall(false);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const res = await fetch("/api/doctor-calls/audit-logs", { cache: "no-store" });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setAuditLogs(json.data);
      }
    } catch (_) {}
  };

  const handlePollQueue = async () => {
    setIsPollingQueue(true);
    try {
      const res = await fetch("/api/doctor-calls/poll", { method: "POST" });
      const json = await res.json();
      if (json.success) {
        if (json.polledCount > 0) {
          setCallActionFeedback({
            id: "poll_queue",
            success: true,
            message: `Fetched ${json.polledCount} notification(s) from Green-API queue (${json.handledCount} calls handled)!`
          });
          fetchDoctorCalls();
        } else {
          setCallActionFeedback({
            id: "poll_queue",
            success: true,
            message: "Green-API queue is empty. No new pending messages."
          });
        }
        fetchAuditLogs();
      }
    } catch (err: any) {
      setCallActionFeedback({
        id: "poll_queue",
        success: false,
        message: err?.message || "Failed to poll Green-API queue"
      });
    } finally {
      setIsPollingQueue(false);
    }
  };

  // Muslim Prayer Times Automation Handlers & Helpers
  const PRAYER_DISPLAY_MAP: Record<string, { ar: string; en: string; Icon: React.ComponentType<{ className?: string }> }> = {
    Fajr: { ar: "الفجر", en: "Fajr (Dawn)", Icon: Sunrise },
    Dhuhr: { ar: "الظهر", en: "Dhuhr (Noon)", Icon: Sun },
    Asr: { ar: "العصر", en: "Asr (Afternoon)", Icon: CloudSun },
    Maghrib: { ar: "المغرب", en: "Maghrib (Sunset)", Icon: Sunset },
    Isha: { ar: "العشاء", en: "Isha (Night)", Icon: Moon },
  };

  const getNextAlexandriaPrayer = (): { key: string; ar: string; time12: string; minutesLeft: number } | null => {
    if (!prayerStatus?.today?.times?.length || !prayerStatus?.cairo_time) return null;
    const [cH, cM] = prayerStatus.cairo_time.split(":").map((v) => parseInt(v, 10));
    if (isNaN(cH) || isNaN(cM)) return null;
    const nowMin = cH * 60 + cM;
    const order = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
    for (const key of order) {
      const rec = prayerStatus.today.times.find((t) => t.prayer === key);
      if (!rec?.prayer_time) continue;
      const [pH, pM] = rec.prayer_time.split(":").map((v) => parseInt(v, 10));
      if (isNaN(pH) || isNaN(pM)) continue;
      const pMin = pH * 60 + pM;
      if (pMin >= nowMin) {
        return {
          key,
          ar: PRAYER_DISPLAY_MAP[key]?.ar || key,
          time12: formatPrayer12Hour(rec.prayer_time),
          minutesLeft: pMin - nowMin
        };
      }
    }
    return null;
  };

  const formatPrayer12Hour = (time24?: string): string => {
    if (!time24) return "--:--";
    const clean = time24.trim().split(" ")[0];
    const [hStr, mStr] = clean.split(":");
    let hour = parseInt(hStr, 10);
    if (isNaN(hour)) return time24;
    const min = (mStr || "00").substring(0, 2);
    const period = hour >= 12 ? "م" : "ص";
    hour = hour % 12;
    if (hour === 0) hour = 12;
    return `${String(hour).padStart(2, "0")}:${min} ${period}`;
  };

  const fetchPrayerStatus = async () => {
    setLoadingPrayerStatus(true);
    try {
      const res = await fetch("/api/prayer/status", { cache: "no-store" });
      const json = await res.json();
      setPrayerStatus((prev) => {
        if (!prev) {
          try {
            const cached = localStorage.getItem("elite_prayer_selected_groups");
            if (cached) {
              const parsed = JSON.parse(cached);
              if (Array.isArray(parsed) && json.available_groups && parsed.length !== json.available_groups.length) {
                return { ...json, selected_groups: parsed };
              }
            }
          } catch (_) {}
          return json;
        }
        // If the user is currently toggling group selection, preserve optimistic selection
        if (isUpdatingPrayerGroups) {
          return {
            ...json,
            selected_groups: prev.selected_groups,
          };
        }
        return json;
      });
    } catch (err) {
      console.error("Failed to fetch prayer status:", err);
    } finally {
      setLoadingPrayerStatus(false);
    }
  };

  const handleTogglePrayerPause = async () => {
    setIsTogglingPrayerPause(true);
    setPrayerActionFeedback(null);
    try {
      const res = await fetch("/api/prayer/toggle-pause", { method: "POST" });
      const json = await res.json();
      if (json.success) {
        setPrayerActionFeedback({
          type: "success",
          message: json.message || (json.isPaused ? "Prayer automation PAUSED" : "Prayer automation RESUMED"),
        });
        await fetchPrayerStatus();
      } else {
        setPrayerActionFeedback({
          type: "error",
          message: json.error || "Failed to toggle pause state",
        });
      }
    } catch (err: any) {
      setPrayerActionFeedback({
        type: "error",
        message: err?.message || "Failed to toggle pause state",
      });
    } finally {
      setIsTogglingPrayerPause(false);
    }
  };

  const handleTriggerPrayerFetch = async () => {
    setIsTriggeringPrayerFetch(true);
    setPrayerActionFeedback(null);
    try {
      const res = await fetch("/api/prayer/fetch-now", { method: "POST" });
      const json = await res.json();
      if (json.success || json.saved !== undefined) {
        setPrayerActionFeedback({
          type: "success",
          message: `Successfully fetched prayer times for Alexandria! (${json.saved ?? json.fetched ?? 0} records updated)`,
        });
        await fetchPrayerStatus();
      } else {
        setPrayerActionFeedback({
          type: "error",
          message: json.error || "Failed to fetch prayer times",
        });
      }
    } catch (err: any) {
      setPrayerActionFeedback({
        type: "error",
        message: err?.message || "Failed to trigger prayer times fetch",
      });
    } finally {
      setIsTriggeringPrayerFetch(false);
    }
  };

  const handleSendPrayerTest = async () => {
    setIsSendingPrayerTest(true);
    setPrayerActionFeedback(null);
    try {
      const res = await fetch("/api/prayer/test", { method: "POST" });
      const json = await res.json();
      if (json.success) {
        setPrayerActionFeedback({
          type: "success",
          message: `Test prayer notification delivered successfully to WhatsApp (${json.chatId || "Group"})!`,
        });
        await fetchPrayerStatus();
      } else {
        setPrayerActionFeedback({
          type: "error",
          message: json.error || json.message || "Failed to send test prayer message",
        });
      }
    } catch (err: any) {
      setPrayerActionFeedback({
        type: "error",
        message: err?.message || "Error sending test prayer notification",
      });
    } finally {
      setIsSendingPrayerTest(false);
    }
  };

  const handleTogglePrayerGroup = async (groupId: string) => {
    if (!prayerStatus) return;
    const current = prayerStatus.selected_groups || [];
    const isCurrentlySelected = current.includes(groupId);
    const newSelected = isCurrentlySelected
      ? current.filter((id) => id !== groupId)
      : [...current, groupId];

    // Optimistically update UI immediately
    setPrayerStatus((prev) => (prev ? { ...prev, selected_groups: newSelected } : prev));
    setIsUpdatingPrayerGroups(true);

    try {
      localStorage.setItem("elite_prayer_selected_groups", JSON.stringify(newSelected));
    } catch (_) {}

    try {
      const res = await fetch("/api/prayer/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedGroups: newSelected }),
      });
      const json = await res.json();
      if (json.success && Array.isArray(json.selectedGroups)) {
        setPrayerStatus((prev) => (prev ? { ...prev, selected_groups: json.selectedGroups } : prev));
        setPrayerActionFeedback({
          type: "success",
          message: isCurrentlySelected
            ? `Excluded group from prayer broadcasts.`
            : `Included group in prayer broadcasts.`,
        });
      } else {
        setPrayerActionFeedback({
          type: "error",
          message: json.error || "Failed to update target groups",
        });
        await fetchPrayerStatus();
      }
    } catch (err: any) {
      setPrayerActionFeedback({
        type: "error",
        message: err.message || "Failed to update target groups",
      });
      await fetchPrayerStatus();
    } finally {
      setIsUpdatingPrayerGroups(false);
    }
  };

  const handleSelectAllPrayerGroups = async (selectAll: boolean) => {
    if (!prayerStatus) return;
    const allGroupIds = (prayerStatus.available_groups || []).map((g) => g.id);
    const newSelected = selectAll ? allGroupIds : [];

    setPrayerStatus((prev) => (prev ? { ...prev, selected_groups: newSelected } : prev));
    setIsUpdatingPrayerGroups(true);

    try {
      localStorage.setItem("elite_prayer_selected_groups", JSON.stringify(newSelected));
    } catch (_) {}

    try {
      const res = await fetch("/api/prayer/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedGroups: newSelected }),
      });
      const json = await res.json();
      if (json.success && Array.isArray(json.selectedGroups)) {
        setPrayerStatus((prev) => (prev ? { ...prev, selected_groups: json.selectedGroups } : prev));
        setPrayerActionFeedback({
          type: "success",
          message: selectAll
            ? "All WhatsApp groups marked for prayer notifications."
            : "All WhatsApp groups unmarked (excluded from prayer notifications).",
        });
      } else {
        setPrayerActionFeedback({
          type: "error",
          message: json.error || "Failed to update groups",
        });
        await fetchPrayerStatus();
      }
    } catch (err: any) {
      setPrayerActionFeedback({
        type: "error",
        message: err.message || "Failed to update groups",
      });
      await fetchPrayerStatus();
    } finally {
      setIsUpdatingPrayerGroups(false);
    }
  };

  const handleTestSpecificPrayerGroup = async (groupId: string) => {
    setTestingGroupId(groupId);
    setPrayerActionFeedback(null);
    try {
      const res = await fetch("/api/prayer/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: groupId }),
      });
      const json = await res.json();
      if (json.success) {
        setPrayerActionFeedback({
          type: "success",
          message: `Test prayer notification sent to ${groupId}!`,
        });
      } else {
        setPrayerActionFeedback({
          type: "error",
          message: json.error || "Failed to send test message to group",
        });
      }
    } catch (err: any) {
      setPrayerActionFeedback({
        type: "error",
        message: err.message || "Error sending test notification",
      });
    } finally {
      setTestingGroupId(null);
    }
  };

  // Duplicated IDs Management State
  const [dupSearch, setDupSearch] = useState("");
  const [dupDeptFilter, setDupDeptFilter] = useState("All");
  const [selectedDupItemKeys, setSelectedDupItemKeys] = useState<string[]>([]);

  // Persistent Doctor Database Management State
  const [fullDoctorList, setFullDoctorList] = useState<Doctor[]>([]);
  const [loadingDatabase, setLoadingDatabase] = useState(false);
  const [databaseError, setDatabaseError] = useState<string | null>(null);
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

  // Global keyboard shortcuts (Escape, Cmd/Ctrl+K Command Palette) & click-outside autocomplete
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        if (isAdminAuthenticated) {
          e.preventDefault();
          setIsCommandPaletteOpen((prev) => !prev);
        }
        return;
      }

      if (e.key === "Escape") {
        if (isCommandPaletteOpen) {
          setIsCommandPaletteOpen(false);
          return;
        }
        if (showSuggestions) setShowSuggestions(false);
        if (showAdminLogin) {
          setShowAdminLogin(false);
          setAdminPasscode("");
          setAdminError("");
        }
        if (deleteConfirmId) {
          setDeleteConfirmId(null);
          setDeleteConfirmTimestamp("");
        }
        if (showResetConfirm) setShowResetConfirm(false);
        if (showWeeklyResetConfirm) setShowWeeklyResetConfirm(false);
        if (editingCheckedInDoctorId) setEditingCheckedInDoctorId(null);
        if (isDoctorModalOpen) setIsDoctorModalOpen(false);
        if (isCheckinModalOpen && !isSavingCheckinModal) setIsCheckinModalOpen(false);
        if (deleteModalState.isOpen && !isDeletingDoctor) {
          setDeleteModalState(prev => ({ ...prev, isOpen: false }));
        }
        if (confirmModalState.isOpen && !isConfirmingAction) {
          setConfirmModalState(prev => ({ ...prev, isOpen: false }));
        }
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [
    isAdminAuthenticated,
    isCommandPaletteOpen,
    showSuggestions,
    showAdminLogin,
    deleteConfirmId,
    showResetConfirm,
    showWeeklyResetConfirm,
    editingCheckedInDoctorId,
    isDoctorModalOpen,
    isCheckinModalOpen,
    isSavingCheckinModal,
    deleteModalState.isOpen,
    isDeletingDoctor,
    confirmModalState.isOpen,
    isConfirmingAction
  ]);

  // Auto-focus Check-In input when entering Check-In mode
  useEffect(() => {
    if (!isAdminMode && !showAdminLogin && !submitSuccess) {
      const timer = setTimeout(() => {
        physicianInputRef.current?.focus();
      }, 120);
      return () => clearTimeout(timer);
    }
  }, [isAdminMode, showAdminLogin, submitSuccess]);

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
          await fetchFullDoctorsDatabase(true);
          toast.success("Physician Removed", `Doctor "${targetName || id}" deleted successfully.`);
          setDeleteModalState({ isOpen: false, type: "single" });
        } else {
          const data = await res.json().catch(() => ({}));
          setDeleteModalState((prev) => ({
            ...prev,
            errorMsg: data.error || "Failed to delete physician."
          }));
        }
      } else if (deleteModalState.type === "batch") {
        const count = selectedDbDoctorIds.length;
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
          toast.success("Batch Delete Complete", `Removed ${count} physician(s) successfully.`);
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
    setLoadingDatabase(true);
    setDatabaseError(null);
    try {
      const url = `/api/doctors?_t=${Date.now()}${forceRefresh ? "&refresh=true" : ""}`;
      const res = await fetch(url, {
        headers: { "Cache-Control": "no-cache", "Pragma": "no-cache" }
      });
      if (res.ok) {
        const data = await res.json();
        const sorted = data.sort((a: Doctor, b: Doctor) => compareDoctorIds(a.id, b.id));
        setFullDoctorList(sorted);
      } else {
        const errMsg = `Failed to load doctors database (Status ${res.status})`;
        setDatabaseError(errMsg);
        toast.error("Database Error", errMsg);
      }
    } catch (err: any) {
      console.error("Error fetching full doctors database:", err);
      const msg = err instanceof Error ? err.message : "Connection failed";
      setDatabaseError(msg);
      toast.error("Network Error", "Unable to load physician database.");
    } finally {
      setLoadingDatabase(false);
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
      toast.success("Database Exported", "Physicians database spreadsheet downloaded successfully.");
    } catch (err) {
      console.error("Error exporting database:", err);
      toast.error("Export Failed", "Failed to export physicians database.");
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
        const hasPhone = Boolean(doc.mobileNumber && doc.mobileNumber.trim() && doc.mobileNumber.trim().toLowerCase() !== "n/a");
        const matchesPhone =
          dbPhoneFilter === "all" ||
          (dbPhoneFilter === "has_phone" && hasPhone) ||
          (dbPhoneFilter === "missing_phone" && !hasPhone);
        return matchesSearch && matchesDept && matchesPhone;
      })
      .sort((a, b) => compareDoctorIds(a.id, b.id));
  }, [fullDoctorList, dbSearch, dbDeptFilter, dbPhoneFilter]);

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
            toast.success("Duplicate Records Cleaned", "Retained designated doctor and removed duplicates.");
          } else {
            const data = await res.json().catch(() => ({}));
            toast.error("Operation Failed", data.error || "Failed to delete duplicate records.");
          }
        } catch (err: any) {
          console.error("Keep doctor error:", err);
          toast.error("Network Error", "Failed to delete duplicate records. Check connection.");
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
            toast.success("Physician Removed", `Deleted ${doc.name} from the database.`);
          } else {
            const data = await res.json().catch(() => ({}));
            toast.error("Delete Failed", data.error || "Failed to delete doctor.");
          }
        } catch (err: any) {
          console.error("Delete error:", err);
          toast.error("Network Error", "Failed to delete doctor. Check connection.");
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
            toast.success("Batch Delete Complete", `Removed ${itemsToDelete.length} selected duplicate record(s).`);
          } else {
            const data = await res.json().catch(() => ({}));
            toast.error("Batch Delete Failed", data.error || "Failed to delete selected duplicate records.");
          }
        } catch (err: any) {
          console.error("Batch delete error:", err);
          toast.error("Network Error", "Failed to delete selected duplicate records.");
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
        body: JSON.stringify({
          mobileNumber: editingCheckedInPhone,
          date: rosterDateFilter || undefined
        })
      });
      if (res.ok) {
        // Refresh checkins and historical date view
        fetchCheckins();
        fetchRosterDates();
        if (rosterDateFilter) {
          fetchCheckinsForDate(rosterDateFilter);
        }
        fetchFullDoctorsDatabase(true);
        setEditingCheckedInDoctorId(null);
        toast.success("Phone Updated", "Doctor phone number saved across all sheets.");
      } else {
        const err = await res.json();
        toast.error("Update Failed", err.error || "Failed to update phone number.");
      }
    } catch (err: any) {
      console.error("Error updating phone number:", err);
      toast.error("Network Error", "Failed to update phone number. Check connection.");
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
        if (rosterDateFilter) {
          fetchCheckinsForDate(rosterDateFilter);
        }
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
    fetchRosterDates();

    // Background pre-warm and sync of high-res Retina header to server memory cache for 8 AM Cron
    const timer = setTimeout(async () => {
      try {
        const bgHeader = await fetchHeaderImageBase64(undefined, undefined, undefined, undefined, { autoReset: true });
        if (bgHeader) {
          fetch("/api/sheet-header-sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ headerBase64: bgHeader })
          }).catch(() => {});
        }
      } catch {
        // non-blocking
      }
    }, 2500);

    return () => clearTimeout(timer);
  }, []);

  // Fetch and live-sync current checkins if admin is authenticated (polls every 10 seconds when tab is visible)
  useEffect(() => {
    if (!isAdminAuthenticated) return;

    const refreshRoster = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      fetchCheckins();
      if (rosterDateFilter) {
        fetchCheckinsForDate(rosterDateFilter, true);
      }
    };

    fetchCheckins();
    fetchFullDoctorsDatabase();
    fetchRosterDates();
    if (rosterDateFilter) {
      fetchCheckinsForDate(rosterDateFilter, true);
    }

    const intervalId = setInterval(refreshRoster, 10000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshRoster();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [isAdminAuthenticated, rosterDateFilter]);

  // Global background poller: ensures any open check-in kiosk or browser tab also triggers Green-API journal sync
  useEffect(() => {
    const runPoll = () => {
      fetch("/api/doctor-calls/poll", { method: "POST", cache: "no-store" }).catch(() => {});
    };
    runPoll();
    const bgPollId = setInterval(runPoll, 15000);
    return () => clearInterval(bgPollId);
  }, []);

  // Live-sync Inpatient Doctor Calls when on "calls" tab (polls every 10 seconds when tab is visible)
  useEffect(() => {
    if (!isAdminAuthenticated || adminTab !== "calls") return;

    const refreshCallsTab = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      fetchDoctorCalls();
      fetchAuditLogs();
    };

    fetchDoctorCalls();
    fetchAutomationStatus();
    fetchAuditLogs();

    const intervalId = setInterval(refreshCallsTab, 10000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshCallsTab();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [isAdminAuthenticated, adminTab, callsDateFilter, callsDeptFilter, callsStatusFilter, callsSearch]);

  // Live-sync Prayer Status when on "prayer" tab (polls every 10 seconds when tab is visible)
  useEffect(() => {
    if (!isAdminAuthenticated || adminTab !== "prayer") return;

    const refreshPrayerTab = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      fetchPrayerStatus();
    };

    fetchPrayerStatus();
    const intervalId = setInterval(refreshPrayerTab, 10000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshPrayerTab();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [isAdminAuthenticated, adminTab]);

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
    setLoadingCheckins(true);
    setCheckinsError(null);
    try {
      const res = await fetch("/api/checkins");
      if (res.ok) {
        const data = await res.json();
        setCheckins(data);
      } else {
        const errorText = `Failed to load check-ins (Status: ${res.status})`;
        setCheckinsError(errorText);
        toast.error("Roster Error", errorText);
      }
    } catch (err: any) {
      console.error("Error fetching checkins:", err);
      const msg = err instanceof Error ? err.message : "Connection failed";
      setCheckinsError(msg);
      toast.error("Network Error", "Unable to load active roster. Please check connection.");
    } finally {
      setLoadingCheckins(false);
    }
  };

  // Fetch list of available roster dates with doctor/department counts
  const fetchRosterDates = async () => {
    try {
      const res = await fetch("/api/checkins/dates");
      if (res.ok) {
        const data = await res.json();
        if (data.activeTodayDate) {
          setActiveTodaySheetDate(data.activeTodayDate);
        }
        if (Array.isArray(data.dates)) {
          setRosterDatesList(data.dates);
        }
      }
    } catch (err) {
      console.error("Error fetching roster dates:", err);
    }
  };

  // Fetch check-ins for a specific historical or today date ("YYYY-MM-DD")
  const fetchCheckinsForDate = async (dateStr: string, silent = false) => {
    if (!dateStr) return;
    if (!silent) setLoadingDateCheckins(true);
    setCheckinsError(null);
    try {
      const res = await fetch(`/api/checkins/by-date?date=${encodeURIComponent(dateStr)}`);
      if (res.ok) {
        const data = await res.json();
        setDateCheckins(Array.isArray(data.checkins) ? data.checkins : []);
      } else {
        const err = await res.json().catch(() => ({}));
        const errorText = err.error || `Failed to load check-ins for ${dateStr}`;
        setCheckinsError(errorText);
        if (!silent) toast.error("Date Roster Error", errorText);
      }
    } catch (err: any) {
      console.error("Error fetching checkins for date:", err);
      if (!silent) toast.error("Network Error", `Unable to load roster for ${dateStr}.`);
    } finally {
      if (!silent) setLoadingDateCheckins(false);
    }
  };

  // Helper to shift a YYYY-MM-DD date string by +/- days
  const shiftIsoDateByDays = (isoDate: string, deltaDays: number): string => {
    const baseStr = isoDate || activeTodaySheetDate || new Date().toISOString().split("T")[0];
    const [y, m, d] = baseStr.split("-").map(Number);
    const dt = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + deltaDays, 12, 0, 0));
    return dt.toISOString().split("T")[0];
  };

  // Autocomplete search inside Add/Edit Check-In Modal
  useEffect(() => {
    const q = checkinModalSearch.trim();
    if (!q) {
      setCheckinModalSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/doctors/search?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data = await res.json();
          setCheckinModalSuggestions(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error("Error searching doctors for modal:", err);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [checkinModalSearch]);

  // Open modal to add a doctor check-in to the currently viewed date (or today)
  const handleOpenAddCheckinModal = () => {
    const defaultDate = rosterDateFilter || activeTodaySheetDate || new Date().toISOString().split("T")[0];
    setCheckinModalMode("add");
    setCheckinModalSearch("");
    setCheckinModalSuggestions([]);
    setCheckinFormData({
      originalId: "",
      originalDate: defaultDate,
      originalTimestamp: "",
      id: "",
      doctorName: "",
      doctorArabicName: "",
      department: adminDeptFilter !== "All" ? adminDeptFilter : "Internal Medicine",
      shifts: ["Morning shift"],
      mobileNumber: "",
      date: defaultDate,
      syncMasterProfile: true
    });
    setIsCheckinModalOpen(true);
  };

  // Open modal to edit an existing doctor check-in on the currently viewed date (or today)
  const handleOpenEditCheckinModal = (c: CheckIn) => {
    const enriched = enrichCheckInClient(c);
    const currentViewDate = rosterDateFilter || activeTodaySheetDate || new Date().toISOString().split("T")[0];
    setCheckinModalMode("edit");
    setCheckinModalSearch("");
    setCheckinModalSuggestions([]);
    setCheckinFormData({
      originalId: enriched.id,
      originalDate: currentViewDate,
      originalTimestamp: c.timestamp || "",
      id: enriched.id,
      doctorName: enriched.doctorName || "",
      doctorArabicName: enriched.doctorArabicName || "",
      department: enriched.department || "Internal Medicine",
      shifts: Array.isArray(enriched.shifts) && enriched.shifts.length > 0 ? [...enriched.shifts] : ["Morning shift"],
      mobileNumber: enriched.mobileNumber && enriched.mobileNumber !== "N/A" ? enriched.mobileNumber : "",
      date: currentViewDate,
      syncMasterProfile: true
    });
    setIsCheckinModalOpen(true);
  };

  // Select a doctor from the master database search inside Add/Edit Check-In Modal
  const handleSelectDoctorForCheckinModal = (doc: Doctor) => {
    setCheckinFormData((prev) => ({
      ...prev,
      id: doc.id,
      doctorName: doc.name,
      doctorArabicName: doc.arabicName || doc.name,
      department: doc.department || prev.department,
      mobileNumber: doc.mobileNumber && doc.mobileNumber !== "N/A" ? doc.mobileNumber : prev.mobileNumber
    }));
    setCheckinModalSearch("");
    setCheckinModalSuggestions([]);
  };

  // Toggle shift selection inside Add/Edit Check-In Modal
  const handleToggleCheckinModalShift = (shiftId: string) => {
    setCheckinFormData((prev) => {
      const exists = prev.shifts.includes(shiftId);
      if (exists) {
        return { ...prev, shifts: prev.shifts.filter((s) => s !== shiftId) };
      }
      return { ...prev, shifts: [...prev.shifts, shiftId] };
    });
  };

  // Submit Add or Edit Check-In Modal
  const handleSaveCheckinModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkinFormData.id.trim()) {
      toast.error("Validation Error", "Please enter a valid Physician Employee ID.");
      return;
    }
    if (!checkinFormData.doctorName.trim() && !checkinFormData.doctorArabicName.trim()) {
      toast.error("Validation Error", "Please enter the Physician Name (English or Arabic).");
      return;
    }
    if (!checkinFormData.department) {
      toast.error("Validation Error", "Please select a Clinical Specialty / Department.");
      return;
    }
    if (checkinFormData.shifts.length === 0) {
      toast.error("Validation Error", "Please select at least one shift.");
      return;
    }
    if (!checkinFormData.date) {
      toast.error("Validation Error", "Please select a valid Sheet Date (YYYY-MM-DD).");
      return;
    }

    setIsSavingCheckinModal(true);
    try {
      const isEdit = checkinModalMode === "edit";
      const res = await fetch("/api/checkins/by-date", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalId: isEdit ? checkinFormData.originalId : undefined,
          originalDate: isEdit ? checkinFormData.originalDate : undefined,
          originalTimestamp: isEdit ? checkinFormData.originalTimestamp : undefined,
          id: checkinFormData.id.trim(),
          doctorName: checkinFormData.doctorName.trim() || checkinFormData.doctorArabicName.trim(),
          doctorArabicName: checkinFormData.doctorArabicName.trim() || checkinFormData.doctorName.trim(),
          department: checkinFormData.department,
          shifts: checkinFormData.shifts,
          mobileNumber: checkinFormData.mobileNumber.trim(),
          date: checkinFormData.date,
          syncMasterProfile: checkinFormData.syncMasterProfile
        })
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        toast.success(
          isEdit ? "Check-In Updated" : "Doctor Added to Date",
          data.message || `Doctor ${checkinFormData.id} saved for ${checkinFormData.date} and synced across all sheets.`
        );
        setIsCheckinModalOpen(false);
        // Refresh all states so Today, Selected Date, Dates List, and Master Database stay in sync
        await Promise.all([
          fetchCheckins(),
          fetchRosterDates(),
          fetchFullDoctorsDatabase(true),
          rosterDateFilter ? fetchCheckinsForDate(rosterDateFilter) : Promise.resolve()
        ]);
        // If user edited/added to a different date while in date mode, or if they want to view that date:
        if (rosterDateFilter && checkinFormData.date !== rosterDateFilter) {
          fetchCheckinsForDate(checkinFormData.date);
        }
      } else {
        toast.error("Save Failed", data.error || "Failed to save check-in for the selected date.");
      }
    } catch (err: any) {
      console.error("Error saving check-in modal:", err);
      toast.error("Network Error", "Unable to save check-in changes. Please check connection.");
    } finally {
      setIsSavingCheckinModal(false);
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
    if (submitResetTimerRef.current) {
      clearTimeout(submitResetTimerRef.current);
      submitResetTimerRef.current = null;
    }
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
    setSuggestions([]);
    setShowSuggestions(false);
    setActiveSuggestionIdx(0);
    setTimeout(() => physicianInputRef.current?.focus(), 60);
  };

  // Toggle 24-hour full duty (all 3 shifts) in 1 tap
  const handleToggle24HourDuty = () => {
    setErrorMessage("");
    if (selectedShifts.length === 3) {
      setSelectedShifts([]);
    } else {
      setSelectedShifts(["Morning shift", "Evening shift", "Night shift"]);
    }
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
        if (submitResetTimerRef.current) {
          clearTimeout(submitResetTimerRef.current);
        }
        submitResetTimerRef.current = setTimeout(() => {
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
  const handleDeleteCheckin = (id: string, timestamp?: string) => {
    setDeleteConfirmId(id);
    setDeleteConfirmTimestamp(timestamp || "");
  };

  const confirmDeleteCheckin = async () => {
    if (!deleteConfirmId) return;
    setIsDeletingCheckin(true);
    const targetId = deleteConfirmId;
    const targetTimestamp = deleteConfirmTimestamp;
    const prevCheckins = [...checkins];
    const prevDateCheckins = [...dateCheckins];
    // Optimistic UI update: instantly remove from list
    if (rosterDateFilter) {
      setDateCheckins((prev) => prev.filter((c) => c.id !== targetId));
    } else {
      setCheckins((prev) => prev.filter((c) => c.id !== targetId));
    }
    try {
      const params = new URLSearchParams();
      if (rosterDateFilter) params.set("date", rosterDateFilter);
      if (targetTimestamp) params.set("timestamp", targetTimestamp);
      const queryString = params.toString() ? `?${params.toString()}` : "";
      const res = await fetch(`/api/checkins/${encodeURIComponent(targetId)}${queryString}`, {
        method: "DELETE"
      });
      if (res.ok) {
        toast.success(
          "Check-In Removed",
          rosterDateFilter
            ? `Doctor check-in removed from ${rosterDateFilter} across all sheets.`
            : "Doctor check-in deleted from the active roster and sheets."
        );
        fetchCheckins();
        fetchRosterDates();
        if (rosterDateFilter) {
          fetchCheckinsForDate(rosterDateFilter, true);
        }
      } else {
        const data = await res.json().catch(() => ({}));
        // Revert optimistic update
        setCheckins(prevCheckins);
        setDateCheckins(prevDateCheckins);
        toast.error("Delete Failed", data.error || "Failed to delete check-in.");
      }
    } catch (err: any) {
      console.error("Error deleting checkin:", err);
      // Revert optimistic update
      setCheckins(prevCheckins);
      setDateCheckins(prevDateCheckins);
      toast.error("Network Error", "Unable to delete check-in. Please check connection.");
    } finally {
      setIsDeletingCheckin(false);
      setDeleteConfirmId(null);
      setDeleteConfirmTimestamp("");
    }
  };

  // Clear all check-ins (admin panel) - triggers custom dialog modal
  const handleClearAllCheckins = () => {
    setShowResetConfirm(true);
  };

  const confirmClearAllCheckins = async () => {
    setIsClearingAllCheckins(true);
    try {
      const res = await fetch("/api/checkins/clear", {
        method: "POST"
      });
      if (res.ok) {
        setCheckins([]);
        toast.success("Roster Reset", "All daily check-ins cleared successfully.");
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error("Reset Failed", data.error || "Failed to clear check-ins.");
      }
    } catch (err: any) {
      console.error("Error clearing checkins:", err);
      toast.error("Network Error", "Unable to clear check-ins. Please check connection.");
    } finally {
      setIsClearingAllCheckins(false);
      setShowResetConfirm(false);
    }
  };

  // Clear monthly cumulative check-ins database
  const handleClearMonthlyCheckins = () => {
    setShowMonthlyResetConfirm(true);
  };
  const handleClearWeeklyCheckins = handleClearMonthlyCheckins;

  const confirmClearMonthlyCheckins = async () => {
    setIsClearingMonthlyCheckins(true);
    try {
      const res = await fetch("/api/checkins/clear-monthly", {
        method: "POST"
      });
      if (res.ok) {
        toast.success("Monthly Database Cleared", "Cumulative 30-day check-ins database cleared.");
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error("Clear Failed", data.error || "Failed to clear monthly check-ins.");
      }
    } catch (err: any) {
      console.error("Error clearing monthly checkins:", err);
      toast.error("Network Error", "Unable to clear monthly check-ins.");
    } finally {
      setIsClearingMonthlyCheckins(false);
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
        toast.error("Fetch Failed", "Failed to fetch cumulative monthly data.");
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
      toast.success("Monthly Roster Exported", "30-day cumulative roster sheet downloaded successfully.");
    } catch (err) {
      console.error("Error exporting monthly excel:", err);
      toast.error("Export Failed", "Failed to export styled monthly Excel sheet.");
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

  // Active check-ins list for the Roster tab (either the selected historical date or live today)
  const activeRosterCheckins = rosterDateFilter ? dateCheckins : checkins;

  // Download Excel Sheet (.xlsx) with separators and custom color theme matching the template
  const downloadCSVReport = async () => {
    if (activeRosterCheckins.length === 0) {
      toast.warning("No Check-Ins", "No check-ins available to export for the selected date.");
      return;
    }

    setIsDownloadingDaily(true);
    // Group check-ins by department (Speciality) after authoritative enrichment
    const enrichedCheckins = activeRosterCheckins.map((c) => enrichCheckInClient(c));
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

    let d: Date;
    if (rosterDateFilter && /^\d{4}-\d{2}-\d{2}$/.test(rosterDateFilter)) {
      d = new Date(`${rosterDateFilter}T10:00:00.000Z`);
    } else {
      const nowEgypt = new Date();
      const egyptHourStr = nowEgypt.toLocaleTimeString("en-US", { timeZone: "Africa/Cairo", hour: "numeric", hour12: false });
      const egyptMinStr = nowEgypt.toLocaleTimeString("en-US", { timeZone: "Africa/Cairo", minute: "numeric" });
      const egyptHour = parseInt(egyptHourStr, 10) || 0;
      const egyptMin = parseInt(egyptMinStr, 10) || 0;
      const isPastReset = egyptHour > 18 || (egyptHour === 18 && egyptMin >= 30);
      d = new Date(nowEgypt);
      if (isPastReset) {
        d.setDate(d.getDate() + 1);
      }
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
    const targetIsoDate = rosterDateFilter && /^\d{4}-\d{2}-\d{2}$/.test(rosterDateFilter)
      ? rosterDateFilter
      : new Intl.DateTimeFormat("en-CA", {
          timeZone: "Africa/Cairo",
          year: "numeric",
          month: "2-digit",
          day: "2-digit"
        }).format(d);
    const dailyTitle = `الأطباء المتواجدين عن يوم ${arabicWeekday} ${formattedDate}`;

    // Fetch header SVG from Node.js backend using backend parameters and embed into worksheet
    const headerBase64 = await fetchHeaderImageBase64(formattedDate, arabicWeekday, undefined, englishWeekday, { autoReset: !rosterDateFilter });
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
      toast.success("Daily Roster Exported", `Styled physician check-in spreadsheet (${targetIsoDate}) downloaded successfully.`);
    } catch (err) {
      console.error("Error exporting styled excel:", err);
      toast.error("Export Failed", "Failed to export styled Excel sheet. Please try again.");
    } finally {
      setIsDownloadingDaily(false);
    }
  };

  const handleSendWhatsAppSheet = async () => {
    if (isSendingWhatsApp) return;
    setIsSendingWhatsApp(true);
    try {
      // 1. Calculate Egypt date parameters matching the selected date or live daily sheet
      let d: Date;
      if (rosterDateFilter && /^\d{4}-\d{2}-\d{2}$/.test(rosterDateFilter)) {
        d = new Date(`${rosterDateFilter}T10:00:00.000Z`);
      } else {
        const nowEgypt = new Date();
        const egyptHourStr = nowEgypt.toLocaleTimeString("en-US", { timeZone: "Africa/Cairo", hour: "numeric", hour12: false });
        const egyptMinStr = nowEgypt.toLocaleTimeString("en-US", { timeZone: "Africa/Cairo", minute: "numeric" });
        const egyptHour = parseInt(egyptHourStr, 10) || 0;
        const egyptMin = parseInt(egyptMinStr, 10) || 0;
        const isPastReset = egyptHour > 18 || (egyptHour === 18 && egyptMin >= 30);
        d = new Date(nowEgypt);
        if (isPastReset) {
          d.setDate(d.getDate() + 1);
        }
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
      const targetIsoDate = rosterDateFilter && /^\d{4}-\d{2}-\d{2}$/.test(rosterDateFilter)
        ? rosterDateFilter
        : new Intl.DateTimeFormat("en-CA", {
            timeZone: "Africa/Cairo",
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
          }).format(d);

      // 2. Fetch the SVG header from Node.js backend parameters and render into high-res PNG
      let headerBase64 = "";
      try {
        headerBase64 = await fetchHeaderImageBase64(
          formattedDate,
          arabicWeekday,
          undefined,
          englishWeekday,
          { autoReset: !rosterDateFilter }
        );
      } catch (err) {
        console.warn("Could not generate canvas header image:", err);
      }

      // 3. Dispatch to backend with headerBase64 included
      const res = await fetch("/api/whatsapp/send-daily-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          headerBase64,
          targetDate: targetIsoDate
        })
      });

      const rawText = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(rawText);
      } catch {
        const cleanMsg = rawText.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
        throw new Error(`Server returned (${res.status} ${res.statusText}): ${cleanMsg || "Invalid response format"}`);
      }

      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || "Failed to send to WhatsApp");
      }
      toast.success("WhatsApp Sheet Delivered", data.message || "Daily sheet successfully sent to the WhatsApp group!");
    } catch (err: any) {
      console.error("Error sending daily sheet to WhatsApp:", err);
      toast.error("WhatsApp Delivery Failed", err.message || "Please check Green-API credentials in your environment.");
    } finally {
      setIsSendingWhatsApp(false);
    }
  };

  // Filtered checkins in admin grid
  const filteredCheckins = activeRosterCheckins.filter((c) => {
    const matchesSearch =
      c.id.toLowerCase().includes(adminSearch.toLowerCase()) ||
      c.doctorName.toLowerCase().includes(adminSearch.toLowerCase()) ||
      c.doctorArabicName.includes(adminSearch);
    
    const matchesDept = adminDeptFilter === "All" || c.department === adminDeptFilter;

    let matchesShift = true;
    if (adminShiftFilter !== "All") {
      if (adminShiftFilter === "24h") {
        matchesShift =
          c.shifts.includes("Morning shift") &&
          c.shifts.includes("Evening shift") &&
          c.shifts.includes("Night shift");
      } else {
        matchesShift = c.shifts.includes(adminShiftFilter);
      }
    }
    
    return matchesSearch && matchesDept && matchesShift;
  });

  // Departments list for filter dropdown
  const uniqueDepts = Array.from(new Set(activeRosterCheckins.map((c) => c.department)));

  return (
    <div id="app-root" className="min-h-screen bg-[#e8efec] font-sans flex flex-col text-slate-900">
      
      {/* Top Navigation Bar in Swiss Clinical Ledger style */}
      <header 
        className="h-20 flex items-center justify-between px-4 sm:px-8 bg-[#dae4e1] border-b border-[#cbdad5] shadow-sm sticky top-0 z-40 relative overflow-hidden"
        style={{ 
          backgroundImage: "url('/header_bg.png')",
          backgroundSize: "cover",
          backgroundPosition: "center 45%",
          backgroundRepeat: "no-repeat"
        }}
      >
        {/* Impeccable contrast scrim: solid medical sage on left for AAA typography readability, transparent center allowing the heartbeat ECG and hospital telemetry artwork to shine clearly, balanced soft tint on right for actions */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#dae4e1]/95 via-[#dae4e1]/30 to-[#dae4e1]/80 pointer-events-none z-0"></div>
        {/* Subtle hospital tech accent line at top */}
        <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-emerald-600/30 via-emerald-400/50 to-emerald-600/30 pointer-events-none z-0"></div>
        
        <div className="flex items-center gap-3 relative z-10">
          <div className="w-11 h-11 bg-[#063b30] rounded-xl flex items-center justify-center shadow-sm border border-emerald-900/20 overflow-hidden p-1">
            <img src="/elite_logo.png" alt="Elite Hospital Logo" className="w-8 h-8 object-contain" />
          </div>
          <div className="leading-none">
            <h1 className="text-base sm:text-lg font-extrabold tracking-tight text-[#063b30] uppercase">Mohanad's Elite Doctors' Registry</h1>
            <p className="text-[10px] text-[#084c3e] font-bold tracking-wider uppercase mt-1">All rights reserved to Dr. Mohanad El Ma'moun , MSC</p>
          </div>
        </div>
        <div className="flex items-center gap-3 sm:gap-5 relative z-10">
          <div className="text-right hidden md:block leading-none tabular-nums">
            <LiveClock />
          </div>
          {isAdminAuthenticated ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsCommandPaletteOpen(true)}
                className="hidden sm:inline-flex items-center gap-2 px-3 py-2 bg-white/90 hover:bg-white text-[#063b30] border border-[#cbdad5] text-xs font-bold rounded-lg shadow-2xs tactile-press cursor-pointer"
                title="Open Quick Command Palette (Cmd+K / Ctrl+K)"
              >
                <Command className="w-3.5 h-3.5 text-[#084c3e]" />
                <span>Quick Jump</span>
                <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-[#f8fbf9] border border-[#cbdad5] rounded text-emerald-900">⌘K</kbd>
              </button>
              <span className="bg-[#e6f2ee] text-[#063b30] text-[10px] font-extrabold px-2.5 py-1.5 rounded-full border border-[#b5d6c9] flex items-center gap-1.5 shadow-2xs">
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
                className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-900 border border-rose-200 text-xs font-bold rounded-lg shadow-2xs tactile-press uppercase cursor-pointer"
                title={adminRole === "coordinator" ? "Logout Coordinator" : "Logout Admin"}
              >
                {adminRole === "coordinator" ? "COORDINATOR LOGOUT" : "ADMIN LOGOUT"}
              </button>
            </div>
          ) : (
            <button
              id="admin-login-trigger"
              onClick={() => setShowAdminLogin(true)}
              className="px-4 py-2 bg-[#063b30] hover:bg-[#042d24] text-white text-xs font-bold rounded-lg shadow-sm tactile-press uppercase cursor-pointer"
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
            <div className="bg-white/80 backdrop-blur-xs p-1 rounded-xl flex items-center gap-1 border border-[#cbdad5] shadow-2xs">
              <button
                onClick={() => setIsAdminMode(false)}
                className={`px-5 py-2 rounded-lg text-xs font-bold uppercase tactile-press flex items-center gap-2 cursor-pointer ${
                  !isAdminMode
                    ? "bg-[#063b30] text-white shadow-xs"
                    : "text-emerald-950 hover:bg-[#e6f2ee]/60"
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
                className={`px-5 py-2 rounded-lg text-xs font-bold uppercase tactile-press flex items-center gap-2 cursor-pointer ${
                  isAdminMode
                    ? "bg-[#063b30] text-white shadow-xs"
                    : "text-emerald-950 hover:bg-[#e6f2ee]/60"
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
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              className="max-w-2xl mx-auto w-full"
            >
              <div className="bg-white rounded-2xl border border-[#cbdad5] p-6 sm:p-8 shadow-[0_18px_40px_-20px_rgba(6,59,48,0.16)]">
                
                <div className="flex items-center justify-between gap-4 pb-5 mb-7 border-b border-[#e4ece9]">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#e6f2ee] border border-[#cbdad5] text-[#063b30] flex items-center justify-center shrink-0">
                      <Stethoscope className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-[#063b30]">Personnel Check-In</h2>
                      <p className="text-xs text-slate-500 font-medium mt-0.5">Search by Employee ID or Name, then select your duty shifts</p>
                    </div>
                  </div>
                  <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-bold text-[#063b30] bg-[#f8fbf9] border border-[#cbdad5] px-2.5 py-1 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                    Live Terminal
                  </span>
                </div>

                <div className="space-y-6">

                  {/* STEP 1: Enter ID / Code */}
                  <div className="space-y-2" ref={searchBoxRef}>
                    <div className="flex justify-between items-center">
                      <label htmlFor="physician-id-input" className="text-xs font-extrabold text-slate-700 uppercase tracking-wider block cursor-pointer">
                        Enter Employee ID or Name
                      </label>
                      <span className="text-[#084c3e] font-bold text-xs arabic-font">البحث بالاسم أو الرمز الوظيفي</span>
                    </div>

                    <form onSubmit={handleSearchDoctor} className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                           ref={physicianInputRef}
                           id="physician-id-input"
                           type="text"
                           placeholder="e.g. 1498, Beshoy, عمرو..."
                           value={inputId}
                           onChange={(e) => {
                             setInputId(e.target.value);
                             setErrorMessage("");
                             setActiveSuggestionIdx(0);
                           }}
                           onFocus={() => {
                             if (suggestions.length > 0) setShowSuggestions(true);
                           }}
                           onKeyDown={(e) => {
                             if (!showSuggestions || suggestions.length === 0) return;
                             if (e.key === "ArrowDown") {
                               e.preventDefault();
                               setActiveSuggestionIdx((prev) => (prev + 1) % suggestions.length);
                             } else if (e.key === "ArrowUp") {
                               e.preventDefault();
                               setActiveSuggestionIdx((prev) => (prev - 1 + suggestions.length) % suggestions.length);
                             } else if (e.key === "Enter" && suggestions[activeSuggestionIdx]) {
                               e.preventDefault();
                               const doc = suggestions[activeSuggestionIdx];
                               setInputId(doc.id);
                               setFoundDoctor(doc);
                               setIsManualReg(false);
                               setSearched(true);
                               setSuggestions([]);
                               setShowSuggestions(false);
                             }
                           }}
                           disabled={submitting || !!submitSuccess}
                           className="w-full h-14 pl-4 pr-20 bg-[#f8fbf9] border-2 border-[#cbdad5] rounded-xl text-base sm:text-lg font-sans font-medium focus:border-[#063b30] focus:bg-white outline-none transition-colors"
                        />
                        <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                          {inputId && !submitting && !submitSuccess && (
                            <button
                              type="button"
                              onClick={handleResetForm}
                              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                              aria-label="Clear search input"
                              title="Clear"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                          <Search className="w-5 h-5 text-slate-400 pointer-events-none" />
                        </div>

                        {/* Search Autocomplete Suggestions Dropdown */}
                        {showSuggestions && suggestions.length > 0 && (
                          <div className="absolute left-0 right-0 mt-1.5 bg-white border border-[#cbdad5] rounded-xl shadow-[0_16px_40px_-12px_rgba(6,59,48,0.22)] z-50 max-h-64 overflow-y-auto divide-y divide-slate-100">
                            {suggestions.map((doc, idx) => {
                              const isHighlighted = idx === activeSuggestionIdx;
                              return (
                                <button
                                  key={`sug-${doc.id}-${idx}`}
                                  type="button"
                                  onMouseEnter={() => setActiveSuggestionIdx(idx)}
                                  onClick={() => {
                                    setInputId(doc.id);
                                    setFoundDoctor(doc);
                                    setIsManualReg(false);
                                    setSearched(true);
                                    setSuggestions([]);
                                    setShowSuggestions(false);
                                  }}
                                  className={`w-full text-left px-4 py-3 transition-colors flex justify-between items-center text-sm cursor-pointer ${
                                    isHighlighted ? "bg-[#e6f2ee]/75" : "hover:bg-[#f8fbf9]"
                                  }`}
                                >
                                  <div className="text-slate-900 font-semibold min-w-0 pr-3">
                                    <div className="truncate">{doc.name}</div>
                                    <div className="text-xs text-[#084c3e] font-medium arabic-font mt-0.5">{doc.arabicName}</div>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <span className="text-[10px] font-extrabold bg-[#e6f2ee] text-[#063b30] px-2.5 py-0.5 rounded-full uppercase border border-[#cbdad5]">
                                      {doc.department}
                                    </span>
                                    <div className="text-[10px] text-slate-600 font-mono tabular-nums mt-1">ID: {doc.id}</div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      
                      <button
                        id="search-doctor-btn"
                        type="submit"
                        disabled={!inputId.trim() || submitting || !!submitSuccess}
                        className="h-14 px-5 sm:px-6 bg-[#063b30] hover:bg-[#042d24] text-white font-bold rounded-xl tactile-press flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm shadow-xs cursor-pointer"
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
                        transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
                        className="overflow-hidden"
                      >
                        {foundDoctor ? (() => {
                          const existingTodayCheckin = checkins.find(
                            (c) => c.id.trim().toLowerCase() === foundDoctor.id.trim().toLowerCase()
                          );
                          return (
                            /* Predefined Profile Found Visual Card */
                            <div className="p-5 sm:p-6 bg-[#e6f2ee] rounded-xl border border-[#b5d6c9] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h3 className="text-xl sm:text-2xl font-extrabold text-[#063b30] tracking-tight">{foundDoctor.name}</h3>
                                  {existingTodayCheckin && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-white text-[#063b30] border border-[#b5d6c9]">
                                      <CheckCircle className="w-3 h-3 text-emerald-700" />
                                      Checked in today ({formatShiftsForDisplay(existingTodayCheckin.shifts)})
                                    </span>
                                  )}
                                </div>
                                <p className="text-lg sm:text-xl text-[#084c3e] font-bold arabic-font" dir="rtl">{foundDoctor.arabicName}</p>
                              </div>
                              <div className="sm:text-right shrink-0">
                                <span className="px-3 py-1 bg-white text-[#063b30] border border-[#b5d6c9] text-[10px] font-extrabold rounded-full uppercase tracking-wider font-mono">
                                  {foundDoctor.department}
                                </span>
                                <p className="text-xs text-[#084c3e] mt-2 font-mono font-bold tabular-nums">Physician ID: {foundDoctor.id}</p>
                              </div>
                            </div>
                          );
                        })() : isManualReg ? (
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
                    <div className="flex flex-wrap justify-between items-center gap-2">
                      <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider block">
                        Shift Assignment (Select Shifts)
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleToggle24HourDuty}
                          disabled={submitting || !!submitSuccess}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border tactile-press cursor-pointer flex items-center gap-1.5 disabled:opacity-50 ${
                            selectedShifts.length === 3
                              ? "bg-[#063b30] text-white border-[#063b30]"
                              : "bg-[#f8fbf9] text-[#063b30] border-[#cbdad5] hover:bg-[#e6f2ee]"
                          }`}
                          title="Toggle all 3 shifts (24-Hour Full Duty)"
                        >
                          <Clock className="w-3 h-3" />
                          <span>24h Full Duty</span>
                        </button>
                        <span className="text-xs text-[#063b30] bg-[#e6f2ee] border border-[#cbdad5] px-2.5 py-1 rounded-lg font-bold font-mono tabular-nums">
                          {selectedShifts.length} / 3 SELECTED
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                      {(() => {
                        const recommendedShiftId = getRecommendedCairoShift();
                        return SHIFT_OPTIONS.map((shift, idx) => {
                          const isSelected = selectedShifts.includes(shift.id);
                          const isRecommended = shift.id === recommendedShiftId;
                          const ShiftIcon = shift.icon;
                          
                          return (
                            <button
                              id={`shift-card-${shift.id.replace(/\s+/g, "-")}`}
                              key={`shift-${shift.id}-${idx}`}
                              type="button"
                              aria-pressed={isSelected}
                              disabled={submitting || !!submitSuccess}
                              onClick={() => handleToggleShift(shift.id)}
                              className={`relative flex items-center p-4 rounded-xl border-2 cursor-pointer tactile-press text-left justify-between disabled:opacity-60 ${
                                isSelected
                                  ? "border-[#063b30] bg-[#e6f2ee]/60 ring-2 ring-[#063b30]/15 text-[#063b30]"
                                  : "border-[#cbdad5] bg-[#f8fbf9] hover:border-[#084c3e]/50 hover:bg-white text-slate-700"
                              }`}
                            >
                              {isRecommended && (
                                <span className="absolute -top-2.5 left-3 px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider bg-[#063b30] text-white shadow-2xs">
                                  Active Now
                                </span>
                              )}
                              <div className="flex items-center min-w-0">
                                <div className={`w-5 h-5 rounded-full border-2 mr-3 flex items-center justify-center shrink-0 transition-colors ${
                                  isSelected ? "border-[#063b30] bg-[#063b30] text-white" : "border-slate-300 bg-white"
                                }`}>
                                  {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                                </div>
                                <div className="leading-tight min-w-0">
                                  <span className={`text-sm font-bold flex items-center gap-1.5 ${isSelected ? "text-[#063b30]" : "text-slate-800"}`}>
                                    <ShiftIcon className="w-3.5 h-3.5 shrink-0 opacity-75" />
                                    <span className="truncate">{shift.labelEn}</span>
                                  </span>
                                  <span className="text-[10px] text-slate-500 block font-medium mt-0.5">{shift.descriptionEn}</span>
                                </div>
                              </div>
                              <span className="font-bold text-xs arabic-font shrink-0 ml-2">{shift.labelAr}</span>
                            </button>
                          );
                        });
                      })()}
                    </div>
                  </div>

                  {/* Errors / Warnings */}
                  {errorMessage && (
                    <div role="alert" aria-live="assertive" className="bg-rose-50 text-rose-900 px-4 py-3 rounded-xl border border-rose-200 flex items-start gap-2.5 text-xs font-semibold">
                      <AlertCircle className="w-4 h-4 shrink-0 text-rose-700 mt-0.5" />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  {/* Submission success screen layout */}
                  <AnimatePresence>
                    {submitSuccess && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.97, y: 6 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.97, y: -4 }}
                        transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                        className="bg-[#e6f2ee] text-[#063b30] border border-[#b5d6c9] rounded-xl p-6 flex flex-col items-center text-center space-y-3.5 relative overflow-hidden"
                      >
                        <div className="w-12 h-12 bg-[#063b30] text-white rounded-2xl flex items-center justify-center shadow-sm">
                          <CheckCircle className="w-6 h-6" />
                        </div>
                        <div>
                          <span className="text-[10px] font-extrabold uppercase text-[#084c3e] tracking-widest block">Attendance Saved Successfully</span>
                          <h4 className="text-xl font-extrabold text-[#063b30] mt-1">Thank you, Dr. {submitSuccess.doctorName}</h4>
                          <p className="text-[#084c3e] font-bold text-sm arabic-font mt-0.5" dir="rtl">تم تسجيل حضوركم بنجاح: د. {submitSuccess.doctorArabicName}</p>
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
                                <span key={`sh-${sh}-${idx}`} className="bg-white text-[#063b30] border border-[#b5d6c9] px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider font-mono">
                                  {SHIFT_MAP_AR[sh] || sh}
                                </span>
                              ));
                            })()}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={handleResetForm}
                            className="px-4 py-2 bg-[#063b30] hover:bg-[#042d24] text-white text-xs font-bold rounded-lg tactile-press cursor-pointer shadow-2xs"
                          >
                            Check In Another Doctor
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (submitResetTimerRef.current) {
                                clearTimeout(submitResetTimerRef.current);
                                submitResetTimerRef.current = null;
                              }
                              setSubmitSuccess(null);
                            }}
                            className="px-4 py-2 bg-white hover:bg-[#f8fbf9] text-[#063b30] border border-[#b5d6c9] text-xs font-bold rounded-lg tactile-press cursor-pointer"
                          >
                            Edit My Shifts
                          </button>
                        </div>

                        {/* Smooth 5s Auto-Reset Progress Indicator */}
                        <motion.div
                          initial={{ scaleX: 1 }}
                          animate={{ scaleX: 0 }}
                          transition={{ duration: 5, ease: "linear" }}
                          style={{ transformOrigin: "left" }}
                          className="absolute bottom-0 inset-x-0 h-1 bg-[#063b30]/40"
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Bottom Action buttons */}
                  <div className="flex gap-3 pt-4 border-t border-[#e4ece9]">
                    <button
                      id="reset-form-btn"
                      type="button"
                      onClick={handleResetForm}
                      disabled={submitting || !inputId}
                      className="px-5 py-3.5 bg-[#f8fbf9] hover:bg-slate-100 text-slate-700 font-bold rounded-xl text-xs uppercase border border-[#cbdad5] tactile-press disabled:opacity-40 cursor-pointer"
                    >
                      Reset Form
                    </button>
                    
                    <button
                      id="submit-checkin-btn"
                      type="button"
                      disabled={!inputId.trim() || selectedShifts.length === 0 || submitting || !!submitSuccess}
                      onClick={handleSubmitCheckin}
                      className="flex-1 h-14 sm:h-16 bg-[#063b30] hover:bg-[#042d24] text-white rounded-xl font-extrabold text-base sm:text-lg tracking-wide tactile-press flex items-center justify-center gap-2 disabled:opacity-45 disabled:cursor-not-allowed shadow-sm cursor-pointer"
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
                        className={`px-4 py-2.5 rounded-lg text-xs font-bold uppercase tactile-press flex items-center gap-2 cursor-pointer ${
                          adminTab === "duplicates"
                            ? "bg-amber-700 text-white shadow-sm"
                            : "text-amber-900 hover:bg-amber-50"
                        }`}
                      >
                        <Copy className="w-4 h-4 text-amber-600" />
                        <span>Duplicated IDs</span>
                        {duplicateGroups.length > 0 && (
                          <span className="ml-1 bg-rose-600 text-white text-[10px] font-mono tabular-nums px-2 py-0.5 rounded-full font-bold shadow-xs">
                            {duplicateGroups.length}
                          </span>
                        )}
                      </button>
                    </>
                  )}

                  <button
                    onClick={() => {
                      setAdminTab("calls");
                      fetchDoctorCalls();
                    }}
                    className={`px-4 py-2.5 rounded-lg text-xs font-bold uppercase tactile-press flex items-center gap-2 cursor-pointer ${
                      adminTab === "calls"
                        ? "bg-[#063b30] text-white shadow-sm"
                        : "text-slate-700 hover:text-[#063b30] hover:bg-[#f8fbf9]"
                    }`}
                  >
                    <PhoneCall className={`w-4 h-4 ${adminTab === "calls" ? "text-emerald-300" : "text-[#084c3e]"}`} />
                    <span>Doctor Calls</span>
                    {doctorCalls.length > 0 && (
                      <span className="ml-1 bg-emerald-600 text-white text-[10px] font-mono tabular-nums px-2 py-0.5 rounded-full font-bold shadow-xs">
                        {doctorCalls.length}
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => {
                      setAdminTab("prayer");
                      fetchPrayerStatus();
                    }}
                    className={`px-4 py-2.5 rounded-lg text-xs font-bold uppercase tactile-press flex items-center gap-2 cursor-pointer ${
                      adminTab === "prayer"
                        ? "bg-[#063b30] text-white shadow-sm"
                        : "text-slate-700 hover:text-[#063b30] hover:bg-[#f8fbf9]"
                    }`}
                  >
                    <Moon className={`w-4 h-4 ${adminTab === "prayer" ? "text-emerald-300" : "text-[#084c3e]"}`} />
                    <span>Prayer Times</span>
                    {prayerStatus?.isPaused ? (
                      <span className="ml-1 bg-amber-100 text-amber-950 border border-amber-300 text-[10px] font-mono px-2 py-0.5 rounded-full font-bold">
                        PAUSED
                      </span>
                    ) : (
                      <span className="ml-1 bg-emerald-600 text-white text-[10px] font-mono px-2 py-0.5 rounded-full font-bold">
                        LIVE
                      </span>
                    )}
                  </button>
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
                          className="bg-[#f8fbf9] border border-[#cbdad5] text-[#063b30] font-bold text-xs uppercase px-3.5 py-2.5 rounded-lg outline-none focus:border-[#063b30] cursor-pointer"
                        >
                          <option value="All">All Specialities ({fullDoctorList.length})</option>
                          {Array.from(new Set(fullDoctorList.map(d => d.department))).sort().map((dept, idx) => (
                            <option key={`dbdept-${dept}-${idx}`} value={dept}>{dept}</option>
                          ))}
                        </select>

                        <select
                          aria-label="Filter by phone coverage"
                          value={dbPhoneFilter}
                          onChange={(e) => setDbPhoneFilter(e.target.value as "all" | "has_phone" | "missing_phone")}
                          className="bg-[#f8fbf9] border border-[#cbdad5] text-[#063b30] font-bold text-xs uppercase px-3 py-2.5 rounded-lg outline-none focus:border-[#063b30] cursor-pointer"
                        >
                          <option value="all">All Phones</option>
                          <option value="has_phone">Has Phone</option>
                          <option value="missing_phone">Missing Phone</option>
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

                  {/* Database Error Banner */}
                  {databaseError && (
                    <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3.5 rounded-xl flex items-center justify-between text-xs font-semibold shadow-xs">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>{databaseError}</span>
                      </div>
                      <button
                        onClick={() => fetchFullDoctorsDatabase(true)}
                        className="px-3 py-1 bg-white border border-rose-300 rounded-lg font-bold hover:bg-rose-100 transition-colors cursor-pointer text-xs"
                      >
                        Retry
                      </button>
                    </div>
                  )}

                  {/* Database Physicians Table */}
                  <div className="bg-white rounded-xl border border-[#cbdad5] shadow-sm overflow-hidden">
                    <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
                      <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 z-10 shadow-xs">
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
                          {loadingDatabase && fullDoctorList.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="p-0">
                                <TableSkeleton rows={8} cols={7} />
                              </td>
                            </tr>
                          ) : filteredDbDoctors.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="py-6">
                                <EmptyState
                                  icon={Search}
                                  title={dbSearch || dbDeptFilter !== "All" ? "No Matching Physicians" : "No Physicians Registered"}
                                  description={
                                    dbSearch || dbDeptFilter !== "All"
                                      ? "No physicians matched your search query or department filter."
                                      : "No physicians currently exist in the database catalog."
                                  }
                                  actionLabel={dbSearch || dbDeptFilter !== "All" ? "Clear Filters" : "+ Add Physician"}
                                  onAction={
                                    dbSearch || dbDeptFilter !== "All"
                                      ? () => { setDbSearch(""); setDbDeptFilter("All"); }
                                      : handleOpenAddDoctor
                                  }
                                />
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
                                  <td className="py-3 px-4 font-mono font-bold text-[#063b30] tabular-nums">
                                    <button
                                      type="button"
                                      onClick={() => copyToClipboard(doc.id, `ID ${doc.id}`)}
                                      className="bg-[#f8fbf9] hover:bg-[#e6f2ee] border border-[#cbdad5] px-2 py-0.5 rounded inline-flex items-center gap-1 cursor-pointer transition-colors"
                                      title="Click to copy Employee ID"
                                    >
                                      <span>{doc.id}</span>
                                      <Copy className="w-2.5 h-2.5 opacity-50" />
                                    </button>
                                  </td>
                                  <td className="py-3 px-4 font-semibold text-slate-900">{doc.name}</td>
                                  <td className="py-3 px-4 text-right font-bold arabic-font text-slate-800" dir="rtl">{doc.arabicName}</td>
                                  <td className="py-3 px-4 font-medium text-slate-600">
                                    <span className="bg-[#e6f2ee] text-[#063b30] px-2 py-0.5 rounded-full text-[10px] font-bold border border-[#cbdad5]">
                                      {doc.department}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4 font-mono tabular-nums">
                                    {doc.mobileNumber ? (
                                      <div className="flex items-center gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() => copyToClipboard(doc.mobileNumber || "", `Phone ${doc.mobileNumber}`)}
                                          className="text-emerald-900 font-bold bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1 w-fit cursor-pointer transition-colors"
                                          title="Click to copy phone number"
                                        >
                                          <Phone className="w-3 h-3 text-emerald-700" />
                                          <span>{doc.mobileNumber}</span>
                                        </button>
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
                  {loadingDatabase && fullDoctorList.length === 0 ? (
                    <div className="bg-white rounded-xl border border-[#cbdad5] p-6 shadow-sm">
                      <TableSkeleton rows={4} cols={5} />
                    </div>
                  ) : filteredDuplicateGroups.length === 0 ? (
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
                      {(dupSearch || dupDeptFilter !== "All") && (
                        <button
                          onClick={() => {
                            setDupSearch("");
                            setDupDeptFilter("All");
                          }}
                          className="mt-2 px-3.5 py-1.5 bg-[#063b30] hover:bg-[#042d24] text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
                        >
                          Clear Filters
                        </button>
                      )}
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
                                        <td className="py-3 px-4 font-mono tabular-nums">
                                          {doc.mobileNumber ? (
                                            <span className="text-emerald-800 font-semibold inline-flex items-center gap-1">
                                              <Phone className="w-3 h-3 text-emerald-600" />
                                              <span>{doc.mobileNumber}</span>
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
                                              onClick={() => handleDeleteSingleDupDoctor(doc)}
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
              ) : adminTab === "calls" ? (
                /* ======================================================= */
                /*               INPATIENT DOCTOR CALLS TAB                */
                /* ======================================================= */
                <div className="space-y-6">
                  {/* Doctor Calls Header Banner */}
                  <div className="bg-white rounded-xl border border-[#cbdad5] p-5 shadow-sm">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="p-3 bg-[#e6f2ee] text-[#063b30] rounded-xl border border-emerald-200">
                          <PhoneCall className="w-6 h-6" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-bold text-slate-900">Inpatient Ward Doctor Calls</h3>
                            {automationStatus?.isPaused ? (
                              <span className="bg-amber-100 text-amber-900 text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border border-amber-300 flex items-center gap-1.5 shadow-2xs">
                                <Pause className="w-2.5 h-2.5 text-amber-600" />
                                Automation Paused
                              </span>
                            ) : (
                              <span className="bg-emerald-100 text-[#063b30] text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1.5 shadow-2xs">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                Automation Active
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Real-time inpatient call dispatcher, shift matching (Cairo timezone), and doctor WhatsApp mentions
                          </p>
                        </div>
                      </div>

                      {/* Header Actions: Check, Test, Pause, Refresh */}
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Check Status Button */}
                        <button
                          onClick={() => {
                            setShowStatusModal(true);
                            fetchAutomationStatus();
                            fetchAuditLogs();
                          }}
                          disabled={isCheckingAutomation}
                          className="px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-lg border border-slate-300 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                          title="Check WhatsApp & Green-API connection state"
                        >
                          <Activity className={`w-3.5 h-3.5 text-emerald-600 ${isCheckingAutomation ? "animate-spin" : ""}`} />
                          <span>Check Status</span>
                        </button>

                        {/* Fetch Pending Calls Button (Failsafe Poller) */}
                        <button
                          onClick={handlePollQueue}
                          disabled={isPollingQueue}
                          className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-lg border border-indigo-200 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                          title="Immediately poll Green-API for incoming messages"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isPollingQueue ? "animate-spin text-indigo-600" : ""}`} />
                          <span>Fetch Pending</span>
                        </button>

                        {/* Send Custom Doctor Call Button */}
                        <button
                          onClick={() => {
                            const dutyDate = getHospitalDutyDateClient();
                            setCustomCallForm(prev => ({ ...prev, date: dutyDate }));
                            setShowCustomCallModal(true);
                            setCustomCallSuccess(null);
                            fetchCustomCallPreview({ date: dutyDate });
                          }}
                          className="px-3.5 py-2 bg-[#063b30] hover:bg-[#042d24] text-white font-bold text-xs rounded-lg tactile-press flex items-center gap-1.5 cursor-pointer shadow-sm"
                          title="Compose and preview a custom inpatient doctor call message"
                        >
                          <Send className="w-3.5 h-3.5 text-emerald-300" />
                          <span>Send Custom Call</span>
                        </button>

                        {/* Send Test Message Button */}
                        <button
                          onClick={handleSendTestMessage}
                          disabled={isSendingTestMessage}
                          className="px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                          title="Send a sample test notification to target WhatsApp group"
                        >
                          {isSendingTestMessage ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Sending Test...</span>
                            </>
                          ) : (
                            <>
                              <Send className="w-3.5 h-3.5" />
                              <span>Send Test Message</span>
                            </>
                          )}
                        </button>

                        {/* Pause / Resume Automation Button */}
                        <button
                          onClick={handleTogglePauseAutomation}
                          disabled={isTogglingPause}
                          className={`px-3 py-2 font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50 ${
                            automationStatus?.isPaused
                              ? "bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700"
                              : "bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300"
                          }`}
                          title={automationStatus?.isPaused ? "Resume automated dispatching" : "Pause automated dispatching"}
                        >
                          {isTogglingPause ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : automationStatus?.isPaused ? (
                            <Play className="w-3.5 h-3.5 text-white" />
                          ) : (
                            <Pause className="w-3.5 h-3.5 text-amber-700" />
                          )}
                          <span>{automationStatus?.isPaused ? "Resume" : "Pause"}</span>
                        </button>

                        {/* Refresh Calls Button */}
                        <button
                          onClick={fetchDoctorCalls}
                          disabled={loadingDoctorCalls}
                          className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg border border-slate-300 transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-xs"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${loadingDoctorCalls ? "animate-spin text-emerald-600" : ""}`} />
                          <span>Refresh</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Paused Warning Banner */}
                  {automationStatus?.isPaused && (
                    <div className="bg-amber-500/10 border-2 border-amber-500/40 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-950 shadow-xs">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-amber-500 text-white rounded-lg shrink-0">
                          <Pause className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-bold text-xs uppercase tracking-wide text-amber-900">WhatsApp Automation is Currently PAUSED</h4>
                          <p className="text-xs text-amber-800 mt-0.5">
                            Calls are being logged in this dashboard, but outgoing WhatsApp messages are blocked until resumed.
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={handleTogglePauseAutomation}
                        disabled={isTogglingPause}
                        className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 shadow-sm shrink-0"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>Resume Automation</span>
                      </button>
                    </div>
                  )}

                  {/* Missing Supabase Table Warning Banner */}
                  {automationStatus?.supabaseTableStatus === "missing_table" && (
                    <div className="bg-rose-50 border-2 border-rose-300 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-rose-950 shadow-sm">
                      <div className="flex items-start gap-3">
                        <div className="p-2.5 bg-rose-600 text-white rounded-lg shrink-0 mt-0.5">
                          <AlertTriangle className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-bold text-xs uppercase tracking-wide text-rose-900">
                            Supabase Cloud Table "doctor_calls" is Missing!
                          </h4>
                          <p className="text-xs text-rose-700 mt-0.5 leading-relaxed">
                            On Vercel, calls cannot be saved or fetched across server restarts until this table is created. Click "Copy SQL Query" and run it once in your Supabase SQL Editor.
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(DOCTOR_CALLS_SQL);
                          setCopiedSql(true);
                          setTimeout(() => setCopiedSql(false), 3000);
                        }}
                        className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 shadow-xs shrink-0 cursor-pointer"
                      >
                        {copiedSql ? <Check className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4 text-white" />}
                        <span>{copiedSql ? "SQL Copied to Clipboard!" : "Copy SQL for Supabase"}</span>
                      </button>
                    </div>
                  )}

                  {/* WhatsApp Automation Diagnostics Modal */}
                  {showStatusModal && (
                    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
                      <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl p-6 space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                          <div className="flex items-center gap-2.5">
                            <div className="p-2 bg-[#e6f2ee] text-[#063b30] rounded-lg">
                              <Activity className="w-5 h-5" />
                            </div>
                            <div>
                              <h3 className="font-bold text-slate-900 text-base">WhatsApp Automation Diagnostics</h3>
                              <p className="text-[11px] text-slate-500">Green-API webhook & connection health check</p>
                            </div>
                          </div>
                          <button
                            onClick={() => setShowStatusModal(false)}
                            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>

                        <div className="space-y-3 text-xs">
                          {/* Connection state */}
                          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between">
                            <span className="font-semibold text-slate-600">WhatsApp State:</span>
                            {automationStatus?.stateInstance === "authorized" ? (
                              <span className="px-2.5 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 inline-flex items-center gap-1">
                                <CheckCircle className="w-3 h-3 text-emerald-700" />
                                Authorized & Linked
                              </span>
                            ) : (
                              <span className="px-2.5 py-0.5 rounded-full font-bold bg-rose-100 text-rose-900 border border-rose-300 inline-flex items-center gap-1">
                                <AlertCircle className="w-3 h-3 text-rose-700" />
                                {automationStatus?.stateInstance || "Not Connected"}
                              </span>
                            )}
                          </div>

                          {/* Dispatch Status */}
                          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between">
                            <span className="font-semibold text-slate-600">Dispatcher Queue:</span>
                            {automationStatus?.isPaused ? (
                              <span className="px-2.5 py-0.5 rounded-full font-bold bg-amber-100 text-amber-900 border border-amber-300 inline-flex items-center gap-1">
                                <Pause className="w-3 h-3 text-amber-700" />
                                Paused by Admin
                              </span>
                            ) : (
                              <span className="px-2.5 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 inline-flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                                Active (Ready for Calls)
                              </span>
                            )}
                          </div>

                          {/* Green-API Webhook Status */}
                          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5 font-mono text-[11px]">
                            <div className="text-slate-500 font-sans font-bold text-xs flex items-center justify-between">
                              <span>Green-API Webhook Settings:</span>
                              <div className="flex items-center gap-2">
                                <span className={automationStatus?.incomingWebhookEnabled ? "text-emerald-700 font-bold" : "text-amber-700 font-bold"}>
                                  {automationStatus?.incomingWebhookEnabled ? "In: ON" : "In: OFF"}
                                </span>
                                <span className={automationStatus?.outgoingMessageWebhookEnabled ? "text-emerald-700 font-bold" : "text-amber-700 font-bold"}>
                                  {automationStatus?.outgoingMessageWebhookEnabled ? "Out: ON" : "Out: OFF"}
                                </span>
                              </div>
                            </div>
                            <div className="text-slate-700 break-all">
                              <span className="font-semibold text-slate-500">Registered URL:</span>{" "}
                              {automationStatus?.greenApiWebhookUrl || "(Not set in Green-API console)"}
                            </div>
                          </div>

                          {/* Supabase Cloud Table Status */}
                          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5 text-[11px]">
                            <div className="text-slate-500 font-bold text-xs flex items-center justify-between">
                              <span>Supabase Cloud Database:</span>
                              {automationStatus?.supabaseTableStatus === "ready" ? (
                                <span className="font-bold text-emerald-700 inline-flex items-center gap-1">
                                  <CheckCircle className="w-3 h-3" /> Table Ready (Persisted)
                                </span>
                              ) : automationStatus?.supabaseTableStatus === "missing_table" ? (
                                <span className="font-bold text-rose-700 inline-flex items-center gap-1">
                                  <AlertCircle className="w-3 h-3" /> Table "doctor_calls" Missing
                                </span>
                              ) : (
                                <span className="font-bold text-slate-600">Local Only</span>
                              )}
                            </div>
                            {automationStatus?.supabaseTableStatus === "missing_table" && (
                              <div className="flex items-center justify-between pt-1 border-t border-slate-200">
                                <span className="text-rose-700 font-medium">Create table in Supabase SQL editor:</span>
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(DOCTOR_CALLS_SQL);
                                    setCopiedSql(true);
                                    setTimeout(() => setCopiedSql(false), 3000);
                                  }}
                                  className="px-2 py-0.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10px] rounded transition-colors cursor-pointer"
                                >
                                  {copiedSql ? "Copied!" : "Copy SQL"}
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Groups Configured */}
                          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5 font-mono text-[11px]">
                            <div className="text-slate-500 font-sans font-bold text-xs">Group Routing:</div>
                            <div className="text-slate-700">
                              <span className="font-semibold text-slate-500">Monitored Group:</span>{" "}
                              {automationStatus?.sourceGroup || "(Accepts all configured groups)"}
                            </div>
                            <div className="text-slate-700">
                              <span className="font-semibold text-slate-500">Target Doctors Group:</span>{" "}
                              {automationStatus?.targetGroup || "(Not configured in .env)"}
                            </div>
                          </div>

                          {/* Webhook endpoint guidance */}
                          <div className="bg-slate-900 text-slate-200 p-3 rounded-xl font-mono text-[11px] space-y-2">
                            <div className="text-slate-400 font-sans font-bold text-xs flex items-center justify-between">
                              <span>Your App Webhook Endpoint:</span>
                              <button
                                onClick={handleConfigureWebhook}
                                disabled={isConfiguringWebhook}
                                className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-sans font-bold text-[10px] rounded transition-colors disabled:opacity-50 cursor-pointer"
                                title="Automatically register this URL into Green-API instance settings"
                              >
                                {isConfiguringWebhook ? "Configuring..." : "⚡ Auto-Set in Green-API"}
                              </button>
                            </div>
                            <div className="text-emerald-400 select-all break-all">
                              {window.location.origin}/api/whatsapp/webhook
                            </div>
                            <div className="text-slate-400 font-sans text-[10px]">
                              Click "Auto-Set" above or paste into your Green-API console under Webhook settings.
                            </div>
                          </div>

                          {automationStatus?.statusMessage && (
                            <div className="p-3 bg-emerald-50 rounded-xl text-emerald-900 border border-emerald-200 text-xs">
                              {automationStatus.statusMessage}
                            </div>
                          )}

                          {/* Live Webhook & Polling Activity Stream */}
                          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                              <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                <span>Live Ingestion Events ({auditLogs.length})</span>
                              </div>
                              <button
                                onClick={handlePollQueue}
                                disabled={isPollingQueue}
                                className="text-emerald-700 hover:text-emerald-800 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                              >
                                <RefreshCw className={`w-3 h-3 ${isPollingQueue ? "animate-spin" : ""}`} />
                                <span>Poll Now</span>
                              </button>
                            </div>
                            {auditLogs.length === 0 ? (
                              <div className="text-slate-400 italic text-[11px] py-1 bg-white p-2.5 rounded border border-slate-200 text-center">
                                No incoming events recorded yet. Post a call in WhatsApp or click "Poll Now"!
                              </div>
                            ) : (
                              <div className="max-h-36 overflow-y-auto space-y-1.5 font-mono text-[10px] pr-1">
                                {auditLogs.slice(0, 10).map((log) => (
                                  <div key={log.id} className="p-2 bg-white rounded border border-slate-200 space-y-0.5">
                                    <div className="flex items-center justify-between font-bold">
                                      <span className={log.handled ? "text-emerald-700" : "text-amber-700"}>
                                        {log.handled ? `✅ ${log.status}` : "⚠️ Skipped"}
                                      </span>
                                      <span className="text-slate-400 font-normal">{log.displayTime} ({log.source})</span>
                                    </div>
                                    {log.textSnippet && <div className="text-slate-600 truncate font-sans text-[11px]">{log.textSnippet}</div>}
                                    {log.reason && <div className="text-slate-500 font-sans italic text-[10px]">{log.reason}</div>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                          <button
                            onClick={handleSimulateCall}
                            disabled={isSimulatingCall}
                            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                            title="Simulate receiving an inpatient call through the pipeline"
                          >
                            {isSimulatingCall ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PhoneCall className="w-3.5 h-3.5" />}
                            <span>Simulate Call</span>
                          </button>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={handleSendTestMessage}
                              disabled={isSendingTestMessage}
                              className="px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                            >
                              {isSendingTestMessage ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Send className="w-3.5 h-3.5" />
                              )}
                              <span>Send Test Message</span>
                            </button>
                            <button
                              onClick={() => setShowStatusModal(false)}
                              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition-colors cursor-pointer"
                            >
                              Close
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Custom Doctor Call Dispatcher & Live Preview Modal */}
                  {showCustomCallModal && (
                    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
                      <div className="bg-white rounded-2xl max-w-5xl w-full border border-slate-200 shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
                        {/* Modal Header */}
                        <div className="px-6 py-4 bg-gradient-to-r from-[#063b30] to-[#0b5446] text-white flex items-center justify-between border-b border-emerald-900">
                          <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-emerald-500/20 text-emerald-300 rounded-xl border border-emerald-500/30">
                              <Send className="w-5 h-5" />
                            </div>
                            <div>
                              <h3 className="font-bold text-base text-white">Dispatch Custom Doctor Call</h3>
                              <p className="text-xs text-emerald-200/80">
                                Page attending physicians via WhatsApp group with live preview & monthly roster matching
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              setShowCustomCallModal(false);
                              setCustomCallSuccess(null);
                            }}
                            className="p-1.5 rounded-lg text-emerald-200 hover:text-white hover:bg-emerald-800/50 transition-colors cursor-pointer"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>

                        {/* Modal Body */}
                        <div className="overflow-y-auto p-5 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
                          {/* Form Parameters (Left Column) */}
                          <div className="lg:col-span-6 space-y-4">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                              <h4 className="font-bold text-xs uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                                <Hospital className="w-4 h-4 text-emerald-600" />
                                <span>Call Parameters</span>
                              </h4>
                              <span className="text-[11px] text-slate-400">* Required fields</span>
                            </div>

                            {/* Room / Bed Number */}
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">
                                Room / Bed Number <span className="text-rose-500">*</span>
                              </label>
                              <input
                                type="text"
                                placeholder="e.g. Room 409 or Bed 302"
                                value={customCallForm.room}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setCustomCallForm(prev => ({ ...prev, room: val }));
                                  fetchCustomCallPreview({ room: val });
                                }}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold focus:bg-white focus:border-emerald-600 focus:outline-hidden transition-colors"
                              />
                            </div>

                            {/* Specialty / Department Dropdown */}
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">
                                Medical Specialty / Department <span className="text-rose-500">*</span>
                              </label>
                              <select
                                value={customCallForm.department}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setCustomCallForm(prev => ({ ...prev, department: val }));
                                  fetchCustomCallPreview({ department: val });
                                }}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold focus:bg-white focus:border-emerald-600 focus:outline-hidden transition-colors"
                              >
                                {SPECIALTY_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.labelAr} - {opt.labelEn}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Date (Roster Date) */}
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                                <span>Roster Date (Monthly Sheet)</span>
                                <span className="text-[10px] text-emerald-700 font-normal">Exact day matching</span>
                              </label>
                              <input
                                type="date"
                                value={customCallForm.date}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setCustomCallForm(prev => ({ ...prev, date: val }));
                                  fetchCustomCallPreview({ date: val });
                                }}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold focus:bg-white focus:border-emerald-600 focus:outline-hidden transition-colors"
                              />
                              <p className="text-[10px] text-slate-400 mt-1">
                                Doctors are fetched from the 30-day cumulative monthly sheet for this exact date.
                              </p>
                            </div>

                            {/* Patient Info Grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                              <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">
                                  Patient Name
                                </label>
                                <input
                                  type="text"
                                  placeholder="e.g. مصطفى عبد الوهاب"
                                  value={customCallForm.patientName}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setCustomCallForm(prev => ({ ...prev, patientName: val }));
                                  }}
                                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:bg-white focus:border-emerald-600 focus:outline-hidden transition-colors"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">
                                  Patient Barcode / MRN
                                </label>
                                <input
                                  type="text"
                                  placeholder="e.g. 0000263656"
                                  value={customCallForm.patientBarcode}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setCustomCallForm(prev => ({ ...prev, patientBarcode: val }));
                                  }}
                                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:bg-white focus:border-emerald-600 focus:outline-hidden transition-colors font-mono"
                                />
                              </div>
                            </div>

                            {/* Physician & Requester Grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">
                                  Admitting Physician
                                </label>
                                <input
                                  type="text"
                                  placeholder="e.g. Dr. Akram Assem"
                                  value={customCallForm.admittingPhysician}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setCustomCallForm(prev => ({ ...prev, admittingPhysician: val }));
                                  }}
                                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:bg-white focus:border-emerald-600 focus:outline-hidden transition-colors"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">
                                  Caller / Nurse Name
                                </label>
                                <input
                                  type="text"
                                  placeholder="e.g. Ward Nurse / Ahmed"
                                  value={customCallForm.callerName}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setCustomCallForm(prev => ({ ...prev, callerName: val }));
                                  }}
                                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:bg-white focus:border-emerald-600 focus:outline-hidden transition-colors"
                                />
                              </div>
                            </div>

                            {/* Clinical Notes / Request Reason */}
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">
                                Clinical Request / Notes
                              </label>
                              <textarea
                                rows={2}
                                placeholder="e.g. المرور على الحالة بصورة عاجلة ومناظرة نتائج التحاليل"
                                value={customCallForm.notes}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setCustomCallForm(prev => ({ ...prev, notes: val }));
                                  fetchCustomCallPreview({ notes: val });
                                }}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:bg-white focus:border-emerald-600 focus:outline-hidden transition-colors"
                              />
                            </div>
                          </div>

                          {/* Live Preview Column (Right Column) */}
                          <div className="lg:col-span-6 space-y-4 flex flex-col justify-between">
                            <div className="space-y-4">
                              {/* 1. Matched Attending Doctors from Monthly Sheet */}
                              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2.5">
                                <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                                  <div className="flex items-center gap-1.5">
                                    <Users className="w-4 h-4 text-emerald-600" />
                                    <span>Attending Doctors on Duty ({customCallPreview?.matchingDoctors.length || 0})</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    {customCallPreview?.isOffShiftCoverage && (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-100 text-amber-800 border border-amber-300 font-semibold">
                                        Off-shift Coverage
                                      </span>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => fetchCustomCallPreview()}
                                      disabled={isLoadingPreview}
                                      className="text-emerald-700 hover:text-emerald-800 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                                      title="Refresh doctor matching"
                                    >
                                      <RefreshCw className={`w-3 h-3 ${isLoadingPreview ? "animate-spin" : ""}`} />
                                      <span>Refresh</span>
                                    </button>
                                  </div>
                                </div>

                                {isLoadingPreview ? (
                                  <div className="p-4 bg-white rounded-lg border border-slate-200 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                                    <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                                    <span>Matching doctors from monthly sheet...</span>
                                  </div>
                                ) : !customCallPreview || customCallPreview.matchingDoctors.length === 0 ? (
                                  <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-amber-900 text-xs space-y-1">
                                    <div className="font-bold flex items-center gap-1.5 text-amber-800">
                                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                                      <span>No doctor checked in for {customCallPreview?.canonicalDepartment || customCallForm.department}</span>
                                    </div>
                                    <p className="text-[11px] text-amber-700">
                                      No physician checked in on the monthly sheet for this specialty on {customCallForm.date}. You can still dispatch an alert to the group.
                                    </p>
                                  </div>
                                ) : (
                                  <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                                    {customCallPreview.matchingDoctors.map((doc) => {
                                      const isSelected = selectedCustomDoctorIds.length === 0 || selectedCustomDoctorIds.includes(String(doc.id));
                                      return (
                                        <div
                                          key={doc.id}
                                          className={`p-2.5 rounded-lg border transition-all text-xs flex items-center justify-between gap-2 ${
                                            isSelected
                                              ? "bg-white border-emerald-300 shadow-xs"
                                              : "bg-slate-100/70 border-slate-200 opacity-60"
                                          }`}
                                        >
                                          <div className="flex items-center gap-2 min-w-0">
                                            <input
                                              type="checkbox"
                                              checked={isSelected}
                                              onChange={(e) => {
                                                const checked = e.target.checked;
                                                let updated: string[];
                                                if (selectedCustomDoctorIds.length === 0) {
                                                  // currently all selected
                                                  if (!checked) {
                                                    updated = customCallPreview.matchingDoctors
                                                      .filter(d => String(d.id) !== String(doc.id))
                                                      .map(d => String(d.id));
                                                  } else {
                                                    updated = [];
                                                  }
                                                } else {
                                                  if (checked) {
                                                    updated = [...selectedCustomDoctorIds, String(doc.id)];
                                                  } else {
                                                    updated = selectedCustomDoctorIds.filter(id => id !== String(doc.id));
                                                  }
                                                }
                                                setSelectedCustomDoctorIds(updated);
                                                fetchCustomCallPreview(undefined, updated);
                                              }}
                                              className="rounded text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5 cursor-pointer"
                                            />
                                            <div className="min-w-0">
                                              <div className="font-bold text-slate-900 truncate flex items-center gap-1.5">
                                                <span>{doc.name}</span>
                                                {doc.arabicName && doc.arabicName !== doc.name && (
                                                  <span className="text-[11px] text-slate-500 font-normal truncate">
                                                    ({doc.arabicName})
                                                  </span>
                                                )}
                                              </div>
                                              <div className="text-[10px] text-slate-500 flex items-center gap-2 mt-0.5">
                                                <span className="inline-flex items-center gap-1"><Phone className="w-2.5 h-2.5" /> {doc.phone || "No phone"}</span>
                                                {doc.waPhone && (
                                                  <span className="text-emerald-700 font-mono font-bold">
                                                    @{doc.waPhone}
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                          </div>

                                          <div className="shrink-0 flex flex-col items-end gap-1">
                                            <div className="flex flex-wrap gap-1 justify-end">
                                              {(doc.shifts || []).map((sh: string) => (
                                                <span
                                                  key={sh}
                                                  className="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded text-[9px] font-semibold"
                                                >
                                                  {sh}
                                                </span>
                                              ))}
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>

                              {/* 2. WhatsApp Message Live Preview Box */}
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                                  <div className="flex items-center gap-1.5">
                                    <MessageSquare className="w-4 h-4 text-emerald-600" />
                                    <span>WhatsApp Group Message Preview</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => copyToClipboard(customCallForm.customMessage || customCallPreview?.formattedMessage || "", "WhatsApp message")}
                                      className="text-slate-600 hover:text-[#063b30] text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                                      title="Copy preview message"
                                    >
                                      <Copy className="w-3 h-3" />
                                      <span>Copy</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const next = !customCallForm.isEditingMessageText;
                                        setCustomCallForm(prev => ({
                                          ...prev,
                                          isEditingMessageText: next,
                                          customMessage: next ? (prev.customMessage || customCallPreview?.formattedMessage || "") : (customCallPreview?.formattedMessage || "")
                                        }));
                                      }}
                                      className="text-emerald-700 hover:text-emerald-800 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                                    >
                                      <Edit3 className="w-3 h-3" />
                                      <span>{customCallForm.isEditingMessageText ? "Reset to Template" : "Customize Message"}</span>
                                    </button>
                                  </div>
                                </div>

                                <div className="bg-slate-900 rounded-xl p-3 border border-slate-700 space-y-2 text-white">
                                  {customCallForm.isEditingMessageText ? (
                                    <textarea
                                      rows={7}
                                      value={customCallForm.customMessage}
                                      onChange={(e) => setCustomCallForm(prev => ({ ...prev, customMessage: e.target.value }))}
                                      className="w-full bg-slate-950 text-emerald-300 font-mono text-xs p-2.5 rounded-lg border border-slate-700 focus:outline-hidden focus:border-emerald-500"
                                      placeholder="Type your custom WhatsApp message here..."
                                    />
                                  ) : (
                                    <pre className="text-emerald-300 font-mono text-[11px] whitespace-pre-wrap select-all max-h-44 overflow-y-auto leading-relaxed">
                                      {customCallForm.customMessage || customCallPreview?.formattedMessage || "Enter a room number to preview the message..."}
                                    </pre>
                                  )}

                                  <div className="flex items-center justify-between pt-1 border-t border-slate-800 text-[10px] text-slate-400">
                                    <span>Target Group: {automationStatus?.targetGroup || "Configured WhatsApp Group"}</span>
                                    <span>Markdown & Mentions Enabled</span>
                                  </div>
                                </div>
                              </div>

                              {/* Success Feedback Banner */}
                              {customCallSuccess && (
                                <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-950 rounded-xl text-xs flex items-center justify-between gap-2 shadow-xs">
                                  <div className="flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                                    <span className="font-semibold">{customCallSuccess}</span>
                                  </div>
                                  <button
                                    onClick={() => setCustomCallSuccess(null)}
                                    className="text-emerald-700 hover:text-emerald-900 p-1"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                          <div className="text-xs text-slate-500">
                            {!customCallForm.room.trim() ? (
                              <span className="text-amber-700 font-medium flex items-center gap-1">
                                <AlertCircle className="w-3.5 h-3.5" />
                                Please specify a Room or Bed number
                              </span>
                            ) : (
                              <span className="text-emerald-700 font-medium flex items-center gap-1">
                                <CheckCircle className="w-3.5 h-3.5" />
                                Ready to page physicians for Room {customCallForm.room}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setShowCustomCallModal(false);
                                setCustomCallSuccess(null);
                              }}
                              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-lg transition-colors cursor-pointer"
                            >
                              Close
                            </button>

                            <button
                              type="button"
                              onClick={handleSendCustomCall}
                              disabled={!customCallForm.room.trim() || isSendingCustomCall}
                              className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-lg transition-all flex items-center gap-2 shadow-sm hover:shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {isSendingCustomCall ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  <span>Sending to WhatsApp...</span>
                                </>
                              ) : (
                                <>
                                  <Send className="w-4 h-4 text-emerald-200" />
                                  <span>Confirm & Send Alert</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Action Feedback Toast */}
                  {callActionFeedback && (
                    <div className={`p-4 rounded-xl border text-xs flex items-center justify-between gap-3 shadow-sm ${
                      callActionFeedback.success
                        ? "bg-emerald-50 text-emerald-900 border-emerald-200"
                        : "bg-rose-50 text-rose-900 border-rose-200"
                    }`}>
                      <div className="flex items-center gap-2">
                        {callActionFeedback.success ? (
                          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                        )}
                        <span className="font-medium">{callActionFeedback.message}</span>
                      </div>
                      <button
                        onClick={() => setCallActionFeedback(null)}
                        className="text-slate-400 hover:text-slate-600 p-1"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {/* 3 KPI Metric Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-white rounded-xl border border-[#cbdad5] p-5 shadow-sm flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Calls Recorded</p>
                        <h4 className="text-2xl font-black text-slate-900 mt-1">{doctorCalls.length}</h4>
                      </div>
                      <div className="p-3 bg-slate-100 rounded-xl text-slate-700">
                        <Phone className="w-5 h-5" />
                      </div>
                    </div>

                    <div className="bg-white rounded-xl border border-[#cbdad5] p-5 shadow-sm flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Dispatched to Doctor</p>
                        <h4 className="text-2xl font-black text-emerald-700 mt-1">
                          {doctorCalls.filter(c => c.status === "dispatched").length}
                        </h4>
                      </div>
                      <div className="p-3 bg-emerald-50 rounded-xl text-emerald-700 border border-emerald-100">
                        <CheckCircle className="w-5 h-5" />
                      </div>
                    </div>

                    <div className="bg-white rounded-xl border border-[#cbdad5] p-5 shadow-sm flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">No Doctor Present</p>
                        <h4 className="text-2xl font-black text-amber-600 mt-1">
                          {doctorCalls.filter(c => c.status === "no_doctor_present").length}
                        </h4>
                      </div>
                      <div className="p-3 bg-amber-50 rounded-xl text-amber-600 border border-amber-100">
                        <AlertTriangle className="w-5 h-5" />
                      </div>
                    </div>
                  </div>

                  {/* Filters & Search Control Bar */}
                  <div className="bg-white rounded-xl border border-[#cbdad5] p-4 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-3 flex-1">
                      {/* Date Filter */}
                      <div className="flex items-center gap-1.5">
                        <label className="text-xs font-bold text-slate-600">Date:</label>
                        <input
                          type="date"
                          value={callsDateFilter}
                          onChange={(e) => setCallsDateFilter(e.target.value)}
                          className="px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setCallsDateFilter("")}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                            callsDateFilter === ""
                              ? "bg-[#063b30] text-white border-[#063b30]"
                              : "bg-slate-50 text-slate-600 border-slate-300 hover:bg-slate-100"
                          }`}
                        >
                          All Dates
                        </button>
                        <button
                          type="button"
                          onClick={() => setCallsDateFilter(getHospitalDutyDateClient())}
                          className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-slate-50 text-slate-600 border border-slate-300 hover:bg-slate-100 transition-colors cursor-pointer"
                        >
                          Today
                        </button>
                      </div>

                      {/* Search Bar */}
                      <div className="relative flex-1 min-w-[200px]">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                        <input
                          type="text"
                          value={callsSearch}
                          onChange={(e) => setCallsSearch(e.target.value)}
                          placeholder="Search room, patient, doctor, barcode..."
                          className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Department Filter */}
                      <select
                        value={callsDeptFilter}
                        onChange={(e) => setCallsDeptFilter(e.target.value)}
                        className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none cursor-pointer"
                      >
                        <option value="All">All Specialties</option>
                        {CANONICAL_SPECIALTIES.map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>

                      {/* Status Filter */}
                      <select
                        value={callsStatusFilter}
                        onChange={(e) => setCallsStatusFilter(e.target.value)}
                        className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none cursor-pointer"
                      >
                        <option value="All">All Statuses</option>
                        <option value="dispatched">Dispatched</option>
                        <option value="no_doctor_present">No Doctor Present</option>
                        <option value="failed">Failed</option>
                      </select>
                    </div>
                  </div>

                  {/* Doctor Calls Table */}
                  <div className="bg-white rounded-xl border border-[#cbdad5] shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-[#f0f6f4] border-b border-[#cbdad5] text-slate-700 font-bold uppercase tracking-wider text-[11px]">
                          <tr>
                            <th className="py-3 px-4">Time</th>
                            <th className="py-3 px-4">Room & Bed</th>
                            <th className="py-3 px-4">Specialty</th>
                            <th className="py-3 px-4">Patient Information</th>
                            <th className="py-3 px-4">Assigned / Mentioned Doctor</th>
                            <th className="py-3 px-4">Status</th>
                            <th className="py-3 px-4 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {loadingDoctorCalls && doctorCalls.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="p-0">
                                <TableSkeleton rows={5} cols={7} />
                              </td>
                            </tr>
                          ) : doctorCalls.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="py-6">
                                <EmptyState
                                  icon={PhoneCall}
                                  title="No Doctor Calls Recorded"
                                  description={
                                    callsDateFilter || callsSearch || callsDeptFilter !== "All" || callsStatusFilter !== "All"
                                      ? "No recorded calls match current filter criteria."
                                      : "Incoming calls from WhatsApp group matching \"Category: DoctorCall\" will automatically appear here."
                                  }
                                  actionLabel={
                                    callsDateFilter || callsSearch || callsDeptFilter !== "All" || callsStatusFilter !== "All"
                                      ? "Show All Calls"
                                      : undefined
                                  }
                                  onAction={() => {
                                    setCallsDateFilter("");
                                    setCallsSearch("");
                                    setCallsDeptFilter("All");
                                    setCallsStatusFilter("All");
                                  }}
                                />
                              </td>
                            </tr>
                          ) : (
                            doctorCalls.map((call) => {
                              const createdDate = new Date(call.createdAt);
                              const timeStr = isNaN(createdDate.getTime()) ? call.createdAt : createdDate.toLocaleTimeString("en-US", {
                                hour: "2-digit",
                                minute: "2-digit",
                                hour12: true
                              });

                              return (
                                <tr key={call.id} className="hover:bg-slate-50/80 transition-colors">
                                  {/* Time */}
                                  <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                                    <div className="font-bold text-slate-800">{timeStr}</div>
                                    <div className="text-[10px] text-slate-400">{call.callDate}</div>
                                  </td>

                                  {/* Room */}
                                  <td className="py-3 px-4">
                                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-black bg-emerald-50 text-emerald-900 border border-emerald-200 font-mono shadow-2xs">
                                      Room {call.room}
                                    </span>
                                  </td>

                                  {/* Specialty */}
                                  <td className="py-3 px-4">
                                    <div className="font-bold text-slate-800">{call.department}</div>
                                    {call.rawDepartment && call.rawDepartment !== call.department && (
                                      <div className="text-[10px] text-slate-400 font-arabic">{call.rawDepartment}</div>
                                    )}
                                  </td>

                                  {/* Patient */}
                                  <td className="py-3 px-4">
                                    <div className="font-bold text-slate-900">{call.patientName}</div>
                                    <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1.5 mt-0.5">
                                      <span>ID: {call.patientBarcode}</span>
                                      {call.admittingPhysician && call.admittingPhysician !== "N/A" && (
                                        <span>• Adm: {call.admittingPhysician}</span>
                                      )}
                                    </div>
                                    {call.callerName && call.callerName !== "N/A" && (
                                      <div className="text-[10px] text-slate-400">By: {call.callerName}</div>
                                    )}
                                  </td>

                                  {/* Dispatched Doctors */}
                                  <td className="py-3 px-4">
                                    {call.dispatchedDoctors && call.dispatchedDoctors.length > 0 ? (
                                      <div className="space-y-1">
                                        {call.dispatchedDoctors.map((doc: any, dIdx: number) => (
                                          <div key={dIdx} className="flex items-center gap-1.5">
                                            <span className="font-bold text-slate-800">{doc.name}</span>
                                            {doc.phone && (
                                              <span className="font-mono text-[10px] text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                                {doc.phone}
                                              </span>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="text-amber-600 italic text-[11px] font-medium flex items-center gap-1">
                                        <AlertTriangle className="w-3 h-3 shrink-0" />
                                        No doctor checked in
                                      </span>
                                    )}
                                  </td>

                                  {/* Status Badge */}
                                  <td className="py-3 px-4 whitespace-nowrap">
                                    {call.status === "dispatched" ? (
                                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                        <Check className="w-3 h-3 text-emerald-700" />
                                        Dispatched
                                      </span>
                                    ) : call.status === "no_doctor_present" ? (
                                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                        <AlertTriangle className="w-3 h-3 text-amber-600" />
                                        No Doctor Present
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                                        <AlertCircle className="w-3 h-3 text-rose-600" />
                                        Failed
                                      </span>
                                    )}
                                  </td>

                                  {/* Actions */}
                                  <td className="py-3 px-4 text-center whitespace-nowrap">
                                    <button
                                      onClick={() => handleRedispatchCall(call.id)}
                                      disabled={redispatchingCallId === call.id}
                                      className="px-2.5 py-1.5 bg-[#063b30] hover:bg-[#042d24] text-white text-[11px] font-bold rounded-lg transition-colors inline-flex items-center gap-1.5 shadow-xs disabled:opacity-50 cursor-pointer"
                                      title="Re-check active doctors and re-send alert to WhatsApp group"
                                    >
                                      {redispatchingCallId === call.id ? (
                                        <>
                                          <Loader2 className="w-3 h-3 animate-spin" />
                                          <span>Sending...</span>
                                        </>
                                      ) : (
                                        <>
                                          <Send className="w-3 h-3" />
                                          <span>Re-dispatch</span>
                                        </>
                                      )}
                                    </button>
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
              ) : adminTab === "prayer" ? (
                /* ======================================================= */
                /*             PRAYER TIMES WHATSAPP AUTOMATION TAB         */
                /* ======================================================= */
                <div className="space-y-6">
                  {/* Top Header Banner */}
                  <div className="bg-white rounded-xl border border-[#cbdad5] p-5 shadow-sm">
                    <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="p-3 bg-[#e6f2ee] text-[#063b30] rounded-xl border border-emerald-200">
                          <Moon className="w-6 h-6" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-lg font-bold text-slate-900">Alexandria Prayer Times WhatsApp Automation</h3>
                            {prayerStatus?.isPaused ? (
                              <span className="bg-amber-100 text-amber-900 text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border border-amber-300 flex items-center gap-1.5 shadow-2xs">
                                <Pause className="w-2.5 h-2.5 text-amber-600 fill-current" />
                                Automation Paused
                              </span>
                            ) : (
                              <span className="bg-emerald-100 text-[#063b30] text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1.5 shadow-2xs">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                Automation Active
                              </span>
                            )}
                            {prayerStatus?.enabled ? (
                              <span className="bg-emerald-50 text-emerald-800 text-[10px] font-mono font-bold px-2 py-0.5 rounded border border-emerald-300">
                                Feature Flag: ON
                              </span>
                            ) : (
                              <span className="bg-slate-100 text-slate-600 text-[10px] font-mono px-2 py-0.5 rounded border border-slate-300">
                                Feature Flag: OFF
                              </span>
                            )}
                            {(() => {
                              const nextPrayer = getNextAlexandriaPrayer();
                              if (!nextPrayer) return null;
                              const h = Math.floor(nextPrayer.minutesLeft / 60);
                              const m = nextPrayer.minutesLeft % 60;
                              const countdownStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
                              return (
                                <span className="bg-[#063b30] text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1.5 font-mono tabular-nums">
                                  <Clock className="w-3 h-3 text-emerald-300" />
                                  <span>Next: {nextPrayer.key} in {countdownStr}</span>
                                </span>
                              );
                            })()}
                          </div>
                          <p className="text-xs text-slate-500 mt-1">
                            Pre-fetches Alexandria weekly prayer schedule each Friday at 06:00 AM (Africa/Cairo) and broadcasts azan alerts in 12-hour format.
                          </p>
                        </div>
                      </div>

                      {/* Top Action Controls */}
                      <div className="flex items-center gap-2 flex-wrap w-full lg:w-auto">
                        {/* PAUSE / RESUME BUTTON */}
                        <button
                          onClick={handleTogglePrayerPause}
                          disabled={isTogglingPrayerPause}
                          title={prayerStatus?.isPaused ? "Resume automated prayer notifications" : "Pause all automated prayer notifications"}
                          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-2 cursor-pointer ${
                            prayerStatus?.isPaused
                              ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-700/20"
                              : "bg-amber-600 hover:bg-amber-700 text-white shadow-amber-700/20"
                          }`}
                        >
                          {isTogglingPrayerPause ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : prayerStatus?.isPaused ? (
                            <Play className="w-4 h-4 fill-current" />
                          ) : (
                            <Pause className="w-4 h-4 fill-current" />
                          )}
                          <span>{prayerStatus?.isPaused ? "Resume Automation" : "Pause Automation"}</span>
                        </button>

                        {/* FETCH TIMES NOW BUTTON */}
                        <button
                          onClick={handleTriggerPrayerFetch}
                          disabled={isTriggeringPrayerFetch}
                          title="Pre-fetch Alexandria Egypt prayer times for the upcoming week from Aladhan API"
                          className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-all border border-slate-300 flex items-center gap-2 cursor-pointer"
                        >
                          <RefreshCw className={`w-4 h-4 ${isTriggeringPrayerFetch ? "animate-spin text-emerald-600" : "text-slate-600"}`} />
                          <span>{isTriggeringPrayerFetch ? "Fetching..." : "Fetch Upcoming Week"}</span>
                        </button>

                        {/* SEND TEST MESSAGE BUTTON */}
                        <button
                          onClick={handleSendPrayerTest}
                          disabled={isSendingPrayerTest}
                          title="Send a sample [TEST] notification formatted in 12-hour Arabic to WhatsApp group"
                          className="px-3.5 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-[#063b30] rounded-xl text-xs font-bold transition-all border border-emerald-300 flex items-center gap-2 cursor-pointer"
                        >
                          {isSendingPrayerTest ? (
                            <Loader2 className="w-4 h-4 animate-spin text-[#063b30]" />
                          ) : (
                            <Send className="w-4 h-4 text-emerald-600" />
                          )}
                          <span>{isSendingPrayerTest ? "Sending..." : "Send Test to WhatsApp"}</span>
                        </button>

                        {/* REFRESH STATUS */}
                        <button
                          onClick={fetchPrayerStatus}
                          disabled={loadingPrayerStatus}
                          className="p-2.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl transition-all border border-slate-200 cursor-pointer"
                          title="Refresh status"
                        >
                          <RefreshCw className={`w-4 h-4 ${loadingPrayerStatus ? "animate-spin text-[#063b30]" : ""}`} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* PAUSED WARNING BANNER */}
                  {prayerStatus?.isPaused && (
                    <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 flex items-start gap-3 shadow-xs">
                      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <h4 className="text-sm font-bold text-amber-900">Prayer Time Automation is Paused</h4>
                        <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                          All automated prayer-time fetching and per-minute azan WhatsApp notifications are currently suspended.
                          Incoming check-ins and doctor calls are unaffected. Click <strong>Resume Automation</strong> when ready to restart notifications.
                        </p>
                      </div>
                      <button
                        onClick={handleTogglePrayerPause}
                        disabled={isTogglingPrayerPause}
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shrink-0 transition-colors cursor-pointer"
                      >
                        Resume Now
                      </button>
                    </div>
                  )}

                  {/* FEEDBACK ALERT */}
                  {prayerActionFeedback && (
                    <div
                      className={`p-4 rounded-xl border flex items-center justify-between text-xs font-semibold ${
                        prayerActionFeedback.type === "success"
                          ? "bg-emerald-50 text-emerald-900 border-emerald-300"
                          : "bg-rose-50 text-rose-900 border-rose-300"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {prayerActionFeedback.type === "success" ? (
                          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                        )}
                        <span>{prayerActionFeedback.message}</span>
                      </div>
                      <button
                        onClick={() => setPrayerActionFeedback(null)}
                        className="text-slate-400 hover:text-slate-700 p-1"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {/* DIAGNOSTIC / METRIC STAT CARDS */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Card 1: Cairo Time */}
                    <div className="bg-white rounded-xl border border-[#cbdad5] p-4 shadow-sm">
                      <div className="flex items-center justify-between text-slate-500 mb-2">
                        <span className="text-xs font-bold uppercase tracking-wider">Cairo Time (DST-Safe)</span>
                        <Clock className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div className="text-2xl font-bold font-mono text-slate-900">
                        {prayerStatus?.cairo_time || "--:--:--"}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        Africa/Cairo • {prayerStatus?.today?.date || "Today"}
                      </div>
                    </div>

                    {/* Card 2: Location & Calculation Method */}
                    <div className="bg-white rounded-xl border border-[#cbdad5] p-4 shadow-sm">
                      <div className="flex items-center justify-between text-slate-500 mb-2">
                        <span className="text-xs font-bold uppercase tracking-wider">Target City</span>
                        <Moon className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div className="text-xl font-bold text-slate-900">
                        Alexandria, Egypt
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        Method 5 (Egyptian General Survey)
                      </div>
                    </div>

                    {/* Card 3: Pre-fetched Days Cached */}
                    <div className="bg-white rounded-xl border border-[#cbdad5] p-4 shadow-sm">
                      <div className="flex items-center justify-between text-slate-500 mb-2">
                        <span className="text-xs font-bold uppercase tracking-wider">Advance Schedule</span>
                        <CalendarDays className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div className="text-2xl font-bold font-mono text-slate-900">
                        {prayerStatus?.upcoming_days_cached ?? 0} <span className="text-sm font-normal text-slate-500">Days Cached</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        Weekly fetch Fridays @ 06:00 AM
                      </div>
                    </div>

                    {/* Card 4: WhatsApp Destination */}
                    <div className="bg-white rounded-xl border border-[#cbdad5] p-4 shadow-sm">
                      <div className="flex items-center justify-between text-slate-500 mb-2">
                        <span className="text-xs font-bold uppercase tracking-wider">WhatsApp Groups</span>
                        <Phone className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div className="text-xl font-bold text-slate-900">
                        {(prayerStatus?.selected_groups ?? []).length} of {prayerStatus?.configured_groups_count || 3} Active
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1 truncate" title="Customizable below">
                        {(prayerStatus?.selected_groups ?? []).length === 0 ? "All groups excluded" : "Selected groups receiving azan"}
                      </div>
                    </div>
                  </div>

                  {/* WHATSAPP TARGET GROUPS MULTI-SELECTION CARD */}
                  <div className="bg-white rounded-xl border border-[#cbdad5] p-5 shadow-sm space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                            <MessageSquare className="w-4 h-4 text-[#063b30]" />
                            <span>Target WhatsApp Groups Dispatch Selection</span>
                          </h4>
                          <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-100 text-[#063b30] border border-emerald-300 shadow-2xs">
                            {(prayerStatus?.selected_groups || []).length} of {(prayerStatus?.available_groups || []).length || 3} Groups Active
                          </span>
                          {isUpdatingPrayerGroups && (
                            <span className="text-[10px] text-emerald-700 flex items-center gap-1 font-semibold animate-pulse">
                              <Loader2 className="w-3 h-3 animate-spin" /> Saving...
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          Select which of the hospital groups receive the azan notifications. Unmarking a group excludes it from automated and test broadcasts.
                        </p>
                      </div>

                      {/* Quick Select All / Deselect All */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleSelectAllPrayerGroups(true)}
                          disabled={isUpdatingPrayerGroups}
                          className="px-3 py-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg transition-colors cursor-pointer"
                        >
                          Select All
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSelectAllPrayerGroups(false)}
                          disabled={isUpdatingPrayerGroups}
                          className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors cursor-pointer"
                        >
                          Deselect All
                        </button>
                      </div>
                    </div>

                    {/* Groups Grid with Multiple Selection */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {(prayerStatus?.available_groups && prayerStatus.available_groups.length > 0
                        ? prayerStatus.available_groups
                        : [
                            { id: "Group 1", name: "Hospital WhatsApp Group #1", sourceEnv: "WHATSAPP_GROUP_ID" },
                            { id: "Group 2", name: "Hospital WhatsApp Group #2", sourceEnv: "WHATSAPP_GROUP_ID" },
                            { id: "Group 3", name: "Hospital WhatsApp Group #3", sourceEnv: "WHATSAPP_GROUP_ID" },
                          ]
                      ).map((group, idx) => {
                        const isSelected = (prayerStatus?.selected_groups ?? []).includes(group.id);

                        return (
                          <div
                            key={group.id}
                            onClick={() => handleTogglePrayerGroup(group.id)}
                            className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                              isSelected
                                ? "bg-[#f0f9f5] border-[#063b30]/50 shadow-xs"
                                : "bg-slate-50/80 border-slate-200 opacity-60 hover:opacity-100 hover:bg-slate-100"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2.5 pointer-events-none select-none">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  readOnly
                                  className="w-4 h-4 rounded text-[#063b30] focus:ring-[#063b30] border-slate-300 accent-[#063b30] pointer-events-none"
                                />
                                <span className="font-bold text-slate-900 text-xs">
                                  {group.name || `WhatsApp Group #${idx + 1}`}
                                </span>
                              </div>

                              {isSelected ? (
                                <span className="text-[10px] font-bold text-emerald-900 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300 shrink-0 inline-flex items-center gap-1">
                                  <CheckCircle className="w-3 h-3 text-emerald-700" /> INCLUDED
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold text-slate-600 bg-slate-200 px-2 py-0.5 rounded-full border border-slate-300 shrink-0 inline-flex items-center gap-1">
                                  <Ban className="w-3 h-3 text-slate-500" /> EXCLUDED
                                </span>
                              )}
                            </div>

                            <div className="text-[11px] font-mono text-slate-700 truncate bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 shadow-2xs">
                              {group.id}
                            </div>

                            <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                              <span className="text-[10px] text-slate-400 font-mono">
                                {group.sourceEnv}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleTestSpecificPrayerGroup(group.id);
                                }}
                                disabled={testingGroupId === group.id}
                                className="text-[10px] font-bold text-emerald-800 hover:text-emerald-950 flex items-center gap-1 hover:underline cursor-pointer"
                                title={`Send test notification specifically to ${group.id}`}
                              >
                                {testingGroupId === group.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin text-[#063b30]" />
                                ) : (
                                  <Send className="w-3 h-3 text-emerald-600" />
                                )}
                                <span>Test Group</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {(prayerStatus?.selected_groups ?? []).length === 0 && (
                      <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>
                          <strong>All groups are currently excluded:</strong> No WhatsApp messages will be sent at prayer times until you mark at least one group above.
                        </span>
                      </div>
                    )}
                  </div>

                  {/* TODAY'S PRAYER SCHEDULE & NOTIFICATION STATUS */}
                  <div className="bg-white rounded-xl border border-[#cbdad5] overflow-hidden shadow-sm">
                    <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-[#f8faf9]">
                      <div>
                        <h4 className="font-bold text-slate-900 text-base">
                          Today's Alexandria Prayer Schedule
                        </h4>
                        <p className="text-xs text-slate-500">
                          Times in 12-hour format with Arabic period markers (ص / م) and delivery status
                        </p>
                      </div>
                      <span className="text-xs font-mono font-bold px-3 py-1 bg-white rounded-lg border border-slate-200 text-slate-700 shadow-2xs inline-flex items-center gap-1.5">
                        <CalendarDays className="w-3.5 h-3.5 text-[#063b30]" />
                        <span>{prayerStatus?.today?.date || "Today"}</span>
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50/75 border-b border-slate-200 text-slate-600 uppercase font-semibold">
                          <tr>
                            <th className="py-3 px-4">Prayer (الصلاة)</th>
                            <th className="py-3 px-4">Identifier</th>
                            <th className="py-3 px-4">Scheduled Time (12-Hour)</th>
                            <th className="py-3 px-4">24-Hour</th>
                            <th className="py-3 px-4">WhatsApp Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"].map((prayerKey) => {
                            const info = PRAYER_DISPLAY_MAP[prayerKey] || { ar: prayerKey, en: prayerKey, Icon: Moon };
                            const PrayerIcon = info.Icon;
                            const timeRecord = prayerStatus?.today?.times?.find((t) => t.prayer === prayerKey);
                            const notifRecord = prayerStatus?.today?.notifications?.find((n) => n.prayer === prayerKey);

                            const time24 = timeRecord?.prayer_time ? String(timeRecord.prayer_time).substring(0, 5) : "--:--";
                            const time12 = timeRecord?.prayer_time ? formatPrayer12Hour(timeRecord.prayer_time) : "--:--";

                            // Determine if this prayer was already earlier today (past scheduled minute + 2m tolerance)
                            const isPastPrayer = (() => {
                              if (!timeRecord?.prayer_time || !prayerStatus?.cairo_time) return false;
                              const [cH, cM] = prayerStatus.cairo_time.split(":").map((v) => parseInt(v, 10));
                              const [pH, pM] = timeRecord.prayer_time.split(":").map((v) => parseInt(v, 10));
                              if (isNaN(cH) || isNaN(pH)) return false;
                              return cH * 60 + cM > pH * 60 + pM + 2;
                            })();

                            return (
                              <tr key={prayerKey} className="hover:bg-slate-50/80 transition-colors">
                                <td className="py-3.5 px-4 font-bold text-slate-900 text-sm flex items-center gap-2">
                                  <PrayerIcon className="w-4 h-4 text-[#084c3e]" />
                                  <span>{info.ar}</span>
                                </td>
                                <td className="py-3.5 px-4 font-mono text-slate-600 font-semibold">
                                  {info.en}
                                </td>
                                <td className="py-3.5 px-4 font-bold text-emerald-800 text-sm font-mono">
                                  {time12}
                                </td>
                                <td className="py-3.5 px-4 font-mono text-slate-500">
                                  {time24}
                                </td>
                                <td className="py-3.5 px-4">
                                  {prayerStatus?.isPaused ? (
                                    <span className="bg-amber-100 text-amber-900 font-bold px-2.5 py-1 rounded-full text-[11px] inline-flex items-center gap-1 border border-amber-300">
                                      <Pause className="w-3 h-3 text-amber-600" />
                                      Paused
                                    </span>
                                  ) : notifRecord?.status === "sent" ? (
                                    <span className="bg-emerald-100 text-[#063b30] font-bold px-2.5 py-1 rounded-full text-[11px] inline-flex items-center gap-1 border border-emerald-300">
                                      <CheckCircle className="w-3 h-3 text-emerald-600" />
                                      Sent {notifRecord.sent_at ? `(${new Date(notifRecord.sent_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Cairo" })})` : ""}
                                    </span>
                                  ) : notifRecord?.status === "sending" ? (
                                    <span className="bg-blue-100 text-blue-900 font-bold px-2.5 py-1 rounded-full text-[11px] inline-flex items-center gap-1 border border-blue-300">
                                      <Loader2 className="w-3 h-3 animate-spin text-blue-600" />
                                      Sending...
                                    </span>
                                  ) : notifRecord?.status === "skipped" ? (
                                    <span className="bg-amber-50 text-amber-800 font-semibold px-2.5 py-1 rounded-full text-[11px] inline-flex items-center gap-1 border border-amber-200">
                                      <AlertTriangle className="w-3 h-3 text-amber-500" />
                                      Excluded
                                    </span>
                                  ) : isPastPrayer ? (
                                    <span className="bg-slate-100 text-slate-500 font-medium px-2.5 py-1 rounded-full text-[11px] inline-flex items-center gap-1 border border-slate-200">
                                      <Check className="w-3 h-3 text-slate-400" />
                                      Past
                                    </span>
                                  ) : (
                                    <span className="bg-emerald-50 text-emerald-800 font-bold px-2.5 py-1 rounded-full text-[11px] inline-flex items-center gap-1 border border-emerald-200">
                                      <Clock className="w-3 h-3 text-emerald-600" />
                                      Scheduled
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* BOTTOM ROW: MESSAGE PREVIEW & DATABASE INFO */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Live WhatsApp Message Template Preview */}
                    <div className="bg-white rounded-xl border border-[#cbdad5] p-5 shadow-sm space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                          <MessageSquare className="w-4 h-4 text-[#063b30]" />
                          <span>WhatsApp Notification Preview (12h Format)</span>
                        </h4>
                        <span className="text-[10px] uppercase font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          Exact Arabic Text
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">
                        Sent to the hospital WhatsApp group at the scheduled minute with 0 to +2 minute tolerance:
                      </p>
                      <div className="bg-[#e7f7ee] border border-emerald-300 rounded-xl p-4 font-sans text-slate-900 text-sm leading-relaxed shadow-inner">
                        <div className="text-right" dir="rtl">
                          <p className="font-bold text-slate-900 text-base">🕌 حان الآن موعد أذان الظهر بتوقيت الإسكندرية</p>
                          <p className="font-bold text-emerald-900 text-base mt-1 font-mono">🕐 12:44 م</p>
                        </div>
                      </div>
                      <div className="text-[11px] text-slate-500 space-y-1">
                        <p>• <strong>Fajr:</strong> <code>🕌 حان الآن موعد أذان الفجر بتوقيت الإسكندرية</code></p>
                        <p>• <strong>Dhuhr:</strong> <code>🕌 حان الآن موعد أذان الظهر بتوقيت الإسكندرية</code></p>
                        <p>• <strong>Asr:</strong> <code>🕌 حان الآن موعد أذان العصر بتوقيت الإسكندرية</code></p>
                        <p>• <strong>Maghrib:</strong> <code>🕌 حان الآن موعد أذان المغرب بتوقيت الإسكندرية</code></p>
                        <p>• <strong>Isha:</strong> <code>🕌 حان الآن موعد أذان العشاء بتوقيت الإسكندرية</code></p>
                      </div>
                    </div>

                    {/* Supabase Schema & Verification */}
                    <div className="bg-white rounded-xl border border-[#cbdad5] p-5 shadow-sm space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                          <Database className="w-4 h-4 text-emerald-600" />
                          <span>Supabase Tables Setup</span>
                        </h4>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(PRAYER_MIGRATION_SQL);
                            setCopiedPrayerSql(true);
                            setTimeout(() => setCopiedPrayerSql(false), 2500);
                          }}
                          className="px-3 py-1 bg-[#063b30] hover:bg-[#084e40] text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                        >
                          {copiedPrayerSql ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-300" />
                              <span>Copied SQL!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy Migration SQL</span>
                            </>
                          )}
                        </button>
                      </div>
                      <p className="text-xs text-slate-500">
                        The feature uses two dedicated tables in Supabase with atomic row-locking & RLS:
                      </p>
                      <ul className="text-xs text-slate-600 space-y-1.5 font-mono bg-slate-50 p-3 rounded-lg border border-slate-200">
                        <li>• <strong>prayer_times:</strong> Stores weekly pre-fetched Alexandria times</li>
                        <li>• <strong>prayer_notifications:</strong> Tracks atomic dispatch & deduplication</li>
                      </ul>
                      <p className="text-[11px] text-slate-500">
                        To apply the tables in Supabase, click <strong>Copy Migration SQL</strong> and run it in the Supabase SQL Editor.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                /* ======================================================= */
                /*               ACTIVE ROSTER & OPERATIONS TAB            */
                /* ======================================================= */
                <div className="space-y-6">
                  {/* Historical & Date-Specific Roster Selector Bar */}
                  <div className={`rounded-xl border p-5 shadow-sm transition-all ${
                    rosterDateFilter
                      ? "bg-amber-50/90 border-amber-300"
                      : "bg-white border-[#cbdad5]"
                  }`}>
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      <div className="flex items-start sm:items-center gap-3.5">
                        <div className={`p-3 rounded-xl shrink-0 ${
                          rosterDateFilter
                            ? "bg-amber-500 text-white shadow-xs"
                            : "bg-[#063b30] text-white shadow-xs"
                        }`}>
                          <CalendarDays className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border bg-white text-[#063b30] border-[#cbdad5]">
                              {rosterDateFilter ? "HISTORICAL / DATE SHEET EDITOR" : "LIVE TODAY ROSTER"}
                            </span>
                            {rosterDateFilter && (
                              <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-200/80 text-amber-950 border border-amber-400">
                                Viewing Date: {rosterDateFilter}
                              </span>
                            )}
                            {!rosterDateFilter && activeTodaySheetDate && (
                              <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                Active Sheet Date: {activeTodaySheetDate}
                              </span>
                            )}
                          </div>
                          <h3 className="text-base font-extrabold text-slate-900 mt-1">
                            {rosterDateFilter
                              ? (() => {
                                  const matched = rosterDatesList.find((d) => d.date === rosterDateFilter);
                                  return matched
                                    ? `Editing Sheet for ${matched.englishWeekday} (${matched.arabicWeekday}) — ${matched.formattedDate}`
                                    : `Editing Sheet for Date ${rosterDateFilter}`;
                                })()
                              : "Live Active Physician Roster & Previous Date Sheet Editor"}
                          </h3>
                          <p className="text-xs text-slate-600 font-medium mt-0.5">
                            Select any previous date below to view, add, edit, or remove doctors — all changes automatically sync to the 30-Day Monthly Excel Sheet, Daily Sheet, WhatsApp Dispatch, and Ward Calls.
                          </p>
                        </div>
                      </div>

                      {/* Date Navigation & Add Doctor Controls */}
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Quick Past Sheet Dates Dropdown */}
                        <select
                          id="roster-quick-date-select"
                          aria-label="Select sheet date from history"
                          value={rosterDateFilter}
                          onChange={(e) => {
                            const val = e.target.value;
                            setRosterDateFilter(val);
                            if (val) {
                              fetchCheckinsForDate(val);
                            } else {
                              fetchCheckins();
                            }
                          }}
                          className="bg-white border border-[#cbdad5] text-[#063b30] font-bold text-xs px-3 py-2 rounded-lg outline-none focus:border-[#063b30] transition-all cursor-pointer shadow-2xs"
                        >
                          <option value="">
                            🟢 Live Today ({activeTodaySheetDate || "Current"}) — {checkins.length} Doctors
                          </option>
                          {rosterDatesList.map((item) => (
                            <option key={`roster-date-opt-${item.date}`} value={item.date}>
                              📅 {item.date} ({item.englishWeekday} / {item.arabicWeekday}) — {item.doctorsCount} {item.doctorsCount === 1 ? "Doctor" : "Doctors"}
                              {item.isToday ? " [Today]" : ""}
                            </option>
                          ))}
                        </select>

                        {/* Previous Day Button */}
                        <button
                          id="roster-prev-day-btn"
                          type="button"
                          onClick={() => {
                            const nextDate = shiftIsoDateByDays(rosterDateFilter || activeTodaySheetDate, -1);
                            setRosterDateFilter(nextDate);
                            fetchCheckinsForDate(nextDate);
                          }}
                          className="p-2 bg-white hover:bg-slate-100 text-slate-700 border border-[#cbdad5] rounded-lg transition-colors cursor-pointer shadow-2xs"
                          title="Previous Day"
                          aria-label="Previous Day"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>

                        {/* Exact Calendar Date Input */}
                        <input
                          id="roster-date-picker"
                          type="date"
                          aria-label="Pick exact roster date"
                          value={rosterDateFilter || activeTodaySheetDate}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (!val) {
                              setRosterDateFilter("");
                              fetchCheckins();
                            } else {
                              setRosterDateFilter(val);
                              fetchCheckinsForDate(val);
                            }
                          }}
                          className="bg-white border border-[#cbdad5] text-slate-800 font-bold text-xs px-3 py-1.5 rounded-lg outline-none focus:border-[#063b30] transition-all cursor-pointer shadow-2xs"
                        />

                        {/* Next Day Button */}
                        <button
                          id="roster-next-day-btn"
                          type="button"
                          onClick={() => {
                            const nextDate = shiftIsoDateByDays(rosterDateFilter || activeTodaySheetDate, 1);
                            setRosterDateFilter(nextDate);
                            fetchCheckinsForDate(nextDate);
                          }}
                          className="p-2 bg-white hover:bg-slate-100 text-slate-700 border border-[#cbdad5] rounded-lg transition-colors cursor-pointer shadow-2xs"
                          title="Next Day"
                          aria-label="Next Day"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>

                        {/* Return to Live Today Button */}
                        {rosterDateFilter && (
                          <button
                            id="roster-live-today-btn"
                            type="button"
                            onClick={() => {
                              setRosterDateFilter("");
                              fetchCheckins();
                            }}
                            className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer shadow-xs flex items-center gap-1.5"
                            title="Switch back to Live Today Roster"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Live Today</span>
                          </button>
                        )}

                        {/* Add Doctor to Selected Date (or Today) Button */}
                        <button
                          id="add-doctor-to-date-btn"
                          type="button"
                          onClick={handleOpenAddCheckinModal}
                          className="px-3.5 py-2 bg-[#063b30] hover:bg-[#042d24] text-white font-bold text-xs rounded-lg transition-colors cursor-pointer shadow-xs flex items-center gap-1.5"
                          title="Add a doctor check-in to this date and sync across all sheets"
                        >
                          <Plus className="w-4 h-4 text-emerald-300" />
                          <span>{rosterDateFilter ? `Add Doctor to ${rosterDateFilter}` : "Add Doctor Check-In"}</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Stats Overview in Geometric Style */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                <div className="bg-white rounded-xl border border-[#cbdad5] p-5 flex items-center gap-4 shadow-sm">
                  <div className="bg-[#e6f2ee] text-[#063b30] p-3.5 rounded-lg">
                    <Users className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                      {rosterDateFilter ? `On-Duty (${rosterDateFilter})` : "Total On-Duty"}
                    </span>
                    <h3 className="text-2xl font-black text-[#063b30] mt-0.5">{activeRosterCheckins.length} Physicians</h3>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-[#cbdad5] p-5 flex items-center gap-4 shadow-sm">
                  <div className="bg-[#e6f2ee] text-[#063b30] p-3.5 rounded-lg">
                    <Clock className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Shifts Scheduled</span>
                    <h3 className="text-2xl font-black text-[#063b30] mt-0.5">
                      {activeRosterCheckins.reduce((acc, curr) => acc + curr.shifts.length, 0)} Slots
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
                <div className="border-b border-slate-100 pb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-slate-950 text-base flex items-center gap-2">
                      <Stethoscope className="w-4.5 h-4.5 text-[#063b30]" />
                      <span>Specialty Attendance Dashboard {rosterDateFilter ? `(${rosterDateFilter})` : ""}</span>
                    </h3>
                    {adminDeptFilter !== "All" && (
                      <button
                        type="button"
                        onClick={() => setAdminDeptFilter("All")}
                        className="text-[10px] font-bold text-[#063b30] bg-[#e6f2ee] hover:bg-[#d5e8e1] px-2.5 py-1 rounded-full border border-[#b5d6c9] inline-flex items-center gap-1 cursor-pointer"
                      >
                        <span>Filtered: {adminDeptFilter}</span>
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <span className="text-[10px] bg-[#e6f2ee] text-[#063b30] font-bold px-2.5 py-1 rounded-full border border-[#cbdad5]">
                    {uniqueDepts.length} ACTIVE {uniqueDepts.length === 1 ? "SPECIALTY" : "SPECIALTIES"} • CLICK TO FILTER
                  </span>
                </div>

                {activeRosterCheckins.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-6">
                    {rosterDateFilter
                      ? `No doctors recorded on ${rosterDateFilter}. Click "+ Add Doctor to ${rosterDateFilter}" above to add physicians to this date's sheet.`
                      : "No active doctors checked in. Once physicians check in, the specialty distribution will appear here."}
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {uniqueDepts.map((dept, idx) => {
                      const deptCheckins = activeRosterCheckins.filter((c) => c.department === dept);
                      const count = deptCheckins.length;
                      const percentage = Math.round((count / activeRosterCheckins.length) * 100);
                      const isActiveDept = adminDeptFilter === dept;
                      
                      // Find shift counts for this specialty
                      const shiftCounts: { [key: string]: number } = {};
                      deptCheckins.forEach((c) => {
                        c.shifts.forEach((sh) => {
                          shiftCounts[sh] = (shiftCounts[sh] || 0) + 1;
                        });
                      });

                      return (
                        <button
                          type="button"
                          key={`stat-dept-${dept}-${idx}`}
                          onClick={() => setAdminDeptFilter(isActiveDept ? "All" : dept)}
                          aria-pressed={isActiveDept}
                          className={`text-left rounded-xl border p-4 flex flex-col justify-between tactile-press cursor-pointer ${
                            isActiveDept
                              ? "bg-[#e6f2ee] border-[#063b30] ring-2 ring-[#063b30]/15 shadow-sm"
                              : "bg-[#f8fbf9] border-[#cbdad5] hover:bg-white hover:border-[#063b30]/40 hover:shadow-xs"
                          }`}
                        >
                          <div className="space-y-2 w-full">
                            <div className="flex items-start justify-between gap-2">
                              <span className={`text-[10px] font-black uppercase tracking-wider block max-w-full truncate ${isActiveDept ? "text-[#063b30]" : "text-slate-500"}`} title={dept}>
                                {dept}
                              </span>
                              {isActiveDept && (
                                <span className="text-[9px] font-extrabold uppercase bg-[#063b30] text-white px-1.5 py-0.5 rounded">
                                  Active
                                </span>
                              )}
                            </div>
                            
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-2xl font-black text-[#063b30] tabular-nums">{count}</span>
                              <span className="text-[10px] text-slate-600 font-medium">
                                {count === 1 ? "doctor" : "doctors"} active
                              </span>
                            </div>

                            {/* visual micro progress bar */}
                            <div className="w-full bg-white rounded-full h-1.5 overflow-hidden border border-[#cbdad5]/60">
                              <div 
                                className="bg-[#063b30] h-full rounded-full transition-all duration-500" 
                                style={{ width: `${percentage}%` }}
                              ></div>
                            </div>
                          </div>

                          {/* Mini breakdown of shifts */}
                          <div className="mt-4 pt-3 border-t border-[#cbdad5]/60 flex flex-wrap gap-1.5 w-full">
                            {Object.entries(shiftCounts).map(([shiftName, shiftCount], idx) => {
                              const labelAr = SHIFT_MAP_AR[shiftName] || shiftName;
                              return (
                                <span 
                                  key={`stat-shift-${shiftName}-${idx}`} 
                                  className="text-[9px] bg-white border border-[#cbdad5] text-slate-700 font-bold px-1.5 py-0.5 rounded flex items-center gap-1"
                                >
                                  <span>{labelAr}:</span>
                                  <span className="text-[#063b30] font-black tabular-nums">{shiftCount}</span>
                                </span>
                              );
                            })}
                          </div>
                        </button>
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

                  {/* Shift Filter Pills */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[
                      { id: "All", label: "All Shifts" },
                      { id: "Morning shift", label: "Morning" },
                      { id: "Evening shift", label: "Evening" },
                      { id: "Night shift", label: "Night" },
                      { id: "24h", label: "24h Duty" }
                    ].map((opt) => (
                      <button
                        key={`shift-pill-${opt.id}`}
                        type="button"
                        onClick={() => setAdminShiftFilter(opt.id)}
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border tactile-press cursor-pointer ${
                          adminShiftFilter === opt.id
                            ? "bg-[#063b30] text-white border-[#063b30]"
                            : "bg-[#f8fbf9] text-slate-700 border-[#cbdad5] hover:bg-[#e6f2ee]"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {/* Actions (Download report / Reset - Split into Daily & Weekly Operations) */}
                  <div className="flex flex-col md:flex-row md:items-stretch xl:items-center gap-4 w-full xl:w-auto">
                    {/* Daily Operations */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 border-b md:border-b-0 md:border-r border-slate-200 pb-4 md:pb-0 pr-0 md:pr-4">
                      <div className="flex items-center gap-1.5 min-w-[55px]">
                        <span className="text-[10px] font-black text-slate-600 uppercase tracking-wider">
                          {rosterDateFilter ? "Date:" : "Daily:"}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          id="download-report-btn"
                          onClick={downloadCSVReport}
                          disabled={activeRosterCheckins.length === 0 || isDownloadingDaily}
                          className="bg-[#063b30] hover:bg-[#042d24] text-white font-bold text-[11px] py-2 px-3 rounded shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                          title={rosterDateFilter ? `Download spreadsheet for ${rosterDateFilter}` : "Download today's spreadsheet"}
                        >
                          {isDownloadingDaily ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                          )}
                          <span>
                            {isDownloadingDaily
                              ? "DOWNLOADING..."
                              : rosterDateFilter
                                ? `DOWNLOAD ${rosterDateFilter} XLS`
                                : "DOWNLOAD TODAY XLS"}
                          </span>
                        </button>

                        <button
                          id="send-whatsapp-report-btn"
                          onClick={handleSendWhatsAppSheet}
                          disabled={isSendingWhatsApp}
                          className="bg-[#128C7E] hover:bg-[#075E54] text-white font-bold text-[11px] py-2 px-3 rounded shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                          title={rosterDateFilter ? `Send ${rosterDateFilter} spreadsheet directly to the WhatsApp group` : "Send today's spreadsheet directly to the WhatsApp group"}
                        >
                          {isSendingWhatsApp ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Send className="w-3.5 h-3.5" />
                          )}
                          <span>
                            {isSendingWhatsApp
                              ? "SENDING TO WHATSAPP..."
                              : rosterDateFilter
                                ? `SEND ${rosterDateFilter} TO WHATSAPP`
                                : "SEND TO WHATSAPP"}
                          </span>
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
                    <span className="font-bold text-[#063b30]">All-Sheet Live Synchronization Active:</span>
                    <p className="mt-0.5 text-slate-600 font-medium">
                      Edits made to any doctor on today's roster or any previous date automatically update the 30-Day Monthly Cumulative Sheet, Daily Excel Sheet, WhatsApp Group Sheet Dispatch, and Inpatient Ward Calls duty roster.
                    </p>
                  </div>
                </div>
              </div>

              {/* Persistent Physician Directory & Phone Manager Card (Collapsible for faster roster scanning) */}
              <div className="bg-white rounded-xl border border-[#cbdad5] shadow-sm overflow-hidden">
                <button
                  type="button"
                  onClick={() => setIsPhoneManagerExpanded((prev) => !prev)}
                  className="w-full px-6 py-4 flex items-center justify-between hover:bg-[#f8fbf9] transition-colors cursor-pointer"
                  aria-expanded={isPhoneManagerExpanded}
                >
                  <div className="flex items-center gap-2.5">
                    <Phone className="w-4.5 h-4.5 text-[#063b30]" />
                    <span className="font-extrabold text-slate-950 text-sm sm:text-base">Persistent Physician Phone Database</span>
                    <span className="text-[10px] bg-[#e6f2ee] text-[#063b30] font-bold px-2.5 py-0.5 rounded-full border border-[#cbdad5]">
                      QUICK PHONE LOOKUP & UPDATE
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[#063b30]">
                    <span>{isPhoneManagerExpanded ? "Hide" : "Expand"}</span>
                    {isPhoneManagerExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </button>

                {isPhoneManagerExpanded && (
                <div className="p-6 pt-2 border-t border-slate-100">
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
                )}
              </div>

              {/* Check-ins Error Banner */}
              {checkinsError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3.5 rounded-xl flex items-center justify-between text-xs font-semibold shadow-xs">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{checkinsError}</span>
                  </div>
                  <button
                    onClick={() => (rosterDateFilter ? fetchCheckinsForDate(rosterDateFilter) : fetchCheckins())}
                    className="px-3 py-1 bg-white border border-rose-300 rounded-lg font-bold hover:bg-rose-100 transition-colors cursor-pointer text-xs"
                  >
                    Retry
                  </button>
                </div>
              )}

              {/* Live Roster Summary List matching Geometric border style */}
              <div className="bg-white rounded-xl border border-[#cbdad5] shadow-sm overflow-hidden p-6 space-y-6">
                
                <div className="border-b border-slate-100 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <h3 className="font-extrabold text-slate-950 text-base flex items-center gap-2">
                    <Layers className="w-4.5 h-4.5 text-[#063b30]" />
                    <span>
                      {rosterDateFilter
                        ? `Roster for ${rosterDateFilter} Grouped by Clinic`
                        : "Active Roster Grouped by Clinic"}
                    </span>
                  </h3>
                  <button
                    type="button"
                    onClick={handleOpenAddCheckinModal}
                    className="text-xs font-bold text-[#063b30] bg-[#e6f2ee] hover:bg-[#d5e8e1] px-3 py-1.5 rounded-lg border border-[#cbdad5] transition-colors flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{rosterDateFilter ? `Add Doctor to ${rosterDateFilter}` : "Add Doctor to Today"}</span>
                  </button>
                </div>

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

                  if ((loadingCheckins || loadingDateCheckins) && activeRosterCheckins.length === 0) {
                    return <CardGridSkeleton cards={4} />;
                  }

                  const groupKeys = Object.keys(grouped);
                  if (groupKeys.length === 0) {
                    return (
                      <EmptyState
                        icon={Users}
                        title={
                          adminSearch || adminDeptFilter !== "All"
                            ? "No Matching Personnel"
                            : rosterDateFilter
                              ? `No Check-Ins Recorded on ${rosterDateFilter}`
                              : "No Active Check-Ins"
                        }
                        description={
                          adminSearch || adminDeptFilter !== "All"
                            ? "No personnel match your search query or department filter."
                            : rosterDateFilter
                              ? `No doctors were recorded on ${rosterDateFilter}. You can add a doctor to this date using the button below.`
                              : "No doctors have checked in yet today. The roster will populate automatically as physicians check in."
                        }
                        actionLabel={
                          adminSearch || adminDeptFilter !== "All"
                            ? "Clear Filters"
                            : rosterDateFilter
                              ? `Add Doctor to ${rosterDateFilter}`
                              : "Add Doctor Check-In"
                        }
                        onAction={() => {
                          if (adminSearch || adminDeptFilter !== "All") {
                            setAdminSearch("");
                            setAdminDeptFilter("All");
                          } else {
                            handleOpenAddCheckinModal();
                          }
                        }}
                      />
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
                              <div key={`chk-${c.id}-${c.timestamp || ''}-${cIdx}`} className="flex items-center justify-between text-xs p-3.5 bg-[#f8fbf9] hover:bg-white transition-colors rounded-xl border border-[#cbdad5]">
                                <div className="flex flex-col gap-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-mono font-bold tabular-nums bg-white px-2 py-0.5 rounded border border-[#cbdad5] text-[#063b30] text-[10px] shrink-0">{c.id}</span>
                                    <span className="font-bold text-slate-900 truncate">{c.doctorName}</span>
                                  </div>
                                  <div className="flex items-center gap-3 text-[10px] text-slate-600 font-mono tabular-nums pl-0.5 flex-wrap">
                                    <div className="flex items-center gap-1">
                                      <Clock className="w-3 h-3 text-[#063b30] opacity-75" />
                                      <span>{formatTimestamp(c.timestamp)}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      {c.mobileNumber ? (
                                        <button
                                          type="button"
                                          onClick={() => copyToClipboard(c.mobileNumber || "", `Phone ${c.mobileNumber}`)}
                                          className="flex items-center gap-1 text-emerald-900 bg-emerald-50 hover:bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-200 cursor-pointer transition-colors"
                                          title="Click to copy phone number"
                                        >
                                          <Phone className="w-2.5 h-2.5 text-emerald-700" />
                                          <span>{c.mobileNumber}</span>
                                        </button>
                                      ) : (
                                        <span className="text-[9px] text-slate-500 italic bg-slate-100 px-1.5 py-0.5 rounded">No phone</span>
                                      )}
                                      <button
                                        onClick={() => handleEditCheckedInPhone(c.id, c.mobileNumber || "")}
                                        className="p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center text-[#084c3e] hover:text-[#063b30] hover:bg-[#e6f2ee] rounded transition-colors cursor-pointer"
                                        title="Edit physician phone number"
                                        aria-label={`Edit phone number for Dr. ${c.doctorName}`}
                                      >
                                        <Phone className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="font-bold text-[#063b30] arabic-font" dir="rtl">{c.doctorArabicName}</span>
                                  <span className="bg-[#e6f2ee] text-[#063b30] border border-[#b5d6c9] px-2 py-0.5 rounded text-[9px] font-bold">
                                    {formatShiftsForDisplay(c.shifts)}
                                  </span>
                                  <button
                                    id={`edit-checkin-btn-${c.id}`}
                                    onClick={() => handleOpenEditCheckinModal(c)}
                                    className="p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center text-[#063b30] hover:bg-emerald-50 rounded-md transition-colors cursor-pointer"
                                    title="Edit physician check-in details (Name, Specialty, Shifts, Phone, Date)"
                                    aria-label={`Edit check-in for Dr. ${c.doctorName}`}
                                  >
                                    <Edit className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteCheckin(c.id, c.timestamp)}
                                    className="p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center text-rose-700 hover:text-rose-800 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
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
                    disabled={isDeletingCheckin}
                    className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded text-xs uppercase transition-all shadow-sm cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {isDeletingCheckin ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Deleting...</span>
                      </>
                    ) : (
                      <span>Delete Record</span>
                    )}
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
                    disabled={isClearingAllCheckins}
                    className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded text-xs uppercase transition-all shadow-sm cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {isClearingAllCheckins ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Resetting...</span>
                      </>
                    ) : (
                      <span>Yes, Reset All</span>
                    )}
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
                    disabled={isClearingMonthlyCheckins}
                    className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded text-xs uppercase transition-all shadow-sm disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {isClearingMonthlyCheckins ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Resetting...</span>
                      </>
                    ) : (
                      <span>Yes, Reset Monthly</span>
                    )}
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

      {/* Add / Edit Date Check-In Modal (Syncs Across All Sheets) */}
      <AnimatePresence>
        {isCheckinModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby="checkin-edit-modal-title"
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="bg-white rounded-xl border border-[#cbdad5] shadow-2xl max-w-xl w-full overflow-hidden my-8"
            >
              {/* Modal Header */}
              <div className="bg-[#063b30] text-white px-6 py-4 flex items-center justify-between">
                <h3 id="checkin-edit-modal-title" className="font-extrabold text-base flex items-center gap-2">
                  {checkinModalMode === "add" ? (
                    <Plus className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <Edit className="w-5 h-5 text-emerald-400" />
                  )}
                  <span>
                    {checkinModalMode === "add"
                      ? `Add Doctor to Sheet (${checkinFormData.date || "Selected Date"})`
                      : `Edit Checked-In Doctor (${checkinFormData.originalDate || checkinFormData.date})`}
                  </span>
                </h3>
                <button
                  type="button"
                  onClick={() => !isSavingCheckinModal && setIsCheckinModalOpen(false)}
                  className="text-slate-300 hover:text-white p-1.5 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-full hover:bg-white/10 transition-colors cursor-pointer"
                  aria-label="Close check-in editor dialog"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <form onSubmit={handleSaveCheckinModal} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
                {/* Quick Lookup from Master Physician Database */}
                <div className="bg-[#e6f2ee]/70 border border-[#cbdad5] rounded-lg p-3.5 space-y-2">
                  <label htmlFor="checkin-modal-lookup-input" className="text-[11px] font-extrabold text-[#063b30] uppercase tracking-wider flex items-center gap-1.5">
                    <Search className="w-3.5 h-3.5" />
                    <span>Quick Auto-Fill from Master Physician Database (Optional)</span>
                  </label>
                  <div className="relative">
                    <input
                      id="checkin-modal-lookup-input"
                      type="text"
                      placeholder="Type doctor ID, English name, or Arabic name to auto-fill..."
                      value={checkinModalSearch}
                      onChange={(e) => setCheckinModalSearch(e.target.value)}
                      className="w-full px-3.5 py-2 bg-white border border-[#cbdad5] rounded-lg focus:border-[#063b30] outline-none text-slate-800 text-xs font-semibold transition-all"
                    />
                    {checkinModalSuggestions.length > 0 && (
                      <div className="mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-y-auto divide-y divide-slate-100 z-20 relative">
                        {checkinModalSuggestions.map((doc, idx) => (
                          <button
                            key={`chk-modal-sug-${doc.id}-${idx}`}
                            type="button"
                            onClick={() => handleSelectDoctorForCheckinModal(doc)}
                            className="w-full px-3.5 py-2 text-left text-xs hover:bg-emerald-50/70 transition-colors flex items-center justify-between cursor-pointer"
                          >
                            <div className="truncate pr-2">
                              <span className="font-mono font-bold bg-slate-100 text-[#063b30] px-1.5 py-0.5 rounded border border-slate-200 text-[10px] mr-2">
                                {doc.id}
                              </span>
                              <span className="font-semibold text-slate-800">{doc.name}</span>
                              <span className="text-[10px] text-slate-500 ml-2">({doc.department})</span>
                            </div>
                            <span className="text-[#063b30] font-bold arabic-font text-right shrink-0" dir="rtl">
                              {doc.arabicName}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Row 1: Employee ID & Target Sheet Date */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label htmlFor="checkin-modal-id-input" className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                      Employee ID <span className="text-rose-500">*</span>
                    </label>
                    <input
                      id="checkin-modal-id-input"
                      type="text"
                      placeholder="e.g., 101"
                      value={checkinFormData.id}
                      onChange={(e) => setCheckinFormData({ ...checkinFormData, id: e.target.value })}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-[#cbdad5] rounded-lg text-sm font-mono font-bold text-slate-900 focus:bg-white focus:border-[#063b30] outline-none transition-all"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="checkin-modal-date-input" className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                      Sheet Date (YYYY-MM-DD) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      id="checkin-modal-date-input"
                      type="date"
                      value={checkinFormData.date}
                      onChange={(e) => setCheckinFormData({ ...checkinFormData, date: e.target.value })}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-[#cbdad5] rounded-lg text-sm font-bold text-slate-900 focus:bg-white focus:border-[#063b30] outline-none transition-all"
                      required
                    />
                  </div>
                </div>

                {/* Row 2: English Name & Arabic Name */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label htmlFor="checkin-modal-name-input" className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                      English Full Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      id="checkin-modal-name-input"
                      type="text"
                      placeholder="e.g., Dr. Ahmed Hassan"
                      value={checkinFormData.doctorName}
                      onChange={(e) => setCheckinFormData({ ...checkinFormData, doctorName: e.target.value })}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-[#cbdad5] rounded-lg text-sm font-semibold text-slate-900 focus:bg-white focus:border-[#063b30] outline-none transition-all"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="checkin-modal-arabic-name-input" className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                      Arabic Full Name (الاسم بالعربي) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      id="checkin-modal-arabic-name-input"
                      type="text"
                      dir="rtl"
                      placeholder="أحمد حسن..."
                      value={checkinFormData.doctorArabicName}
                      onChange={(e) => setCheckinFormData({ ...checkinFormData, doctorArabicName: e.target.value })}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-[#cbdad5] rounded-lg text-sm font-bold text-[#063b30] arabic-font focus:bg-white focus:border-[#063b30] outline-none transition-all"
                      required
                    />
                  </div>
                </div>

                {/* Row 3: Specialty & Phone Number */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label htmlFor="checkin-modal-dept-select" className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                      Clinical Specialty <span className="text-rose-500">*</span>
                    </label>
                    <select
                      id="checkin-modal-dept-select"
                      value={checkinFormData.department}
                      onChange={(e) => setCheckinFormData({ ...checkinFormData, department: e.target.value })}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-[#cbdad5] rounded-lg text-sm font-bold text-[#063b30] focus:bg-white focus:border-[#063b30] outline-none transition-all cursor-pointer"
                    >
                      {checkinFormData.department &&
                        !SPECIALTY_OPTIONS.some((s) => s.value === checkinFormData.department) && (
                          <option value={checkinFormData.department}>
                            {checkinFormData.department}
                          </option>
                        )}
                      {SPECIALTY_OPTIONS.map((spec) => (
                        <option key={`chk-modal-spec-${spec.value}`} value={spec.value}>
                          {spec.labelEn} — {spec.labelAr}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="checkin-modal-phone-input" className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                      Mobile Phone Number
                    </label>
                    <input
                      id="checkin-modal-phone-input"
                      type="text"
                      placeholder="e.g., 01012345678"
                      value={checkinFormData.mobileNumber}
                      onChange={(e) => setCheckinFormData({ ...checkinFormData, mobileNumber: e.target.value })}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-[#cbdad5] rounded-lg text-sm font-semibold text-slate-900 focus:bg-white focus:border-[#063b30] outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Row 4: Shifts Selector */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                    Assigned Duty Shifts <span className="text-rose-500">*</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {SHIFT_OPTIONS.map((sh) => {
                      const isSelected = checkinFormData.shifts.includes(sh.id);
                      const ShiftIcon = sh.icon;
                      return (
                        <button
                          key={`chk-modal-shift-${sh.id}`}
                          type="button"
                          onClick={() => handleToggleCheckinModalShift(sh.id)}
                          className={`p-2.5 rounded-lg border text-left transition-all flex items-center justify-between cursor-pointer ${
                            isSelected
                              ? "bg-[#063b30] text-white border-[#063b30] shadow-xs"
                              : "bg-slate-50 text-slate-700 border-[#cbdad5] hover:bg-slate-100"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <ShiftIcon className={`w-4 h-4 ${isSelected ? "text-emerald-300" : "text-[#063b30]"}`} />
                            <div>
                              <div className="text-xs font-bold">{sh.labelEn}</div>
                              <div className={`text-[10px] arabic-font ${isSelected ? "text-emerald-200" : "text-slate-500"}`}>
                                {sh.labelAr}
                              </div>
                            </div>
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-emerald-300 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Row 5: Master Profile Cascade Toggle */}
                <div className="pt-1">
                  <label className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer hover:bg-slate-100/70 transition-colors">
                    <input
                      id="checkin-modal-sync-master-checkbox"
                      type="checkbox"
                      checked={checkinFormData.syncMasterProfile}
                      onChange={(e) => setCheckinFormData({ ...checkinFormData, syncMasterProfile: e.target.checked })}
                      className="mt-0.5 w-4 h-4 accent-[#063b30] rounded cursor-pointer"
                    />
                    <div className="text-xs">
                      <span className="font-bold text-slate-800 block">
                        Sync Doctor Profile Across Master Database & All Historical/Future Sheets
                      </span>
                      <span className="text-slate-500 text-[11px] block mt-0.5">
                        When enabled, any updates to this doctor's Name, Arabic Name, Specialty, or Mobile Number will also update their permanent profile and reflect across all 30-day monthly sub-sheets.
                      </span>
                    </div>
                  </label>
                </div>

                {/* Modal Footer */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    disabled={isSavingCheckinModal}
                    onClick={() => setIsCheckinModalOpen(false)}
                    className="px-4 py-2.5 rounded-lg border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    id="checkin-modal-submit-btn"
                    type="submit"
                    disabled={isSavingCheckinModal}
                    className="px-5 py-2.5 rounded-lg bg-[#063b30] hover:bg-[#042d24] text-white font-bold text-xs shadow-md transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                  >
                    {isSavingCheckinModal ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Syncing All Sheets...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4 text-emerald-300" />
                        <span>{checkinModalMode === "add" ? "Add Doctor & Sync Sheets" : "Save Changes & Sync Sheets"}</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
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

      {/* Global Quick-Jump Command Palette (Cmd+K / Ctrl+K) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        adminRole={adminRole}
        doctors={fullDoctorList}
        onNavigateTab={(tab) => {
          setIsAdminMode(true);
          setAdminTab(tab);
          if (tab === "database" || tab === "duplicates") fetchFullDoctorsDatabase(true);
          if (tab === "calls") fetchDoctorCalls();
          if (tab === "prayer") fetchPrayerStatus();
        }}
        onSwitchToCheckin={() => setIsAdminMode(false)}
        onOpenAddCheckin={() => {
          setIsAdminMode(true);
          setAdminTab("roster");
          handleOpenAddCheckinModal();
        }}
        onOpenCustomCall={() => {
          setIsAdminMode(true);
          setAdminTab("calls");
          const dutyDate = getHospitalDutyDateClient();
          setCustomCallForm((prev) => ({ ...prev, date: dutyDate }));
          setShowCustomCallModal(true);
          setCustomCallSuccess(null);
          fetchCustomCallPreview({ date: dutyDate });
        }}
        onDownloadDailyXls={() => downloadCSVReport()}
        onSelectDoctor={(doc) => {
          setIsAdminMode(true);
          setAdminTab("database");
          handleOpenEditDoctor(doc);
        }}
      />

      {/* Footer Bar in Geometric Balance style */}
      <footer className="h-10 bg-[#cbdad5] flex items-center px-8 border-t border-[#b2c8c0] justify-between text-[10px] text-[#063b30] font-semibold">
        <p>All rights reserved to Dr. Mohanad El Ma'moun , MSC</p>
        <p className="font-bold text-[#063b30] tracking-tighter">ELITE HOSPITAL OS v4.2.1</p>
      </footer>

    </div>
  );
}
