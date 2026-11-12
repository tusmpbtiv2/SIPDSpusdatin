import React from 'react';
import { Search, X } from 'lucide-react';

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  autoFocus?: boolean;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  placeholder = 'Cari data...',
  className = '',
  inputClassName = '',
  autoFocus = false
}) => {
  return (
    <div className={`relative flex-1 min-w-[200px] ${className}`}>
      <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        type="text"
        value={value}
        autoFocus={autoFocus}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full pl-9 pr-8 py-2 text-xs font-medium bg-white border border-slate-200/90 rounded-xl text-[#0F172A] placeholder:text-slate-400 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#315FEA]/20 focus:border-[#315FEA] transition-all duration-150 ${inputClassName}`}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          aria-label="Bersihkan pencarian"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
