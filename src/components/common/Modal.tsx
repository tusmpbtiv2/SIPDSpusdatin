import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  closeOnBackdrop?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  children,
  footer,
  size = 'lg',
  maxWidth,
  closeOnBackdrop = true
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const resolvedSize = maxWidth || size;

  const sizeClassMap: Record<NonNullable<ModalProps['size']>, string> = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-2xl',
    '2xl': 'max-w-4xl',
    full: 'max-w-6xl'
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-[#101D35]/55 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={() => {
        if (closeOnBackdrop) onClose();
      }}
    >
      <div
        className={`bg-white rounded-2xl w-full ${sizeClassMap[resolvedSize]} max-h-[90vh] flex flex-col shadow-2xl border border-slate-200/90 overflow-hidden`}
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3 bg-white shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {icon && (
              <div className="w-9 h-9 rounded-xl bg-[#EEF3FF] text-[#315FEA] flex items-center justify-center shrink-0">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <h3 className="font-bold text-[#0F172A] text-sm sm:text-base truncate">{title}</h3>
              {subtitle && <p className="text-xs text-slate-500 mt-0.5 truncate">{subtitle}</p>}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
            aria-label="Tutup modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1">{children}</div>

        {/* Optional Sticky Footer */}
        {footer && (
          <div className="px-5 sm:px-6 py-3.5 bg-[#F8FAFC] border-t border-slate-200/80 flex items-center justify-end gap-2.5 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
