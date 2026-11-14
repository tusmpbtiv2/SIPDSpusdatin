import React, { useState, useEffect, useMemo } from 'react';
import {
  Siswa,
  Mutasi,
  StudentClassHistoryRecord,
  ExportLogRecord,
  ALL_59_STUDENT_FIELDS
} from '../../types';
import {
  getSiswaList,
  getMutasiList,
  getAllClassHistoryList,
  recordExportLog,
  getExportLogsList
} from '../../services/dataService';
import {
  exportStudentsToExcel,
  exportMutationsToExcel,
  exportClassHistoryToExcel
} from '../../services/excelService';
import { CLASS_ROSTER } from '../../config/school';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { PageTitle } from '../../components/common/PageTitle';
import { DataTable, Column } from '../../components/common/ModernTable';
import {
  DownloadCloud,
  FileSpreadsheet,
  Filter,
  History,
  CheckCircle2,
  RotateCcw,
  AlertCircle,
  RefreshCw,
  Columns,
  Layers,
  Search
} from 'lucide-react';

type ExportOptionId =
  | 'all_cohorts'
  | 'active_only'
  | 'by_cohort'
  | 'by_academic_year'
  | 'by_class'
  | 'graduated_alumni'
  | 'mutasi_masuk'
  | 'mutasi_keluar'
  | 'full_59_biodata'
  | 'class_history'
  | 'by_status'
  | 'custom_export';

interface SelectableColumnMeta {
  key: string;
  label: string;
  excelHeader: string;
  sensitive?: boolean;
}

const ALL_SELECTABLE_COLUMNS: SelectableColumnMeta[] = [
  { key: 'NO', label: 'Nomor Urut Baris', excelHeader: 'NO' },
  { key: 'ANGKATAN', label: 'Tahun Angkatan', excelHeader: 'ANGKATAN' },
  { key: 'TAHUN_LULUS', label: 'Tahun Kelulusan', excelHeader: 'TAHUN LULUS' },
  ...ALL_59_STUDENT_FIELDS.map(f => ({
    key: String(f.key),
    label: f.label,
    excelHeader: f.excelHeader,
    sensitive: f.sensitive
  }))
];

const DEFAULT_CUSTOM_COLUMNS: string[] = [
  'NO',
  'rombel',
  'kamar',
  'nis',
  'nisn',
  'nama_lengkap',
  'jenis_kelamin',
  'tempat_lahir',
  'tanggal_lahir',
  'nama_ayah',
  'penghasilan_ayah',
  'nama_ibu',
  'penghasilan_ibu'
];

const EXPORT_OPTIONS: { id: ExportOptionId; number: number; title: string; desc: string }[] = [
  {
    id: 'all_cohorts',
    number: 1,
    title: 'Semua Siswa dari Seluruh Angkatan',
    desc: 'Mengekspor seluruh siswa historis lintas angkatan tanpa batasan tiga tahun.'
  },
  {
    id: 'active_only',
    number: 2,
    title: 'Siswa Aktif Saat Ini',
    desc: 'Mengekspor seluruh siswa yang saat ini berstatus aktif belajar.'
  },
  {
    id: 'by_cohort',
    number: 3,
    title: 'Siswa Berdasarkan Angkatan',
    desc: 'Mengekspor siswa sesuai Tahun Angkatan masuk sekolah.'
  },
  {
    id: 'by_academic_year',
    number: 4,
    title: 'Siswa Berdasarkan Tahun Pelajaran',
    desc: 'Mengekspor daftar siswa yang tercatat pada Tahun Pelajaran tertentu.'
  },
  {
    id: 'by_class',
    number: 5,
    title: 'Siswa Berdasarkan Kelas (Bisa > 1 Kelas)',
    desc: 'Mengekspor daftar siswa untuk 1 atau beberapa kelas sekaligus (7A s/d 9O).'
  },
  {
    id: 'graduated_alumni',
    number: 6,
    title: 'Siswa yang Sudah Lulus (Arsip Alumni)',
    desc: 'Mengekspor seluruh data alumni beserta tahun kelulusan.'
  },
  {
    id: 'mutasi_masuk',
    number: 7,
    title: 'Siswa Mutasi Masuk',
    desc: 'Mengekspor transaksi dan data siswa pindahan masuk.'
  },
  {
    id: 'mutasi_keluar',
    number: 8,
    title: 'Siswa Mutasi Keluar',
    desc: 'Mengekspor transaksi dan data siswa yang pindah / keluar sekolah.'
  },
  {
    id: 'full_59_biodata',
    number: 9,
    title: 'Biodata Lengkap Siswa Beserta Orang Tua (59 Kolom)',
    desc: 'Mengekspor seluruh 59 kolom Buku Induk termasuk data Ayah, Ibu, dan Wali.'
  },
  {
    id: 'class_history',
    number: 10,
    title: 'Riwayat Kelas Siswa Lintas Tahun Pelajaran',
    desc: 'Mengekspor catatan penempatan & kenaikan kelas siswa setiap tahun pelajaran.'
  },
  {
    id: 'by_status',
    number: 11,
    title: 'Data Siswa Berdasarkan Status Tertentu',
    desc: 'Mengekspor siswa berdasarkan filter status (Aktif, Lulus, Mutasi, Nonaktif).'
  },
  {
    id: 'custom_export',
    number: 12,
    title: 'Export Kustom (Pilih Kelas & Kolom Tertentu)',
    desc: 'Bebas memilih lebih dari 1 kelas dan memilih lebih dari 1 kolom tertentu sesuai kebutuhan.'
  }
];

export const ExportExcelPage: React.FC = () => {
  const { adminUser, role } = useAuth();
  const { success, error: notifyError } = useNotification();

  const [students, setStudents] = useState<Siswa[]>([]);
  const [mutations, setMutations] = useState<Mutasi[]>([]);
  const [historyList, setHistoryList] = useState<StudentClassHistoryRecord[]>([]);
  const [exportLogs, setExportLogs] = useState<ExportLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedOption, setSelectedOption] = useState<ExportOptionId>('all_cohorts');
  const [tahunPelajaranFilter, setTahunPelajaranFilter] = useState('all');
  const [angkatanFilter, setAngkatanFilter] = useState('all');
  const [kelasFilter, setKelasFilter] = useState('all');
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [tahunLulusFilter, setTahunLulusFilter] = useState('all');
  const [excludeSensitive, setExcludeSensitive] = useState(false);

  // Kustom kolom export (bisa pilih > 1 kolom)
  const [useCustomColumns, setUseCustomColumns] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState<string[]>(DEFAULT_CUSTOM_COLUMNS);
  const [columnSearch, setColumnSearch] = useState('');

  const loadData = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [st, muts, hist, logs] = await Promise.all([
        getSiswaList(),
        getMutasiList(),
        getAllClassHistoryList(),
        getExportLogsList()
      ]);
      setStudents(st);
      setMutations(muts.filter(m => m.status !== 'dibatalkan'));
      setHistoryList(hist);
      setExportLogs(logs);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal memuat data untuk ekspor Excel.';
      setLoadError(msg);
      notifyError('Gagal Memuat Data', msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const allAvailableClasses = useMemo(() => {
    const set = new Set<string>(CLASS_ROSTER);
    students.forEach(s => {
      if (s.rombel && s.rombel.trim() && s.rombel !== '-') {
        set.add(s.rombel.trim());
      }
    });
    return Array.from(set);
  }, [students]);

  const angkatanOptions = useMemo(() => {
    const s = new Set<string>();
    students.forEach(st => {
      const a = st.angkatan || (st.tanggal_masuk || '').slice(0, 4) || st.tahun_masuk;
      if (a) s.add(a);
    });
    return Array.from(s).sort().reverse();
  }, [students]);

  const tahunLulusOptions = useMemo(() => {
    const s = new Set<string>();
    students
      .filter(st => st.status === 'lulus')
      .forEach(st => {
        if (st.tahun_lulus) s.add(st.tahun_lulus);
      });
    return Array.from(s).sort().reverse();
  }, [students]);

  const filteredSelectableColumns = useMemo(() => {
    const q = columnSearch.trim().toLowerCase();
    if (!q) return ALL_SELECTABLE_COLUMNS;
    return ALL_SELECTABLE_COLUMNS.filter(
      c =>
        c.excelHeader.toLowerCase().includes(q) ||
        c.label.toLowerCase().includes(q) ||
        c.key.toLowerCase().includes(q)
    );
  }, [columnSearch]);

  const toggleClassSelection = (cls: string) => {
    setSelectedClasses(prev => {
      const next = prev.includes(cls) ? prev.filter(c => c !== cls) : [...prev, cls];
      if (next.length === 1) {
        setKelasFilter(next[0]);
      } else {
        setKelasFilter('all');
      }
      return next;
    });
  };

  const selectClassGroup = (prefix?: '7' | '8' | '9' | 'all' | 'clear') => {
    if (!prefix || prefix === 'clear') {
      setSelectedClasses([]);
      setKelasFilter('all');
      return;
    }
    if (prefix === 'all') {
      setSelectedClasses([...allAvailableClasses]);
      setKelasFilter('all');
      return;
    }
    const matching = allAvailableClasses.filter(c => c.startsWith(prefix));
    setSelectedClasses(matching);
    setKelasFilter(matching.length === 1 ? matching[0] : 'all');
  };

  const toggleColumnSelection = (colKey: string) => {
    setSelectedColumns(prev =>
      prev.includes(colKey) ? prev.filter(k => k !== colKey) : [...prev, colKey]
    );
  };

  const applyColumnPreset = (
    preset: 'all' | 'identitas' | 'orang_tua' | 'alamat' | 'sekolah_asal' | 'clear'
  ) => {
    if (preset === 'clear') {
      setSelectedColumns([]);
      return;
    }
    if (preset === 'all') {
      setSelectedColumns(ALL_SELECTABLE_COLUMNS.map(c => c.key));
      return;
    }
    if (preset === 'identitas') {
      setSelectedColumns([
        'NO',
        'ANGKATAN',
        'rombel',
        'kamar',
        'nis',
        'nisn',
        'nik',
        'no_kk',
        'nama_lengkap',
        'jenis_kelamin',
        'tempat_lahir',
        'tanggal_lahir',
        'status_dalam_keluarga',
        'anak_ke',
        'jumlah_saudara'
      ]);
      return;
    }
    if (preset === 'orang_tua') {
      setSelectedColumns([
        'NO',
        'rombel',
        'nis',
        'nisn',
        'nama_lengkap',
        'nama_ayah',
        'pekerjaan_ayah',
        'penghasilan_ayah',
        'no_hp_ayah',
        'nama_ibu',
        'pekerjaan_ibu',
        'penghasilan_ibu',
        'no_hp_ibu',
        'nama_wali',
        'pekerjaan_wali',
        'penghasilan_wali',
        'no_hp_wali'
      ]);
      return;
    }
    if (preset === 'alamat') {
      setSelectedColumns([
        'NO',
        'rombel',
        'nis',
        'nisn',
        'nama_lengkap',
        'alamat_orang_tua',
        'desa_kelurahan',
        'kecamatan',
        'kabupaten_kota',
        'provinsi',
        'daerah_asal'
      ]);
      return;
    }
    if (preset === 'sekolah_asal') {
      setSelectedColumns([
        'NO',
        'rombel',
        'nis',
        'nisn',
        'nama_lengkap',
        'nama_sekolah_asal',
        'status_sekolah_asal',
        'npsn',
        'alamat_sekolah_asal',
        'tahun_ijazah',
        'nomor_ijazah'
      ]);
    }
  };

  // Hitung data yang akan diekspor sesuai opsi & filter
  const targetStudents = useMemo(() => {
    return students.filter(s => {
      const angk = s.angkatan || (s.tanggal_masuk || '').slice(0, 4) || s.tahun_masuk;

      if (selectedOption === 'active_only' && s.status !== 'aktif' && s.status !== 'mutasi_masuk') {
        return false;
      }
      if (selectedOption === 'graduated_alumni' && s.status !== 'lulus') {
        return false;
      }

      if (angkatanFilter !== 'all' && angk !== angkatanFilter) return false;

      if (selectedClasses.length > 0) {
        if (!selectedClasses.includes(s.rombel)) return false;
      } else if (kelasFilter !== 'all' && s.rombel !== kelasFilter) {
        return false;
      }

      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (tahunLulusFilter !== 'all' && (s.tahun_lulus || '') !== tahunLulusFilter) return false;
      if (tahunPelajaranFilter !== 'all') {
        const startYr = tahunPelajaranFilter.split('/')[0];
        const hasHistInTa = historyList.some(
          h => h.student_id === s.id && h.tahun_ajaran === tahunPelajaranFilter
        );
        if (!hasHistInTa && angk !== startYr) return false;
      }

      return true;
    });
  }, [
    students,
    historyList,
    selectedOption,
    angkatanFilter,
    kelasFilter,
    selectedClasses,
    statusFilter,
    tahunLulusFilter,
    tahunPelajaranFilter
  ]);

  const isCustomColumnActive =
    (selectedOption === 'custom_export' || useCustomColumns) &&
    selectedOption !== 'mutasi_masuk' &&
    selectedOption !== 'mutasi_keluar' &&
    selectedOption !== 'class_history';

  const handleExecuteExport = async () => {
    const optMeta = EXPORT_OPTIONS.find(o => o.id === selectedOption)!;
    const kelasLabel =
      selectedClasses.length > 0
        ? selectedClasses.join(', ')
        : kelasFilter;

    const filterSummary = {
      tahun_pelajaran: tahunPelajaranFilter,
      angkatan: angkatanFilter,
      kelas: kelasLabel,
      status: statusFilter,
      tahun_kelulusan: tahunLulusFilter,
      kolom_kustom: isCustomColumnActive ? `${selectedColumns.length} kolom dipilih` : 'Semua Kolom'
    };

    if (selectedOption === 'mutasi_masuk' || selectedOption === 'mutasi_keluar') {
      const jenis = selectedOption === 'mutasi_masuk' ? 'masuk' : 'keluar';
      const mutRows = mutations.filter(m => m.jenis === jenis);
      exportMutationsToExcel(mutRows, { format: 'xlsx', jenis });

      await recordExportLog({
        exported_by_name: adminUser?.nama_lengkap || 'Admin Sekolah',
        exported_by_role: role || 'admin',
        export_type: optMeta.title,
        filter_summary: filterSummary,
        total_records: mutRows.length,
        file_name: `Data_${selectedOption}_SIPDS.xlsx`
      });
      success('Export Selesai', `Berkas Excel ${optMeta.title} berhasil diunduh.`);
      await loadData();
      return;
    }

    if (selectedOption === 'class_history') {
      const stMap = new Map(students.map(s => [s.id, s]));
      const rows = historyList
        .filter(h => {
          if (tahunPelajaranFilter !== 'all' && h.tahun_ajaran !== tahunPelajaranFilter) return false;
          if (selectedClasses.length > 0 && !selectedClasses.includes(h.kelas)) return false;
          if (selectedClasses.length === 0 && kelasFilter !== 'all' && h.kelas !== kelasFilter) return false;
          return true;
        })
        .map(h => {
          const st = stMap.get(h.student_id);
          return {
            tahun_ajaran: h.tahun_ajaran || '2025/2026',
            semester: h.semester || 'Ganjil',
            angkatan: st?.angkatan || st?.tahun_masuk || '-',
            nis: st?.nis || '-',
            nisn: st?.nisn || '-',
            nama_siswa: st?.nama_lengkap || '-',
            kelas: h.kelas,
            tingkat: h.tingkat_kelas,
            kamar: h.kamar || st?.kamar || '-',
            status_riwayat: h.status_riwayat,
            tanggal_mulai: h.tanggal_mulai,
            catatan: h.catatan || '-'
          };
        });

      const fileName = exportClassHistoryToExcel(rows);
      await recordExportLog({
        exported_by_name: adminUser?.nama_lengkap || 'Admin Sekolah',
        exported_by_role: role || 'admin',
        export_type: optMeta.title,
        filter_summary: filterSummary,
        total_records: rows.length,
        file_name: fileName
      });
      success('Export Selesai', `Berkas Excel ${optMeta.title} berhasil diunduh.`);
      await loadData();
      return;
    }

    if (isCustomColumnActive && selectedColumns.length === 0) {
      notifyError(
        'Pilih Minimal 1 Kolom',
        'Silakan centang minimal 1 kolom pada panel Pilihan Kolom Tertentu sebelum mengunduh Excel.'
      );
      return;
    }

    const classSuffix =
      selectedClasses.length > 0
        ? `_KELAS_${selectedClasses.slice(0, 4).join('-')}${selectedClasses.length > 4 ? '_DLL' : ''}`
        : kelasFilter !== 'all'
        ? `_KELAS_${kelasFilter}`
        : '';
    const prefix = `SIPDS_${selectedOption.toUpperCase()}${classSuffix}`;

    exportStudentsToExcel(targetStudents, {
      format: 'xlsx',
      excludeSensitiveFamilyInfo: selectedOption === 'full_59_biodata' ? false : excludeSensitive,
      fileNamePrefix: prefix,
      selectedColumns: isCustomColumnActive ? selectedColumns : undefined
    });

    await recordExportLog({
      exported_by_name: adminUser?.nama_lengkap || 'Admin Sekolah',
      exported_by_role: role || 'admin',
      export_type: optMeta.title,
      filter_summary: filterSummary,
      total_records: targetStudents.length,
      file_name: `${prefix}.xlsx`
    });
    success(
      'Export Selesai',
      `Berkas Excel ${optMeta.title} (${targetStudents.length} siswa${
        isCustomColumnActive ? `, ${selectedColumns.length} kolom` : ''
      }) berhasil diunduh.`
    );
    await loadData();
  };

  const resetFilters = () => {
    setTahunPelajaranFilter('all');
    setAngkatanFilter('all');
    setKelasFilter('all');
    setSelectedClasses([]);
    setStatusFilter('all');
    setTahunLulusFilter('all');
  };

  const logColumns: Column<ExportLogRecord>[] = [
    {
      header: 'Waktu Ekspor',
      render: l => (
        <span className="font-mono text-xs text-slate-600">
          {new Date(l.created_at).toLocaleString('id-ID')}
        </span>
      ),
      className: 'w-44 whitespace-nowrap'
    },
    {
      header: 'Petugas Ekspor',
      render: l => (
        <div>
          <span className="font-bold text-[#101D35]">{l.exported_by_name}</span>
          <div className="text-[11px] text-slate-500">Peran: {l.exported_by_role}</div>
        </div>
      ),
      className: 'w-48'
    },
    {
      header: 'Jenis Kategori Export',
      render: l => <span className="font-bold text-[#315FEA] text-xs">{l.export_type}</span>
    },
    {
      header: 'Jumlah Baris',
      render: l => (
        <span className="font-mono font-bold text-[#101D35] text-xs">
          {l.total_records.toLocaleString('id-ID')} baris
        </span>
      ),
      className: 'w-32'
    },
    {
      header: 'Nama Berkas',
      render: l => <span className="font-mono text-xs text-slate-600">{l.file_name}</span>
    }
  ];

  return (
    <div className="space-y-6">
      <PageTitle
        category="Data, Akun & Sistem"
        title="Export Data Siswa, Alumni, Mutasi, & Riwayat Kelas (.XLSX)"
        subtitle="Menghasilkan berkas XLSX standar dengan opsi kustom multi-kelas & multi-kolom serta perlindungan format teks nomor identitas (NIS, NISN, NIK, KK, NPSN)."
        icon={DownloadCloud}
        actions={
          <button
            type="button"
            onClick={handleExecuteExport}
            className="px-5 py-2.5 rounded-xl bg-[#315FEA] hover:bg-[#244CD2] text-white text-xs font-semibold flex items-center gap-2 shrink-0 shadow-xs cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Unduh File Excel (.XLSX) Sekarang</span>
          </button>
        }
      />

      {loadError && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-rose-900">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold">Gagal Memuat Data Ekspor</h4>
              <p className="text-xs text-rose-700 mt-0.5">{loadError}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={loadData}
            className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Coba Lagi</span>
          </button>
        </div>
      )}

      {/* 12 Pilihan Kategori Export */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {EXPORT_OPTIONS.map(opt => {
          const isSelected = selectedOption === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                setSelectedOption(opt.id);
                if (opt.id === 'custom_export') {
                  setUseCustomColumns(true);
                }
              }}
              className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                isSelected
                  ? 'bg-[#101D35] text-white border-[#101D35] shadow-md'
                  : 'bg-white text-[#101D35] border-slate-200/80 hover:border-[#315FEA]/50 shadow-[0_1px_3px_rgba(16,29,53,0.04)]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-extrabold">
                  {opt.number}. {opt.title}
                </span>
                {isSelected && <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />}
              </div>
              <p className={`text-[11px] mt-1.5 leading-relaxed ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                {opt.desc}
              </p>
            </button>
          );
        })}
      </div>

      {/* Filter Panel */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-[0_1px_3px_rgba(16,29,53,0.05)] space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-[#101D35]">
            <Filter className="w-4 h-4 text-[#315FEA]" />
            <span>Filter Parameter Export Data</span>
          </div>
          <button
            type="button"
            onClick={resetFilters}
            className="text-xs font-semibold text-slate-500 hover:text-[#101D35] inline-flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset Filter</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              Tahun Pelajaran
            </label>
            <select
              value={tahunPelajaranFilter}
              onChange={e => setTahunPelajaranFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#315FEA]/20 focus:border-[#315FEA]"
            >
              <option value="all">Semua Tahun Pelajaran</option>
              <option value="2026/2027">2026/2027</option>
              <option value="2025/2026">2025/2026</option>
              <option value="2024/2025">2024/2025</option>
              <option value="2023/2024">2023/2024</option>
              <option value="2022/2023">2022/2023</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              Angkatan Siswa
            </label>
            <select
              value={angkatanFilter}
              onChange={e => setAngkatanFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#315FEA]/20 focus:border-[#315FEA]"
            >
              <option value="all">Seluruh Angkatan</option>
              {angkatanOptions.map(a => (
                <option key={a} value={a}>
                  Angkatan {a}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              Kelas Cepat (Atau Pilih &gt;1 di Bawah)
            </label>
            <select
              value={selectedClasses.length > 1 ? 'multi' : kelasFilter}
              onChange={e => {
                const val = e.target.value;
                if (val === 'all') {
                  setKelasFilter('all');
                  setSelectedClasses([]);
                } else if (val !== 'multi') {
                  setKelasFilter(val);
                  setSelectedClasses([val]);
                }
              }}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#315FEA]/20 focus:border-[#315FEA]"
            >
              <option value="all">Semua Kelas</option>
              {selectedClasses.length > 1 && (
                <option value="multi">
                  {selectedClasses.length} Kelas Dipilih ({selectedClasses.slice(0, 3).join(', ')}
                  {selectedClasses.length > 3 ? '...' : ''})
                </option>
              )}
              {allAvailableClasses.map(c => (
                <option key={c} value={c}>
                  Kelas {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              Status Siswa
            </label>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#315FEA]/20 focus:border-[#315FEA]"
            >
              <option value="all">Semua Status</option>
              <option value="aktif">Aktif</option>
              <option value="lulus">Lulus (Alumni)</option>
              <option value="mutasi_masuk">Mutasi Masuk</option>
              <option value="mutasi_keluar">Mutasi Keluar</option>
              <option value="non_aktif">Non-Aktif</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              Tahun Kelulusan
            </label>
            <select
              value={tahunLulusFilter}
              onChange={e => setTahunLulusFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#315FEA]/20 focus:border-[#315FEA]"
            >
              <option value="all">Semua Tahun Kelulusan</option>
              {tahunLulusOptions.map(th => (
                <option key={th} value={th}>
                  Lulus {th}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Panel Kustom Kelas Tertentu (Bisa Pilih Lebih dari 1 Kelas) */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-[#101D35]">
              <Layers className="w-4 h-4 text-[#315FEA]" />
              <span>
                Pilih Kustom Kelas Tertentu (Bisa Pilih Lebih dari 1 Kelas)
              </span>
              <span className="px-2 py-0.5 rounded-md bg-[#315FEA]/10 text-[#315FEA] text-[11px] font-mono">
                {selectedClasses.length === 0
                  ? 'Semua Kelas'
                  : `${selectedClasses.length} Kelas Dipilih`}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => selectClassGroup('clear')}
                className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-[11px] font-semibold text-slate-700 cursor-pointer"
              >
                Semua Kelas (Reset)
              </button>
              <button
                type="button"
                onClick={() => selectClassGroup('7')}
                className="px-2.5 py-1 rounded-lg bg-white hover:bg-blue-50 border border-slate-200 text-[11px] font-semibold text-[#315FEA] cursor-pointer"
              >
                Semua Kelas 7
              </button>
              <button
                type="button"
                onClick={() => selectClassGroup('8')}
                className="px-2.5 py-1 rounded-lg bg-white hover:bg-blue-50 border border-slate-200 text-[11px] font-semibold text-[#315FEA] cursor-pointer"
              >
                Semua Kelas 8
              </button>
              <button
                type="button"
                onClick={() => selectClassGroup('9')}
                className="px-2.5 py-1 rounded-lg bg-white hover:bg-blue-50 border border-slate-200 text-[11px] font-semibold text-[#315FEA] cursor-pointer"
              >
                Semua Kelas 9
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {allAvailableClasses.map(cls => {
              const checked = selectedClasses.includes(cls);
              return (
                <button
                  key={cls}
                  type="button"
                  onClick={() => toggleClassSelection(cls)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                    checked
                      ? 'bg-[#315FEA] text-white border-[#315FEA] shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-[#315FEA]/50'
                  }`}
                >
                  {cls}
                </button>
              );
            })}
          </div>
        </div>

        {/* Panel Kustom Kolom Tertentu (Bisa Pilih Lebih dari 1 Kolom) */}
        {selectedOption !== 'mutasi_masuk' &&
          selectedOption !== 'mutasi_keluar' &&
          selectedOption !== 'class_history' && (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="inline-flex items-center gap-2 text-xs font-bold text-[#101D35] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isCustomColumnActive}
                    onChange={e => setUseCustomColumns(e.target.checked)}
                    disabled={selectedOption === 'custom_export'}
                    className="rounded border-slate-300 text-[#315FEA] focus:ring-[#315FEA]"
                  />
                  <Columns className="w-4 h-4 text-[#315FEA]" />
                  <span>
                    Pilih Kustom Kolom Tertentu (Bisa Pilih Lebih dari 1 Kolom)
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-[#315FEA]/10 text-[#315FEA] text-[11px] font-mono">
                    {isCustomColumnActive
                      ? `${selectedColumns.length} Kolom Dipilih`
                      : 'Semua Kolom Standar (61 Kolom)'}
                  </span>
                </label>

                {isCustomColumnActive && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => applyColumnPreset('all')}
                      className="px-2.5 py-1 rounded-lg bg-white hover:bg-blue-50 border border-slate-200 text-[11px] font-semibold text-[#315FEA] cursor-pointer"
                    >
                      Pilih Semua Kolom
                    </button>
                    <button
                      type="button"
                      onClick={() => applyColumnPreset('identitas')}
                      className="px-2.5 py-1 rounded-lg bg-white hover:bg-blue-50 border border-slate-200 text-[11px] font-semibold text-slate-700 cursor-pointer"
                    >
                      Identitas Utama
                    </button>
                    <button
                      type="button"
                      onClick={() => applyColumnPreset('orang_tua')}
                      className="px-2.5 py-1 rounded-lg bg-white hover:bg-blue-50 border border-slate-200 text-[11px] font-semibold text-slate-700 cursor-pointer"
                    >
                      Orang Tua & Penghasilan
                    </button>
                    <button
                      type="button"
                      onClick={() => applyColumnPreset('alamat')}
                      className="px-2.5 py-1 rounded-lg bg-white hover:bg-blue-50 border border-slate-200 text-[11px] font-semibold text-slate-700 cursor-pointer"
                    >
                      Alamat & Daerah
                    </button>
                    <button
                      type="button"
                      onClick={() => applyColumnPreset('sekolah_asal')}
                      className="px-2.5 py-1 rounded-lg bg-white hover:bg-blue-50 border border-slate-200 text-[11px] font-semibold text-slate-700 cursor-pointer"
                    >
                      Sekolah Asal & Ijazah
                    </button>
                    <button
                      type="button"
                      onClick={() => applyColumnPreset('clear')}
                      className="px-2.5 py-1 rounded-lg bg-white hover:bg-rose-50 border border-slate-200 text-[11px] font-semibold text-rose-600 cursor-pointer"
                    >
                      Hapus Pilihan Kolom
                    </button>
                  </div>
                )}
              </div>

              {isCustomColumnActive && (
                <div className="space-y-3 pt-1">
                  <div className="relative max-w-md">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={columnSearch}
                      onChange={e => setColumnSearch(e.target.value)}
                      placeholder="Cari nama kolom (misal: NISN, Penghasilan, Ayah, Ibu, Kamar)..."
                      className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#315FEA]/20 focus:border-[#315FEA]"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-64 overflow-y-auto p-1">
                    {filteredSelectableColumns.map(col => {
                      const isChecked = selectedColumns.includes(col.key);
                      return (
                        <label
                          key={col.key}
                          className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs cursor-pointer transition-all ${
                            isChecked
                              ? 'bg-[#315FEA]/10 border-[#315FEA] text-[#101D35] font-bold'
                              : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleColumnSelection(col.key)}
                            className="rounded border-slate-300 text-[#315FEA] focus:ring-[#315FEA]"
                          />
                          <div className="truncate">
                            <div className="truncate">{col.excelHeader}</div>
                            <div className="text-[10px] text-slate-500 font-normal truncate">
                              {col.label}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 text-xs">
          <label className="inline-flex items-center gap-2 font-medium text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={excludeSensitive}
              onChange={e => setExcludeSensitive(e.target.checked)}
              className="rounded border-slate-300 text-[#315FEA] focus:ring-[#315FEA]"
            />
            <span>Sembunyikan kolom sensitif (NIK, No KK, Penghasilan)</span>
          </label>

          <div className="flex flex-wrap items-center gap-2">
            {selectedClasses.length > 0 && (
              <span className="font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-lg">
                Kelas: {selectedClasses.join(', ')}
              </span>
            )}
            <span className="font-mono font-bold text-[#315FEA] bg-[#315FEA]/10 px-3 py-1 rounded-lg">
              Siap Diekspor: {targetStudents.length.toLocaleString('id-ID')} Siswa Terfilter
              {isCustomColumnActive ? ` • ${selectedColumns.length} Kolom` : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Catatan Aktivitas Export (export_logs) dengan DataTable */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <History className="w-4 h-4 text-[#315FEA]" />
          <h3 className="font-bold text-[#101D35] text-sm">
            Riwayat Aktivitas Export (<code>export_logs</code>)
          </h3>
        </div>

        <DataTable
          data={exportLogs}
          columns={logColumns}
          keyExtractor={l => l.id}
          isLoading={loading}
          searchPlaceholder="Cari petugas ekspor, kategori export, atau nama berkas..."
          searchFilter={(l, q) =>
            l.exported_by_name.toLowerCase().includes(q) ||
            l.export_type.toLowerCase().includes(q) ||
            l.file_name.toLowerCase().includes(q)
          }
          emptyTitle="Belum Ada Riwayat Aktivitas Export"
          emptyMessage="Setiap kali berkas Excel diunduh, catatan aktivitas akan muncul di tabel ini."
        />
      </div>
    </div>
  );
};

