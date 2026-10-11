import React from "react";
import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  className = ""
}) => {
  return (
    <div className={`py-12 px-4 text-center flex flex-col items-center justify-center space-y-2.5 ${className}`}>
      <div className="w-12 h-12 rounded-2xl bg-[#e6f2ee] text-[#063b30] flex items-center justify-center shadow-xs">
        <Icon className="w-6 h-6 stroke-[1.75]" />
      </div>
      <h4 className="font-extrabold text-slate-800 text-sm tracking-tight">{title}</h4>
      <p className="text-xs text-slate-500 max-w-sm leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-2 px-3.5 py-1.5 bg-[#063b30] hover:bg-[#042d24] text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};
