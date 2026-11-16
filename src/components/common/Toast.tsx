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

            const containerClass = isSuccess
              ? "border-[#b5d6c9] bg-white text-[#063b30]"
              : isError
              ? "border-rose-200 bg-white text-rose-950"
              : isWarning
              ? "border-amber-200 bg-white text-amber-950"
              : "border-slate-200 bg-white text-slate-900";

            const iconBgClass = isSuccess
              ? "bg-[#e6f2ee] text-[#063b30]"
              : isError
              ? "bg-rose-50 text-rose-700"
              : isWarning
              ? "bg-amber-50 text-amber-700"
              : "bg-slate-100 text-slate-700";

            const messageClass = isSuccess
              ? "text-emerald-900/75"
              : isError
              ? "text-rose-800/80"
              : isWarning
              ? "text-amber-900/80"
              : "text-slate-600";

            return (
              <motion.div
                key={toast.id}
                layout
                initial={{ opacity: 0, y: -12, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.96 }}
                transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
                className={`pointer-events-auto rounded-xl border shadow-[0_12px_30px_-10px_rgba(6,59,48,0.14)] overflow-hidden flex items-start gap-3 p-3.5 text-xs ${containerClass}`}
              >
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${iconBgClass}`}>
                  {isSuccess && <CheckCircle2 className="w-4 h-4" />}
                  {isError && <AlertCircle className="w-4 h-4" />}
                  {isWarning && <AlertTriangle className="w-4 h-4" />}
                  {toast.type === "info" && <Info className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <p className="font-bold leading-tight">{toast.title}</p>
                  {toast.message && (
                    <p className={`text-[11px] mt-1 leading-relaxed break-words ${messageClass}`}>
                      {toast.message}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => removeToast(toast.id)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0 cursor-pointer"
                  aria-label="Dismiss notification"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};
