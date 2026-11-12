import React from 'react';
import { useNotification } from '../../hooks/useNotification';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { toasts, dismiss } = useNotification();

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none"
    >
      {toasts.map(toast => {
        let borderClass = 'border-slate-200/90 bg-white';
        let textClass = 'text-[#0F172A]';
        let icon = <Info className="w-5 h-5 text-[#315FEA] shrink-0" />;

        if (toast.type === 'success') {
          borderClass = 'border-[#10B981]/30 bg-white';
          textClass = 'text-[#0F172A]';
          icon = <CheckCircle2 className="w-5 h-5 text-[#10B981] shrink-0" />;
        } else if (toast.type === 'error') {
          borderClass = 'border-[#EF4444]/30 bg-white';
          textClass = 'text-[#0F172A]';
          icon = <AlertCircle className="w-5 h-5 text-[#EF4444] shrink-0" />;
        } else if (toast.type === 'warning') {
          borderClass = 'border-[#F59E0B]/35 bg-white';
          textClass = 'text-[#0F172A]';
          icon = <AlertTriangle className="w-5 h-5 text-[#F59E0B] shrink-0" />;
        }

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-2xl border shadow-lg transition-all ${borderClass} ${textClass}`}
          >
            {icon}
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-bold leading-tight">{toast.title}</h4>
              <p className="text-xs text-slate-600 mt-0.5 break-words leading-relaxed">
                {toast.message}
              </p>
            </div>
            <button
              onClick={() => dismiss(toast.id)}
              className="text-slate-400 hover:text-slate-700 transition-colors shrink-0 p-0.5 rounded-lg hover:bg-slate-100"
              aria-label="Tutup notifikasi"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

export const ToastNotification = ToastContainer;

