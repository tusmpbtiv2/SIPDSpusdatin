import React, { useState, useEffect, useMemo } from 'react';
import {
  Mutasi,
  Siswa,
  StudentClassHistoryRecord,
  OUTGOING_MUTATION_CATEGORIES
} from '../../types';
import {
  getMutasiList,
  getSiswaList,
  processMutasiKeluar,
  cancelMutasiTransaction,
  getStudentClassHistory,
  MutasiKeluarPayload
} from '../../services/dataService';
import { exportMutationsToExcel } from '../../services/excelService';
import { CLASS_ROSTER } from '../../config/school';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { DataTable, Column } from '../../components/common/ModernTable';
import { StatusBadge } from '../../components/common/ZeroPillBadge';
import { PageTitle } from '../../components/common/PageTitle';
import { StatisticCard } from '../../components/common/StatCard';
import { NewMutasiModal } from '../../components/admin/NewMutasiModal';
import { MutasiDetailModal } from '../../components/admin/MutasiDetailModal';
import { ImportExcelPage } from './ImportExcelPage';
import {
  UserMinus,
  Download,
  Eye,
  Filter,
  History,
  RotateCcw,
  Calendar,
  FileSpreadsheet,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { formatDateDMY } from '../../utils/formatters';

export const MutasiKeluarPage: React.FC = () => {
  const { adminUser, role } = useAuth();
  const { success, error: notifyError } = useNotification();

  const [mutasiList, setMutasiList] = useState<Mutasi[]>([]);
  const [students, setStudents] = useState<Siswa[]>([]);
  const [classHistory, setClassHistory] = useState<StudentClassHistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'transaksi' | 'riwayat_kelas' | 'import_excel'>('transaksi');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedMutation, setSelectedMutation] = useState<Mutasi | null>(null);

  // Filters
  const [kategoriFilter, setKategoriFilter] = useState<string>('all');
  const [kelasFilter, setKelasFilter] = useState<string>('all');
  const [tahunAjaranFilter, setTahunAjaranFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  const canCreate = role === 'super_admin' || role === 'admin' || role === 'operator';
  const canCancel = role === 'super_admin' || role === 'admin';

  const loadData = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [mList, sList, cHistory] = await Promise.all([
        getMutasiList('keluar'),
        getSiswaList(),
        getStudentClassHistory()
      ]);
      setMutasiList(mList);
      setStudents(sList);
      setClassHistory(cHistory);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Tidak dapat mengambil data mutasi keluar.';
      setLoadError(msg);
      notifyError('Gagal Memuat Data', msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredMutasi = useMemo(() => {
    return mutasiList.filter(m => {
      const kat = m.kategori_mutasi || 'Pindah sekolah';
      if (kategoriFilter !== 'all' && kat !== kategoriFilter) return false;
      if (kelasFilter !== 'all' && m.kelas !== kelasFilter) return false;
      if (tahunAjaranFilter !== 'all' && (m.tahun_ajaran || '2025/2026') !== tahunAjaranFilter)
        return false;
      if (statusFilter !== 'all' && m.status !== statusFilter) return false;
      if (dateFrom && m.tanggal_mutasi < dateFrom) return false;
      if (dateTo && m.tanggal_mutasi > dateTo) return false;
      return true;
    });
  }, [mutasiList, kategoriFilter, kelasFilter, tahunAjaranFilter, statusFilter, dateFrom, dateTo]);

  const handleSaveMutasiKeluar = async (payload: MutasiKeluarPayload) => {
    if (!adminUser) return;
    await processMutasiKeluar(payload, {
      id: adminUser.id,
      name: adminUser.nama_lengkap,
      role: adminUser.role
    });
    success(
      'Mutasi Keluar Dikonfirmasi',
      `Transaksi mutasi keluar (${payload.kategori_mutasi}) telah dicatat dan status siswa telah diubah menjadi nonaktif tanpa menghapus biodata.`
    );
    await loadData();
  };

  const handleCancelMutation = async (mutationId: string, cancelReason: string) => {
    if (!adminUser) return;
    await cancelMutasiTransaction(mutationId, cancelReason, {
      id: adminUser.id,
      name: adminUser.nama_lengkap,
      role: adminUser.role
    });
    success(
      'Transaksi Mutasi Keluar Dibatalkan',
      'Status siswa telah dikembalikan menjadi AKTIF kembali dan dicatat di Audit Log.'
    );
    await loadData();
  };

  const resetFilters = () => {
    setKategoriFilter('all');
    setKelasFilter('all');
    setTahunAjaranFilter('all');
    setStatusFilter('all');
    setDateFrom('');
    setDateTo('');
  };

  // Kolom Utama Mutasi Keluar: KELAS | NIS | NAMA LENGKAP SISWA | Tanggal Pindah | Alasan Pindah | Sekolah Tujuan (+ Jenis, Status & Aksi)
  const columns: Column<Mutasi>[] = [
    {
      header: 'KELAS',
      render: m => (
        <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 font-bold text-xs">
          Kelas {m.kelas}
        </span>
      ),
      className: 'whitespace-nowrap w-24'
    },
    {
      header: 'NIS / NISN',
      render: m => (
        <div>
          <div className="font-mono font-bold text-[#101D35]">{m.nis || '-'}</div>
          <div className="font-mono text-[10px] text-slate-500">NISN: {m.nisn || '-'}</div>
        </div>
      ),
      className: 'whitespace-nowrap w-36'
    },
    {
      header: 'NAMA LENGKAP SISWA',
      render: m => (
        <div>
          <div className="font-bold text-[#101D35]">{m.nama_siswa}</div>
          <div className="text-[11px] text-slate-500">
            <span className="font-semibold text-amber-900">
              {m.kategori_mutasi || 'Pindah sekolah'}
            </span>{' '}
            · TA {m.tahun_ajaran || '2025/2026'}
          </div>
        </div>
      ),
      className: 'whitespace-nowrap'
    },
    {
      header: 'Tanggal Pindah',
      render: m => formatDateDMY(m.tanggal_mutasi),
      isMono: true,
      className: 'whitespace-nowrap w-32 font-semibold text-slate-800'
    },
    {
      header: 'Alasan Pindah',
      render: m => (
        <div className="text-xs text-slate-700 max-w-xs">
          <div className="line-clamp-2">{m.alasan || '-'}</div>
          {m.keterangan && (
            <div className="text-[10px] text-slate-400 truncate">Ket: {m.keterangan}</div>
          )}
        </div>
      )
    },
    {
      header: 'Sekolah Tujuan',
      render: m => (
        <div className="text-xs">
          <div className="font-semibold text-slate-800">{m.sekolah_tujuan || '-'}</div>
          {(m.npsn_sekolah || m.kabupaten_sekolah || m.provinsi_sekolah) && (
            <div className="text-[11px] text-slate-500">
              {m.npsn_sekolah ? `NPSN: ${m.npsn_sekolah}` : ''}
              {m.kabupaten_sekolah ? ` · ${m.kabupaten_sekolah}` : ''}
              {m.provinsi_sekolah ? `, ${m.provinsi_sekolah}` : ''}
            </div>
          )}
        </div>
      )
    },
    {
      header: 'Status',
      render: m => <StatusBadge status={m.status} />,
      className: 'w-28'
    },
    {
      header: 'Aksi',
      align: 'right',
      render: m => (
        <button
          type="button"
          onClick={() => setSelectedMutation(m)}
          className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#101D35] font-semibold text-xs inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
        >
          <Eye className="w-3.5 h-3.5" />
          <span>Detail {canCancel && m.status !== 'dibatalkan' ? '/ Batal' : ''}</span>
        </button>
      ),
      className: 'w-36'
    }
  ];

  const studentMap = useMemo(() => {
    const map = new Map<string, Siswa>();
    students.forEach(s => map.set(s.id, s));
    return map;
  }, [students]);

  const outgoingClassHistory = useMemo(
    () =>
      classHistory.filter(
        h =>
          h.status_riwayat === 'mutasi' ||
          h.status_riwayat === 'lulus' ||
          (h.catatan && h.catatan.toLowerCase().includes('pembatalan'))
      ),
    [classHistory]
  );

  const stats = useMemo(() => {
    const total = mutasiList.length;
    const selesai = mutasiList.filter(m => m.status === 'selesai').length;
    const dibatalkan = mutasiList.filter(m => m.status === 'dibatalkan').length;
    return { total, selesai, dibatalkan };
  }, [mutasiList]);

  const historyColumns: Column<StudentClassHistoryRecord>[] = [
    {
      header: 'Tanggal Selesai / Keluar',
      render: h => (
        <span className="font-mono text-xs font-semibold text-slate-800">
          {formatDateDMY(h.tanggal_selesai || h.tanggal_mulai)}
        </span>
      ),
      className: 'w-36'
    },
    {
      header: 'NIS / NISN',
      render: h => {
        const st = studentMap.get(h.student_id);
        return (
          <span className="font-mono text-xs text-slate-700">
            {st?.nis || '-'} / {st?.nisn || '-'}
          </span>
        );
      },
      className: 'w-44'
    },
    {
      header: 'Nama Siswa',
      render: h => {
        const st = studentMap.get(h.student_id);
        return <span className="font-bold text-[#101D35]">{st?.nama_lengkap || h.student_id}</span>;
      }
    },
    {
      header: 'Kelas Terakhir',
      render: h => (
        <span className="px-2.5 py-0.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 font-bold text-xs">
          Kelas {h.kelas}
        </span>
      ),
      className: 'w-32'
    },
    {
      header: 'Status Riwayat',
      render: h => <StatusBadge status={h.status_riwayat} />,
      className: 'w-28'
    },
    {
      header: 'Keterangan Riwayat & Audit',
      render: h => <span className="text-xs text-slate-600">{h.catatan || '-'}</span>
    }
  ];

  return (
    <div className="space-y-6">
      <PageTitle
        category="Mutasi & Verifikasi"
        title="Mutasi Keluar Siswa"
        subtitle="Pencatatan siswa pindah/keluar sekolah tanpa menghapus biodata historis, mendukung pemulihan pembatalan mutasi, serta Import & Export Excel."
        icon={UserMinus}
        actions={
          <>
            {canCreate && (
              <button
                type="button"
                onClick={() => setActiveTab('import_excel')}
                className="px-3.5 py-2 text-xs font-semibold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Import Excel Mutasi Keluar</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => exportMutationsToExcel(filteredMutasi, { format: 'xlsx', jenis: 'keluar' })}
              disabled={filteredMutasi.length === 0}
              className="px-3.5 py-2 text-xs font-semibold text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Export XLSX ({filteredMutasi.length})</span>
            </button>

            <button
              type="button"
              onClick={() => exportMutationsToExcel(filteredMutasi, { format: 'csv', jenis: 'keluar' })}
              disabled={filteredMutasi.length === 0}
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>

            {canCreate && (
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-xl flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
              >
                <UserMinus className="w-3.5 h-3.5" />
                <span>Catat Mutasi Keluar</span>
              </button>
            )}
          </>
        }
      />

      {loadError && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-rose-900">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold">Gagal Memuat Data Mutasi Keluar</h4>
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

      {/* Ringkasan KPI Mutasi Keluar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatisticCard
          title="Total Mutasi Keluar"
          value={stats.total}
          subtitle="Seluruh catatan siswa keluar"
          icon={UserMinus}
          accent="amber"
        />
        <StatisticCard
          title="Status Selesai (Nonaktif)"
          value={stats.selesai}
          subtitle="Biodata tetap tersimpan di Buku Induk"
          icon={CheckCircle2}
          accent="blue"
        />
        <StatisticCard
          title="Dibatalkan / Dipulihkan"
          value={stats.dibatalkan}
          subtitle={`${outgoingClassHistory.length} rekaman riwayat kelas keluar`}
          icon={History}
          accent="indigo"
        />
      </div>

      {/* Tabs: Daftar Transaksi Mutasi Keluar vs Riwayat Mutasi/Pembatalan vs Import Excel */}
      <div className="flex items-center justify-between flex-wrap gap-2 bg-white p-2 rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(16,29,53,0.05)]">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setActiveTab('transaksi')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'transaksi'
                ? 'bg-[#101D35] text-white shadow-xs'
                : 'bg-transparent text-slate-600 hover:bg-slate-100'
            }`}
          >
            Daftar Mutasi Keluar ({filteredMutasi.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('riwayat_kelas')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'riwayat_kelas'
                ? 'bg-[#101D35] text-white shadow-xs'
                : 'bg-transparent text-slate-600 hover:bg-slate-100'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Riwayat Kelas &amp; Pembatalan ({outgoingClassHistory.length})</span>
          </button>
          {canCreate && (
            <button
              type="button"
              onClick={() => setActiveTab('import_excel')}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'import_excel'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-amber-50/80 text-amber-900 border border-amber-200 hover:bg-amber-100/80'
              }`}
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>Import Excel Mutasi Keluar</span>
            </button>
          )}
        </div>
      </div>

      {activeTab === 'import_excel' ? (
        <ImportExcelPage
          initialCategory="mutasi_keluar"
          onImportComplete={() => {
            loadData();
            setActiveTab('transaksi');
          }}
        />
      ) : activeTab === 'transaksi' ? (
        <>
          {/* Filter Panel */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-[0_1px_3px_rgba(16,29,53,0.05)] space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-[#101D35]">
                <Filter className="w-3.5 h-3.5 text-amber-600" />
                <span>Filter Data Mutasi Keluar (Jenis Mutasi, Kelas, Tahun Ajaran, Status, Tanggal)</span>
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

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Jenis Mutasi
                </label>
                <select
                  value={kategoriFilter}
                  onChange={e => setKategoriFilter(e.target.value)}
                  className="w-full py-2 px-3 bg-white border border-slate-200 rounded-xl text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-[#315FEA]/20 focus:border-[#315FEA]"
                >
                  <option value="all">Semua Jenis Mutasi</option>
                  {OUTGOING_MUTATION_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Kelas Terakhir
                </label>
                <select
                  value={kelasFilter}
                  onChange={e => setKelasFilter(e.target.value)}
                  className="w-full py-2 px-3 bg-white border border-slate-200 rounded-xl text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-[#315FEA]/20 focus:border-[#315FEA]"
                >
                  <option value="all">Semua Kelas</option>
                  {CLASS_ROSTER.map(r => (
                    <option key={r} value={r}>
                      Kelas {r}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Tahun Ajaran
                </label>
                <select
                  value={tahunAjaranFilter}
                  onChange={e => setTahunAjaranFilter(e.target.value)}
                  className="w-full py-2 px-3 bg-white border border-slate-200 rounded-xl font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#315FEA]/20 focus:border-[#315FEA]"
                >
                  <option value="all">Semua Tahun Ajaran</option>
                  <option value="2024/2025">2024/2025</option>
                  <option value="2025/2026">2025/2026</option>
                  <option value="2026/2027">2026/2027</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Status Transaksi
                </label>
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="w-full py-2 px-3 bg-white border border-slate-200 rounded-xl text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-[#315FEA]/20 focus:border-[#315FEA]"
                >
                  <option value="all">Semua Status</option>
                  <option value="selesai">Selesai (Nonaktif)</option>
                  <option value="dibatalkan">Dibatalkan (Dipulihkan)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Dari Tanggal Keluar
                </label>
                <div className="relative">
                  <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={e => setDateFrom(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#315FEA]/20 focus:border-[#315FEA]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Sampai Tanggal Keluar
                </label>
                <div className="relative">
                  <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                  <input
                    type="date"
                    value={dateTo}
                    onChange={e => setDateTo(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#315FEA]/20 focus:border-[#315FEA]"
                  />
                </div>
              </div>
            </div>
          </div>

          <DataTable
            data={filteredMutasi}
            columns={columns}
            keyExtractor={m => m.id}
            isLoading={loading}
            searchPlaceholder="Cari KELAS, NIS, NISN, NAMA LENGKAP SISWA, Jenis Mutasi, Alasan, atau Sekolah Tujuan..."
            searchFilter={(m, q) =>
              Boolean(
                m.nama_siswa.toLowerCase().includes(q) ||
                  (m.nis && m.nis.toLowerCase().includes(q)) ||
                  (m.nisn && m.nisn.toLowerCase().includes(q)) ||
                  (m.kelas && m.kelas.toLowerCase().includes(q)) ||
                  (m.kategori_mutasi && m.kategori_mutasi.toLowerCase().includes(q)) ||
                  (m.sekolah_tujuan && m.sekolah_tujuan.toLowerCase().includes(q)) ||
                  (m.alasan && m.alasan.toLowerCase().includes(q))
              )
            }
            emptyTitle="Belum Ada Mutasi Keluar"
            emptyMessage="Belum ada data siswa keluar yang sesuai dengan kriteria filter."
          />
        </>
      ) : (
        <DataTable
          data={outgoingClassHistory}
          columns={historyColumns}
          keyExtractor={h => h.id}
          isLoading={loading}
          searchPlaceholder="Cari nama siswa, NIS, NISN, kelas, atau catatan..."
          searchFilter={(h, q) => {
            const st = studentMap.get(h.student_id);
            return Boolean(
              (st?.nama_lengkap && st.nama_lengkap.toLowerCase().includes(q)) ||
                (st?.nis && st.nis.toLowerCase().includes(q)) ||
                (st?.nisn && st.nisn.toLowerCase().includes(q)) ||
                h.kelas.toLowerCase().includes(q) ||
                (h.catatan && h.catatan.toLowerCase().includes(q))
            );
          }}
          emptyTitle="Belum Ada Riwayat Mutasi Keluar"
          emptyMessage="Riwayat perubahan status kelas dan pembatalan mutasi akan muncul di sini."
        />
      )}

      <NewMutasiModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        defaultJenis="keluar"
        existingStudents={students}
        defaultPetugasName={adminUser?.nama_lengkap || 'Admin Tata Usaha'}
        onSaveKeluar={handleSaveMutasiKeluar}
      />

      <MutasiDetailModal
        mutation={selectedMutation}
        classHistory={classHistory}
        canCancel={canCancel}
        onClose={() => setSelectedMutation(null)}
        onCancelMutation={handleCancelMutation}
      />
    </div>
  );
};
