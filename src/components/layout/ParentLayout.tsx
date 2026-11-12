import React, { useState } from 'react';
import { SchoolLogo } from '../common/SchoolLogo';
import { PARENT_MENUS } from '../../config/school';
import { useSchoolProfile } from '../../services/schoolService';
import { useAuth } from '../../hooks/useAuth';
import { Siswa } from '../../types';
import {
  LayoutDashboard,
  User,
  Edit3,
  Clock,
  FileText,
  ShieldCheck,
  LogOut,
  Menu,
  X,
  GraduationCap
} from 'lucide-react';

interface ParentLayoutProps {
  currentMenu: string;
  onSelectMenu: (menuId: string) => void;
  student: Siswa | null;
  children: React.ReactNode;
}

export const ParentLayout: React.FC<ParentLayoutProps> = ({
  currentMenu,
  onSelectMenu,
  student,
  children
}) => {
  const { parentUser, logout } = useAuth();
  const { profile } = useSchoolProfile();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const renderIcon = (iconName: string) => {
    switch (iconName) {
      case 'LayoutDashboard': return <LayoutDashboard className="w-4 h-4 shrink-0" />;
      case 'User': return <User className="w-4 h-4 shrink-0" />;
      case 'Edit3': return <Edit3 className="w-4 h-4 shrink-0" />;
      case 'Clock': return <Clock className="w-4 h-4 shrink-0" />;
      case 'FileText': return <FileText className="w-4 h-4 shrink-0" />;
      case 'ShieldCheck': return <ShieldCheck className="w-4 h-4 shrink-0" />;
      default: return <User className="w-4 h-4 shrink-0" />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800">
      {/* Top Navbar Header */}
      <header className="bg-[#0F2942] text-white sticky top-0 z-40 border-b border-slate-800 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <SchoolLogo size={36} lightText={true} />
            <div className="flex flex-col">
              <span className="font-extrabold text-white text-xs sm:text-sm tracking-tight leading-tight">
                SMP BHINNEKA TUNGGAL IKA
              </span>
              <span className="text-[10px] text-blue-200">
                PORTAL ORANG TUA SISWA
              </span>
            </div>
          </div>

          {/* Student Banner In Header */}
          <div className="hidden md:flex items-center gap-3 bg-blue-950/60 px-3.5 py-1.5 rounded-lg border border-blue-800/60">
            <div className="w-7 h-7 rounded-full bg-blue-700/50 flex items-center justify-center text-blue-200">
              <GraduationCap className="w-4 h-4" />
            </div>
            <div className="text-left">
              <div className="text-xs font-bold text-white leading-tight">
                {student?.nama_lengkap || 'Siswa Terdaftar'}
              </div>
              <div className="text-[11px] text-slate-300 font-mono tabular-nums">
                NISN: {student?.nisn || parentUser?.nisn} · Kelas {student?.rombel || '-'}
              </div>
            </div>
          </div>

          {/* Mobile hamburger */}
          <div className="flex items-center gap-2 md:hidden">
            <button
              onClick={() => setIsMobileOpen(!isMobileOpen)}
              className="p-2 text-slate-300 hover:text-white rounded-lg"
              aria-label="Toggle menu"
            >
              {isMobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

          {/* Desktop Logout Button */}
          <div className="hidden md:block">
            <button
              onClick={logout}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-200 bg-rose-950/40 hover:bg-rose-900/50 rounded-lg border border-rose-800/40 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Keluar</span>
            </button>
          </div>
        </div>

        {/* Desktop Secondary Menu Bar */}
        <div className="hidden md:block bg-[#0A192F] border-t border-slate-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center space-x-1">
            {PARENT_MENUS.map(item => {
              const isActive = currentMenu === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectMenu(item.id)}
                  className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-medium transition-colors border-b-2 ${
                    isActive
                      ? 'border-blue-400 text-white bg-blue-900/30 font-semibold'
                      : 'border-transparent text-slate-300 hover:text-white hover:bg-slate-800/40'
                  }`}
                >
                  {renderIcon(item.icon)}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Mobile dropdown menu */}
        {isMobileOpen && (
          <div className="md:hidden bg-[#0A192F] border-t border-slate-800 px-4 py-3 space-y-1">
            <div className="p-3 mb-2 bg-blue-950/70 rounded-lg border border-blue-900/60">
              <div className="text-xs font-bold text-white">{student?.nama_lengkap}</div>
              <div className="text-[11px] text-blue-300 font-mono">NISN: {student?.nisn}</div>
            </div>

            {PARENT_MENUS.map(item => {
              const isActive = currentMenu === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onSelectMenu(item.id);
                    setIsMobileOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-left ${
                    isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {renderIcon(item.icon)}
                  <span>{item.label}</span>
                </button>
              );
            })}

            <div className="pt-2 border-t border-slate-800">
              <button
                onClick={logout}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-rose-300 hover:bg-rose-950/40 rounded-lg"
              >
                <LogOut className="w-4 h-4" />
                <span>Keluar Akun</span>
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6 lg:p-8 pb-20 md:pb-8">
        {children}
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 shadow-lg flex items-center justify-around py-1.5 px-1">
        <button
          onClick={() => onSelectMenu('parent-dashboard')}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-lg text-[10px] font-semibold ${
            currentMenu === 'parent-dashboard' ? 'text-blue-900' : 'text-slate-500'
          }`}
        >
          <LayoutDashboard className="w-4 h-4 mb-0.5" />
          <span>Beranda</span>
        </button>
        <button
          onClick={() => onSelectMenu('biodata-anak')}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-lg text-[10px] font-semibold ${
            currentMenu === 'biodata-anak' ? 'text-blue-900' : 'text-slate-500'
          }`}
        >
          <User className="w-4 h-4 mb-0.5" />
          <span>Biodata & F4</span>
        </button>
        <button
          onClick={() => onSelectMenu('perbaiki-biodata')}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-lg text-[10px] font-semibold ${
            currentMenu === 'perbaiki-biodata' ? 'text-blue-900' : 'text-slate-500'
          }`}
        >
          <Edit3 className="w-4 h-4 mb-0.5" />
          <span>Perbaiki</span>
        </button>
        <button
          onClick={() => onSelectMenu('pengajuan-saya')}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-lg text-[10px] font-semibold ${
            currentMenu === 'pengajuan-saya' ? 'text-blue-900' : 'text-slate-500'
          }`}
        >
          <Clock className="w-4 h-4 mb-0.5" />
          <span>Pengajuan</span>
        </button>
        <button
          onClick={() => onSelectMenu('profil-akun')}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-lg text-[10px] font-semibold ${
            currentMenu === 'profil-akun' ? 'text-blue-900' : 'text-slate-500'
          }`}
        >
          <ShieldCheck className="w-4 h-4 mb-0.5" />
          <span>Akun</span>
        </button>
      </nav>

      {/* Footer */}
      <footer className="hidden md:block mt-auto bg-white border-t border-slate-200 py-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>{profile.nama_sekolah} · {profile.status_akreditasi}</span>
          <span className="font-mono tabular-nums text-[11px]">NPSN: {profile.npsn} · Layanan Informasi TU: {profile.telepon}</span>
        </div>
      </footer>
    </div>
  );
};
