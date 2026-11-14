import React from 'react';
import { SchoolLogo } from '../common/SchoolLogo';
import { ADMIN_MENUS, canAccessMenu } from '../../config/school';
import { SchoolProfile, AdminRole, AdminUser } from '../../types';
import {
  LayoutDashboard,
  Users,
  CheckSquare,
  UserPlus,
  UserMinus,
  BarChart3,
  UploadCloud,
  DownloadCloud,
  KeyRound,
  Sliders,
  History,
  LogOut,
  X,
  Shield,
  ChevronRight,
  CalendarRange,
  Layers,
  BookOpen,
  ArrowUpCircle,
  GraduationCap,
  Database,
  PanelLeftClose,
  PanelLeftOpen,
  ClipboardCheck
} from 'lucide-react';

export interface AppSidebarProps {
  currentMenu: string;
  onSelectMenu: (menuId: string) => void;
  pendingVerificationCount?: number;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  adminUser: AdminUser | null;
  role: AdminRole | null;
  profile: SchoolProfile;
  onLogout: () => void;
}

const MENU_GROUPS: { title: string; ids: string[] }[] = [
  {
    title: 'Ikhtisar & Analitik',
    ids: ['dashboard', 'statistik']
  },
  {
    title: 'Akademik & Buku Induk',
    ids: [
      'data-siswa',
      'tahun-pelajaran',
      'angkatan',
      'riwayat-kelas',
      'proses-akhir-tahun',
      'arsip-alumni'
    ]
  },
  {
    title: 'Mutasi & Verifikasi',
    ids: ['konfirmasi-data', 'verifikasi-perubahan', 'mutasi-masuk', 'mutasi-keluar']
  },
  {
    title: 'Data, Akun & Sistem',
    ids: [
      'import-excel',
      'export-excel',
      'backup-database',
      'akun-orang-tua',
      'audit-log',
      'pengaturan'
    ]
  }
];

export const AppSidebar: React.FC<AppSidebarProps> = ({
  currentMenu,
  onSelectMenu,
  pendingVerificationCount = 0,
  isCollapsed,
  onToggleCollapse,
  isMobileOpen,
  onCloseMobile,
  adminUser,
  role,
  profile,
  onLogout
}) => {
  const renderIcon = (iconName: string) => {
    switch (iconName) {
      case 'LayoutDashboard':
        return <LayoutDashboard className="w-4 h-4 shrink-0" />;
      case 'Users':
        return <Users className="w-4 h-4 shrink-0" />;
      case 'CalendarRange':
        return <CalendarRange className="w-4 h-4 shrink-0" />;
      case 'Layers':
        return <Layers className="w-4 h-4 shrink-0" />;
      case 'BookOpen':
        return <BookOpen className="w-4 h-4 shrink-0" />;
      case 'ArrowUpCircle':
        return <ArrowUpCircle className="w-4 h-4 shrink-0" />;
      case 'GraduationCap':
        return <GraduationCap className="w-4 h-4 shrink-0" />;
      case 'Database':
      case 'DatabaseBackup':
        return <Database className="w-4 h-4 shrink-0" />;
      case 'CheckSquare':
        return <CheckSquare className="w-4 h-4 shrink-0" />;
      case 'ClipboardCheck':
        return <ClipboardCheck className="w-4 h-4 shrink-0" />;
      case 'UserPlus':
        return <UserPlus className="w-4 h-4 shrink-0" />;
      case 'UserMinus':
        return <UserMinus className="w-4 h-4 shrink-0" />;
      case 'BarChart3':
        return <BarChart3 className="w-4 h-4 shrink-0" />;
      case 'UploadCloud':
        return <UploadCloud className="w-4 h-4 shrink-0" />;
      case 'DownloadCloud':
        return <DownloadCloud className="w-4 h-4 shrink-0" />;
      case 'KeyRound':
        return <KeyRound className="w-4 h-4 shrink-0" />;
      case 'Sliders':
        return <Sliders className="w-4 h-4 shrink-0" />;
      case 'History':
        return <History className="w-4 h-4 shrink-0" />;
      default:
        return <ChevronRight className="w-4 h-4 shrink-0" />;
    }
  };

  const getRoleLabel = (r: AdminRole | null) => {
    switch (r) {
      case 'super_admin':
        return 'Super Admin (TU)';
      case 'admin':
        return 'Administrator';
      case 'operator':
        return 'Operator Data';
      case 'viewer':
        return 'Viewer (Pengawas)';
      default:
        return 'Admin';
    }
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-[#101D35]/65 backdrop-blur-xs lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      {/* Left Navy Sidebar (#101D35) */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 bg-[#101D35] text-slate-200 flex flex-col border-r border-[#1E3256] shadow-xl transition-all duration-200 lg:translate-x-0 ${
          isCollapsed ? 'lg:w-20' : 'lg:w-64'
        } w-64 ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Brand Header */}
        <div
          className={`h-16 px-4 border-b border-[#1E3256]/80 flex items-center ${
            isCollapsed ? 'lg:justify-center justify-between' : 'justify-between'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <SchoolLogo size={36} showText={false} />
            <div className={`flex flex-col min-w-0 ${isCollapsed ? 'lg:hidden' : ''}`}>
              <span className="font-extrabold text-white text-xs tracking-tight truncate">
                {profile.nama_sekolah || 'SMP BHINNEKA'}
              </span>
              <span className="text-[10px] text-slate-400 font-medium truncate">
                SIPDS ADMIN PORTAL
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onCloseMobile}
            className="lg:hidden text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10"
            aria-label="Tutup navigasi"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User Profile Strip */}
        <div
          className={`px-3.5 py-3 bg-[#172847]/70 border-b border-[#1E3256]/80 flex items-center gap-2.5 ${
            isCollapsed ? 'lg:justify-center' : ''
          }`}
          title={
            isCollapsed
              ? `${adminUser?.nama_lengkap || 'Administrator'} (${getRoleLabel(role)})`
              : undefined
          }
        >
          <div className="w-8 h-8 rounded-xl bg-[#315FEA]/25 border border-[#315FEA]/40 flex items-center justify-center text-[#93B4FF] shrink-0">
            <Shield className="w-4 h-4" />
          </div>
          <div className={`min-w-0 flex-1 ${isCollapsed ? 'lg:hidden' : ''}`}>
            <div className="text-xs font-semibold text-white truncate">
              {adminUser?.nama_lengkap || 'Administrator'}
            </div>
            <div className="text-[11px] text-[#93B4FF] font-medium truncate">
              {getRoleLabel(role)}
            </div>
          </div>
        </div>

        {/* Grouped Navigation Menus */}
        <div className="flex-1 overflow-y-auto px-3 py-3.5 space-y-4">
          {MENU_GROUPS.map(group => {
            const visibleMenus = group.ids
              .map(id => ADMIN_MENUS.find(m => m.id === id))
              .filter(
                (m): m is (typeof ADMIN_MENUS)[number] =>
                  Boolean(m && role && canAccessMenu(role, m.id))
              );

            if (visibleMenus.length === 0) return null;

            return (
              <div key={group.title} className="space-y-1">
                <div
                  className={`px-3 pb-1 text-[10px] font-semibold text-slate-400/90 tracking-wide ${
                    isCollapsed ? 'lg:hidden' : ''
                  }`}
                >
                  {group.title}
                </div>

                {visibleMenus.map(menu => {
                  const isActive = currentMenu === menu.id;
                  const showBadge =
                    menu.id === 'verifikasi-perubahan' && pendingVerificationCount > 0;

                  return (
                    <button
                      key={menu.id}
                      type="button"
                      title={isCollapsed ? menu.label : undefined}
                      onClick={() => {
                        onSelectMenu(menu.id);
                        onCloseMobile();
                      }}
                      className={`relative w-full flex items-center ${
                        isCollapsed ? 'lg:justify-center justify-between' : 'justify-between'
                      } px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 ${
                        isActive
                          ? 'bg-[#315FEA] text-white shadow-sm'
                          : 'text-slate-300 hover:bg-[#172847] hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {renderIcon(menu.icon)}
                        <span className={`whitespace-nowrap truncate ${isCollapsed ? 'lg:hidden' : ''}`}>
                          {menu.label}
                        </span>
                      </div>

                      {showBadge && (
                        <span
                          className={`px-1.5 py-0.5 bg-[#F59E0B] text-slate-950 font-bold text-[10px] rounded-md tabular-nums ${
                            isCollapsed ? 'lg:absolute lg:top-1 lg:right-1 lg:px-1 lg:py-0' : ''
                          }`}
                        >
                          {pendingVerificationCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Sidebar Footer: Academic Year, Collapse Toggle & Logout */}
        <div className="p-3 border-t border-[#1E3256]/80 bg-[#0B1528] space-y-2">
          <div className={`px-2 text-[11px] text-slate-400 ${isCollapsed ? 'lg:hidden' : ''}`}>
            <div className="font-medium text-slate-300 truncate">
              TP {profile.tahun_ajaran} · {profile.semester_aktif}
            </div>
            <div className="text-[10px] text-slate-500 font-mono tabular-nums">
              NPSN: {profile.npsn}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onLogout}
              title={isCollapsed ? 'Keluar Sistem' : undefined}
              className={`flex-1 flex items-center ${
                isCollapsed ? 'lg:justify-center' : ''
              } gap-2 px-3 py-2 text-xs font-semibold text-rose-300 hover:bg-[#EF4444]/15 hover:text-rose-200 rounded-xl transition-colors`}
            >
              <LogOut className="w-4 h-4 shrink-0" />
              <span className={isCollapsed ? 'lg:hidden' : ''}>Keluar Sistem</span>
            </button>

            <button
              type="button"
              onClick={onToggleCollapse}
              className="hidden lg:inline-flex items-center justify-center p-2 text-slate-400 hover:text-white hover:bg-[#172847] rounded-xl transition-colors shrink-0"
              title={isCollapsed ? 'Perluas Sidebar' : 'Ciutkan Sidebar'}
              aria-label={isCollapsed ? 'Perluas Sidebar' : 'Ciutkan Sidebar'}
            >
              {isCollapsed ? (
                <PanelLeftOpen className="w-4 h-4" />
              ) : (
                <PanelLeftClose className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
