import React, { useState } from 'react';
import { Siswa } from '../../types';
import { ZeroPillBadge } from '../common/ZeroPillBadge';
import { generateBiodataF4Pdf } from '../../services/pdfService';
import { formatDateDMY, mapIncomeToRange } from '../../utils/formatters';
import { X, User, Home, Phone, School, HeartPulse, Printer } from 'lucide-react';

interface StudentDetailModalProps {
  siswa: Siswa | null;
  onClose: () => void;
  onEdit?: (siswa: Siswa) => void;
  onOpenPrintModal?: (siswa: Siswa) => void;
}

export const StudentDetailModal: React.FC<StudentDetailModalProps> = ({
  siswa,
  onClose,
  onEdit,
  onOpenPrintModal
}) => {
  const [activeTab, setActiveTab] = useState<'identitas' | 'fisik_keluarga' | 'alamat' | 'asal_sekolah' | 'orangtua_wali'>('identitas');

  if (!siswa) return null;

  const FieldItem = ({ label, value, mono = false }: { label: string; value?: string | number | null; mono?: boolean }) => (
    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
      <span className="text-[11px] text-slate-400 font-medium block">{label}</span>
      <div className={`font-semibold text-slate-900 text-xs mt-0.5 break-words ${mono ? 'font-mono tabular-nums' : ''}`}>
        {value || '-'}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/50 backdrop-blur-xs">
      <div className="bg-white rounded-t-2xl sm:rounded-xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[94vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex items-start justify-between bg-slate-50/70 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-blue-100 border border-blue-200 text-blue-900 flex items-center justify-center font-bold text-lg shrink-0">
              {siswa.nama_lengkap.charAt(0)}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold text-slate-900 text-sm sm:text-base truncate">{siswa.nama_lengkap}</h3>
                <ZeroPillBadge status={siswa.status} />
              </div>
              <div className="text-[11px] sm:text-xs text-slate-500 font-mono tabular-nums mt-0.5 truncate">
                KELAS: {siswa.rombel} · NIS: {siswa.nis} · ID YYS: {siswa.id_yys || '-'} · NISN: {siswa.nisn}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-2 rounded-lg hover:bg-slate-100 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Header */}
        <div className="flex overflow-x-auto border-b border-slate-200 bg-white px-4 sm:px-5 gap-4 text-xs font-medium shrink-0">
          <button
            onClick={() => setActiveTab('identitas')}
            className={`py-3 flex items-center gap-1.5 border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'identitas' ? 'border-blue-900 text-blue-950 font-bold' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <User className="w-4 h-4" />
            <span>1. Identitas Siswa</span>
          </button>
          <button
            onClick={() => setActiveTab('fisik_keluarga')}
            className={`py-3 flex items-center gap-1.5 border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'fisik_keluarga' ? 'border-blue-900 text-blue-950 font-bold' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <HeartPulse className="w-4 h-4" />
            <span>2. Fisik & Saudara</span>
          </button>
          <button
            onClick={() => setActiveTab('alamat')}
            className={`py-3 flex items-center gap-1.5 border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'alamat' ? 'border-blue-900 text-blue-950 font-bold' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Home className="w-4 h-4" />
            <span>3. Alamat & Domisili</span>
          </button>
          <button
            onClick={() => setActiveTab('asal_sekolah')}
            className={`py-3 flex items-center gap-1.5 border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'asal_sekolah' ? 'border-blue-900 text-blue-950 font-bold' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <School className="w-4 h-4" />
            <span>4. Sekolah Asal (SD/MI)</span>
          </button>
          <button
            onClick={() => setActiveTab('orangtua_wali')}
            className={`py-3 flex items-center gap-1.5 border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'orangtua_wali' ? 'border-blue-900 text-blue-950 font-bold' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Phone className="w-4 h-4" />
            <span>5. Ayah, Ibu & Wali</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 text-xs text-slate-700">
          {activeTab === 'identitas' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              <FieldItem label="Kelas" value={siswa.rombel} />
              <FieldItem label="NIS" value={siswa.nis} mono />
              <FieldItem label="ID Yayasan" value={siswa.id_yys} mono />
              <FieldItem label="Kamar" value={siswa.kamar} />
              <FieldItem label="Nama Lengkap Siswa" value={siswa.nama_lengkap} />
              <FieldItem label="Nomor KK" value={siswa.no_kk} mono />
              <FieldItem label="NIK Siswa" value={siswa.nik_siswa} mono />
              <FieldItem label="NISN" value={siswa.nisn} mono />
              <FieldItem label="Jenis Kelamin" value={siswa.jenis_kelamin === 'L' ? 'Laki-laki (L)' : 'Perempuan (P)'} />
              <FieldItem label="Tempat Lahir" value={siswa.tempat_lahir} />
              <FieldItem label="Tanggal Lahir" value={formatDateDMY(siswa.tanggal_lahir)} mono />
              <FieldItem label="Agama" value={siswa.agama} />
              <FieldItem label="Status Aktif" value={siswa.status === 'aktif' ? 'Aktif' : siswa.status} />
              <FieldItem label="Tanggal Masuk" value={formatDateDMY(siswa.tanggal_masuk)} mono />
              <FieldItem label="Angkatan" value={siswa.angkatan || siswa.tahun_masuk} mono />
            </div>
          )}

          {activeTab === 'fisik_keluarga' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              <FieldItem label="Berat Badan (kg)" value={siswa.berat_badan ? `${siswa.berat_badan} kg` : '-'} mono />
              <FieldItem label="Tinggi Badan (cm)" value={siswa.tinggi_badan ? `${siswa.tinggi_badan} cm` : '-'} mono />
              <FieldItem label="Riwayat Penyakit" value={siswa.riwayat_penyakit} />
              <FieldItem label="Status Anak" value={siswa.status_anak} />
              <FieldItem label="Kewarganegaraan" value={siswa.kewarganegaraan} />
              <FieldItem label="Anak Ke-" value={siswa.anak_ke} mono />
              <FieldItem label="Jumlah Saudara Kandung" value={siswa.jml_saudara_kandung} mono />
              <FieldItem label="Jumlah Saudara Tiri" value={siswa.jml_saudara_tiri} mono />
            </div>
          )}

          {activeTab === 'alamat' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                <FieldItem label="Jalan / Dusun" value={siswa.jalan_dusun} />
                <FieldItem label="RT / RW" value={siswa.rt_rw} mono />
                <FieldItem label="Desa / Kelurahan" value={siswa.kelurahan} />
                <FieldItem label="Kecamatan" value={siswa.kecamatan} />
                <FieldItem label="Kode Pos" value={siswa.kode_pos} mono />
                <FieldItem label="Kota / Kabupaten" value={siswa.kab_kota} />
                <FieldItem label="Provinsi" value={siswa.provinsi} />
              </div>
              <FieldItem label="Alamat Lengkap" value={siswa.alamat} />
            </div>
          )}

          {activeTab === 'asal_sekolah' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              <FieldItem label="Jenjang" value={siswa.jenjang_asal} />
              <FieldItem label="Nama Asal Sekolah" value={siswa.nama_asal_sekolah} />
              <FieldItem label="NPSN Asal Sekolah" value={siswa.npsn_asal_sekolah} mono />
              <FieldItem label="No. Ijazah SD/MI" value={siswa.no_ijazah_sd} mono />
              <FieldItem label="Tanggal Penerbitan Ijazah" value={formatDateDMY(siswa.tgl_ijazah_sd)} mono />
              <FieldItem label="Kecamatan Asal Sekolah" value={siswa.kecamatan_asal_sekolah} />
              <FieldItem label="Kabupaten Asal Sekolah" value={siswa.kabupaten_asal_sekolah} />
              <FieldItem label="Provinsi Asal Sekolah" value={siswa.provinsi_asal_sekolah} />
            </div>
          )}

          {activeTab === 'orangtua_wali' && (
            <div className="space-y-5">
              <div>
                <h4 className="font-bold text-slate-900 mb-2 border-b border-slate-100 pb-1">Data Ayah Kandung</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  <FieldItem label="Nama Ayah" value={siswa.nama_ayah} />
                  <FieldItem label="NIK Ayah" value={siswa.nik_ayah} mono />
                  <FieldItem label="Tempat Lahir Ayah" value={siswa.tempat_lahir_ayah} />
                  <FieldItem label="Tanggal Lahir Ayah" value={formatDateDMY(siswa.tgl_lahir_ayah)} mono />
                  <FieldItem label="Pendidikan Ayah" value={siswa.pendidikan_ayah} />
                  <FieldItem label="Pekerjaan Ayah" value={siswa.pekerjaan_ayah} />
                  <FieldItem label="No. WA Ayah" value={siswa.no_wa_ayah} mono />
                  <FieldItem label="Penghasilan Ayah" value={mapIncomeToRange(siswa.penghasilan_ayah)} />
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 mb-2 border-b border-slate-100 pb-1">Data Ibu Kandung</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  <FieldItem label="Nama Ibu Kandung" value={siswa.nama_ibu} />
                  <FieldItem label="NIK Ibu" value={siswa.nik_ibu} mono />
                  <FieldItem label="Tempat Lahir Ibu" value={siswa.tempat_lahir_ibu} />
                  <FieldItem label="Tanggal Lahir Ibu" value={formatDateDMY(siswa.tgl_lahir_ibu)} mono />
                  <FieldItem label="Pendidikan Ibu" value={siswa.pendidikan_ibu} />
                  <FieldItem label="Pekerjaan Ibu" value={siswa.pekerjaan_ibu} />
                  <FieldItem label="No. WA Ibu" value={siswa.no_wa_ibu} mono />
                  <FieldItem label="Penghasilan Ibu" value={mapIncomeToRange(siswa.penghasilan_ibu)} />
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 mb-2 border-b border-slate-100 pb-1">Data Wali</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  <FieldItem label="Nama Wali" value={siswa.nama_wali} />
                  <FieldItem label="NIK Wali" value={siswa.nik_wali} mono />
                  <FieldItem label="Pekerjaan Wali" value={siswa.pekerjaan_wali} />
                  <FieldItem label="Penghasilan Wali" value={mapIncomeToRange(siswa.penghasilan_wali)} />
                  <FieldItem label="No. HP Wali" value={siswa.no_hp_orangtua} mono />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
          <div className="text-[11px] text-slate-400">
            Tanggal Masuk: {formatDateDMY(siswa.tanggal_masuk)}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (onOpenPrintModal) {
                  onClose();
                  onOpenPrintModal(siswa);
                } else {
                  generateBiodataF4Pdf([siswa]);
                }
              }}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak Biodata PDF (F4)</span>
            </button>
            {onEdit && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEdit(siswa);
                }}
                className="px-3.5 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg transition-colors"
              >
                Edit Biodata
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
