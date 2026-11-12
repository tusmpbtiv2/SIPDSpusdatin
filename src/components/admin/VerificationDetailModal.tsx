import React, { useState, useEffect, useMemo } from 'react';
import { PerubahanBiodata, Siswa } from '../../types';
import { ItemReviewDecision } from '../../services/dataService';
import { ZeroPillBadge } from '../common/ZeroPillBadge';
import {
  X,
  CheckCircle,
  XCircle,
  ArrowRight,
  FileText,
  AlertCircle,
  Check,
  Ban,
  UserCheck,
  AlertTriangle,
  ShieldCheck
} from 'lucide-react';
import { formatDateDMY, formatDateTimeDMY, mapIncomeToRange } from '../../utils/formatters';

interface VerificationDetailModalProps {
  proposal: PerubahanBiodata | null;
  currentStudent?: Siswa | null;
  canVerify: boolean;
  onClose: () => void;
  onReviewItems: (
    id: string,
    itemDecisions: Record<string, ItemReviewDecision>,
    catatan: string,
    forceOverride: boolean
  ) => Promise<void>;
}

export const VerificationDetailModal: React.FC<VerificationDetailModalProps> = ({
  proposal,
  currentStudent,
  canVerify,
  onClose,
  onReviewItems
}) => {
  const [catatan, setCatatan] = useState('');
  const [itemDecisions, setItemDecisions] = useState<Record<string, 'approved' | 'rejected'>>({});
  const [itemRejectionReasons, setItemRejectionReasons] = useState<Record<string, string>>({});
  const [forceOverride, setForceOverride] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (proposal) {
      const initialDecisions: Record<string, 'approved' | 'rejected'> = {};
      const initialReasons: Record<string, string> = {};
      Object.entries(proposal.fields_changed).forEach(([key, val]) => {
        initialDecisions[key] = val.item_status === 'rejected' ? 'rejected' : 'approved';
        initialReasons[key] = val.rejection_reason || '';
      });
      setItemDecisions(initialDecisions);
      setItemRejectionReasons(initialReasons);
      setCatatan(proposal.catatan_verifikator || '');
      setForceOverride(false);
      setErrorMsg(null);
    }
  }, [proposal]);

  const fieldEntries = useMemo(
    () => (proposal ? Object.entries(proposal.fields_changed) : []),
    [proposal]
  );

  // Periksa apakah nilai saat ini di tabel `students` berbeda dari `old_value` saat diajukan
  const staleConflicts = useMemo(() => {
    if (!proposal || !currentStudent || proposal.status !== 'pending') return {};
    const conflicts: Record<string, string> = {};
    for (const [key, item] of fieldEntries) {
      const liveValRaw = (currentStudent as unknown as Record<string, unknown>)[key];
      const liveVal =
        liveValRaw === undefined || liveValRaw === null || String(liveValRaw).trim() === ''
          ? '-'
          : String(liveValRaw).trim();
      const recordedOldVal =
        !item.old_value || item.old_value.trim() === '' ? '-' : item.old_value.trim();

      if (liveVal !== recordedOldVal) {
        conflicts[key] = liveVal;
      }
    }
    return conflicts;
  }, [proposal, currentStudent, fieldEntries]);

  if (!proposal) return null;

  const approvedCount = fieldEntries.filter(([k]) => itemDecisions[k] === 'approved').length;
  const rejectedCount = fieldEntries.length - approvedCount;

  const hasApprovedStaleConflict = fieldEntries.some(
    ([k]) => itemDecisions[k] === 'approved' && staleConflicts[k] !== undefined
  );

  const setAllDecisions = (decision: 'approved' | 'rejected') => {
    const next: Record<string, 'approved' | 'rejected'> = {};
    fieldEntries.forEach(([k]) => {
      next[k] = decision;
    });
    setItemDecisions(next);
  };

  const handleSubmitDecision = async (overrideAll?: 'approved' | 'rejected') => {
    setErrorMsg(null);
    const finalDecisions: Record<string, ItemReviewDecision> = {};
    let anyRejected = false;

    for (const [k] of fieldEntries) {
      const status = overrideAll || itemDecisions[k] || 'approved';
      const reason = (itemRejectionReasons[k] || '').trim();
      if (status === 'rejected') {
        anyRejected = true;
      }
      finalDecisions[k] = {
        status,
        reason: status === 'rejected' ? reason || catatan.trim() || undefined : undefined
      };
    }

    // Jika ada kolom yang ditolak (semua atau sebagian), pastikan ada alasan penolakan
    if (anyRejected) {
      const hasMissingReason = Object.entries(finalDecisions).some(
        ([, dec]) => dec.status === 'rejected' && !dec.reason && !catatan.trim()
      );
      if (hasMissingReason) {
        setErrorMsg(
          'Harap tuliskan alasan penolakan pada kolom yang ditolak atau pada Catatan Verifikator.'
        );
        return;
      }
    }

    // Jika ada konflik nilai lama pada kolom yang disetujui dan forceOverride belum dicentang
    const hasConflictInFinal = Object.entries(finalDecisions).some(
      ([k, dec]) => dec.status === 'approved' && staleConflicts[k] !== undefined
    );
    if (hasConflictInFinal && !forceOverride) {
      setErrorMsg(
        'Terdapat kolom yang nilai saat ini di Buku Induk telah berubah sejak pengajuan dibuat. Centang konfirmasi "Timpa data terbaru" atau tolak kolom yang berkonflik.'
      );
      return;
    }

    setIsProcessing(true);
    try {
      await onReviewItems(proposal.id, finalDecisions, catatan.trim(), forceOverride);
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memproses verifikasi.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-4xl w-full overflow-hidden my-8">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-blue-300">
              VERIFIKASI PENGAJUAN PERUBAHAN BIODATA (#{proposal.id.slice(0, 8)})
            </span>
            <h3 className="font-bold text-base mt-0.5">
              {proposal.nama_siswa} — Kelas {proposal.kelas}
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
        <div className="p-6 space-y-5 max-h-[76vh] overflow-y-auto">
          {/* Metadata Pengaju & Siswa */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs">
            <div>
              <span className="text-slate-400 font-semibold block mb-0.5">
                Orang Tua / Pengaju
              </span>
              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-blue-900 shrink-0" />
                <span>{proposal.requester_name || 'Orang Tua / Wali Siswa'}</span>
              </div>
              <span className="text-[11px] text-slate-500">
                Hubungan: {proposal.requester_relation || 'Wali'}
              </span>
            </div>

            <div>
              <span className="text-slate-400 font-semibold block mb-0.5">
                Identitas Siswa (NIS / NISN)
              </span>
              <div className="font-mono font-bold text-slate-900">
                NIS: {proposal.nis || currentStudent?.nis || '-'}
              </div>
              <div className="font-mono text-[11px] text-slate-600">
                NISN: {proposal.nisn}
              </div>
            </div>

            <div>
              <span className="text-slate-400 font-semibold block mb-0.5">
                Tanggal Pengajuan &amp; Jumlah Kolom
              </span>
              <div className="font-mono text-slate-800 font-semibold">
                {formatDateTimeDMY(proposal.submitted_at)}
              </div>
              <div className="text-[11px] font-bold text-blue-900">
                {fieldEntries.length} Kolom Diusulkan
              </div>
            </div>

            <div className="flex flex-col sm:items-end justify-center">
              <span className="text-slate-400 font-semibold block mb-1">Status Pengajuan</span>
              <ZeroPillBadge status={proposal.status} />
            </div>
          </div>

          {/* Peringatan Konflik Data Lama vs Data Saat Ini di Buku Induk */}
          {Object.keys(staleConflicts).length > 0 && proposal.status === 'pending' && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs space-y-2">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-amber-900">
                    Deteksi Perubahan Data Terbaru di Buku Induk Siswa
                  </strong>
                  <p className="text-amber-800 mt-0.5 leading-relaxed">
                    Terdapat {Object.keys(staleConflicts).length} kolom yang nilainya di Buku Induk saat ini sudah berbeda dibandingkan nilai lama saat orang tua mengajukan usulan ini. Sistem mencegah penimpaan otomatis kecuali Anda mengonfirmasi di bawah.
                  </p>
                </div>
              </div>

              {canVerify && hasApprovedStaleConflict && (
                <label className="flex items-center gap-2 pt-1 font-bold text-amber-950 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={forceOverride}
                    onChange={e => setForceOverride(e.target.checked)}
                    className="rounded border-amber-400 text-blue-900 focus:ring-blue-900"
                  />
                  <span>
                    Saya telah memeriksa konflik dan setuju menimpa nilai terbaru di Buku Induk untuk kolom yang disetujui
                  </span>
                </label>
              )}
            </div>
          )}

          {/* Per-item Side-by-Side Comparison */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Perbandingan Data Lama vs Data Baru Berdampingan ({fieldEntries.length} Kolom)
                </h4>
                <p className="text-[11px] text-slate-500">
                  Admin dapat menyetujui semua kolom, menolak semua kolom, atau menyetujui/menolak sebagian kolom satu per satu.
                </p>
              </div>

              {proposal.status === 'pending' && canVerify && (
                <div className="flex items-center gap-1.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setAllDecisions('approved')}
                    className="px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold hover:bg-emerald-100 transition-colors"
                  >
                    Pilih Setujui Semua ({fieldEntries.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setAllDecisions('rejected')}
                    className="px-2.5 py-1.5 rounded-lg bg-rose-50 text-rose-800 border border-rose-200 font-bold hover:bg-rose-100 transition-colors"
                  >
                    Pilih Tolak Semua ({fieldEntries.length})
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-3">
              {fieldEntries.map(([key, item]) => {
                const currentDecision = itemDecisions[key] || 'approved';
                const liveConflictVal = staleConflicts[key];

                return (
                  <div
                    key={key}
                    className={`p-4 rounded-xl border transition-colors space-y-2.5 ${
                      proposal.status === 'pending' && canVerify
                        ? currentDecision === 'approved'
                          ? 'border-emerald-200 bg-emerald-50/20'
                          : 'border-rose-200 bg-rose-50/20'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">{item.label}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                          {key}
                        </span>
                        {liveConflictVal !== undefined && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                            Nilai Saat Ini di DB: {liveConflictVal}
                          </span>
                        )}
                      </div>

                      {proposal.status === 'pending' && canVerify ? (
                        <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-white shadow-2xs">
                          <button
                            type="button"
                            onClick={() =>
                              setItemDecisions(prev => ({ ...prev, [key]: 'approved' }))
                            }
                            className={`px-3 py-1 rounded-md text-[11px] font-bold flex items-center gap-1 transition-colors ${
                              currentDecision === 'approved'
                                ? 'bg-emerald-700 text-white shadow-2xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            <Check className="w-3 h-3" />
                            <span>Setujui</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setItemDecisions(prev => ({ ...prev, [key]: 'rejected' }))
                            }
                            className={`px-3 py-1 rounded-md text-[11px] font-bold flex items-center gap-1 transition-colors ${
                              currentDecision === 'rejected'
                                ? 'bg-rose-600 text-white shadow-2xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            <Ban className="w-3 h-3" />
                            <span>Tolak</span>
                          </button>
                        </div>
                      ) : (
                        item.item_status && (
                          <span
                            className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                              item.item_status === 'approved'
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : item.item_status === 'rejected'
                                ? 'bg-rose-50 text-rose-800 border border-rose-200'
                                : 'bg-amber-50 text-amber-800 border border-amber-200'
                            }`}
                          >
                            {item.item_status === 'approved'
                              ? 'Kolom Disetujui'
                              : item.item_status === 'rejected'
                              ? 'Kolom Ditolak'
                              : 'Menunggu'}
                          </span>
                        )
                      )}
                    </div>

                    {/* Side-by-side Old Value vs New Value */}
                    <div className="grid grid-cols-1 sm:grid-cols-11 gap-2 items-center text-xs">
                      <div className="sm:col-span-5 p-3 rounded-lg bg-rose-50/70 border border-rose-200 text-rose-900">
                        <span className="text-[10px] uppercase font-bold text-rose-500 block mb-0.5">
                          Data Lama (Saat Diajukan)
                        </span>
                        <span className="font-medium break-words">
                          {key.includes('tanggal') || key.startsWith('tgl_')
                            ? formatDateDMY(item.old_value)
                            : key.startsWith('penghasilan_')
                            ? mapIncomeToRange(item.old_value)
                            : item.old_value || '-'}
                        </span>
                      </div>

                      <div className="sm:col-span-1 flex justify-center text-slate-400">
                        <ArrowRight className="w-4 h-4 rotate-90 sm:rotate-0" />
                      </div>

                      <div className="sm:col-span-5 p-3 rounded-lg bg-emerald-50/80 border border-emerald-200 text-emerald-950">
                        <span className="text-[10px] uppercase font-bold text-emerald-600 block mb-0.5">
                          Data Baru (Usulan Orang Tua)
                        </span>
                        <span className="font-bold break-words">
                          {key.includes('tanggal') || key.startsWith('tgl_')
                            ? formatDateDMY(item.new_value)
                            : key.startsWith('penghasilan_')
                            ? mapIncomeToRange(item.new_value)
                            : item.new_value || '-'}
                        </span>
                      </div>
                    </div>

                    {/* Input Alasan Penolakan Spesifik Kolom */}
                    {proposal.status === 'pending' && canVerify && currentDecision === 'rejected' && (
                      <div className="pt-1">
                        <label className="block text-[11px] font-semibold text-rose-800 mb-1">
                          Alasan Penolakan untuk Kolom &ldquo;{item.label}&rdquo;:
                        </label>
                        <input
                          type="text"
                          value={itemRejectionReasons[key] || ''}
                          onChange={e =>
                            setItemRejectionReasons(prev => ({
                              ...prev,
                              [key]: e.target.value
                            }))
                          }
                          placeholder={`Tuliskan alasan penolakan kolom ${item.label} (opsional jika sudah diisi di catatan umum)...`}
                          className="w-full px-3 py-1.5 border border-rose-300 rounded-lg text-xs bg-white text-slate-900 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600"
                        />
                      </div>
                    )}

                    {/* Tampilkan Alasan Penolakan per Kolom jika sudah diverifikasi */}
                    {proposal.status !== 'pending' &&
                      item.item_status === 'rejected' &&
                      item.rejection_reason && (
                        <div className="p-2 rounded bg-rose-50 border border-rose-200 text-[11px] text-rose-800">
                          <strong>Alasan Ditolak:</strong> {item.rejection_reason}
                        </div>
                      )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Alasan Pengajuan Orang Tua & Dokumen Pendukung */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-slate-400 font-semibold block mb-1">
                Catatan / Alasan Pengajuan Orang Tua:
              </span>
              <p className="text-slate-800 font-medium leading-relaxed">{proposal.alasan}</p>
            </div>
            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-slate-400 font-semibold block mb-1">
                Referensi Dokumen Pendukung:
              </span>
              <div className="flex items-center gap-2 text-blue-900 font-semibold mt-1">
                <FileText className="w-4 h-4 shrink-0" />
                <span>{proposal.dokumen_pendukung_nama || 'Tidak ada lampiran dokumen'}</span>
              </div>
            </div>
          </div>

          {/* Verifikator Input or Existing Result */}
          {proposal.status === 'pending' && canVerify ? (
            <div className="space-y-3 pt-3 border-t border-slate-200">
              {errorMsg && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <label className="block font-semibold text-slate-700">
                  Catatan Verifikator / Alasan Penolakan Umum (Wajib diisi jika ada kolom yang ditolak):
                </label>
                <span className="text-[11px] font-semibold text-slate-600">
                  Ringkasan Keputusan:{' '}
                  <strong className="text-emerald-700">{approvedCount} Kolom Disetujui</strong> ·{' '}
                  <strong className="text-rose-700">{rejectedCount} Kolom Ditolak</strong>
                </span>
              </div>
              <textarea
                rows={2}
                value={catatan}
                onChange={e => setCatatan(e.target.value)}
                placeholder="Contoh: Disetujui sesuai Kartu Keluarga terbaru / Kolom NIK ditolak karena belum sesuai dokumen asli..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
              />

              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                <ShieldCheck className="w-4 h-4 text-blue-900 shrink-0" />
                <span>
                  Transaksi persetujuan dijalankan secara atomik melalui RPC database, memperbarui tabel{' '}
                  <strong>students</strong> hanya untuk kolom yang disetujui, serta mencatat nilai sebelum &amp; sesudah ke{' '}
                  <strong>audit_logs</strong>.
                </span>
              </div>
            </div>
          ) : (
            proposal.catatan_verifikator && (
              <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200 text-xs space-y-1">
                <div className="font-bold text-blue-950 flex items-center justify-between">
                  <span>Catatan Keputusan Verifikator ({proposal.verifikator_name || 'Admin'}):</span>
                  {proposal.verified_at && (
                    <span className="font-mono text-[11px] text-slate-500">
                      {new Date(proposal.verified_at).toLocaleString('id-ID')}
                    </span>
                  )}
                </div>
                <p className="text-slate-700">{proposal.catatan_verifikator}</p>
              </div>
            )
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            Tutup
          </button>

          {proposal.status === 'pending' && canVerify && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleSubmitDecision('rejected')}
                disabled={isProcessing}
                className="px-3.5 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg flex items-center gap-1.5 transition-colors shadow-xs disabled:opacity-50"
              >
                <XCircle className="w-4 h-4" />
                <span>Tolak Semua Kolom</span>
              </button>

              {approvedCount > 0 && rejectedCount > 0 && (
                <button
                  type="button"
                  onClick={() => handleSubmitDecision()}
                  disabled={isProcessing}
                  className="px-4 py-2 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-lg flex items-center gap-1.5 transition-colors shadow-xs disabled:opacity-50"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>
                    Simpan Sebagian ({approvedCount} Disetujui / {rejectedCount} Ditolak)
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() => handleSubmitDecision('approved')}
                disabled={isProcessing}
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg flex items-center gap-1.5 transition-colors shadow-xs disabled:opacity-50"
              >
                <CheckCircle className="w-4 h-4" />
                <span>Setujui Semua Kolom &amp; Terapkan</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
