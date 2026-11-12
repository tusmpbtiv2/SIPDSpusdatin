import React, { useState, useEffect } from 'react';
import { PerubahanBiodata, Siswa } from '../../types';
import {
  getPerubahanByNisn,
  submitDraftPerubahan,
  cancelPerubahan
} from '../../services/dataService';
import { useNotification } from '../../hooks/useNotification';
import { ZeroPillBadge } from '../../components/common/ZeroPillBadge';
import { ArrowRight, PlusCircle, FileText, Clock, Send, XCircle, Filter } from 'lucide-react';

interface PengajuanSayaPageProps {
  student: Siswa;
  onNavigateToForm: () => void;
}

export const PengajuanSayaPage: React.FC<PengajuanSayaPageProps> = ({
  student,
  onNavigateToForm
}) => {
  const { success, error: notifyError } = useNotification();
  const [proposals, setProposals] = useState<PerubahanBiodata[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadProposals = async () => {
    setLoading(true);
    try {
      const list = await getPerubahanByNisn(student.nisn);
      setProposals(list);
    } catch {
      notifyError('Gagal Memuat', 'Tidak dapat memuat daftar pengajuan perubahan biodata.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProposals();
  }, [student.nisn]);

  const handleSendDraft = async (id: string) => {
    setProcessingId(id);
    try {
      await submitDraftPerubahan(id);
      success('Draft Dikirim', 'Pengajuan perubahan berhasil dikirim ke Admin Sekolah (Status: Pending).');
      await loadProposals();
    } catch (err: unknown) {
      notifyError('Gagal Mengirim Draft', err instanceof Error ? err.message : 'Terjadi kesalahan.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleCancelRequest = async (id: string) => {
    setProcessingId(id);
    try {
      await cancelPerubahan(id, student.nisn);
      success('Pengajuan Dibatalkan', 'Status pengajuan telah diubah menjadi Cancelled (Dibatalkan).');
      await loadProposals();
    } catch (err: unknown) {
      notifyError('Gagal Membatalkan', err instanceof Error ? err.message : 'Terjadi kesalahan.');
    } finally {
      setProcessingId(null);
    }
  };

  const filteredProposals = proposals.filter(p => {
    if (statusFilter === 'all') return true;
    return p.status === statusFilter;
  });

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Status Pengajuan Perubahan Biodata Saya
          </h2>
          <p className="text-xs text-slate-500">
            Mendukung status: Draft, Pending, Partially Approved, Approved, Rejected, dan Cancelled
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="text-xs font-semibold text-slate-700 bg-transparent focus:outline-none"
            >
              <option value="all">Semua Status ({proposals.length})</option>
              <option value="draft">Draft</option>
              <option value="pending">Pending</option>
              <option value="partially_approved">Partially Approved</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <button
            onClick={onNavigateToForm}
            className="px-3.5 py-2 bg-blue-900 hover:bg-blue-800 text-white font-semibold text-xs rounded-lg flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Buat Pengajuan Baru</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-xs text-slate-500">
          Memuat daftar pengajuan...
        </div>
      ) : filteredProposals.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center space-y-3 shadow-xs">
          <Clock className="w-10 h-10 text-slate-300 mx-auto" />
          <h3 className="font-bold text-slate-800 text-sm">Belum Ada Pengajuan pada Filter Ini</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Anda dapat mengajukan koreksi atau melengkapi kolom biodata yang masih kosong melalui halaman Perbaiki Biodata.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredProposals.map(item => (
            <div
              key={item.id}
              className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-xs font-bold text-blue-900">
                    #{item.id.slice(0, 8)}
                  </span>
                  <span className="text-xs text-slate-400">•</span>
                  <span className="text-xs text-slate-500 font-mono">
                    {new Date(item.submitted_at).toLocaleString('id-ID')}
                  </span>
                </div>
                <ZeroPillBadge status={item.status} />
              </div>

              {/* Diff items */}
              <div className="space-y-2">
                {Object.entries(item.fields_changed).map(([key, diff]) => (
                  <div
                    key={key}
                    className="p-3 rounded-lg bg-slate-50 border border-slate-200/80 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-700">{diff.label}</span>
                      {diff.item_status && (
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            diff.item_status === 'approved'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : diff.item_status === 'rejected'
                              ? 'bg-rose-50 text-rose-800 border border-rose-200'
                              : 'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {diff.item_status === 'approved'
                            ? 'Disetujui'
                            : diff.item_status === 'rejected'
                            ? 'Ditolak'
                            : 'Menunggu'}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-11 gap-2 items-center">
                      <div className="sm:col-span-5 text-slate-500 line-through break-words">
                        Lama: {diff.old_value}
                      </div>
                      <div className="sm:col-span-1 flex justify-center text-slate-400">
                        <ArrowRight className="w-3.5 h-3.5" />
                      </div>
                      <div className="sm:col-span-5 font-bold text-emerald-900 break-words">
                        Baru: {diff.new_value}
                      </div>
                    </div>
                    {diff.item_status === 'rejected' && diff.rejection_reason && (
                      <div className="mt-1 px-2.5 py-1.5 rounded bg-rose-50 border border-rose-200 text-[11px] text-rose-800">
                        <strong>Alasan Penolakan Kolom:</strong> {diff.rejection_reason}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-600 pt-1">
                <div>
                  <span className="font-semibold text-slate-700">Alasan:</span> {item.alasan}
                </div>
                {item.dokumen_pendukung_nama && (
                  <div className="inline-flex items-center gap-1 text-blue-900 font-medium">
                    <FileText className="w-3.5 h-3.5" />
                    <span>{item.dokumen_pendukung_nama}</span>
                  </div>
                )}
              </div>

              {item.catatan_verifikator && (
                <div
                  className={`p-3 rounded-lg border text-xs ${
                    item.status === 'approved'
                      ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                      : item.status === 'partially_approved'
                      ? 'bg-sky-50/70 border-sky-200 text-sky-950'
                      : 'bg-rose-50/70 border-rose-200 text-rose-950'
                  }`}
                >
                  <span className="font-bold block mb-0.5">
                    Catatan Verifikator ({item.verifikator_name || 'Admin TU'}):
                  </span>
                  <span>{item.catatan_verifikator}</span>
                </div>
              )}

              {/* Actions for Draft or Pending */}
              {(item.status === 'draft' || item.status === 'pending') && (
                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={processingId === item.id}
                    onClick={() => handleCancelRequest(item.id)}
                    className="px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Batalkan Pengajuan</span>
                  </button>

                  {item.status === 'draft' && (
                    <button
                      type="button"
                      disabled={processingId === item.id}
                      onClick={() => handleSendDraft(item.id)}
                      className="px-3.5 py-1.5 rounded-lg bg-blue-900 hover:bg-blue-800 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors shadow-2xs disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Kirim Pengajuan Sekarang</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
