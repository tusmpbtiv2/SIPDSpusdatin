import React, { useEffect } from 'react';
import { SchoolProfile } from '../../types';
import {
  Menu,
  ChevronRight,
  Search,
  ExternalLink,
  PanelLeftClose,
  PanelLeftOpen,
  CheckSquare
} from 'lucide-react';

export interface AppHeaderProps {
  currentMenuLabel: string;
  isSidebarCollapsed: boolean;
  onToggleSidebarCollapse: () => void;
  onOpenMobileMenu: () => void;
  onOpenGlobalSearch: () => void;
  onSelectMenu?: (menuId: string) => void;
  pendingVerificationCount?: number;
  profile: SchoolProfile;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  currentMenuLabel,
  isSidebarCollapsed,
  onToggleSidebarCollapse,
  onOpenMobileMenu,
  onOpenGlobalSearch,
  onSelectMenu,
  pendingVerificationCount = 0,
  profile
}) => {
  // Support Ctrl+K / Cmd+K shortcut to open Global Search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenGlobalSearch();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onOpenGlobalSearch]);

  return (
    <header className="h-16 bg-white/95 backdrop-blur-xs border-b border-slate-200/80 sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 shadow-[0_1px_2px_0_rgba(16,29,53,0.03)]">
      {/* Left Zone: Mobile/Collapse Toggle + Breadcrumb */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors"
          aria-label="Buka navigasi"
        >
          <Menu className="w-5 h-5" />
        </button>

        <button
          type="button"
          onClick={onToggleSidebarCollapse}
          className="hidden lg:inline-flex p-2 rounded-xl text-slate-500 hover:text-[#0F172A] hover:bg-slate-100 transition-colors"
          title={isSidebarCollapsed ? 'Perluas Sidebar' : 'Ciutkan Sidebar'}
          aria-label="Ubah ukuran sidebar"
        >
          {isSidebarCollapsed ? (
            <PanelLeftOpen className="w-4 h-4" />
          ) : (
            <PanelLeftClose className="w-4 h-4" />
          )}
        </button>

        <div className="flex items-center gap-2 text-xs min-w-0">
          <span className="text-slate-400 font-medium hidden sm:inline whitespace-nowrap">
            SIPDS Admin
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-300 hidden sm:inline shrink-0" />
          <span className="text-[#0F172A] font-bold text-sm truncate">
            {currentMenuLabel}
          </span>
        </div>
      </div>

      {/* Right Zone: Global Search + Pending Verification Shortcut + School Info */}
      <div className="flex items-center gap-2.5 sm:gap-3.5 shrink-0">
        <button
          type="button"
          onClick={onOpenGlobalSearch}
          className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-[#F5F7FB] hover:bg-[#EEF3FF] text-slate-700 hover:text-[#315FEA] border border-slate-200/90 hover:border-[#315FEA]/30 text-xs font-semibold transition-all duration-150"
          title="Cari siswa aktif, alumni, atau mutasi lintas angkatan (Ctrl+K)"
        >
          <Search className="w-3.5 h-3.5 text-[#315FEA]" />
          <span className="hidden md:inline whitespace-nowrap">
            Pencarian Global Lintas Angkatan
          </span>
          <span className="md:hidden whitespace-nowrap">Cari Global</span>
          <kbd className="hidden lg:inline-block px-1.5 py-0.5 text-[10px] font-mono font-semibold text-slate-400 bg-white border border-slate-200 rounded-md">
            Ctrl K
          </kbd>
        </button>

        {pendingVerificationCount > 0 && onSelectMenu && (
          <button
            type="button"
            onClick={() => onSelectMenu('verifikasi-perubahan')}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#FFFBEB] hover:bg-amber-100/80 text-[#D97706] border border-[#F59E0B]/30 text-xs font-semibold transition-colors"
            title="Lihat pengajuan perubahan biodata yang menunggu verifikasi"
          >
            <CheckSquare className="w-3.5 h-3.5" />
            <span className="tabular-nums font-bold">{pendingVerificationCount}</span>
            <span className="hidden xl:inline">Verifikasi</span>
          </button>
        )}

        <div className="hidden sm:flex flex-col text-right">
          <span className="text-xs font-bold text-[#0F172A] leading-tight">
            {profile.nama_sekolah}
          </span>
          <span className="text-[11px] text-slate-500 font-mono tabular-nums">
            TP {profile.tahun_ajaran} ·{' '}
            {new Date().toLocaleDateString('id-ID', {
              day: '2-digit',
              month: 'short',
              year: 'numeric'
            })}
          </span>
        </div>

        {profile.website && (
          <>
            <div className="h-6 w-px bg-slate-200 hidden xl:block" />
            <a
              href={profile.website}
              target="_blank"
              rel="noreferrer"
              className="hidden xl:inline-flex items-center gap-1 text-xs text-[#315FEA] hover:text-[#254EDB] font-semibold transition-colors whitespace-nowrap"
            >
              <span>Portal Sekolah</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </>
        )}
      </div>
    </header>
  );
};
