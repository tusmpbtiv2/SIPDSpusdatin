/**
 * Centralized formatting utilities for SIPDS
 * - Date display strictly formatted as dd-mm-yyyy (e.g. 25-08-2012)
 * - Income range formatting and conversion
 */

export const INCOME_RANGE_OPTIONS = [
  'Tidak Berpenghasilan / Rp 0',
  '< Rp 1.000.000',
  'Rp 1.000.000 - Rp 2.000.000',
  'Rp 2.000.000 - Rp 3.000.000',
  'Rp 3.000.000 - Rp 4.000.000',
  'Rp 4.000.000 - Rp 5.000.000',
  '> Rp 5.000.000'
] as const;

export type IncomeRangeOption = typeof INCOME_RANGE_OPTIONS[number];

export const INDONESIAN_MONTH_NAMES = [
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
] as const;

const INDONESIAN_MONTH_MAP: Record<string, string> = {
  januari: '01',
  jan: '01',
  februari: '02',
  feb: '02',
  pebruari: '02',
  maret: '03',
  mar: '03',
  april: '04',
  apr: '04',
  mei: '05',
  may: '05',
  juni: '06',
  jun: '06',
  juli: '07',
  jul: '07',
  agustus: '08',
  agu: '08',
  ags: '08',
  aug: '08',
  september: '09',
  sep: '09',
  sept: '09',
  oktober: '10',
  okt: '10',
  oct: '10',
  november: '11',
  nov: '11',
  nopember: '11',
  desember: '12',
  des: '12',
  dec: '12'
};

export function isDateFieldKey(fieldKey: string): boolean {
  return (
    fieldKey === 'tanggal_lahir' ||
    fieldKey === 'tgl_lahir_ayah' ||
    fieldKey === 'tgl_lahir_ibu' ||
    fieldKey === 'tgl_ijazah_sd' ||
    fieldKey === 'tanggal_masuk'
  );
}

/**
 * Format any date string or ISO timestamp into strictly Indonesian dd-mm-yyyy.
 * Handles:
 * - '2012-05-18' -> '18-05-2012'
 * - '2012-05-18T14:30:00.000Z' -> '18-05-2012'
 * - '18/05/2012' -> '18-05-2012'
 * - '18-05-2012' -> '18-05-2012'
 * - '09 Juli 2012' -> '09-07-2012'
 * Returns '-' for empty/null/undefined values.
 */
export function formatDateDMY(val?: unknown): string {
  if (val === undefined || val === null) return '-';
  const str = String(val).trim();
  if (!str || str === '-') return '-';
  const trimmed = str;

  // Already in DD-MM-YYYY format
  if (/^\d{2}-\d{2}-\d{4}$/.test(trimmed)) {
    return trimmed;
  }

  // ISO standard date YYYY-MM-DD
  const ymdMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymdMatch) {
    const [, year, month, day] = ymdMatch;
    return `${day}-${month}-${year}`;
  }

  // DD/MM/YYYY or DD-MM-YYYY with 1-2 digits
  const dmyMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${day}-${month}-${year}`;
  }

  // Indonesian long date format e.g. '09 Juli 2012' or '9 Juli 2012'
  const indoMatch = trimmed.match(/^(\d{1,2})\s+([a-zA-Z]+)\s+(\d{4})$/);
  if (indoMatch) {
    const day = indoMatch[1].padStart(2, '0');
    const monthCode = INDONESIAN_MONTH_MAP[indoMatch[2].toLowerCase()];
    const year = indoMatch[3];
    if (monthCode) {
      return `${day}-${monthCode}-${year}`;
    }
  }

  // Parse as JS Date
  const d = new Date(trimmed);
  if (!Number.isNaN(d.getTime())) {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  }

  return trimmed;
}

/**
 * Format any date string into Indonesian long display format: '09 Juli 2012'
 * Used across Parent Portal display views.
 */
export function formatDateLongID(val?: unknown): string {
  const dmy = formatDateDMY(val);
  if (!dmy || dmy === '-') return '-';

  const match = dmy.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return dmy;

  const [, dd, mm, yyyy] = match;
  const monthIdx = parseInt(mm, 10) - 1;
  const monthName = INDONESIAN_MONTH_NAMES[monthIdx];
  if (!monthName) return dmy;

  return `${dd} ${monthName} ${yyyy}`;
}

/**
 * Format datetime string into 'dd-mm-yyyy HH:mm'
 */
export function formatDateTimeDMY(val?: string | null): string {
  if (!val || val === '-' || val.trim() === '') return '-';
  const trimmed = val.trim();

  const d = new Date(trimmed);
  if (!Number.isNaN(d.getTime())) {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}-${month}-${year} ${hours}:${minutes}`;
  }

  return formatDateDMY(trimmed);
}

/**
 * Ensures value is in 'YYYY-MM-DD' for native HTML `<input type="date">`
 */
export function toHtmlDateValue(val?: string | null): string {
  if (!val || val === '-' || val.trim() === '') return '';
  const trimmed = val.trim();

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const dmy = formatDateDMY(trimmed);
  const dmyMatch = dmy.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dmyMatch) {
    const [, day, month, year] = dmyMatch;
    return `${year}-${month}-${day}`;
  }

  const d = new Date(trimmed);
  if (!Number.isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }

  return '';
}

/**
 * Parse a single Indonesian/Excel Rupiah token into an exact number (in Rupiah).
 * Properly handles thousand separators ("2.500.000", "2,500,000", "500.000", "Rp 1.500.000,00", "2,5 Juta").
 */
export function parseRupiahToken(raw: unknown): number {
  if (raw === undefined || raw === null) return 0;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    // Pulihkan angka yang sebelumnya terpotong oleh parseFloat("2.500.000") -> 2.5 atau parseFloat("500.000") -> 500
    if (raw > 0 && raw <= 50) return Math.round(raw * 1_000_000);
    if (raw >= 100 && raw < 1000) return Math.round(raw * 1_000);
    return raw;
  }

  let s = String(raw).trim().toLowerCase();
  if (!s || s === '-' || s === '0' || s.includes('tidak berpenghasilan') || s === 'tidak ada') {
    return 0;
  }

  const hasJuta = /\b(juta|jt)\b/.test(s);
  const hasRibu = /\b(ribu|rb)\b/.test(s);

  // Hapus simbol mata uang dan akhiran sen/desimal Rupiah (",00", ".00", ",-")
  s = s
    .replace(/rp\.?\s*/gi, '')
    .replace(/[,-]+$/, '')
    .replace(/[.,]00\b/g, '')
    .trim();

  if (hasJuta) {
    const numStr = s.replace(/[^0-9.,]/g, '').replace(',', '.');
    const val = parseFloat(numStr);
    return Number.isFinite(val) && val > 0 ? Math.round(val * 1_000_000) : 0;
  }
  if (hasRibu) {
    const numStr = s.replace(/[^0-9.,]/g, '').replace(',', '.');
    const val = parseFloat(numStr);
    return Number.isFinite(val) && val > 0 ? Math.round(val * 1_000) : 0;
  }

  // Jika menggunakan pemisah ribuan titik atau koma (contoh: "2.500.000", "2,500,000", "500.000")
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) {
    const digitsOnly = s.replace(/[.,]/g, '');
    const val = parseInt(digitsOnly, 10);
    return Number.isFinite(val) ? val : 0;
  }

  // Jika hanya digit murni
  if (/^\d+$/.test(s)) {
    const val = parseInt(s, 10);
    if (!Number.isFinite(val) || val <= 0) return 0;
    if (val <= 50) return val * 1_000_000;
    if (val >= 100 && val < 1000) return val * 1_000;
    return val;
  }

  // Jika angka desimal kecil (mis. "2.5" atau "1,5" dari pembulatan juta)
  const cleanDec = s.replace(/[^0-9.,]/g, '').replace(',', '.');
  const parsed = parseFloat(cleanDec);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  if (parsed <= 50) return Math.round(parsed * 1_000_000);
  if (parsed >= 100 && parsed < 1000) return Math.round(parsed * 1_000);
  return Math.round(parsed);
}

/**
 * Normalize and map any income value (numeric, string, range) to standard dropdown option.
 */
export function mapIncomeToRange(val?: unknown): string {
  if (val === undefined || val === null) return 'Tidak Berpenghasilan / Rp 0';
  const str = String(val).trim();
  const lower = str.toLowerCase();
  if (
    !str ||
    str === '-' ||
    str === '0' ||
    lower.includes('tidak berpenghasilan') ||
    lower.includes('tidak ada') ||
    lower.includes('rp 0') ||
    lower === 'tidak bekerja' ||
    lower === 'almarhum' ||
    lower === 'almarhumah' ||
    lower === 'meninggal'
  ) {
    return 'Tidak Berpenghasilan / Rp 0';
  }

  // Exact option match
  for (const opt of INCOME_RANGE_OPTIONS) {
    if (lower === opt.toLowerCase()) return opt;
  }

  // Pattern matches untuk kurang / lebih
  if (
    str.includes('<') ||
    lower.includes('kurang dari') ||
    lower.includes('di bawah') ||
    lower.includes('dibawah') ||
    (lower.includes('500') && lower.includes('999'))
  ) {
    return '< Rp 1.000.000';
  }
  if (
    str.includes('>') ||
    lower.includes('lebih dari') ||
    lower.includes('di atas') ||
    lower.includes('diatas') ||
    lower.includes('20.000.000')
  ) {
    return '> Rp 5.000.000';
  }

  // Cek jika string adalah rentang (mengandung "-" atau "s/d" atau "sd" atau "sampai")
  const rangeParts = str.split(/\s*(?:-|–|—|\bs\/?d\b|\bsampai\b)\s*/i).filter(Boolean);
  if (rangeParts.length === 2) {
    const lowVal = parseRupiahToken(rangeParts[0]);
    const highVal = parseRupiahToken(rangeParts[1]);
    if (lowVal > 0 && highVal > 0) {
      // Jika bagian pertama belum memiliki satuan juta (mis. "1 - 2 Juta")
      const effectiveLow =
        lowVal < 100 && highVal >= 1_000_000 ? lowVal * 1_000_000 : lowVal;
      const mid = Math.round((effectiveLow + highVal) / 2);
      if (mid < 1_000_000) return '< Rp 1.000.000';
      if (mid <= 2_000_000) return 'Rp 1.000.000 - Rp 2.000.000';
      if (mid <= 3_000_000) return 'Rp 2.000.000 - Rp 3.000.000';
      if (mid <= 4_000_000) return 'Rp 3.000.000 - Rp 4.000.000';
      if (mid <= 5_000_000) return 'Rp 4.000.000 - Rp 5.000.000';
      return '> Rp 5.000.000';
    }
  }

  // Numeric parsing untuk angka tunggal (mis. "2.500.000", "2,500,000", "1500000")
  const num = parseRupiahToken(val);
  if (!Number.isFinite(num) || num <= 0) return 'Tidak Berpenghasilan / Rp 0';
  if (num < 1_000_000) return '< Rp 1.000.000';
  if (num < 2_000_000) return 'Rp 1.000.000 - Rp 2.000.000';
  if (num < 3_000_000) return 'Rp 2.000.000 - Rp 3.000.000';
  if (num < 4_000_000) return 'Rp 3.000.000 - Rp 4.000.000';
  if (num <= 5_000_000) return 'Rp 4.000.000 - Rp 5.000.000';
  return '> Rp 5.000.000';
}

/**
 * Convert range string or raw Rupiah string into representative numeric midpoint for PostgreSQL NUMERIC columns.
 */
export function incomeRangeToNumeric(rangeStr?: string | number | null): number {
  if (rangeStr === undefined || rangeStr === null) return 0;
  const normalizedRange = mapIncomeToRange(rangeStr);
  if (normalizedRange === 'Tidak Berpenghasilan / Rp 0') return 0;
  if (normalizedRange === '< Rp 1.000.000') return 750000;
  if (normalizedRange === 'Rp 1.000.000 - Rp 2.000.000') return 1500000;
  if (normalizedRange === 'Rp 2.000.000 - Rp 3.000.000') return 2500000;
  if (normalizedRange === 'Rp 3.000.000 - Rp 4.000.000') return 3500000;
  if (normalizedRange === 'Rp 4.000.000 - Rp 5.000.000') return 4500000;
  if (normalizedRange === '> Rp 5.000.000') return 6000000;

  return parseRupiahToken(rangeStr);
}

const UPPERCASE_ACRONYMS = new Set([
  'SD',
  'SDN',
  'SDS',
  'SDIT',
  'SDI',
  'MI',
  'MIN',
  'MIS',
  'SMP',
  'SMPN',
  'SMPS',
  'SMPIT',
  'SMA',
  'SMAN',
  'SMAS',
  'SMK',
  'SMKN',
  'SMKS',
  'MA',
  'MAN',
  'MAS',
  'TK',
  'PAUD',
  'PKBM',
  'SLTP',
  'SLTA',
  'S1',
  'S2',
  'S3',
  'D1',
  'D2',
  'D3',
  'D4',
  'PNS',
  'ASN',
  'TNI',
  'POLRI',
  'BUMN',
  'BUMD',
  'WNI',
  'WNA',
  'RT',
  'RW',
  'DKI',
  'DIY',
  'NTB',
  'NTT',
  'NAD',
  'KIP',
  'PKH',
  'NIK',
  'NIS',
  'NISN',
  'KK',
  'NPSN',
  'WA',
  'HP',
  'II',
  'III',
  'IV',
  'VI',
  'VII',
  'VIII',
  'IX',
  'XI',
  'XII'
]);

/**
 * Converts text into clean Title Case (Huruf Besar di Awal Kata),
 * preserving standard Indonesian acronyms (SDN, WNI, DKI, PNS, S1, etc.).
 */
export function toTitleCase(val?: unknown): string {
  if (val === undefined || val === null) return '';
  const str = String(val).trim();
  if (!str || str === '-') return str;

  // Do not alter emails, URLs, or pure numbers/codes
  if (str.includes('@') || /^https?:\/\//i.test(str) || /^[0-9/.\-_]+$/.test(str)) {
    return str;
  }

  return str
    .split(/(\s+)/)
    .map(token => {
      if (/^\s+$/.test(token)) return token;

      // Handle slash-separated words like "SMA/Sederajat" or "RT/RW"
      if (token.includes('/')) {
        return token
          .split('/')
          .map(part => formatSingleWordTitleCase(part))
          .join('/');
      }

      return formatSingleWordTitleCase(token);
    })
    .join('');
}

function formatSingleWordTitleCase(word: string): string {
  if (!word) return word;
  const cleanAlpha = word.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (UPPERCASE_ACRONYMS.has(cleanAlpha)) {
    return word.toUpperCase();
  }
  if (cleanAlpha === 'MTS' || cleanAlpha === 'MTSN') {
    return cleanAlpha === 'MTSN' ? 'MTsN' : 'MTs';
  }
  const lower = word.toLowerCase();
  return lower.replace(/(^|['"(.-])([a-z])/g, (_, prefix: string, letter: string) => {
    return `${prefix}${letter.toUpperCase()}`;
  });
}

/**
 * Returns the default parent login password derived from student's birth date in dd-mm-yyyy format.
 * Example: '2012-08-25' -> '25-08-2012'
 */
export function formatBirthDatePasswordDefault(dbTanggalLahir?: unknown): string {
  const formatted = formatDateDMY(dbTanggalLahir);
  if (!formatted || formatted === '-') return '';
  return formatted;
}

/**
 * Checks whether the input password matches the student's birth date (`tanggal_lahir`)
 * in any common format:
 * - dd-mm-yyyy (e.g. 25-08-2012)
 * - ddmmyyyy (e.g. 25082012)
 * - dd/mm/yyyy (e.g. 25/08/2012)
 * - yyyy-mm-dd (e.g. 2012-08-25)
 * - yyyymmdd (e.g. 20120825)
 * - d-m-yyyy or d/m/yyyy (e.g. 5-8-2012)
 */
export function isBirthDatePasswordMatch(inputPassword: string, dbTanggalLahir?: unknown): boolean {
  if (!inputPassword || dbTanggalLahir === undefined || dbTanggalLahir === null) return false;
  const dmy = formatDateDMY(dbTanggalLahir); // returns DD-MM-YYYY
  if (!dmy || dmy === '-') return false;

  const match = dmy.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) {
    return inputPassword.trim() === String(dbTanggalLahir).trim();
  }

  const [, dd, mm, yyyy] = match;
  const dNoZero = String(parseInt(dd, 10));
  const mNoZero = String(parseInt(mm, 10));

  const validCandidates = new Set([
    `${dd}-${mm}-${yyyy}`, // 25-08-2012
    `${dd}${mm}${yyyy}`, // 25082012
    `${dd}/${mm}/${yyyy}`, // 25/08/2012
    `${dd}.${mm}.${yyyy}`, // 25.08.2012
    `${yyyy}-${mm}-${dd}`, // 2012-08-25
    `${yyyy}/${mm}/${dd}`, // 2012/08/25
    `${yyyy}${mm}${dd}`, // 20120825
    `${dNoZero}-${mNoZero}-${yyyy}`, // 5-8-2012
    `${dNoZero}/${mNoZero}/${yyyy}` // 5/8/2012
  ]);

  return validCandidates.has(inputPassword.trim());
}

/**
 * Maps student grade level (tingkat_kelas) to cohort year (angkatan):
 * - Kelas 9 -> Angkatan 2024
 * - Kelas 8 -> Angkatan 2025
 * - Kelas 7 -> Angkatan 2026
 * Preserves historical cohort years for graduated alumni (status === 'lulus').
 */
export function inferStudentAngkatan(
  tingkat?: string | null,
  explicitAngkatan?: unknown,
  status?: string | null
): string {
  const cleanExplicit = explicitAngkatan ? String(explicitAngkatan).trim() : '';
  const st = (status || 'aktif').toLowerCase();

  // Preserve historical cohort for graduated alumni if <= 2024
  if (st === 'lulus' && /^\d{4}$/.test(cleanExplicit)) {
    const yr = parseInt(cleanExplicit, 10);
    if (yr <= 2024) return cleanExplicit;
  }

  const t = String(tingkat || '').trim().charAt(0);
  if (t === '9') return '2024';
  if (t === '8') return '2025';
  if (t === '7') return '2026';

  if (/^\d{4}$/.test(cleanExplicit)) return cleanExplicit;
  return '2026';
}

/**
 * Normalizes student full name into ALL UPPERCASE (HURUF KAPITAL SEMUA).
 */
export function toUpperStudentName(val?: unknown): string {
  if (val === undefined || val === null) return '';
  const str = String(val)
    .replace(/\s+/g, ' ')
    .trim();
  if (!str || str === '-') return '';
  return str.toUpperCase();
}

/**
 * Daftar Kota Otonom di Indonesia yang selalu ditetapkan memakai awalan "Kota ..."
 * meskipun di dalam data/alamat tertulis tanpa kata "Kota".
 */
const OFFICIAL_KOTA_ONLY_MAP: Record<string, string> = {
  'jakarta barat': 'Kota Jakarta Barat',
  jakbar: 'Kota Jakarta Barat',
  'jak-bar': 'Kota Jakarta Barat',
  'jakarta pusat': 'Kota Jakarta Pusat',
  jakpus: 'Kota Jakarta Pusat',
  'jak-pus': 'Kota Jakarta Pusat',
  'jakarta selatan': 'Kota Jakarta Selatan',
  jaksel: 'Kota Jakarta Selatan',
  'jak-sel': 'Kota Jakarta Selatan',
  'jakarta timur': 'Kota Jakarta Timur',
  jaktim: 'Kota Jakarta Timur',
  'jak-tim': 'Kota Jakarta Timur',
  'jakarta utara': 'Kota Jakarta Utara',
  jakut: 'Kota Jakarta Utara',
  'jak-ut': 'Kota Jakarta Utara',
  'dki jakarta': 'Kota Jakarta',
  jakarta: 'Kota Jakarta',
  depok: 'Kota Depok',
  'tangerang selatan': 'Kota Tangerang Selatan',
  tangsel: 'Kota Tangerang Selatan',
  cimahi: 'Kota Cimahi',
  cilegon: 'Kota Cilegon',
  banjar: 'Kota Banjar',
  surabaya: 'Kota Surabaya',
  yogyakarta: 'Kota Yogyakarta',
  jogja: 'Kota Yogyakarta',
  surakarta: 'Kota Surakarta',
  solo: 'Kota Surakarta',
  salatiga: 'Kota Salatiga',
  batu: 'Kota Batu',
  medan: 'Kota Medan',
  binjai: 'Kota Binjai',
  tebingtinggi: 'Kota Tebing Tinggi',
  'tebing tinggi': 'Kota Tebing Tinggi',
  pematangsiantar: 'Kota Pematangsiantar',
  padang: 'Kota Padang',
  bukittinggi: 'Kota Bukittinggi',
  payakumbuh: 'Kota Payakumbuh',
  pekanbaru: 'Kota Pekanbaru',
  dumai: 'Kota Dumai',
  jambi: 'Kota Jambi',
  palembang: 'Kota Palembang',
  prabumulih: 'Kota Prabumulih',
  lubuklinggau: 'Kota Lubuklinggau',
  pagaralam: 'Kota Pagar Alam',
  bengkulu: 'Kota Bengkulu',
  'bandar lampung': 'Kota Bandar Lampung',
  bandarlampung: 'Kota Bandar Lampung',
  metro: 'Kota Metro',
  pangkalpinang: 'Kota Pangkalpinang',
  'pangkal pinang': 'Kota Pangkalpinang',
  batam: 'Kota Batam',
  tanjungpinang: 'Kota Tanjungpinang',
  'tanjung pinang': 'Kota Tanjungpinang',
  pontianak: 'Kota Pontianak',
  singkawang: 'Kota Singkawang',
  palangkaraya: 'Kota Palangka Raya',
  'palangka raya': 'Kota Palangka Raya',
  banjarmasin: 'Kota Banjarmasin',
  banjarbaru: 'Kota Banjarbaru',
  balikpapan: 'Kota Balikpapan',
  samarinda: 'Kota Samarinda',
  bontang: 'Kota Bontang',
  tarakan: 'Kota Tarakan',
  manado: 'Kota Manado',
  bitung: 'Kota Bitung',
  tomohon: 'Kota Tomohon',
  kotamobagu: 'Kota Kotamobagu',
  palu: 'Kota Palu',
  makassar: 'Kota Makassar',
  parepare: 'Kota Parepare',
  palopo: 'Kota Palopo',
  kendari: 'Kota Kendari',
  baubau: 'Kota Baubau',
  gorontalo: 'Kota Gorontalo',
  mataram: 'Kota Mataram',
  denpasar: 'Kota Denpasar',
  ambon: 'Kota Ambon',
  ternate: 'Kota Ternate',
  tidore: 'Kota Tidore Kepulauan',
  jayapura: 'Kota Jayapura'
};

/**
 * Kamus pemetaan Kecamatan / Kelurahan populer (khususnya Jabodetabek, Jawa Barat, Banten, Jawa)
 * ke Kota / Kabupaten untuk deteksi otomatis dari Alamat Lengkap ketika kab_kota belum diisi.
 * Catatan: Untuk Kabupaten, jenis "Kab." dihapus (mis. "Bogor", "Bekasi", "Tangerang").
 * Untuk Kota, awalan "Kota" ditetapkan (mis. "Kota Jakarta Barat", "Kota Depok", "Kota Bekasi").
 */
const SUBDISTRICT_TO_DAERAH_PATTERNS: Array<{ keywords: string[]; daerah: string }> = [
  {
    daerah: 'Kota Jakarta Barat',
    keywords: [
      'tambora',
      'jembatan lima',
      'tanah sereal',
      'pekojan',
      'roa malaka',
      'duri utara',
      'duri selatan',
      'kalianyar',
      'kali anyar',
      'angke',
      'krendang',
      'kerendang',
      'jembatan besi',
      'taman sari',
      'tamansari',
      'glodok',
      'pinangsia',
      'mangga besar',
      'keagungan',
      'krukut',
      'maphar',
      'tangki',
      'grogol petamburan',
      'grogol',
      'jelambar',
      'wijaya kusuma',
      'tanjung duren',
      'tomang',
      'palmerah',
      'slipi',
      'kota bambu',
      'jatipulo',
      'kemanggisan',
      'kebon jeruk',
      'duri kepa',
      'kedoya',
      'kelapa dua jakbar',
      'sukabumi utara',
      'sukabumi selatan',
      'kembangan',
      'meruya',
      'srengseng',
      'joglo',
      'cengkareng',
      'kapuk',
      'kedaung kali angke',
      'rawa buaya',
      'duri kosambi',
      'kalideres',
      'kamal',
      'tegal alur',
      'pegadungan',
      'semanan'
    ]
  },
  {
    daerah: 'Kota Jakarta Pusat',
    keywords: [
      'gambir',
      'cideng',
      'petojo',
      'duri pulo',
      'kebon kelapa',
      'sawah besar',
      'mangga dua',
      'pasar baru',
      'karang anyar',
      'kartini',
      'kemayoran',
      'gunung sahari',
      'harapan mulya',
      'cempaka baru',
      'utan panjang',
      'sumur batu',
      'serdang',
      'senen',
      'kwitang',
      'kenari',
      'paseban',
      'kramat',
      'bungur',
      'cempaka putih',
      'rawasari',
      'menteng',
      'pegangsaan',
      'cikini',
      'kebon sirih',
      'gondangdia',
      'tanah abang',
      'bendungan hilir',
      'karet tengsin',
      'kebon melati',
      'kebon kacang',
      'kampung bali',
      'petamburan',
      'gelora',
      'johar baru',
      'galur',
      'tanah tinggi',
      'kampung rawa'
    ]
  },
  {
    daerah: 'Kota Jakarta Utara',
    keywords: [
      'penjaringan',
      'pluit',
      'pejagalan',
      'kapuk muara',
      'kamal muara',
      'muara karang',
      'pantai indah kapuk',
      'pademangan',
      'ancol',
      'tanjung priok',
      'sunter',
      'kebon bawang',
      'sungai bambu',
      'papanggo',
      'warakas',
      'koja',
      'rawa badak',
      'tugu utara',
      'tugu selatan',
      'lagoa',
      'kelapa gading',
      'pegangsaan dua',
      'cilincing',
      'kalibaru',
      'semper',
      'sukapura',
      'marunda',
      'rorotan'
    ]
  },
  {
    daerah: 'Kota Jakarta Selatan',
    keywords: [
      'kebayoran baru',
      'kebayoran lama',
      'pondok indah',
      'grogol utara',
      'grogol selatan',
      'cipulir',
      'kebayoran',
      'pesanggrahan',
      'ulujami',
      'petukangan',
      'bintaro jaksel',
      'cilandak',
      'cipete',
      'gandaria',
      'lebak bulus',
      'pondok labu',
      'pasar minggu',
      'pejaten',
      'kebagusan',
      'jati padang',
      'ragunan',
      'cilandak timur',
      'jagakarsa',
      'tanjung barat',
      'lenteng agung',
      'ciganjur',
      'srengseng sawah',
      'cipedak',
      'mampang prapatan',
      'kuningan barat',
      'pela mampang',
      'bangka',
      'tegal parang',
      'pancoran',
      'kalibata',
      'rawa jati',
      'duren tiga',
      'cikoko',
      'pengadegan',
      'tebet',
      'manggarai',
      'bukit duri',
      'kebon baru',
      'menteng dalam',
      'setiabudi',
      'karet semanggi',
      'karet kuningan',
      'guntur',
      'pasar manggis'
    ]
  },
  {
    daerah: 'Kota Jakarta Timur',
    keywords: [
      'matraman',
      'pisangan baru',
      'utan kayu',
      'kayu manis',
      'pal meriam',
      'kebon manggis',
      'pulogadung',
      'pulo gadung',
      'kayu putih',
      'jati',
      'rawamangun',
      'pisangan timur',
      'cipinang',
      'jatinegara',
      'bali mester',
      'kampung melayu',
      'bidaracina',
      'cipinang cempedak',
      'rawa bunga',
      'cipinang besar',
      'cipinang muara',
      'duren sawit',
      'pondok bambu',
      'klender',
      'pondok kelapa',
      'malaka sari',
      'malaka jaya',
      'pondok kopi',
      'kramat jati',
      'batu ampar',
      'balekambang',
      'condet',
      'cawang',
      'cililitan',
      'dukuh',
      'makasar',
      'pinang ranti',
      'halim',
      'kebon pala',
      'cipinang melayu',
      'pasar rebo',
      'pekayon',
      'gedong',
      'cijantung',
      'baru',
      'kalisari',
      'ciracas',
      'cibubur',
      'kelapa dua wetan',
      'susukan',
      'rambutan',
      'cipayung',
      'lubang buaya',
      'ceger',
      'munjul',
      'pondok ranggon',
      'cilangkap',
      'setu jaktim',
      'bambu apus',
      'cakung',
      'rawa terate',
      'jaktim',
      'penggilingan',
      'pulogebang',
      'pulo gebang',
      'ujung menteng'
    ]
  },
  {
    daerah: 'Kota Depok',
    keywords: [
      'pancoran mas',
      'beji',
      'kukusan',
      'tanah baru depok',
      'margonda',
      'sukmajaya',
      'cilodong',
      'limo',
      'cinere',
      'cimanggis',
      'cisalak',
      'mekarsari depok',
      'tugu depok',
      'harjamukti',
      'tapos',
      'cilangkap depok',
      'sawangan',
      'bojongsari',
      'citayam depok'
    ]
  },
  {
    daerah: 'Kota Tangerang Selatan',
    keywords: [
      'serpong',
      'serpong utara',
      'bsd',
      'pondok aren',
      'bintaro',
      'ciputat',
      'ciputat timur',
      'pamulang',
      'pondok cabe',
      'rempoa',
      'jombang tangsel'
    ]
  },
  {
    daerah: 'Kota Tangerang',
    keywords: [
      'ciledug',
      'larangan',
      'karang tengah',
      'cipondoh',
      'pinang',
      'karawaci',
      'jatiuwung',
      'cibodas',
      'periuk',
      'batuceper',
      'batu ceper',
      'neglasari',
      'benda',
      'poris'
    ]
  },
  {
    daerah: 'Tangerang',
    keywords: [
      'balaraja',
      'tigaraksa',
      'cikupa',
      'curug',
      'kelapa dua tangerang',
      'legok',
      'pagedangan',
      'cisauk',
      'pasar kemis',
      'pasarkemis',
      'rajeg',
      'teluknaga',
      'teluk naga',
      'kosambi',
      'dadap',
      'sepatan',
      'pakuhaji',
      'mauk',
      'kronjo',
      'kresek',
      'cisoka',
      'panongan',
      'jayanti',
      'sindang jaya',
      'solear',
      'jambe'
    ]
  },
  {
    daerah: 'Kota Bekasi',
    keywords: [
      'bekasi timur',
      'bekasi barat',
      'bekasi utara',
      'bekasi selatan',
      'rawalumbu',
      'rawa lumbu',
      'medan satria',
      'harapan indah',
      'bantargebang',
      'bantar gebang',
      'pondok gede',
      'pondokgede',
      'jatiasih',
      'jati asih',
      'jatisampurna',
      'jati sampurna',
      'mustikajaya',
      'mustika jaya',
      'pondok melati',
      'kayuringin',
      'margahayu bekasi',
      'kaliabang',
      'pejuang'
    ]
  },
  {
    daerah: 'Bekasi',
    keywords: [
      'tambun selatan',
      'tambun utara',
      'tambun',
      'cibitung',
      'cikarang barat',
      'cikarang utara',
      'cikarang selatan',
      'cikarang timur',
      'cikarang pusat',
      'cikarang',
      'babelan',
      'tarumajaya',
      'setu bekasi',
      'serang baru',
      'cibarusah',
      'karangbahagia',
      'kedungwaringin',
      'pebayuran',
      'sukatani',
      'sukakarya',
      'tambelang',
      'sukawangi',
      'cabangbungin',
      'muaragembong',
      'bojongmangu'
    ]
  },
  {
    daerah: 'Kota Bogor',
    keywords: [
      'bogor selatan',
      'bogor timur',
      'bogor utara',
      'bogor tengah',
      'bogor barat',
      'tanah sareal'
    ]
  },
  {
    daerah: 'Bogor',
    keywords: [
      'cibinong',
      'gunung putri',
      'gunungputri',
      'citeureup',
      'sukaraja',
      'babakan madang',
      'sentul',
      'jonggol',
      'cileungsi',
      'cariu',
      'sukamakmur',
      'parung',
      'gunung sindur',
      'gunungsindur',
      'kemang bogor',
      'bojonggede',
      'bojong gede',
      'citayam',
      'tajurhalang',
      'tajur halang',
      'leuwiliang',
      'ciampea',
      'cibungbulang',
      'pamijahan',
      'rumpin',
      'jasinga',
      'parung panjang',
      'parungpanjang',
      'nanggung',
      'cigudeg',
      'tenjo',
      'ciawi',
      'cisarua',
      'megamendung',
      'caringin',
      'cijeruk',
      'ciomas',
      'dramaga',
      'klapanunggal',
      'ciseeng',
      'rancabungur',
      'cigombong'
    ]
  }
];

/**
 * Daftar nama Kabupaten / daerah umum di Indonesia untuk deteksi dari teks alamat bebas.
 * Jika tidak didahului kata "Kota", hasil akhirnya otomatis berupa nama daerah tanpa "Kab."
 */
const KNOWN_REGENCY_NAMES = [
  'Bandung Barat',
  'Pangandaran',
  'Tasikmalaya',
  'Majalengka',
  'Purwakarta',
  'Indramayu',
  'Karawang',
  'Sukabumi',
  'Kuningan',
  'Sumedang',
  'Bandung',
  'Cirebon',
  'Cianjur',
  'Ciamis',
  'Subang',
  'Garut',
  'Bogor',
  'Bekasi',
  'Tangerang',
  'Pandeglang',
  'Serang',
  'Lebak',
  'Cilacap',
  'Banyumas',
  'Purbalingga',
  'Banjarnegara',
  'Kebumen',
  'Purworejo',
  'Wonosobo',
  'Magelang',
  'Boyolali',
  'Klaten',
  'Sukoharjo',
  'Wonogiri',
  'Karanganyar',
  'Sragen',
  'Grobogan',
  'Blora',
  'Rembang',
  'Pati',
  'Kudus',
  'Jepara',
  'Demak',
  'Semarang',
  'Temanggung',
  'Kendal',
  'Batang',
  'Pekalongan',
  'Pemalang',
  'Tegal',
  'Brebes',
  'Sleman',
  'Bantul',
  'Gunungkidul',
  'Kulon Progo',
  'Sidoarjo',
  'Gresik',
  'Mojokerto',
  'Jombang',
  'Nganjuk',
  'Madiun',
  'Magetan',
  'Ngawi',
  'Ponorogo',
  'Pacitan',
  'Kediri',
  'Blitar',
  'Tulungagung',
  'Trenggalek',
  'Malang',
  'Pasuruan',
  'Probolinggo',
  'Lumajang',
  'Jember',
  'Bondowoso',
  'Situbondo',
  'Banyuwangi',
  'Lamongan',
  'Tuban',
  'Bojonegoro',
  'Bangkalan',
  'Sampang',
  'Pamekasan',
  'Sumenep',
  'Lampung Selatan',
  'Lampung Tengah',
  'Lampung Timur',
  'Lampung Utara',
  'Lampung Barat',
  'Pesawaran',
  'Pringsewu',
  'Tanggamus',
  'Deli Serdang',
  'Karo',
  'Langkat',
  'Simalungun',
  'Asahan',
  'Kampar',
  'Bengkalis',
  'Siak',
  'Banyuasin',
  'Musi Banyuasin',
  'Ogan Ilir',
  'Ogan Komering Ilir'
];

/**
 * Menormalkan label Kota / Kabupaten sesuai aturan bisnis:
 * - Hapus jenis "Kab." / "Kabupaten" (misal "Kab. Bogor" -> "Bogor", "Kabupaten Bekasi" -> "Bekasi")
 * - Tetapkan awalan "Kota" untuk daerah berstatus Kota (misal "Kota Bogor", "Kota Depok", "Kota Jakarta Barat")
 */
export function normalizeDaerahKotaKab(rawVal?: unknown): string {
  if (rawVal === undefined || rawVal === null) return '';
  let str = String(rawVal)
    .replace(/\b\d{5}\b/g, ' ') // hapus kode pos 5 digit
    .replace(/\s+/g, ' ')
    .trim();

  if (!str || str === '-' || /^(belum diisi|null|undefined|tidak ada|none)$/i.test(str)) {
    return '';
  }

  // Buang embel-embel provinsi jika tergabung dengan koma/strip di ujung
  str = str
    .replace(/[,/-]\s*(dki jakarta|jawa barat|jawa tengah|jawa timur|banten|di yogyakarta|diy)\s*$/i, '')
    .trim();

  const lower = str.toLowerCase();

  // 1. Cek apakah diawali atau mengandung kata "Kota" / "Kotamadya" / "Kota Administrasi"
  const kotaMatch = str.match(
    /^(?:kota\s+administrasi|kota\s+adm\.?|kotamadya|kota)\s+(.+)$/i
  ) || str.match(/^(.+?)\s+(?:kota\s+administrasi|kotamadya|kota)$/i);

  if (kotaMatch && kotaMatch[1]) {
    const core = kotaMatch[1]
      .replace(/^(?:kab\.?|kabupaten|kota|adm\.?|administrasi)\s+/i, '')
      .trim();
    const coreLower = core.toLowerCase();
    if (OFFICIAL_KOTA_ONLY_MAP[coreLower]) {
      return OFFICIAL_KOTA_ONLY_MAP[coreLower];
    }
    return `Kota ${toTitleCase(core)}`;
  }

  // 2. Cek apakah diawali atau diakhiri kata "Kab." / "Kab" / "Kabupaten" -> HAPUS jenis Kab.
  const kabMatch =
    str.match(/^(?:kabupaten|kab\.?)\s+(.+)$/i) ||
    str.match(/^(.+?)\s+(?:kabupaten|kab\.?)$/i);

  if (kabMatch && kabMatch[1]) {
    const core = kabMatch[1]
      .replace(/^(?:kab\.?|kabupaten)\s+/i, '')
      .trim();
    const coreLower = core.toLowerCase();
    // Jika ternyata yang ditulis "Kab. Depok" atau "Kab. Tangerang Selatan" (yang sebenarnya Kota Otonom)
    if (OFFICIAL_KOTA_ONLY_MAP[coreLower]) {
      return OFFICIAL_KOTA_ONLY_MAP[coreLower];
    }
    return toTitleCase(core);
  }

  // 3. Cek apakah langsung cocok dengan daftar Kota Otonom (misal "Jakarta Barat", "Depok", "Tangsel", "Surabaya")
  if (OFFICIAL_KOTA_ONLY_MAP[lower]) {
    return OFFICIAL_KOTA_ONLY_MAP[lower];
  }

  return toTitleCase(str);
}

/**
 * Mendeteksi Kota / Kabupaten secara otomatis dari teks Alamat Lengkap / Kecamatan / Kelurahan
 * apabila kolom kab_kota belum terisi, sekaligus menormalkan hasilnya (hapus "Kab.", tetapkan "Kota").
 */
export function detectDaerahFromAddressText(rawText?: unknown): string {
  if (rawText === undefined || rawText === null) return '';
  const text = String(rawText).replace(/\s+/g, ' ').trim();
  if (!text || text === '-') return '';

  const lower = text.toLowerCase();

  // 1. Cari pola eksplisit "Kota ..." di dalam kalimat alamat
  const explicitKota = text.match(
    /\b(?:kota\s+administrasi|kota\s+adm\.?|kotamadya|kota)\s+([a-zA-Z]+(?:\s+(?:barat|timur|utara|selatan|pusat|raya|tinggi|lampung|pinang|kepulauan))?)/i
  );
  if (explicitKota && explicitKota[1]) {
    const candidate = explicitKota[1].trim();
    const candLower = candidate.toLowerCase();
    // Hindari salah tangkap "Kota Bambu" (kelurahan di Palmerah, Jakarta Barat) atau "Kota Baru"
    if (!candLower.startsWith('bambu') && !candLower.startsWith('baru') && !candLower.startsWith('wisata')) {
      return normalizeDaerahKotaKab(`Kota ${candidate}`);
    }
  }

  // 2. Cari pola eksplisit "Kab. ..." atau "Kabupaten ..." di dalam kalimat alamat -> Hapus "Kab."
  const explicitKab = text.match(
    /\b(?:kabupaten|kab\.?)\s+([a-zA-Z]+(?:\s+(?:barat|timur|utara|selatan|pusat|tengah|ilir|ulu|serdang|progo))?)/i
  );
  if (explicitKab && explicitKab[1]) {
    return normalizeDaerahKotaKab(`Kab. ${explicitKab[1].trim()}`);
  }

  // 3. Cari penyebutan Kota Otonom (Jakarta Barat/Pusat/Selatan/Timur/Utara, Depok, Tangerang Selatan, dll.)
  for (const [key, normalizedKota] of Object.entries(OFFICIAL_KOTA_ONLY_MAP)) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(lower)) {
      return normalizedKota;
    }
  }

  // 4. Deteksi dari nama Kecamatan / Kelurahan populer (Jabodetabek, DKI Jakarta, Jabar, Banten)
  for (const group of SUBDISTRICT_TO_DAERAH_PATTERNS) {
    for (const kw of group.keywords) {
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'i');
      if (regex.test(lower)) {
        return group.daerah;
      }
    }
  }

  // 5. Deteksi dari daftar nama Kabupaten / daerah di Indonesia (otomatis tanpa "Kab.")
  for (const regency of KNOWN_REGENCY_NAMES) {
    const escaped = regency.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(lower)) {
      return regency;
    }
  }

  return '';
}

/**
 * Menyelesaikan & menormalkan Asal Daerah Siswa (Kota / Kabupaten):
 * 1. Ambil dari `kab_kota` jika sudah terisi -> normalkan (hapus "Kab.", tetapkan "Kota").
 * 2. Jika belum terisi, deteksi otomatis dari `alamat` (Alamat Lengkap), `kecamatan`, `kelurahan`, `jalan_dusun`.
 * 3. Jika masih belum terdeteksi, cek `kabupaten_asal_sekolah`, `kecamatan_asal_sekolah`, atau `tempat_lahir`.
 */
export function resolveAndNormalizeDaerahSiswa(student: {
  kab_kota?: string | null;
  kabupaten_asal_sekolah?: string | null;
  alamat?: string | null;
  kecamatan?: string | null;
  kelurahan?: string | null;
  jalan_dusun?: string | null;
  kecamatan_asal_sekolah?: string | null;
  tempat_lahir?: string | null;
  provinsi?: string | null;
}): string {
  // 1. Jika kab_kota sudah ada isinya
  const directKabKota = (student.kab_kota || '').trim();
  if (directKabKota && directKabKota !== '-' && directKabKota.toLowerCase() !== 'belum diisi') {
    const detectedFromDirect = detectDaerahFromAddressText(directKabKota);
    if (detectedFromDirect) return detectedFromDirect;
    const normalizedDirect = normalizeDaerahKotaKab(directKabKota);
    if (normalizedDirect) return normalizedDirect;
  }

  // 2. Deteksi otomatis dari Alamat Lengkap + Kecamatan + Kelurahan + Jalan/Dusun
  const combinedAddress = [
    student.alamat,
    student.kecamatan ? `Kec. ${student.kecamatan}` : '',
    student.kelurahan ? `Kel. ${student.kelurahan}` : '',
    student.jalan_dusun
  ]
    .filter(Boolean)
    .join(', ');

  if (combinedAddress) {
    const fromAddress = detectDaerahFromAddressText(combinedAddress);
    if (fromAddress) return fromAddress;
  }

  // 3. Cek Kabupaten / Kecamatan Asal Sekolah
  const schoolRegion = (student.kabupaten_asal_sekolah || '').trim();
  if (schoolRegion && schoolRegion !== '-' && schoolRegion.toLowerCase() !== 'belum diisi') {
    const detectedSchool = detectDaerahFromAddressText(schoolRegion);
    if (detectedSchool) return detectedSchool;
    const normSchool = normalizeDaerahKotaKab(schoolRegion);
    if (normSchool) return normSchool;
  }

  if (student.kecamatan_asal_sekolah) {
    const fromSchoolKec = detectDaerahFromAddressText(student.kecamatan_asal_sekolah);
    if (fromSchoolKec) return fromSchoolKec;
  }

  // 4. Fallback terakhir dari Tempat Lahir jika merupakan nama Kota/Kabupaten yang valid
  if (student.tempat_lahir && student.tempat_lahir !== '-') {
    const fromBirthPlace = detectDaerahFromAddressText(student.tempat_lahir);
    if (fromBirthPlace) return fromBirthPlace;
    const normBirth = normalizeDaerahKotaKab(student.tempat_lahir);
    if (normBirth) return normBirth;
  }

  return '';
}

