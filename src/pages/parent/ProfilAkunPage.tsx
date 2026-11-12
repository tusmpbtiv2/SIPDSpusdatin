import React, { useState } from 'react';
import { Siswa } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { KeyRound, ShieldCheck, Lock, Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react';

interface ProfilAkunPageProps {
  student: Siswa;
}

export const ProfilAkunPage: React.FC<ProfilAkunPageProps> = ({ student }) => {
  const { parentUser, changeParentPassword } = useAuth();
  const { success, error: notifyError } = useNotification();

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localMsg, setLocalMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalMsg(null);

    if (!oldPassword || !newPassword || !confirmPassword) {
      setLocalMsg({ type: 'error', text: 'Semua kolom password wajib diisi.' });
      return;
    }

    if (newPassword.length < 8) {
      setLocalMsg({ type: 'error', text: 'Password baru minimal harus 8 karakter.' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setLocalMsg({ type: 'error', text: 'Konfirmasi password baru tidak cocok.' });
      return;
    }

    if (newPassword === oldPassword) {
      setLocalMsg({ type: 'error', text: 'Password baru tidak boleh sama dengan password saat ini.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const msg = await changeParentPassword(oldPassword, newPassword);
      setLocalMsg({ type: 'success', text: msg });
      success('Password Berhasil Diubah', msg);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Gagal mengubah password.';
      setLocalMsg({ type: 'error', text: errMsg });
      notifyError('Gagal Mengubah Password', errMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Profil Akun & Keamanan</h2>
        <p className="text-xs text-slate-500">
          Informasi akun portal wali murid dan pembaharuan kata sandi
        </p>
      </div>

      {/* Account Info Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
          <ShieldCheck className="w-5 h-5 text-blue-900" />
          <h3 className="font-bold text-slate-900 text-sm">Informasi Akun Portal</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <span className="text-slate-500 font-medium">Username Akun Resmi (NISN)</span>
            <div className="font-mono font-bold text-slate-900 text-sm mt-0.5">{student.nisn}</div>
          </div>
          <div>
            <span className="text-slate-500 font-medium">Nama Siswa Terkait</span>
            <div className="font-semibold text-slate-900 mt-0.5">{student.nama_lengkap}</div>
          </div>
          <div>
            <span className="text-slate-500 font-medium">Nama Wali Terdaftar</span>
            <div className="font-semibold text-slate-900 mt-0.5">
              {student.nama_wali || student.nama_ayah || 'Wali Siswa'}
            </div>
          </div>
          <div>
            <span className="text-slate-500 font-medium">Status Akun</span>
            <div className="font-semibold text-emerald-800 mt-0.5 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-600" />
              <span>Aktif & Terverifikasi Sekolah</span>
            </div>
          </div>
        </div>
      </div>

      {/* Ganti Password Form */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-blue-900" />
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Ganti Password Akun</h3>
              <p className="text-xs text-slate-500">Perbarui kata sandi akun secara berkala untuk menjaga keamanan</p>
            </div>
          </div>
        </div>

        {localMsg && (
          <div className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
            localMsg.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border border-rose-200 text-rose-900'
          }`}>
            {localMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{localMsg.text}</span>
          </div>
        )}

        <form onSubmit={handleChangePassword} className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-700 font-semibold mb-1">
              Password Saat Ini *
            </label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                required
                value={oldPassword}
                onChange={e => setOldPassword(e.target.value)}
                placeholder="Masukkan password saat ini"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-800"
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-slate-700 font-semibold mb-1">
              Password Baru *
            </label>
            <input
              type={showPass ? 'text' : 'password'}
              required
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Minimal 8 karakter"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-800"
            />
            <span className="text-[11px] text-slate-400 mt-1 block">
              Gunakan kombinasi huruf besar, huruf kecil, dan angka. Jangan gunakan NISN sebagai password.
            </span>
          </div>

          <div>
            <label className="block text-slate-700 font-semibold mb-1">
              Konfirmasi Password Baru *
            </label>
            <input
              type={showPass ? 'text' : 'password'}
              required
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Ketik ulang password baru"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-800"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 bg-blue-900 hover:bg-blue-800 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-2 transition-colors shadow-xs disabled:opacity-50"
            >
              {isSubmitting ? (
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <Lock className="w-4 h-4" />
              )}
              <span>Simpan Password Baru</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
