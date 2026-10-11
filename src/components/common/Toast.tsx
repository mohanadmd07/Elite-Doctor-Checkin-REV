import React, { createContext, useContext, useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from "lucide-react";

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastContextValue {
  showToast: (type: ToastType, title: string, message?: string, duration?: number) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (type: ToastType, title: string, message?: string, duration = 4500) => {
      const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      setToasts((prev) => [...prev, { id, type, title, message, duration }]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast]
  );

  const success = useCallback((title: string, message?: string) => showToast("success", title, message), [showToast]);
  const error = useCallback((title: string, message?: string) => showToast("error", title, message, 6000), [showToast]);
  const info = useCallback((title: string, message?: string) => showToast("info", title, message), [showToast]);
  const warning = useCallback((title: string, message?: string) => showToast("warning", title, message, 5000), [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, success, error, info, warning, removeToast }}>
      {children}
      {/* Toast Viewport in top-right */}
      <div 
        role="region" 
        aria-label="Notifications" 
        className="fixed top-5 right-5 z-[9999] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-3 sm:px-0"
      >
        <AnimatePresence>
          {toasts.map((toast) => {
            const isSuccess = toast.type === "success";
            const isError = toast.type === "error";
            const isWarning = toast.type === "warning";

            const borderClass = isSuccess
              ? "border-emerald-200 bg-white text-emerald-950"
              : isError
              ? "border-rose-200 bg-white text-rose-950"
              : isWarning
              ? "border-amber-200 bg-white text-amber-950"
              : "border-slate-200 bg-white text-slate-900";

            const accentBar = isSuccess
              ? "bg-[#063b30]"
              : isError
              ? "bg-rose-600"
              : isWarning
              ? "bg-amber-500"
              : "bg-slate-700";

            return (
              <motion.div
                key={toast.id}
                layout
                initial={{ opacity: 0, y: -16, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -12, scale: 0.92 }}
                transition={{ duration: 0.2 }}
                className={`pointer-events-auto rounded-xl border shadow-lg overflow-hidden flex items-stretch text-xs ${borderClass}`}
              >
                <div className={`w-1.5 shrink-0 ${accentBar}`} />
                <div className="p-3.5 flex items-start gap-2.5 flex-1 min-w-0">
                  <div className="shrink-0 mt-0.5">
                    {isSuccess && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                    {isError && <AlertCircle className="w-4 h-4 text-rose-600" />}
                    {isWarning && <AlertTriangle className="w-4 h-4 text-amber-500" />}
                    {toast.type === "info" && <Info className="w-4 h-4 text-slate-600" />}
                  </div>
                  <div className="flex-1 min-w-0 pr-1">
                    <p className="font-bold leading-tight">{toast.title}</p>
                    {toast.message && (
                      <p className="text-[11px] text-slate-600 mt-1 leading-relaxed break-words">
                        {toast.message}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => removeToast(toast.id)}
                    className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors shrink-0"
                    aria-label="Dismiss notification"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};
