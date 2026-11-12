import React, { useState, useEffect, useMemo } from 'react';
import {
  getAnalyticsDataBundle,
  computeFilteredAnalytics,
  getCurrentJakartaYear
} from '../../services/dataService';
import {
  Siswa,
  Mutasi,
  PerubahanBiodata,
  AuditLog,
  ImportBatchRecord,
  ExportLogRecord,
  DashboardFilterState
} from '../../types';
import { AnalyticsChartsGrid } from '../../components/admin/AnalyticsChartsGrid';
import { PageTitle } from '../../components/common/PageTitle';
import { LoadingSkeleton } from '../../components/common/LoadingSkeleton';
import { EmptyState } from '../../components/common/EmptyState';
import { ComparativeBarChart, ComparativeDataItem } from '../../components/common/ComparativeBarChart';
import { BarChart3, RefreshCw, AlertTriangle } from 'lucide-react';

const getDefaultFilters = (): DashboardFilterState => ({
  tahunAjaran: 'all',
  selectedYear: 'all',
  semesterPeriod: 'all',
  selectedMonth: 'all',
  angkatan: 'all',
  kelas: 'all',
  jenjang: 'all',
  jenisKelamin: 'all',
  status: 'all',
  dateFrom: '',
  dateTo: ''
});

export const StatistikPage: React.FC = () => {
  const [students, setStudents] = useState<Siswa[]>([]);
  const [mutations, setMutations] = useState<Mutasi[]>([]);
  const [proposals, setProposals] = useState<PerubahanBiodata[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [importBatches, setImportBatches] = useState<ImportBatchRecord[]>([]);
  const [exportLogs, setExportLogs] = useState<ExportLogRecord[]>([]);
  const [filters, setFilters] = useState<DashboardFilterState>(getDefaultFilters);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadData = async (forceRefresh = false) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const bundle = await getAnalyticsDataBundle(forceRefresh);
      setStudents(bundle.students);
      setMutations(bundle.mutations);
      setProposals(bundle.proposals);
      setAuditLogs(bundle.auditLogs);
      setImportBatches(bundle.importBatches);
      setExportLogs(bundle.exportLogs);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memuat data statistik.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(false);
  }, []);

  const analytics = useMemo(
    () =>
      computeFilteredAnalytics(students, mutations, proposals, filters, {
        auditLogs,
        importBatches,
        exportLogs
      }),
    [students, mutations, proposals, filters, auditLogs, importBatches, exportLogs]
  );

  // Calculate religion distribution on filtered students
  const religionData = useMemo(() => {
    const counts: Record<string, { total: number; laki: number; perempuan: number }> = {};
    students.forEach(s => {
      if (filters.kelas !== 'all' && s.rombel !== filters.kelas) return;
      if (filters.jenisKelamin !== 'all' && s.jenis_kelamin !== filters.jenisKelamin) return;
      if (filters.angkatan && filters.angkatan !== 'all') {
        const sAngk = s.angkatan || (s.tanggal_masuk || '').slice(0, 4) || s.tahun_masuk;
        if (sAngk !== filters.angkatan) return;
      }
      if (filters.status !== 'all') {
        if (filters.status === 'aktif_group') {
          if (s.status !== 'aktif' && s.status !== 'mutasi_masuk') return;
        } else if (filters.status === 'nonaktif_group') {
          if (s.status === 'aktif' || s.status === 'mutasi_masuk') return;
        } else if (s.status !== filters.status) {
          return;
        }
      }
      const rel = s.agama || 'Islam';
      if (!counts[rel]) counts[rel] = { total: 0, laki: 0, perempuan: 0 };
      counts[rel].total += 1;
      if (s.jenis_kelamin === 'L') counts[rel].laki += 1;
      else counts[rel].perempuan += 1;
    });
    return counts;
  }, [students, filters.kelas, filters.jenisKelamin, filters.angkatan, filters.status]);

  const religionComparativeItems: ComparativeDataItem[] = useMemo(
    () =>
      Object.entries(religionData).map(([agama, val]) => ({
        id: agama,
        label: agama,
        subLabel: `${val.total} siswa`,
        values: {
          laki: val.laki,
          perempuan: val.perempuan,
          total: val.total
        }
      })),
    [religionData]
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <LoadingSkeleton variant="stat" count={8} />
        <LoadingSkeleton variant="card" count={2} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageTitle
        category="Ikhtisar & Analitik"
        title="Statistik & Analitik Komprehensif Data Siswa"
        subtitle="12 Kartu Indikator Utama, 4 Diagram Batang Bulanan (Januari–Desember, Zona Waktu Asia/Jakarta), dan 7 Diagram Batang Komparatif SMP Bhinneka Tunggal Ika."
        icon={BarChart3}
        actions={
          <button
            type="button"
            onClick={() => loadData(true)}
            className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200/90 hover:bg-slate-50 rounded-xl flex items-center gap-1.5 transition-all shadow-2xs whitespace-nowrap"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Muat Ulang Statistik</span>
          </button>
        }
      />

      {errorMsg && (
        <div className="p-4 bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-2xl flex items-center justify-between gap-4 text-xs text-rose-950">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-[#EF4444] shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => loadData(true)}
            className="px-3 py-1.5 bg-[#EF4444] text-white rounded-xl font-semibold whitespace-nowrap"
          >
            Coba Lagi
          </button>
        </div>
      )}

      <AnalyticsChartsGrid
        analytics={analytics}
        filters={filters}
        onChangeFilters={setFilters}
        onResetFilters={() => setFilters(getDefaultFilters())}
      />

      {/* Komposisi Agama dengan Diagram Batang Komparatif & Ringkasan */}
      {Object.keys(religionData).length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6">
          <EmptyState
            title="Belum Ada Data Agama Siswa"
            description="Komposisi agama akan muncul setelah data siswa tersedia."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ComparativeBarChart
            title="12. Diagram Batang: Komposisi Keberagaman Agama Siswa"
            subtitle="Perbandingan jumlah siswa Laki-laki dan Perempuan berdasarkan agama"
            data={religionComparativeItems}
            series={[
              { key: 'laki', label: 'Laki-laki (L)', color: '#315FEA', unit: 'siswa' },
              { key: 'perempuan', label: 'Perempuan (P)', color: '#EC4899', unit: 'siswa' }
            ]}
            orientation="vertical"
            height={220}
          />

          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-[0_1px_3px_0_rgba(16,29,53,0.04)] flex flex-col justify-between">
            <div>
              <h3 className="font-bold text-[#101D35] text-sm sm:text-base mb-1">
                Tabel Ringkasan Keberagaman Agama Siswa
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Rekapitulasi agama siswa sesuai Kartu Keluarga dan Buku Induk
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                {Object.entries(religionData).map(([agama, val]) => (
                  <div
                    key={agama}
                    className="p-3.5 rounded-xl bg-[#F5F7FB] border border-slate-200/80 text-center"
                  >
                    <span className="font-semibold text-slate-600 block">{agama}</span>
                    <span className="text-xl font-extrabold font-mono text-[#101D35] mt-1 block tabular-nums">
                      {val.total.toLocaleString('id-ID')}
                    </span>
                    <span className="text-[11px] font-mono text-[#315FEA] tabular-nums block">
                      L: {val.laki} · P: {val.perempuan} (
                      {analytics.totalSiswa > 0
                        ? `${Math.round((val.total / analytics.totalSiswa) * 100)}%`
                        : '0%'}
                      )
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400">
              Kolom Sumber: public.students (agama, jenis_kelamin)
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
