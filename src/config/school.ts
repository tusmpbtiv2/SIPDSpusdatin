import { SchoolProfile, AdminRole } from '../types';

export const SCHOOL_CONFIG: SchoolProfile = {
  nama_sekolah: 'SMP BHINNEKA TUNGGAL IKA',
  npsn: '20570884',
  status_akreditasi: 'Akreditasi A (Unggul)',
  bentuk_pendidikan: 'Sekolah Menengah Pertama (SMP)',
  semester_aktif: 'Semester Ganjil',
  tahun_ajaran: '2026/2027',
  alamat: 'Jl. Pesantren Ngalah Sengonagung Purwosari Pasuruan',
  telepon: '0821-3623-0907',
  email_resmi: 'smpbhinnekatunggalika@gmail.com',
  website: 'www.smpbhinnekatunggalika.sch.id',
  kepala_sekolah: "Drs. MOH. MAS'UD, S.Pd, M.Pd",
  nip_kepala_sekolah: '-',
  logo_url: 'https://cmewsqitnesvnxnswiih.supabase.co/storage/v1/object/public/sipds-public/school-logo.png'
};

export const ADMIN_MENUS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'LayoutDashboard', allowedRoles: ['super_admin', 'admin', 'operator', 'viewer'] },
  { id: 'data-siswa', label: 'Data Siswa', icon: 'Users', allowedRoles: ['super_admin', 'admin', 'operator', 'viewer'] },
  { id: 'tahun-pelajaran', label: 'Tahun Pelajaran', icon: 'CalendarRange', allowedRoles: ['super_admin', 'admin', 'operator', 'viewer'] },
  { id: 'angkatan', label: 'Angkatan', icon: 'Layers', allowedRoles: ['super_admin', 'admin', 'operator', 'viewer'] },
  { id: 'riwayat-kelas', label: 'Riwayat Kelas', icon: 'BookOpen', allowedRoles: ['super_admin', 'admin', 'operator', 'viewer'] },
  { id: 'import-excel', label: 'Import Data', icon: 'UploadCloud', allowedRoles: ['super_admin', 'admin', 'operator'] },
  { id: 'proses-akhir-tahun', label: 'Proses Akhir Tahun', icon: 'ArrowUpCircle', allowedRoles: ['super_admin', 'admin', 'operator'] },
  { id: 'mutasi-masuk', label: 'Mutasi Masuk', icon: 'UserPlus', allowedRoles: ['super_admin', 'admin', 'operator', 'viewer'] },
  { id: 'mutasi-keluar', label: 'Mutasi Keluar', icon: 'UserMinus', allowedRoles: ['super_admin', 'admin', 'operator', 'viewer'] },
  { id: 'arsip-alumni', label: 'Arsip Alumni', icon: 'GraduationCap', allowedRoles: ['super_admin', 'admin', 'operator', 'viewer'] },
  { id: 'verifikasi-perubahan', label: 'Verifikasi Perubahan', icon: 'CheckSquare', allowedRoles: ['super_admin', 'admin', 'operator'] },
  { id: 'statistik', label: 'Statistik', icon: 'BarChart3', allowedRoles: ['super_admin', 'admin', 'operator', 'viewer'] },
  { id: 'export-excel', label: 'Export Data', icon: 'DownloadCloud', allowedRoles: ['super_admin', 'admin', 'operator', 'viewer'] },
  { id: 'backup-database', label: 'Backup Database', icon: 'DatabaseBackup', allowedRoles: ['super_admin', 'admin'] },
  { id: 'akun-orang-tua', label: 'Akun Orang Tua', icon: 'KeyRound', allowedRoles: ['super_admin', 'admin'] },
  { id: 'audit-log', label: 'Audit Log', icon: 'History', allowedRoles: ['super_admin', 'admin', 'viewer'] },
  { id: 'pengaturan', label: 'Pengaturan', icon: 'Sliders', allowedRoles: ['super_admin', 'admin'] },
] as const;

export const PARENT_MENUS = [
  { id: 'parent-dashboard', label: 'Dashboard', icon: 'LayoutDashboard' },
  { id: 'biodata-anak', label: 'Biodata Anak', icon: 'User' },
  { id: 'perbaiki-biodata', label: 'Perbaiki Biodata', icon: 'Edit3' },
  { id: 'pengajuan-saya', label: 'Pengajuan Saya', icon: 'Clock' },
  { id: 'riwayat-perubahan', label: 'Riwayat Perubahan', icon: 'FileText' },
  { id: 'profil-akun', label: 'Profil Akun', icon: 'ShieldCheck' },
] as const;

export function canAccessMenu(role: AdminRole, menuId: string): boolean {
  const menu = ADMIN_MENUS.find(m => m.id === menuId);
  if (!menu) return false;
  return (menu.allowedRoles as readonly string[]).includes(role);
}

export const CLASS_ROSTER = [
  '7A', '7B', '7C', '7D', '7E', '7F', '7G', '7H', '7I', '7J', '7K', '7L', '7M', '7N', '7O',
  '8A', '8B', '8C', '8D', '8E', '8F', '8G', '8H', '8I', '8J', '8K', '8L', '8M', '8N', '8O',
  '9A', '9B', '9C', '9D', '9E', '9F', '9G', '9H', '9I', '9J', '9K', '9L', '9M', '9N', '9O'
] as const;

export const RELIGION_OPTIONS = [
  'Islam',
  'Kristen Protestan',
  'Katolik',
  'Hindu',
  'Buddha',
  'Konghucu'
] as const;
