import React, { useEffect, useState, useMemo } from 'react';
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
import { useSchoolProfile } from '../../services/schoolService';
import { PageTitle } from '../../components/common/PageTitle';
import { LoadingSkeleton } from '../../components/common/LoadingSkeleton';
import { EmptyState } from '../../components/common/EmptyState';
import {
  UserCheck,
  UserPlus,
  ArrowRight,
  TrendingUp,
  FileSpreadsheet,
  AlertCircle,
  LayoutDashboard,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';

interface AdminDashboardProps {
  onNavigate: (menuId: string) => void;
}

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

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onNavigate }) => {
  const { profile: schoolProfile } = useSchoolProfile();
  const [students, setStudents] = useState<Siswa[]>([]);
  const [mutations, setMutations] = useState<Mutasi[]>([]);
  const [proposals, setProposals] = useState<PerubahanBiodata[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [importBatches, setImportBatches] = useState<ImportBatchRecord[]>([]);
  const [exportLogs, setExportLogs] = useState<ExportLogRecord[]>([]);
  const [filters, setFilters] = useState<DashboardFilterState>(getDefaultFilters);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadData = async (forceRefresh = false) => {
    setLoading(true);
    setLoadError(null);
    try {
      const bundle = await getAnalyticsDataBundle(forceRefresh);
      setStudents(bundle.students);
      setMutations(bundle.mutations);
      setProposals(bundle.proposals);
      setAuditLogs(bundle.auditLogs);
      setImportBatches(bundle.importBatches);
      setExportLogs(bundle.exportLogs);
    } catch (err: unknown) {
      setLoadError(
        err instanceof Error ? err.message : 'Gagal memuat data dashboard dari database.'
      );
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

  const recentAudits = useMemo(() => auditLogs.slice(0, 6), [auditLogs]);

  if (loading) {
    return (
      <div className="space-y-6">
        <LoadingSkeleton variant="card" count={1} />
        <LoadingSkeleton variant="stat" count={8} />
        <LoadingSkeleton variant="table" rows={5} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageTitle
        category="Ikhtisar & Analitik"
        title={`Dashboard SIPDS — ${schoolProfile.nama_sekolah}`}
        subtitle={`Tahun Ajaran ${schoolProfile.tahun_ajaran} (${schoolProfile.semester_aktif}). Seluruh indikator statistik dan grafik batang bulanan (Januari–Desember) dihitung langsung dari database aktual.`}
        icon={LayoutDashboard}
        actions={
          <>
            <button
              type="button"
              onClick={() => loadData(true)}
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200/90 hover:bg-slate-50 rounded-xl flex items-center gap-1.5 transition-all shadow-2xs whitespace-nowrap"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Muat Ulang</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('import-excel')}
              className="px-3.5 py-2 text-xs font-semibold text-[#101D35] bg-white border border-slate-200/90 hover:bg-slate-50 rounded-xl flex items-center gap-1.5 transition-all shadow-2xs whitespace-nowrap"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-[#10B981]" />
              <span>Import Excel</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('data-siswa')}
              className="px-4 py-2 text-xs font-bold bg-[#315FEA] hover:bg-[#274ED0] text-white rounded-xl flex items-center gap-1.5 transition-all shadow-xs whitespace-nowrap"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Kelola Data Siswa</span>
            </button>
          </>
        }
      />

      {loadError && (
        <div className="p-4 bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-2xl flex items-center justify-between gap-4 text-xs text-rose-950">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-[#EF4444] shrink-0" />
            <div>
              <div className="font-bold">Gagal Memuat Sebagian Data</div>
              <div className="text-rose-800">{loadError}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => loadData(true)}
            className="px-3 py-1.5 bg-[#EF4444] hover:bg-rose-700 text-white rounded-xl font-semibold whitespace-nowrap"
          >
            Coba Lagi
          </button>
        </div>
      )}

      {/* Welcome Institutional Hero Banner */}
      <div className="p-6 bg-gradient-to-r from-[#101D35] via-[#162747] to-[#315FEA] text-white rounded-2xl shadow-[0_8px_24px_-6px_rgba(16,29,53,0.22)] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-blue-200">
            Portal Tata Usaha &amp; Kesiswaan
          </span>
          <h2 className="text-lg sm:text-xl font-bold tracking-tight mt-1">
            Ringkasan Eksekutif Buku Induk, Mutasi &amp; Statistik Bulanan (Januari–Desember)
          </h2>
          <p className="text-xs text-slate-200/90 mt-1 max-w-2xl leading-relaxed">
            Membedakan secara akurat jumlah transaksi mutasi vs jumlah siswa unik, mengelompokkan aktivitas bulanan berdasarkan zona waktu Asia/Jakarta (WIB), serta mengabaikan transaksi yang dibatalkan.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            onClick={() => onNavigate('statistik')}
            className="px-4 py-2 text-xs font-bold bg-white text-[#101D35] hover:bg-slate-100 rounded-xl transition-colors whitespace-nowrap shadow-xs"
          >
            Buka Laporan Statistik Lengkap
          </button>
        </div>
      </div>

      {/* Pending Verification Alert if any */}
      {analytics.pendingVerifikasi > 0 && (
        <div className="p-4 bg-[#F59E0B]/10 border border-[#F59E0B]/30 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#F59E0B]/20 text-amber-900 flex items-center justify-center shrink-0">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-[#101D35]">
                Ada {analytics.pendingVerifikasi} pengajuan perubahan biodata dari orang tua siswa menunggu persetujuan
              </div>
              <div className="text-[11px] text-slate-600 mt-0.5">
                Periksa perbandingan data lama dan baru secara berdampingan sebelum memperbarui tabel Buku Induk Siswa.
              </div>
            </div>
          </div>
          <button
            onClick={() => onNavigate('verifikasi-perubahan')}
            className="px-4 py-2 bg-[#F59E0B] hover:bg-amber-600 text-white rounded-xl text-xs font-bold whitespace-nowrap transition-colors shadow-2xs"
          >
            Buka Verifikasi
          </button>
        </div>
      )}

      {/* Kartu Statistik + Grafik Batang Bulanan (Jan-Des) & Komparatif */}
      <AnalyticsChartsGrid
        analytics={analytics}
        filters={filters}
        onChangeFilters={setFilters}
        onResetFilters={() => setFilters(getDefaultFilters())}
        onNavigate={onNavigate}
      />

      {/* Quick Actions & Recent Audit Log */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-[0_2px_12px_-4px_rgba(16,29,53,0.06)] flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-[#101D35] text-sm mb-3 pb-2.5 border-b border-slate-100">
              Pintasan Operasional Kesiswaan
            </h3>

            <div className="space-y-2.5 text-xs">
              <button
                onClick={() => onNavigate('data-siswa')}
                className="w-full p-3 rounded-xl border border-slate-200/90 hover:border-[#315FEA]/40 hover:bg-[#EEF3FF]/40 flex items-center justify-between text-left transition-all"
              >
                <div className="flex items-center gap-2.5">
                  <UserPlus className="w-4 h-4 text-[#315FEA]" />
                  <span className="font-semibold text-[#101D35]">Kelola Buku Induk 59 Kolom</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              </button>

              <button
                onClick={() => onNavigate('import-excel')}
                className="w-full p-3 rounded-xl border border-slate-200/90 hover:border-[#10B981]/40 hover:bg-emerald-50/40 flex items-center justify-between text-left transition-all"
              >
                <div className="flex items-center gap-2.5">
                  <FileSpreadsheet className="w-4 h-4 text-[#10B981]" />
                  <span className="font-semibold text-[#101D35]">Import &amp; Update Excel/XLS</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              </button>

              <button
                onClick={() => onNavigate('mutasi-masuk')}
                className="w-full p-3 rounded-xl border border-slate-200/90 hover:border-[#F59E0B]/40 hover:bg-amber-50/40 flex items-center justify-between text-left transition-all"
              >
                <div className="flex items-center gap-2.5">
                  <TrendingUp className="w-4 h-4 text-[#F59E0B]" />
                  <span className="font-semibold text-[#101D35]">Pencatatan Mutasi Masuk &amp; Keluar</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              </button>

              <button
                onClick={() => onNavigate('akun-orang-tua')}
                className="w-full p-3 rounded-xl border border-slate-200/90 hover:border-[#6366F1]/40 hover:bg-indigo-50/40 flex items-center justify-between text-left transition-all"
              >
                <div className="flex items-center gap-2.5">
                  <UserCheck className="w-4 h-4 text-[#6366F1]" />
                  <span className="font-semibold text-[#101D35]">Aktivasi Akun NISN Orang Tua</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              </button>
            </div>
          </div>

          <div className="mt-5 pt-3 border-t border-slate-100 text-[11px] text-slate-400">
            {schoolProfile.nama_sekolah} · Sistem Informasi Pengelolaan Data Siswa
          </div>
        </div>

        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 p-5 shadow-[0_2px_12px_-4px_rgba(16,29,53,0.06)]">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-[#101D35] text-sm">
                Riwayat Aktivitas Terkini (Audit Log)
              </h3>
              <p className="text-xs text-slate-500">
                Pencatatan kronologis aktivitas sistem beserta rekaman nilai sebelum &amp; sesudah perubahan
              </p>
            </div>
            <button
              onClick={() => onNavigate('audit-log')}
              className="text-xs text-[#315FEA] hover:text-[#101D35] font-bold flex items-center gap-1 transition-colors"
            >
              <span>Lihat Semua Log</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {recentAudits.length === 0 ? (
            <EmptyState
              title="Belum Ada Aktivitas Tercatat"
              description="Aktivitas operasional kesiswaan akan muncul secara kronologis di sini."
            />
          ) : (
            <div className="mt-3 divide-y divide-slate-100 text-xs">
              {recentAudits.map(log => (
                <div key={log.id} className="py-3 flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-[#101D35]">{log.user_name}</span>
                      <span className="text-[10px] text-slate-400">({log.user_role})</span>
                      <span className="text-slate-300">·</span>
                      <span className="font-mono text-[#315FEA] font-semibold text-[11px]">
                        {log.action}
                      </span>
                    </div>
                    <p className="text-slate-600 text-xs mt-1">{log.details}</p>
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono tabular-nums whitespace-nowrap shrink-0">
                    {new Date(log.created_at).toLocaleDateString('id-ID', {
                      timeZone: 'Asia/Jakarta'
                    })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
