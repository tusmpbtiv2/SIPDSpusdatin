import React from 'react';
import { LucideIcon } from 'lucide-react';

export interface PageTitleProps {
  title: string;
  subtitle?: string;
  category?: string;
  icon?: React.ReactNode | LucideIcon;
  actions?: React.ReactNode;
  className?: string;
}

export const PageTitle: React.FC<PageTitleProps> = ({
  title,
  subtitle,
  category,
  icon,
  actions,
  className = ''
}) => {
  const renderIcon = () => {
    if (!icon) return null;
    if (React.isValidElement(icon)) return icon;
    if (typeof icon === 'function' || (typeof icon === 'object' && icon !== null && 'render' in icon)) {
      const IconComponent = icon as LucideIcon;
      return <IconComponent className="w-5 h-5" />;
    }
    return icon;
  };

  return (
    <div
      className={`flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 pb-1 ${className}`}
    >
      <div className="flex items-start gap-3.5 min-w-0">
        {icon && (
          <div className="w-10 h-10 rounded-xl bg-[#EEF3FF] border border-[#315FEA]/15 text-[#315FEA] flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
            {renderIcon()}
          </div>
        )}
        <div className="min-w-0">
          {category && (
            <div className="text-[11px] font-semibold text-[#315FEA] tracking-wide mb-0.5">
              {category}
            </div>
          )}
          <h1 className="text-lg sm:text-xl font-bold text-[#0F172A] tracking-tight leading-snug">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs sm:text-[13px] text-slate-500 mt-1 leading-relaxed max-w-3xl">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {actions && (
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
};
