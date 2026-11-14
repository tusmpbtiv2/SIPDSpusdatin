import React, { useState, useEffect, useMemo } from 'react';
import {
  Siswa,
  DataConfirmationEvent,
  StudentDataConfirmationRecord,
  PerubahanBiodata,
  ALL_59_STUDENT_FIELDS,
  ChangeFieldDetail
} from '../../types';
import {
  getConfirmationEventsState,
  submitParentDataConfirmation,
  getPerubahanByNisn
} from '../../services/dataService';
import { useNotification } from '../../hooks/useNotification';
import { formatDateDMY, formatDateLongID, isDateFieldKey, mapIncomeToRange } from '../../utils/formatters';
import { DateInputDMY } from '../../components/common/DateInputDMY';
import {
  ClipboardCheck,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Edit3,
  Send,
  Clock,
  ShieldCheck,
  FileText,
  ArrowRight,
  RefreshCw,
  Layers,
  Columns
} from 'lucide-react';

interface KonfirmasiDataParentPageProps {
  student: Siswa;
  onRefreshStudent?: () => void;
}

export const KonfirmasiDataParentPage: React.FC<KonfirmasiDataParentPageProps> = ({
  student,
  onRefreshStudent
}) => {
  const { success, error: notifyError } = useNotification();

  const [events, setEvents] = useState<DataConfirmationEvent[]>([]);
  const [confirmations, setConfirmations] = useState<StudentDataConfirmationRecord[]>([]);
  const [proposals, setProposals] = useState<PerubahanBiodata[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [mode, setMode] = useState<'confirm_valid' | 'propose_correction'>('confirm_valid');

  // Form Konfirmasi
  const defaultWaliName =
    (student.nama_wali && student.nama_wali !== '-' ? student.nama_wali : '') ||
    (student.nama_ayah && student.nama_ayah !== '-' ? student.nama_ayah : '') ||
    (student.nama_ibu && student.nama_ibu !== '-' ? student.nama_ibu : '') ||
    '';

  const [namaWali, setNamaWali] = useState(defaultWaliName);
  const [hubunganWali, setHubunganWali] = useState('Orang Tua / Wali Kandung');
  const [noHpWali, setNoHpWali] = useState(
    student.no_hp_orangtua || student.no_wa_ayah || student.no_wa_ibu || ''
  );
  const [catatanWali, setCatatanWali] = useState('');
  const [agreedStatement, setAgreedStatement] = useState(false);

  // Form Pengajuan Perbaikan Kolom pada Event
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});
  const [alasanPerbaikan, setAlasanPerbaikan] = useState('');
  const [dokumenPendukung, setDokumenPendukung] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [confState, propList] = await Promise.all([
        getConfirmationEventsState(),
        getPerubahanByNisn(student.nisn)
      ]);
      setEvents(confState.events);
      setConfirmations(confState.confirmations);
      setProposals(propList);
    } catch (err: unknown) {
      notifyError(
        'Gagal Memuat Event Konfirmasi',
        err instanceof Error ? err.message : 'Tidak dapat memuat periode konfirmasi data.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [student.nisn]);

  // Filter event yang aktif dan ditujukan untuk kelas siswa ini (atau semua kelas)
  const applicableEvents = useMemo(() => {
    return events.filter(ev => {
      if (!ev.is_active) return false;
      if (!ev.target_classes || ev.target_classes.length === 0) return true;
      return ev.target_classes.includes(student.rombel);
    });
  }, [events, student.rombel]);

  useEffect(() => {
    if (applicableEvents.length > 0 && !applicableEvents.some(e => e.id === selectedEventId)) {
      setSelectedEventId(applicableEvents[0].id);
    }
  }, [applicableEvents, selectedEventId]);

  const activeEvent = useMemo(
    () => applicableEvents.find(e => e.id === selectedEventId) || applicableEvents[0] || null,
    [applicableEvents, selectedEventId]
  );

  // Kolom identitas yang ditampilkan sesuai konfigurasi event
  const targetFieldMetas = useMemo(() => {
    if (!activeEvent) return [];
    const fieldMap = new Map(ALL_59_STUDENT_FIELDS.map(f => [String(f.key), f]));
    if (!activeEvent.target_columns || activeEvent.target_columns.length === 0) {
      return ALL_59_STUDENT_FIELDS;
    }
    return activeEvent.target_columns
      .map(colKey => fieldMap.get(colKey))
      .filter((f): f is (typeof ALL_59_STUDENT_FIELDS)[number] => Boolean(f));
  }, [activeEvent]);

  // Inisialisasi nilai awal untuk form perbaikan berdasarkan nilai siswa saat ini
  const initialFieldValues = useMemo(() => {
    const map: Record<string, string> = {};
    targetFieldMetas.forEach(f => {
      const rawVal = student[f.key];
      if (String(f.key).startsWith('penghasilan_')) {
        map[String(f.key)] = mapIncomeToRange(rawVal);
      } else if (f.inputType === 'date') {
        const dmy = formatDateDMY(rawVal);
        map[String(f.key)] = dmy !== '-' ? dmy : '';
      } else {
        map[String(f.key)] = rawVal !== undefined && rawVal !== null ? String(rawVal) : '';
      }
    });
    return map;
  }, [student, targetFieldMetas]);

  useEffect(() => {
    setEditedValues(initialFieldValues);
  }, [initialFieldValues]);

  // Cari rekaman konfirmasi siswa untuk event aktif
  const myConfirmation = useMemo(() => {
    if (!activeEvent) return null;
    return (
      confirmations.find(
        c =>
          c.event_id === activeEvent.id &&
          (c.nisn === student.nisn || c.siswa_id === student.id)
      ) || null
    );
  }, [confirmations, activeEvent, student.nisn, student.id]);

  // Cari pengajuan perubahan yang terkait dengan konfirmasi ini
  const linkedProposal = useMemo(() => {
    if (!myConfirmation?.change_request_id && !activeEvent) return null;
    return (
      proposals.find(
        p =>
          (myConfirmation?.change_request_id && p.id === myConfirmation.change_request_id) ||
          (activeEvent && p.event_id === activeEvent.id)
      ) || null
    );
  }, [proposals, myConfirmation, activeEvent]);

  // Cek apakah periode event sedang berlangsung berdasarkan tanggal
  const periodTimeStatus = useMemo(() => {
    if (!activeEvent) return { isOpen: false, label: 'Tidak Ada Periode', badgeClass: 'bg-slate-100 text-slate-600' };
    const today = new Date().toISOString().slice(0, 10);
    const start = (activeEvent.tanggal_mulai || '').slice(0, 10);
    const end = (activeEvent.tanggal_selesai || '').slice(0, 10);

    if (start && today < start) {
      return {
        isOpen: false,
        label: `Belum Dibuka (Mulai ${formatDateDMY(start)})`,
        badgeClass: 'bg-amber-100 text-amber-800 border-amber-300'
      };
    }
    if (end && today > end) {
      return {
        isOpen: false,
        label: `Periode Berakhir (${formatDateDMY(end)})`,
        badgeClass: 'bg-rose-100 text-rose-800 border-rose-300'
      };
    }
    return {
      isOpen: true,
      label: 'Periode Konfirmasi Sedang Dibuka',
      badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300'
    };
  }, [activeEvent]);

  // Hitung kolom yang diubah pada mode pengajuan perbaikan
  const changedFieldsMap = useMemo(() => {
    const changes: Record<string, ChangeFieldDetail> = {};
    targetFieldMetas.forEach(f => {
      if (f.parentEditable === false) return;
      const key = String(f.key);
      const oldVal = (initialFieldValues[key] || '').trim();
      const newVal = (editedValues[key] || '').trim();
      if (newVal !== oldVal) {
        changes[key] = {
          old_value: oldVal || '-',
          new_value: newVal || '-',
          label: f.label,
          item_status: 'pending'
        };
      }
    });
    return changes;
  }, [targetFieldMetas, initialFieldValues, editedValues]);

  const changedEntries = Object.entries(changedFieldsMap);

  const handleConfirmValid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeEvent) return;
    if (!namaWali.trim()) {
      notifyError('Nama Wali Wajib Diisi', 'Silakan isi Nama Orang Tua / Wali yang mengonfirmasi data.');
      return;
    }
    if (!agreedStatement) {
      notifyError(
        'Centang Pernyataan Konfirmasi',
        'Silakan centang kotak pernyataan bahwa data identitas siswa sudah diperiksa dan benar.'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      await submitParentDataConfirmation({
        event: activeEvent,
        student,
        nama_wali: namaWali.trim(),
        hubungan_wali: hubunganWali,
        no_hp_wali: noHpWali.trim(),
        status: 'confirmed_valid',
        catatan_wali: catatanWali.trim()
      });

      success(
        'Konfirmasi Data Berhasil',
        `Terima kasih! Data identitas ${student.nama_lengkap} pada periode "${activeEvent.nama_periode}" telah tercatat SUDAH KONFIRMASI (Data Sesuai).`
      );
      await loadData();
      if (onRefreshStudent) onRefreshStudent();
    } catch (err: unknown) {
      notifyError(
        'Gagal Menyimpan Konfirmasi',
        err instanceof Error ? err.message : 'Terjadi kesalahan saat menyimpan konfirmasi.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitCorrectionAndConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeEvent) return;
    if (!namaWali.trim()) {
      notifyError('Nama Wali Wajib Diisi', 'Silakan isi Nama Orang Tua / Wali pengaju.');
      return;
    }
    if (changedEntries.length === 0) {
      notifyError(
        'Belum Ada Kolom yang Diperbaiki',
        'Silakan ubah atau lengkapi minimal 1 kolom identitas yang salah/kosong pada formulir di bawah.'
      );
      return;
    }
    if (!alasanPerbaikan.trim()) {
      notifyError(
        'Alasan Perbaikan Wajib Diisi',
        'Mohon tuliskan alasan perbaikan data (misal: Penyesuaian NIK/Penghasilan sesuai KK terbaru).'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      await submitParentDataConfirmation({
        event: activeEvent,
        student,
        nama_wali: namaWali.trim(),
        hubungan_wali: hubunganWali,
        no_hp_wali: noHpWali.trim(),
        status: 'submitted_correction',
        catatan_wali: alasanPerbaikan.trim(),
        fields_changed: changedFieldsMap,
        alasan: `[Event: ${activeEvent.nama_periode}] ${alasanPerbaikan.trim()}`,
        dokumen_pendukung_nama: dokumenPendukung.trim() || undefined
      });

      success(
        'Pengajuan Perbaikan & Konfirmasi Terkirim',
        `Usulan perbaikan ${changedEntries.length} kolom telah dikirim ke Admin Sekolah untuk disetujui dan status konfirmasi Anda telah tercatat.`
      );
      await loadData();
      if (onRefreshStudent) onRefreshStudent();
    } catch (err: unknown) {
      notifyError(
        'Gagal Mengirim Pengajuan',
        err instanceof Error ? err.message : 'Terjadi kesalahan saat mengirim pengajuan perubahan.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-xs text-slate-500">
        Memuat informasi Periode Konfirmasi Data Siswa...
      </div>
    );
  }

  if (applicableEvents.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-3 shadow-xs">
        <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200 text-blue-900 flex items-center justify-center mx-auto">
          <ClipboardCheck className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-slate-900">
          Belum Ada Periode Konfirmasi Data Aktif untuk Kelas {student.rombel}
        </h3>
        <p className="text-xs text-slate-500 max-w-lg mx-auto leading-relaxed">
          Saat ini Admin Tata Usaha belum membuka periode/event konfirmasi data khusus untuk Kelas{' '}
          <strong>{student.rombel}</strong>. Jika Anda tetap ingin mengusulkan perbaikan biodata, silakan gunakan menu{' '}
          <strong>Perbaiki Biodata</strong>.
        </p>
      </div>
    );
  }

  const isConfirmed = Boolean(myConfirmation);
  const effectiveStatus =
    linkedProposal?.status === 'approved' || linkedProposal?.status === 'partially_approved'
      ? 'correction_approved'
      : myConfirmation?.status || 'belum_konfirmasi';

  return (
    <div className="space-y-6">
      {/* Header & Pilih Event (jika ada lebih dari 1 event aktif) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <span className="text-[11px] font-mono uppercase tracking-wider text-blue-900 font-bold">
            VERIFIKASI &amp; KONFIRMASI WALI MURID
          </span>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
            Konfirmasi Data Identitas Siswa
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Periksa kesesuaian data putra/putri Anda sesuai periode dan kolom identitas yang ditentukan sekolah.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {applicableEvents.length > 1 && (
            <select
              value={activeEvent?.id || ''}
              onChange={e => setSelectedEventId(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800"
            >
              {applicableEvents.map(ev => (
                <option key={ev.id} value={ev.id}>
                  {ev.nama_periode} ({ev.tahun_ajaran})
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={loadData}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Muat Ulang</span>
          </button>
        </div>
      </div>

      {/* Banner Informasi Event & Status Konfirmasi Siswa */}
      {activeEvent && (
        <div className="bg-slate-900 text-white rounded-2xl p-6 border border-slate-800 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold border ${periodTimeStatus.badgeClass}`}
              >
                {periodTimeStatus.label}
              </span>
              <span className="px-2.5 py-1 rounded-md bg-blue-500/20 border border-blue-400/30 text-blue-200 text-[11px] font-mono">
                TP {activeEvent.tahun_ajaran}
              </span>
            </div>

            {/* Badge Status Konfirmasi Siswa */}
            <div>
              {effectiveStatus === 'confirmed_valid' && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 text-slate-950 font-extrabold text-xs shadow-xs">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>SUDAH KONFIRMASI (DATA SESUAI)</span>
                </span>
              )}
              {effectiveStatus === 'correction_approved' && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 text-slate-950 font-extrabold text-xs shadow-xs">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>TERKONFIRMASI &amp; PERBAIKAN DISETUJUI ADMIN</span>
                </span>
              )}
              {effectiveStatus === 'submitted_correction' && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-400 text-slate-950 font-extrabold text-xs shadow-xs">
                  <Clock className="w-4 h-4" />
                  <span>SUDAH KONFIRMASI (MENGAJUKAN PERBAIKAN DATA)</span>
                </span>
              )}
              {effectiveStatus === 'belum_konfirmasi' && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500 text-white font-extrabold text-xs shadow-xs">
                  <AlertCircle className="w-4 h-4" />
                  <span>BELUM KONFIRMASI DATA</span>
                </span>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-lg sm:text-xl font-extrabold tracking-tight">
              {activeEvent.nama_periode}
            </h3>
            {activeEvent.deskripsi && (
              <p className="text-xs sm:text-sm text-slate-300 mt-1 leading-relaxed">
                {activeEvent.deskripsi}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-800 text-xs">
            <div className="flex items-center gap-2.5 text-slate-300">
              <Calendar className="w-4 h-4 text-blue-400 shrink-0" />
              <div>
                <span className="text-[10px] uppercase text-slate-400 block">Kurun Waktu Konfirmasi</span>
                <strong className="text-white font-mono">
                  {formatDateDMY(activeEvent.tanggal_mulai)} s/d {formatDateDMY(activeEvent.tanggal_selesai)}
                </strong>
              </div>
            </div>

            <div className="flex items-center gap-2.5 text-slate-300">
              <Layers className="w-4 h-4 text-blue-400 shrink-0" />
              <div>
                <span className="text-[10px] uppercase text-slate-400 block">Target Kelas</span>
                <strong className="text-white">
                  {activeEvent.target_classes.length === 0
                    ? `Semua Kelas (Termasuk Kelas ${student.rombel})`
                    : `Kelas ${student.rombel} (${activeEvent.target_classes.length} Kelas Terpilih)`}
                </strong>
              </div>
            </div>

            <div className="flex items-center gap-2.5 text-slate-300">
              <Columns className="w-4 h-4 text-blue-400 shrink-0" />
              <div>
                <span className="text-[10px] uppercase text-slate-400 block">Kolom Identitas Diperiksa</span>
                <strong className="text-white">{targetFieldMetas.length} Kolom Identitas</strong>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ringkasan Bukti Konfirmasi Jika Sudah Pernah Konfirmasi */}
      {isConfirmed && myConfirmation && (
        <div
          className={`p-5 rounded-2xl border space-y-3 ${
            effectiveStatus === 'submitted_correction'
              ? 'bg-amber-50/90 border-amber-300 text-amber-950'
              : 'bg-emerald-50/90 border-emerald-300 text-emerald-950'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-bold text-sm">
              {effectiveStatus === 'submitted_correction' ? (
                <Clock className="w-5 h-5 text-amber-700 shrink-0" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
              )}
              <span>
                {effectiveStatus === 'confirmed_valid'
                  ? 'Anda Telah Mengonfirmasi Bahwa Data Siswa Sudah Benar'
                  : effectiveStatus === 'correction_approved'
                  ? 'Pengajuan Perbaikan Data Anda Telah Disetujui oleh Admin Sekolah'
                  : 'Anda Telah Mengirim Pengajuan Perbaikan Data (Menunggu Persetujuan Admin)'}
              </span>
            </div>
            <span className="text-xs font-mono font-semibold">
              Waktu Konfirmasi: {new Date(myConfirmation.confirmed_at).toLocaleString('id-ID')}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-2 border-t border-black/10">
            <div>
              <span className="opacity-70 block">Dikonfirmasi Oleh:</span>
              <strong>
                {myConfirmation.nama_wali} ({myConfirmation.hubungan_wali || 'Wali Murid'})
              </strong>
            </div>
            <div>
              <span className="opacity-70 block">Siswa &amp; Kelas:</span>
              <strong>
                {student.nama_lengkap} (Kelas {student.rombel} · NISN {student.nisn})
              </strong>
            </div>
            <div>
              <span className="opacity-70 block">Catatan Wali / Alasan:</span>
              <strong>{myConfirmation.catatan_wali || 'Data sudah sesuai dokumen resmi'}</strong>
            </div>
          </div>

          {linkedProposal && (
            <div className="p-3.5 rounded-xl bg-white/90 border border-black/10 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900">
                  Rincian Pengajuan Perubahan ({Object.keys(linkedProposal.fields_changed).length} Kolom)
                </span>
                <span
                  className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                    linkedProposal.status === 'approved' || linkedProposal.status === 'partially_approved'
                      ? 'bg-emerald-100 text-emerald-800'
                      : linkedProposal.status === 'rejected'
                      ? 'bg-rose-100 text-rose-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  Status Verifikasi Admin: {linkedProposal.status.toUpperCase()}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {Object.entries(linkedProposal.fields_changed).map(([k, diff]) => (
                  <div key={k} className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-[11px]">
                    <div className="font-bold text-slate-800">{diff.label}</div>
                    <div className="text-slate-400 line-through">
                      Lama: {isDateFieldKey(k) ? formatDateLongID(diff.old_value) : diff.old_value}
                    </div>
                    <div className="text-blue-900 font-bold">
                      Usulan Baru:{' '}
                      {isDateFieldKey(k)
                        ? `${formatDateLongID(diff.new_value)} (${diff.new_value})`
                        : diff.new_value}
                    </div>
                  </div>
                ))}
              </div>
              {linkedProposal.catatan_verifikator && (
                <div className="text-[11px] text-blue-900 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1.5">
                  <strong>Catatan Admin ({linkedProposal.verifikator_name || 'Verifikator'}):</strong>{' '}
                  {linkedProposal.catatan_verifikator}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Pilihan Tindakan Wali Murid: (1) Data Sudah Benar vs (2) Ada Kesalahan / Ajukan Perbaikan */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Daftar Kolom Identitas yang Wajib Diperiksa ({targetFieldMetas.length} Kolom)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Periksa setiap kolom di bawah ini. Jika seluruh data sudah benar, pilih{' '}
              <strong>&ldquo;Data Sudah Benar&rdquo;</strong>. Jika ada kesalahan, pilih{' '}
              <strong>&ldquo;Ada Kesalahan / Ajukan Perbaikan&rdquo;</strong>.
            </p>
          </div>

          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl shrink-0">
            <button
              type="button"
              onClick={() => setMode('confirm_valid')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                mode === 'confirm_valid'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-700 hover:bg-white'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>1. Data Sudah Benar</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('propose_correction')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                mode === 'propose_correction'
                  ? 'bg-blue-900 text-white shadow-xs'
                  : 'text-slate-700 hover:bg-white'
              }`}
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>2. Ada Kesalahan (Ajukan Perbaikan)</span>
            </button>
          </div>
        </div>

        {/* MODE 1: DATA SUDAH BENAR — TAMPILKAN TABEL KOLOM & FORM KONFIRMASI */}
        {mode === 'confirm_valid' ? (
          <form onSubmit={handleConfirmValid} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {targetFieldMetas.map(field => {
                const rawVal = student[field.key];
                const rawStr =
                  rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== ''
                    ? String(rawVal)
                    : '-';
                const displayVal =
                  rawStr === '-'
                    ? '-'
                    : field.inputType === 'date' || isDateFieldKey(String(field.key))
                    ? formatDateLongID(rawStr)
                    : rawStr;
                const isEmpty = displayVal === '-';

                return (
                  <div
                    key={field.key}
                    className={`p-3.5 rounded-xl border text-xs ${
                      isEmpty
                        ? 'bg-amber-50/40 border-amber-200'
                        : 'bg-slate-50/70 border-slate-200/90'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11px] font-bold text-slate-500">{field.label}</span>
                      {isEmpty && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                          Kosong
                        </span>
                      )}
                    </div>
                    <div className="font-bold text-slate-900 text-sm mt-1 break-words">
                      {displayVal}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Formulir Pernyataan Konfirmasi Wali Murid
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Nama Orang Tua / Wali Pengonfirmasi *
                  </label>
                  <input
                    type="text"
                    required
                    value={namaWali}
                    onChange={e => setNamaWali(e.target.value)}
                    placeholder="Nama Lengkap Ayah / Ibu / Wali..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-900 font-semibold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Hubungan dengan Siswa
                  </label>
                  <select
                    value={hubunganWali}
                    onChange={e => setHubunganWali(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-900 font-semibold"
                  >
                    <option value="Ayah Kandung">Ayah Kandung</option>
                    <option value="Ibu Kandung">Ibu Kandung</option>
                    <option value="Orang Tua / Wali Kandung">Orang Tua / Wali Kandung</option>
                    <option value="Wali Siswa">Wali Siswa</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Nomor HP / WhatsApp Aktif
                  </label>
                  <input
                    type="text"
                    value={noHpWali}
                    onChange={e => setNoHpWali(e.target.value)}
                    placeholder="08xxxxxxxxxx"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-mono text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Catatan Tambahan (Opsional)
                </label>
                <input
                  type="text"
                  value={catatanWali}
                  onChange={e => setCatatanWali(e.target.value)}
                  placeholder="Contoh: Seluruh data sudah sesuai dengan KK dan Ijazah SD terbaru."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs text-slate-900"
                />
              </div>

              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-50/80 border border-emerald-200 cursor-pointer text-xs text-emerald-950">
                <input
                  type="checkbox"
                  checked={agreedStatement}
                  onChange={e => setAgreedStatement(e.target.checked)}
                  className="mt-0.5 rounded border-emerald-400 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="leading-relaxed">
                  Saya selaku Orang Tua / Wali dari <strong>{student.nama_lengkap}</strong> (Kelas{' '}
                  <strong>{student.rombel}</strong>, NISN <strong>{student.nisn}</strong>) menyatakan bahwa saya telah memeriksa{' '}
                  <strong>{targetFieldMetas.length} kolom identitas</strong> di atas dan mengonfirmasi bahwa data tersebut{' '}
                  <strong>SUDAH BENAR &amp; SESUAI</strong>.
                </span>
              </label>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setMode('propose_correction')}
                  className="text-xs font-bold text-blue-900 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Ada data yang salah? Klik di sini untuk mengajukan perbaikan</span>
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting || !periodTimeStatus.isOpen}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-2 shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {isSubmitting
                      ? 'Menyimpan Konfirmasi...'
                      : isConfirmed
                      ? 'Perbarui Konfirmasi Data Sudah Benar'
                      : 'Konfirmasi Data Sudah Benar Sekarang'}
                  </span>
                </button>
              </div>
            </div>
          </form>
        ) : (
          /* MODE 2: ADA KESALAHAN — FORM PENGAJUAN PERBAIKAN KOLOM IDENTITAS EVENT */
          <form onSubmit={handleSubmitCorrectionAndConfirm} className="space-y-6">
            <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-950 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-blue-800 shrink-0 mt-0.5" />
              <div>
                <strong>Petunjuk Pengajuan Perbaikan Data:</strong> Silakan ubah nilai pada kolom yang salah atau masih kosong di bawah ini. Pengajuan Anda akan langsung dikirim ke menu{' '}
                <strong>Verifikasi &amp; Konfirmasi Admin</strong> untuk disetujui dan diperbarui ke Buku Induk Siswa.
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
              {targetFieldMetas.map(field => {
                const key = String(field.key);
                const oldVal = (initialFieldValues[key] || '').trim();
                const currentVal = editedValues[key] ?? '';
                const isModified = currentVal.trim() !== oldVal;
                const isReadOnly = field.parentEditable === false;

                return (
                  <div
                    key={key}
                    className={`p-3.5 rounded-xl border transition-all ${
                      isModified
                        ? 'bg-emerald-50/50 border-emerald-400 shadow-2xs'
                        : 'bg-white border-slate-200'
                    } ${field.inputType === 'textarea' ? 'sm:col-span-2 lg:col-span-3' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <label className="font-bold text-slate-800">{field.label}</label>
                      {isReadOnly ? (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                          Tetap (Admin)
                        </span>
                      ) : isModified ? (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                          Diperbaiki
                        </span>
                      ) : null}
                    </div>

                    {isReadOnly ? (
                      <div className="px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-700 font-mono font-bold">
                        {oldVal || '-'}
                      </div>
                    ) : field.inputType === 'select' && field.options ? (
                      <select
                        value={currentVal}
                        onChange={e =>
                          setEditedValues(prev => ({ ...prev, [key]: e.target.value }))
                        }
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-900 bg-white font-semibold"
                      >
                        <option value="">-- Pilih --</option>
                        {field.options.map(opt => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : field.inputType === 'textarea' ? (
                      <textarea
                        rows={2}
                        value={currentVal}
                        onChange={e =>
                          setEditedValues(prev => ({ ...prev, [key]: e.target.value }))
                        }
                        placeholder={`Perbaiki ${field.label}...`}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-900 bg-white"
                      />
                    ) : field.inputType === 'date' ? (
                      <DateInputDMY
                        value={currentVal}
                        onChange={val =>
                          setEditedValues(prev => ({ ...prev, [key]: val }))
                        }
                      />
                    ) : (
                      <input
                        type="text"
                        value={currentVal}
                        onChange={e =>
                          setEditedValues(prev => ({ ...prev, [key]: e.target.value }))
                        }
                        placeholder={`Perbaiki ${field.label}...`}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-900 bg-white font-semibold"
                      />
                    )}

                    <div className="mt-1 text-[10px] text-slate-400 truncate">
                      Data tercatat saat ini:{' '}
                      <span className="font-semibold text-slate-600">
                        {!oldVal
                          ? '(Kosong)'
                          : field.inputType === 'date' || isDateFieldKey(key)
                          ? `${formatDateLongID(oldVal)} (${oldVal})`
                          : oldVal}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Ringkasan Kolom yang Diubah */}
            {changedEntries.length > 0 && (
              <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-2">
                <div className="text-xs font-bold text-emerald-950">
                  Ringkasan Perbaikan yang Akan Diajukan ({changedEntries.length} Kolom):
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {changedEntries.map(([k, item]) => (
                    <div
                      key={k}
                      className="p-2.5 rounded-lg bg-white border border-emerald-200 text-xs flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <span className="font-bold text-slate-800 block">{item.label}</span>
                        <span className="text-[11px] text-rose-600 line-through mr-2">
                          {isDateFieldKey(k) ? formatDateLongID(item.old_value) : item.old_value}
                        </span>
                        <ArrowRight className="w-3 h-3 inline text-slate-400 mr-1" />
                        <span className="text-[11px] font-bold text-emerald-800">
                          {isDateFieldKey(k)
                            ? `${formatDateLongID(item.new_value)} (${item.new_value})`
                            : item.new_value}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Nama Orang Tua / Wali Pengaju *
                  </label>
                  <input
                    type="text"
                    required
                    value={namaWali}
                    onChange={e => setNamaWali(e.target.value)}
                    placeholder="Nama Lengkap Wali..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-900 font-semibold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Hubungan dengan Siswa
                  </label>
                  <select
                    value={hubunganWali}
                    onChange={e => setHubunganWali(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-900 font-semibold"
                  >
                    <option value="Ayah Kandung">Ayah Kandung</option>
                    <option value="Ibu Kandung">Ibu Kandung</option>
                    <option value="Orang Tua / Wali Kandung">Orang Tua / Wali Kandung</option>
                    <option value="Wali Siswa">Wali Siswa</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Referensi Dokumen Bukti (KK / Akta / Ijazah)
                  </label>
                  <div className="relative">
                    <FileText className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={dokumenPendukung}
                      onChange={e => setDokumenPendukung(e.target.value)}
                      placeholder="Contoh: Kartu Keluarga Terbaru / Ijazah SD"
                      className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-900"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Alasan Pengajuan Perbaikan Data *
                </label>
                <textarea
                  rows={2}
                  required
                  value={alasanPerbaikan}
                  onChange={e => setAlasanPerbaikan(e.target.value)}
                  placeholder="Jelaskan kesalahan data yang diperbaiki (misal: Koreksi ejaan nama orang tua / perbaikan nominal penghasilan ayah & ibu sesuai KK)..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-900"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setMode('confirm_valid')}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  &larr; Kembali ke Opsi &ldquo;Data Sudah Benar&rdquo;
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting || changedEntries.length === 0 || !periodTimeStatus.isOpen}
                  className="px-5 py-2.5 rounded-xl bg-blue-900 hover:bg-blue-800 text-white font-bold text-xs flex items-center gap-2 shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>
                    {isSubmitting
                      ? 'Mengirim Pengajuan...'
                      : `Kirim Pengajuan Perbaikan (${changedEntries.length} Kolom) & Konfirmasi`}
                  </span>
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
