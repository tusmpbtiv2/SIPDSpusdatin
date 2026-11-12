import React from 'react';
import { Siswa } from '../../types';
import { useSchoolProfile } from '../../services/schoolService';
import { formatDateDMY, mapIncomeToRange } from '../../utils/formatters';
import { generateBiodataF4Pdf } from '../../services/pdfService';
import { SchoolLogo } from './SchoolLogo';
import { X, Download, Printer, FileText } from 'lucide-react';

interface PrintBiodataF4ModalProps {
  students: Siswa[];
  isOpen: boolean;
  onClose: () => void;
}

export const PrintBiodataF4Modal: React.FC<PrintBiodataF4ModalProps> = ({
  students,
  isOpen,
  onClose
}) => {
  const { profile } = useSchoolProfile();

  if (!isOpen || students.length === 0) return null;

  const handleDownloadPdf = () => {
    generateBiodataF4Pdf(students);
  };

  const handleBrowserPrint = () => {
    window.print();
  };

  const Row2Col = ({
    label1,
    val1,
    label2,
    val2
  }: {
    label1: string;
    val1?: string | number | null;
    label2?: string;
    val2?: string | number | null;
  }) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 py-1 border-b border-slate-100 text-[11px]">
      <div className="flex items-baseline justify-between sm:justify-start gap-2">
        <span className="text-slate-500 w-40 shrink-0">{label1}</span>
        <span className="text-slate-400">:</span>
        <span className="font-semibold text-slate-900 break-words flex-1">{val1 || '-'}</span>
      </div>
      {label2 && (
        <div className="flex items-baseline justify-between sm:justify-start gap-2">
          <span className="text-slate-500 w-40 shrink-0">{label2}</span>
          <span className="text-slate-400">:</span>
          <span className="font-semibold text-slate-900 break-words flex-1">{val2 || '-'}</span>
        </div>
      )}
    </div>
  );

  const RowFull = ({ label, val }: { label: string; val?: string | number | null }) => (
    <div className="flex items-baseline gap-2 py-1 border-b border-slate-100 text-[11px]">
      <span className="text-slate-500 w-40 shrink-0">{label}</span>
      <span className="text-slate-400">:</span>
      <span className="font-semibold text-slate-900 break-words flex-1">{val || '-'}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-slate-100 rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-300 overflow-hidden flex flex-col max-h-[95vh]">
        {/* Modal Action Header */}
        <div className="px-4 sm:px-6 py-3.5 bg-[#0F2942] text-white flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-2.5">
            <FileText className="w-5 h-5 text-blue-300 shrink-0" />
            <div>
              <h3 className="font-bold text-xs sm:text-sm">
                Pratinjau & Cetak Biodata Siswa — Format F4 (215 × 330 mm)
              </h3>
              <p className="text-[11px] text-blue-200">
                Menampilkan {students.length} data siswa lengkap (59 Kolom Buku Induk)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Unduh PDF (Ukuran F4)</span>
            </button>
            <button
              type="button"
              onClick={handleBrowserPrint}
              className="hidden sm:flex px-3 py-2 bg-blue-700 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg items-center gap-1.5 transition-colors"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak Printer</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-white/10"
              aria-label="Tutup"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable F4 Sheets Container */}
        <div className="p-3 sm:p-6 overflow-y-auto space-y-8 flex-1">
          {students.map((siswa, idx) => (
            <div
              key={siswa.id || idx}
              className="bg-white mx-auto shadow-md border border-slate-200 p-5 sm:p-8 max-w-[215mm] text-slate-900 rounded-sm print:shadow-none print:border-none"
            >
              {/* Kop Surat */}
              <div className="flex items-center gap-4 border-b-2 border-slate-900 pb-3 mb-4">
                <SchoolLogo size={56} />
                <div className="flex-1 text-center pr-10">
                  <div className="text-xs font-bold text-slate-700 tracking-wider uppercase">
                    PEMERINTAH DAERAH / KEMENTERIAN PENDIDIKAN
                  </div>
                  <div className="text-lg sm:text-xl font-extrabold text-[#0F2942] tracking-tight mt-0.5 uppercase">
                    {profile.nama_sekolah}
                  </div>
                  <div className="text-[11px] text-slate-600 mt-0.5">
                    NPSN: {profile.npsn} · {profile.status_akreditasi} · Email: {profile.email_resmi}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {profile.alamat} · Telp: {profile.telepon}
                  </div>
                </div>
              </div>

              {/* Title */}
              <div className="text-center mb-4">
                <h4 className="font-bold text-sm uppercase underline tracking-wide">
                  LEMBAR BUKU INDUK / BIODATA LENGKAP SISWA
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Tahun Ajaran {profile.tahun_ajaran} ({profile.semester_aktif})
                </p>
              </div>

              {/* Section A: Identitas */}
              <div className="mb-3">
                <div className="bg-[#0F2942] text-white px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider mb-1.5">
                  A. Identitas Pribadi & Registrasi Siswa
                </div>
                <RowFull label="Nama Lengkap Siswa" val={siswa.nama_lengkap} />
                <Row2Col label1="Kelas" val1={siswa.rombel} label2="Status Aktif" val2={siswa.status === 'aktif' ? 'Aktif' : siswa.status} />
                <Row2Col label1="NIS" val1={siswa.nis} label2="NISN" val2={siswa.nisn} />
                <Row2Col label1="ID Yayasan" val1={siswa.id_yys} label2="Kamar" val2={siswa.kamar} />
                <Row2Col label1="NIK Siswa" val1={siswa.nik_siswa} label2="Nomor KK" val2={siswa.no_kk} />
                <Row2Col
                  label1="Jenis Kelamin"
                  val1={siswa.jenis_kelamin === 'L' ? 'Laki-laki (L)' : 'Perempuan (P)'}
                  label2="Agama"
                  val2={siswa.agama}
                />
                <Row2Col label1="Tempat Lahir" val1={siswa.tempat_lahir} label2="Tanggal Lahir" val2={formatDateDMY(siswa.tanggal_lahir)} />
                <Row2Col label1="Tanggal Masuk" val1={formatDateDMY(siswa.tanggal_masuk)} label2="Angkatan" val2={siswa.angkatan || siswa.tahun_masuk} />
              </div>

              {/* Section B: Fisik & Keluarga */}
              <div className="mb-3">
                <div className="bg-[#0F2942] text-white px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider mb-1.5">
                  B. Data Fisik, Kesehatan & Status Keluarga
                </div>
                <Row2Col
                  label1="Berat Badan"
                  val1={siswa.berat_badan ? `${siswa.berat_badan} kg` : '-'}
                  label2="Tinggi Badan"
                  val2={siswa.tinggi_badan ? `${siswa.tinggi_badan} cm` : '-'}
                />
                <Row2Col label1="Riwayat Penyakit" val1={siswa.riwayat_penyakit} label2="Kewarganegaraan" val2={siswa.kewarganegaraan} />
                <Row2Col label1="Status Anak" val1={siswa.status_anak} label2="Anak Ke-" val2={siswa.anak_ke} />
                <Row2Col
                  label1="Jumlah Saudara Kandung"
                  val1={siswa.jml_saudara_kandung}
                  label2="Jumlah Saudara Tiri"
                  val2={siswa.jml_saudara_tiri}
                />
              </div>

              {/* Section C: Alamat */}
              <div className="mb-3">
                <div className="bg-[#0F2942] text-white px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider mb-1.5">
                  C. Alamat & Domisili Siswa
                </div>
                <Row2Col label1="Jalan / Dusun" val1={siswa.jalan_dusun} label2="RT / RW" val2={siswa.rt_rw} />
                <Row2Col label1="Desa / Kelurahan" val1={siswa.kelurahan} label2="Kecamatan" val2={siswa.kecamatan} />
                <Row2Col label1="Kota / Kabupaten" val1={siswa.kab_kota} label2="Provinsi" val2={siswa.provinsi} />
                <RowFull label="Kode Pos" val={siswa.kode_pos} />
                <RowFull label="Alamat Lengkap" val={siswa.alamat} />
              </div>

              {/* Section D: Sekolah Asal (SD/MI) + Ijazah */}
              <div className="mb-3">
                <div className="bg-[#0F2942] text-white px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider mb-1.5">
                  D. Data Sekolah Asal (SD/MI) & Ijazah
                </div>
                <Row2Col label1="Jenjang" val1={siswa.jenjang_asal} label2="NPSN Asal Sekolah" val2={siswa.npsn_asal_sekolah} />
                <RowFull label="Nama Asal Sekolah" val={siswa.nama_asal_sekolah} />
                <Row2Col label1="No. Ijazah SD/MI" val1={siswa.no_ijazah_sd} label2="Tanggal Penerbitan Ijazah" val2={formatDateDMY(siswa.tgl_ijazah_sd)} />
                <Row2Col
                  label1="Kecamatan Asal Sekolah"
                  val1={siswa.kecamatan_asal_sekolah}
                  label2="Kabupaten Asal Sekolah"
                  val2={siswa.kabupaten_asal_sekolah}
                />
                <RowFull label="Provinsi Asal Sekolah" val={siswa.provinsi_asal_sekolah} />
              </div>

              {/* Section E: Data Ayah */}
              <div className="mb-3">
                <div className="bg-[#0F2942] text-white px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider mb-1.5">
                  E. Data Ayah Kandung
                </div>
                <Row2Col label1="Nama Ayah" val1={siswa.nama_ayah} label2="NIK Ayah" val2={siswa.nik_ayah} />
                <Row2Col label1="Tempat Lahir Ayah" val1={siswa.tempat_lahir_ayah} label2="Tanggal Lahir Ayah" val2={formatDateDMY(siswa.tgl_lahir_ayah)} />
                <Row2Col label1="Pendidikan Ayah" val1={siswa.pendidikan_ayah} label2="Pekerjaan Ayah" val2={siswa.pekerjaan_ayah} />
                <Row2Col label1="No. WA Ayah" val1={siswa.no_wa_ayah} label2="Penghasilan Ayah" val2={mapIncomeToRange(siswa.penghasilan_ayah)} />
              </div>

              {/* Section F: Data Ibu */}
              <div className="mb-3">
                <div className="bg-[#0F2942] text-white px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider mb-1.5">
                  F. Data Ibu Kandung
                </div>
                <Row2Col label1="Nama Ibu Kandung" val1={siswa.nama_ibu} label2="NIK Ibu" val2={siswa.nik_ibu} />
                <Row2Col label1="Tempat Lahir Ibu" val1={siswa.tempat_lahir_ibu} label2="Tanggal Lahir Ibu" val2={formatDateDMY(siswa.tgl_lahir_ibu)} />
                <Row2Col label1="Pendidikan Ibu" val1={siswa.pendidikan_ibu} label2="Pekerjaan Ibu" val2={siswa.pekerjaan_ibu} />
                <Row2Col label1="No. WA Ibu" val1={siswa.no_wa_ibu} label2="Penghasilan Ibu" val2={mapIncomeToRange(siswa.penghasilan_ibu)} />
              </div>

              {/* Section G: Data Wali */}
              <div className="mb-5">
                <div className="bg-[#0F2942] text-white px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider mb-1.5">
                  G. Data Wali Siswa
                </div>
                <Row2Col label1="Nama Wali" val1={siswa.nama_wali} label2="NIK Wali" val2={siswa.nik_wali} />
                <Row2Col label1="Pekerjaan Wali" val1={siswa.pekerjaan_wali} label2="Penghasilan Wali" val2={mapIncomeToRange(siswa.penghasilan_wali)} />
                <RowFull label="No. HP Wali" val={siswa.no_hp_orangtua} />
              </div>

              {/* Signature Block */}
              <div className="pt-4 border-t border-slate-200 grid grid-cols-3 items-end text-xs text-slate-800 gap-4">
                <div>
                  <div>Mengetahui,</div>
                  <div>Orang Tua / Wali Siswa</div>
                  <div className="mt-12 font-semibold underline">
                    {siswa.nama_wali || siswa.nama_ayah || '....................................'}
                  </div>
                </div>

                <div className="flex justify-center">
                  <div className="w-24 h-32 border border-dashed border-slate-400 flex flex-col items-center justify-center text-[10px] text-slate-400">
                    <span>Pas Foto</span>
                    <span>3 × 4 cm</span>
                  </div>
                </div>

                <div className="text-right sm:text-left">
                  <div>
                    {new Date().toLocaleDateString('id-ID', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric'
                    })}
                  </div>
                  <div>Kepala {profile.nama_sekolah}</div>
                  <div className="mt-12 font-bold underline">{profile.kepala_sekolah}</div>
                  <div className="text-[10px] text-slate-500">NIP. {profile.nip_kepala_sekolah}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3 bg-white border-t border-slate-200 flex items-center justify-between print:hidden">
          <span className="text-xs text-slate-500">
            Ukuran Kertas Standar: F4 / Folio (215 mm × 330 mm)
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5"
            >
              <Download className="w-4 h-4" />
              <span>Unduh PDF F4</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
