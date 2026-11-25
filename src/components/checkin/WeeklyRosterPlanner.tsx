import React, { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Search,
  CheckCircle,
  AlertCircle,
  X,
  Plus,
  Users,
  Stethoscope,
  Loader2,
  Download,
  Trash2,
  RotateCcw,
  Sun,
  Sunset,
  Moon,
  Clock,
  Check,
  UserPlus,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { CANONICAL_SPECIALTIES } from "../../data/specialties.js";
import { buildRollingWeekDates, WeekDayInfo } from "../../utils/timezone.ts";
import { formatShiftsForDisplay } from "../../utils/shifts.ts";
import { useToast } from "../common/Toast.tsx";

export interface PlannerDoctor {
  id: string;
  name: string;
  arabicName: string;
  department: string;
  mobileNumber?: string;
}

interface WeeklyCheckInRecord {
  id: string;
  doctorName: string;
  doctorArabicName: string;
  department: string;
  shifts: string[];
  timestamp: string;
  mobileNumber?: string;
  date: string;
}

interface WeeklyRosterPlannerProps {
  activeSheetDate: string;
  onBackToModes: () => void;
  onSwitchToDaily: () => void;
  onSaved: () => void;
}

type ScheduleMap = Record<string, Record<string, string[]>>; // doctorId -> isoDate -> shifts[]

function normalizeShiftsKey(shifts: string[] | undefined): string {
  if (!shifts || shifts.length === 0) return "";
  let s = [...shifts];
  if (
    s.length === 3 &&
    s.includes("Morning shift") &&
    s.includes("Evening shift") &&
    s.includes("Night shift")
  ) {
    s = ["24 shift"];
  }
  return Array.from(new Set(s)).sort().join("|");
}

function expandForUi(shifts: string[] | undefined): string[] {
  if (!shifts || shifts.length === 0) return [];
  if (shifts.includes("24 shift")) {
    return ["Morning shift", "Evening shift", "Night shift"];
  }
  return [...shifts];
}

function normalizeDocId(id: string): string {
  return (id || "").trim().replace(/^(emp\.|emp)/i, "");
}

const COMPACT_SHIFTS = [
  {
    id: "Morning shift",
    short: "M",
    label: "Morning",
    ar: "ص",
    activeClass: "bg-sky-700 text-white border-sky-800 shadow-2xs",
    inactiveClass: "bg-[#f8fbf9] text-slate-600 border-[#cbdad5] hover:border-sky-400 hover:text-sky-900",
    icon: Sun,
  },
  {
    id: "Evening shift",
    short: "E",
    label: "Evening",
    ar: "م",
    activeClass: "bg-amber-600 text-white border-amber-700 shadow-2xs",
    inactiveClass: "bg-[#f8fbf9] text-slate-600 border-[#cbdad5] hover:border-amber-400 hover:text-amber-900",
    icon: Sunset,
  },
  {
    id: "Night shift",
    short: "N",
    label: "Night",
    ar: "ل",
    activeClass: "bg-emerald-950 text-emerald-100 border-emerald-950 shadow-2xs",
    inactiveClass: "bg-[#f8fbf9] text-slate-600 border-[#cbdad5] hover:border-emerald-700 hover:text-emerald-950",
    icon: Moon,
  },
] as const;

export function WeeklyRosterPlanner({
  activeSheetDate,
  onBackToModes,
  onSwitchToDaily,
  onSaved,
}: WeeklyRosterPlannerProps) {
  const toast = useToast();

  // Rolling 7-day window state
  const [weekOffset, setWeekOffset] = useState(0);
  const weekDays: WeekDayInfo[] = useMemo(
    () => buildRollingWeekDates(activeSheetDate, weekOffset, 7, activeSheetDate),
    [activeSheetDate, weekOffset]
  );
  const weekStartIso = weekDays[0]?.isoDate || activeSheetDate;
  const weekEndIso = weekDays[weekDays.length - 1]?.isoDate || activeSheetDate;

  // Department scope & doctor search
  const [deptFilter, setDeptFilter] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlannerDoctor[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestionIdx, setActiveSuggestionIdx] = useState(0);
  const [loadingScheduled, setLoadingScheduled] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  // Manual unlisted doctor mini-form
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [manualId, setManualId] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualArabicName, setManualArabicName] = useState("");
  const [manualDept, setManualDept] = useState<string>(CANONICAL_SPECIALTIES[0]);

  // Multi-doctor planner grid state
  const [doctors, setDoctors] = useState<PlannerDoctor[]>([]);
  const [initialSchedule, setInitialSchedule] = useState<ScheduleMap>({});
  const [draftSchedule, setDraftSchedule] = useState<ScheduleMap>({});
  const [highlightedDoctorId, setHighlightedDoctorId] = useState<string | null>(null);
  const [expandedMobileIds, setExpandedMobileIds] = useState<Record<string, boolean>>({});

  // Save & confirmation receipt states
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [receipt, setReceipt] = useState<{
    savedCount: number;
    deletedCount: number;
    syncedToTodayCount: number;
    affectedDates: string[];
    doctorsCount: number;
  } | null>(null);

  // Unsaved-changes guard banner
  const [pendingNavAction, setPendingNavAction] = useState<{
    label: string;
    run: () => void;
  } | null>(null);

  // Close search dropdown on outside click
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // Debounced doctor autocomplete search
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/doctors/search?q=${encodeURIComponent(q)}`);
        if (!res.ok) return;
        const data: PlannerDoctor[] = await res.json();
        const filtered =
          deptFilter !== "All"
            ? data.filter((d) => d.department === deptFilter)
            : data;
        setSuggestions(filtered.slice(0, 12));
        setActiveSuggestionIdx(0);
        setShowSuggestions(true);
      } catch {
        // ignore transient search errors
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery, deptFilter]);

  // Compute exact diff between initialSchedule (from DB) and draftSchedule
  const { entriesToSave, deletionsToApply, dirtyCount, totalScheduledCells } = useMemo(() => {
    const entries: Array<{
      id: string;
      doctorName: string;
      doctorArabicName: string;
      department: string;
      mobileNumber?: string;
      date: string;
      shifts: string[];
    }> = [];
    const deletions: Array<{ id: string; date: string }> = [];
    let totalCells = 0;

    for (const doc of doctors) {
      const docKey = normalizeDocId(doc.id);
      const initDays = initialSchedule[docKey] || {};
      const draftDays = draftSchedule[docKey] || {};

      for (const day of weekDays) {
        const initKey = normalizeShiftsKey(initDays[day.isoDate]);
        const draftShifts = draftDays[day.isoDate] || [];
        const draftKey = normalizeShiftsKey(draftShifts);

        if (draftShifts.length > 0) {
          totalCells++;
        }

        if (draftKey !== initKey) {
          if (draftShifts.length > 0) {
            entries.push({
              id: doc.id,
              doctorName: doc.name,
              doctorArabicName: doc.arabicName || doc.name,
              department: doc.department,
              mobileNumber: doc.mobileNumber || "",
              date: day.isoDate,
              shifts: draftShifts,
            });
          } else if (initKey !== "") {
            deletions.push({ id: doc.id, date: day.isoDate });
          }
        }
      }
    }

    return {
      entriesToSave: entries,
      deletionsToApply: deletions,
      dirtyCount: entries.length + deletions.length,
      totalScheduledCells: totalCells,
    };
  }, [doctors, initialSchedule, draftSchedule, weekDays]);

  // Hydrate existing DB schedules for current doctors when week changes
  const hydrateWeekForDoctors = async (targetDocs: PlannerDoctor[], startDate: string) => {
    if (targetDocs.length === 0) return;
    try {
      const res = await fetch(`/api/checkins/week?start=${encodeURIComponent(startDate)}&days=7`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const json = await res.json();
      const records: WeeklyCheckInRecord[] = Array.isArray(json.checkins) ? json.checkins : [];
      const docIdSet = new Set(targetDocs.map((d) => normalizeDocId(d.id)));

      const nextInit: ScheduleMap = {};
      for (const id of docIdSet) {
        nextInit[id] = {};
      }
      for (const rec of records) {
        const k = normalizeDocId(rec.id);
        if (!docIdSet.has(k)) continue;
        nextInit[k][rec.date] = expandForUi(rec.shifts);
      }

      setInitialSchedule(nextInit);
      setDraftSchedule(JSON.parse(JSON.stringify(nextInit)));
    } catch {
      // keep empty draft on error
    }
  };

  // Guarded navigation helper
  const runWithUnsavedGuard = (label: string, action: () => void) => {
    if (dirtyCount > 0) {
      setPendingNavAction({ label, run: action });
      return;
    }
    action();
  };

  const handleChangeWeek = (delta: number) => {
    const nextOffset = weekOffset + delta;
    const nextDays = buildRollingWeekDates(activeSheetDate, nextOffset, 7, activeSheetDate);
    const nextStart = nextDays[0]?.isoDate || activeSheetDate;

    runWithUnsavedGuard("switch weeks", () => {
      setWeekOffset(nextOffset);
      setReceipt(null);
      setErrorMsg("");
      hydrateWeekForDoctors(doctors, nextStart);
    });
  };

  const handleJumpToActiveWeek = () => {
    if (weekOffset === 0) return;
    runWithUnsavedGuard("jump to the active week", () => {
      setWeekOffset(0);
      setReceipt(null);
      setErrorMsg("");
      hydrateWeekForDoctors(doctors, activeSheetDate);
    });
  };

  // Add a single doctor to the grid and hydrate their existing week schedule
  const handleAddDoctor = async (doc: PlannerDoctor) => {
    const cleanId = normalizeDocId(doc.id);
    setSearchQuery("");
    setSuggestions([]);
    setShowSuggestions(false);
    setReceipt(null);
    setErrorMsg("");

    const alreadyExists = doctors.some((d) => normalizeDocId(d.id) === cleanId);
    if (alreadyExists) {
      setHighlightedDoctorId(cleanId);
      setTimeout(() => setHighlightedDoctorId(null), 1600);
      toast.info("Already in Planner", `Dr. ${doc.name} is already in your weekly grid.`);
      return;
    }

    const normalizedDoc: PlannerDoctor = { ...doc, id: cleanId };
    setDoctors((prev) => [...prev, normalizedDoc]);
    setExpandedMobileIds((prev) => ({ ...prev, [cleanId]: true }));

    try {
      const res = await fetch(
        `/api/checkins/week?start=${encodeURIComponent(weekStartIso)}&days=7&doctorId=${encodeURIComponent(cleanId)}`,
        { cache: "no-store" }
      );
      if (res.ok) {
        const json = await res.json();
        const recs: WeeklyCheckInRecord[] = Array.isArray(json.checkins) ? json.checkins : [];
        const docDays: Record<string, string[]> = {};
        for (const r of recs) {
          docDays[r.date] = expandForUi(r.shifts);
        }
        setInitialSchedule((prev) => ({ ...prev, [cleanId]: docDays }));
        setDraftSchedule((prev) => {
          const existingLocal = prev[cleanId] || {};
          const mergedDays: Record<string, string[]> = { ...docDays };
          for (const [dIso, localShifts] of Object.entries(existingLocal)) {
            if (Array.isArray(localShifts) && localShifts.length > 0) {
              mergedDays[dIso] = localShifts;
            }
          }
          return {
            ...prev,
            [cleanId]: mergedDays,
          };
        });
      }
    } catch {
      // start with blank row if hydration fails
    }
  };

  // Load all already-scheduled doctors for the selected department (or all) in the visible 7-day window
  const handleLoadScheduledDoctors = async () => {
    setLoadingScheduled(true);
    setErrorMsg("");
    setReceipt(null);
    try {
      const params = new URLSearchParams({
        start: weekStartIso,
        days: "7",
      });
      if (deptFilter !== "All") {
        params.set("department", deptFilter);
      }
      const res = await fetch(`/api/checkins/week?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load scheduled doctors.");
      const json = await res.json();
      const recs: WeeklyCheckInRecord[] = Array.isArray(json.checkins) ? json.checkins : [];

      if (recs.length === 0) {
        toast.info(
          "No Scheduled Doctors Found",
          deptFilter === "All"
            ? `No doctors are scheduled yet between ${weekDays[0]?.formattedShort} and ${weekDays[6]?.formattedShort}.`
            : `No ${deptFilter} doctors are scheduled yet for this 7-day window.`
        );
        return;
      }

      const docMap = new Map<string, PlannerDoctor>();
      for (const existing of doctors) {
        docMap.set(normalizeDocId(existing.id), existing);
      }

      const hydratedInit: ScheduleMap = { ...initialSchedule };
      const hydratedDraft: ScheduleMap = { ...draftSchedule };

      let addedCount = 0;
      for (const r of recs) {
        const k = normalizeDocId(r.id);
        if (!docMap.has(k)) {
          docMap.set(k, {
            id: k,
            name: r.doctorName,
            arabicName: r.doctorArabicName || r.doctorName,
            department: r.department,
            mobileNumber: r.mobileNumber || "",
          });
          addedCount++;
        }
        if (!hydratedInit[k]) hydratedInit[k] = {};
        if (!hydratedDraft[k]) hydratedDraft[k] = {};
        const expanded = expandForUi(r.shifts);
        hydratedInit[k][r.date] = expanded;
        // Preserve local unsaved draft if user already edited this cell
        if (!hydratedDraft[k][r.date] || hydratedDraft[k][r.date].length === 0) {
          hydratedDraft[k][r.date] = [...expanded];
        }
      }

      setDoctors(Array.from(docMap.values()));
      setInitialSchedule(hydratedInit);
      setDraftSchedule(hydratedDraft);
      toast.success(
        "Schedule Loaded",
        `Loaded ${docMap.size} doctor(s) (${addedCount} newly added to planner).`
      );
    } catch (err: any) {
      setErrorMsg(err?.message || "Could not load scheduled doctors.");
    } finally {
      setLoadingScheduled(false);
    }
  };

  // Manual unlisted doctor add
  const handleAddManualDoctor = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = normalizeDocId(manualId);
    if (!cleanId || !manualName.trim() || !manualArabicName.trim() || !manualDept) {
      setErrorMsg("Please fill Employee ID, English Name, Arabic Name, and Specialty.");
      return;
    }
    handleAddDoctor({
      id: cleanId,
      name: manualName.trim(),
      arabicName: manualArabicName.trim(),
      department: manualDept,
    });
    setManualId("");
    setManualName("");
    setManualArabicName("");
    setShowManualAdd(false);
  };

  // Toggle a single shift in a (doctor, day) cell
  const toggleCellShift = (doctorId: string, isoDate: string, shiftId: string) => {
    const key = normalizeDocId(doctorId);
    setReceipt(null);
    setErrorMsg("");
    setDraftSchedule((prev) => {
      const docDays = { ...(prev[key] || {}) };
      const current = [...(docDays[isoDate] || [])];
      if (current.includes(shiftId)) {
        docDays[isoDate] = current.filter((s) => s !== shiftId);
      } else {
        docDays[isoDate] = [...current, shiftId];
      }
      return { ...prev, [key]: docDays };
    });
  };

  // Toggle 24h full duty (all 3 shifts) in a (doctor, day) cell
  const toggleCell24h = (doctorId: string, isoDate: string) => {
    const key = normalizeDocId(doctorId);
    setReceipt(null);
    setErrorMsg("");
    setDraftSchedule((prev) => {
      const docDays = { ...(prev[key] || {}) };
      const current = docDays[isoDate] || [];
      const is24h = current.length === 3;
      docDays[isoDate] = is24h
        ? []
        : ["Morning shift", "Evening shift", "Night shift"];
      return { ...prev, [key]: docDays };
    });
  };

  // Per-row quick fill across all 7 visible days
  const handleFillRow = (doctorId: string, shiftsToApply: string[]) => {
    const key = normalizeDocId(doctorId);
    setReceipt(null);
    setErrorMsg("");
    setDraftSchedule((prev) => {
      const docDays = { ...(prev[key] || {}) };
      for (const day of weekDays) {
        docDays[day.isoDate] = [...shiftsToApply];
      }
      return { ...prev, [key]: docDays };
    });
  };

  // Remove doctor row from planner workspace (does not delete DB records)
  const handleRemoveDoctorRow = (doctorId: string) => {
    const key = normalizeDocId(doctorId);
    setDoctors((prev) => prev.filter((d) => normalizeDocId(d.id) !== key));
  };

  // Batch save to POST /api/checkins/weekly
  const handleSaveWeeklyRoster = async () => {
    if (dirtyCount === 0) {
      toast.info("No Changes", "All scheduled shifts in this planner are already saved.");
      return;
    }

    setSaving(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/checkins/weekly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: entriesToSave,
          deletions: deletionsToApply,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Failed to save weekly roster.");
        return;
      }

      // Sync initialSchedule to match saved draftSchedule
      setInitialSchedule(JSON.parse(JSON.stringify(draftSchedule)));
      setReceipt({
        savedCount: data.savedCount || 0,
        deletedCount: data.deletedCount || 0,
        syncedToTodayCount: data.syncedToTodayCount || 0,
        affectedDates: Array.isArray(data.affectedDates) ? data.affectedDates : [],
        doctorsCount: doctors.length,
      });
      toast.success(
        "Weekly Schedule Saved",
        `Saved ${data.savedCount} scheduled day(s). These doctors are now set for duty on their chosen days.`
      );
      onSaved();
    } catch {
      setErrorMsg("Network error while saving weekly roster. Please verify connection.");
    } finally {
      setSaving(false);
    }
  };

  const handleStartNewBatch = () => {
    setDoctors([]);
    setInitialSchedule({});
    setDraftSchedule({});
    setReceipt(null);
    setErrorMsg("");
  };

  return (
    <motion.div
      key="weekly-roster-planner"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
      className="w-full max-w-6xl mx-auto space-y-5"
    >
      {/* Main Planner Card */}
      <div className="bg-white rounded-2xl border border-[#cbdad5] p-5 sm:p-6 shadow-[0_18px_40px_-20px_rgba(6,59,48,0.16)] space-y-5">
        {/* Top Bar: Navigation + Title + 7-Day Window Navigator */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-[#e4ece9]">
          <div className="flex items-start sm:items-center gap-3">
            <button
              id="weekly-back-to-modes-btn"
              type="button"
              onClick={() => runWithUnsavedGuard("return to Entry Modes", onBackToModes)}
              className="p-2.5 rounded-xl bg-[#f8fbf9] hover:bg-[#e6f2ee] text-[#063b30] border border-[#cbdad5] tactile-press cursor-pointer shrink-0"
              title="Back to Entry Mode Selector"
              aria-label="Back to Entry Mode Selector"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-[#063b30]">
                  Weekly Doctors Schedule
                </h2>
                <span className="text-xs font-bold text-[#084c3e] arabic-font" dir="rtl">
                  جدول الأطباء الأسبوعي
                </span>
              </div>
              <p className="text-xs text-slate-600 font-medium mt-0.5">
                Search for doctors below and pick their shifts for each day of the week. Once saved, they will automatically be on duty for those days.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* 7-Day Rolling Window Navigator */}
            <div className="inline-flex items-center bg-[#f8fbf9] border border-[#cbdad5] rounded-xl p-1 gap-1">
              <button
                id="weekly-prev-week-btn"
                type="button"
                onClick={() => handleChangeWeek(-1)}
                className="p-2 rounded-lg hover:bg-white text-[#063b30] tactile-press cursor-pointer"
                title="Previous 7 Days"
                aria-label="Previous 7 Days"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="px-2.5 text-center min-w-[148px]">
                <div className="text-xs font-extrabold text-[#063b30] font-mono tabular-nums">
                  {weekDays[0]?.formattedShort} – {weekDays[6]?.formattedShort}
                </div>
                <div className="text-[10px] font-bold text-slate-500">
                  {weekOffset === 0
                    ? "Active 7-Day Window"
                    : weekOffset > 0
                    ? `+${weekOffset} Week${weekOffset > 1 ? "s" : ""} Ahead`
                    : `${weekOffset} Week${weekOffset < -1 ? "s" : ""} Back`}
                </div>
              </div>
              <button
                id="weekly-next-week-btn"
                type="button"
                onClick={() => handleChangeWeek(1)}
                className="p-2 rounded-lg hover:bg-white text-[#063b30] tactile-press cursor-pointer"
                title="Next 7 Days"
                aria-label="Next 7 Days"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {weekOffset !== 0 && (
              <button
                type="button"
                onClick={handleJumpToActiveWeek}
                className="px-3 py-2 rounded-xl text-xs font-bold bg-[#e6f2ee] hover:bg-[#d7eae3] text-[#063b30] border border-[#b5d6c9] tactile-press cursor-pointer"
              >
                This Week
              </button>
            )}

            <button
              id="weekly-switch-to-daily-btn"
              type="button"
              onClick={() => runWithUnsavedGuard("switch to Daily Doctor check-in", onSwitchToDaily)}
              className="px-3 py-2 rounded-xl text-xs font-bold bg-white hover:bg-[#f8fbf9] text-[#063b30] border border-[#cbdad5] tactile-press cursor-pointer inline-flex items-center gap-1.5"
            >
              <Stethoscope className="w-3.5 h-3.5" />
              <span>Daily Doctor</span>
            </button>
          </div>
        </div>

        {/* Unsaved Changes Guard Banner */}
        <AnimatePresence>
          {pendingNavAction && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="bg-amber-50 border border-amber-300 text-amber-950 px-4 py-3 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-semibold"
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                <span>
                  You have <strong>{dirtyCount} unsaved change{dirtyCount > 1 ? "s" : ""}</strong>. Discard them to {pendingNavAction.label}?
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setPendingNavAction(null)}
                  className="px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-amber-950 font-bold cursor-pointer"
                >
                  Stay &amp; Keep
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const fn = pendingNavAction.run;
                    setPendingNavAction(null);
                    fn();
                  }}
                  className="px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white font-bold cursor-pointer"
                >
                  Discard &amp; Continue
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Department Scope + Doctor Search & Add Toolbar */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
          {/* Specialty Scope */}
          <div className="lg:col-span-4 space-y-1.5">
            <label
              htmlFor="weekly-dept-filter"
              className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block"
            >
              Department Scope (Optional)
            </label>
            <div className="flex gap-2">
              <select
                id="weekly-dept-filter"
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="flex-1 min-w-0 h-11 px-3 py-0 leading-[44px] bg-[#f8fbf9] border border-[#cbdad5] rounded-xl text-xs font-bold text-[#063b30] outline-none focus:border-[#063b30] cursor-pointer"
              >
                <option value="All">All 20 Specialties</option>
                {CANONICAL_SPECIALTIES.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
              <button
                id="weekly-load-scheduled-btn"
                type="button"
                disabled={loadingScheduled}
                onClick={handleLoadScheduledDoctors}
                className="h-11 px-3.5 rounded-xl bg-[#e6f2ee] hover:bg-[#d7eae3] text-[#063b30] border border-[#b5d6c9] text-xs font-extrabold tactile-press cursor-pointer inline-flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                title="Load doctors already scheduled in this 7-day window"
              >
                {loadingScheduled ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                <span>Load Scheduled</span>
              </button>
            </div>
          </div>

          {/* Search & Add Doctor */}
          <div className="lg:col-span-6 space-y-1.5" ref={searchBoxRef}>
            <div className="flex justify-between items-center">
              <label
                htmlFor="weekly-doctor-search"
                className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block"
              >
                Add Doctor to Weekly Grid
              </label>
              <span className="text-[11px] font-bold text-[#084c3e] arabic-font">
                إضافة طبيب بالاسم أو الكود
              </span>
            </div>
            <div className="relative">
              <input
                id="weekly-doctor-search"
                type="text"
                value={searchQuery}
                placeholder={
                  deptFilter === "All"
                    ? "Search by Employee ID, English or Arabic name..."
                    : `Search ${deptFilter} doctors by ID or name...`
                }
                onChange={(e) => setSearchQuery(e.target.value)}
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
                    handleAddDoctor(suggestions[activeSuggestionIdx]);
                  }
                }}
                className="w-full h-11 pl-10 pr-9 bg-[#f8fbf9] border border-[#cbdad5] rounded-xl text-sm font-medium focus:border-[#063b30] focus:bg-white outline-none transition-colors"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setSuggestions([]);
                    setShowSuggestions(false);
                  }}
                  aria-label="Clear doctor search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}

              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute left-0 right-0 mt-1.5 bg-white border border-[#cbdad5] rounded-xl shadow-[0_16px_40px_-12px_rgba(6,59,48,0.22)] z-50 max-h-64 overflow-y-auto divide-y divide-slate-100">
                  {suggestions.map((doc, idx) => {
                    const isHighlighted = idx === activeSuggestionIdx;
                    const alreadyAdded = doctors.some(
                      (d) => normalizeDocId(d.id) === normalizeDocId(doc.id)
                    );
                    return (
                      <button
                        key={`wk-sug-${doc.id}-${idx}`}
                        type="button"
                        onMouseEnter={() => setActiveSuggestionIdx(idx)}
                        onClick={() => handleAddDoctor(doc)}
                        className={`w-full text-left px-4 py-2.5 transition-colors flex justify-between items-center text-sm cursor-pointer ${
                          isHighlighted ? "bg-[#e6f2ee]/75" : "hover:bg-[#f8fbf9]"
                        }`}
                      >
                        <div className="min-w-0 pr-3">
                          <div className="font-semibold text-slate-900 truncate flex items-center gap-2">
                            <span>{doc.name}</span>
                            {alreadyAdded && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-900">
                                In Grid
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-[#084c3e] font-medium arabic-font mt-0.5">
                            {doc.arabicName}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-[10px] font-extrabold bg-[#e6f2ee] text-[#063b30] px-2 py-0.5 rounded-full uppercase border border-[#cbdad5]">
                            {doc.department}
                          </span>
                          <div className="text-[10px] text-slate-600 font-mono tabular-nums mt-0.5">
                            ID: {doc.id}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Unlisted Doctor Trigger */}
          <div className="lg:col-span-2">
            <button
              type="button"
              onClick={() => setShowManualAdd((prev) => !prev)}
              className="w-full h-11 px-3 rounded-xl bg-white hover:bg-[#f8fbf9] text-[#063b30] border border-[#cbdad5] text-xs font-bold tactile-press cursor-pointer inline-flex items-center justify-center gap-1.5"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Unlisted Doctor</span>
            </button>
          </div>
        </div>

        {/* Inline Unlisted Doctor Form */}
        <AnimatePresence>
          {showManualAdd && (
            <motion.form
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              onSubmit={handleAddManualDoctor}
              className="overflow-hidden"
            >
              <div className="p-4 rounded-xl bg-[#e6f2ee]/50 border border-[#cbdad5] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
                <div>
                  <label className="text-[10px] font-bold text-slate-700 uppercase block mb-1">
                    Employee ID
                  </label>
                  <input
                    type="text"
                    value={manualId}
                    onChange={(e) => setManualId(e.target.value)}
                    placeholder="e.g. 4012"
                    className="w-full h-10 px-3 bg-white border border-[#cbdad5] rounded-lg text-xs font-mono outline-none focus:border-[#063b30]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-700 uppercase block mb-1">
                    English Name
                  </label>
                  <input
                    type="text"
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    placeholder="Dr. First Last"
                    className="w-full h-10 px-3 bg-white border border-[#cbdad5] rounded-lg text-xs outline-none focus:border-[#063b30]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-700 uppercase block mb-1 text-right">
                    الاسم بالعربية
                  </label>
                  <input
                    type="text"
                    dir="rtl"
                    value={manualArabicName}
                    onChange={(e) => setManualArabicName(e.target.value)}
                    placeholder="د. الاسم الكامل"
                    className="w-full h-10 px-3 bg-white border border-[#cbdad5] rounded-lg text-xs text-right outline-none focus:border-[#063b30]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-700 uppercase block mb-1">
                    Specialty
                  </label>
                  <select
                    value={manualDept}
                    onChange={(e) => setManualDept(e.target.value)}
                    className="w-full h-10 px-2.5 bg-white border border-[#cbdad5] rounded-lg text-xs font-semibold outline-none focus:border-[#063b30]"
                  >
                    {CANONICAL_SPECIALTIES.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 h-10 px-3 rounded-lg bg-[#063b30] hover:bg-[#042d24] text-white text-xs font-bold tactile-press cursor-pointer inline-flex items-center justify-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowManualAdd(false)}
                    className="h-10 px-2.5 rounded-lg bg-white border border-[#cbdad5] text-slate-600 text-xs font-bold cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        {/* Error Message */}
        {errorMsg && (
          <div
            role="alert"
            aria-live="assertive"
            className="bg-rose-50 text-rose-900 px-4 py-3 rounded-xl border border-rose-200 flex items-start gap-2.5 text-xs font-semibold"
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-700 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Batch Confirmation Receipt */}
        <AnimatePresence>
          {receipt && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              className="bg-[#e6f2ee] border border-[#b5d6c9] rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#063b30] text-white flex items-center justify-center shrink-0">
                  <CheckCircle className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#084c3e] block">
                    Weekly Schedule Saved
                  </span>
                  <h4 className="text-base font-extrabold text-[#063b30] mt-0.5">
                    {receipt.savedCount} shift assignment{receipt.savedCount === 1 ? "" : "s"} saved
                    {receipt.deletedCount > 0 ? ` · ${receipt.deletedCount} removed` : ""}
                  </h4>
                  <p className="text-xs text-[#084c3e] font-medium mt-0.5">
                    Updated for {receipt.affectedDates.length} day{receipt.affectedDates.length === 1 ? "" : "s"} this week
                    {receipt.syncedToTodayCount > 0
                      ? ` (including ${receipt.syncedToTodayCount} on duty today)`
                      : ""}
                    .
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setReceipt(null)}
                  className="px-3.5 py-2 rounded-lg bg-white hover:bg-[#f8fbf9] text-[#063b30] border border-[#b5d6c9] text-xs font-bold tactile-press cursor-pointer"
                >
                  Continue Editing
                </button>
                <button
                  type="button"
                  onClick={handleStartNewBatch}
                  className="px-3.5 py-2 rounded-lg bg-[#063b30] hover:bg-[#042d24] text-white text-xs font-bold tactile-press cursor-pointer"
                >
                  Start Fresh
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Empty State vs Multi-Doctor 7-Day Planner Grid */}
        {doctors.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-[#cbdad5] bg-[#f8fbf9] p-10 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-[#e6f2ee] border border-[#cbdad5] text-[#063b30] flex items-center justify-center mx-auto">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-[#063b30]">
                No doctors added yet
              </h3>
              <p className="text-xs text-slate-600 font-medium mt-1 max-w-md mx-auto">
                Search for a doctor above to start building the week&apos;s schedule, or choose a specialty and click <strong>Load Scheduled</strong> to view shifts already entered for{" "}
                <span className="font-mono font-bold text-[#063b30]">
                  {weekDays[0]?.formattedShort} – {weekDays[6]?.formattedShort}
                </span>
                .
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Legend Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold text-slate-600 bg-[#f8fbf9] border border-[#e4ece9] rounded-xl px-3.5 py-2">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded bg-sky-700 text-white font-bold text-[10px] inline-flex items-center justify-center">M</span>
                  Morning (8a–4p)
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded bg-amber-600 text-white font-bold text-[10px] inline-flex items-center justify-center">E</span>
                  Evening (4p–12a)
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded bg-emerald-950 text-emerald-100 font-bold text-[10px] inline-flex items-center justify-center">N</span>
                  Night (12a–8a)
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="px-1.5 h-5 rounded bg-[#063b30] text-white font-bold text-[10px] inline-flex items-center justify-center">24h</span>
                  Full Duty
                </span>
              </div>
              <span className="font-mono text-[#063b30] font-bold tabular-nums">
                {doctors.length} Doctor{doctors.length === 1 ? "" : "s"} in Planner
              </span>
            </div>

            {/* DESKTOP 7-COLUMN CLINICAL MATRIX (lg+) */}
            <div className="hidden lg:block overflow-x-auto rounded-xl border border-[#cbdad5]">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-[#f8fbf9] border-b border-[#cbdad5]">
                    <th className="py-3 px-4 text-[11px] font-extrabold uppercase tracking-wider text-[#063b30] min-w-[230px] sticky left-0 bg-[#f8fbf9] z-10 border-r border-[#e4ece9]">
                      Physician &amp; Quick Fill
                    </th>
                    {weekDays.map((day) => (
                      <th
                        key={day.isoDate}
                        className={`py-2.5 px-2 text-center border-r last:border-r-0 border-[#e4ece9] min-w-[106px] ${
                          day.isToday ? "bg-[#e6f2ee]/70" : ""
                        }`}
                      >
                        <div className="flex items-center justify-center gap-1">
                          <span className="text-xs font-extrabold text-[#063b30]">
                            {day.englishShort}
                          </span>
                          {day.isToday && (
                            <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full bg-[#063b30] text-white">
                              Today
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-bold text-[#084c3e] arabic-font">
                          {day.arabicWeekday}
                        </div>
                        <div className="text-[10px] font-mono font-semibold text-slate-500 tabular-nums">
                          {day.formattedShort}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e4ece9]">
                  {doctors.map((doc) => {
                    const key = normalizeDocId(doc.id);
                    const isHighlighted = highlightedDoctorId === key;
                    const docInit = initialSchedule[key] || {};
                    const docDraft = draftSchedule[key] || {};

                    return (
                      <tr
                        key={key}
                        className={`transition-colors ${
                          isHighlighted ? "bg-[#e6f2ee]" : "bg-white hover:bg-[#fbfdfc]"
                        }`}
                      >
                        {/* Sticky Doctor Column */}
                        <td className="py-3 px-4 align-top sticky left-0 bg-inherit z-10 border-r border-[#e4ece9]">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-xs font-extrabold text-slate-900 truncate" title={doc.name}>
                                {doc.name}
                              </div>
                              <div className="text-xs font-bold text-[#084c3e] arabic-font truncate" dir="rtl">
                                {doc.arabicName}
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-[#e6f2ee] text-[#063b30] border border-[#cbdad5]">
                                  {doc.department}
                                </span>
                                <span className="text-[10px] font-mono text-slate-500 tabular-nums">
                                  #{doc.id}
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveDoctorRow(doc.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer shrink-0"
                              title="Remove from planner view"
                              aria-label={`Remove Dr. ${doc.name} from planner`}
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* 1-Tap Row Quick-Fill Buttons */}
                          <div className="flex flex-wrap items-center gap-1 mt-2.5 pt-2 border-t border-slate-100">
                            <span className="text-[9px] font-bold uppercase text-slate-400 mr-0.5">
                              7d:
                            </span>
                            <button
                              type="button"
                              onClick={() => handleFillRow(doc.id, ["Morning shift"])}
                              className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-200 cursor-pointer"
                              title="Assign Morning shift to all 7 days"
                            >
                              All M
                            </button>
                            <button
                              type="button"
                              onClick={() => handleFillRow(doc.id, ["Evening shift"])}
                              className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 cursor-pointer"
                              title="Assign Evening shift to all 7 days"
                            >
                              All E
                            </button>
                            <button
                              type="button"
                              onClick={() => handleFillRow(doc.id, ["Night shift"])}
                              className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 cursor-pointer"
                              title="Assign Night shift to all 7 days"
                            >
                              All N
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleFillRow(doc.id, ["Morning shift", "Evening shift", "Night shift"])
                              }
                              className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#e6f2ee] hover:bg-[#d7eae3] text-[#063b30] border border-[#b5d6c9] cursor-pointer"
                              title="Assign 24h Full Duty to all 7 days"
                            >
                              24h
                            </button>
                            <button
                              type="button"
                              onClick={() => handleFillRow(doc.id, [])}
                              className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-white hover:bg-rose-50 text-slate-500 hover:text-rose-700 border border-slate-200 cursor-pointer ml-auto"
                              title="Clear all 7 days for this doctor"
                            >
                              Clear
                            </button>
                          </div>
                        </td>

                        {/* 7 Day Shift Cells */}
                        {weekDays.map((day) => {
                          const cellShifts = docDraft[day.isoDate] || [];
                          const initKey = normalizeShiftsKey(docInit[day.isoDate]);
                          const draftKey = normalizeShiftsKey(cellShifts);
                          const is24h = cellShifts.length === 3;
                          const isChanged = draftKey !== initKey;
                          const isRemoved = isChanged && draftKey === "" && initKey !== "";

                          return (
                            <td
                              key={day.isoDate}
                              className={`p-2 align-middle border-r last:border-r-0 border-[#e4ece9] ${
                                day.isToday ? "bg-[#e6f2ee]/25" : ""
                              } ${isRemoved ? "bg-rose-50/60" : ""}`}
                            >
                              <div className="grid grid-cols-2 gap-1">
                                {COMPACT_SHIFTS.map((sh) => {
                                  const active = cellShifts.includes(sh.id);
                                  return (
                                    <button
                                      key={sh.id}
                                      type="button"
                                      aria-pressed={active}
                                      aria-label={`${doc.name} ${day.isoDate} ${sh.label}`}
                                      title={`${sh.label} (${sh.ar})`}
                                      onClick={() => toggleCellShift(doc.id, day.isoDate, sh.id)}
                                      className={`h-8 rounded-lg border text-[11px] font-extrabold transition-colors tactile-press cursor-pointer flex items-center justify-center ${
                                        active ? sh.activeClass : sh.inactiveClass
                                      }`}
                                    >
                                      {sh.short}
                                    </button>
                                  );
                                })}
                                <button
                                  type="button"
                                  aria-pressed={is24h}
                                  aria-label={`${doc.name} ${day.isoDate} 24h Full Duty`}
                                  title="Toggle 24h Full Duty"
                                  onClick={() => toggleCell24h(doc.id, day.isoDate)}
                                  className={`h-8 rounded-lg border text-[10px] font-extrabold transition-colors tactile-press cursor-pointer flex items-center justify-center ${
                                    is24h
                                      ? "bg-[#063b30] text-white border-[#063b30] shadow-2xs"
                                      : "bg-[#f8fbf9] text-[#063b30] border-[#cbdad5] hover:bg-[#e6f2ee]"
                                  }`}
                                >
                                  24h
                                </button>
                              </div>

                              {/* Subtle Diff Status */}
                              <div className="h-3.5 mt-1 flex items-center justify-center">
                                {isRemoved ? (
                                  <span className="text-[9px] font-extrabold uppercase text-rose-700">
                                    Removed
                                  </span>
                                ) : isChanged ? (
                                  <span className="text-[9px] font-extrabold uppercase text-[#063b30]">
                                    • Unsaved
                                  </span>
                                ) : initKey !== "" ? (
                                  <span className="text-[9px] font-semibold text-emerald-700/80">
                                    Saved
                                  </span>
                                ) : null}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* MOBILE / TABLET STACKED DOCTOR CARDS (<lg) */}
            <div className="lg:hidden space-y-3">
              {doctors.map((doc) => {
                const key = normalizeDocId(doc.id);
                const isExpanded = expandedMobileIds[key] !== false;
                const docInit = initialSchedule[key] || {};
                const docDraft = draftSchedule[key] || {};
                const scheduledDaysCount = weekDays.filter(
                  (d) => (docDraft[d.isoDate] || []).length > 0
                ).length;

                return (
                  <div
                    key={`mob-${key}`}
                    className="rounded-xl border border-[#cbdad5] bg-white overflow-hidden"
                  >
                    <div className="p-4 bg-[#f8fbf9] flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedMobileIds((prev) => ({ ...prev, [key]: !isExpanded }))
                        }
                        className="flex-1 text-left min-w-0 cursor-pointer"
                      >
                        <div className="text-sm font-extrabold text-[#063b30] truncate">
                          {doc.name}
                        </div>
                        <div className="text-xs font-bold text-[#084c3e] arabic-font truncate">
                          {doc.arabicName}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-[#e6f2ee] text-[#063b30] border border-[#cbdad5]">
                            {doc.department}
                          </span>
                          <span className="text-[10px] font-mono text-slate-600">
                            {scheduledDaysCount}/7 days
                          </span>
                        </div>
                      </button>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleRemoveDoctorRow(doc.id)}
                          className="p-2 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer"
                          aria-label={`Remove Dr. ${doc.name}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedMobileIds((prev) => ({ ...prev, [key]: !isExpanded }))
                          }
                          className="p-2 text-[#063b30] rounded-lg cursor-pointer"
                          aria-label="Toggle doctor schedule"
                        >
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="p-3 space-y-2.5 border-t border-[#e4ece9]">
                        {/* Mobile Row Quick Fill */}
                        <div className="flex flex-wrap items-center gap-1.5 pb-2 border-b border-slate-100">
                          <span className="text-[10px] font-bold uppercase text-slate-500">
                            Quick Fill 7d:
                          </span>
                          <button
                            type="button"
                            onClick={() => handleFillRow(doc.id, ["Morning shift"])}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-sky-50 text-sky-900 border border-sky-200 cursor-pointer"
                          >
                            All Morning
                          </button>
                          <button
                            type="button"
                            onClick={() => handleFillRow(doc.id, ["Evening shift"])}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-50 text-amber-900 border border-amber-200 cursor-pointer"
                          >
                            All Evening
                          </button>
                          <button
                            type="button"
                            onClick={() => handleFillRow(doc.id, ["Night shift"])}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 text-slate-900 border border-slate-300 cursor-pointer"
                          >
                            All Night
                          </button>
                          <button
                            type="button"
                            onClick={() => handleFillRow(doc.id, [])}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white text-rose-700 border border-rose-200 cursor-pointer ml-auto"
                          >
                            Clear
                          </button>
                        </div>

                        {weekDays.map((day) => {
                          const cellShifts = docDraft[day.isoDate] || [];
                          const initKey = normalizeShiftsKey(docInit[day.isoDate]);
                          const draftKey = normalizeShiftsKey(cellShifts);
                          const is24h = cellShifts.length === 3;
                          const isRemoved = draftKey !== initKey && draftKey === "" && initKey !== "";

                          return (
                            <div
                              key={`mob-${key}-${day.isoDate}`}
                              className={`p-2.5 rounded-xl border ${
                                isRemoved
                                  ? "border-rose-200 bg-rose-50/50"
                                  : day.isToday
                                  ? "border-[#b5d6c9] bg-[#e6f2ee]/35"
                                  : "border-[#e4ece9] bg-[#fbfdfc]"
                              }`}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-extrabold text-[#063b30]">
                                    {day.englishFull} · {day.formattedShort}
                                  </span>
                                  {day.isToday && (
                                    <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full bg-[#063b30] text-white">
                                      Today
                                    </span>
                                  )}
                                </div>
                                <span className="text-xs font-bold text-[#084c3e] arabic-font">
                                  {day.arabicWeekday}
                                </span>
                              </div>
                              <div className="grid grid-cols-4 gap-1.5">
                                {COMPACT_SHIFTS.map((sh) => {
                                  const active = cellShifts.includes(sh.id);
                                  return (
                                    <button
                                      key={sh.id}
                                      type="button"
                                      aria-pressed={active}
                                      onClick={() => toggleCellShift(doc.id, day.isoDate, sh.id)}
                                      className={`min-h-[44px] rounded-lg border text-xs font-extrabold tactile-press cursor-pointer ${
                                        active ? sh.activeClass : sh.inactiveClass
                                      }`}
                                    >
                                      {sh.label}
                                    </button>
                                  );
                                })}
                                <button
                                  type="button"
                                  aria-pressed={is24h}
                                  onClick={() => toggleCell24h(doc.id, day.isoDate)}
                                  className={`min-h-[44px] rounded-lg border text-xs font-extrabold tactile-press cursor-pointer ${
                                    is24h
                                      ? "bg-[#063b30] text-white border-[#063b30]"
                                      : "bg-white text-[#063b30] border-[#cbdad5]"
                                  }`}
                                >
                                  24h
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Sticky Bottom Summary & Batch Save Bar */}
        <div className="pt-4 border-t border-[#e4ece9] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-700 font-mono tabular-nums">
            <span className="px-2.5 py-1 rounded-lg bg-[#e6f2ee] text-[#063b30] border border-[#cbdad5]">
              {doctors.length} Doctor{doctors.length === 1 ? "" : "s"}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-[#f8fbf9] text-slate-700 border border-[#cbdad5]">
              {totalScheduledCells} Scheduled Day{totalScheduledCells === 1 ? "" : "s"}
            </span>
            {dirtyCount > 0 && (
              <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-900 border border-amber-200">
                {entriesToSave.length} to save
                {deletionsToApply.length > 0 ? ` · ${deletionsToApply.length} to remove` : ""}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {doctors.length > 0 && (
              <button
                id="weekly-clear-planner-btn"
                type="button"
                disabled={saving}
                onClick={() =>
                  runWithUnsavedGuard("clear the planner grid", handleStartNewBatch)
                }
                className="px-4 py-3 rounded-xl bg-[#f8fbf9] hover:bg-slate-100 text-slate-700 border border-[#cbdad5] text-xs font-bold uppercase tactile-press cursor-pointer disabled:opacity-40 inline-flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            )}

            <button
              id="weekly-save-roster-btn"
              type="button"
              disabled={saving || dirtyCount === 0}
              onClick={handleSaveWeeklyRoster}
              className="flex-1 sm:flex-initial px-6 h-12 sm:h-13 bg-[#063b30] hover:bg-[#042d24] text-white rounded-xl font-extrabold text-sm sm:text-base tracking-wide tactile-press flex items-center justify-center gap-2 disabled:opacity-45 disabled:cursor-not-allowed shadow-sm cursor-pointer"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving Schedule...</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span>
                    Save Weekly Schedule{dirtyCount > 0 ? ` (${dirtyCount})` : ""}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
