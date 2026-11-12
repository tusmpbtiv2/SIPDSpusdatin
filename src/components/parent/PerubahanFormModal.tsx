import React, { useState } from 'react';
import { Siswa } from '../../types';
import { X, Send, AlertCircle, FileUp } from 'lucide-react';

interface PerubahanFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Siswa;
  onSubmit: (data: {
    fields_changed: Record<string, { old_value: string; new_value: string; label: string }>;
    alasan: string;
    dokumen_pendukung_nama?: string;
  }) => Promise<void>;
}

export const PerubahanFormModal: React.FC<PerubahanFormModalProps> = ({
  isOpen,
  onClose,
  student,
  onSubmit
}) => {
  const [selectedField, setSelectedField] = useState('no_hp_orangtua');
  const [newValue, setNewValue] = useState('');
  const [alasan, setAlasan] = useState('');
  const [dokumenNama, setDokumenNama] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const fieldOptions = [
    { key: 'no_hp_orangtua', label: 'Nomor HP / WhatsApp Wali', current: student.no_hp_orangtua },
    { key: 'alamat', label: 'Alamat Tinggal Siswa', current: student.alamat },
    { key: 'email_orangtua', label: 'Email Orang Tua', current: student.email_orangtua || '-' },
    { key: 'nama_ayah', label: 'Nama Ayah Kandung', current: student.nama_ayah || '-' },
    { key: 'pekerjaan_ayah', label: 'Pekerjaan Ayah', current: student.pekerjaan_ayah || '-' },
    { key: 'nama_ibu', label: 'Nama Ibu Kandung', current: student.nama_ibu || '-' },
    { key: 'pekerjaan_ibu', label: 'Pekerjaan Ibu', current: student.pekerjaan_ibu || '-' },
    { key: 'nama_wali', label: 'Nama Wali', current: student.nama_wali || '-' },
    { key: 'tempat_lahir', label: 'Tempat Lahir', current: student.tempat_lahir },
    { key: 'rt_rw', label: 'RT / RW', current: student.rt_rw || '-' },
    { key: 'kelurahan', label: 'Kelurahan', current: student.kelurahan || '-' },
    { key: 'kecamatan', label: 'Kecamatan', current: student.kecamatan || '-' },
    { key: 'kode_pos', label: 'Kode Pos', current: student.kode_pos || '-' },
  ];

  const currentFieldObj = fieldOptions.find(f => f.key === selectedField) || fieldOptions[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!newValue.trim()) {
      setError('Nilai baru perbaikan wajib diisi.');
      return;
    }

    if (newValue.trim() === currentFieldObj.current) {
      setError('Nilai baru tidak boleh sama dengan nilai lama saat ini.');
      return;
    }

    if (!alasan.trim()) {
      setError('Alasan pengajuan perbaikan data wajib diisi.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        fields_changed: {
          [selectedField]: {
            old_value: currentFieldObj.current,
            new_value: newValue.trim(),
            label: currentFieldObj.label
          }
        },
        alasan: alasan.trim(),
        dokumen_pendukung_nama: dokumenNama.trim() || undefined
      });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal mengajukan permohonan.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
      <div className="bg-white rounded-xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">
              Form Pengajuan Perbaikan Biodata
            </h3>
            <p className="text-[11px] text-slate-500">
              Siswa: {student.nama_lengkap} (NISN: {student.nisn})
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 text-xs">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-slate-700 font-semibold mb-1">
              Pilih Data Yang Ingin Diperbaiki *
            </label>
            <select
              value={selectedField}
              onChange={e => {
                setSelectedField(e.target.value);
                setNewValue('');
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 font-medium"
            >
              {fieldOptions.map(f => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <span className="text-slate-500 font-medium">Data Saat Ini di Sistem Sekolah:</span>
            <div className="font-bold text-slate-800 text-sm mt-0.5">
              {currentFieldObj.current}
            </div>
          </div>

          <div>
            <label className="block text-slate-700 font-semibold mb-1">
              Data Baru Yang Seharusnya *
            </label>
            <input
              type="text"
              required
              value={newValue}
              onChange={e => setNewValue(e.target.value)}
              placeholder={`Ketik perbaikan ${currentFieldObj.label.toLowerCase()}...`}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
            />
          </div>

          <div>
            <label className="block text-slate-700 font-semibold mb-1">
              Alasan Perbaikan Data *
            </label>
            <textarea
              required
              rows={2}
              value={alasan}
              onChange={e => setAlasan(e.target.value)}
              placeholder="Contoh: Mengganti nomor kontak baru yang aktif WhatsApp / kesalahan penulisan nama di KK..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
            />
          </div>

          <div>
            <label className="block text-slate-700 font-semibold mb-1">
              Nama Dokumen Pendukung (Opsional)
            </label>
            <div className="flex items-center gap-2">
              <FileUp className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="text"
                value={dokumenNama}
                onChange={e => setDokumenNama(e.target.value)}
                placeholder="Contoh: Kartu_Keluarga_Terbaru.pdf / Akta_Kelahiran.jpg"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
              />
            </div>
            <span className="text-[10px] text-slate-400 mt-1 block">
              Pengajuan akan diverifikasi oleh tim administrasi Tata Usaha SMP Bhinneka Tunggal Ika.
            </span>
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-medium"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-blue-900 text-white rounded-lg hover:bg-blue-800 font-semibold flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSubmitting ? (
                <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              <span>Kirim Pengajuan</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
