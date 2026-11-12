import React, { useState, useEffect, useMemo } from 'react';
import {
  AcademicYearRecord,
  Siswa,
  StudentClassHistoryRecord
} from '../../types';
import {
  getAcademicYearsList,
  saveAcademicYearRecord,
  getSiswaList,
  getAllClassHistoryList
} from '../../services/dataService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { ZeroPillBadge } from '../../components/common/ZeroPillBadge';
import { PageTitle } from '../../components/common/PageTitle';
import { DataTable, Column } from '../../components/common/ModernTable';
import { FilterDropdown } from '../../components/common/FilterDropdown';
import { LoadingSkeleton } from '../../components/common/LoadingSkeleton';
import { StudentLifecycleModal } from '../../components/modals/StudentLifecycleModal';
import {
  CalendarRange,
  Plus,
  CheckCircle2,
  Archive,
  FolderOpen,
  Edit3,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';
import { formatDateDMY } from '../../utils/formatters';
import { useSchoolProfile } from '../../services/schoolService';

interface InspectedStudentRow {
  id: string;
  student: Siswa;
  kelasPadaTahunItu: string;
  statusRiwayat: string;
  catatanRiwayat: string;
}

export const TahunPelajaranPage: React.FC = () => {
  const { adminUser, role } = useAuth();
  const { success, error: notifyError } = useNotification();
  const { profile: schoolProfile } = useSchoolProfile();

  const [academicYears, setAcademicYears] = useState<AcademicYearRecord[]>([]);
  const [students, setStudents] = useState<Siswa[]>([]);
  const [historyList, setHistoryList] = useState<StudentClassHistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Selected Academic Year to inspect
  const [inspectTa, setInspectTa] = useState<string>(schoolProfile.tahun_ajaran || '2026/2027');
  const [kelasInspectFilter, setKelasInspectFilter] = useState<string>('all');
  const [selectedStudent, setSelectedStudent] = useState<Siswa | null>(null);

  // Form Modal / Panel
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [tahunAjaran, setTahunAjaran] = useState('2026/2027');
  const [semester, setSemester] = useState<'Ganjil' | 'Genap'>('Ganjil');
  const [isActive, setIsActive] = useState(true);
  const [isArchived, setIsArchived] = useState(false);
  const [tanggalMulai, setTanggalMulai] = useState('2026-07-13');
  const [tanggalSelesai, setTanggalSelesai] = useState('2026-12-19');
  const [catatan, setCatatan] = useState('');
  const [saving, setSaving] = useState(false);

  const canModify = role === 'super_admin' || role === 'admin';

  const loadData = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [ayList, stList, histList] = await Promise.all([
        getAcademicYearsList(),
        getSiswaList(),
        getAllClassHistoryList()
      ]);

      const currentProfileTa = schoolProfile.tahun_ajaran || '2026/2027';
      const currentProfileSem: 'Ganjil' | 'Genap' = schoolProfile.semester_aktif
        ?.toLowerCase()
        .includes('genap')
        ? 'Genap'
        : 'Ganjil';

      const effectiveAy: AcademicYearRecord[] =
        ayList.length > 0
          ? ayList
          : [
              {
                id: 'default-active',
                tahun_ajaran: currentProfileTa,
                semester: currentProfileSem,
                is_active: true,
                is_archived: false,
                tanggal_mulai: '2026-07-13',
                tanggal_selesai: '2026-12-19',
                catatan: 'Tahun pelajaran aktif berjalan',
                created_at: new Date().toISOString()
              },
              {
                id: 'default-2025-genap',
                tahun_ajaran: '2025/2026',
                semester: 'Genap',
                is_active: false,
                is_archived: true,
                tanggal_mulai: '2026-01-05',
                tanggal_selesai: '2026-06-20',
                catatan: 'Arsip Tahun Pelajaran 2025/2026',
                created_at: new Date().toISOString()
              },
              {
                id: 'default-2024-genap',
                tahun_ajaran: '2024/2025',
                semester: 'Genap',
                is_active: false,
                is_archived: true,
                tanggal_mulai: '2025-01-06',
                tanggal_selesai: '2025-06-21',
                catatan: 'Arsip Tahun Pelajaran 2024/2025',
                created_at: new Date().toISOString()
              }
            ];

      setAcademicYears(effectiveAy);
      setStudents(stList);
      setHistoryList(histList);

      const activeAy = effectiveAy.find(a => a.is_active);
      if (activeAy) {
        setInspectTa(activeAy.tahun_ajaran);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Tidak dapat memuat daftar tahun pelajaran.';
      setLoadError(msg);
      notifyError('Gagal Memuat', msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canModify) return;
    if (!/^\d{4}\/\d{4}$/.test(tahunAjaran.trim())) {
      notifyError('Format Tahun Pelajaran', 'Gunakan format YYYY/YYYY, contoh: 2026/2027.');
      return;
    }

    setSaving(true);
    try {
      await saveAcademicYearRecord(
        {
          id: editingId,
          tahun_ajaran: tahunAjaran.trim(),
          semester,
          is_active: isActive,
          is_archived: isActive ? false : isArchived,
          tanggal_mulai: tanggalMulai,
          tanggal_selesai: tanggalSelesai,
          catatan
        },
        {
          id: adminUser?.id || 'admin',
          name: adminUser?.nama_lengkap || 'Admin Sekolah',
          role: role || 'admin'
        }
      );

      success(
        'Tahun Pelajaran Disimpan',
        `Tahun Pelajaran ${tahunAjaran} (${semester}) berhasil disimpan. Data tahun sebelumnya tetap utuh.`
      );
      setShowForm(false);
      setEditingId(undefined);
      await loadData();
    } catch (err: unknown) {
      notifyError('Gagal Menyimpan', err instanceof Error ? err.message : 'Terjadi kesalahan.');
    } finally {
      setSaving(false);
    }
  };

  const handleActivateYear = async (rec: AcademicYearRecord) => {
    if (!canModify) return;
    try {
      await saveAcademicYearRecord(
        {
          id: rec.id.startsWith('default-') ? undefined : rec.id,
          tahun_ajaran: rec.tahun_ajaran,
          semester: rec.semester,
          is_active: true,
          is_archived: false,
          tanggal_mulai: rec.tanggal_mulai,
          tanggal_selesai: rec.tanggal_selesai,
          catatan: rec.catatan
        },
        {
          id: adminUser?.id || 'admin',
          name: adminUser?.nama_lengkap || 'Admin Sekolah',
          role: role || 'admin'
        }
      );
      success(
        'Tahun Pelajaran Diaktifkan',
        `${rec.tahun_ajaran} (${rec.semester}) kini menjadi satu-satunya Tahun Pelajaran Aktif.`
      );
      await loadData();
    } catch (err: unknown) {
      notifyError('Gagal Mengaktifkan', err instanceof Error ? err.message : 'Terjadi kesalahan.');
    }
  };

  const handleToggleArchive = async (rec: AcademicYearRecord) => {
    if (!canModify) return;
    if (rec.is_active) {
      notifyError('Tahun Aktif', 'Tahun pelajaran yang sedang aktif tidak dapat diarsipkan.');
      return;
    }
    try {
      await saveAcademicYearRecord(
        {
          id: rec.id.startsWith('default-') ? undefined : rec.id,
          tahun_ajaran: rec.tahun_ajaran,
          semester: rec.semester,
          is_active: false,
          is_archived: !rec.is_archived,
          tanggal_mulai: rec.tanggal_mulai,
          tanggal_selesai: rec.tanggal_selesai,
          catatan: rec.catatan
        },
        {
          id: adminUser?.id || 'admin',
          name: adminUser?.nama_lengkap || 'Admin Sekolah',
          role: role || 'admin'
        }
      );
      success(
        'Status Arsip Diperbarui',
        `Tahun Pelajaran ${rec.tahun_ajaran} (${rec.semester}) telah ${
          !rec.is_archived ? 'diarsipkan' : 'dibuka dari arsip'
        }.`
      );
      await loadData();
    } catch (err: unknown) {
      notifyError('Gagal Mengubah Status', err instanceof Error ? err.message : 'Terjadi kesalahan.');
    }
  };

  const studentsInInspectedYear: InspectedStudentRow[] = useMemo(() => {
    const startYear = inspectTa.split('/')[0];
    const activeAy =
      academicYears.find(a => a.is_active)?.tahun_ajaran || schoolProfile.tahun_ajaran || '2026/2027';
    const historyInTa = historyList.filter(h => h.tahun_ajaran === inspectTa);
    const historyByStudentId = new Map<string, StudentClassHistoryRecord>();
    historyInTa.forEach(h => historyByStudentId.set(h.student_id, h));

    return students
      .filter(s => {
        if (historyByStudentId.has(s.id)) return true;
        const angk = s.angkatan || s.tahun_masuk || (s.tanggal_masuk || '').slice(0, 4);
        return (
          angk === startYear ||
          (inspectTa === activeAy && (s.status === 'aktif' || s.status === 'mutasi_masuk'))
        );
      })
      .map(s => {
        const hist = historyByStudentId.get(s.id);
        return {
          id: s.id,
          student: s,
          kelasPadaTahunItu: hist?.kelas || s.rombel,
          statusRiwayat: hist?.status_riwayat || 'aktif',
          catatanRiwayat: hist?.catatan || '-'
        };
      })
      .filter(item => {
        if (kelasInspectFilter !== 'all' && item.kelasPadaTahunItu !== kelasInspectFilter) {
          return false;
        }
        return true;
      });
  }, [
    students,
    historyList,
    inspectTa,
    academicYears,
    schoolProfile.tahun_ajaran,
    kelasInspectFilter
  ]);

  const availableClassesInYear = useMemo(() => {
    const set = new Set<string>();
    studentsInInspectedYear.forEach(r => {
      if (r.kelasPadaTahunItu) set.add(r.kelasPadaTahunItu);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id', { numeric: true }));
  }, [studentsInInspectedYear]);

  const inspectedColumns: Column<InspectedStudentRow>[] = [
    {
      header: `Kelas (${inspectTa})`,
      render: item => (
        <span className="px-2.5 py-1 rounded-lg bg-[#EEF3FF] text-[#315FEA] font-bold text-xs">
          Kelas {item.kelasPadaTahunItu}
        </span>
      ),
      className: 'w-32 whitespace-nowrap'
    },
    {
      header: 'NIS',
      render: item => <span className="font-mono text-slate-700">{item.student.nis || '-'}</span>,
      className: 'w-28 whitespace-nowrap'
    },
    {
      header: 'NISN',
      render: item => (
        <span className="font-mono font-bold text-[#101D35]">{item.student.nisn || '-'}</span>
      ),
      className: 'w-32 whitespace-nowrap'
    },
    {
      header: 'Nama Lengkap Siswa',
      render: item => (
        <button
          type="button"
          onClick={() => setSelectedStudent(item.student)}
          className="font-bold text-[#101D35] hover:text-[#315FEA] transition-colors text-left"
        >
          {item.student.nama_lengkap}
        </button>
      )
    },
    {
      header: 'Angkatan Tetap',
      render: item => (
        <span className="font-mono font-semibold text-[#6366F1]">
          Angkatan {item.student.angkatan || item.student.tahun_masuk}
        </span>
      ),
      className: 'w-36 whitespace-nowrap'
    },
    {
      header: 'Status Saat Ini',
      render: item => <ZeroPillBadge status={item.student.status} />,
      className: 'w-32 whitespace-nowrap'
    },
    {
      header: 'Detail',
      align: 'right',
      render: item => (
        <button
          type="button"
          onClick={() => setSelectedStudent(item.student)}
          className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-[#EEF3FF] text-[#101D35] hover:text-[#315FEA] font-semibold text-xs transition-colors"
        >
          Riwayat Perjalanan
        </button>
      ),
      className: 'w-40 whitespace-nowrap'
    }
  ];

  return (
    <div className="space-y-6">
      <PageTitle
        category="Akademik & Buku Induk"
        title="Manajemen & Arsip Tahun Pelajaran"
        subtitle="Kelola Tahun Pelajaran lintas periode (2023/2024 s/d 2027/2028+). Hanya ada satu tahun pelajaran aktif, dan pergantian tahun pelajaran tidak pernah menghapus data tahun sebelumnya."
        icon={CalendarRange}
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
            {canModify && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(undefined);
                  setTahunAjaran('2026/2027');
                  setSemester('Ganjil');
                  setIsActive(true);
                  setIsArchived(false);
                  setShowForm(v => !v);
                }}
                className="px-4 py-2 rounded-xl bg-[#315FEA] hover:bg-[#274ED0] text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Tahun Pelajaran</span>
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

      {/* Form Tambah / Ubah Tahun Pelajaran */}
      {showForm && canModify && (
        <form
          onSubmit={handleSave}
          className="bg-white rounded-2xl border border-[#315FEA]/30 p-5 sm:p-6 shadow-[0_4px_20px_-4px_rgba(49,95,234,0.12)] space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <h3 className="font-bold text-[#101D35] text-sm">
              {editingId ? 'Ubah Tahun Pelajaran' : 'Tambah Tahun Pelajaran Baru'}
            </h3>
            <span className="text-[11px] text-slate-500">
              Mengaktifkan tahun pelajaran baru otomatis menonaktifkan tahun pelajaran sebelumnya tanpa menghapus data
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Tahun Pelajaran (YYYY/YYYY) *
              </label>
              <input
                type="text"
                required
                placeholder="Contoh: 2026/2027"
                value={tahunAjaran}
                onChange={e => setTahunAjaran(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200/90 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#315FEA]/20 focus:border-[#315FEA]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Semester *</label>
              <select
                value={semester}
                onChange={e => setSemester(e.target.value as 'Ganjil' | 'Genap')}
                className="w-full px-3 py-2 rounded-xl border border-slate-200/90 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#315FEA]/20 focus:border-[#315FEA]"
              >
                <option value="Ganjil">Semester Ganjil</option>
                <option value="Genap">Semester Genap</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Tanggal Mulai</label>
              <input
                type="date"
                value={tanggalMulai}
                onChange={e => setTanggalMulai(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200/90 text-xs focus:outline-none focus:ring-2 focus:ring-[#315FEA]/20 focus:border-[#315FEA]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Tanggal Selesai</label>
              <input
                type="date"
                value={tanggalSelesai}
                onChange={e => setTanggalSelesai(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200/90 text-xs focus:outline-none focus:ring-2 focus:ring-[#315FEA]/20 focus:border-[#315FEA]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Keterangan / Catatan
              </label>
              <input
                type="text"
                placeholder="Contoh: Tahun Pelajaran Baru 2026/2027"
                value={catatan}
                onChange={e => setCatatan(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200/90 text-xs focus:outline-none focus:ring-2 focus:ring-[#315FEA]/20 focus:border-[#315FEA]"
              />
            </div>
            <div className="flex flex-wrap items-center gap-5 pt-4">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={e => {
                    setIsActive(e.target.checked);
                    if (e.target.checked) setIsArchived(false);
                  }}
                  className="rounded border-slate-300 text-[#315FEA]"
                />
                <span>Jadikan Tahun Pelajaran Aktif Sekarang</span>
              </label>

              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={isActive}
                  checked={isArchived}
                  onChange={e => setIsArchived(e.target.checked)}
                  className="rounded border-slate-300 text-slate-700"
                />
                <span>Tandai sebagai Arsip</span>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-[#315FEA] hover:bg-[#274ED0] text-white text-xs font-bold"
            >
              {saving ? 'Menyimpan...' : 'Simpan Tahun Pelajaran'}
            </button>
          </div>
        </form>
      )}

      {/* Daftar Tahun Pelajaran */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_2px_12px_-4px_rgba(16,29,53,0.06)] overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200/80 bg-[#F8FAFC] flex items-center justify-between">
          <div>
            <h3 className="font-bold text-[#101D35] text-sm">Daftar Tahun Pelajaran &amp; Status</h3>
            <p className="text-xs text-slate-500">
              Klik &ldquo;Buka &amp; Periksa Data&rdquo; untuk melihat penempatan kelas siswa pada tahun pelajaran tersebut
            </p>
          </div>
        </div>

        {loading ? (
          <div className="p-5">
            <LoadingSkeleton variant="table" rows={3} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-slate-200/80 text-slate-600 font-bold">
                  <th className="py-3 px-4">Tahun Pelajaran</th>
                  <th className="py-3 px-4">Semester</th>
                  <th className="py-3 px-4">Periode Tanggal</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Catatan</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {academicYears.map(ay => (
                  <tr
                    key={ay.id}
                    className={`hover:bg-[#F5F7FB] transition-colors ${
                      inspectTa === ay.tahun_ajaran ? 'bg-[#EEF3FF]/60' : ''
                    }`}
                  >
                    <td className="py-3 px-4 font-mono font-extrabold text-[#101D35] text-sm">
                      {ay.tahun_ajaran}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-700">
                      Semester {ay.semester}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">
                      {(ay.tanggal_mulai ? formatDateDMY(ay.tanggal_mulai) : '-') +
                        ' s/d ' +
                        (ay.tanggal_selesai ? formatDateDMY(ay.tanggal_selesai) : '-')}
                    </td>
                    <td className="py-3 px-4">
                      {ay.is_active ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#10B981]/10 border border-[#10B981]/30 text-emerald-900 font-bold text-[11px]">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981]" />
                          TAHUN AKTIF SAAT INI
                        </span>
                      ) : ay.is_archived ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-300 text-slate-700 font-semibold text-[11px]">
                          <Archive className="w-3.5 h-3.5 text-slate-500" />
                          ARSIP TAHUN LAMA
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#F59E0B]/10 border border-[#F59E0B]/30 text-amber-900 font-semibold text-[11px]">
                          SIAP / NON-AKTIF
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600">{ay.catatan || '-'}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setInspectTa(ay.tahun_ajaran)}
                          className="px-3 py-1.5 rounded-xl bg-[#EEF3FF] hover:bg-[#315FEA] text-[#315FEA] hover:text-white font-semibold text-[11px] inline-flex items-center gap-1 transition-colors"
                        >
                          <FolderOpen className="w-3.5 h-3.5" />
                          <span>Buka &amp; Periksa Data</span>
                        </button>

                        {canModify && !ay.is_active && (
                          <button
                            type="button"
                            onClick={() => handleActivateYear(ay)}
                            className="px-3 py-1.5 rounded-xl bg-[#10B981] hover:bg-emerald-600 text-white font-semibold text-[11px] transition-colors"
                          >
                            Aktifkan
                          </button>
                        )}

                        {canModify && !ay.is_active && (
                          <button
                            type="button"
                            onClick={() => handleToggleArchive(ay)}
                            className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold text-[11px] transition-colors"
                          >
                            {ay.is_archived ? 'Buka Arsip' : 'Arsipkan'}
                          </button>
                        )}

                        {canModify && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(ay.id.startsWith('default-') ? undefined : ay.id);
                              setTahunAjaran(ay.tahun_ajaran);
                              setSemester(ay.semester);
                              setIsActive(ay.is_active);
                              setIsArchived(Boolean(ay.is_archived));
                              setTanggalMulai(ay.tanggal_mulai || '');
                              setTanggalSelesai(ay.tanggal_selesai || '');
                              setCatatan(ay.catatan || '');
                              setShowForm(true);
                            }}
                            className="p-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors"
                            title="Ubah Tahun Pelajaran"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pemeriksaan Data Siswa pada Tahun Pelajaran Terpilih menggunakan DataTable berpaginasi */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <div>
            <h3 className="font-bold text-[#101D35] text-sm">
              Pemeriksaan Data Siswa pada Tahun Pelajaran:{' '}
              <span className="text-[#315FEA] font-mono">{inspectTa}</span>
            </h3>
            <p className="text-xs text-slate-500">
              Menampilkan {studentsInInspectedYear.length.toLocaleString('id-ID')} siswa yang tercatat pada periode {inspectTa}
            </p>
          </div>
        </div>

        <DataTable
          data={studentsInInspectedYear}
          columns={inspectedColumns}
          keyExtractor={item => item.id}
          isLoading={loading}
          searchPlaceholder="Cari nama siswa, NISN, NIS, atau kelas..."
          searchFilter={(item, q) =>
            item.student.nama_lengkap.toLowerCase().includes(q) ||
            (item.student.nisn || '').toLowerCase().includes(q) ||
            (item.student.nis || '').toLowerCase().includes(q) ||
            item.kelasPadaTahunItu.toLowerCase().includes(q)
          }
          filterControls={
            <FilterDropdown
              showFilterIcon
              ariaLabel="Filter Kelas"
              value={kelasInspectFilter}
              onChange={setKelasInspectFilter}
              options={[
                { value: 'all', label: 'Semua Kelas' },
                ...availableClassesInYear.map(k => ({ value: k, label: `Kelas ${k}` }))
              ]}
            />
          }
          emptyTitle={`Belum Ada Catatan Riwayat pada ${inspectTa}`}
          emptyMessage="Anda dapat mengisi penempatan kelas untuk tahun pelajaran ini melalui menu Import Data -> Import Riwayat Kelas atau Proses Akhir Tahun."
        />
      </div>

      <StudentLifecycleModal
        student={selectedStudent}
        onClose={() => setSelectedStudent(null)}
        onUpdated={loadData}
      />
    </div>
  );
};
