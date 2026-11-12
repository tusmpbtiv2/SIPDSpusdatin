import React, { useState, useEffect, useMemo } from 'react';
import { Siswa, StudentGraduationRecord } from '../../types';
import {
  getSiswaList,
  getGraduationsList,
  recordExportLog
} from '../../services/dataService';
import { exportStudentsToExcel } from '../../services/excelService';
import { printStudentBiodataF4 } from '../../services/pdfService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { PageTitle } from '../../components/common/PageTitle';
import { DataTable, Column } from '../../components/common/ModernTable';
import { FilterDropdown } from '../../components/common/FilterDropdown';
import { StudentLifecycleModal } from '../../components/modals/StudentLifecycleModal';
import {
  GraduationCap,
  Download,
  Printer,
  BookOpen,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';
import { formatDateDMY } from '../../utils/formatters';

interface AlumniItem {
  id: string;
  student: Siswa;
  graduation?: StudentGraduationRecord;
  angkatan: string;
  tahunKelulusan: string;
  tanggalKelulusan: string;
  nomorIjazahSmp: string;
  sekolahLanjutan: string;
}

export const ArsipAlumniPage: React.FC = () => {
  const { adminUser, role } = useAuth();
  const { error: notifyError } = useNotification();
  const [students, setStudents] = useState<Siswa[]>([]);
  const [graduations, setGraduations] = useState<StudentGraduationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [angkatanFilter, setAngkatanFilter] = useState('all');
  const [tahunLulusFilter, setTahunLulusFilter] = useState('all');
  const [selectedStudent, setSelectedStudent] = useState<Siswa | null>(null);

  const loadData = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [stList, gradList] = await Promise.all([getSiswaList(), getGraduationsList()]);
      setStudents(stList);
      setGraduations(gradList);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal memuat arsip alumni.';
      setLoadError(msg);
      notifyError('Gagal Memuat', msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const gradByStudentId = useMemo(() => {
    const m = new Map<string, StudentGraduationRecord>();
    graduations.forEach(g => m.set(g.student_id, g));
    return m;
  }, [graduations]);

  const alumniList: AlumniItem[] = useMemo(() => {
    return students
      .filter(s => s.status === 'lulus' || gradByStudentId.has(s.id))
      .map(s => {
        const g = gradByStudentId.get(s.id);
        const angkatan =
          g?.angkatan || s.angkatan || (s.tanggal_masuk || '').slice(0, 4) || s.tahun_masuk || '2023';
        const defaultLulus = /^\d{4}$/.test(angkatan)
          ? String(parseInt(angkatan, 10) + 3)
          : '2026';
        const tahunKelulusan = g?.tahun_kelulusan || s.tahun_lulus || defaultLulus;
        return {
          id: s.id,
          student: s,
          graduation: g,
          angkatan,
          tahunKelulusan,
          tanggalKelulusan: formatDateDMY(g?.tanggal_kelulusan || s.tanggal_lulus),
          nomorIjazahSmp: g?.nomor_ijazah_smp || s.nomor_ijazah_smp || '-',
          sekolahLanjutan: g?.sekolah_lanjutan || '-'
        };
      });
  }, [students, gradByStudentId]);

  const alumniByAngkatan = useMemo(() => {
    const map: Record<string, number> = {};
    alumniList.forEach(a => {
      map[a.angkatan] = (map[a.angkatan] || 0) + 1;
    });
    return Object.entries(map)
      .map(([angkatan, count]) => ({ angkatan, count }))
      .sort((a, b) => b.angkatan.localeCompare(a.angkatan));
  }, [alumniList]);

  const tahunLulusOptions = useMemo(() => {
    const s = new Set<string>();
    alumniList.forEach(a => {
      if (a.tahunKelulusan) s.add(a.tahunKelulusan);
    });
    return Array.from(s).sort().reverse();
  }, [alumniList]);

  const filteredAlumni = useMemo(() => {
    return alumniList.filter(a => {
      if (angkatanFilter !== 'all' && a.angkatan !== angkatanFilter) return false;
      if (tahunLulusFilter !== 'all' && a.tahunKelulusan !== tahunLulusFilter) return false;
      return true;
    });
  }, [alumniList, angkatanFilter, tahunLulusFilter]);

  const handleExportAlumni = async () => {
    exportStudentsToExcel(
      filteredAlumni.map(a => ({
        ...a.student,
        angkatan: a.angkatan,
        tahun_lulus: a.tahunKelulusan
      })),
      { fileNamePrefix: 'Arsip_Alumni_Lintas_Angkatan_SIPDS' }
    );

    await recordExportLog({
      exported_by_name: adminUser?.nama_lengkap || 'Admin Sekolah',
      exported_by_role: role || 'admin',
      export_type: 'Arsip Alumni (Siswa Lulus)',
      filter_summary: { angkatan: angkatanFilter, tahun_kelulusan: tahunLulusFilter },
      total_records: filteredAlumni.length,
      file_name: 'Arsip_Alumni_Lintas_Angkatan_SIPDS.xlsx'
    });
  };

  const columns: Column<AlumniItem>[] = [
    {
      header: 'Tahun Lulus',
      render: item => (
        <span className="px-2.5 py-1 rounded-lg bg-[#10B981]/10 border border-[#10B981]/30 font-mono font-extrabold text-emerald-900 text-xs">
          Lulus {item.tahunKelulusan}
        </span>
      ),
      className: 'w-32 whitespace-nowrap'
    },
    {
      header: 'Angkatan',
      render: item => (
        <span className="font-mono font-semibold text-[#6366F1]">Angkatan {item.angkatan}</span>
      ),
      className: 'w-32 whitespace-nowrap'
    },
    {
      header: 'NIS / NISN',
      render: item => (
        <span className="font-mono text-slate-700">
          {item.student.nis || '-'} / {item.student.nisn || '-'}
        </span>
      ),
      className: 'w-44 whitespace-nowrap'
    },
    {
      header: 'Nama Lengkap Alumni',
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
      header: 'Kelas Terakhir',
      render: item => (
        <span className="font-semibold text-slate-700">Kelas {item.student.rombel}</span>
      ),
      className: 'w-32 whitespace-nowrap'
    },
    {
      header: 'No. Ijazah SMP',
      render: item => <span className="font-mono text-slate-600">{item.nomorIjazahSmp}</span>,
      className: 'w-44 whitespace-nowrap'
    },
    {
      header: 'Sekolah Lanjutan',
      render: item => <span className="text-slate-600">{item.sekolahLanjutan}</span>
    },
    {
      header: 'Aksi & Riwayat',
      align: 'right',
      render: item => (
        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedStudent(item.student)}
            className="px-3 py-1.5 rounded-xl bg-[#EEF3FF] hover:bg-[#315FEA] text-[#315FEA] hover:text-white font-semibold text-xs inline-flex items-center gap-1 transition-colors"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Biodata &amp; Riwayat</span>
          </button>
          <button
            type="button"
            onClick={() => printStudentBiodataF4(item.student)}
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 transition-colors"
            title="Cetak Buku Induk F4"
          >
            <Printer className="w-4 h-4" />
          </button>
        </div>
      ),
      className: 'w-48 whitespace-nowrap'
    }
  ];

  return (
    <div className="space-y-6">
      <PageTitle
        category="Mutasi & Verifikasi"
        title="Arsip Alumni Lintas Angkatan"
        subtitle="Menyimpan dan membaca seluruh arsip siswa yang telah lulus lintas angkatan tanpa batasan tiga tahun. Biodata lengkap 59 kolom, data orang tua, dan riwayat kelas tetap tersimpan utuh."
        icon={GraduationCap}
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
              onClick={handleExportAlumni}
              disabled={filteredAlumni.length === 0}
              className="px-4 py-2 rounded-xl bg-[#10B981] hover:bg-emerald-600 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 transition-all shadow-xs"
            >
              <Download className="w-4 h-4" />
              <span>Export Data Alumni ({filteredAlumni.length.toLocaleString('id-ID')})</span>
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

      {/* Rekapitulasi Jumlah Alumni Setiap Angkatan */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <button
          type="button"
          onClick={() => setAngkatanFilter('all')}
          className={`p-4 rounded-2xl border text-left transition-all ${
            angkatanFilter === 'all'
              ? 'bg-[#101D35] text-white border-[#101D35] shadow-md'
              : 'bg-white text-[#101D35] border-slate-200/80 hover:border-[#10B981]/50 shadow-[0_2px_10px_-3px_rgba(16,29,53,0.05)]'
          }`}
        >
          <span className="text-[10px] font-bold uppercase tracking-wider opacity-80 block">
            Total Seluruh Alumni
          </span>
          <span className="text-xl font-extrabold font-mono mt-1 block tabular-nums">
            {alumniList.length.toLocaleString('id-ID')} Alumni
          </span>
        </button>

        {alumniByAngkatan.map(item => (
          <button
            key={item.angkatan}
            type="button"
            onClick={() => setAngkatanFilter(item.angkatan)}
            className={`p-4 rounded-2xl border text-left transition-all ${
              angkatanFilter === item.angkatan
                ? 'bg-[#10B981] text-white border-[#10B981] shadow-md'
                : 'bg-white text-[#101D35] border-slate-200/80 hover:border-[#10B981]/50 shadow-[0_2px_10px_-3px_rgba(16,29,53,0.05)]'
            }`}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider opacity-80 block">
              Alumni Angkatan {item.angkatan}
            </span>
            <span className="text-xl font-extrabold font-mono mt-1 block tabular-nums">
              {item.count.toLocaleString('id-ID')} Siswa
            </span>
          </button>
        ))}
      </div>

      {/* DataTable with Search, FilterDropdown, and Full Pagination */}
      <DataTable
        data={filteredAlumni}
        columns={columns}
        keyExtractor={item => item.id}
        isLoading={loading}
        searchPlaceholder="Cari alumni: Nama, NIS, NISN, NIK, atau Angkatan..."
        searchFilter={(item, q) =>
          item.student.nama_lengkap.toLowerCase().includes(q) ||
          (item.student.nis || '').toLowerCase().includes(q) ||
          (item.student.nisn || '').toLowerCase().includes(q) ||
          (item.student.nik_siswa || '').toLowerCase().includes(q) ||
          item.angkatan.toLowerCase().includes(q) ||
          item.tahunKelulusan.toLowerCase().includes(q)
        }
        filterControls={
          <div className="flex flex-wrap items-center gap-2">
            <FilterDropdown
              showFilterIcon
              ariaLabel="Filter Angkatan Alumni"
              value={angkatanFilter}
              onChange={setAngkatanFilter}
              options={[
                { value: 'all', label: 'Semua Angkatan' },
                ...alumniByAngkatan.map(a => ({
                  value: a.angkatan,
                  label: `Angkatan ${a.angkatan} (${a.count} Alumni)`
                }))
              ]}
            />

            <FilterDropdown
              ariaLabel="Filter Tahun Kelulusan"
              value={tahunLulusFilter}
              onChange={setTahunLulusFilter}
              options={[
                { value: 'all', label: 'Semua Tahun Kelulusan' },
                ...tahunLulusOptions.map(th => ({
                  value: th,
                  label: `Tahun Kelulusan ${th}`
                }))
              ]}
            />
          </div>
        }
        emptyTitle="Belum Ada Data Alumni pada Filter Ini"
        emptyMessage="Siswa Kelas IX yang diluluskan melalui menu Proses Akhir Tahun -> Kelulusan akan otomatis tersimpan di halaman ini."
      />

      <StudentLifecycleModal
        student={selectedStudent}
        onClose={() => setSelectedStudent(null)}
        onUpdated={loadData}
      />
    </div>
  );
};
