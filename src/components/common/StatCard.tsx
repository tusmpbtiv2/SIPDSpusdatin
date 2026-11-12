import React from 'react';
import { LucideIcon } from 'lucide-react';

export interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode | LucideIcon;
  trend?: string;
  accent?: 'blue' | 'indigo' | 'emerald' | 'amber' | 'rose' | 'slate';
  onClick?: () => void;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  trend,
  accent = 'blue',
  onClick,
  className = ''
}) => {
  const accentStyles: Record<
    NonNullable<StatCardProps['accent']>,
    { border: string; iconBg: string; iconText: string }
  > = {
    blue: {
      border: 'border-slate-200/90 hover:border-[#315FEA]/35',
      iconBg: 'bg-[#EEF3FF]',
      iconText: 'text-[#315FEA]'
    },
    indigo: {
      border: 'border-slate-200/90 hover:border-[#6366F1]/35',
      iconBg: 'bg-[#EEF2FF]',
      iconText: 'text-[#6366F1]'
    },
    emerald: {
      border: 'border-slate-200/90 hover:border-[#10B981]/35',
      iconBg: 'bg-[#ECFDF5]',
      iconText: 'text-[#10B981]'
    },
    amber: {
      border: 'border-slate-200/90 hover:border-[#F59E0B]/35',
      iconBg: 'bg-[#FFFBEB]',
      iconText: 'text-[#F59E0B]'
    },
    rose: {
      border: 'border-slate-200/90 hover:border-[#EF4444]/35',
      iconBg: 'bg-[#FEF2F2]',
      iconText: 'text-[#EF4444]'
    },
    slate: {
      border: 'border-slate-200/90 hover:border-slate-300',
      iconBg: 'bg-[#F5F7FB]',
      iconText: 'text-slate-700'
    }
  };

  const style = accentStyles[accent] || accentStyles.blue;

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
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={`p-5 bg-white rounded-2xl border ${style.border} shadow-[0_1px_3px_0_rgba(16,29,53,0.04)] hover:shadow-[0_10px_24px_-6px_rgba(16,29,53,0.07)] transition-all duration-150 flex flex-col justify-between ${
        onClick ? 'cursor-pointer' : ''
      } ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="text-xs font-semibold text-slate-500 block truncate">
            {title}
          </span>
          <div className="text-2xl font-extrabold text-[#0F172A] mt-1.5 tabular-nums tracking-tight">
            {value}
          </div>
        </div>
        {icon && (
          <div
            className={`w-10 h-10 rounded-xl ${style.iconBg} ${style.iconText} flex items-center justify-center shrink-0`}
          >
            {renderIcon()}
          </div>
        )}
      </div>

      {(subtitle || trend) && (
        <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center justify-between gap-2 text-xs text-slate-500">
          {subtitle && <span className="truncate">{subtitle}</span>}
          {trend && (
            <span className="font-semibold text-slate-700 tabular-nums shrink-0">
              {trend}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export const StatisticCard = StatCard;
