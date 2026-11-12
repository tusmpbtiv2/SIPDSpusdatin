import React, { useState } from 'react';
import { Siswa, calculateBiodataCompleteness } from '../../types';
import { ZeroPillBadge } from '../../components/common/ZeroPillBadge';
import { PrintBiodataF4Modal } from '../../components/common/PrintBiodataF4Modal';
import { User, HeartPulse, Home, School, Phone, Edit3, Printer, Sparkles } from 'lucide-react';
import { formatDateDMY, mapIncomeToRange } from '../../utils/formatters';

interface BiodataAnakPageProps {
  student: Siswa;
  onNavigateToPerbaiki: () => void;
}

export const BiodataAnakPage: React.FC<BiodataAnakPageProps> = ({
  student,
  onNavigateToPerbaiki
}) => {
  const [isPrintOpen, setIsPrintOpen] = useState(false);
  const completeness = calculateBiodataCompleteness(student);

  const FieldBox = ({
    label,
    value,
    mono = false
  }: {
    label: string;
    value?: string | number | null;
    mono?: boolean;
  }) => {
    const isFilled = value !== undefined && value !== null && String(value).trim() !== '' && String(value).trim() !== '-';
    return (
      <div
        className={`p-2.5 rounded-lg border ${
          isFilled ? 'bg-slate-50 border-slate-100' : 'bg-amber-50/40 border-amber-200/70'
        }`}
      >
        <div className="flex items-center justify-between gap-1">
          <span className="text-[11px] text-slate-400 font-medium block">{label}</span>
          {!isFilled && (
            <span className="text-[9px] font-bold uppercase px-1.5 py-0.2 rounded bg-amber-100 text-amber-800">
              Kosong
            </span>
          )}
        </div>
        <div
          className={`font-semibold text-xs mt-0.5 break-words ${
            isFilled ? 'text-slate-900' : 'text-amber-700 italic'
          } ${mono ? 'font-mono tabular-nums' : ''}`}
        >
          {isFilled ? value : 'Belum diisi'}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Biodata Lengkap Siswa (59 Kolom Buku Induk)
          </h2>
          <p className="text-xs text-slate-500">
            Data resmi kesiswaan terdaftar pada database SMP Bhinneka Tunggal Ika
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsPrintOpen(true)}
            className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs rounded-lg flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <Printer className="w-4 h-4" />
            <span>Cetak Biodata PDF (F4)</span>
          </button>

          <button
            onClick={onNavigateToPerbaiki}
            className="px-4 py-2.5 bg-blue-900 hover:bg-blue-800 text-white font-semibold text-xs rounded-lg flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <Edit3 className="w-4 h-4" />
            <span>Koreksi / Lengkapi Kolom Kosong</span>
          </button>
        </div>
      </div>

      {/* Completeness Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1.5 flex-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-800 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-blue-900" />
              <span>
                Kelengkapan Biodata: {completeness.filledCount} / {completeness.totalCount} Kolom Terisi ({completeness.percentage}%)
              </span>
            </span>
            {completeness.emptyFields.length > 0 && (
              <span className="text-amber-700 font-semibold">
                {completeness.emptyFields.length} kolom masih kosong
              </span>
            )}
          </div>
          <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
            <div
              className={`h-full ${
                completeness.percentage >= 90
                  ? 'bg-emerald-600'
                  : completeness.percentage >= 70
                  ? 'bg-blue-700'
                  : 'bg-amber-500'
              }`}
              style={{ width: `${completeness.percentage}%` }}
            />
          </div>
        </div>
        {completeness.emptyFields.length > 0 && (
          <button
            onClick={onNavigateToPerbaiki}
            className="px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs rounded-lg transition-colors shrink-0"
          >
            Lengkapi Kolom Kosong Sekarang
          </button>
        )}
      </div>

      {/* Main Student Card Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-blue-100 border border-blue-200 text-blue-900 flex items-center justify-center font-bold text-2xl shrink-0">
            {student.nama_lengkap.charAt(0)}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-extrabold text-slate-900 text-base sm:text-lg">{student.nama_lengkap}</h3>
              <ZeroPillBadge status={student.status} />
            </div>
            <div className="text-xs text-slate-500 font-mono mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>
                KELAS: <strong className="text-blue-900">{student.rombel}</strong>
              </span>
              <span>·</span>
              <span>
                NIS: <strong className="text-slate-800">{student.nis}</strong>
              </span>
              <span>·</span>
              <span>
                ID YYS: <strong className="text-slate-800">{student.id_yys || '-'}</strong>
              </span>
              <span>·</span>
              <span>
                NISN: <strong className="text-slate-800">{student.nisn}</strong>
              </span>
            </div>
          </div>
        </div>

        <div className="text-left sm:text-right sm:border-l sm:border-slate-100 sm:pl-5 text-xs text-slate-500">
          <div>Tanggal Masuk:</div>
          <div className="font-mono font-bold text-slate-800">{formatDateDMY(student.tanggal_masuk)}</div>
        </div>
      </div>

      {/* Section 1: Identitas Utama & Kependudukan */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
          <User className="w-4 h-4 text-blue-900" />
          <h4 className="font-bold text-slate-900 text-sm">1. Identitas Pribadi &amp; Kependudukan Siswa</h4>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <FieldBox label="Kelas" value={student.rombel} />
          <FieldBox label="NIS" value={student.nis} mono />
          <FieldBox label="ID Yayasan" value={student.id_yys} mono />
          <FieldBox label="Kamar" value={student.kamar} />
          <div className="sm:col-span-2">
            <FieldBox label="Nama Lengkap Siswa" value={student.nama_lengkap} />
          </div>
          <FieldBox label="Nomor KK" value={student.no_kk} mono />
          <FieldBox label="NIK Siswa" value={student.nik_siswa} mono />
          <FieldBox label="NISN" value={student.nisn} mono />
          <FieldBox
            label="Jenis Kelamin"
            value={student.jenis_kelamin === 'L' ? 'Laki-laki (L)' : 'Perempuan (P)'}
          />
          <FieldBox label="Tempat Lahir" value={student.tempat_lahir} />
          <FieldBox label="Tanggal Lahir" value={formatDateDMY(student.tanggal_lahir)} mono />
          <FieldBox label="Agama" value={student.agama} />
          <FieldBox label="Status Aktif" value={student.status === 'aktif' ? 'Aktif' : student.status} />
          <FieldBox label="Tanggal Masuk" value={formatDateDMY(student.tanggal_masuk)} mono />
          <FieldBox label="Angkatan" value={student.angkatan || student.tahun_masuk} mono />
        </div>
      </div>

      {/* Section 2: Data Fisik, Kesehatan & Status Keluarga */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
          <HeartPulse className="w-4 h-4 text-blue-900" />
          <h4 className="font-bold text-slate-900 text-sm">2. Data Fisik, Kesehatan &amp; Status Keluarga</h4>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <FieldBox
            label="Berat Badan (kg)"
            value={student.berat_badan ? `${student.berat_badan} kg` : ''}
            mono
          />
          <FieldBox
            label="Tinggi Badan (cm)"
            value={student.tinggi_badan ? `${student.tinggi_badan} cm` : ''}
            mono
          />
          <div className="sm:col-span-2">
            <FieldBox label="Riwayat Penyakit" value={student.riwayat_penyakit} />
          </div>
          <FieldBox label="Status Anak" value={student.status_anak} />
          <FieldBox label="Kewarganegaraan" value={student.kewarganegaraan} />
          <FieldBox label="Anak Ke-" value={student.anak_ke} mono />
          <FieldBox label="Jumlah Saudara Kandung" value={student.jml_saudara_kandung} mono />
          <FieldBox label="Jumlah Saudara Tiri" value={student.jml_saudara_tiri} mono />
        </div>
      </div>

      {/* Section 3: Alamat Domisili */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
          <Home className="w-4 h-4 text-blue-900" />
          <h4 className="font-bold text-slate-900 text-sm">3. Alamat &amp; Domisili Siswa</h4>
        </div>

        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div className="sm:col-span-2">
              <FieldBox label="Jalan / Dusun" value={student.jalan_dusun} />
            </div>
            <FieldBox label="RT / RW" value={student.rt_rw} mono />
            <FieldBox label="Desa / Kelurahan" value={student.kelurahan} />
            <FieldBox label="Kecamatan" value={student.kecamatan} />
            <FieldBox label="Kode Pos" value={student.kode_pos} mono />
            <FieldBox label="Kota / Kabupaten" value={student.kab_kota} />
            <FieldBox label="Provinsi" value={student.provinsi} />
          </div>
          <FieldBox label="Alamat Lengkap" value={student.alamat} />
        </div>
      </div>

      {/* Section 4: Sekolah Asal (SD/MI) + No Ijazah SD/MI & Tanggal Penerbitan Ijazah */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
          <School className="w-4 h-4 text-blue-900" />
          <h4 className="font-bold text-slate-900 text-sm">4. Sekolah Asal (SD/MI) &amp; Data Ijazah</h4>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
          <FieldBox label="Jenjang" value={student.jenjang_asal} />
          <FieldBox label="Nama Asal Sekolah" value={student.nama_asal_sekolah} />
          <FieldBox label="NPSN Asal Sekolah" value={student.npsn_asal_sekolah} mono />
          <FieldBox label="No. Ijazah SD/MI" value={student.no_ijazah_sd} mono />
          <FieldBox label="Tanggal Penerbitan Ijazah" value={formatDateDMY(student.tgl_ijazah_sd)} mono />
          <FieldBox label="Kecamatan Asal Sekolah" value={student.kecamatan_asal_sekolah} />
          <FieldBox label="Kabupaten Asal Sekolah" value={student.kabupaten_asal_sekolah} />
          <FieldBox label="Provinsi Asal Sekolah" value={student.provinsi_asal_sekolah} />
        </div>
      </div>

      {/* Section 5: Data Orang Tua & Wali */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-6">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
          <Phone className="w-4 h-4 text-blue-900" />
          <h4 className="font-bold text-slate-900 text-sm">5. Data Ayah, Ibu Kandung &amp; Wali</h4>
        </div>

        <div className="space-y-4">
          <div>
            <h5 className="text-xs font-bold text-slate-700 mb-2">Data Ayah Kandung</h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <FieldBox label="Nama Ayah" value={student.nama_ayah} />
              <FieldBox label="NIK Ayah" value={student.nik_ayah} mono />
              <FieldBox label="Tempat Lahir Ayah" value={student.tempat_lahir_ayah} />
              <FieldBox label="Tanggal Lahir Ayah" value={formatDateDMY(student.tgl_lahir_ayah)} mono />
              <FieldBox label="Pendidikan Ayah" value={student.pendidikan_ayah} />
              <FieldBox label="Pekerjaan Ayah" value={student.pekerjaan_ayah} />
              <FieldBox label="No. WA Ayah" value={student.no_wa_ayah} mono />
              <FieldBox label="Penghasilan Ayah" value={mapIncomeToRange(student.penghasilan_ayah)} />
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100">
            <h5 className="text-xs font-bold text-slate-700 mb-2">Data Ibu Kandung</h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <FieldBox label="Nama Ibu Kandung" value={student.nama_ibu} />
              <FieldBox label="NIK Ibu" value={student.nik_ibu} mono />
              <FieldBox label="Tempat Lahir Ibu" value={student.tempat_lahir_ibu} />
              <FieldBox label="Tanggal Lahir Ibu" value={formatDateDMY(student.tgl_lahir_ibu)} mono />
              <FieldBox label="Pendidikan Ibu" value={student.pendidikan_ibu} />
              <FieldBox label="Pekerjaan Ibu" value={student.pekerjaan_ibu} />
              <FieldBox label="No. WA Ibu" value={student.no_wa_ibu} mono />
              <FieldBox label="Penghasilan Ibu" value={mapIncomeToRange(student.penghasilan_ibu)} />
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100">
            <h5 className="text-xs font-bold text-slate-700 mb-2">Data Wali</h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
              <FieldBox label="Nama Wali" value={student.nama_wali} />
              <FieldBox label="NIK Wali" value={student.nik_wali} mono />
              <FieldBox label="Pekerjaan Wali" value={student.pekerjaan_wali} />
              <FieldBox label="Penghasilan Wali" value={mapIncomeToRange(student.penghasilan_wali)} />
              <FieldBox label="No. HP Wali" value={student.no_hp_orangtua} mono />
            </div>
          </div>
        </div>
      </div>

      {/* F4 Print & PDF Modal */}
      <PrintBiodataF4Modal
        students={[student]}
        isOpen={isPrintOpen}
        onClose={() => setIsPrintOpen(false)}
      />
    </div>
  );
};
