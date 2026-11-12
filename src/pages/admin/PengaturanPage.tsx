import React, { useState, useEffect } from 'react';
import { SCHOOL_CONFIG } from '../../config/school';
import {
  testSupabaseConnection,
  isSupabaseConfigured,
  SUPABASE_REQUIRED_TABLES
} from '../../services/supabase';
import {
  getClassesList,
  saveClassRecord,
  getAcademicYearsList,
  saveAcademicYearRecord,
  getAdminProfilesList,
  createAdminAccount,
  updateAdminProfileRoleOrStatus,
  getParentAccounts,
  activateParentAccount,
  toggleParentAccountStatus,
  getAuditLogs
} from '../../services/dataService';
import {
  ClassRecord,
  AcademicYearRecord,
  AdminAccountRecord,
  AdminRole,
  ParentAccountRecord,
  AuditLog
} from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { ZeroPillBadge } from '../../components/common/ZeroPillBadge';
import { PageTitle } from '../../components/common/PageTitle';
import { DataTable } from '../../components/common/ModernTable';
import { ConfirmationModal } from '../../components/common/ConfirmationModal';
import { ParentAccountModal } from '../../components/admin/ParentAccountModal';
import {
  School,
  Database,
  Shield,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Copy,
  Check,
  FileCode,
  Download,
  BookOpen,
  Calendar,
  Users,
  KeyRound,
  History,
  Plus,
  Power,
  Save,
  Upload,
  RotateCcw,
  Image as ImageIcon,
  Building
} from 'lucide-react';
import { useSchoolProfile, saveSchoolProfile, resetSchoolProfile } from '../../services/schoolService';
import { SchoolLogo } from '../../components/common/SchoolLogo';
import { formatDateDMY, formatDateTimeDMY } from '../../utils/formatters';

type SettingsTab =
  | 'identitas_sekolah'
  | 'kelas'
  | 'tahun_ajaran'
  | 'akun_admin'
  | 'akun_ortu'
  | 'audit_log'
  | 'supabase_doc';

export const PengaturanPage: React.FC = () => {
  const { adminUser, role } = useAuth();
  const { success, error: notifyError } = useNotification();

  const [activeTab, setActiveTab] = useState<SettingsTab>('identitas_sekolah');
  const canManageSystem = role === 'super_admin' || role === 'admin';

  // School profile state
  const { profile: schoolProfile } = useSchoolProfile();
  const [profileForm, setProfileForm] = useState(schoolProfile);

  useEffect(() => {
    setProfileForm(schoolProfile);
  }, [schoolProfile]);

  // Data states
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYearRecord[]>([]);
  const [adminProfiles, setAdminProfiles] = useState<AdminAccountRecord[]>([]);
  const [parentAccounts, setParentAccounts] = useState<ParentAccountRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);

  // Form: Kelas
  const [namaKelas, setNamaKelas] = useState('');
  const [tingkatKelas, setTingkatKelas] = useState<'7' | '8' | '9'>('7');
  const [waliKelas, setWaliKelas] = useState('');
  const [kamarDefault, setKamarDefault] = useState('');
  const [kapasitasKelas, setKapasitasKelas] = useState<number>(36);

  // Form: Tahun Ajaran
  const [taName, setTaName] = useState('2026/2027');
  const [taSemester, setTaSemester] = useState<'Ganjil' | 'Genap'>('Ganjil');
  const [taMulai, setTaMulai] = useState('2026-07-13');
  const [taSelesai, setTaSelesai] = useState('2026-12-19');
  const [taIsActive, setTaIsActive] = useState(true);

  // Form: Akun Admin
  const [adminEmail, setAdminEmail] = useState('');
  const [adminUsername, setAdminUsername] = useState('');
  const [adminFullName, setAdminFullName] = useState('');
  const [adminRole, setAdminRole] = useState<AdminRole>('operator');
  const [adminPhone, setAdminPhone] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  // Modal: Akun Orang Tua (Aktivasi / Reset Password)
  const [selectedParentAccount, setSelectedParentAccount] = useState<ParentAccountRecord | null>(
    null
  );
  const [isParentModalOpen, setIsParentModalOpen] = useState(false);

  // Supabase connection & SQL state
  const [isTesting, setIsTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{
    success: boolean;
    message: string;
    tablesReady?: boolean;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [migrationSql, setMigrationSql] = useState<string>('');
  const [showSqlPreview, setShowSqlPreview] = useState<boolean>(false);

  const loadAllSettingsData = async () => {
    setLoading(true);
    try {
      const [cList, ayList, admList, pList, aLogs] = await Promise.all([
        getClassesList(),
        getAcademicYearsList(),
        getAdminProfilesList(),
        getParentAccounts(),
        getAuditLogs()
      ]);
      setClasses(cList);
      setAcademicYears(ayList);
      setAdminProfiles(admList);
      setParentAccounts(pList);
      setAuditLogs(aLogs.slice(0, 50));
    } catch {
      notifyError('Gagal Memuat Pengaturan', 'Tidak dapat mengambil sebagian data pengaturan.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllSettingsData();
    if (isSupabaseConfigured) {
      testSupabaseConnection().then(setConnectionStatus);
    }
    fetch('/api/supabase/migration-sql')
      .then(async res => {
        const text = await res.text();
        if (!text || text.trim().startsWith('<')) return null;
        return JSON.parse(text);
      })
      .then(data => {
        if (data?.sql) setMigrationSql(data.sql);
      })
      .catch(() => {});
  }, []);

  const actor = {
    id: adminUser?.id || 'admin',
    name: adminUser?.nama_lengkap || 'Admin Tata Usaha',
    role: adminUser?.role || 'admin'
  };

  // Handlers: Kelas
  const handleSaveClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!namaKelas.trim()) return;
    try {
      await saveClassRecord(
        {
          nama_kelas: namaKelas.trim().toUpperCase(),
          tingkat: tingkatKelas,
          wali_kelas: waliKelas.trim() || undefined,
          kamar_default: kamarDefault.trim() || undefined,
          kapasitas: kapasitasKelas || 36,
          is_active: true
        },
        actor
      );
      success('Kelas Disimpan', `Data Kelas ${namaKelas.toUpperCase()} berhasil disimpan.`);
      setNamaKelas('');
      setWaliKelas('');
      setKamarDefault('');
      await loadAllSettingsData();
    } catch (err: unknown) {
      notifyError('Gagal Menyimpan Kelas', err instanceof Error ? err.message : 'Kesalahan sistem');
    }
  };

  const handleToggleClassActive = async (cls: ClassRecord) => {
    try {
      await saveClassRecord(
        {
          id: cls.id,
          nama_kelas: cls.nama_kelas,
          tingkat: cls.tingkat,
          wali_kelas: cls.wali_kelas,
          kamar_default: cls.kamar_default,
          kapasitas: cls.kapasitas,
          is_active: !cls.is_active
        },
        actor
      );
      success(
        'Status Kelas Diubah',
        `Kelas ${cls.nama_kelas} kini ${!cls.is_active ? 'Aktif' : 'Non-Aktif'}.`
      );
      await loadAllSettingsData();
    } catch (err: unknown) {
      notifyError('Gagal Mengubah Status', err instanceof Error ? err.message : 'Kesalahan sistem');
    }
  };

  // Handlers: Tahun Ajaran
  const handleSaveAcademicYear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taName.trim()) return;
    try {
      await saveAcademicYearRecord(
        {
          tahun_ajaran: taName.trim(),
          semester: taSemester,
          is_active: taIsActive,
          tanggal_mulai: taMulai || undefined,
          tanggal_selesai: taSelesai || undefined
        },
        actor
      );
      success(
        'Tahun Ajaran Disimpan',
        `Tahun Ajaran ${taName} (${taSemester}) berhasil disimpan.`
      );
      await loadAllSettingsData();
    } catch (err: unknown) {
      notifyError(
        'Gagal Menyimpan Tahun Ajaran',
        err instanceof Error ? err.message : 'Kesalahan sistem'
      );
    }
  };

  const handleSetActiveYear = async (ay: AcademicYearRecord) => {
    try {
      await saveAcademicYearRecord(
        {
          id: ay.id,
          tahun_ajaran: ay.tahun_ajaran,
          semester: ay.semester,
          is_active: true,
          tanggal_mulai: ay.tanggal_mulai,
          tanggal_selesai: ay.tanggal_selesai
        },
        actor
      );
      success(
        'Tahun Ajaran Aktif Diubah',
        `${ay.tahun_ajaran} Semester ${ay.semester} ditetapkan sebagai Tahun Ajaran Aktif.`
      );
      await loadAllSettingsData();
    } catch (err: unknown) {
      notifyError('Gagal Mengaktifkan', err instanceof Error ? err.message : 'Kesalahan sistem');
    }
  };

  // Handlers: Akun Admin & Role
  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createAdminAccount(
        {
          email: adminEmail.trim(),
          username: adminUsername.trim() || adminEmail.split('@')[0],
          full_name: adminFullName.trim(),
          role: adminRole,
          password: adminPassword,
          phone: adminPhone.trim() || undefined
        },
        actor
      );
      success('Akun Admin Dibuat', `Akun staf ${adminFullName} (${adminRole}) berhasil dibuat.`);
      setAdminEmail('');
      setAdminUsername('');
      setAdminFullName('');
      setAdminPassword('');
      setAdminPhone('');
      await loadAllSettingsData();
    } catch (err: unknown) {
      notifyError('Gagal Membuat Akun Admin', err instanceof Error ? err.message : 'Kesalahan');
    }
  };

  const handleChangeAdminRole = async (target: AdminAccountRecord, newRole: AdminRole) => {
    try {
      await updateAdminProfileRoleOrStatus(target.id, { role: newRole }, actor);
      success('Role Diperbarui', `Role untuk ${target.full_name} diubah menjadi ${newRole}.`);
      await loadAllSettingsData();
    } catch (err: unknown) {
      notifyError('Gagal Mengubah Role', err instanceof Error ? err.message : 'Kesalahan');
    }
  };

  const handleToggleAdminStatus = async (target: AdminAccountRecord) => {
    try {
      await updateAdminProfileRoleOrStatus(target.id, { is_active: !target.is_active }, actor);
      success(
        'Status Akun Admin Diubah',
        `Akun ${target.full_name} telah ${!target.is_active ? 'diaktifkan' : 'dinonaktifkan'}.`
      );
      await loadAllSettingsData();
    } catch (err: unknown) {
      notifyError('Gagal Mengubah Status', err instanceof Error ? err.message : 'Kesalahan');
    }
  };

  // Handlers: Akun Orang Tua
  const handleActivateParent = async (nisn: string, customPassword?: string) => {
    const res = await activateParentAccount(nisn, customPassword, actor);
    success('Aktivasi / Reset Password Berhasil', res.message);
    await loadAllSettingsData();
    return res;
  };

  const handleToggleParentStatus = async (acc: ParentAccountRecord) => {
    try {
      await toggleParentAccountStatus(acc.nisn, !acc.is_active, actor);
      success(
        'Status Akun Orang Tua Diubah',
        `Akun NISN ${acc.nisn} (${acc.nama_siswa}) kini ${
          !acc.is_active ? 'Aktif' : 'Non-Aktif'
        }.`
      );
      await loadAllSettingsData();
    } catch (err: unknown) {
      notifyError('Gagal Mengubah Status', err instanceof Error ? err.message : 'Kesalahan');
    }
  };

  // Handlers: Supabase Test & SQL
  const handleTestConnection = async () => {
    setIsTesting(true);
    try {
      const res = await testSupabaseConnection();
      setConnectionStatus(res);
      if (res.success) {
        success('Koneksi Berhasil', res.message);
      } else {
        notifyError('Koneksi Belum Aktif', res.message);
      }
    } finally {
      setIsTesting(false);
    }
  };

  const handleCopySql = () => {
    if (!migrationSql) return;
    navigator.clipboard.writeText(migrationSql);
    setCopied(true);
    success(
      'SQL Migration Disalin',
      'Seluruh skrip SQL 11 tabel, RLS, & RPC berhasil disalin ke clipboard.'
    );
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownloadSql = () => {
    if (!migrationSql) return;
    const blob = new Blob([migrationSql], { type: 'text/sql;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '20261103000001_sipds_complete_schema.sql';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Handlers: Identitas & Logo Sekolah
  const handleLogoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      notifyError('Format Tidak Didukung', 'Harap pilih file gambar (PNG, JPG, SVG, WebP).');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      notifyError('Ukuran Terlalu Besar', 'Maksimal ukuran logo adalah 2 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = event => {
      const base64 = event.target?.result as string;
      setProfileForm(prev => ({ ...prev, logo_url: base64 }));
      success(
        'Logo Dimuat',
        'Pratinjau logo berhasil dimuat. Klik "Simpan Identitas Sekolah" untuk menerapkan.'
      );
    };
    reader.readAsDataURL(file);
  };

  const handleSaveSchoolProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileForm.nama_sekolah.trim()) {
      notifyError('Validasi Gagal', 'Nama sekolah wajib diisi.');
      return;
    }
    saveSchoolProfile(profileForm);
    success(
      'Identitas Sekolah Disimpan',
      `Identitas dan logo untuk "${profileForm.nama_sekolah}" berhasil diterapkan ke seluruh aplikasi, kop cetak, dan dashboard.`
    );
  };

  const [isResetProfileConfirmOpen, setIsResetProfileConfirmOpen] = useState(false);

  const handleResetSchoolProfile = () => {
    setIsResetProfileConfirmOpen(true);
  };

  const confirmResetSchoolProfile = () => {
    const def = resetSchoolProfile();
    setProfileForm(def);
    setIsResetProfileConfirmOpen(false);
    success('Profil Direset', 'Identitas sekolah dikembalikan ke standar SMP BHINNEKA TUNGGAL IKA.');
  };

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    {
      id: 'identitas_sekolah',
      label: 'Identitas & Logo Sekolah',
      icon: <Building className="w-3.5 h-3.5" />
    },
    { id: 'kelas', label: 'Manajemen Kelas', icon: <BookOpen className="w-3.5 h-3.5" /> },
    {
      id: 'tahun_ajaran',
      label: 'Tahun Ajaran',
      icon: <Calendar className="w-3.5 h-3.5" />
    },
    {
      id: 'akun_admin',
      label: 'Akun Admin & Role',
      icon: <Users className="w-3.5 h-3.5" />
    },
    {
      id: 'akun_ortu',
      label: 'Akun Orang Tua (NISN)',
      icon: <KeyRound className="w-3.5 h-3.5" />
    },
    { id: 'audit_log', label: 'Audit Log', icon: <History className="w-3.5 h-3.5" /> },
    {
      id: 'supabase_doc',
      label: 'Supabase & Dokumentasi',
      icon: <Database className="w-3.5 h-3.5" />
    }
  ];

  return (
    <div className="space-y-6">
      <PageTitle
        category="Data, Akun & Sistem"
        title="Pengaturan Sistem & Tata Kelola SIPDS"
        subtitle="Ubah Identitas & Logo Sekolah, Manajemen Kelas, Tahun Ajaran, Akun Admin & Role, Akun Orang Tua Berbasis NISN, Audit Log, serta Konfigurasi Supabase."
        icon={School}
        actions={
          <button
            type="button"
            onClick={loadAllSettingsData}
            className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#315FEA]' : ''}`} />
            <span>Muat Ulang</span>
          </button>
        }
      />

      {/* Navigation Tabs */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-2 shadow-[0_1px_3px_rgba(16,29,53,0.05)] flex items-center gap-1.5 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-all cursor-pointer ${
              activeTab === t.id
                ? 'bg-[#101D35] text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-[#101D35]'
            }`}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* =================================================================== */}
      {/* TAB 0: IDENTITAS & LOGO SEKOLAH (MULTI-SEKOLAH)                     */}
      {/* =================================================================== */}
      {activeTab === 'identitas_sekolah' && (
        <form onSubmit={handleSaveSchoolProfile} className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-[0_1px_3px_rgba(16,29,53,0.05)] space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#315FEA]/10 border border-[#315FEA]/20 flex items-center justify-center text-[#315FEA] shrink-0">
                  <Building className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    Kustomisasi Identitas Lembaga &amp; Logo Sekolah
                  </h3>
                  <p className="text-xs text-slate-500">
                    Aplikasi ini dapat disesuaikan untuk sekolah lain. Identitas &amp; logo akan otomatis diterapkan pada Kop Cetak Biodata F4, Laporan PDF, Header, dan Dashboard.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleResetSchoolProfile}
                  className="px-3 py-2 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                  <span>Reset ke Bawaan</span>
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-2xs transition-colors"
                >
                  <Save className="w-4 h-4" />
                  <span>Simpan Perubahan</span>
                </button>
              </div>
            </div>

            {/* Bagian Logo Sekolah */}
            <div className="p-5 rounded-xl bg-slate-50/70 border border-slate-200 space-y-4">
              <div className="font-bold text-slate-900 text-xs flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-blue-900" />
                <span>Logo Resmi Sekolah (Kop Surat &amp; Navigasi)</span>
              </div>

              <div className="flex flex-col md:flex-row items-center gap-6">
                {/* Logo Preview Container */}
                <div className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl border border-slate-200 shadow-2xs shrink-0 w-44">
                  <div className="w-24 h-24 flex items-center justify-center bg-slate-50 rounded-lg border border-slate-100 overflow-hidden">
                    {profileForm.logo_url ? (
                      <img
                        src={profileForm.logo_url}
                        alt="Logo Pratinjau"
                        className="max-w-full max-h-full object-contain"
                        onError={() => {
                          notifyError('Gagal Memuat Logo', 'URL logo tidak valid atau gambar tidak dapat diakses.');
                        }}
                      />
                    ) : (
                      <SchoolLogo size={64} showText={false} />
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium text-center">
                    {profileForm.logo_url ? 'Logo Kustom Terpasang' : 'Logo Default (Lambang)'}
                  </span>
                </div>

                {/* Upload & URL Input */}
                <div className="space-y-3 flex-1 w-full text-xs">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Unggah File Logo Baru (PNG, JPG, SVG, WebP — Maks 2MB)
                    </label>
                    <div className="flex items-center gap-2">
                      <label className="px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold rounded-lg cursor-pointer flex items-center gap-1.5 shadow-2xs">
                        <Upload className="w-3.5 h-3.5 text-blue-900" />
                        <span>Pilih Gambar Logo...</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleLogoFileUpload}
                          className="hidden"
                        />
                      </label>
                      {profileForm.logo_url && (
                        <button
                          type="button"
                          onClick={() => setProfileForm(p => ({ ...p, logo_url: '' }))}
                          className="px-3 py-2 bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 font-semibold rounded-lg"
                        >
                          Hapus Logo Kustom
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Atau Masukkan URL Langsung Gambar Logo
                    </label>
                    <input
                      type="url"
                      value={profileForm.logo_url || ''}
                      onChange={e => setProfileForm(p => ({ ...p, logo_url: e.target.value }))}
                      placeholder="https://domain-sekolah.sch.id/assets/logo.png"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-xs bg-white"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      Disarankan menggunakan gambar latar belakang transparan (PNG atau SVG) dengan resolusi rasio persegi (1:1).
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Bagian Profil Data Sekolah */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
              <div className="md:col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">
                  Nama Resmi Sekolah *
                </label>
                <input
                  type="text"
                  required
                  value={profileForm.nama_sekolah}
                  onChange={e => setProfileForm(p => ({ ...p, nama_sekolah: e.target.value }))}
                  placeholder="Contoh: SMP BHINNEKA TUNGGAL IKA"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  NPSN (Nomor Pokok Sekolah Nasional) *
                </label>
                <input
                  type="text"
                  required
                  value={profileForm.npsn}
                  onChange={e => setProfileForm(p => ({ ...p, npsn: e.target.value }))}
                  placeholder="20100001"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono font-bold"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Status Akreditasi
                </label>
                <input
                  type="text"
                  value={profileForm.status_akreditasi}
                  onChange={e => setProfileForm(p => ({ ...p, status_akreditasi: e.target.value }))}
                  placeholder="Akreditasi A (Unggul)"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-semibold text-emerald-800"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Bentuk Pendidikan
                </label>
                <input
                  type="text"
                  value={profileForm.bentuk_pendidikan}
                  onChange={e => setProfileForm(p => ({ ...p, bentuk_pendidikan: e.target.value }))}
                  placeholder="Sekolah Menengah Pertama (SMP)"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Tahun Ajaran Aktif Default
                </label>
                <input
                  type="text"
                  value={profileForm.tahun_ajaran}
                  onChange={e => setProfileForm(p => ({ ...p, tahun_ajaran: e.target.value }))}
                  placeholder="2025/2026"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono font-bold"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Semester Aktif
                </label>
                <select
                  value={profileForm.semester_aktif}
                  onChange={e => setProfileForm(p => ({ ...p, semester_aktif: e.target.value as 'Ganjil' | 'Genap' }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-semibold"
                >
                  <option value="Ganjil">Ganjil</option>
                  <option value="Genap">Genap</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nama Kepala Sekolah (Penandatangan)
                </label>
                <input
                  type="text"
                  value={profileForm.kepala_sekolah}
                  onChange={e => setProfileForm(p => ({ ...p, kepala_sekolah: e.target.value }))}
                  placeholder="Drs. H. Ahmad Subardjo, M.Pd."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-medium"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  NIP Kepala Sekolah
                </label>
                <input
                  type="text"
                  value={profileForm.nip_kepala_sekolah}
                  onChange={e => setProfileForm(p => ({ ...p, nip_kepala_sekolah: e.target.value }))}
                  placeholder="19680512 199303 1 004"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>

              <div className="md:col-span-2 lg:col-span-3">
                <label className="block font-semibold text-slate-700 mb-1">
                  Alamat Lengkap Sekolah (Untuk Kop Surat)
                </label>
                <textarea
                  rows={2}
                  value={profileForm.alamat}
                  onChange={e => setProfileForm(p => ({ ...p, alamat: e.target.value }))}
                  placeholder="Jl. Pendidikan No. 45, RT 02 / RW 05, Kel. Kebon Pala, Kec. Makasar, Jakarta Timur, DKI Jakarta 13650"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nomor Telepon Kantor
                </label>
                <input
                  type="text"
                  value={profileForm.telepon}
                  onChange={e => setProfileForm(p => ({ ...p, telepon: e.target.value }))}
                  placeholder="(021) 87654321"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Email Resmi Sekolah
                </label>
                <input
                  type="email"
                  value={profileForm.email_resmi}
                  onChange={e => setProfileForm(p => ({ ...p, email_resmi: e.target.value }))}
                  placeholder="info@sekolah.sch.id"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Alamat Website Resmi
                </label>
                <input
                  type="text"
                  value={profileForm.website}
                  onChange={e => setProfileForm(p => ({ ...p, website: e.target.value }))}
                  placeholder="www.sekolah.sch.id"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button
                type="submit"
                className="px-6 py-2.5 bg-blue-900 hover:bg-blue-800 text-white font-bold text-xs rounded-lg flex items-center gap-2 shadow-sm transition-colors"
              >
                <Save className="w-4 h-4" />
                <span>Simpan Perubahan Identitas Sekolah</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* =================================================================== */}
      {/* TAB 1: MANAJEMEN KELAS                                              */}
      {/* =================================================================== */}
      {activeTab === 'kelas' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {canManageSystem && (
            <form
              onSubmit={handleSaveClass}
              className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4 text-xs self-start"
            >
              <div className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-2.5 flex items-center gap-2">
                <Plus className="w-4 h-4 text-blue-900" />
                <span>Tambah / Perbarui Rombel Kelas</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nama Kelas *
                  </label>
                  <input
                    type="text"
                    required
                    value={namaKelas}
                    onChange={e => setNamaKelas(e.target.value)}
                    placeholder="Contoh: 7A, 8B, 9C"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-bold uppercase"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tingkat *</label>
                  <select
                    value={tingkatKelas}
                    onChange={e => setTingkatKelas(e.target.value as '7' | '8' | '9')}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-semibold"
                  >
                    <option value="7">Kelas 7</option>
                    <option value="8">Kelas 8</option>
                    <option value="9">Kelas 9</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nama Wali Kelas
                </label>
                <input
                  type="text"
                  value={waliKelas}
                  onChange={e => setWaliKelas(e.target.value)}
                  placeholder="Nama lengkap & gelar wali kelas..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Kamar Default
                  </label>
                  <input
                    type="text"
                    value={kamarDefault}
                    onChange={e => setKamarDefault(e.target.value)}
                    placeholder="Gedung / Kamar"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Kapasitas Kursi
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={kapasitasKelas}
                    onChange={e => setKapasitasKelas(parseInt(e.target.value, 10) || 36)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-blue-900 hover:bg-blue-800 text-white font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors"
              >
                <Save className="w-4 h-4" />
                <span>Simpan Data Kelas</span>
              </button>
            </form>
          )}

          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  Daftar Kelas Terdaftar (`public.classes`)
                </h3>
                <p className="text-xs text-slate-500">
                  Kelola rombongan belajar, wali kelas, kapasitas, dan status aktif kelas
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-blue-900">
                {classes.length} Kelas
              </span>
            </div>

            {loading ? (
              <div className="p-8 text-center text-xs text-slate-400">Memuat daftar kelas...</div>
            ) : classes.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                Belum ada kelas tambahan di database. Gunakan formulir di samping untuk menambahkan kelas.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600">
                      <th className="py-2.5 px-3">Kelas</th>
                      <th className="py-2.5 px-3">Tingkat</th>
                      <th className="py-2.5 px-3">Wali Kelas</th>
                      <th className="py-2.5 px-3">Kamar</th>
                      <th className="py-2.5 px-3">Kapasitas</th>
                      <th className="py-2.5 px-3">Status</th>
                      {canManageSystem && <th className="py-2.5 px-3 text-right">Aksi</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {classes.map(cls => (
                      <tr key={cls.id}>
                        <td className="py-2.5 px-3 font-bold text-slate-900">{cls.nama_kelas}</td>
                        <td className="py-2.5 px-3">Tingkat {cls.tingkat}</td>
                        <td className="py-2.5 px-3 text-slate-700">{cls.wali_kelas || '-'}</td>
                        <td className="py-2.5 px-3 text-slate-600">{cls.kamar_default || '-'}</td>
                        <td className="py-2.5 px-3 font-mono">{cls.kapasitas} siswa</td>
                        <td className="py-2.5 px-3">
                          <ZeroPillBadge
                            status={cls.is_active ? 'aktif' : 'non_aktif'}
                            label={cls.is_active ? 'Aktif' : 'Non-Aktif'}
                          />
                        </td>
                        {canManageSystem && (
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleToggleClassActive(cls)}
                              className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-[11px]"
                            >
                              {cls.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 2: MANAJEMEN TAHUN AJARAN                                       */}
      {/* =================================================================== */}
      {activeTab === 'tahun_ajaran' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {canManageSystem && (
            <form
              onSubmit={handleSaveAcademicYear}
              className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4 text-xs self-start"
            >
              <div className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-2.5 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-900" />
                <span>Tambah / Atur Tahun Ajaran</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Tahun Ajaran *
                  </label>
                  <input
                    type="text"
                    required
                    value={taName}
                    onChange={e => setTaName(e.target.value)}
                    placeholder="2025/2026"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Semester *</label>
                  <select
                    value={taSemester}
                    onChange={e => setTaSemester(e.target.value as 'Ganjil' | 'Genap')}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-semibold"
                  >
                    <option value="Ganjil">Ganjil</option>
                    <option value="Genap">Genap</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Tanggal Mulai
                  </label>
                  <input
                    type="date"
                    value={taMulai}
                    onChange={e => setTaMulai(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Tanggal Selesai
                  </label>
                  <input
                    type="date"
                    value={taSelesai}
                    onChange={e => setTaSelesai(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 font-semibold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={taIsActive}
                  onChange={e => setTaIsActive(e.target.checked)}
                  className="rounded border-slate-300 text-blue-900"
                />
                <span>Tetapkan sebagai Tahun Ajaran &amp; Semester Aktif</span>
              </label>

              <button
                type="submit"
                className="w-full py-2.5 bg-blue-900 hover:bg-blue-800 text-white font-bold rounded-lg flex items-center justify-center gap-1.5"
              >
                <Save className="w-4 h-4" />
                <span>Simpan Tahun Ajaran</span>
              </button>
            </form>
          )}

          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm">
                Daftar Tahun Ajaran (`public.academic_years`)
              </h3>
              <p className="text-xs text-slate-500">
                Periode akademik yang digunakan pada penempatan kelas dan mutasi siswa
              </p>
            </div>

            {academicYears.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                Tahun Ajaran default aktif: <strong>{schoolProfile.tahun_ajaran}</strong> (
                {schoolProfile.semester_aktif}). Tambahkan periode baru melalui formulir di samping.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600">
                      <th className="py-2.5 px-3">Tahun Ajaran</th>
                      <th className="py-2.5 px-3">Semester</th>
                      <th className="py-2.5 px-3">Rentang Tanggal</th>
                      <th className="py-2.5 px-3">Status</th>
                      {canManageSystem && <th className="py-2.5 px-3 text-right">Aksi</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {academicYears.map(ay => (
                      <tr key={ay.id}>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                          {ay.tahun_ajaran}
                        </td>
                        <td className="py-2.5 px-3 font-semibold">{ay.semester}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-600">
                          {(ay.tanggal_mulai ? formatDateDMY(ay.tanggal_mulai) : '-') +
                            ' s/d ' +
                            (ay.tanggal_selesai ? formatDateDMY(ay.tanggal_selesai) : '-')}
                        </td>
                        <td className="py-2.5 px-3">
                          <ZeroPillBadge
                            status={ay.is_active ? 'aktif' : 'non_aktif'}
                            label={ay.is_active ? 'Periode Aktif' : 'Arsip'}
                          />
                        </td>
                        {canManageSystem && (
                          <td className="py-2.5 px-3 text-right">
                            {!ay.is_active && (
                              <button
                                type="button"
                                onClick={() => handleSetActiveYear(ay)}
                                className="px-2.5 py-1 rounded bg-blue-900 text-white font-semibold text-[11px]"
                              >
                                Jadikan Aktif
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 3: MANAJEMEN AKUN ADMIN & PENGELOLAAN ROLE                      */}
      {/* =================================================================== */}
      {activeTab === 'akun_admin' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {canManageSystem && (
            <form
              onSubmit={handleCreateAdmin}
              className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3.5 text-xs self-start"
            >
              <div className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-2.5 flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-900" />
                <span>Tambah Akun Staf / Admin Baru</span>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nama Lengkap Staf *
                </label>
                <input
                  type="text"
                  required
                  value={adminFullName}
                  onChange={e => setAdminFullName(e.target.value)}
                  placeholder="Nama lengkap petugas TU / Admin"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Email Login *</label>
                  <input
                    type="email"
                    required
                    value={adminEmail}
                    onChange={e => setAdminEmail(e.target.value)}
                    placeholder="staf@smpbhinneka.sch.id"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Username *</label>
                  <input
                    type="text"
                    required
                    value={adminUsername}
                    onChange={e => setAdminUsername(e.target.value)}
                    placeholder="operator_tu"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Role / Hak Akses *
                  </label>
                  <select
                    value={adminRole}
                    onChange={e => setAdminRole(e.target.value as AdminRole)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-bold text-blue-950"
                  >
                    <option value="super_admin">super_admin</option>
                    <option value="admin">admin</option>
                    <option value="operator">operator</option>
                    <option value="viewer">viewer</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">No. Telepon</label>
                  <input
                    type="text"
                    value={adminPhone}
                    onChange={e => setAdminPhone(e.target.value)}
                    placeholder="0812..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Password Awal (Minimal 8 Karakter) *
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={adminPassword}
                  onChange={e => setAdminPassword(e.target.value)}
                  placeholder="Minimal 8 karakter..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-blue-900 hover:bg-blue-800 text-white font-bold rounded-lg flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Buat Akun Admin / Staf</span>
              </button>
            </form>
          )}

          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm">
                Manajemen Akun Admin &amp; Pengelolaan Role (`public.profiles`)
              </h3>
              <p className="text-xs text-slate-500">
                Atur role (<code>super_admin</code>, <code>admin</code>, <code>operator</code>,{' '}
                <code>viewer</code>) serta aktivasi/penonaktifan akun staf
              </p>
            </div>

            {adminProfiles.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                Belum ada daftar akun admin yang dimuat dari tabel <code>profiles</code>.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600">
                      <th className="py-2.5 px-3">Nama Lengkap</th>
                      <th className="py-2.5 px-3">Username &amp; Email</th>
                      <th className="py-2.5 px-3">Role Hak Akses</th>
                      <th className="py-2.5 px-3">Status</th>
                      {canManageSystem && <th className="py-2.5 px-3 text-right">Aksi</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {adminProfiles.map(adm => (
                      <tr key={adm.id}>
                        <td className="py-2.5 px-3 font-bold text-slate-900">{adm.full_name}</td>
                        <td className="py-2.5 px-3">
                          <div className="font-mono font-semibold text-slate-800">
                            {adm.username}
                          </div>
                          <div className="text-[11px] text-slate-500">{adm.email}</div>
                        </td>
                        <td className="py-2.5 px-3">
                          {canManageSystem ? (
                            <select
                              value={adm.role}
                              onChange={e =>
                                handleChangeAdminRole(adm, e.target.value as AdminRole)
                              }
                              className="px-2 py-1 border border-slate-300 rounded bg-white font-mono text-xs font-bold text-blue-950"
                            >
                              <option value="super_admin">super_admin</option>
                              <option value="admin">admin</option>
                              <option value="operator">operator</option>
                              <option value="viewer">viewer</option>
                            </select>
                          ) : (
                            <span className="font-mono font-bold">{adm.role}</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          <ZeroPillBadge
                            status={adm.is_active ? 'aktif' : 'non_aktif'}
                            label={adm.is_active ? 'Aktif' : 'Non-Aktif'}
                          />
                        </td>
                        {canManageSystem && (
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleToggleAdminStatus(adm)}
                              className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-[11px] inline-flex items-center gap-1"
                            >
                              <Power className="w-3 h-3" />
                              <span>{adm.is_active ? 'Nonaktifkan' : 'Aktifkan'}</span>
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 4: MANAJEMEN AKUN ORANG TUA BERBASIS NISN                       */}
      {/* =================================================================== */}
      {activeTab === 'akun_ortu' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-[0_1px_3px_rgba(16,29,53,0.05)] flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-bold text-[#101D35] text-sm">
                Manajemen Akun Orang Tua Berbasis NISN (<code>public.parent_student_access</code>)
              </h3>
              <p className="text-xs text-slate-500">
                Aktivasi akun, penonaktifan akses, dan reset password khusus orang tua siswa
              </p>
            </div>
            <span className="text-xs font-mono font-bold text-[#315FEA] bg-[#315FEA]/10 px-3 py-1.5 rounded-xl">
              Total: {parentAccounts.length} Akun ({parentAccounts.filter(p => p.is_active).length}{' '}
              Aktif)
            </span>
          </div>

          <DataTable
            data={parentAccounts}
            keyExtractor={acc => acc.id}
            isLoading={loading}
            searchPlaceholder="Cari NISN, nama siswa, kelas, atau nama wali..."
            searchFilter={(acc, q) =>
              acc.nisn.toLowerCase().includes(q) ||
              acc.nama_siswa.toLowerCase().includes(q) ||
              acc.kelas.toLowerCase().includes(q) ||
              acc.nama_wali.toLowerCase().includes(q)
            }
            emptyTitle="Belum Ada Akun Orang Tua"
            emptyMessage="Tambahkan atau import data siswa terlebih dahulu untuk mengelola akun orang tua."
            columns={[
              {
                header: 'NISN (Username)',
                accessor: 'nisn',
                isMono: true,
                className: 'font-bold text-[#101D35] w-36'
              },
              {
                header: 'Nama Siswa & Kelas',
                render: acc => (
                  <div>
                    <div className="font-bold text-[#101D35]">{acc.nama_siswa}</div>
                    <div className="text-[11px] text-slate-500">Kelas {acc.kelas}</div>
                  </div>
                )
              },
              {
                header: 'Password Default (Tgl Lahir)',
                render: acc => (
                  <span className="font-mono font-bold text-[#315FEA]">
                    {formatDateDMY(acc.tanggal_lahir)}
                  </span>
                ),
                className: 'w-40'
              },
              {
                header: 'Nama Wali & No HP',
                render: acc => (
                  <div>
                    <div className="font-medium text-slate-800">{acc.nama_wali}</div>
                    <div className="font-mono text-[11px] text-slate-500">
                      {acc.no_hp || '-'}
                    </div>
                  </div>
                )
              },
              {
                header: 'Status Akses',
                render: acc => (
                  <ZeroPillBadge
                    status={acc.is_active ? 'aktif' : 'non_aktif'}
                    label={acc.is_active ? 'Aktif' : 'Belum Aktif'}
                  />
                ),
                className: 'w-28'
              },
              {
                header: 'Aktivasi / Reset Password',
                align: 'right',
                render: acc => (
                  <div className="inline-flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedParentAccount(acc);
                        setIsParentModalOpen(true);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-[#315FEA] hover:bg-[#244CD2] text-white font-semibold text-xs inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>{acc.is_active ? 'Reset Password' : 'Aktifkan Akun'}</span>
                    </button>

                    {acc.is_active && (
                      <button
                        type="button"
                        onClick={() => handleToggleParentStatus(acc)}
                        className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold text-xs cursor-pointer"
                      >
                        Nonaktifkan
                      </button>
                    )}
                  </div>
                )
              }
            ]}
          />
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 5: AUDIT LOG                                                    */}
      {/* =================================================================== */}
      {activeTab === 'audit_log' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                Rekaman Audit Log Sistem (`public.audit_logs`)
              </h3>
              <p className="text-xs text-slate-500">
                Jejak aktivitas pengguna, verifikasi biodata, mutasi siswa, dan perubahan hak akses
              </p>
            </div>
            <span className="text-xs font-mono text-slate-500">
              Menampilkan {auditLogs.length} log terbaru
            </span>
          </div>

          {auditLogs.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              Belum ada catatan audit log.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 text-xs">
              {auditLogs.map(log => (
                <div key={log.id} className="py-3 flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-900">{log.user_name}</span>
                      <span className="font-mono text-[10px] text-slate-500">
                        ({log.user_role})
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-100 font-mono text-[11px] font-semibold text-slate-800">
                        {log.action}
                      </span>
                      <span className="text-slate-400 font-mono text-[11px]">
                        Target: {log.target_type} {log.target_id ? `(${log.target_id})` : ''}
                      </span>
                    </div>
                    <p className="text-slate-700">{log.details}</p>
                  </div>
                  <span className="font-mono text-[11px] text-slate-400 whitespace-nowrap">
                    {formatDateTimeDMY(log.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 6: SUPABASE, KEAMANAN RLS, & DOKUMENTASI DEPLOYMENT             */}
      {/* =================================================================== */}
      {activeTab === 'supabase_doc' && (
        <div className="space-y-6">
          {/* Profil Identitas Sekolah */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <School className="w-5 h-5 text-blue-900" />
              <h3 className="font-bold text-slate-900 text-sm">Identitas Resmi Lembaga</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-slate-500 font-medium">Nama Sekolah</span>
                <div className="font-bold text-slate-900 text-sm mt-0.5">
                  {schoolProfile.nama_sekolah}
                </div>
              </div>
              <div>
                <span className="text-slate-500 font-medium">NPSN</span>
                <div className="font-bold text-slate-900 text-sm font-mono mt-0.5">
                  {schoolProfile.npsn}
                </div>
              </div>
              <div>
                <span className="text-slate-500 font-medium">Status Akreditasi</span>
                <div className="font-semibold text-emerald-800 mt-0.5">
                  {schoolProfile.status_akreditasi}
                </div>
              </div>
              <div>
                <span className="text-slate-500 font-medium">Tahun Ajaran &amp; Semester</span>
                <div className="font-semibold text-slate-900 mt-0.5">
                  {schoolProfile.tahun_ajaran} · {schoolProfile.semester_aktif}
                </div>
              </div>
            </div>
          </div>

          {/* Supabase Connection & SQL Migration */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-emerald-700" />
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    Integrasi Supabase PostgreSQL, RLS &amp; 4 Fungsi RPC Transaksional (11 Tabel)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Skema produksi dengan 59 kolom snake_case pada tabel <code>students</code>
                  </p>
                </div>
              </div>

              <button
                onClick={handleTestConnection}
                disabled={isTesting}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                <span>Uji Koneksi Supabase</span>
              </button>
            </div>

            <div
              className={`p-4 rounded-xl border flex items-start gap-3 ${
                isSupabaseConfigured
                  ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
                  : 'bg-amber-50/70 border-amber-200 text-amber-950'
              }`}
            >
              {isSupabaseConfigured ? (
                <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1 text-xs">
                <div className="font-bold">
                  {isSupabaseConfigured
                    ? 'Konfigurasi Supabase Aktif'
                    : 'Menunggu Konfigurasi Environment Variables Supabase'}
                </div>
                <p className="leading-relaxed opacity-90">
                  {connectionStatus?.message ||
                    'Atur VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, dan SUPABASE_SERVICE_ROLE_KEY pada environment aplikasi / Netlify.'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 text-xs">
              {SUPABASE_REQUIRED_TABLES.map((tbl, i) => (
                <div
                  key={tbl}
                  className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 font-mono text-[11px] text-slate-800 flex items-center gap-1.5"
                >
                  <span className="text-slate-400 font-sans font-bold">{i + 1}.</span>
                  <span className="truncate font-semibold">{tbl}</span>
                </div>
              ))}
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="font-bold text-slate-900">
                    Skrip SQL Migration Lengkap &amp; Edge Function Autentikasi NISN
                  </div>
                  <div className="text-[11px] text-slate-500">
                    <code>/supabase/migrations/20261103000001_sipds_complete_schema.sql</code> &amp;{' '}
                    <code>/supabase/functions/parent-auth/index.ts</code>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setShowSqlPreview(!showSqlPreview)}
                    className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg text-slate-700 font-semibold flex items-center gap-1.5"
                  >
                    <FileCode className="w-3.5 h-3.5" />
                    <span>{showSqlPreview ? 'Tutup SQL' : 'Lihat Skrip SQL'}</span>
                  </button>

                  <button
                    onClick={handleCopySql}
                    className="px-3 py-1.5 bg-blue-900 hover:bg-blue-800 text-white rounded-lg font-semibold flex items-center gap-1.5"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>Salin SQL Migration</span>
                  </button>

                  <button
                    onClick={handleDownloadSql}
                    className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg font-semibold flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Unduh .sql</span>
                  </button>
                </div>
              </div>

              {showSqlPreview && migrationSql && (
                <pre className="bg-slate-950 text-slate-200 p-4 rounded-xl font-mono text-[11px] overflow-x-auto max-h-96 leading-relaxed">
                  {migrationSql}
                </pre>
              )}
            </div>
          </div>

          {/* Panduan Operasional & Deployment */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4 text-xs">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100 font-bold text-slate-900 text-sm">
              <Shield className="w-5 h-5 text-blue-900" />
              <span>
                Panduan Setup Supabase, Aktivasi Akun Orang Tua, Import Excel Pertama &amp; Deployment Netlify
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                <h4 className="font-bold text-slate-900">1. Setup Database Supabase &amp; RLS</h4>
                <p className="text-slate-600 leading-relaxed">
                  Jalankan berkas <code>/supabase/migrations/20261103000001_sipds_complete_schema.sql</code> pada SQL Editor Supabase untuk membuat 11 tabel, mengaktifkan RLS, dan memasang 4 fungsi RPC transaksional. Deploy Edge Function <code>supabase functions deploy parent-auth</code> untuk autentikasi NISN serverless.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                <h4 className="font-bold text-slate-900">
                  2. Import Excel 59 Kolom Pertama Kali
                </h4>
                <p className="text-slate-600 leading-relaxed">
                  Buka menu <strong>Import Excel</strong>, unduh Template Resmi 59 Kolom (<code>.xlsx</code>), lalu unggah file Excel sekolah. Sistem memetakan header secara otomatis, mempertahankan nol di depan pada NISN/NIK/KK/No HP, mendeteksi duplikat, dan menyimpan riwayat batch ke <code>import_batches</code>.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                <h4 className="font-bold text-slate-900">
                  3. Aktivasi Akun Orang Tua Berbasis NISN
                </h4>
                <p className="text-slate-600 leading-relaxed">
                  Buka menu <strong>Akun Orang Tua</strong> atau tab <strong>Akun Orang Tua (NISN)</strong> di halaman ini. Klik <strong>Aktifkan Akun</strong> pada siswa terkait dan buat password khusus (minimal 8 karakter, tidak boleh mengandung NISN). Orang tua dapat login menggunakan NISN dan password tersebut.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                <h4 className="font-bold text-slate-900">
                  4. Deployment melalui GitHub &amp; Netlify
                </h4>
                <p className="text-slate-600 leading-relaxed">
                  Push repository ke GitHub dan hubungkan ke Netlify. Konfigurasi build sudah disiapkan di <code>netlify.toml</code> (Build command: <code>npm run build</code>, Publish directory: <code>dist</code>). Tambahkan <code>VITE_SUPABASE_URL</code> dan <code>VITE_SUPABASE_ANON_KEY</code> pada Environment Variables Netlify.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <ParentAccountModal
        isOpen={isParentModalOpen}
        account={selectedParentAccount}
        onClose={() => {
          setIsParentModalOpen(false);
          setSelectedParentAccount(null);
        }}
        onActivate={handleActivateParent}
      />

      <ConfirmationModal
        isOpen={isResetProfileConfirmOpen}
        title="Reset Identitas Sekolah ke Standar?"
        message="Kembalikan identitas dan logo sekolah ke bawaan SMP BHINNEKA TUNGGAL IKA?"
        confirmText="Ya, Reset Identitas"
        isDanger={true}
        onConfirm={confirmResetSchoolProfile}
        onClose={() => setIsResetProfileConfirmOpen(false)}
      />
    </div>
  );
};
