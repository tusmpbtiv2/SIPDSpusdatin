import React, { useState, useMemo } from 'react';
import {
  Siswa,
  ALL_59_STUDENT_FIELDS,
  StudentTabKey,
  ChangeFieldDetail,
  calculateBiodataCompleteness
} from '../../types';
import { submitPerubahan } from '../../services/dataService';
import { useNotification } from '../../hooks/useNotification';
import {
  Send,
  Save,
  Info,
  FileText,
  RotateCcw,
  Eye,
  ArrowLeft,
  ArrowRight,
  Sparkles,
  CheckCircle2
} from 'lucide-react';
import { formatDateDMY, mapIncomeToRange } from '../../utils/formatters';

interface PerbaikiBiodataPageProps {
  student: Siswa;
  onSuccessSubmit: () => void;
}

type FilterSection = 'all' | 'empty_only' | StudentTabKey;

export const PerbaikiBiodataPage: React.FC<PerbaikiBiodataPageProps> = ({
  student,
  onSuccessSubmit
}) => {
  const { success, error: notifyError } = useNotification();

  // Editable fields for parents (never directly modifies `students` table)
  const parentEditableFields = useMemo(
    () => ALL_59_STUDENT_FIELDS.filter(f => f.parentEditable !== false),
    []
  );

  const initialValues = useMemo(() => {
    const map: Record<string, string> = {};
    parentEditableFields.forEach(f => {
      const val = student[f.key];
      if (f.key.startsWith('penghasilan_')) {
        map[f.key] = mapIncomeToRange(val);
      } else {
        map[f.key] = val !== undefined && val !== null ? String(val) : '';
      }
    });
    return map;
  }, [student, parentEditableFields]);

  const [formValues, setFormValues] = useState<Record<string, string>>(initialValues);
  const [activeFilter, setActiveFilter] = useState<FilterSection>('all');
  const [alasan, setAlasan] = useState('');
  const [dokumenNama, setDokumenNama] = useState('');
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const completeness = useMemo(() => calculateBiodataCompleteness(student), [student]);

  // Compute all changed fields across the entire 59-column set
  const changedFieldsMap = useMemo(() => {
    const changes: Record<string, ChangeFieldDetail> = {};
    parentEditableFields.forEach(f => {
      const oldVal = (initialValues[f.key] || '').trim();
      const newVal = (formValues[f.key] || '').trim();
      if (newVal !== oldVal) {
        changes[f.key] = {
          old_value: oldVal || '-',
          new_value: newVal || '-',
          label: f.label,
          item_status: 'pending'
        };
      }
    });
    return changes;
  }, [parentEditableFields, initialValues, formValues]);

  const changedEntries = Object.entries(changedFieldsMap);

  const visibleFields = useMemo(() => {
    if (activeFilter === 'all') return parentEditableFields;
    if (activeFilter === 'empty_only') {
      return parentEditableFields.filter(f => {
        const val = initialValues[f.key];
        return !val || val.trim() === '' || val.trim() === '-';
      });
    }
    return parentEditableFields.filter(f => f.tab === activeFilter);
  }, [parentEditableFields, activeFilter, initialValues]);

  const handleReset = () => {
    setFormValues(initialValues);
    setAlasan('');
    setDokumenNama('');
    setIsPreviewMode(false);
  };

  const handleProceedToPreview = (e: React.FormEvent) => {
    e.preventDefault();
    if (changedEntries.length === 0) {
      notifyError(
        'Belum Ada Perubahan',
        'Silakan ubah atau lengkapi minimal satu kolom pada formulir sebelum melihat Preview.'
      );
      return;
    }
    if (!alasan.trim()) {
      notifyError(
        'Alasan Wajib Diisi',
        'Mohon tuliskan alasan pengajuan perubahan atau pelengkapan biodata.'
      );
      return;
    }
    setIsPreviewMode(true);
  };

  const handleSaveRequest = async (targetStatus: 'draft' | 'pending') => {
    if (changedEntries.length === 0) {
      notifyError('Tidak Ada Perubahan', 'Belum ada kolom biodata yang diubah.');
      return;
    }
    if (!alasan.trim()) {
      notifyError('Alasan Wajib Diisi', 'Mohon isi alasan pengajuan terlebih dahulu.');
      return;
    }

    setIsSubmitting(true);
    try {
      await submitPerubahan(
        {
          siswa_id: student.id,
          nis: student.nis,
          nisn: student.nisn,
          nama_siswa: student.nama_lengkap,
          kelas: student.rombel,
          requester_name:
            student.nama_wali ||
            student.nama_ayah ||
            student.nama_ibu ||
            'Orang Tua / Wali Siswa',
          requester_relation: 'Wali',
          fields_changed: changedFieldsMap,
          alasan: alasan.trim(),
          dokumen_pendukung_nama: dokumenNama.trim() || undefined
        },
        targetStatus
      );

      if (targetStatus === 'draft') {
        success(
          'Draft Tersimpan',
          `Draft perubahan ${changedEntries.length} kolom berhasil disimpan. Anda dapat mengirimkannya kapan saja dari menu Pengajuan Saya.`
        );
      } else {
        success(
          'Pengajuan Terkirim',
          `Usulan perubahan ${changedEntries.length} kolom telah dikirim ke Admin Tata Usaha untuk diverifikasi.`
        );
      }
      onSuccessSubmit();
    } catch (err: unknown) {
      notifyError(
        'Gagal Menyimpan Pengajuan',
        err instanceof Error ? err.message : 'Terjadi kesalahan saat menyimpan ke database.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const sectionTabs: { id: FilterSection; label: string }[] = [
    { id: 'all', label: `Semua Kolom (${parentEditableFields.length})` },
    { id: 'empty_only', label: `Kolom Kosong (${completeness.emptyFields.filter(f => f.parentEditable !== false).length})` },
    { id: 'identitas', label: 'Identitas' },
    { id: 'pendidikan', label: 'Pendidikan SD/MI' },
    { id: 'alamat', label: 'Alamat' },
    { id: 'kesehatan', label: 'Kesehatan' },
    { id: 'ayah', label: 'Data Ayah' },
    { id: 'ibu', label: 'Data Ibu' },
    { id: 'wali', label: 'Data Wali' }
  ];

  // ============================================================================
  // HALAMAN PREVIEW DATA LAMA DAN DATA BARU (SEBELUM SIMPAN DRAFT / KIRIM PENDING)
  // ============================================================================
  if (isPreviewMode) {
    return (
      <div className="space-y-6 max-w-4xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-blue-900 font-bold">
              TAHAP 2 DARI 2 — KONFIRMASI &amp; PREVIEW PERUBAHAN
            </span>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              Preview Perbandingan Data Lama &amp; Data Baru
            </h2>
            <p className="text-xs text-slate-500">
              Periksa kembali rincian {changedEntries.length} kolom yang Anda ubah sebelum disimpan sebagai Draft atau dikirim ke Admin Sekolah.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsPreviewMode(false)}
            className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 flex items-center gap-1.5 self-start"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Kembali Edit Kolom</span>
          </button>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-100 text-xs">
            <div>
              <span className="text-slate-500">Nama Siswa:</span>{' '}
              <strong className="text-slate-900">{student.nama_lengkap}</strong> (Kelas {student.rombel})
            </div>
            <div>
              <span className="text-slate-500">NISN:</span>{' '}
              <strong className="font-mono text-slate-900">{student.nisn}</strong>
            </div>
            <div>
              <span className="px-2.5 py-1 rounded-md bg-blue-50 text-blue-900 font-bold border border-blue-200">
                {changedEntries.length} Kolom Diusulkan Berubah
              </span>
            </div>
          </div>

          {/* Side-by-Side Comparison Table */}
          <div className="space-y-3">
            {changedEntries.map(([fieldKey, item]) => (
              <div
                key={fieldKey}
                className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">{item.label}</span>
                  <span className="text-[10px] font-mono text-slate-400">{fieldKey}</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-11 gap-2 items-center text-xs">
                  <div className="sm:col-span-5 p-3 rounded-lg bg-rose-50/70 border border-rose-200 text-rose-900">
                    <span className="text-[10px] uppercase font-bold text-rose-500 block mb-0.5">
                      Data Lama (Saat Ini di Buku Induk)
                    </span>
                    <span className="font-medium break-words">
                      {item.old_value === '-' ? 'Kosong (Belum Diisi)' : item.old_value}
                    </span>
                  </div>

                  <div className="sm:col-span-1 flex justify-center text-slate-400">
                    <ArrowRight className="w-4 h-4 rotate-90 sm:rotate-0" />
                  </div>

                  <div className="sm:col-span-5 p-3 rounded-lg bg-emerald-50/80 border border-emerald-200 text-emerald-950">
                    <span className="text-[10px] uppercase font-bold text-emerald-600 block mb-0.5">
                      Data Baru (Usulan Orang Tua)
                    </span>
                    <span className="font-bold break-words">{item.new_value}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100 text-xs">
            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-slate-400 font-semibold block mb-1">Alasan Pengajuan:</span>
              <p className="font-medium text-slate-800">{alasan}</p>
            </div>
            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-slate-400 font-semibold block mb-1">Dokumen Pendukung:</span>
              <p className="font-semibold text-blue-900">
                {dokumenNama || 'Tidak mencantumkan nama dokumen'}
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-blue-50/70 border border-blue-200 text-xs text-blue-950 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-blue-800 shrink-0 mt-0.5" />
            <span>
              Pengajuan ini disimpan ke tabel <strong>student_change_requests</strong> dan{' '}
              <strong>student_change_request_items</strong>. Data pada Buku Induk Siswa hanya akan berubah setelah diverifikasi dan disetujui oleh Admin Sekolah.
            </span>
          </div>

          <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setIsPreviewMode(false)}
              disabled={isSubmitting}
              className="px-4 py-2.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Ubah Kembali
            </button>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => handleSaveRequest('draft')}
                disabled={isSubmitting}
                className="px-4 py-2.5 text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>Simpan sebagai Draft</span>
              </button>

              <button
                type="button"
                onClick={() => handleSaveRequest('pending')}
                disabled={isSubmitting}
                className="px-5 py-2.5 text-xs font-bold text-white bg-blue-900 hover:bg-blue-800 rounded-lg flex items-center gap-2 transition-colors shadow-xs disabled:opacity-50"
              >
                {isSubmitting ? (
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                <span>Kirim Pengajuan Verifikasi ({changedEntries.length} Kolom)</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // HALAMAN FORMULIR MULTI-KOLOM (KOREKSI & LENGKAPI KOLOM KOSONG)
  // ============================================================================
  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Usulkan Koreksi &amp; Lengkapi Biodata Anak
          </h2>
          <p className="text-xs text-slate-500">
            Anda dapat mengubah atau melengkapi beberapa kolom sekaligus, lalu meninjau Preview Data Lama vs Data Baru sebelum dikirim.
          </p>
        </div>

        {changedEntries.length > 0 && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{changedEntries.length} kolom telah dimodifikasi</span>
          </div>
        )}
      </div>

      {/* Info Notice */}
      <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 flex items-start gap-3 text-xs text-blue-950">
        <Info className="w-4 h-4 text-blue-800 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <strong>Mekanisme Keamanan Data:</strong> Akun orang tua tidak mengubah tabel induk siswa secara langsung. Setiap perubahan akan disimpan ke antrean verifikasi (status <em>Draft</em> atau <em>Pending</em>) untuk ditinjau oleh Admin Tata Usaha.
        </div>
      </div>

      {/* Filter Tabs (Semua, Kolom Kosong, atau per Kategori) */}
      <div className="bg-white rounded-xl border border-slate-200 p-2 shadow-2xs flex items-center gap-1 overflow-x-auto">
        {sectionTabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveFilter(tab.id)}
            className={`px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              activeFilter === tab.id
                ? 'bg-blue-900 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleProceedToPreview} className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-6 space-y-6">
          {visibleFields.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              <Sparkles className="w-6 h-6 text-emerald-600 mx-auto mb-2" />
              Semua kolom pada kategori ini sudah terisi lengkap.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
              {visibleFields.map(field => {
                const oldVal = (initialValues[field.key] || '').trim();
                const currentVal = formValues[field.key] ?? '';
                const isModified = currentVal.trim() !== oldVal;
                const isEmptyOriginal = !oldVal || oldVal === '-';

                return (
                  <div
                    key={field.key}
                    className={`p-3 rounded-lg border transition-colors ${
                      isModified
                        ? 'bg-emerald-50/40 border-emerald-400'
                        : isEmptyOriginal
                        ? 'bg-amber-50/30 border-amber-200'
                        : 'bg-white border-slate-200'
                    } ${field.inputType === 'textarea' ? 'sm:col-span-2 md:col-span-3' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <label className="font-bold text-slate-800">{field.label}</label>
                      {isModified ? (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                          Diubah
                        </span>
                      ) : isEmptyOriginal ? (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                          Kosong
                        </span>
                      ) : null}
                    </div>

                    {field.inputType === 'select' && field.options ? (
                      <select
                        value={currentVal}
                        onChange={e =>
                          setFormValues(prev => ({ ...prev, [field.key]: e.target.value }))
                        }
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md text-xs text-slate-900 bg-white"
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
                          setFormValues(prev => ({ ...prev, [field.key]: e.target.value }))
                        }
                        placeholder={`Isi ${field.label}...`}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md text-xs text-slate-900 bg-white"
                      />
                    ) : (
                      <input
                        type={field.inputType === 'date' ? 'date' : 'text'}
                        value={currentVal}
                        onChange={e =>
                          setFormValues(prev => ({ ...prev, [field.key]: e.target.value }))
                        }
                        placeholder={`Isi ${field.label}...`}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md text-xs text-slate-900 bg-white"
                      />
                    )}

                    <div className="mt-1 text-[10px] text-slate-400 truncate">
                      Data lama: <span className="font-mono text-slate-600">{oldVal || 'Kosong'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <hr className="border-slate-100" />

          {/* Supporting Details */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Keterangan &amp; Bukti Dokumen Pendukung
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Alasan Perubahan / Pelengkapan Biodata *
                </label>
                <textarea
                  rows={3}
                  required
                  value={alasan}
                  onChange={e => setAlasan(e.target.value)}
                  placeholder="Contoh: Melengkapi data NIK Ayah/Ibu, Nomor Ijazah SD, serta pembaruan alamat sesuai Kartu Keluarga terbaru..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Referensi Dokumen Pendukung (KK / Akta Kelahiran / Ijazah SD)
                </label>
                <div className="relative">
                  <FileText className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={dokumenNama}
                    onChange={e => setDokumenNama(e.target.value)}
                    placeholder="Contoh: Kartu_Keluarga_2025.pdf / Ijazah_SD.pdf"
                    className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                  Sebutkan dokumen resmi yang menjadi dasar perubahan agar memudahkan verifikasi petugas Tata Usaha.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleReset}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Formulir</span>
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleSaveRequest('draft')}
              disabled={isSubmitting || changedEntries.length === 0}
              className="px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 font-bold text-xs rounded-lg flex items-center gap-1.5 transition-all disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>Simpan Draft ({changedEntries.length})</span>
            </button>

            <button
              type="submit"
              disabled={changedEntries.length === 0}
              className="px-5 py-2.5 bg-blue-900 hover:bg-blue-800 text-white font-bold text-xs rounded-lg flex items-center gap-2 transition-all shadow-xs disabled:opacity-50"
            >
              <Eye className="w-4 h-4" />
              <span>Lihat Preview Data Lama vs Baru ({changedEntries.length} Kolom)</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
