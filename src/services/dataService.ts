import {
  Siswa,
  ParentAccountRecord,
  PerubahanBiodata,
  ChangeRequestStatus,
  ChangeItemStatus,
  ChangeFieldDetail,
  ImportBatchRecord,
  ImportBatchRowRecord,
  ImportCategory,
  ImportMode,
  Mutasi,
  MutationCategory,
  StudentClassHistoryRecord,
  StudentGraduationRecord,
  ExportLogRecord,
  FullDatabaseBackupPayload,
  AuditLog,
  ClassRecord,
  AcademicYearRecord,
  AdminAccountRecord,
  AdminRole,
  DashboardFilterState,
  calculateBiodataCompleteness
} from '../types';
import {
  getSupabase,
  isSupabaseConfigured,
  createIsolatedSupabaseClient,
  ensureSupabaseSessionReady
} from './supabase';
import { safeParseJsonResponse, getSession, PARENT_STUDENT_CACHE_KEY } from './authService';
import { SCHOOL_CONFIG } from '../config/school';
import { saveSchoolProfile } from './schoolService';
import {
  normalizeKelasValue,
  normalizeExcelDate,
  isSameStudentIdentity,
  ParsedMutationImportRow
} from './excelService';
import {
  mapIncomeToRange,
  incomeRangeToNumeric,
  toTitleCase,
  toUpperStudentName,
  normalizeDaerahKotaKab,
  resolveAndNormalizeDaerahSiswa,
  inferStudentAngkatan,
  formatBirthDatePasswordDefault
} from '../utils/formatters';

// Transient runtime buffers (tanpa data dummy / akun demo)
let siswaStore: Siswa[] = [];
let parentAccountsStore: ParentAccountRecord[] = [];
let perubahanStore: PerubahanBiodata[] = [];
let mutasiStore: Mutasi[] = [];
let classHistoryStore: StudentClassHistoryRecord[] = [];
let graduationsStore: StudentGraduationRecord[] = [];
let auditLogsStore: AuditLog[] = [];
let importBatchesStore: ImportBatchRecord[] = [];
let importBatchRowsStore: ImportBatchRowRecord[] = [];
let exportLogsStore: ExportLogRecord[] = [];
let classesStore: ClassRecord[] = [];
let academicYearsStore: AcademicYearRecord[] = [];
let adminProfilesStore: AdminAccountRecord[] = [];

// Cache untuk class_id dan deteksi otomatis kolom lifecycle di tabel students
const classIdCache = new Map<string, string>();
let studentsHasLifecycleColumns: boolean | null = null;

function stripLegacyStudentColumns(payload: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...payload };
  delete copy.angkatan;
  delete copy.tahun_ajaran_masuk;
  delete copy.tahun_lulus;
  delete copy.tanggal_lulus;
  delete copy.nomor_ijazah_smp;
  delete copy.import_batch_id;
  return copy;
}

// ============================================================================
// HELPER KONVERSI TIPE DATA (TEXT, DATE, NUMERIC) ANTARA FRONTEND <-> SUPABASE
// ============================================================================

function parseNumericValue(val?: string | number | null): number | null {
  if (val === undefined || val === null) return null;
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  const cleaned = String(val).replace(/[^0-9.,-]/g, '').replace(',', '.');
  if (!cleaned) return null;
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseIntValue(val?: string | number | null): number | null {
  if (val === undefined || val === null) return null;
  if (typeof val === 'number') return Math.trunc(val);
  const cleaned = String(val).replace(/\D/g, '');
  if (!cleaned) return null;
  const parsed = parseInt(cleaned, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDateValue(val?: string | null): string | null {
  if (!val || val === '-' || val.trim() === '') return null;
  const normalized = normalizeExcelDate(val);
  return normalized || null;
}

function cleanTextValue(val?: string | null): string | null {
  if (val === undefined || val === null) return null;
  const trimmed = String(val).trim();
  return trimmed === '' || trimmed === '-' ? null : trimmed;
}

/**
 * Helper untuk mengambil seluruh baris data Supabase tanpa terpotong limit 1000 baris PostgREST.
 * Mengambil secara bertahap dalam batch 1000 baris hingga seluruh data terbaca lengkap.
 */
async function fetchAllSupabaseRows<T = Record<string, unknown>>(
  fetchChunk: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const all: T[] = [];
  const CHUNK_SIZE = 1000;
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await fetchChunk(from, from + CHUNK_SIZE - 1);
    if (error) {
      console.error('Error fetching Supabase batch:', error);
      break;
    }
    if (data && data.length > 0) {
      all.push(...data);
      if (data.length < CHUNK_SIZE) {
        hasMore = false;
      } else {
        from += CHUNK_SIZE;
      }
    } else {
      hasMore = false;
    }
  }

  return all;
}

function cleanTitleCaseValue(val?: string | null): string | null {
  const cleaned = cleanTextValue(val);
  if (!cleaned) return null;
  return toTitleCase(cleaned);
}

/**
 * Memetakan baris tabel `public.students` (snake_case 59 kolom) ke interface `Siswa` aplikasi
 */
export function mapDbRowToSiswa(row: Record<string, unknown>): Siswa {
  const rawKelasStr = String(row.kelas || row.rombel || '7A').trim();
  const normKelas = normalizeKelasValue(rawKelasStr, '7A');
  const kelas = normKelas.rombel || rawKelasStr.toUpperCase() || '7A';
  const tingkatRaw = String(row.tingkat_kelas || normKelas.tingkat || kelas.charAt(0) || '7').trim();
  const tingkat: '7' | '8' | '9' =
    tingkatRaw === '8' ? '8' : tingkatRaw === '9' ? '9' : '7';

  const rawTanggalPindahCandidate =
    row.tanggal_pindah ??
    row['Tanggal Pindah'] ??
    row['TANGGAL PINDAH'] ??
    row.tgl_pindah ??
    row.tanggal_mutasi ??
    row.tanggal_keluar;
  const parsedPindahCandidate = rawTanggalPindahCandidate
    ? normalizeExcelDate(rawTanggalPindahCandidate)
    : '';
  const rawTanggalMasuk = row.tanggal_masuk ? String(row.tanggal_masuk).trim() : '';
  const tanggalMasuk =
    parsedPindahCandidate && (!rawTanggalMasuk || rawTanggalMasuk === '2026-11-08')
      ? parsedPindahCandidate
      : normalizeExcelDate(rawTanggalMasuk) || rawTanggalMasuk;
  const rawStatus = String(row.status_aktif ?? row.status ?? 'aktif').trim().toLowerCase();
  const status: Siswa['status'] =
    rawStatus === 'mutasi_masuk' || rawStatus === 'mutasi masuk'
      ? 'mutasi_masuk'
      : rawStatus === 'mutasi_keluar' || rawStatus === 'mutasi keluar' || rawStatus === 'pindah'
      ? 'mutasi_keluar'
      : rawStatus === 'lulus' || rawStatus === 'alumni'
      ? 'lulus'
      : rawStatus === 'non_aktif' ||
        rawStatus === 'non-aktif' ||
        rawStatus === 'nonaktif' ||
        rawStatus === 'arsip'
      ? 'non_aktif'
      : 'aktif';

  const computedAngkatan = inferStudentAngkatan(tingkat, row.angkatan, status);

  const jalanDusunFormatted = toTitleCase(row.jalan_dusun || '');
  const kelurahanFormatted = toTitleCase(row.desa_kelurahan ?? row.kelurahan ?? '');
  const kecamatanFormatted = toTitleCase(row.kecamatan || '');
  const provinsiFormatted = toTitleCase(row.provinsi || '');
  const alamatFormatted = toTitleCase(row.alamat_lengkap ?? row.alamat ?? '');
  const tempatLahirFormatted = toTitleCase(row.tempat_lahir || '');
  const kecAsalSekolahFormatted = toTitleCase(row.kecamatan_asal_sekolah || '');
  const kabAsalSekolahFormatted = normalizeDaerahKotaKab(row.kabupaten_asal_sekolah || '');
  const rawKabKota = String(row.kota_kabupaten ?? row.kab_kota ?? '');

  const resolvedKabKota = resolveAndNormalizeDaerahSiswa({
    kab_kota: rawKabKota,
    kabupaten_asal_sekolah: kabAsalSekolahFormatted,
    alamat: alamatFormatted,
    kecamatan: kecamatanFormatted,
    kelurahan: kelurahanFormatted,
    jalan_dusun: jalanDusunFormatted,
    kecamatan_asal_sekolah: kecAsalSekolahFormatted,
    tempat_lahir: tempatLahirFormatted,
    provinsi: provinsiFormatted
  });

  return {
    id: String(row.id || crypto.randomUUID()),
    rombel: kelas,
    tingkat_kelas: tingkat,
    nis: String(row.nis || ''),
    id_yys: String(row.id_yys || ''),
    kamar: toTitleCase(row.kamar || ''),
    nama_lengkap: toUpperStudentName(row.nama_lengkap_siswa || row.nama_lengkap || ''),
    no_kk: String(row.no_kk || ''),
    nik_siswa: String(row.nik_siswa || ''),
    nisn: String(row.nisn || ''),
    no_ijazah_sd: String(row.no_ijazah_sd_mi ?? row.no_ijazah_sd ?? ''),
    tgl_ijazah_sd: String(row.tanggal_penerbitan_ijazah ?? row.tgl_ijazah_sd ?? ''),
    jenis_kelamin: (row.jenis_kelamin === 'P' ? 'P' : 'L') as 'L' | 'P',
    tempat_lahir: tempatLahirFormatted,
    tanggal_lahir: String(row.tanggal_lahir || ''),
    agama: toTitleCase(row.agama || 'Islam') || 'Islam',
    berat_badan: row.berat_badan !== null && row.berat_badan !== undefined ? String(row.berat_badan) : '',
    tinggi_badan: row.tinggi_badan !== null && row.tinggi_badan !== undefined ? String(row.tinggi_badan) : '',
    riwayat_penyakit: toTitleCase(row.riwayat_penyakit || ''),
    status_anak: toTitleCase(row.status_anak || ''),
    kewarganegaraan: String(row.kewarganegaraan || 'WNI').toUpperCase(),
    anak_ke: row.anak_ke !== null && row.anak_ke !== undefined ? String(row.anak_ke) : '',
    jml_saudara_kandung:
      row.jumlah_saudara_kandung !== null && row.jumlah_saudara_kandung !== undefined
        ? String(row.jumlah_saudara_kandung)
        : String(row.jml_saudara_kandung || '0'),
    jml_saudara_tiri:
      row.jumlah_saudara_tiri !== null && row.jumlah_saudara_tiri !== undefined
        ? String(row.jumlah_saudara_tiri)
        : String(row.jml_saudara_tiri || '0'),
    jalan_dusun: jalanDusunFormatted,
    rt_rw: String(row.rt_rw || ''),
    kelurahan: kelurahanFormatted,
    kecamatan: kecamatanFormatted,
    kode_pos: String(row.kode_pos || ''),
    kab_kota: resolvedKabKota,
    provinsi: provinsiFormatted,
    alamat: alamatFormatted,
    jenjang_asal: String(row.jenjang ?? row.jenjang_asal ?? 'SD').toUpperCase(),
    nama_asal_sekolah: toTitleCase(row.nama_asal_sekolah || ''),
    npsn_asal_sekolah: String(row.npsn_asal_sekolah || ''),
    kecamatan_asal_sekolah: kecAsalSekolahFormatted,
    kabupaten_asal_sekolah: kabAsalSekolahFormatted,
    provinsi_asal_sekolah: toTitleCase(row.provinsi_asal_sekolah || ''),
    nama_ayah: toTitleCase(row.nama_ayah || ''),
    nik_ayah: String(row.nik_ayah || ''),
    tempat_lahir_ayah: toTitleCase(row.tempat_lahir_ayah || ''),
    tgl_lahir_ayah: String(row.tgl_lahir_ayah || ''),
    pendidikan_ayah: toTitleCase(row.pendidikan_ayah || ''),
    pekerjaan_ayah: toTitleCase(row.pekerjaan_ayah || ''),
    no_wa_ayah: String(row.no_wa_ayah || ''),
    penghasilan_ayah: mapIncomeToRange(row.penghasilan_ayah),
    nama_ibu: toTitleCase(row.nama_ibu_kandung ?? row.nama_ibu ?? ''),
    nik_ibu: String(row.nik_ibu || ''),
    tempat_lahir_ibu: toTitleCase(row.tempat_lahir_ibu || ''),
    tgl_lahir_ibu: String(row.tgl_lahir_ibu || ''),
    pendidikan_ibu: toTitleCase(row.pendidikan_ibu || ''),
    pekerjaan_ibu: toTitleCase(row.pekerjaan_ibu || ''),
    no_wa_ibu: String(row.no_wa_ibu || ''),
    penghasilan_ibu: mapIncomeToRange(row.penghasilan_ibu ?? (row as Record<string, unknown>).penghasilan_ibu_kandung),
    nama_wali: toTitleCase(row.nama_wali || ''),
    nik_wali: String(row.nik_wali || ''),
    pekerjaan_wali: toTitleCase(row.pekerjaan_wali || ''),
    penghasilan_wali: mapIncomeToRange(row.penghasilan_wali),
    no_hp_orangtua: String(row.no_hp_wali ?? row.no_hp_orangtua ?? ''),
    status,
    tanggal_masuk: tanggalMasuk,
    tahun_masuk: computedAngkatan,
    angkatan: computedAngkatan,
    tahun_ajaran_masuk: row.tahun_ajaran_masuk ? String(row.tahun_ajaran_masuk) : undefined,
    tahun_lulus: row.tahun_lulus ? String(row.tahun_lulus) : undefined,
    tanggal_lulus: row.tanggal_lulus ? String(row.tanggal_lulus) : undefined,
    nomor_ijazah_smp: row.nomor_ijazah_smp ? String(row.nomor_ijazah_smp) : undefined,
    created_at: String(row.created_at || new Date().toISOString()),
    updated_at: String(row.updated_at || new Date().toISOString())
  };
}

/**
 * Memetakan payload `Siswa` aplikasi ke kolom snake_case tabel `public.students`
 */
export function mapSiswaToDbPayload(
  payload: Partial<Siswa>,
  extra?: { class_id?: string | null; import_batch_id?: string | null }
): Record<string, unknown> {
  const dbObj: Record<string, unknown> = {};

  let resolvedTingkat: string | undefined = payload.tingkat_kelas;
  if (payload.rombel !== undefined) {
    const norm = normalizeKelasValue(payload.rombel, '7A');
    dbObj.kelas = norm.rombel;
    resolvedTingkat = norm.tingkat;
  }
  if (payload.nis !== undefined) dbObj.nis = cleanTextValue(payload.nis);
  if (payload.id_yys !== undefined) dbObj.id_yys = cleanTextValue(payload.id_yys);
  if (payload.kamar !== undefined) dbObj.kamar = cleanTitleCaseValue(payload.kamar);
  if (payload.nama_lengkap !== undefined) {
    dbObj.nama_lengkap_siswa = toUpperStudentName(payload.nama_lengkap);
  }
  if (payload.no_kk !== undefined) dbObj.no_kk = cleanTextValue(payload.no_kk);
  if (payload.nik_siswa !== undefined) dbObj.nik_siswa = cleanTextValue(payload.nik_siswa);
  if (payload.nisn !== undefined) {
    const cleanedNisn = cleanTextValue(payload.nisn);
    dbObj.nisn = cleanedNisn && /^\d{10}$/.test(cleanedNisn) ? cleanedNisn : null;
  }

  if (payload.no_ijazah_sd !== undefined) dbObj.no_ijazah_sd_mi = cleanTextValue(payload.no_ijazah_sd);
  if (payload.tgl_ijazah_sd !== undefined) {
    dbObj.tanggal_penerbitan_ijazah = parseDateValue(payload.tgl_ijazah_sd);
  }

  if (payload.jenis_kelamin !== undefined) {
    dbObj.jenis_kelamin = payload.jenis_kelamin === 'P' ? 'P' : 'L';
  }
  if (payload.tempat_lahir !== undefined) dbObj.tempat_lahir = cleanTitleCaseValue(payload.tempat_lahir);
  if (payload.tanggal_lahir !== undefined) dbObj.tanggal_lahir = parseDateValue(payload.tanggal_lahir);
  if (payload.agama !== undefined) dbObj.agama = cleanTitleCaseValue(payload.agama) || 'Islam';

  if (payload.berat_badan !== undefined) {
    const bb = parseNumericValue(payload.berat_badan);
    dbObj.berat_badan = bb !== null && bb >= 0 && bb < 1000 ? Math.round(bb * 100) / 100 : null;
  }
  if (payload.tinggi_badan !== undefined) {
    const tb = parseNumericValue(payload.tinggi_badan);
    dbObj.tinggi_badan = tb !== null && tb >= 0 && tb < 1000 ? Math.round(tb * 100) / 100 : null;
  }
  if (payload.riwayat_penyakit !== undefined) dbObj.riwayat_penyakit = cleanTitleCaseValue(payload.riwayat_penyakit);
  if (payload.status_anak !== undefined) dbObj.status_anak = cleanTitleCaseValue(payload.status_anak);
  if (payload.kewarganegaraan !== undefined) dbObj.kewarganegaraan = cleanTextValue(payload.kewarganegaraan)?.toUpperCase() || 'WNI';
  if (payload.anak_ke !== undefined) {
    const ak = parseIntValue(payload.anak_ke);
    dbObj.anak_ke = ak !== null && ak >= 1 && ak <= 50 ? ak : null;
  }
  if (payload.jml_saudara_kandung !== undefined) {
    const jsk = parseIntValue(payload.jml_saudara_kandung);
    dbObj.jumlah_saudara_kandung = jsk !== null && jsk >= 0 && jsk <= 50 ? jsk : 0;
  }
  if (payload.jml_saudara_tiri !== undefined) {
    const jst = parseIntValue(payload.jml_saudara_tiri);
    dbObj.jumlah_saudara_tiri = jst !== null && jst >= 0 && jst <= 50 ? jst : 0;
  }

  if (payload.jalan_dusun !== undefined) dbObj.jalan_dusun = cleanTitleCaseValue(payload.jalan_dusun);
  if (payload.rt_rw !== undefined) dbObj.rt_rw = cleanTextValue(payload.rt_rw);
  if (payload.kelurahan !== undefined) dbObj.desa_kelurahan = cleanTitleCaseValue(payload.kelurahan);
  if (payload.kecamatan !== undefined) dbObj.kecamatan = cleanTitleCaseValue(payload.kecamatan);
  if (payload.kode_pos !== undefined) dbObj.kode_pos = cleanTextValue(payload.kode_pos);
  if (payload.kab_kota !== undefined || payload.alamat !== undefined) {
    const resolvedDaerah = resolveAndNormalizeDaerahSiswa({
      kab_kota: payload.kab_kota,
      kabupaten_asal_sekolah: payload.kabupaten_asal_sekolah,
      alamat: payload.alamat,
      kecamatan: payload.kecamatan,
      kelurahan: payload.kelurahan,
      jalan_dusun: payload.jalan_dusun,
      kecamatan_asal_sekolah: payload.kecamatan_asal_sekolah,
      tempat_lahir: payload.tempat_lahir,
      provinsi: payload.provinsi
    });
    if (resolvedDaerah) {
      dbObj.kota_kabupaten = resolvedDaerah;
    } else if (payload.kab_kota !== undefined) {
      dbObj.kota_kabupaten = cleanTitleCaseValue(payload.kab_kota);
    }
  }
  if (payload.provinsi !== undefined) dbObj.provinsi = cleanTitleCaseValue(payload.provinsi);
  if (payload.alamat !== undefined) dbObj.alamat_lengkap = cleanTitleCaseValue(payload.alamat);

  if (payload.jenjang_asal !== undefined) dbObj.jenjang = cleanTextValue(payload.jenjang_asal)?.toUpperCase() || 'SD';
  if (payload.nama_asal_sekolah !== undefined) dbObj.nama_asal_sekolah = cleanTitleCaseValue(payload.nama_asal_sekolah);
  if (payload.npsn_asal_sekolah !== undefined) dbObj.npsn_asal_sekolah = cleanTextValue(payload.npsn_asal_sekolah);
  if (payload.kecamatan_asal_sekolah !== undefined) {
    dbObj.kecamatan_asal_sekolah = cleanTitleCaseValue(payload.kecamatan_asal_sekolah);
  }
  if (payload.kabupaten_asal_sekolah !== undefined) {
    dbObj.kabupaten_asal_sekolah = normalizeDaerahKotaKab(payload.kabupaten_asal_sekolah) || cleanTitleCaseValue(payload.kabupaten_asal_sekolah);
  }
  if (payload.provinsi_asal_sekolah !== undefined) {
    dbObj.provinsi_asal_sekolah = cleanTitleCaseValue(payload.provinsi_asal_sekolah);
  }

  if (payload.nama_ayah !== undefined) dbObj.nama_ayah = cleanTitleCaseValue(payload.nama_ayah);
  if (payload.nik_ayah !== undefined) dbObj.nik_ayah = cleanTextValue(payload.nik_ayah);
  if (payload.tempat_lahir_ayah !== undefined) dbObj.tempat_lahir_ayah = cleanTitleCaseValue(payload.tempat_lahir_ayah);
  if (payload.tgl_lahir_ayah !== undefined) dbObj.tgl_lahir_ayah = parseDateValue(payload.tgl_lahir_ayah);
  if (payload.pendidikan_ayah !== undefined) dbObj.pendidikan_ayah = cleanTitleCaseValue(payload.pendidikan_ayah);
  if (payload.pekerjaan_ayah !== undefined) dbObj.pekerjaan_ayah = cleanTitleCaseValue(payload.pekerjaan_ayah);
  if (payload.no_wa_ayah !== undefined) dbObj.no_wa_ayah = cleanTextValue(payload.no_wa_ayah);
  if (payload.penghasilan_ayah !== undefined) {
    dbObj.penghasilan_ayah = incomeRangeToNumeric(payload.penghasilan_ayah);
  }

  if (payload.nama_ibu !== undefined) dbObj.nama_ibu_kandung = cleanTitleCaseValue(payload.nama_ibu);
  if (payload.nik_ibu !== undefined) dbObj.nik_ibu = cleanTextValue(payload.nik_ibu);
  if (payload.tempat_lahir_ibu !== undefined) dbObj.tempat_lahir_ibu = cleanTitleCaseValue(payload.tempat_lahir_ibu);
  if (payload.tgl_lahir_ibu !== undefined) dbObj.tgl_lahir_ibu = parseDateValue(payload.tgl_lahir_ibu);
  if (payload.pendidikan_ibu !== undefined) dbObj.pendidikan_ibu = cleanTitleCaseValue(payload.pendidikan_ibu);
  if (payload.pekerjaan_ibu !== undefined) dbObj.pekerjaan_ibu = cleanTitleCaseValue(payload.pekerjaan_ibu);
  if (payload.no_wa_ibu !== undefined) dbObj.no_wa_ibu = cleanTextValue(payload.no_wa_ibu);
  if (payload.penghasilan_ibu !== undefined) {
    dbObj.penghasilan_ibu = incomeRangeToNumeric(payload.penghasilan_ibu);
  }

  if (payload.nama_wali !== undefined) dbObj.nama_wali = cleanTitleCaseValue(payload.nama_wali);
  if (payload.nik_wali !== undefined) dbObj.nik_wali = cleanTextValue(payload.nik_wali);
  if (payload.pekerjaan_wali !== undefined) dbObj.pekerjaan_wali = cleanTitleCaseValue(payload.pekerjaan_wali);
  if (payload.penghasilan_wali !== undefined) {
    dbObj.penghasilan_wali = incomeRangeToNumeric(payload.penghasilan_wali);
  }
  if (payload.no_hp_orangtua !== undefined) dbObj.no_hp_wali = cleanTextValue(payload.no_hp_orangtua);

  if (payload.status !== undefined) dbObj.status_aktif = payload.status;
  if (payload.tanggal_masuk !== undefined) {
    dbObj.tanggal_masuk = parseDateValue(payload.tanggal_masuk) || new Date().toISOString().slice(0, 10);
  }
  if (studentsHasLifecycleColumns !== false) {
    if (resolvedTingkat || payload.angkatan !== undefined || payload.tahun_masuk !== undefined) {
      dbObj.angkatan = inferStudentAngkatan(
        resolvedTingkat,
        payload.angkatan || payload.tahun_masuk,
        payload.status
      );
    }
    if (payload.tahun_ajaran_masuk !== undefined) {
      dbObj.tahun_ajaran_masuk = cleanTextValue(payload.tahun_ajaran_masuk);
    }
    if (payload.tahun_lulus !== undefined) {
      dbObj.tahun_lulus = cleanTextValue(payload.tahun_lulus);
    }
    if (payload.tanggal_lulus !== undefined) {
      dbObj.tanggal_lulus = parseDateValue(payload.tanggal_lulus);
    }
    if (payload.nomor_ijazah_smp !== undefined) {
      dbObj.nomor_ijazah_smp = cleanTextValue(payload.nomor_ijazah_smp);
    }
    if (extra?.import_batch_id) dbObj.import_batch_id = extra.import_batch_id;
  }

  if (extra?.class_id) dbObj.class_id = extra.class_id;

  return dbObj;
}

// ============================================================================
// AUDIT LOG SERVICE (`public.audit_logs`)
// ============================================================================

export function recordAuditLog(log: Omit<AuditLog, 'id' | 'created_at'>): void {
  const newLog: AuditLog = {
    ...log,
    id: crypto.randomUUID ? crypto.randomUUID() : 'aud-' + Date.now(),
    created_at: new Date().toISOString()
  };
  auditLogsStore.unshift(newLog);

  if (isSupabaseConfigured) {
    const supabase = getSupabase();
    if (supabase) {
      supabase
        .from('audit_logs')
        .insert([
          {
            actor_name: log.user_name,
            actor_role: log.user_role,
            actor_type: log.user_type,
            action: log.action,
            target_table: log.target_type,
            target_id: log.target_id || null,
            old_values: log.old_values || null,
            new_values: log.new_values || null,
            details: log.details
          }
        ])
        .then(() => {});
    }
  }
}

export async function getAuditLogs(): Promise<AuditLog[]> {
  if (isSupabaseConfigured) {
    await ensureSupabaseSessionReady();
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (!error && data) {
        return data.map((row: Record<string, unknown>) => ({
          id: String(row.id),
          user_id: String(row.actor_id || '-'),
          user_name: String(row.actor_name || '-'),
          user_role: String(row.actor_role || '-'),
          user_type: (row.actor_type === 'parent' ? 'parent' : 'admin') as 'admin' | 'parent',
          action: String(row.action || ''),
          target_type: String(row.target_table || ''),
          target_id: row.target_id ? String(row.target_id) : undefined,
          old_values: row.old_values ? (row.old_values as Record<string, unknown>) : undefined,
          new_values: row.new_values ? (row.new_values as Record<string, unknown>) : undefined,
          details: String(row.details || ''),
          ip_address: row.ip_address ? String(row.ip_address) : undefined,
          created_at: String(row.created_at || new Date().toISOString())
        }));
      }
    }
  }
  return [...auditLogsStore];
}

// ============================================================================
// CLASSES & ACADEMIC YEARS HELPER (`public.classes` & `public.academic_years`)
// ============================================================================

async function resolveOrCreateClassId(namaKelas: string): Promise<string | null> {
  if (!isSupabaseConfigured || !namaKelas) return null;
  const norm = normalizeKelasValue(namaKelas, '7A');
  const cleanName = norm.rombel;
  if (classIdCache.has(cleanName)) {
    return classIdCache.get(cleanName) || null;
  }

  await ensureSupabaseSessionReady();
  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    const { data: existingRows } = await supabase
      .from('classes')
      .select('id')
      .eq('nama_kelas', cleanName)
      .limit(1);

    if (existingRows && existingRows.length > 0 && existingRows[0]?.id) {
      const resolvedId = String(existingRows[0].id);
      classIdCache.set(cleanName, resolvedId);
      return resolvedId;
    }

    const { data: createdRows } = await supabase
      .from('classes')
      .insert({
        nama_kelas: cleanName,
        tingkat_kelas: norm.tingkat,
        is_active: true
      })
      .select('id')
      .limit(1);

    if (createdRows && createdRows.length > 0 && createdRows[0]?.id) {
      const createdId = String(createdRows[0].id);
      classIdCache.set(cleanName, createdId);
      return createdId;
    }
    return null;
  } catch {
    return null;
  }
}

// ============================================================================
// VALIDASI UNIK NIS DAN NISN TERHADAP TABEL STUDENTS
// ============================================================================

export async function validateUniqueNisAndNisn(
  nis?: string,
  nisn?: string,
  excludeStudentId?: string,
  _nik?: string
): Promise<void> {
  const cleanNis = cleanTextValue(nis);
  const rawNisn = cleanTextValue(nisn);
  const cleanNisn = rawNisn && /^\d{10}$/.test(rawNisn) ? rawNisn : null;

  if (isSupabaseConfigured) {
    await ensureSupabaseSessionReady();
    const supabase = getSupabase();
    if (supabase) {
      if (cleanNis) {
        let query = supabase
          .from('students')
          .select('id, nama_lengkap_siswa, nis')
          .eq('nis', cleanNis);
        if (excludeStudentId) query = query.neq('id', excludeStudentId);
        const { data: dupNisRows } = await query.limit(1);
        const dupNis = dupNisRows?.[0];
        if (dupNis) {
          throw new Error(
            `NIS "${cleanNis}" sudah terdaftar atas nama ${String(dupNis.nama_lengkap_siswa || 'siswa lain')}. NIS harus unik.`
          );
        }
      }

      if (cleanNisn) {
        let query = supabase
          .from('students')
          .select('id, nama_lengkap_siswa, nisn')
          .eq('nisn', cleanNisn);
        if (excludeStudentId) query = query.neq('id', excludeStudentId);
        const { data: dupNisnRows } = await query.limit(1);
        const dupNisn = dupNisnRows?.[0];
        if (dupNisn) {
          throw new Error(
            `NISN "${cleanNisn}" sudah terdaftar atas nama ${String(dupNisn.nama_lengkap_siswa || 'siswa lain')}. NISN harus unik.`
          );
        }
      }
      return;
    }
  }

  if (cleanNis) {
    const dup = siswaStore.find(s => s.nis === cleanNis && s.id !== excludeStudentId);
    if (dup) {
      throw new Error(`NIS "${cleanNis}" sudah digunakan oleh siswa ${dup.nama_lengkap}.`);
    }
  }
  if (cleanNisn) {
    const dup = siswaStore.find(s => s.nisn === cleanNisn && s.id !== excludeStudentId);
    if (dup) {
      throw new Error(`NISN "${cleanNisn}" sudah digunakan oleh siswa ${dup.nama_lengkap}.`);
    }
  }
}

// ============================================================================
// STUDENTS SERVICE (`public.students` & `public.student_class_history`)
// ============================================================================

export async function getSiswaList(): Promise<Siswa[]> {
  if (isSupabaseConfigured) {
    await ensureSupabaseSessionReady();
    const supabase = getSupabase();
    if (supabase) {
      let allRows = await fetchAllSupabaseRows(async (from, to) => {
        return supabase
          .from('students')
          .select('*')
          .order('nama_lengkap_siswa', { ascending: true })
          .range(from, to);
      });

      if (allRows.length === 0) {
        allRows = await fetchAllSupabaseRows(async (from, to) => {
          return supabase
            .from('students')
            .select('*')
            .range(from, to);
        });
      }

      if (allRows.length > 0) {
        const mapped: Siswa[] = [];
        for (const row of allRows) {
          try {
            mapped.push(mapDbRowToSiswa(row as Record<string, unknown>));
          } catch (err) {
            console.error('Error mapping student row:', err);
          }
        }
        if (mapped.length > 0) {
          siswaStore = mapped;
          return [...mapped];
        }
      }
    }
  }

  // Fallback melalui endpoint server `/api/students` (jika Service Role Key tersedia di server)
  try {
    const session = getSession();
    const headers: Record<string, string> = {};
    if (session?.token) {
      headers['Authorization'] = `Bearer ${session.token}`;
    }
    const res = await fetch('/api/students', { headers });
    const parsed = await safeParseJsonResponse<{ students?: Record<string, unknown>[] }>(res);
    if (parsed.isJson && res.ok && Array.isArray(parsed.data?.students) && parsed.data.students.length > 0) {
      const mapped: Siswa[] = [];
      for (const row of parsed.data.students) {
        try {
          mapped.push(mapDbRowToSiswa(row));
        } catch {
          // Ignore malformed row
        }
      }
      if (mapped.length > 0) {
        siswaStore = mapped;
        return [...mapped];
      }
    }
  } catch {
    // Ignore fallback error on static hosting
  }

  return [...siswaStore];
}

export async function getSiswaByNisn(nisn: string): Promise<Siswa | null> {
  const cleanNisn = nisn.trim().replace(/\D/g, '');
  if (isSupabaseConfigured) {
    await ensureSupabaseSessionReady();
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase
        .from('students')
        .select('*')
        .eq('nisn', cleanNisn)
        .maybeSingle();

      if (!error && data) {
        return mapDbRowToSiswa(data as Record<string, unknown>);
      }
    }
  }

  // Cek cache sesi login orang tua (untuk login menggunakan Tanggal Lahir)
  try {
    const cachedRaw = sessionStorage.getItem(PARENT_STUDENT_CACHE_KEY);
    if (cachedRaw) {
      const cachedObj = JSON.parse(cachedRaw) as Record<string, unknown>;
      if (String(cachedObj.nisn || '').trim() === cleanNisn) {
        return mapDbRowToSiswa(cachedObj);
      }
    }
  } catch {
    // Ignore
  }

  // Fallback melalui endpoint server `/api/students/by-nisn/:nisn`
  try {
    const session = getSession();
    const headers: Record<string, string> = {};
    if (session?.token) {
      headers['Authorization'] = `Bearer ${session.token}`;
    }
    const res = await fetch(`/api/students/by-nisn/${encodeURIComponent(cleanNisn)}`, { headers });
    const parsed = await safeParseJsonResponse<{ student?: Record<string, unknown> }>(res);
    if (parsed.isJson && res.ok && parsed.data?.student) {
      return mapDbRowToSiswa(parsed.data.student);
    }
  } catch {
    // Ignore
  }

  return siswaStore.find(s => s.nisn === cleanNisn) || null;
}

export async function getStudentClassHistory(studentId?: string): Promise<StudentClassHistoryRecord[]> {
  if (isSupabaseConfigured) {
    const supabase = getSupabase();
    if (supabase) {
      let query = supabase
        .from('student_class_history')
        .select('*')
        .order('created_at', { ascending: false });

      if (studentId) {
        query = query.eq('student_id', studentId);
      }

      const { data, error } = await query.limit(100);
      if (!error && data) {
        return data.map((row: Record<string, unknown>) => ({
          id: String(row.id),
          student_id: String(row.student_id),
          kelas: String(row.kelas || ''),
          tingkat_kelas: (row.tingkat_kelas === '8' ? '8' : row.tingkat_kelas === '9' ? '9' : '7') as '7' | '8' | '9',
          kamar: row.kamar ? String(row.kamar) : undefined,
          status_riwayat: (row.status_riwayat || 'aktif') as StudentClassHistoryRecord['status_riwayat'],
          tanggal_mulai: String(row.tanggal_mulai || ''),
          tanggal_selesai: row.tanggal_selesai ? String(row.tanggal_selesai) : undefined,
          catatan: row.catatan ? String(row.catatan) : undefined,
          created_at: String(row.created_at || new Date().toISOString())
        }));
      }
    }
  }

  if (studentId) return classHistoryStore.filter(c => c.student_id === studentId);
  return [...classHistoryStore];
}

async function tryServerStudentUpsert(
  id: string | undefined,
  dbPayload: Record<string, unknown>,
  upsertOnConflict: boolean
): Promise<{ student: Record<string, unknown>; action: 'inserted' | 'updated' } | null> {
  try {
    const session = getSession();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.token) {
      headers['Authorization'] = `Bearer ${session.token}`;
    }
    const res = await fetch('/api/students/upsert', {
      method: 'POST',
      headers,
      body: JSON.stringify({ id, dbPayload, upsertOnConflict })
    });
    const parsed = await safeParseJsonResponse<{
      student?: Record<string, unknown>;
      action?: 'inserted' | 'updated';
      error?: string;
    }>(res);
    if (parsed.isJson && res.ok && parsed.data?.student) {
      return {
        student: parsed.data.student,
        action: parsed.data.action || (id ? 'updated' : 'inserted')
      };
    }
  } catch {
    // Abaikan jika berada di static hosting tanpa server
  }
  return null;
}

export async function createSiswa(
  payload: Omit<Siswa, 'id' | 'created_at' | 'updated_at'>,
  actor: { id: string; name: string; role: string },
  importBatchId?: string,
  options?: {
    upsertOnConflict?: boolean;
    skipValidationQuery?: boolean;
    skipAuditLog?: boolean;
  }
): Promise<Siswa> {
  const upsertOnConflict = Boolean(options?.upsertOnConflict);

  if (!options?.skipValidationQuery && !upsertOnConflict) {
    await validateUniqueNisAndNisn(payload.nis, payload.nisn, undefined, payload.nik_siswa);
  }

  if (isSupabaseConfigured) {
    await ensureSupabaseSessionReady();
    const supabase = getSupabase();
    if (supabase) {
      const classId = await resolveOrCreateClassId(payload.rombel);
      const dbPayload = mapSiswaToDbPayload(payload, {
        class_id: classId,
        import_batch_id: importBatchId || null
      });

      // Jika upsertOnConflict aktif, cek terlebih dahulu apabila NISN atau NIS sudah ada di database.
      // PENTING: Hanya lakukan update jika baris yang ditemukan di database adalah siswa yang SAMA (nama cocok).
      // Jika NISN/NIS tersebut milik siswa LAIN di kelas lain, kosongkan hanya kunci yang bentrok agar siswa baru tetap ter-insert tanpa menimpa siswa lain!
      if (upsertOnConflict) {
        const cleanNisn = dbPayload.nisn ? String(dbPayload.nisn).trim() : '';
        const cleanNis = dbPayload.nis ? String(dbPayload.nis).trim() : '';
        const incomingName = String(dbPayload.nama_lengkap_siswa || payload.nama_lengkap || '').trim();
        let existingId = '';

        if (cleanNisn) {
          const { data: r1 } = await supabase
            .from('students')
            .select('id, nama_lengkap_siswa')
            .eq('nisn', cleanNisn)
            .limit(1);
          if (r1?.[0]?.id) {
            if (isSameStudentIdentity(String(r1[0].nama_lengkap_siswa || ''), incomingName)) {
              existingId = String(r1[0].id);
            } else {
              dbPayload.nisn = null;
            }
          }
        }
        if (!existingId && cleanNis) {
          const { data: r2 } = await supabase
            .from('students')
            .select('id, nama_lengkap_siswa')
            .eq('nis', cleanNis)
            .limit(1);
          if (r2?.[0]?.id) {
            if (isSameStudentIdentity(String(r2[0].nama_lengkap_siswa || ''), incomingName)) {
              existingId = String(r2[0].id);
            } else {
              dbPayload.nis = null;
            }
          }
        }

        if (existingId) {
          return updateSiswa(
            existingId,
            {
              ...payload,
              nisn: dbPayload.nisn ? String(dbPayload.nisn) : '',
              nis: dbPayload.nis ? String(dbPayload.nis) : ''
            },
            actor,
            {
              skipValidationQuery: true,
              skipAuditLog: options?.skipAuditLog,
              ignoreSecondaryKeyConflict: true
            }
          );
        }
      }

      let { data, error } = await supabase
        .from('students')
        .insert([dbPayload])
        .select('*')
        .single();

      // Fallback otomatis jika database belum menjalankan migrasi lifecycle (kolom angkatan, tahun_ajaran_masuk, import_batch_id, dll.)
      if (
        error &&
        (error.message.includes('schema cache') ||
          error.message.includes('column') ||
          error.message.includes('angkatan') ||
          error.message.includes('tahun_ajaran_masuk') ||
          error.message.includes('import_batch_id'))
      ) {
        studentsHasLifecycleColumns = false;
        const legacyPayload = stripLegacyStudentColumns(dbPayload);
        const retryRes = await supabase
          .from('students')
          .insert([legacyPayload])
          .select('*')
          .single();
        data = retryRes.data;
        error = retryRes.error;
      }

      // Jika gagal insert karena duplikat NIS/NISN di database saat import upsert:
      // 1) Jika siswa dengan NISN/NIS tersebut adalah orang yang SAMA, perbarui barisnya.
      // 2) Jika siswa dengan NISN/NIS tersebut adalah orang yang BERBEDA, kosongkan hanya NISN/NIS yang bentrok lalu insert ulang sebagai siswa baru!
      if (
        error &&
        upsertOnConflict &&
        (error.message.includes('duplicate key') || error.message.includes('uq_students_'))
      ) {
        const cleanNisn = dbPayload.nisn ? String(dbPayload.nisn).trim() : '';
        const cleanNis = dbPayload.nis ? String(dbPayload.nis).trim() : '';
        const incomingName = String(dbPayload.nama_lengkap_siswa || payload.nama_lengkap || '').trim();
        let existingId = '';

        if (cleanNisn) {
          const { data: r1 } = await supabase
            .from('students')
            .select('id, nama_lengkap_siswa')
            .eq('nisn', cleanNisn)
            .limit(1);
          if (r1?.[0]?.id) {
            if (isSameStudentIdentity(String(r1[0].nama_lengkap_siswa || ''), incomingName)) {
              existingId = String(r1[0].id);
            } else {
              dbPayload.nisn = null;
            }
          }
        }
        if (!existingId && cleanNis) {
          const { data: r2 } = await supabase
            .from('students')
            .select('id, nama_lengkap_siswa')
            .eq('nis', cleanNis)
            .limit(1);
          if (r2?.[0]?.id) {
            if (isSameStudentIdentity(String(r2[0].nama_lengkap_siswa || ''), incomingName)) {
              existingId = String(r2[0].id);
            } else {
              dbPayload.nis = null;
            }
          }
        }

        if (existingId) {
          return updateSiswa(
            existingId,
            {
              ...payload,
              nisn: dbPayload.nisn ? String(dbPayload.nisn) : '',
              nis: dbPayload.nis ? String(dbPayload.nis) : ''
            },
            actor,
            {
              skipValidationQuery: true,
              skipAuditLog: options?.skipAuditLog,
              ignoreSecondaryKeyConflict: true
            }
          );
        }

        // Jika milik siswa berbeda, insert ulang dengan kunci bentrok yang telah dikosongkan
        if (error.message.includes('nisn_not_empty')) dbPayload.nisn = null;
        if (error.message.includes('nis_not_empty')) dbPayload.nis = null;
        const retryInsert = await supabase
          .from('students')
          .insert([studentsHasLifecycleColumns ? dbPayload : stripLegacyStudentColumns(dbPayload)])
          .select('*')
          .single();
        data = retryInsert.data;
        error = retryInsert.error;
      }

      // Fallback melalui server endpoint `/api/students/upsert` jika gagal karena sesi/RLS di browser
      if (error || !data) {
        const serverFallback = await tryServerStudentUpsert(undefined, dbPayload, upsertOnConflict);
        if (serverFallback?.student) {
          data = serverFallback.student;
          error = null;
        }
      }

      if (error || !data) {
        throw new Error(error?.message || 'Gagal menyimpan data siswa ke tabel students Supabase.');
      }

      const createdStudent = mapDbRowToSiswa(data as Record<string, unknown>);
      const existingIdx = siswaStore.findIndex(s => s.id === createdStudent.id);
      if (existingIdx >= 0) {
        siswaStore[existingIdx] = createdStudent;
      } else {
        siswaStore.unshift(createdStudent);
      }

      if (!options?.skipAuditLog) {
        recordAuditLog({
          user_id: actor.id,
          user_name: actor.name,
          user_role: actor.role,
          user_type: 'admin',
          action: 'CREATE_STUDENT',
          target_type: 'students',
          target_id: createdStudent.nisn || createdStudent.id,
          new_values: dbPayload,
          details: `Menambahkan biodata siswa baru: ${createdStudent.nama_lengkap} (NISN: ${createdStudent.nisn}, Kelas: ${createdStudent.rombel}).`
        });
      }

      return createdStudent;
    }
  }

  const now = new Date().toISOString();
  const normKelas = normalizeKelasValue(payload.rombel, '7A');
  const newSiswa: Siswa = {
    ...payload,
    rombel: normKelas.rombel,
    tingkat_kelas: normKelas.tingkat,
    id: crypto.randomUUID ? crypto.randomUUID() : 'sis-' + Date.now(),
    created_at: now,
    updated_at: now
  };
  siswaStore.unshift(newSiswa);

  classHistoryStore.unshift({
    id: crypto.randomUUID ? crypto.randomUUID() : 'ch-' + Date.now(),
    student_id: newSiswa.id,
    kelas: newSiswa.rombel,
    tingkat_kelas: newSiswa.tingkat_kelas,
    kamar: newSiswa.kamar,
    status_riwayat: 'aktif',
    tanggal_mulai: newSiswa.tanggal_masuk || now.slice(0, 10),
    catatan: 'Penempatan kelas awal siswa terdaftar',
    created_at: now
  });

  if (!options?.skipAuditLog) {
    recordAuditLog({
      user_id: actor.id,
      user_name: actor.name,
      user_role: actor.role,
      user_type: 'admin',
      action: 'CREATE_STUDENT',
      target_type: 'students',
      target_id: newSiswa.nisn,
      details: `Menambahkan biodata siswa baru: ${newSiswa.nama_lengkap} (NISN: ${newSiswa.nisn}).`
    });
  }

  return newSiswa;
}

export async function updateSiswa(
  id: string,
  payload: Partial<Siswa>,
  actor: { id: string; name: string; role: string },
  options?: {
    skipValidationQuery?: boolean;
    skipAuditLog?: boolean;
    ignoreSecondaryKeyConflict?: boolean;
  }
): Promise<Siswa> {
  if (
    !options?.skipValidationQuery &&
    !options?.ignoreSecondaryKeyConflict &&
    (payload.nis !== undefined || payload.nisn !== undefined)
  ) {
    await validateUniqueNisAndNisn(payload.nis, payload.nisn, id);
  }

  if (isSupabaseConfigured) {
    await ensureSupabaseSessionReady();
    const supabase = getSupabase();
    if (supabase) {
      const classId = payload.rombel ? await resolveOrCreateClassId(payload.rombel) : undefined;
      const dbPayload = mapSiswaToDbPayload(payload, { class_id: classId });

      let { data, error } = await supabase
        .from('students')
        .update(dbPayload)
        .eq('id', id)
        .select('*')
        .single();

      if (
        error &&
        (error.message.includes('schema cache') ||
          error.message.includes('column') ||
          error.message.includes('angkatan') ||
          error.message.includes('tahun_ajaran_masuk') ||
          error.message.includes('import_batch_id'))
      ) {
        studentsHasLifecycleColumns = false;
        const legacyPayload = stripLegacyStudentColumns(dbPayload);
        const retryRes = await supabase
          .from('students')
          .update(legacyPayload)
          .eq('id', id)
          .select('*')
          .single();
        data = retryRes.data;
        error = retryRes.error;
      }

      // Jika terjadi bentrok unik pada kolom sekunder saat import (mis. NIS bentrok ketika update berdasarkan NISN)
      if (
        error &&
        options?.ignoreSecondaryKeyConflict &&
        (error.message.includes('duplicate key') || error.message.includes('uq_students_'))
      ) {
        const safePayload =
          studentsHasLifecycleColumns === false ? stripLegacyStudentColumns(dbPayload) : { ...dbPayload };
        if (error.message.includes('nis_not_empty')) {
          delete safePayload.nis;
        }
        if (error.message.includes('nisn_not_empty')) {
          delete safePayload.nisn;
        }
        const retrySafe = await supabase
          .from('students')
          .update(safePayload)
          .eq('id', id)
          .select('*')
          .single();
        data = retrySafe.data;
        error = retrySafe.error;
      }

      if (error || !data) {
        const serverFallback = await tryServerStudentUpsert(id, dbPayload, true);
        if (serverFallback?.student) {
          data = serverFallback.student;
          error = null;
        }
      }

      if (error || !data) {
        throw new Error(error?.message || 'Gagal memperbarui biodata siswa di Supabase.');
      }

      const updatedStudent = mapDbRowToSiswa(data as Record<string, unknown>);
      const storeIdx = siswaStore.findIndex(s => s.id === updatedStudent.id);
      if (storeIdx >= 0) {
        siswaStore[storeIdx] = updatedStudent;
      } else {
        siswaStore.unshift(updatedStudent);
      }

      if (!options?.skipAuditLog) {
        recordAuditLog({
          user_id: actor.id,
          user_name: actor.name,
          user_role: actor.role,
          user_type: 'admin',
          action: 'UPDATE_STUDENT',
          target_type: 'students',
          target_id: updatedStudent.nisn || updatedStudent.id,
          new_values: dbPayload,
          details: `Memperbarui biodata siswa: ${updatedStudent.nama_lengkap} (NISN: ${updatedStudent.nisn}).`
        });
      }

      return updatedStudent;
    }
  }

  const index = siswaStore.findIndex(s => s.id === id);
  if (index === -1) throw new Error('Data siswa tidak ditemukan.');

  const updated: Siswa = {
    ...siswaStore[index],
    ...payload,
    updated_at: new Date().toISOString()
  };
  siswaStore[index] = updated;

  recordAuditLog({
    user_id: actor.id,
    user_name: actor.name,
    user_role: actor.role,
    user_type: 'admin',
    action: 'UPDATE_STUDENT',
    target_type: 'students',
    target_id: updated.nisn,
    details: `Memperbarui biodata siswa: ${updated.nama_lengkap} (NISN: ${updated.nisn}).`
  });

  return updated;
}

export async function archiveSiswa(
  id: string,
  actor: { id: string; name: string; role: string }
): Promise<Siswa> {
  const updated = await updateSiswa(id, { status: 'non_aktif' }, actor);
  recordAuditLog({
    user_id: actor.id,
    user_name: actor.name,
    user_role: actor.role,
    user_type: 'admin',
    action: 'ARCHIVE_STUDENT',
    target_type: 'students',
    target_id: updated.nisn || updated.id,
    details: `Mengarsipkan data siswa (status Non-Aktif): ${updated.nama_lengkap} (NISN: ${updated.nisn}).`
  });
  return updated;
}

export async function deleteSiswa(
  id: string,
  actor: { id: string; name: string; role: string }
): Promise<void> {
  if (isSupabaseConfigured) {
    const supabase = getSupabase();
    if (supabase) {
      const { data: studentRow } = await supabase
        .from('students')
        .select('id, nama_lengkap_siswa, nisn, status_aktif')
        .eq('id', id)
        .maybeSingle();

      if (studentRow && studentRow.status_aktif === 'mutasi_keluar') {
        throw new Error(
          'Siswa yang sudah mutasi keluar tidak boleh dihapus dari Buku Induk. Gunakan fitur Arsip jika diperlukan.'
        );
      }

      const { data: keluarMutation } = await supabase
        .from('student_mutations')
        .select('id')
        .eq('student_id', id)
        .eq('jenis_mutasi', 'keluar')
        .maybeSingle();

      if (keluarMutation) {
        throw new Error(
          'Siswa ini memiliki catatan Mutasi Keluar resmi dan tidak boleh dihapus dari database.'
        );
      }

      const { error } = await supabase.from('students').delete().eq('id', id);
      if (error) {
        throw new Error(error.message || 'Gagal menghapus data siswa dari Supabase.');
      }
      recordAuditLog({
        user_id: actor.id,
        user_name: actor.name,
        user_role: actor.role,
        user_type: 'admin',
        action: 'DELETE_STUDENT',
        target_type: 'students',
        target_id: id,
        details: `Menghapus data siswa (${String(studentRow?.nama_lengkap_siswa || id)}) dari tabel students.`
      });
      return;
    }
  }

  const siswa = siswaStore.find(s => s.id === id);
  if (!siswa) throw new Error('Data siswa tidak ditemukan.');

  if (
    siswa.status === 'mutasi_keluar' ||
    mutasiStore.some(m => (m.siswa_id === id || m.nisn === siswa.nisn) && m.jenis === 'keluar')
  ) {
    throw new Error('Siswa yang sudah mutasi keluar tidak boleh dihapus dari Buku Induk.');
  }

  siswaStore = siswaStore.filter(s => s.id !== id);
  parentAccountsStore = parentAccountsStore.filter(p => p.nisn !== siswa.nisn);

  recordAuditLog({
    user_id: actor.id,
    user_name: actor.name,
    user_role: actor.role,
    user_type: 'admin',
    action: 'DELETE_STUDENT',
    target_type: 'students',
    target_id: siswa.nisn,
    details: `Menghapus data siswa: ${siswa.nama_lengkap} (NISN: ${siswa.nisn}).`
  });
}

// ============================================================================
// IMPORT BATCHES SERVICE (`public.import_batches`)
// ============================================================================

export async function createImportBatch(params: {
  file_name: string;
  import_mode?: ImportMode;
  total_rows: number;
  success_rows: number;
  failed_rows: number;
  error_details?: { row: number; nis?: string; nisn?: string; nama?: string; errors: string[] }[];
}): Promise<string | undefined> {
  const status: ImportBatchRecord['status'] =
    params.failed_rows === 0
      ? 'completed'
      : params.success_rows > 0
      ? 'partial'
      : 'failed';

  const now = new Date().toISOString();

  if (isSupabaseConfigured) {
    const supabase = getSupabase();
    if (supabase) {
      const { data } = await supabase
        .from('import_batches')
        .insert({
          file_name: params.file_name,
          total_rows: params.total_rows,
          success_rows: params.success_rows,
          failed_rows: params.failed_rows,
          status,
          error_details: params.error_details || [],
          completed_at: now
        })
        .select('id')
        .maybeSingle();

      if (data?.id) return String(data.id);
    }
  }

  const localBatch: ImportBatchRecord = {
    id: crypto.randomUUID ? crypto.randomUUID() : 'imp-' + Date.now(),
    file_name: params.file_name,
    import_mode: params.import_mode || 'insert_only',
    total_rows: params.total_rows,
    success_rows: params.success_rows,
    failed_rows: params.failed_rows,
    status,
    error_details: params.error_details || [],
    created_at: now,
    completed_at: now
  };
  importBatchesStore.unshift(localBatch);
  return localBatch.id;
}

const IMPORT_BATCHES_BACKUP_KEY = 'sipds_import_batches_backup_v1';

function mapDbImportBatchRow(row: Record<string, unknown>): ImportBatchRecord {
  const fileName = String(row.file_name || 'Import_Excel.xlsx');
  const rawCat = row.import_category ? String(row.import_category) : '';
  const inferredCategory: ImportCategory =
    rawCat === 'siswa_baru' ||
    rawCat === 'mutasi_masuk' ||
    rawCat === 'mutasi_keluar' ||
    rawCat === 'pembaruan_data' ||
    rawCat === 'riwayat_kelas'
      ? rawCat
      : /mutasi.*masuk|^masuk$/i.test(fileName)
      ? 'mutasi_masuk'
      : /mutasi.*keluar|^keluar$/i.test(fileName)
      ? 'mutasi_keluar'
      : 'siswa_baru';

  return {
    id: String(row.id),
    file_name: fileName,
    import_mode: (row.import_mode as ImportMode) || 'insert_only',
    import_category: inferredCategory,
    tahun_ajaran: row.tahun_ajaran ? String(row.tahun_ajaran) : undefined,
    angkatan: row.angkatan ? String(row.angkatan) : undefined,
    total_rows: Number(row.total_rows || 0),
    success_rows: Number(row.success_rows || 0),
    failed_rows: Number(row.failed_rows || 0),
    duplicate_rows: Number(row.duplicate_rows || 0),
    review_rows: Number(row.review_rows || 0),
    status: (row.status || 'completed') as ImportBatchRecord['status'],
    error_details: Array.isArray(row.error_details)
      ? (row.error_details as ImportBatchRecord['error_details'])
      : [],
    created_at: String(row.created_at || new Date().toISOString()),
    completed_at: row.completed_at ? String(row.completed_at) : undefined
  };
}

function saveImportBatchesBackup(batches: ImportBatchRecord[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(IMPORT_BATCHES_BACKUP_KEY, JSON.stringify(batches.slice(0, 100)));
  } catch {
    // ignore storage quota errors
  }
}

function loadImportBatchesBackup(): ImportBatchRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(IMPORT_BATCHES_BACKUP_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(r => mapDbImportBatchRow(r as Record<string, unknown>)) : [];
  } catch {
    return [];
  }
}

export async function getImportBatches(): Promise<ImportBatchRecord[]> {
  let fetched: ImportBatchRecord[] = [];

  if (isSupabaseConfigured) {
    await ensureSupabaseSessionReady();
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase
        .from('import_batches')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (!error && data && data.length > 0) {
        fetched = data.map((row: Record<string, unknown>) => mapDbImportBatchRow(row));
      }
    }

    // Fallback ke endpoint server /api/import-batches apabila query langsung tertahan RLS / JWT expired
    if (fetched.length === 0) {
      try {
        const session = getSession();
        const headers: Record<string, string> = {};
        if (session?.token) {
          headers['Authorization'] = `Bearer ${session.token}`;
        }
        const res = await fetch('/api/import-batches', { headers });
        const parsed = await safeParseJsonResponse<{ batches?: Record<string, unknown>[] }>(res);
        if (
          res.ok &&
          parsed.isJson &&
          parsed.data?.batches &&
          Array.isArray(parsed.data.batches) &&
          parsed.data.batches.length > 0
        ) {
          fetched = parsed.data.batches.map(row => mapDbImportBatchRow(row));
        }
      } catch {
        // Abaikan jika server sedang offline
      }
    }
  }

  // Gabungkan dengan importBatchesStore memori dan backup localStorage agar tidak pernah hilang
  const backup = loadImportBatchesBackup();
  const mergedMap = new Map<string, ImportBatchRecord>();
  for (const item of [...fetched, ...importBatchesStore, ...backup]) {
    if (item && item.id && !mergedMap.has(item.id)) {
      mergedMap.set(item.id, item);
    }
  }

  const finalBatches = Array.from(mergedMap.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  if (finalBatches.length > 0) {
    importBatchesStore.splice(0, importBatchesStore.length, ...finalBatches);
    saveImportBatchesBackup(finalBatches);
  }

  return finalBatches;
}

export interface BatchImportExecutionResult {
  batchId?: string;
  totalProcessed: number;
  insertedCount: number;
  updatedCount: number;
  failedRows: { row: number; nis?: string; nisn?: string; nama?: string; errors: string[] }[];
}

export async function processBatchStudentImport(params: {
  rows: { rowNumber: number; data: Partial<Siswa>; isValid: boolean; errors: string[] }[];
  mode: ImportMode;
  fileName: string;
  actor: { id: string; name: string; role: string };
}): Promise<BatchImportExecutionResult> {
  const { rows, mode, fileName, actor } = params;
  const existingStudents = await getSiswaList();
  const byNis = new Map<string, Siswa>();
  const byNisn = new Map<string, Siswa>();

  existingStudents.forEach(s => {
    if (s.nis) byNis.set(s.nis.trim(), s);
    if (s.nisn) byNisn.set(s.nisn.trim(), s);
  });

  let insertedCount = 0;
  let updatedCount = 0;
  const failedRows: BatchImportExecutionResult['failedRows'] = [];

  for (const row of rows) {
    const nis = (row.data.nis || '').trim();
    const nisn = (row.data.nisn || '').trim();
    const nama = (row.data.nama_lengkap || '').trim();

    if (!row.isValid) {
      failedRows.push({
        row: row.rowNumber,
        nis,
        nisn,
        nama,
        errors: row.errors
      });
      continue;
    }

    try {
      const existingByNis = nis ? byNis.get(nis) : undefined;
      const existingByNisn = nisn ? byNisn.get(nisn) : undefined;

      if (mode === 'insert_only') {
        if (existingByNis) {
          throw new Error(`NIS ${nis} sudah terdaftar di database (${existingByNis.nama_lengkap}).`);
        }
        if (existingByNisn) {
          throw new Error(`NISN ${nisn} sudah terdaftar di database (${existingByNisn.nama_lengkap}).`);
        }
        const created = await createSiswa(
          row.data as Omit<Siswa, 'id' | 'created_at' | 'updated_at'>,
          actor
        );
        if (created.nis) byNis.set(created.nis, created);
        if (created.nisn) byNisn.set(created.nisn, created);
        insertedCount++;
      } else if (mode === 'update_by_nis') {
        if (!nis) {
          throw new Error('Mode Update Berdasarkan NIS mewajibkan kolom NIS terisi.');
        }
        if (!existingByNis) {
          throw new Error(`Siswa dengan NIS ${nis} tidak ditemukan di database untuk diupdate.`);
        }
        const updated = await updateSiswa(existingByNis.id, row.data, actor);
        byNis.set(updated.nis, updated);
        if (updated.nisn) byNisn.set(updated.nisn, updated);
        updatedCount++;
      } else {
        const targetExisting = existingByNis || existingByNisn;
        if (targetExisting) {
          const updated = await updateSiswa(targetExisting.id, row.data, actor);
          if (updated.nis) byNis.set(updated.nis, updated);
          if (updated.nisn) byNisn.set(updated.nisn, updated);
          updatedCount++;
        } else {
          const created = await createSiswa(
            row.data as Omit<Siswa, 'id' | 'created_at' | 'updated_at'>,
            actor
          );
          if (created.nis) byNis.set(created.nis, created);
          if (created.nisn) byNisn.set(created.nisn, created);
          insertedCount++;
        }
      }
    } catch (err: unknown) {
      failedRows.push({
        row: row.rowNumber,
        nis,
        nisn,
        nama,
        errors: [err instanceof Error ? err.message : 'Gagal memproses baris']
      });
    }
  }

  const batchId = await createImportBatch({
    file_name: fileName,
    import_mode: mode,
    total_rows: rows.length,
    success_rows: insertedCount + updatedCount,
    failed_rows: failedRows.length,
    error_details: failedRows
  });

  recordAuditLog({
    user_id: actor.id,
    user_name: actor.name,
    user_role: actor.role,
    user_type: 'admin',
    action: 'IMPORT_EXCEL_BATCH',
    target_type: 'import_batches',
    target_id: batchId,
    details: `Import Excel (${fileName}) mode ${mode}: ${insertedCount} ditambah, ${updatedCount} diperbarui, ${failedRows.length} gagal.`
  });

  return {
    batchId,
    totalProcessed: rows.length,
    insertedCount,
    updatedCount,
    failedRows
  };
}

// ============================================================================
// PARENT ACCOUNTS SERVICE (`public.parent_student_access` & `public.students`)
// ============================================================================

export async function getParentAccounts(): Promise<ParentAccountRecord[]> {
  if (isSupabaseConfigured) {
    const supabase = getSupabase();
    if (supabase) {
      const [allStudentRows, allAccessRows] = await Promise.all([
        fetchAllSupabaseRows(async (from, to) => {
          return supabase
            .from('students')
            .select(
              'id, nisn, nama_lengkap_siswa, kelas, tanggal_lahir, nama_wali, nama_ayah, no_hp_wali, no_wa_ayah'
            )
            .order('nama_lengkap_siswa', { ascending: true })
            .range(from, to);
        }),
        fetchAllSupabaseRows(async (from, to) => {
          return supabase
            .from('parent_student_access')
            .select('*')
            .range(from, to);
        })
      ]);

      if (allStudentRows.length > 0) {
        const accessByNisn = new Map<string, Record<string, unknown>>();
        allAccessRows.forEach((row: Record<string, unknown>) => {
          if (row.nisn) accessByNisn.set(String(row.nisn), row);
        });

        return allStudentRows
          .filter((s: Record<string, unknown>) => Boolean(s.nisn))
          .map((s: Record<string, unknown>) => {
            const nisn = String(s.nisn);
            const acc = accessByNisn.get(nisn);
            // Secara default, setiap siswa yang memiliki NISN & Tanggal Lahir aktif dan dapat langsung login
            // kecuali sengaja dinonaktifkan oleh admin (acc.is_active === false && acc.activated_at)
            const isExplicitlyDisabled = Boolean(
              acc && acc.is_active === false && acc.activated_at
            );
            return {
              id: acc ? String(acc.id) : `unlinked-${String(s.id)}`,
              siswa_id: String(s.id),
              nisn,
              nama_siswa: toUpperStudentName(s.nama_lengkap_siswa || ''),
              kelas: String(s.kelas || '').toUpperCase(),
              tanggal_lahir: s.tanggal_lahir ? String(s.tanggal_lahir) : undefined,
              nama_wali: toTitleCase(
                acc?.nama_wali || s.nama_wali || s.nama_ayah || 'Orang Tua / Wali'
              ),
              no_hp: String(acc?.no_hp_wali || s.no_hp_wali || s.no_wa_ayah || '-'),
              is_active: !isExplicitlyDisabled,
              activated_at: acc?.activated_at ? String(acc.activated_at) : undefined,
              last_login_at: acc?.last_login_at ? String(acc.last_login_at) : undefined
            };
          });
      }
    }
  }
  return [...parentAccountsStore];
}

export async function activateParentAccount(
  nisn: string,
  customPassword?: string,
  actor?: { id: string; name: string; role: string }
): Promise<{ message: string; temporary_password?: string }> {
  const cleanNisn = nisn.trim().replace(/\D/g, '');
  if (cleanNisn.length !== 10) {
    throw new Error('NISN wajib terdiri dari 10 digit angka.');
  }

  let passwordToSet = customPassword ? String(customPassword).trim() : '';
  if (passwordToSet && passwordToSet.includes(cleanNisn)) {
    throw new Error('Jangan menggunakan NISN sebagai password atau bagian dari password.');
  }

  // 1. Coba melalui endpoint server `/api/admin/parents/activate`
  try {
    const res = await fetch('/api/admin/parents/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nisn: cleanNisn, custom_password: passwordToSet })
    });

    const parsed = await safeParseJsonResponse<{ error?: string; message?: string }>(res);
    if (parsed.isJson && parsed.data && res.ok) {
      if (actor) {
        recordAuditLog({
          user_id: actor.id,
          user_name: actor.name,
          user_role: actor.role,
          user_type: 'admin',
          action: 'ACTIVATE_PARENT',
          target_type: 'parent_student_access',
          target_id: cleanNisn,
          details: `Aktivasi / reset password akun orang tua untuk NISN: ${cleanNisn}.`
        });
      }
      return {
        message: parsed.data.message || `Akun orang tua NISN ${cleanNisn} berhasil diaktifkan.`,
        temporary_password: passwordToSet || undefined
      };
    }

    if (parsed.isJson && parsed.data?.error && res.status !== 503) {
      throw new Error(parsed.data.error);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (msg && !msg.includes('Failed to fetch') && !msg.includes('SERVICE_ROLE_KEY')) {
      throw err;
    }
  }

  // 2. Fallback langsung ke Supabase (untuk deployment statis Netlify atau tanpa Service Role Key)
  const supabase = getSupabase();
  const isolatedAuth = createIsolatedSupabaseClient();
  if (isSupabaseConfigured && supabase && isolatedAuth) {
    const { data: student, error: studentErr } = await supabase
      .from('students')
      .select('id, nisn, nama_lengkap_siswa, tanggal_lahir, nama_wali, nama_ayah, no_hp_wali, no_wa_ayah')
      .eq('nisn', cleanNisn)
      .maybeSingle();

    if (studentErr || !student) {
      throw new Error(`Siswa dengan NISN ${cleanNisn} tidak ditemukan pada tabel students.`);
    }

    if (!passwordToSet) {
      passwordToSet = formatBirthDatePasswordDefault(student.tanggal_lahir) || '01-01-2012';
    }

    const internalEmail = `ortu.${cleanNisn}@auth-internal.smpbhinneka.sch.id`;
    const waliName =
      student.nama_wali && student.nama_wali !== '-'
        ? student.nama_wali
        : student.nama_ayah || `Orang Tua ${student.nama_lengkap_siswa}`;
    const waliPhone = student.no_hp_wali || student.no_wa_ayah || '';
    const nowIso = new Date().toISOString();

    const { data: signUpData, error: signUpErr } = await isolatedAuth.auth.signUp({
      email: internalEmail,
      password: passwordToSet,
      options: {
        data: {
          role: 'parent',
          student_id: student.id
        }
      }
    });

    if (signUpErr && !signUpErr.message.includes('already registered')) {
      throw new Error(signUpErr.message);
    }

    const authUserId = signUpData?.user?.id;
    if (authUserId) {
      await supabase.from('profiles').upsert({
        id: authUserId,
        email: internalEmail,
        username: cleanNisn,
        full_name: waliName,
        role: 'parent',
        phone: waliPhone,
        is_active: true
      });

      await supabase.from('parent_student_access').upsert(
        {
          user_id: authUserId,
          profile_id: authUserId,
          student_id: student.id,
          nisn: cleanNisn,
          nama_wali: waliName,
          no_hp_wali: waliPhone,
          is_active: true,
          activated_at: nowIso
        },
        { onConflict: 'nisn' }
      );
    } else {
      await supabase
        .from('parent_student_access')
        .update({ is_active: true, password_reset_at: nowIso })
        .eq('nisn', cleanNisn);
    }

    if (actor) {
      recordAuditLog({
        user_id: actor.id,
        user_name: actor.name,
        user_role: actor.role,
        user_type: 'admin',
        action: 'ACTIVATE_PARENT',
        target_type: 'parent_student_access',
        target_id: cleanNisn,
        details: `Aktivasi akun Supabase Auth orang tua untuk NISN: ${cleanNisn}.`
      });
    }

    return {
      message: `Akun orang tua untuk NISN ${cleanNisn} (${student.nama_lengkap_siswa}) berhasil diaktifkan.`,
      temporary_password: passwordToSet
    };
  }

  throw new Error('Gagal mengaktifkan akun orang tua. Pastikan koneksi Supabase sudah dikonfigurasi.');
}

export async function toggleParentAccountStatus(
  nisn: string,
  is_active: boolean,
  actor?: { id: string; name: string; role: string }
): Promise<void> {
  const cleanNisn = nisn.trim().replace(/\D/g, '');

  // 1. Jika Supabase client terhubung langsung, update langsung melalui RLS admin
  if (isSupabaseConfigured) {
    const supabase = getSupabase();
    if (supabase) {
      const { data: accessRecord, error: findErr } = await supabase
        .from('parent_student_access')
        .select('id, profile_id, nisn')
        .eq('nisn', cleanNisn)
        .maybeSingle();

      if (!findErr && accessRecord) {
        const activeBool = Boolean(is_active);
        await supabase
          .from('parent_student_access')
          .update({ is_active: activeBool })
          .eq('id', accessRecord.id);

        if (accessRecord.profile_id) {
          await supabase
            .from('profiles')
            .update({ is_active: activeBool })
            .eq('id', accessRecord.profile_id);
        }

        if (actor) {
          recordAuditLog({
            user_id: actor.id,
            user_name: actor.name,
            user_role: actor.role,
            user_type: 'admin',
            action: is_active ? 'ENABLE_PARENT' : 'DISABLE_PARENT',
            target_type: 'parent_student_access',
            target_id: cleanNisn,
            details: `${is_active ? 'Mengaktifkan' : 'Menonaktifkan'} akses login orang tua NISN: ${cleanNisn}.`
          });
        }
        return;
      }
    }
  }

  // 2. Fallback melalui endpoint backend
  const res = await fetch('/api/admin/parents/toggle-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nisn: cleanNisn, is_active })
  });

  const parsed = await safeParseJsonResponse<{ error?: string }>(res);
  if (!parsed.isJson || !res.ok) {
    throw new Error(parsed.data?.error || 'Gagal mengubah status akun orang tua.');
  }

  if (actor) {
    recordAuditLog({
      user_id: actor.id,
      user_name: actor.name,
      user_role: actor.role,
      user_type: 'admin',
      action: is_active ? 'ENABLE_PARENT' : 'DISABLE_PARENT',
      target_type: 'parent_student_access',
      target_id: cleanNisn,
      details: `${is_active ? 'Mengaktifkan' : 'Menonaktifkan'} akses login orang tua NISN: ${cleanNisn}.`
    });
  }
}

// ============================================================================
// STUDENT CHANGE REQUESTS (`public.student_change_requests` & `public.student_change_request_items`)
// Menggunakan Supabase RPC `rpc_review_student_change_request` yang aman & transaksional
// ============================================================================

async function fetchChangeRequestsFromSupabase(filterNisn?: string): Promise<PerubahanBiodata[] | null> {
  if (!isSupabaseConfigured) return null;
  await ensureSupabaseSessionReady();
  const supabase = getSupabase();
  if (!supabase) return null;

  let query = supabase
    .from('student_change_requests')
    .select('*, student_change_request_items(*), students(nis, nama_wali, nama_ayah, nama_ibu_kandung)')
    .order('submitted_at', { ascending: false });

  if (filterNisn) {
    query = query.eq('nisn', filterNisn);
  }

  const { data, error } = await query;
  if (error || !data) return null;

  return data.map((row: Record<string, unknown>) => {
    const items = Array.isArray(row.student_change_request_items)
      ? (row.student_change_request_items as Record<string, unknown>[])
      : [];

    const studentRel = (row.students as Record<string, unknown>) || {};

    const fieldsChanged: Record<string, ChangeFieldDetail> = {};
    items.forEach(item => {
      const fName = String(item.field_name || '');
      if (fName) {
        fieldsChanged[fName] = {
          old_value: String(item.old_value ?? '-'),
          new_value: String(item.new_value ?? '-'),
          label: String(item.field_label || fName),
          item_status: (item.item_status as ChangeItemStatus) || 'pending',
          rejection_reason: item.rejection_reason ? String(item.rejection_reason) : undefined
        };
      }
    });

    const requesterName = String(
      row.requester_name ||
        studentRel.nama_wali ||
        studentRel.nama_ayah ||
        studentRel.nama_ibu_kandung ||
        `Orang Tua / Wali (${String(row.nisn || '')})`
    );

    return {
      id: String(row.id),
      siswa_id: String(row.student_id),
      nis: String(row.nis || studentRel.nis || ''),
      nisn: String(row.nisn || ''),
      nama_siswa: toUpperStudentName(row.nama_siswa || ''),
      kelas: String(row.kelas || ''),
      requester_name: requesterName,
      requester_relation: String(row.requester_relation || 'Orang Tua / Wali'),
      fields_changed: fieldsChanged,
      alasan: String(row.alasan_pengajuan || ''),
      dokumen_pendukung_nama: row.dokumen_pendukung_nama
        ? String(row.dokumen_pendukung_nama)
        : undefined,
      status: (row.status || 'pending') as ChangeRequestStatus,
      verifikator_name: row.reviewer_name ? String(row.reviewer_name) : undefined,
      catatan_verifikator: row.catatan_verifikator ? String(row.catatan_verifikator) : undefined,
      submitted_at: String(row.submitted_at || new Date().toISOString()),
      verified_at: row.reviewed_at ? String(row.reviewed_at) : undefined
    };
  });
}

export async function getPerubahanList(): Promise<PerubahanBiodata[]> {
  const fromDb = await fetchChangeRequestsFromSupabase();
  if (fromDb) return fromDb;
  return [...perubahanStore];
}

export async function getPerubahanByNisn(nisn: string): Promise<PerubahanBiodata[]> {
  const fromDb = await fetchChangeRequestsFromSupabase(nisn);
  if (fromDb) return fromDb;
  return perubahanStore.filter(p => p.nisn === nisn);
}

export async function submitPerubahan(
  proposal: Omit<PerubahanBiodata, 'id' | 'status' | 'submitted_at'>,
  initialStatus: 'draft' | 'pending' = 'pending'
): Promise<PerubahanBiodata> {
  if (isSupabaseConfigured) {
    const supabase = getSupabase();
    if (supabase) {
      const { data: userData } = await supabase.auth.getUser();
      const requestedBy = userData?.user?.id;

      if (requestedBy) {
        const { data: reqHeader, error: reqErr } = await supabase
          .from('student_change_requests')
          .insert({
            student_id: proposal.siswa_id,
            requested_by: requestedBy,
            requester_name: proposal.requester_name || null,
            requester_relation: proposal.requester_relation || 'Orang Tua / Wali',
            nis: proposal.nis || null,
            nisn: proposal.nisn,
            nama_siswa: proposal.nama_siswa,
            kelas: proposal.kelas,
            alasan_pengajuan: proposal.alasan,
            dokumen_pendukung_nama: proposal.dokumen_pendukung_nama || null,
            status: initialStatus
          })
          .select('*')
          .single();

        if (reqErr || !reqHeader) {
          throw new Error(reqErr?.message || 'Gagal menyimpan pengajuan perubahan biodata.');
        }

        const itemRows = Object.entries(proposal.fields_changed).map(([fieldName, val]) => ({
          change_request_id: reqHeader.id,
          field_name: fieldName,
          field_label: val.label,
          old_value: val.old_value,
          new_value: val.new_value,
          item_status: 'pending'
        }));

        if (itemRows.length > 0) {
          const { error: itemsErr } = await supabase
            .from('student_change_request_items')
            .insert(itemRows);
          if (itemsErr) throw new Error(itemsErr.message);
        }

        recordAuditLog({
          user_id: requestedBy,
          user_name: proposal.requester_name || proposal.nama_siswa,
          user_role: 'parent',
          user_type: 'parent',
          action: initialStatus === 'draft' ? 'SAVE_DRAFT_CHANGE_REQUEST' : 'SUBMIT_CHANGE_REQUEST',
          target_type: 'student_change_requests',
          target_id: String(reqHeader.id),
          details: `Orang tua ${initialStatus === 'draft' ? 'menyimpan draft' : 'mengirim pengajuan'} perubahan ${itemRows.length} kolom biodata untuk siswa ${proposal.nama_siswa} (NISN: ${proposal.nisn}).`
        });

        return {
          ...proposal,
          id: String(reqHeader.id),
          status: initialStatus,
          submitted_at: String(reqHeader.submitted_at)
        };
      }
    }
  }

  const newProposal: PerubahanBiodata = {
    ...proposal,
    id: crypto.randomUUID ? crypto.randomUUID() : 'prb-' + Date.now(),
    status: initialStatus,
    submitted_at: new Date().toISOString()
  };
  perubahanStore.unshift(newProposal);
  return newProposal;
}

export async function submitDraftPerubahan(id: string): Promise<void> {
  if (isSupabaseConfigured) {
    const supabase = getSupabase();
    if (supabase) {
      const { error } = await supabase
        .from('student_change_requests')
        .update({
          status: 'pending',
          submitted_at: new Date().toISOString()
        })
        .eq('id', id)
        .eq('status', 'draft');

      if (error) throw new Error(error.message || 'Gagal mengirim draft pengajuan.');
      return;
    }
  }

  const local = perubahanStore.find(p => p.id === id);
  if (local && local.status === 'draft') {
    local.status = 'pending';
    local.submitted_at = new Date().toISOString();
  }
}

export async function cancelPerubahan(id: string, nisn: string): Promise<void> {
  if (isSupabaseConfigured) {
    const supabase = getSupabase();
    if (supabase) {
      const { error } = await supabase
        .from('student_change_requests')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .in('status', ['draft', 'pending']);

      if (error) throw new Error(error.message || 'Gagal membatalkan pengajuan.');

      recordAuditLog({
        user_id: nisn,
        user_name: `Wali Siswa (${nisn})`,
        user_role: 'parent',
        user_type: 'parent',
        action: 'CANCEL_CHANGE_REQUEST',
        target_type: 'student_change_requests',
        target_id: id,
        details: `Orang tua membatalkan pengajuan perubahan biodata ID ${id}.`
      });
      return;
    }
  }

  const local = perubahanStore.find(p => p.id === id);
  if (local && (local.status === 'draft' || local.status === 'pending')) {
    local.status = 'cancelled';
  }
}

export interface ItemReviewDecision {
  status: 'approved' | 'rejected';
  reason?: string;
}

/**
 * Verifikasi granular per item oleh Admin melalui Supabase RPC `rpc_review_student_change_request`
 * yang aman & transaksional:
 * - Memvalidasi role admin (orang tua & viewer dilarang menyetujui)
 * - Mencegah persetujuan ganda (wajib status 'pending')
 * - Memeriksa nilai lama sebelum update untuk mencegah data terbaru tertimpa
 * - Hanya kolom 'approved' yang memperbarui tabel `students`
 * - Mencatat nilai sebelum (`old_values`) dan sesudah (`new_values`) dalam `audit_logs`
 */
export async function reviewPerubahanItems(
  id: string,
  verifikator: { id: string; name: string; role: string },
  itemDecisions: Record<string, 'approved' | 'rejected' | ItemReviewDecision>,
  catatan?: string,
  forceOverride: boolean = false
): Promise<ChangeRequestStatus> {
  if (!['super_admin', 'admin', 'operator'].includes(verifikator.role)) {
    throw new Error(
      'AKSES DITOLAK: Hanya Admin / Operator berwenang yang dapat menyetujui atau menolak perubahan biodata.'
    );
  }

  const normalizedDecisions: Record<string, ItemReviewDecision> = {};
  for (const [k, val] of Object.entries(itemDecisions)) {
    if (typeof val === 'string') {
      normalizedDecisions[k] = { status: val };
    } else {
      normalizedDecisions[k] = val;
    }
  }

  // 1. Utamakan pemanggilan Supabase RPC transaksional `rpc_review_student_change_request`
  if (isSupabaseConfigured) {
    const supabase = getSupabase();
    if (supabase) {
      const { data: rpcResult, error: rpcError } = await supabase.rpc(
        'rpc_review_student_change_request',
        {
          p_request_id: id,
          p_item_decisions: normalizedDecisions,
          p_reviewer_note: catatan || null,
          p_force_override: forceOverride
        }
      );

      if (!rpcError && rpcResult) {
        const resObj = rpcResult as Record<string, unknown>;
        return (resObj.status || 'approved') as ChangeRequestStatus;
      }

      // Jika RPC mengembalikan error validasi bisnis (konflik data, persetujuan ganda, akses ditolak), lemparkan langsung
      if (
        rpcError &&
        (rpcError.message.includes('KONFLIK DATA TERBARU') ||
          rpcError.message.includes('CEGAH PERSETUJUAN GANDA') ||
          rpcError.message.includes('AKSES DITOLAK') ||
          rpcError.message.includes('VALIDASI KEPEMILIKAN'))
      ) {
        throw new Error(rpcError.message);
      }
    }
  }

  // 2. Fallback transaksional apabila RPC belum terpasang di instance Supabase
  const allRequests = await getPerubahanList();
  const proposal = allRequests.find(p => p.id === id);
  if (!proposal) throw new Error('Pengajuan perubahan data tidak ditemukan.');

  if (proposal.status !== 'pending') {
    throw new Error(
      `CEGAH PERSETUJUAN GANDA: Pengajuan ini sudah diverifikasi sebelumnya dengan status "${proposal.status}".`
    );
  }

  const allStudents = await getSiswaList();
  const currentStudent = allStudents.find(
    s => s.id === proposal.siswa_id || s.nisn === proposal.nisn
  );
  if (!currentStudent) {
    throw new Error('Data siswa pemilik pengajuan ini tidak ditemukan di tabel students.');
  }

  const fieldKeys = Object.keys(proposal.fields_changed);
  const approvedFields: Partial<Siswa> = {};
  const oldValuesAudit: Record<string, unknown> = {};
  const newValuesAudit: Record<string, unknown> = {};
  let approvedCount = 0;
  let rejectedCount = 0;

  for (const key of fieldKeys) {
    const dec = normalizedDecisions[key] || { status: 'approved' };
    const item = proposal.fields_changed[key];
    const currentVal = String((currentStudent as unknown as Record<string, unknown>)[key] ?? '').trim() || '-';
    const expectedOldVal = String(item.old_value ?? '').trim() || '-';

    if (dec.status === 'approved') {
      // Periksa nilai lama sebelum update untuk mencegah data terbaru tertimpa
      if (!forceOverride && currentVal !== expectedOldVal) {
        throw new Error(
          `KONFLIK DATA TERBARU pada kolom "${item.label}": Nilai saat ini di database ("${currentVal}") berbeda dengan nilai lama saat diajukan ("${expectedOldVal}"). Centang opsi konfirmasi penimpaan jika tetap ingin menyetujui kolom ini.`
        );
      }
      approvedCount++;
      (approvedFields as Record<string, unknown>)[key] = item.new_value;
      oldValuesAudit[key] = currentVal;
      newValuesAudit[key] = item.new_value;
    } else {
      rejectedCount++;
    }
  }

  const finalStatus: ChangeRequestStatus =
    approvedCount > 0 && rejectedCount === 0
      ? 'approved'
      : approvedCount === 0
      ? 'rejected'
      : 'partially_approved';

  if (approvedCount > 0) {
    await updateSiswa(currentStudent.id, approvedFields, verifikator);
  }

  const defaultNote =
    finalStatus === 'approved'
      ? 'Seluruh pengajuan perbaikan data disetujui sesuai dokumen pendukung.'
      : finalStatus === 'partially_approved'
      ? `Disetujui sebagian (${approvedCount} kolom disetujui, ${rejectedCount} kolom ditolak).`
      : 'Pengajuan perubahan data ditolak.';

  if (isSupabaseConfigured) {
    const supabase = getSupabase();
    if (supabase) {
      for (const key of fieldKeys) {
        const dec = normalizedDecisions[key] || { status: 'approved' };
        await supabase
          .from('student_change_request_items')
          .update({
            item_status: dec.status,
            rejection_reason: dec.reason || null
          })
          .eq('change_request_id', id)
          .eq('field_name', key);
      }

      const { error } = await supabase
        .from('student_change_requests')
        .update({
          status: finalStatus,
          reviewer_name: verifikator.name,
          catatan_verifikator: catatan || defaultNote,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', id)
        .eq('status', 'pending');

      if (error) throw new Error(error.message);

      recordAuditLog({
        user_id: verifikator.id,
        user_name: verifikator.name,
        user_role: verifikator.role,
        user_type: 'admin',
        action: `VERIFY_CHANGE_REQUEST_${finalStatus.toUpperCase()}`,
        target_type: 'student_change_requests',
        target_id: id,
        old_values: oldValuesAudit,
        new_values: newValuesAudit,
        details: `Verifikasi pengajuan biodata ${proposal.nama_siswa} (NISN: ${proposal.nisn}): status ${finalStatus} (${approvedCount} disetujui, ${rejectedCount} ditolak). Catatan: ${catatan || defaultNote}`
      });

      return finalStatus;
    }
  }

  const local = perubahanStore.find(p => p.id === id);
  if (local) {
    local.status = finalStatus;
    local.verifikator_name = verifikator.name;
    local.catatan_verifikator = catatan || defaultNote;
    local.verified_at = new Date().toISOString();
    for (const key of fieldKeys) {
      if (local.fields_changed[key]) {
        const dec = normalizedDecisions[key] || { status: 'approved' };
        local.fields_changed[key].item_status = dec.status;
        local.fields_changed[key].rejection_reason = dec.reason;
      }
    }
  }

  recordAuditLog({
    user_id: verifikator.id,
    user_name: verifikator.name,
    user_role: verifikator.role,
    user_type: 'admin',
    action: `VERIFY_CHANGE_REQUEST_${finalStatus.toUpperCase()}`,
    target_type: 'student_change_requests',
    target_id: id,
    old_values: oldValuesAudit,
    new_values: newValuesAudit,
    details: `Verifikasi pengajuan biodata ${proposal.nama_siswa} (NISN: ${proposal.nisn}): status ${finalStatus} (${approvedCount} disetujui, ${rejectedCount} ditolak).`
  });

  return finalStatus;
}

export async function approvePerubahan(
  id: string,
  verifikator: { id: string; name: string; role: string },
  catatan?: string
): Promise<void> {
  const allRequests = await getPerubahanList();
  const proposal = allRequests.find(p => p.id === id);
  if (!proposal) throw new Error('Pengajuan perubahan data tidak ditemukan.');

  const allApproved: Record<string, ItemReviewDecision> = {};
  Object.keys(proposal.fields_changed).forEach(k => {
    allApproved[k] = { status: 'approved' };
  });

  await reviewPerubahanItems(id, verifikator, allApproved, catatan);
}

export async function rejectPerubahan(
  id: string,
  verifikator: { id: string; name: string; role: string },
  catatan: string
): Promise<void> {
  const allRequests = await getPerubahanList();
  const proposal = allRequests.find(p => p.id === id);
  if (!proposal) throw new Error('Pengajuan perubahan data tidak ditemukan.');

  const allRejected: Record<string, ItemReviewDecision> = {};
  Object.keys(proposal.fields_changed).forEach(k => {
    allRejected[k] = { status: 'rejected', reason: catatan };
  });

  await reviewPerubahanItems(id, verifikator, allRejected, catatan);
}

// ============================================================================
// STUDENT MUTATIONS (`public.student_mutations` & SUPABASE RPCs)
// ============================================================================

function mapDbMutationRowToMutasi(row: Record<string, unknown>): Mutasi {
  const rawJenis = String(row.jenis_mutasi || row.jenis || 'masuk')
    .trim()
    .toLowerCase();
  const jenis: 'masuk' | 'keluar' =
    rawJenis.includes('keluar') || rawJenis === 'pindah' ? 'keluar' : 'masuk';

  const ta = row.tahun_ajaran ? String(row.tahun_ajaran) : '2025/2026';

  const dateCandidates = [
    row.tanggal_pindah,
    row['Tanggal Pindah'],
    row['TANGGAL PINDAH'],
    row.tgl_pindah,
    row.tanggal_mutasi,
    row['Tanggal Mutasi'],
    row.tanggal_masuk,
    row.tanggal_keluar,
    row.tmt
  ];

  let normalizedTanggal = '';
  for (const cand of dateCandidates) {
    if (!cand) continue;
    const norm = normalizeExcelDate(cand, ta);
    if (norm && norm !== '2026-11-08') {
      normalizedTanggal = norm;
      break;
    }
    if (norm && !normalizedTanggal) {
      normalizedTanggal = norm;
    }
  }

  // Jika tanggal masih kosong atau masih berupa tanggal fallback upload 2026-11-08, cek apakah ada tanggal tertanam pada keterangan/alasan/no_surat
  if (!normalizedTanggal || normalizedTanggal === '2026-11-08') {
    for (const textField of [row.keterangan, row.alasan_pindah, row.alasan, row.no_surat_mutasi]) {
      if (!textField) continue;
      const extracted = normalizeExcelDate(textField, ta);
      if (extracted && extracted !== '2026-11-08') {
        normalizedTanggal = extracted;
        break;
      }
    }
  }

  if (!normalizedTanggal) {
    const rawFallback = String(row.tanggal_pindah || row.tanggal_mutasi || row.created_at || '').trim();
    normalizedTanggal =
      normalizeExcelDate(rawFallback, ta) ||
      rawFallback.slice(0, 10) ||
      new Date().toISOString().slice(0, 10);
  }

  // Pastikan tahun_ajaran selaras dengan tahun pada Tanggal Pindah asli (bukan tahun fallback)
  let resolvedTa = ta;
  if (normalizedTanggal && normalizedTanggal !== '2026-11-08') {
    const yr = parseInt(normalizedTanggal.slice(0, 4), 10);
    if (Number.isFinite(yr) && yr >= 2018 && yr <= 2035) {
      if (yr === 2025) resolvedTa = '2025/2026';
      else if (yr === 2026 && (!row.tahun_ajaran || String(row.tahun_ajaran).trim() === '')) {
        resolvedTa = '2026/2027';
      } else if (!row.tahun_ajaran) {
        resolvedTa = `${yr}/${yr + 1}`;
      }
    }
  }

  return {
    id: String(row.id || crypto.randomUUID()),
    siswa_id: row.student_id ? String(row.student_id) : row.siswa_id ? String(row.siswa_id) : undefined,
    kelas: String(row.kelas || ''),
    nis: String(row.nis || ''),
    nisn: String(row.nisn || ''),
    nama_siswa: toUpperStudentName(row.nama_lengkap_siswa || row.nama_siswa || ''),
    jenis,
    kategori_mutasi:
      (row.kategori_mutasi as MutationCategory) ||
      (jenis === 'masuk' ? 'Masuk Pindahan' : 'Pindah sekolah'),
    tanggal_mutasi: normalizedTanggal,
    tahun_ajaran: resolvedTa,
    alasan: row.alasan_pindah ? String(row.alasan_pindah) : row.alasan ? String(row.alasan) : undefined,
    sekolah_asal: row.sekolah_asal ? String(row.sekolah_asal) : undefined,
    sekolah_tujuan: row.sekolah_tujuan ? String(row.sekolah_tujuan) : undefined,
    npsn_sekolah: row.npsn_sekolah ? String(row.npsn_sekolah) : undefined,
    kecamatan_sekolah: row.kecamatan_sekolah ? String(row.kecamatan_sekolah) : undefined,
    kabupaten_sekolah: row.kabupaten_sekolah
      ? normalizeDaerahKotaKab(row.kabupaten_sekolah) || String(row.kabupaten_sekolah)
      : undefined,
    provinsi_sekolah: row.provinsi_sekolah ? String(row.provinsi_sekolah) : undefined,
    no_surat: row.no_surat_mutasi
      ? String(row.no_surat_mutasi)
      : row.no_surat
      ? String(row.no_surat)
      : undefined,
    keterangan: row.keterangan ? String(row.keterangan) : undefined,
    petugas_nama: row.petugas_nama ? String(row.petugas_nama) : undefined,
    previous_student_status: row.previous_student_status
      ? (String(row.previous_student_status) as Siswa['status'])
      : 'aktif',
    status: (row.status_mutasi === 'dibatalkan' || row.status === 'dibatalkan'
      ? 'dibatalkan'
      : row.status_mutasi === 'diproses' || row.status === 'diproses'
      ? 'diproses'
      : 'selesai') as 'diproses' | 'selesai' | 'dibatalkan',
    cancelled_at: row.cancelled_at ? String(row.cancelled_at) : undefined,
    cancelled_by_name: row.cancelled_by_name ? String(row.cancelled_by_name) : undefined,
    alasan_pembatalan: row.alasan_pembatalan ? String(row.alasan_pembatalan) : undefined,
    created_at: String(row.created_at || new Date().toISOString())
  };
}

/**
 * Menggabungkan catatan mutasi dari tabel `student_mutations` dengan siswa di `students`
 * yang berstatus `mutasi_masuk` atau `mutasi_keluar` namun belum tercatat di `student_mutations`,
 * sekaligus menyinkronkan Tanggal Pindah asli apabila salah satu tabel masih menyimpan tanggal upload 2026-11-08.
 */
function mergeMutationsWithStudentStatus(
  mutations: Mutasi[],
  studentsList: Siswa[]
): Mutasi[] {
  const studentById = new Map<string, Siswa>();
  const studentByNisn = new Map<string, Siswa>();
  const studentByNis = new Map<string, Siswa>();
  const studentByName = new Map<string, Siswa>();

  studentsList.forEach(s => {
    if (s.id) studentById.set(s.id, s);
    if (s.nisn && s.nisn.trim()) studentByNisn.set(s.nisn.trim(), s);
    if (s.nis && s.nis.trim()) studentByNis.set(s.nis.trim(), s);
    if (s.nama_lengkap && s.nama_lengkap.trim()) {
      studentByName.set(s.nama_lengkap.trim().toUpperCase(), s);
    }
  });

  // 1. Jika ada baris di mutations yang tanggal_mutasi-nya masih '2026-11-08' namun di students ada tanggal_masuk yang bukan '2026-11-08', gunakan tanggal asli
  const result = mutations.map(m => {
    const matchedStudent =
      (m.siswa_id ? studentById.get(m.siswa_id) : undefined) ||
      (m.nisn ? studentByNisn.get(m.nisn.trim()) : undefined) ||
      (m.nis ? studentByNis.get(m.nis.trim()) : undefined) ||
      (m.nama_siswa ? studentByName.get(m.nama_siswa.trim().toUpperCase()) : undefined);

    if (matchedStudent && (!m.tanggal_mutasi || m.tanggal_mutasi === '2026-11-08')) {
      const candidateStudentDate = normalizeExcelDate(
        matchedStudent.tanggal_masuk || matchedStudent.tanggal_lulus,
        m.tahun_ajaran
      );
      if (candidateStudentDate && candidateStudentDate !== '2026-11-08') {
        return {
          ...m,
          tanggal_mutasi: candidateStudentDate
        };
      }
    }
    return m;
  });

  const existingKeys = new Set<string>();
  result.forEach(m => {
    if (m.siswa_id) {
      existingKeys.add(`id:${m.siswa_id}:${m.jenis}`);
      existingKeys.add(`id:${m.siswa_id}`);
    }
    if (m.nisn && m.nisn.trim()) {
      existingKeys.add(`nisn:${m.nisn.trim()}:${m.jenis}`);
      existingKeys.add(`nisn:${m.nisn.trim()}`);
    }
    if (m.nis && m.nis.trim()) {
      existingKeys.add(`nis:${m.nis.trim()}:${m.jenis}`);
      existingKeys.add(`nis:${m.nis.trim()}`);
    }
    if (m.nama_siswa && m.nama_siswa.trim()) {
      const upperName = m.nama_siswa.trim().toUpperCase();
      existingKeys.add(`name:${upperName}:${m.jenis}`);
      existingKeys.add(`name:${upperName}`);
    }
  });

  studentsList.forEach(s => {
    if (s.status !== 'mutasi_masuk' && s.status !== 'mutasi_keluar') return;
    const jenis: 'masuk' | 'keluar' = s.status === 'mutasi_masuk' ? 'masuk' : 'keluar';
    const upperName = (s.nama_lengkap || '').trim().toUpperCase();

    const hasMatch =
      (s.id && (existingKeys.has(`id:${s.id}:${jenis}`) || existingKeys.has(`id:${s.id}`))) ||
      (s.nisn && (existingKeys.has(`nisn:${s.nisn.trim()}:${jenis}`) || existingKeys.has(`nisn:${s.nisn.trim()}`))) ||
      (s.nis && (existingKeys.has(`nis:${s.nis.trim()}:${jenis}`) || existingKeys.has(`nis:${s.nis.trim()}`))) ||
      (upperName && (existingKeys.has(`name:${upperName}:${jenis}`) || existingKeys.has(`name:${upperName}`))) ||
      result.some(m => m.jenis === jenis && isSameStudentIdentity(m.nama_siswa, s.nama_lengkap));

    if (hasMatch) return;

    const rawDate = s.tanggal_masuk || s.updated_at || s.created_at || new Date().toISOString().slice(0, 10);
    const tanggalMutasi = normalizeExcelDate(rawDate, s.tahun_ajaran_masuk) || rawDate.slice(0, 10);
    const yearNum = parseInt(tanggalMutasi.slice(0, 4), 10);
    const ta = s.tahun_ajaran_masuk || (Number.isFinite(yearNum) ? `${yearNum}/${yearNum + 1}` : '2025/2026');

    result.push({
      id: `syn-mut-${jenis}-${s.id}`,
      siswa_id: s.id,
      kelas: s.rombel || '7A',
      nis: s.nis || '',
      nisn: s.nisn || '',
      nama_siswa: toUpperStudentName(s.nama_lengkap),
      jenis,
      kategori_mutasi: jenis === 'masuk' ? 'Masuk Pindahan' : 'Pindah sekolah',
      tanggal_mutasi: tanggalMutasi,
      tahun_ajaran: ta,
      alasan: jenis === 'masuk' ? 'Mutasi Masuk Siswa Pindahan' : 'Mutasi Keluar Siswa',
      sekolah_asal: jenis === 'masuk' ? s.nama_asal_sekolah || undefined : undefined,
      npsn_sekolah: s.npsn_asal_sekolah || undefined,
      kecamatan_sekolah: s.kecamatan_asal_sekolah || undefined,
      kabupaten_sekolah: s.kabupaten_asal_sekolah || s.kab_kota || undefined,
      provinsi_sekolah: s.provinsi_asal_sekolah || s.provinsi || undefined,
      status: 'selesai',
      created_at: s.created_at || new Date().toISOString()
    });
  });

  return result;
}

/**
 * Memulihkan Tanggal Pindah dari tabel riwayat (`import_batch_rows`, `student_class_history`, `audit_logs`)
 * apabila ditemukan baris mutasi yang masih bertanggal fallback upload (`2026-11-08`).
 */
async function recoverFallbackMutationDates(mutations: Mutasi[]): Promise<Mutasi[]> {
  const needsRecovery = mutations.some(m => m.tanggal_mutasi === '2026-11-08');
  if (!needsRecovery || !isSupabaseConfigured) return mutations;

  const supabase = getSupabase();
  if (!supabase) return mutations;

  try {
    const recoveredByStudentKey = new Map<string, string>();
    const registerRecovered = (
      studentId?: unknown,
      nisn?: unknown,
      nis?: unknown,
      nama?: unknown,
      rawDate?: unknown,
      ta?: string
    ) => {
      if (!rawDate) return;
      const iso = normalizeExcelDate(rawDate, ta);
      if (!iso || iso === '2026-11-08') return;
      const yr = parseInt(iso.slice(0, 4), 10);
      if (yr < 2018 || yr > 2035) return;

      if (studentId) recoveredByStudentKey.set(`id:${String(studentId).trim()}`, iso);
      if (nisn && String(nisn).trim()) recoveredByStudentKey.set(`nisn:${String(nisn).trim()}`, iso);
      if (nis && String(nis).trim()) recoveredByStudentKey.set(`nis:${String(nis).trim()}`, iso);
      if (nama && String(nama).trim()) {
        recoveredByStudentKey.set(`name:${String(nama).trim().toUpperCase()}`, iso);
      }
    };

    // 1. Cek student_class_history (tanggal_mulai, tanggal_selesai, catatan)
    const { data: histRows } = await supabase
      .from('student_class_history')
      .select('student_id, tanggal_mulai, tanggal_selesai, catatan, status_riwayat')
      .limit(1000);
    if (Array.isArray(histRows)) {
      for (const h of histRows) {
        const rec = h as Record<string, unknown>;
        if (rec.tanggal_selesai && String(rec.tanggal_selesai) !== '2026-11-08') {
          registerRecovered(rec.student_id, null, null, null, rec.tanggal_selesai);
        }
        if (rec.status_riwayat === 'mutasi' && rec.tanggal_mulai && String(rec.tanggal_mulai) !== '2026-11-08') {
          registerRecovered(rec.student_id, null, null, null, rec.tanggal_mulai);
        }
        if (rec.catatan) {
          registerRecovered(rec.student_id, null, null, null, rec.catatan);
        }
      }
    }

    // 2. Cek import_batch_rows (raw_payload & diff_payload)
    const { data: batchRows } = await supabase
      .from('import_batch_rows')
      .select('student_id, nis, nisn, nama_siswa, raw_payload, diff_payload')
      .limit(1000);
    if (Array.isArray(batchRows)) {
      for (const b of batchRows) {
        const rec = b as Record<string, unknown>;
        const rawP = (rec.raw_payload || {}) as Record<string, unknown>;
        const diffP = (rec.diff_payload || {}) as Record<string, unknown>;
        for (const [k, v] of Object.entries(rawP)) {
          const lowK = k.toLowerCase();
          if (lowK.includes('pindah') || lowK.includes('mutasi') || lowK.includes('tanggal') || lowK.includes('tgl')) {
            if (!lowK.includes('lahir') && !lowK.includes('ijazah')) {
              registerRecovered(rec.student_id, rec.nisn, rec.nis, rec.nama_siswa, v);
            }
          }
        }
        for (const [k, v] of Object.entries(diffP)) {
          const lowK = k.toLowerCase();
          if (lowK.includes('pindah') || lowK.includes('mutasi') || lowK.includes('masuk')) {
            const newVal = typeof v === 'object' && v !== null ? (v as Record<string, unknown>).new_value : v;
            registerRecovered(rec.student_id, rec.nisn, rec.nis, rec.nama_siswa, newVal);
          }
        }
      }
    }

    // 3. Cek audit_logs (new_values & details)
    const { data: auditRows } = await supabase
      .from('audit_logs')
      .select('target_id, new_values, details')
      .in('target_table', ['student_mutations', 'students'])
      .limit(500);
    if (Array.isArray(auditRows)) {
      for (const a of auditRows) {
        const rec = a as Record<string, unknown>;
        const nv = (rec.new_values || {}) as Record<string, unknown>;
        const candDate = nv.tanggal_pindah || nv.tanggal_mutasi || nv.tanggal_masuk || nv.tanggal_keluar;
        if (candDate) {
          registerRecovered(
            nv.student_id || rec.target_id,
            nv.nisn,
            nv.nis,
            nv.nama_lengkap_siswa || nv.nama_siswa,
            candDate
          );
        }
      }
    }

    if (recoveredByStudentKey.size === 0) return mutations;

    const updatesToPersist: { id: string; tanggal_pindah: string }[] = [];
    const healed = mutations.map(m => {
      if (m.tanggal_mutasi !== '2026-11-08') return m;
      const foundDate =
        (m.siswa_id ? recoveredByStudentKey.get(`id:${m.siswa_id}`) : undefined) ||
        (m.nisn ? recoveredByStudentKey.get(`nisn:${m.nisn.trim()}`) : undefined) ||
        (m.nis ? recoveredByStudentKey.get(`nis:${m.nis.trim()}`) : undefined) ||
        (m.nama_siswa ? recoveredByStudentKey.get(`name:${m.nama_siswa.trim().toUpperCase()}`) : undefined);

      if (foundDate && foundDate !== '2026-11-08') {
        if (m.id && !m.id.startsWith('syn-mut-')) {
          updatesToPersist.push({ id: m.id, tanggal_pindah: foundDate });
        }
        return {
          ...m,
          tanggal_mutasi: foundDate
        };
      }
      return m;
    });

    if (updatesToPersist.length > 0) {
      Promise.all(
        updatesToPersist.map(u =>
          supabase
            .from('student_mutations')
            .update({ tanggal_pindah: u.tanggal_pindah })
            .eq('id', u.id)
        )
      ).catch(() => {});
    }

    return healed;
  } catch {
    return mutations;
  }
}

export async function getMutasiList(jenis?: 'masuk' | 'keluar'): Promise<Mutasi[]> {
  let fetchedMutations: Mutasi[] = [];

  if (isSupabaseConfigured) {
    await ensureSupabaseSessionReady();
    const supabase = getSupabase();
    if (supabase) {
      let allRows = await fetchAllSupabaseRows(async (from, to) => {
        return supabase
          .from('student_mutations')
          .select('*')
          .order('tanggal_pindah', { ascending: false })
          .range(from, to);
      });

      if (allRows.length === 0) {
        allRows = await fetchAllSupabaseRows(async (from, to) => {
          return supabase.from('student_mutations').select('*').range(from, to);
        });
      }

      if (allRows.length > 0) {
        fetchedMutations = allRows.map(mapDbMutationRowToMutasi);
      }
    }

    // Fallback ke endpoint server /api/mutations apabila query langsung tertahan RLS / kosong
    if (fetchedMutations.length === 0) {
      try {
        const session = getSession();
        const headers: Record<string, string> = {};
        if (session?.token) {
          headers['Authorization'] = `Bearer ${session.token}`;
        }
        const res = await fetch('/api/mutations', { headers });
        const parsed = await safeParseJsonResponse<{ mutations?: Record<string, unknown>[] }>(res);
        if (
          res.ok &&
          parsed.isJson &&
          parsed.data?.mutations &&
          Array.isArray(parsed.data.mutations) &&
          parsed.data.mutations.length > 0
        ) {
          fetchedMutations = parsed.data.mutations.map(mapDbMutationRowToMutasi);
        }
      } catch {
        // Abaikan jika server sedang offline
      }
    }
  } else {
    fetchedMutations = [...mutasiStore];
  }

  // Pastikan siswa di siswaStore yang memiliki status 'mutasi_masuk' atau 'mutasi_keluar' ikut terdeteksi
  const studentsForSync =
    siswaStore.length > 0 ? siswaStore : await getSiswaList().catch(() => []);
  const merged = mergeMutationsWithStudentStatus(fetchedMutations, studentsForSync);
  const healed = await recoverFallbackMutationDates(merged);
  mutasiStore = healed;

  if (jenis) {
    return healed.filter(m => m.jenis === jenis);
  }
  return healed;
}

export interface MutasiMasukPayload {
  mode: 'new_student' | 'existing_student';
  existing_student_id?: string;
  nis: string;
  nisn: string;
  nik_siswa?: string;
  nama_siswa: string;
  jenis_kelamin: 'L' | 'P';
  tempat_lahir: string;
  tanggal_lahir: string;
  no_hp_wali?: string;
  nama_wali?: string;
  kelas_tujuan: string;
  tanggal_masuk: string;
  tahun_ajaran: string;
  sekolah_asal: string;
  npsn_asal?: string;
  kecamatan_asal?: string;
  kabupaten_asal?: string;
  provinsi_asal?: string;
  alasan: string;
  no_surat?: string;
  keterangan?: string;
  petugas_nama: string;
}

/**
 * Mencatat transaksi Mutasi Masuk secara transaksional:
 * - Bisa membuat biodata siswa baru (dengan cegah duplikasi NIS/NISN/NIK) atau menggunakan record yang sesuai.
 * - Mencatat transaksi di `student_mutations` dan riwayat kelas di `student_class_history`.
 */
export async function processMutasiMasuk(
  payload: MutasiMasukPayload,
  actor: { id: string; name: string; role: string }
): Promise<Mutasi> {
  if (!['super_admin', 'admin', 'operator'].includes(actor.role)) {
    throw new Error('AKSES DITOLAK: Hanya Admin / Operator yang dapat mencatat Mutasi Masuk.');
  }

  if (payload.mode === 'new_student') {
    await validateUniqueNisAndNisn(payload.nis, payload.nisn, undefined, payload.nik_siswa);
  }

  if (isSupabaseConfigured) {
    const supabase = getSupabase();
    if (supabase) {
      // Coba panggil RPC transaksional terlebih dahulu
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('rpc_process_mutation_in', {
        p_is_new_student: payload.mode === 'new_student',
        p_student_id: payload.existing_student_id || null,
        p_nis: payload.nis.trim(),
        p_nisn: payload.nisn.trim(),
        p_nik_siswa: payload.nik_siswa?.trim() || null,
        p_nama_lengkap: payload.nama_siswa.trim(),
        p_jenis_kelamin: payload.jenis_kelamin,
        p_tempat_lahir: payload.tempat_lahir.trim(),
        p_tanggal_lahir: parseDateValue(payload.tanggal_lahir),
        p_kelas_tujuan: payload.kelas_tujuan.trim(),
        p_tanggal_masuk: parseDateValue(payload.tanggal_masuk) || new Date().toISOString().slice(0, 10),
        p_tahun_ajaran: payload.tahun_ajaran.trim(),
        p_sekolah_asal: payload.sekolah_asal.trim(),
        p_npsn_asal: payload.npsn_asal?.trim() || null,
        p_kecamatan_asal: payload.kecamatan_asal?.trim() || null,
        p_kabupaten_asal: payload.kabupaten_asal?.trim() || null,
        p_provinsi_asal: payload.provinsi_asal?.trim() || null,
        p_alasan: payload.alasan.trim(),
        p_no_surat: payload.no_surat?.trim() || null,
        p_petugas: payload.petugas_nama.trim() || actor.name
      });

      if (!rpcErr && rpcRes) {
        const resObj = rpcRes as Record<string, unknown>;
        return {
          id: String(resObj.mutation_id || crypto.randomUUID()),
          siswa_id: String(resObj.student_id || ''),
          kelas: payload.kelas_tujuan,
          nis: payload.nis,
          nisn: payload.nisn,
          nama_siswa: payload.nama_siswa,
          jenis: 'masuk',
          kategori_mutasi: 'Masuk Pindahan',
          tanggal_mutasi: payload.tanggal_masuk,
          tahun_ajaran: payload.tahun_ajaran,
          alasan: payload.alasan,
          sekolah_asal: payload.sekolah_asal,
          npsn_sekolah: payload.npsn_asal,
          kecamatan_sekolah: payload.kecamatan_asal,
          kabupaten_sekolah: payload.kabupaten_asal,
          provinsi_sekolah: payload.provinsi_asal,
          no_surat: payload.no_surat,
          keterangan: payload.keterangan,
          petugas_nama: payload.petugas_nama || actor.name,
          status: 'selesai',
          created_at: new Date().toISOString()
        };
      }

      if (rpcErr && rpcErr.message.includes('DUPLIKASI IDENTITAS')) {
        throw new Error(rpcErr.message);
      }

      // Fallback langsung ke tabel jika RPC belum dipasang
      let targetStudentId = payload.existing_student_id;
      if (payload.mode === 'new_student' || !targetStudentId) {
        const tingkat = (['7', '8', '9'].includes(payload.kelas_tujuan.charAt(0))
          ? payload.kelas_tujuan.charAt(0)
          : '7') as '7' | '8' | '9';
        const created = await createSiswa(
          {
            rombel: payload.kelas_tujuan,
            tingkat_kelas: tingkat,
            nis: payload.nis.trim(),
            nisn: payload.nisn.trim(),
            nik_siswa: payload.nik_siswa?.trim() || '',
            nama_lengkap: payload.nama_siswa.trim(),
            jenis_kelamin: payload.jenis_kelamin,
            tempat_lahir: payload.tempat_lahir.trim(),
            tanggal_lahir: payload.tanggal_lahir,
            agama: 'Islam',
            alamat: payload.kabupaten_asal || '-',
            nama_asal_sekolah: payload.sekolah_asal.trim(),
            npsn_asal_sekolah: payload.npsn_asal?.trim() || '',
            kecamatan_asal_sekolah: payload.kecamatan_asal?.trim() || '',
            kabupaten_asal_sekolah: payload.kabupaten_asal?.trim() || '',
            provinsi_asal_sekolah: payload.provinsi_asal?.trim() || '',
            nama_wali: payload.nama_wali || '',
            no_hp_orangtua: payload.no_hp_wali || '-',
            status: 'mutasi_masuk',
            tanggal_masuk: payload.tanggal_masuk,
            tahun_masuk: payload.tanggal_masuk.slice(0, 4)
          },
          actor
        );
        targetStudentId = created.id;
      } else {
        await updateSiswa(
          targetStudentId,
          {
            rombel: payload.kelas_tujuan,
            status: 'mutasi_masuk',
            tanggal_masuk: payload.tanggal_masuk,
            nama_asal_sekolah: payload.sekolah_asal.trim(),
            npsn_asal_sekolah: payload.npsn_asal?.trim(),
            kecamatan_asal_sekolah: payload.kecamatan_asal?.trim(),
            kabupaten_asal_sekolah: payload.kabupaten_asal?.trim(),
            provinsi_asal_sekolah: payload.provinsi_asal?.trim()
          },
          actor
        );
      }

      const { data: mutRow, error: mutErr } = await supabase
        .from('student_mutations')
        .insert({
          student_id: targetStudentId,
          jenis_mutasi: 'masuk',
          kategori_mutasi: 'Masuk Pindahan',
          kelas: payload.kelas_tujuan.trim(),
          nis: cleanTextValue(payload.nis),
          nisn: cleanTextValue(payload.nisn),
          nama_lengkap_siswa: payload.nama_siswa.trim(),
          tanggal_pindah: parseDateValue(payload.tanggal_masuk) || new Date().toISOString().slice(0, 10),
          tahun_ajaran: payload.tahun_ajaran,
          alasan_pindah: cleanTextValue(payload.alasan),
          sekolah_asal: cleanTextValue(payload.sekolah_asal),
          npsn_sekolah: cleanTextValue(payload.npsn_asal),
          kecamatan_sekolah: cleanTextValue(payload.kecamatan_asal),
          kabupaten_sekolah: cleanTextValue(payload.kabupaten_asal),
          provinsi_sekolah: cleanTextValue(payload.provinsi_asal),
          no_surat_mutasi: cleanTextValue(payload.no_surat),
          keterangan: cleanTextValue(payload.keterangan),
          petugas_nama: payload.petugas_nama || actor.name,
          status_mutasi: 'selesai'
        })
        .select('*')
        .single();

      if (mutErr) throw new Error(mutErr.message);

      recordAuditLog({
        user_id: actor.id,
        user_name: actor.name,
        user_role: actor.role,
        user_type: 'admin',
        action: 'MUTASI_MASUK',
        target_type: 'student_mutations',
        target_id: String(mutRow.id),
        new_values: payload as unknown as Record<string, unknown>,
        details: `Mencatat Mutasi Masuk untuk ${payload.nama_siswa} (NIS: ${payload.nis}, Kelas Tujuan: ${payload.kelas_tujuan}) dari ${payload.sekolah_asal}.`
      });

      return {
        id: String(mutRow.id),
        siswa_id: targetStudentId,
        kelas: payload.kelas_tujuan,
        nis: payload.nis,
        nisn: payload.nisn,
        nama_siswa: payload.nama_siswa,
        jenis: 'masuk',
        kategori_mutasi: 'Masuk Pindahan',
        tanggal_mutasi: payload.tanggal_masuk,
        tahun_ajaran: payload.tahun_ajaran,
        alasan: payload.alasan,
        sekolah_asal: payload.sekolah_asal,
        npsn_sekolah: payload.npsn_asal,
        kecamatan_sekolah: payload.kecamatan_asal,
        kabupaten_sekolah: payload.kabupaten_asal,
        provinsi_sekolah: payload.provinsi_asal,
        no_surat: payload.no_surat,
        keterangan: payload.keterangan,
        petugas_nama: payload.petugas_nama || actor.name,
        status: 'selesai',
        created_at: String(mutRow.created_at)
      };
    }
  }

  // Fallback runtime buffer
  let studentId = payload.existing_student_id;
  const tingkat = (['7', '8', '9'].includes(payload.kelas_tujuan.charAt(0))
    ? payload.kelas_tujuan.charAt(0)
    : '7') as '7' | '8' | '9';

  if (payload.mode === 'new_student' || !studentId) {
    const created = await createSiswa(
      {
        rombel: payload.kelas_tujuan,
        tingkat_kelas: tingkat,
        nis: payload.nis.trim(),
        nisn: payload.nisn.trim(),
        nik_siswa: payload.nik_siswa?.trim() || '',
        nama_lengkap: payload.nama_siswa.trim(),
        jenis_kelamin: payload.jenis_kelamin,
        tempat_lahir: payload.tempat_lahir.trim(),
        tanggal_lahir: payload.tanggal_lahir,
        agama: 'Islam',
        alamat: payload.kabupaten_asal || '-',
        nama_asal_sekolah: payload.sekolah_asal.trim(),
        npsn_asal_sekolah: payload.npsn_asal?.trim() || '',
        kecamatan_asal_sekolah: payload.kecamatan_asal?.trim() || '',
        kabupaten_asal_sekolah: payload.kabupaten_asal?.trim() || '',
        provinsi_asal_sekolah: payload.provinsi_asal?.trim() || '',
        nama_wali: payload.nama_wali || '',
        no_hp_orangtua: payload.no_hp_wali || '-',
        status: 'mutasi_masuk',
        tanggal_masuk: payload.tanggal_masuk,
        tahun_masuk: payload.tanggal_masuk.slice(0, 4)
      },
      actor
    );
    studentId = created.id;
  } else {
    await updateSiswa(
      studentId,
      {
        rombel: payload.kelas_tujuan,
        status: 'mutasi_masuk',
        tanggal_masuk: payload.tanggal_masuk
      },
      actor
    );
  }

  const now = new Date().toISOString();
  classHistoryStore.unshift({
    id: crypto.randomUUID ? crypto.randomUUID() : 'ch-' + Date.now(),
    student_id: studentId,
    kelas: payload.kelas_tujuan,
    tingkat_kelas: tingkat,
    status_riwayat: 'aktif',
    tanggal_mulai: payload.tanggal_masuk,
    catatan: `Mutasi Masuk (${payload.tahun_ajaran}) dari ${payload.sekolah_asal}`,
    created_at: now
  });

  const newMutasi: Mutasi = {
    id: crypto.randomUUID ? crypto.randomUUID() : 'mut-' + Date.now(),
    siswa_id: studentId,
    kelas: payload.kelas_tujuan,
    nis: payload.nis,
    nisn: payload.nisn,
    nama_siswa: payload.nama_siswa,
    jenis: 'masuk',
    kategori_mutasi: 'Masuk Pindahan',
    tanggal_mutasi: payload.tanggal_masuk,
    tahun_ajaran: payload.tahun_ajaran,
    alasan: payload.alasan,
    sekolah_asal: payload.sekolah_asal,
    npsn_sekolah: payload.npsn_asal,
    kecamatan_sekolah: payload.kecamatan_asal,
    kabupaten_sekolah: payload.kabupaten_asal,
    provinsi_sekolah: payload.provinsi_asal,
    no_surat: payload.no_surat,
    keterangan: payload.keterangan,
    petugas_nama: payload.petugas_nama || actor.name,
    status: 'selesai',
    created_at: now
  };
  mutasiStore.unshift(newMutasi);
  return newMutasi;
}

export interface MutasiKeluarPayload {
  student_id: string;
  tanggal_keluar: string;
  kelas_terakhir: string;
  kategori_mutasi: MutationCategory;
  alasan: string;
  sekolah_tujuan?: string;
  npsn_tujuan?: string;
  kecamatan_tujuan?: string;
  kabupaten_tujuan?: string;
  provinsi_tujuan?: string;
  tahun_ajaran: string;
  no_surat?: string;
  keterangan?: string;
  petugas_nama: string;
}

/**
 * Mencatat transaksi Mutasi Keluar secara transaksional:
 * - Memilih siswa aktif.
 * - Mengubah status siswa menjadi nonaktif (`non_aktif` / `mutasi_keluar` / `lulus`) TANPA menghapus biodata.
 * - Mencatat ke `student_mutations`, `student_class_history`, dan `audit_logs`.
 */
export async function processMutasiKeluar(
  payload: MutasiKeluarPayload,
  actor: { id: string; name: string; role: string }
): Promise<Mutasi> {
  if (!['super_admin', 'admin', 'operator'].includes(actor.role)) {
    throw new Error('AKSES DITOLAK: Hanya Admin / Operator yang dapat mencatat Mutasi Keluar.');
  }

  const allStudents = await getSiswaList();
  const targetStudent = allStudents.find(s => s.id === payload.student_id);
  if (!targetStudent) {
    throw new Error('Data siswa aktif yang dipilih tidak ditemukan.');
  }

  const newStudentStatus: Siswa['status'] =
    payload.kategori_mutasi === 'Lulus'
      ? 'lulus'
      : payload.kategori_mutasi === 'Pindah sekolah'
      ? 'mutasi_keluar'
      : 'non_aktif';

  if (isSupabaseConfigured) {
    const supabase = getSupabase();
    if (supabase) {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('rpc_process_mutation_out', {
        p_student_id: payload.student_id,
        p_tanggal_keluar: parseDateValue(payload.tanggal_keluar) || new Date().toISOString().slice(0, 10),
        p_kelas_terakhir: payload.kelas_terakhir,
        p_kategori_mutasi: payload.kategori_mutasi,
        p_alasan: payload.alasan.trim(),
        p_sekolah_tujuan: payload.sekolah_tujuan?.trim() || null,
        p_npsn_tujuan: payload.npsn_tujuan?.trim() || null,
        p_kecamatan_tujuan: payload.kecamatan_tujuan?.trim() || null,
        p_kabupaten_tujuan: payload.kabupaten_tujuan?.trim() || null,
        p_provinsi_tujuan: payload.provinsi_tujuan?.trim() || null,
        p_tahun_ajaran: payload.tahun_ajaran,
        p_no_surat: payload.no_surat?.trim() || null,
        p_keterangan: payload.keterangan?.trim() || null,
        p_petugas: payload.petugas_nama.trim() || actor.name
      });

      if (!rpcErr && rpcRes) {
        const resObj = rpcRes as Record<string, unknown>;
        return {
          id: String(resObj.mutation_id || crypto.randomUUID()),
          siswa_id: targetStudent.id,
          kelas: payload.kelas_terakhir,
          nis: targetStudent.nis,
          nisn: targetStudent.nisn,
          nama_siswa: targetStudent.nama_lengkap,
          jenis: 'keluar',
          kategori_mutasi: payload.kategori_mutasi,
          tanggal_mutasi: payload.tanggal_keluar,
          tahun_ajaran: payload.tahun_ajaran,
          alasan: payload.alasan,
          sekolah_tujuan: payload.sekolah_tujuan,
          npsn_sekolah: payload.npsn_tujuan,
          kecamatan_sekolah: payload.kecamatan_tujuan,
          kabupaten_sekolah: payload.kabupaten_tujuan,
          provinsi_sekolah: payload.provinsi_tujuan,
          no_surat: payload.no_surat,
          keterangan: payload.keterangan,
          petugas_nama: payload.petugas_nama || actor.name,
          previous_student_status: targetStudent.status,
          status: 'selesai',
          created_at: new Date().toISOString()
        };
      }

      // Fallback langsung ke tabel jika RPC belum dipasang
      const { data: mutRow, error: mutErr } = await supabase
        .from('student_mutations')
        .insert({
          student_id: targetStudent.id,
          jenis_mutasi: 'keluar',
          kategori_mutasi: payload.kategori_mutasi,
          kelas: payload.kelas_terakhir,
          nis: cleanTextValue(targetStudent.nis),
          nisn: cleanTextValue(targetStudent.nisn),
          nama_lengkap_siswa: targetStudent.nama_lengkap,
          tanggal_pindah: parseDateValue(payload.tanggal_keluar) || new Date().toISOString().slice(0, 10),
          tahun_ajaran: payload.tahun_ajaran,
          alasan_pindah: cleanTextValue(payload.alasan),
          sekolah_tujuan: cleanTextValue(payload.sekolah_tujuan),
          npsn_sekolah: cleanTextValue(payload.npsn_tujuan),
          kecamatan_sekolah: cleanTextValue(payload.kecamatan_tujuan),
          kabupaten_sekolah: cleanTextValue(payload.kabupaten_tujuan),
          provinsi_sekolah: cleanTextValue(payload.provinsi_tujuan),
          no_surat_mutasi: cleanTextValue(payload.no_surat),
          keterangan: cleanTextValue(payload.keterangan),
          petugas_nama: payload.petugas_nama || actor.name,
          previous_student_status: targetStudent.status,
          status_mutasi: 'selesai'
        })
        .select('*')
        .single();

      if (mutErr) throw new Error(mutErr.message);

      await supabase
        .from('students')
        .update({ status_aktif: newStudentStatus })
        .eq('id', targetStudent.id);

      await supabase.from('student_class_history').insert({
        student_id: targetStudent.id,
        kelas: payload.kelas_terakhir,
        tingkat_kelas: targetStudent.tingkat_kelas,
        kamar: targetStudent.kamar || null,
        status_riwayat: payload.kategori_mutasi === 'Lulus' ? 'lulus' : 'mutasi',
        tanggal_mulai: parseDateValue(targetStudent.tanggal_masuk) || new Date().toISOString().slice(0, 10),
        tanggal_selesai: parseDateValue(payload.tanggal_keluar) || new Date().toISOString().slice(0, 10),
        catatan: `Mutasi Keluar (${payload.kategori_mutasi}): ${payload.alasan}`
      });

      recordAuditLog({
        user_id: actor.id,
        user_name: actor.name,
        user_role: actor.role,
        user_type: 'admin',
        action: 'MUTASI_KELUAR',
        target_type: 'student_mutations',
        target_id: String(mutRow.id),
        old_values: { status: targetStudent.status, kelas: targetStudent.rombel },
        new_values: {
          status: newStudentStatus,
          kategori_mutasi: payload.kategori_mutasi,
          sekolah_tujuan: payload.sekolah_tujuan,
          tanggal_keluar: payload.tanggal_keluar
        },
        details: `Mencatat Mutasi Keluar (${payload.kategori_mutasi}) untuk ${targetStudent.nama_lengkap} (NIS: ${targetStudent.nis}). Status siswa diubah menjadi ${newStudentStatus} tanpa menghapus biodata.`
      });

      return {
        id: String(mutRow.id),
        siswa_id: targetStudent.id,
        kelas: payload.kelas_terakhir,
        nis: targetStudent.nis,
        nisn: targetStudent.nisn,
        nama_siswa: targetStudent.nama_lengkap,
        jenis: 'keluar',
        kategori_mutasi: payload.kategori_mutasi,
        tanggal_mutasi: payload.tanggal_keluar,
        tahun_ajaran: payload.tahun_ajaran,
        alasan: payload.alasan,
        sekolah_tujuan: payload.sekolah_tujuan,
        npsn_sekolah: payload.npsn_tujuan,
        kecamatan_sekolah: payload.kecamatan_tujuan,
        kabupaten_sekolah: payload.kabupaten_tujuan,
        provinsi_sekolah: payload.provinsi_tujuan,
        no_surat: payload.no_surat,
        keterangan: payload.keterangan,
        petugas_nama: payload.petugas_nama || actor.name,
        previous_student_status: targetStudent.status,
        status: 'selesai',
        created_at: String(mutRow.created_at)
      };
    }
  }

  // Fallback runtime buffer
  await updateSiswa(targetStudent.id, { status: newStudentStatus }, actor);

  const now = new Date().toISOString();
  classHistoryStore.unshift({
    id: crypto.randomUUID ? crypto.randomUUID() : 'ch-' + Date.now(),
    student_id: targetStudent.id,
    kelas: payload.kelas_terakhir,
    tingkat_kelas: targetStudent.tingkat_kelas,
    kamar: targetStudent.kamar,
    status_riwayat: payload.kategori_mutasi === 'Lulus' ? 'lulus' : 'mutasi',
    tanggal_mulai: targetStudent.tanggal_masuk || now.slice(0, 10),
    tanggal_selesai: payload.tanggal_keluar,
    catatan: `Mutasi Keluar (${payload.kategori_mutasi}): ${payload.alasan}`,
    created_at: now
  });

  const newMutasi: Mutasi = {
    id: crypto.randomUUID ? crypto.randomUUID() : 'mut-' + Date.now(),
    siswa_id: targetStudent.id,
    kelas: payload.kelas_terakhir,
    nis: targetStudent.nis,
    nisn: targetStudent.nisn,
    nama_siswa: targetStudent.nama_lengkap,
    jenis: 'keluar',
    kategori_mutasi: payload.kategori_mutasi,
    tanggal_mutasi: payload.tanggal_keluar,
    tahun_ajaran: payload.tahun_ajaran,
    alasan: payload.alasan,
    sekolah_tujuan: payload.sekolah_tujuan,
    npsn_sekolah: payload.npsn_tujuan,
    kecamatan_sekolah: payload.kecamatan_tujuan,
    kabupaten_sekolah: payload.kabupaten_tujuan,
    provinsi_sekolah: payload.provinsi_tujuan,
    no_surat: payload.no_surat,
    keterangan: payload.keterangan,
    petugas_nama: payload.petugas_nama || actor.name,
    previous_student_status: targetStudent.status,
    status: 'selesai',
    created_at: now
  };
  mutasiStore.unshift(newMutasi);
  return newMutasi;
}

/**
 * Pembatalan Transaksi Mutasi oleh Admin Berwenang (`super_admin` atau `admin`)
 * Mengembalikan status siswa menjadi aktif dan mencatat di `audit_logs`
 */
export async function cancelMutasiTransaction(
  mutationId: string,
  cancelReason: string,
  actor: { id: string; name: string; role: string }
): Promise<void> {
  if (!['super_admin', 'admin'].includes(actor.role)) {
    throw new Error(
      'AKSES DITOLAK: Hanya Super Admin atau Admin berwenang yang dapat membatalkan transaksi mutasi.'
    );
  }
  if (!cancelReason.trim()) {
    throw new Error('Alasan pembatalan transaksi mutasi wajib diisi untuk keperluan Audit Log.');
  }

  if (isSupabaseConfigured) {
    const supabase = getSupabase();
    if (supabase) {
      const { error: rpcErr } = await supabase.rpc('rpc_cancel_student_mutation', {
        p_mutation_id: mutationId,
        p_cancel_reason: cancelReason.trim()
      });

      if (!rpcErr) return;

      // Fallback langsung ke tabel jika RPC belum dipasang
      const { data: mutRow } = await supabase
        .from('student_mutations')
        .select('*')
        .eq('id', mutationId)
        .maybeSingle();

      if (!mutRow) throw new Error('Data transaksi mutasi tidak ditemukan.');
      if (mutRow.status_mutasi === 'dibatalkan') {
        throw new Error('Transaksi mutasi ini sudah dibatalkan sebelumnya.');
      }

      const restoreStatus = (mutRow.previous_student_status as Siswa['status']) || 'aktif';

      const { error: updErr } = await supabase
        .from('student_mutations')
        .update({
          status_mutasi: 'dibatalkan',
          cancelled_at: new Date().toISOString(),
          cancelled_by_name: actor.name,
          alasan_pembatalan: cancelReason.trim()
        })
        .eq('id', mutationId);

      if (updErr) throw new Error(updErr.message);

      if (mutRow.student_id) {
        await supabase
          .from('students')
          .update({ status_aktif: restoreStatus })
          .eq('id', mutRow.student_id);
      }

      recordAuditLog({
        user_id: actor.id,
        user_name: actor.name,
        user_role: actor.role,
        user_type: 'admin',
        action: 'CANCEL_MUTATION',
        target_type: 'student_mutations',
        target_id: mutationId,
        old_values: { status_mutasi: mutRow.status_mutasi },
        new_values: {
          status_mutasi: 'dibatalkan',
          restored_student_status: restoreStatus,
          alasan_pembatalan: cancelReason.trim()
        },
        details: `Membatalkan transaksi mutasi untuk siswa ${String(mutRow.nama_lengkap_siswa || '')}. Status siswa dikembalikan ke ${restoreStatus}. Alasan: ${cancelReason.trim()}`
      });
      return;
    }
  }

  const localMut = mutasiStore.find(m => m.id === mutationId);
  if (!localMut) throw new Error('Data transaksi mutasi tidak ditemukan.');
  if (localMut.status === 'dibatalkan') {
    throw new Error('Transaksi mutasi ini sudah dibatalkan sebelumnya.');
  }

  const restoreStatus = localMut.previous_student_status || 'aktif';
  localMut.status = 'dibatalkan';
  localMut.cancelled_at = new Date().toISOString();
  localMut.cancelled_by_name = actor.name;
  localMut.alasan_pembatalan = cancelReason.trim();

  if (localMut.siswa_id) {
    await updateSiswa(localMut.siswa_id, { status: restoreStatus }, actor);
  }

  recordAuditLog({
    user_id: actor.id,
    user_name: actor.name,
    user_role: actor.role,
    user_type: 'admin',
    action: 'CANCEL_MUTATION',
    target_type: 'student_mutations',
    target_id: mutationId,
    old_values: { status_mutasi: 'selesai' },
    new_values: {
      status_mutasi: 'dibatalkan',
      restored_student_status: restoreStatus,
      alasan_pembatalan: cancelReason.trim()
    },
    details: `Membatalkan transaksi mutasi untuk siswa ${localMut.nama_siswa} (NIS: ${localMut.nis}). Status siswa dikembalikan ke ${restoreStatus}. Alasan: ${cancelReason.trim()}`
  });
}

export async function createMutasi(
  payload: Omit<Mutasi, 'id' | 'created_at'>,
  actor: { id: string; name: string; role: string }
): Promise<Mutasi> {
  if (payload.jenis === 'masuk') {
    return processMutasiMasuk(
      {
        mode: payload.siswa_id ? 'existing_student' : 'new_student',
        existing_student_id: payload.siswa_id,
        nis: payload.nis,
        nisn: payload.nisn,
        nama_siswa: payload.nama_siswa,
        jenis_kelamin: 'L',
        tempat_lahir: '-',
        tanggal_lahir: '2012-01-01',
        kelas_tujuan: payload.kelas,
        tanggal_masuk: payload.tanggal_mutasi,
        tahun_ajaran: payload.tahun_ajaran || '2025/2026',
        sekolah_asal: payload.sekolah_asal || '-',
        npsn_asal: payload.npsn_sekolah,
        kecamatan_asal: payload.kecamatan_sekolah,
        kabupaten_asal: payload.kabupaten_sekolah,
        provinsi_asal: payload.provinsi_sekolah,
        alasan: payload.alasan || 'Mutasi Masuk',
        no_surat: payload.no_surat,
        keterangan: payload.keterangan,
        petugas_nama: payload.petugas_nama || actor.name
      },
      actor
    );
  }

  return processMutasiKeluar(
    {
      student_id: payload.siswa_id || '',
      tanggal_keluar: payload.tanggal_mutasi,
      kelas_terakhir: payload.kelas,
      kategori_mutasi: payload.kategori_mutasi || 'Pindah sekolah',
      alasan: payload.alasan || 'Pindah sekolah',
      sekolah_tujuan: payload.sekolah_tujuan,
      npsn_tujuan: payload.npsn_sekolah,
      kecamatan_tujuan: payload.kecamatan_sekolah,
      kabupaten_tujuan: payload.kabupaten_sekolah,
      provinsi_tujuan: payload.provinsi_sekolah,
      tahun_ajaran: payload.tahun_ajaran || '2025/2026',
      no_surat: payload.no_surat,
      keterangan: payload.keterangan,
      petugas_nama: payload.petugas_nama || actor.name
    },
    actor
  );
}

/**
 * Mengimpor 1 baris data Mutasi Masuk atau Mutasi Keluar dari Excel secara aman:
 * - Untuk Mutasi Masuk: memperbarui siswa jika sudah ada di tabel `students` atau membuat biodata siswa baru, lalu mencatat ke `student_mutations`.
 * - Untuk Mutasi Keluar: jika siswa sudah ada di `students`, mengubah status menjadi `mutasi_keluar` / `lulus` / `non_aktif` tanpa menghapus biodata; jika siswa historis belum ada di `students`, membuat arsip siswa di `students` dengan status `mutasi_keluar`, lalu mencatat ke `student_mutations`.
 */
async function tryServerMutationInsert(
  mutationPayload: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  try {
    const session = getSession();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.token) {
      headers['Authorization'] = `Bearer ${session.token}`;
    }
    const res = await fetch('/api/mutations/import-row', {
      method: 'POST',
      headers,
      body: JSON.stringify({ mutationPayload })
    });
    const parsed = await safeParseJsonResponse<{ mutation?: Record<string, unknown> }>(res);
    if (parsed.isJson && res.ok && parsed.data?.mutation) {
      return parsed.data.mutation;
    }
  } catch {
    // Ignore on static hosting
  }
  return null;
}

async function upsertStudentMutationRow(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  mutPayload: Record<string, unknown>
): Promise<{ data: Record<string, unknown> | null; error: { message?: string } | null }> {
  const jenis = String(mutPayload.jenis_mutasi || 'masuk');
  const studentId = String(mutPayload.student_id || '').trim();
  const nisn = String(mutPayload.nisn || '').trim();
  const nis = String(mutPayload.nis || '').trim();
  const nama = String(mutPayload.nama_lengkap_siswa || '').trim();

  let existingRows: Record<string, unknown>[] = [];
  if (studentId) {
    const { data } = await supabase
      .from('student_mutations')
      .select('id, tanggal_pindah, status_mutasi')
      .eq('student_id', studentId)
      .eq('jenis_mutasi', jenis)
      .neq('status_mutasi', 'dibatalkan');
    if (data && data.length > 0) existingRows = data as Record<string, unknown>[];
  }
  if (existingRows.length === 0 && nisn) {
    const { data } = await supabase
      .from('student_mutations')
      .select('id, tanggal_pindah, status_mutasi')
      .eq('nisn', nisn)
      .eq('jenis_mutasi', jenis)
      .neq('status_mutasi', 'dibatalkan');
    if (data && data.length > 0) existingRows = data as Record<string, unknown>[];
  }
  if (existingRows.length === 0 && nis) {
    const { data } = await supabase
      .from('student_mutations')
      .select('id, tanggal_pindah, status_mutasi')
      .eq('nis', nis)
      .eq('jenis_mutasi', jenis)
      .neq('status_mutasi', 'dibatalkan');
    if (data && data.length > 0) existingRows = data as Record<string, unknown>[];
  }
  if (existingRows.length === 0 && nama) {
    const { data } = await supabase
      .from('student_mutations')
      .select('id, tanggal_pindah, status_mutasi')
      .ilike('nama_lengkap_siswa', nama)
      .eq('jenis_mutasi', jenis)
      .neq('status_mutasi', 'dibatalkan');
    if (data && data.length > 0) existingRows = data as Record<string, unknown>[];
  }

  if (existingRows.length > 0) {
    const primaryId = String(existingRows[0].id);
    const { data: updated, error: updErr } = await supabase
      .from('student_mutations')
      .update({
        ...mutPayload,
        updated_at: new Date().toISOString()
      })
      .eq('id', primaryId)
      .select('*')
      .single();

    if (!updErr && updated) {
      if (existingRows.length > 1) {
        const extraIds = existingRows.slice(1).map(r => String(r.id));
        await supabase.from('student_mutations').delete().in('id', extraIds);
      }
      return { data: updated as Record<string, unknown>, error: null };
    }
  }

  const { data: inserted, error: insErr } = await supabase
    .from('student_mutations')
    .insert(mutPayload)
    .select('*')
    .single();
  return {
    data: (inserted as Record<string, unknown>) || null,
    error: insErr
  };
}

export async function importMutationFromExcelRow(
  row: ParsedMutationImportRow,
  actor: { id: string; name: string; role: string }
): Promise<{ mutation: Mutasi; studentId: string }> {
  const normKelas = normalizeKelasValue(row.kelas, '7A');
  const cleanNis = (row.nis || '').trim();
  const cleanNisn = (row.nisn || '').trim();
  const validNisn = /^\d{10}$/.test(cleanNisn) ? cleanNisn : '';
  const tanggalMutasi = parseDateValue(row.tanggal_pindah) || new Date().toISOString().slice(0, 10);

  let targetStudent = row.matchedStudent;

  // Jika targetStudent dari memori memiliki NIS berbeda dengan baris mutasi (mis. kasus ID/NIS dobel), jangan timpa siswa aktif yang berbeda NIS
  if (
    targetStudent &&
    cleanNis &&
    targetStudent.nis &&
    targetStudent.nis.trim() &&
    targetStudent.nis.trim() !== cleanNis
  ) {
    targetStudent = undefined;
  }

  // Cari secara langsung dan cepat di database jika belum terpetakan dari memori (tanpa mengambil 1500 baris berulang kali)
  if (!targetStudent && isSupabaseConfigured && (validNisn || cleanNis || row.nama_siswa)) {
    await ensureSupabaseSessionReady();
    const supabase = getSupabase();
    if (supabase) {
      if (cleanNis) {
        const { data: rByNis } = await supabase
          .from('students')
          .select('*')
          .eq('nis', cleanNis)
          .limit(1);
        if (rByNis?.[0]) {
          targetStudent = mapDbRowToSiswa(rByNis[0] as Record<string, unknown>);
        }
      }
      if (!targetStudent && validNisn) {
        const { data: r1 } = await supabase
          .from('students')
          .select('*')
          .eq('nisn', validNisn)
          .limit(1);
        if (r1?.[0]) {
          const cand = mapDbRowToSiswa(r1[0] as Record<string, unknown>);
          if (!cleanNis || !cand.nis || !cand.nis.trim() || cand.nis.trim() === cleanNis) {
            targetStudent = cand;
          }
        }
      }
      if (!targetStudent && row.nama_siswa.trim()) {
        const { data: r3 } = await supabase
          .from('students')
          .select('*')
          .ilike('nama_lengkap_siswa', row.nama_siswa.trim())
          .limit(5);
        if (r3 && r3.length > 0) {
          const matchedRow = r3.find(item => {
            const cand = mapDbRowToSiswa(item as Record<string, unknown>);
            return !cleanNis || !cand.nis || !cand.nis.trim() || cand.nis.trim() === cleanNis;
          });
          if (matchedRow) {
            targetStudent = mapDbRowToSiswa(matchedRow as Record<string, unknown>);
          }
        }
      }
    }
  }

  if (row.jenis === 'masuk') {
    if (targetStudent) {
      targetStudent = await updateSiswa(
        targetStudent.id,
        {
          rombel: normKelas.rombel,
          tingkat_kelas: normKelas.tingkat,
          status: 'mutasi_masuk',
          tanggal_masuk: tanggalMutasi,
          nama_asal_sekolah: row.sekolah_asal || targetStudent.nama_asal_sekolah,
          npsn_asal_sekolah: row.npsn_sekolah || targetStudent.npsn_asal_sekolah,
          kabupaten_asal_sekolah: row.kabupaten_sekolah || targetStudent.kabupaten_asal_sekolah,
          provinsi_asal_sekolah: row.provinsi_sekolah || targetStudent.provinsi_asal_sekolah
        },
        actor,
        { skipValidationQuery: true, skipAuditLog: true, ignoreSecondaryKeyConflict: true }
      );
    } else {
      targetStudent = await createSiswa(
        {
          rombel: normKelas.rombel,
          tingkat_kelas: normKelas.tingkat,
          nis: cleanNis,
          nisn: validNisn,
          nama_lengkap: row.nama_siswa.trim(),
          jenis_kelamin: row.jenis_kelamin || 'L',
          tempat_lahir: '-',
          tanggal_lahir: '',
          agama: 'Islam',
          alamat: row.kabupaten_sekolah || '-',
          nama_asal_sekolah: row.sekolah_asal || '-',
          npsn_asal_sekolah: row.npsn_sekolah || '',
          kabupaten_asal_sekolah: row.kabupaten_sekolah || '',
          provinsi_asal_sekolah: row.provinsi_sekolah || '',
          status: 'mutasi_masuk',
          tanggal_masuk: tanggalMutasi,
          tahun_masuk: tanggalMutasi.slice(0, 4),
          angkatan: tanggalMutasi.slice(0, 4),
          tahun_ajaran_masuk: row.tahun_ajaran
        } as Omit<Siswa, 'id' | 'created_at' | 'updated_at'>,
        actor,
        undefined,
        { upsertOnConflict: true, skipValidationQuery: true, skipAuditLog: true }
      );
    }

    if (isSupabaseConfigured) {
      await ensureSupabaseSessionReady();
      const supabase = getSupabase();
      if (supabase) {
        const mutPayload = {
          student_id: targetStudent.id,
          jenis_mutasi: 'masuk',
          kategori_mutasi: 'Masuk Pindahan',
          kelas: normKelas.rombel,
          nis: cleanTextValue(cleanNis),
          nisn: cleanTextValue(validNisn),
          nama_lengkap_siswa: row.nama_siswa.trim(),
          tanggal_pindah: tanggalMutasi,
          tahun_ajaran: row.tahun_ajaran,
          alasan_pindah: cleanTextValue(row.alasan_pindah) || 'Mutasi Masuk',
          sekolah_asal: cleanTextValue(row.sekolah_asal) || '-',
          npsn_sekolah: cleanTextValue(row.npsn_sekolah),
          kabupaten_sekolah: cleanTextValue(row.kabupaten_sekolah),
          provinsi_sekolah: cleanTextValue(row.provinsi_sekolah),
          no_surat_mutasi: cleanTextValue(row.no_surat),
          keterangan: cleanTextValue(row.keterangan),
          petugas_nama: actor.name,
          status_mutasi: 'selesai'
        };

        let { data: mutRow, error: mutErr } = await upsertStudentMutationRow(supabase, mutPayload);

        if (mutErr || !mutRow) {
          const fallbackMut = await tryServerMutationInsert(mutPayload);
          if (fallbackMut) {
            mutRow = fallbackMut;
            mutErr = null;
          }
        }

        if (mutErr || !mutRow) {
          throw new Error(mutErr?.message || 'Gagal menyimpan catatan mutasi masuk.');
        }

        const createdMut: Mutasi = {
          id: String(mutRow.id),
          siswa_id: targetStudent.id,
          kelas: normKelas.rombel,
          nis: cleanNis,
          nisn: validNisn,
          nama_siswa: row.nama_siswa.trim(),
          jenis: 'masuk',
          kategori_mutasi: 'Masuk Pindahan',
          tanggal_mutasi: tanggalMutasi,
          tahun_ajaran: row.tahun_ajaran,
          alasan: row.alasan_pindah || 'Mutasi Masuk',
          sekolah_asal: row.sekolah_asal,
          npsn_sekolah: row.npsn_sekolah,
          kabupaten_sekolah: row.kabupaten_sekolah,
          provinsi_sekolah: row.provinsi_sekolah,
          no_surat: row.no_surat,
          keterangan: row.keterangan,
          petugas_nama: actor.name,
          status: 'selesai',
          created_at: String(mutRow.created_at || new Date().toISOString())
        };
        const existingMutIdx = mutasiStore.findIndex(
          m => m.id === createdMut.id || (m.siswa_id === createdMut.siswa_id && m.jenis === 'masuk')
        );
        if (existingMutIdx >= 0) {
          mutasiStore[existingMutIdx] = createdMut;
        } else {
          mutasiStore.unshift(createdMut);
        }
        return { mutation: createdMut, studentId: targetStudent.id };
      }
    }

    const localMut: Mutasi = {
      id: crypto.randomUUID(),
      siswa_id: targetStudent.id,
      kelas: normKelas.rombel,
      nis: cleanNis,
      nisn: validNisn,
      nama_siswa: row.nama_siswa.trim(),
      jenis: 'masuk',
      kategori_mutasi: 'Masuk Pindahan',
      tanggal_mutasi: tanggalMutasi,
      tahun_ajaran: row.tahun_ajaran,
      alasan: row.alasan_pindah || 'Mutasi Masuk',
      sekolah_asal: row.sekolah_asal,
      npsn_sekolah: row.npsn_sekolah,
      kabupaten_sekolah: row.kabupaten_sekolah,
      provinsi_sekolah: row.provinsi_sekolah,
      no_surat: row.no_surat,
      keterangan: row.keterangan,
      petugas_nama: actor.name,
      status: 'selesai',
      created_at: new Date().toISOString()
    };
    mutasiStore.unshift(localMut);
    return { mutation: localMut, studentId: targetStudent.id };
  }

  // Jenis === 'keluar'
  const newStudentStatus: Siswa['status'] =
    row.kategori_mutasi === 'Lulus'
      ? 'lulus'
      : row.kategori_mutasi === 'Pindah sekolah'
      ? 'mutasi_keluar'
      : 'non_aktif';

  const prevStatus = targetStudent?.status || 'aktif';

  if (targetStudent) {
    targetStudent = await updateSiswa(
      targetStudent.id,
      {
        status: newStudentStatus,
        tanggal_masuk: tanggalMutasi
      },
      actor,
      { skipValidationQuery: true, skipAuditLog: true, ignoreSecondaryKeyConflict: true }
    );
  } else {
    // Buat record arsip siswa di tabel students agar data mutasi keluar memiliki relasi Buku Induk yang utuh
    targetStudent = await createSiswa(
      {
        rombel: normKelas.rombel,
        tingkat_kelas: normKelas.tingkat,
        nis: cleanNis,
        nisn: validNisn,
        nama_lengkap: row.nama_siswa.trim(),
        jenis_kelamin: row.jenis_kelamin || 'L',
        tempat_lahir: '-',
        tanggal_lahir: '',
        agama: 'Islam',
        alamat: '-',
        status: newStudentStatus,
        tanggal_masuk: tanggalMutasi,
        tahun_masuk: tanggalMutasi.slice(0, 4),
        angkatan: tanggalMutasi.slice(0, 4),
        tahun_ajaran_masuk: row.tahun_ajaran
      } as Omit<Siswa, 'id' | 'created_at' | 'updated_at'>,
      actor,
      undefined,
      { upsertOnConflict: true, skipValidationQuery: true, skipAuditLog: true }
    );
  }

  if (isSupabaseConfigured) {
    await ensureSupabaseSessionReady();
    const supabase = getSupabase();
    if (supabase) {
      const mutPayload = {
        student_id: targetStudent.id,
        jenis_mutasi: 'keluar',
        kategori_mutasi: row.kategori_mutasi || 'Pindah sekolah',
        kelas: normKelas.rombel,
        nis: cleanTextValue(cleanNis || targetStudent.nis),
        nisn: cleanTextValue(validNisn || targetStudent.nisn),
        nama_lengkap_siswa: row.nama_siswa.trim(),
        tanggal_pindah: tanggalMutasi,
        tahun_ajaran: row.tahun_ajaran,
        alasan_pindah: cleanTextValue(row.alasan_pindah) || 'Pindah sekolah',
        sekolah_tujuan: cleanTextValue(row.sekolah_tujuan) || '-',
        npsn_sekolah: cleanTextValue(row.npsn_sekolah),
        kabupaten_sekolah: cleanTextValue(row.kabupaten_sekolah),
        provinsi_sekolah: cleanTextValue(row.provinsi_sekolah),
        no_surat_mutasi: cleanTextValue(row.no_surat),
        keterangan: cleanTextValue(row.keterangan),
        petugas_nama: actor.name,
        previous_student_status: prevStatus,
        status_mutasi: 'selesai'
      };

      let { data: mutRow, error: mutErr } = await upsertStudentMutationRow(supabase, mutPayload);

      if (mutErr || !mutRow) {
        const fallbackMut = await tryServerMutationInsert(mutPayload);
        if (fallbackMut) {
          mutRow = fallbackMut;
          mutErr = null;
        }
      }

      if (mutErr || !mutRow) {
        throw new Error(mutErr?.message || 'Gagal menyimpan catatan mutasi keluar.');
      }

      const createdMut: Mutasi = {
        id: String(mutRow.id),
        siswa_id: targetStudent.id,
        kelas: normKelas.rombel,
        nis: cleanNis || targetStudent.nis,
        nisn: validNisn || targetStudent.nisn,
        nama_siswa: row.nama_siswa.trim(),
        jenis: 'keluar',
        kategori_mutasi: row.kategori_mutasi || 'Pindah sekolah',
        tanggal_mutasi: tanggalMutasi,
        tahun_ajaran: row.tahun_ajaran,
        alasan: row.alasan_pindah || 'Pindah sekolah',
        sekolah_tujuan: row.sekolah_tujuan || '-',
        npsn_sekolah: row.npsn_sekolah,
        kabupaten_sekolah: row.kabupaten_sekolah,
        provinsi_sekolah: row.provinsi_sekolah,
        no_surat: row.no_surat,
        keterangan: row.keterangan,
        petugas_nama: actor.name,
        previous_student_status: prevStatus,
        status: 'selesai',
        created_at: String(mutRow.created_at || new Date().toISOString())
      };
      const existingMutIdx = mutasiStore.findIndex(
        m => m.id === createdMut.id || (m.siswa_id === createdMut.siswa_id && m.jenis === 'keluar')
      );
        if (existingMutIdx >= 0) {
          mutasiStore[existingMutIdx] = createdMut;
        } else {
          mutasiStore.unshift(createdMut);
        }
        return { mutation: createdMut, studentId: targetStudent.id };
      }
    }

  const localMut: Mutasi = {
    id: crypto.randomUUID(),
    siswa_id: targetStudent.id,
    kelas: normKelas.rombel,
    nis: cleanNis || targetStudent.nis,
    nisn: validNisn || targetStudent.nisn,
    nama_siswa: row.nama_siswa.trim(),
    jenis: 'keluar',
    kategori_mutasi: row.kategori_mutasi || 'Pindah sekolah',
    tanggal_mutasi: tanggalMutasi,
    tahun_ajaran: row.tahun_ajaran,
    alasan: row.alasan_pindah || 'Pindah sekolah',
    sekolah_tujuan: row.sekolah_tujuan || '-',
    npsn_sekolah: row.npsn_sekolah,
    kabupaten_sekolah: row.kabupaten_sekolah,
    provinsi_sekolah: row.provinsi_sekolah,
    no_surat: row.no_surat,
    keterangan: row.keterangan,
    petugas_nama: actor.name,
    previous_student_status: prevStatus,
    status: 'selesai',
    created_at: new Date().toISOString()
  };
  mutasiStore.unshift(localMut);
  return { mutation: localMut, studentId: targetStudent.id };
}

// ============================================================================
// STATISTIK & ANALYTICS (REAL-TIME DARI DATABASE SUPABASE)
// ============================================================================

export interface MonthlyMutationStat {
  monthIndex: number; // 0..11 (Jan..Des)
  bulanKey: string;
  bulanShort: string;
  bulanLabel: string;
  masukTransaksi: number;
  masukSiswaUnik: number;
  keluarTransaksi: number;
  keluarSiswaUnik: number;
  totalTransaksi: number;
}

export interface MonthlyNewStudentStat {
  monthIndex: number; // 0..11 (Jan..Des)
  bulanKey: string;
  bulanShort: string;
  bulanLabel: string;
  total: number;
  laki: number;
  perempuan: number;
  reguler: number;
  pindahan: number;
}

export interface MonthlyBiodataChangeStat {
  monthIndex: number; // 0..11 (Jan..Des)
  bulanKey: string;
  bulanShort: string;
  bulanLabel: string;
  diajukan: number;
  disetujui: number;
  ditolak: number;
  menunggu: number;
  siswaUnik: number;
}

export interface MonthlyAdminActivityStat {
  monthIndex: number; // 0..11 (Jan..Des)
  bulanKey: string;
  bulanShort: string;
  bulanLabel: string;
  totalAktivitas: number;
  auditLog: number;
  importData: number;
  exportData: number;
  transaksiKesiswaan: number;
}

export interface ComprehensiveAnalytics {
  // Tahun Kalender & Tahun Pelajaran Konteks
  selectedYear: string;
  availableYears: string[];
  availableAcademicYears: string[];

  // 8 Kartu Statistik Utama + Pemisahan Tegas Populasi Aktif vs Historis Lintas Angkatan
  totalSiswa: number; // Sesuai filter
  totalSeluruhSiswaHistoris: number; // Total seluruh siswa yang pernah terdaftar lintas angkatan
  siswaAktif: number; // Hanya siswa aktif / mutasi_masuk
  siswaNonaktif: number; // Lulus + mutasi_keluar + non_aktif
  totalAlumni: number; // Khusus siswa berstatus 'lulus'
  totalSiswaMutasiKeluar: number; // Khusus siswa berstatus 'mutasi_keluar'
  countLaki: number;
  countPerempuan: number;
  // Membedakan jumlah transaksi mutasi vs jumlah siswa unik (tanpa menghitung status 'dibatalkan')
  mutasiMasukTransaksi: number;
  mutasiMasukSiswaUnik: number;
  mutasiKeluarTransaksi: number;
  mutasiKeluarSiswaUnik: number;
  pendingVerifikasi: number;
  approvedVerifikasi: number;
  rejectedVerifikasi: number;

  // Ringkasan Tambahan Berbasis Waktu Bulanan (Tahun Terpilih)
  totalSiswaBaruTahunTerpilih: number;
  totalPerubahanBiodataTahunTerpilih: number;
  totalAktivitasAdminTahunTerpilih: number;
  totalImportBatchTahunTerpilih: number;
  totalExportLaporanTahunTerpilih: number;

  // Grafik Kategorikal & Lintas Angkatan
  siswaPerKelas: { kelas: string; tingkat: string; jumlah: number; laki: number; perempuan: number }[];
  siswaPerAngkatan: {
    angkatan: string;
    total: number;
    aktif: number;
    lulus: number;
    mutasiKeluar: number;
  }[];
  alumniPerTahunKelulusan: { tahunKelulusan: string; jumlah: number }[];
  siswaPerJenjangTingkat: { label: string; tingkat: string; jumlah: number; laki: number; perempuan: number }[];
  siswaPerJenjangAsal: { jenjang: string; jumlah: number; laki: number; perempuan: number }[];
  perbandinganGender: { laki: number; perempuan: number; persenLaki: number; persenPerempuan: number };
  perkembanganPerTahunAjaran: { tahunAjaran: string; jumlahSiswa: number; masuk: number; keluar: number }[];
  distribusiAsalDaerah: { daerah: string; jumlah: number; laki: number; perempuan: number }[];
  kelengkapanBiodata: {
    rataRataPersen: number;
    lengkapCount: number; // >= 90%
    cukupCount: number; // 70% - 89%
    belumLengkapCount: number; // < 70%
  };

  // Grafik Bulanan Wajib (Januari - Desember, 12 Bulan Lengkap, Bulan Kosong = 0)
  mutasiPerBulan: MonthlyMutationStat[];
  siswaBaruPerBulan: MonthlyNewStudentStat[];
  perubahanBiodataPerBulan: MonthlyBiodataChangeStat[];
  aktivitasAdminPerBulan: MonthlyAdminActivityStat[];

  // Legacy compatibility fields
  total: number;
  aktif: number;
  kelas7: number;
  kelas8: number;
  kelas9: number;
  mutasiMasuk: number;
  mutasiKeluar: number;
  rombelMap: Record<string, number>;
}

const MONTH_NAMES_ID = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des'
];

const MONTH_FULL_NAMES_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember'
];

const jakartaDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

export function getCurrentJakartaYear(): string {
  try {
    const formatted = jakartaDateFormatter.format(new Date());
    return formatted.slice(0, 4);
  } catch {
    return String(new Date().getFullYear());
  }
}

/**
 * Mengurai string tanggal DATE ('YYYY-MM-DD') maupun TIMESTAMPTZ ISO ('2026-07-31T18:30:00Z')
 * secara akurat ke tahun dan bulan kalender dalam zona waktu Asia/Jakarta (WIB / UTC+7).
 */
export function parseJakartaDateParts(dateInput?: string | null): {
  year: number;
  yearStr: string;
  monthIndex: number; // 0..11 (Jan=0 .. Des=11)
  monthStr: string; // '01'..'12'
  yearMonth: string; // 'YYYY-MM'
  dateStr: string; // 'YYYY-MM-DD'
} | null {
  if (!dateInput || typeof dateInput !== 'string') return null;
  const trimmed = dateInput.trim();
  if (!trimmed || trimmed === '-') return null;

  // 1. Format YYYY-MM-DD atau YYYY/MM/DD (kolom DATE PostgreSQL seperti tanggal_pindah / tanggal_masuk)
  const dateOnlyMatch = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/.exec(trimmed);
  if (dateOnlyMatch) {
    const yr = parseInt(dateOnlyMatch[1], 10);
    const mo = parseInt(dateOnlyMatch[2], 10);
    const dy = parseInt(dateOnlyMatch[3], 10);
    if (yr >= 1990 && yr <= 2100 && mo >= 1 && mo <= 12 && dy >= 1 && dy <= 31) {
      const monthStr = String(mo).padStart(2, '0');
      const dayStr = String(dy).padStart(2, '0');
      return {
        year: yr,
        yearStr: dateOnlyMatch[1],
        monthIndex: mo - 1,
        monthStr,
        yearMonth: `${dateOnlyMatch[1]}-${monthStr}`,
        dateStr: `${dateOnlyMatch[1]}-${monthStr}-${dayStr}`
      };
    }
  }

  // 2. Format DD/MM/YYYY atau DD-MM-YYYY (mendukung 1 atau 2 digit tanggal/bulan)
  const dmyMatch = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(trimmed);
  if (dmyMatch) {
    const yr = parseInt(dmyMatch[3], 10);
    const mo = parseInt(dmyMatch[2], 10);
    const dy = parseInt(dmyMatch[1], 10);
    if (yr >= 1990 && yr <= 2100 && mo >= 1 && mo <= 12 && dy >= 1 && dy <= 31) {
      const monthStr = String(mo).padStart(2, '0');
      const dayStr = String(dy).padStart(2, '0');
      const dateStr = `${dmyMatch[3]}-${monthStr}-${dayStr}`;
      return {
        year: yr,
        yearStr: dmyMatch[3],
        monthIndex: mo - 1,
        monthStr,
        yearMonth: `${dmyMatch[3]}-${monthStr}`,
        dateStr
      };
    }
  }

  // 2b. Format nama bulan Indonesia (mis. "15 Juli 2025", "10 Agustus 2026")
  const normalizedFromExcel = normalizeExcelDate(trimmed);
  if (normalizedFromExcel && /^\d{4}-\d{2}-\d{2}$/.test(normalizedFromExcel)) {
    const [yStr, mStr] = normalizedFromExcel.split('-');
    const yr = parseInt(yStr, 10);
    const mo = parseInt(mStr, 10);
    if (yr >= 1990 && yr <= 2100 && mo >= 1 && mo <= 12) {
      return {
        year: yr,
        yearStr: yStr,
        monthIndex: mo - 1,
        monthStr: mStr,
        yearMonth: `${yStr}-${mStr}`,
        dateStr: normalizedFromExcel
      };
    }
  }

  // 3. Format ISO Timestamp (TIMESTAMPTZ seperti created_at, submitted_at, reviewed_at, completed_at)
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;

  try {
    const formatted = jakartaDateFormatter.format(parsed); // 'YYYY-MM-DD' in Asia/Jakarta
    const parts = formatted.split('-');
    if (parts.length === 3) {
      const yr = parseInt(parts[0], 10);
      const mo = parseInt(parts[1], 10);
      if (yr >= 1990 && yr <= 2100 && mo >= 1 && mo <= 12) {
        return {
          year: yr,
          yearStr: parts[0],
          monthIndex: mo - 1,
          monthStr: parts[1],
          yearMonth: `${parts[0]}-${parts[1]}`,
          dateStr: formatted
        };
      }
    }
  } catch {
    // Fallback UTC+7 manual calculation if Intl fails
    const jktTime = new Date(parsed.getTime() + 7 * 60 * 60 * 1000);
    const yr = jktTime.getUTCFullYear();
    const mo = jktTime.getUTCMonth() + 1;
    const dy = jktTime.getUTCDate();
    if (yr >= 1990 && yr <= 2100) {
      const yearStr = String(yr);
      const monthStr = String(mo).padStart(2, '0');
      const dayStr = String(dy).padStart(2, '0');
      return {
        year: yr,
        yearStr,
        monthIndex: mo - 1,
        monthStr,
        yearMonth: `${yearStr}-${monthStr}`,
        dateStr: `${yearStr}-${monthStr}-${dayStr}`
      };
    }
  }

  return null;
}

export interface AnalyticsExtraSources {
  auditLogs?: AuditLog[];
  importBatches?: ImportBatchRecord[];
  exportLogs?: ExportLogRecord[];
}

export function computeFilteredAnalytics(
  rawStudents: Siswa[],
  rawMutations: Mutasi[],
  rawChanges: PerubahanBiodata[],
  filters?: Partial<DashboardFilterState>,
  extraSources?: AnalyticsExtraSources
): ComprehensiveAnalytics {
  const defaultJakartaYear = getCurrentJakartaYear();
  const fTahunAjaran = filters?.tahunAjaran || 'all';
  const fSelectedYear = filters?.selectedYear || 'all';
  const fSemesterPeriod = filters?.semesterPeriod || 'all';
  const fSelectedMonth = filters?.selectedMonth || 'all';
  const fAngkatan = filters?.angkatan || 'all';
  const fKelas = filters?.kelas || 'all';
  const fJenjang = filters?.jenjang || 'all';
  const fGender = filters?.jenisKelamin || 'all';
  const fStatus = filters?.status || 'all';
  const fDateFrom = filters?.dateFrom || '';
  const fDateTo = filters?.dateTo || '';

  // ==========================================================================
  // 0. DEDUPLIKASI DATA SUMBER (CEGAH PENGHITUNGAN GANDA)
  // ==========================================================================
  const seenStudentKeys = new Set<string>();
  const students: Siswa[] = [];
  for (const s of rawStudents) {
    if (!s) continue;
    const idKey = s.id || s.nisn || s.nis;
    if (!idKey || seenStudentKeys.has(idKey)) continue;
    seenStudentKeys.add(idKey);
    students.push(s);
  }

  // Gabungkan catatan mutasi dari tabel student_mutations dengan siswa yang berstatus mutasi_masuk / mutasi_keluar
  const combinedRawMutations = mergeMutationsWithStudentStatus(rawMutations || [], students);

  // Deduplikasi Mutasi & Abaikan Transaksi Batal (status === 'dibatalkan')
  const seenMutationIds = new Set<string>();
  const seenMutationSignatures = new Set<string>();
  const nonCancelledMutations: Mutasi[] = [];
  for (const m of combinedRawMutations) {
    if (!m || m.status === 'dibatalkan') continue;
    if (m.id && seenMutationIds.has(m.id)) continue;
    const studentIdentity = (m.siswa_id || m.nisn || m.nis || m.nama_siswa || m.id).trim().toLowerCase();
    const fallbackDateFromTa = m.tahun_ajaran ? `${m.tahun_ajaran.split('/')[0]}-07-15` : `${defaultJakartaYear}-07-15`;
    const resolvedDateParts =
      parseJakartaDateParts(m.tanggal_mutasi) ||
      parseJakartaDateParts(m.created_at) ||
      parseJakartaDateParts(fallbackDateFromTa);
    const datePart = resolvedDateParts?.dateStr || m.tanggal_mutasi || fallbackDateFromTa;
    const sig = `${studentIdentity}|${m.jenis}|${datePart}|${m.kategori_mutasi || ''}`;
    if (seenMutationSignatures.has(sig)) continue;
    if (m.id) seenMutationIds.add(m.id);
    seenMutationSignatures.add(sig);
    nonCancelledMutations.push({
      ...m,
      nama_siswa: toUpperStudentName(m.nama_siswa),
      tanggal_mutasi: datePart
    });
  }

  // Deduplikasi Pengajuan Perubahan Biodata & Abaikan Draft / Cancelled
  const seenChangeIds = new Set<string>();
  const validChangesAll: PerubahanBiodata[] = [];
  for (const c of rawChanges) {
    if (!c || c.status === 'draft' || c.status === 'cancelled') continue;
    if (c.id && seenChangeIds.has(c.id)) continue;
    if (c.id) seenChangeIds.add(c.id);
    validChangesAll.push(c);
  }

  // Deduplikasi Sumber Aktivitas Administrasi Lainnya
  const rawAudits = extraSources?.auditLogs ?? auditLogsStore;
  const seenAuditIds = new Set<string>();
  const dedupedAudits: AuditLog[] = [];
  for (const a of rawAudits) {
    if (!a || (a.id && seenAuditIds.has(a.id))) continue;
    if (a.id) seenAuditIds.add(a.id);
    dedupedAudits.push(a);
  }

  const rawImports = extraSources?.importBatches ?? importBatchesStore;
  const seenImportIds = new Set<string>();
  const dedupedImports: ImportBatchRecord[] = [];
  for (const b of rawImports) {
    if (!b || b.status === 'failed' || (b.id && seenImportIds.has(b.id))) continue;
    if (b.id) seenImportIds.add(b.id);
    dedupedImports.push(b);
  }

  const rawExports = extraSources?.exportLogs ?? exportLogsStore;
  const seenExportIds = new Set<string>();
  const dedupedExports: ExportLogRecord[] = [];
  for (const e of rawExports) {
    if (!e || (e.id && seenExportIds.has(e.id))) continue;
    if (e.id) seenExportIds.add(e.id);
    dedupedExports.push(e);
  }

  // ==========================================================================
  // KUMPULKAN DAFTAR TAHUN KALENDER & TAHUN PELAJARAN YANG TERSEDIA
  // ==========================================================================
  const yearsSet = new Set<string>([
    defaultJakartaYear,
    String(Number(defaultJakartaYear) - 1),
    String(Number(defaultJakartaYear) - 2),
    '2024',
    '2025',
    '2026'
  ]);
  const taSet = new Set<string>(['2023/2024', '2024/2025', '2025/2026', '2026/2027']);

  students.forEach(s => {
    const angk = s.angkatan || s.tahun_masuk;
    if (angk && /^\d{4}$/.test(angk)) {
      yearsSet.add(angk);
      const yr = parseInt(angk, 10);
      if (yr >= 2018 && yr <= 2035) taSet.add(`${yr}/${yr + 1}`);
    }
    const pMasuk = parseJakartaDateParts(s.tanggal_masuk || s.created_at);
    if (pMasuk) yearsSet.add(pMasuk.yearStr);
    if (s.tahun_ajaran_masuk) taSet.add(s.tahun_ajaran_masuk);
  });

  nonCancelledMutations.forEach(m => {
    const pMut = parseJakartaDateParts(m.tanggal_mutasi || m.created_at);
    if (pMut) yearsSet.add(pMut.yearStr);
    if (m.tahun_ajaran) taSet.add(m.tahun_ajaran);
  });

  validChangesAll.forEach(c => {
    const pSub = parseJakartaDateParts(c.submitted_at);
    if (pSub) yearsSet.add(pSub.yearStr);
  });

  dedupedAudits.forEach(a => {
    const pAud = parseJakartaDateParts(a.created_at);
    if (pAud) yearsSet.add(pAud.yearStr);
  });

  const availableYears = Array.from(yearsSet).sort((a, b) => b.localeCompare(a));
  const availableAcademicYears = Array.from(taSet).sort();

  // Helper apakah suatu tanggal masuk dalam filter Tahun Kalender, Semester, Bulan, & Rentang Tanggal
  const matchesPeriodFilters = (
    dateParts: ReturnType<typeof parseJakartaDateParts>,
    applyYearFilter = true
  ): boolean => {
    if (!dateParts) return false;
    if (applyYearFilter && fSelectedYear !== 'all' && dateParts.yearStr !== fSelectedYear) {
      return false;
    }
    if (fSemesterPeriod === 'ganjil' && dateParts.monthIndex < 6) {
      // Semester Ganjil: Juli (index 6) - Desember (index 11)
      return false;
    }
    if (fSemesterPeriod === 'genap' && dateParts.monthIndex > 5) {
      // Semester Genap: Januari (index 0) - Juni (index 5)
      return false;
    }
    if (fSelectedMonth !== 'all' && dateParts.monthStr !== fSelectedMonth) {
      return false;
    }
    if (fDateFrom && dateParts.dateStr < fDateFrom) return false;
    if (fDateTo && dateParts.dateStr > fDateTo) return false;
    return true;
  };

  // Populasi Historis Lintas Angkatan (tidak terpotong filter status)
  const totalSeluruhSiswaHistoris = students.length;
  const totalAlumniGlobal = students.filter(s => s.status === 'lulus').length;
  const totalMutasiKeluarGlobal = students.filter(s => s.status === 'mutasi_keluar').length;

  // ==========================================================================
  // 1. FILTER POPULASI SISWA
  // ==========================================================================
  const filteredStudents = students.filter(s => {
    const sAngkatan = s.angkatan || (s.tanggal_masuk || '').slice(0, 4) || s.tahun_masuk;
    if (fAngkatan !== 'all' && sAngkatan !== fAngkatan) return false;
    if (fKelas !== 'all' && s.rombel !== fKelas) return false;
    if (fJenjang !== 'all') {
      if (['7', '8', '9'].includes(fJenjang) && s.tingkat_kelas !== fJenjang) return false;
      if (
        ['SD', 'MI', 'Paket A'].includes(fJenjang) &&
        (s.jenjang_asal || 'SD').toUpperCase() !== fJenjang.toUpperCase()
      ) {
        return false;
      }
    }
    if (fGender !== 'all' && s.jenis_kelamin !== fGender) return false;
    if (fStatus !== 'all') {
      if (fStatus === 'aktif_group') {
        if (s.status !== 'aktif' && s.status !== 'mutasi_masuk') return false;
      } else if (fStatus === 'nonaktif_group') {
        if (s.status === 'aktif' || s.status === 'mutasi_masuk') return false;
      } else if (s.status !== fStatus) {
        return false;
      }
    }
    if (fTahunAjaran !== 'all') {
      const startYear = fTahunAjaran.split('/')[0];
      const studentYear = s.angkatan || (s.tanggal_masuk || '').slice(0, 4) || s.tahun_masuk;
      if (startYear && studentYear && studentYear !== startYear) return false;
    }
    const masukParts = parseJakartaDateParts(s.tanggal_masuk);
    if (fDateFrom && masukParts && masukParts.dateStr < fDateFrom) return false;
    if (fDateTo && masukParts && masukParts.dateStr > fDateTo) return false;
    return true;
  });

  // ==========================================================================
  // 2. FILTER TRANSAKSI MUTASI (TANPA STATUS 'dibatalkan')
  // ==========================================================================
  const validMutations = nonCancelledMutations.filter(m => {
    if (fKelas !== 'all' && m.kelas !== fKelas) return false;
    if (fJenjang !== 'all' && ['7', '8', '9'].includes(fJenjang)) {
      if (!m.kelas.startsWith(fJenjang)) return false;
    }
    if (fTahunAjaran !== 'all' && (m.tahun_ajaran || '2025/2026') !== fTahunAjaran) return false;
    const mParts = parseJakartaDateParts(m.tanggal_mutasi || m.created_at);
    if (!matchesPeriodFilters(mParts, fSelectedYear !== 'all')) return false;
    return true;
  });

  // ==========================================================================
  // 3. FILTER PENGAJUAN PERUBAHAN BIODATA
  // ==========================================================================
  const filteredChanges = validChangesAll.filter(c => {
    if (fKelas !== 'all' && c.kelas !== fKelas) return false;
    if (fJenjang !== 'all' && ['7', '8', '9'].includes(fJenjang)) {
      if (!c.kelas.startsWith(fJenjang)) return false;
    }
    const cParts = parseJakartaDateParts(c.submitted_at || c.verified_at);
    if (!matchesPeriodFilters(cParts, fSelectedYear !== 'all')) return false;
    return true;
  });

  const totalSiswa = filteredStudents.length;
  const activeList = filteredStudents.filter(
    s => s.status === 'aktif' || s.status === 'mutasi_masuk'
  );
  const nonActiveList = filteredStudents.filter(
    s => s.status !== 'aktif' && s.status !== 'mutasi_masuk'
  );
  const alumniList = filteredStudents.filter(s => s.status === 'lulus');
  const mutasiKeluarList = filteredStudents.filter(s => s.status === 'mutasi_keluar');

  const siswaAktif = activeList.length;
  const siswaNonaktif = nonActiveList.length;
  const totalAlumni = fStatus === 'all' ? totalAlumniGlobal : alumniList.length;
  const totalSiswaMutasiKeluar =
    fStatus === 'all' ? totalMutasiKeluarGlobal : mutasiKeluarList.length;

  const countLaki = filteredStudents.filter(s => s.jenis_kelamin === 'L').length;
  const countPerempuan = filteredStudents.filter(s => s.jenis_kelamin === 'P').length;

  // Bedakan jumlah transaksi mutasi vs jumlah siswa unik
  const masukMutations = validMutations.filter(m => m.jenis === 'masuk');
  const keluarMutations = validMutations.filter(m => m.jenis === 'keluar');

  const mutasiMasukTransaksi = masukMutations.length;
  const mutasiMasukSiswaUnik = new Set(
    masukMutations.map(m => m.siswa_id || m.nisn || m.nis || m.id)
  ).size;

  const mutasiKeluarTransaksi = keluarMutations.length;
  const mutasiKeluarSiswaUnik = new Set(
    keluarMutations.map(m => m.siswa_id || m.nisn || m.nis || m.id)
  ).size;

  const pendingVerifikasi = filteredChanges.filter(c => c.status === 'pending').length;
  const approvedVerifikasi = filteredChanges.filter(
    c => c.status === 'approved' || c.status === 'partially_approved'
  ).length;
  const rejectedVerifikasi = filteredChanges.filter(c => c.status === 'rejected').length;

  // ==========================================================================
  // GRAFIK KATEGORIKAL: SISWA PER KELAS, ANGKATAN, JENJANG, GENDER, ASAL SD/MI
  // ==========================================================================
  const studentsForActiveClassChart =
    fStatus === 'all' || fStatus === 'aktif_group' ? activeList : filteredStudents;

  const classSet = new Set<string>();
  studentsForActiveClassChart.forEach(s => {
    if (s.rombel) classSet.add(s.rombel);
  });
  if (classSet.size === 0) {
    ['7A', '7B', '7C', '7D', '8A', '8B', '8C', '8D', '9A', '9B', '9C', '9D'].forEach(k =>
      classSet.add(k)
    );
  }

  const rombelMap: Record<string, number> = {};
  const siswaPerKelas = Array.from(classSet)
    .sort((a, b) => a.localeCompare(b, 'id', { numeric: true }))
    .map(kls => {
      const inClass = studentsForActiveClassChart.filter(s => s.rombel === kls);
      rombelMap[kls] = inClass.length;
      return {
        kelas: kls,
        tingkat: kls.charAt(0) || '7',
        jumlah: inClass.length,
        laki: inClass.filter(s => s.jenis_kelamin === 'L').length,
        perempuan: inClass.filter(s => s.jenis_kelamin === 'P').length
      };
    });

  // Statistik Siswa per Angkatan (Cohort)
  const angkatanSet = new Set<string>(['2024', '2025', '2026']);
  students.forEach(s => {
    const angk = s.angkatan || (s.tanggal_masuk || '').slice(0, 4) || s.tahun_masuk;
    if (angk && /^\d{4}$/.test(angk)) angkatanSet.add(angk);
  });

  const siswaPerAngkatan = Array.from(angkatanSet)
    .sort()
    .map(angk => {
      const inAngk = students.filter(s => {
        const sAngk = s.angkatan || (s.tanggal_masuk || '').slice(0, 4) || s.tahun_masuk || '2025';
        if (sAngk !== angk) return false;
        if (fKelas !== 'all' && s.rombel !== fKelas) return false;
        if (fGender !== 'all' && s.jenis_kelamin !== fGender) return false;
        return true;
      });
      return {
        angkatan: angk,
        total: inAngk.length,
        aktif: inAngk.filter(s => s.status === 'aktif' || s.status === 'mutasi_masuk').length,
        lulus: inAngk.filter(s => s.status === 'lulus').length,
        mutasiKeluar: inAngk.filter(s => s.status === 'mutasi_keluar').length
      };
    });

  // Statistik Alumni per Tahun Kelulusan
  const lulusYearMap: Record<string, number> = {};
  students
    .filter(s => s.status === 'lulus')
    .forEach(s => {
      const angkNum = parseInt(s.angkatan || s.tahun_masuk || '2023', 10);
      const defaultGradYear = Number.isFinite(angkNum) ? String(angkNum + 3) : '2026';
      const thLulus = s.tahun_lulus || defaultGradYear;
      lulusYearMap[thLulus] = (lulusYearMap[thLulus] || 0) + 1;
    });
  const alumniPerTahunKelulusan = Object.entries(lulusYearMap)
    .map(([tahunKelulusan, jumlah]) => ({ tahunKelulusan, jumlah }))
    .sort((a, b) => a.tahunKelulusan.localeCompare(b.tahunKelulusan));

  // Siswa berdasarkan Tingkat Kelas (7, 8, 9) & Gender per Tingkat
  const k7List = studentsForActiveClassChart.filter(s => s.tingkat_kelas === '7');
  const k8List = studentsForActiveClassChart.filter(s => s.tingkat_kelas === '8');
  const k9List = studentsForActiveClassChart.filter(s => s.tingkat_kelas === '9');

  const kelas7 = k7List.length;
  const kelas8 = k8List.length;
  const kelas9 = k9List.length;

  const siswaPerJenjangTingkat = [
    {
      label: 'Kelas 7 (VII)',
      tingkat: '7',
      jumlah: kelas7,
      laki: k7List.filter(s => s.jenis_kelamin === 'L').length,
      perempuan: k7List.filter(s => s.jenis_kelamin === 'P').length
    },
    {
      label: 'Kelas 8 (VIII)',
      tingkat: '8',
      jumlah: kelas8,
      laki: k8List.filter(s => s.jenis_kelamin === 'L').length,
      perempuan: k8List.filter(s => s.jenis_kelamin === 'P').length
    },
    {
      label: 'Kelas 9 (IX)',
      tingkat: '9',
      jumlah: kelas9,
      laki: k9List.filter(s => s.jenis_kelamin === 'L').length,
      perempuan: k9List.filter(s => s.jenis_kelamin === 'P').length
    }
  ];

  // Distribusi Asal Sekolah (SD / MI / Paket A)
  const jenjangAsalBuckets: Record<string, { jumlah: number; laki: number; perempuan: number }> = {
    SD: { jumlah: 0, laki: 0, perempuan: 0 },
    MI: { jumlah: 0, laki: 0, perempuan: 0 },
    'Paket A': { jumlah: 0, laki: 0, perempuan: 0 }
  };

  filteredStudents.forEach(s => {
    const rawJ = (s.jenjang_asal || 'SD').trim().toUpperCase();
    const key = rawJ === 'MI' ? 'MI' : rawJ.includes('PAKET') ? 'Paket A' : 'SD';
    jenjangAsalBuckets[key].jumlah += 1;
    if (s.jenis_kelamin === 'L') jenjangAsalBuckets[key].laki += 1;
    else jenjangAsalBuckets[key].perempuan += 1;
  });

  const siswaPerJenjangAsal = Object.entries(jenjangAsalBuckets).map(([jenjang, val]) => ({
    jenjang,
    jumlah: val.jumlah,
    laki: val.laki,
    perempuan: val.perempuan
  }));

  // Perbandingan Jenis Kelamin
  const persenLaki = totalSiswa > 0 ? Math.round((countLaki / totalSiswa) * 100) : 0;
  const persenPerempuan = totalSiswa > 0 ? 100 - persenLaki : 0;

  // Perkembangan Siswa per Tahun Ajaran
  const perkembanganPerTahunAjaran = availableAcademicYears.map(ta => {
    const startYr = ta.split('/')[0];
    const siswaInTa = filteredStudents.filter(s => {
      const y = s.angkatan || (s.tanggal_masuk || '').slice(0, 4) || s.tahun_masuk;
      return y === startYr;
    }).length;
    const masukInTa = nonCancelledMutations.filter(
      m => m.jenis === 'masuk' && (m.tahun_ajaran || '2025/2026') === ta
    ).length;
    const keluarInTa = nonCancelledMutations.filter(
      m => m.jenis === 'keluar' && (m.tahun_ajaran || '2025/2026') === ta
    ).length;
    return {
      tahunAjaran: ta,
      jumlahSiswa: siswaInTa,
      masuk: masukInTa,
      keluar: keluarInTa
    };
  });

  // ==========================================================================
  // GRAFIK BERBASIS WAKTU BULANAN (WAJIB JANUARI - DESEMBER, 12 BULAN = 0..11)
  // ==========================================================================
  const yearDisplay = fSelectedYear === 'all' ? 'Semua Tahun' : fSelectedYear;

  // A. Mutasi Masuk & Mutasi Keluar per Bulan (Jan-Des)
  const mutasiBuckets = Array.from({ length: 12 }, (_, idx) => {
    const mm = String(idx + 1).padStart(2, '0');
    const key = fSelectedYear === 'all' ? mm : `${fSelectedYear}-${mm}`;
    return {
      monthIndex: idx,
      bulanKey: key,
      bulanShort: MONTH_NAMES_ID[idx],
      bulanLabel: `${MONTH_FULL_NAMES_ID[idx]} ${yearDisplay}`,
      masukTransaksi: 0,
      masukSet: new Set<string>(),
      keluarTransaksi: 0,
      keluarSet: new Set<string>()
    };
  });

  validMutations.forEach(m => {
    const parts = parseJakartaDateParts(m.tanggal_mutasi || m.created_at);
    if (!parts) return;
    const bucket = mutasiBuckets[parts.monthIndex];
    if (!bucket) return;
    const uniqueKey = m.siswa_id || m.nisn || m.nis || m.id;
    if (m.jenis === 'masuk') {
      bucket.masukTransaksi += 1;
      bucket.masukSet.add(uniqueKey);
    } else {
      bucket.keluarTransaksi += 1;
      bucket.keluarSet.add(uniqueKey);
    }
  });

  const mutasiPerBulan: MonthlyMutationStat[] = mutasiBuckets.map(b => ({
    monthIndex: b.monthIndex,
    bulanKey: b.bulanKey,
    bulanShort: b.bulanShort,
    bulanLabel: b.bulanLabel,
    masukTransaksi: b.masukTransaksi,
    masukSiswaUnik: b.masukSet.size,
    keluarTransaksi: b.keluarTransaksi,
    keluarSiswaUnik: b.keluarSet.size,
    totalTransaksi: b.masukTransaksi + b.keluarTransaksi
  }));

  // B. Siswa Baru Terdaftar per Bulan (Jan-Des) berdasarkan tanggal_masuk / fallback created_at
  const siswaBaruBuckets: MonthlyNewStudentStat[] = Array.from({ length: 12 }, (_, idx) => {
    const mm = String(idx + 1).padStart(2, '0');
    const key = fSelectedYear === 'all' ? mm : `${fSelectedYear}-${mm}`;
    return {
      monthIndex: idx,
      bulanKey: key,
      bulanShort: MONTH_NAMES_ID[idx],
      bulanLabel: `${MONTH_FULL_NAMES_ID[idx]} ${yearDisplay}`,
      total: 0,
      laki: 0,
      perempuan: 0,
      reguler: 0,
      pindahan: 0
    };
  });

  filteredStudents.forEach(s => {
    const dateSource = s.tanggal_masuk || s.created_at;
    const parts = parseJakartaDateParts(dateSource);
    if (!parts) return;
    if (!matchesPeriodFilters(parts, fSelectedYear !== 'all')) return;
    const bucket = siswaBaruBuckets[parts.monthIndex];
    if (!bucket) return;
    bucket.total += 1;
    if (s.jenis_kelamin === 'L') bucket.laki += 1;
    else bucket.perempuan += 1;
    if (s.status === 'mutasi_masuk') bucket.pindahan += 1;
    else bucket.reguler += 1;
  });

  const totalSiswaBaruTahunTerpilih = siswaBaruBuckets.reduce((acc, b) => acc + b.total, 0);

  // C. Perubahan Biodata per Bulan (Jan-Des) berdasarkan submitted_at
  const perubahanBuckets = Array.from({ length: 12 }, (_, idx) => {
    const mm = String(idx + 1).padStart(2, '0');
    const key = fSelectedYear === 'all' ? mm : `${fSelectedYear}-${mm}`;
    return {
      monthIndex: idx,
      bulanKey: key,
      bulanShort: MONTH_NAMES_ID[idx],
      bulanLabel: `${MONTH_FULL_NAMES_ID[idx]} ${yearDisplay}`,
      diajukan: 0,
      disetujui: 0,
      ditolak: 0,
      menunggu: 0,
      siswaSet: new Set<string>()
    };
  });

  filteredChanges.forEach(c => {
    const parts = parseJakartaDateParts(c.submitted_at || c.verified_at);
    if (!parts) return;
    const bucket = perubahanBuckets[parts.monthIndex];
    if (!bucket) return;
    bucket.diajukan += 1;
    bucket.siswaSet.add(c.siswa_id || c.nisn || c.nis || c.id);
    if (c.status === 'approved' || c.status === 'partially_approved') {
      bucket.disetujui += 1;
    } else if (c.status === 'rejected') {
      bucket.ditolak += 1;
    } else if (c.status === 'pending') {
      bucket.menunggu += 1;
    }
  });

  const perubahanBiodataPerBulan: MonthlyBiodataChangeStat[] = perubahanBuckets.map(b => ({
    monthIndex: b.monthIndex,
    bulanKey: b.bulanKey,
    bulanShort: b.bulanShort,
    bulanLabel: b.bulanLabel,
    diajukan: b.diajukan,
    disetujui: b.disetujui,
    ditolak: b.ditolak,
    menunggu: b.menunggu,
    siswaUnik: b.siswaSet.size
  }));

  const totalPerubahanBiodataTahunTerpilih = perubahanBiodataPerBulan.reduce(
    (acc, b) => acc + b.diajukan,
    0
  );

  // D. Aktivitas Administrasi & Transaksi Lainnya per Bulan (Jan-Des)
  // Menggabungkan Audit Log, Import Batch, Export Laporan, serta Transaksi Mutasi/Verifikasi
  const adminActivityBuckets: MonthlyAdminActivityStat[] = Array.from({ length: 12 }, (_, idx) => {
    const mm = String(idx + 1).padStart(2, '0');
    const key = fSelectedYear === 'all' ? mm : `${fSelectedYear}-${mm}`;
    return {
      monthIndex: idx,
      bulanKey: key,
      bulanShort: MONTH_NAMES_ID[idx],
      bulanLabel: `${MONTH_FULL_NAMES_ID[idx]} ${yearDisplay}`,
      totalAktivitas: 0,
      auditLog: 0,
      importData: 0,
      exportData: 0,
      transaksiKesiswaan: 0
    };
  });

  dedupedAudits.forEach(a => {
    const parts = parseJakartaDateParts(a.created_at);
    if (!matchesPeriodFilters(parts, fSelectedYear !== 'all') || !parts) return;
    const b = adminActivityBuckets[parts.monthIndex];
    if (b) {
      b.auditLog += 1;
      b.totalAktivitas += 1;
    }
  });

  dedupedImports.forEach(imp => {
    const parts = parseJakartaDateParts(imp.completed_at || imp.created_at);
    if (!matchesPeriodFilters(parts, fSelectedYear !== 'all') || !parts) return;
    const b = adminActivityBuckets[parts.monthIndex];
    if (b) {
      b.importData += 1;
      b.totalAktivitas += 1;
    }
  });

  dedupedExports.forEach(exp => {
    const parts = parseJakartaDateParts(exp.created_at);
    if (!matchesPeriodFilters(parts, fSelectedYear !== 'all') || !parts) return;
    const b = adminActivityBuckets[parts.monthIndex];
    if (b) {
      b.exportData += 1;
      b.totalAktivitas += 1;
    }
  });

  // Tambahkan transaksi mutasi sah & verifikasi perubahan ke metrik transaksiKesiswaan
  for (let i = 0; i < 12; i++) {
    const kesiswaanCount =
      mutasiPerBulan[i].totalTransaksi + perubahanBiodataPerBulan[i].diajukan;
    adminActivityBuckets[i].transaksiKesiswaan = kesiswaanCount;
    adminActivityBuckets[i].totalAktivitas += kesiswaanCount;
  }

  const totalAktivitasAdminTahunTerpilih = adminActivityBuckets.reduce(
    (acc, b) => acc + b.totalAktivitas,
    0
  );
  const totalImportBatchTahunTerpilih = adminActivityBuckets.reduce(
    (acc, b) => acc + b.importData,
    0
  );
  const totalExportLaporanTahunTerpilih = adminActivityBuckets.reduce(
    (acc, b) => acc + b.exportData,
    0
  );

  // Distribusi Asal Daerah (Kota/Kabupaten Domisili / Asal Sekolah)
  // Otomatis deteksi dari Alamat Lengkap (alamat / kecamatan / kelurahan) jika kab_kota belum terisi,
  // serta hapus awalan "Kab." dan tetapkan awalan "Kota".
  const daerahMap: Record<string, { jumlah: number; laki: number; perempuan: number }> = {};
  filteredStudents.forEach(s => {
    const resolvedDaerah = resolveAndNormalizeDaerahSiswa(s);
    const daerah = resolvedDaerah || 'Belum Diisi';
    if (!daerahMap[daerah]) {
      daerahMap[daerah] = { jumlah: 0, laki: 0, perempuan: 0 };
    }
    daerahMap[daerah].jumlah += 1;
    if (s.jenis_kelamin === 'L') daerahMap[daerah].laki += 1;
    else daerahMap[daerah].perempuan += 1;
  });

  const distribusiAsalDaerah = Object.entries(daerahMap)
    .map(([daerah, val]) => ({
      daerah,
      jumlah: val.jumlah,
      laki: val.laki,
      perempuan: val.perempuan
    }))
    .sort((a, b) => {
      if (a.daerah === 'Belum Diisi') return 1;
      if (b.daerah === 'Belum Diisi') return -1;
      return b.jumlah - a.jumlah;
    })
    .slice(0, 10);

  // Kelengkapan Biodata (59 Kolom)
  let totalPersen = 0;
  let lengkapCount = 0;
  let cukupCount = 0;
  let belumLengkapCount = 0;

  filteredStudents.forEach(s => {
    const comp = calculateBiodataCompleteness(s);
    totalPersen += comp.percentage;
    if (comp.percentage >= 90) lengkapCount++;
    else if (comp.percentage >= 70) cukupCount++;
    else belumLengkapCount++;
  });

  const rataRataPersen = totalSiswa > 0 ? Math.round(totalPersen / totalSiswa) : 0;

  return {
    selectedYear: fSelectedYear,
    availableYears,
    availableAcademicYears,
    totalSiswa,
    totalSeluruhSiswaHistoris,
    siswaAktif,
    siswaNonaktif,
    totalAlumni,
    totalSiswaMutasiKeluar,
    countLaki,
    countPerempuan,
    mutasiMasukTransaksi,
    mutasiMasukSiswaUnik,
    mutasiKeluarTransaksi,
    mutasiKeluarSiswaUnik,
    pendingVerifikasi,
    approvedVerifikasi,
    rejectedVerifikasi,
    totalSiswaBaruTahunTerpilih,
    totalPerubahanBiodataTahunTerpilih,
    totalAktivitasAdminTahunTerpilih,
    totalImportBatchTahunTerpilih,
    totalExportLaporanTahunTerpilih,
    siswaPerKelas,
    siswaPerAngkatan,
    alumniPerTahunKelulusan,
    siswaPerJenjangTingkat,
    siswaPerJenjangAsal,
    perbandinganGender: {
      laki: countLaki,
      perempuan: countPerempuan,
      persenLaki,
      persenPerempuan
    },
    perkembanganPerTahunAjaran,
    mutasiPerBulan,
    siswaBaruPerBulan: siswaBaruBuckets,
    perubahanBiodataPerBulan,
    aktivitasAdminPerBulan: adminActivityBuckets,
    distribusiAsalDaerah,
    kelengkapanBiodata: {
      rataRataPersen,
      lengkapCount,
      cukupCount,
      belumLengkapCount
    },
    total: totalSiswa,
    aktif: siswaAktif,
    kelas7,
    kelas8,
    kelas9,
    mutasiMasuk: mutasiMasukTransaksi,
    mutasiKeluar: mutasiKeluarTransaksi,
    rombelMap
  };
}

/**
 * Mengambil seluruh sumber data analitik secara paralel dan efisien untuk Dashboard & Statistik
 * dengan tetap mematuhi RLS Supabase, menghindari query berulang 59 kolom jika cache sudah terisi,
 * dan tanpa mengekspos service_role key.
 */
export async function getAnalyticsDataBundle(forceRefresh = false): Promise<{
  students: Siswa[];
  mutations: Mutasi[];
  proposals: PerubahanBiodata[];
  auditLogs: AuditLog[];
  importBatches: ImportBatchRecord[];
  exportLogs: ExportLogRecord[];
}> {
  const studentsPromise =
    !forceRefresh && siswaStore.length > 0 ? Promise.resolve([...siswaStore]) : getSiswaList();

  const [students, mutations, proposals, auditLogs, importBatches, exportLogs] = await Promise.all([
    studentsPromise,
    getMutasiList().catch(() => []),
    getPerubahanList().catch(() => []),
    getAuditLogs().catch(() => []),
    getImportBatches().catch(() => []),
    getExportLogsList().catch(() => [])
  ]);

  return {
    students,
    mutations,
    proposals,
    auditLogs,
    importBatches,
    exportLogs
  };
}

export async function getStatistik(filters?: Partial<DashboardFilterState>) {
  const bundle = await getAnalyticsDataBundle();
  return computeFilteredAnalytics(
    bundle.students,
    bundle.mutations,
    bundle.proposals,
    filters,
    {
      auditLogs: bundle.auditLogs,
      importBatches: bundle.importBatches,
      exportLogs: bundle.exportLogs
    }
  );
}

// ============================================================================
// PENGATURAN: MANAJEMEN KELAS (`public.classes`), TAHUN AJARAN (`public.academic_years`), & AKUN ADMIN (`public.profiles`)
// ============================================================================

export async function getClassesList(): Promise<ClassRecord[]> {
  if (isSupabaseConfigured) {
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase
        .from('classes')
        .select('*')
        .order('nama_kelas', { ascending: true });

      if (!error && data) {
        return data.map((row: Record<string, unknown>) => ({
          id: String(row.id),
          nama_kelas: String(row.nama_kelas || ''),
          tingkat: (['7', '8', '9'].includes(String(row.tingkat)) ? String(row.tingkat) : '7') as
            | '7'
            | '8'
            | '9',
          wali_kelas: row.wali_kelas ? String(row.wali_kelas) : undefined,
          kamar_default: row.kamar_default ? String(row.kamar_default) : undefined,
          kapasitas: typeof row.kapasitas === 'number' ? row.kapasitas : 36,
          is_active: row.is_active !== false,
          academic_year_id: row.academic_year_id ? String(row.academic_year_id) : undefined,
          created_at: String(row.created_at || new Date().toISOString())
        }));
      }
    }
  }
  return [...classesStore];
}

export async function saveClassRecord(
  payload: {
    id?: string;
    nama_kelas: string;
    tingkat: '7' | '8' | '9';
    wali_kelas?: string;
    kamar_default?: string;
    kapasitas: number;
    is_active: boolean;
  },
  actor: { id: string; name: string; role: string }
): Promise<ClassRecord> {
  if (isSupabaseConfigured) {
    const supabase = getSupabase();
    if (supabase) {
      const dbData = {
        nama_kelas: payload.nama_kelas.trim().toUpperCase(),
        tingkat: payload.tingkat,
        wali_kelas: cleanTextValue(payload.wali_kelas),
        kamar_default: cleanTextValue(payload.kamar_default),
        kapasitas: payload.kapasitas || 36,
        is_active: payload.is_active
      };

      const query = payload.id
        ? supabase.from('classes').update(dbData).eq('id', payload.id).select('*').single()
        : supabase
            .from('classes')
            .upsert(dbData, { onConflict: 'nama_kelas' })
            .select('*')
            .single();

      const { data, error } = await query;
      if (error) throw new Error(error.message);

      recordAuditLog({
        user_id: actor.id,
        user_name: actor.name,
        user_role: actor.role,
        user_type: 'admin',
        action: payload.id ? 'UPDATE_CLASS' : 'CREATE_CLASS',
        target_type: 'classes',
        target_id: String(data.id),
        new_values: dbData,
        details: `Menyimpan data kelas ${dbData.nama_kelas} (Tingkat ${dbData.tingkat}, Wali Kelas: ${dbData.wali_kelas || '-'}).`
      });

      return {
        id: String(data.id),
        nama_kelas: String(data.nama_kelas),
        tingkat: String(data.tingkat) as '7' | '8' | '9',
        wali_kelas: data.wali_kelas ? String(data.wali_kelas) : undefined,
        kamar_default: data.kamar_default ? String(data.kamar_default) : undefined,
        kapasitas: Number(data.kapasitas || 36),
        is_active: Boolean(data.is_active),
        created_at: String(data.created_at)
      };
    }
  }

  const now = new Date().toISOString();
  const existingIdx = classesStore.findIndex(
    c => c.id === payload.id || c.nama_kelas === payload.nama_kelas.trim().toUpperCase()
  );
  const record: ClassRecord = {
    id:
      payload.id ||
      (existingIdx >= 0 ? classesStore[existingIdx].id : crypto.randomUUID()),
    nama_kelas: payload.nama_kelas.trim().toUpperCase(),
    tingkat: payload.tingkat,
    wali_kelas: payload.wali_kelas,
    kamar_default: payload.kamar_default,
    kapasitas: payload.kapasitas || 36,
    is_active: payload.is_active,
    created_at: now
  };
  if (existingIdx >= 0) classesStore[existingIdx] = record;
  else classesStore.push(record);
  return record;
}

export async function getAcademicYearsList(): Promise<AcademicYearRecord[]> {
  if (isSupabaseConfigured) {
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase
        .from('academic_years')
        .select('*')
        .order('tahun_ajaran', { ascending: false });

      if (!error && data) {
        const list = data.map((row: Record<string, unknown>) => ({
          id: String(row.id),
          tahun_ajaran: String(row.tahun_ajaran || ''),
          semester: (row.semester === 'Genap' ? 'Genap' : 'Ganjil') as 'Ganjil' | 'Genap',
          is_active: Boolean(row.is_active),
          is_archived: Boolean(row.is_archived),
          tanggal_mulai: row.tanggal_mulai ? String(row.tanggal_mulai) : undefined,
          tanggal_selesai: row.tanggal_selesai ? String(row.tanggal_selesai) : undefined,
          catatan: row.catatan ? String(row.catatan) : undefined,
          created_at: String(row.created_at || new Date().toISOString())
        }));

        // Sinkronkan Tahun Ajaran Aktif ke SchoolProfile global agar Header & Dashboard selalu mutakhir
        const activeRec = list.find(r => r.is_active) || list.find(r => !r.is_archived) || list[0];
        if (activeRec && activeRec.tahun_ajaran) {
          saveSchoolProfile(
            {
              tahun_ajaran: activeRec.tahun_ajaran,
              semester_aktif: `Semester ${activeRec.semester}`
            },
            { skipSupabasePersist: true }
          );
        }

        return list;
      }
    }
  }
  return [...academicYearsStore];
}

export async function saveAcademicYearRecord(
  payload: {
    id?: string;
    tahun_ajaran: string;
    semester: 'Ganjil' | 'Genap';
    is_active: boolean;
    is_archived?: boolean;
    tanggal_mulai?: string;
    tanggal_selesai?: string;
    catatan?: string;
  },
  actor: { id: string; name: string; role: string }
): Promise<AcademicYearRecord> {
  if (isSupabaseConfigured) {
    const supabase = getSupabase();
    if (supabase) {
      if (payload.is_active) {
        await supabase
          .from('academic_years')
          .update({ is_active: false })
          .neq('id', '00000000-0000-0000-0000-000000000000');
      }

      const dbData: Record<string, unknown> = {
        tahun_ajaran: payload.tahun_ajaran.trim(),
        semester: payload.semester,
        is_active: payload.is_active,
        is_archived: payload.is_active ? false : Boolean(payload.is_archived),
        tanggal_mulai: parseDateValue(payload.tanggal_mulai),
        tanggal_selesai: parseDateValue(payload.tanggal_selesai),
        catatan: cleanTextValue(payload.catatan)
      };

      const runSaveQuery = async (recordPayload: Record<string, unknown>) => {
        if (payload.id) {
          return supabase
            .from('academic_years')
            .update(recordPayload)
            .eq('id', payload.id)
            .select('*')
            .single();
        }
        return supabase
          .from('academic_years')
          .upsert(recordPayload, { onConflict: 'tahun_ajaran,semester' })
          .select('*')
          .single();
      };

      let { data, error } = await runSaveQuery(dbData);

      // Fallback otomatis apabila tabel academic_years belum memiliki kolom is_archived / catatan
      if (
        error &&
        (error.message.includes('is_archived') ||
          error.message.includes('catatan') ||
          error.message.includes('schema cache'))
      ) {
        const legacyData: Record<string, unknown> = {
          tahun_ajaran: payload.tahun_ajaran.trim(),
          semester: payload.semester,
          is_active: payload.is_active,
          tanggal_mulai: parseDateValue(payload.tanggal_mulai),
          tanggal_selesai: parseDateValue(payload.tanggal_selesai)
        };
        const retry = await runSaveQuery(legacyData);
        data = retry.data;
        error = retry.error;
      }

      if (error || !data) throw new Error(error?.message || 'Gagal menyimpan tahun pelajaran.');

      if (payload.is_active) {
        saveSchoolProfile({
          tahun_ajaran: String(data.tahun_ajaran),
          semester_aktif: `Semester ${data.semester === 'Genap' ? 'Genap' : 'Ganjil'}`
        });
      }

      recordAuditLog({
        user_id: actor.id,
        user_name: actor.name,
        user_role: actor.role,
        user_type: 'admin',
        action: 'SAVE_ACADEMIC_YEAR',
        target_type: 'academic_years',
        target_id: String(data.id),
        new_values: dbData,
        details: `Menyimpan Tahun Pelajaran ${dbData.tahun_ajaran} Semester ${dbData.semester} (Aktif: ${dbData.is_active}, Arsip: ${dbData.is_archived}).`
      });

      return {
        id: String(data.id),
        tahun_ajaran: String(data.tahun_ajaran),
        semester: (data.semester === 'Genap' ? 'Genap' : 'Ganjil') as 'Ganjil' | 'Genap',
        is_active: Boolean(data.is_active),
        is_archived: Boolean(data.is_archived),
        tanggal_mulai: data.tanggal_mulai ? String(data.tanggal_mulai) : undefined,
        tanggal_selesai: data.tanggal_selesai ? String(data.tanggal_selesai) : undefined,
        catatan: data.catatan ? String(data.catatan) : undefined,
        created_at: String(data.created_at)
      };
    }
  }

  if (payload.is_active) {
    academicYearsStore.forEach(a => {
      a.is_active = false;
    });
    saveSchoolProfile({
      tahun_ajaran: payload.tahun_ajaran.trim(),
      semester_aktif: `Semester ${payload.semester}`
    });
  }
  const now = new Date().toISOString();
  const existingIdx = academicYearsStore.findIndex(
    a =>
      a.id === payload.id ||
      (a.tahun_ajaran === payload.tahun_ajaran.trim() && a.semester === payload.semester)
  );
  const rec: AcademicYearRecord = {
    id:
      payload.id ||
      (existingIdx >= 0 ? academicYearsStore[existingIdx].id : crypto.randomUUID()),
    tahun_ajaran: payload.tahun_ajaran.trim(),
    semester: payload.semester,
    is_active: payload.is_active,
    is_archived: payload.is_active ? false : Boolean(payload.is_archived),
    tanggal_mulai: payload.tanggal_mulai,
    tanggal_selesai: payload.tanggal_selesai,
    catatan: payload.catatan,
    created_at: now
  };
  if (existingIdx >= 0) academicYearsStore[existingIdx] = rec;
  else academicYearsStore.unshift(rec);
  return rec;
}

const ADMIN_ACCOUNTS_LOCAL_KEY = 'sipds_admin_accounts_registry';

function loadLocalAdminRegistry(): AdminAccountRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(ADMIN_ACCOUNTS_LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AdminAccountRecord[]) : [];
  } catch {
    return [];
  }
}

function saveLocalAdminRegistry(list: AdminAccountRecord[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ADMIN_ACCOUNTS_LOCAL_KEY, JSON.stringify(list));
  } catch {
    // Ignore
  }
}

function upsertLocalAdminRegistryRecord(record: AdminAccountRecord): void {
  const list = loadLocalAdminRegistry();
  const idx = list.findIndex(
    item =>
      item.id === record.id ||
      (item.email && record.email && item.email.toLowerCase() === record.email.toLowerCase())
  );
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...record };
  } else {
    list.unshift(record);
  }
  saveLocalAdminRegistry(list);

  const memIdx = adminProfilesStore.findIndex(
    item =>
      item.id === record.id ||
      (item.email && record.email && item.email.toLowerCase() === record.email.toLowerCase())
  );
  if (memIdx >= 0) {
    adminProfilesStore[memIdx] = { ...adminProfilesStore[memIdx], ...record };
  } else {
    adminProfilesStore.unshift(record);
  }
}

export async function getAdminProfilesList(): Promise<AdminAccountRecord[]> {
  const mergedByIdOrEmail = new Map<string, AdminAccountRecord>();
  const addRecord = (rec: AdminAccountRecord) => {
    const key = (rec.email || rec.id).trim().toLowerCase();
    if (!key) return;
    const existing = mergedByIdOrEmail.get(key);
    if (existing) {
      mergedByIdOrEmail.set(key, {
        ...existing,
        ...rec,
        id: rec.id || existing.id,
        email: rec.email || existing.email,
        username: rec.username || existing.username,
        full_name: rec.full_name || existing.full_name
      });
    } else {
      mergedByIdOrEmail.set(key, rec);
    }
  };

  // 1. Coba melalui endpoint server `/api/admin/users` (juga menyinkronkan auth.users -> profiles otomatis)
  try {
    const session = getSession();
    const headers: Record<string, string> = {};
    if (session?.token) {
      headers['Authorization'] = `Bearer ${session.token}`;
    }
    const res = await fetch('/api/admin/users', { headers });
    const parsed = await safeParseJsonResponse<{ profiles?: Record<string, unknown>[] }>(res);
    if (parsed.isJson && res.ok && Array.isArray(parsed.data?.profiles)) {
      for (const row of parsed.data.profiles) {
        addRecord({
          id: String(row.id),
          email: String(row.email || ''),
          username: String(row.username || ''),
          full_name: String(row.full_name || ''),
          role: String(row.role) as AdminRole,
          phone: row.phone ? String(row.phone) : undefined,
          is_active: row.is_active !== false,
          last_login_at: row.last_login_at ? String(row.last_login_at) : undefined,
          created_at: String(row.created_at || new Date().toISOString())
        });
      }
    }
  } catch {
    // Abaikan jika di-deploy statis di Netlify
  }

  // 2. Baca dari tabel public.profiles dan audit_logs di Supabase
  if (isSupabaseConfigured) {
    const supabase = getSupabase();
    if (supabase) {
      await ensureSupabaseSessionReady();
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .in('role', ['super_admin', 'admin', 'operator', 'viewer'])
        .order('created_at', { ascending: false });

      if (!error && data) {
        for (const row of data as Record<string, unknown>[]) {
          addRecord({
            id: String(row.id),
            email: String(row.email || ''),
            username: String(row.username || ''),
            full_name: String(row.full_name || ''),
            role: String(row.role) as AdminRole,
            phone: row.phone ? String(row.phone) : undefined,
            is_active: row.is_active !== false,
            last_login_at: row.last_login_at ? String(row.last_login_at) : undefined,
            created_at: String(row.created_at || new Date().toISOString())
          });
        }
      }

      // Ambil juga registri akun admin yang disimpan melalui audit_logs (fallback RLS di Netlify)
      try {
        const { data: auditRows } = await supabase
          .from('audit_logs')
          .select('target_id, new_values, created_at, action')
          .in('action', ['ADMIN_ACCOUNT_REGISTRY', 'UPDATE_ADMIN_PROFILE'])
          .order('created_at', { ascending: true })
          .limit(200);

        for (const log of (auditRows || []) as Record<string, unknown>[]) {
          const action = String(log.action || '');
          const vals = (log.new_values || {}) as Record<string, unknown>;
          if (action === 'ADMIN_ACCOUNT_REGISTRY' && vals.email) {
            const roleVal = String(vals.role || 'operator');
            if (['super_admin', 'admin', 'operator', 'viewer'].includes(roleVal)) {
              addRecord({
                id: String(vals.id || log.target_id || crypto.randomUUID()),
                email: String(vals.email).trim().toLowerCase(),
                username: String(vals.username || String(vals.email).split('@')[0])
                  .trim()
                  .toLowerCase(),
                full_name: String(vals.full_name || vals.email),
                role: roleVal as AdminRole,
                phone: vals.phone ? String(vals.phone) : undefined,
                is_active: vals.is_active !== false,
                created_at: String(log.created_at || new Date().toISOString())
              });
            }
          } else if (action === 'UPDATE_ADMIN_PROFILE') {
            const targetId = String(log.target_id || '');
            for (const [key, rec] of mergedByIdOrEmail.entries()) {
              if (rec.id === targetId || rec.email.toLowerCase() === targetId.toLowerCase()) {
                mergedByIdOrEmail.set(key, {
                  ...rec,
                  ...(vals.role &&
                  ['super_admin', 'admin', 'operator', 'viewer'].includes(String(vals.role))
                    ? { role: String(vals.role) as AdminRole }
                    : {}),
                  ...(typeof vals.is_active === 'boolean' ? { is_active: vals.is_active } : {})
                });
              }
            }
          }
        }
      } catch {
        // Non-fatal
      }
    }
  }

  for (const localRec of loadLocalAdminRegistry()) {
    addRecord(localRec);
  }

  if (mergedByIdOrEmail.size > 0) {
    return Array.from(mergedByIdOrEmail.values()).sort((a, b) =>
      String(b.created_at || '').localeCompare(String(a.created_at || ''))
    );
  }

  return [...adminProfilesStore];
}

export async function createAdminAccount(
  payload: {
    email: string;
    username: string;
    full_name: string;
    role: AdminRole;
    password: string;
    phone?: string;
  },
  actor: { id: string; name: string; role: string }
): Promise<void> {
  if (actor.role !== 'super_admin' && actor.role !== 'admin') {
    throw new Error('Hanya Super Admin atau Admin yang dapat membuat akun staf baru.');
  }

  const cleanEmail = String(payload.email).trim().toLowerCase();
  const cleanUsername = String(payload.username || cleanEmail.split('@')[0])
    .trim()
    .toLowerCase();
  const cleanFullName = String(payload.full_name).trim();
  const cleanPhone = payload.phone ? String(payload.phone).trim() : null;

  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('Alamat email staf tidak valid.');
  }
  if (!cleanFullName) {
    throw new Error('Nama lengkap staf wajib diisi.');
  }
  if (String(payload.password || '').length < 8) {
    throw new Error('Password minimal harus 8 karakter.');
  }

  // 1. Coba melalui endpoint server `/api/admin/users/create`
  try {
    const session = getSession();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.token) {
      headers['Authorization'] = `Bearer ${session.token}`;
    }

    const res = await fetch('/api/admin/users/create', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...payload,
        email: cleanEmail,
        username: cleanUsername,
        full_name: cleanFullName,
        phone: cleanPhone || undefined
      })
    });

    const parsed = await safeParseJsonResponse<{
      error?: string;
      profile?: Record<string, unknown>;
    }>(res);
    if (parsed.isJson && res.ok) {
      const createdId = String(parsed.data?.profile?.id || crypto.randomUUID());
      upsertLocalAdminRegistryRecord({
        id: createdId,
        email: cleanEmail,
        username: cleanUsername,
        full_name: cleanFullName,
        role: payload.role,
        phone: cleanPhone || undefined,
        is_active: true,
        created_at: new Date().toISOString()
      });

      recordAuditLog({
        user_id: actor.id,
        user_name: actor.name,
        user_role: actor.role,
        user_type: 'admin',
        action: 'CREATE_ADMIN_USER',
        target_type: 'profiles',
        target_id: cleanEmail,
        new_values: {
          id: createdId,
          email: cleanEmail,
          username: cleanUsername,
          full_name: cleanFullName,
          role: payload.role,
          phone: cleanPhone,
          is_active: true
        },
        details: `Membuat akun staf/admin baru: ${cleanFullName} (${payload.role}).`
      });
      return;
    }

    if (
      parsed.isJson &&
      parsed.data?.error &&
      res.status !== 503 &&
      !parsed.data.error.includes('row-level security')
    ) {
      throw new Error(parsed.data.error);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (
      msg &&
      !msg.includes('Failed to fetch') &&
      !msg.includes('SERVICE_ROLE_KEY') &&
      !msg.includes('row-level security')
    ) {
      throw err;
    }
  }

  // 2. Fallback langsung ke Supabase Auth (untuk deployment statis Netlify atau tanpa Service Role Key)
  const supabase = getSupabase();
  const isolatedAuth = createIsolatedSupabaseClient();
  if (isSupabaseConfigured && supabase && isolatedAuth) {
    await ensureSupabaseSessionReady();

    let userId = '';

    const { data: signUpData, error: signUpErr } = await isolatedAuth.auth.signUp({
      email: cleanEmail,
      password: String(payload.password),
      options: {
        data: {
          role: payload.role,
          full_name: cleanFullName,
          username: cleanUsername,
          phone: cleanPhone,
          is_active: true
        }
      }
    });

    if (signUpErr) {
      const errMsg = signUpErr.message || '';
      // Jika email sudah terdaftar di auth.users pada percobaan sebelumnya (sebelum profiles tersimpan),
      // masuk menggunakan isolatedAuth untuk mengambil ID user dan memperbarui user_metadata
      if (
        errMsg.toLowerCase().includes('already registered') ||
        errMsg.toLowerCase().includes('already exists')
      ) {
        const { data: signInData, error: signInErr } = await isolatedAuth.auth.signInWithPassword({
          email: cleanEmail,
          password: String(payload.password)
        });
        if (!signInErr && signInData?.user) {
          userId = signInData.user.id;
          await isolatedAuth.auth.updateUser({
            data: {
              role: payload.role,
              full_name: cleanFullName,
              username: cleanUsername,
              phone: cleanPhone,
              is_active: true
            }
          });
        } else {
          throw new Error(
            'Email ini sudah terdaftar di Supabase Authentication. Gunakan password yang sama dengan saat pendaftaran pertama atau gunakan email lain.'
          );
        }
      } else {
        throw new Error(errMsg || 'Gagal membuat user di Supabase Auth.');
      }
    } else if (signUpData?.user) {
      userId = signUpData.user.id;
    } else {
      throw new Error('Gagal membuat user di Supabase Auth.');
    }

    const profileRow = {
      id: userId,
      email: cleanEmail,
      username: cleanUsername,
      full_name: cleanFullName,
      role: payload.role,
      phone: cleanPhone,
      is_active: true
    };

    // 2a. Coba simpan ke public.profiles menggunakan sesi Admin aktif
    let { error: profErr } = await supabase.from('profiles').upsert(profileRow);

    // 2b. Jika gagal karena username duplikat, tambahkan akhiran unik
    if (profErr && profErr.message.toLowerCase().includes('profiles_username_key')) {
      profileRow.username = `${cleanUsername}_${userId.slice(0, 4)}`;
      const retryUsername = await supabase.from('profiles').upsert(profileRow);
      profErr = retryUsername.error;
    }

    // 2c. Jika masih terkena kebijakan RLS, coba simpan menggunakan sesi isolatedAuth user baru tersebut
    if (profErr) {
      const selfUpsert = await isolatedAuth.from('profiles').upsert(profileRow);
      profErr = selfUpsert.error;
    }

    // 2d. Simpan ke registri audit_logs & localStorage agar di Netlify akun langsung tampil & bisa login
    // meskipun kebijakan RLS tabel public.profiles di database membatasi INSERT langsung dari browser
    try {
      await supabase.from('audit_logs').insert([
        {
          actor_id: actor.id && actor.id !== 'admin' ? actor.id : undefined,
          actor_name: actor.name,
          actor_role: actor.role,
          actor_type: 'admin',
          action: 'ADMIN_ACCOUNT_REGISTRY',
          target_table: 'profiles',
          target_id: userId,
          new_values: profileRow,
          details: `Registrasi akun staf baru: ${cleanFullName} (${cleanEmail} / ${payload.role}).`
        }
      ]);
    } catch {
      // Non-fatal
    }

    upsertLocalAdminRegistryRecord({
      id: userId,
      email: cleanEmail,
      username: profileRow.username,
      full_name: cleanFullName,
      role: payload.role,
      phone: cleanPhone || undefined,
      is_active: true,
      created_at: new Date().toISOString()
    });

    // Jika error bukan karena RLS (misalnya error validasi constraint lain), baru lemparkan
    if (
      profErr &&
      !profErr.message.toLowerCase().includes('row-level security') &&
      profErr.code !== '42501'
    ) {
      throw new Error(profErr.message);
    }

    recordAuditLog({
      user_id: actor.id,
      user_name: actor.name,
      user_role: actor.role,
      user_type: 'admin',
      action: 'CREATE_ADMIN_USER',
      target_type: 'profiles',
      target_id: cleanEmail,
      new_values: profileRow,
      details: `Membuat akun staf/admin baru: ${cleanFullName} (${payload.role}).`
    });
    return;
  }

  throw new Error('Gagal membuat akun admin. Pastikan konfigurasi Supabase sudah aktif.');
}

export async function updateAdminProfileRoleOrStatus(
  targetId: string,
  updates: { role?: AdminRole; is_active?: boolean },
  actor: { id: string; name: string; role: string }
): Promise<void> {
  if (actor.role !== 'super_admin' && actor.role !== 'admin') {
    throw new Error('Hanya Super Admin atau Admin yang dapat mengubah role atau status akun staf.');
  }

  // 1. Coba melalui endpoint server `/api/admin/users/update`
  try {
    const session = getSession();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.token) {
      headers['Authorization'] = `Bearer ${session.token}`;
    }
    const res = await fetch('/api/admin/users/update', {
      method: 'POST',
      headers,
      body: JSON.stringify({ targetId, updates })
    });
    const parsed = await safeParseJsonResponse<{ error?: string }>(res);
    if (parsed.isJson && res.ok) {
      const localList = loadLocalAdminRegistry();
      const idx = localList.findIndex(p => p.id === targetId);
      if (idx >= 0) {
        localList[idx] = { ...localList[idx], ...updates };
        saveLocalAdminRegistry(localList);
      }

      recordAuditLog({
        user_id: actor.id,
        user_name: actor.name,
        user_role: actor.role,
        user_type: 'admin',
        action: 'UPDATE_ADMIN_PROFILE',
        target_type: 'profiles',
        target_id: targetId,
        new_values: updates as Record<string, unknown>,
        details: `Memperbarui hak akses / status akun staf (${targetId}): ${JSON.stringify(updates)}.`
      });
      return;
    }
  } catch {
    // Lanjutkan ke fallback Supabase langsung (untuk Netlify)
  }

  if (isSupabaseConfigured) {
    const supabase = getSupabase();
    if (supabase) {
      await ensureSupabaseSessionReady();
      const { error } = await supabase.from('profiles').update(updates).eq('id', targetId);
      if (
        error &&
        !error.message.toLowerCase().includes('row-level security') &&
        error.code !== '42501'
      ) {
        throw new Error(error.message);
      }

      const localList = loadLocalAdminRegistry();
      const idx = localList.findIndex(p => p.id === targetId);
      if (idx >= 0) {
        localList[idx] = { ...localList[idx], ...updates };
        saveLocalAdminRegistry(localList);
      }

      recordAuditLog({
        user_id: actor.id,
        user_name: actor.name,
        user_role: actor.role,
        user_type: 'admin',
        action: 'UPDATE_ADMIN_PROFILE',
        target_type: 'profiles',
        target_id: targetId,
        new_values: updates as Record<string, unknown>,
        details: `Memperbarui hak akses / status akun staf (${targetId}): ${JSON.stringify(updates)}.`
      });
      return;
    }
  }

  const idx = adminProfilesStore.findIndex(p => p.id === targetId);
  if (idx >= 0) {
    adminProfilesStore[idx] = { ...adminProfilesStore[idx], ...updates };
  }
}

// ============================================================================
// SISTEM LINTAS ANGKATAN, RIWAYAT KELAS, KENAIKAN KELAS, KELULUSAN, EXPORT LOG, & BACKUP
// ============================================================================

export async function getAllClassHistoryList(filters?: {
  tahun_ajaran?: string;
  kelas?: string;
  student_id?: string;
}): Promise<StudentClassHistoryRecord[]> {
  const mapHistoryRow = (row: Record<string, unknown>): StudentClassHistoryRecord => ({
    id: String(row.id),
    student_id: String(row.student_id),
    tahun_ajaran: row.tahun_ajaran ? String(row.tahun_ajaran) : undefined,
    semester: row.semester ? String(row.semester) : undefined,
    angkatan: row.angkatan ? String(row.angkatan) : undefined,
    kelas: String(row.kelas || ''),
    tingkat_kelas: (['7', '8', '9'].includes(String(row.tingkat_kelas))
      ? String(row.tingkat_kelas)
      : '7') as '7' | '8' | '9',
    kamar: row.kamar ? String(row.kamar) : undefined,
    status_riwayat: (row.status_riwayat || 'aktif') as StudentClassHistoryRecord['status_riwayat'],
    tanggal_mulai: String(row.tanggal_mulai || new Date().toISOString().slice(0, 10)),
    tanggal_selesai: row.tanggal_selesai ? String(row.tanggal_selesai) : undefined,
    catatan: row.catatan ? String(row.catatan) : undefined,
    created_at: String(row.created_at || new Date().toISOString())
  });

  if (isSupabaseConfigured) {
    await ensureSupabaseSessionReady();
    const supabase = getSupabase();
    if (supabase) {
      const allRows = await fetchAllSupabaseRows(async (from, to) => {
        let query = supabase
          .from('student_class_history')
          .select('*')
          .order('tanggal_mulai', { ascending: false });

        if (filters?.student_id) {
          query = query.eq('student_id', filters.student_id);
        }
        if (filters?.tahun_ajaran && filters.tahun_ajaran !== 'all') {
          query = query.eq('tahun_ajaran', filters.tahun_ajaran);
        }
        if (filters?.kelas && filters.kelas !== 'all') {
          query = query.eq('kelas', filters.kelas);
        }

        return query.range(from, to);
      });

      if (allRows.length > 0) {
        return allRows.map(mapHistoryRow);
      }
    }

    try {
      const params = new URLSearchParams();
      if (filters?.student_id) params.set('student_id', filters.student_id);
      if (filters?.tahun_ajaran) params.set('tahun_ajaran', filters.tahun_ajaran);
      if (filters?.kelas) params.set('kelas', filters.kelas);
      const session = getSession();
      const headers: Record<string, string> = {};
      if (session?.token) headers['Authorization'] = `Bearer ${session.token}`;
      const res = await fetch(`/api/class-history?${params.toString()}`, { headers });
      const parsed = await safeParseJsonResponse<{ history?: Record<string, unknown>[] }>(res);
      if (res.ok && parsed.isJson && Array.isArray(parsed.data?.history) && parsed.data.history.length > 0) {
        return parsed.data.history.map(mapHistoryRow);
      }
    } catch {
      // ignore fallback error
    }
  }

  return classHistoryStore.filter(h => {
    if (filters?.student_id && h.student_id !== filters.student_id) return false;
    if (filters?.tahun_ajaran && filters.tahun_ajaran !== 'all' && h.tahun_ajaran !== filters.tahun_ajaran)
      return false;
    if (filters?.kelas && filters.kelas !== 'all' && h.kelas !== filters.kelas) return false;
    return true;
  });
}

export async function saveClassHistoryPlacement(
  payload: {
    student_id: string;
    tahun_ajaran: string;
    semester?: string;
    kelas: string;
    kamar?: string;
    status_riwayat?: StudentClassHistoryRecord['status_riwayat'];
    tanggal_mulai?: string;
    catatan?: string;
  },
  actor: { id: string; name: string; role: string }
): Promise<{ status: 'inserted' | 'duplicate_skipped'; record?: StudentClassHistoryRecord }> {
  const normKelas = normalizeKelasValue(payload.kelas, '7A');
  const tingkat = normKelas.tingkat;

  if (isSupabaseConfigured) {
    await ensureSupabaseSessionReady();
    const supabase = getSupabase();
    if (supabase) {
      const { data: existingRows } = await supabase
        .from('student_class_history')
        .select('*')
        .eq('student_id', payload.student_id)
        .limit(20);

      if (
        existingRows &&
        existingRows.some(
          (e: Record<string, unknown>) =>
            String(e.kelas || '').toUpperCase() === normKelas.rombel &&
            (!e.tahun_ajaran || String(e.tahun_ajaran) === payload.tahun_ajaran.trim())
        )
      ) {
        return { status: 'duplicate_skipped' };
      }

      const dbRow: Record<string, unknown> = {
        student_id: payload.student_id,
        tahun_ajaran: payload.tahun_ajaran.trim(),
        semester: payload.semester || 'Ganjil',
        kelas: normKelas.rombel,
        tingkat_kelas: tingkat,
        kamar: cleanTextValue(payload.kamar),
        status_riwayat: payload.status_riwayat || 'aktif',
        tanggal_mulai: parseDateValue(payload.tanggal_mulai) || new Date().toISOString().slice(0, 10),
        catatan: cleanTextValue(payload.catatan) || `Penempatan kelas Tahun Pelajaran ${payload.tahun_ajaran}`
      };

      let { data, error } = await supabase
        .from('student_class_history')
        .insert([dbRow])
        .select('*')
        .single();

      if (
        error &&
        (error.message.includes('schema cache') ||
          error.message.includes('column') ||
          error.message.includes('tahun_ajaran') ||
          error.message.includes('semester'))
      ) {
        const legacyRow = { ...dbRow };
        delete legacyRow.tahun_ajaran;
        delete legacyRow.semester;
        const retryRes = await supabase
          .from('student_class_history')
          .insert([legacyRow])
          .select('*')
          .single();
        data = retryRes.data;
        error = retryRes.error;
      }

      if (error || !data) {
        try {
          const session = getSession();
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (session?.token) headers['Authorization'] = `Bearer ${session.token}`;
          const srvRes = await fetch('/api/class-history/upsert', {
            method: 'POST',
            headers,
            body: JSON.stringify({ dbRow })
          });
          const parsed = await safeParseJsonResponse<{ record?: Record<string, unknown> }>(srvRes);
          if (srvRes.ok && parsed.isJson && parsed.data?.record) {
            data = parsed.data.record;
            error = null;
          }
        } catch {
          // ignore fallback error
        }
      }

      if (error || !data) throw new Error(error?.message || 'Gagal menyimpan riwayat kelas.');

      recordAuditLog({
        user_id: actor.id,
        user_name: actor.name,
        user_role: actor.role,
        user_type: 'admin',
        action: 'ADD_CLASS_HISTORY',
        target_type: 'student_class_history',
        target_id: String(data.id),
        new_values: dbRow,
        details: `Menambahkan riwayat penempatan kelas ${String(dbRow.kelas)} pada Tahun Pelajaran ${String(dbRow.tahun_ajaran)}.`
      });

      return {
        status: 'inserted',
        record: {
          id: String(data.id),
          student_id: String(data.student_id),
          tahun_ajaran: String(data.tahun_ajaran || payload.tahun_ajaran),
          semester: String(data.semester || 'Ganjil'),
          kelas: String(data.kelas),
          tingkat_kelas: tingkat,
          kamar: data.kamar ? String(data.kamar) : undefined,
          status_riwayat: (data.status_riwayat || 'aktif') as StudentClassHistoryRecord['status_riwayat'],
          tanggal_mulai: String(data.tanggal_mulai),
          catatan: data.catatan ? String(data.catatan) : undefined,
          created_at: String(data.created_at)
        }
      };
    }
  }

  const rec: StudentClassHistoryRecord = {
    id: crypto.randomUUID(),
    student_id: payload.student_id,
    tahun_ajaran: payload.tahun_ajaran.trim(),
    semester: payload.semester || 'Ganjil',
    kelas: payload.kelas.trim().toUpperCase(),
    tingkat_kelas: tingkat,
    kamar: payload.kamar,
    status_riwayat: payload.status_riwayat || 'aktif',
    tanggal_mulai: payload.tanggal_mulai || new Date().toISOString().slice(0, 10),
    catatan: payload.catatan,
    created_at: new Date().toISOString()
  };
  classHistoryStore.unshift(rec);
  return { status: 'inserted', record: rec };
}

export async function getGraduationsList(): Promise<StudentGraduationRecord[]> {
  if (isSupabaseConfigured) {
    const supabase = getSupabase();
    if (supabase) {
      const allRows = await fetchAllSupabaseRows(async (from, to) => {
        return supabase
          .from('student_graduations')
          .select('*')
          .order('tahun_kelulusan', { ascending: false })
          .range(from, to);
      });

      if (allRows.length > 0) {
        return allRows.map((row: Record<string, unknown>) => ({
          id: String(row.id),
          student_id: String(row.student_id),
          nis: row.nis ? String(row.nis) : undefined,
          nisn: String(row.nisn || ''),
          nama_siswa: toUpperStudentName(row.nama_siswa || ''),
          angkatan: String(row.angkatan || ''),
          kelas_terakhir: String(row.kelas_terakhir || '9A'),
          tahun_ajaran_lulus: String(row.tahun_ajaran_lulus || ''),
          tahun_kelulusan: String(row.tahun_kelulusan || ''),
          tanggal_kelulusan: String(row.tanggal_kelulusan || ''),
          nomor_ijazah_smp: row.nomor_ijazah_smp ? String(row.nomor_ijazah_smp) : undefined,
          nomor_skhun: row.nomor_skhun ? String(row.nomor_skhun) : undefined,
          nilai_rata_rata:
            row.nilai_rata_rata !== null && row.nilai_rata_rata !== undefined
              ? Number(row.nilai_rata_rata)
              : undefined,
          sekolah_lanjutan: row.sekolah_lanjutan ? String(row.sekolah_lanjutan) : undefined,
          status_kelulusan: (row.status_kelulusan === 'Ditunda' ? 'Ditunda' : 'Lulus') as
            | 'Lulus'
            | 'Ditunda',
          diproses_oleh_nama: row.diproses_oleh_nama ? String(row.diproses_oleh_nama) : undefined,
          catatan: row.catatan ? String(row.catatan) : undefined,
          created_at: String(row.created_at || new Date().toISOString())
        }));
      }
    }
  }
  return [...graduationsStore];
}

export async function processYearEndPromotions(
  params: {
    fromAcademicYear: string;
    toAcademicYear: string;
    items: {
      student_id: string;
      from_class: string;
      to_class: string;
      decision: 'naik_kelas' | 'tinggal_kelas';
      catatan?: string;
    }[];
  },
  actor: { id: string; name: string; role: string }
): Promise<{ promotedCount: number; retainedCount: number; skippedCount: number }> {
  if (params.fromAcademicYear === params.toAcademicYear) {
    throw new Error('Tahun pelajaran asal dan tahun pelajaran tujuan tidak boleh sama.');
  }
  if (params.items.length === 0) {
    throw new Error('Pilih minimal satu siswa untuk diproses kenaikan kelas.');
  }

  if (isSupabaseConfigured) {
    const supabase = getSupabase();
    if (supabase) {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('process_year_end_promotions', {
        p_from_academic_year: params.fromAcademicYear,
        p_to_academic_year: params.toAcademicYear,
        p_promotions: params.items,
        p_actor_name: actor.name
      });

      if (!rpcErr && rpcRes) {
        return {
          promotedCount: Number(rpcRes.promoted_count || 0),
          retainedCount: Number(rpcRes.retained_count || 0),
          skippedCount: Number(rpcRes.skipped_count || 0)
        };
      }

      // Fallback transaksional bertahap bila fungsi RPC belum dijalankan di SQL Editor
      let promotedCount = 0;
      let retainedCount = 0;
      let skippedCount = 0;

      for (const item of params.items) {
        const { data: existingHist } = await supabase
          .from('student_class_history')
          .select('id')
          .eq('student_id', item.student_id)
          .eq('tahun_ajaran', params.toAcademicYear)
          .maybeSingle();

        if (existingHist) {
          skippedCount++;
          continue;
        }

        await supabase
          .from('students')
          .update({ kelas: item.to_class })
          .eq('id', item.student_id);

        const tingkat = item.to_class.charAt(0);
        await supabase.from('student_class_history').insert([
          {
            student_id: item.student_id,
            tahun_ajaran: params.toAcademicYear,
            kelas: item.to_class,
            tingkat_kelas: ['7', '8', '9'].includes(tingkat) ? tingkat : '8',
            status_riwayat: item.decision,
            tanggal_mulai: new Date().toISOString().slice(0, 10),
            catatan:
              item.catatan ||
              `Proses kenaikan kelas ${params.fromAcademicYear} -> ${params.toAcademicYear} (${item.from_class} -> ${item.to_class})`
          }
        ]);

        if (item.decision === 'tinggal_kelas') retainedCount++;
        else promotedCount++;
      }

      recordAuditLog({
        user_id: actor.id,
        user_name: actor.name,
        user_role: actor.role,
        user_type: 'admin',
        action: 'YEAR_END_PROMOTION',
        target_type: 'student_class_history',
        target_id: params.toAcademicYear,
        new_values: {
          fromAcademicYear: params.fromAcademicYear,
          toAcademicYear: params.toAcademicYear,
          promotedCount,
          retainedCount,
          skippedCount
        },
        details: `Proses kenaikan kelas dari ${params.fromAcademicYear} ke ${params.toAcademicYear}: ${promotedCount} naik kelas, ${retainedCount} tinggal kelas.`
      });

      return { promotedCount, retainedCount, skippedCount };
    }
  }

  let promotedCount = 0;
  let retainedCount = 0;
  let skippedCount = 0;
  for (const item of params.items) {
    const exists = classHistoryStore.some(
      h => h.student_id === item.student_id && h.tahun_ajaran === params.toAcademicYear
    );
    if (exists) {
      skippedCount++;
      continue;
    }
    const idx = siswaStore.findIndex(s => s.id === item.student_id);
    if (idx >= 0) {
      const t = item.to_class.charAt(0);
      siswaStore[idx] = {
        ...siswaStore[idx],
        rombel: item.to_class,
        tingkat_kelas: (t === '8' ? '8' : t === '9' ? '9' : '7')
      };
    }
    classHistoryStore.unshift({
      id: crypto.randomUUID(),
      student_id: item.student_id,
      tahun_ajaran: params.toAcademicYear,
      kelas: item.to_class,
      tingkat_kelas: item.to_class.charAt(0) === '9' ? '9' : '8',
      status_riwayat: item.decision,
      tanggal_mulai: new Date().toISOString().slice(0, 10),
      catatan: item.catatan || `Kenaikan kelas ${item.from_class} -> ${item.to_class}`,
      created_at: new Date().toISOString()
    });
    if (item.decision === 'tinggal_kelas') retainedCount++;
    else promotedCount++;
  }
  return { promotedCount, retainedCount, skippedCount };
}

export async function processStudentGraduations(
  params: {
    tahunAjaranLulus: string;
    tahunKelulusan: string;
    tanggalKelulusan: string;
    items: {
      student_id: string;
      nomor_ijazah_smp?: string;
      sekolah_lanjutan?: string;
      catatan?: string;
    }[];
  },
  actor: { id: string; name: string; role: string }
): Promise<{ graduatedCount: number; skippedCount: number }> {
  if (params.items.length === 0) {
    throw new Error('Pilih minimal satu siswa kelas IX untuk dinyatakan lulus.');
  }

  if (isSupabaseConfigured) {
    const supabase = getSupabase();
    if (supabase) {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('process_student_graduations', {
        p_tahun_ajaran_lulus: params.tahunAjaranLulus,
        p_tahun_kelulusan: params.tahunKelulusan,
        p_tanggal_kelulusan: params.tanggalKelulusan,
        p_graduations: params.items,
        p_actor_name: actor.name
      });

      if (!rpcErr && rpcRes) {
        return {
          graduatedCount: Number(rpcRes.graduated_count || 0),
          skippedCount: Number(rpcRes.skipped_count || 0)
        };
      }

      // Fallback transaksional
      let graduatedCount = 0;
      let skippedCount = 0;
      const allStudents = await getSiswaList();

      for (const item of params.items) {
        const st = allStudents.find(s => s.id === item.student_id);
        if (!st || st.status === 'lulus') {
          skippedCount++;
          continue;
        }

        await supabase
          .from('students')
          .update({
            status_aktif: 'lulus',
            tahun_lulus: params.tahunKelulusan,
            tanggal_lulus: params.tanggalKelulusan,
            nomor_ijazah_smp: cleanTextValue(item.nomor_ijazah_smp)
          })
          .eq('id', st.id);

        await supabase.from('student_graduations').upsert(
          [
            {
              student_id: st.id,
              nis: st.nis,
              nisn: st.nisn,
              nama_siswa: st.nama_lengkap,
              angkatan: st.angkatan || st.tahun_masuk,
              kelas_terakhir: st.rombel,
              tahun_ajaran_lulus: params.tahunAjaranLulus,
              tahun_kelulusan: params.tahunKelulusan,
              tanggal_kelulusan: params.tanggalKelulusan,
              nomor_ijazah_smp: cleanTextValue(item.nomor_ijazah_smp),
              sekolah_lanjutan: cleanTextValue(item.sekolah_lanjutan),
              status_kelulusan: 'Lulus',
              diproses_oleh_nama: actor.name,
              catatan: cleanTextValue(item.catatan)
            }
          ],
          { onConflict: 'student_id' }
        );

        await supabase.from('student_class_history').insert([
          {
            student_id: st.id,
            tahun_ajaran: params.tahunAjaranLulus,
            kelas: st.rombel,
            tingkat_kelas: '9',
            status_riwayat: 'lulus',
            tanggal_mulai: params.tanggalKelulusan,
            tanggal_selesai: params.tanggalKelulusan,
            catatan: `Dinyatakan LULUS pada Tahun Pelajaran ${params.tahunAjaranLulus} (Tahun Lulus ${params.tahunKelulusan})`
          }
        ]);

        graduatedCount++;
      }

      recordAuditLog({
        user_id: actor.id,
        user_name: actor.name,
        user_role: actor.role,
        user_type: 'admin',
        action: 'PROCESS_GRADUATION',
        target_type: 'student_graduations',
        target_id: params.tahunKelulusan,
        new_values: {
          tahunAjaranLulus: params.tahunAjaranLulus,
          tahunKelulusan: params.tahunKelulusan,
          graduatedCount,
          skippedCount
        },
        details: `Memproses kelulusan ${graduatedCount} siswa kelas IX untuk Tahun Lulus ${params.tahunKelulusan}.`
      });

      return { graduatedCount, skippedCount };
    }
  }

  let graduatedCount = 0;
  let skippedCount = 0;
  for (const item of params.items) {
    const idx = siswaStore.findIndex(s => s.id === item.student_id);
    if (idx < 0 || siswaStore[idx].status === 'lulus') {
      skippedCount++;
      continue;
    }
    const st = siswaStore[idx];
    siswaStore[idx] = {
      ...st,
      status: 'lulus',
      tahun_lulus: params.tahunKelulusan,
      tanggal_lulus: params.tanggalKelulusan,
      nomor_ijazah_smp: item.nomor_ijazah_smp
    };
    graduationsStore.unshift({
      id: crypto.randomUUID(),
      student_id: st.id,
      nis: st.nis,
      nisn: st.nisn,
      nama_siswa: st.nama_lengkap,
      angkatan: st.angkatan || st.tahun_masuk,
      kelas_terakhir: st.rombel,
      tahun_ajaran_lulus: params.tahunAjaranLulus,
      tahun_kelulusan: params.tahunKelulusan,
      tanggal_kelulusan: params.tanggalKelulusan,
      nomor_ijazah_smp: item.nomor_ijazah_smp,
      sekolah_lanjutan: item.sekolah_lanjutan,
      status_kelulusan: 'Lulus',
      diproses_oleh_nama: actor.name,
      catatan: item.catatan,
      created_at: new Date().toISOString()
    });
    graduatedCount++;
  }
  return { graduatedCount, skippedCount };
}

export async function correctStudentAcademicStatus(
  params: {
    student_id: string;
    new_kelas: string;
    new_status: Siswa['status'];
    new_angkatan?: string;
    alasan_koreksi: string;
  },
  actor: { id: string; name: string; role: string }
): Promise<void> {
  if (!params.alasan_koreksi.trim()) {
    throw new Error('Alasan koreksi wajib diisi untuk dicatat pada Audit Log.');
  }

  const allStudents = await getSiswaList();
  const target = allStudents.find(s => s.id === params.student_id);
  if (!target) throw new Error('Data siswa tidak ditemukan.');

  const oldSnapshot = {
    kelas: target.rombel,
    status: target.status,
    angkatan: target.angkatan || target.tahun_masuk
  };

  if (isSupabaseConfigured) {
    const supabase = getSupabase();
    if (supabase) {
      const updateObj: Record<string, unknown> = {
        kelas: params.new_kelas.trim().toUpperCase(),
        status_aktif: params.new_status
      };
      if (params.new_angkatan) {
        updateObj.angkatan = params.new_angkatan.trim();
      }
      const { error } = await supabase.from('students').update(updateObj).eq('id', params.student_id);
      if (error) throw new Error(error.message);

      if (target.status === 'lulus' && params.new_status !== 'lulus') {
        await supabase.from('student_graduations').delete().eq('student_id', params.student_id);
      }
    }
  } else {
    const idx = siswaStore.findIndex(s => s.id === params.student_id);
    if (idx >= 0) {
      siswaStore[idx] = {
        ...siswaStore[idx],
        rombel: params.new_kelas.trim().toUpperCase(),
        status: params.new_status,
        angkatan: params.new_angkatan || siswaStore[idx].angkatan
      };
    }
  }

  recordAuditLog({
    user_id: actor.id,
    user_name: actor.name,
    user_role: actor.role,
    user_type: 'admin',
    action: 'ACADEMIC_STATUS_CORRECTION',
    target_type: 'students',
    target_id: target.nisn,
    old_values: oldSnapshot,
    new_values: {
      kelas: params.new_kelas,
      status: params.new_status,
      angkatan: params.new_angkatan || oldSnapshot.angkatan
    },
    details: `Koreksi status akademik siswa ${target.nama_lengkap} (${target.nisn}): Kelas ${oldSnapshot.kelas}->${params.new_kelas}, Status ${oldSnapshot.status}->${params.new_status}. Alasan: ${params.alasan_koreksi}`
  });
}

export async function recordImportBatchWithRows(
  batchPayload: Omit<ImportBatchRecord, 'id' | 'created_at'>,
  rowsPayload: Omit<ImportBatchRowRecord, 'id' | 'batch_id' | 'created_at'>[],
  actor: { id: string; name: string; role: string }
): Promise<ImportBatchRecord> {
  const now = new Date().toISOString();
  let savedBatch: ImportBatchRecord = {
    ...batchPayload,
    id: crypto.randomUUID(),
    created_at: now
  };
  let savedToDb = false;

  if (isSupabaseConfigured) {
    await ensureSupabaseSessionReady();
    const supabase = getSupabase();
    if (supabase) {
      const fullBatchRow: Record<string, unknown> = {
        file_name: batchPayload.file_name,
        import_mode: batchPayload.import_mode || 'insert_only',
        import_category: batchPayload.import_category || 'siswa_baru',
        tahun_ajaran: batchPayload.tahun_ajaran || null,
        angkatan: batchPayload.angkatan || null,
        total_rows: batchPayload.total_rows,
        success_rows: batchPayload.success_rows,
        failed_rows: batchPayload.failed_rows,
        duplicate_rows: batchPayload.duplicate_rows || 0,
        review_rows: batchPayload.review_rows || 0,
        status: batchPayload.status,
        error_details: batchPayload.error_details,
        completed_at: batchPayload.completed_at || now
      };

      let { data, error } = await supabase
        .from('import_batches')
        .insert([fullBatchRow])
        .select('*')
        .single();

      if (error) {
        const legacyBatchRow = {
          file_name: batchPayload.file_name,
          total_rows: batchPayload.total_rows,
          success_rows: batchPayload.success_rows,
          failed_rows: batchPayload.failed_rows,
          status: batchPayload.status,
          error_details: batchPayload.error_details,
          completed_at: batchPayload.completed_at || now
        };
        const retryBatch = await supabase
          .from('import_batches')
          .insert([legacyBatchRow])
          .select('*')
          .single();
        data = retryBatch.data;
        error = retryBatch.error;
      }

      if (!error && data) {
        savedToDb = true;
        savedBatch = {
          ...batchPayload,
          id: String(data.id),
          created_at: String(data.created_at || now)
        };

        if (rowsPayload.length > 0) {
          try {
            const dbRows = rowsPayload.map(r => ({
              batch_id: savedBatch.id,
              row_number: r.row_number,
              student_id: r.student_id || null,
              nis: r.nis || null,
              nisn: r.nisn || null,
              nama_siswa: r.nama_siswa || null,
              validation_status: r.validation_status,
              action_taken: r.action_taken === 'mutation_recorded' ? 'inserted' : r.action_taken,
              error_messages: r.error_messages,
              raw_payload: r.raw_payload || {},
              diff_payload: r.diff_payload || {}
            }));
            const CHUNK = 250;
            for (let i = 0; i < dbRows.length; i += CHUNK) {
              await supabase.from('import_batch_rows').insert(dbRows.slice(i, i + CHUNK));
            }
          } catch {
            // ignore if import_batch_rows table not yet migrated
          }
        }
      }
    }

    // Fallback ke endpoint server /api/import-batches apabila penyimpanan dari browser tertahan RLS / JWT expired
    if (!savedToDb) {
      try {
        const session = getSession();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (session?.token) headers['Authorization'] = `Bearer ${session.token}`;
        const srvRes = await fetch('/api/import-batches', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            batchPayload: {
              ...batchPayload,
              completed_at: batchPayload.completed_at || now
            },
            rowsPayload
          })
        });
        const parsed = await safeParseJsonResponse<{ batch?: Record<string, unknown> }>(srvRes);
        if (srvRes.ok && parsed.isJson && parsed.data?.batch) {
          savedBatch = mapDbImportBatchRow({
            ...batchPayload,
            ...parsed.data.batch
          });
        }
      } catch {
        // Abaikan jika server sedang offline
      }
    }
  }

  importBatchesStore.unshift(savedBatch);
  saveImportBatchesBackup(importBatchesStore);
  rowsPayload.forEach(r => {
    importBatchRowsStore.push({
      ...r,
      id: crypto.randomUUID(),
      batch_id: savedBatch.id,
      created_at: now
    });
  });

  recordAuditLog({
    user_id: actor.id,
    user_name: actor.name,
    user_role: actor.role,
    user_type: 'admin',
    action: 'IMPORT_EXCEL_BATCH',
    target_type: 'import_batches',
    target_id: savedBatch.id,
    new_values: {
      file_name: savedBatch.file_name,
      category: savedBatch.import_category,
      total: savedBatch.total_rows,
      success: savedBatch.success_rows,
      failed: savedBatch.failed_rows,
      duplicate: savedBatch.duplicate_rows
    },
    details: `Import data (${savedBatch.import_category || 'siswa_baru'}) dari berkas ${savedBatch.file_name}: ${savedBatch.success_rows} berhasil, ${savedBatch.failed_rows} gagal, ${savedBatch.duplicate_rows || 0} duplikat.`
  });

  return savedBatch;
}

export async function getImportBatchRows(batchId: string): Promise<ImportBatchRowRecord[]> {
  const mapRow = (row: Record<string, unknown>): ImportBatchRowRecord => ({
    id: String(row.id),
    batch_id: String(row.batch_id),
    row_number: Number(row.row_number || 0),
    student_id: row.student_id ? String(row.student_id) : undefined,
    nis: row.nis ? String(row.nis) : undefined,
    nisn: row.nisn ? String(row.nisn) : undefined,
    nama_siswa: row.nama_siswa ? toUpperStudentName(row.nama_siswa) : undefined,
    validation_status: (row.validation_status || 'valid') as ImportBatchRowRecord['validation_status'],
    action_taken: (row.action_taken || 'skipped') as ImportBatchRowRecord['action_taken'],
    error_messages: Array.isArray(row.error_messages)
      ? row.error_messages.map(String)
      : [],
    raw_payload: (row.raw_payload as Record<string, unknown>) || {},
    diff_payload:
      (row.diff_payload as Record<string, { old_value: string; new_value: string }>) || {},
    created_at: String(row.created_at || new Date().toISOString())
  });

  if (isSupabaseConfigured) {
    await ensureSupabaseSessionReady();
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase
        .from('import_batch_rows')
        .select('*')
        .eq('batch_id', batchId)
        .order('row_number', { ascending: true });

      if (!error && data && data.length > 0) {
        return data.map(mapRow);
      }
    }

    try {
      const session = getSession();
      const headers: Record<string, string> = {};
      if (session?.token) headers['Authorization'] = `Bearer ${session.token}`;
      const res = await fetch(`/api/import-batches/${encodeURIComponent(batchId)}/rows`, { headers });
      const parsed = await safeParseJsonResponse<{ rows?: Record<string, unknown>[] }>(res);
      if (res.ok && parsed.isJson && Array.isArray(parsed.data?.rows) && parsed.data.rows.length > 0) {
        return parsed.data.rows.map(mapRow);
      }
    } catch {
      // ignore fallback error
    }
  }
  return importBatchRowsStore.filter(r => r.batch_id === batchId);
}

export async function recordExportLog(
  log: Omit<ExportLogRecord, 'id' | 'created_at'>
): Promise<ExportLogRecord> {
  const now = new Date().toISOString();
  const entry: ExportLogRecord = {
    ...log,
    id: crypto.randomUUID(),
    created_at: now
  };
  exportLogsStore.unshift(entry);

  if (isSupabaseConfigured) {
    const supabase = getSupabase();
    if (supabase) {
      await supabase.from('export_logs').insert([
        {
          exported_by_name: log.exported_by_name,
          exported_by_role: log.exported_by_role,
          export_type: log.export_type,
          filter_summary: log.filter_summary,
          total_records: log.total_records,
          file_name: log.file_name
        }
      ]);
    }
  }

  recordAuditLog({
    user_id: 'admin',
    user_name: log.exported_by_name,
    user_role: log.exported_by_role,
    user_type: 'admin',
    action: 'EXPORT_DATA_EXCEL',
    target_type: 'export_logs',
    target_id: log.file_name,
    new_values: {
      export_type: log.export_type,
      total_records: log.total_records,
      filters: log.filter_summary
    },
    details: `Export Excel kategori "${log.export_type}" (${log.total_records} baris) ke berkas ${log.file_name}.`
  });

  return entry;
}

export async function getExportLogsList(): Promise<ExportLogRecord[]> {
  if (isSupabaseConfigured) {
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase
        .from('export_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (!error && data) {
        return data.map((row: Record<string, unknown>) => ({
          id: String(row.id),
          exported_by_name: String(row.exported_by_name || 'Admin'),
          exported_by_role: String(row.exported_by_role || 'admin'),
          export_type: String(row.export_type || ''),
          filter_summary: (row.filter_summary as Record<string, string>) || {},
          total_records: Number(row.total_records || 0),
          file_name: String(row.file_name || ''),
          created_at: String(row.created_at || new Date().toISOString())
        }));
      }
    }
  }
  return [...exportLogsStore];
}

// ============================================================================
// BACKUP DAN PEMULIHAN DATABASE LENGKAP (TANPA PASSWORD / TOKEN / SERVICE ROLE KEY)
// ============================================================================

export const getImportBatchesList = getImportBatches;

export async function generateFullDatabaseBackup(actor: {
  id: string;
  name: string;
  role: string;
}): Promise<FullDatabaseBackupPayload> {
  if (actor.role !== 'super_admin' && actor.role !== 'admin') {
    throw new Error('Hanya Super Admin atau Admin yang memiliki hak akses Backup Database Lengkap.');
  }

  const [
    academic_years,
    classes,
    students,
    student_class_history,
    student_mutations,
    student_graduations,
    parentAccountsRaw,
    student_change_requests,
    import_batches,
    export_logs,
    audit_logs
  ] = await Promise.all([
    getAcademicYearsList(),
    getClassesList(),
    getSiswaList(),
    getAllClassHistoryList(),
    getMutasiList(),
    getGraduationsList(),
    getParentAccounts(),
    getPerubahanList(),
    getImportBatches(),
    getExportLogsList(),
    getAuditLogs()
  ]);

  // Pastikan temporary_password, password, atau token TIDAK PERNAH disertakan dalam berkas backup
  const sanitizedParentAccess = parentAccountsRaw.map(record => {
    const { temporary_password: _ignored, ...safeRecord } = record;
    return safeRecord;
  });

  const payload: FullDatabaseBackupPayload = {
    backup_meta: {
      app_name: 'SIPDS - Sistem Informasi Pengelolaan Data Siswa',
      school_name: SCHOOL_CONFIG.nama_sekolah,
      npsn: SCHOOL_CONFIG.npsn,
      schema_version: '2.0-multi-cohort-lifecycle',
      created_at: new Date().toISOString(),
      exported_by_name: actor.name,
      exported_by_role: actor.role,
      record_counts: {
        academic_years: academic_years.length,
        classes: classes.length,
        students: students.length,
        student_class_history: student_class_history.length,
        student_mutations: student_mutations.length,
        student_graduations: student_graduations.length,
        parent_student_access: sanitizedParentAccess.length,
        student_change_requests: student_change_requests.length,
        import_batches: import_batches.length,
        export_logs: export_logs.length,
        audit_logs: audit_logs.length
      }
    },
    tables: {
      academic_years,
      classes,
      students,
      student_class_history,
      student_mutations,
      student_graduations,
      parent_student_access: sanitizedParentAccess,
      student_change_requests,
      import_batches,
      export_logs,
      audit_logs
    }
  };

  recordAuditLog({
    user_id: actor.id,
    user_name: actor.name,
    user_role: actor.role,
    user_type: 'admin',
    action: 'FULL_DATABASE_BACKUP',
    target_type: 'database_backup',
    target_id: payload.backup_meta.created_at,
    new_values: payload.backup_meta.record_counts,
    details: `Membuat berkas Backup Database Lengkap (${students.length} siswa, ${student_class_history.length} riwayat kelas, ${student_graduations.length} data kelulusan).`
  });

  return payload;
}

export interface BackupValidationReport {
  isValid: boolean;
  schemaCompatible: boolean;
  errors: string[];
  warnings: string[];
  meta?: FullDatabaseBackupPayload['backup_meta'];
  tableCounts: Record<string, number>;
  duplicateNisnCount: number;
  existingOverlapCount: number;
}

export async function validateDatabaseBackupPayload(
  rawJson: unknown
): Promise<BackupValidationReport> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const tableCounts: Record<string, number> = {};

  if (!rawJson || typeof rawJson !== 'object') {
    return {
      isValid: false,
      schemaCompatible: false,
      errors: ['Format berkas bukan objek JSON yang valid.'],
      warnings: [],
      tableCounts: {},
      duplicateNisnCount: 0,
      existingOverlapCount: 0
    };
  }

  const obj = rawJson as Partial<FullDatabaseBackupPayload>;
  if (!obj.backup_meta || !obj.tables) {
    errors.push('Struktur berkas tidak memiliki header `backup_meta` atau objek `tables`.');
  }

  const schemaVersion = obj.backup_meta?.schema_version || '';
  const schemaCompatible = schemaVersion.startsWith('1.') || schemaVersion.startsWith('2.');
  if (!schemaCompatible) {
    errors.push(
      `Versi skema backup (${schemaVersion || 'tidak diketahui'}) tidak kompatibel dengan SIPDS v2.0.`
    );
  }

  const requiredTables: (keyof FullDatabaseBackupPayload['tables'])[] = [
    'academic_years',
    'classes',
    'students',
    'student_class_history',
    'student_mutations',
    'student_graduations'
  ];

  for (const t of requiredTables) {
    const arr = obj.tables?.[t];
    if (!Array.isArray(arr)) {
      errors.push(`Tabel wajib "${t}" tidak ditemukan atau bukan array.`);
      tableCounts[t] = 0;
    } else {
      tableCounts[t] = arr.length;
    }
  }

  const optionalTables: (keyof FullDatabaseBackupPayload['tables'])[] = [
    'parent_student_access',
    'student_change_requests',
    'import_batches',
    'export_logs',
    'audit_logs'
  ];
  for (const t of optionalTables) {
    const arr = obj.tables?.[t];
    tableCounts[t] = Array.isArray(arr) ? arr.length : 0;
  }

  // Periksa duplikasi NISN di dalam berkas backup dan tumpang tindih dengan database saat ini
  const backupStudents = Array.isArray(obj.tables?.students) ? obj.tables!.students : [];
  const seenNisn = new Set<string>();
  let duplicateNisnCount = 0;
  backupStudents.forEach(s => {
    if (s.nisn) {
      if (seenNisn.has(s.nisn)) duplicateNisnCount++;
      else seenNisn.add(s.nisn);
    }
  });

  if (duplicateNisnCount > 0) {
    warnings.push(
      `Ditemukan ${duplicateNisnCount} NISN ganda di dalam berkas backup. Baris duplikat akan dilewati/digabungkan secara aman.`
    );
  }

  const existingStudents = await getSiswaList();
  const existingNisnSet = new Set(existingStudents.map(s => s.nisn).filter(Boolean));
  let existingOverlapCount = 0;
  backupStudents.forEach(s => {
    if (s.nisn && existingNisnSet.has(s.nisn)) {
      existingOverlapCount++;
    }
  });

  if (existingOverlapCount > 0) {
    warnings.push(
      `Terdapat ${existingOverlapCount} siswa di berkas backup yang sudah terdaftar di database saat ini.`
    );
  }

  return {
    isValid: errors.length === 0,
    schemaCompatible,
    errors,
    warnings,
    meta: obj.backup_meta,
    tableCounts,
    duplicateNisnCount,
    existingOverlapCount
  };
}

export async function restoreFullDatabaseBackup(
  backup: FullDatabaseBackupPayload,
  mode: 'skip_existing' | 'merge_update',
  actor: { id: string; name: string; role: string }
): Promise<{
  restoredStudents: number;
  skippedStudents: number;
  restoredHistory: number;
  restoredGraduations: number;
  restoredAcademicYears: number;
  restoredClasses: number;
}> {
  if (actor.role !== 'super_admin' && actor.role !== 'admin') {
    throw new Error('Hanya Super Admin atau Admin yang dapat memulihkan database.');
  }

  const validation = await validateDatabaseBackupPayload(backup);
  if (!validation.isValid) {
    throw new Error('Berkas backup tidak valid: ' + validation.errors.join(', '));
  }

  let restoredAcademicYears = 0;
  let restoredClasses = 0;
  let restoredStudents = 0;
  let skippedStudents = 0;
  let restoredHistory = 0;
  let restoredGraduations = 0;

  // 1. Pulihkan Tahun Pelajaran
  for (const ay of backup.tables.academic_years || []) {
    await saveAcademicYearRecord(
      {
        tahun_ajaran: ay.tahun_ajaran,
        semester: ay.semester,
        is_active: ay.is_active,
        is_archived: ay.is_archived,
        tanggal_mulai: ay.tanggal_mulai,
        tanggal_selesai: ay.tanggal_selesai,
        catatan: ay.catatan
      },
      actor
    );
    restoredAcademicYears++;
  }

  // 2. Pulihkan Kelas
  for (const cls of backup.tables.classes || []) {
    await saveClassRecord(
      {
        nama_kelas: cls.nama_kelas,
        tingkat: cls.tingkat,
        wali_kelas: cls.wali_kelas,
        kamar_default: cls.kamar_default,
        kapasitas: cls.kapasitas,
        is_active: cls.is_active
      },
      actor
    );
    restoredClasses++;
  }

  // 3. Pulihkan Siswa
  const existingStudents = await getSiswaList();
  const existingByNisn = new Map(existingStudents.map(s => [s.nisn, s]));

  for (const st of backup.tables.students || []) {
    const existing = st.nisn ? existingByNisn.get(st.nisn) : undefined;
    if (existing && mode === 'skip_existing') {
      skippedStudents++;
      continue;
    }

    if (isSupabaseConfigured) {
      const supabase = getSupabase();
      if (supabase) {
        const dbRow = mapSiswaToDbPayload(st);
        if (existing) {
          await supabase.from('students').update(dbRow).eq('id', existing.id);
        } else {
          await supabase.from('students').insert([dbRow]);
        }
        restoredStudents++;
        continue;
      }
    }

    if (existing) {
      const idx = siswaStore.findIndex(s => s.id === existing.id);
      if (idx >= 0) siswaStore[idx] = { ...existing, ...st, id: existing.id };
    } else {
      siswaStore.push({ ...st, id: st.id || crypto.randomUUID() });
    }
    restoredStudents++;
  }

  // 4. Pulihkan Riwayat Kelas
  for (const hist of backup.tables.student_class_history || []) {
    const res = await saveClassHistoryPlacement(
      {
        student_id: hist.student_id,
        tahun_ajaran: hist.tahun_ajaran || '2025/2026',
        semester: hist.semester,
        kelas: hist.kelas,
        kamar: hist.kamar,
        status_riwayat: hist.status_riwayat,
        tanggal_mulai: hist.tanggal_mulai,
        catatan: hist.catatan
      },
      actor
    );
    if (res.status === 'inserted') restoredHistory++;
  }

  // 5. Pulihkan Data Kelulusan
  if (isSupabaseConfigured) {
    const supabase = getSupabase();
    if (supabase && Array.isArray(backup.tables.student_graduations)) {
      for (const grad of backup.tables.student_graduations) {
        const { error } = await supabase.from('student_graduations').upsert(
          [
            {
              student_id: grad.student_id,
              nis: grad.nis || null,
              nisn: grad.nisn,
              nama_siswa: grad.nama_siswa,
              angkatan: grad.angkatan,
              kelas_terakhir: grad.kelas_terakhir,
              tahun_ajaran_lulus: grad.tahun_ajaran_lulus,
              tahun_kelulusan: grad.tahun_kelulusan,
              tanggal_kelulusan: grad.tanggal_kelulusan,
              nomor_ijazah_smp: grad.nomor_ijazah_smp || null,
              sekolah_lanjutan: grad.sekolah_lanjutan || null,
              status_kelulusan: grad.status_kelulusan || 'Lulus',
              diproses_oleh_nama: grad.diproses_oleh_nama || actor.name,
              catatan: grad.catatan || null
            }
          ],
          { onConflict: 'student_id' }
        );
        if (!error) restoredGraduations++;
      }
    }
  } else {
    for (const grad of backup.tables.student_graduations || []) {
      if (!graduationsStore.some(g => g.student_id === grad.student_id)) {
        graduationsStore.push(grad);
        restoredGraduations++;
      }
    }
  }

  recordAuditLog({
    user_id: actor.id,
    user_name: actor.name,
    user_role: actor.role,
    user_type: 'admin',
    action: 'FULL_DATABASE_RESTORE',
    target_type: 'database_backup',
    target_id: backup.backup_meta.created_at,
    new_values: {
      mode,
      restoredStudents,
      skippedStudents,
      restoredHistory,
      restoredGraduations,
      restoredAcademicYears,
      restoredClasses
    },
    details: `Pemulihan Database dari backup (${backup.backup_meta.created_at}): ${restoredStudents} siswa dipulihkan, ${skippedStudents} dilewati, ${restoredHistory} riwayat kelas, ${restoredGraduations} kelulusan.`
  });

  return {
    restoredStudents,
    skippedStudents,
    restoredHistory,
    restoredGraduations,
    restoredAcademicYears,
    restoredClasses
  };
}


