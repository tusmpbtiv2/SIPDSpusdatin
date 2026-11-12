import React, { useState, useEffect, useMemo } from 'react';
import {
  Siswa,
  Mutasi,
  ImportCategory,
  ImportBatchRecord,
  ImportBatchRowRecord,
  ALL_59_STUDENT_FIELDS
} from '../../types';
import {
  getSiswaList,
  createSiswa,
  updateSiswa,
  getMutasiList,
  importMutationFromExcelRow,
  getAllClassHistoryList,
  saveClassHistoryPlacement,
  getImportBatchesList,
  recordImportBatchWithRows
} from '../../services/dataService';
import {
  readExcelFile,
  combineWorkbookStudentSheets,
  inferClassFromSheetName,
  normalizeKelasValue,
  validateAndMapExcelRows,
  validateAndMapClassHistoryRows,
  validateAndMapMutationRows,
  isSameStudentIdentity,
  normalizeStudentIdentityName,
  downloadTemplateExcel,
  downloadClassHistoryTemplateExcel,
  downloadMutationTemplateExcel,
  downloadFailedRowsReport,
  ParsedStudentRow,
  ParsedClassHistoryImportRow,
  ParsedMutationImportRow,
  SheetDataInfo
} from '../../services/excelService';
import { CLASS_ROSTER } from '../../config/school';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { formatDateDMY } from '../../utils/formatters';
import { PageTitle } from '../../components/common/PageTitle';
import { StatisticCard } from '../../components/common/StatCard';
import { DataTable, Column } from '../../components/common/ModernTable';
import { StatusBadge } from '../../components/common/ZeroPillBadge';
import {
  UploadCloud,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  UserPlus,
  RefreshCw,
  BookOpen,
  History,
  Trash2,
  LogIn,
  LogOut,
  Layers
} from 'lucide-react';

interface ImportExcelPageProps {
  onImportComplete?: () => void;
  initialCategory?: ImportCategory;
}

const ALL_SHEETS_COMBINED_KEY = '__ALL_STUDENT_SHEETS__';

export const ImportExcelPage: React.FC<ImportExcelPageProps> = ({
  onImportComplete,
  initialCategory = 'siswa_baru'
}) => {
  const { adminUser, role } = useAuth();
  const { success, error: notifyError } = useNotification();

  const [category, setCategory] = useState<ImportCategory>(initialCategory);
  const [tahunPelajaran, setTahunPelajaran] = useState('2025/2026');
  const [angkatan, setAngkatan] = useState('2025');
  const [defaultKelasAwal, setDefaultKelasAwal] = useState('7A');
  const [upsertExistingOnSiswaBaru, setUpsertExistingOnSiswaBaru] = useState(true);

  const [existingStudents, setExistingStudents] = useState<Siswa[]>([]);
  const [existingMutations, setExistingMutations] = useState<Mutasi[]>([]);
  const [existingHistory, setExistingHistory] = useState<
    { student_id: string; tahun_ajaran?: string; kelas: string }[]
  >([]);
  const [batches, setBatches] = useState<ImportBatchRecord[]>([]);

  // Parsed workbook & sheet state
  const [fileName, setFileName] = useState('');
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [sheetsMap, setSheetsMap] = useState<Record<string, SheetDataInfo>>({});
  const [selectedSheetName, setSelectedSheetName] = useState<string>('');

  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, keyof Siswa | ''>>({});

  // Mode Pembaruan Data column selection & row confirmation
  const [selectedUpdateCols, setSelectedUpdateCols] = useState<Record<string, boolean>>({});
  const [confirmedUpdateRows, setConfirmedUpdateRows] = useState<Record<number, boolean>>({});

  const [committing, setCommitting] = useState(false);
  const [commitProgress, setCommitProgress] = useState<{ current: number; total: number } | null>(
    null
  );
  const [lastCommitErrors, setLastCommitErrors] = useState<ImportBatchRecord['error_details']>([]);

  const loadMaster = async () => {
    try {
      const [st, muts, hist, bList] = await Promise.all([
        getSiswaList().catch(() => []),
        getMutasiList().catch(() => []),
        getAllClassHistoryList().catch(() => []),
        getImportBatchesList().catch(() => [])
      ]);
      setExistingStudents(st);
      setExistingMutations(muts);
      setExistingHistory(hist);
      setBatches(bList);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadMaster();
  }, []);

  const applySheetSelection = (
    targetSheet: string,
    map: Record<string, SheetDataInfo>,
    currentCategory: ImportCategory
  ) => {
    setSelectedSheetName(targetSheet);

    let effectiveCategory = currentCategory;
    if (targetSheet === ALL_SHEETS_COMBINED_KEY) {
      if (effectiveCategory === 'mutasi_masuk' || effectiveCategory === 'mutasi_keluar') {
        effectiveCategory = 'siswa_baru';
        setCategory('siswa_baru');
      }
      const combined = combineWorkbookStudentSheets(map);
      setHeaders(combined.headers);
      setRawRows(combined.rawRows);
      setColumnMapping(combined.autoMapping);

      if (effectiveCategory === 'pembaruan_data') {
        const nextUpdateCols: Record<string, boolean> = {};
        const protectedStatusFields = new Set([
          'nisn',
          'nis',
          'status',
          'tanggal_masuk',
          'tahun_masuk',
          'angkatan',
          'tahun_ajaran_masuk'
        ]);
        Object.values(combined.autoMapping).forEach(k => {
          if (k && !protectedStatusFields.has(String(k))) {
            nextUpdateCols[String(k)] = true;
          }
        });
        setSelectedUpdateCols(nextUpdateCols);
      }

      const nextConfirmedRows: Record<number, boolean> = {};
      combined.rawRows.forEach((_, idx) => {
        nextConfirmedRows[idx + 2] = true;
      });
      setConfirmedUpdateRows(nextConfirmedRows);
      return;
    }

    const lowerSheet = targetSheet.toLowerCase();
    if (lowerSheet.includes('mutasi') && lowerSheet.includes('masuk')) {
      effectiveCategory = 'mutasi_masuk';
      setCategory('mutasi_masuk');
    } else if (lowerSheet.includes('mutasi') && lowerSheet.includes('keluar')) {
      effectiveCategory = 'mutasi_keluar';
      setCategory('mutasi_keluar');
    } else if (/^masuk$/i.test(targetSheet.trim())) {
      effectiveCategory = 'mutasi_masuk';
      setCategory('mutasi_masuk');
    } else if (/^keluar$/i.test(targetSheet.trim())) {
      effectiveCategory = 'mutasi_keluar';
      setCategory('mutasi_keluar');
    }

    const sheetData = map[targetSheet];
    if (!sheetData) return;

    // Jika nama sheet mengandung informasi kelas (mis. "KELAS 7", "VII A", "7B"), otomatis sesuaikan defaultKelasAwal
    const inferredClass = inferClassFromSheetName(targetSheet, '');
    if (inferredClass) {
      setDefaultKelasAwal(inferredClass);
    }

    // Suntikkan fallback kelas dari nama sheet jika baris tidak memiliki nilai kelas
    const enrichedRows: Record<string, string>[] = sheetData.rawRows.map(
      (r: Record<string, string>) => {
        if (!inferredClass) return r;
        const hasClassValue = Object.entries(r).some(
          ([k, v]) =>
            (k.toLowerCase().includes('kelas') || k.toLowerCase().includes('rombel')) &&
            String(v || '').trim() !== ''
        );
        if (hasClassValue) return r;
        return {
          ...r,
          KELAS: r.KELAS || inferredClass
        };
      }
    );

    const nextMapping: Record<string, keyof Siswa | ''> = { ...sheetData.autoMapping };
    if (inferredClass && !Object.values(nextMapping).includes('rombel')) {
      nextMapping.KELAS = 'rombel';
    }
    const nextHeaders =
      inferredClass && !sheetData.headers.includes('KELAS')
        ? ['KELAS', ...sheetData.headers]
        : sheetData.headers;

    setHeaders(nextHeaders);
    setRawRows(enrichedRows);
    setColumnMapping(nextMapping);

    if (effectiveCategory === 'pembaruan_data') {
      const nextUpdateCols: Record<string, boolean> = {};
      const protectedStatusFields = new Set([
        'nisn',
        'nis',
        'status',
        'tanggal_masuk',
        'tahun_masuk',
        'angkatan',
        'tahun_ajaran_masuk'
      ]);
      Object.values(nextMapping).forEach(k => {
        if (k && !protectedStatusFields.has(String(k))) {
          nextUpdateCols[String(k)] = true;
        }
      });
      setSelectedUpdateCols(nextUpdateCols);
    }

    const nextConfirmedRows: Record<number, boolean> = {};
    enrichedRows.forEach((_: Record<string, string>, idx: number) => {
      nextConfirmedRows[idx + 2] = true;
    });
    setConfirmedUpdateRows(nextConfirmedRows);
  };

  const handleReset = () => {
    setFileName('');
    setSheetNames([]);
    setSheetsMap({});
    setSelectedSheetName('');
    setHeaders([]);
    setRawRows([]);
    setColumnMapping({});
    setSelectedUpdateCols({});
    setConfirmedUpdateRows({});
    setLastCommitErrors([]);
    setCommitProgress(null);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setFileName(file.name);
      const res = await readExcelFile(file);
      const names = res.sheetNames || [];
      const map = res.sheetsMap || {};
      setSheetNames(names);
      setSheetsMap(map);

      // Pilih sheet terbaik sesuai kategori yang aktif
      let chosenSheet = names[0] || '';
      if (category === 'mutasi_masuk') {
        const masukSheet = names.find(n => n.toLowerCase().includes('masuk'));
        if (masukSheet) chosenSheet = masukSheet;
      } else if (category === 'mutasi_keluar') {
        const keluarSheet = names.find(n => n.toLowerCase().includes('keluar'));
        if (keluarSheet) chosenSheet = keluarSheet;
      } else if (category === 'siswa_baru' || category === 'pembaruan_data') {
        // Jika ada lebih dari 1 sheet biodata siswa (misal KELAS 7, KELAS 8, KELAS 9), gabungkan otomatis
        const studentSheets = names.filter(
          n => !/mutasi|masuk|keluar|rekap/i.test(n) && (map[n]?.rawRows.length || 0) > 0
        );
        if (studentSheets.length > 1) {
          chosenSheet = ALL_SHEETS_COMBINED_KEY;
        } else if (studentSheets.length === 1) {
          chosenSheet = studentSheets[0];
        }
      }

      if (chosenSheet) {
        applySheetSelection(chosenSheet, map, category);
      } else {
        setHeaders(res.headers);
        setRawRows(res.rawRows);
        setColumnMapping(res.autoMapping);
      }
    } catch (err: unknown) {
      notifyError(
        'Gagal Membaca File',
        err instanceof Error ? err.message : 'Pastikan format file adalah .xlsx, .xls, atau .csv.'
      );
    }
  };

  // Hasil validasi Mode A (Siswa Baru / Buku Induk) & Mode D (Pembaruan Data)
  const parsedStudentRows: (ParsedStudentRow & {
    statusCategory: 'valid' | 'duplicate' | 'needs_review' | 'failed';
    matchedExisting?: Siswa;
    diffs?: { key: keyof Siswa; label: string; oldVal: string; newVal: string }[];
  })[] = useMemo(() => {
    if (
      (category !== 'siswa_baru' && category !== 'pembaruan_data') ||
      rawRows.length === 0
    ) {
      return [];
    }

    const byNisn = new Map<string, Siswa>();
    const byNis = new Map<string, Siswa>();
    const byNameAndClass = new Map<string, Siswa>();
    existingStudents.forEach(s => {
      if (s.nisn) byNisn.set(s.nisn.trim(), s);
      if (s.nis) byNis.set(s.nis.trim(), s);
      const normName = normalizeStudentIdentityName(s.nama_lengkap);
      const normRombel = String(s.rombel || '').trim().toUpperCase();
      if (normName && normRombel) {
        byNameAndClass.set(`${normName}__${normRombel}`, s);
      }
    });

    const effectiveImportMode =
      category === 'siswa_baru'
        ? upsertExistingOnSiswaBaru
          ? 'upsert'
          : 'insert_only'
        : 'upsert';

    const baseRows = validateAndMapExcelRows({
      rawRows,
      columnMapping,
      existingStudents,
      importMode: effectiveImportMode,
      defaultKelas: defaultKelasAwal
    });

    return baseRows.map(r => {
      const nisn = (r.data.nisn || '').trim();
      const nis = (r.data.nis || '').trim();
      const candByNisn = nisn ? byNisn.get(nisn) : undefined;
      const candByNis = nis ? byNis.get(nis) : undefined;

      // Mode A: Siswa Baru / Buku Induk (Kelas 7, 8, 9)
      if (category === 'siswa_baru') {
        const normKelas = normalizeKelasValue(r.data.rombel, defaultKelasAwal);
        r.data.rombel = normKelas.rombel;
        r.data.tingkat_kelas = normKelas.tingkat;
        r.data.angkatan = r.data.angkatan || angkatan;
        r.data.tahun_masuk = r.data.tahun_masuk || angkatan;
        r.data.tahun_ajaran_masuk = r.data.tahun_ajaran_masuk || tahunPelajaran;

        const sameByNisn =
          candByNisn && isSameStudentIdentity(candByNisn.nama_lengkap, r.data.nama_lengkap)
            ? candByNisn
            : undefined;
        const sameByNis =
          candByNis && isSameStudentIdentity(candByNis.nama_lengkap, r.data.nama_lengkap)
            ? candByNis
            : undefined;
        const sameByNameClass = byNameAndClass.get(
          `${normalizeStudentIdentityName(r.data.nama_lengkap)}__${normKelas.rombel.toUpperCase()}`
        );
        const safeMatched = sameByNisn || sameByNis || sameByNameClass;

        const isDup = r.errors.some(
          err =>
            err.toLowerCase().includes('sudah terdaftar') ||
            err.toLowerCase().includes('duplikat')
        );
        const statusCategory =
          r.errors.length === 0 ? 'valid' : isDup ? 'duplicate' : 'failed';
        return { ...r, statusCategory, matchedExisting: safeMatched };
      }

      const normKelas = normalizeKelasValue(r.data.rombel, defaultKelasAwal);
      const sameByNisn =
        candByNisn && isSameStudentIdentity(candByNisn.nama_lengkap, r.data.nama_lengkap)
          ? candByNisn
          : undefined;
      const sameByNis =
        candByNis && isSameStudentIdentity(candByNis.nama_lengkap, r.data.nama_lengkap)
          ? candByNis
          : undefined;
      const sameByNameClass = byNameAndClass.get(
        `${normalizeStudentIdentityName(r.data.nama_lengkap)}__${normKelas.rombel.toUpperCase()}`
      );
      const matched = sameByNisn || sameByNis || sameByNameClass || candByNisn || candByNis;

      // Mode D: Pembaruan Data berdasarkan NISN / NIS / Nama + Kelas
      if (!nisn && !nis && !r.data.nama_lengkap) {
        return {
          ...r,
          isValid: false,
          errors: ['NISN, NIS, atau Nama Lengkap Siswa wajib ada sebagai kunci pencocokan'],
          statusCategory: 'failed'
        };
      }
      if (!matched) {
        return {
          ...r,
          isValid: false,
          errors: [
            `Siswa (${r.data.nama_lengkap || nisn || nis}) belum terdaftar di database (gunakan mode Import Siswa Baru)`
          ],
          statusCategory: 'failed'
        };
      }

      const diffs: { key: keyof Siswa; label: string; oldVal: string; newVal: string }[] = [];
      ALL_59_STUDENT_FIELDS.forEach(f => {
        if (f.key === 'nisn') return;
        if (!selectedUpdateCols[f.key]) return;
        const newVal = String(r.data[f.key] ?? '').trim();
        const oldVal = String(matched[f.key] ?? '').trim();
        if (newVal !== '' && newVal !== oldVal) {
          diffs.push({
            key: f.key,
            label: f.label,
            oldVal: oldVal || '(Kosong)',
            newVal
          });
        }
      });

      const statusCategory = diffs.length > 0 ? 'needs_review' : 'valid';
      return {
        ...r,
        isValid: true,
        errors: [],
        statusCategory,
        matchedExisting: matched,
        diffs
      };
    });
  }, [
    category,
    rawRows,
    columnMapping,
    existingStudents,
    defaultKelasAwal,
    angkatan,
    tahunPelajaran,
    selectedUpdateCols,
    upsertExistingOnSiswaBaru
  ]);

  // Hasil validasi Mode B & C (Mutasi Masuk & Mutasi Keluar)
  const parsedMutationRows: ParsedMutationImportRow[] = useMemo(() => {
    if (
      (category !== 'mutasi_masuk' && category !== 'mutasi_keluar') ||
      rawRows.length === 0
    ) {
      return [];
    }
    return validateAndMapMutationRows({
      rawRows,
      jenis: category === 'mutasi_masuk' ? 'masuk' : 'keluar',
      defaultTahunAjaran: tahunPelajaran,
      defaultKelas: defaultKelasAwal,
      existingStudents,
      existingMutations
    });
  }, [
    category,
    rawRows,
    tahunPelajaran,
    defaultKelasAwal,
    existingStudents,
    existingMutations
  ]);

  // Hasil validasi Mode E (Riwayat Kelas)
  const parsedHistoryRows: ParsedClassHistoryImportRow[] = useMemo(() => {
    if (category !== 'riwayat_kelas' || rawRows.length === 0) return [];
    return validateAndMapClassHistoryRows({
      rawRows,
      defaultTahunAjaran: tahunPelajaran,
      existingStudents,
      existingHistory
    });
  }, [category, rawRows, tahunPelajaran, existingStudents, existingHistory]);

  // Ringkasan Statistik Validasi
  const validationCounts = useMemo(() => {
    if (category === 'riwayat_kelas') {
      return {
        total: parsedHistoryRows.length,
        valid: parsedHistoryRows.filter(r => r.validationStatus === 'valid').length,
        duplicate: parsedHistoryRows.filter(r => r.validationStatus === 'duplicate').length,
        review: 0,
        failed: parsedHistoryRows.filter(r => r.validationStatus === 'failed').length
      };
    }
    if (category === 'mutasi_masuk' || category === 'mutasi_keluar') {
      return {
        total: parsedMutationRows.length,
        valid: parsedMutationRows.filter(r => r.validationStatus === 'valid').length,
        duplicate: parsedMutationRows.filter(r => r.validationStatus === 'duplicate').length,
        review: 0,
        failed: parsedMutationRows.filter(r => r.validationStatus === 'failed').length
      };
    }
    return {
      total: parsedStudentRows.length,
      valid: parsedStudentRows.filter(r => r.statusCategory === 'valid').length,
      duplicate: parsedStudentRows.filter(r => r.statusCategory === 'duplicate').length,
      review: parsedStudentRows.filter(r => r.statusCategory === 'needs_review').length,
      failed: parsedStudentRows.filter(r => r.statusCategory === 'failed').length
    };
  }, [category, parsedStudentRows, parsedHistoryRows, parsedMutationRows]);

  // Ringkasan per tingkat kelas untuk memastikan Kelas 7, 8, 9 terdeteksi jelas
  const classBreakdown = useMemo(() => {
    if (category !== 'siswa_baru') return null;
    let k7 = 0;
    let k8 = 0;
    let k9 = 0;
    parsedStudentRows.forEach(r => {
      if (r.statusCategory === 'valid') {
        if (r.data.tingkat_kelas === '7') k7++;
        else if (r.data.tingkat_kelas === '8') k8++;
        else if (r.data.tingkat_kelas === '9') k9++;
      }
    });
    return { k7, k8, k9 };
  }, [category, parsedStudentRows]);

  const handleDownloadErrors = () => {
    if (lastCommitErrors.length > 0) {
      downloadFailedRowsReport(lastCommitErrors);
      return;
    }

    if (category === 'riwayat_kelas') {
      const errs = parsedHistoryRows
        .filter(r => r.validationStatus !== 'valid')
        .map(r => ({
          row: r.rowNumber,
          nis: r.nis,
          nisn: r.nisn,
          nama: r.nama_siswa,
          errors: r.errors
        }));
      downloadFailedRowsReport(errs);
      return;
    }

    if (category === 'mutasi_masuk' || category === 'mutasi_keluar') {
      const errs = parsedMutationRows
        .filter(r => r.validationStatus !== 'valid')
        .map(r => ({
          row: r.rowNumber,
          nis: r.nis,
          nisn: r.nisn,
          nama: r.nama_siswa,
          errors: r.errors
        }));
      downloadFailedRowsReport(errs);
      return;
    }

    const errs = parsedStudentRows
      .filter(r => !r.isValid)
      .map(r => ({
        row: r.rowNumber,
        nis: r.data.nis,
        nisn: r.data.nisn,
        nama: r.data.nama_lengkap,
        errors: r.errors
      }));
    downloadFailedRowsReport(errs);
  };

  const handleCommitImport = async () => {
    setCommitting(true);
    setLastCommitErrors([]);
    const actor = {
      id: adminUser?.id || 'admin',
      name: adminUser?.nama_lengkap || 'Admin Sekolah',
      role: role || 'admin'
    };

    try {
      let successCount = 0;
      let failedCount = 0;
      let duplicateCount = 0;
      let reviewCount = 0;
      const errorDetails: ImportBatchRecord['error_details'] = [];
      const batchRowsPayload: Omit<ImportBatchRowRecord, 'id' | 'batch_id' | 'created_at'>[] = [];

      // Pastikan daftar siswa existing sudah sinkron jika state awal kosong
      let currentExisting = existingStudents;
      if (currentExisting.length === 0) {
        currentExisting = await getSiswaList().catch(() => []);
        if (currentExisting.length > 0) {
          setExistingStudents(currentExisting);
        }
      }

      const latestByNisn = new Map<string, Siswa>();
      const latestByNis = new Map<string, Siswa>();
      const latestByNameAndClass = new Map<string, Siswa>();
      currentExisting.forEach(s => {
        if (s.nisn && s.nisn.trim()) latestByNisn.set(s.nisn.trim(), s);
        if (s.nis && s.nis.trim()) latestByNis.set(s.nis.trim(), s);
        const normName = normalizeStudentIdentityName(s.nama_lengkap);
        const normRombel = String(s.rombel || '').trim().toUpperCase();
        if (normName && normRombel) {
          latestByNameAndClass.set(`${normName}__${normRombel}`, s);
        }
      });

      if (category === 'siswa_baru') {
        const validRows: typeof parsedStudentRows = [];
        for (const row of parsedStudentRows) {
          if (row.statusCategory !== 'valid') {
            if (row.statusCategory === 'duplicate') duplicateCount++;
            else failedCount++;

            errorDetails.push({
              row: row.rowNumber,
              nis: row.data.nis,
              nisn: row.data.nisn,
              nama: row.data.nama_lengkap,
              errors: row.errors
            });
            batchRowsPayload.push({
              row_number: row.rowNumber,
              nis: row.data.nis,
              nisn: row.data.nisn,
              nama_siswa: row.data.nama_lengkap,
              validation_status: row.statusCategory,
              action_taken: 'skipped',
              error_messages: row.errors
            });
          } else {
            validRows.push(row);
          }
        }

        setCommitProgress({ current: 0, total: validRows.length });
        const CONCURRENCY = 10;

        for (let i = 0; i < validRows.length; i += CONCURRENCY) {
          const chunk = validRows.slice(i, i + CONCURRENCY);
          await Promise.all(
            chunk.map(async row => {
              try {
                const normKelas = normalizeKelasValue(row.data.rombel, defaultKelasAwal);
                const cleanNisn = (row.data.nisn || '').trim();
                const cleanNis = (row.data.nis || '').trim();
                const candByNisn = cleanNisn ? latestByNisn.get(cleanNisn) : undefined;
                const candByNis = cleanNis ? latestByNis.get(cleanNis) : undefined;

                // Hanya cocokkan ke siswa existing jika nama siswa merujuk pada orang yang sama
                const sameByNisn =
                  candByNisn && isSameStudentIdentity(candByNisn.nama_lengkap, row.data.nama_lengkap)
                    ? candByNisn
                    : undefined;
                const sameByNis =
                  candByNis && isSameStudentIdentity(candByNis.nama_lengkap, row.data.nama_lengkap)
                    ? candByNis
                    : undefined;
                const sameByNameClass = latestByNameAndClass.get(
                  `${normalizeStudentIdentityName(row.data.nama_lengkap)}__${normKelas.rombel.toUpperCase()}`
                );

                // Jika NISN atau NIS di Excel ternyata milik siswa LAIN yang berbeda nama, kosongkan yang bentrok agar tidak menimpa siswa lain
                const sanitizedRowData = { ...row.data };
                if (candByNisn && !sameByNisn) {
                  sanitizedRowData.nisn = '';
                }
                if (candByNis && !sameByNis) {
                  sanitizedRowData.nis = '';
                }

                const matched =
                  (row.matchedExisting &&
                  isSameStudentIdentity(row.matchedExisting.nama_lengkap, row.data.nama_lengkap)
                    ? row.matchedExisting
                    : undefined) ||
                  sameByNisn ||
                  sameByNis ||
                  sameByNameClass;

                let savedStudent: Siswa;
                let actionType: 'inserted' | 'updated' = 'inserted';

                if (matched && upsertExistingOnSiswaBaru) {
                  const preserveMutatedStatus =
                    ['mutasi_keluar', 'mutasi_masuk', 'lulus', 'non_aktif'].includes(matched.status) &&
                    (!sanitizedRowData.status || sanitizedRowData.status === 'aktif');

                  savedStudent = await updateSiswa(
                    matched.id,
                    {
                      ...sanitizedRowData,
                      rombel: normKelas.rombel,
                      tingkat_kelas: normKelas.tingkat,
                      status: preserveMutatedStatus
                        ? matched.status
                        : sanitizedRowData.status || matched.status,
                      tanggal_masuk:
                        preserveMutatedStatus &&
                        matched.tanggal_masuk &&
                        matched.tanggal_masuk !== '2026-11-08'
                          ? matched.tanggal_masuk
                          : sanitizedRowData.tanggal_masuk || matched.tanggal_masuk
                    },
                    actor,
                    {
                      skipValidationQuery: true,
                      skipAuditLog: true,
                      ignoreSecondaryKeyConflict: true
                    }
                  );
                  actionType = 'updated';
                } else {
                  savedStudent = await createSiswa(
                    {
                      ...sanitizedRowData,
                      rombel: normKelas.rombel,
                      tingkat_kelas: normKelas.tingkat,
                      angkatan: sanitizedRowData.angkatan || angkatan,
                      tahun_masuk: sanitizedRowData.tahun_masuk || angkatan,
                      tahun_ajaran_masuk: sanitizedRowData.tahun_ajaran_masuk || tahunPelajaran,
                      status: sanitizedRowData.status || 'aktif'
                    } as Omit<Siswa, 'id' | 'created_at' | 'updated_at'>,
                    actor,
                    undefined,
                    {
                      upsertOnConflict: upsertExistingOnSiswaBaru,
                      skipValidationQuery: upsertExistingOnSiswaBaru,
                      skipAuditLog: true
                    }
                  );
                }

                successCount++;
                batchRowsPayload.push({
                  row_number: row.rowNumber,
                  student_id: savedStudent.id,
                  nis: savedStudent.nis,
                  nisn: savedStudent.nisn,
                  nama_siswa: savedStudent.nama_lengkap,
                  validation_status: 'valid',
                  action_taken: actionType,
                  error_messages: [],
                  raw_payload: row.data as Record<string, unknown>
                });
              } catch (err: unknown) {
                failedCount++;
                const msg = err instanceof Error ? err.message : 'Gagal menyimpan baris';
                errorDetails.push({
                  row: row.rowNumber,
                  nis: row.data.nis,
                  nisn: row.data.nisn,
                  nama: row.data.nama_lengkap,
                  errors: [msg]
                });
                batchRowsPayload.push({
                  row_number: row.rowNumber,
                  nis: row.data.nis,
                  nisn: row.data.nisn,
                  nama_siswa: row.data.nama_lengkap,
                  validation_status: 'failed',
                  action_taken: 'failed',
                  error_messages: [msg],
                  raw_payload: row.data as Record<string, unknown>
                });
              }
            })
          );
          setCommitProgress({
            current: Math.min(i + chunk.length, validRows.length),
            total: validRows.length
          });
        }

        // Jika pengguna memilih Gabungkan Semua Sheet dan di workbook terdapat sheet MUTASI MASUK / MUTASI KELUAR,
        // sinkronkan juga riwayat Tanggal Pindah dari sheet mutasi tersebut secara otomatis!
        if (selectedSheetName === ALL_SHEETS_COMBINED_KEY && sheetNames.length > 1) {
          const freshStudents = await getSiswaList().catch(() => currentExisting);
          const mutSheetEntries = sheetNames.filter(n => /mutasi|masuk|keluar|pindah/i.test(n));
          for (const mSheetName of mutSheetEntries) {
            const mSheetData = sheetsMap[mSheetName];
            if (!mSheetData || mSheetData.rawRows.length === 0) continue;
            const lowerM = mSheetName.toLowerCase();
            const jenisMut: 'masuk' | 'keluar' | null = lowerM.includes('masuk')
              ? 'masuk'
              : lowerM.includes('keluar') || lowerM.includes('pindah')
              ? 'keluar'
              : null;
            if (!jenisMut) continue;

            const autoMutRows = validateAndMapMutationRows({
              rawRows: mSheetData.rawRows,
              jenis: jenisMut,
              defaultTahunAjaran: tahunPelajaran,
              defaultKelas: defaultKelasAwal,
              existingStudents: freshStudents,
              existingMutations
            }).filter(r => r.validationStatus === 'valid');

            const MUT_CONC = 5;
            for (let j = 0; j < autoMutRows.length; j += MUT_CONC) {
              const mChunk = autoMutRows.slice(j, j + MUT_CONC);
              await Promise.all(
                mChunk.map(async mRow => {
                  try {
                    await importMutationFromExcelRow(mRow, actor);
                  } catch {
                    // Non-fatal auto-sync
                  }
                })
              );
            }
          }
        }
      } else if (category === 'mutasi_masuk' || category === 'mutasi_keluar') {
        const validMutRows: typeof parsedMutationRows = [];
        for (const row of parsedMutationRows) {
          if (row.validationStatus !== 'valid') {
            if (row.validationStatus === 'duplicate') duplicateCount++;
            else failedCount++;

            errorDetails.push({
              row: row.rowNumber,
              nis: row.nis,
              nisn: row.nisn,
              nama: row.nama_siswa,
              errors: row.errors
            });
            batchRowsPayload.push({
              row_number: row.rowNumber,
              nis: row.nis,
              nisn: row.nisn,
              nama_siswa: row.nama_siswa,
              validation_status: row.validationStatus,
              action_taken: 'skipped',
              error_messages: row.errors,
              raw_payload: {
                tanggal_pindah: row.tanggal_pindah,
                jenis: row.jenis,
                kelas: row.kelas,
                tahun_ajaran: row.tahun_ajaran,
                alasan_pindah: row.alasan_pindah,
                sekolah_asal: row.sekolah_asal,
                sekolah_tujuan: row.sekolah_tujuan
              }
            });
          } else {
            validMutRows.push(row);
          }
        }

        setCommitProgress({ current: 0, total: validMutRows.length });
        const CONCURRENCY = 5;

        for (let i = 0; i < validMutRows.length; i += CONCURRENCY) {
          const chunk = validMutRows.slice(i, i + CONCURRENCY);
          await Promise.all(
            chunk.map(async row => {
              try {
                const res = await importMutationFromExcelRow(row, actor);
                successCount++;
                batchRowsPayload.push({
                  row_number: row.rowNumber,
                  student_id: res.studentId,
                  nis: row.nis,
                  nisn: row.nisn,
                  nama_siswa: row.nama_siswa,
                  validation_status: 'valid',
                  action_taken: 'inserted',
                  error_messages: [],
                  raw_payload: {
                    tanggal_pindah: row.tanggal_pindah,
                    jenis: row.jenis,
                    kelas: row.kelas,
                    tahun_ajaran: row.tahun_ajaran,
                    alasan_pindah: row.alasan_pindah,
                    sekolah_asal: row.sekolah_asal,
                    sekolah_tujuan: row.sekolah_tujuan
                  }
                });
              } catch (err: unknown) {
                failedCount++;
                const msg = err instanceof Error ? err.message : 'Gagal menyimpan transaksi mutasi';
                errorDetails.push({
                  row: row.rowNumber,
                  nis: row.nis,
                  nisn: row.nisn,
                  nama: row.nama_siswa,
                  errors: [msg]
                });
                batchRowsPayload.push({
                  row_number: row.rowNumber,
                  nis: row.nis,
                  nisn: row.nisn,
                  nama_siswa: row.nama_siswa,
                  validation_status: 'failed',
                  action_taken: 'failed',
                  error_messages: [msg],
                  raw_payload: {
                    tanggal_pindah: row.tanggal_pindah,
                    jenis: row.jenis,
                    kelas: row.kelas,
                    tahun_ajaran: row.tahun_ajaran
                  }
                });
              }
            })
          );
          setCommitProgress({
            current: Math.min(i + chunk.length, validMutRows.length),
            total: validMutRows.length
          });
        }
      } else if (category === 'pembaruan_data') {
        const rowsToProcess = parsedStudentRows;
        setCommitProgress({ current: 0, total: rowsToProcess.length });
        const CONCURRENCY = 10;

        for (let i = 0; i < rowsToProcess.length; i += CONCURRENCY) {
          const chunk = rowsToProcess.slice(i, i + CONCURRENCY);
          await Promise.all(
            chunk.map(async row => {
              const cleanNisn = (row.data.nisn || '').trim();
              const cleanNis = (row.data.nis || '').trim();
              const normKelas = normalizeKelasValue(row.data.rombel, defaultKelasAwal);
              const matched =
                row.matchedExisting ||
                (cleanNisn ? latestByNisn.get(cleanNisn) : undefined) ||
                (cleanNis ? latestByNis.get(cleanNis) : undefined) ||
                latestByNameAndClass.get(
                  `${normalizeStudentIdentityName(row.data.nama_lengkap)}__${normKelas.rombel.toUpperCase()}`
                );

              if (!row.isValid || !matched) {
                failedCount++;
                errorDetails.push({
                  row: row.rowNumber,
                  nis: row.data.nis,
                  nisn: row.data.nisn,
                  nama: row.data.nama_lengkap,
                  errors: row.errors.length > 0 ? row.errors : ['Siswa tidak ditemukan di database']
                });
                batchRowsPayload.push({
                  row_number: row.rowNumber,
                  nis: row.data.nis,
                  nisn: row.data.nisn,
                  nama_siswa: row.data.nama_lengkap,
                  validation_status: 'failed',
                  action_taken: 'skipped',
                  error_messages: row.errors
                });
                return;
              }

              if (!confirmedUpdateRows[row.rowNumber] || !row.diffs || row.diffs.length === 0) {
                batchRowsPayload.push({
                  row_number: row.rowNumber,
                  student_id: matched.id,
                  nis: matched.nis,
                  nisn: matched.nisn,
                  nama_siswa: matched.nama_lengkap,
                  validation_status: 'valid',
                  action_taken: 'skipped',
                  error_messages: []
                });
                return;
              }

              const patch: Partial<Siswa> = {};
              const diffObj: Record<string, { old_value: string; new_value: string }> = {};
              row.diffs.forEach(d => {
                (patch as Record<string, unknown>)[d.key] = d.newVal;
                diffObj[d.key] = { old_value: d.oldVal, new_value: d.newVal };
              });

              try {
                await updateSiswa(matched.id, patch, actor, {
                  skipValidationQuery: true,
                  skipAuditLog: true,
                  ignoreSecondaryKeyConflict: true
                });
                successCount++;
                reviewCount++;
                batchRowsPayload.push({
                  row_number: row.rowNumber,
                  student_id: matched.id,
                  nis: matched.nis,
                  nisn: matched.nisn,
                  nama_siswa: matched.nama_lengkap,
                  validation_status: 'needs_review',
                  action_taken: 'updated',
                  error_messages: [],
                  diff_payload: diffObj
                });
              } catch (err: unknown) {
                failedCount++;
                const msg = err instanceof Error ? err.message : 'Gagal memperbarui data siswa';
                errorDetails.push({
                  row: row.rowNumber,
                  nis: matched.nis,
                  nisn: matched.nisn,
                  nama: matched.nama_lengkap,
                  errors: [msg]
                });
                batchRowsPayload.push({
                  row_number: row.rowNumber,
                  student_id: matched.id,
                  nis: matched.nis,
                  nisn: matched.nisn,
                  nama_siswa: matched.nama_lengkap,
                  validation_status: 'failed',
                  action_taken: 'failed',
                  error_messages: [msg]
                });
              }
            })
          );
          setCommitProgress({
            current: Math.min(i + chunk.length, rowsToProcess.length),
            total: rowsToProcess.length
          });
        }
      } else {
        // Mode E: Import Riwayat Kelas
        setCommitProgress({ current: 0, total: parsedHistoryRows.length });
        let processed = 0;
        for (const row of parsedHistoryRows) {
          processed++;
          setCommitProgress({ current: processed, total: parsedHistoryRows.length });
          if (row.validationStatus !== 'valid' || !row.student) {
            if (row.validationStatus === 'duplicate') duplicateCount++;
            else failedCount++;

            errorDetails.push({
              row: row.rowNumber,
              nis: row.nis,
              nisn: row.nisn,
              nama: row.nama_siswa,
              errors: row.errors
            });
            batchRowsPayload.push({
              row_number: row.rowNumber,
              nis: row.nis,
              nisn: row.nisn,
              nama_siswa: row.nama_siswa,
              validation_status: row.validationStatus,
              action_taken: 'skipped',
              error_messages: row.errors
            });
            continue;
          }

          try {
            const res = await saveClassHistoryPlacement(
              {
                student_id: row.student.id,
                tahun_ajaran: row.tahun_ajaran,
                semester: row.semester,
                kelas: row.kelas,
                kamar: row.kamar,
                status_riwayat: row.status_riwayat,
                tanggal_mulai: row.tanggal_mulai,
                catatan: row.catatan
              },
              actor
            );

            if (res.status === 'inserted') {
              successCount++;
              batchRowsPayload.push({
                row_number: row.rowNumber,
                student_id: row.student.id,
                nis: row.nis,
                nisn: row.nisn,
                nama_siswa: row.nama_siswa,
                validation_status: 'valid',
                action_taken: 'history_added',
                error_messages: []
              });
            } else {
              duplicateCount++;
              batchRowsPayload.push({
                row_number: row.rowNumber,
                student_id: row.student.id,
                nis: row.nis,
                nisn: row.nisn,
                nama_siswa: row.nama_siswa,
                validation_status: 'duplicate',
                action_taken: 'skipped',
                error_messages: ['Riwayat kelas sudah ada']
              });
            }
          } catch (err: unknown) {
            failedCount++;
            const msg = err instanceof Error ? err.message : 'Gagal menyimpan riwayat kelas';
            errorDetails.push({
              row: row.rowNumber,
              nis: row.nis,
              nisn: row.nisn,
              nama: row.nama_siswa,
              errors: [msg]
            });
            batchRowsPayload.push({
              row_number: row.rowNumber,
              student_id: row.student.id,
              nis: row.nis,
              nisn: row.nisn,
              nama_siswa: row.nama_siswa,
              validation_status: 'failed',
              action_taken: 'failed',
              error_messages: [msg]
            });
          }
        }
      }

      try {
        await recordImportBatchWithRows(
          {
            file_name: fileName || 'Import_SIPDS.xlsx',
            import_mode:
              category === 'siswa_baru' && !upsertExistingOnSiswaBaru ? 'insert_only' : 'upsert',
            import_category: category,
            tahun_ajaran: tahunPelajaran,
            angkatan: category === 'siswa_baru' ? angkatan : undefined,
            total_rows: validationCounts.total,
            success_rows: successCount,
            failed_rows: failedCount,
            duplicate_rows: duplicateCount,
            review_rows: reviewCount,
            status:
              failedCount === 0
                ? 'completed'
                : successCount > 0
                ? 'partial'
                : 'failed',
            error_details: errorDetails,
            completed_at: new Date().toISOString()
          },
          batchRowsPayload,
          actor
        );
      } catch {
        // Non-fatal: pencatatan batch tidak boleh menggagalkan hasil import utama
      }

      await loadMaster();

      if (successCount === 0 && failedCount > 0) {
        setLastCommitErrors(errorDetails);
        const firstErr = errorDetails[0]?.errors?.[0] || 'Gagal menulis ke database.';
        notifyError(
          'Proses Import Gagal',
          `${failedCount} baris gagal disimpan. Penyebab: ${firstErr}`
        );
        return;
      }

      success(
        'Proses Import Selesai',
        `${successCount} data berhasil disimpan, ${duplicateCount} duplikat dicegah, ${failedCount} gagal.${
          failedCount > 0 && errorDetails[0]?.errors?.[0]
            ? ` (Catatan: ${errorDetails[0].errors[0]})`
            : ''
        }`
      );
      handleReset();
      if (successCount > 0) {
        onImportComplete?.();
      }
    } catch (err: unknown) {
      notifyError(
        'Gagal Menyimpan Import',
        err instanceof Error ? err.message : 'Terjadi kesalahan.'
      );
    } finally {
      setCommitting(false);
      setCommitProgress(null);
    }
  };

  const batchColumns: Column<ImportBatchRecord>[] = [
    {
      header: 'Waktu Import',
      render: b => (
        <span className="font-mono text-xs text-slate-600">
          {new Date(b.created_at).toLocaleString('id-ID')}
        </span>
      ),
      className: 'w-44 whitespace-nowrap'
    },
    {
      header: 'Nama Berkas',
      render: b => <span className="font-bold text-[#101D35] text-xs">{b.file_name}</span>
    },
    {
      header: 'Kategori',
      render: b => (
        <span className="px-2.5 py-0.5 rounded-lg bg-[#315FEA]/10 text-[#315FEA] uppercase font-mono text-[11px] font-bold">
          {b.import_category || b.import_mode || 'siswa_baru'}
        </span>
      ),
      className: 'w-36'
    },
    {
      header: 'Total Baris',
      render: b => <span className="font-mono font-bold text-[#101D35]">{b.total_rows}</span>,
      className: 'w-24'
    },
    {
      header: 'Berhasil',
      render: b => (
        <span className="font-mono text-emerald-700 font-bold">{b.success_rows}</span>
      ),
      className: 'w-24'
    },
    {
      header: 'Duplikat',
      render: b => (
        <span className="font-mono text-amber-700 font-bold">{b.duplicate_rows || 0}</span>
      ),
      className: 'w-24'
    },
    {
      header: 'Gagal',
      render: b => <span className="font-mono text-rose-700 font-bold">{b.failed_rows}</span>,
      className: 'w-24'
    },
    {
      header: 'Status',
      render: b => <StatusBadge status={b.status} />,
      className: 'w-28'
    }
  ];

  return (
    <div className="space-y-6">
      <PageTitle
        category="Akademik & Buku Induk"
        title="Import Siswa (Kelas 7, 8, 9), Mutasi Masuk, Mutasi Keluar, & Riwayat Kelas"
        subtitle="Mendukung workbook multi-sheet (Kelas 7, 8, 9, Mutasi Masuk, Mutasi Keluar), normalisasi otomatis format kelas (7 / VII A → 7A), serta mengizinkan siswa baru Kelas 7 yang belum memiliki NIS/NISN."
        icon={UploadCloud}
        actions={
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {category === 'riwayat_kelas' ? (
              <button
                type="button"
                onClick={() => downloadClassHistoryTemplateExcel('xlsx')}
                className="px-4 py-2 rounded-xl bg-[#101D35] hover:bg-[#182B4D] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Unduh Template Riwayat Kelas (.XLSX)</span>
              </button>
            ) : category === 'mutasi_masuk' ? (
              <button
                type="button"
                onClick={() => downloadMutationTemplateExcel('masuk', 'xlsx')}
                className="px-4 py-2 rounded-xl bg-[#10B981] hover:bg-emerald-600 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Unduh Template Mutasi Masuk (.XLSX)</span>
              </button>
            ) : category === 'mutasi_keluar' ? (
              <button
                type="button"
                onClick={() => downloadMutationTemplateExcel('keluar', 'xlsx')}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Unduh Template Mutasi Keluar (.XLSX)</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => downloadTemplateExcel('xlsx')}
                className="px-4 py-2 rounded-xl bg-[#315FEA] hover:bg-[#244CD2] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Unduh Template 59 Kolom (.XLSX)</span>
              </button>
            )}
          </div>
        }
      />

      {/* 5 Mode Selector & Dropzone Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-[0_1px_3px_rgba(16,29,53,0.05)] space-y-5">
        {/* 5 Pilihan Mode Import */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <button
            type="button"
            onClick={() => {
              setCategory('siswa_baru');
              if (sheetNames.length > 0) {
                const studentSheets = sheetNames.filter(
                  n => !/mutasi|masuk|keluar|rekap/i.test(n) && (sheetsMap[n]?.rawRows.length || 0) > 0
                );
                applySheetSelection(
                  studentSheets.length > 1 ? ALL_SHEETS_COMBINED_KEY : studentSheets[0] || sheetNames[0],
                  sheetsMap,
                  'siswa_baru'
                );
              }
            }}
            className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
              category === 'siswa_baru'
                ? 'bg-[#101D35] text-white border-[#101D35] shadow-sm'
                : 'bg-slate-50/70 text-[#101D35] border-slate-200 hover:border-[#315FEA]/50'
            }`}
          >
            <div className="flex items-center gap-2 font-bold text-xs">
              <UserPlus className="w-4 h-4 shrink-0" />
              <span>A. SISWA BARU / BUKU INDUK</span>
            </div>
            <p className="text-[11px] opacity-85 mt-1 leading-relaxed">
              Import data siswa Kelas 7, 8, &amp; 9 (mendukung siswa Kelas 7 tanpa NIS/NISN &amp; multi-sheet).
            </p>
          </button>

          <button
            type="button"
            onClick={() => {
              setCategory('mutasi_masuk');
              if (sheetNames.length > 0) {
                const masukSheet = sheetNames.find(n => n.toLowerCase().includes('masuk'));
                applySheetSelection(masukSheet || sheetNames[0], sheetsMap, 'mutasi_masuk');
              }
            }}
            className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
              category === 'mutasi_masuk'
                ? 'bg-[#10B981] text-white border-emerald-600 shadow-sm'
                : 'bg-slate-50/70 text-[#101D35] border-slate-200 hover:border-emerald-300'
            }`}
          >
            <div className="flex items-center gap-2 font-bold text-xs">
              <LogIn className="w-4 h-4 shrink-0" />
              <span>B. IMPORT MUTASI MASUK</span>
            </div>
            <p className="text-[11px] opacity-85 mt-1 leading-relaxed">
              Import daftar siswa pindahan masuk (Kelas, NIS, Nama, Tanggal Pindah, Sekolah Asal).
            </p>
          </button>

          <button
            type="button"
            onClick={() => {
              setCategory('mutasi_keluar');
              if (sheetNames.length > 0) {
                const keluarSheet = sheetNames.find(n => n.toLowerCase().includes('keluar'));
                applySheetSelection(keluarSheet || sheetNames[0], sheetsMap, 'mutasi_keluar');
              }
            }}
            className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
              category === 'mutasi_keluar'
                ? 'bg-amber-600 text-white border-amber-700 shadow-sm'
                : 'bg-slate-50/70 text-[#101D35] border-slate-200 hover:border-amber-300'
            }`}
          >
            <div className="flex items-center gap-2 font-bold text-xs">
              <LogOut className="w-4 h-4 shrink-0" />
              <span>C. IMPORT MUTASI KELUAR</span>
            </div>
            <p className="text-[11px] opacity-85 mt-1 leading-relaxed">
              Import daftar siswa mutasi keluar (Kelas, NIS, Nama, Tanggal Pindah, Alasan, Sekolah Tujuan).
            </p>
          </button>

          <button
            type="button"
            onClick={() => {
              setCategory('pembaruan_data');
              if (sheetNames.length > 0) {
                applySheetSelection(selectedSheetName || sheetNames[0], sheetsMap, 'pembaruan_data');
              }
            }}
            className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
              category === 'pembaruan_data'
                ? 'bg-[#315FEA] text-white border-[#315FEA] shadow-sm'
                : 'bg-slate-50/70 text-[#101D35] border-slate-200 hover:border-[#315FEA]/50'
            }`}
          >
            <div className="flex items-center gap-2 font-bold text-xs">
              <RefreshCw className="w-4 h-4 shrink-0" />
              <span>D. PEMBARUAN BIODATA</span>
            </div>
            <p className="text-[11px] opacity-85 mt-1 leading-relaxed">
              Perbarui biodata siswa terdaftar dengan pratinjau Data Lama vs Baru per kolom.
            </p>
          </button>

          <button
            type="button"
            onClick={() => {
              setCategory('riwayat_kelas');
              if (sheetNames.length > 0) {
                applySheetSelection(
                  selectedSheetName === ALL_SHEETS_COMBINED_KEY ? sheetNames[0] : selectedSheetName || sheetNames[0],
                  sheetsMap,
                  'riwayat_kelas'
                );
              }
            }}
            className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
              category === 'riwayat_kelas'
                ? 'bg-[#6366F1] text-white border-[#6366F1] shadow-sm'
                : 'bg-slate-50/70 text-[#101D35] border-slate-200 hover:border-[#6366F1]/50'
            }`}
          >
            <div className="flex items-center gap-2 font-bold text-xs">
              <BookOpen className="w-4 h-4 shrink-0" />
              <span>E. RIWAYAT KELAS</span>
            </div>
            <p className="text-[11px] opacity-85 mt-1 leading-relaxed">
              Import riwayat penempatan kelas siswa per Tahun Pelajaran secara historis.
            </p>
          </button>
        </div>

        {/* Parameter Tahun Pelajaran, Angkatan, & Kelas Default */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80">
          <div>
            <label className="block text-xs font-bold text-[#101D35] mb-1">
              Tahun Pelajaran Target *
            </label>
            <input
              type="text"
              value={tahunPelajaran}
              onChange={e => setTahunPelajaran(e.target.value)}
              placeholder="Contoh: 2025/2026"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono bg-white focus:outline-none focus:ring-2 focus:ring-[#315FEA]/20 focus:border-[#315FEA]"
            />
          </div>

          {(category === 'siswa_baru' ||
            category === 'mutasi_masuk' ||
            category === 'mutasi_keluar') && (
            <div>
              <label className="block text-xs font-bold text-[#101D35] mb-1">
                Kelas Default (Jika Kolom Kelas di Excel Kosong)
              </label>
              <select
                value={defaultKelasAwal}
                onChange={e => setDefaultKelasAwal(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-[#315FEA]/20 focus:border-[#315FEA]"
              >
                {CLASS_ROSTER.map(c => (
                  <option key={c} value={c}>
                    Kelas {c}
                  </option>
                ))}
              </select>
            </div>
          )}

          {category === 'siswa_baru' && (
            <>
              <div>
                <label className="block text-xs font-bold text-[#101D35] mb-1">
                  Tahun Angkatan Default *
                </label>
                <input
                  type="text"
                  value={angkatan}
                  onChange={e => setAngkatan(e.target.value)}
                  placeholder="Contoh: 2025"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono bg-white focus:outline-none focus:ring-2 focus:ring-[#315FEA]/20 focus:border-[#315FEA]"
                />
              </div>

              <div className="flex items-center pt-4">
                <label className="inline-flex items-start gap-2 cursor-pointer text-xs text-[#101D35]">
                  <input
                    type="checkbox"
                    checked={upsertExistingOnSiswaBaru}
                    onChange={e => setUpsertExistingOnSiswaBaru(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-[#315FEA] focus:ring-[#315FEA]"
                  />
                  <span>
                    <strong className="block">Sinkronisasi / Upsert Otomatis</strong>
                    <span className="text-[11px] text-slate-500">
                      Jika NIS/NISN sudah ada di DB, perbarui datanya tanpa menolak baris
                    </span>
                  </span>
                </label>
              </div>
            </>
          )}
        </div>

        {/* File Dropzone */}
        <label className="block border-2 border-dashed border-slate-300 hover:border-[#315FEA] rounded-2xl p-7 text-center cursor-pointer bg-slate-50/50 hover:bg-[#315FEA]/[0.02] transition-all">
          <div className="w-12 h-12 rounded-2xl bg-[#315FEA]/10 text-[#315FEA] flex items-center justify-center mx-auto mb-3">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <span className="text-xs font-bold text-[#101D35] block">
            {fileName
              ? `Berkas Terpilih: ${fileName}`
              : 'Klik untuk memilih berkas Excel (.XLSX, .XLS) atau .CSV'}
          </span>
          <span className="text-[11px] text-slate-500 block mt-1">
            Otomatis mendeteksi multi-sheet (Kelas 7, Kelas 8, Kelas 9, Mutasi Masuk, Mutasi Keluar) &amp; menjaga angka nol di depan (TEXT)
          </span>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileChange}
            className="hidden"
          />
        </label>

        {/* Pemilih Sheet apabila File Excel memiliki banyak Sheet/Tab */}
        {sheetNames.length > 1 && (
          <div className="p-4 rounded-2xl bg-[#315FEA]/5 border border-[#315FEA]/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Layers className="w-5 h-5 text-[#315FEA] shrink-0" />
              <div>
                <div className="text-xs font-bold text-[#101D35]">
                  Terdeteksi {sheetNames.length} Sheet di Dalam Berkas Excel Ini
                </div>
                <div className="text-[11px] text-slate-600">
                  Pilih sheet spesifik (misal: <strong>KELAS 7</strong>, <strong>MUTASI MASUK</strong>, <strong>MUTASI KELUAR</strong>) atau gabungkan seluruh sheet biodata siswa.
                </div>
              </div>
            </div>

            <select
              value={selectedSheetName}
              onChange={e => applySheetSelection(e.target.value, sheetsMap, category)}
              className="px-3.5 py-2 rounded-xl border border-[#315FEA]/30 bg-white text-xs font-bold text-[#101D35] min-w-[260px]"
            >
              {(category === 'siswa_baru' || category === 'pembaruan_data') && (
                <option value={ALL_SHEETS_COMBINED_KEY}>
                  ★ Gabungkan Semua Sheet Biodata Siswa (Kelas 7, 8, &amp; 9)
                </option>
              )}
              {sheetNames.map(name => (
                <option key={name} value={name}>
                  Sheet: {name} ({sheetsMap[name]?.rawRows.length || 0} baris)
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Pratinjau & Validasi Sebelum Penyimpanan */}
      {rawRows.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-[0_1px_3px_rgba(16,29,53,0.05)] space-y-5">
          {/* Summary Badges */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <StatisticCard
              title="Total Baris"
              value={validationCounts.total}
              subtitle="Baris terdeteksi di berkas"
              icon={FileSpreadsheet}
              accent="slate"
            />
            <StatisticCard
              title="Data Valid"
              value={validationCounts.valid}
              subtitle="Siap disimpan ke DB"
              icon={CheckCircle2}
              accent="emerald"
            />
            <StatisticCard
              title="Duplikat Dicegah"
              value={validationCounts.duplicate}
              subtitle="Dilewati otomatis"
              icon={AlertTriangle}
              accent="amber"
            />
            <StatisticCard
              title="Perlu Diperiksa"
              value={validationCounts.review}
              subtitle="Perubahan biodata"
              icon={RefreshCw}
              accent="blue"
            />
            <StatisticCard
              title="Data Gagal"
              value={validationCounts.failed}
              subtitle="Tidak memenuhi validasi"
              icon={XCircle}
              accent="rose"
            />
          </div>

          {/* Breakdown Kelas 7, 8, 9 pada Mode A */}
          {classBreakdown && (
            <div className="flex flex-wrap items-center gap-2 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
              <span className="font-bold text-[#101D35]">Distribusi Tingkat Kelas Siap Import:</span>
              <span className="px-2.5 py-0.5 rounded-lg bg-[#315FEA]/10 text-[#315FEA] font-bold font-mono">
                Kelas 7: {classBreakdown.k7} siswa
              </span>
              <span className="px-2.5 py-0.5 rounded-lg bg-indigo-100 text-indigo-950 font-bold font-mono">
                Kelas 8: {classBreakdown.k8} siswa
              </span>
              <span className="px-2.5 py-0.5 rounded-lg bg-purple-100 text-purple-950 font-bold font-mono">
                Kelas 9: {classBreakdown.k9} siswa
              </span>
            </div>
          )}

          {/* Pemetaan Kolom Excel ke Database (Mode A & D) */}
          {(category === 'siswa_baru' || category === 'pembaruan_data') && headers.length > 0 && (
            <details className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs">
              <summary className="font-bold text-[#101D35] cursor-pointer">
                Pemetaan Kolom Excel ke Kolom Database ({headers.length} Kolom Terdeteksi)
              </summary>
              <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 mt-3">
                {headers.map(h => (
                  <div key={h} className="bg-white p-2.5 rounded-xl border border-slate-200">
                    <span className="text-[10px] font-mono text-slate-500 block truncate">
                      Excel: {h}
                    </span>
                    <select
                      value={columnMapping[h] || ''}
                      onChange={e =>
                        setColumnMapping(prev => ({
                          ...prev,
                          [h]: e.target.value as keyof Siswa | ''
                        }))
                      }
                      className="w-full mt-1 text-xs font-semibold text-[#101D35] bg-transparent focus:outline-none"
                    >
                      <option value="">-- Abaikan Kolom --</option>
                      {ALL_59_STUDENT_FIELDS.map(f => (
                        <option key={f.key} value={f.key}>
                          {f.label} ({f.dbColumn})
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* Pemilihan Kolom yang Akan Diperbarui pada Mode D (Pembaruan Data) */}
          {category === 'pembaruan_data' && (
            <div className="p-4 rounded-xl bg-[#315FEA]/5 border border-[#315FEA]/20 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-bold text-[#101D35]">
                  Pilih Kolom Biodata yang Diizinkan untuk Diperbarui:
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedUpdateCols({
                        penghasilan_ayah: true,
                        penghasilan_ibu: true
                      })
                    }
                    className="px-2.5 py-1 rounded-lg bg-[#315FEA] hover:bg-[#244CD2] text-white text-[11px] font-bold cursor-pointer"
                  >
                    Hanya Penghasilan Ayah &amp; Ibu
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedUpdateCols({
                        nama_ayah: true,
                        nik_ayah: true,
                        tempat_lahir_ayah: true,
                        tgl_lahir_ayah: true,
                        pendidikan_ayah: true,
                        pekerjaan_ayah: true,
                        no_wa_ayah: true,
                        penghasilan_ayah: true,
                        nama_ibu: true,
                        nik_ibu: true,
                        tempat_lahir_ibu: true,
                        tgl_lahir_ibu: true,
                        pendidikan_ibu: true,
                        pekerjaan_ibu: true,
                        no_wa_ibu: true,
                        penghasilan_ibu: true,
                        nama_wali: true,
                        nik_wali: true,
                        pekerjaan_wali: true,
                        penghasilan_wali: true,
                        no_hp_orangtua: true
                      })
                    }
                    className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-[#101D35] text-[11px] font-semibold cursor-pointer"
                  >
                    Semua Kolom Orang Tua/Wali
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const all: Record<string, boolean> = {};
                      ALL_59_STUDENT_FIELDS.forEach(f => {
                        if (f.key !== 'nisn') all[f.key] = true;
                      });
                      setSelectedUpdateCols(all);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-[#101D35] text-[11px] font-semibold cursor-pointer"
                  >
                    Pilih Semua Kolom
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedUpdateCols({})}
                    className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-[11px] font-semibold cursor-pointer"
                  >
                    Kosongkan Pilihan
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto">
                {ALL_59_STUDENT_FIELDS.filter(f => f.key !== 'nisn').map(f => (
                  <label
                    key={f.key}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium cursor-pointer ${
                      selectedUpdateCols[f.key]
                        ? 'bg-[#315FEA]/10 border-[#315FEA]/40 text-[#101D35] font-bold'
                        : 'bg-white border-slate-200 text-slate-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(selectedUpdateCols[f.key])}
                      onChange={e =>
                        setSelectedUpdateCols(prev => ({
                          ...prev,
                          [f.key]: e.target.checked
                        }))
                      }
                      className="rounded border-slate-300 text-[#315FEA]"
                    />
                    <span>{f.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Tabel Pratinjau */}
          <div className="overflow-x-auto border border-slate-200 rounded-2xl max-h-96">
            {category === 'mutasi_masuk' || category === 'mutasi_keluar' ? (
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-slate-100 border-b border-slate-200 text-slate-700 font-bold">
                  <tr>
                    <th className="py-2.5 px-3">Baris</th>
                    <th className="py-2.5 px-3">Kelas</th>
                    <th className="py-2.5 px-3">NIS / NISN</th>
                    <th className="py-2.5 px-3">Nama Lengkap Siswa</th>
                    <th className="py-2.5 px-3">Tanggal Pindah</th>
                    {category === 'mutasi_keluar' && (
                      <th className="py-2.5 px-3">Alasan / Kategori</th>
                    )}
                    <th className="py-2.5 px-3">
                      {category === 'mutasi_masuk' ? 'Sekolah Asal' : 'Sekolah Tujuan'}
                    </th>
                    <th className="py-2.5 px-3">Status Siswa di DB</th>
                    <th className="py-2.5 px-3">Validasi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {parsedMutationRows.map(r => (
                    <tr key={r.rowNumber}>
                      <td className="py-2 px-3 font-mono">{r.rowNumber}</td>
                      <td className="py-2 px-3 font-bold">Kelas {r.kelas}</td>
                      <td className="py-2 px-3 font-mono">
                        {r.nis || '-'} / {r.nisn || '-'}
                      </td>
                      <td className="py-2 px-3 font-bold text-[#101D35]">{r.nama_siswa || '-'}</td>
                      <td className="py-2 px-3 font-mono">{formatDateDMY(r.tanggal_pindah)}</td>
                      {category === 'mutasi_keluar' && (
                        <td className="py-2 px-3">
                          <span className="font-semibold text-slate-800 block">
                            {r.kategori_mutasi}
                          </span>
                          <span className="text-[11px] text-slate-500">{r.alasan_pindah}</span>
                        </td>
                      )}
                      <td className="py-2 px-3 font-medium text-slate-800">
                        {category === 'mutasi_masuk'
                          ? r.sekolah_asal || '-'
                          : r.sekolah_tujuan || '-'}
                      </td>
                      <td className="py-2 px-3">
                        {r.matchedStudent ? (
                          <span className="text-[#315FEA] font-semibold">
                            Terdaftar ({r.matchedStudent.rombel})
                          </span>
                        ) : (
                          <span className="text-slate-600">
                            {category === 'mutasi_masuk'
                              ? 'Siswa Baru (Otomatis Dibuat)'
                              : 'Arsip Baru (Otomatis Dibuat)'}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        {r.validationStatus === 'valid' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Siap Disimpan
                          </span>
                        ) : r.validationStatus === 'duplicate' ? (
                          <span className="inline-flex items-center gap-1 text-amber-700 font-bold">
                            <AlertTriangle className="w-3.5 h-3.5" /> {r.errors.join('; ')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-rose-700 font-bold">
                            <XCircle className="w-3.5 h-3.5" /> {r.errors.join('; ')}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : category === 'riwayat_kelas' ? (
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-slate-100 border-b border-slate-200 text-slate-700 font-bold">
                  <tr>
                    <th className="py-2.5 px-3">Baris</th>
                    <th className="py-2.5 px-3">NISN / NIS</th>
                    <th className="py-2.5 px-3">Nama Siswa</th>
                    <th className="py-2.5 px-3">Tahun Pelajaran</th>
                    <th className="py-2.5 px-3">Kelas</th>
                    <th className="py-2.5 px-3">Status Validasi</th>
                    <th className="py-2.5 px-3">Keterangan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {parsedHistoryRows.map(r => (
                    <tr key={r.rowNumber}>
                      <td className="py-2 px-3 font-mono">{r.rowNumber}</td>
                      <td className="py-2 px-3 font-mono">
                        {r.nisn || '-'} / {r.nis || '-'}
                      </td>
                      <td className="py-2 px-3 font-bold text-[#101D35]">{r.nama_siswa || '-'}</td>
                      <td className="py-2 px-3 font-mono">{r.tahun_ajaran}</td>
                      <td className="py-2 px-3 font-bold">Kelas {r.kelas}</td>
                      <td className="py-2 px-3">
                        {r.validationStatus === 'valid' ? (
                          <span className="text-emerald-700 font-bold">Valid</span>
                        ) : r.validationStatus === 'duplicate' ? (
                          <span className="text-amber-700 font-bold">Duplikat</span>
                        ) : (
                          <span className="text-rose-700 font-bold">Gagal</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-slate-600">
                        {r.errors.length > 0 ? r.errors.join('; ') : 'Siap disimpan'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-slate-100 border-b border-slate-200 text-slate-700 font-bold">
                  <tr>
                    {category === 'pembaruan_data' && <th className="py-2.5 px-3">Konfirmasi</th>}
                    <th className="py-2.5 px-3">Baris</th>
                    <th className="py-2.5 px-3">NISN / NIS</th>
                    <th className="py-2.5 px-3">Nama Lengkap Siswa</th>
                    <th className="py-2.5 px-3">Kelas / Tingkat</th>
                    <th className="py-2.5 px-3">Status Validasi</th>
                    <th className="py-2.5 px-3">
                      {category === 'pembaruan_data'
                        ? 'Perbandingan Data Lama vs Baru'
                        : 'Keterangan / Peringatan'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {parsedStudentRows.map(r => (
                    <tr key={r.rowNumber}>
                      {category === 'pembaruan_data' && (
                        <td className="py-2 px-3">
                          <input
                            type="checkbox"
                            disabled={!r.isValid || !r.diffs || r.diffs.length === 0}
                            checked={Boolean(confirmedUpdateRows[r.rowNumber])}
                            onChange={e =>
                              setConfirmedUpdateRows(prev => ({
                                ...prev,
                                [r.rowNumber]: e.target.checked
                              }))
                            }
                            className="rounded border-slate-300 text-[#315FEA]"
                          />
                        </td>
                      )}
                      <td className="py-2 px-3 font-mono">{r.rowNumber}</td>
                      <td className="py-2 px-3 font-mono">
                        {r.data.nisn || '(Belum ada NISN)'} / {r.data.nis || '(Belum ada NIS)'}
                      </td>
                      <td className="py-2 px-3 font-bold text-[#101D35]">
                        {r.data.nama_lengkap || '-'}
                      </td>
                      <td className="py-2 px-3 font-mono">
                        Kelas {r.data.rombel || defaultKelasAwal} (Tingkat{' '}
                        {r.data.tingkat_kelas || '7'})
                      </td>
                      <td className="py-2 px-3">
                        {r.statusCategory === 'valid' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5" />{' '}
                            {r.matchedExisting && upsertExistingOnSiswaBaru
                              ? 'Valid (Update)'
                              : 'Valid (Baru)'}
                          </span>
                        ) : r.statusCategory === 'duplicate' ? (
                          <span className="inline-flex items-center gap-1 text-amber-700 font-bold">
                            <AlertTriangle className="w-3.5 h-3.5" /> Duplikat
                          </span>
                        ) : r.statusCategory === 'needs_review' ? (
                          <span className="inline-flex items-center gap-1 text-[#315FEA] font-bold">
                            <RefreshCw className="w-3.5 h-3.5" /> {r.diffs?.length || 0} Perubahan
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-rose-700 font-bold">
                            <XCircle className="w-3.5 h-3.5" /> Gagal
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-slate-600">
                        {category === 'pembaruan_data' && r.diffs ? (
                          r.diffs.length === 0 ? (
                            <span className="text-slate-400">Tidak ada perbedaan nilai</span>
                          ) : (
                            <div className="space-y-1">
                              {r.diffs.slice(0, 4).map(d => (
                                <div key={d.key} className="text-[11px]">
                                  <strong>{d.label}:</strong>{' '}
                                  <span className="line-through text-slate-400">{d.oldVal}</span>{' '}
                                  &rarr; <span className="text-[#315FEA] font-bold">{d.newVal}</span>
                                </div>
                              ))}
                              {r.diffs.length > 4 && (
                                <span className="text-[10px] font-bold text-[#315FEA]">
                                  +{r.diffs.length - 4} kolom lainnya
                                </span>
                              )}
                            </div>
                          )
                        ) : r.errors.length > 0 ? (
                          <span className="text-rose-700 font-medium">{r.errors.join('; ')}</span>
                        ) : (
                          'Siap disimpan ke tabel students + riwayat kelas'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Action Bar: Download Error Report, Cancel, or Commit */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
            <div>
              {(validationCounts.failed > 0 ||
                validationCounts.duplicate > 0 ||
                lastCommitErrors.length > 0) && (
                <button
                  type="button"
                  onClick={handleDownloadErrors}
                  className="px-4 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-900 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh Laporan Kesalahan Import (.XLSX)</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Batalkan Sebelum Finalisasi</span>
              </button>
              <button
                type="button"
                disabled={
                  committing ||
                  (validationCounts.valid === 0 && validationCounts.review === 0)
                }
                onClick={handleCommitImport}
                className="px-5 py-2.5 rounded-xl bg-[#315FEA] hover:bg-[#244CD2] disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
              >
                {committing
                  ? commitProgress && commitProgress.total > 0
                    ? `Menyimpan Transaksi Import... (${commitProgress.current} / ${commitProgress.total})`
                    : 'Menyimpan Transaksi Import...'
                  : `Konfirmasi & Simpan ke Database (${validationCounts.valid + validationCounts.review} Baris)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Riwayat Import Batches dengan DataTable */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <History className="w-4 h-4 text-[#315FEA]" />
          <h3 className="font-bold text-[#101D35] text-sm">
            Riwayat Batch Import (<code>import_batches</code>)
          </h3>
        </div>

        <DataTable
          data={batches}
          columns={batchColumns}
          keyExtractor={b => b.id}
          searchPlaceholder="Cari nama berkas Excel atau kategori import..."
          searchFilter={(b, q) =>
            b.file_name.toLowerCase().includes(q) ||
            (b.import_category || b.import_mode || '').toLowerCase().includes(q)
          }
          emptyTitle="Belum Ada Riwayat Batch Import"
          emptyMessage="Riwayat batch import akan muncul di sini setelah proses import selesai disimpan."
        />
      </div>
    </div>
  );
};
