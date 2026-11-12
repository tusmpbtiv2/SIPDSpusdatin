import React, { useState } from 'react';
import { Siswa, INCOME_RANGE_OPTIONS } from '../types';
import { createSiswa } from '../services/dataService';
import { generateBiodataF4Pdf } from '../services/pdfService';
import { SchoolLogo } from '../components/common/SchoolLogo';
import { PrintBiodataF4Modal } from '../components/common/PrintBiodataF4Modal';
import { SCHOOL_CONFIG } from '../config/school';
import {
  ArrowLeft,
  UserPlus,
  User,
  HeartPulse,
  MapPin,
  School,
  Users,
  CheckCircle2,
  Printer,
  Download,
  ChevronRight,
  ChevronLeft,
  AlertCircle
} from 'lucide-react';

interface PendaftaranMuridBaruPageProps {
  onBack: () => void;
  onSelectAdminLogin: () => void;
  onSelectParentLogin: () => void;
}

type StepKey = 'identitas' | 'fisik' | 'alamat' | 'sekolah_asal' | 'orang_tua';

export const PendaftaranMuridBaruPage: React.FC<PendaftaranMuridBaruPageProps> = ({
  onBack,
  onSelectAdminLogin,
  onSelectParentLogin
}) => {
  const [activeStep, setActiveStep] = useState<StepKey>('identitas');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registeredStudent, setRegisteredStudent] = useState<Siswa | null>(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  const [formData, setFormData] = useState({
    rombel: '7A',
    nis: `262707${Math.floor(100 + Math.random() * 899)}`,
    id_yys: `YYS-2026-${Math.floor(100 + Math.random() * 899)}`,
    kamar: 'Reguler (Non-Asrama)',
    nama_lengkap: '',
    no_kk: '',
    nik_siswa: '',
    nisn: '',
    no_ijazah_sd: '-',
    tgl_ijazah_sd: '-',
    jenis_kelamin: 'L' as 'L' | 'P',
    tempat_lahir: '',
    tanggal_lahir: '',
    agama: 'Islam',
    berat_badan: '',
    tinggi_badan: '',
    riwayat_penyakit: 'Tidak Ada',
    status_anak: 'Anak Kandung',
    kewarganegaraan: 'WNI',
    anak_ke: '1',
    jml_saudara_kandung: '0',
    jml_saudara_tiri: '0',
    jalan_dusun: '',
    rt_rw: '',
    kelurahan: '',
    kecamatan: '',
    kode_pos: '',
    kab_kota: '',
    provinsi: '',
    alamat: '',
    jenjang_asal: 'SD',
    nama_asal_sekolah: '',
    npsn_asal_sekolah: '',
    kecamatan_asal_sekolah: '',
    kabupaten_asal_sekolah: '',
    provinsi_asal_sekolah: '',
    nama_ayah: '',
    nik_ayah: '',
    tempat_lahir_ayah: '',
    tgl_lahir_ayah: '',
    pendidikan_ayah: 'SMA/Sederajat',
    pekerjaan_ayah: '',
    no_wa_ayah: '',
    penghasilan_ayah: '',
    nama_ibu: '',
    nik_ibu: '',
    tempat_lahir_ibu: '',
    tgl_lahir_ibu: '',
    pendidikan_ibu: 'SMA/Sederajat',
    pekerjaan_ibu: '',
    no_wa_ibu: '',
    penghasilan_ibu: '',
    nama_wali: '-',
    nik_wali: '-',
    pekerjaan_wali: '-',
    penghasilan_wali: '-',
    no_hp_orangtua: '',
    status: 'aktif' as Siswa['status'],
    tanggal_masuk: new Date().toISOString().slice(0, 10),
    tingkat_kelas: '7' as Siswa['tingkat_kelas'],
    tahun_ajaran: SCHOOL_CONFIG.tahun_ajaran,
    tahun_masuk: '2026',
    angkatan: '2026',
    email_orangtua: ''
  });

  const steps: { id: StepKey; label: string; shortLabel: string; icon: React.ReactNode }[] = [
    { id: 'identitas', label: '1. Identitas Calon Siswa', shortLabel: '1. Identitas', icon: <User className="w-4 h-4" /> },
    { id: 'fisik', label: '2. Fisik & Keluarga', shortLabel: '2. Fisik', icon: <HeartPulse className="w-4 h-4" /> },
    { id: 'alamat', label: '3. Alamat & Domisili', shortLabel: '3. Alamat', icon: <MapPin className="w-4 h-4" /> },
    { id: 'sekolah_asal', label: '4. Sekolah Asal (SD/MI)', shortLabel: '4. SD/MI', icon: <School className="w-4 h-4" /> },
    { id: 'orang_tua', label: '5. Orang Tua & Wali', shortLabel: '5. Orang Tua', icon: <Users className="w-4 h-4" /> }
  ];

  const currentStepIndex = steps.findIndex(s => s.id === activeStep);

  const handleChange = (field: keyof typeof formData, val: string) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: val };
      if (['jalan_dusun', 'rt_rw', 'kelurahan', 'kecamatan', 'kab_kota', 'provinsi', 'kode_pos'].includes(field)) {
        const parts = [
          updated.jalan_dusun,
          updated.rt_rw ? `RT/RW ${updated.rt_rw}` : '',
          updated.kelurahan ? `Kel. ${updated.kelurahan}` : '',
          updated.kecamatan ? `Kec. ${updated.kecamatan}` : '',
          updated.kab_kota,
          updated.provinsi,
          updated.kode_pos
        ].filter(Boolean);
        if (parts.length > 0) {
          updated.alamat = parts.join(', ');
        }
      }
      return updated;
    });
  };

  const handleNextStep = () => {
    setError(null);
    if (activeStep === 'identitas') {
      const cleanNisn = formData.nisn.trim().replace(/\D/g, '');
      if (cleanNisn.length !== 10) {
        setError('NISN wajib terdiri dari 10 digit angka.');
        return;
      }
      if (!formData.nama_lengkap.trim() || !formData.tempat_lahir.trim() || !formData.tanggal_lahir) {
        setError('Nama Lengkap, Tempat Lahir, dan Tanggal Lahir wajib diisi.');
        return;
      }
    }
    if (currentStepIndex < steps.length - 1) {
      setActiveStep(steps[currentStepIndex + 1].id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handlePrevStep = () => {
    setError(null);
    if (currentStepIndex > 0) {
      setActiveStep(steps[currentStepIndex - 1].id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanNisn = formData.nisn.trim().replace(/\D/g, '');
    if (cleanNisn.length !== 10) {
      setError('NISN wajib terdiri dari 10 digit angka.');
      setActiveStep('identitas');
      return;
    }

    if (!formData.nama_lengkap.trim()) {
      setError('Nama lengkap calon siswa wajib diisi.');
      setActiveStep('identitas');
      return;
    }

    if (!formData.nama_ayah.trim() || !formData.nama_ibu.trim()) {
      setError('Nama Ayah dan Nama Ibu Kandung wajib diisi.');
      setActiveStep('orang_tua');
      return;
    }

    setSubmitting(true);
    try {
      const created = await createSiswa(
        {
          ...formData,
          nisn: cleanNisn,
          no_hp_orangtua: formData.no_hp_orangtua || formData.no_wa_ayah || formData.no_wa_ibu || '-'
        },
        {
          id: 'ppdb-online',
          name: `Pendaftar PPDB (${formData.nama_lengkap})`,
          role: 'pendaftar_baru'
        }
      );
      setRegisteredStudent(created);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal mengirim pendaftaran murid baru.');
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'w-full px-3.5 py-2.5 text-sm sm:text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-800/20 focus:border-blue-800 text-slate-900';

  if (registeredStudent) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-between text-slate-900">
        <header className="bg-[#0F2942] text-white border-b border-slate-800 sticky top-0 z-30">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <SchoolLogo size={36} lightText={true} />
              <div>
                <div className="text-xs sm:text-sm font-extrabold text-white">PPDB SMP BHINNEKA TUNGGAL IKA</div>
                <div className="text-[10px] text-blue-200">Bukti Pendaftaran Murid Baru</div>
              </div>
            </div>
            <button
              onClick={onBack}
              className="px-3 py-2 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
            >
              Ke Halaman Utama
            </button>
          </div>
        </header>

        <main className="flex-1 max-w-3xl w-full mx-auto p-4 sm:p-6 my-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-5 sm:p-8 space-y-6">
            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mb-3">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                Pendaftaran Berhasil Tersimpan
              </span>
              <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-1">
                Selamat! Data Calon Siswa Telah Terdaftar
              </h2>
              <p className="text-xs text-slate-600 mt-1 max-w-lg leading-relaxed">
                Data pendaftaran <strong>{registeredStudent.nama_lengkap}</strong> telah masuk ke dalam database Sistem Informasi Pengelolaan Data Siswa (SIPDS) SMP Bhinneka Tunggal Ika.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs">
              <div>
                <span className="text-slate-400 block">Nama Lengkap Calon Siswa:</span>
                <span className="font-bold text-slate-900 text-sm">{registeredStudent.nama_lengkap}</span>
              </div>
              <div>
                <span className="text-slate-400 block">NISN:</span>
                <span className="font-mono font-bold text-blue-900 text-sm">{registeredStudent.nisn}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Nomor Induk Sementara / ID Yayasan:</span>
                <span className="font-mono font-semibold text-slate-800">
                  {registeredStudent.nis} / {registeredStudent.id_yys}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Asal Sekolah (SD/MI):</span>
                <span className="font-semibold text-slate-800">
                  {registeredStudent.jenjang_asal} - {registeredStudent.nama_asal_sekolah || '-'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">No. Ijazah SD/MI & Tgl Terbit:</span>
                <span className="font-mono text-slate-800">
                  {registeredStudent.no_ijazah_sd || '-'} ({registeredStudent.tgl_ijazah_sd || '-'})
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Penempatan Kelas Awal & Kamar:</span>
                <span className="font-semibold text-slate-800">
                  Kelas {registeredStudent.rombel} · {registeredStudent.kamar}
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setIsPrintModalOpen(true)}
                className="py-3 px-5 bg-[#0F2942] hover:bg-blue-950 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-md transition-colors"
              >
                <Printer className="w-4 h-4" />
                <span>Pratinjau & Cetak Biodata PDF (Ukuran F4)</span>
              </button>

              <button
                onClick={() => generateBiodataF4Pdf([registeredStudent])}
                className="py-3 px-5 bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-md transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Unduh Langsung PDF F4</span>
              </button>
            </div>

            <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <button
                onClick={() => {
                  setRegisteredStudent(null);
                  setActiveStep('identitas');
                }}
                className="text-blue-900 hover:underline font-semibold"
              >
                + Daftarkan Calon Siswa Lainnya
              </button>
              <button
                onClick={onSelectParentLogin}
                className="text-slate-600 hover:text-slate-900 font-semibold"
              >
                Masuk ke Portal Login Orang Tua →
              </button>
            </div>
          </div>
        </main>

        <PrintBiodataF4Modal
          isOpen={isPrintModalOpen}
          students={[registeredStudent]}
          onClose={() => setIsPrintModalOpen(false)}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-between text-slate-900">
      {/* Top Bar */}
      <header className="bg-[#0F2942] text-white sticky top-0 z-30 border-b border-slate-800 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={onBack}
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 transition-colors shrink-0"
              aria-label="Kembali"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <SchoolLogo size={34} showText={false} />
            <div className="truncate">
              <h1 className="text-xs sm:text-sm font-extrabold text-white truncate">
                FORMULIR PENDAFTARAN MURID BARU (PPDB)
              </h1>
              <p className="text-[10px] text-blue-200 truncate">
                {SCHOOL_CONFIG.nama_sekolah} · Tahun Ajaran {SCHOOL_CONFIG.tahun_ajaran}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={onSelectParentLogin}
              className="px-2.5 py-1.5 text-[11px] font-semibold bg-blue-900/60 hover:bg-blue-800 text-blue-100 border border-blue-700 rounded-lg transition-colors"
            >
              Login Ortu
            </button>
            <button
              onClick={onSelectAdminLogin}
              className="hidden sm:inline-flex px-2.5 py-1.5 text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors"
            >
              Login Admin
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-3 sm:p-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-md overflow-hidden">
          {/* Step Progress Bar (Mobile Scrollable) */}
          <div className="bg-slate-50 border-b border-slate-200 px-3 sm:px-6 py-3 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {steps.map((step, idx) => {
              const isActive = activeStep === step.id;
              const isPassed = idx < currentStepIndex;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => setActiveStep(step.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all shrink-0 ${
                    isActive
                      ? 'bg-[#0F2942] text-white shadow-xs'
                      : isPassed
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {step.icon}
                  <span className="hidden sm:inline">{step.label}</span>
                  <span className="sm:hidden">{step.shortLabel}</span>
                </button>
              );
            })}
          </div>

          {error && (
            <div className="mx-4 sm:mx-6 mt-4 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-6 text-xs">
            {/* STEP 1: IDENTITAS CALON SISWA */}
            {activeStep === 'identitas' && (
              <div className="space-y-4">
                <div className="border-b border-slate-100 pb-2">
                  <h2 className="text-sm font-bold text-slate-900">Bagian 1: Identitas Calon Siswa Baru</h2>
                  <p className="text-[11px] text-slate-500">
                    Isi identitas sesuai Kartu Keluarga (KK) dan Akta Kelahiran calon siswa.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block font-semibold text-slate-700 mb-1">Nama Lengkap Siswa *</label>
                    <input
                      type="text"
                      required
                      value={formData.nama_lengkap}
                      onChange={e => handleChange('nama_lengkap', e.target.value)}
                      placeholder="Sesuai Akta Kelahiran / Ijazah"
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">NISN (10 Digit) *</label>
                    <input
                      type="text"
                      required
                      maxLength={10}
                      value={formData.nisn}
                      onChange={e => handleChange('nisn', e.target.value.replace(/\D/g, ''))}
                      placeholder="Contoh: 0081234567"
                      className={`${inputClass} font-mono`}
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">NIK Siswa (16 Digit)</label>
                    <input
                      type="text"
                      maxLength={16}
                      value={formData.nik_siswa}
                      onChange={e => handleChange('nik_siswa', e.target.value.replace(/\D/g, ''))}
                      placeholder="16 digit NIK Anak"
                      className={`${inputClass} font-mono`}
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Nomor KK (16 Digit)</label>
                    <input
                      type="text"
                      maxLength={16}
                      value={formData.no_kk}
                      onChange={e => handleChange('no_kk', e.target.value.replace(/\D/g, ''))}
                      placeholder="16 digit Nomor KK"
                      className={`${inputClass} font-mono`}
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Jenis Kelamin *</label>
                    <select
                      value={formData.jenis_kelamin}
                      onChange={e => handleChange('jenis_kelamin', e.target.value)}
                      className={inputClass}
                    >
                      <option value="L">Laki-laki (L)</option>
                      <option value="P">Perempuan (P)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Tempat Lahir *</label>
                    <input
                      type="text"
                      required
                      value={formData.tempat_lahir}
                      onChange={e => handleChange('tempat_lahir', e.target.value)}
                      placeholder="Kota/Kabupaten Kelahiran"
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Tanggal Lahir *</label>
                    <input
                      type="date"
                      required
                      value={formData.tanggal_lahir}
                      onChange={e => handleChange('tanggal_lahir', e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Agama</label>
                    <select
                      value={formData.agama}
                      onChange={e => handleChange('agama', e.target.value)}
                      className={inputClass}
                    >
                      <option value="Islam">Islam</option>
                      <option value="Kristen">Kristen</option>
                      <option value="Katolik">Katolik</option>
                      <option value="Hindu">Hindu</option>
                      <option value="Buddha">Buddha</option>
                      <option value="Konghucu">Konghucu</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Pilihan Kelas (Rombel)</label>
                    <select
                      value={formData.rombel}
                      onChange={e => handleChange('rombel', e.target.value)}
                      className={inputClass}
                    >
                      {['7A', '7B', '7C', '7D', '7E', '7F', '7G', '7H', '7I', '7J', '7K', '7L', '7M', '7N', '7O'].map(kls => (
                        <option key={kls} value={kls}>
                          Kelas {kls}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Pilihan Kamar / Asrama</label>
                    <input
                      type="text"
                      value={formData.kamar}
                      onChange={e => handleChange('kamar', e.target.value)}
                      placeholder="Reguler / Asrama Putra / Putri"
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: FISIK & KELUARGA */}
            {activeStep === 'fisik' && (
              <div className="space-y-4">
                <div className="border-b border-slate-100 pb-2">
                  <h2 className="text-sm font-bold text-slate-900">Bagian 2: Data Fisik, Kesehatan & Keluarga</h2>
                  <p className="text-[11px] text-slate-500">
                    Informasi kesehatan dan posisi anak di dalam keluarga.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Berat Badan (kg)</label>
                    <input
                      type="text"
                      value={formData.berat_badan}
                      onChange={e => handleChange('berat_badan', e.target.value)}
                      placeholder="Contoh: 42"
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Tinggi Badan (cm)</label>
                    <input
                      type="text"
                      value={formData.tinggi_badan}
                      onChange={e => handleChange('tinggi_badan', e.target.value)}
                      placeholder="Contoh: 150"
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Riwayat Penyakit</label>
                    <input
                      type="text"
                      value={formData.riwayat_penyakit}
                      onChange={e => handleChange('riwayat_penyakit', e.target.value)}
                      placeholder="Tidak Ada / Asma / Alergi"
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Status Anak</label>
                    <input
                      type="text"
                      value={formData.status_anak}
                      onChange={e => handleChange('status_anak', e.target.value)}
                      placeholder="Anak Kandung / Anak Angkat"
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Kewarganegaraan</label>
                    <input
                      type="text"
                      value={formData.kewarganegaraan}
                      onChange={e => handleChange('kewarganegaraan', e.target.value)}
                      placeholder="WNI / WNA"
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Anak Ke-</label>
                    <input
                      type="text"
                      value={formData.anak_ke}
                      onChange={e => handleChange('anak_ke', e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Jumlah Saudara Kandung</label>
                    <input
                      type="text"
                      value={formData.jml_saudara_kandung}
                      onChange={e => handleChange('jml_saudara_kandung', e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Jumlah Saudara Tiri</label>
                    <input
                      type="text"
                      value={formData.jml_saudara_tiri}
                      onChange={e => handleChange('jml_saudara_tiri', e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3: ALAMAT & DOMISILI */}
            {activeStep === 'alamat' && (
              <div className="space-y-4">
                <div className="border-b border-slate-100 pb-2">
                  <h2 className="text-sm font-bold text-slate-900">Bagian 3: Alamat Tempat Tinggal Lengkap</h2>
                  <p className="text-[11px] text-slate-500">
                    Data domisili tempat tinggal calon siswa saat ini.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block font-semibold text-slate-700 mb-1">Jalan/Dusun</label>
                    <input
                      type="text"
                      value={formData.jalan_dusun}
                      onChange={e => handleChange('jalan_dusun', e.target.value)}
                      placeholder="Jl. Merdeka No. 10 / Dusun Krajan"
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">RT/RW</label>
                    <input
                      type="text"
                      value={formData.rt_rw}
                      onChange={e => handleChange('rt_rw', e.target.value)}
                      placeholder="002/005"
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Desa/Kelurahan</label>
                    <input
                      type="text"
                      value={formData.kelurahan}
                      onChange={e => handleChange('kelurahan', e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Kecamatan</label>
                    <input
                      type="text"
                      value={formData.kecamatan}
                      onChange={e => handleChange('kecamatan', e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Kode Pos</label>
                    <input
                      type="text"
                      value={formData.kode_pos}
                      onChange={e => handleChange('kode_pos', e.target.value)}
                      className={`${inputClass} font-mono`}
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Kota/Kabupaten</label>
                    <input
                      type="text"
                      value={formData.kab_kota}
                      onChange={e => handleChange('kab_kota', e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Provinsi</label>
                    <input
                      type="text"
                      value={formData.provinsi}
                      onChange={e => handleChange('provinsi', e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <label className="block font-semibold text-slate-700 mb-1">Alamat Lengkap</label>
                    <input
                      type="text"
                      value={formData.alamat}
                      onChange={e => handleChange('alamat', e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* STEP 4: SEKOLAH ASAL (SD/MI) + IJAZAH */}
            {activeStep === 'sekolah_asal' && (
              <div className="space-y-4">
                <div className="border-b border-slate-100 pb-2">
                  <h2 className="text-sm font-bold text-slate-900">Bagian 4: Sekolah Asal (SD/MI) & Data Ijazah</h2>
                  <p className="text-[11px] text-slate-500">
                    Masukkan informasi sekolah dasar asal beserta Nomor dan Tanggal Penerbitan Ijazah SD/MI.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Jenjang Sekolah Asal</label>
                    <select
                      value={formData.jenjang_asal}
                      onChange={e => handleChange('jenjang_asal', e.target.value)}
                      className={inputClass}
                    >
                      <option value="SD">SD</option>
                      <option value="MI">MI</option>
                      <option value="Paket A">Paket A</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block font-semibold text-slate-700 mb-1">Nama Asal Sekolah (SD/MI) *</label>
                    <input
                      type="text"
                      value={formData.nama_asal_sekolah}
                      onChange={e => handleChange('nama_asal_sekolah', e.target.value)}
                      placeholder="Contoh: SDN Menteng 01 Pagi / MIN 1"
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">NPSN Asal Sekolah</label>
                    <input
                      type="text"
                      value={formData.npsn_asal_sekolah}
                      onChange={e => handleChange('npsn_asal_sekolah', e.target.value)}
                      placeholder="8 digit NPSN SD/MI"
                      className={`${inputClass} font-mono`}
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-blue-900 mb-1">No Ijazah SD/MI</label>
                    <input
                      type="text"
                      value={formData.no_ijazah_sd}
                      onChange={e => handleChange('no_ijazah_sd', e.target.value)}
                      placeholder="DN-01/D-SD/K13/..."
                      className={`${inputClass} font-mono border-blue-300 bg-blue-50/30`}
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-blue-900 mb-1">Tanggal Penerbitan Ijazah</label>
                    <input
                      type="date"
                      value={formData.tgl_ijazah_sd === '-' ? '' : formData.tgl_ijazah_sd}
                      onChange={e => handleChange('tgl_ijazah_sd', e.target.value || '-')}
                      className={`${inputClass} border-blue-300 bg-blue-50/30`}
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Kecamatan Asal Sekolah</label>
                    <input
                      type="text"
                      value={formData.kecamatan_asal_sekolah}
                      onChange={e => handleChange('kecamatan_asal_sekolah', e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Kabupaten Asal Sekolah</label>
                    <input
                      type="text"
                      value={formData.kabupaten_asal_sekolah}
                      onChange={e => handleChange('kabupaten_asal_sekolah', e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Provinsi Asal Sekolah</label>
                    <input
                      type="text"
                      value={formData.provinsi_asal_sekolah}
                      onChange={e => handleChange('provinsi_asal_sekolah', e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* STEP 5: ORANG TUA & WALI */}
            {activeStep === 'orang_tua' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-blue-950 mb-3 pb-1.5 border-b border-slate-200">
                    A. Data Ayah Kandung
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Nama Ayah *</label>
                      <input
                        type="text"
                        required
                        value={formData.nama_ayah}
                        onChange={e => handleChange('nama_ayah', e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">NIK Ayah</label>
                      <input
                        type="text"
                        maxLength={16}
                        value={formData.nik_ayah}
                        onChange={e => handleChange('nik_ayah', e.target.value.replace(/\D/g, ''))}
                        className={`${inputClass} font-mono`}
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Tempat Lahir Ayah</label>
                      <input
                        type="text"
                        value={formData.tempat_lahir_ayah}
                        onChange={e => handleChange('tempat_lahir_ayah', e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Tgl Lahir Ayah</label>
                      <input
                        type="date"
                        value={formData.tgl_lahir_ayah}
                        onChange={e => handleChange('tgl_lahir_ayah', e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Pendidikan Ayah</label>
                      <input
                        type="text"
                        value={formData.pendidikan_ayah}
                        onChange={e => handleChange('pendidikan_ayah', e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Pekerjaan Ayah</label>
                      <input
                        type="text"
                        value={formData.pekerjaan_ayah}
                        onChange={e => handleChange('pekerjaan_ayah', e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">No. WA Ayah</label>
                      <input
                        type="text"
                        value={formData.no_wa_ayah}
                        onChange={e => handleChange('no_wa_ayah', e.target.value)}
                        className={`${inputClass} font-mono`}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block font-semibold text-slate-700 mb-1">Penghasilan Ayah</label>
                      <select
                        value={formData.penghasilan_ayah}
                        onChange={e => handleChange('penghasilan_ayah', e.target.value)}
                        className={inputClass}
                      >
                        <option value="">-- Pilih Rentang Penghasilan --</option>
                        {INCOME_RANGE_OPTIONS.map(opt => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-blue-950 mb-3 pb-1.5 border-b border-slate-200">
                    B. Data Ibu Kandung
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Nama Ibu Kandung *</label>
                      <input
                        type="text"
                        required
                        value={formData.nama_ibu}
                        onChange={e => handleChange('nama_ibu', e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">NIK Ibu</label>
                      <input
                        type="text"
                        maxLength={16}
                        value={formData.nik_ibu}
                        onChange={e => handleChange('nik_ibu', e.target.value.replace(/\D/g, ''))}
                        className={`${inputClass} font-mono`}
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Tempat Lahir Ibu</label>
                      <input
                        type="text"
                        value={formData.tempat_lahir_ibu}
                        onChange={e => handleChange('tempat_lahir_ibu', e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Tgl Lahir Ibu</label>
                      <input
                        type="date"
                        value={formData.tgl_lahir_ibu}
                        onChange={e => handleChange('tgl_lahir_ibu', e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Pendidikan Ibu</label>
                      <input
                        type="text"
                        value={formData.pendidikan_ibu}
                        onChange={e => handleChange('pendidikan_ibu', e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Pekerjaan Ibu</label>
                      <input
                        type="text"
                        value={formData.pekerjaan_ibu}
                        onChange={e => handleChange('pekerjaan_ibu', e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">No WA Ibu</label>
                      <input
                        type="text"
                        value={formData.no_wa_ibu}
                        onChange={e => handleChange('no_wa_ibu', e.target.value)}
                        className={`${inputClass} font-mono`}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block font-semibold text-slate-700 mb-1">Penghasilan Ibu</label>
                      <select
                        value={formData.penghasilan_ibu}
                        onChange={e => handleChange('penghasilan_ibu', e.target.value)}
                        className={inputClass}
                      >
                        <option value="">-- Pilih Rentang Penghasilan --</option>
                        {INCOME_RANGE_OPTIONS.map(opt => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-blue-950 mb-3 pb-1.5 border-b border-slate-200">
                    C. Data Wali (Opsional)
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Nama Wali</label>
                      <input
                        type="text"
                        value={formData.nama_wali}
                        onChange={e => handleChange('nama_wali', e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">NIK Wali</label>
                      <input
                        type="text"
                        value={formData.nik_wali}
                        onChange={e => handleChange('nik_wali', e.target.value)}
                        className={`${inputClass} font-mono`}
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Pekerjaan Wali</label>
                      <input
                        type="text"
                        value={formData.pekerjaan_wali}
                        onChange={e => handleChange('pekerjaan_wali', e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Penghasilan Wali</label>
                      <select
                        value={formData.penghasilan_wali}
                        onChange={e => handleChange('penghasilan_wali', e.target.value)}
                        className={inputClass}
                      >
                        <option value="">-- Pilih Rentang Penghasilan --</option>
                        {INCOME_RANGE_OPTIONS.map(opt => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">No HP Wali / Kontak Utama</label>
                      <input
                        type="text"
                        value={formData.no_hp_orangtua}
                        onChange={e => handleChange('no_hp_orangtua', e.target.value)}
                        placeholder="0812xxxxxxxx"
                        className={`${inputClass} font-mono`}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Navigation Footer */}
            <div className="pt-4 border-t border-slate-200 flex items-center justify-between gap-3">
              {currentStepIndex > 0 ? (
                <button
                  type="button"
                  onClick={handlePrevStep}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl flex items-center gap-1.5 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Sebelumnya</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onBack}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Batal
                </button>
              )}

              {currentStepIndex < steps.length - 1 ? (
                <button
                  type="button"
                  onClick={handleNextStep}
                  className="px-5 py-2.5 text-xs font-bold text-white bg-[#0F2942] hover:bg-blue-950 rounded-xl flex items-center gap-1.5 transition-colors shadow-sm"
                >
                  <span>Selanjutnya</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2.5 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-600 rounded-xl flex items-center gap-2 transition-colors shadow-md disabled:opacity-50"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>{submitting ? 'Menyimpan Data PPDB...' : 'Kirim Pendaftaran Murid Baru'}</span>
                </button>
              )}
            </div>
          </form>
        </div>
      </main>

      <footer className="p-4 text-center text-xs text-slate-500 bg-white border-t border-slate-200">
        Panitia Penerimaan Peserta Didik Baru (PPDB) · {SCHOOL_CONFIG.nama_sekolah}
      </footer>
    </div>
  );
};
