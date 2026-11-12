import React from 'react';
import { Clock, Calendar, RotateCcw } from 'lucide-react';

export type SemesterPeriod = 'all' | 'ganjil' | 'genap';

export interface PeriodFilterProps {
  semester: SemesterPeriod;
  onSemesterChange: (semester: SemesterPeriod) => void;
  selectedMonth?: string; // 'all' | '01'..'12'
  onMonthChange?: (month: string) => void;
  dateFrom?: string;
  dateTo?: string;
  onDateRangeChange?: (dateFrom: string, dateTo: string) => void;
  onReset?: () => void;
  className?: string;
}

const MONTHS_OPTIONS = [
  { value: 'all', label: 'Semua Bulan (Jan–Des)' },
  { value: '01', label: '01 - Januari' },
  { value: '02', label: '02 - Februari' },
  { value: '03', label: '03 - Maret' },
  { value: '04', label: '04 - April' },
  { value: '05', label: '05 - Mei' },
  { value: '06', label: '06 - Juni' },
  { value: '07', label: '07 - Juli' },
  { value: '08', label: '08 - Agustus' },
  { value: '09', label: '09 - September' },
  { value: '10', label: '10 - Oktober' },
  { value: '11', label: '11 - November' },
  { value: '12', label: '12 - Desember' }
];

export const PeriodFilter: React.FC<PeriodFilterProps> = ({
  semester,
  onSemesterChange,
  selectedMonth = 'all',
  onMonthChange,
  dateFrom = '',
  dateTo = '',
  onDateRangeChange,
  onReset,
  className = ''
}) => {
  const hasCustomFilter =
    semester !== 'all' || selectedMonth !== 'all' || Boolean(dateFrom) || Boolean(dateTo);

  return (
    <div className={`flex flex-wrap items-center gap-2.5 text-xs ${className}`}>
      {/* Segmented Semester Period */}
      <div className="inline-flex items-center gap-1 p-1 bg-[#F5F7FB] border border-slate-200/90 rounded-xl">
        <span className="px-2 text-[11px] font-semibold text-slate-500 inline-flex items-center gap-1 whitespace-nowrap">
          <Clock className="w-3 h-3 text-[#315FEA]" />
          Periode:
        </span>
        <button
          type="button"
          onClick={() => onSemesterChange('all')}
          className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
            semester === 'all'
              ? 'bg-white text-[#101D35] shadow-2xs font-bold'
              : 'text-slate-600 hover:text-[#101D35]'
          }`}
        >
          1 Tahun Penuh (Jan–Des)
        </button>
        <button
          type="button"
          onClick={() => onSemesterChange('ganjil')}
          className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
            semester === 'ganjil'
              ? 'bg-white text-[#315FEA] shadow-2xs font-bold'
              : 'text-slate-600 hover:text-[#101D35]'
          }`}
        >
          Sem. Ganjil (Jul–Des)
        </button>
        <button
          type="button"
          onClick={() => onSemesterChange('genap')}
          className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
            semester === 'genap'
              ? 'bg-white text-[#315FEA] shadow-2xs font-bold'
              : 'text-slate-600 hover:text-[#101D35]'
          }`}
        >
          Sem. Genap (Jan–Jun)
        </button>
      </div>

      {/* Month Filter */}
      {onMonthChange && (
        <div className="flex items-center gap-1.5 bg-white border border-slate-200/90 rounded-xl px-2.5 py-1.5 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 whitespace-nowrap">Bulan:</span>
          <select
            value={selectedMonth}
            onChange={e => onMonthChange(e.target.value)}
            aria-label="Filter Bulan"
            className="py-0.5 pr-5 bg-transparent text-xs font-semibold text-[#101D35] focus:outline-none tabular-nums"
          >
            {MONTHS_OPTIONS.map(m => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Optional Date Range */}
      {onDateRangeChange && (
        <div className="flex flex-wrap items-center gap-1.5 bg-white border border-slate-200/90 rounded-xl px-2.5 py-1 shadow-2xs">
          <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <input
            type="date"
            value={dateFrom}
            onChange={e => onDateRangeChange(e.target.value, dateTo)}
            aria-label="Dari tanggal"
            className="py-0.5 px-1.5 bg-[#F5F7FB] border border-slate-200 rounded-lg font-mono text-[11px] text-slate-700 focus:outline-none focus:border-[#315FEA] tabular-nums"
          />
          <span className="text-slate-400 text-[11px]">s/d</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => onDateRangeChange(dateFrom, e.target.value)}
            aria-label="Sampai tanggal"
            className="py-0.5 px-1.5 bg-[#F5F7FB] border border-slate-200 rounded-lg font-mono text-[11px] text-slate-700 focus:outline-none focus:border-[#315FEA] tabular-nums"
          />
        </div>
      )}

      {hasCustomFilter && onReset && (
        <button
          type="button"
          onClick={onReset}
          className="px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:text-[#EF4444] bg-white border border-slate-200/90 hover:bg-rose-50/50 inline-flex items-center gap-1 transition-colors whitespace-nowrap"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset Periode</span>
        </button>
      )}
    </div>
  );
};
