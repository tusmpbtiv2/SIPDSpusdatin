import React, { useState } from 'react';
import { SchoolLogo } from '../components/common/SchoolLogo';
import { useAuth } from '../hooks/useAuth';
import { Shield, Lock, User, ArrowLeft, AlertCircle, Eye, EyeOff, UserPlus } from 'lucide-react';

interface AdminLoginPageProps {
  onBack: () => void;
  onSwitchToParent: () => void;
  onOpenPendaftaranBaru: () => void;
  onLoginSuccess: () => void;
}

export const AdminLoginPage: React.FC<AdminLoginPageProps> = ({
  onBack,
  onSwitchToParent,
  onOpenPendaftaranBaru,
  onLoginSuccess
}) => {
  const { loginAdmin, isLoading } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!identifier.trim() || !password) {
      setError('Username/Email dan Password wajib diisi.');
      return;
    }

    try {
      await loginAdmin(identifier.trim(), password);
      onLoginSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Kredensial admin salah atau akun tidak aktif.');
    }
  };

  return (
    <div className="min-h-screen bg-[#071220] flex flex-col justify-between text-slate-100">
      {/* Top Bar */}
      <header className="p-3 sm:p-5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors py-1"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Halaman Utama</span>
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={onOpenPendaftaranBaru}
            className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Pendaftaran Murid Baru</span>
          </button>
          <button
            onClick={onSwitchToParent}
            className="text-xs font-semibold text-blue-300 hover:text-blue-200 transition-colors"
          >
            Login Orang Tua →
          </button>
        </div>
      </header>

      {/* Main Login Card */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="bg-[#0A192F] max-w-md w-full rounded-2xl border border-slate-800 shadow-2xl p-5 sm:p-8">
          <div className="flex flex-col items-center text-center mb-6">
            <SchoolLogo size={48} lightText={true} />
            <div className="mt-3 text-blue-300 text-[11px] font-semibold flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" />
              <span>PORTAL ADMINISTRASI & TATA USAHA</span>
            </div>
            <h2 className="text-xl font-extrabold text-white mt-1.5">LOGIN ADMIN SIPDS</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              SMP BHINNEKA TUNGGAL IKA
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-rose-950/60 border border-rose-800 text-rose-200 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-300 font-semibold mb-1.5">
                Username / Email Resmi
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={e => setIdentifier(e.target.value)}
                  placeholder="Email atau username akun Supabase Auth"
                  className="w-full pl-10 pr-3.5 py-3 bg-[#0F233D] border border-slate-700 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm sm:text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-3 bg-[#0F233D] border border-slate-700 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm sm:text-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-1.5"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
            >
              {isLoading ? (
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <Shield className="w-4 h-4" />
              )}
              <span>Masuk Sistem Admin</span>
            </button>
          </form>

          {/* Info Role Otoritas */}
          <div className="mt-5 pt-4 border-t border-slate-800 text-[11px] text-slate-400 text-center leading-relaxed">
            Mendukung hak akses berbasis peran Supabase Auth & RLS: <strong className="text-slate-300">super_admin</strong>, <strong className="text-slate-300">admin</strong>, <strong className="text-slate-300">operator</strong>, dan <strong className="text-slate-300">viewer</strong>.
          </div>

          {/* Pendaftaran Murid Baru Banner inside Login Card */}
          <div className="mt-4 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onOpenPendaftaranBaru}
              className="w-full py-2.5 px-3 bg-emerald-950/70 hover:bg-emerald-900/70 border border-emerald-700/60 text-emerald-300 font-semibold text-xs rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              <span>Formulir Pendaftaran Murid Baru (PPDB)</span>
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="p-4 text-center text-xs text-slate-600 border-t border-slate-800">
        SIPDS Terintegrasi Supabase Auth & Row Level Security · SMP Bhinneka Tunggal Ika
      </footer>
    </div>
  );
};
