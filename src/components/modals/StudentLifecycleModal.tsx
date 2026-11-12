import React, { useState, useEffect } from 'react';
import {
  Siswa,
  StudentClassHistoryRecord,
  Mutasi,
  StudentGraduationRecord,
  ALL_59_STUDENT_FIELDS
} from '../../types';
import {
  getAllClassHistoryList,
  getMutasiList,
  getGraduationsList,
  saveClassHistoryPlacement
} from '../../services/dataService';
import { printStudentBiodataF4 } from '../../services/pdfService';
import { ZeroPillBadge } from '../common/ZeroPillBadge';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { CLASS_ROSTER } from '../../config/school';
import { formatDateDMY, mapIncomeToRange } from '../../utils/formatters';
import {
  X,
  GraduationCap,
  Layers,
  BookOpen,
  Printer,
  ArrowRightLeft,
  Plus,
  UserCheck,
  Calendar,
  MapPin
} from 'lucide-react';

interface StudentLifecycleModalProps {
  student: Siswa | null;
  onClose: () => void;
  onUpdated?: () => void;
}

export const StudentLifecycleModal: React.FC<StudentLifecycleModalProps> = ({
  student,
  onClose,
  onUpdated
}) => {
  const { adminUser, role } = useAuth();
  const { success, error: notifyError } = useNotification();
  const [activeTab, setActiveTab] = useState<'perjalanan' | 'biodata59' | 'mutasi'>('perjalanan');
  const [historyList, setHistoryList] = useState<StudentClassHistoryRecord[]>([]);
  const [mutations, setMutations] = useState<Mutasi[]>([]);
  const [graduation, setGraduation] = useState<StudentGraduationRecord | null>(null);
  const [loading, setLoading] = useState(false);

  // Add class history form
  const [showAddHistory, setShowAddHistory] = useState(false);
  const [newTa, setNewTa] = useState('2025/2026');
  const [newSemester, setNewSemester] = useState('Ganjil');
  const [newKelas, setNewKelas] = useState('7A');
  const [newStatusRiwayat, setNewStatusRiwayat] =
    useState<StudentClassHistoryRecord['status_riwayat']>('aktif');
  const [newCatatan, setNewCatatan] = useState('');
  const [savingHistory, setSavingHistory] = useState(false);

  const canModify = role === 'super_admin' || role === 'admin' || role === 'operator';

  const loadJourney = async () => {
    if (!student) return;
    setLoading(true);
    try {
      const [hist, muts, grads] = await Promise.all([
        getAllClassHistoryList({ student_id: student.id }),
        getMutasiList(),
        getGraduationsList()
      ]);
      setHistoryList(hist);
      setMutations(
        muts.filter(
          m =>
            m.status !== 'dibatalkan' &&
            (m.siswa_id === student.id ||
              (student.nisn && m.nisn === student.nisn) ||
              (student.nis && m.nis === student.nis))
        )
      );
      const foundGrad = grads.find(
        g => g.student_id === student.id || (student.nisn && g.nisn === student.nisn)
      );
      setGraduation(foundGrad || null);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (student) {
      setNewKelas(student.rombel || '7A');
      loadJourney();
    }
  }, [student]);

  if (!student) return null;

  const angkatan = student.angkatan || (student.tanggal_masuk || '').slice(0, 4) || student.tahun_masuk || '-';
  const tahunLulus =
    graduation?.tahun_kelulusan ||
    student.tahun_lulus ||
    (student.status === 'lulus' && /^\d{4}$/.test(angkatan)
      ? String(parseInt(angkatan, 10) + 3)
      : undefined);

  const handleAddHistory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canModify) return;
    setSavingHistory(true);
    try {
      const res = await saveClassHistoryPlacement(
        {
          student_id: student.id,
          tahun_ajaran: newTa,
          semester: newSemester,
          kelas: newKelas,
          kamar: student.kamar,
          status_riwayat: newStatusRiwayat,
          catatan: newCatatan
        },
        {
          id: adminUser?.id || 'admin',
          name: adminUser?.nama_lengkap || 'Admin Sekolah',
          role: role || 'admin'
        }
      );

      if (res.status === 'duplicate_skipped') {
        notifyError(
          'Riwayat Kelas Sudah Ada',
          `Siswa ini sudah memiliki catatan Kelas ${newKelas} pada Tahun Pelajaran ${newTa}.`
        );
      } else {
        success('Riwayat Kelas Ditambahkan', `Penempatan kelas ${newKelas} (${newTa}) berhasil disimpan.`);
        setShowAddHistory(false);
        setNewCatatan('');
        await loadJourney();
        onUpdated?.();
      }
    } catch (err: unknown) {
      notifyError('Gagal Menyimpan', err instanceof Error ? err.message : 'Terjadi kesalahan.');
    } finally {
      setSavingHistory(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-5xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-[#0A192F] text-white px-5 py-4 flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-blue-600/30 border border-blue-400/30 flex items-center justify-center font-extrabold text-base text-blue-200 shrink-0">
              {student.nama_lengkap.charAt(0)}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold text-base text-white truncate">{student.nama_lengkap}</h3>
                <ZeroPillBadge status={student.status} />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300 font-mono mt-0.5">
                <span>NISN: {student.nisn || '-'}</span>
                <span>•</span>
                <span>NIS: {student.nis || '-'}</span>
                <span>•</span>
                <span className="text-blue-300 font-bold">Angkatan: {angkatan}</span>
                <span>•</span>
                <span>Kelas Terakhir: {student.rombel}</span>
                {tahunLulus && (
                  <>
                    <span>•</span>
                    <span className="text-emerald-300 font-bold">Lulus: {tahunLulus}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => printStudentBiodataF4(student)}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Cetak Biodata F4</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 3 Konsep Data Summary Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-slate-50 border-b border-slate-200 shrink-0">
          <div className="bg-white p-3 rounded-xl border border-slate-200/90 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-blue-50 text-blue-900">
              <UserCheck className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                1. Biodata Induk Siswa
              </span>
              <span className="text-xs font-bold text-slate-900 block">
                NIS {student.nis || '-'} / NISN {student.nisn || '-'}
              </span>
              <span className="text-[11px] text-slate-500">
                {student.tempat_lahir || '-'}, {formatDateDMY(student.tanggal_lahir)}
              </span>
            </div>
          </div>

          <div className="bg-white p-3 rounded-xl border border-slate-200/90 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-indigo-50 text-indigo-900">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                2. Identitas Angkatan (Tetap)
              </span>
              <span className="text-xs font-bold text-slate-900 block">
                Angkatan Tahun {angkatan}
              </span>
              <span className="text-[11px] text-slate-500">
                Tgl Masuk: {formatDateDMY(student.tanggal_masuk)}
              </span>
            </div>
          </div>

          <div className="bg-white p-3 rounded-xl border border-slate-200/90 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-900">
              <GraduationCap className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                3. Status &amp; Riwayat Kelas
              </span>
              <span className="text-xs font-bold text-slate-900 block">
                {student.status === 'lulus'
                  ? `Alumni Lulus Tahun ${tahunLulus || '-'}`
                  : `Kelas Saat Ini: ${student.rombel}`}
              </span>
              <span className="text-[11px] text-slate-500">
                {historyList.length} Catatan Riwayat Kelas
              </span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="px-5 pt-2 bg-white border-b border-slate-200 flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('perjalanan')}
            className={`px-3.5 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'perjalanan'
                ? 'border-blue-900 text-blue-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Timeline Riwayat Kelas &amp; Kelulusan ({historyList.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('biodata59')}
            className={`px-3.5 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'biodata59'
                ? 'border-blue-900 text-blue-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Biodata Lengkap (59 Kolom)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('mutasi')}
            className={`px-3.5 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'mutasi'
                ? 'border-blue-900 text-blue-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            <span>Riwayat Mutasi ({mutations.length})</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-5">
          {loading ? (
            <div className="py-12 text-center text-xs text-slate-500">
              Memuat riwayat perjalanan akademik siswa...
            </div>
          ) : activeTab === 'perjalanan' ? (
            <div className="space-y-5">
              {/* Graduation Card if Alumni */}
              {(student.status === 'lulus' || graduation) && (
                <div className="p-4 rounded-xl bg-emerald-50/80 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-emerald-950 font-bold text-sm">
                      <GraduationCap className="w-4 h-4 text-emerald-700" />
                      <span>Data Kelulusan Resmi (Arsip Alumni Permanen)</span>
                    </div>
                    <p className="text-xs text-emerald-800">
                      Tahun Pelajaran Lulus:{' '}
                      <strong>{graduation?.tahun_ajaran_lulus || '-'}</strong> • Tahun Kelulusan:{' '}
                      <strong>{tahunLulus || '-'}</strong> • Tanggal Kelulusan:{' '}
                      <strong>{formatDateDMY(graduation?.tanggal_kelulusan || student.tanggal_lulus)}</strong>
                    </p>
                    {(graduation?.nomor_ijazah_smp || student.nomor_ijazah_smp) && (
                      <p className="text-xs font-mono text-emerald-900">
                        No. Ijazah SMP: {graduation?.nomor_ijazah_smp || student.nomor_ijazah_smp}
                      </p>
                    )}
                    {graduation?.sekolah_lanjutan && (
                      <p className="text-xs text-emerald-900">
                        Sekolah Lanjutan (SMA/SMK/MA): <strong>{graduation.sekolah_lanjutan}</strong>
                      </p>
                    )}
                  </div>
                  <div className="px-3 py-1.5 rounded-lg bg-white border border-emerald-300 text-emerald-900 font-mono text-xs font-bold shrink-0">
                    ALUMNI ANGKATAN {angkatan}
                  </div>
                </div>
              )}

              {/* Riwayat Kelas Header & Add Form */}
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">
                    Riwayat Penempatan Kelas Setiap Tahun Pelajaran
                  </h4>
                  <p className="text-xs text-slate-500">
                    Catatan historis kelas dari awal masuk hingga saat ini / lulus
                  </p>
                </div>
                {canModify && (
                  <button
                    type="button"
                    onClick={() => setShowAddHistory(v => !v)}
                    className="px-3 py-1.5 rounded-lg bg-blue-900 hover:bg-blue-800 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tambah Riwayat Kelas</span>
                  </button>
                )}
              </div>

              {showAddHistory && canModify && (
                <form
                  onSubmit={handleAddHistory}
                  className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
                >
                  <div className="text-xs font-bold text-slate-800">
                    Tambah Riwayat Kelas Lintas Tahun Pelajaran (Termasuk Arsip Tahun Sebelumnya)
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Tahun Pelajaran
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Contoh: 2024/2025"
                        value={newTa}
                        onChange={e => setNewTa(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Semester
                      </label>
                      <select
                        value={newSemester}
                        onChange={e => setNewSemester(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                      >
                        <option value="Ganjil">Ganjil</option>
                        <option value="Genap">Genap</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Kelas
                      </label>
                      <select
                        value={newKelas}
                        onChange={e => setNewKelas(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                      >
                        {CLASS_ROSTER.map(c => (
                          <option key={c} value={c}>
                            Kelas {c}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Status Penempatan
                      </label>
                      <select
                        value={newStatusRiwayat}
                        onChange={e =>
                          setNewStatusRiwayat(
                            e.target.value as StudentClassHistoryRecord['status_riwayat']
                          )
                        }
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                      >
                        <option value="aktif">Aktif / Penempatan Awal</option>
                        <option value="naik_kelas">Naik Kelas</option>
                        <option value="tinggal_kelas">Tidak Naik Kelas</option>
                        <option value="pindah_rombel">Pindah Rombel</option>
                        <option value="lulus">Lulus</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row items-center gap-3">
                    <input
                      type="text"
                      placeholder="Catatan tambahan (opsional)"
                      value={newCatatan}
                      onChange={e => setNewCatatan(e.target.value)}
                      className="flex-1 w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                    />
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setShowAddHistory(false)}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-600 bg-white"
                      >
                        Batal
                      </button>
                      <button
                        type="submit"
                        disabled={savingHistory}
                        className="px-3.5 py-1.5 rounded-lg bg-blue-900 hover:bg-blue-800 text-white text-xs font-semibold"
                      >
                        {savingHistory ? 'Menyimpan...' : 'Simpan Riwayat'}
                      </button>
                    </div>
                  </div>
                </form>
              )}

              {historyList.length === 0 ? (
                <div className="p-6 rounded-xl border border-slate-200 bg-slate-50 text-center space-y-1">
                  <p className="text-xs font-bold text-slate-700">
                    Riwayat kelas lintas tahun pelajaran belum tercatat secara terpisah.
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Kelas aktif saat ini pada biodata utama adalah <strong>Kelas {student.rombel}</strong> (Angkatan {angkatan}). Gunakan tombol &ldquo;Tambah Riwayat Kelas&rdquo; atau menu &ldquo;Import Riwayat Kelas&rdquo; untuk melengkapi riwayat tahun sebelumnya.
                  </p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                        <th className="py-2.5 px-3">Tahun Pelajaran</th>
                        <th className="py-2.5 px-3">Kelas</th>
                        <th className="py-2.5 px-3">Tingkat</th>
                        <th className="py-2.5 px-3">Status Riwayat</th>
                        <th className="py-2.5 px-3">Tanggal Mulai</th>
                        <th className="py-2.5 px-3">Catatan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {historyList.map(h => (
                        <tr key={h.id} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-3 font-mono font-bold text-blue-950">
                            {h.tahun_ajaran || '-'} {h.semester ? `(${h.semester})` : ''}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-slate-900">Kelas {h.kelas}</td>
                          <td className="py-2.5 px-3 text-slate-600">Tingkat {h.tingkat_kelas}</td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-900 font-semibold text-[11px] uppercase">
                              {h.status_riwayat.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-600">
                            {formatDateDMY(h.tanggal_mulai)}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">{h.catatan || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : activeTab === 'biodata59' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {ALL_59_STUDENT_FIELDS.map(f => {
                const val = student[f.key];
                let displayVal = '-';
                if (val !== undefined && val !== null && String(val).trim() !== '') {
                  if (
                    f.key.includes('tanggal') ||
                    f.key.startsWith('tgl_') ||
                    f.inputType === 'date'
                  ) {
                    displayVal = formatDateDMY(val);
                  } else if (f.key.startsWith('penghasilan_')) {
                    displayVal = mapIncomeToRange(val);
                  } else {
                    displayVal = String(val);
                  }
                }
                return (
                  <div
                    key={f.key}
                    className="p-3 rounded-lg bg-slate-50 border border-slate-200/80 text-xs"
                  >
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      {f.label}
                    </span>
                    <span className="font-semibold text-slate-900 mt-0.5 block break-words">
                      {displayVal}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              {mutations.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-slate-200">
                  Tidak ada catatan mutasi masuk maupun mutasi keluar untuk siswa ini.
                </div>
              ) : (
                mutations.map(m => (
                  <div
                    key={m.id}
                    className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-1.5 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 uppercase">
                        Mutasi {m.jenis === 'masuk' ? 'Masuk' : 'Keluar'} — {m.kategori_mutasi || '-'}
                      </span>
                      <span className="font-mono text-slate-600">
                        <Calendar className="w-3.5 h-3.5 inline mr-1" />
                        {formatDateDMY(m.tanggal_mutasi)} ({m.tahun_ajaran || '-'})
                      </span>
                    </div>
                    <div className="text-slate-700 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>
                        {m.jenis === 'masuk'
                          ? `Sekolah Asal: ${m.sekolah_asal || '-'}`
                          : `Sekolah Tujuan: ${m.sekolah_tujuan || '-'}`}{' '}
                        • Kelas: <strong>{m.kelas}</strong>
                      </span>
                    </div>
                    <div className="text-slate-500">Alasan: {m.alasan || '-'}</div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
