import React, { useState } from 'react';
import { ADMIN_MENUS } from '../../config/school';
import { useSchoolProfile } from '../../services/schoolService';
import { useAuth } from '../../hooks/useAuth';
import { Siswa } from '../../types';
import { GlobalSearchModal } from '../modals/GlobalSearchModal';
import { StudentLifecycleModal } from '../modals/StudentLifecycleModal';
import { AppSidebar } from './AppSidebar';
import { AppHeader } from './AppHeader';
import { PageContainer } from '../common/PageContainer';
import {
  LayoutDashboard,
  Users,
  CheckSquare,
  BarChart3,
  Menu
} from 'lucide-react';

export interface AdminLayoutProps {
  currentMenu: string;
  onSelectMenu: (menuId: string) => void;
  pendingVerificationCount?: number;
  children: React.ReactNode;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({
  currentMenu,
  onSelectMenu,
  pendingVerificationCount = 0,
  children
}) => {
  const { adminUser, role, logout } = useAuth();
  const { profile } = useSchoolProfile();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sipds_sidebar_collapsed') === '1';
    } catch {
      return false;
    }
  });
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);
  const [selectedLifecycleStudent, setSelectedLifecycleStudent] = useState<Siswa | null>(null);

  const toggleSidebarCollapse = () => {
    setIsSidebarCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('sipds_sidebar_collapsed', next ? '1' : '0');
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  };

  const currentMenuObj = ADMIN_MENUS.find(m => m.id === currentMenu);

  return (
    <div className="min-h-screen flex bg-[#F5F7FB] text-[#0F172A]">
      {/* Reusable Collapsible AppSidebar */}
      <AppSidebar
        currentMenu={currentMenu}
        onSelectMenu={onSelectMenu}
        pendingVerificationCount={pendingVerificationCount}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={toggleSidebarCollapse}
        isMobileOpen={isMobileOpen}
        onCloseMobile={() => setIsMobileOpen(false)}
        adminUser={adminUser}
        role={role}
        profile={profile}
        onLogout={logout}
      />

      {/* Main Content Area */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-all duration-200 ${
          isSidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64'
        }`}
      >
        {/* Reusable Responsive AppHeader */}
        <AppHeader
          currentMenuLabel={currentMenuObj?.label || 'Dashboard'}
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleSidebarCollapse={toggleSidebarCollapse}
          onOpenMobileMenu={() => setIsMobileOpen(true)}
          onOpenGlobalSearch={() => setIsGlobalSearchOpen(true)}
          onSelectMenu={onSelectMenu}
          pendingVerificationCount={pendingVerificationCount}
          profile={profile}
        />

        {/* Content Viewport with PageContainer */}
        <main className="flex-1 p-3.5 sm:p-6 lg:p-7 pb-20 lg:pb-8">
          <PageContainer>{children}</PageContainer>
        </main>

        {/* Global Cross-Cohort Search Modal */}
        <GlobalSearchModal
          isOpen={isGlobalSearchOpen}
          onClose={() => setIsGlobalSearchOpen(false)}
          onSelectStudent={student => {
            setIsGlobalSearchOpen(false);
            setSelectedLifecycleStudent(student);
          }}
        />

        {/* Student Complete Lifecycle Journey Modal */}
        <StudentLifecycleModal
          student={selectedLifecycleStudent}
          onClose={() => setSelectedLifecycleStudent(null)}
        />

        {/* Mobile Bottom Quick Navigation Bar */}
        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-xs border-t border-slate-200/90 shadow-lg flex items-center justify-around py-1.5 px-2">
          <button
            type="button"
            onClick={() => onSelectMenu('dashboard')}
            className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl text-[10px] font-semibold transition-colors ${
              currentMenu === 'dashboard' ? 'text-[#315FEA]' : 'text-slate-500'
            }`}
          >
            <LayoutDashboard className="w-4 h-4 mb-0.5" />
            <span>Beranda</span>
          </button>
          <button
            type="button"
            onClick={() => onSelectMenu('data-siswa')}
            className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl text-[10px] font-semibold transition-colors ${
              currentMenu === 'data-siswa' ? 'text-[#315FEA]' : 'text-slate-500'
            }`}
          >
            <Users className="w-4 h-4 mb-0.5" />
            <span>Data Siswa</span>
          </button>
          <button
            type="button"
            onClick={() => onSelectMenu('verifikasi-perubahan')}
            className={`relative flex flex-col items-center justify-center py-1 px-2 rounded-xl text-[10px] font-semibold transition-colors ${
              currentMenu === 'verifikasi-perubahan' ? 'text-[#315FEA]' : 'text-slate-500'
            }`}
          >
            <CheckSquare className="w-4 h-4 mb-0.5" />
            <span>Verifikasi</span>
            {pendingVerificationCount > 0 && (
              <span className="absolute top-0.5 right-2 px-1 bg-[#F59E0B] text-slate-950 rounded text-[9px] font-bold tabular-nums">
                {pendingVerificationCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => onSelectMenu('statistik')}
            className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl text-[10px] font-semibold transition-colors ${
              currentMenu === 'statistik' ? 'text-[#315FEA]' : 'text-slate-500'
            }`}
          >
            <BarChart3 className="w-4 h-4 mb-0.5" />
            <span>Statistik</span>
          </button>
          <button
            type="button"
            onClick={() => setIsMobileOpen(true)}
            className="flex flex-col items-center justify-center py-1 px-2 rounded-xl text-[10px] font-semibold text-slate-600"
          >
            <Menu className="w-4 h-4 mb-0.5" />
            <span>Menu Lain</span>
          </button>
        </nav>
      </div>
    </div>
  );
};

