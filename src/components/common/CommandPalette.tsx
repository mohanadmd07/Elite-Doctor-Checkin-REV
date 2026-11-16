import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Search,
  Layers,
  Database,
  Copy,
  PhoneCall,
  Moon,
  Stethoscope,
  Plus,
  Send,
  FileSpreadsheet,
  Phone,
  X,
  CornerDownLeft
} from "lucide-react";

export interface CommandPaletteDoctor {
  id: string;
  name: string;
  arabicName: string;
  department: string;
  mobileNumber?: string;
}

interface CommandActionItem {
  id: string;
  category: "Navigation" | "Quick Action" | "Physician";
  label: string;
  sublabel?: string;
  arabicLabel?: string;
  badge?: string;
  icon: React.ComponentType<{ className?: string }>;
  onSelect: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  adminRole: "admin" | "coordinator" | null;
  doctors: CommandPaletteDoctor[];
  onNavigateTab: (tab: "roster" | "database" | "duplicates" | "calls" | "prayer") => void;
  onSwitchToCheckin: () => void;
  onOpenAddCheckin: () => void;
  onOpenCustomCall: () => void;
  onDownloadDailyXls: () => void;
  onSelectDoctor: (doc: CommandPaletteDoctor) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  adminRole,
  doctors,
  onNavigateTab,
  onSwitchToCheckin,
  onOpenAddCheckin,
  onOpenCustomCall,
  onDownloadDailyXls,
  onSelectDoctor
}) => {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [isOpen]);

  const baseActions: CommandActionItem[] = useMemo(() => {
    const items: CommandActionItem[] = [];
    if (adminRole === "admin") {
      items.push({
        id: "nav-roster",
        category: "Navigation",
        label: "Active Roster & Operations",
        sublabel: "Live check-ins, historical dates & Excel/WhatsApp export",
        icon: Layers,
        onSelect: () => onNavigateTab("roster")
      });
    }
    items.push({
      id: "nav-database",
      category: "Navigation",
      label: "Physician Database Management",
      sublabel: `${doctors.length} physicians registered`,
      icon: Database,
      onSelect: () => onNavigateTab("database")
    });
    if (adminRole === "admin") {
      items.push({
        id: "nav-duplicates",
        category: "Navigation",
        label: "Duplicated IDs Audit",
        sublabel: "Resolve employee ID collisions",
        icon: Copy,
        onSelect: () => onNavigateTab("duplicates")
      });
    }
    items.push(
      {
        id: "nav-calls",
        category: "Navigation",
        label: "Inpatient Ward Doctor Calls",
        sublabel: "Real-time WhatsApp call dispatcher & diagnostics",
        icon: PhoneCall,
        onSelect: () => onNavigateTab("calls")
      },
      {
        id: "nav-prayer",
        category: "Navigation",
        label: "Alexandria Prayer Times Automation",
        sublabel: "Schedule, group targeting & pause controls",
        icon: Moon,
        onSelect: () => onNavigateTab("prayer")
      },
      {
        id: "nav-checkin",
        category: "Navigation",
        label: "Switch to Physician Check-In Kiosk",
        sublabel: "Public check-in terminal view",
        icon: Stethoscope,
        onSelect: onSwitchToCheckin
      }
    );

    if (adminRole === "admin") {
      items.push(
        {
          id: "act-add-checkin",
          category: "Quick Action",
          label: "Add Doctor Check-In to Roster",
          sublabel: "Register a physician for today or any historical date",
          icon: Plus,
          onSelect: onOpenAddCheckin
        },
        {
          id: "act-download-xls",
          category: "Quick Action",
          label: "Download Today's Roster Excel (.xlsx)",
          sublabel: "Styled clinical sheet with Arabic/English headers",
          icon: FileSpreadsheet,
          onSelect: onDownloadDailyXls
        }
      );
    }

    items.push({
      id: "act-custom-call",
      category: "Quick Action",
      label: "Dispatch Custom Ward Doctor Call",
      sublabel: "Page on-duty specialty physicians via WhatsApp",
      icon: Send,
      onSelect: onOpenCustomCall
    });

    return items;
  }, [adminRole, doctors.length, onNavigateTab, onSwitchToCheckin, onOpenAddCheckin, onOpenCustomCall, onDownloadDailyXls]);

  const filteredItems: CommandActionItem[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return baseActions;
    }

    const matchingActions = baseActions.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        (item.sublabel && item.sublabel.toLowerCase().includes(q))
    );

    const matchingDoctors: CommandActionItem[] = doctors
      .filter(
        (doc) =>
          doc.id.toLowerCase().includes(q) ||
          doc.name.toLowerCase().includes(q) ||
          (doc.arabicName && doc.arabicName.toLowerCase().includes(q)) ||
          doc.department.toLowerCase().includes(q) ||
          (doc.mobileNumber && doc.mobileNumber.includes(q))
      )
      .slice(0, 8)
      .map((doc) => ({
        id: `doc-${doc.id}-${doc.name}`,
        category: "Physician",
        label: doc.name,
        arabicLabel: doc.arabicName,
        sublabel: `ID ${doc.id} • ${doc.department}${doc.mobileNumber ? ` • ${doc.mobileNumber}` : ""}`,
        badge: doc.mobileNumber ? "Edit / View" : "Add Phone",
        icon: doc.mobileNumber ? Stethoscope : Phone,
        onSelect: () => onSelectDoctor(doc)
      }));

    return [...matchingActions, ...matchingDoctors];
  }, [query, baseActions, doctors, onSelectDoctor]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (filteredItems.length > 0 ? (prev + 1) % filteredItems.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) =>
        filteredItems.length > 0 ? (prev - 1 + filteredItems.length) % filteredItems.length : 0
      );
    } else if (e.key === "Enter" && filteredItems[activeIndex]) {
      e.preventDefault();
      filteredItems[activeIndex].onSelect();
      onClose();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-[2px] flex items-start justify-center pt-[12vh] px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Quick Command Palette"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-white rounded-2xl border border-[#cbdad5] shadow-[0_24px_60px_-15px_rgba(6,59,48,0.28)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#e4ece9] bg-[#f8fbf9]">
          <Search className="w-4 h-4 text-[#063b30] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to tab, run action, or search physician by ID / Name..."
            className="flex-1 bg-transparent text-sm font-medium text-slate-900 placeholder:text-slate-400 outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="p-1 text-slate-400 hover:text-slate-700 rounded-md cursor-pointer"
              aria-label="Clear command search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono font-semibold text-slate-500 bg-white border border-slate-200 rounded">
            ESC
          </kbd>
        </div>

        <div className="max-h-[55vh] overflow-y-auto divide-y divide-slate-100 py-1">
          {filteredItems.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500">
              No matching commands or physicians for "{query}".
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const Icon = item.icon;
              const isActive = idx === activeIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => {
                    item.onSelect();
                    onClose();
                  }}
                  className={`w-full px-4 py-2.5 text-left flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                    isActive ? "bg-[#e6f2ee]/80 text-[#063b30]" : "hover:bg-slate-50 text-slate-800"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                        isActive
                          ? "bg-[#063b30] text-white border-[#063b30]"
                          : "bg-[#f8fbf9] text-[#063b30] border-[#cbdad5]"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold truncate">{item.label}</span>
                        {item.arabicLabel && item.arabicLabel !== item.label && (
                          <span className="text-xs font-semibold text-emerald-800 arabic-font truncate" dir="rtl">
                            {item.arabicLabel}
                          </span>
                        )}
                      </div>
                      {item.sublabel && (
                        <p className="text-[11px] text-slate-500 truncate mt-0.5 font-mono tabular-nums">
                          {item.sublabel}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                      {item.badge || item.category}
                    </span>
                    {isActive && <CornerDownLeft className="w-3.5 h-3.5 text-[#063b30]" />}
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="px-4 py-2 bg-[#f8fbf9] border-t border-[#e4ece9] flex items-center justify-between text-[10px] text-slate-500 font-medium">
          <div className="flex items-center gap-3">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>ESC Close</span>
          </div>
          <span className="font-mono text-[#063b30] font-semibold">ELITE COMMAND</span>
        </div>
      </div>
    </div>
  );
};
