import React, { useState, useEffect } from 'react';
import { PerubahanBiodata, Siswa } from '../../types';
import { getPerubahanByNisn } from '../../services/dataService';
import { ZeroPillBadge } from '../../components/common/ZeroPillBadge';
import { formatDateLongID, isDateFieldKey } from '../../utils/formatters';
import { CheckCircle2, History } from 'lucide-react';

interface RiwayatPerubahanPageProps {
  student: Siswa;
}

export const RiwayatPerubahanPage: React.FC<RiwayatPerubahanPageProps> = ({ student }) => {
  const [historyList, setHistoryList] = useState<PerubahanBiodata[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getPerubahanByNisn(student.nisn)
      .then(list => {
        setHistoryList(list.filter(p => p.status !== 'draft'));
      })
      .finally(() => setLoading(false));
  }, [student.nisn]);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">
          Riwayat Pengajuan &amp; Perubahan Biodata
        </h2>
        <p className="text-xs text-slate-500">
          Jejak historis seluruh pengajuan perubahan biodata untuk {student.nama_lengkap} (NISN: {student.nisn})
        </p>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-xs text-slate-500">
          Memuat riwayat perubahan...
        </div>
      ) : historyList.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center space-y-3 shadow-xs">
          <History className="w-10 h-10 text-slate-300 mx-auto" />
          <h3 className="font-bold text-slate-800 text-sm">Belum Ada Riwayat Perubahan</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Seluruh pengajuan perubahan biodata yang telah dikirim, disetujui, disetujui sebagian, ditolak, maupun dibatalkan akan tercatat di halaman ini.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {historyList.map(item => (
            <div
              key={item.id}
              className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                  <CheckCircle2 className="w-4 h-4 text-blue-900" />
                  <span>
                    Diajukan:{' '}
                    {new Date(item.submitted_at).toLocaleDateString('id-ID', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric'
                    })}
                  </span>
                  {item.verified_at && (
                    <span className="text-slate-500 font-normal">
                      • Diverifikasi: {new Date(item.verified_at).toLocaleDateString('id-ID')}
                    </span>
                  )}
                </div>
                <ZeroPillBadge status={item.status} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {Object.entries(item.fields_changed).map(([key, diff]) => (
                  <div
                    key={key}
                    className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex flex-col justify-between gap-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-400 font-semibold">{diff.label}</span>
                      {diff.item_status && (
                        <span
                          className={`text-[10px] font-bold uppercase ${
                            diff.item_status === 'approved'
                              ? 'text-emerald-700'
                              : diff.item_status === 'rejected'
                              ? 'text-rose-700'
                              : 'text-amber-700'
                          }`}
                        >
                          {diff.item_status}
                        </span>
                      )}
                    </div>
                    <div className="font-bold text-slate-900 mt-0.5">
                      {isDateFieldKey(key)
                        ? `${formatDateLongID(diff.new_value)} (${diff.new_value})`
                        : diff.new_value}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Data sebelumnya:{' '}
                      {isDateFieldKey(key) ? formatDateLongID(diff.old_value) : diff.old_value}
                    </div>
                    {diff.item_status === 'rejected' && diff.rejection_reason && (
                      <div className="mt-1 px-2 py-1 rounded bg-rose-50 border border-rose-200 text-[10px] text-rose-800">
                        <strong>Alasan ditolak:</strong> {diff.rejection_reason}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {item.catatan_verifikator && (
                <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                  Diverifikasi oleh:{' '}
                  <strong className="text-slate-700">{item.verifikator_name || 'Admin TU'}</strong> —{' '}
                  {item.catatan_verifikator}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
