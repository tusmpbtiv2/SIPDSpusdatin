/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from './hooks/useAuth';
import { getSiswaByNisn, getPerubahanList } from './services/dataService';
import { Siswa } from './types';

// Common Components
import { ToastContainer } from './components/common/ToastContainer';

// Layouts
import { AdminLayout } from './components/layout/AdminLayout';
import { ParentLayout } from './components/layout/ParentLayout';

// Public Auth & Registration Pages
import { LandingPage } from './pages/LandingPage';
import { AdminLoginPage } from './pages/AdminLoginPage';
import { ParentLoginPage } from './pages/ParentLoginPage';
import { PendaftaranMuridBaruPage } from './pages/PendaftaranMuridBaruPage';

// Admin Pages
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { DataSiswaPage } from './pages/admin/DataSiswaPage';
import { TahunPelajaranPage } from './pages/admin/TahunPelajaranPage';
import { AngkatanPage } from './pages/admin/AngkatanPage';
import { RiwayatKelasPage } from './pages/admin/RiwayatKelasPage';
import { ProsesAkhirTahunPage } from './pages/admin/ProsesAkhirTahunPage';
import { ArsipAlumniPage } from './pages/admin/ArsipAlumniPage';
import { BackupDatabasePage } from './pages/admin/BackupDatabasePage';
import { VerifikasiPerubahanPage } from './pages/admin/VerifikasiPerubahanPage';
import { MutasiMasukPage } from './pages/admin/MutasiMasukPage';
import { MutasiKeluarPage } from './pages/admin/MutasiKeluarPage';
import { StatistikPage } from './pages/admin/StatistikPage';
import { ImportExcelPage } from './pages/admin/ImportExcelPage';
import { ExportExcelPage } from './pages/admin/ExportExcelPage';
import { AkunOrangTuaPage } from './pages/admin/AkunOrangTuaPage';
import { PengaturanPage } from './pages/admin/PengaturanPage';
import { AuditLogPage } from './pages/admin/AuditLogPage';
import { KonfirmasiDataPage } from './pages/admin/KonfirmasiDataPage';

// Parent Pages
import { ParentDashboard } from './pages/parent/ParentDashboard';
import { KonfirmasiDataParentPage } from './pages/parent/KonfirmasiDataParentPage';
import { BiodataAnakPage } from './pages/parent/BiodataAnakPage';
import { PerbaikiBiodataPage } from './pages/parent/PerbaikiBiodataPage';
import { PengajuanSayaPage } from './pages/parent/PengajuanSayaPage';
import { RiwayatPerubahanPage } from './pages/parent/RiwayatPerubahanPage';
import { ProfilAkunPage } from './pages/parent/ProfilAkunPage';

type PublicView = 'landing' | 'login-admin' | 'login-parent' | 'pendaftaran-baru';

export default function App() {
  const { isAuthenticated, isAdmin, isParent, parentUser } = useAuth();

  // Navigation State
  const [publicView, setPublicView] = useState<PublicView>('landing');
  const [adminMenu, setAdminMenu] = useState<string>('dashboard');
  const [parentMenu, setParentMenu] = useState<string>('parent-dashboard');

  // Linked Student data for authenticated parent
  const [linkedStudent, setLinkedStudent] = useState<Siswa | null>(null);
  const [pendingVerificationCount, setPendingVerificationCount] = useState<number>(0);
  const [loadingStudent, setLoadingStudent] = useState<boolean>(false);

  // Poll or load pending verifications for admin badge
  useEffect(() => {
    if (isAdmin) {
      getPerubahanList().then(list => {
        setPendingVerificationCount(list.filter(p => p.status === 'pending').length);
      }).catch(() => {});
    }
  }, [isAdmin, adminMenu]);

  // Load student for authenticated parent
  useEffect(() => {
    if (isParent && parentUser?.nisn) {
      setLoadingStudent(true);
      getSiswaByNisn(parentUser.nisn).then(s => {
        setLinkedStudent(s);
      }).finally(() => {
        setLoadingStudent(false);
      });
    } else {
      setLinkedStudent(null);
    }
  }, [isParent, parentUser?.nisn, parentMenu]);

  // 1. PUBLIC ROUTING (Unauthenticated)
  if (!isAuthenticated) {
    if (publicView === 'pendaftaran-baru') {
      return (
        <>
          <PendaftaranMuridBaruPage
            onBack={() => setPublicView('landing')}
            onSelectAdminLogin={() => setPublicView('login-admin')}
            onSelectParentLogin={() => setPublicView('login-parent')}
          />
          <ToastContainer />
        </>
      );
    }

    if (publicView === 'login-admin') {
      return (
        <>
          <AdminLoginPage
            onBack={() => setPublicView('landing')}
            onSwitchToParent={() => setPublicView('login-parent')}
            onOpenPendaftaranBaru={() => setPublicView('pendaftaran-baru')}
            onLoginSuccess={() => setAdminMenu('dashboard')}
          />
          <ToastContainer />
        </>
      );
    }

    if (publicView === 'login-parent') {
      return (
        <>
          <ParentLoginPage
            onBack={() => setPublicView('landing')}
            onSwitchToAdmin={() => setPublicView('login-admin')}
            onOpenPendaftaranBaru={() => setPublicView('pendaftaran-baru')}
            onLoginSuccess={() => setParentMenu('parent-dashboard')}
          />
          <ToastContainer />
        </>
      );
    }

    return (
      <>
        <LandingPage
          onSelectAdminLogin={() => setPublicView('login-admin')}
          onSelectParentLogin={() => setPublicView('login-parent')}
          onSelectPendaftaranBaru={() => setPublicView('pendaftaran-baru')}
        />
        <ToastContainer />
      </>
    );
  }

  // 2. ADMIN PORTAL ROUTING
  if (isAdmin) {
    const renderAdminContent = () => {
      switch (adminMenu) {
        case 'dashboard':
          return <AdminDashboard onNavigate={setAdminMenu} />;
        case 'data-siswa':
          return <DataSiswaPage />;
        case 'tahun-pelajaran':
          return <TahunPelajaranPage />;
        case 'angkatan':
          return <AngkatanPage />;
        case 'riwayat-kelas':
          return <RiwayatKelasPage />;
        case 'proses-akhir-tahun':
          return <ProsesAkhirTahunPage />;
        case 'arsip-alumni':
          return <ArsipAlumniPage />;
        case 'backup-database':
          return <BackupDatabasePage />;
        case 'konfirmasi-data':
          return <KonfirmasiDataPage />;
        case 'verifikasi-perubahan':
          return <VerifikasiPerubahanPage />;
        case 'mutasi-masuk':
          return <MutasiMasukPage />;
        case 'mutasi-keluar':
          return <MutasiKeluarPage />;
        case 'statistik':
          return <StatistikPage />;
        case 'import-excel':
          return <ImportExcelPage onImportComplete={() => setAdminMenu('data-siswa')} />;
        case 'export-excel':
          return <ExportExcelPage />;
        case 'akun-orang-tua':
          return <AkunOrangTuaPage />;
        case 'pengaturan':
          return <PengaturanPage />;
        case 'audit-log':
          return <AuditLogPage />;
        default:
          return <AdminDashboard onNavigate={setAdminMenu} />;
      }
    };

    return (
      <AdminLayout
        currentMenu={adminMenu}
        onSelectMenu={setAdminMenu}
        pendingVerificationCount={pendingVerificationCount}
      >
        {renderAdminContent()}
        <ToastContainer />
      </AdminLayout>
    );
  }

  // 3. PARENT PORTAL ROUTING
  if (isParent) {
    if (loadingStudent) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center text-xs text-slate-500 font-medium">
          Memuat data siswa SMP Bhinneka Tunggal Ika...
        </div>
      );
    }

    if (!linkedStudent) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-center">
          <div className="bg-white p-8 rounded-xl border border-slate-200 max-w-md shadow-xs">
            <h3 className="font-bold text-slate-900 text-base">Data Siswa Tidak Ditemukan</h3>
            <p className="text-xs text-slate-500 mt-2">
              Akun Anda terhubung dengan NISN <strong>{parentUser?.nisn}</strong>, namun rekaman siswa belum terdaftar di database. Silakan hubungi Tata Usaha sekolah.
            </p>
          </div>
        </div>
      );
    }

    const renderParentContent = () => {
      switch (parentMenu) {
        case 'parent-dashboard':
          return <ParentDashboard student={linkedStudent} onNavigate={setParentMenu} />;
        case 'konfirmasi-data-parent':
          return (
            <KonfirmasiDataParentPage
              student={linkedStudent}
              onRefreshStudent={() => {
                getSiswaByNisn(linkedStudent.nisn).then(s => {
                  if (s) setLinkedStudent(s);
                });
              }}
            />
          );
        case 'biodata-anak':
          return (
            <BiodataAnakPage
              student={linkedStudent}
              onNavigateToPerbaiki={() => setParentMenu('perbaiki-biodata')}
            />
          );
        case 'perbaiki-biodata':
          return (
            <PerbaikiBiodataPage
              student={linkedStudent}
              onSuccessSubmit={() => setParentMenu('pengajuan-saya')}
            />
          );
        case 'pengajuan-saya':
          return (
            <PengajuanSayaPage
              student={linkedStudent}
              onNavigateToForm={() => setParentMenu('perbaiki-biodata')}
            />
          );
        case 'riwayat-perubahan':
          return <RiwayatPerubahanPage student={linkedStudent} />;
        case 'profil-akun':
          return <ProfilAkunPage student={linkedStudent} />;
        default:
          return <ParentDashboard student={linkedStudent} onNavigate={setParentMenu} />;
      }
    };

    return (
      <ParentLayout
        currentMenu={parentMenu}
        onSelectMenu={setParentMenu}
        student={linkedStudent}
      >
        {renderParentContent()}
        <ToastContainer />
      </ParentLayout>
    );
  }

  return null;
}
