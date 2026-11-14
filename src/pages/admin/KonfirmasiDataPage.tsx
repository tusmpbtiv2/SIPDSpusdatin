import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  Siswa,
  DataConfirmationEvent,
  StudentDataConfirmationRecord,
  PerubahanBiodata,
  ALL_59_STUDENT_FIELDS
} from '../../types';
import {
  getSiswaList,
  getConfirmationEventsState,
  saveConfirmationEvent,
  deleteConfirmationEvent,
  submitParentDataConfirmation,
  getPerubahanList,
  reviewPerubahanItems,
  ItemReviewDecision
} from '../../services/dataService';
import { CLASS_ROSTER, SCHOOL_CONFIG } from '../../config/school';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { PageTitle } from '../../components/common/PageTitle';
import { StatisticCard } from '../../components/common/StatCard';
import { DataTable, Column } from '../../components/common/ModernTable';
import { StatusBadge } from '../../components/common/ZeroPillBadge';
import { VerificationDetailModal } from '../../components/admin/VerificationDetailModal';
import { formatDateDMY } from '../../utils/formatters';
import {
  ClipboardCheck,
  Plus,
  Calendar,
  Layers,
  Columns,
  CheckCircle2,
  XCircle,
  Clock,
  Users,
  CheckSquare,
  FileSpreadsheet,
  Search,
  Edit3,
  Trash2,
  RefreshCw,
  ArrowRight,
  UserCheck,
  Filter
} from 'lucide-react';

const DEFAULT_EVENT_COLUMNS: string[] = [
  'nama_lengkap',
  'nisn',
  'nik_siswa',
  'no_kk',
  'jenis_kelamin',
  'tempat_lahir',
  'tanggal_lahir',
  'nama_ayah',
  'nik_ayah',
  'pekerjaan_ayah',
  'penghasilan_ayah',
  'nama_ibu',
  'nik_ibu',
  'pekerjaan_ibu',
  'penghasilan_ibu',
  'alamat',
  'no_hp_orangtua'
];

interface StudentMonitoringRow {
  student: Siswa;
  confirmation: StudentDataConfirmationRecord | null;
  linkedProposal: PerubahanBiodata | null;
  effectiveStatus:
    | 'belum_konfirmasi'
    | 'confirmed_valid'
    | 'submitted_correction'
    | 'correction_approved';
}

export const KonfirmasiDataPage: React.FC = () => {
  const { adminUser, role } = useAuth();
  const { success, error: notifyError } = useNotification();

  const canManage = role === 'super_admin' || role === 'admin' || role === 'operator';

  const [activeTab, setActiveTab] = useState<'monitoring' | 'proposals' | 'manage_events'>('monitoring');

  const [students, setStudents] = useState<Siswa[]>([]);
  const [events, setEvents] = useState<DataConfirmationEvent[]>([]);
  const [confirmations, setConfirmations] = useState<StudentDataConfirmationRecord[]>([]);
  const [proposals, setProposals] = useState<PerubahanBiodata[]>([]);
  const [loading, setLoading] = useState(true);

  // Selected event for monitoring
  const [selectedEventId, setSelectedEventId] = useState<string>('');

  // Monitoring Filters
  const [statusFilter, setStatusFilter] = useState<
    | 'all'
    | 'sudah_all'
    | 'belum_konfirmasi'
    | 'confirmed_valid'
    | 'submitted_correction'
    | 'correction_approved'
  >('all');
  const [kelasFilter, setKelasFilter] = useState<string>('all');

  // Modal Verifikasi Pengajuan
  const [selectedProposalForReview, setSelectedProposalForReview] =
    useState<PerubahanBiodata | null>(null);

  // Form Create / Edit Event
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [namaPeriode, setNamaPeriode] = useState('');
  const [tahunAjaran, setTahunAjaran] = useState(SCHOOL_CONFIG.tahun_ajaran || '2026/2027');
  const [deskripsi, setDeskripsi] = useState('');
  const [tanggalMulai, setTanggalMulai] = useState(() => new Date().toISOString().slice(0, 10));
  const [tanggalSelesai, setTanggalSelesai] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [targetClasses, setTargetClasses] = useState<string[]>([]);
  const [targetColumns, setTargetColumns] = useState<string[]>(DEFAULT_EVENT_COLUMNS);
  const [isActiveEvent, setIsActiveEvent] = useState(true);
  const [columnSearch, setColumnSearch] = useState('');
  const [isSavingEvent, setIsSavingEvent] = useState(false);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [stList, confState, propList] = await Promise.all([
        getSiswaList(),
        getConfirmationEventsState(),
        getPerubahanList()
      ]);
      setStudents(stList);
      setEvents(confState.events);
      setConfirmations(confState.confirmations);
      setProposals(propList);

      if (confState.events.length > 0 && !selectedEventId) {
        setSelectedEventId(confState.events[0].id);
      }
    } catch (err: unknown) {
      notifyError(
        'Gagal Memuat Data Konfirmasi',
        err instanceof Error ? err.message : 'Terjadi kesalahan saat memuat data.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  useEffect(() => {
    if (events.length > 0 && !events.some(e => e.id === selectedEventId)) {
      setSelectedEventId(events[0].id);
    }
  }, [events, selectedEventId]);

  const activeEvent = useMemo(
    () => events.find(e => e.id === selectedEventId) || events[0] || null,
    [events, selectedEventId]
  );

  const allAvailableClasses = useMemo(() => {
    const set = new Set<string>(CLASS_ROSTER);
    students.forEach(s => {
      if (s.rombel && s.rombel.trim() && s.rombel !== '-') {
        set.add(s.rombel.trim());
      }
    });
    return Array.from(set);
  }, [students]);

  const studentByNisnOrId = useMemo(() => {
    const map = new Map<string, Siswa>();
    students.forEach(s => {
      if (s.nisn) map.set(s.nisn, s);
      if (s.id) map.set(s.id, s);
    });
    return map;
  }, [students]);

  // Daftar siswa target sesuai event yang dipilih (hanya siswa aktif / mutasi_masuk)
  const monitoringRows = useMemo<StudentMonitoringRow[]>(() => {
    if (!activeEvent) return [];

    const activeStudents = students.filter(
      s => s.status === 'aktif' || s.status === 'mutasi_masuk'
    );

    const targetStudents =
      activeEvent.target_classes && activeEvent.target_classes.length > 0
        ? activeStudents.filter(s => activeEvent.target_classes.includes(s.rombel))
        : activeStudents;

    const confByNisn = new Map<string, StudentDataConfirmationRecord>();
    confirmations
      .filter(c => c.event_id === activeEvent.id)
      .forEach(c => {
        if (c.nisn) confByNisn.set(c.nisn, c);
        if (c.siswa_id) confByNisn.set(c.siswa_id, c);
      });

    return targetStudents.map(st => {
      const conf = confByNisn.get(st.nisn) || confByNisn.get(st.id) || null;
      const linkedProp =
        proposals.find(
          p =>
            (conf?.change_request_id && p.id === conf.change_request_id) ||
            (p.event_id === activeEvent.id && (p.nisn === st.nisn || p.siswa_id === st.id)) ||
            (!p.event_id && p.nisn === st.nisn && p.status === 'pending')
        ) || null;

      let effectiveStatus: StudentMonitoringRow['effectiveStatus'] = 'belum_konfirmasi';
      if (conf) {
        if (
          conf.status === 'correction_approved' ||
          linkedProp?.status === 'approved' ||
          linkedProp?.status === 'partially_approved'
        ) {
          effectiveStatus = 'correction_approved';
        } else if (conf.status === 'submitted_correction') {
          effectiveStatus = 'submitted_correction';
        } else {
          effectiveStatus = 'confirmed_valid';
        }
      } else if (linkedProp) {
        if (linkedProp.status === 'approved' || linkedProp.status === 'partially_approved') {
          effectiveStatus = 'correction_approved';
        } else if (linkedProp.status === 'pending') {
          effectiveStatus = 'submitted_correction';
        }
      }

      return {
        student: st,
        confirmation: conf,
        linkedProposal: linkedProp,
        effectiveStatus
      };
    });
  }, [activeEvent, students, confirmations, proposals]);

  const monitoringStats = useMemo(() => {
    const total = monitoringRows.length;
    const confirmedValid = monitoringRows.filter(
      r => r.effectiveStatus === 'confirmed_valid'
    ).length;
    const submittedCorrection = monitoringRows.filter(
      r => r.effectiveStatus === 'submitted_correction'
    ).length;
    const correctionApproved = monitoringRows.filter(
      r => r.effectiveStatus === 'correction_approved'
    ).length;
    const sudahTotal = confirmedValid + submittedCorrection + correctionApproved;
    const belumTotal = total - sudahTotal;
    const percentage = total > 0 ? Math.round((sudahTotal / total) * 100) : 0;

    return {
      total,
      sudahTotal,
      belumTotal,
      confirmedValid,
      submittedCorrection,
      correctionApproved,
      percentage
    };
  }, [monitoringRows]);

  const filteredMonitoringRows = useMemo(() => {
    return monitoringRows.filter(row => {
      if (kelasFilter !== 'all' && row.student.rombel !== kelasFilter) return false;
      if (statusFilter === 'sudah_all' && row.effectiveStatus === 'belum_konfirmasi') {
        return false;
      }
      if (
        statusFilter !== 'all' &&
        statusFilter !== 'sudah_all' &&
        row.effectiveStatus !== statusFilter
      ) {
        return false;
      }
      return true;
    });
  }, [monitoringRows, kelasFilter, statusFilter]);

  const nonDraftProposals = useMemo(
    () => proposals.filter(p => p.status !== 'draft'),
    [proposals]
  );

  // Handlers untuk Form Periode / Event Konfirmasi
  const resetEventForm = () => {
    setEditingEventId(null);
    setNamaPeriode('');
    setTahunAjaran(SCHOOL_CONFIG.tahun_ajaran || '2026/2027');
    setDeskripsi('');
    setTanggalMulai(new Date().toISOString().slice(0, 10));
    const end = new Date();
    end.setDate(end.getDate() + 30);
    setTanggalSelesai(end.toISOString().slice(0, 10));
    setTargetClasses([]);
    setTargetColumns(DEFAULT_EVENT_COLUMNS);
    setIsActiveEvent(true);
  };

  const handleEditEvent = (ev: DataConfirmationEvent) => {
    setEditingEventId(ev.id);
    setNamaPeriode(ev.nama_periode);
    setTahunAjaran(ev.tahun_ajaran);
    setDeskripsi(ev.deskripsi || '');
    setTanggalMulai(ev.tanggal_mulai);
    setTanggalSelesai(ev.tanggal_selesai);
    setTargetClasses(ev.target_classes || []);
    setTargetColumns(
      ev.target_columns && ev.target_columns.length > 0
        ? ev.target_columns
        : DEFAULT_EVENT_COLUMNS
    );
    setIsActiveEvent(ev.is_active);
    setActiveTab('manage_events');
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!namaPeriode.trim()) {
      notifyError('Nama Periode Wajib Diisi', 'Silakan masukkan judul/nama periode konfirmasi data.');
      return;
    }
    if (!tanggalMulai || !tanggalSelesai) {
      notifyError('Kurun Waktu Wajib Diisi', 'Silakan pilih Tanggal Mulai dan Tanggal Selesai.');
      return;
    }
    if (tanggalSelesai < tanggalMulai) {
      notifyError(
        'Tanggal Tidak Valid',
        'Tanggal selesai tidak boleh lebih awal dari tanggal mulai.'
      );
      return;
    }
    if (targetColumns.length === 0) {
      notifyError(
        'Pilih Minimal 1 Kolom Identitas',
        'Silakan centang minimal 1 kolom identitas siswa yang wajib dikonfirmasi oleh wali murid.'
      );
      return;
    }

    setIsSavingEvent(true);
    try {
      const saved = await saveConfirmationEvent(
        {
          id: editingEventId || undefined,
          nama_periode: namaPeriode.trim(),
          tahun_ajaran: tahunAjaran,
          deskripsi: deskripsi.trim(),
          tanggal_mulai: tanggalMulai,
          tanggal_selesai: tanggalSelesai,
          target_classes: targetClasses,
          target_columns: targetColumns,
          is_active: isActiveEvent
        },
        {
          name: adminUser?.nama_lengkap || 'Admin Sekolah',
          role: role || 'admin'
        }
      );

      success(
        editingEventId ? 'Periode Konfirmasi Diperbarui' : 'Periode Konfirmasi Dibuat',
        `Event "${saved.nama_periode}" berhasil disimpan dan langsung aktif di Portal Login Orang Tua.`
      );
      resetEventForm();
      setSelectedEventId(saved.id);
      await loadAllData();
      setActiveTab('monitoring');
    } catch (err: unknown) {
      notifyError(
        'Gagal Menyimpan Periode',
        err instanceof Error ? err.message : 'Terjadi kesalahan saat menyimpan periode konfirmasi.'
      );
    } finally {
      setIsSavingEvent(false);
    }
  };

  const handleDeleteEvent = async (ev: DataConfirmationEvent) => {
    try {
      await deleteConfirmationEvent(ev.id, {
        name: adminUser?.nama_lengkap || 'Admin Sekolah',
        role: role || 'admin'
      });
      success('Periode Dihapus', `Periode "${ev.nama_periode}" telah dihapus.`);
      await loadAllData();
    } catch (err: unknown) {
      notifyError(
        'Gagal Menghapus',
        err instanceof Error ? err.message : 'Tidak dapat menghapus periode konfirmasi.'
      );
    }
  };

  const handleToggleEventActive = async (ev: DataConfirmationEvent) => {
    try {
      await saveConfirmationEvent(
        {
          ...ev,
          is_active: !ev.is_active
        },
        {
          name: adminUser?.nama_lengkap || 'Admin Sekolah',
          role: role || 'admin'
        }
      );
      success(
        'Status Periode Diperbarui',
        `Periode "${ev.nama_periode}" kini ${!ev.is_active ? 'AKTIF' : 'NONAKTIF'}.`
      );
      await loadAllData();
    } catch (err: unknown) {
      notifyError(
        'Gagal Mengubah Status',
        err instanceof Error ? err.message : 'Terjadi kesalahan.'
      );
    }
  };

  const handleManualConfirmByAdmin = async (student: Siswa) => {
    if (!activeEvent) return;
    try {
      await submitParentDataConfirmation({
        event: activeEvent,
        student,
        nama_wali:
          student.nama_wali ||
          student.nama_ayah ||
          student.nama_ibu ||
          `Dikonfirmasi via Admin (${adminUser?.nama_lengkap || 'TU'})`,
        hubungan_wali: 'Konfirmasi melalui Admin TU',
        no_hp_wali: student.no_hp_orangtua || '',
        status: 'confirmed_valid',
        catatan_wali: `Dikonfirmasi sesuai oleh Admin (${adminUser?.nama_lengkap || 'TU'})`
      });
      success(
        'Status Konfirmasi Tercatat',
        `${student.nama_lengkap} (Kelas ${student.rombel}) telah ditandai SUDAH KONFIRMASI.`
      );
      await loadAllData();
    } catch (err: unknown) {
      notifyError(
        'Gagal Mencatat Konfirmasi',
        err instanceof Error ? err.message : 'Terjadi kesalahan.'
      );
    }
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
      success(
        'Pengajuan Disetujui',
        'Perubahan data telah diterapkan ke Buku Induk Siswa dan status konfirmasi diperbarui.'
      );
    } else if (finalStatus === 'partially_approved') {
      success(
        'Disetujui Sebagian',
        'Kolom yang disetujui telah diperbarui pada Buku Induk Siswa.'
      );
    } else {
      success('Pengajuan Ditolak', 'Pengajuan perubahan biodata telah ditolak.');
    }
    await loadAllData();
  };

  const handleExportMonitoringExcel = () => {
    if (!activeEvent) return;
    const fieldMap = new Map(ALL_59_STUDENT_FIELDS.map(f => [String(f.key), f]));
    const eventFields = (activeEvent.target_columns || [])
      .map(k => fieldMap.get(k))
      .filter((f): f is (typeof ALL_59_STUDENT_FIELDS)[number] => Boolean(f));

    const rows = filteredMonitoringRows.map((r, idx) => {
      const statusLabel =
        r.effectiveStatus === 'confirmed_valid'
          ? 'SUDAH KONFIRMASI (DATA SESUAI)'
          : r.effectiveStatus === 'correction_approved'
          ? 'SUDAH KONFIRMASI (PERBAIKAN DISETUJUI)'
          : r.effectiveStatus === 'submitted_correction'
          ? 'SUDAH KONFIRMASI (MENGAJUKAN PERBAIKAN)'
          : 'BELUM KONFIRMASI';

      const baseObj: Record<string, string> = {
        NO: String(idx + 1),
        KELAS: r.student.rombel || '-',
        NIS: r.student.nis || '-',
        NISN: r.student.nisn || '-',
        'NAMA LENGKAP SISWA': r.student.nama_lengkap,
        'STATUS KONFIRMASI': statusLabel,
        'WAKTU KONFIRMASI': r.confirmation?.confirmed_at
          ? new Date(r.confirmation.confirmed_at).toLocaleString('id-ID')
          : '-',
        'NAMA WALI PENGONFIRMASI': r.confirmation?.nama_wali || '-',
        'CATATAN / ALASAN PENGAJUAN':
          r.linkedProposal?.alasan || r.confirmation?.catatan_wali || '-'
      };

      for (const f of eventFields) {
        const val = r.student[f.key];
        baseObj[f.excelHeader] = val !== undefined && val !== null ? String(val) : '';
      }
      return baseObj;
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    for (let R = range.s.r + 1; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = ws[addr];
        if (cell && cell.v !== undefined) {
          cell.t = 's';
          cell.z = '@';
        }
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Monitoring_Konfirmasi');
    const dateStamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Rekap_Konfirmasi_Data_Siswa_${dateStamp}.xlsx`, {
      bookType: 'xlsx'
    });
    success(
      'Export Berhasil',
      `Rekapitulasi ${filteredMonitoringRows.length} siswa berhasil diunduh ke Excel.`
    );
  };

  // Multi-select helpers for Event creation
  const toggleClassInForm = (cls: string) => {
    setTargetClasses(prev =>
      prev.includes(cls) ? prev.filter(c => c !== cls) : [...prev, cls]
    );
  };

  const selectClassGroupInForm = (group: 'all_reset' | '7' | '8' | '9') => {
    if (group === 'all_reset') {
      setTargetClasses([]);
      return;
    }
    setTargetClasses(allAvailableClasses.filter(c => c.startsWith(group)));
  };

  const toggleColumnInForm = (colKey: string) => {
    setTargetColumns(prev =>
      prev.includes(colKey) ? prev.filter(k => k !== colKey) : [...prev, colKey]
    );
  };

  const applyColumnPresetInForm = (
    preset: 'default' | 'all' | 'identitas' | 'orang_tua' | 'alamat' | 'ijazah' | 'clear'
  ) => {
    if (preset === 'clear') {
      setTargetColumns([]);
      return;
    }
    if (preset === 'default') {
      setTargetColumns(DEFAULT_EVENT_COLUMNS);
      return;
    }
    if (preset === 'all') {
      setTargetColumns(ALL_59_STUDENT_FIELDS.map(f => String(f.key)));
      return;
    }
    if (preset === 'identitas') {
      setTargetColumns([
        'nama_lengkap',
        'nis',
        'nisn',
        'nik_siswa',
        'no_kk',
        'jenis_kelamin',
        'tempat_lahir',
        'tanggal_lahir',
        'agama',
        'status_anak',
        'anak_ke',
        'jml_saudara_kandung'
      ]);
      return;
    }
    if (preset === 'orang_tua') {
      setTargetColumns([
        'nama_lengkap',
        'nisn',
        'nama_ayah',
        'nik_ayah',
        'pekerjaan_ayah',
        'penghasilan_ayah',
        'no_wa_ayah',
        'nama_ibu',
        'nik_ibu',
        'pekerjaan_ibu',
        'penghasilan_ibu',
        'no_wa_ibu',
        'nama_wali',
        'pekerjaan_wali',
        'penghasilan_wali',
        'no_hp_orangtua'
      ]);
      return;
    }
    if (preset === 'alamat') {
      setTargetColumns([
        'nama_lengkap',
        'nisn',
        'jalan_dusun',
        'rt_rw',
        'kelurahan',
        'kecamatan',
        'kab_kota',
        'provinsi',
        'kode_pos',
        'alamat'
      ]);
      return;
    }
    if (preset === 'ijazah') {
      setTargetColumns([
        'nama_lengkap',
        'nisn',
        'tempat_lahir',
        'tanggal_lahir',
        'nama_ayah',
        'nama_ibu',
        'no_ijazah_sd',
        'tgl_ijazah_sd',
        'jenjang_asal',
        'nama_asal_sekolah',
        'npsn_asal_sekolah'
      ]);
    }
  };

  const filteredColumnsForForm = useMemo(() => {
    const q = columnSearch.trim().toLowerCase();
    if (!q) return ALL_59_STUDENT_FIELDS;
    return ALL_59_STUDENT_FIELDS.filter(
      f =>
        f.label.toLowerCase().includes(q) ||
        f.excelHeader.toLowerCase().includes(q) ||
        String(f.key).toLowerCase().includes(q)
    );
  }, [columnSearch]);

  // Tabel Monitoring Siswa Sudah & Belum Konfirmasi
  const monitoringColumns: Column<StudentMonitoringRow>[] = [
    {
      header: 'Kelas',
      render: r => (
        <span className="px-2.5 py-1 rounded-lg bg-[#315FEA]/10 text-[#315FEA] font-mono text-xs font-extrabold">
          {r.student.rombel}
        </span>
      ),
      className: 'w-20 text-center'
    },
    {
      header: 'Identitas Siswa',
      render: r => (
        <div className="text-xs">
          <div className="font-bold text-[#101D35]">{r.student.nama_lengkap}</div>
          <div className="text-[11px] font-mono text-slate-500">
            NIS: <strong className="text-slate-700">{r.student.nis || '-'}</strong> · NISN:{' '}
            <strong className="text-slate-700">{r.student.nisn}</strong>
          </div>
        </div>
      ),
      className: 'w-60'
    },
    {
      header: 'Status Konfirmasi Wali Murid',
      render: r => {
        if (r.effectiveStatus === 'confirmed_valid') {
          return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Sudah Konfirmasi (Data Sesuai)</span>
            </span>
          );
        }
        if (r.effectiveStatus === 'correction_approved') {
          return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-100 border border-emerald-300 text-emerald-900 text-xs font-bold">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
              <span>Terkonfirmasi &amp; Perbaikan Disetujui</span>
            </span>
          );
        }
        if (r.effectiveStatus === 'submitted_correction') {
          return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold">
              <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>Mengajukan Perbaikan Data</span>
            </span>
          );
        }
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold">
            <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
            <span>Belum Konfirmasi</span>
          </span>
        );
      },
      className: 'w-64'
    },
    {
      header: 'Wali Pengonfirmasi & Waktu',
      render: r =>
        r.confirmation ? (
          <div className="text-xs">
            <div className="font-bold text-slate-800">{r.confirmation.nama_wali}</div>
            <div className="text-[11px] font-mono text-slate-500">
              {new Date(r.confirmation.confirmed_at).toLocaleString('id-ID')}
            </div>
          </div>
        ) : (
          <span className="text-xs text-slate-400 italic">
            Orang Tua: {r.student.nama_ayah || r.student.nama_ibu || '-'}
          </span>
        ),
      className: 'w-48'
    },
    {
      header: 'Rincian Pengajuan / Catatan',
      render: r => {
        if (r.linkedProposal) {
          const count = Object.keys(r.linkedProposal.fields_changed).length;
          return (
            <div className="text-xs space-y-1 max-w-xs">
              <div className="flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-[#315FEA] font-mono text-[11px] font-bold">
                  {count} Kolom Diusulkan
                </span>
                <StatusBadge status={r.linkedProposal.status} />
              </div>
              <div className="text-[11px] text-slate-600 line-clamp-1">
                {r.linkedProposal.alasan}
              </div>
            </div>
          );
        }
        if (r.confirmation?.catatan_wali) {
          return (
            <span className="text-xs text-slate-600">{r.confirmation.catatan_wali}</span>
          );
        }
        return <span className="text-xs text-slate-400">-</span>;
      }
    },
    {
      header: 'Aksi Admin',
      align: 'right',
      render: r => (
        <div className="flex items-center justify-end gap-1.5">
          {r.linkedProposal && (
            <button
              type="button"
              onClick={() => setSelectedProposalForReview(r.linkedProposal)}
              className="px-3 py-1.5 rounded-xl bg-[#315FEA] hover:bg-[#244CD2] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>
                {r.linkedProposal.status === 'pending'
                  ? 'Setujui / Verifikasi'
                  : 'Detail Pengajuan'}
              </span>
            </button>
          )}
          {r.effectiveStatus === 'belum_konfirmasi' && canManage && (
            <button
              type="button"
              onClick={() => handleManualConfirmByAdmin(r.student)}
              className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
              title="Tandai siswa sudah konfirmasi sesuai"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Tandai Sudah Konfirmasi</span>
            </button>
          )}
        </div>
      )
    }
  ];

  const selectedCurrentStudent = useMemo(() => {
    if (!selectedProposalForReview) return null;
    return (
      studentByNisnOrId.get(selectedProposalForReview.siswa_id) ||
      studentByNisnOrId.get(selectedProposalForReview.nisn) ||
      null
    );
  }, [selectedProposalForReview, studentByNisnOrId]);

  return (
    <div className="space-y-6">
      <PageTitle
        category="Mutasi & Verifikasi"
        title="Periode & Monitoring Konfirmasi Data Siswa"
        subtitle="Kelola event konfirmasi data siswa dengan kurun waktu, kelas, & kolom identitas tertentu, pantau siswa yang sudah/belum konfirmasi, dan setujui pengajuan perubahan data dari Wali Murid."
        icon={ClipboardCheck}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={loadAllData}
              className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#315FEA]' : ''}`} />
              <span>Muat Ulang</span>
            </button>
            {canManage && (
              <button
                type="button"
                onClick={() => {
                  resetEventForm();
                  setActiveTab('manage_events');
                }}
                className="px-4 py-2 rounded-xl bg-[#315FEA] hover:bg-[#244CD2] text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Buat Periode / Event Konfirmasi Baru</span>
              </button>
            )}
          </div>
        }
      />

      {/* Navigasi 3 Tab Utama */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-1.5 shadow-2xs flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setActiveTab('monitoring')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'monitoring'
              ? 'bg-[#101D35] text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>1. Monitoring Siswa Sudah &amp; Belum Konfirmasi</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('proposals')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'proposals'
              ? 'bg-[#101D35] text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <CheckSquare className="w-4 h-4" />
          <span>2. Pengajuan Perubahan Data Wali Murid</span>
          {nonDraftProposals.filter(p => p.status === 'pending').length > 0 && (
            <span className="px-1.5 py-0.5 rounded-md bg-amber-400 text-slate-950 font-mono text-[10px] font-extrabold">
              {nonDraftProposals.filter(p => p.status === 'pending').length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('manage_events')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'manage_events'
              ? 'bg-[#101D35] text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>3. Atur Periode, Kelas &amp; Kolom Konfirmasi ({events.length})</span>
        </button>
      </div>

      {/* =====================================================================
          TAB 1: MONITORING SISWA SUDAH & BELUM KONFIRMASI DATA
      ===================================================================== */}
      {activeTab === 'monitoring' && (
        <div className="space-y-6">
          {events.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-3">
              <ClipboardCheck className="w-10 h-10 text-[#315FEA] mx-auto" />
              <h3 className="text-base font-bold text-[#101D35]">
                Belum Ada Periode / Event Konfirmasi Data Siswa
              </h3>
              <p className="text-xs text-slate-500 max-w-lg mx-auto">
                Silakan buat Periode / Event Konfirmasi Data terlebih dahulu dengan menentukan Kurun Waktu, Kelas Tertentu, dan Kolom Identitas Tertentu agar Wali Murid dapat mengonfirmasi di Portal Login Orang Tua.
              </p>
              {canManage && (
                <button
                  type="button"
                  onClick={() => setActiveTab('manage_events')}
                  className="px-4 py-2.5 rounded-xl bg-[#315FEA] hover:bg-[#244CD2] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Buat Periode Konfirmasi Sekarang</span>
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Bar Pilih Event Aktif & Ringkasan Konfigurasi Event */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#315FEA]">
                        Periode / Event yang Dipantau:
                      </span>
                      {activeEvent?.is_active ? (
                        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                          AKTIF DI PORTAL ORANG TUA
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-bold">
                          NONAKTIF
                        </span>
                      )}
                    </div>
                    <select
                      value={activeEvent?.id || ''}
                      onChange={e => setSelectedEventId(e.target.value)}
                      className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-sm font-extrabold text-[#101D35] focus:outline-none focus:ring-2 focus:ring-[#315FEA]/20"
                    >
                      {events.map(ev => (
                        <option key={ev.id} value={ev.id}>
                          {ev.nama_periode} ({formatDateDMY(ev.tanggal_mulai)} s/d{' '}
                          {formatDateDMY(ev.tanggal_selesai)})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {activeEvent && canManage && (
                      <button
                        type="button"
                        onClick={() => handleEditEvent(activeEvent)}
                        className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Ubah Kurun Waktu / Kelas / Kolom</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleExportMonitoringExcel}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <FileSpreadsheet className="w-4 h-4" />
                      <span>Export Rekap Sudah &amp; Belum Konfirmasi (.XLSX)</span>
                    </button>
                  </div>
                </div>

                {activeEvent && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-100 text-xs">
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                      <span className="text-slate-400 font-semibold block">Kurun Waktu Konfirmasi:</span>
                      <strong className="font-mono text-[#101D35]">
                        {formatDateDMY(activeEvent.tanggal_mulai)} s/d{' '}
                        {formatDateDMY(activeEvent.tanggal_selesai)}
                      </strong>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                      <span className="text-slate-400 font-semibold block">Target Kelas:</span>
                      <strong className="text-[#101D35]">
                        {activeEvent.target_classes.length === 0
                          ? 'Semua Kelas (7A s/d 9O)'
                          : `${activeEvent.target_classes.length} Kelas (${activeEvent.target_classes.join(', ')})`}
                      </strong>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                      <span className="text-slate-400 font-semibold block">Kolom Identitas yang Dikonfirmasi:</span>
                      <strong className="text-[#101D35]">
                        {activeEvent.target_columns.length} Kolom Identitas Buku Induk
                      </strong>
                    </div>
                  </div>
                )}
              </div>

              {/* 4 Kartu Statistik Monitoring */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatisticCard
                  title="Total Siswa Target Event"
                  value={monitoringStats.total}
                  subtitle="Siswa pada kelas target event"
                  icon={Users}
                  accent="blue"
                  onClick={() => setStatusFilter('all')}
                />
                <StatisticCard
                  title="Sudah Konfirmasi Data"
                  value={monitoringStats.sudahTotal}
                  subtitle={`${monitoringStats.percentage}% selesai (${monitoringStats.confirmedValid} sesuai, ${monitoringStats.correctionApproved} disetujui)`}
                  icon={CheckCircle2}
                  accent="emerald"
                  onClick={() => setStatusFilter('sudah_all')}
                />
                <StatisticCard
                  title="Belum Konfirmasi Data"
                  value={monitoringStats.belumTotal}
                  subtitle="Wali murid belum konfirmasi"
                  icon={XCircle}
                  accent="rose"
                  onClick={() => setStatusFilter('belum_konfirmasi')}
                />
                <StatisticCard
                  title="Mengajukan Perbaikan Data"
                  value={monitoringStats.submittedCorrection}
                  subtitle="Menunggu persetujuan Admin"
                  icon={Clock}
                  accent="amber"
                  onClick={() => setStatusFilter('submitted_correction')}
                />
              </div>

              {/* Filter Status & Kelas */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[#101D35] mr-1">
                    <Filter className="w-3.5 h-3.5 text-[#315FEA]" />
                    <span>Filter Status:</span>
                  </div>
                  {[
                    { id: 'all', label: `Semua (${monitoringStats.total})` },
                    { id: 'sudah_all', label: `Sudah Konfirmasi (${monitoringStats.sudahTotal})` },
                    { id: 'belum_konfirmasi', label: `Belum Konfirmasi (${monitoringStats.belumTotal})` },
                    { id: 'confirmed_valid', label: `Data Sesuai (${monitoringStats.confirmedValid})` },
                    { id: 'submitted_correction', label: `Mengajukan Perbaikan (${monitoringStats.submittedCorrection})` },
                    { id: 'correction_approved', label: `Perbaikan Disetujui (${monitoringStats.correctionApproved})` }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() =>
                        setStatusFilter(tab.id as typeof statusFilter)
                      }
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        statusFilter === tab.id
                          ? 'bg-[#315FEA] text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-600">Kelas:</span>
                  <select
                    value={kelasFilter}
                    onChange={e => setKelasFilter(e.target.value)}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800"
                  >
                    <option value="all">Semua Kelas Target</option>
                    {(activeEvent && activeEvent.target_classes.length > 0
                      ? activeEvent.target_classes
                      : allAvailableClasses
                    ).map(c => (
                      <option key={c} value={c}>
                        Kelas {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Tabel Siswa Sudah & Belum Konfirmasi */}
              <DataTable
                data={filteredMonitoringRows}
                columns={monitoringColumns}
                keyExtractor={r => r.student.id}
                isLoading={loading}
                searchPlaceholder="Cari nama siswa, NIS, NISN, kelas, atau nama wali..."
                searchFilter={(r, q) =>
                  Boolean(
                    r.student.nama_lengkap.toLowerCase().includes(q) ||
                      (r.student.nis && r.student.nis.toLowerCase().includes(q)) ||
                      r.student.nisn.toLowerCase().includes(q) ||
                      r.student.rombel.toLowerCase().includes(q) ||
                      (r.confirmation?.nama_wali &&
                        r.confirmation.nama_wali.toLowerCase().includes(q))
                  )
                }
                emptyTitle="Tidak Ada Siswa pada Kriteria Ini"
                emptyMessage="Tidak ditemukan data siswa yang sesuai dengan filter status konfirmasi atau kelas yang dipilih."
              />
            </>
          )}
        </div>
      )}

      {/* =====================================================================
          TAB 2: DAFTAR PENGAJUAN PERUBAHAN DATA WALI MURID (LIHAT & SETUJUI)
      ===================================================================== */}
      {activeTab === 'proposals' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-blue-50/80 border border-blue-200 text-xs text-blue-950 flex items-center justify-between gap-3">
            <div>
              <strong>Verifikasi &amp; Persetujuan Pengajuan Perubahan Data:</strong> Klik tombol{' '}
              <strong>Verifikasi / Setujui</strong> pada baris pengajuan untuk meninjau Data Lama vs Data Baru dan memperbarui Buku Induk Siswa secara otomatis.
            </div>
          </div>

          <DataTable
            data={nonDraftProposals}
            columns={[
              {
                header: 'Waktu Pengajuan',
                render: item => (
                  <div className="text-xs font-mono">
                    <div className="font-bold text-[#101D35]">{formatDateDMY(item.submitted_at)}</div>
                    <div className="text-[10px] text-slate-400">
                      {new Date(item.submitted_at).toLocaleTimeString('id-ID', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                  </div>
                ),
                className: 'w-32'
              },
              {
                header: 'Siswa & Kelas',
                render: item => (
                  <div className="text-xs">
                    <div className="font-bold text-[#101D35]">{item.nama_siswa}</div>
                    <div className="text-[11px] font-mono text-slate-500">
                      NISN: {item.nisn} · Kelas {item.kelas}
                    </div>
                    {item.event_name && (
                      <span className="inline-block mt-0.5 px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-[#315FEA] text-[10px] font-bold">
                        Event: {item.event_name}
                      </span>
                    )}
                  </div>
                ),
                className: 'w-56'
              },
              {
                header: 'Wali Pengaju',
                render: item => (
                  <div className="text-xs">
                    <div className="font-bold text-slate-800">
                      {item.requester_name || 'Orang Tua / Wali'}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {item.requester_relation || 'Wali Murid'}
                    </div>
                  </div>
                ),
                className: 'w-44'
              },
              {
                header: 'Perubahan Kolom Identitas (Lama vs Baru)',
                render: item => {
                  const entries = Object.entries(item.fields_changed || {});
                  return (
                    <div className="space-y-1.5 max-w-md">
                      {entries.slice(0, 2).map(([k, diff]) => (
                        <div
                          key={k}
                          className="p-2 rounded-xl bg-slate-50 border border-slate-200 text-[11px]"
                        >
                          <div className="font-bold text-[#101D35]">{diff.label}</div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-rose-700 line-through truncate max-w-[140px]">
                              {diff.old_value}
                            </span>
                            <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="text-emerald-800 font-bold truncate max-w-[160px]">
                              {diff.new_value}
                            </span>
                          </div>
                        </div>
                      ))}
                      {entries.length > 2 && (
                        <div className="text-[11px] font-bold text-[#315FEA]">
                          +{entries.length - 2} kolom lainnya
                        </div>
                      )}
                    </div>
                  );
                }
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
                    onClick={() => setSelectedProposalForReview(item)}
                    className="px-3.5 py-1.5 rounded-xl bg-[#315FEA] hover:bg-[#244CD2] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    <span>{item.status === 'pending' ? 'Verifikasi & Setujui' : 'Lihat Detail'}</span>
                  </button>
                )
              }
            ]}
            keyExtractor={i => i.id}
            isLoading={loading}
            searchPlaceholder="Cari nama siswa, NISN, atau nama wali..."
            searchFilter={(i, q) =>
              Boolean(
                i.nama_siswa.toLowerCase().includes(q) ||
                  i.nisn.toLowerCase().includes(q) ||
                  (i.requester_name && i.requester_name.toLowerCase().includes(q))
              )
            }
            emptyTitle="Belum Ada Pengajuan Perubahan Data"
            emptyMessage="Semua pengajuan perbaikan data dari Wali Murid akan tampil di sini."
          />
        </div>
      )}

      {/* =====================================================================
          TAB 3: KELOLA PERIODE / EVENT KONFIRMASI DATA (KURUN WAKTU, KELAS, KOLOM)
      ===================================================================== */}
      {activeTab === 'manage_events' && (
        <div className="space-y-6">
          <form
            onSubmit={handleSaveEvent}
            className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-2xs space-y-5"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-extrabold text-[#101D35]">
                  {editingEventId
                    ? 'Edit Periode / Event Konfirmasi Data Siswa'
                    : 'Buat Periode / Event Konfirmasi Data Siswa Baru'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tentukan kurun waktu pelaksanaan, kelas sasaran (bisa pilih &gt;1 kelas), dan kolom identitas tertentu yang wajib diperiksa oleh Wali Murid.
                </p>
              </div>
              {editingEventId && (
                <button
                  type="button"
                  onClick={resetEventForm}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Batal Edit
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">
                  Nama Periode / Event Konfirmasi Data *
                </label>
                <input
                  type="text"
                  required
                  value={namaPeriode}
                  onChange={e => setNamaPeriode(e.target.value)}
                  placeholder="Contoh: Konfirmasi Data Induk & Penghasilan Orang Tua Semester Ganjil"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-900 font-semibold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Tanggal Mulai *
                </label>
                <input
                  type="date"
                  required
                  value={tanggalMulai}
                  onChange={e => setTanggalMulai(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-mono text-slate-900 font-semibold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Tanggal Selesai *
                </label>
                <input
                  type="date"
                  required
                  value={tanggalSelesai}
                  onChange={e => setTanggalSelesai(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-mono text-slate-900 font-semibold"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Tahun Pelajaran
                </label>
                <select
                  value={tahunAjaran}
                  onChange={e => setTahunAjaran(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold text-slate-900"
                >
                  <option value="2026/2027">2026/2027</option>
                  <option value="2025/2026">2025/2026</option>
                  <option value="2024/2025">2024/2025</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">
                  Instruksi / Pesan untuk Wali Murid di Portal Login Orang Tua
                </label>
                <input
                  type="text"
                  value={deskripsi}
                  onChange={e => setDeskripsi(e.target.value)}
                  placeholder="Contoh: Mohon Bapak/Ibu Wali Murid memeriksa kebenaran data identitas & penghasilan orang tua berikut..."
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-900"
                />
              </div>
            </div>

            {/* 1. PILIH KELAS TERTENTU (BISA PILIH > 1 KELAS) */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-[#101D35]">
                  <Layers className="w-4 h-4 text-[#315FEA]" />
                  <span>Pilih Kelas Tertentu (Bisa Pilih Lebih dari 1 Kelas)</span>
                  <span className="px-2 py-0.5 rounded-md bg-[#315FEA]/10 text-[#315FEA] font-mono text-[11px]">
                    {targetClasses.length === 0
                      ? 'Semua Kelas (7A s/d 9O)'
                      : `${targetClasses.length} Kelas Dipilih`}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => selectClassGroupInForm('all_reset')}
                    className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-[11px] font-semibold text-slate-700 cursor-pointer"
                  >
                    Semua Kelas (Reset)
                  </button>
                  <button
                    type="button"
                    onClick={() => selectClassGroupInForm('7')}
                    className="px-2.5 py-1 rounded-lg bg-white hover:bg-blue-50 border border-slate-200 text-[11px] font-semibold text-[#315FEA] cursor-pointer"
                  >
                    Semua Kelas 7
                  </button>
                  <button
                    type="button"
                    onClick={() => selectClassGroupInForm('8')}
                    className="px-2.5 py-1 rounded-lg bg-white hover:bg-blue-50 border border-slate-200 text-[11px] font-semibold text-[#315FEA] cursor-pointer"
                  >
                    Semua Kelas 8
                  </button>
                  <button
                    type="button"
                    onClick={() => selectClassGroupInForm('9')}
                    className="px-2.5 py-1 rounded-lg bg-white hover:bg-blue-50 border border-slate-200 text-[11px] font-semibold text-[#315FEA] cursor-pointer"
                  >
                    Semua Kelas 9
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {allAvailableClasses.map(cls => {
                  const checked = targetClasses.includes(cls);
                  return (
                    <button
                      key={cls}
                      type="button"
                      onClick={() => toggleClassInForm(cls)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                        checked
                          ? 'bg-[#315FEA] text-white border-[#315FEA]'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-[#315FEA]/50'
                      }`}
                    >
                      {cls}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. PILIH KOLOM IDENTITAS TERTENTU (BISA PILIH > 1 KOLOM) */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-[#101D35]">
                  <Columns className="w-4 h-4 text-[#315FEA]" />
                  <span>Pilih Kolom Identitas Tertentu yang Wajib Dikonfirmasi Wali Murid</span>
                  <span className="px-2 py-0.5 rounded-md bg-[#315FEA]/10 text-[#315FEA] font-mono text-[11px]">
                    {targetColumns.length} Kolom Dipilih
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => applyColumnPresetInForm('default')}
                    className="px-2.5 py-1 rounded-lg bg-white hover:bg-blue-50 border border-slate-200 text-[11px] font-semibold text-[#315FEA] cursor-pointer"
                  >
                    Preset Standar (17 Kolom)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyColumnPresetInForm('identitas')}
                    className="px-2.5 py-1 rounded-lg bg-white hover:bg-blue-50 border border-slate-200 text-[11px] font-semibold text-slate-700 cursor-pointer"
                  >
                    Identitas Siswa
                  </button>
                  <button
                    type="button"
                    onClick={() => applyColumnPresetInForm('orang_tua')}
                    className="px-2.5 py-1 rounded-lg bg-white hover:bg-blue-50 border border-slate-200 text-[11px] font-semibold text-slate-700 cursor-pointer"
                  >
                    Orang Tua &amp; Penghasilan
                  </button>
                  <button
                    type="button"
                    onClick={() => applyColumnPresetInForm('ijazah')}
                    className="px-2.5 py-1 rounded-lg bg-white hover:bg-blue-50 border border-slate-200 text-[11px] font-semibold text-slate-700 cursor-pointer"
                  >
                    Verifikasi Ijazah &amp; SD Asal
                  </button>
                  <button
                    type="button"
                    onClick={() => applyColumnPresetInForm('all')}
                    className="px-2.5 py-1 rounded-lg bg-white hover:bg-blue-50 border border-slate-200 text-[11px] font-semibold text-slate-700 cursor-pointer"
                  >
                    Semua 59 Kolom
                  </button>
                  <button
                    type="button"
                    onClick={() => applyColumnPresetInForm('clear')}
                    className="px-2.5 py-1 rounded-lg bg-white hover:bg-rose-50 border border-slate-200 text-[11px] font-semibold text-rose-600 cursor-pointer"
                  >
                    Kosongkan
                  </button>
                </div>
              </div>

              <div className="relative max-w-md">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={columnSearch}
                  onChange={e => setColumnSearch(e.target.value)}
                  placeholder="Cari nama kolom identitas (misal: Penghasilan, NIK, Tempat Lahir, Ijazah)..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-800"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-64 overflow-y-auto p-1">
                {filteredColumnsForForm.map(field => {
                  const key = String(field.key);
                  const checked = targetColumns.includes(key);
                  return (
                    <label
                      key={key}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs cursor-pointer transition-all ${
                        checked
                          ? 'bg-[#315FEA]/10 border-[#315FEA] text-[#101D35] font-bold'
                          : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleColumnInForm(key)}
                        className="rounded border-slate-300 text-[#315FEA] focus:ring-[#315FEA]"
                      />
                      <div className="truncate">
                        <div className="truncate">{field.label}</div>
                        <div className="text-[10px] text-slate-400 font-normal truncate">
                          {field.excelHeader}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isActiveEvent}
                  onChange={e => setIsActiveEvent(e.target.checked)}
                  className="rounded border-slate-300 text-[#315FEA]"
                />
                <span>Aktifkan Periode Ini di Portal Login Orang Tua</span>
              </label>

              <button
                type="submit"
                disabled={isSavingEvent || !canManage}
                className="px-5 py-2.5 rounded-xl bg-[#315FEA] hover:bg-[#244CD2] text-white text-xs font-bold flex items-center gap-2 shadow-xs disabled:opacity-50 cursor-pointer"
              >
                <ClipboardCheck className="w-4 h-4" />
                <span>
                  {isSavingEvent
                    ? 'Menyimpan...'
                    : editingEventId
                    ? 'Simpan Perubahan Periode Konfirmasi'
                    : 'Terbitkan Periode / Event Konfirmasi Data'}
                </span>
              </button>
            </div>
          </form>

          {/* Daftar Periode / Event yang Telah Dibuat */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-4">
            <h3 className="text-sm font-extrabold text-[#101D35]">
              Daftar Periode / Event Konfirmasi Data ({events.length})
            </h3>

            {events.length === 0 ? (
              <p className="text-xs text-slate-500">Belum ada periode konfirmasi yang dibuat.</p>
            ) : (
              <div className="space-y-3">
                {events.map(ev => {
                  const evConfs = confirmations.filter(c => c.event_id === ev.id);
                  return (
                    <div
                      key={ev.id}
                      className="p-4 rounded-xl border border-slate-200 hover:border-[#315FEA]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-extrabold text-[#101D35] text-sm">
                            {ev.nama_periode}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              ev.is_active
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {ev.is_active ? 'AKTIF' : 'NONAKTIF'}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-blue-50 text-[#315FEA] font-mono text-[10px] font-bold">
                            {evConfs.length} Siswa Sudah Konfirmasi
                          </span>
                        </div>
                        <div className="text-xs text-slate-600">
                          Kurun Waktu:{' '}
                          <strong className="font-mono">
                            {formatDateDMY(ev.tanggal_mulai)} s/d {formatDateDMY(ev.tanggal_selesai)}
                          </strong>{' '}
                          · Kelas:{' '}
                          <strong>
                            {ev.target_classes.length === 0
                              ? 'Semua Kelas'
                              : ev.target_classes.join(', ')}
                          </strong>{' '}
                          · Kolom: <strong>{ev.target_columns.length} Kolom</strong>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedEventId(ev.id);
                            setActiveTab('monitoring');
                          }}
                          className="px-3 py-1.5 rounded-xl bg-[#315FEA]/10 hover:bg-[#315FEA]/20 text-[#315FEA] text-xs font-bold cursor-pointer"
                        >
                          Pantau Siswa
                        </button>
                        {canManage && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleToggleEventActive(ev)}
                              className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                            >
                              {ev.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleEditEvent(ev)}
                              className="p-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 cursor-pointer"
                              title="Edit Periode"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteEvent(ev)}
                              className="p-1.5 rounded-xl border border-rose-200 hover:bg-rose-50 text-rose-600 cursor-pointer"
                              title="Hapus Periode"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Verifikasi & Persetujuan Pengajuan Perubahan Data */}
      <VerificationDetailModal
        proposal={selectedProposalForReview}
        currentStudent={selectedCurrentStudent}
        canVerify={canManage}
        onClose={() => setSelectedProposalForReview(null)}
        onReviewItems={handleReviewItems}
      />
    </div>
  );
};
