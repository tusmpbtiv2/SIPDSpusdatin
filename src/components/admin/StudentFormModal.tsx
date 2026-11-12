import React, { useState, useEffect } from 'react';
import { Siswa, Gender, StudentStatus, StudentTabKey, INCOME_RANGE_OPTIONS } from '../../types';
import { CLASS_ROSTER } from '../../config/school';
import {
  X,
  User,
  School,
  Home,
  HeartPulse,
  UserCheck,
  Users,
  ShieldCheck,
  Briefcase,
  Save,
  AlertCircle
} from 'lucide-react';

interface StudentFormModalProps {
  isOpen: boolean;
  initialData?: Siswa | null;
  onClose: () => void;
  onSave: (data: Omit<Siswa, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
}

const DEFAULT_STUDENT_FORM: Omit<Siswa, 'id' | 'created_at' | 'updated_at'> = {
  rombel: '7A',
  tingkat_kelas: '7',
  nis: '',
  id_yys: '',
  kamar: '',
  nama_lengkap: '',
  no_kk: '',
  nik_siswa: '',
  nisn: '',
  no_ijazah_sd: '',
  tgl_ijazah_sd: '',
  jenis_kelamin: 'L',
  tempat_lahir: '',
  tanggal_lahir: '2012-01-01',
  agama: 'Islam',
  berat_badan: '',
  tinggi_badan: '',
  riwayat_penyakit: '',
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
  kab_kota: 'Jakarta Pusat',
  provinsi: 'DKI Jakarta',
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
  nama_wali: '',
  nik_wali: '',
  pekerjaan_wali: '',
  penghasilan_wali: '',
  no_hp_orangtua: '',
  status: 'aktif',
  tanggal_masuk: new Date().toISOString().slice(0, 10),
  tahun_masuk: '2026',
  angkatan: '2026'
};

export const StudentFormModal: React.FC<StudentFormModalProps> = ({
  isOpen,
  initialData,
  onClose,
  onSave
}) => {
  const [activeTab, setActiveTab] = useState<StudentTabKey>('identitas');
  const [formData, setFormData] = useState(DEFAULT_STUDENT_FORM);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (initialData) {
      const { id: _id, created_at: _c, updated_at: _u, ...rest } = initialData;
      setFormData({
        ...DEFAULT_STUDENT_FORM,
        ...rest
      });
    } else {
      setFormData(DEFAULT_STUDENT_FORM);
    }
    setActiveTab('identitas');
    setError(null);
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleRombelChange = (rombel: string) => {
    const tingkat = rombel.charAt(0) as '7' | '8' | '9';
    const validTingkat = ['7', '8', '9'].includes(tingkat) ? tingkat : '7';
    const inferredAngkatan = validTingkat === '9' ? '2024' : validTingkat === '8' ? '2025' : '2026';
    setFormData(prev => ({
      ...prev,
      rombel,
      tingkat_kelas: validTingkat,
      tahun_masuk: inferredAngkatan,
      angkatan: inferredAngkatan
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.nisn || !/^\d{10}$/.test(formData.nisn.trim())) {
      setError('NISN wajib terdiri dari tepat 10 digit angka.');
      setActiveTab('identitas');
      return;
    }

    if (!formData.nis || !formData.nis.trim()) {
      setError('Nomor Induk Siswa (NIS) wajib diisi.');
      setActiveTab('administrasi');
      return;
    }

    if (!formData.nama_lengkap || !formData.nama_lengkap.trim()) {
      setError('Nama Lengkap Siswa wajib diisi.');
      setActiveTab('identitas');
      return;
    }

    setIsSaving(true);
    try {
      await onSave({
        ...formData,
        nis: formData.nis.trim(),
        nisn: formData.nisn.trim(),
        nama_lengkap: formData.nama_lengkap.trim()
      });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan data siswa.');
    } finally {
      setIsSaving(false);
    }
  };

  const tabs: { id: StudentTabKey; label: string; icon: React.ReactNode }[] = [
    { id: 'identitas', label: 'Identitas', icon: <User className="w-3.5 h-3.5" /> },
    { id: 'pendidikan', label: 'Pendidikan', icon: <School className="w-3.5 h-3.5" /> },
    { id: 'alamat', label: 'Alamat', icon: <Home className="w-3.5 h-3.5" /> },
    { id: 'kesehatan', label: 'Kesehatan', icon: <HeartPulse className="w-3.5 h-3.5" /> },
    { id: 'ayah', label: 'Ayah', icon: <UserCheck className="w-3.5 h-3.5" /> },
    { id: 'ibu', label: 'Ibu', icon: <Users className="w-3.5 h-3.5" /> },
    { id: 'wali', label: 'Wali', icon: <ShieldCheck className="w-3.5 h-3.5" /> },
    { id: 'administrasi', label: 'Administrasi', icon: <Briefcase className="w-3.5 h-3.5" /> }
  ];

  const inputClass =
    'w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-4xl w-full overflow-hidden my-4 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-base">
              {initialData ? 'Edit Biodata Lengkap Siswa (59 Kolom)' : 'Tambah Siswa Baru (59 Kolom Buku Induk)'}
            </h3>
            <p className="text-xs text-slate-400">
              Formulir 8 Tab: Identitas, Pendidikan, Alamat, Kesehatan, Ayah, Ibu, Wali, Administrasi
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 8 Tab Navigation */}
        <div className="bg-slate-50 border-b border-slate-200 px-3 sm:px-5 flex items-center gap-1 overflow-x-auto shrink-0">
          {tabs.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                activeTab === t.id
                  ? 'border-blue-900 text-blue-900 bg-white'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
            {error && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* TAB 1: IDENTITAS */}
            {activeTab === 'identitas' && (
              <div className="space-y-4">
                <div className="pb-2 border-b border-slate-100">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Data Identitas Pribadi, Kependudukan & Keluarga Siswa
                  </h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div className="sm:col-span-2">
                    <label className="block text-slate-700 font-semibold mb-1">Nama Lengkap Siswa *</label>
                    <input
                      type="text"
                      required
                      value={formData.nama_lengkap}
                      onChange={e => setFormData({ ...formData, nama_lengkap: e.target.value })}
                      placeholder="Sesuai Akta Kelahiran / Ijazah"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">NISN (10 Digit Unik) *</label>
                    <input
                      type="text"
                      maxLength={10}
                      required
                      value={formData.nisn}
                      onChange={e => setFormData({ ...formData, nisn: e.target.value.replace(/\D/g, '') })}
                      placeholder="0091827361"
                      className={`${inputClass} font-mono`}
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">NIK Siswa (16 Digit)</label>
                    <input
                      type="text"
                      maxLength={16}
                      value={formData.nik_siswa || ''}
                      onChange={e => setFormData({ ...formData, nik_siswa: e.target.value.replace(/\D/g, '') })}
                      placeholder="317101..."
                      className={`${inputClass} font-mono`}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Nomor KK (16 Digit)</label>
                    <input
                      type="text"
                      maxLength={16}
                      value={formData.no_kk || ''}
                      onChange={e => setFormData({ ...formData, no_kk: e.target.value.replace(/\D/g, '') })}
                      placeholder="317101..."
                      className={`${inputClass} font-mono`}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Jenis Kelamin *</label>
                    <select
                      value={formData.jenis_kelamin}
                      onChange={e => setFormData({ ...formData, jenis_kelamin: e.target.value as Gender })}
                      className={inputClass}
                    >
                      <option value="L">Laki-laki (L)</option>
                      <option value="P">Perempuan (P)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Tempat Lahir *</label>
                    <input
                      type="text"
                      required
                      value={formData.tempat_lahir}
                      onChange={e => setFormData({ ...formData, tempat_lahir: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Tanggal Lahir *</label>
                    <input
                      type="date"
                      required
                      value={formData.tanggal_lahir}
                      onChange={e => setFormData({ ...formData, tanggal_lahir: e.target.value })}
                      className={`${inputClass} font-mono`}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Agama</label>
                    <select
                      value={formData.agama}
                      onChange={e => setFormData({ ...formData, agama: e.target.value })}
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
                    <label className="block text-slate-700 font-semibold mb-1">Status Anak</label>
                    <input
                      type="text"
                      value={formData.status_anak || ''}
                      onChange={e => setFormData({ ...formData, status_anak: e.target.value })}
                      placeholder="Anak Kandung"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Kewarganegaraan</label>
                    <select
                      value={formData.kewarganegaraan || 'WNI'}
                      onChange={e => setFormData({ ...formData, kewarganegaraan: e.target.value })}
                      className={inputClass}
                    >
                      <option value="WNI">WNI</option>
                      <option value="WNA">WNA</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Anak Ke-</label>
                    <input
                      type="text"
                      value={formData.anak_ke || ''}
                      onChange={e => setFormData({ ...formData, anak_ke: e.target.value })}
                      className={`${inputClass} font-mono`}
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Jumlah Saudara Kandung</label>
                    <input
                      type="text"
                      value={formData.jml_saudara_kandung || ''}
                      onChange={e => setFormData({ ...formData, jml_saudara_kandung: e.target.value })}
                      className={`${inputClass} font-mono`}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Jumlah Saudara Tiri</label>
                    <input
                      type="text"
                      value={formData.jml_saudara_tiri || ''}
                      onChange={e => setFormData({ ...formData, jml_saudara_tiri: e.target.value })}
                      className={`${inputClass} font-mono`}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: PENDIDIKAN (Asal Sekolah SD/MI & Ijazah) */}
            {activeTab === 'pendidikan' && (
              <div className="space-y-4">
                <div className="pb-2 border-b border-slate-100">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Riwayat Pendidikan Sekolah Asal (SD/MI) & Data Ijazah
                  </h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Jenjang Sekolah Asal</label>
                    <select
                      value={formData.jenjang_asal || 'SD'}
                      onChange={e => setFormData({ ...formData, jenjang_asal: e.target.value })}
                      className={inputClass}
                    >
                      <option value="SD">SD</option>
                      <option value="MI">MI</option>
                      <option value="Paket A">Paket A</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Nama Asal Sekolah</label>
                    <input
                      type="text"
                      value={formData.nama_asal_sekolah || ''}
                      onChange={e => setFormData({ ...formData, nama_asal_sekolah: e.target.value })}
                      placeholder="SDN ..."
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">NPSN Asal Sekolah</label>
                    <input
                      type="text"
                      value={formData.npsn_asal_sekolah || ''}
                      onChange={e => setFormData({ ...formData, npsn_asal_sekolah: e.target.value })}
                      placeholder="20100..."
                      className={`${inputClass} font-mono`}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">No Ijazah SD/MI</label>
                    <input
                      type="text"
                      value={formData.no_ijazah_sd || ''}
                      onChange={e => setFormData({ ...formData, no_ijazah_sd: e.target.value })}
                      placeholder="DN-01/D-SD/..."
                      className={`${inputClass} font-mono`}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Tanggal Penerbitan Ijazah</label>
                    <input
                      type="date"
                      value={formData.tgl_ijazah_sd || ''}
                      onChange={e => setFormData({ ...formData, tgl_ijazah_sd: e.target.value })}
                      className={`${inputClass} font-mono`}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Kecamatan Asal Sekolah</label>
                    <input
                      type="text"
                      value={formData.kecamatan_asal_sekolah || ''}
                      onChange={e => setFormData({ ...formData, kecamatan_asal_sekolah: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Kabupaten Asal Sekolah</label>
                    <input
                      type="text"
                      value={formData.kabupaten_asal_sekolah || ''}
                      onChange={e => setFormData({ ...formData, kabupaten_asal_sekolah: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Provinsi Asal Sekolah</label>
                    <input
                      type="text"
                      value={formData.provinsi_asal_sekolah || ''}
                      onChange={e => setFormData({ ...formData, provinsi_asal_sekolah: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: ALAMAT */}
            {activeTab === 'alamat' && (
              <div className="space-y-4">
                <div className="pb-2 border-b border-slate-100">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Alamat Tempat Tinggal & Domisili Siswa
                  </h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div className="sm:col-span-2">
                    <label className="block text-slate-700 font-semibold mb-1">Jalan/Dusun</label>
                    <input
                      type="text"
                      value={formData.jalan_dusun || ''}
                      onChange={e => setFormData({ ...formData, jalan_dusun: e.target.value })}
                      placeholder="Jl. ..."
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">RT/RW</label>
                    <input
                      type="text"
                      value={formData.rt_rw || ''}
                      onChange={e => setFormData({ ...formData, rt_rw: e.target.value })}
                      placeholder="004/002"
                      className={`${inputClass} font-mono`}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Desa/Kelurahan</label>
                    <input
                      type="text"
                      value={formData.kelurahan || ''}
                      onChange={e => setFormData({ ...formData, kelurahan: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Kecamatan</label>
                    <input
                      type="text"
                      value={formData.kecamatan || ''}
                      onChange={e => setFormData({ ...formData, kecamatan: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Kode Pos</label>
                    <input
                      type="text"
                      value={formData.kode_pos || ''}
                      onChange={e => setFormData({ ...formData, kode_pos: e.target.value })}
                      className={`${inputClass} font-mono`}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Kota/Kabupaten</label>
                    <input
                      type="text"
                      value={formData.kab_kota || ''}
                      onChange={e => setFormData({ ...formData, kab_kota: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Provinsi</label>
                    <input
                      type="text"
                      value={formData.provinsi || ''}
                      onChange={e => setFormData({ ...formData, provinsi: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-slate-700 font-semibold mb-1">Alamat Lengkap *</label>
                    <textarea
                      rows={2}
                      required
                      value={formData.alamat}
                      onChange={e => setFormData({ ...formData, alamat: e.target.value })}
                      placeholder="Jl. ... RT/RW ... Kel. ... Kec. ..."
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: KESEHATAN */}
            {activeTab === 'kesehatan' && (
              <div className="space-y-4">
                <div className="pb-2 border-b border-slate-100">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Data Kesehatan & Fisik Siswa
                  </h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Berat Badan (kg)</label>
                    <input
                      type="text"
                      value={formData.berat_badan || ''}
                      onChange={e => setFormData({ ...formData, berat_badan: e.target.value })}
                      placeholder="45"
                      className={`${inputClass} font-mono`}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Tinggi Badan (cm)</label>
                    <input
                      type="text"
                      value={formData.tinggi_badan || ''}
                      onChange={e => setFormData({ ...formData, tinggi_badan: e.target.value })}
                      placeholder="152"
                      className={`${inputClass} font-mono`}
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-slate-700 font-semibold mb-1">Riwayat Penyakit</label>
                    <textarea
                      rows={3}
                      value={formData.riwayat_penyakit || ''}
                      onChange={e => setFormData({ ...formData, riwayat_penyakit: e.target.value })}
                      placeholder="Contoh: Tidak Ada / Asma ringan / Alergi makanan laut"
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* TAB 5: AYAH */}
            {activeTab === 'ayah' && (
              <div className="space-y-4">
                <div className="pb-2 border-b border-slate-100">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Data Ayah Kandung
                  </h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                  <div className="sm:col-span-2">
                    <label className="block text-slate-700 font-semibold mb-1">Nama Ayah</label>
                    <input
                      type="text"
                      value={formData.nama_ayah || ''}
                      onChange={e => setFormData({ ...formData, nama_ayah: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-slate-700 font-semibold mb-1">NIK Ayah (16 Digit)</label>
                    <input
                      type="text"
                      maxLength={16}
                      value={formData.nik_ayah || ''}
                      onChange={e => setFormData({ ...formData, nik_ayah: e.target.value.replace(/\D/g, '') })}
                      className={`${inputClass} font-mono`}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Tempat Lahir Ayah</label>
                    <input
                      type="text"
                      value={formData.tempat_lahir_ayah || ''}
                      onChange={e => setFormData({ ...formData, tempat_lahir_ayah: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Tgl Lahir Ayah</label>
                    <input
                      type="date"
                      value={formData.tgl_lahir_ayah || ''}
                      onChange={e => setFormData({ ...formData, tgl_lahir_ayah: e.target.value })}
                      className={`${inputClass} font-mono`}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Pendidikan Ayah</label>
                    <input
                      type="text"
                      value={formData.pendidikan_ayah || ''}
                      onChange={e => setFormData({ ...formData, pendidikan_ayah: e.target.value })}
                      placeholder="SMA / S1 / S2"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Pekerjaan Ayah</label>
                    <input
                      type="text"
                      value={formData.pekerjaan_ayah || ''}
                      onChange={e => setFormData({ ...formData, pekerjaan_ayah: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-slate-700 font-semibold mb-1">No WA Ayah</label>
                    <input
                      type="text"
                      value={formData.no_wa_ayah || ''}
                      onChange={e => setFormData({ ...formData, no_wa_ayah: e.target.value })}
                      placeholder="0812..."
                      className={`${inputClass} font-mono`}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-slate-700 font-semibold mb-1">Penghasilan Ayah</label>
                    <select
                      value={formData.penghasilan_ayah || ''}
                      onChange={e => setFormData({ ...formData, penghasilan_ayah: e.target.value })}
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
            )}

            {/* TAB 6: IBU */}
            {activeTab === 'ibu' && (
              <div className="space-y-4">
                <div className="pb-2 border-b border-slate-100">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Data Ibu Kandung
                  </h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                  <div className="sm:col-span-2">
                    <label className="block text-slate-700 font-semibold mb-1">Nama Ibu Kandung</label>
                    <input
                      type="text"
                      value={formData.nama_ibu || ''}
                      onChange={e => setFormData({ ...formData, nama_ibu: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-slate-700 font-semibold mb-1">NIK Ibu (16 Digit)</label>
                    <input
                      type="text"
                      maxLength={16}
                      value={formData.nik_ibu || ''}
                      onChange={e => setFormData({ ...formData, nik_ibu: e.target.value.replace(/\D/g, '') })}
                      className={`${inputClass} font-mono`}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Tempat Lahir Ibu</label>
                    <input
                      type="text"
                      value={formData.tempat_lahir_ibu || ''}
                      onChange={e => setFormData({ ...formData, tempat_lahir_ibu: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Tgl Lahir Ibu</label>
                    <input
                      type="date"
                      value={formData.tgl_lahir_ibu || ''}
                      onChange={e => setFormData({ ...formData, tgl_lahir_ibu: e.target.value })}
                      className={`${inputClass} font-mono`}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Pendidikan Ibu</label>
                    <input
                      type="text"
                      value={formData.pendidikan_ibu || ''}
                      onChange={e => setFormData({ ...formData, pendidikan_ibu: e.target.value })}
                      placeholder="SMA / S1 / S2"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Pekerjaan Ibu</label>
                    <input
                      type="text"
                      value={formData.pekerjaan_ibu || ''}
                      onChange={e => setFormData({ ...formData, pekerjaan_ibu: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-slate-700 font-semibold mb-1">No WA Ibu</label>
                    <input
                      type="text"
                      value={formData.no_wa_ibu || ''}
                      onChange={e => setFormData({ ...formData, no_wa_ibu: e.target.value })}
                      placeholder="0812..."
                      className={`${inputClass} font-mono`}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-slate-700 font-semibold mb-1">Penghasilan Ibu</label>
                    <select
                      value={formData.penghasilan_ibu || ''}
                      onChange={e => setFormData({ ...formData, penghasilan_ibu: e.target.value })}
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
            )}

            {/* TAB 7: WALI */}
            {activeTab === 'wali' && (
              <div className="space-y-4">
                <div className="pb-2 border-b border-slate-100">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Data Wali Siswa
                  </h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Nama Wali</label>
                    <input
                      type="text"
                      value={formData.nama_wali || ''}
                      onChange={e => setFormData({ ...formData, nama_wali: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">NIK Wali (16 Digit)</label>
                    <input
                      type="text"
                      maxLength={16}
                      value={formData.nik_wali || ''}
                      onChange={e => setFormData({ ...formData, nik_wali: e.target.value.replace(/\D/g, '') })}
                      className={`${inputClass} font-mono`}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Pekerjaan Wali</label>
                    <input
                      type="text"
                      value={formData.pekerjaan_wali || ''}
                      onChange={e => setFormData({ ...formData, pekerjaan_wali: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Penghasilan Wali</label>
                    <select
                      value={formData.penghasilan_wali || ''}
                      onChange={e => setFormData({ ...formData, penghasilan_wali: e.target.value })}
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
                    <label className="block text-slate-700 font-semibold mb-1">No HP Wali *</label>
                    <input
                      type="text"
                      required
                      value={formData.no_hp_orangtua}
                      onChange={e => setFormData({ ...formData, no_hp_orangtua: e.target.value })}
                      placeholder="0812..."
                      className={`${inputClass} font-mono`}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* TAB 8: ADMINISTRASI */}
            {activeTab === 'administrasi' && (
              <div className="space-y-4">
                <div className="pb-2 border-b border-slate-100">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Data Administrasi Kesiswaan, Kelas, NIS & Asrama/Kamar
                  </h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Kelas *</label>
                    <select
                      value={formData.rombel}
                      onChange={e => handleRombelChange(e.target.value)}
                      className={inputClass}
                    >
                      {CLASS_ROSTER.map(r => (
                        <option key={r} value={r}>
                          Kelas {r}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">NIS (Unik) *</label>
                    <input
                      type="text"
                      required
                      value={formData.nis}
                      onChange={e => setFormData({ ...formData, nis: e.target.value })}
                      placeholder="242507001"
                      className={`${inputClass} font-mono`}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">ID Yayasan</label>
                    <input
                      type="text"
                      value={formData.id_yys || ''}
                      onChange={e => setFormData({ ...formData, id_yys: e.target.value })}
                      placeholder="YYS-2026-001"
                      className={`${inputClass} font-mono`}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Kamar</label>
                    <input
                      type="text"
                      value={formData.kamar || ''}
                      onChange={e => setFormData({ ...formData, kamar: e.target.value })}
                      placeholder="Kamar A-01"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Status Aktif *</label>
                    <select
                      value={formData.status}
                      onChange={e => setFormData({ ...formData, status: e.target.value as StudentStatus })}
                      className={inputClass}
                    >
                      <option value="aktif">Aktif</option>
                      <option value="mutasi_masuk">Mutasi Masuk</option>
                      <option value="mutasi_keluar">Mutasi Keluar</option>
                      <option value="lulus">Lulus</option>
                      <option value="non_aktif">Arsip / Non-Aktif</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Tanggal Masuk</label>
                    <input
                      type="date"
                      value={formData.tanggal_masuk || ''}
                      onChange={e => setFormData({ ...formData, tanggal_masuk: e.target.value })}
                      className={`${inputClass} font-mono`}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2 shrink-0">
            <div className="text-[11px] text-slate-500">
              Tab aktif: <strong className="text-slate-800 uppercase">{activeTab}</strong> (Validasi NIS &amp; NISN unik aktif)
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg flex items-center gap-1.5 shadow-xs disabled:opacity-50"
              >
                {isSaving ? (
                  <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>Simpan Data Siswa</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
