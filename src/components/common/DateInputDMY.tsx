import React, { useMemo } from 'react';
import {
  formatDateDMY,
  formatDateLongID,
  toHtmlDateValue,
  INDONESIAN_MONTH_NAMES
} from '../../utils/formatters';

interface DateInputDMYProps {
  value: string;
  onChange: (newValueDMY: string) => void;
  disabled?: boolean;
}

const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));
const MONTHS = INDONESIAN_MONTH_NAMES.map((name, idx) => ({
  code: String(idx + 1).padStart(2, '0'),
  label: `${String(idx + 1).padStart(2, '0')} - ${name}`
}));
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 85 }, (_, i) => String(CURRENT_YEAR - i));

export const DateInputDMY: React.FC<DateInputDMYProps> = ({
  value,
  onChange,
  disabled = false
}) => {
  // Parse current value into dd, mm, yyyy
  const parsed = useMemo(() => {
    const normalized = formatDateDMY(value);
    const match = normalized.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (match) {
      return { dd: match[1], mm: match[2], yyyy: match[3] };
    }
    const parts = (value || '').split('-');
    if (parts.length === 3 && parts[0].length <= 2) {
      return {
        dd: parts[0] || '',
        mm: parts[1] || '',
        yyyy: parts[2] || ''
      };
    }
    return { dd: '', mm: '', yyyy: '' };
  }, [value]);

  const handlePartChange = (part: 'dd' | 'mm' | 'yyyy', nextVal: string) => {
    const next = {
      dd: part === 'dd' ? nextVal : parsed.dd || '01',
      mm: part === 'mm' ? nextVal : parsed.mm || '01',
      yyyy: part === 'yyyy' ? nextVal : parsed.yyyy || '2012'
    };

    if (!nextVal && !parsed.dd && !parsed.mm && !parsed.yyyy) {
      onChange('');
      return;
    }

    onChange(`${next.dd}-${next.mm}-${next.yyyy}`);
  };

  const handleCalendarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawHtmlDate = e.target.value; // YYYY-MM-DD
    if (!rawHtmlDate) {
      onChange('');
      return;
    }
    const dmy = formatDateDMY(rawHtmlDate);
    onChange(dmy !== '-' ? dmy : '');
  };

  const htmlDateVal = toHtmlDateValue(value);
  const longDisplay = formatDateLongID(value);

  return (
    <div className="space-y-1.5">
      {/* Pilihan Tanggal dd-mm-yyyy (Dropdown Hari - Bulan - Tahun) */}
      <div className="grid grid-cols-12 gap-1">
        <select
          disabled={disabled}
          value={parsed.dd}
          onChange={e => handlePartChange('dd', e.target.value)}
          aria-label="Pilih Tanggal (dd)"
          className="col-span-3 px-1.5 py-1.5 border border-slate-300 rounded-lg text-xs font-mono font-semibold text-slate-900 bg-white focus:outline-none focus:ring-1 focus:ring-blue-800"
        >
          <option value="">dd</option>
          {DAYS.map(d => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        <select
          disabled={disabled}
          value={parsed.mm}
          onChange={e => handlePartChange('mm', e.target.value)}
          aria-label="Pilih Bulan (mm)"
          className="col-span-5 px-1.5 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 bg-white focus:outline-none focus:ring-1 focus:ring-blue-800"
        >
          <option value="">mm (Bulan)</option>
          {MONTHS.map(m => (
            <option key={m.code} value={m.code}>
              {m.label}
            </option>
          ))}
        </select>

        <select
          disabled={disabled}
          value={parsed.yyyy}
          onChange={e => handlePartChange('yyyy', e.target.value)}
          aria-label="Pilih Tahun (yyyy)"
          className="col-span-4 px-1.5 py-1.5 border border-slate-300 rounded-lg text-xs font-mono font-semibold text-slate-900 bg-white focus:outline-none focus:ring-1 focus:ring-blue-800"
        >
          <option value="">yyyy</option>
          {YEARS.map(y => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      {/* Pilihan Kalender Native & Pratinjau Format dd-mm-yyyy -> 09 Juli 2012 */}
      <div className="flex items-center justify-between gap-2 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200/80 text-[11px]">
        <div className="truncate">
          <span className="text-slate-400">Format: </span>
          <span className="font-mono font-bold text-slate-700">
            {parsed.dd && parsed.mm && parsed.yyyy
              ? `${parsed.dd}-${parsed.mm}-${parsed.yyyy}`
              : 'dd-mm-yyyy'}
          </span>
          {longDisplay !== '-' && (
            <span className="text-blue-900 font-bold ml-1.5">({longDisplay})</span>
          )}
        </div>

        <input
          type="date"
          disabled={disabled}
          value={htmlDateVal}
          onChange={handleCalendarChange}
          title="Pilih dari kalender"
          className="w-6 h-5 opacity-80 hover:opacity-100 cursor-pointer text-[10px] shrink-0"
        />
      </div>
    </div>
  );
};
