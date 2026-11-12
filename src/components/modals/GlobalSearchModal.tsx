import React, { useState, useEffect, useMemo } from 'react';
import { Siswa } from '../../types';
import { getSiswaList } from '../../services/dataService';
import { ZeroPillBadge } from '../common/ZeroPillBadge';
import { Search, X, Layers, GraduationCap, ArrowRight, Users } from 'lucide-react';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectStudent: (student: Siswa) => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  isOpen,
  onClose,
  onSelectStudent
}) => {
  const [students, setStudents] = useState<Siswa[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [angkatanFilter, setAngkatanFilter] = useState<string>('all');

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      getSiswaList()
        .then(setStudents)
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [isOpen]);

  const angkatanList = useMemo(() => {
    const s = new Set<string>();
    students.forEach(st => {
      const a = st.angkatan || (st.tanggal_masuk || '').slice(0, 4) || st.tahun_masuk;
      if (a) s.add(a);
    });
    return Array.from(s).sort().reverse();
  }, [students]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return students
      .filter(s => {
        const angk = s.angkatan || (s.tanggal_masuk || '').slice(0, 4) || s.tahun_masuk || '';
        if (statusFilter !== 'all' && s.status !== statusFilter) return false;
        if (angkatanFilter !== 'all' && angk !== angkatanFilter) return false;
        if (!q) return true;
        return (
          s.nama_lengkap.toLowerCase().includes(q) ||
          (s.nis || '').toLowerCase().includes(q) ||
          (s.nisn || '').toLowerCase().includes(q) ||
          (s.nik_siswa || '').toLowerCase().includes(q) ||
          angk.toLowerCase().includes(q) ||
          (s.rombel || '').toLowerCase().includes(q)
        );
      })
      .slice(0, 50);
  }, [students, query, statusFilter, angkatanFilter]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-6 bg-slate-900/70 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-4xl shadow-2xl overflow-hidden mt-6 sm:mt-12">
        {/* Top Search Bar */}
        <div className="p-4 bg-[#0A192F] text-white flex items-center gap-3 border-b border-slate-800">
          <Search className="w-5 h-5 text-blue-300 shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Cari lintas angkatan tanpa pilih Tahun Pelajaran: ketik Nama Siswa, NISN, NIS, NIK, atau Angkatan..."
            className="w-full bg-transparent text-white placeholder-slate-400 text-sm focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Bar */}
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-slate-600">Cakupan Lintas Angkatan:</span>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white font-semibold text-slate-700"
            >
              <option value="all">Semua Status (Aktif, Lulus/Alumni, Mutasi)</option>
              <option value="aktif">Siswa Aktif</option>
              <option value="lulus">Alumni (Sudah Lulus)</option>
              <option value="mutasi_masuk">Mutasi Masuk</option>
              <option value="mutasi_keluar">Mutasi Keluar</option>
              <option value="non_aktif">Non-Aktif</option>
            </select>

            <select
              value={angkatanFilter}
              onChange={e => setAngkatanFilter(e.target.value)}
              className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white font-semibold text-slate-700"
            >
              <option value="all">Semua Angkatan</option>
              {angkatanList.map(a => (
                <option key={a} value={a}>
                  Angkatan {a}
                </option>
              ))}
            </select>
          </div>

          <span className="text-slate-500 font-mono">
            Menampilkan {filtered.length} dari {students.length} total siswa terdaftar
          </span>
        </div>

        {/* Results */}
        <div className="max-h-[65vh] overflow-y-auto divide-y divide-slate-100">
          {loading ? (
            <div className="p-10 text-center text-xs text-slate-500">
              Memuat seluruh data lintas angkatan...
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <Users className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs font-bold text-slate-700">
                Data siswa tidak ditemukan untuk kata kunci tersebut.
              </p>
            </div>
          ) : (
            filtered.map(s => {
              const angkatan = s.angkatan || (s.tanggal_masuk || '').slice(0, 4) || s.tahun_masuk || '-';
              const tahunLulus =
                s.tahun_lulus ||
                (s.status === 'lulus' && /^\d{4}$/.test(angkatan)
                  ? String(parseInt(angkatan, 10) + 3)
                  : undefined);

              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    onSelectStudent(s);
                  }}
                  className="w-full p-3.5 sm:px-5 hover:bg-blue-50/50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-left group"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-900 text-sm group-hover:text-blue-900">
                        {s.nama_lengkap}
                      </span>
                      <ZeroPillBadge status={s.status} />
                      {s.status === 'lulus' && tahunLulus && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 font-mono text-[10px] font-bold">
                          <GraduationCap className="w-3 h-3" />
                          Lulus {tahunLulus}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 font-mono">
                      <span>NISN: <strong className="text-slate-800">{s.nisn || '-'}</strong></span>
                      <span>NIS: <strong className="text-slate-800">{s.nis || '-'}</strong></span>
                      <span className="inline-flex items-center gap-1 text-indigo-900 font-bold">
                        <Layers className="w-3 h-3" />
                        Angkatan {angkatan}
                      </span>
                      <span>Kelas Terakhir: <strong className="text-slate-800">{s.rombel}</strong></span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs font-bold text-blue-900 shrink-0">
                    <span>Buka Riwayat Perjalanan</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
