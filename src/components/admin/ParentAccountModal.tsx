import React, { useState } from 'react';
import { ParentAccountRecord } from '../../types';
import { formatBirthDatePasswordDefault, formatDateDMY } from '../../utils/formatters';
import { X, KeyRound, Copy, Check, AlertCircle } from 'lucide-react';

interface ParentAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: ParentAccountRecord | null;
  onActivate: (nisn: string, customPassword?: string) => Promise<{ temporary_password?: string; message: string }>;
}

export const ParentAccountModal: React.FC<ParentAccountModalProps> = ({
  isOpen,
  onClose,
  account,
  onActivate
}) => {
  const [customPassword, setCustomPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ temporary_password?: string; message: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !account) return null;

  const defaultBirthDatePwd = formatBirthDatePasswordDefault(account.tanggal_lahir);

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await onActivate(account.nisn, customPassword || undefined);
      setResult(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal mengaktifkan akun orang tua.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
      <div className="bg-white rounded-xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-blue-800" />
            <h3 className="font-bold text-slate-900 text-sm">
              {account.is_active ? 'Reset Password Akun Orang Tua' : 'Aktivasi Akun Portal Orang Tua'}
            </h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 text-xs space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Student Info Box */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
            <div className="font-semibold text-slate-900 text-sm">{account.nama_siswa}</div>
            <div className="text-slate-600 font-mono tabular-nums">
              NISN: <span className="font-bold text-slate-800">{account.nisn}</span> · Kelas {account.kelas}
            </div>
            <div className="text-slate-600 font-mono tabular-nums">
              Tanggal Lahir (Password Default): <span className="font-bold text-blue-900">{formatDateDMY(account.tanggal_lahir)}</span>
            </div>
            <div className="text-slate-500">Wali: {account.nama_wali} ({account.no_hp})</div>
          </div>

          {!result ? (
            <form onSubmit={handleActivate} className="space-y-3.5">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Password Akun Orang Tua (Opsional)
                </label>
                <input
                  type="text"
                  value={customPassword}
                  onChange={e => setCustomPassword(e.target.value)}
                  placeholder={`Kosongkan untuk gunakan Tanggal Lahir (${defaultBirthDatePwd})`}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 font-mono text-xs"
                />
                <span className="text-[11px] text-slate-400">
                  Secara default, orang tua login menggunakan Tanggal Lahir Siswa (<code>{defaultBirthDatePwd}</code>).
                </span>
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-900 text-[11px] leading-relaxed">
                <span className="font-bold">Ketentuan Login Orang Tua:</span> Username menggunakan 10 digit NISN siswa dan password default menggunakan Tanggal Lahir Siswa (format <code>dd-mm-yyyy</code>).
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-medium"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-blue-900 text-white rounded-lg hover:bg-blue-800 font-semibold flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSubmitting ? 'Memproses...' : account.is_active ? 'Reset Password' : 'Aktifkan Akun'}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg">
                <div className="font-bold text-sm mb-1">Akun Berhasil Diaktifkan!</div>
                <p className="text-xs">{result.message}</p>
              </div>

              {result.temporary_password && (
                <div className="p-3 border border-slate-200 rounded-lg bg-slate-50 space-y-2">
                  <div className="text-slate-500 font-medium">Kredensial Login Orang Tua:</div>
                  <div className="font-mono text-xs space-y-1">
                    <div>Username (NISN): <span className="font-bold text-slate-900">{account.nisn}</span></div>
                    <div className="flex items-center justify-between">
                      <div>Password: <span className="font-bold text-blue-900">{result.temporary_password}</span></div>
                      <button
                        onClick={() => copyToClipboard(`NISN: ${account.nisn}\nPassword: ${result.temporary_password}`)}
                        className="p-1.5 rounded hover:bg-slate-200 text-slate-600 flex items-center gap-1 text-[11px]"
                      >
                        {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copied ? 'Tersalin' : 'Salin'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={onClose}
                className="w-full py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 font-semibold text-xs"
              >
                Selesai & Tutup
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
