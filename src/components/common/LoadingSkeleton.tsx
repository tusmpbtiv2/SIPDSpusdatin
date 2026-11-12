import React from 'react';

export interface LoadingSkeletonProps {
  variant?: 'table' | 'tbody' | 'card' | 'stat' | 'text';
  rows?: number;
  columns?: number;
  count?: number;
  className?: string;
}

export const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({
  variant = 'table',
  rows = 5,
  columns = 5,
  count = 1,
  className = ''
}) => {
  if (variant === 'stat') {
    const statItems = Array.from({ length: count }).map((_, idx) => (
      <div
        key={idx}
        className={`p-5 bg-white rounded-2xl border border-slate-200/80 shadow-2xs animate-pulse ${className}`}
      >
        <div className="flex items-start justify-between">
          <div className="space-y-2.5 flex-1">
            <div className="h-3 bg-slate-200/80 rounded-md w-24" />
            <div className="h-7 bg-slate-200 rounded-lg w-20" />
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-100 shrink-0" />
        </div>
        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
          <div className="h-2.5 bg-slate-100 rounded w-28" />
          <div className="h-2.5 bg-slate-100 rounded w-12" />
        </div>
      </div>
    ));

    if (count > 1) {
      return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{statItems}</div>;
    }
    return <>{statItems}</>;
  }

  if (variant === 'card') {
    const cardItems = Array.from({ length: count }).map((_, cIdx) => (
      <div
        key={cIdx}
        className={`p-6 bg-white rounded-2xl border border-slate-200/80 shadow-2xs animate-pulse space-y-4 ${className}`}
      >
        <div className="h-4 bg-slate-200 rounded-md w-1/3" />
        <div className="space-y-2.5">
          {Array.from({ length: rows }).map((__, idx) => (
            <div key={idx} className="h-3.5 bg-slate-100 rounded-md w-full" />
          ))}
        </div>
      </div>
    ));

    if (count > 1) {
      return <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">{cardItems}</div>;
    }
    return <>{cardItems}</>;
  }

  if (variant === 'text') {
    return (
      <div className={`space-y-2 animate-pulse ${className}`}>
        {Array.from({ length: rows }).map((_, idx) => (
          <div
            key={idx}
            className="h-3.5 bg-slate-200/70 rounded-md"
            style={{ width: idx === rows - 1 ? '65%' : '100%' }}
          />
        ))}
      </div>
    );
  }

  const tableRows = Array.from({ length: rows }).map((_, rIdx) => (
    <tr key={rIdx} className="animate-pulse">
      {Array.from({ length: columns }).map((__, cIdx) => (
        <td key={cIdx} className="py-3.5 px-4">
          <div
            className={`h-4 bg-slate-100 rounded-md ${
              cIdx === 0 ? 'w-12' : cIdx % 2 === 0 ? 'w-3/4' : 'w-2/3'
            }`}
          />
        </td>
      ))}
    </tr>
  ));

  if (variant === 'tbody') {
    return <>{tableRows}</>;
  }

  return (
    <div className={`bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden ${className}`}>
      <table className="w-full text-left border-collapse">
        <tbody className="divide-y divide-slate-100">{tableRows}</tbody>
      </table>
    </div>
  );
};
