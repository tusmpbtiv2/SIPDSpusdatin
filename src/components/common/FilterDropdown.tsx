import React from 'react';
import { ChevronDown, Filter } from 'lucide-react';

export interface FilterDropdownOption {
  value: string;
  label: string;
}

export interface FilterDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: FilterDropdownOption[];
  label?: string;
  ariaLabel?: string;
  icon?: React.ReactNode;
  showFilterIcon?: boolean;
  className?: string;
  selectClassName?: string;
  disabled?: boolean;
}

export const FilterDropdown: React.FC<FilterDropdownProps> = ({
  value,
  onChange,
  options,
  label,
  ariaLabel,
  icon,
  showFilterIcon = false,
  className = '',
  selectClassName = '',
  disabled = false
}) => {
  const effectiveIcon = icon || (showFilterIcon ? <Filter className="w-3.5 h-3.5" /> : null);

  return (
    <div className={`inline-flex flex-col ${className}`}>
      {label && (
        <label className="block text-[11px] font-semibold text-slate-500 mb-1">
          {label}
        </label>
      )}
      <div className="relative inline-flex items-center">
        {effectiveIcon && (
          <span className="absolute left-3 text-slate-400 pointer-events-none flex items-center">
            {effectiveIcon}
          </span>
        )}
        <select
          value={value}
          disabled={disabled}
          aria-label={ariaLabel || label || 'Filter pilihan'}
          onChange={e => onChange(e.target.value)}
          className={`appearance-none py-2 ${
            effectiveIcon ? 'pl-8' : 'pl-3'
          } pr-8 bg-white border border-slate-200/90 hover:border-slate-300 rounded-xl text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-[#315FEA]/20 focus:border-[#315FEA] transition-all duration-150 disabled:opacity-50 cursor-pointer ${selectClassName}`}
        >
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 pointer-events-none" />
      </div>
    </div>
  );
};
