import React, { useState, useEffect } from 'react';
import { Mutasi, StudentClassHistoryRecord } from '../../types';
import { ZeroPillBadge } from '../common/ZeroPillBadge';
import {
  X,
  RotateCcw,
  AlertTriangle,
  School,
  Calendar,
  FileText,
  UserCheck,
  History,
  CheckCircle2
} from 'lucide-react';
import { formatDateDMY } from '../../utils/formatters';

interface MutasiDetailModalProps {
  mutation: Mutasi | null;
  classHistory: StudentClassHistoryRecord[];
  canCancel: boolean;
  onClose: () => void;
  onCancelMutation?: (mutationId: string, cancelReason: string) => Promise<void>;
}

export const MutasiDetailModal: React.FC<MutasiDetailModalProps> = ({
  mutation,
  classHistory,
  canCancel,
  onClose,
  onCancelMutation
}) => {
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setShowCancelForm(false);
    setCancelReason('');
    setErrorMsg(null);
  }, [mutation]);

  if (!mutation) return null;

  const isIncoming = mutation.jenis === 'masuk';
  const studentHistory = classHistory.filter(
    h => Boolean(mutation.siswa_id && h.student_id === mutation.siswa_id)
  );

  const handleConfirmCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!cancelReason.trim()) {
      setErrorMsg('Alasan pembatalan wajib diisi untuk keperluan pencatatan Audit Log.');
      return;
    }
    if (!onCancelMutation) return;

    setIsCancelling(true);
    try {
      await onCancelMutation(mutation.id, cancelReason.trim());
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal membatalkan transaksi mutasi.');
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-3xl w-full overflow-hidden my-8">
        {/* Header */}
        <div
          className={`px-6 py-4 text-white flex items-center justify-between ${
            isIncoming ? 'bg-blue-950' : 'bg-slate-900'
          }`}
        >
          <div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-blue-300">
              DETAIL TRANSAKSI {isIncoming ? 'MUTASI MASUK' : 'MUTASI KELUAR'} (#
              {mutation.id.slice(0, 8)})
            </span>
            <h3 className="font-bold text-base mt-0.5">
              {mutation.nama_siswa} — Kelas {mutation.kelas}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 max-h-[76vh] overflow-y-auto text-xs">
          {/* Status & Summary Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <span className="text-slate-400 font-semibold block">NIS / NISN</span>
                <span className="font-mono font-bold text-slate-900">
                  {mutation.nis || '-'} / {mutation.nisn || '-'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 font-semibold block">Jenis Mutasi</span>
                <span className="font-bold text-blue-950">
                  {mutation.kategori_mutasi ||
                    (isIncoming ? 'Masuk Pindahan' : 'Pindah sekolah')}
                </span>
              </div>
              <div>
                <span className="text-slate-400 font-semibold block">Tahun Ajaran</span>
                <span className="font-mono font-bold text-slate-800">
                  {mutation.tahun_ajaran || '2025/2026'}
                </span>
              </div>
            </div>
            <div>
              <ZeroPillBadge status={mutation.status} />
            </div>
          </div>

          {/* Info Pembatalan jika status === 'dibatalkan' */}
          {mutation.status === 'dibatalkan' && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-950 space-y-1">
              <div className="font-bold flex items-center gap-2 text-rose-800">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Transaksi Mutasi Ini Telah Dibatalkan</span>
              </div>
              <p className="text-rose-900">
                <strong>Alasan Pembatalan:</strong> {mutation.alasan_pembatalan || '-'}
              </p>
              <div className="text-[11px] text-rose-700 font-mono">
                Dibatalkan oleh: {mutation.cancelled_by_name || 'Admin'} pada{' '}
                {mutation.cancelled_at
                  ? new Date(mutation.cancelled_at).toLocaleString('id-ID')
                  : '-'}
              </div>
            </div>
          )}

          {/* Grid Rincian Mutasi */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-slate-200 space-y-2.5">
              <div className="font-bold text-slate-800 flex items-center gap-1.5 border-b border-slate-100 pb-2">
                <Calendar className="w-4 h-4 text-blue-900" />
                <span>Data Waktu &amp; Administrasi</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-slate-400 block">
                    {isIncoming ? 'Tanggal Masuk' : 'Tanggal Keluar'}
                  </span>
                  <span className="font-mono font-bold text-slate-900">
                    {formatDateDMY(mutation.tanggal_mutasi)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">
                    {isIncoming ? 'Kelas Tujuan' : 'Kelas Terakhir'}
                  </span>
                  <span className="font-bold text-slate-900">{mutation.kelas}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Nomor Surat Mutasi</span>
                  <span className="font-mono text-slate-800">{mutation.no_surat || '-'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Petugas Pencatat</span>
                  <span className="font-semibold text-slate-800 flex items-center gap-1">
                    <UserCheck className="w-3.5 h-3.5 text-emerald-700" />
                    {mutation.petugas_nama || 'Admin Tata Usaha'}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 space-y-2.5">
              <div className="font-bold text-slate-800 flex items-center gap-1.5 border-b border-slate-100 pb-2">
                <School className="w-4 h-4 text-blue-900" />
                <span>{isIncoming ? 'Identitas Sekolah Asal' : 'Identitas Sekolah Tujuan'}</span>
              </div>
              <div className="space-y-1.5">
                <div>
                  <span className="text-slate-400 block">Nama Sekolah</span>
                  <span className="font-bold text-slate-900">
                    {(isIncoming ? mutation.sekolah_asal : mutation.sekolah_tujuan) || '-'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-slate-400 block">NPSN Sekolah</span>
                    <span className="font-mono font-semibold text-slate-800">
                      {mutation.npsn_sekolah || '-'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Kecamatan</span>
                    <span className="text-slate-800">{mutation.kecamatan_sekolah || '-'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Kabupaten / Kota</span>
                    <span className="text-slate-800">{mutation.kabupaten_sekolah || '-'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Provinsi</span>
                    <span className="text-slate-800">{mutation.provinsi_sekolah || '-'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Alasan & Keterangan */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-slate-400 font-semibold block mb-1 flex items-center gap-1">
                <FileText className="w-3.5 h-3.5" />
                <span>Alasan Mutasi:</span>
              </span>
              <p className="text-slate-800 font-medium">{mutation.alasan || '-'}</p>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-slate-400 font-semibold block mb-1">Keterangan Tambahan:</span>
              <p className="text-slate-800">{mutation.keterangan || '-'}</p>
            </div>
          </div>

          {/* Riwayat Kelas Siswa */}
          <div className="space-y-2">
            <h4 className="font-bold text-slate-800 flex items-center gap-1.5">
              <History className="w-4 h-4 text-blue-900" />
              <span>Riwayat Penempatan Kelas &amp; Mutasi Siswa ({studentHistory.length})</span>
            </h4>
            {studentHistory.length === 0 ? (
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-slate-500">
                Belum ada catatan riwayat kelas tambahan untuk siswa ini.
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600">
                      <th className="py-2 px-3">Tanggal Mulai</th>
                      <th className="py-2 px-3">Tanggal Selesai</th>
                      <th className="py-2 px-3">Kelas</th>
                      <th className="py-2 px-3">Status Riwayat</th>
                      <th className="py-2 px-3">Catatan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {studentHistory.map(h => (
                      <tr key={h.id}>
                        <td className="py-2 px-3 font-mono text-slate-700">{formatDateDMY(h.tanggal_mulai)}</td>
                        <td className="py-2 px-3 font-mono text-slate-500">
                          {formatDateDMY(h.tanggal_selesai)}
                        </td>
                        <td className="py-2 px-3 font-bold text-slate-900">Kelas {h.kelas}</td>
                        <td className="py-2 px-3 uppercase font-mono text-[10px] font-bold text-blue-900">
                          {h.status_riwayat}
                        </td>
                        <td className="py-2 px-3 text-slate-600">{h.catatan || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Form Pembatalan Transaksi Mutasi oleh Admin Berwenang */}
          {canCancel && mutation.status !== 'dibatalkan' && showCancelForm && (
            <form
              onSubmit={handleConfirmCancel}
              className="p-4 rounded-xl bg-rose-50 border border-rose-300 space-y-3"
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-rose-950">
                    Konfirmasi Pembatalan Transaksi Mutasi (Tercatat di Audit Log)
                  </h4>
                  <p className="text-rose-800 text-[11px] mt-0.5 leading-relaxed">
                    {isIncoming
                      ? 'Membatalkan transaksi mutasi masuk akan menandai transaksi ini sebagai Dibatalkan dan mencatat jejak audit.'
                      : 'Membatalkan transaksi mutasi keluar akan mengembalikan status siswa menjadi AKTIF kembali pada kelas terakhir tanpa menghapus biodata.'}
                  </p>
                </div>
              </div>

              {errorMsg && (
                <div className="p-2.5 rounded bg-white border border-rose-300 text-rose-700 font-semibold">
                  {errorMsg}
                </div>
              )}

              <div>
                <label className="block font-bold text-rose-950 mb-1">
                  Alasan Pembatalan Transaksi *
                </label>
                <textarea
                  rows={2}
                  required
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  placeholder="Contoh: Kesalahan pemilihan siswa / Pembatalan permohonan pindah sekolah oleh orang tua..."
                  className="w-full px-3 py-2 bg-white border border-rose-300 rounded-lg text-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCancelForm(false)}
                  disabled={isCancelling}
                  className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 font-semibold"
                >
                  Urungkan
                </button>
                <button
                  type="submit"
                  disabled={isCancelling}
                  className="px-4 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-800 text-white font-bold flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>
                    {isCancelling ? 'Memproses Pembatalan...' : 'Konfirmasi Batalkan Transaksi'}
                  </span>
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
            <span>Biodata induk siswa tetap tersimpan utuh di database.</span>
          </div>

          <div className="flex items-center gap-2">
            {canCancel && mutation.status !== 'dibatalkan' && !showCancelForm && (
              <button
                type="button"
                onClick={() => setShowCancelForm(true)}
                className="px-3.5 py-2 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg flex items-center gap-1.5 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Batalkan Transaksi Mutasi</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
