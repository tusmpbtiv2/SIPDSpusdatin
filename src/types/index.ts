export type AdminRole = 'super_admin' | 'admin' | 'operator' | 'viewer';

export type UserType = 'admin' | 'parent';

export type StudentStatus = 'aktif' | 'mutasi_masuk' | 'mutasi_keluar' | 'lulus' | 'non_aktif';

export type Gender = 'L' | 'P';

export type ChangeRequestStatus =
  | 'draft'
  | 'pending'
  | 'partially_approved'
  | 'approved'
  | 'rejected'
  | 'cancelled';

export type ChangeItemStatus = 'pending' | 'approved' | 'rejected';

export type ImportMode = 'insert_only' | 'update_by_nis' | 'upsert';

export type MutationCategory =
  | 'Masuk Pindahan'
  | 'Pindah sekolah'
  | 'Mengundurkan diri'
  | 'Keluar karena alasan lain'
  | 'Lulus'
  | 'Meninggal dunia';

export const OUTGOING_MUTATION_CATEGORIES: MutationCategory[] = [
  'Pindah sekolah',
  'Mengundurkan diri',
  'Keluar karena alasan lain',
  'Lulus',
  'Meninggal dunia'
];

export type StudentTabKey =
  | 'identitas'
  | 'pendidikan'
  | 'alamat'
  | 'kesehatan'
  | 'ayah'
  | 'ibu'
  | 'wali'
  | 'administrasi';

export interface AdminUser {
  id: string;
  email: string;
  username: string;
  nama_lengkap: string;
  role: AdminRole;
  is_active: boolean;
  type: 'admin';
}

export interface Siswa {
  id: string;
  // 1-8 Identitas & Akademik Utama
  rombel: string; // KELAS (e.g. '7A', '8B', '9A')
  tingkat_kelas: '7' | '8' | '9';
  nis: string; // NIS
  id_yys?: string; // ID YYS
  kamar?: string; // KAMAR
  nama_lengkap: string; // NAMA LENGKAP SISWA
  no_kk?: string; // NO KK
  nik_siswa?: string; // NIK SISWA
  nisn: string; // NISN (10 numeric digits)

  // 9-10 Ijazah SD/MI
  no_ijazah_sd?: string; // No Ijazah SD/MI
  tgl_ijazah_sd?: string; // Tanggal Penerbitan Ijazah

  // 11-22 Data Pribadi & Fisik & Keluarga
  jenis_kelamin: Gender; // Jenis Kelamin
  tempat_lahir: string; // TEMPAT LAHIR
  tanggal_lahir: string; // TANGGAL LAHIR
  agama: string; // AGAMA
  berat_badan?: string; // BERAT BADAN
  tinggi_badan?: string; // TINGGI BADAN
  riwayat_penyakit?: string; // RIWAYAT PENYAKIT
  status_anak?: string; // STATUS ANAK (Anak Kandung, dll)
  kewarganegaraan?: string; // KEWARGANEGARAAN (WNI/WNA)
  anak_ke?: string; // Anak Ke-
  jml_saudara_kandung?: string; // Jumlah Saudara Kandung
  jml_saudara_tiri?: string; // Jumlah Saudara TIRI

  // 23-30 Alamat & Domisili
  jalan_dusun?: string; // Jalan/Dusun
  rt_rw?: string; // RT/RW
  kelurahan?: string; // Desa/Kelurahan
  kecamatan?: string; // Kecamatan
  kode_pos?: string; // Kode Pos
  kab_kota?: string; // Kota/Kabupaten
  provinsi?: string; // Provinsi
  alamat: string; // Alamat Lengkap

  // 31-36 Asal Sekolah (SD/MI)
  jenjang_asal?: string; // Jenjang (SD/MI)
  nama_asal_sekolah?: string; // Nama Asal Sekolah
  npsn_asal_sekolah?: string; // NPSN Asal Sekolah
  kecamatan_asal_sekolah?: string; // Kecamatan Asal Sekolah
  kabupaten_asal_sekolah?: string; // Kabupaten Asal Sekolah
  provinsi_asal_sekolah?: string; // Provinsi Asal Sekolah

  // 37-44 Data Ayah
  nama_ayah?: string; // NAMA AYAH
  nik_ayah?: string; // NIK Ayah
  tempat_lahir_ayah?: string; // Tempat Lahir Ayah
  tgl_lahir_ayah?: string; // Tgl Lahir Ayah
  pendidikan_ayah?: string; // Pendidikan ayah
  pekerjaan_ayah?: string; // Pekerjaan Ayah
  no_wa_ayah?: string; // No WA Ayah
  penghasilan_ayah?: string; // Penghasilan Ayah

  // 45-52 Data Ibu Kandung
  nama_ibu?: string; // NAMA IBU KANDUNG
  nik_ibu?: string; // NIK IBU
  tempat_lahir_ibu?: string; // Tempat Lahir IBu
  tgl_lahir_ibu?: string; // Tgl Lahir Ibu
  pendidikan_ibu?: string; // Pendidikan Ibu
  pekerjaan_ibu?: string; // Pekerjaan Ibu
  no_wa_ibu?: string; // No Wa Ibu
  penghasilan_ibu?: string; // Penghasilan Ibu

  // 53-57 Data Wali
  nama_wali?: string; // Nama Wali
  nik_wali?: string; // NIK Wali
  pekerjaan_wali?: string; // Pekerjaan Wali
  penghasilan_wali?: string; // Penghasilan Wali
  no_hp_orangtua: string; // No HP Wali

  // 58-59 Status & Tanggal Masuk
  status: StudentStatus; // Status Aktif
  tanggal_masuk?: string; // Tanggal Masuk
  tahun_masuk: string;
  angkatan?: string; // Tahun Angkatan Tetap (contoh: '2024', '2025', '2026')
  tahun_ajaran_masuk?: string; // Contoh: '2025/2026'
  tahun_lulus?: string; // Contoh: '2027'
  tanggal_lulus?: string;
  nomor_ijazah_smp?: string;

  email_orangtua?: string;
  foto_url?: string;
  created_at: string;
  updated_at: string;
}

export interface ParentUser {
  id: string;
  siswa_id: string;
  nisn: string;
  nama_wali: string;
  no_hp: string;
  is_active: boolean;
  type: 'parent';
  activated_at?: string;
  last_login_at?: string;
}

export type AuthUser = AdminUser | ParentUser;

export interface ParentAccountRecord {
  id: string;
  siswa_id: string;
  nisn: string;
  nama_siswa: string;
  kelas: string;
  tanggal_lahir?: string;
  nama_wali: string;
  no_hp: string;
  is_active: boolean;
  activated_at?: string;
  last_login_at?: string;
  temporary_password?: string;
}

export interface FieldComparison {
  field_name: string;
  field_label: string;
  old_value: string;
  new_value: string;
}

export interface ChangeFieldDetail {
  old_value: string;
  new_value: string;
  label: string;
  item_status?: ChangeItemStatus;
  rejection_reason?: string;
}

export interface PerubahanBiodata {
  id: string;
  siswa_id: string;
  nis?: string;
  nisn: string;
  nama_siswa: string;
  kelas: string;
  requester_name?: string;
  requester_relation?: string;
  fields_changed: Record<string, ChangeFieldDetail>;
  alasan: string;
  dokumen_pendukung_nama?: string;
  status: ChangeRequestStatus;
  verifikator_name?: string;
  catatan_verifikator?: string;
  submitted_at: string;
  verified_at?: string;
  event_id?: string;
  event_name?: string;
}

export type StudentConfirmationStatus =
  | 'belum_konfirmasi'
  | 'confirmed_valid'
  | 'submitted_correction'
  | 'correction_approved';

export interface DataConfirmationEvent {
  id: string;
  nama_periode: string;
  tahun_ajaran: string;
  deskripsi?: string;
  tanggal_mulai: string;
  tanggal_selesai: string;
  target_classes: string[]; // kosong = semua kelas, atau array seperti ['7A', '7B']
  target_columns: string[]; // daftar key dari ALL_59_STUDENT_FIELDS
  is_active: boolean;
  created_by_name?: string;
  created_at: string;
  updated_at?: string;
}

export interface StudentDataConfirmationRecord {
  id: string;
  event_id: string;
  event_name: string;
  siswa_id: string;
  nis?: string;
  nisn: string;
  nama_siswa: string;
  kelas: string;
  nama_wali: string;
  hubungan_wali?: string;
  no_hp_wali?: string;
  status: 'confirmed_valid' | 'submitted_correction' | 'correction_approved';
  catatan_wali?: string;
  change_request_id?: string;
  confirmed_columns_snapshot?: Record<string, string>;
  confirmed_at: string;
  verified_at?: string;
  verified_by_name?: string;
}

export type ImportCategory =
  | 'siswa_baru'
  | 'pembaruan_data'
  | 'riwayat_kelas'
  | 'mutasi_masuk'
  | 'mutasi_keluar';

export interface ImportBatchRecord {
  id: string;
  file_name: string;
  import_mode?: ImportMode;
  import_category?: ImportCategory;
  tahun_ajaran?: string;
  angkatan?: string;
  total_rows: number;
  success_rows: number;
  failed_rows: number;
  duplicate_rows?: number;
  review_rows?: number;
  status: 'processing' | 'completed' | 'partial' | 'failed';
  error_details: { row: number; nis?: string; nisn?: string; nama?: string; errors: string[] }[];
  created_at: string;
  completed_at?: string;
}

export interface ImportBatchRowRecord {
  id: string;
  batch_id: string;
  row_number: number;
  student_id?: string;
  nis?: string;
  nisn?: string;
  nama_siswa?: string;
  validation_status: 'valid' | 'failed' | 'duplicate' | 'needs_review';
  action_taken:
    | 'inserted'
    | 'updated'
    | 'history_added'
    | 'mutation_recorded'
    | 'skipped'
    | 'failed';
  error_messages: string[];
  raw_payload?: Record<string, unknown>;
  diff_payload?: Record<string, { old_value: string; new_value: string }>;
  created_at: string;
}

export interface Mutasi {
  id: string;
  siswa_id?: string;
  kelas: string; // KELAS (Kelas Tujuan pada Masuk / Kelas Terakhir pada Keluar)
  nis: string; // NIS
  nisn: string; // NISN
  nama_siswa: string; // NAMA LENGKAP SISWA
  jenis: 'masuk' | 'keluar';
  kategori_mutasi?: MutationCategory;
  tanggal_mutasi: string; // Tanggal Pindah / Tanggal Masuk / Tanggal Keluar
  tahun_ajaran?: string; // Tahun Ajaran (e.g. '2025/2026')
  alasan?: string; // Alasan Pindah / Alasan Mutasi
  sekolah_asal?: string; // Sekolah Asal (Mutasi Masuk)
  sekolah_tujuan?: string; // Sekolah Tujuan (Mutasi Keluar)
  npsn_sekolah?: string; // NPSN Asal atau Tujuan
  kecamatan_sekolah?: string; // Kecamatan Asal atau Tujuan
  kabupaten_sekolah?: string; // Kabupaten/Kota Asal atau Tujuan
  provinsi_sekolah?: string; // Provinsi Asal atau Tujuan
  no_surat?: string;
  keterangan?: string;
  petugas_nama?: string;
  previous_student_status?: StudentStatus;
  status: 'diproses' | 'selesai' | 'dibatalkan';
  rombel_tujuan?: string;
  cancelled_at?: string;
  cancelled_by_name?: string;
  alasan_pembatalan?: string;
  created_at: string;
}

export interface StudentClassHistoryRecord {
  id: string;
  student_id: string;
  tahun_ajaran?: string;
  semester?: string;
  angkatan?: string;
  kelas: string;
  tingkat_kelas: '7' | '8' | '9';
  kamar?: string;
  status_riwayat: 'aktif' | 'naik_kelas' | 'tinggal_kelas' | 'pindah_rombel' | 'lulus' | 'mutasi';
  tanggal_mulai: string;
  tanggal_selesai?: string;
  catatan?: string;
  created_at: string;
}

export interface StudentGraduationRecord {
  id: string;
  student_id: string;
  nis?: string;
  nisn: string;
  nama_siswa: string;
  angkatan: string;
  kelas_terakhir: string;
  tahun_ajaran_lulus: string;
  tahun_kelulusan: string;
  tanggal_kelulusan: string;
  nomor_ijazah_smp?: string;
  nomor_skhun?: string;
  nilai_rata_rata?: number;
  sekolah_lanjutan?: string;
  status_kelulusan: 'Lulus' | 'Ditunda';
  diproses_oleh_nama?: string;
  catatan?: string;
  created_at: string;
}

export interface ExportLogRecord {
  id: string;
  exported_by_name: string;
  exported_by_role: string;
  export_type: string;
  filter_summary: Record<string, string>;
  total_records: number;
  file_name: string;
  created_at: string;
}

export interface FullDatabaseBackupPayload {
  backup_meta: {
    app_name: string;
    school_name: string;
    npsn: string;
    schema_version: string;
    created_at: string;
    exported_by_name: string;
    exported_by_role: string;
    record_counts: Record<string, number>;
  };
  tables: {
    academic_years: AcademicYearRecord[];
    classes: ClassRecord[];
    students: Siswa[];
    student_class_history: StudentClassHistoryRecord[];
    student_mutations: Mutasi[];
    student_graduations: StudentGraduationRecord[];
    parent_student_access: Omit<ParentAccountRecord, 'temporary_password'>[];
    student_change_requests: PerubahanBiodata[];
    import_batches: ImportBatchRecord[];
    export_logs: ExportLogRecord[];
    audit_logs: AuditLog[];
  };
}

export interface AuditLog {
  id: string;
  user_id: string;
  user_name: string;
  user_role: string;
  user_type: UserType;
  action: string;
  target_type: string;
  target_id?: string;
  old_values?: Record<string, unknown>;
  new_values?: Record<string, unknown>;
  details: string;
  ip_address?: string;
  created_at: string;
}

export interface SchoolProfile {
  nama_sekolah: string;
  npsn: string;
  status_akreditasi: string;
  bentuk_pendidikan?: string;
  semester_aktif: string;
  tahun_ajaran: string;
  alamat: string;
  telepon: string;
  email_resmi: string;
  website: string;
  kepala_sekolah: string;
  nip_kepala_sekolah: string;
  logo_url?: string;
}

export const INCOME_RANGE_OPTIONS = [
  'Tidak Berpenghasilan / Rp 0',
  '< Rp 1.000.000',
  'Rp 1.000.000 - Rp 2.000.000',
  'Rp 2.000.000 - Rp 3.000.000',
  'Rp 3.000.000 - Rp 4.000.000',
  'Rp 4.000.000 - Rp 5.000.000',
  '> Rp 5.000.000'
] as const;

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: number;
}

export interface StudentFieldMeta {
  key: keyof Siswa;
  dbColumn: string;
  excelHeader: string;
  label: string;
  tab: StudentTabKey;
  sensitive?: boolean;
  parentEditable?: boolean;
  inputType?: 'text' | 'date' | 'number' | 'select' | 'textarea';
  options?: string[];
}

export const ALL_59_STUDENT_FIELDS: StudentFieldMeta[] = [
  { key: 'rombel', dbColumn: 'kelas', excelHeader: 'KELAS', label: 'Kelas', tab: 'administrasi', parentEditable: false },
  { key: 'nis', dbColumn: 'nis', excelHeader: 'NIS', label: 'NIS', tab: 'administrasi', parentEditable: false },
  { key: 'id_yys', dbColumn: 'id_yys', excelHeader: 'ID YYS', label: 'ID Yayasan', tab: 'administrasi', parentEditable: false },
  { key: 'kamar', dbColumn: 'kamar', excelHeader: 'KAMAR', label: 'Kamar', tab: 'administrasi', parentEditable: true },
  { key: 'nama_lengkap', dbColumn: 'nama_lengkap_siswa', excelHeader: 'NAMA LENGKAP SISWA', label: 'Nama Lengkap Siswa', tab: 'identitas', parentEditable: true },
  { key: 'no_kk', dbColumn: 'no_kk', excelHeader: 'NO KK', label: 'Nomor KK', tab: 'identitas', sensitive: true, parentEditable: true },
  { key: 'nik_siswa', dbColumn: 'nik_siswa', excelHeader: 'NIK SISWA', label: 'NIK Siswa', tab: 'identitas', sensitive: true, parentEditable: true },
  { key: 'nisn', dbColumn: 'nisn', excelHeader: 'NISN', label: 'NISN', tab: 'identitas', parentEditable: false },
  { key: 'no_ijazah_sd', dbColumn: 'no_ijazah_sd_mi', excelHeader: 'No Ijazah SD/MI', label: 'No. Ijazah SD/MI', tab: 'pendidikan', sensitive: true, parentEditable: true },
  { key: 'tgl_ijazah_sd', dbColumn: 'tanggal_penerbitan_ijazah', excelHeader: 'Tanggal Penerbitan Ijazah', label: 'Tanggal Penerbitan Ijazah', tab: 'pendidikan', inputType: 'date', parentEditable: true },
  { key: 'jenis_kelamin', dbColumn: 'jenis_kelamin', excelHeader: 'Jenis Kelamin', label: 'Jenis Kelamin', tab: 'identitas', inputType: 'select', options: ['L', 'P'], parentEditable: true },
  { key: 'tempat_lahir', dbColumn: 'tempat_lahir', excelHeader: 'TEMPAT LAHIR', label: 'Tempat Lahir', tab: 'identitas', parentEditable: true },
  { key: 'tanggal_lahir', dbColumn: 'tanggal_lahir', excelHeader: 'TANGGAL LAHIR', label: 'Tanggal Lahir', tab: 'identitas', inputType: 'date', parentEditable: true },
  { key: 'agama', dbColumn: 'agama', excelHeader: 'AGAMA', label: 'Agama', tab: 'identitas', inputType: 'select', options: ['Islam', 'Kristen', 'Katolik', 'Hindu', 'Buddha', 'Konghucu'], parentEditable: true },
  { key: 'berat_badan', dbColumn: 'berat_badan', excelHeader: 'BERAT BADAN', label: 'Berat Badan (kg)', tab: 'kesehatan', inputType: 'number', parentEditable: true },
  { key: 'tinggi_badan', dbColumn: 'tinggi_badan', excelHeader: 'TINGGI BADAN', label: 'Tinggi Badan (cm)', tab: 'kesehatan', inputType: 'number', parentEditable: true },
  { key: 'riwayat_penyakit', dbColumn: 'riwayat_penyakit', excelHeader: 'RIWAYAT PENYAKIT', label: 'Riwayat Penyakit', tab: 'kesehatan', parentEditable: true },
  { key: 'status_anak', dbColumn: 'status_anak', excelHeader: 'STATUS ANAK', label: 'Status Anak', tab: 'identitas', inputType: 'select', options: ['Anak Kandung', 'Anak Tiri', 'Anak Angkat'], parentEditable: true },
  { key: 'kewarganegaraan', dbColumn: 'kewarganegaraan', excelHeader: 'KEWARGANEGARAAN', label: 'Kewarganegaraan', tab: 'identitas', inputType: 'select', options: ['WNI', 'WNA'], parentEditable: true },
  { key: 'anak_ke', dbColumn: 'anak_ke', excelHeader: 'Anak Ke-', label: 'Anak Ke-', tab: 'identitas', inputType: 'number', parentEditable: true },
  { key: 'jml_saudara_kandung', dbColumn: 'jumlah_saudara_kandung', excelHeader: 'Jumlah Saudara Kandung', label: 'Jumlah Saudara Kandung', tab: 'identitas', inputType: 'number', parentEditable: true },
  { key: 'jml_saudara_tiri', dbColumn: 'jumlah_saudara_tiri', excelHeader: 'Jumlah Saudara TIRI', label: 'Jumlah Saudara Tiri', tab: 'identitas', inputType: 'number', parentEditable: true },
  { key: 'jalan_dusun', dbColumn: 'jalan_dusun', excelHeader: 'Jalan/Dusun', label: 'Jalan/Dusun', tab: 'alamat', parentEditable: true },
  { key: 'rt_rw', dbColumn: 'rt_rw', excelHeader: 'RT/RW', label: 'RT/RW', tab: 'alamat', parentEditable: true },
  { key: 'kelurahan', dbColumn: 'desa_kelurahan', excelHeader: 'Desa/Kelurahan', label: 'Desa/Kelurahan', tab: 'alamat', parentEditable: true },
  { key: 'kecamatan', dbColumn: 'kecamatan', excelHeader: 'Kecamatan', label: 'Kecamatan', tab: 'alamat', parentEditable: true },
  { key: 'kode_pos', dbColumn: 'kode_pos', excelHeader: 'Kode Pos', label: 'Kode Pos', tab: 'alamat', parentEditable: true },
  { key: 'kab_kota', dbColumn: 'kota_kabupaten', excelHeader: 'Kota/Kabupaten', label: 'Kota/Kabupaten', tab: 'alamat', parentEditable: true },
  { key: 'provinsi', dbColumn: 'provinsi', excelHeader: 'Provinsi', label: 'Provinsi', tab: 'alamat', parentEditable: true },
  { key: 'alamat', dbColumn: 'alamat_lengkap', excelHeader: 'Alamat Lengkap', label: 'Alamat Lengkap', tab: 'alamat', inputType: 'textarea', parentEditable: true },
  { key: 'jenjang_asal', dbColumn: 'jenjang', excelHeader: 'Jenjang', label: 'Jenjang Asal (SD/MI)', tab: 'pendidikan', inputType: 'select', options: ['SD', 'MI', 'Paket A'], parentEditable: true },
  { key: 'nama_asal_sekolah', dbColumn: 'nama_asal_sekolah', excelHeader: 'Nama Asal Sekolah', label: 'Nama Asal Sekolah', tab: 'pendidikan', parentEditable: true },
  { key: 'npsn_asal_sekolah', dbColumn: 'npsn_asal_sekolah', excelHeader: 'NPSN Asal Sekolah', label: 'NPSN Asal Sekolah', tab: 'pendidikan', parentEditable: true },
  { key: 'kecamatan_asal_sekolah', dbColumn: 'kecamatan_asal_sekolah', excelHeader: 'Kecamatan Asal Sekolah', label: 'Kecamatan Asal Sekolah', tab: 'pendidikan', parentEditable: true },
  { key: 'kabupaten_asal_sekolah', dbColumn: 'kabupaten_asal_sekolah', excelHeader: 'Kabupaten Asal Sekolah', label: 'Kabupaten Asal Sekolah', tab: 'pendidikan', parentEditable: true },
  { key: 'provinsi_asal_sekolah', dbColumn: 'provinsi_asal_sekolah', excelHeader: 'Provinsi Asal Sekolah', label: 'Provinsi Asal Sekolah', tab: 'pendidikan', parentEditable: true },
  { key: 'nama_ayah', dbColumn: 'nama_ayah', excelHeader: 'NAMA AYAH', label: 'Nama Ayah', tab: 'ayah', parentEditable: true },
  { key: 'nik_ayah', dbColumn: 'nik_ayah', excelHeader: 'NIK Ayah', label: 'NIK Ayah', tab: 'ayah', sensitive: true, parentEditable: true },
  { key: 'tempat_lahir_ayah', dbColumn: 'tempat_lahir_ayah', excelHeader: 'Tempat Lahir Ayah', label: 'Tempat Lahir Ayah', tab: 'ayah', parentEditable: true },
  { key: 'tgl_lahir_ayah', dbColumn: 'tgl_lahir_ayah', excelHeader: 'Tgl Lahir Ayah', label: 'Tanggal Lahir Ayah', tab: 'ayah', inputType: 'date', parentEditable: true },
  { key: 'pendidikan_ayah', dbColumn: 'pendidikan_ayah', excelHeader: 'Pendidikan ayah', label: 'Pendidikan Ayah', tab: 'ayah', parentEditable: true },
  { key: 'pekerjaan_ayah', dbColumn: 'pekerjaan_ayah', excelHeader: 'Pekerjaan Ayah', label: 'Pekerjaan Ayah', tab: 'ayah', parentEditable: true },
  { key: 'no_wa_ayah', dbColumn: 'no_wa_ayah', excelHeader: 'No WA Ayah', label: 'No. WA Ayah', tab: 'ayah', parentEditable: true },
  { key: 'penghasilan_ayah', dbColumn: 'penghasilan_ayah', excelHeader: 'Penghasilan Ayah', label: 'Penghasilan Ayah', tab: 'ayah', sensitive: true, parentEditable: true, inputType: 'select', options: [...INCOME_RANGE_OPTIONS] },
  { key: 'nama_ibu', dbColumn: 'nama_ibu_kandung', excelHeader: 'NAMA IBU KANDUNG', label: 'Nama Ibu Kandung', tab: 'ibu', parentEditable: true },
  { key: 'nik_ibu', dbColumn: 'nik_ibu', excelHeader: 'NIK IBU', label: 'NIK Ibu', tab: 'ibu', sensitive: true, parentEditable: true },
  { key: 'tempat_lahir_ibu', dbColumn: 'tempat_lahir_ibu', excelHeader: 'Tempat Lahir IBu', label: 'Tempat Lahir Ibu', tab: 'ibu', parentEditable: true },
  { key: 'tgl_lahir_ibu', dbColumn: 'tgl_lahir_ibu', excelHeader: 'Tgl Lahir Ibu', label: 'Tanggal Lahir Ibu', tab: 'ibu', inputType: 'date', parentEditable: true },
  { key: 'pendidikan_ibu', dbColumn: 'pendidikan_ibu', excelHeader: 'Pendidikan Ibu', label: 'Pendidikan Ibu', tab: 'ibu', parentEditable: true },
  { key: 'pekerjaan_ibu', dbColumn: 'pekerjaan_ibu', excelHeader: 'Pekerjaan Ibu', label: 'Pekerjaan Ibu', tab: 'ibu', parentEditable: true },
  { key: 'no_wa_ibu', dbColumn: 'no_wa_ibu', excelHeader: 'No Wa Ibu', label: 'No. WA Ibu', tab: 'ibu', parentEditable: true },
  { key: 'penghasilan_ibu', dbColumn: 'penghasilan_ibu', excelHeader: 'Penghasilan Ibu', label: 'Penghasilan Ibu', tab: 'ibu', sensitive: true, parentEditable: true, inputType: 'select', options: [...INCOME_RANGE_OPTIONS] },
  { key: 'nama_wali', dbColumn: 'nama_wali', excelHeader: 'Nama Wali', label: 'Nama Wali', tab: 'wali', parentEditable: true },
  { key: 'nik_wali', dbColumn: 'nik_wali', excelHeader: 'NIK Wali', label: 'NIK Wali', tab: 'wali', sensitive: true, parentEditable: true },
  { key: 'pekerjaan_wali', dbColumn: 'pekerjaan_wali', excelHeader: 'Pekerjaan Wali', label: 'Pekerjaan Wali', tab: 'wali', parentEditable: true },
  { key: 'penghasilan_wali', dbColumn: 'penghasilan_wali', excelHeader: 'Penghasilan Wali', label: 'Penghasilan Wali', tab: 'wali', sensitive: true, parentEditable: true, inputType: 'select', options: [...INCOME_RANGE_OPTIONS] },
  { key: 'no_hp_orangtua', dbColumn: 'no_hp_wali', excelHeader: 'No HP Wali', label: 'No. HP Wali', tab: 'wali', parentEditable: true },
  { key: 'status', dbColumn: 'status_aktif', excelHeader: 'Status Aktif', label: 'Status Aktif', tab: 'administrasi', parentEditable: false },
  { key: 'tanggal_masuk', dbColumn: 'tanggal_masuk', excelHeader: 'Tanggal Masuk', label: 'Tanggal Masuk', tab: 'administrasi', inputType: 'date', parentEditable: false }
];

export interface BiodataCompleteness {
  percentage: number;
  filledCount: number;
  totalCount: number;
  emptyFields: StudentFieldMeta[];
  filledFields: StudentFieldMeta[];
}

export function calculateBiodataCompleteness(student: Siswa): BiodataCompleteness {
  const filledFields: StudentFieldMeta[] = [];
  const emptyFields: StudentFieldMeta[] = [];

  for (const field of ALL_59_STUDENT_FIELDS) {
    const val = student[field.key];
    const strVal = val !== undefined && val !== null ? String(val).trim() : '';
    if (strVal !== '' && strVal !== '-') {
      filledFields.push(field);
    } else {
      emptyFields.push(field);
    }
  }

  const totalCount = ALL_59_STUDENT_FIELDS.length;
  const filledCount = filledFields.length;
  const percentage = Math.round((filledCount / totalCount) * 100);

  return {
    percentage,
    filledCount,
    totalCount,
    emptyFields,
    filledFields
  };
}

export interface ClassRecord {
  id: string;
  nama_kelas: string;
  tingkat: '7' | '8' | '9';
  wali_kelas?: string;
  kamar_default?: string;
  kapasitas: number;
  is_active: boolean;
  academic_year_id?: string;
  created_at: string;
}

export interface AcademicYearRecord {
  id: string;
  tahun_ajaran: string;
  semester: 'Ganjil' | 'Genap';
  is_active: boolean;
  is_archived?: boolean;
  tanggal_mulai?: string;
  tanggal_selesai?: string;
  catatan?: string;
  created_at: string;
}

export interface AdminAccountRecord {
  id: string;
  email: string;
  username: string;
  full_name: string;
  role: AdminRole;
  phone?: string;
  is_active: boolean;
  last_login_at?: string;
  created_at: string;
}

export interface DashboardFilterState {
  tahunAjaran: string;
  selectedYear?: string; // Tahun Kalender untuk grafik bulanan Jan-Des (misal '2026', '2025', 'all')
  semesterPeriod?: 'all' | 'ganjil' | 'genap';
  selectedMonth?: string; // 'all' | '01'..'12'
  angkatan?: string;
  kelas: string;
  jenjang: string;
  jenisKelamin: string;
  status: string;
  dateFrom: string;
  dateTo: string;
}



