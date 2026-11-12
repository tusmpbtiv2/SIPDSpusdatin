import React from 'react';
import { AlertCircle, X } from 'lucide-react';

export interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
  isLoading?: boolean;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Konfirmasi',
  cancelText = 'Batal',
  isDanger = false,
  isLoading = false
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#101D35]/55 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200/90 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            {isDanger ? (
              <div className="w-9 h-9 rounded-xl bg-[#FEF2F2] text-[#EF4444] flex items-center justify-center">
                <AlertCircle className="w-5 h-5" />
              </div>
            ) : (
              <div className="w-9 h-9 rounded-xl bg-[#EEF3FF] text-[#315FEA] flex items-center justify-center">
                <AlertCircle className="w-5 h-5" />
              </div>
            )}
            <h3 className="font-bold text-[#0F172A] text-sm">{title}</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 text-sm text-slate-600 leading-relaxed">
          {message}
        </div>

        <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 bg-[#F8FAFC] border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-4 py-2 text-xs font-semibold text-white rounded-xl transition-colors disabled:opacity-50 flex items-center gap-1.5 ${
              isDanger
                ? 'bg-[#EF4444] hover:bg-rose-600 shadow-xs'
                : 'bg-[#315FEA] hover:bg-[#254EDB] shadow-xs'
            }`}
          >
            {isLoading && (
              <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            )}
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

