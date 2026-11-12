import React, { useState, useEffect, useMemo } from 'react';
import { Siswa } from '../../types';
import {
  getSiswaList,
  createSiswa,
  updateSiswa,
  archiveSiswa,
  deleteSiswa
} from '../../services/dataService';
import { exportStudentsToExcel } from '../../services/excelService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { ModernTable, Column } from '../../components/common/ModernTable';
import { ZeroPillBadge } from '../../components/common/ZeroPillBadge';
import { PageTitle } from '../../components/common/PageTitle';
import { FilterDropdown } from '../../components/common/FilterDropdown';
import { StudentDetailModal } from '../../components/admin/StudentDetailModal';
import { StudentFormModal } from '../../components/admin/StudentFormModal';
import { ConfirmationModal } from '../../components/common/ConfirmationModal';
import { PrintBiodataF4Modal } from '../../components/common/PrintBiodataF4Modal';
import { CLASS_ROSTER } from '../../config/school';
import {
  UserPlus,
  Download,
  Eye,
  Edit,
  Trash2,
  Archive,
  Printer,
  CheckSquare,
  Square,
  RefreshCw,
  Users
} from 'lucide-react';

export const DataSiswaPage: React.FC = () => {
  const { adminUser, role } = useAuth();
  const { success, error: notifyError } = useNotification();

  const [students, setStudents] = useState<Siswa[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters: Tingkat, Kelas (A s/d O), dan Status
  const [filterTingkat, setFilterTingkat] = useState<string>('all');
  const [filterRombel, setFilterRombel] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Selection state for F4 PDF batch/single printing
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [studentsToPrint, setStudentsToPrint] = useState<Siswa[]>([]);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  // Modals state
  const [selectedStudent, setSelectedStudent] = useState<Siswa | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Siswa | null>(null);

  // Archive & Delete modal state
  const [studentToArchive, setStudentToArchive] = useState<Siswa | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);
  const [studentToDelete, setStudentToDelete] = useState<Siswa | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const canEdit = role === 'super_admin' || role === 'admin' || role === 'operator';
  const canDelete = role === 'super_admin' || role === 'admin';

  const loadData = async (showRefreshToast = false) => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getSiswaList();
      setStudents(data);
      if (showRefreshToast) {
        const activeTotal = data.filter(s => s.status === 'aktif' || s.status === 'mutasi_masuk').length;
        success('Data Dimuat Ulang', `Berhasil memuat ${data.length} data siswa (${activeTotal} siswa aktif).`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Tidak dapat mengambil data siswa dari database.';
      setLoadError(msg);
      notifyError('Gagal Memuat Data', msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const summaryStats = useMemo(() => {
    const activeStudents = students.filter(s => s.status === 'aktif' || s.status === 'mutasi_masuk');
    const activeKelas7 = activeStudents.filter(s => (s.tingkat_kelas || s.rombel?.charAt(0)) === '7').length;
    const activeKelas8 = activeStudents.filter(s => (s.tingkat_kelas || s.rombel?.charAt(0)) === '8').length;
    const activeKelas9 = activeStudents.filter(s => (s.tingkat_kelas || s.rombel?.charAt(0)) === '9').length;
    return {
      totalAll: students.length,
      totalActive: activeStudents.length,
      activeKelas7,
      activeKelas8,
      activeKelas9
    };
  }, [students]);

  const filteredAndSortedStudents = useMemo(() => {
    const filtered = students.filter(s => {
      const studentTingkat = s.tingkat_kelas || (s.rombel ? s.rombel.charAt(0) : '');
      if (filterTingkat !== 'all' && studentTingkat !== filterTingkat) return false;
      if (filterRombel !== 'all' && s.rombel !== filterRombel) return false;
      if (filterStatus !== 'all' && s.status !== filterStatus) return false;
      return true;
    });

    return [...filtered].sort((a, b) => {
      const valA = String(a.nama_lengkap || '').toLowerCase();
      const valB = String(b.nama_lengkap || '').toLowerCase();
      return valA.localeCompare(valB, 'id', { numeric: true });
    });
  }, [students, filterTingkat, filterRombel, filterStatus]);

  const allFilteredSelected =
    filteredAndSortedStudents.length > 0 &&
    filteredAndSortedStudents.every(s => selectedIds.includes(s.id));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      const filteredIdSet = new Set(filteredAndSortedStudents.map(s => s.id));
      setSelectedIds(prev => prev.filter(id => !filteredIdSet.has(id)));
    } else {
      const combined = new Set([...selectedIds, ...filteredAndSortedStudents.map(s => s.id)]);
      setSelectedIds(Array.from(combined));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]));
  };

  const handlePrintSelectedF4 = () => {
    const selectedList = students.filter(s => selectedIds.includes(s.id));
    if (selectedList.length === 0) {
      notifyError('Pilih Siswa', 'Silakan centang minimal satu siswa untuk mencetak Biodata PDF ukuran F4.');
      return;
    }
    setStudentsToPrint(selectedList);
    setIsPrintModalOpen(true);
  };

  const handlePrintSingleF4 = (siswa: Siswa) => {
    setStudentsToPrint([siswa]);
    setIsPrintModalOpen(true);
  };

  const handleSaveStudent = async (data: Omit<Siswa, 'id' | 'created_at' | 'updated_at'>) => {
    if (!adminUser) return;
    const actor = {
      id: adminUser.id,
      name: adminUser.nama_lengkap,
      role: adminUser.role
    };

    if (editingStudent) {
      await updateSiswa(editingStudent.id, data, actor);
      success('Biodata Diperbarui', `Data siswa ${data.nama_lengkap} berhasil diperbarui.`);
    } else {
      await createSiswa(data, actor);
      success('Siswa Ditambahkan', `Siswa baru ${data.nama_lengkap} berhasil didaftarkan ke sistem.`);
    }
    await loadData();
  };

  const handleArchiveConfirm = async () => {
    if (!studentToArchive || !adminUser) return;
    setIsArchiving(true);
    try {
      await archiveSiswa(studentToArchive.id, {
        id: adminUser.id,
        name: adminUser.nama_lengkap,
        role: adminUser.role
      });
      success(
        'Siswa Diarsipkan',
        `Biodata ${studentToArchive.nama_lengkap} berhasil dipindahkan ke status Arsip (Non-Aktif).`
      );
      setStudentToArchive(null);
      await loadData();
    } catch (err: unknown) {
      notifyError('Gagal Mengarsipkan', err instanceof Error ? err.message : 'Terjadi kesalahan.');
    } finally {
      setIsArchiving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!studentToDelete || !adminUser) return;
    setIsDeleting(true);
    try {
      await deleteSiswa(studentToDelete.id, {
        id: adminUser.id,
        name: adminUser.nama_lengkap,
        role: adminUser.role
      });
      success('Siswa Dihapus', `Data siswa ${studentToDelete.nama_lengkap} berhasil dihapus dari sistem.`);
      setSelectedIds(prev => prev.filter(id => id !== studentToDelete.id));
      setStudentToDelete(null);
      await loadData();
    } catch (err: unknown) {
      notifyError('Gagal Menghapus', err instanceof Error ? err.message : 'Terjadi kesalahan sistem.');
    } finally {
      setIsDeleting(false);
    }
  };

  const columns: Column<Siswa>[] = [
    {
      header: (
        <button
          type="button"
          onClick={toggleSelectAll}
          className="p-1 text-slate-600 hover:text-[#315FEA] flex items-center justify-center"
          title="Pilih Semua Siswa"
        >
          {allFilteredSelected ? (
            <CheckSquare className="w-4 h-4 text-[#315FEA]" />
          ) : (
            <Square className="w-4 h-4 text-slate-400" />
          )}
        </button>
      ),
      align: 'center',
      className: 'w-10',
      render: s => {
        const isChecked = selectedIds.includes(s.id);
        return (
          <button
            type="button"
            onClick={() => toggleSelectOne(s.id)}
            className="p-1 text-slate-600 hover:text-[#315FEA] flex items-center justify-center"
            aria-label={`Pilih ${s.nama_lengkap}`}
          >
            {isChecked ? (
              <CheckSquare className="w-4 h-4 text-[#315FEA]" />
            ) : (
              <Square className="w-4 h-4 text-slate-400" />
            )}
          </button>
        );
      }
    },
    {
      header: 'Kelas',
      accessor: 'rombel',
      className: 'whitespace-nowrap font-bold text-[#101D35]'
    },
    {
      header: 'NIS',
      accessor: 'nis',
      isMono: true,
      className: 'whitespace-nowrap'
    },
    {
      header: 'ID Yayasan',
      accessor: 'id_yys',
      isMono: true,
      className: 'whitespace-nowrap'
    },
    {
      header: 'Nama Lengkap Siswa',
      className: 'whitespace-nowrap min-w-[200px]',
      render: s => (
        <button
          onClick={() => setSelectedStudent(s)}
          className="font-bold text-[#101D35] hover:text-[#315FEA] transition-colors text-left"
        >
          {s.nama_lengkap}
        </button>
      )
    },
    {
      header: 'Kamar',
      accessor: 'kamar',
      className: 'whitespace-nowrap'
    },
    {
      header: 'NISN',
      accessor: 'nisn',
      isMono: true,
      className: 'whitespace-nowrap font-bold text-[#101D35]'
    },
    {
      header: 'Status Aktif',
      render: s => <ZeroPillBadge status={s.status} />,
      className: 'whitespace-nowrap'
    },
    {
      header: 'Aksi',
      align: 'right',
      className: 'sticky right-0 bg-white/95 backdrop-blur-xs shadow-xs whitespace-nowrap',
      render: s => {
        const isMutasiKeluar = s.status === 'mutasi_keluar';
        return (
          <div className="flex items-center justify-end gap-1">
            <button
              onClick={() => setSelectedStudent(s)}
              title="Lihat Detail 59 Kolom"
              className="p-2 rounded-lg text-slate-600 hover:text-[#315FEA] hover:bg-slate-100 transition-colors"
            >
              <Eye className="w-4 h-4" />
            </button>

            <button
              onClick={() => handlePrintSingleF4(s)}
              title="Cetak Biodata PDF Ukuran F4"
              className="p-2 rounded-lg text-[#315FEA] hover:bg-[#315FEA]/10 transition-colors flex items-center gap-1 font-semibold text-[11px]"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden xl:inline">F4</span>
            </button>

            {canEdit && (
              <button
                onClick={() => {
                  setEditingStudent(s);
                  setIsFormOpen(true);
                }}
                title="Edit Biodata (8 Tab)"
                className="p-2 rounded-lg text-slate-600 hover:text-[#315FEA] hover:bg-slate-100 transition-colors"
              >
                <Edit className="w-4 h-4" />
              </button>
            )}

            {canEdit && s.status !== 'non_aktif' && (
              <button
                onClick={() => setStudentToArchive(s)}
                title="Arsipkan Siswa (Non-Aktif)"
                className="p-2 rounded-lg text-slate-500 hover:text-[#F59E0B] hover:bg-[#F59E0B]/10 transition-colors"
              >
                <Archive className="w-4 h-4" />
              </button>
            )}

            {canDelete && (
              <button
                onClick={() => {
                  if (isMutasiKeluar) {
                    notifyError(
                      'Tidak Dapat Dihapus',
                      'Siswa yang sudah mutasi keluar tidak boleh dihapus dari Buku Induk.'
                    );
                    return;
                  }
                  setStudentToDelete(s);
                }}
                disabled={isMutasiKeluar}
                title={
                  isMutasiKeluar
                    ? 'Siswa mutasi keluar tidak boleh dihapus'
                    : 'Hapus Data Siswa'
                }
                className={`p-2 rounded-lg transition-colors ${
                  isMutasiKeluar
                    ? 'text-slate-300 cursor-not-allowed'
                    : 'text-slate-400 hover:text-[#EF4444] hover:bg-[#EF4444]/10'
                }`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        );
      }
    }
  ];

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Page Header using Design System PageTitle */}
      <PageTitle
        category="Akademik & Buku Induk"
        title="Data Induk Siswa"
        subtitle="Menampilkan Kelas, NIS, ID Yayasan, Nama Lengkap Siswa, Kamar, NISN, dan Status Aktif. Mendukung pencarian Nama serta filter Tingkat, Kelas (A s/d O), dan Status."
        icon={Users}
        actions={
          <>
            <button
              type="button"
              onClick={() => loadData(true)}
              disabled={loading}
              className="px-3.5 py-2.5 sm:py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200/90 hover:bg-slate-50 rounded-xl flex items-center gap-1.5 transition-all shadow-2xs disabled:opacity-50"
              title="Muat ulang data siswa terbaru dari database"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Muat Ulang</span>
            </button>

            <button
              onClick={handlePrintSelectedF4}
              className={`px-3.5 py-2.5 sm:py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-xs ${
                selectedIds.length > 0
                  ? 'bg-[#10B981] hover:bg-emerald-600 text-white'
                  : 'bg-white border border-slate-200/90 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Printer className="w-3.5 h-3.5" />
              <span>
                Cetak Biodata PDF F4 {selectedIds.length > 0 ? `(${selectedIds.length} Siswa)` : '(Pilih Siswa)'}
              </span>
            </button>

            <button
              onClick={() => exportStudentsToExcel(filteredAndSortedStudents, { format: 'xlsx' })}
              className="px-3.5 py-2.5 sm:py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200/90 hover:bg-slate-50 rounded-xl flex items-center gap-1.5 transition-all shadow-2xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Excel (.xlsx)</span>
            </button>

            {canEdit && (
              <button
                onClick={() => {
                  setEditingStudent(null);
                  setIsFormOpen(true);
                }}
                className="px-3.5 py-2.5 sm:py-2 text-xs font-bold text-white bg-[#315FEA] hover:bg-[#274ED0] rounded-xl flex items-center gap-1.5 transition-all shadow-sm"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Tambah Siswa</span>
              </button>
            )}
          </>
        }
      />

      {loadError && (
        <div className="p-4 bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-2xl flex items-center justify-between gap-4 text-xs text-rose-950">
          <div>
            <div className="font-bold">Gagal Memuat Data Siswa</div>
            <div className="text-rose-800">{loadError}</div>
          </div>
          <button
            type="button"
            onClick={() => loadData(true)}
            className="px-3.5 py-1.5 bg-[#EF4444] hover:bg-rose-700 text-white rounded-xl font-semibold shrink-0"
          >
            Coba Lagi
          </button>
        </div>
      )}

      {/* Ringkasan Cepat Jumlah Siswa Aktif */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white border border-slate-200/80 rounded-2xl px-4 py-3 shadow-[0_2px_10px_-3px_rgba(16,29,53,0.05)]">
          <div className="text-[11px] font-semibold text-slate-500">Total Siswa Aktif</div>
          <div className="text-lg font-extrabold text-[#10B981] tabular-nums">
            {summaryStats.totalActive.toLocaleString('id-ID')}
          </div>
        </div>
        <div className="bg-white border border-slate-200/80 rounded-2xl px-4 py-3 shadow-[0_2px_10px_-3px_rgba(16,29,53,0.05)]">
          <div className="text-[11px] font-semibold text-slate-500">Aktif Kelas 7</div>
          <div className="text-lg font-bold text-[#101D35] tabular-nums">
            {summaryStats.activeKelas7.toLocaleString('id-ID')}
          </div>
        </div>
        <div className="bg-white border border-slate-200/80 rounded-2xl px-4 py-3 shadow-[0_2px_10px_-3px_rgba(16,29,53,0.05)]">
          <div className="text-[11px] font-semibold text-slate-500">Aktif Kelas 8</div>
          <div className="text-lg font-bold text-[#101D35] tabular-nums">
            {summaryStats.activeKelas8.toLocaleString('id-ID')}
          </div>
        </div>
        <div className="bg-white border border-slate-200/80 rounded-2xl px-4 py-3 shadow-[0_2px_10px_-3px_rgba(16,29,53,0.05)]">
          <div className="text-[11px] font-semibold text-slate-500">Aktif Kelas 9</div>
          <div className="text-lg font-bold text-[#101D35] tabular-nums">
            {summaryStats.activeKelas9.toLocaleString('id-ID')}
          </div>
        </div>
        <div className="bg-white border border-slate-200/80 rounded-2xl px-4 py-3 col-span-2 sm:col-span-1 shadow-[0_2px_10px_-3px_rgba(16,29,53,0.05)]">
          <div className="text-[11px] font-semibold text-slate-500">Ditampilkan / Total Induk</div>
          <div className="text-lg font-bold text-[#315FEA] tabular-nums">
            {filteredAndSortedStudents.length.toLocaleString('id-ID')}{' '}
            <span className="text-xs font-normal text-slate-400">
              / {summaryStats.totalAll.toLocaleString('id-ID')}
            </span>
          </div>
        </div>
      </div>

      {/* Modern Table with Search by Name & Filter by Tingkat, Kelas (A-O), and Status */}
      <ModernTable
        data={filteredAndSortedStudents}
        columns={columns}
        keyExtractor={s => s.id}
        isLoading={loading}
        searchPlaceholder="Cari nama siswa, NIS, atau NISN..."
        searchFilter={(s, q) =>
          s.nama_lengkap.toLowerCase().includes(q) ||
          (s.nis || '').toLowerCase().includes(q) ||
          (s.nisn || '').toLowerCase().includes(q)
        }
        filterControls={
          <div className="flex flex-wrap items-center gap-2">
            <FilterDropdown
              showFilterIcon
              ariaLabel="Filter Tingkat"
              value={filterTingkat}
              onChange={val => {
                setFilterTingkat(val);
                setFilterRombel('all');
              }}
              options={[
                { value: 'all', label: 'Semua Tingkat' },
                { value: '7', label: 'Kelas 7' },
                { value: '8', label: 'Kelas 8' },
                { value: '9', label: 'Kelas 9' }
              ]}
            />

            <FilterDropdown
              ariaLabel="Filter Kelas"
              value={filterRombel}
              onChange={val => setFilterRombel(val)}
              options={[
                { value: 'all', label: 'Semua Kelas' },
                ...CLASS_ROSTER.filter(r => filterTingkat === 'all' || r.startsWith(filterTingkat)).map(r => ({
                  value: r,
                  label: `Kelas ${r}`
                }))
              ]}
            />

            <FilterDropdown
              ariaLabel="Filter Status"
              value={filterStatus}
              onChange={val => setFilterStatus(val)}
              options={[
                { value: 'all', label: 'Semua Status' },
                { value: 'aktif', label: 'Aktif' },
                { value: 'mutasi_masuk', label: 'Mutasi Masuk' },
                { value: 'mutasi_keluar', label: 'Mutasi Keluar' },
                { value: 'lulus', label: 'Lulus' },
                { value: 'non_aktif', label: 'Arsip / Non-Aktif' }
              ]}
            />
          </div>
        }
        emptyTitle="Tidak Ada Siswa Ditemukan"
        emptyMessage="Tidak ada data siswa yang cocok dengan filter atau kata kunci pencarian Anda."
        emptyAction={
          canEdit ? (
            <button
              onClick={() => {
                setEditingStudent(null);
                setIsFormOpen(true);
              }}
              className="px-3 py-1.5 text-xs font-semibold text-blue-900 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100"
            >
              Tambah Siswa Baru
            </button>
          ) : undefined
        }
      />

      {/* Modals */}
      <StudentDetailModal
        siswa={selectedStudent}
        onClose={() => setSelectedStudent(null)}
        onOpenPrintModal={s => {
          setSelectedStudent(null);
          handlePrintSingleF4(s);
        }}
        onEdit={
          canEdit
            ? s => {
                setSelectedStudent(null);
                setEditingStudent(s);
                setIsFormOpen(true);
              }
            : undefined
        }
      />

      <PrintBiodataF4Modal
        isOpen={isPrintModalOpen}
        students={studentsToPrint}
        onClose={() => setIsPrintModalOpen(false)}
      />

      <StudentFormModal
        isOpen={isFormOpen}
        initialData={editingStudent}
        onClose={() => {
          setIsFormOpen(false);
          setEditingStudent(null);
        }}
        onSave={handleSaveStudent}
      />

      {/* Archive Confirmation Modal */}
      <ConfirmationModal
        isOpen={Boolean(studentToArchive)}
        title="Arsipkan Data Siswa"
        message={`Apakah Anda yakin ingin mengarsipkan biodata siswa ${studentToArchive?.nama_lengkap} (NISN: ${studentToArchive?.nisn})? Status siswa akan diubah menjadi Non-Aktif / Arsip namun seluruh riwayat tetap tersimpan aman.`}
        confirmText="Arsipkan Siswa"
        isDanger={false}
        isLoading={isArchiving}
        onClose={() => setStudentToArchive(null)}
        onConfirm={handleArchiveConfirm}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={Boolean(studentToDelete)}
        title="Konfirmasi Penghapusan Siswa"
        message={`Apakah Anda yakin ingin menghapus data siswa ${studentToDelete?.nama_lengkap} (NISN: ${studentToDelete?.nisn})? Catatan: Siswa yang sudah mutasi keluar tidak dapat dihapus.`}
        confirmText="Hapus Siswa"
        isDanger={true}
        isLoading={isDeleting}
        onClose={() => setStudentToDelete(null)}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
};
