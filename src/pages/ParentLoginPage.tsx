import React, { useState } from 'react';
import { SchoolLogo } from '../components/common/SchoolLogo';
import { useAuth } from '../hooks/useAuth';
import { useSchoolProfile } from '../services/schoolService';
import { Users, Lock, ArrowLeft, AlertCircle, Eye, EyeOff, ShieldAlert, UserPlus } from 'lucide-react';

interface ParentLoginPageProps {
  onBack: () => void;
  onSwitchToAdmin: () => void;
  onOpenPendaftaranBaru: () => void;
  onLoginSuccess: () => void;
}

export const ParentLoginPage: React.FC<ParentLoginPageProps> = ({
  onBack,
  onSwitchToAdmin,
  onOpenPendaftaranBaru,
  onLoginSuccess
}) => {
  const { loginParent, isLoading } = useAuth();
  const { profile } = useSchoolProfile();
  const [nisn, setNisn] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanNisn = nisn.trim().replace(/\D/g, '');
    if (cleanNisn.length !== 10) {
      setError('NISN harus terdiri dari tepat 10 digit angka.');
      return;
    }

    if (!password) {
      setError('Password (Tanggal Lahir Siswa) wajib diisi.');
      return;
    }

    try {
      await loginParent(cleanNisn, password);
      onLoginSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Kredensial NISN atau Tanggal Lahir Siswa salah.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-between text-slate-800">
      {/* Top Bar */}
      <header className="p-3 sm:p-5 flex flex-wrap items-center justify-between gap-2 bg-white border-b border-slate-200">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 font-medium transition-colors py-1"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Halaman Utama</span>
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={onOpenPendaftaranBaru}
            className="text-xs font-bold text-emerald-700 hover:text-emerald-800 transition-colors flex items-center gap-1"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Pendaftaran Murid Baru</span>
          </button>

          <button
            onClick={onSwitchToAdmin}
            className="text-xs font-semibold text-blue-900 hover:text-blue-950 transition-colors"
          >
            Login Admin →
          </button>
        </div>
      </header>

      {/* Main Login Card */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="bg-white max-w-md w-full rounded-2xl border border-slate-200 shadow-xl p-5 sm:p-8">
          <div className="flex flex-col items-center text-center mb-5">
            <SchoolLogo size={48} />
            <div className="mt-3 text-blue-900 text-[11px] font-semibold flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              <span>PORTAL KHUSUS ORANG TUA SISWA</span>
            </div>
            <h2 className="text-xl font-extrabold text-slate-900 mt-1.5">LOGIN ORANG TUA</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {profile.nama_sekolah}
            </p>
          </div>

          {/* School Policy Notice */}
          <div className="mb-4 p-3.5 bg-amber-50/80 border border-amber-200 rounded-xl text-amber-900 text-xs flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <span className="font-bold">Ketentuan Login Orang Tua:</span> Username menggunakan <strong>10 digit NISN Siswa</strong> dan Password menggunakan <strong>Tanggal Lahir Siswa</strong> (format <code>dd-mm-yyyy</code>, contoh: <code>25-08-2012</code>).
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-700 font-semibold mb-1.5">
                NISN Siswa (10 Digit Angka)
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  maxLength={10}
                  value={nisn}
                  onChange={e => setNisn(e.target.value.replace(/\D/g, ''))}
                  placeholder="Masukkan 10 digit NISN siswa"
                  className="w-full px-3.5 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-mono tabular-nums text-sm focus:outline-none focus:ring-1 focus:ring-blue-800 focus:border-blue-800 focus:bg-white"
                />
              </div>
              <span className="text-[11px] text-slate-400 mt-1 block">
                Nomor Induk Siswa Nasional tercantum pada rapor atau kartu pelajar.
              </span>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1.5">
                Password (Tanggal Lahir Siswa)
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Contoh: 25-08-2012 (dd-mm-yyyy)"
                  className="w-full pl-3.5 pr-10 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-mono text-sm sm:text-xs focus:outline-none focus:ring-1 focus:ring-blue-800 focus:border-blue-800 focus:bg-white"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1.5"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <span className="text-[11px] text-slate-400 mt-1 block">
                Masukkan tanggal lahir siswa dengan format <code>dd-mm-yyyy</code> (contoh: <code>25-08-2012</code>).
              </span>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-[#0F2942] hover:bg-slate-800 text-white font-bold rounded-xl transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
            >
              {isLoading ? (
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <Lock className="w-4 h-4" />
              )}
              <span>Masuk Portal Siswa</span>
            </button>
          </form>

          {/* Pendaftaran Murid Baru CTA */}
          <div className="mt-5 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onOpenPendaftaranBaru}
              className="w-full py-3 px-4 bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-sm transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              <span>Formulir Pendaftaran Murid Baru (PPDB)</span>
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="p-4 text-center text-xs text-slate-500 bg-white border-t border-slate-200">
        Jika terdapat kendala login NISN atau tanggal lahir siswa belum sesuai, silakan hubungi Tata Usaha {profile.nama_sekolah}.
      </footer>
    </div>
  );
};
