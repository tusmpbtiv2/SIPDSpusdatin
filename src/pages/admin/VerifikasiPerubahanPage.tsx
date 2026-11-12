import React, { useState, useEffect, useMemo } from 'react';
import { PerubahanBiodata, Siswa } from '../../types';
import {
  getPerubahanList,
  getSiswaList,
  reviewPerubahanItems,
  ItemReviewDecision
} from '../../services/dataService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { DataTable, Column } from '../../components/common/ModernTable';
import { StatusBadge } from '../../components/common/ZeroPillBadge';
import { PageTitle } from '../../components/common/PageTitle';
import { StatisticCard } from '../../components/common/StatCard';
import { VerificationDetailModal } from '../../components/admin/VerificationDetailModal';
import {
  CheckSquare,
  Eye,
  Filter,
  Calendar,
  ArrowRight,
  RotateCcw,
  UserCheck,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { formatDateDMY } from '../../utils/formatters';

export const VerifikasiPerubahanPage: React.FC = () => {
  const { adminUser, role } = useAuth();
  const { success, error: notifyError } = useNotification();

  const [list, setList] = useState<PerubahanBiodata[]>([]);
  const [students, setStudents] = useState<Siswa[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Filters: status, tanggal (mulai & akhir), nama, NIS, dan NISN
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [nameFilter, setNameFilter] = useState<string>('');
  const [nisFilter, setNisFilter] = useState<string>('');
  const [nisnFilter, setNisnFilter] = useState<string>('');

  const [selectedProposal, setSelectedProposal] = useState<PerubahanBiodata | null>(null);

  const canVerify = role === 'super_admin' || role === 'admin' || role === 'operator';

  const loadData = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [pList, sList] = await Promise.all([
        getPerubahanList(),
        getSiswaList()
      ]);
      setList(pList);
      setStudents(sList);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Tidak dapat mengambil daftar pengajuan perubahan biodata.';
      setLoadError(msg);
      notifyError('Gagal Memuat', msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const studentByNisn = useMemo(() => {
    const map = new Map<string, Siswa>();
    students.forEach(s => {
      if (s.nisn) map.set(s.nisn, s);
      if (s.id) map.set(s.id, s);
    });
    return map;
  }, [students]);

  const enrichedList = useMemo(() => {
    return list.map(item => {
      const st = studentByNisn.get(item.siswa_id) || studentByNisn.get(item.nisn);
      const resolvedNis = item.nis || st?.nis || '-';
      const resolvedRequester =
        item.requester_name ||
        st?.nama_wali ||
        st?.nama_ayah ||
        st?.nama_ibu ||
        'Orang Tua / Wali Siswa';
      return {
        ...item,
        nis: resolvedNis,
        requester_name: resolvedRequester
      };
    });
  }, [list, studentByNisn]);

  const filteredList = useMemo(() => {
    return enrichedList.filter(item => {
      if (statusFilter === 'all') {
        if (item.status === 'draft') return false;
      } else if (item.status !== statusFilter) {
        return false;
      }

      if (dateFrom) {
        const subDate = item.submitted_at.slice(0, 10);
        if (subDate < dateFrom) return false;
      }

      if (dateTo) {
        const subDate = item.submitted_at.slice(0, 10);
        if (subDate > dateTo) return false;
      }

      if (nameFilter.trim()) {
        const q = nameFilter.toLowerCase().trim();
        const matchSiswa = item.nama_siswa.toLowerCase().includes(q);
        const matchParent = (item.requester_name || '').toLowerCase().includes(q);
        if (!matchSiswa && !matchParent) return false;
      }

      if (nisFilter.trim()) {
        const q = nisFilter.toLowerCase().trim();
        if (!(item.nis || '').toLowerCase().includes(q)) return false;
      }

      if (nisnFilter.trim()) {
        const q = nisnFilter.toLowerCase().trim();
        if (!item.nisn.toLowerCase().includes(q)) return false;
      }

      return true;
    });
  }, [enrichedList, statusFilter, dateFrom, dateTo, nameFilter, nisFilter, nisnFilter]);

  const resetFilters = () => {
    setStatusFilter('all');
    setDateFrom('');
    setDateTo('');
    setNameFilter('');
    setNisFilter('');
    setNisnFilter('');
  };

  const handleReviewItems = async (
    id: string,
    itemDecisions: Record<string, ItemReviewDecision>,
    catatan: string,
    forceOverride: boolean
  ) => {
    if (!adminUser) return;
    const finalStatus = await reviewPerubahanItems(
      id,
      {
        id: adminUser.id,
        name: adminUser.nama_lengkap,
        role: adminUser.role
      },
      itemDecisions,
      catatan,
      forceOverride
    );

    if (finalStatus === 'approved') {
      success('Pengajuan Disetujui', 'Seluruh perubahan data siswa telah diterapkan ke Buku Induk.');
    } else if (finalStatus === 'partially_approved') {
      success('Disetujui Sebagian', 'Kolom yang disetujui telah diperbarui pada Buku Induk Siswa.');
    } else {
      success('Pengajuan Ditolak', 'Pengajuan perubahan biodata telah ditolak beserta alasan penolakan.');
    }
    await loadData();
  };

  const stats = useMemo(() => {
    const nonDraft = enrichedList.filter(i => i.status !== 'draft');
    return {
      total: nonDraft.length,
      pending: nonDraft.filter(i => i.status === 'pending').length,
      approved: nonDraft.filter(
        i => i.status === 'approved' || i.status === 'partially_approved'
      ).length,
      rejected: nonDraft.filter(i => i.status === 'rejected').length
    };
  }, [enrichedList]);

  const columns: Column<PerubahanBiodata>[] = [
    {
      header: 'Tanggal Pengajuan',
      render: item => (
        <div className="text-xs">
          <div className="font-mono font-semibold text-[#101D35]">
            {formatDateDMY(item.submitted_at)}
          </div>
          <div className="font-mono text-[10px] text-slate-400">
            {new Date(item.submitted_at).toLocaleTimeString('id-ID', {
              hour: '2-digit',
              minute: '2-digit'
            })}
          </div>
        </div>
      ),
      className: 'w-32 whitespace-nowrap'
    },
    {
      header: 'Orang Tua / Pengaju',
      render: item => (
        <div className="text-xs">
          <div className="font-bold text-[#101D35] flex items-center gap-1.5">
            <UserCheck className="w-3.5 h-3.5 text-[#315FEA] shrink-0" />
            <span>{item.requester_name || 'Orang Tua / Wali'}</span>
          </div>
          <div className="text-[11px] text-slate-500">
            {item.requester_relation || 'Wali Siswa'}
          </div>
        </div>
      ),
      className: 'w-44'
    },
    {
      header: 'Identitas Siswa',
      render: item => (
        <div className="text-xs">
          <div className="font-bold text-[#101D35]">{item.nama_siswa}</div>
          <div className="text-[11px] font-mono text-slate-600">
            NIS: <strong className="text-slate-800">{item.nis || '-'}</strong> · NISN:{' '}
            <strong className="text-slate-800">{item.nisn}</strong>
          </div>
          <div className="text-[10px] font-semibold text-[#315FEA]">Kelas {item.kelas}</div>
        </div>
      ),
      className: 'w-52'
    },
    {
      header: 'Jml Kolom',
      render: item => {
        const count = Object.keys(item.fields_changed).length;
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-[#315FEA]/10 border border-[#315FEA]/20 text-[#315FEA] font-mono text-xs font-bold whitespace-nowrap">
            {count} Kolom
          </span>
        );
      },
      className: 'w-24 text-center'
    },
    {
      header: 'Data Lama vs Data Baru (Berdampingan)',
      render: item => {
        const entries = Object.entries(item.fields_changed);
        const previewEntries = entries.slice(0, 2);
        const remaining = entries.length - previewEntries.length;

        return (
          <div className="space-y-1.5 min-w-[290px] max-w-md">
            {previewEntries.map(([key, diff]) => (
              <div
                key={key}
                className="p-2.5 rounded-xl bg-slate-50/90 border border-slate-200/90 text-[11px]"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-[#101D35]">{diff.label}</span>
                  {diff.item_status && diff.item_status !== 'pending' && (
                    <span
                      className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-md ${
                        diff.item_status === 'approved'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {diff.item_status === 'approved' ? 'Disetujui' : 'Ditolak'}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-11 gap-1.5 items-center">
                  <div className="col-span-5 px-2 py-1 rounded-lg bg-rose-50/80 border border-rose-200 text-rose-900 truncate">
                    <span className="text-[9px] uppercase font-bold text-rose-500 block">
                      Lama
                    </span>
                    <span className="font-mono">{diff.old_value || '-'}</span>
                  </div>
                  <div className="col-span-1 flex justify-center text-slate-400">
                    <ArrowRight className="w-3 h-3" />
                  </div>
                  <div className="col-span-5 px-2 py-1 rounded-lg bg-emerald-50/80 border border-emerald-200 text-emerald-950 truncate">
                    <span className="text-[9px] uppercase font-bold text-emerald-600 block">
                      Baru
                    </span>
                    <span className="font-mono font-bold">{diff.new_value}</span>
                  </div>
                </div>
              </div>
            ))}
            {remaining > 0 && (
              <div className="text-[11px] font-semibold text-[#315FEA] pl-1">
                + {remaining} kolom lainnya (klik Periksa untuk melihat semua)
              </div>
            )}
          </div>
        );
      }
    },
    {
      header: 'Catatan & Alasan',
      render: item => (
        <div className="text-xs space-y-1 max-w-xs">
          <div className="text-slate-700 line-clamp-2">
            <span className="font-semibold text-slate-500">Pengaju:</span> {item.alasan}
          </div>
          {item.catatan_verifikator && (
            <div className="text-[11px] text-[#315FEA] bg-[#315FEA]/5 border border-[#315FEA]/20 rounded-lg px-2 py-1 line-clamp-2">
              <span className="font-bold">Admin:</span> {item.catatan_verifikator}
            </div>
          )}
        </div>
      )
    },
    {
      header: 'Status',
      render: item => <StatusBadge status={item.status} />
    },
    {
      header: 'Aksi',
      align: 'right',
      render: item => (
        <button
          type="button"
          onClick={() => setSelectedProposal(item)}
          className="px-3.5 py-1.5 rounded-xl bg-[#315FEA] hover:bg-[#244CD2] text-white font-semibold text-xs inline-flex items-center gap-1.5 transition-colors shadow-2xs whitespace-nowrap cursor-pointer"
        >
          {item.status === 'pending' && canVerify ? (
            <>
              <CheckSquare className="w-3.5 h-3.5" />
              <span>Verifikasi</span>
            </>
          ) : (
            <>
              <Eye className="w-3.5 h-3.5" />
              <span>Detail</span>
            </>
          )}
        </button>
      )
    }
  ];

  const selectedCurrentStudent = useMemo(() => {
    if (!selectedProposal) return null;
    return (
      studentByNisn.get(selectedProposal.siswa_id) ||
      studentByNisn.get(selectedProposal.nisn) ||
      null
    );
  }, [selectedProposal, studentByNisn]);

  return (
    <div className="space-y-6">
      <PageTitle
        category="Mutasi & Verifikasi"
        title="Verifikasi Perubahan Biodata Siswa"
        subtitle="Tinjau usulan perubahan biodata dari Orang Tua/Wali secara berdampingan (Setujui Semua, Tolak Semua, atau Setujui/Tolak Sebagian Kolom)."
        icon={CheckSquare}
        actions={
          <button
            type="button"
            onClick={loadData}
            className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#315FEA]' : ''}`} />
            <span>Muat Ulang</span>
          </button>
        }
      />

      {loadError && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-rose-900">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold">Gagal Memuat Daftar Pengajuan Perubahan</h4>
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

      {/* KPI Ringkasan Verifikasi */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatisticCard
          title="Total Usulan Masuk"
          value={stats.total}
          subtitle="Seluruh pengajuan orang tua/wali"
          icon={Filter}
          accent="blue"
          onClick={() => setStatusFilter('all')}
        />
        <StatisticCard
          title="Menunggu Verifikasi"
          value={stats.pending}
          subtitle="Perlu segera ditinjau admin"
          icon={Clock}
          accent="amber"
          onClick={() => setStatusFilter('pending')}
        />
        <StatisticCard
          title="Disetujui (Utuh / Sebagian)"
          value={stats.approved}
          subtitle="Telah diperbarui ke Buku Induk"
          icon={CheckCircle2}
          accent="emerald"
          onClick={() => setStatusFilter('approved')}
        />
        <StatisticCard
          title="Ditolak"
          value={stats.rejected}
          subtitle="Ditolak beserta catatan alasan"
          icon={XCircle}
          accent="rose"
          onClick={() => setStatusFilter('rejected')}
        />
      </div>

      {/* Panel Filter Lengkap: Status, Tanggal, Nama, NIS, dan NISN */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-[0_1px_3px_rgba(16,29,53,0.05)] space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-[#101D35]">
            <Filter className="w-3.5 h-3.5 text-[#315FEA]" />
            <span>Filter Usulan Perubahan (Status, Tanggal, Nama, NIS, &amp; NISN)</span>
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
              Status Pengajuan
            </label>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="w-full py-2 px-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-[#315FEA]/20 focus:border-[#315FEA]"
            >
              <option value="all">Semua Usulan Masuk</option>
              <option value="pending">Pending (Menunggu)</option>
              <option value="partially_approved">Disetujui Sebagian</option>
              <option value="approved">Disetujui Semua</option>
              <option value="rejected">Ditolak</option>
              <option value="cancelled">Dibatalkan</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              Dari Tanggal
            </label>
            <div className="relative">
              <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#315FEA]/20 focus:border-[#315FEA]"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              Sampai Tanggal
            </label>
            <div className="relative">
              <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#315FEA]/20 focus:border-[#315FEA]"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              Filter Nama Siswa / Ortu
            </label>
            <input
              type="text"
              value={nameFilter}
              onChange={e => setNameFilter(e.target.value)}
              placeholder="Ketik nama siswa/ortu..."
              className="w-full py-2 px-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#315FEA]/20 focus:border-[#315FEA]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              Filter NIS
            </label>
            <input
              type="text"
              value={nisFilter}
              onChange={e => setNisFilter(e.target.value)}
              placeholder="Nomor Induk Siswa..."
              className="w-full py-2 px-3 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#315FEA]/20 focus:border-[#315FEA]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              Filter NISN
            </label>
            <input
              type="text"
              value={nisnFilter}
              onChange={e => setNisnFilter(e.target.value)}
              placeholder="10 digit NISN..."
              className="w-full py-2 px-3 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#315FEA]/20 focus:border-[#315FEA]"
            />
          </div>
        </div>
      </div>

      <DataTable
        data={filteredList}
        columns={columns}
        keyExtractor={item => item.id}
        isLoading={loading}
        searchPlaceholder="Pencarian cepat nama siswa, orang tua, NIS, NISN, atau catatan..."
        searchFilter={(item, q) =>
          Boolean(
            item.nama_siswa.toLowerCase().includes(q) ||
              (item.nis && item.nis.toLowerCase().includes(q)) ||
              item.nisn.toLowerCase().includes(q) ||
              (item.requester_name && item.requester_name.toLowerCase().includes(q)) ||
              item.alasan.toLowerCase().includes(q)
          )
        }
        emptyTitle="Tidak Ada Pengajuan Perubahan"
        emptyMessage="Belum ada usulan perubahan biodata siswa yang sesuai dengan kriteria filter."
      />

      <VerificationDetailModal
        proposal={selectedProposal}
        currentStudent={selectedCurrentStudent}
        canVerify={canVerify}
        onClose={() => setSelectedProposal(null)}
        onReviewItems={handleReviewItems}
      />
    </div>
  );
};
