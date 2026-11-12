import React, { useState, useEffect, useMemo } from 'react';
import {
  Siswa,
  Gender,
  MutationCategory,
  OUTGOING_MUTATION_CATEGORIES
} from '../../types';
import {
  MutasiMasukPayload,
  MutasiKeluarPayload
} from '../../services/dataService';
import { CLASS_ROSTER, SCHOOL_CONFIG } from '../../config/school';
import {
  X,
  Save,
  AlertCircle,
  UserPlus,
  UserCheck,
  School,
  ShieldAlert,
  Calendar,
  FileText
} from 'lucide-react';

interface NewMutasiModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultJenis: 'masuk' | 'keluar';
  existingStudents: Siswa[];
  defaultPetugasName?: string;
  onSaveMasuk?: (payload: MutasiMasukPayload) => Promise<void>;
  onSaveKeluar?: (payload: MutasiKeluarPayload) => Promise<void>;
}

const ACADEMIC_YEAR_OPTIONS = ['2024/2025', '2025/2026', '2026/2027'];

export const NewMutasiModal: React.FC<NewMutasiModalProps> = ({
  isOpen,
  onClose,
  defaultJenis,
  existingStudents = [],
  defaultPetugasName = 'Admin Tata Usaha',
  onSaveMasuk,
  onSaveKeluar
}) => {
  // Mode Mutasi Masuk: buat siswa baru vs gunakan record siswa yang sesuai
  const [incomingMode, setIncomingMode] = useState<'new_student' | 'existing_student'>('new_student');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [studentSearch, setStudentSearch] = useState<string>('');

  // Identitas Siswa
  const [nis, setNis] = useState('');
  const [nisn, setNisn] = useState('');
  const [nikSiswa, setNikSiswa] = useState('');
  const [namaSiswa, setNamaSiswa] = useState('');
  const [jenisKelamin, setJenisKelamin] = useState<Gender>('L');
  const [tempatLahir, setTempatLahir] = useState('');
  const [tanggalLahir, setTanggalLahir] = useState('');
  const [namaWali, setNamaWali] = useState('');
  const [noHpWali, setNoHpWali] = useState('');

  // Data Kelas, Tanggal, Tahun Ajaran, Petugas
  const [kelas, setKelas] = useState('7A');
  const [tanggalMutasi, setTanggalMutasi] = useState(new Date().toISOString().slice(0, 10));
  const [tahunAjaran, setTahunAjaran] = useState(SCHOOL_CONFIG.tahun_ajaran || '2025/2026');
  const [petugasNama, setPetugasNama] = useState(defaultPetugasName);

  // Jenis Mutasi Keluar
  const [kategoriMutasi, setKategoriMutasi] = useState<MutationCategory>('Pindah sekolah');

  // Sekolah Asal / Tujuan beserta NPSN, Kecamatan, Kabupaten, Provinsi
  const [namaSekolah, setNamaSekolah] = useState('');
  const [npsnSekolah, setNpsnSekolah] = useState('');
  const [kecamatanSekolah, setKecamatanSekolah] = useState('');
  const [kabupatenSekolah, setKabupatenSekolah] = useState('');
  const [provinsiSekolah, setProvinsiSekolah] = useState('');

  // Alasan, Nomor Surat, Keterangan
  const [alasan, setAlasan] = useState('');
  const [noSurat, setNoSurat] = useState('');
  const [keterangan, setKeterangan] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setIncomingMode('new_student');
      setSelectedStudentId('');
      setStudentSearch('');
      setNis('');
      setNisn('');
      setNikSiswa('');
      setNamaSiswa('');
      setJenisKelamin('L');
      setTempatLahir('');
      setTanggalLahir('');
      setNamaWali('');
      setNoHpWali('');
      setKelas('7A');
      setTanggalMutasi(new Date().toISOString().slice(0, 10));
      setTahunAjaran(SCHOOL_CONFIG.tahun_ajaran || '2025/2026');
      setPetugasNama(defaultPetugasName);
      setKategoriMutasi('Pindah sekolah');
      setNamaSekolah('');
      setNpsnSekolah('');
      setKecamatanSekolah('');
      setKabupatenSekolah('');
      setProvinsiSekolah('');
      setAlasan('');
      setNoSurat('');
      setKeterangan('');
      setError(null);
    }
  }, [isOpen, defaultJenis, defaultPetugasName]);

  // Daftar siswa aktif untuk Mutasi Keluar
  const activeStudents = useMemo(
    () => existingStudents.filter(s => s.status === 'aktif' || s.status === 'mutasi_masuk'),
    [existingStudents]
  );

  // Filter siswa berdasarkan pencarian di dropdown
  const filteredCandidateStudents = useMemo(() => {
    const pool = defaultJenis === 'keluar' ? activeStudents : existingStudents;
    if (!studentSearch.trim()) return pool;
    const q = studentSearch.toLowerCase().trim();
    return pool.filter(
      s =>
        s.nama_lengkap.toLowerCase().includes(q) ||
        (s.nis && s.nis.toLowerCase().includes(q)) ||
        (s.nisn && s.nisn.toLowerCase().includes(q)) ||
        (s.rombel && s.rombel.toLowerCase().includes(q))
    );
  }, [defaultJenis, activeStudents, existingStudents, studentSearch]);

  // Deteksi duplikasi identitas secara real-time untuk Mutasi Masuk (Siswa Baru)
  const duplicateWarning = useMemo(() => {
    if (defaultJenis !== 'masuk') return null;
    const cleanNis = nis.trim();
    const cleanNisn = nisn.trim();
    const cleanNik = nikSiswa.trim();

    for (const st of existingStudents) {
      if (incomingMode === 'existing_student' && st.id === selectedStudentId) continue;
      if (cleanNis && st.nis === cleanNis) {
        return `NIS "${cleanNis}" sudah terdaftar atas nama ${st.nama_lengkap} (Kelas ${st.rombel}). Gunakan mode "Gunakan Record Siswa yang Sesuai" atau periksa kembali NIS.`;
      }
      if (cleanNisn && cleanNisn !== '0000000000' && st.nisn === cleanNisn) {
        return `NISN "${cleanNisn}" sudah terdaftar atas nama ${st.nama_lengkap} (Kelas ${st.rombel}).`;
      }
      if (cleanNik && cleanNik !== '-' && st.nik_siswa === cleanNik) {
        return `NIK Siswa "${cleanNik}" sudah terdaftar atas nama ${st.nama_lengkap}.`;
      }
    }
    return null;
  }, [defaultJenis, incomingMode, selectedStudentId, nis, nisn, nikSiswa, existingStudents]);

  if (!isOpen) return null;

  const handleSelectStudent = (studentId: string) => {
    setSelectedStudentId(studentId);
    const st = existingStudents.find(s => s.id === studentId);
    if (st) {
      setNis(st.nis || '');
      setNisn(st.nisn || '');
      setNikSiswa(st.nik_siswa || '');
      setNamaSiswa(st.nama_lengkap || '');
      setJenisKelamin(st.jenis_kelamin || 'L');
      setTempatLahir(st.tempat_lahir || '');
      setTanggalLahir(st.tanggal_lahir || '');
      setNamaWali(st.nama_wali || st.nama_ayah || st.nama_ibu || '');
      setNoHpWali(st.no_hp_orangtua || st.no_wa_ayah || st.no_wa_ibu || '');
      setKelas(st.rombel || '7A');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (defaultJenis === 'masuk') {
      if (incomingMode === 'existing_student' && !selectedStudentId) {
        setError('Silakan pilih record siswa yang sesuai terlebih dahulu.');
        return;
      }
      if (duplicateWarning) {
        setError(duplicateWarning);
        return;
      }
      if (!nis.trim()) {
        setError('NIS siswa wajib diisi.');
        return;
      }
      if (!nisn.trim() || !/^\d{10}$/.test(nisn.trim())) {
        setError('NISN wajib diisi 10 digit angka.');
        return;
      }
      if (!namaSiswa.trim()) {
        setError('Nama Lengkap Siswa wajib diisi.');
        return;
      }
      if (!namaSekolah.trim()) {
        setError('Nama Asal Sekolah wajib diisi.');
        return;
      }
      if (!alasan.trim()) {
        setError('Alasan mutasi masuk wajib diisi.');
        return;
      }

      if (!onSaveMasuk) return;
      setIsSubmitting(true);
      try {
        await onSaveMasuk({
          mode: incomingMode,
          existing_student_id: incomingMode === 'existing_student' ? selectedStudentId : undefined,
          nis: nis.trim(),
          nisn: nisn.trim(),
          nik_siswa: nikSiswa.trim() || undefined,
          nama_siswa: namaSiswa.trim(),
          jenis_kelamin: jenisKelamin,
          tempat_lahir: tempatLahir.trim() || '-',
          tanggal_lahir: tanggalLahir || '',
          nama_wali: namaWali.trim() || undefined,
          no_hp_wali: noHpWali.trim() || undefined,
          sekolah_asal: namaSekolah.trim(),
          npsn_asal: npsnSekolah.trim() || undefined,
          kecamatan_asal: kecamatanSekolah.trim() || undefined,
          kabupaten_asal: kabupatenSekolah.trim() || undefined,
          provinsi_asal: provinsiSekolah.trim() || undefined,
          kelas_tujuan: kelas,
          tanggal_masuk: tanggalMutasi,
          tahun_ajaran: tahunAjaran,
          alasan: alasan.trim(),
          no_surat: noSurat.trim() || undefined,
          keterangan: keterangan.trim() || undefined,
          petugas_nama: petugasNama.trim() || defaultPetugasName
        });
        onClose();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Gagal menyimpan transaksi mutasi masuk.');
      } finally {
        setIsSubmitting(false);
      }
    } else {
      // MUTASI KELUAR
      if (!selectedStudentId) {
        setError('Silakan pilih siswa aktif yang akan dimutasikan keluar.');
        return;
      }
      if (!alasan.trim()) {
        setError('Alasan mutasi keluar wajib diisi.');
        return;
      }
      if (kategoriMutasi === 'Pindah sekolah' && !namaSekolah.trim()) {
        setError('Nama Sekolah Tujuan wajib diisi untuk jenis mutasi Pindah Sekolah.');
        return;
      }

      if (!onSaveKeluar) return;
      setIsSubmitting(true);
      try {
        await onSaveKeluar({
          student_id: selectedStudentId,
          tanggal_keluar: tanggalMutasi,
          kelas_terakhir: kelas,
          kategori_mutasi: kategoriMutasi,
          alasan: alasan.trim(),
          sekolah_tujuan: namaSekolah.trim() || undefined,
          npsn_tujuan: npsnSekolah.trim() || undefined,
          kecamatan_tujuan: kecamatanSekolah.trim() || undefined,
          kabupaten_tujuan: kabupatenSekolah.trim() || undefined,
          provinsi_tujuan: provinsiSekolah.trim() || undefined,
          tahun_ajaran: tahunAjaran,
          no_surat: noSurat.trim() || undefined,
          keterangan: keterangan.trim() || undefined,
          petugas_nama: petugasNama.trim() || defaultPetugasName
        });
        onClose();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Gagal menyimpan transaksi mutasi keluar.');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-8 max-h-[90vh]">
        {/* Header */}
        <div
          className={`px-6 py-4 text-white flex items-center justify-between ${
            defaultJenis === 'masuk' ? 'bg-blue-950' : 'bg-slate-900'
          }`}
        >
          <div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-blue-300">
              TRANSAKSI BUKU INDUK &amp; RIWAYAT KELAS
            </span>
            <h3 className="font-bold text-base mt-0.5">
              {defaultJenis === 'masuk'
                ? 'Formulir Pencatatan Mutasi Masuk Siswa'
                : 'Formulir Pencatatan Mutasi Keluar Siswa'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 text-xs">
          {error && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span className="font-medium leading-relaxed">{error}</span>
            </div>
          )}

          {/* ================================================================= */}
          {/* BAGIAN 1: PILIH MODE (MUTASI MASUK) ATAU PILIH SISWA AKTIF (KELUAR) */}
          {/* ================================================================= */}
          {defaultJenis === 'masuk' ? (
            <div className="space-y-3">
              <label className="block font-bold uppercase tracking-wider text-slate-500 text-[11px]">
                1. Metode Pencatatan Biodata Siswa Mutasi Masuk
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIncomingMode('new_student');
                    setSelectedStudentId('');
                  }}
                  className={`p-3.5 rounded-xl border text-left transition-all flex items-start gap-3 ${
                    incomingMode === 'new_student'
                      ? 'bg-blue-50/80 border-blue-900 text-blue-950 shadow-2xs'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <UserPlus className="w-4 h-4 text-blue-900 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">Buat Biodata Siswa Baru</div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Otomatis membuat record baru di tabel <strong>students</strong> dan mencatat riwayat kelas.
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setIncomingMode('existing_student')}
                  className={`p-3.5 rounded-xl border text-left transition-all flex items-start gap-3 ${
                    incomingMode === 'existing_student'
                      ? 'bg-blue-50/80 border-blue-900 text-blue-950 shadow-2xs'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <UserCheck className="w-4 h-4 text-blue-900 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">Gunakan Record Siswa yang Sesuai</div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Menautkan mutasi masuk ke record siswa yang sudah ada tanpa membuat duplikasi.
                    </p>
                  </div>
                </button>
              </div>

              {incomingMode === 'existing_student' && (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <label className="block font-bold text-slate-800">
                    Cari &amp; Pilih Record Siswa di Database *
                  </label>
                  <input
                    type="text"
                    value={studentSearch}
                    onChange={e => setStudentSearch(e.target.value)}
                    placeholder="Ketik nama, NIS, atau NISN untuk menyaring daftar..."
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg"
                  />
                  <select
                    value={selectedStudentId}
                    onChange={e => handleSelectStudent(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-semibold text-slate-900"
                  >
                    <option value="">
                      -- Pilih Record Siswa ({filteredCandidateStudents.length} ditemukan) --
                    </option>
                    {filteredCandidateStudents.map(s => (
                      <option key={s.id} value={s.id}>
                        [{s.rombel}] NIS: {s.nis} · NISN: {s.nisn} — {s.nama_lengkap} (Status: {s.status})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200 space-y-3">
              <div className="flex items-center justify-between">
                <label className="font-bold text-amber-950">
                  1. Pilih Siswa Aktif yang Akan Mutasi Keluar *
                </label>
                <span className="text-[11px] font-semibold text-amber-800">
                  {activeStudents.length} Siswa Aktif Tersedia
                </span>
              </div>
              <input
                type="text"
                value={studentSearch}
                onChange={e => setStudentSearch(e.target.value)}
                placeholder="Ketik nama siswa, NIS, NISN, atau kelas untuk mencari cepat..."
                className="w-full px-3 py-1.5 bg-white border border-amber-300 rounded-lg text-slate-900"
              />
              <select
                required
                value={selectedStudentId}
                onChange={e => handleSelectStudent(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-amber-300 rounded-lg font-bold text-slate-900"
              >
                <option value="">
                  -- Pilih Siswa Aktif ({filteredCandidateStudents.length} siswa) --
                </option>
                {filteredCandidateStudents.map(s => (
                  <option key={s.id} value={s.id}>
                    [Kelas {s.rombel}] NIS: {s.nis} · NISN: {s.nisn} — {s.nama_lengkap}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-amber-900">
                Setelah transaksi dikonfirmasi, status siswa akan diubah menjadi nonaktif (
                <strong>mutasi_keluar / lulus / non_aktif</strong>) <strong>tanpa menghapus biodata</strong> dari Buku Induk.
              </p>
            </div>
          )}

          {/* Peringatan Duplikasi Identitas */}
          {duplicateWarning && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <strong className="block">Pencegahan Duplikasi Identitas:</strong>
                <span>{duplicateWarning}</span>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* BAGIAN 2: IDENTITAS SISWA                                         */}
          {/* ================================================================= */}
          <div className="p-4 rounded-xl border border-slate-200 space-y-3">
            <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] border-b border-slate-100 pb-2">
              2. Identitas Siswa
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">NIS *</label>
                <input
                  type="text"
                  required
                  readOnly={defaultJenis === 'keluar'}
                  value={nis}
                  onChange={e => setNis(e.target.value)}
                  placeholder="Contoh: 252607055"
                  className={`w-full px-3 py-2 border border-slate-300 rounded-lg font-mono ${
                    defaultJenis === 'keluar' ? 'bg-slate-100 text-slate-600' : 'bg-white'
                  }`}
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  NISN (10 Digit) *
                </label>
                <input
                  type="text"
                  required
                  maxLength={10}
                  readOnly={defaultJenis === 'keluar'}
                  value={nisn}
                  onChange={e => setNisn(e.target.value.replace(/\D/g, ''))}
                  placeholder="0123456789"
                  className={`w-full px-3 py-2 border border-slate-300 rounded-lg font-mono ${
                    defaultJenis === 'keluar' ? 'bg-slate-100 text-slate-600' : 'bg-white'
                  }`}
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  NIK Siswa (16 Digit)
                </label>
                <input
                  type="text"
                  maxLength={16}
                  readOnly={defaultJenis === 'keluar'}
                  value={nikSiswa}
                  onChange={e => setNikSiswa(e.target.value.replace(/\D/g, ''))}
                  placeholder="3171..."
                  className={`w-full px-3 py-2 border border-slate-300 rounded-lg font-mono ${
                    defaultJenis === 'keluar' ? 'bg-slate-100 text-slate-600' : 'bg-white'
                  }`}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-slate-700 font-semibold mb-1">
                  Nama Lengkap Siswa *
                </label>
                <input
                  type="text"
                  required
                  readOnly={defaultJenis === 'keluar'}
                  value={namaSiswa}
                  onChange={e => setNamaSiswa(e.target.value)}
                  placeholder="Nama lengkap sesuai Ijazah / Akta"
                  className={`w-full px-3 py-2 border border-slate-300 rounded-lg font-semibold ${
                    defaultJenis === 'keluar' ? 'bg-slate-100 text-slate-600' : 'bg-white'
                  }`}
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Jenis Kelamin</label>
                <select
                  disabled={defaultJenis === 'keluar'}
                  value={jenisKelamin}
                  onChange={e => setJenisKelamin(e.target.value as Gender)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="L">Laki-laki (L)</option>
                  <option value="P">Perempuan (P)</option>
                </select>
              </div>
            </div>

            {defaultJenis === 'masuk' && (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-1">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Tempat Lahir</label>
                  <input
                    type="text"
                    value={tempatLahir}
                    onChange={e => setTempatLahir(e.target.value)}
                    placeholder="Kota kelahiran"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Tanggal Lahir</label>
                  <input
                    type="date"
                    value={tanggalLahir}
                    onChange={e => setTanggalLahir(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Nama Orang Tua / Wali
                  </label>
                  <input
                    type="text"
                    value={namaWali}
                    onChange={e => setNamaWali(e.target.value)}
                    placeholder="Nama Ayah/Ibu/Wali"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    No HP / WA Wali
                  </label>
                  <input
                    type="text"
                    value={noHpWali}
                    onChange={e => setNoHpWali(e.target.value)}
                    placeholder="0812..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>
            )}
          </div>

          {/* ================================================================= */}
          {/* BAGIAN 3: DATA SEKOLAH ASAL (MASUK) / SEKOLAH TUJUAN (KELUAR)     */}
          {/* ================================================================= */}
          <div className="p-4 rounded-xl border border-slate-200 space-y-3">
            <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] border-b border-slate-100 pb-2 flex items-center gap-1.5">
              <School className="w-3.5 h-3.5 text-blue-900" />
              <span>
                {defaultJenis === 'masuk'
                  ? '3. Data Sekolah Asal (Nama, NPSN, Kecamatan, Kabupaten/Kota, Provinsi)'
                  : '3. Jenis Mutasi & Sekolah Tujuan (Nama, NPSN, Kecamatan, Kabupaten/Kota, Provinsi)'}
              </span>
            </h4>

            {defaultJenis === 'keluar' && (
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Jenis / Kategori Mutasi Keluar *
                </label>
                <select
                  value={kategoriMutasi}
                  onChange={e => setKategoriMutasi(e.target.value as MutationCategory)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-bold text-blue-950 bg-blue-50/40"
                >
                  {OUTGOING_MUTATION_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-slate-700 font-semibold mb-1">
                  {defaultJenis === 'masuk'
                    ? 'Nama Sekolah Asal *'
                    : `Nama Sekolah Tujuan ${kategoriMutasi === 'Pindah sekolah' ? '*' : '(Opsional)'}`}
                </label>
                <input
                  type="text"
                  required={defaultJenis === 'masuk' || kategoriMutasi === 'Pindah sekolah'}
                  value={namaSekolah}
                  onChange={e => setNamaSekolah(e.target.value)}
                  placeholder={
                    defaultJenis === 'masuk'
                      ? 'Contoh: SMP Negeri 2 Bandung'
                      : 'Contoh: SMP Negeri 1 Surabaya'
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  NPSN {defaultJenis === 'masuk' ? 'Sekolah Asal' : 'Sekolah Tujuan'}
                </label>
                <input
                  type="text"
                  maxLength={10}
                  value={npsnSekolah}
                  onChange={e => setNpsnSekolah(e.target.value.replace(/\D/g, ''))}
                  placeholder="8 digit NPSN"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Kecamatan {defaultJenis === 'masuk' ? 'Asal' : 'Tujuan'}
                </label>
                <input
                  type="text"
                  value={kecamatanSekolah}
                  onChange={e => setKecamatanSekolah(e.target.value)}
                  placeholder="Nama kecamatan..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Kabupaten / Kota {defaultJenis === 'masuk' ? 'Asal' : 'Tujuan'}
                </label>
                <input
                  type="text"
                  value={kabupatenSekolah}
                  onChange={e => setKabupatenSekolah(e.target.value)}
                  placeholder="Nama kabupaten/kota..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Provinsi {defaultJenis === 'masuk' ? 'Asal' : 'Tujuan'}
                </label>
                <input
                  type="text"
                  value={provinsiSekolah}
                  onChange={e => setProvinsiSekolah(e.target.value)}
                  placeholder="Nama provinsi..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            </div>
          </div>

          {/* ================================================================= */}
          {/* BAGIAN 4: PENEMPATAN KELAS, TANGGAL, TAHUN AJARAN, ALASAN & PETUGAS */}
          {/* ================================================================= */}
          <div className="p-4 rounded-xl border border-slate-200 space-y-3">
            <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] border-b border-slate-100 pb-2 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-blue-900" />
              <span>
                4. Kelas, Tanggal, Tahun Ajaran, Alasan &amp; Petugas Administrasi
              </span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  {defaultJenis === 'masuk' ? 'Kelas Tujuan *' : 'Kelas Terakhir *'}
                </label>
                <select
                  value={kelas}
                  onChange={e => setKelas(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-bold bg-white"
                >
                  {CLASS_ROSTER.map(r => (
                    <option key={r} value={r}>
                      Kelas {r}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  {defaultJenis === 'masuk' ? 'Tanggal Masuk *' : 'Tanggal Keluar *'}
                </label>
                <input
                  type="date"
                  required
                  value={tanggalMutasi}
                  onChange={e => setTanggalMutasi(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Tahun Ajaran *</label>
                <select
                  value={tahunAjaran}
                  onChange={e => setTahunAjaran(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono bg-white"
                >
                  {ACADEMIC_YEAR_OPTIONS.map(ta => (
                    <option key={ta} value={ta}>
                      {ta}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Petugas Pencatat *
                </label>
                <input
                  type="text"
                  required
                  value={petugasNama}
                  onChange={e => setPetugasNama(e.target.value)}
                  placeholder="Nama petugas TU..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-medium"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Alasan {defaultJenis === 'masuk' ? 'Mutasi Masuk' : 'Mutasi Keluar'} *
                </label>
                <textarea
                  rows={2}
                  required
                  value={alasan}
                  onChange={e => setAlasan(e.target.value)}
                  placeholder={
                    defaultJenis === 'masuk'
                      ? 'Contoh: Mengikuti kepindahan tugas orang tua ke Jakarta...'
                      : 'Contoh: Pindah domisili mengikuti orang tua / Lulus pendidikan...'
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="space-y-2">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1 flex items-center gap-1">
                    <FileText className="w-3 h-3 text-slate-400" />
                    <span>Nomor Surat Keterangan Mutasi</span>
                  </label>
                  <input
                    type="text"
                    value={noSurat}
                    onChange={e => setNoSurat(e.target.value)}
                    placeholder="Contoh: 421.3/108/SMP-BTI/2025"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Keterangan Tambahan
                  </label>
                  <input
                    type="text"
                    value={keterangan}
                    onChange={e => setKeterangan(e.target.value)}
                    placeholder="Catatan kelengkapan berkas dapodik / rapor..."
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-semibold"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting || Boolean(duplicateWarning)}
              className={`px-5 py-2.5 text-white rounded-lg font-bold flex items-center gap-2 shadow-xs disabled:opacity-50 ${
                defaultJenis === 'masuk'
                  ? 'bg-blue-900 hover:bg-blue-800'
                  : 'bg-amber-800 hover:bg-amber-900'
              }`}
            >
              <Save className="w-4 h-4" />
              <span>
                {isSubmitting
                  ? 'Memproses Transaksi...'
                  : defaultJenis === 'masuk'
                  ? 'Konfirmasi & Simpan Mutasi Masuk'
                  : 'Konfirmasi & Nonaktifkan Siswa (Mutasi Keluar)'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
