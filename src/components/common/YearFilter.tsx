import React from 'react';
import { Calendar, RotateCcw } from 'lucide-react';

export interface YearFilterProps {
  selectedYear: string;
  onYearChange: (year: string) => void;
  availableYears: string[];
  selectedAcademicYear?: string;
  onAcademicYearChange?: (academicYear: string) => void;
  availableAcademicYears?: string[];
  includeAllYearOption?: boolean;
  label?: string;
  className?: string;
}

export const YearFilter: React.FC<YearFilterProps> = ({
  selectedYear,
  onYearChange,
  availableYears,
  selectedAcademicYear,
  onAcademicYearChange,
  availableAcademicYears = [],
  includeAllYearOption = false,
  label = 'Tahun Kalender (Jan–Des)',
  className = ''
}) => {
  const currentYear = String(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric'
    }).format(new Date())
  );

  const normalizedYears = React.useMemo(() => {
    const set = new Set<string>(availableYears.filter(Boolean));
    set.add(currentYear);
    set.add(String(Number(currentYear) - 1));
    set.add(String(Number(currentYear) - 2));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [availableYears, currentYear]);

  return (
    <div className={`flex flex-wrap items-center gap-2.5 ${className}`}>
      {/* Tahun Kalender Selector */}
      <div className="flex items-center gap-2 bg-white border border-slate-200/90 rounded-xl px-3 py-1.5 shadow-2xs">
        <Calendar className="w-3.5 h-3.5 text-[#315FEA] shrink-0" />
        <span className="text-[11px] font-semibold text-slate-500 whitespace-nowrap">
          {label}:
        </span>
        <div className="flex items-center gap-1">
          {includeAllYearOption && (
            <button
              type="button"
              onClick={() => onYearChange('all')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                selectedYear === 'all'
                  ? 'bg-[#101D35] text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Semua
            </button>
          )}
          {normalizedYears.slice(0, 4).map(yr => (
            <button
              key={yr}
              type="button"
              onClick={() => onYearChange(yr)}
              className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold tabular-nums transition-colors whitespace-nowrap ${
                selectedYear === yr
                  ? 'bg-[#315FEA] text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {yr}
            </button>
          ))}
          <select
            value={selectedYear}
            onChange={e => onYearChange(e.target.value)}
            aria-label={label}
            className="ml-1 py-1 pl-2 pr-6 bg-[#F5F7FB] border border-slate-200 rounded-lg text-xs font-mono font-bold text-[#101D35] focus:outline-none focus:border-[#315FEA] tabular-nums"
          >
            {includeAllYearOption && <option value="all">Semua Tahun</option>}
            {normalizedYears.map(yr => (
              <option key={yr} value={yr}>
                Tahun {yr}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tahun Pelajaran Selector (Optional) */}
      {onAcademicYearChange && availableAcademicYears.length > 0 && (
        <div className="flex items-center gap-2 bg-white border border-slate-200/90 rounded-xl px-3 py-1.5 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 whitespace-nowrap">
            Tahun Pelajaran:
          </span>
          <select
            value={selectedAcademicYear || 'all'}
            onChange={e => onAcademicYearChange(e.target.value)}
            aria-label="Filter Tahun Pelajaran"
            className="py-1 pl-2 pr-6 bg-[#F5F7FB] border border-slate-200 rounded-lg text-xs font-mono font-bold text-[#101D35] focus:outline-none focus:border-[#315FEA] tabular-nums"
          >
            <option value="all">Semua TP</option>
            {availableAcademicYears.map(tp => (
              <option key={tp} value={tp}>
                TP {tp}
              </option>
            ))}
          </select>
        </div>
      )}

      {(selectedYear !== currentYear || (selectedAcademicYear && selectedAcademicYear !== 'all')) && (
        <button
          type="button"
          onClick={() => {
            onYearChange(currentYear);
            if (onAcademicYearChange) onAcademicYearChange('all');
          }}
          className="px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:text-[#315FEA] bg-white border border-slate-200/80 hover:bg-slate-50 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Tahun Berjalan ({currentYear})</span>
        </button>
      )}
    </div>
  );
};
