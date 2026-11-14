import React, { useState, useEffect } from 'react';
import {
  Siswa,
  PerubahanBiodata,
  calculateBiodataCompleteness,
  DataConfirmationEvent,
  StudentDataConfirmationRecord
} from '../../types';
import { getPerubahanByNisn, getConfirmationEventsState } from '../../services/dataService';
import { formatDateLongID, isDateFieldKey } from '../../utils/formatters';
import { ZeroPillBadge } from '../../components/common/ZeroPillBadge';
import { useSchoolProfile } from '../../services/schoolService';
import {
  User,
  Edit3,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowRight,
  School,
  ShieldCheck,
  AlertCircle,
  Sparkles,
  History,
  FileText,
  ClipboardCheck,
  Calendar
} from 'lucide-react';

interface ParentDashboardProps {
  student: Siswa;
  onNavigate: (menu: string) => void;
}

export const ParentDashboard: React.FC<ParentDashboardProps> = ({ student, onNavigate }) => {
  const { profile: schoolProfile } = useSchoolProfile();
  const [proposals, setProposals] = useState<PerubahanBiodata[]>([]);
  const [loadingProposals, setLoadingProposals] = useState(true);
  const [activeEvents, setActiveEvents] = useState<DataConfirmationEvent[]>([]);
  const [confirmations, setConfirmations] = useState<StudentDataConfirmationRecord[]>([]);

  useEffect(() => {
    setLoadingProposals(true);
    getPerubahanByNisn(student.nisn)
      .then(setProposals)
      .catch(() => {})
      .finally(() => setLoadingProposals(false));

    getConfirmationEventsState()
      .then(state => {
        const studentClass = (student.rombel || '').trim().toUpperCase();
        const filtered = (state.events || []).filter(ev => {
          if (!ev.is_active) return false;
          if (!ev.target_classes || ev.target_classes.length === 0) return true;
          return ev.target_classes.map(c => c.toUpperCase()).includes(studentClass);
        });
        setActiveEvents(filtered);
        setConfirmations(state.confirmations || []);
      })
      .catch(() => {});
  }, [student.nisn, student.rombel]);

  const completeness = calculateBiodataCompleteness(student);
  const draftCount = proposals.filter(p => p.status === 'draft').length;
  const pendingCount = proposals.filter(p => p.status === 'pending').length;
  const approvedCount = proposals.filter(
    p => p.status === 'approved' || p.status === 'partially_approved'
  ).length;
  const rejectedCount = proposals.filter(p => p.status === 'rejected').length;

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-slate-900 rounded-2xl p-6 sm:p-7 text-white shadow-sm border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-blue-500/15 border border-blue-400/20 text-blue-300 text-xs font-mono">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>PORTAL RESMI ORANG TUA / WALI SISWA (TERHUBUNG NISN)</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">
            Selamat Datang, Orang Tua / Wali dari {student.nama_lengkap}
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
            Pantau kelengkapan 59 kolom biodata resmi putra/putri Anda di {schoolProfile.nama_sekolah} dan ajukan pelengkapan kolom kosong atau koreksi data secara daring.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            onClick={() => onNavigate('konfirmasi-data-parent')}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <ClipboardCheck className="w-3.5 h-3.5" />
            <span>Konfirmasi Data Siswa</span>
          </button>
          <button
            onClick={() => onNavigate('biodata-anak')}
            className="px-4 py-2.5 bg-white/10 hover:bg-white/15 text-white border border-white/15 rounded-lg text-xs font-semibold transition-colors"
          >
            Lihat Biodata Lengkap
          </button>
          <button
            onClick={() => onNavigate('perbaiki-biodata')}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Koreksi &amp; Lengkapi Biodata</span>
          </button>
        </div>
      </div>

      {/* Active Data Confirmation Events Banner */}
      {activeEvents.length > 0 && (
        <div className="space-y-3">
          {activeEvents.map(ev => {
            const conf = confirmations.find(
              c => c.event_id === ev.id && String(c.nisn).trim() === String(student.nisn).trim()
            );
            const isConfirmed =
              conf?.status === 'confirmed_valid' || conf?.status === 'submitted_correction';

            return (
              <div
                key={ev.id}
                className={`rounded-xl border p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                  isConfirmed
                    ? 'bg-emerald-50/80 border-emerald-200'
                    : 'bg-amber-50/90 border-amber-300'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold ${
                        isConfirmed
                          ? 'bg-emerald-600 text-white'
                          : 'bg-amber-600 text-white'
                      }`}
                    >
                      <ClipboardCheck className="w-3.5 h-3.5" />
                      {isConfirmed ? 'SUDAH KONFIRMASI DATA' : 'WAJIB KONFIRMASI DATA SISWA'}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700">
                      <Calendar className="w-3.5 h-3.5 text-slate-500" />
                      Periode: {ev.tanggal_mulai} s/d {ev.tanggal_selesai}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-white/80 border border-slate-200 text-[11px] font-mono font-bold text-slate-700">
                      {ev.target_columns.length} Kolom Identitas
                    </span>
                  </div>
                  <h3 className="text-base font-extrabold text-slate-900">{ev.nama_periode}</h3>
                  {ev.deskripsi && (
                    <p className="text-xs text-slate-700 leading-relaxed">{ev.deskripsi}</p>
                  )}
                </div>

                <div className="shrink-0">
                  <button
                    onClick={() => onNavigate('konfirmasi-data-parent')}
                    className={`px-4 py-2.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors shadow-xs ${
                      isConfirmed
                        ? 'bg-emerald-700 hover:bg-emerald-800 text-white'
                        : 'bg-blue-900 hover:bg-blue-800 text-white'
                    }`}
                  >
                    <ClipboardCheck className="w-4 h-4" />
                    <span>
                      {isConfirmed ? 'Lihat Bukti Konfirmasi Data' : 'Buka & Konfirmasi Data Sekarang'}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Indikator Kelengkapan Biodata (59 Kolom) */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-900" />
              <h3 className="font-bold text-slate-900 text-sm">
                Indikator Kelengkapan Biodata Buku Induk Siswa
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Terisi <strong className="text-slate-800">{completeness.filledCount}</strong> dari{' '}
              <strong className="text-slate-800">{completeness.totalCount} kolom</strong> standar Buku Induk Siswa.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="text-2xl font-extrabold font-mono text-blue-900">
                {completeness.percentage}%
              </span>
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Kelengkapan Data
              </span>
            </div>
            {completeness.emptyFields.length > 0 && (
              <button
                onClick={() => onNavigate('perbaiki-biodata')}
                className="px-3.5 py-2 bg-blue-900 hover:bg-blue-800 text-white font-semibold text-xs rounded-lg transition-colors shadow-xs"
              >
                Lengkapi {completeness.emptyFields.length} Kolom Kosong
              </button>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
          <div
            className={`h-full transition-all duration-500 ${
              completeness.percentage >= 90
                ? 'bg-emerald-600'
                : completeness.percentage >= 70
                ? 'bg-blue-700'
                : 'bg-amber-500'
            }`}
            style={{ width: `${completeness.percentage}%` }}
          />
        </div>

        {completeness.emptyFields.length > 0 ? (
          <div className="p-3.5 rounded-lg bg-amber-50/70 border border-amber-200/80 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Terdapat {completeness.emptyFields.length} kolom biodata yang masih kosong / belum lengkap:
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {completeness.emptyFields.slice(0, 14).map(field => (
                <span
                  key={field.key}
                  className="px-2 py-0.5 rounded bg-white border border-amber-300 text-[11px] font-medium text-amber-900"
                >
                  {field.label}
                </span>
              ))}
              {completeness.emptyFields.length > 14 && (
                <span className="px-2 py-0.5 rounded bg-amber-100 text-[11px] font-bold text-amber-900">
                  +{completeness.emptyFields.length - 14} kolom lainnya
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Seluruh 59 kolom biodata Buku Induk Siswa telah terisi lengkap!</span>
          </div>
        )}
      </div>

      {/* Student Identity Summary & Status Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Student Identity Card */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-blue-100 border border-blue-200 text-blue-900 flex items-center justify-center font-bold text-lg">
                  {student.nama_lengkap.charAt(0)}
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">{student.nama_lengkap}</h3>
                  <div className="flex items-center gap-2 text-xs text-slate-500 font-mono mt-0.5">
                    <span>NISN: {student.nisn}</span>
                    <span>•</span>
                    <span>NIS: {student.nis}</span>
                  </div>
                </div>
              </div>
              <ZeroPillBadge status={student.status} />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 py-4 text-xs">
              <div>
                <span className="text-slate-400 block">Kelas / Rombel</span>
                <span className="font-bold text-slate-900 text-sm mt-0.5 block">Kelas {student.rombel}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Tempat, Tgl Lahir</span>
                <span className="font-semibold text-slate-800 mt-0.5 block">
                  {student.tempat_lahir || '-'}, {formatDateLongID(student.tanggal_lahir)}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Jenis Kelamin</span>
                <span className="font-semibold text-slate-800 mt-0.5 block">
                  {student.jenis_kelamin === 'L' ? 'Laki-laki' : 'Perempuan'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Nama Ayah / Ibu</span>
                <span className="font-semibold text-slate-800 mt-0.5 block">
                  {student.nama_ayah || '-'} / {student.nama_ibu || '-'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">No. HP Orang Tua / Wali</span>
                <span className="font-mono font-semibold text-slate-800 mt-0.5 block">
                  {student.no_hp_orangtua || '-'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Asal Sekolah Dasar</span>
                <span className="font-semibold text-slate-800 mt-0.5 block">
                  {student.nama_asal_sekolah || '-'}
                </span>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500">Alamat Domisili: {student.alamat || '-'}</span>
            <button
              onClick={() => onNavigate('biodata-anak')}
              className="text-blue-900 font-bold hover:underline flex items-center gap-1 shrink-0 ml-2"
            >
              <span>Detail 59 Kolom</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Right 1 Column: Verification Status Summary (Pending, Approved, Rejected, Draft) */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between space-y-4">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Status Pengajuan Perubahan</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Rekapitulasi usulan koreksi &amp; pelengkapan biodata Anda
            </p>

            <div className="mt-4 space-y-2">
              <div className="p-2.5 rounded-lg bg-amber-50/70 border border-amber-200 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Clock className="w-4 h-4 text-amber-600" />
                  <span className="text-xs font-semibold text-amber-900">Menunggu Verifikasi (Pending)</span>
                </div>
                <span className="text-base font-extrabold font-mono text-amber-900 tabular-nums">
                  {pendingCount}
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-emerald-50/70 border border-emerald-200 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-semibold text-emerald-900">Disetujui (Approved)</span>
                </div>
                <span className="text-base font-extrabold font-mono text-emerald-900 tabular-nums">
                  {approvedCount}
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-rose-50/70 border border-rose-200 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <XCircle className="w-4 h-4 text-rose-600" />
                  <span className="text-xs font-semibold text-rose-900">Ditolak (Rejected)</span>
                </div>
                <span className="text-base font-extrabold font-mono text-rose-900 tabular-nums">
                  {rejectedCount}
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Edit3 className="w-4 h-4 text-slate-600" />
                  <span className="text-xs font-semibold text-slate-800">Draft Belum Dikirim</span>
                </div>
                <span className="text-base font-extrabold font-mono text-slate-900 tabular-nums">
                  {draftCount}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={() => onNavigate('pengajuan-saya')}
            className="w-full py-2.5 px-4 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
          >
            <span>Lihat Semua Pengajuan Saya</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Riwayat Pengajuan Perubahan Biodata */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50/60">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-blue-900" />
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Riwayat Pengajuan Perubahan Biodata</h3>
              <p className="text-xs text-slate-500">
                Daftar pengajuan koreksi dan pelengkapan data beserta hasil verifikasi sekolah
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigate('perbaiki-biodata')}
              className="px-3 py-1.5 rounded-lg bg-blue-900 hover:bg-blue-800 text-white text-xs font-semibold transition-colors"
            >
              + Buat Pengajuan Baru
            </button>
            <button
              onClick={() => onNavigate('pengajuan-saya')}
              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors"
            >
              Halaman Riwayat Lengkap
            </button>
          </div>
        </div>

        {loadingProposals ? (
          <div className="p-8 text-center text-xs text-slate-400">Memuat riwayat pengajuan...</div>
        ) : proposals.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <FileText className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-xs font-semibold text-slate-700">Belum ada riwayat pengajuan perubahan biodata.</p>
            <p className="text-[11px] text-slate-500">
              Gunakan tombol &ldquo;Koreksi &amp; Lengkapi Biodata&rdquo; apabila terdapat kolom kosong atau kesalahan penulisan.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {proposals.slice(0, 5).map(prop => {
              const changedEntries = Object.entries(prop.fields_changed || {});
              return (
                <div key={prop.id} className="p-4 sm:px-5 hover:bg-slate-50/60 transition-colors space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-blue-950">
                        #{prop.id.slice(0, 8)}
                      </span>
                      <span className="text-xs text-slate-400">•</span>
                      <span className="text-xs text-slate-600">
                        Tanggal: {new Date(prop.submitted_at).toLocaleString('id-ID')}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[11px] font-bold">
                        {changedEntries.length} Kolom
                      </span>
                    </div>
                    <ZeroPillBadge status={prop.status} />
                  </div>

                  {/* Preview Changed Columns */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {changedEntries.slice(0, 3).map(([fieldKey, diff]) => (
                      <div
                        key={fieldKey}
                        className="p-2 rounded-lg bg-slate-50 border border-slate-200/80 text-[11px] space-y-0.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-700">{diff.label}</span>
                          {diff.item_status && diff.item_status !== 'pending' && (
                            <span
                              className={`text-[10px] font-bold uppercase ${
                                diff.item_status === 'approved' ? 'text-emerald-700' : 'text-rose-700'
                              }`}
                            >
                              {diff.item_status === 'approved' ? 'Disetujui' : 'Ditolak'}
                            </span>
                          )}
                        </div>
                        <div className="text-slate-400 line-through truncate">
                          Lama:{' '}
                          {isDateFieldKey(fieldKey)
                            ? formatDateLongID(diff.old_value)
                            : diff.old_value || '(Kosong)'}
                        </div>
                        <div className="text-blue-900 font-semibold truncate">
                          Baru:{' '}
                          {isDateFieldKey(fieldKey)
                            ? formatDateLongID(diff.new_value)
                            : diff.new_value}
                        </div>
                      </div>
                    ))}
                    {changedEntries.length > 3 && (
                      <div className="p-2 rounded-lg bg-slate-50 border border-slate-200/80 text-[11px] flex items-center justify-center font-semibold text-slate-500">
                        +{changedEntries.length - 3} kolom lainnya
                      </div>
                    )}
                  </div>

                  {/* Admin Decision Note if Verified */}
                  {prop.catatan_verifikator && (
                    <div className="p-2.5 rounded-lg bg-blue-50/70 border border-blue-200 text-xs text-blue-950 flex items-start gap-2">
                      <ShieldCheck className="w-4 h-4 text-blue-800 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">
                          Catatan Verifikator Sekolah ({prop.verifikator_name || 'Admin'}):{' '}
                        </span>
                        <span>{prop.catatan_verifikator}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick Navigation Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <button
          onClick={() => onNavigate('biodata-anak')}
          className="p-5 bg-white rounded-xl border border-slate-200 hover:border-blue-900/40 text-left transition-all shadow-2xs group"
        >
          <User className="w-6 h-6 text-blue-900 mb-2" />
          <h4 className="font-bold text-slate-900 text-sm group-hover:text-blue-900">
            1. Periksa Biodata Anak (59 Kolom)
          </h4>
          <p className="text-xs text-slate-500 mt-1">
            Lihat seluruh data identitas, pendidikan SD/MI, kesehatan, alamat, dan orang tua/wali.
          </p>
        </button>

        <button
          onClick={() => onNavigate('perbaiki-biodata')}
          className="p-5 bg-white rounded-xl border border-slate-200 hover:border-blue-900/40 text-left transition-all shadow-2xs group"
        >
          <Edit3 className="w-6 h-6 text-blue-900 mb-2" />
          <h4 className="font-bold text-slate-900 text-sm group-hover:text-blue-900">
            2. Usulkan Koreksi / Lengkapi Data
          </h4>
          <p className="text-xs text-slate-500 mt-1">
            Ubah beberapa kolom sekaligus, tinjau Preview Data Lama vs Data Baru, simpan Draft atau kirim ke sekolah.
          </p>
        </button>

        <button
          onClick={() => onNavigate('profil-akun')}
          className="p-5 bg-white rounded-xl border border-slate-200 hover:border-blue-900/40 text-left transition-all shadow-2xs group"
        >
          <School className="w-6 h-6 text-blue-900 mb-2" />
          <h4 className="font-bold text-slate-900 text-sm group-hover:text-blue-900">
            3. Keamanan &amp; Ganti Password
          </h4>
          <p className="text-xs text-slate-500 mt-1">
            Perbarui password akun login NISN Anda secara berkala untuk menjaga keamanan data siswa.
          </p>
        </button>
      </div>
    </div>
  );
};
