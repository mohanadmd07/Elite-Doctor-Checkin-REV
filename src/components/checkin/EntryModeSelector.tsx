import React from "react";
import { motion } from "motion/react";
import { Stethoscope, CalendarDays, ArrowRight, Users, Clock } from "lucide-react";
import { buildRollingWeekDates } from "../../utils/timezone.ts";

interface EntryModeSelectorProps {
  activeSheetDate: string;
  todayCheckinsCount: number;
  onSelectMode: (mode: "daily" | "weekly") => void;
}

export function EntryModeSelector({
  activeSheetDate,
  todayCheckinsCount,
  onSelectMode,
}: EntryModeSelectorProps) {
  const weekDays = buildRollingWeekDates(activeSheetDate, 0, 7, activeSheetDate);
  const firstDay = weekDays[0];
  const lastDay = weekDays[weekDays.length - 1];

  return (
    <motion.div
      key="entry-mode-selector"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
      className="max-w-3xl mx-auto w-full"
    >
      <div className="bg-white rounded-2xl border border-[#cbdad5] p-6 sm:p-8 shadow-[0_18px_40px_-20px_rgba(6,59,48,0.16)]">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 pb-5 mb-7 border-b border-[#e4ece9]">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#e6f2ee] border border-[#cbdad5] text-[#063b30] flex items-center justify-center shrink-0">
              <Stethoscope className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-[#063b30]">
                Doctors Check-In
              </h2>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                <p className="text-xs text-slate-600 font-medium">
                  Choose how you would like to enter doctors
                </p>
                <span className="text-slate-300 hidden sm:inline">•</span>
                <span className="text-xs text-[#084c3e] font-bold arabic-font" dir="rtl">
                  اختر نوع التسجيل
                </span>
              </div>
            </div>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-bold text-[#063b30] bg-[#f8fbf9] border border-[#cbdad5] px-2.5 py-1 rounded-full shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
            Live Terminal
          </span>
        </div>

        {/* Two Entry Mode Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
          {/* Card 1: Daily Doctor */}
          <button
            id="entry-mode-daily-btn"
            type="button"
            onClick={() => onSelectMode("daily")}
            className="group relative flex flex-col justify-between text-left p-6 rounded-2xl border-2 border-[#cbdad5] bg-[#f8fbf9] hover:bg-white hover:border-[#063b30] hover:shadow-[0_14px_30px_-14px_rgba(6,59,48,0.22)] transition-all duration-200 tactile-press cursor-pointer min-h-[230px]"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-4">
                <div className="w-12 h-12 rounded-xl bg-[#063b30] text-white flex items-center justify-center shadow-xs group-hover:bg-[#042d24] transition-colors">
                  <Stethoscope className="w-6 h-6" />
                </div>
                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full bg-[#e6f2ee] text-[#063b30] border border-[#b5d6c9] font-mono tabular-nums">
                  <Clock className="w-3 h-3" />
                  {firstDay ? `${firstDay.englishShort} ${firstDay.formattedShort}` : "Today"}
                </span>
              </div>

              <h3 className="text-lg sm:text-xl font-extrabold text-[#063b30] tracking-tight">
                Daily Doctor
              </h3>
              <p className="text-sm font-bold text-[#084c3e] arabic-font mt-0.5" dir="rtl">
                تسجيل طبيب يومي
              </p>
              <p className="text-xs text-slate-600 font-medium mt-3 leading-relaxed">
                Check in a doctor for today&apos;s shifts.
              </p>
            </div>

            <div className="mt-5 pt-4 border-t border-[#e4ece9] flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[11px] font-bold text-slate-600 font-mono tabular-nums whitespace-nowrap">
                {todayCheckinsCount} on duty today
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[#063b30] group-hover:translate-x-0.5 transition-transform whitespace-nowrap">
                <span>Check In</span>
                <ArrowRight className="w-4 h-4 shrink-0" />
              </span>
            </div>
          </button>

          {/* Card 2: Weekly Doctors */}
          <button
            id="entry-mode-weekly-btn"
            type="button"
            onClick={() => onSelectMode("weekly")}
            className="group relative flex flex-col justify-between text-left p-6 rounded-2xl border-2 border-[#cbdad5] bg-[#f8fbf9] hover:bg-white hover:border-[#063b30] hover:shadow-[0_14px_30px_-14px_rgba(6,59,48,0.22)] transition-all duration-200 tactile-press cursor-pointer min-h-[230px]"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-4">
                <div className="w-12 h-12 rounded-xl bg-[#e6f2ee] border border-[#b5d6c9] text-[#063b30] flex items-center justify-center shadow-2xs group-hover:bg-[#063b30] group-hover:text-white group-hover:border-[#063b30] transition-colors">
                  <CalendarDays className="w-6 h-6" />
                </div>
                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full bg-white text-[#063b30] border border-[#cbdad5] font-mono tabular-nums">
                  {firstDay && lastDay
                    ? `${firstDay.formattedShort} → ${lastDay.formattedShort}`
                    : "Next 7 Days"}
                </span>
              </div>

              <h3 className="text-lg sm:text-xl font-extrabold text-[#063b30] tracking-tight">
                Weekly Doctors
              </h3>
              <p className="text-sm font-bold text-[#084c3e] arabic-font mt-0.5" dir="rtl">
                جدول أطباء أسبوعي
              </p>
              <p className="text-xs text-slate-600 font-medium mt-3 leading-relaxed">
                Enter shifts for one or more doctors across the coming week.
              </p>
            </div>

            <div className="mt-5 pt-4 border-t border-[#e4ece9] flex items-center justify-between gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 whitespace-nowrap">
                <Users className="w-3.5 h-3.5 text-[#084c3e] shrink-0" />
                Multiple doctors · 7 days
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[#063b30] group-hover:translate-x-0.5 transition-transform whitespace-nowrap">
                <span>Open Schedule</span>
                <ArrowRight className="w-4 h-4 shrink-0" />
              </span>
            </div>
          </button>
        </div>
      </div>
    </motion.div>
  );
}
