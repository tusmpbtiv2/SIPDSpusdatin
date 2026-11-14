import * as XLSX from 'xlsx';
import {
  Siswa,
  Mutasi,
  MutationCategory,
  Gender,
  StudentStatus,
  ImportMode,
  ALL_59_STUDENT_FIELDS
} from '../types';
import {
  toUpperStudentName,
  normalizeDaerahKotaKab,
  resolveAndNormalizeDaerahSiswa,
  mapIncomeToRange
} from '../utils/formatters';

export interface ParsedStudentRow {
  rowNumber: number;
  sheetName?: string;
  data: Partial<Siswa>;
  isValid: boolean;
  actionType: 'insert' | 'update' | 'invalid';
  errors: string[];
}

export interface SheetDataInfo {
  sheetName: string;
  headers: string[];
  rawRows: Record<string, string>[];
  autoMapping: Record<string, keyof Siswa | ''>;
}

export interface ExcelSheetParseResult {
  headers: string[];
  rawRows: Record<string, string>[];
  autoMapping: Record<string, keyof Siswa | ''>;
  sheetNames?: string[];
  selectedSheet?: string;
  sheetsMap?: Record<string, SheetDataInfo>;
}

export interface ParsedMutationImportRow {
  rowNumber: number;
  sheetName?: string;
  jenis: 'masuk' | 'keluar';
  matchedStudent?: Siswa;
  kelas: string;
  nis: string;
  nisn: string;
  nama_siswa: string;
  jenis_kelamin: 'L' | 'P';
  tanggal_pindah: string;
  kategori_mutasi: MutationCategory;
  alasan_pindah: string;
  sekolah_asal: string;
  sekolah_tujuan: string;
  npsn_sekolah: string;
  kabupaten_sekolah: string;
  provinsi_sekolah: string;
  no_surat: string;
  tahun_ajaran: string;
  keterangan: string;
  validationStatus: 'valid' | 'duplicate' | 'failed';
  errors: string[];
}

export const STUDENT_CSV_HEADERS = ALL_59_STUDENT_FIELDS.map(f => f.excelHeader);

function normalizeHeaderKey(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Normalisasi nama kelas (mendukung angka Romawi VII/VIII/IX, Kelas 7, 7A, VII-A, 7.1, dsb.)
 */
export function normalizeKelasValue(rawKelas?: string, fallbackKelas = '7A'): {
  rombel: string;
  tingkat: '7' | '8' | '9';
} {
  let str = String(rawKelas || '').trim().toUpperCase();
  if (!str || str === '-') {
    str = fallbackKelas.trim().toUpperCase() || '7A';
  }

  // Hilangkan awalan kata "KELAS" atau "ROMBEL"
  str = str.replace(/^(KELAS|KLS|ROMBEL)\s*/i, '').trim();

  // Konversi angka Romawi VIII, VII, IX di awal string
  if (/^VIII(\b|[^I]|$)/.test(str)) {
    str = '8' + str.slice(4).replace(/^[\s._-]+/, '');
  } else if (/^VII(\b|[^I]|$)/.test(str)) {
    str = '7' + str.slice(3).replace(/^[\s._-]+/, '');
  } else if (/^IX(\b|[^I]|$)/.test(str)) {
    str = '9' + str.slice(2).replace(/^[\s._-]+/, '');
  }

  // Bersihkan spasi/strip di antara angka tingkat dan huruf kelas (misal "7 A" -> "7A", "7-B" -> "7B")
  const matchLevelSub = str.match(/^([789])[\s._-]*([A-Z0-9]+)$/);
  if (matchLevelSub) {
    const level = matchLevelSub[1] as '7' | '8' | '9';
    let sub = matchLevelSub[2];
    // Jika format 7.1 -> 7A, 7.2 -> 7B, dst.
    if (/^[1-9]$/.test(sub)) {
      sub = String.fromCharCode(64 + parseInt(sub, 10));
    }
    return { rombel: `${level}${sub}`, tingkat: level };
  }

  // Jika hanya berisi angka tingkat "7", "8", atau "9" tanpa huruf rombel
  if (str === '7' || str === '8' || str === '9') {
    const fb = fallbackKelas.trim().toUpperCase();
    if (fb.startsWith(str) && fb.length > 1) {
      return { rombel: fb, tingkat: str as '7' | '8' | '9' };
    }
    return { rombel: `${str}A`, tingkat: str as '7' | '8' | '9' };
  }

  const firstChar = str.charAt(0);
  const tingkat: '7' | '8' | '9' =
    firstChar === '8' ? '8' : firstChar === '9' ? '9' : '7';

  return { rombel: str, tingkat };
}

/**
 * Deteksi kelas default dari nama Sheet Excel (mis. "KELAS 7", "VII A", "Kelas 8B")
 */
export function inferClassFromSheetName(sheetName: string, defaultFallback = '7A'): string {
  const clean = String(sheetName || '').trim().toUpperCase();
  if (!clean) return defaultFallback;

  const match = clean.match(/(?:KELAS|KLS|ROMBEL)?\s*(VIII|VII|IX|[789])[\s._-]*([A-F1-6])?\b/);
  if (match) {
    const raw = `${match[1]}${match[2] || ''}`;
    return normalizeKelasValue(raw, defaultFallback).rombel;
  }
  return defaultFallback;
}

/**
 * Pemetaan otomatis nama header Excel ke 59 kolom database `students`
 */
export function autoMapExcelHeaders(headers: string[]): Record<string, keyof Siswa | ''> {
  const mapping: Record<string, keyof Siswa | ''> = {};

  const aliasMap: Record<string, keyof Siswa> = {
    kelas: 'rombel',
    kls: 'rombel',
    rombel: 'rombel',
    rombonganbelajar: 'rombel',
    nis: 'nis',
    noinduk: 'nis',
    nomorinduk: 'nis',
    nomorinduksiswa: 'nis',
    idyys: 'id_yys',
    idyyd: 'id_yys',
    idyayasan: 'id_yys',
    kamar: 'kamar',
    asrama: 'kamar',
    ruangkamar: 'kamar',
    namalengkapsiswa: 'nama_lengkap',
    namalengkap: 'nama_lengkap',
    namasiswa: 'nama_lengkap',
    nama: 'nama_lengkap',
    namamurid: 'nama_lengkap',
    nokk: 'no_kk',
    nomorkk: 'no_kk',
    nomorkartukeluarga: 'no_kk',
    niksiswa: 'nik_siswa',
    nik: 'nik_siswa',
    nomornik: 'nik_siswa',
    nisn: 'nisn',
    nomornisn: 'nisn',
    noijazahsdmi: 'no_ijazah_sd',
    noijazahsd: 'no_ijazah_sd',
    noijazah: 'no_ijazah_sd',
    nomorijazah: 'no_ijazah_sd',
    tanggalpenerbitanijazah: 'tgl_ijazah_sd',
    tglpenerbitanijazah: 'tgl_ijazah_sd',
    tglijazahsd: 'tgl_ijazah_sd',
    tglijazah: 'tgl_ijazah_sd',
    tanggalijazah: 'tgl_ijazah_sd',
    jeniskelamin: 'jenis_kelamin',
    jk: 'jenis_kelamin',
    lp: 'jenis_kelamin',
    kelamin: 'jenis_kelamin',
    tempatlahir: 'tempat_lahir',
    tmplahir: 'tempat_lahir',
    kotakelahiran: 'tempat_lahir',
    tanggallahir: 'tanggal_lahir',
    tgllahir: 'tanggal_lahir',
    agama: 'agama',
    beratbadan: 'berat_badan',
    beratbadankg: 'berat_badan',
    bb: 'berat_badan',
    tinggibadan: 'tinggi_badan',
    tinggibadancm: 'tinggi_badan',
    tb: 'tinggi_badan',
    riwayatpenyakit: 'riwayat_penyakit',
    penyakit: 'riwayat_penyakit',
    statusanak: 'status_anak',
    statusdalamkeluarga: 'status_anak',
    kewarganegaraan: 'kewarganegaraan',
    wniwna: 'kewarganegaraan',
    anakke: 'anak_ke',
    anakkeberapa: 'anak_ke',
    jumlahsaudarakandung: 'jml_saudara_kandung',
    jmlsaudarakandung: 'jml_saudara_kandung',
    saudarakandung: 'jml_saudara_kandung',
    jumlahsaudaratiri: 'jml_saudara_tiri',
    jmlsaudaratiri: 'jml_saudara_tiri',
    saudaratiri: 'jml_saudara_tiri',
    jalandusun: 'jalan_dusun',
    jalan: 'jalan_dusun',
    dusun: 'jalan_dusun',
    rtrw: 'rt_rw',
    desakelurahan: 'kelurahan',
    kelurahan: 'kelurahan',
    desa: 'kelurahan',
    kecamatan: 'kecamatan',
    kodepos: 'kode_pos',
    kotakabupaten: 'kab_kota',
    kabupatenkota: 'kab_kota',
    kabkota: 'kab_kota',
    kabupaten: 'kab_kota',
    kota: 'kab_kota',
    provinsi: 'provinsi',
    propinsi: 'provinsi',
    alamatlengkap: 'alamat',
    alamat: 'alamat',
    jenjang: 'jenjang_asal',
    jenjangasal: 'jenjang_asal',
    jenjangsekolahasal: 'jenjang_asal',
    namaasalsekolah: 'nama_asal_sekolah',
    asalsekolah: 'nama_asal_sekolah',
    sekolahasal: 'nama_asal_sekolah',
    npsnasalsekolah: 'npsn_asal_sekolah',
    npsn: 'npsn_asal_sekolah',
    npsnsekolahasal: 'npsn_asal_sekolah',
    kecamatanasalsekolah: 'kecamatan_asal_sekolah',
    kabupatenasalsekolah: 'kabupaten_asal_sekolah',
    provinsiasalsekolah: 'provinsi_asal_sekolah',
    namaayah: 'nama_ayah',
    namaayahkandung: 'nama_ayah',
    nikayah: 'nik_ayah',
    tempatlahirayah: 'tempat_lahir_ayah',
    tgllahirayah: 'tgl_lahir_ayah',
    tanggallahirayah: 'tgl_lahir_ayah',
    pendidikanayah: 'pendidikan_ayah',
    pekerjaanayah: 'pekerjaan_ayah',
    nowaayah: 'no_wa_ayah',
    nohpayah: 'no_wa_ayah',
    notelpayah: 'no_wa_ayah',
    penghasilanayah: 'penghasilan_ayah',
    penghasilanayahkandung: 'penghasilan_ayah',
    penghasilanratarataayah: 'penghasilan_ayah',
    penghasilanrata2ayah: 'penghasilan_ayah',
    penghasilanbulananayah: 'penghasilan_ayah',
    gajiayah: 'penghasilan_ayah',
    pendapatanayah: 'penghasilan_ayah',
    namaibukandung: 'nama_ibu',
    namaibu: 'nama_ibu',
    nikibu: 'nik_ibu',
    tempatlahiribu: 'tempat_lahir_ibu',
    tgllahiribu: 'tgl_lahir_ibu',
    tanggallahiribu: 'tgl_lahir_ibu',
    pendidikanibu: 'pendidikan_ibu',
    pekerjaanibu: 'pekerjaan_ibu',
    nowaibu: 'no_wa_ibu',
    nohpibu: 'no_wa_ibu',
    notelpibu: 'no_wa_ibu',
    penghasilanibu: 'penghasilan_ibu',
    penghasilanibukandung: 'penghasilan_ibu',
    penghasilanratarataibu: 'penghasilan_ibu',
    penghasilanrata2ibu: 'penghasilan_ibu',
    penghasilanbulananibu: 'penghasilan_ibu',
    gajiibu: 'penghasilan_ibu',
    pendapatanibu: 'penghasilan_ibu',
    namawali: 'nama_wali',
    nikwali: 'nik_wali',
    pekerjaanwali: 'pekerjaan_wali',
    penghasilanwali: 'penghasilan_wali',
    penghasilanrataratawali: 'penghasilan_wali',
    penghasilanrata2wali: 'penghasilan_wali',
    gajiwali: 'penghasilan_wali',
    pendapatanwali: 'penghasilan_wali',
    nohpwali: 'no_hp_orangtua',
    nowawali: 'no_hp_orangtua',
    nohporangtua: 'no_hp_orangtua',
    statusaktif: 'status',
    status: 'status',
    statussiswa: 'status',
    tanggalmasuk: 'tanggal_masuk',
    tglmasuk: 'tanggal_masuk',
    tanggalditerima: 'tanggal_masuk',
    tanggalpindah: 'tanggal_masuk',
    tglpindah: 'tanggal_masuk',
    tanggalmutasi: 'tanggal_masuk',
    tglmutasi: 'tanggal_masuk',
    tanggalkeluar: 'tanggal_masuk',
    tglkeluar: 'tanggal_masuk',
    tmt: 'tanggal_masuk',
    terhitungmulaitanggal: 'tanggal_masuk',
    waktupindah: 'tanggal_masuk',
    bulanpindah: 'tanggal_masuk'
  };

  for (const field of ALL_59_STUDENT_FIELDS) {
    aliasMap[normalizeHeaderKey(field.excelHeader)] = field.key;
    aliasMap[normalizeHeaderKey(field.dbColumn)] = field.key;
    aliasMap[normalizeHeaderKey(field.label)] = field.key;
  }

  let currentParentSection: 'ayah' | 'ibu' | 'wali' | null = null;
  let genericIncomeCount = 0;
  const usedTargets = new Set<keyof Siswa>();

  for (const h of headers) {
    const norm = normalizeHeaderKey(h);
    const baseNorm = normalizeHeaderKey(h.replace(/_\d+$/, ''));

    if (norm.includes('ayah')) currentParentSection = 'ayah';
    else if (norm.includes('ibu')) currentParentSection = 'ibu';
    else if (norm.includes('wali')) currentParentSection = 'wali';

    let mappedKey: keyof Siswa | '' = aliasMap[norm] || aliasMap[baseNorm] || '';

    // Deteksi kolom generik berulang di dalam blok Ayah / Ibu / Wali (mis. "PENGHASILAN", "PENGHASILAN_50", "PEKERJAAN_48")
    const isGenericIncome =
      baseNorm === 'penghasilan' ||
      baseNorm === 'penghasilanratarata' ||
      baseNorm === 'penghasilanrata2' ||
      baseNorm === 'penghasilanperbulan' ||
      baseNorm === 'penghasilanbulanan' ||
      baseNorm === 'gaji' ||
      baseNorm === 'pendapatan';

    if (isGenericIncome && !norm.includes('ayah') && !norm.includes('ibu') && !norm.includes('wali')) {
      if (currentParentSection === 'ayah' && !usedTargets.has('penghasilan_ayah')) {
        mappedKey = 'penghasilan_ayah';
      } else if (currentParentSection === 'ibu' && !usedTargets.has('penghasilan_ibu')) {
        mappedKey = 'penghasilan_ibu';
      } else if (currentParentSection === 'wali' && !usedTargets.has('penghasilan_wali')) {
        mappedKey = 'penghasilan_wali';
      } else if (genericIncomeCount === 0 && !usedTargets.has('penghasilan_ayah')) {
        mappedKey = 'penghasilan_ayah';
      } else if (genericIncomeCount === 1 && !usedTargets.has('penghasilan_ibu')) {
        mappedKey = 'penghasilan_ibu';
      } else if (!usedTargets.has('penghasilan_wali')) {
        mappedKey = 'penghasilan_wali';
      }
      genericIncomeCount++;
    } else if (!mappedKey && currentParentSection) {
      if (baseNorm === 'pekerjaan') {
        mappedKey =
          currentParentSection === 'ayah'
            ? 'pekerjaan_ayah'
            : currentParentSection === 'ibu'
            ? 'pekerjaan_ibu'
            : 'pekerjaan_wali';
      } else if (baseNorm === 'pendidikan' && currentParentSection !== 'wali') {
        mappedKey = currentParentSection === 'ayah' ? 'pendidikan_ayah' : 'pendidikan_ibu';
      } else if ((baseNorm === 'nowa' || baseNorm === 'nohp' || baseNorm === 'notelp') && currentParentSection !== 'wali') {
        mappedKey = currentParentSection === 'ayah' ? 'no_wa_ayah' : 'no_wa_ibu';
      }
    }

    if (mappedKey) {
      usedTargets.add(mappedKey);
    }
    mapping[h] = mappedKey;
  }

  return mapping;
}

/**
 * Konversi nilai tanggal Excel (termasuk Excel serial number, DD/MM/YYYY, MM/DD/YYYY,
 * nama bulan Indonesia & Inggris, Bulan-Tahun, atau timestamp ISO) menjadi YYYY-MM-DD
 */
function sanitizeValidIsoDate(yearNum: number, monthNum: number, dayNum: number): string {
  if (!Number.isFinite(yearNum) || !Number.isFinite(monthNum) || !Number.isFinite(dayNum)) {
    return '';
  }
  if (yearNum < 1900 || yearNum > 2100) return '';
  let m = monthNum;
  let d = dayNum;
  if (m > 12 && d >= 1 && d <= 12) {
    const tmp = m;
    m = d;
    d = tmp;
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) return '';
  const maxDay = new Date(yearNum, m, 0).getDate();
  if (d > maxDay) {
    d = maxDay;
  }
  return `${String(yearNum).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const EXCEL_MONTH_MAP: Record<string, number> = {
  januari: 1, january: 1, jan: 1,
  februari: 2, pebruari: 2, february: 2, feb: 2, peb: 2,
  maret: 3, march: 3, mar: 3, mrt: 3,
  april: 4, apr: 4,
  mei: 5, may: 5,
  juni: 6, june: 6, jun: 6,
  juli: 7, july: 7, jul: 7,
  agustus: 8, august: 8, agu: 8, agt: 8, aug: 8, ags: 8, agust: 8,
  september: 9, sep: 9, sept: 9, spt: 9,
  oktober: 10, october: 10, okt: 10, oct: 10,
  november: 11, nopember: 11, nov: 11, nop: 11,
  desember: 12, december: 12, des: 12, dec: 12
};

export function excelSerialToIsoDate(serialVal: number): string {
  const serial = Math.floor(serialVal);
  if (!Number.isFinite(serial) || serial <= 15000 || serial >= 65000) return '';
  const utcDays = Math.floor(serial - 25569);
  const d = new Date(utcDays * 86400 * 1000);
  if (Number.isNaN(d.getTime())) return '';
  return sanitizeValidIsoDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function normalizeExcelDate(val: unknown, fallbackTahunAjaran?: string): string {
  if (val === undefined || val === null) return '';
  if (typeof val === 'number') {
    return excelSerialToIsoDate(val);
  }
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    return sanitizeValidIsoDate(val.getFullYear(), val.getMonth() + 1, val.getDate());
  }

  let str = String(val).trim();
  if (!str || str === '-' || str === '0' || /^0+([/. -]0+)+$/.test(str)) return '';

  // Hilangkan tanda kutip satu di depan dari sel teks Excel
  if (str.startsWith("'")) {
    str = str.slice(1).trim();
  }

  // Hilangkan keterangan dalam kurung di belakang, mis. "15 Juli 2025 (Ganjil)"
  str = str.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();

  // Hilangkan awalan kata seperti "Tanggal", "Tgl.", "TMT", dsb.
  str = str.replace(/^(tanggal|tgl\.?|tmt\.?|terhitung\s+mulai\s+tanggal)\s*[:=-]?\s*/i, '').trim();

  // Jika sel menggabungkan tempat/hari & tanggal dengan koma (contoh: "Bogor, 14-08-2012" atau "Senin, 15 Juli 2025")
  // HANYA buang bagian sebelum koma jika bagian sebelum koma TIDAK mengandung angka (agar "Jul 15, 2025" tidak rusak!)
  if (str.includes(',')) {
    const parts = str.split(',');
    const beforeComma = parts[0].trim();
    const afterComma = parts.slice(1).join(',').trim();
    if (!/\d/.test(beforeComma) && afterComma && /\d/.test(afterComma)) {
      str = afterComma;
    }
  }

  // Hilangkan suffix waktu ISO atau jam (mis. "2025-07-15T00:00:00.000Z" atau "2025-07-15 00:00:00" atau "15/07/2025 10:30")
  str = str
    .replace(/[T\s]+\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?(\s*(Z|[+-]\d{2}:?\d{2}|WIB|WITA|WIT))?$/i, '')
    .trim();

  // 1. Format YYYY-MM-DD atau YYYY/MM/DD atau YYYY.MM.DD (termasuk jika ada spasi di sekitar pemisah)
  const ymd = str.match(/^(\d{4})\s*[/. -]\s*(\d{1,2})\s*[/. -]\s*(\d{1,2})$/);
  if (ymd) {
    return sanitizeValidIsoDate(
      parseInt(ymd[1], 10),
      parseInt(ymd[2], 10),
      parseInt(ymd[3], 10)
    );
  }

  // 2. Format DD/MM/YYYY atau DD-MM-YYYY atau DD.MM.YYYY (serta MM/DD/YYYY)
  const dmy = str.match(/^(\d{1,2})\s*[/. -]\s*(\d{1,2})\s*[/. -]\s*(\d{4})$/);
  if (dmy) {
    const first = parseInt(dmy[1], 10);
    const second = parseInt(dmy[2], 10);
    const y = parseInt(dmy[3], 10);
    if (second >= 1 && second <= 12 && first >= 1 && first <= 31) {
      return sanitizeValidIsoDate(y, second, first);
    }
    if (first >= 1 && first <= 12 && second >= 1 && second <= 31) {
      return sanitizeValidIsoDate(y, first, second);
    }
    return '';
  }

  // 3. Format DD/MM/YY atau MM/DD/YY (format pendek SheetJS untuk sel Date Excel)
  const dmyShort = str.match(/^(\d{1,2})\s*[/. -]\s*(\d{1,2})\s*[/. -]\s*(\d{2})$/);
  if (dmyShort) {
    const first = parseInt(dmyShort[1], 10);
    const second = parseInt(dmyShort[2], 10);
    const yr = parseInt(dmyShort[3], 10);
    const fullYear = yr > 40 ? 1900 + yr : 2000 + yr;
    if (second >= 1 && second <= 12 && first >= 1 && first <= 31) {
      return sanitizeValidIsoDate(fullYear, second, first);
    }
    if (first >= 1 && first <= 12 && second >= 1 && second <= 31) {
      return sanitizeValidIsoDate(fullYear, first, second);
    }
    return '';
  }

  const lowerStr = str.toLowerCase();

  // 4a. Format "DD Bulan YYYY" atau "DD-Bulan-YY" (Indonesia & Inggris, mis. "15 Juli 2025", "15 July 2025", "15-Jul-25")
  const dMonthY = lowerStr.match(/^(\d{1,2})[\s/,.-]+([a-z]+)[\s/,.-]+(\d{2,4})$/);
  if (dMonthY && EXCEL_MONTH_MAP[dMonthY[2]]) {
    let yr = parseInt(dMonthY[3], 10);
    if (yr < 100) yr = yr > 40 ? 1900 + yr : 2000 + yr;
    return sanitizeValidIsoDate(yr, EXCEL_MONTH_MAP[dMonthY[2]], parseInt(dMonthY[1], 10));
  }

  // 4b. Format "Bulan DD, YYYY" atau "Bulan DD YYYY" (format Inggris Excel, mis. "Jul 15, 2025", "July 15, 2025", "August 10 25")
  const monthDY = lowerStr.match(/^([a-z]+)[\s/,.-]+(\d{1,2})[\s/,.-]+(\d{2,4})$/);
  if (monthDY && EXCEL_MONTH_MAP[monthDY[1]]) {
    let yr = parseInt(monthDY[3], 10);
    if (yr < 100) yr = yr > 40 ? 1900 + yr : 2000 + yr;
    return sanitizeValidIsoDate(yr, EXCEL_MONTH_MAP[monthDY[1]], parseInt(monthDY[2], 10));
  }

  // 4c. Format "YYYY Bulan DD" (mis. "2025 Juli 15")
  const yMonthD = lowerStr.match(/^(\d{4})[\s/,.-]+([a-z]+)[\s/,.-]+(\d{1,2})$/);
  if (yMonthD && EXCEL_MONTH_MAP[yMonthD[2]]) {
    return sanitizeValidIsoDate(
      parseInt(yMonthD[1], 10),
      EXCEL_MONTH_MAP[yMonthD[2]],
      parseInt(yMonthD[3], 10)
    );
  }

  // 4d. Format "Bulan YYYY" atau "Bulan-YY" (mis. "Juli 2025", "Agustus 2025", "Jul-25", "Agu-25") -> tanggal 01 bulan tersebut
  const monthY = lowerStr.match(/^([a-z]+)[\s/,.-]+(\d{2,4})$/);
  if (monthY && EXCEL_MONTH_MAP[monthY[1]]) {
    let yr = parseInt(monthY[2], 10);
    if (yr < 100) yr = yr > 40 ? 1900 + yr : 2000 + yr;
    return sanitizeValidIsoDate(yr, EXCEL_MONTH_MAP[monthY[1]], 1);
  }

  // 4e. Format "YYYY-MM" atau "MM/YYYY" atau "MM-YYYY" (mis. "2025-07", "07/2025", "08-2025")
  const ymOnly = str.match(/^(\d{4})\s*[/. -]\s*(\d{1,2})$/);
  if (ymOnly) {
    return sanitizeValidIsoDate(parseInt(ymOnly[1], 10), parseInt(ymOnly[2], 10), 1);
  }
  const myOnly = str.match(/^(\d{1,2})\s*[/. -]\s*(\d{4})$/);
  if (myOnly) {
    return sanitizeValidIsoDate(parseInt(myOnly[2], 10), parseInt(myOnly[1], 10), 1);
  }

  // 4f. Format Nama Bulan Saja (mis. "Juli", "Agustus", ..., "Juni") dengan konteks Tahun Pelajaran
  if (EXCEL_MONTH_MAP[lowerStr]) {
    const mNum = EXCEL_MONTH_MAP[lowerStr];
    const taMatch = (fallbackTahunAjaran || '2025/2026').match(/^(\d{4})\s*\/\s*(\d{4})$/);
    const startYear = taMatch ? parseInt(taMatch[1], 10) : 2025;
    const endYear = taMatch ? parseInt(taMatch[2], 10) : startYear + 1;
    // Semester Ganjil (Juli-Desember) masuk tahun awal TA, Semester Genap (Januari-Juni) masuk tahun akhir TA
    const resolvedYear = mNum >= 7 ? startYear : endYear;
    return sanitizeValidIsoDate(resolvedYear, mNum, 1);
  }

  // 4g. Ekstrak tanggal yang tertanam di dalam kalimat (mis. "Pindah tanggal 15 Juli 2025" atau "TMT: 12-08-2025")
  const embeddedIndo = lowerStr.match(/(\d{1,2})[\s/,.-]+([a-z]{3,10})[\s/,.-]+(\d{2,4})/);
  if (embeddedIndo && EXCEL_MONTH_MAP[embeddedIndo[2]]) {
    let yr = parseInt(embeddedIndo[3], 10);
    if (yr < 100) yr = yr > 40 ? 1900 + yr : 2000 + yr;
    const iso = sanitizeValidIsoDate(yr, EXCEL_MONTH_MAP[embeddedIndo[2]], parseInt(embeddedIndo[1], 10));
    if (iso) return iso;
  }
  const embeddedDmy = str.match(/(\d{1,2})\s*[/. -]\s*(\d{1,2})\s*[/. -]\s*(\d{4})/);
  if (embeddedDmy) {
    const first = parseInt(embeddedDmy[1], 10);
    const second = parseInt(embeddedDmy[2], 10);
    const y = parseInt(embeddedDmy[3], 10);
    const iso =
      second >= 1 && second <= 12
        ? sanitizeValidIsoDate(y, second, first)
        : sanitizeValidIsoDate(y, first, second);
    if (iso) return iso;
  }

  // 5. Format DDMMYYYY (8 digit angka langsung, mis. "25082012")
  if (/^\d{8}$/.test(str)) {
    const d1 = parseInt(str.slice(0, 2), 10);
    const m1 = parseInt(str.slice(2, 4), 10);
    const y1 = parseInt(str.slice(4, 8), 10);
    const tryDmy = sanitizeValidIsoDate(y1, m1, d1);
    if (tryDmy) return tryDmy;

    const y2 = parseInt(str.slice(0, 4), 10);
    const m2 = parseInt(str.slice(4, 6), 10);
    const d2 = parseInt(str.slice(6, 8), 10);
    const tryYmd = sanitizeValidIsoDate(y2, m2, d2);
    if (tryYmd) return tryYmd;
  }

  // 6. Excel serial date number (e.g. 45853)
  if (/^\d{4,5}(\.\d+)?$/.test(str)) {
    const iso = excelSerialToIsoDate(parseFloat(str));
    if (iso) return iso;
  }

  return '';
}

/**
 * Konversi string notasi ilmiah Excel (misal "3.17101E+15" atau "1.23456E+09") menjadi digit utuh
 */
function expandScientificNumberString(str: string): string {
  if (/^[+-]?\d+(\.\d+)?e[+-]?\d+$/i.test(str)) {
    const num = Number(str);
    if (Number.isFinite(num)) {
      return num.toLocaleString('fullwide', { useGrouping: false });
    }
  }
  return str;
}

/**
 * Pertahankan leading zero pada nomor identitas (NISN 10 digit, NIK/KK 16 digit, NPSN 8 digit, Kode Pos 5 digit, No HP/WA)
 */
export function preserveIdentityFormat(key: keyof Siswa, rawVal: unknown): string {
  if (rawVal === undefined || rawVal === null) return '';
  let str = String(rawVal).trim();
  if (!str || str === '-' || str.toLowerCase() === 'null' || str.toLowerCase() === 'belum ada') {
    return '';
  }

  // Hilangkan tanda kutip satu di depan jika berasal dari format teks Excel ('009...)
  if (str.startsWith("'")) {
    str = str.slice(1).trim();
  }

  str = expandScientificNumberString(str);

  if (key === 'nisn') {
    // Jika format "1234567890.0" dari Excel float, buang ".0" di akhir
    str = str.replace(/\.0+$/, '');
    const digits = str.replace(/\D/g, '');
    if (!digits || /^0+$/.test(digits)) return '';
    if (digits.length >= 5 && digits.length < 10) {
      return digits.padStart(10, '0');
    }
    if (digits.length === 10) {
      return digits;
    }
    if (digits.length > 10) {
      return digits.slice(-10);
    }
    // Jika kurang dari 5 digit (bukan NISN valid), kosongkan agar tidak melanggar constraint 10 digit DB
    return '';
  }

  if (key === 'nis') {
    str = str.replace(/\.0+$/, '').trim();
    if (!str || /^0+$/.test(str)) return '';
    return str;
  }

  if (key === 'no_kk' || key === 'nik_siswa' || key === 'nik_ayah' || key === 'nik_ibu' || key === 'nik_wali') {
    str = str.replace(/\.0+$/, '');
    const digits = str.replace(/\D/g, '');
    if (!digits || /^0+$/.test(digits)) return '';
    return digits;
  }

  if (key === 'no_wa_ayah' || key === 'no_wa_ibu' || key === 'no_hp_orangtua') {
    str = str.replace(/\.0+$/, '');
    const digits = str.replace(/[^0-9+]/g, '');
    if (/^[8]\d{8,12}$/.test(digits)) {
      return '0' + digits;
    }
    return digits;
  }

  if (key === 'tgl_ijazah_sd' || key === 'tanggal_lahir' || key === 'tgl_lahir_ayah' || key === 'tgl_lahir_ibu' || key === 'tanggal_masuk') {
    return normalizeExcelDate(str);
  }

  if (key === 'penghasilan_ayah' || key === 'penghasilan_ibu' || key === 'penghasilan_wali') {
    return mapIncomeToRange(str);
  }

  return str;
}

/**
 * Mencari baris header yang sebenarnya di dalam matriks sheet Excel
 * (mengatasi file Excel sekolah yang memiliki judul kop / baris kosong di baris 1-15)
 */
function findBestHeaderRowIndex(matrix: unknown[][]): number {
  const knownHeaderTokens = new Set([
    'kelas', 'kls', 'rombel', 'nis', 'nisn', 'idyys', 'idyyd', 'kamar',
    'namalengkapsiswa', 'namasiswa', 'namalengkap', 'nama',
    'nokk', 'niksiswa', 'nik', 'jeniskelamin', 'jk', 'tempatlahir', 'tanggallahir',
    'tanggalpindah', 'tglpindah', 'tanggalmutasi', 'tglmutasi', 'tanggalkeluar', 'tglkeluar',
    'tanggalmasuk', 'tglmasuk', 'tmt', 'alasanpindah', 'alasan', 'sekolahasal', 'asalsekolah', 'sekolahtujuan'
  ]);

  let bestRowIdx = 0;
  let bestScore = 0;
  const maxScan = Math.min(matrix.length, 20);

  for (let r = 0; r < maxScan; r++) {
    const row = matrix[r];
    if (!Array.isArray(row)) continue;
    let score = 0;
    for (const cell of row) {
      const norm = normalizeHeaderKey(String(cell || ''));
      if (norm && knownHeaderTokens.has(norm)) {
        score += 2;
      } else if (
        norm &&
        (norm.includes('nama') ||
          norm.includes('nis') ||
          norm.includes('kelas') ||
          norm.includes('sekolah') ||
          norm.includes('tanggal') ||
          norm.includes('tgl') ||
          norm.includes('pindah') ||
          norm.includes('mutasi'))
      ) {
        score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestRowIdx = r;
    }
  }

  return bestRowIdx;
}

/**
 * Mengekstrak satu sheet dari Workbook menjadi headers, rawRows, dan autoMapping
 */
function extractSheetData(
  workbook: XLSX.WorkBook,
  sheetName: string
): SheetDataInfo {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    return { sheetName, headers: [], rawRows: [], autoMapping: {} };
  }

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    dateNF: 'yyyy-mm-dd',
    defval: ''
  });

  const rawMatrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: ''
  });

  if (!matrix || matrix.length === 0) {
    return { sheetName, headers: [], rawRows: [], autoMapping: {} };
  }

  const headerRowIdx = findBestHeaderRowIndex(matrix);
  const headerRow = matrix[headerRowIdx] || [];
  const prevRow = headerRowIdx > 0 ? matrix[headerRowIdx - 1] || [] : [];
  const nextRow = matrix[headerRowIdx + 1] || [];

  const subHeaderTokens = new Set([
    'namalengkapsiswa',
    'niksiswa',
    'noijazahsdmi',
    'tanggalpindah',
    'tglpindah',
    'tanggalmutasi',
    'tglmutasi',
    'tanggalkeluar',
    'tglkeluar',
    'tanggalmasuk',
    'tglmasuk',
    'alasanpindah',
    'sekolahtujuan',
    'sekolahasal',
    'asalsekolah',
    'nosurat',
    'nosuratmutasi'
  ]);

  // Gabungkan sub-header jika baris tepat di bawah header adalah sub-header grup (mis. Ayah/Ibu/Sekolah Asal/Mutasi)
  const isSubHeaderRow =
    Array.isArray(nextRow) &&
    nextRow.some(c => {
      const n = normalizeHeaderKey(String(c || ''));
      return subHeaderTokens.has(n);
    });

  // Cek juga apakah baris tepat di atas headerRowIdx memiliki header utama yang di-merge vertikal (mis. KELAS, NIS, NAMA)
  const hasParentHeaderAbove =
    headerRowIdx > 0 &&
    Array.isArray(prevRow) &&
    prevRow.some((c, idx) => {
      const n = normalizeHeaderKey(String(c || ''));
      const currEmpty = !String(headerRow[idx] || '').trim();
      return currEmpty && (n === 'kelas' || n === 'nis' || n === 'nisn' || n.includes('nama'));
    });

  const usedHeaderNames = new Set<string>();
  const maxCols = Math.max(
    headerRow.length,
    isSubHeaderRow ? nextRow.length : 0,
    hasParentHeaderAbove ? prevRow.length : 0
  );
  const rawHeaders: string[] = [];
  for (let idx = 0; idx < maxCols; idx++) {
    const primary = String(headerRow[idx] || '').trim();
    const sub = isSubHeaderRow ? String(nextRow[idx] || '').trim() : '';
    const parent = hasParentHeaderAbove ? String(prevRow[idx] || '').trim() : '';
    let baseName = sub || primary || parent || `Kolom_${idx + 1}`;
    if (usedHeaderNames.has(baseName)) {
      baseName = `${baseName}_${idx + 1}`;
    }
    usedHeaderNames.add(baseName);
    rawHeaders.push(baseName);
  }

  const startDataIdx = isSubHeaderRow ? headerRowIdx + 2 : headerRowIdx + 1;
  const inferredSheetKelas = inferClassFromSheetName(sheetName, '');
  const autoMapping = autoMapExcelHeaders(rawHeaders);

  const isDateLikeColumn = (headerName: string): boolean => {
    const norm = normalizeHeaderKey(headerName);
    return (
      norm.includes('tanggal') ||
      norm.includes('tgl') ||
      norm.includes('pindah') ||
      norm.includes('mutasi') ||
      norm.includes('masuk') ||
      norm.includes('keluar') ||
      norm.includes('lahir') ||
      norm.includes('ijazah') ||
      norm === 'tmt' ||
      norm.includes('waktu') ||
      norm.includes('bulan')
    );
  };

  const rawRows: Record<string, string>[] = [];
  for (let i = startDataIdx; i < matrix.length; i++) {
    const rowArr = matrix[i];
    const rawRowArr = rawMatrix[i] || [];
    if (!Array.isArray(rowArr) || rowArr.every(cell => !String(cell ?? '').trim())) continue;

    // Abaikan baris penomoran kolom [1, 2, 3, 4...] atau baris rekap "JUMLAH" / "TOTAL"
    const nonEmptyCells = rowArr.map(c => String(c ?? '').trim()).filter(Boolean);
    if (nonEmptyCells.length === 0) continue;
    const isNumberingRow =
      nonEmptyCells.length >= 4 &&
      nonEmptyCells.every((val, idx) => val === String(idx + 1) || /^\(\d+\)$/.test(val));
    if (isNumberingRow) continue;

    const joinedLower = nonEmptyCells.join(' ').toLowerCase();
    if (
      nonEmptyCells.length <= 3 &&
      (joinedLower.startsWith('jumlah') || joinedLower.startsWith('total'))
    ) {
      continue;
    }

    const rowObj: Record<string, string> = {};
    rawHeaders.forEach((headerName, colIdx) => {
      const formattedCell = String(rowArr[colIdx] ?? '').trim();
      const rawCell = rawRowArr[colIdx];

      // Jika sel di Excel bertipe Date atau Serial Number Tanggal pada kolom tanggal, konversi langsung ke YYYY-MM-DD
      if (rawCell instanceof Date && !Number.isNaN(rawCell.getTime())) {
        const iso = sanitizeValidIsoDate(rawCell.getFullYear(), rawCell.getMonth() + 1, rawCell.getDate());
        if (iso) {
          rowObj[headerName] = iso;
          return;
        }
      }
      if (typeof rawCell === 'number' && rawCell > 15000 && rawCell < 65000) {
        if (
          isDateLikeColumn(headerName) ||
          /[/-]/.test(formattedCell) ||
          /[a-zA-Z]{3}/.test(formattedCell)
        ) {
          const iso = excelSerialToIsoDate(rawCell);
          if (iso) {
            rowObj[headerName] = iso;
            return;
          }
        }
      }

      rowObj[headerName] = formattedCell;
    });

    // Jika kolom KELAS kosong pada baris ini namun nama sheet menunjukkan kelas (mis. "KELAS 7" / "7A"), isi otomatis
    const kelasHeader = Object.keys(autoMapping).find(k => autoMapping[k] === 'rombel');
    if (inferredSheetKelas) {
      if (kelasHeader && !rowObj[kelasHeader]) {
        rowObj[kelasHeader] = inferredSheetKelas;
      } else if (!kelasHeader) {
        rowObj['KELAS'] = inferredSheetKelas;
      }
    }

    rawRows.push(rowObj);
  }

  if (inferredSheetKelas && !Object.values(autoMapping).includes('rombel') && rawRows.length > 0) {
    if (!rawHeaders.includes('KELAS')) rawHeaders.unshift('KELAS');
    autoMapping['KELAS'] = 'rombel';
  }

  return {
    sheetName,
    headers: rawHeaders,
    rawRows,
    autoMapping
  };
}

/**
 * Membaca berkas .xlsx, .xls, atau .csv menggunakan SheetJS (xlsx)
 * Mendukung multi-sheet (Kelas 7, Kelas 8, Kelas 9, Mutasi Masuk, Mutasi Keluar)
 */
export async function readExcelFile(
  file: File,
  preferredSheetName?: string
): Promise<ExcelSheetParseResult> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, {
    type: 'array',
    raw: false,
    cellText: true,
    cellDates: false
  });

  const sheetNames = workbook.SheetNames || [];
  if (sheetNames.length === 0) {
    return { headers: [], rawRows: [], autoMapping: {}, sheetNames: [], sheetsMap: {} };
  }

  const sheetsMap: Record<string, SheetDataInfo> = {};
  for (const name of sheetNames) {
    sheetsMap[name] = extractSheetData(workbook, name);
  }

  const selectedSheet =
    preferredSheetName && sheetsMap[preferredSheetName]
      ? preferredSheetName
      : sheetNames.find(n => sheetsMap[n].rawRows.length > 0) || sheetNames[0];

  const active = sheetsMap[selectedSheet];
  return {
    headers: active.headers,
    rawRows: active.rawRows,
    autoMapping: active.autoMapping,
    sheetNames,
    selectedSheet,
    sheetsMap
  };
}

/**
 * Menggabungkan beberapa sheet siswa (mis. Sheet Kelas 7 + Kelas 8 + Kelas 9) menjadi satu daftar baris
 */
export function combineWorkbookStudentSheets(
  sheetsMap: Record<string, SheetDataInfo>
): SheetDataInfo {
  const allHeadersSet = new Set<string>();
  const combinedRows: Record<string, string>[] = [];

  Object.values(sheetsMap).forEach(sheetInfo => {
    // Lewati sheet yang jelas merupakan sheet khusus mutasi/rekap jika sedang menggabungkan biodata siswa
    const lowerName = sheetInfo.sheetName.toLowerCase();
    if (
      lowerName.includes('mutasi') ||
      lowerName.includes('keluar') ||
      lowerName.includes('pindah') ||
      lowerName.includes('rekap')
    ) {
      return;
    }
    if (sheetInfo.rawRows.length === 0) return;

    sheetInfo.headers.forEach(h => allHeadersSet.add(h));
    sheetInfo.rawRows.forEach(r => {
      combinedRows.push({ ...r, __sheetName: sheetInfo.sheetName });
    });
  });

  const headers = Array.from(allHeadersSet);
  return {
    sheetName: '__ALL_STUDENT_SHEETS__',
    headers,
    rawRows: combinedRows,
    autoMapping: autoMapExcelHeaders(headers)
  };
}

export function normalizeStudentIdentityName(name?: string | null): string {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isSameStudentIdentity(nameA?: string | null, nameB?: string | null): boolean {
  const normA = normalizeStudentIdentityName(nameA);
  const normB = normalizeStudentIdentityName(nameB);
  if (!normA || !normB) return false;
  if (normA === normB) return true;
  const compactA = normA.replace(/\s+/g, '');
  const compactB = normB.replace(/\s+/g, '');
  if (compactA === compactB) return true;
  if (compactA.length >= 10 && compactB.length >= 10) {
    if (compactA.includes(compactB) || compactB.includes(compactA)) return true;
  }
  const tokensA = normA.split(' ').filter(t => t.length >= 4);
  const tokensB = normB.split(' ').filter(t => t.length >= 4);
  if (tokensA.length >= 2 && tokensB.length >= 2) {
    const shared = tokensA.filter(t =>
      tokensB.some(tb => tb === t || (t.length >= 5 && tb.length >= 5 && (t.startsWith(tb.slice(0, 5)) || tb.startsWith(t.slice(0, 5)))))
    );
    if (shared.length >= 2) return true;
  }
  return false;
}

/**
 * Memvalidasi & memetakan baris mentah Excel berdasarkan mapping kolom, deteksi duplikat NIS/NISN, dan mode import
 */
export function validateAndMapExcelRows(params: {
  rawRows: Record<string, string>[];
  columnMapping: Record<string, keyof Siswa | ''>;
  existingStudents: Siswa[];
  importMode: ImportMode;
  defaultKelas?: string;
}): ParsedStudentRow[] {
  const { rawRows, columnMapping, existingStudents, importMode, defaultKelas = '7A' } = params;

  const existingByNis = new Map<string, Siswa>();
  const existingByNisn = new Map<string, Siswa>();
  const existingByNameAndClass = new Map<string, Siswa>();
  existingStudents.forEach(s => {
    if (s.nis && s.nis.trim()) existingByNis.set(s.nis.trim(), s);
    if (s.nisn && s.nisn.trim()) existingByNisn.set(s.nisn.trim(), s);
    const normName = normalizeStudentIdentityName(s.nama_lengkap);
    const normRombel = String(s.rombel || '').trim().toUpperCase();
    if (normName && normRombel) {
      existingByNameAndClass.set(`${normName}__${normRombel}`, s);
    }
  });

  const seenNisInFile = new Map<string, { rowNumber: number; nama: string }>();
  const seenNisnInFile = new Map<string, { rowNumber: number; nama: string }>();

  // Filter keluar baris yang seluruh kolom pentingnya kosong (baris kosong di akhir tabel Excel)
  const meaningfulRows = rawRows.filter(rawRow => {
    return Object.entries(columnMapping).some(([excelHeader, targetKey]) => {
      if (!targetKey) return false;
      const v = String(rawRow[excelHeader] ?? '').trim();
      return v !== '' && v !== '-';
    });
  });

  return meaningfulRows.map((rawRow, idx) => {
    const rowNumber = idx + 2; // Baris 1 adalah header
    const mapped: Partial<Siswa> = {};
    const errors: string[] = [];

    for (const [excelHeader, targetKey] of Object.entries(columnMapping)) {
      if (!targetKey) continue;
      const cellValue = rawRow[excelHeader] ?? '';
      const formatted = preserveIdentityFormat(targetKey, cellValue);
      const existingVal = (mapped as Record<string, unknown>)[targetKey];
      if (formatted !== '' || existingVal === undefined) {
        (mapped as Record<string, unknown>)[targetKey] = formatted;
      }
    }

    // Fallback cari kolom NAMA LENGKAP SISWA secara heuristik jika mapping belum menangkapnya
    if (!mapped.nama_lengkap) {
      for (const [k, v] of Object.entries(rawRow)) {
        const norm = normalizeHeaderKey(k);
        if (norm.includes('nama') && !norm.includes('ayah') && !norm.includes('ibu') && !norm.includes('wali') && !norm.includes('sekolah')) {
          const cleanV = String(v || '').trim();
          if (cleanV && cleanV !== '-') {
            mapped.nama_lengkap = cleanV;
            break;
          }
        }
      }
    }

    // Normalisasi KELAS (mendukung Kelas 7, VII, VII A, 7A, 7B, 8A, 9A, dst.)
    const sheetFallback = rawRow.__sheetName
      ? inferClassFromSheetName(rawRow.__sheetName, defaultKelas)
      : defaultKelas;
    const normalizedKelas = normalizeKelasValue(mapped.rombel, sheetFallback);
    mapped.rombel = normalizedKelas.rombel;
    mapped.tingkat_kelas = normalizedKelas.tingkat;

    const jkRaw = String(mapped.jenis_kelamin || 'L').toUpperCase().trim();
    mapped.jenis_kelamin = (
      jkRaw.startsWith('P') || jkRaw.includes('PEREMPUAN') || jkRaw.includes('WANITA')
        ? 'P'
        : 'L'
    ) as Gender;

    const explicitStatusRaw = String(mapped.status || '').toLowerCase().trim();
    const explicitTanggalMasukRaw = String(mapped.tanggal_masuk || '').trim();

    mapped.agama = mapped.agama || 'Islam';
    mapped.kewarganegaraan = mapped.kewarganegaraan || 'WNI';
    mapped.jenjang_asal = mapped.jenjang_asal || 'SD';

    if (!mapped.alamat && mapped.jalan_dusun) {
      mapped.alamat = `${mapped.jalan_dusun} RT/RW ${mapped.rt_rw || '-'}, Kel. ${mapped.kelurahan || '-'}, Kec. ${mapped.kecamatan || '-'}`;
    }

    if (mapped.nama_lengkap) {
      mapped.nama_lengkap = toUpperStudentName(mapped.nama_lengkap);
    }

    const resolvedDaerah = resolveAndNormalizeDaerahSiswa({
      kab_kota: mapped.kab_kota,
      kabupaten_asal_sekolah: mapped.kabupaten_asal_sekolah,
      alamat: mapped.alamat,
      kecamatan: mapped.kecamatan,
      kelurahan: mapped.kelurahan,
      jalan_dusun: mapped.jalan_dusun,
      kecamatan_asal_sekolah: mapped.kecamatan_asal_sekolah,
      tempat_lahir: mapped.tempat_lahir,
      provinsi: mapped.provinsi
    });
    if (resolvedDaerah) {
      mapped.kab_kota = resolvedDaerah;
    }
    if (mapped.kabupaten_asal_sekolah) {
      mapped.kabupaten_asal_sekolah =
        normalizeDaerahKotaKab(mapped.kabupaten_asal_sekolah) || mapped.kabupaten_asal_sekolah;
    }

    const nisn = (mapped.nisn || '').trim();
    const nama = (mapped.nama_lengkap || '').trim();

    // Hanya NAMA LENGKAP SISWA yang mutlak wajib untuk siswa baru (karena siswa Kelas 7 sering kali belum memiliki NIS SMP atau NISN)
    if (!nama) {
      errors.push('NAMA LENGKAP SISWA wajib diisi');
    }

    if (nisn && !/^\d{10}$/.test(nisn)) {
      // Jika tidak 10 digit setelah normalisasi, kosongkan agar tidak menolak import Kelas 7
      mapped.nisn = '';
    }

    // Deteksi duplikat di dalam file Excel yang sama:
    // Jika nama siswa SAMA, tandai sebagai baris duplikat.
    // Jika nama siswa BERBEDA (salah ketik NIS/NISN antar siswa berbeda di Excel), kosongkan hanya NIS/NISN yang bentrok agar kedua siswa tetap masuk!
    let cleanNis = (mapped.nis || '').trim();
    let cleanNisn = (mapped.nisn || '').trim();

    if (cleanNis) {
      const prev = seenNisInFile.get(cleanNis);
      if (prev) {
        if (isSameStudentIdentity(prev.nama, nama)) {
          errors.push(`Duplikat NIS "${cleanNis}" di dalam file (sama dengan baris ${prev.rowNumber})`);
        } else {
          mapped.nis = '';
          cleanNis = '';
        }
      } else {
        seenNisInFile.set(cleanNis, { rowNumber, nama });
      }
    }

    if (cleanNisn) {
      const prev = seenNisnInFile.get(cleanNisn);
      if (prev) {
        if (isSameStudentIdentity(prev.nama, nama)) {
          errors.push(`Duplikat NISN "${cleanNisn}" di dalam file (sama dengan baris ${prev.rowNumber})`);
        } else {
          mapped.nisn = '';
          cleanNisn = '';
        }
      } else {
        seenNisnInFile.set(cleanNisn, { rowNumber, nama });
      }
    }

    // Validasi terhadap database sesuai mode import:
    // Pastikan pencocokan NIS/NISN pada mode Siswa Baru/Upsert tidak pernah menimpa siswa LAIN yang berbeda nama di kelas lain!
    let dbByNis = cleanNis ? existingByNis.get(cleanNis) : undefined;
    let dbByNisn = cleanNisn ? existingByNisn.get(cleanNisn) : undefined;

    if (importMode !== 'update_by_nis') {
      if (dbByNisn && !isSameStudentIdentity(dbByNisn.nama_lengkap, nama)) {
        mapped.nisn = '';
        cleanNisn = '';
        dbByNisn = undefined;
      }
      if (dbByNis && !isSameStudentIdentity(dbByNis.nama_lengkap, nama)) {
        mapped.nis = '';
        cleanNis = '';
        dbByNis = undefined;
      }
    }

    const dbByNameClass = existingByNameAndClass.get(
      `${normalizeStudentIdentityName(nama)}__${String(mapped.rombel || '').trim().toUpperCase()}`
    );

    const matchedExisting = dbByNis || dbByNisn || dbByNameClass;

    // PENTING: Jangan pernah menimpa status mutasi_keluar / mutasi_masuk / lulus atau tanggal_masuk siswa existing
    // apabila baris Excel tidak mengisi kolom Status atau Tanggal Masuk secara eksplisit!
    const validStatuses: StudentStatus[] = [
      'aktif',
      'mutasi_masuk',
      'mutasi_keluar',
      'lulus',
      'non_aktif'
    ];
    if (explicitStatusRaw && validStatuses.includes(explicitStatusRaw as StudentStatus)) {
      mapped.status = explicitStatusRaw as StudentStatus;
    } else if (matchedExisting?.status) {
      mapped.status = matchedExisting.status;
    } else {
      mapped.status = 'aktif';
    }

    if (explicitTanggalMasukRaw) {
      mapped.tanggal_masuk = explicitTanggalMasukRaw;
    } else if (matchedExisting?.tanggal_masuk) {
      mapped.tanggal_masuk = matchedExisting.tanggal_masuk;
    } else {
      mapped.tanggal_masuk = new Date().toISOString().slice(0, 10);
    }
    mapped.tahun_masuk = (mapped.tanggal_masuk || '').slice(0, 4) || new Date().toISOString().slice(0, 4);

    let actionType: 'insert' | 'update' | 'invalid' = 'insert';

    if (importMode === 'insert_only') {
      if (dbByNis) {
        errors.push(`NIS "${cleanNis}" sudah terdaftar di database (${dbByNis.nama_lengkap})`);
      }
      if (dbByNisn) {
        errors.push(`NISN "${cleanNisn}" sudah terdaftar di database (${dbByNisn.nama_lengkap})`);
      }
      actionType = 'insert';
    } else if (importMode === 'update_by_nis') {
      if (!dbByNis && !dbByNisn) {
        errors.push(`NIS "${cleanNis}" / NISN "${cleanNisn}" tidak ditemukan di database untuk diupdate`);
      }
      actionType = 'update';
    } else {
      // Mode upsert (Tambah & Update otomatis - hanya update jika benar-benar siswa yang sama)
      if (matchedExisting) {
        actionType = 'update';
      } else {
        actionType = 'insert';
      }
    }

    const isValid = errors.length === 0;
    return {
      rowNumber,
      sheetName: rawRow.__sheetName,
      data: mapped,
      isValid,
      actionType: isValid ? actionType : 'invalid',
      errors
    };
  });
}

/**
 * Validasi & Pemetaan Baris Excel untuk MUTASI MASUK dan MUTASI KELUAR
 * Mendukung format kolom pengguna:
 * - Mutasi Keluar: KELAS | NIS | NAMA LENGKAP SISWA | Tanggal Pindah | Alasan Pindah | Sekolah Tujuan
 * - Mutasi Masuk : KELAS | NIS | NAMA LENGKAP SISWA | Tanggal Pindah | Sekolah Asal
 */
export function validateAndMapMutationRows(params: {
  rawRows: Record<string, string>[];
  jenis: 'masuk' | 'keluar';
  defaultTahunAjaran: string;
  defaultKelas?: string;
  existingStudents: Siswa[];
  existingMutations: Mutasi[];
}): ParsedMutationImportRow[] {
  const {
    rawRows,
    jenis,
    defaultTahunAjaran,
    defaultKelas = '7A',
    existingStudents,
    existingMutations
  } = params;

  const byNisn = new Map<string, Siswa>();
  const byNis = new Map<string, Siswa>();
  const byName = new Map<string, Siswa>();
  const byNormName = new Map<string, Siswa>();
  existingStudents.forEach(s => {
    if (s.nisn && s.nisn.trim()) byNisn.set(s.nisn.trim(), s);
    if (s.nis && s.nis.trim()) byNis.set(s.nis.trim(), s);
    if (s.nama_lengkap && s.nama_lengkap.trim()) {
      byName.set(s.nama_lengkap.trim().toLowerCase(), s);
      const normN = normalizeStudentIdentityName(s.nama_lengkap);
      if (normN) byNormName.set(normN, s);
    }
  });

  const meaningfulRows = rawRows.filter(r =>
    Object.values(r).some(v => String(v || '').trim() !== '' && String(v || '').trim() !== '-')
  );

  let lastValidDateInSheet = '';

  return meaningfulRows.map((row, idx) => {
    const rowNumber = idx + 2;
    const errors: string[] = [];

    const getVal = (...candidates: string[]) => {
      // 1. Exact match dalam urutan prioritas kandidat
      for (const cand of candidates) {
        for (const key of Object.keys(row)) {
          const norm = normalizeHeaderKey(key);
          if (norm === cand) {
            const val = String(row[key] || '').trim();
            if (val && val !== '-') return val;
          }
        }
      }
      // 2. Partial match dalam urutan prioritas kandidat (hindari salah baca Tempat/Tanggal Lahir atau Ijazah)
      for (const cand of candidates) {
        if (cand.length < 5) continue;
        for (const key of Object.keys(row)) {
          const norm = normalizeHeaderKey(key);
          if (norm.includes('lahir') || norm.includes('ijazah')) continue;
          if (norm.includes(cand)) {
            const val = String(row[key] || '').trim();
            if (val && val !== '-') return val;
          }
        }
      }
      return '';
    };

    const rawKelas = getVal('kelas', 'kls', 'rombel', 'kelastujuan', 'kelasterakhir');
    const sheetFallback = row.__sheetName
      ? inferClassFromSheetName(row.__sheetName, defaultKelas)
      : defaultKelas;
    const kelas = normalizeKelasValue(rawKelas, sheetFallback).rombel;

    const rawNis = getVal('nis', 'nomorinduksiswa', 'noinduk');
    const nis = preserveIdentityFormat('nis', rawNis);

    const rawNisn = getVal('nisn', 'nomornisn');
    const nisn = preserveIdentityFormat('nisn', rawNisn);

    const nama_siswa = toUpperStudentName(
      getVal('namalengkapsiswa', 'namasiswa', 'namalengkap', 'nama')
    );
    const rawJk = getVal('jeniskelamin', 'jk', 'lp').toUpperCase();
    const jenis_kelamin: 'L' | 'P' =
      rawJk.startsWith('P') || rawJk.includes('PEREMPUAN') ? 'P' : 'L';

    const rawTahunAjaran = getVal('tahunajaran', 'tahunpelajaran', 'ta', 'tp');

    let rawTanggal = getVal(
      'tanggalpindah',
      'tglpindah',
      'tanggalmutasi',
      'tglmutasi',
      'tanggalkeluar',
      'tglkeluar',
      'tanggalmasuk',
      'tglmasuk',
      'tanggalsurat',
      'tglsurat',
      'tmt',
      'terhitungmulaitanggal',
      'waktupindah',
      'bulanpindah',
      'bulanmutasi',
      'bulan',
      'waktu',
      'tanggal',
      'tgl'
    );

    let parsedTanggal = normalizeExcelDate(rawTanggal, rawTahunAjaran || defaultTahunAjaran);

    // Fallback heuristik: jika header kolom tanggal tidak standar / ter-merge, cari sel pada baris ini yang bernilai tanggal mutasi (tahun >= 2018)
    if (!parsedTanggal) {
      for (const [k, v] of Object.entries(row)) {
        if (k === '__sheetName') continue;
        const normK = normalizeHeaderKey(k);
        if (
          normK === 'nis' ||
          normK === 'nisn' ||
          normK === 'kelas' ||
          normK === 'rombel' ||
          normK.includes('nama') ||
          normK.includes('npsn') ||
          normK.includes('lahir') ||
          normK.includes('ijazah')
        ) {
          continue;
        }
        const candidateDate = normalizeExcelDate(v, rawTahunAjaran || defaultTahunAjaran);
        if (candidateDate) {
          const yr = parseInt(candidateDate.slice(0, 4), 10);
          if (yr >= 2018 && yr <= 2035) {
            parsedTanggal = candidateDate;
            rawTanggal = String(v || '');
            break;
          }
        }
      }
    }

    const isConsistentNis = (cand?: Siswa) => {
      if (!cand) return false;
      if (nis && cand.nis && cand.nis.trim() && cand.nis.trim() !== nis) {
        return false;
      }
      return true;
    };

    const matchedStudent =
      (nis ? byNis.get(nis) : undefined) ||
      (nisn && isConsistentNis(byNisn.get(nisn)) ? byNisn.get(nisn) : undefined) ||
      (nama_siswa && isConsistentNis(byName.get(nama_siswa.toLowerCase()))
        ? byName.get(nama_siswa.toLowerCase())
        : undefined) ||
      (nama_siswa && isConsistentNis(byNormName.get(normalizeStudentIdentityName(nama_siswa)))
        ? byNormName.get(normalizeStudentIdentityName(nama_siswa))
        : undefined) ||
      (nama_siswa
        ? existingStudents.find(
            s => isConsistentNis(s) && isSameStudentIdentity(s.nama_lengkap, nama_siswa)
          )
        : undefined);

    const existingMut = existingMutations.find(
      m =>
        m.status !== 'dibatalkan' &&
        m.jenis === jenis &&
        ((nis && m.nis === nis) ||
          (nisn && m.nisn === nisn) ||
          (nama_siswa && isSameStudentIdentity(m.nama_siswa, nama_siswa)))
    );

    if (
      !parsedTanggal &&
      existingMut?.tanggal_mutasi &&
      !/^2026-11-(0[3-9]|1\d)$/.test(existingMut.tanggal_mutasi)
    ) {
      parsedTanggal = normalizeExcelDate(existingMut.tanggal_mutasi, rawTahunAjaran || defaultTahunAjaran);
    }

    // Jika sel tanggal di baris Excel ter-merge vertikal dengan baris di atasnya (kosong), warisi tanggal valid terakhir di sheet yang sama
    if (!parsedTanggal && lastValidDateInSheet) {
      parsedTanggal = lastValidDateInSheet;
    }

    if (parsedTanggal) {
      lastValidDateInSheet = parsedTanggal;
    }

    const tanggal_pindah = parsedTanggal || new Date().toISOString().slice(0, 10);

    const alasan_pindah =
      getVal('alasanpindah', 'alasanmutasi', 'alasan', 'keteranganpindah') ||
      existingMut?.alasan ||
      (jenis === 'masuk' ? 'Mutasi Masuk / Pindahan Sekolah' : 'Pindah Sekolah');

    const sekolah_asal =
      getVal('sekolahasal', 'asalsekolah', 'namaasalsekolah', 'pindahandari') ||
      existingMut?.sekolah_asal ||
      '';
    const sekolah_tujuan =
      getVal('sekolahtujuan', 'tujuansekolah', 'namasekolahtujuan', 'pindahke') ||
      existingMut?.sekolah_tujuan ||
      '';

    const npsn_sekolah =
      getVal('npsn', 'npsnsekolah', 'npsnasalsekolah', 'npsntujuan') ||
      existingMut?.npsn_sekolah ||
      '';
    const kabupaten_sekolah =
      getVal('kabupaten', 'kota', 'kabupatenkota', 'kabkota') ||
      existingMut?.kabupaten_sekolah ||
      '';
    const provinsi_sekolah =
      getVal('provinsi', 'propinsi') || existingMut?.provinsi_sekolah || '';
    const no_surat =
      getVal('nosurat', 'nomorsurat', 'nosuratpindah', 'nosuratmutasi') ||
      existingMut?.no_surat ||
      '';
    const keterangan = getVal('keterangan', 'catatan') || existingMut?.keterangan || '';

    // Sesuaikan Tahun Ajaran dengan bulan & tahun tanggal_pindah (Jul-Des = YYYY/YYYY+1, Jan-Jun = YYYY-1/YYYY)
    let tahun_ajaran = rawTahunAjaran || defaultTahunAjaran;
    if (!rawTahunAjaran && parsedTanggal) {
      const yr = parseInt(parsedTanggal.slice(0, 4), 10);
      const mo = parseInt(parsedTanggal.slice(5, 7), 10);
      if (yr >= 2018 && yr <= 2035 && mo >= 1 && mo <= 12) {
        tahun_ajaran = mo >= 7 ? `${yr}/${yr + 1}` : `${yr - 1}/${yr}`;
      }
    }

    if (!nama_siswa) {
      errors.push('NAMA LENGKAP SISWA wajib diisi.');
    }

    // Izinkan pembaruan (upsert) otomatis terhadap data mutasi existing agar upload ulang dapat memperbaiki Tanggal Pindah
    const validationStatus: 'valid' | 'duplicate' | 'failed' =
      errors.length === 0 ? 'valid' : 'failed';

    const rawKategori = getVal('jenismutasi', 'kategorimutasi').toLowerCase();
    const lowerAlasan = alasan_pindah.toLowerCase();
    let kategori_mutasi: MutationCategory =
      jenis === 'masuk' ? 'Masuk Pindahan' : 'Pindah sekolah';

    if (jenis === 'keluar') {
      if (rawKategori.includes('undur') || lowerAlasan.includes('undur')) {
        kategori_mutasi = 'Mengundurkan diri';
      } else if (rawKategori.includes('lulus') || lowerAlasan.includes('lulus')) {
        kategori_mutasi = 'Lulus';
      } else if (rawKategori.includes('meninggal') || lowerAlasan.includes('meninggal') || lowerAlasan.includes('wafat')) {
        kategori_mutasi = 'Meninggal dunia';
      } else if (rawKategori.includes('lain')) {
        kategori_mutasi = 'Keluar karena alasan lain';
      } else {
        kategori_mutasi = 'Pindah sekolah';
      }
    }

    return {
      rowNumber,
      sheetName: row.__sheetName,
      jenis,
      matchedStudent,
      kelas: matchedStudent?.rombel || kelas,
      nis: nis || matchedStudent?.nis || '',
      nisn: nisn || matchedStudent?.nisn || '',
      nama_siswa: toUpperStudentName(nama_siswa || matchedStudent?.nama_lengkap || ''),
      jenis_kelamin: matchedStudent?.jenis_kelamin || jenis_kelamin,
      tanggal_pindah,
      kategori_mutasi,
      alasan_pindah,
      sekolah_asal: sekolah_asal || (jenis === 'masuk' ? '-' : ''),
      sekolah_tujuan: sekolah_tujuan || (jenis === 'keluar' ? '-' : ''),
      npsn_sekolah,
      kabupaten_sekolah: normalizeDaerahKotaKab(kabupaten_sekolah) || kabupaten_sekolah,
      provinsi_sekolah,
      no_surat,
      tahun_ajaran,
      keterangan,
      validationStatus,
      errors
    };
  });
}

/**
 * Unduh Template Excel Resmi Mutasi Masuk & Mutasi Keluar sesuai kolom Excel pengguna
 */
export function downloadMutationTemplateExcel(
  jenis: 'masuk' | 'keluar',
  format: 'xlsx' | 'csv' = 'xlsx'
): void {
  if (jenis === 'masuk') {
    const sampleRows = [
      {
        'KELAS': '7A',
        'NIS': '252607050',
        'NISN': '0123456799',
        'NAMA LENGKAP SISWA': 'CONTOH SISWA MUTASI MASUK',
        'Jenis Kelamin': 'L',
        'Tanggal Pindah': '2025-08-01',
        'Sekolah Asal': 'SMP Negeri 1 Contoh',
        'Alasan Pindah': 'Mengikuti perpindahan tugas orang tua'
      }
    ];
    const ws = XLSX.utils.json_to_sheet(sampleRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template_Mutasi_Masuk');
    const ext = format === 'csv' ? 'csv' : 'xlsx';
    XLSX.writeFile(wb, `Template_Import_Mutasi_Masuk_SIPDS.${ext}`, {
      bookType: format === 'csv' ? 'csv' : 'xlsx'
    });
  } else {
    const sampleRows = [
      {
        'KELAS': '7A',
        'NIS': '252607001',
        'NISN': '0123456789',
        'NAMA LENGKAP SISWA': 'CONTOH SISWA MUTASI KELUAR',
        'Tanggal Pindah': '2025-09-15',
        'Alasan Pindah': 'Pindah domisili orang tua',
        'Sekolah Tujuan': 'SMP Negeri 2 Tujuan'
      }
    ];
    const ws = XLSX.utils.json_to_sheet(sampleRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template_Mutasi_Keluar');
    const ext = format === 'csv' ? 'csv' : 'xlsx';
    XLSX.writeFile(wb, `Template_Import_Mutasi_Keluar_SIPDS.${ext}`, {
      bookType: format === 'csv' ? 'csv' : 'xlsx'
    });
  }
}

/**
 * Parser teks CSV / TSV langsung (fallback untuk fitur tempel teks)
 */
export function parseStudentCsv(
  csvText: string,
  existingStudents: Siswa[] = [],
  importMode: ImportMode = 'insert_only'
): ExcelSheetParseResult & { parsedRows: ParsedStudentRow[] } {
  const wb = XLSX.read(csvText, { type: 'string', raw: false });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    raw: false,
    defval: ''
  });

  if (!matrix || matrix.length < 2) {
    return { headers: [], rawRows: [], autoMapping: {}, parsedRows: [] };
  }

  const headers = (matrix[0] || []).map((h, i) => String(h || '').trim() || `Kolom_${i + 1}`);
  const rawRows: Record<string, string>[] = [];

  for (let i = 1; i < matrix.length; i++) {
    const rowArr = matrix[i];
    if (!rowArr || rowArr.every(c => !String(c || '').trim())) continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = String(rowArr[idx] ?? '').trim();
    });
    rawRows.push(obj);
  }

  const autoMapping = autoMapExcelHeaders(headers);
  const parsedRows = validateAndMapExcelRows({
    rawRows,
    columnMapping: autoMapping,
    existingStudents,
    importMode
  });

  return { headers, rawRows, autoMapping, parsedRows };
}

/**
 * Unduh Template Resmi 59 Kolom dalam format .xlsx atau .csv
 */
export function downloadTemplateExcel(format: 'xlsx' | 'csv' = 'xlsx'): void {
  const sampleRow: Record<string, string> = {
    'KELAS': '7A',
    'NIS': '252607001',
    'ID YYS': 'YYS-2025-001',
    'KAMAR': 'Kamar A-01',
    'NAMA LENGKAP SISWA': 'NAMA LENGKAP CONTOH SISWA',
    'NO KK': '3171010101010001',
    'NIK SISWA': '3171011505120001',
    'NISN': '0123456789',
    'No Ijazah SD/MI': 'DN-01/D-SD/K13/24/00001',
    'Tanggal Penerbitan Ijazah': '2024-06-15',
    'Jenis Kelamin': 'L',
    'TEMPAT LAHIR': 'Jakarta',
    'TANGGAL LAHIR': '2012-05-15',
    'AGAMA': 'Islam',
    'BERAT BADAN': '44',
    'TINGGI BADAN': '150',
    'RIWAYAT PENYAKIT': 'Tidak Ada',
    'STATUS ANAK': 'Anak Kandung',
    'KEWARGANEGARAAN': 'WNI',
    'Anak Ke-': '1',
    'Jumlah Saudara Kandung': '1',
    'Jumlah Saudara TIRI': '0',
    'Jalan/Dusun': 'Jl. Kebangsaan Timur No. 10',
    'RT/RW': '002/004',
    'Desa/Kelurahan': 'Gambir',
    'Kecamatan': 'Gambir',
    'Kode Pos': '10110',
    'Kota/Kabupaten': 'Jakarta Pusat',
    'Provinsi': 'DKI Jakarta',
    'Alamat Lengkap': 'Jl. Kebangsaan Timur No. 10 RT 002/004, Gambir, Jakarta Pusat',
    'Jenjang': 'SD',
    'Nama Asal Sekolah': 'SDN Gambir 01 Pagi',
    'NPSN Asal Sekolah': '20100123',
    'Kecamatan Asal Sekolah': 'Gambir',
    'Kabupaten Asal Sekolah': 'Jakarta Pusat',
    'Provinsi Asal Sekolah': 'DKI Jakarta',
    'NAMA AYAH': 'Nama Ayah Contoh',
    'NIK Ayah': '3171011010800001',
    'Tempat Lahir Ayah': 'Jakarta',
    'Tgl Lahir Ayah': '1980-10-10',
    'Pendidikan ayah': 'S1',
    'Pekerjaan Ayah': 'Karyawan Swasta',
    'No WA Ayah': '081234567890',
    'Penghasilan Ayah': '6000000',
    'NAMA IBU KANDUNG': 'Nama Ibu Contoh',
    'NIK IBU': '3171012002830002',
    'Tempat Lahir IBu': 'Bandung',
    'Tgl Lahir Ibu': '1983-02-20',
    'Pendidikan Ibu': 'S1',
    'Pekerjaan Ibu': 'Ibu Rumah Tangga',
    'No Wa Ibu': '081234567891',
    'Penghasilan Ibu': '0',
    'Nama Wali': 'Nama Ayah Contoh',
    'NIK Wali': '3171011010800001',
    'Pekerjaan Wali': 'Karyawan Swasta',
    'Penghasilan Wali': '6000000',
    'No HP Wali': '081234567890',
    'Status Aktif': 'aktif',
    'Tanggal Masuk': '2025-07-14'
  };

  const ws = XLSX.utils.json_to_sheet([sampleRow], { header: STUDENT_CSV_HEADERS });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template_59_Kolom_Siswa');

  if (format === 'csv') {
    XLSX.writeFile(wb, 'Template_Import_59_Kolom_SIPDS_SMP_Bhinneka.csv', { bookType: 'csv' });
  } else {
    XLSX.writeFile(wb, 'Template_Import_59_Kolom_SIPDS_SMP_Bhinneka.xlsx', { bookType: 'xlsx' });
  }
}

export function downloadTemplateCsv(): void {
  downloadTemplateExcel('csv');
}

/**
 * Unduh laporan baris yang gagal saat proses Import Excel
 */
export function downloadFailedRowsReport(
  failedRows: { row: number; nis?: string; nisn?: string; nama?: string; errors: string[] }[]
): void {
  const rows = failedRows.map(item => ({
    'Baris Excel': item.row,
    'NIS': item.nis || '-',
    'NISN': item.nisn || '-',
    'Nama Lengkap Siswa': item.nama || '-',
    'Rincian Kesalahan / Alasan Gagal': item.errors.join('; ')
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Laporan_Baris_Gagal');
  XLSX.writeFile(
    wb,
    `Laporan_Gagal_Import_SIPDS_${new Date().toISOString().slice(0, 10)}.xlsx`,
    { bookType: 'xlsx' }
  );
}

/**
 * Export Data Siswa ke Excel (.xlsx) atau CSV (.csv) dengan opsi mengecualikan informasi sensitif keluarga
 */
export function exportStudentsToExcel(
  students: Siswa[],
  options?: {
    format?: 'xlsx' | 'csv';
    excludeSensitiveFamilyInfo?: boolean;
    fileNamePrefix?: string;
    selectedColumns?: string[];
  }
): void {
  const format = options?.format || 'xlsx';
  const excludeSensitive = Boolean(options?.excludeSensitiveFamilyInfo);
  const prefix = options?.fileNamePrefix || 'Data_Induk_Siswa_SIPDS';
  const customColumnKeys = options?.selectedColumns?.filter(Boolean) || [];

  const fieldMap = new Map(ALL_59_STUDENT_FIELDS.map(f => [String(f.key), f]));

  let headers: string[] = [];
  let exportRows: Record<string, string>[] = [];

  if (customColumnKeys.length > 0) {
    const resolvedCols: { key: string; header: string }[] = [];
    for (const colKey of customColumnKeys) {
      if (colKey === 'NO') {
        resolvedCols.push({ key: 'NO', header: 'NO' });
      } else if (colKey === 'ANGKATAN') {
        resolvedCols.push({ key: 'ANGKATAN', header: 'ANGKATAN' });
      } else if (colKey === 'TAHUN_LULUS') {
        resolvedCols.push({ key: 'TAHUN_LULUS', header: 'TAHUN LULUS' });
      } else {
        const field = fieldMap.get(colKey);
        if (field && !(excludeSensitive && field.sensitive)) {
          resolvedCols.push({ key: String(field.key), header: field.excelHeader });
        }
      }
    }

    headers = resolvedCols.map(c => c.header);
    exportRows = students.map((s, idx) => {
      const obj: Record<string, string> = {};
      for (const col of resolvedCols) {
        if (col.key === 'NO') {
          obj[col.header] = String(idx + 1);
        } else if (col.key === 'ANGKATAN') {
          obj[col.header] = String(s.angkatan || s.tahun_masuk || '');
        } else if (col.key === 'TAHUN_LULUS') {
          obj[col.header] = String(s.tahun_lulus || '-');
        } else {
          const val = s[col.key as keyof Siswa];
          obj[col.header] = val !== undefined && val !== null ? String(val) : '';
        }
      }
      return obj;
    });
  } else {
    const activeFields = ALL_59_STUDENT_FIELDS.filter(
      field => !(excludeSensitive && field.sensitive)
    );

    exportRows = students.map(s => {
      const obj: Record<string, string> = {
        'ANGKATAN': String(s.angkatan || s.tahun_masuk || ''),
        'TAHUN LULUS': String(s.tahun_lulus || '-')
      };
      for (const field of activeFields) {
        const val = s[field.key];
        obj[field.excelHeader] = val !== undefined && val !== null ? String(val) : '';
      }
      return obj;
    });

    headers = ['ANGKATAN', 'TAHUN LULUS', ...activeFields.map(f => f.excelHeader)];
  }

  const ws = XLSX.utils.json_to_sheet(exportRows, { header: headers });

  // Pastikan seluruh sel nomor identitas bertipe string ('s') agar nol di depan tidak hilang di Excel
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let R = range.s.r + 1; R <= range.e.r; ++R) {
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[addr];
      if (cell && cell.v !== undefined) {
        cell.t = 's';
        cell.z = '@';
      }
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data_Siswa');

  const dateStamp = new Date().toISOString().slice(0, 10);
  const ext = format === 'csv' ? 'csv' : 'xlsx';
  XLSX.writeFile(wb, `${prefix}_${dateStamp}.${ext}`, {
    bookType: format === 'csv' ? 'csv' : 'xlsx'
  });
}

export function exportStudentsToCsv(students: Siswa[]): void {
  exportStudentsToExcel(students, { format: 'csv' });
}

/**
 * Export Data Mutasi Siswa (Masuk / Keluar / Semua) ke Excel (.xlsx) atau CSV (.csv)
 */
export function exportMutationsToExcel(
  mutations: Mutasi[],
  options?: {
    format?: 'xlsx' | 'csv';
    jenis?: 'all' | 'masuk' | 'keluar';
  }
): void {
  const format = options?.format || 'xlsx';
  const jenis = options?.jenis || 'all';

  const filtered =
    jenis === 'all' ? mutations : mutations.filter(m => m.jenis === jenis);

  const rows = filtered.map(m => ({
    'ARAH MUTASI': m.jenis === 'masuk' ? 'MUTASI MASUK' : 'MUTASI KELUAR',
    'JENIS / KATEGORI MUTASI':
      m.kategori_mutasi || (m.jenis === 'masuk' ? 'Masuk Pindahan' : 'Pindah sekolah'),
    'TAHUN AJARAN': m.tahun_ajaran || '2025/2026',
    'KELAS': m.kelas,
    'NIS': m.nis || '-',
    'NISN': m.nisn || '-',
    'NAMA LENGKAP SISWA': m.nama_siswa,
    'Tanggal Pindah': m.tanggal_mutasi,
    'Alasan Pindah': m.alasan || '-',
    'Sekolah Asal': m.sekolah_asal || '-',
    'Sekolah Tujuan': m.sekolah_tujuan || '-',
    'NPSN Sekolah': m.npsn_sekolah || '-',
    'Kecamatan': m.kecamatan_sekolah || '-',
    'Kabupaten / Kota': m.kabupaten_sekolah || '-',
    'Provinsi': m.provinsi_sekolah || '-',
    'No Surat Mutasi': m.no_surat || '-',
    'Keterangan': m.keterangan || '-',
    'Petugas Pencatat': m.petugas_nama || '-',
    'Status Transaksi': m.status,
    'Info Pembatalan':
      m.status === 'dibatalkan'
        ? `Dibatalkan oleh ${m.cancelled_by_name || 'Admin'}: ${m.alasan_pembatalan || '-'}`
        : '-'
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let R = range.s.r + 1; R <= range.e.r; ++R) {
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[addr];
      if (cell && cell.v !== undefined) {
        cell.t = 's';
        cell.z = '@';
      }
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data_Mutasi_Siswa');

  const dateStamp = new Date().toISOString().slice(0, 10);
  const ext = format === 'csv' ? 'csv' : 'xlsx';
  XLSX.writeFile(wb, `Data_Mutasi_${jenis.toUpperCase()}_SIPDS_${dateStamp}.${ext}`, {
    bookType: format === 'csv' ? 'csv' : 'xlsx'
  });
}

/**
 * Unduh Template Resmi untuk Import Riwayat / Penempatan Kelas Lintas Tahun Pelajaran
 */
export function downloadClassHistoryTemplateExcel(format: 'xlsx' | 'csv' = 'xlsx'): void {
  const sampleRows = [
    {
      'NISN': '0123456789',
      'NIS': '242507001',
      'NAMA LENGKAP SISWA': 'CONTOH NAMA SISWA',
      'TAHUN PELAJARAN': '2024/2025',
      'SEMESTER': 'Ganjil',
      'KELAS': '7A',
      'KAMAR': 'Kamar A-01',
      'STATUS RIWAYAT': 'aktif',
      'TANGGAL MULAI': '2024-07-15',
      'CATATAN': 'Penempatan kelas awal Tahun Pelajaran 2024/2025'
    }
  ];

  const ws = XLSX.utils.json_to_sheet(sampleRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template_Riwayat_Kelas');
  const ext = format === 'csv' ? 'csv' : 'xlsx';
  XLSX.writeFile(wb, `Template_Import_Riwayat_Kelas_SIPDS.${ext}`, {
    bookType: format === 'csv' ? 'csv' : 'xlsx'
  });
}

export interface ParsedClassHistoryImportRow {
  rowNumber: number;
  student?: Siswa;
  nisn: string;
  nis: string;
  nama_siswa: string;
  tahun_ajaran: string;
  semester: string;
  kelas: string;
  kamar: string;
  status_riwayat: 'aktif' | 'naik_kelas' | 'tinggal_kelas' | 'pindah_rombel' | 'lulus' | 'mutasi';
  tanggal_mulai: string;
  catatan: string;
  validationStatus: 'valid' | 'duplicate' | 'failed';
  errors: string[];
}

export function validateAndMapClassHistoryRows(params: {
  rawRows: Record<string, string>[];
  defaultTahunAjaran: string;
  existingStudents: Siswa[];
  existingHistory: { student_id: string; tahun_ajaran?: string; kelas: string }[];
}): ParsedClassHistoryImportRow[] {
  const { rawRows, defaultTahunAjaran, existingStudents, existingHistory } = params;

  const byNisn = new Map<string, Siswa>();
  const byNis = new Map<string, Siswa>();
  existingStudents.forEach(s => {
    if (s.nisn) byNisn.set(s.nisn.trim(), s);
    if (s.nis) byNis.set(s.nis.trim(), s);
  });

  const seenKeyInFile = new Set<string>();

  return rawRows.map((row, idx) => {
    const rowNumber = idx + 2;
    const errors: string[] = [];

    const getVal = (...candidates: string[]) => {
      for (const key of Object.keys(row)) {
        const norm = key.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (candidates.includes(norm)) return String(row[key] || '').trim();
      }
      return '';
    };

    const rawNisn = getVal('nisn');
    const nisn = rawNisn ? preserveIdentityFormat('nisn', rawNisn) : '';
    const nis = getVal('nis', 'nomorinduksiswa');
    const nama = getVal('namalengkapsiswa', 'namasiswa', 'namalengkap');
    const tahunAjaran = getVal('tahunpelajaran', 'tahunajaran', 'ta') || defaultTahunAjaran;
    const semester = getVal('semester') || 'Ganjil';
    const kelas = (getVal('kelas', 'rombel') || '').toUpperCase();
    const kamar = getVal('kamar', 'asrama');
    const rawStatus = getVal('statusriwayat', 'status').toLowerCase();
    const validStatusList = ['aktif', 'naik_kelas', 'tinggal_kelas', 'pindah_rombel', 'lulus', 'mutasi'];
    const status_riwayat = (validStatusList.includes(rawStatus) ? rawStatus : 'aktif') as ParsedClassHistoryImportRow['status_riwayat'];
    const tanggal_mulai = normalizeExcelDate(getVal('tanggalmulai', 'tglmulai')) || new Date().toISOString().slice(0, 10);
    const catatan = getVal('catatan', 'keterangan');

    const matchedStudent = (nisn ? byNisn.get(nisn) : undefined) || (nis ? byNis.get(nis) : undefined);

    if (!matchedStudent) {
      errors.push(
        `Siswa dengan NISN "${nisn || '-'}" / NIS "${nis || '-'}" tidak ditemukan pada database utama students.`
      );
    }
    if (!kelas) {
      errors.push('Kolom KELAS wajib diisi (contoh: 7A, 8B, 9C).');
    }
    if (!tahunAjaran) {
      errors.push('Tahun Pelajaran wajib diisi (contoh: 2025/2026).');
    }

    let isDuplicate = false;
    if (matchedStudent && tahunAjaran && kelas) {
      const fileKey = `${matchedStudent.id}__${tahunAjaran}__${kelas}`;
      if (seenKeyInFile.has(fileKey)) {
        isDuplicate = true;
        errors.push(`Duplikat baris di dalam file untuk Tahun Pelajaran ${tahunAjaran} Kelas ${kelas}.`);
      } else {
        seenKeyInFile.add(fileKey);
      }

      const dbDup = existingHistory.some(
        h =>
          h.student_id === matchedStudent.id &&
          (h.tahun_ajaran || '') === tahunAjaran &&
          h.kelas.toUpperCase() === kelas
      );
      if (dbDup) {
        isDuplicate = true;
        errors.push(
          `Riwayat kelas ${kelas} pada Tahun Pelajaran ${tahunAjaran} untuk siswa ini sudah tersedia di database.`
        );
      }
    }

    const validationStatus: 'valid' | 'duplicate' | 'failed' =
      errors.length === 0 ? 'valid' : isDuplicate ? 'duplicate' : 'failed';

    return {
      rowNumber,
      student: matchedStudent,
      nisn: matchedStudent?.nisn || nisn,
      nis: matchedStudent?.nis || nis,
      nama_siswa: matchedStudent?.nama_lengkap || nama,
      tahun_ajaran: tahunAjaran,
      semester,
      kelas,
      kamar,
      status_riwayat,
      tanggal_mulai,
      catatan,
      validationStatus,
      errors
    };
  });
}

/**
 * Export Riwayat Kelas Siswa Lintas Tahun Pelajaran ke Excel (.xlsx)
 */
export function exportClassHistoryToExcel(
  rows: {
    tahun_ajaran: string;
    semester: string;
    angkatan: string;
    nis: string;
    nisn: string;
    nama_siswa: string;
    kelas: string;
    tingkat: string;
    kamar: string;
    status_riwayat: string;
    tanggal_mulai: string;
    catatan: string;
  }[],
  fileNamePrefix = 'Riwayat_Kelas_Lintas_Tahun_SIPDS'
): string {
  const formatted = rows.map(r => ({
    'TAHUN PELAJARAN': r.tahun_ajaran || '-',
    'SEMESTER': r.semester || 'Ganjil',
    'ANGKATAN SISWA': r.angkatan || '-',
    'NIS': r.nis || '-',
    'NISN': r.nisn || '-',
    'NAMA LENGKAP SISWA': r.nama_siswa,
    'KELAS': r.kelas,
    'TINGKAT': r.tingkat,
    'KAMAR': r.kamar || '-',
    'STATUS RIWAYAT': r.status_riwayat,
    'TANGGAL MULAI': r.tanggal_mulai,
    'CATATAN': r.catatan || '-'
  }));

  const ws = XLSX.utils.json_to_sheet(formatted);
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let R = range.s.r + 1; R <= range.e.r; ++R) {
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[addr];
      if (cell && cell.v !== undefined) {
        cell.t = 's';
        cell.z = '@';
      }
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Riwayat_Kelas');
  const dateStamp = new Date().toISOString().slice(0, 10);
  const fullFileName = `${fileNamePrefix}_${dateStamp}.xlsx`;
  XLSX.writeFile(wb, fullFileName, { bookType: 'xlsx' });
  return fullFileName;
}

/**
 * Export Pemeriksaan Pra-Konfirmasi Proses Akhir Tahun Pelajaran (Kenaikan Kelas / Kelulusan)
 */
export function exportYearEndReviewToExcel(
  items: {
    nis: string;
    nisn: string;
    nama_siswa: string;
    angkatan: string;
    kelas_asal: string;
    keputusan: string;
    kelas_tujuan_atau_status: string;
    tahun_ajaran_asal: string;
    tahun_ajaran_tujuan: string;
    catatan: string;
  }[],
  modeLabel: string
): void {
  const rows = items.map((it, idx) => ({
    'NO': String(idx + 1),
    'NIS': it.nis || '-',
    'NISN': it.nisn || '-',
    'NAMA LENGKAP SISWA': it.nama_siswa,
    'ANGKATAN': it.angkatan,
    'TAHUN PELAJARAN ASAL': it.tahun_ajaran_asal,
    'KELAS ASAL': it.kelas_asal,
    'KEPUTUSAN PROSES': it.keputusan,
    'TAHUN PELAJARAN TUJUAN / LULUS': it.tahun_ajaran_tujuan,
    'KELAS TUJUAN / STATUS AKHIR': it.kelas_tujuan_atau_status,
    'CATATAN': it.catatan || '-'
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let R = range.s.r + 1; R <= range.e.r; ++R) {
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[addr];
      if (cell && cell.v !== undefined) {
        cell.t = 's';
        cell.z = '@';
      }
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Pemeriksaan_Pra_Konfirmasi');
  const dateStamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Pemeriksaan_${modeLabel}_SIPDS_${dateStamp}.xlsx`, { bookType: 'xlsx' });
}

