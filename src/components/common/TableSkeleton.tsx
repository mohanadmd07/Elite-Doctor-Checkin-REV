import React from "react";

interface TableSkeletonProps {
  rows?: number;
  cols?: number;
  className?: string;
}

export const TableSkeleton: React.FC<TableSkeletonProps> = ({
  rows = 5,
  cols = 6,
  className = ""
}) => {
  return (
    <div className={`w-full overflow-hidden animate-pulse ${className}`}>
      <table className="w-full text-left text-xs">
        <tbody className="divide-y divide-slate-100">
          {Array.from({ length: rows }).map((_, rIdx) => (
            <tr key={`skel-row-${rIdx}`} className="bg-white">
              {Array.from({ length: cols }).map((_, cIdx) => (
                <td key={`skel-cell-${rIdx}-${cIdx}`} className="py-3.5 px-4">
                  <div
                    className="h-4 bg-slate-200/70 rounded-md"
                    style={{
                      width: `${Math.max(40, 30 + ((rIdx * 17 + cIdx * 23) % 55))}%`
                    }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export const CardGridSkeleton: React.FC<{ cards?: number }> = ({ cards = 4 }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-pulse">
      {Array.from({ length: cards }).map((_, idx) => (
        <div key={`skel-card-${idx}`} className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-[1px] flex-1 bg-slate-200" />
            <div className="h-3 w-24 bg-slate-200 rounded" />
            <div className="h-[1px] flex-1 bg-slate-200" />
          </div>
          <div className="space-y-2">
            {[1, 2].map((item) => (
              <div key={item} className="h-16 bg-slate-100/90 rounded-lg border border-slate-200/60 p-3" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
