import { jsPDF } from 'jspdf';
import { Siswa } from '../types';
import { getSchoolProfile } from './schoolService';
import { formatDateDMY, mapIncomeToRange } from '../utils/formatters';

/**
 * Generates and downloads an official F4 (215mm x 330mm / Folio) PDF document
 * containing the complete 59-column student biodata for each selected student.
 */
export function printStudentBiodataF4(student: Siswa): void {
  generateBiodataF4Pdf([student]);
}

export function generateBiodataF4Pdf(students: Siswa[]): void {
  if (!students || students.length === 0) return;

  // F4 / Folio dimensions in mm: 215mm width x 330mm height
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [215, 330]
  });

  const pageWidth = 215;
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2;

  const schoolProfile = getSchoolProfile();

  students.forEach((siswa, index) => {
    if (index > 0) {
      doc.addPage([215, 330], 'portrait');
    }

    let y = 14;

    // 1. KOP SURAT SEKOLAH
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(15, 41, 66); // Deep Navy
    doc.text('PEMERINTAH DAERAH / KEMENTERIAN PENDIDIKAN', pageWidth / 2, y, { align: 'center' });

    y += 5.5;
    doc.setFontSize(15);
    doc.text(schoolProfile.nama_sekolah.toUpperCase(), pageWidth / 2, y, { align: 'center' });

    y += 4.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(60, 60, 60);
    doc.text(
      `NPSN: ${schoolProfile.npsn} · ${schoolProfile.status_akreditasi} · Email: ${schoolProfile.email_resmi}`,
      pageWidth / 2,
      y,
      { align: 'center' }
    );

    y += 4;
    doc.text(
      `${schoolProfile.alamat} · Telp: ${schoolProfile.telepon}`,
      pageWidth / 2,
      y,
      { align: 'center' }
    );

    y += 3.5;
    doc.setDrawColor(15, 41, 66);
    doc.setLineWidth(0.7);
    doc.line(marginX, y, pageWidth - marginX, y);
    doc.setLineWidth(0.2);
    doc.line(marginX, y + 1, pageWidth - marginX, y + 1);

    // 2. JUDUL DOKUMEN
    y += 7;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text('LEMBAR BUKU INDUK / BIODATA LENGKAP SISWA', pageWidth / 2, y, { align: 'center' });

    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    doc.text(
      `Tahun Ajaran ${schoolProfile.tahun_ajaran} (${schoolProfile.semester_aktif}) · Ukuran Kertas: F4 (215 x 330 mm)`,
      pageWidth / 2,
      y,
      { align: 'center' }
    );

    y += 5;

    // Helper for section header
    const drawSectionHeader = (title: string) => {
      doc.setFillColor(15, 41, 66);
      doc.rect(marginX, y, contentWidth, 5.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text(title, marginX + 2.5, y + 3.8);
      y += 7.5;
    };

    // Helper for 2-column row of key-value pairs
    const drawTwoColRow = (
      label1: string,
      val1: string | undefined,
      label2: string,
      val2: string | undefined
    ) => {
      doc.setFontSize(8);
      const col1X = marginX + 1;
      const val1X = marginX + 38;
      const col2X = marginX + contentWidth / 2 + 2;
      const val2X = col2X + 38;

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(90, 100, 115);
      doc.text(label1, col1X, y);
      doc.text(':', val1X - 2, y);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      const cleanVal1 = String(val1 || '-').slice(0, 36);
      doc.text(cleanVal1, val1X, y);

      if (label2) {
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(90, 100, 115);
        doc.text(label2, col2X, y);
        doc.text(':', val2X - 2, y);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        const cleanVal2 = String(val2 || '-').slice(0, 36);
        doc.text(cleanVal2, val2X, y);
      }

      // Subtle hairline divider
      doc.setDrawColor(235, 238, 242);
      doc.setLineWidth(0.15);
      doc.line(marginX, y + 1.4, pageWidth - marginX, y + 1.4);

      y += 4.6;
    };

    const drawFullWidthRow = (label: string, val: string | undefined) => {
      doc.setFontSize(8);
      const col1X = marginX + 1;
      const val1X = marginX + 38;

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(90, 100, 115);
      doc.text(label, col1X, y);
      doc.text(':', val1X - 2, y);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      const cleanVal = String(val || '-').slice(0, 95);
      doc.text(cleanVal, val1X, y);

      doc.setDrawColor(235, 238, 242);
      doc.setLineWidth(0.15);
      doc.line(marginX, y + 1.4, pageWidth - marginX, y + 1.4);

      y += 4.6;
    };

    // SECTION A: IDENTITAS & REGISTRASI SISWA
    drawSectionHeader('A. Identitas Pribadi & Registrasi Siswa');
    drawFullWidthRow('Nama Lengkap Siswa', siswa.nama_lengkap);
    drawTwoColRow('Kelas / Rombel', siswa.rombel, 'Status Aktif', siswa.status === 'aktif' ? 'Aktif' : siswa.status);
    drawTwoColRow('NIS', siswa.nis, 'NISN', siswa.nisn);
    drawTwoColRow('ID Yayasan', siswa.id_yys, 'Kamar / Asrama', siswa.kamar);
    drawTwoColRow('NIK Siswa', siswa.nik_siswa, 'Nomor KK', siswa.no_kk);
    drawTwoColRow(
      'Jenis Kelamin',
      siswa.jenis_kelamin === 'L' ? 'Laki-laki (L)' : 'Perempuan (P)',
      'Agama',
      siswa.agama
    );
    drawTwoColRow('Tempat Lahir', siswa.tempat_lahir, 'Tanggal Lahir', formatDateDMY(siswa.tanggal_lahir));
    drawTwoColRow('Tanggal Masuk', formatDateDMY(siswa.tanggal_masuk), 'Angkatan', siswa.angkatan || siswa.tahun_masuk);

    y += 1.5;

    // SECTION B: DATA FISIK, KESEHATAN & KELUARGA
    drawSectionHeader('B. Data Fisik, Kesehatan & Status Keluarga');
    drawTwoColRow(
      'Berat Badan',
      siswa.berat_badan ? `${siswa.berat_badan} kg` : '-',
      'Tinggi Badan',
      siswa.tinggi_badan ? `${siswa.tinggi_badan} cm` : '-'
    );
    drawTwoColRow('Riwayat Penyakit', siswa.riwayat_penyakit, 'Kewarganegaraan', siswa.kewarganegaraan);
    drawTwoColRow('Status Anak', siswa.status_anak, 'Anak Ke-', siswa.anak_ke);
    drawTwoColRow(
      'Jml Saudara Kandung',
      siswa.jml_saudara_kandung,
      'Jml Saudara Tiri',
      siswa.jml_saudara_tiri
    );

    y += 1.5;

    // SECTION C: ALAMAT & DOMISILI SISWA
    drawSectionHeader('C. Alamat & Domisili Siswa');
    drawTwoColRow('Jalan / Dusun', siswa.jalan_dusun, 'RT / RW', siswa.rt_rw);
    drawTwoColRow('Desa / Kelurahan', siswa.kelurahan, 'Kecamatan', siswa.kecamatan);
    drawTwoColRow('Kota / Kabupaten', siswa.kab_kota, 'Provinsi', siswa.provinsi);
    drawTwoColRow('Kode Pos', siswa.kode_pos, '', '');
    drawFullWidthRow('Alamat Lengkap', siswa.alamat);

    y += 1.5;

    // SECTION D: SEKOLAH ASAL (SD/MI) & IJAZAH
    drawSectionHeader('D. Data Sekolah Asal (SD/MI) & Ijazah');
    drawTwoColRow('Jenjang Asal', siswa.jenjang_asal, 'NPSN Asal Sekolah', siswa.npsn_asal_sekolah);
    drawFullWidthRow('Nama Asal Sekolah', siswa.nama_asal_sekolah);
    drawTwoColRow('No. Ijazah SD/MI', siswa.no_ijazah_sd, 'Tgl Penerbitan Ijazah', formatDateDMY(siswa.tgl_ijazah_sd));
    drawTwoColRow('Kecamatan Asal', siswa.kecamatan_asal_sekolah, 'Kabupaten Asal', siswa.kabupaten_asal_sekolah);
    drawFullWidthRow('Provinsi Asal Sekolah', siswa.provinsi_asal_sekolah);

    y += 1.5;

    // SECTION E: DATA AYAH KANDUNG
    drawSectionHeader('E. Data Ayah Kandung');
    drawTwoColRow('Nama Ayah', siswa.nama_ayah, 'NIK Ayah', siswa.nik_ayah);
    drawTwoColRow('Tempat Lahir Ayah', siswa.tempat_lahir_ayah, 'Tgl Lahir Ayah', formatDateDMY(siswa.tgl_lahir_ayah));
    drawTwoColRow('Pendidikan Ayah', siswa.pendidikan_ayah, 'Pekerjaan Ayah', siswa.pekerjaan_ayah);
    drawTwoColRow('No. WA Ayah', siswa.no_wa_ayah, 'Penghasilan Ayah', mapIncomeToRange(siswa.penghasilan_ayah));

    y += 1.5;

    // SECTION F: DATA IBU KANDUNG
    drawSectionHeader('F. Data Ibu Kandung');
    drawTwoColRow('Nama Ibu Kandung', siswa.nama_ibu, 'NIK Ibu', siswa.nik_ibu);
    drawTwoColRow('Tempat Lahir Ibu', siswa.tempat_lahir_ibu, 'Tgl Lahir Ibu', formatDateDMY(siswa.tgl_lahir_ibu));
    drawTwoColRow('Pendidikan Ibu', siswa.pendidikan_ibu, 'Pekerjaan Ibu', siswa.pekerjaan_ibu);
    drawTwoColRow('No. WA Ibu', siswa.no_wa_ibu, 'Penghasilan Ibu', mapIncomeToRange(siswa.penghasilan_ibu));

    y += 1.5;

    // SECTION G: DATA WALI MURID
    drawSectionHeader('G. Data Wali Siswa');
    drawTwoColRow('Nama Wali', siswa.nama_wali, 'NIK Wali', siswa.nik_wali);
    drawTwoColRow('Pekerjaan Wali', siswa.pekerjaan_wali, 'Penghasilan Wali', mapIncomeToRange(siswa.penghasilan_wali));
    drawFullWidthRow('No. HP Wali', siswa.no_hp_orangtua);

    // 3. TANDA TANGAN & PENGESAHAN (BOTTOM OF F4 SHEET)
    y = Math.max(y + 6, 286);

    const todayStr = new Date().toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 30, 30);

    // Left signature: Orang Tua / Wali
    doc.text('Mengetahui,', marginX + 8, y);
    doc.text('Orang Tua / Wali Siswa', marginX + 8, y + 4);
    doc.text(`( ${siswa.nama_wali || siswa.nama_ayah || '....................................'} )`, marginX + 8, y + 23);

    // Photo 3x4 placeholder box in center
    doc.setDrawColor(160, 160, 160);
    doc.setLineWidth(0.3);
    doc.rect(pageWidth / 2 - 13, y - 2, 26, 32);
    doc.setFontSize(7.5);
    doc.setTextColor(130, 130, 130);
    doc.text('Pas Foto', pageWidth / 2, y + 12, { align: 'center' });
    doc.text('3 x 4 cm', pageWidth / 2, y + 16, { align: 'center' });

    // Right signature: Kepala Sekolah
    doc.setFontSize(8.5);
    doc.setTextColor(30, 30, 30);
    const rightColX = pageWidth - marginX - 58;
    doc.text(todayStr, rightColX, y);
    doc.text(`Kepala ${schoolProfile.nama_sekolah}`, rightColX, y + 4);
    doc.setFont('helvetica', 'bold');
    doc.text(schoolProfile.kepala_sekolah, rightColX, y + 23);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(`NIP. ${schoolProfile.nip_kepala_sekolah}`, rightColX, y + 27);
  });

  const filename =
    students.length === 1
      ? `BIODATA_F4_${students[0].nisn}_${students[0].nama_lengkap.replace(/\s+/g, '_').toUpperCase()}.pdf`
      : `BIODATA_F4_KOLEKTIF_${students.length}_SISWA_${new Date().toISOString().slice(0, 10)}.pdf`;

  doc.save(filename);
}
