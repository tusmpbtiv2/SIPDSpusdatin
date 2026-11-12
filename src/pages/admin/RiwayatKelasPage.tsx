import React, { useState, useEffect, useMemo } from 'react';
import {
  Siswa,
  StudentClassHistoryRecord,
  AcademicYearRecord
} from '../../types';
import {
  getSiswaList,
  getAllClassHistoryList,
  getAcademicYearsList,
  saveClassHistoryPlacement,
  recordExportLog
} from '../../services/dataService';
import { exportClassHistoryToExcel } from '../../services/excelService';
import { CLASS_ROSTER } from '../../config/school';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { PageTitle } from '../../components/common/PageTitle';
import { DataTable, Column } from '../../components/common/ModernTable';
import { FilterDropdown } from '../../components/common/FilterDropdown';
import { StudentLifecycleModal } from '../../components/modals/StudentLifecycleModal';
import {
  BookOpen,
  Download,
  Plus,
  Layers,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';

interface CombinedHistoryRow {
  id: string;
  student: Siswa;
  tahun_ajaran: string;
  semester: string;
  angkatan: string;
  kelas: string;
  tingkat: string;
  kamar: string;
  status_riwayat: string;
  tanggal_mulai: string;
  catatan: string;
}

export const RiwayatKelasPage: React.FC = () => {
  const { adminUser, role } = useAuth();
  const { success, error: notifyError } = useNotification();

  const [students, setStudents] = useState<Siswa[]>([]);
  const [historyList, setHistoryList] = useState<StudentClassHistoryRecord[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYearRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [taFilter, setTaFilter] = useState<string>('all');
  const [kelasFilter, setKelasFilter] = useState<string>('all');
  const [selectedStudent, setSelectedStudent] = useState<Siswa | null>(null);

  // Form tambah penempatan kelas manual
  const [showAddModal, setShowAddModal] = useState(false);
  const [targetStudentId, setTargetStudentId] = useState('');
  const [inputTa, setInputTa] = useState('2025/2026');
  const [inputSemester, setInputSemester] = useState('Ganjil');
  const [inputKelas, setInputKelas] = useState('7A');
  const [inputStatus, setInputStatus] =
    useState<StudentClassHistoryRecord['status_riwayat']>('aktif');
  const [inputCatatan, setInputCatatan] = useState('');
  const [saving, setSaving] = useState(false);

  const canModify = role === 'super_admin' || role === 'admin' || role === 'operator';

  const loadData = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [stList, histList, ayList] = await Promise.all([
        getSiswaList(),
        getAllClassHistoryList(),
        getAcademicYearsList()
      ]);
      setStudents(stList);
      setHistoryList(histList);
      setAcademicYears(ayList);
      if (stList.length > 0 && !targetStudentId) {
        setTargetStudentId(stList[0].id);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal memuat riwayat kelas siswa.';
      setLoadError(msg);
      notifyError('Gagal Memuat', msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const studentMap = useMemo(() => {
    const m = new Map<string, Siswa>();
    students.forEach(s => m.set(s.id, s));
    return m;
  }, [students]);

  const combinedRows: CombinedHistoryRow[] = useMemo(() => {
    const rows: CombinedHistoryRow[] = [];
    const seenStudentTa = new Set<string>();

    historyList.forEach(h => {
      const st = studentMap.get(h.student_id);
      if (!st) return;
      const ta = h.tahun_ajaran || '2025/2026';
      seenStudentTa.add(`${st.id}__${ta}`);
      rows.push({
        id: h.id,
        student: st,
        tahun_ajaran: ta,
        semester: h.semester || 'Ganjil',
        angkatan: st.angkatan || st.tahun_masuk,
        kelas: h.kelas,
        tingkat: h.tingkat_kelas,
        kamar: h.kamar || st.kamar || '-',
        status_riwayat: h.status_riwayat,
        tanggal_mulai: h.tanggal_mulai,
        catatan: h.catatan || '-'
      });
    });

    students.forEach(st => {
      const defaultTa = st.tahun_ajaran_masuk || '2025/2026';
      if (!seenStudentTa.has(`${st.id}__${defaultTa}`)) {
        rows.push({
          id: `current-${st.id}`,
          student: st,
          tahun_ajaran: defaultTa,
          semester: 'Berjalan',
          angkatan: st.angkatan || st.tahun_masuk,
          kelas: st.rombel,
          tingkat: st.tingkat_kelas,
          kamar: st.kamar || '-',
          status_riwayat: st.status === 'lulus' ? 'lulus' : 'aktif',
          tanggal_mulai: st.tanggal_masuk || '-',
          catatan: 'Penempatan Kelas Induk'
        });
      }
    });

    return rows.filter(r => {
      if (taFilter !== 'all' && r.tahun_ajaran !== taFilter) return false;
      if (kelasFilter !== 'all' && r.kelas !== kelasFilter) return false;
      return true;
    });
  }, [historyList, students, studentMap, taFilter, kelasFilter]);

  const taOptions = useMemo(() => {
    const s = new Set<string>(['2023/2024', '2024/2025', '2025/2026', '2026/2027']);
    academicYears.forEach(a => s.add(a.tahun_ajaran));
    historyList.forEach(h => {
      if (h.tahun_ajaran) s.add(h.tahun_ajaran);
    });
    return Array.from(s).sort().reverse();
  }, [academicYears, historyList]);

  const handleAddPlacement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canModify || !targetStudentId) return;
    setSaving(true);
    try {
      const res = await saveClassHistoryPlacement(
        {
          student_id: targetStudentId,
          tahun_ajaran: inputTa,
          semester: inputSemester,
          kelas: inputKelas,
          status_riwayat: inputStatus,
          catatan: inputCatatan
        },
        {
          id: adminUser?.id || 'admin',
          name: adminUser?.nama_lengkap || 'Admin Sekolah',
          role: role || 'admin'
        }
      );

      if (res.status === 'duplicate_skipped') {
        notifyError(
          'Riwayat Sudah Ada',
          `Siswa tersebut sudah memiliki riwayat Kelas ${inputKelas} pada Tahun Pelajaran ${inputTa}.`
        );
      } else {
        success('Riwayat Kelas Disimpan', 'Catatan penempatan kelas berhasil ditambahkan.');
        setShowAddModal(false);
        setInputCatatan('');
        await loadData();
      }
    } catch (err: unknown) {
      notifyError('Gagal Menyimpan', err instanceof Error ? err.message : 'Terjadi kesalahan.');
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    const fileName = exportClassHistoryToExcel(
      combinedRows.map(r => ({
        tahun_ajaran: r.tahun_ajaran,
        semester: r.semester,
        angkatan: r.angkatan,
        nis: r.student.nis,
        nisn: r.student.nisn,
        nama_siswa: r.student.nama_lengkap,
        kelas: r.kelas,
        tingkat: r.tingkat,
        kamar: r.kamar,
        status_riwayat: r.status_riwayat,
        tanggal_mulai: r.tanggal_mulai,
        catatan: r.catatan
      }))
    );

    await recordExportLog({
      exported_by_name: adminUser?.nama_lengkap || 'Admin Sekolah',
      exported_by_role: role || 'admin',
      export_type: 'Riwayat Kelas Siswa Lintas Tahun Pelajaran',
      filter_summary: { tahun_ajaran: taFilter, kelas: kelasFilter },
      total_records: combinedRows.length,
      file_name: fileName
    });
  };

  const columns: Column<CombinedHistoryRow>[] = [
    {
      header: 'Tahun Pelajaran',
      render: r => <span className="font-mono font-bold text-[#101D35]">{r.tahun_ajaran}</span>,
      className: 'w-36 whitespace-nowrap'
    },
    {
      header: 'Kelas',
      render: r => (
        <span className="px-2.5 py-1 rounded-lg bg-[#EEF3FF] text-[#315FEA] font-bold text-xs">
          Kelas {r.kelas}
        </span>
      ),
      className: 'w-28 whitespace-nowrap'
    },
    {
      header: 'NISN / NIS',
      render: r => (
        <span className="font-mono text-slate-600">
          {r.student.nisn || '-'} / {r.student.nis || '-'}
        </span>
      ),
      className: 'w-44 whitespace-nowrap'
    },
    {
      header: 'Nama Lengkap Siswa',
      render: r => (
        <button
          type="button"
          onClick={() => setSelectedStudent(r.student)}
          className="font-bold text-[#101D35] hover:text-[#315FEA] transition-colors text-left"
        >
          {r.student.nama_lengkap}
        </button>
      )
    },
    {
      header: 'Angkatan Tetap',
      render: r => (
        <span className="inline-flex items-center gap-1 font-mono text-[#6366F1] font-semibold">
          <Layers className="w-3.5 h-3.5" />
          {r.angkatan}
        </span>
      ),
      className: 'w-32 whitespace-nowrap'
    },
    {
      header: 'Status Riwayat',
      render: r => (
        <span className="px-2.5 py-1 rounded-lg bg-[#EEF3FF] border border-[#315FEA]/20 text-[#315FEA] font-bold text-[11px] uppercase">
          {r.status_riwayat.replace('_', ' ')}
        </span>
      ),
      className: 'w-36 whitespace-nowrap'
    },
    {
      header: 'Catatan',
      render: r => <span className="text-slate-600">{r.catatan}</span>
    },
    {
      header: 'Timeline',
      align: 'right',
      render: r => (
        <button
          type="button"
          onClick={() => setSelectedStudent(r.student)}
          className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-[#EEF3FF] text-[#101D35] hover:text-[#315FEA] font-semibold text-xs transition-colors"
        >
          Buka Perjalanan
        </button>
      ),
      className: 'w-36 whitespace-nowrap'
    }
  ];

  return (
    <div className="space-y-6">
      <PageTitle
        category="Akademik & Buku Induk"
        title="Riwayat Penempatan Kelas Setiap Tahun Pelajaran"
        subtitle="Kelas saat ini tidak menggantikan riwayat kelas tahun-tahun sebelumnya. Setiap perpindahan dan kenaikan kelas lintas tahun pelajaran tercatat secara historis."
        icon={BookOpen}
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
              onClick={handleExport}
              disabled={combinedRows.length === 0}
              className="px-3.5 py-2 rounded-xl border border-slate-200/90 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-2xs disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>Export Riwayat ({combinedRows.length.toLocaleString('id-ID')})</span>
            </button>
            {canModify && (
              <button
                type="button"
                onClick={() => setShowAddModal(v => !v)}
                className="px-4 py-2 rounded-xl bg-[#315FEA] hover:bg-[#274ED0] text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>Catat Penempatan Kelas</span>
              </button>
            )}
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

      {/* Add Placement Form */}
      {showAddModal && canModify && (
        <form
          onSubmit={handleAddPlacement}
          className="bg-white rounded-2xl border border-[#315FEA]/30 p-5 sm:p-6 shadow-[0_4px_20px_-4px_rgba(49,95,234,0.12)] space-y-4"
        >
          <h3 className="font-bold text-[#101D35] text-sm">
            Tambah Riwayat Penempatan Kelas Siswa (Termasuk Arsip Tahun Sebelumnya)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="lg:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">Pilih Siswa *</label>
              <select
                value={targetStudentId}
                onChange={e => setTargetStudentId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200/90 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#315FEA]/20 focus:border-[#315FEA]"
              >
                {students.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.nama_lengkap} — NISN: {s.nisn} (Angkatan {s.angkatan || s.tahun_masuk})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Tahun Pelajaran *
              </label>
              <input
                type="text"
                required
                value={inputTa}
                onChange={e => setInputTa(e.target.value)}
                placeholder="2024/2025"
                className="w-full px-3 py-2 rounded-xl border border-slate-200/90 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#315FEA]/20 focus:border-[#315FEA]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Kelas *</label>
              <select
                value={inputKelas}
                onChange={e => setInputKelas(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200/90 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#315FEA]/20 focus:border-[#315FEA]"
              >
                {CLASS_ROSTER.map(c => (
                  <option key={c} value={c}>
                    Kelas {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Status Riwayat</label>
              <select
                value={inputStatus}
                onChange={e =>
                  setInputStatus(e.target.value as StudentClassHistoryRecord['status_riwayat'])
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-200/90 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#315FEA]/20 focus:border-[#315FEA]"
              >
                <option value="aktif">Aktif / Penempatan Awal</option>
                <option value="naik_kelas">Naik Kelas</option>
                <option value="tinggal_kelas">Tidak Naik Kelas</option>
                <option value="pindah_rombel">Pindah Rombel</option>
                <option value="lulus">Lulus</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3">
            <input
              type="text"
              value={inputCatatan}
              onChange={e => setInputCatatan(e.target.value)}
              placeholder="Catatan penempatan kelas (opsional)..."
              className="flex-1 w-full px-3 py-2 rounded-xl border border-slate-200/90 text-xs focus:outline-none focus:ring-2 focus:ring-[#315FEA]/20 focus:border-[#315FEA]"
            />
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-[#315FEA] hover:bg-[#274ED0] text-white text-xs font-bold"
              >
                {saving ? 'Menyimpan...' : 'Simpan Riwayat Kelas'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* DataTable with Search, FilterDropdown, and Full Pagination */}
      <DataTable
        data={combinedRows}
        columns={columns}
        keyExtractor={r => r.id}
        isLoading={loading}
        searchPlaceholder="Cari nama siswa, NISN, NIS, kelas, atau tahun pelajaran..."
        searchFilter={(r, q) =>
          r.student.nama_lengkap.toLowerCase().includes(q) ||
          (r.student.nisn || '').toLowerCase().includes(q) ||
          (r.student.nis || '').toLowerCase().includes(q) ||
          r.kelas.toLowerCase().includes(q) ||
          r.tahun_ajaran.toLowerCase().includes(q)
        }
        filterControls={
          <div className="flex flex-wrap items-center gap-2">
            <FilterDropdown
              showFilterIcon
              ariaLabel="Filter Tahun Pelajaran"
              value={taFilter}
              onChange={setTaFilter}
              options={[
                { value: 'all', label: 'Semua Tahun Pelajaran' },
                ...taOptions.map(ta => ({ value: ta, label: `Tahun Pelajaran ${ta}` }))
              ]}
            />

            <FilterDropdown
              ariaLabel="Filter Kelas"
              value={kelasFilter}
              onChange={setKelasFilter}
              options={[
                { value: 'all', label: 'Semua Kelas' },
                ...CLASS_ROSTER.map(c => ({ value: c, label: `Kelas ${c}` }))
              ]}
            />
          </div>
        }
        emptyTitle="Tidak Ada Catatan Riwayat Kelas"
        emptyMessage="Tidak ada catatan riwayat kelas yang sesuai dengan filter saat ini."
      />

      <StudentLifecycleModal
        student={selectedStudent}
        onClose={() => setSelectedStudent(null)}
        onUpdated={loadData}
      />
    </div>
  );
};
