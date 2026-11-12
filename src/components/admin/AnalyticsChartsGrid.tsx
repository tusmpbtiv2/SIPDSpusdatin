import React, { useState, useMemo } from 'react';
import { DashboardFilterState } from '../../types';
import { ComprehensiveAnalytics, getCurrentJakartaYear } from '../../services/dataService';
import { CLASS_ROSTER } from '../../config/school';
import { StatisticCard } from '../common/StatisticCard';
import { MonthlyBarChart, MonthlyDataPoint } from '../common/MonthlyBarChart';
import { ComparativeBarChart, ComparativeDataItem } from '../common/ComparativeBarChart';
import { YearFilter } from '../common/YearFilter';
import { PeriodFilter, SemesterPeriod } from '../common/PeriodFilter';
import {
  Users,
  UserCheck,
  UserX,
  UserPlus,
  UserMinus,
  CheckSquare,
  Filter,
  RotateCcw,
  Sparkles,
  Activity,
  FileSpreadsheet,
  ArrowLeftRight
} from 'lucide-react';

interface AnalyticsChartsGridProps {
  analytics: ComprehensiveAnalytics;
  filters: DashboardFilterState;
  onChangeFilters: (next: DashboardFilterState) => void;
  onResetFilters: () => void;
  availableClasses?: string[];
  availableAcademicYears?: string[];
  onNavigate?: (menuId: string) => void;
}

export const AnalyticsChartsGrid: React.FC<AnalyticsChartsGridProps> = ({
  analytics,
  filters,
  onChangeFilters,
  onResetFilters,
  availableClasses = CLASS_ROSTER,
  availableAcademicYears,
  onNavigate
}) => {
  const [mutasiChartMode, setMutasiChartMode] = useState<'combined' | 'masuk' | 'keluar'>('combined');
  const [siswaBaruMode, setSiswaBaruMode] = useState<'gender' | 'jalur'>('gender');
  const [kelasTingkatTab, setKelasTingkatTab] = useState<'all' | '7' | '8' | '9'>('all');

  const activeYear = filters.selectedYear || analytics.selectedYear || getCurrentJakartaYear();
  const activeSemester: SemesterPeriod = filters.semesterPeriod || 'all';
  const activeMonth = filters.selectedMonth || 'all';

  const academicYearsList = useMemo(() => {
    if (availableAcademicYears && availableAcademicYears.length > 0) {
      return availableAcademicYears;
    }
    return analytics.availableAcademicYears?.length
      ? analytics.availableAcademicYears
      : ['2023/2024', '2024/2025', '2025/2026', '2026/2027'];
  }, [availableAcademicYears, analytics.availableAcademicYears]);

  const availableCohorts = useMemo(
    () => (analytics.siswaPerAngkatan || []).map(a => a.angkatan),
    [analytics.siswaPerAngkatan]
  );

  // Highlighted month indices (0..11) when semester or month filter is active
  const highlightMonths = useMemo<number[] | undefined>(() => {
    if (activeMonth !== 'all') {
      const mIdx = parseInt(activeMonth, 10) - 1;
      if (mIdx >= 0 && mIdx <= 11) return [mIdx];
    }
    if (activeSemester === 'ganjil') return [6, 7, 8, 9, 10, 11]; // Jul - Des
    if (activeSemester === 'genap') return [0, 1, 2, 3, 4, 5]; // Jan - Jun
    return undefined;
  }, [activeSemester, activeMonth]);

  const yearLabelDisplay =
    activeYear === 'all' ? 'Semua Tahun (Akumulasi Jan–Des)' : `Tahun ${activeYear}`;

  // =========================================================================
  // DATA TRANSFORMASI UNTUK MONTHLY BAR CHARTS (JANUARI - DESEMBER, 0..11)
  // =========================================================================

  // 1. Grafik Bulanan Mutasi Masuk & Mutasi Keluar
  const mutasiMonthlyPoints: MonthlyDataPoint[] = useMemo(
    () =>
      (analytics.mutasiPerBulan || []).map((m, idx) => ({
        monthIndex: m.monthIndex ?? idx,
        monthKey: m.bulanKey,
        values: {
          masukTransaksi: m.masukTransaksi || 0,
          masukSiswaUnik: m.masukSiswaUnik || 0,
          keluarTransaksi: m.keluarTransaksi || 0,
          keluarSiswaUnik: m.keluarSiswaUnik || 0,
          totalTransaksi: (m.masukTransaksi || 0) + (m.keluarTransaksi || 0)
        }
      })),
    [analytics.mutasiPerBulan]
  );

  const mutasiSeriesConfig = useMemo(() => {
    if (mutasiChartMode === 'masuk') {
      return [
        {
          key: 'masukTransaksi',
          label: 'Mutasi Masuk',
          color: '#10B981',
          secondaryKey: 'masukSiswaUnik',
          secondaryLabel: 'Siswa Unik',
          unit: 'transaksi'
        }
      ];
    }
    if (mutasiChartMode === 'keluar') {
      return [
        {
          key: 'keluarTransaksi',
          label: 'Mutasi Keluar',
          color: '#F59E0B',
          secondaryKey: 'keluarSiswaUnik',
          secondaryLabel: 'Siswa Unik',
          unit: 'transaksi'
        }
      ];
    }
    return [
      {
        key: 'masukTransaksi',
        label: 'Mutasi Masuk',
        color: '#10B981',
        secondaryKey: 'masukSiswaUnik',
        secondaryLabel: 'Siswa Unik',
        unit: 'transaksi'
      },
      {
        key: 'keluarTransaksi',
        label: 'Mutasi Keluar',
        color: '#F59E0B',
        secondaryKey: 'keluarSiswaUnik',
        secondaryLabel: 'Siswa Unik',
        unit: 'transaksi'
      }
    ];
  }, [mutasiChartMode]);

  // 2. Grafik Bulanan Siswa Baru Terdaftar (Jan-Des)
  const siswaBaruMonthlyPoints: MonthlyDataPoint[] = useMemo(
    () =>
      (analytics.siswaBaruPerBulan || []).map((s, idx) => ({
        monthIndex: s.monthIndex ?? idx,
        monthKey: s.bulanKey,
        values: {
          total: s.total || 0,
          laki: s.laki || 0,
          perempuan: s.perempuan || 0,
          reguler: s.reguler || 0,
          pindahan: s.pindahan || 0
        }
      })),
    [analytics.siswaBaruPerBulan]
  );

  const siswaBaruSeriesConfig = useMemo(() => {
    if (siswaBaruMode === 'jalur') {
      return [
        {
          key: 'reguler',
          label: 'Siswa Baru Reguler',
          color: '#315FEA',
          unit: 'siswa'
        },
        {
          key: 'pindahan',
          label: 'Jalur Mutasi Masuk',
          color: '#10B981',
          unit: 'siswa'
        }
      ];
    }
    return [
      {
        key: 'laki',
        label: 'Laki-laki (L)',
        color: '#315FEA',
        unit: 'siswa'
      },
      {
        key: 'perempuan',
        label: 'Perempuan (P)',
        color: '#6366F1',
        unit: 'siswa'
      }
    ];
  }, [siswaBaruMode]);

  // 3. Grafik Bulanan Perubahan Biodata (Jan-Des)
  const perubahanMonthlyPoints: MonthlyDataPoint[] = useMemo(
    () =>
      (analytics.perubahanBiodataPerBulan || []).map((p, idx) => ({
        monthIndex: p.monthIndex ?? idx,
        monthKey: p.bulanKey,
        values: {
          diajukan: p.diajukan || 0,
          disetujui: p.disetujui || 0,
          ditolak: p.ditolak || 0,
          menunggu: p.menunggu || 0,
          siswaUnik: p.siswaUnik || 0
        }
      })),
    [analytics.perubahanBiodataPerBulan]
  );

  // 4. Grafik Bulanan Aktivitas Administrasi & Transaksi Sistem (Jan-Des)
  const adminActivityMonthlyPoints: MonthlyDataPoint[] = useMemo(
    () =>
      (analytics.aktivitasAdminPerBulan || []).map((a, idx) => ({
        monthIndex: a.monthIndex ?? idx,
        monthKey: a.bulanKey,
        values: {
          auditLog: a.auditLog || 0,
          transaksiKesiswaan: a.transaksiKesiswaan || 0,
          importData: a.importData || 0,
          exportData: a.exportData || 0,
          totalAktivitas: a.totalAktivitas || 0
        }
      })),
    [analytics.aktivitasAdminPerBulan]
  );

  // =========================================================================
  // DATA TRANSFORMASI UNTUK COMPARATIVE BAR CHARTS
  // =========================================================================

  // 5. Siswa per Angkatan (Cohort)
  const cohortComparativeData: ComparativeDataItem[] = useMemo(
    () =>
      (analytics.siswaPerAngkatan || []).map(a => ({
        id: a.angkatan,
        label: `Angkatan ${a.angkatan}`,
        subLabel: `Total: ${a.total} siswa`,
        values: {
          aktif: a.aktif || 0,
          lulus: a.lulus || 0,
          mutasiKeluar: a.mutasiKeluar || 0
        }
      })),
    [analytics.siswaPerAngkatan]
  );

  // 6. Distribusi Siswa per Kelas (Rombel)
  const kelasComparativeData: ComparativeDataItem[] = useMemo(() => {
    const list = (analytics.siswaPerKelas || []).filter(item => {
      if (kelasTingkatTab === 'all') return true;
      return item.kelas.startsWith(kelasTingkatTab);
    });
    return list.map(item => ({
      id: item.kelas,
      label: item.kelas,
      subLabel: `${item.jumlah} siswa`,
      values: {
        laki: item.laki || 0,
        perempuan: item.perempuan || 0,
        jumlah: item.jumlah || 0
      }
    }));
  }, [analytics.siswaPerKelas, kelasTingkatTab]);

  // 7. Perbandingan Gender per Tingkat Kelas (Kelas 7, 8, 9)
  const tingkatGenderComparativeData: ComparativeDataItem[] = useMemo(
    () =>
      (analytics.siswaPerJenjangTingkat || []).map(t => ({
        id: t.label,
        label: t.label,
        subLabel: `${t.jumlah} siswa`,
        values: {
          laki: t.laki || 0,
          perempuan: t.perempuan || 0
        }
      })),
    [analytics.siswaPerJenjangTingkat]
  );

  // 8. Distribusi Jenjang Asal (SD / MI / Paket A)
  const jenjangAsalComparativeData: ComparativeDataItem[] = useMemo(
    () =>
      (analytics.siswaPerJenjangAsal || []).map(j => ({
        id: j.jenjang,
        label: `Asal ${j.jenjang}`,
        subLabel: `${j.jumlah} siswa`,
        values: {
          laki: j.laki || 0,
          perempuan: j.perempuan || 0,
          jumlah: j.jumlah || 0
        }
      })),
    [analytics.siswaPerJenjangAsal]
  );

  // 9. Distribusi Asal Daerah (Kota/Kabupaten)
  const daerahComparativeData: ComparativeDataItem[] = useMemo(
    () =>
      (analytics.distribusiAsalDaerah || []).map(d => ({
        id: d.daerah,
        label: d.daerah,
        subLabel: `${d.jumlah} siswa`,
        values: {
          laki: d.laki || 0,
          perempuan: d.perempuan || 0
        }
      })),
    [analytics.distribusiAsalDaerah]
  );

  // 10. Perkembangan per Tahun Pelajaran
  const tahunAjaranComparativeData: ComparativeDataItem[] = useMemo(
    () =>
      (analytics.perkembanganPerTahunAjaran || []).map(ta => ({
        id: ta.tahunAjaran,
        label: `TP ${ta.tahunAjaran}`,
        subLabel: `${ta.jumlahSiswa} siswa`,
        values: {
          jumlahSiswa: ta.jumlahSiswa || 0,
          masuk: ta.masuk || 0,
          keluar: ta.keluar || 0
        }
      })),
    [analytics.perkembanganPerTahunAjaran]
  );

  return (
    <div className="space-y-6">
      {/* ===================================================================== */}
      {/* PANEL FILTER TERPADU: YEARFILTER, PERIODFILTER, KELAS, GENDER, STATUS */}
      {/* ===================================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-[0_1px_3px_0_rgba(16,29,53,0.04)] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2 text-xs font-bold text-[#101D35]">
            <div className="w-7 h-7 rounded-lg bg-[#EEF3FF] text-[#315FEA] flex items-center justify-center">
              <Filter className="w-3.5 h-3.5" />
            </div>
            <div>
              <span>Filter Analitik Tahun, Periode Bulanan (Jan–Des), Kelas &amp; Kategori</span>
              <span className="text-[11px] font-normal text-slate-500 block">
                Zona Waktu Acuan: Asia/Jakarta (WIB) · Seluruh transaksi batal otomatis dikecualikan &amp; bebas duplikasi
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onResetFilters}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:text-[#315FEA] bg-[#F5F7FB] hover:bg-[#EEF3FF] border border-slate-200/80 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Semua Filter</span>
          </button>
        </div>

        {/* Baris 1: Reusable YearFilter & PeriodFilter */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <YearFilter
            selectedYear={activeYear}
            onYearChange={yr => onChangeFilters({ ...filters, selectedYear: yr })}
            availableYears={analytics.availableYears || ['2026', '2025', '2024']}
            selectedAcademicYear={filters.tahunAjaran}
            onAcademicYearChange={tp => onChangeFilters({ ...filters, tahunAjaran: tp })}
            availableAcademicYears={academicYearsList}
            includeAllYearOption={true}
          />

          <PeriodFilter
            semester={activeSemester}
            onSemesterChange={sem => onChangeFilters({ ...filters, semesterPeriod: sem })}
            selectedMonth={activeMonth}
            onMonthChange={mo => onChangeFilters({ ...filters, selectedMonth: mo })}
            dateFrom={filters.dateFrom}
            dateTo={filters.dateTo}
            onDateRangeChange={(df, dt) =>
              onChangeFilters({ ...filters, dateFrom: df, dateTo: dt })
            }
            onReset={() =>
              onChangeFilters({
                ...filters,
                semesterPeriod: 'all',
                selectedMonth: 'all',
                dateFrom: '',
                dateTo: ''
              })
            }
          />
        </div>

        {/* Baris 2: Filter Dimensi Populasi (Angkatan, Kelas, Jenjang, Gender, Status) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2.5 pt-2 border-t border-slate-100 text-xs">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Angkatan Masuk
            </label>
            <select
              value={filters.angkatan || 'all'}
              onChange={e => onChangeFilters({ ...filters, angkatan: e.target.value })}
              className="w-full py-2 px-2.5 bg-[#F8FAFC] border border-slate-200/90 hover:border-slate-300 rounded-xl font-mono text-slate-800 focus:outline-none focus:border-[#315FEA] transition-all"
            >
              <option value="all">Semua Angkatan</option>
              {availableCohorts.map(ang => (
                <option key={ang} value={ang}>
                  Angkatan {ang}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Kelas (Rombel)
            </label>
            <select
              value={filters.kelas}
              onChange={e => onChangeFilters({ ...filters, kelas: e.target.value })}
              className="w-full py-2 px-2.5 bg-[#F8FAFC] border border-slate-200/90 hover:border-slate-300 rounded-xl text-slate-800 focus:outline-none focus:border-[#315FEA] transition-all"
            >
              <option value="all">Semua Kelas (7A–9O)</option>
              {availableClasses.map(k => (
                <option key={k} value={k}>
                  Kelas {k}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Tingkat / Asal SD-MI
            </label>
            <select
              value={filters.jenjang}
              onChange={e => onChangeFilters({ ...filters, jenjang: e.target.value })}
              className="w-full py-2 px-2.5 bg-[#F8FAFC] border border-slate-200/90 hover:border-slate-300 rounded-xl text-slate-800 focus:outline-none focus:border-[#315FEA] transition-all"
            >
              <option value="all">Semua Tingkat &amp; Asal</option>
              <option value="7">Tingkat Kelas 7</option>
              <option value="8">Tingkat Kelas 8</option>
              <option value="9">Tingkat Kelas 9</option>
              <option value="SD">Asal SD</option>
              <option value="MI">Asal MI</option>
              <option value="Paket A">Asal Paket A</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Jenis Kelamin
            </label>
            <select
              value={filters.jenisKelamin}
              onChange={e => onChangeFilters({ ...filters, jenisKelamin: e.target.value })}
              className="w-full py-2 px-2.5 bg-[#F8FAFC] border border-slate-200/90 hover:border-slate-300 rounded-xl text-slate-800 focus:outline-none focus:border-[#315FEA] transition-all"
            >
              <option value="all">Semua (L &amp; P)</option>
              <option value="L">Laki-laki (L)</option>
              <option value="P">Perempuan (P)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Status Siswa
            </label>
            <select
              value={filters.status}
              onChange={e => onChangeFilters({ ...filters, status: e.target.value })}
              className="w-full py-2 px-2.5 bg-[#F8FAFC] border border-slate-200/90 hover:border-slate-300 rounded-xl text-slate-800 focus:outline-none focus:border-[#315FEA] transition-all"
            >
              <option value="all">Semua Status</option>
              <option value="aktif_group">Kelompok Aktif</option>
              <option value="nonaktif_group">Kelompok Nonaktif</option>
              <option value="aktif">Aktif</option>
              <option value="mutasi_masuk">Mutasi Masuk</option>
              <option value="mutasi_keluar">Mutasi Keluar</option>
              <option value="lulus">Lulus (Alumni)</option>
              <option value="non_aktif">Non-Aktif</option>
            </select>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* PEMISAHAN TEGAS: STATISTIK HISTORIS LINTAS ANGKATAN VS SISWA AKTIF     */}
      {/* ===================================================================== */}
      <div className="bg-[#101D35] text-white rounded-2xl p-5 sm:p-6 border border-white/10 shadow-[0_8px_24px_-6px_rgba(16,29,53,0.2)]">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-300">
              Ringkasan Buku Induk Lintas Angkatan
            </span>
            <h3 className="text-sm sm:text-base font-bold text-white mt-0.5">
              Pemisahan Statistik Historis Seluruh Angkatan &amp; Populasi Siswa Aktif Saat Ini
            </h3>
          </div>
          <span className="text-[11px] text-slate-300 font-mono tabular-nums">
             Konteks Grafik Bulanan: {yearLabelDisplay}
          </span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 text-xs">
          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <span className="text-[11px] text-slate-300 block">
              Total Seluruh Siswa Pernah Terdaftar (Historis)
            </span>
            <div className="text-2xl font-extrabold font-mono text-white mt-1 tabular-nums">
              {analytics.totalSeluruhSiswaHistoris.toLocaleString('id-ID')}
            </div>
            <span className="text-[11px] text-blue-300 font-medium">
              Seluruh angkatan sejak sekolah berdiri
            </span>
          </div>

          <div className="p-4 rounded-xl bg-[#10B981]/15 border border-[#10B981]/30">
            <span className="text-[11px] text-emerald-300 block">
              Total Siswa Aktif Saat Ini (Terfilter)
            </span>
            <div className="text-2xl font-extrabold font-mono text-emerald-300 mt-1 tabular-nums">
              {analytics.siswaAktif.toLocaleString('id-ID')}
            </div>
            <span className="text-[11px] text-emerald-200/80 font-medium">
              Status Aktif &amp; Mutasi Masuk
            </span>
          </div>

          <div className="p-4 rounded-xl bg-[#315FEA]/20 border border-[#315FEA]/40">
            <span className="text-[11px] text-blue-200 block">
              Total Arsip Alumni (Lulus Lintas Tahun)
            </span>
            <div className="text-2xl font-extrabold font-mono text-white mt-1 tabular-nums">
              {analytics.totalAlumni.toLocaleString('id-ID')}
            </div>
            <span className="text-[11px] text-blue-200/80 font-medium">
              Tersimpan permanen di Arsip Alumni
            </span>
          </div>

          <div className="p-4 rounded-xl bg-[#F59E0B]/15 border border-[#F59E0B]/30">
            <span className="text-[11px] text-amber-300 block">
              Total Siswa Mutasi Keluar
            </span>
            <div className="text-2xl font-extrabold font-mono text-amber-300 mt-1 tabular-nums">
              {analytics.totalSiswaMutasiKeluar.toLocaleString('id-ID')}
            </div>
            <span className="text-[11px] text-amber-200/80 font-medium">
              Pindah sekolah (riwayat tetap tersimpan)
            </span>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 12 KARTU STATISTIK UTAMA (POPULASI + AKTIVITAS BULANAN TAHUN TERPILIH) */}
      {/* ===================================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatisticCard
          title="1. Total Siswa (Sesuai Filter)"
          value={analytics.totalSiswa.toLocaleString('id-ID')}
          subtitle={`Aktif: ${analytics.siswaAktif.toLocaleString('id-ID')} · Nonaktif: ${analytics.siswaNonaktif.toLocaleString('id-ID')}`}
          icon={Users}
          trend={`Historis: ${analytics.totalSeluruhSiswaHistoris.toLocaleString('id-ID')}`}
          accent="blue"
          onClick={onNavigate ? () => onNavigate('data-siswa') : undefined}
        />
        <StatisticCard
          title="2. Siswa Aktif"
          value={analytics.siswaAktif.toLocaleString('id-ID')}
          subtitle={`${
            analytics.totalSiswa > 0
              ? Math.round((analytics.siswaAktif / analytics.totalSiswa) * 100)
              : 0
          }% dari hasil filter`}
          icon={UserCheck}
          trend="Populasi Aktif"
          accent="emerald"
          onClick={onNavigate ? () => onNavigate('data-siswa') : undefined}
        />
        <StatisticCard
          title="3. Siswa Laki-laki (L)"
          value={analytics.countLaki.toLocaleString('id-ID')}
          subtitle={`${analytics.perbandinganGender.persenLaki}% dari populasi terfilter`}
          icon={Users}
          trend="Putra (L)"
          accent="blue"
        />
        <StatisticCard
          title="4. Siswa Perempuan (P)"
          value={analytics.countPerempuan.toLocaleString('id-ID')}
          subtitle={`${analytics.perbandinganGender.persenPerempuan}% dari populasi terfilter`}
          icon={Users}
          trend="Putri (P)"
          accent="indigo"
        />
        <StatisticCard
          title={`5. Mutasi Masuk (${activeYear === 'all' ? 'Semua' : activeYear})`}
          value={analytics.mutasiMasukTransaksi.toLocaleString('id-ID')}
          subtitle={`${analytics.mutasiMasukTransaksi} Transaksi · ${analytics.mutasiMasukSiswaUnik} Siswa Unik`}
          icon={UserPlus}
          trend="Tanpa Batal"
          accent="emerald"
          onClick={onNavigate ? () => onNavigate('mutasi-masuk') : undefined}
        />
        <StatisticCard
          title={`6. Mutasi Keluar (${activeYear === 'all' ? 'Semua' : activeYear})`}
          value={analytics.mutasiKeluarTransaksi.toLocaleString('id-ID')}
          subtitle={`${analytics.mutasiKeluarTransaksi} Transaksi · ${analytics.mutasiKeluarSiswaUnik} Siswa Unik`}
          icon={UserMinus}
          trend="Tanpa Batal"
          accent="amber"
          onClick={onNavigate ? () => onNavigate('mutasi-keluar') : undefined}
        />
        <StatisticCard
          title={`7. Siswa Baru Terdaftar (${activeYear === 'all' ? 'Semua' : activeYear})`}
          value={analytics.totalSiswaBaruTahunTerpilih.toLocaleString('id-ID')}
          subtitle="Berdasarkan tanggal masuk / registrasi"
          icon={UserPlus}
          trend={yearLabelDisplay}
          accent="blue"
        />
        <StatisticCard
          title={`8. Perubahan Biodata (${activeYear === 'all' ? 'Semua' : activeYear})`}
          value={analytics.totalPerubahanBiodataTahunTerpilih.toLocaleString('id-ID')}
          subtitle={`Menunggu: ${analytics.pendingVerifikasi} · Disetujui: ${analytics.approvedVerifikasi} · Ditolak: ${analytics.rejectedVerifikasi}`}
          icon={CheckSquare}
          trend={analytics.pendingVerifikasi > 0 ? 'Perlu Verifikasi' : 'Terverifikasi'}
          accent={analytics.pendingVerifikasi > 0 ? 'amber' : 'indigo'}
          onClick={onNavigate ? () => onNavigate('verifikasi-perubahan') : undefined}
        />
        <StatisticCard
          title="9. Arsip Alumni & Nonaktif"
          value={analytics.siswaNonaktif.toLocaleString('id-ID')}
          subtitle={`Alumni: ${analytics.totalAlumni.toLocaleString('id-ID')} · Mutasi Keluar: ${analytics.totalSiswaMutasiKeluar.toLocaleString('id-ID')}`}
          icon={UserX}
          trend="Arsip Permanen"
          accent="slate"
          onClick={onNavigate ? () => onNavigate('arsip-alumni') : undefined}
        />
        <StatisticCard
          title={`10. Aktivitas Administrasi (${activeYear === 'all' ? 'Semua' : activeYear})`}
          value={analytics.totalAktivitasAdminTahunTerpilih.toLocaleString('id-ID')}
          subtitle="Gabungan Audit Log, Import, Export & Transaksi"
          icon={Activity}
          trend="Real-Time"
          accent="indigo"
          onClick={onNavigate ? () => onNavigate('audit-log') : undefined}
        />
        <StatisticCard
          title={`11. Transaksi Import & Export (${activeYear === 'all' ? 'Semua' : activeYear})`}
          value={(
            analytics.totalImportBatchTahunTerpilih + analytics.totalExportLaporanTahunTerpilih
          ).toLocaleString('id-ID')}
          subtitle={`Import: ${analytics.totalImportBatchTahunTerpilih} batch · Export: ${analytics.totalExportLaporanTahunTerpilih} berkas`}
          icon={FileSpreadsheet}
          trend={yearLabelDisplay}
          accent="emerald"
          onClick={onNavigate ? () => onNavigate('import-excel') : undefined}
        />
        <StatisticCard
          title="12. Rata-rata Kelengkapan Biodata"
          value={`${analytics.kelengkapanBiodata.rataRataPersen}%`}
          subtitle={`Lengkap ≥90%: ${analytics.kelengkapanBiodata.lengkapCount.toLocaleString('id-ID')} siswa`}
          icon={Sparkles}
          trend="59 Kolom Buku Induk"
          accent="blue"
        />
      </div>

      {/* ===================================================================== */}
      {/* BAGIAN I: SEMUA STATISTIK BERBASIS WAKTU BULANAN (DIAGRAM BATANG)     */}
      {/* ===================================================================== */}
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <div>
            <h2 className="text-base font-bold text-[#101D35] flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4 text-[#315FEA]" />
              <span>Grafik Statistik Berbasis Waktu Bulanan (Januari – Desember)</span>
            </h2>
            <p className="text-xs text-slate-500">
              Seluruh statistik bulanan wajib ditampilkan menggunakan diagram batang (Januari–Desember, bulan kosong bernilai 0, Zona Waktu Asia/Jakarta).
            </p>
          </div>
        </div>

        {/* 1. DIAGRAM BATANG BULANAN: MUTASI MASUK & MUTASI KELUAR (JAN-DES) */}
        <MonthlyBarChart
          title="1. Diagram Batang Bulanan: Mutasi Masuk & Mutasi Keluar (Januari–Desember)"
          subtitle="Mengacu pada kolom tanggal_pindah tabel student_mutations (status dibatalkan otomatis diabaikan & bebas penghitungan ganda)"
          yearLabel={yearLabelDisplay}
          data={mutasiMonthlyPoints}
          series={mutasiSeriesConfig}
          height={250}
          highlightMonths={highlightMonths}
          footerNote="Kolom Sumber: public.student_mutations (tanggal_pindah, jenis_mutasi, status_mutasi != 'dibatalkan')"
          headerRight={
            <div className="inline-flex items-center gap-1 p-1 bg-[#F5F7FB] border border-slate-200/80 rounded-xl text-xs">
              <button
                type="button"
                onClick={() => setMutasiChartMode('combined')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-colors whitespace-nowrap ${
                  mutasiChartMode === 'combined'
                    ? 'bg-white text-[#101D35] shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-[#101D35]'
                }`}
              >
                Perbandingan Masuk vs Keluar
              </button>
              <button
                type="button"
                onClick={() => setMutasiChartMode('masuk')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-colors whitespace-nowrap ${
                  mutasiChartMode === 'masuk'
                    ? 'bg-white text-[#10B981] shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-[#101D35]'
                }`}
              >
                Mutasi Masuk
              </button>
              <button
                type="button"
                onClick={() => setMutasiChartMode('keluar')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-colors whitespace-nowrap ${
                  mutasiChartMode === 'keluar'
                    ? 'bg-white text-[#F59E0B] shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-[#101D35]'
                }`}
              >
                Mutasi Keluar
              </button>
            </div>
          }
        />

        {/* 2 & 3. DIAGRAM BATANG BULANAN: SISWA BARU & PERUBAHAN BIODATA (JAN-DES) */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <MonthlyBarChart
            title="2. Diagram Batang Bulanan: Siswa Baru Terdaftar (Januari–Desember)"
            subtitle="Mengacu pada kolom tanggal_masuk / created_at tabel students sesuai zona waktu Asia/Jakarta"
            yearLabel={yearLabelDisplay}
            data={siswaBaruMonthlyPoints}
            series={siswaBaruSeriesConfig}
            height={235}
            highlightMonths={highlightMonths}
            footerNote="Kolom Sumber: public.students (tanggal_masuk, created_at)"
            headerRight={
              <div className="inline-flex items-center gap-1 p-1 bg-[#F5F7FB] border border-slate-200/80 rounded-xl text-xs">
                <button
                  type="button"
                  onClick={() => setSiswaBaruMode('gender')}
                  className={`px-2 py-1 rounded-lg font-semibold transition-colors whitespace-nowrap ${
                    siswaBaruMode === 'gender'
                      ? 'bg-white text-[#315FEA] shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-[#101D35]'
                  }`}
                >
                  L vs P
                </button>
                <button
                  type="button"
                  onClick={() => setSiswaBaruMode('jalur')}
                  className={`px-2 py-1 rounded-lg font-semibold transition-colors whitespace-nowrap ${
                    siswaBaruMode === 'jalur'
                      ? 'bg-white text-[#315FEA] shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-[#101D35]'
                  }`}
                >
                  Reguler vs Pindahan
                </button>
              </div>
            }
          />

          <MonthlyBarChart
            title="3. Diagram Batang Bulanan: Pengajuan Perubahan Biodata (Januari–Desember)"
            subtitle="Mengacu pada kolom submitted_at & reviewed_at tabel student_change_requests (status draft/cancelled diabaikan)"
            yearLabel={yearLabelDisplay}
            data={perubahanMonthlyPoints}
            series={[
              {
                key: 'disetujui',
                label: 'Disetujui',
                color: '#10B981',
                secondaryKey: 'siswaUnik',
                secondaryLabel: 'Siswa Unik',
                unit: 'pengajuan'
              },
              {
                key: 'menunggu',
                label: 'Menunggu',
                color: '#F59E0B',
                unit: 'pengajuan'
              },
              {
                key: 'ditolak',
                label: 'Ditolak',
                color: '#EF4444',
                unit: 'pengajuan'
              }
            ]}
            height={235}
            highlightMonths={highlightMonths}
            footerNote="Kolom Sumber: public.student_change_requests (submitted_at, reviewed_at)"
          />
        </div>

        {/* 4. DIAGRAM BATANG BULANAN: AKTIVITAS ADMINISTRASI & TRANSAKSI LAINNYA (JAN-DES) */}
        <MonthlyBarChart
          title="4. Diagram Batang Bulanan: Aktivitas Administrasi, Import, Export & Transaksi Sistem (Januari–Desember)"
          subtitle="Rekapitulasi bulanan aktivitas Audit Log, Batch Import Excel, Export Laporan, serta Transaksi Mutasi & Verifikasi"
          yearLabel={yearLabelDisplay}
          data={adminActivityMonthlyPoints}
          series={[
            {
              key: 'auditLog',
              label: 'Log Administrasi',
              color: '#315FEA',
              unit: 'aktivitas'
            },
            {
              key: 'transaksiKesiswaan',
              label: 'Transaksi Mutasi & Verifikasi',
              color: '#6366F1',
              unit: 'transaksi'
            },
            {
              key: 'importData',
              label: 'Batch Import Excel',
              color: '#10B981',
              unit: 'batch'
            },
            {
              key: 'exportData',
              label: 'Export Laporan',
              color: '#F59E0B',
              unit: 'ekspor'
            }
          ]}
          height={235}
          highlightMonths={highlightMonths}
          footerNote="Kolom Sumber: audit_logs.created_at, import_batches.completed_at, export_logs.created_at"
        />
      </div>

      {/* ===================================================================== */}
      {/* BAGIAN II: GRAFIK BATANG KOMPARATIF KATEGORI (ANGKATAN, KELAS, GENDER) */}
      {/* ===================================================================== */}
      <div className="space-y-6 pt-2">
        <div>
          <h2 className="text-base font-bold text-[#101D35]">
            Grafik Komparatif Populasi Siswa (Angkatan, Distribusi Kelas, Gender &amp; Asal SD/MI)
          </h2>
          <p className="text-xs text-slate-500">
            Perbandingan kategori menggunakan diagram batang komparatif terstruktur.
          </p>
        </div>

        {/* 5 & 6: SISWA PER ANGKATAN & PERKEMBANGAN PER TAHUN PELAJARAN */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ComparativeBarChart
            title="5. Diagram Batang: Jumlah Siswa per Angkatan Masuk (Cohort)"
            subtitle="Membandingkan populasi Siswa Aktif, Alumni Lulus, dan Mutasi Keluar di setiap angkatan"
            data={cohortComparativeData}
            series={[
              { key: 'aktif', label: 'Siswa Aktif', color: '#10B981', unit: 'siswa' },
              { key: 'lulus', label: 'Alumni Lulus', color: '#315FEA', unit: 'siswa' },
              { key: 'mutasiKeluar', label: 'Mutasi Keluar', color: '#F59E0B', unit: 'siswa' }
            ]}
            orientation="vertical"
            height={230}
          />

          <ComparativeBarChart
            title="6. Diagram Batang: Perkembangan Siswa & Mutasi per Tahun Pelajaran"
            subtitle="Perbandingan jumlah siswa angkatan masuk serta transaksi mutasi masuk & keluar per TP"
            data={tahunAjaranComparativeData}
            series={[
              { key: 'jumlahSiswa', label: 'Siswa Angkatan', color: '#101D35', unit: 'siswa' },
              { key: 'masuk', label: 'Mutasi Masuk', color: '#10B981', unit: 'trx' },
              { key: 'keluar', label: 'Mutasi Keluar', color: '#F59E0B', unit: 'trx' }
            ]}
            orientation="vertical"
            height={230}
          />
        </div>

        {/* 7. DISTRIBUSI SISWA PER KELAS (ROMBEL 7A - 9O) */}
        <ComparativeBarChart
          title="7. Diagram Batang Komparatif: Distribusi Siswa Aktif per Kelas (Rombel)"
          subtitle="Perbandingan jumlah siswa Laki-laki (L) dan Perempuan (P) di setiap kelas aktif"
          data={kelasComparativeData}
          series={[
            { key: 'laki', label: 'Laki-laki (L)', color: '#315FEA', unit: 'siswa' },
            { key: 'perempuan', label: 'Perempuan (P)', color: '#EC4899', unit: 'siswa' }
          ]}
          orientation="vertical"
          stacked={false}
          height={250}
          headerRight={
            <div className="inline-flex items-center gap-1 p-1 bg-[#F5F7FB] border border-slate-200/80 rounded-xl text-xs">
              {(['all', '7', '8', '9'] as const).map(tk => (
                <button
                  key={tk}
                  type="button"
                  onClick={() => setKelasTingkatTab(tk)}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-colors whitespace-nowrap ${
                    kelasTingkatTab === tk
                      ? 'bg-white text-[#315FEA] shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-[#101D35]'
                  }`}
                >
                  {tk === 'all' ? 'Semua Kelas' : `Kelas ${tk}`}
                </button>
              ))}
            </div>
          }
        />

        {/* 8 & 9: PERBANDINGAN GENDER PER TINGKAT & ASAL SEKOLAH SD/MI */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ComparativeBarChart
            title="8. Diagram Batang: Perbandingan Gender per Tingkat Kelas (VII, VIII, IX)"
            subtitle={`Total Laki-laki: ${analytics.perbandinganGender.laki.toLocaleString('id-ID')} (${analytics.perbandinganGender.persenLaki}%) · Perempuan: ${analytics.perbandinganGender.perempuan.toLocaleString('id-ID')} (${analytics.perbandinganGender.persenPerempuan}%)`}
            data={tingkatGenderComparativeData}
            series={[
              { key: 'laki', label: 'Laki-laki (L)', color: '#315FEA', unit: 'siswa' },
              { key: 'perempuan', label: 'Perempuan (P)', color: '#EC4899', unit: 'siswa' }
            ]}
            orientation="vertical"
            height={220}
          />

          <ComparativeBarChart
            title="9. Diagram Batang: Distribusi Jenjang Sekolah Asal (SD / MI / Paket A)"
            subtitle="Perbandingan jumlah siswa berdasarkan jenjang pendidikan dasar asal (SD, MI, Paket A) beserta komposisi gender"
            data={jenjangAsalComparativeData}
            series={[
              { key: 'laki', label: 'Laki-laki (L)', color: '#315FEA', unit: 'siswa' },
              { key: 'perempuan', label: 'Perempuan (P)', color: '#6366F1', unit: 'siswa' }
            ]}
            orientation="vertical"
            height={220}
          />
        </div>

        {/* 10 & 11: DISTRIBUSI ASAL DAERAH & KELENGKAPAN BIODATA 59 KOLOM */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ComparativeBarChart
            title="10. Diagram Batang: Distribusi Asal Daerah Siswa (Kota / Kabupaten)"
            subtitle="Deteksi otomatis dari Alamat Lengkap jika Kota/Kabupaten belum terisi (awalan Kab. dihapus, awalan Kota ditetapkan)"
            data={daerahComparativeData}
            series={[
              { key: 'laki', label: 'Laki-laki (L)', color: '#315FEA', unit: 'siswa' },
              { key: 'perempuan', label: 'Perempuan (P)', color: '#10B981', unit: 'siswa' }
            ]}
            orientation="horizontal"
            stacked={true}
          />

          <ComparativeBarChart
            title={`11. Diagram Batang: Evaluasi Kelengkapan Biodata 59 Kolom (Rata-rata ${analytics.kelengkapanBiodata.rataRataPersen}%)`}
            subtitle="Klasifikasi keterisian 59 kolom Buku Induk Siswa pada populasi terfilter"
            data={[
              {
                id: 'lengkap',
                label: 'Lengkap (≥90%)',
                subLabel: '53–59 kolom terisi',
                values: { jumlah: analytics.kelengkapanBiodata.lengkapCount }
              },
              {
                id: 'cukup',
                label: 'Cukup (70–89%)',
                subLabel: '41–52 kolom terisi',
                values: { jumlah: analytics.kelengkapanBiodata.cukupCount }
              },
              {
                id: 'belum',
                label: 'Perlu Dilengkapi (<70%)',
                subLabel: '<41 kolom terisi',
                values: { jumlah: analytics.kelengkapanBiodata.belumLengkapCount }
              }
            ]}
            series={[
              {
                key: 'jumlah',
                label: 'Jumlah Siswa',
                color: '#10B981',
                unit: 'siswa'
              }
            ]}
            orientation="vertical"
            height={220}
          />
        </div>
      </div>
    </div>
  );
};
