import React from 'react';
import { Inbox, LucideIcon } from 'lucide-react';

export interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode | LucideIcon;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'Tidak Ada Data Ditemukan',
  description = 'Belum ada data yang tersimpan atau sesuai dengan kriteria filter pencarian Anda.',
  icon,
  action,
  className = ''
}) => {
  const renderIcon = () => {
    if (!icon) return <Inbox className="w-6 h-6 stroke-[1.75]" />;
    if (React.isValidElement(icon)) return icon;
    if (typeof icon === 'function' || (typeof icon === 'object' && icon !== null && 'render' in icon)) {
      const IconComponent = icon as LucideIcon;
      return <IconComponent className="w-6 h-6 stroke-[1.75]" />;
    }
    return icon;
  };

  return (
    <div
      className={`flex flex-col items-center justify-center text-center py-12 px-4 max-w-md mx-auto ${className}`}
    >
      <div className="w-12 h-12 rounded-2xl bg-[#F5F7FB] border border-slate-200/80 text-slate-400 flex items-center justify-center mb-3.5 shadow-2xs">
        {renderIcon()}
      </div>
      <h4 className="text-sm font-bold text-[#0F172A] tracking-tight">{title}</h4>
      <p className="text-xs text-slate-500 mt-1 leading-relaxed">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
};
