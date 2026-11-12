import React, { useState, useEffect, useMemo } from 'react';
import { Siswa } from '../../types';
import { getSiswaList, recordExportLog } from '../../services/dataService';
import { exportStudentsToExcel } from '../../services/excelService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { ZeroPillBadge } from '../../components/common/ZeroPillBadge';
import { PageTitle } from '../../components/common/PageTitle';
import { DataTable, Column } from '../../components/common/ModernTable';
import { FilterDropdown } from '../../components/common/FilterDropdown';
import { StudentLifecycleModal } from '../../components/modals/StudentLifecycleModal';
import {
  Layers,
  Download,
  Users,
  GraduationCap,
  UserCheck,
  UserMinus,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';
import { formatDateDMY, inferStudentAngkatan } from '../../utils/formatters';

export const AngkatanPage: React.FC = () => {
  const { adminUser, role } = useAuth();
  const { error: notifyError } = useNotification();
  const [students, setStudents] = useState<Siswa[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedAngkatan, setSelectedAngkatan] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedStudent, setSelectedStudent] = useState<Siswa | null>(null);

  const loadData = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const list = await getSiswaList();
      setStudents(list);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal memuat data angkatan siswa.';
      setLoadError(msg);
      notifyError('Gagal Memuat', msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const cohortSummaries = useMemo(() => {
    const map = new Map<
      string,
      { angkatan: string; total: number; aktif: number; lulus: number; mutasiKeluar: number }
    >();

    students.forEach(s => {
      const angk = inferStudentAngkatan(
        s.tingkat_kelas || s.rombel,
        s.angkatan || s.tahun_masuk,
        s.status
      );
      if (!map.has(angk)) {
        map.set(angk, { angkatan: angk, total: 0, aktif: 0, lulus: 0, mutasiKeluar: 0 });
      }
      const item = map.get(angk)!;
      item.total += 1;
      if (s.status === 'aktif' || s.status === 'mutasi_masuk') item.aktif += 1;
      else if (s.status === 'lulus') item.lulus += 1;
      else if (s.status === 'mutasi_keluar') item.mutasiKeluar += 1;
    });

    return Array.from(map.values()).sort((a, b) => b.angkatan.localeCompare(a.angkatan));
  }, [students]);

  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      const angk = inferStudentAngkatan(
        s.tingkat_kelas || s.rombel,
        s.angkatan || s.tahun_masuk,
        s.status
      );
      if (selectedAngkatan !== 'all' && angk !== selectedAngkatan) return false;
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      return true;
    });
  }, [students, selectedAngkatan, statusFilter]);

  const handleExportCohort = async () => {
    const prefix =
      selectedAngkatan === 'all'
        ? 'Data_Siswa_Seluruh_Angkatan_SIPDS'
        : `Data_Siswa_Angkatan_${selectedAngkatan}_SIPDS`;
    exportStudentsToExcel(filteredStudents, { fileNamePrefix: prefix });
    await recordExportLog({
      exported_by_name: adminUser?.nama_lengkap || 'Admin Sekolah',
      exported_by_role: role || 'admin',
      export_type: `Siswa Berdasarkan Angkatan (${selectedAngkatan})`,
      filter_summary: { angkatan: selectedAngkatan, status: statusFilter },
      total_records: filteredStudents.length,
      file_name: `${prefix}.xlsx`
    });
  };

  const columns: Column<Siswa>[] = [
    {
      header: 'Angkatan',
      render: s => {
        const angk = inferStudentAngkatan(
          s.tingkat_kelas || s.rombel,
          s.angkatan || s.tahun_masuk,
          s.status
        );
        return (
          <span className="font-mono font-extrabold text-[#6366F1] bg-indigo-50 border border-indigo-200/70 px-2.5 py-1 rounded-lg text-xs">
            Angkatan {angk}
          </span>
        );
      },
      className: 'w-36 whitespace-nowrap'
    },
    {
      header: 'NIS',
      accessor: 'nis',
      isMono: true,
      className: 'w-28 whitespace-nowrap'
    },
    {
      header: 'NISN',
      accessor: 'nisn',
      isMono: true,
      className: 'w-32 whitespace-nowrap font-bold text-[#101D35]'
    },
    {
      header: 'Nama Lengkap Siswa',
      render: s => (
        <button
          type="button"
          onClick={() => setSelectedStudent(s)}
          className="font-bold text-[#101D35] hover:text-[#315FEA] transition-colors text-left"
        >
          {s.nama_lengkap}
        </button>
      )
    },
    {
      header: 'Kelas Terakhir',
      render: s => <span className="font-semibold text-slate-800">Kelas {s.rombel}</span>,
      className: 'w-32 whitespace-nowrap'
    },
    {
      header: 'Tanggal Masuk',
      render: s => <span className="font-mono text-slate-600">{formatDateDMY(s.tanggal_masuk)}</span>,
      className: 'w-32 whitespace-nowrap'
    },
    {
      header: 'Status',
      render: s => <ZeroPillBadge status={s.status} />,
      className: 'w-32 whitespace-nowrap'
    },
    {
      header: 'Tahun Lulus',
      render: s => (
        <span className="font-mono font-bold text-[#10B981]">
          {s.tahun_lulus || (s.status === 'lulus' ? 'Lulus' : '-')}
        </span>
      ),
      className: 'w-28 whitespace-nowrap'
    },
    {
      header: 'Aksi',
      align: 'right',
      render: s => (
        <button
          type="button"
          onClick={() => setSelectedStudent(s)}
          className="px-3 py-1.5 rounded-xl bg-[#EEF3FF] hover:bg-[#315FEA] text-[#315FEA] hover:text-white font-semibold text-xs transition-colors"
        >
          Detail &amp; Riwayat
        </button>
      ),
      className: 'w-36 whitespace-nowrap'
    }
  ];

  return (
    <div className="space-y-6">
      <PageTitle
        category="Akademik & Buku Induk"
        title="Data Siswa Lintas Angkatan"
        subtitle="Pemetaan angkatan siswa aktif: Kelas 9 = Angkatan 2024, Kelas 8 = Angkatan 2025, dan Kelas 7 = Angkatan 2026. Identitas angkatan bersifat tetap hingga siswa lulus."
        icon={Layers}
        actions={
          <>
            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200/90 hover:bg-slate-50 rounded-xl flex items-center gap-1.5 transition-all shadow-2xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Muat Ulang</span>
            </button>
            <button
              type="button"
              onClick={handleExportCohort}
              disabled={filteredStudents.length === 0}
              className="px-4 py-2 rounded-xl bg-[#315FEA] hover:bg-[#274ED0] disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 transition-all shadow-xs"
            >
              <Download className="w-4 h-4" />
              <span>Export Excel Angkatan ({filteredStudents.length.toLocaleString('id-ID')})</span>
            </button>
          </>
        }
      />

      {loadError && (
        <div className="p-4 bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-2xl flex items-center justify-between gap-4 text-xs text-rose-950">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-[#EF4444] shrink-0" />
            <span>{loadError}</span>
          </div>
          <button
            type="button"
            onClick={loadData}
            className="px-3 py-1.5 bg-[#EF4444] text-white rounded-xl font-semibold"
          >
            Coba Lagi
          </button>
        </div>
      )}

      {/* Cohort Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => setSelectedAngkatan('all')}
          className={`p-4 rounded-2xl border text-left transition-all ${
            selectedAngkatan === 'all'
              ? 'bg-[#101D35] text-white border-[#101D35] shadow-md'
              : 'bg-white text-[#101D35] border-slate-200/80 hover:border-[#315FEA]/50 shadow-[0_2px_10px_-3px_rgba(16,29,53,0.05)]'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider opacity-80">
              Seluruh Angkatan
            </span>
            <Users className="w-4 h-4 opacity-80" />
          </div>
          <div className="text-2xl font-extrabold font-mono mt-2 tabular-nums">
            {students.length.toLocaleString('id-ID')}
          </div>
          <div className="text-[11px] opacity-80 mt-1">
            {cohortSummaries.length} Tahun Angkatan Terdaftar
          </div>
        </button>

        {cohortSummaries.map(c => (
          <button
            key={c.angkatan}
            type="button"
            onClick={() => setSelectedAngkatan(c.angkatan)}
            className={`p-4 rounded-2xl border text-left transition-all ${
              selectedAngkatan === c.angkatan
                ? 'bg-[#315FEA] text-white border-[#315FEA] shadow-md'
                : 'bg-white text-[#101D35] border-slate-200/80 hover:border-[#315FEA]/50 shadow-[0_2px_10px_-3px_rgba(16,29,53,0.05)]'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold font-mono">ANGKATAN {c.angkatan}</span>
              <Layers className="w-4 h-4 opacity-80" />
            </div>
            <div className="text-2xl font-extrabold font-mono mt-1.5 tabular-nums">
              {c.total.toLocaleString('id-ID')} Siswa
            </div>
            <div className="flex items-center gap-3 text-[11px] mt-1.5 opacity-90 font-medium">
              <span className="inline-flex items-center gap-1">
                <UserCheck className="w-3 h-3" /> Aktif: {c.aktif}
              </span>
              <span className="inline-flex items-center gap-1">
                <GraduationCap className="w-3 h-3" /> Lulus: {c.lulus}
              </span>
              <span className="inline-flex items-center gap-1">
                <UserMinus className="w-3 h-3" /> Mutasi: {c.mutasiKeluar}
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* DataTable with Search, FilterDropdown, and Full Pagination */}
      <DataTable
        data={filteredStudents}
        columns={columns}
        keyExtractor={s => s.id}
        isLoading={loading}
        searchPlaceholder="Cari nama, NIS, NISN, NIK, atau tahun angkatan..."
        searchFilter={(s, q) => {
          const angk = inferStudentAngkatan(
            s.tingkat_kelas || s.rombel,
            s.angkatan || s.tahun_masuk,
            s.status
          );
          return (
            s.nama_lengkap.toLowerCase().includes(q) ||
            (s.nis || '').toLowerCase().includes(q) ||
            (s.nisn || '').toLowerCase().includes(q) ||
            (s.nik_siswa || '').toLowerCase().includes(q) ||
            angk.toLowerCase().includes(q)
          );
        }}
        filterControls={
          <div className="flex flex-wrap items-center gap-2">
            <FilterDropdown
              showFilterIcon
              ariaLabel="Filter Angkatan"
              value={selectedAngkatan}
              onChange={setSelectedAngkatan}
              options={[
                { value: 'all', label: `Semua Angkatan (${students.length})` },
                ...cohortSummaries.map(c => ({
                  value: c.angkatan,
                  label: `Angkatan ${c.angkatan} (${c.total} Siswa)`
                }))
              ]}
            />

            <FilterDropdown
              ariaLabel="Filter Status"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'all', label: 'Semua Status Siswa' },
                { value: 'aktif', label: 'Aktif' },
                { value: 'lulus', label: 'Lulus (Alumni)' },
                { value: 'mutasi_masuk', label: 'Mutasi Masuk' },
                { value: 'mutasi_keluar', label: 'Mutasi Keluar' },
                { value: 'non_aktif', label: 'Non-Aktif' }
              ]}
            />
          </div>
        }
        emptyTitle="Tidak Ada Siswa pada Filter Angkatan Ini"
        emptyMessage="Ubah pilihan angkatan atau status siswa untuk menampilkan data."
      />

      <StudentLifecycleModal
        student={selectedStudent}
        onClose={() => setSelectedStudent(null)}
        onUpdated={loadData}
      />
    </div>
  );
};
