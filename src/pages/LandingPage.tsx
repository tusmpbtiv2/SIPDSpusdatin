import React from 'react';
import { SchoolLogo } from '../components/common/SchoolLogo';
import { useSchoolProfile } from '../services/schoolService';
import { Shield, Users, UserPlus, ArrowRight, BookOpen, Award, CheckCircle2, Phone, Mail, MapPin } from 'lucide-react';

interface LandingPageProps {
  onSelectAdminLogin: () => void;
  onSelectParentLogin: () => void;
  onSelectPendaftaranBaru: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onSelectAdminLogin,
  onSelectParentLogin,
  onSelectPendaftaranBaru
}) => {
  const { profile: schoolProfile } = useSchoolProfile();
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Bar following Top Bar Contract: Brand title - Clean links - Action */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2 sm:gap-8">
          <div className="flex items-center gap-2.5 shrink-0">
            <SchoolLogo size={34} showText={true} />
          </div>

          <nav className="hidden lg:flex items-center gap-6 text-xs font-semibold text-slate-600">
            <a href="#profil" className="hover:text-blue-900 transition-colors whitespace-nowrap">Profil Sekolah</a>
            <button
              onClick={onSelectPendaftaranBaru}
              className="text-emerald-700 hover:text-emerald-800 font-bold transition-colors whitespace-nowrap"
            >
              Formulir Pendaftaran Murid Baru
            </button>
            <a href="#kontak" className="hover:text-blue-900 transition-colors whitespace-nowrap">Kontak TU</a>
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              onClick={onSelectPendaftaranBaru}
              className="px-2.5 sm:px-3.5 py-2 text-[11px] sm:text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-600 rounded-xl transition-colors whitespace-nowrap flex items-center gap-1"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Pendaftaran Baru</span>
              <span className="sm:hidden">PPDB</span>
            </button>
            <button
              onClick={onSelectParentLogin}
              className="px-2.5 sm:px-3.5 py-2 text-[11px] sm:text-xs font-semibold text-blue-950 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-colors whitespace-nowrap"
            >
              Login Ortu
            </button>
            <button
              onClick={onSelectAdminLogin}
              className="px-2.5 sm:px-3.5 py-2 text-[11px] sm:text-xs font-semibold text-white bg-[#0F2942] hover:bg-blue-950 rounded-xl transition-colors whitespace-nowrap"
            >
              Admin
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-to-b from-white via-slate-50 to-slate-100/60 py-8 sm:py-12 lg:py-16 border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 text-center">
          <div className="inline-flex flex-wrap items-center justify-center gap-2 text-xs font-medium text-slate-600 mb-3">
            <span className="font-semibold text-blue-900">{schoolProfile.nama_sekolah}</span>
            <span aria-hidden="true">·</span>
            <span>NPSN: {schoolProfile.npsn}</span>
            <span aria-hidden="true">·</span>
            <span className="text-emerald-700 font-semibold">{schoolProfile.status_akreditasi}</span>
          </div>

          <h1 className="text-2xl sm:text-4xl lg:text-5xl font-extrabold text-slate-950 tracking-tight leading-tight max-w-3xl mx-auto">
            Sistem Informasi Pengelolaan Data Siswa (SIPDS)
          </h1>

          <p className="mt-3 sm:mt-4 text-xs sm:text-base text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Portal terpadu administrasi kesiswaan {schoolProfile.nama_sekolah}. Pengelolaan data induk siswa, validasi berkas, mutasi, pelaporan F4, serta pendaftaran murid baru secara transparan dan aman.
          </p>

          {/* THREE PORTAL CARDS: LOGIN ADMIN, LOGIN ORANG TUA, FORMULIR PENDAFTARAN MURID BARU */}
          <div className="mt-8 sm:mt-10 grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto text-left">
            {/* CARD 1: LOGIN ADMIN */}
            <div className="bg-[#0A192F] text-white p-6 rounded-2xl border border-slate-800 shadow-xl flex flex-col justify-between hover:border-blue-500 transition-all">
              <div>
                <div className="w-11 h-11 rounded-xl bg-blue-900/60 border border-blue-600/40 text-blue-300 flex items-center justify-center mb-4">
                  <Shield className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-white tracking-tight">1. LOGIN ADMIN</h3>
                <p className="mt-2 text-xs text-slate-300 leading-relaxed">
                  Akses khusus staf Tata Usaha, Kepala Sekolah, Operator Dapodik, dan Pengawas Disdikbud.
                </p>

                <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-400 space-y-1">
                  <div>· Hak Akses: Super Admin, Admin, Operator, Viewer</div>
                  <div>· Cetak Biodata PDF Ukuran F4 & Kelola Data</div>
                </div>
              </div>

              <div className="mt-6 pt-3">
                <button
                  onClick={onSelectAdminLogin}
                  className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-md"
                >
                  <span>Masuk Portal Admin</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* CARD 2: LOGIN ORANG TUA */}
            <div className="bg-white text-slate-900 p-6 rounded-2xl border border-slate-200 shadow-xl flex flex-col justify-between hover:border-blue-400 transition-all">
              <div>
                <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 flex items-center justify-center mb-4">
                  <Users className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 tracking-tight">2. LOGIN ORANG TUA</h3>
                <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                  Akses bagi orang tua/wali murid untuk melihat biodata lengkap siswa, mencetak PDF F4, dan mengajukan koreksi data.
                </p>

                <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-500 space-y-1">
                  <div>· Username menggunakan 10 digit NISN Siswa</div>
                  <div>· Akun dibuat dan diaktifkan oleh pihak sekolah</div>
                </div>
              </div>

              <div className="mt-6 pt-3">
                <button
                  onClick={onSelectParentLogin}
                  className="w-full py-3 px-4 bg-[#0F2942] hover:bg-slate-800 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-md"
                >
                  <span>Masuk Portal Orang Tua</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* CARD 3: FORMULIR PENDAFTARAN MURID BARU */}
            <div className="bg-gradient-to-br from-emerald-950 to-[#0A192F] text-white p-6 rounded-2xl border border-emerald-700/60 shadow-xl flex flex-col justify-between hover:border-emerald-400 transition-all">
              <div>
                <div className="w-11 h-11 rounded-xl bg-emerald-800/50 border border-emerald-500/40 text-emerald-300 flex items-center justify-center mb-4">
                  <UserPlus className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-white tracking-tight">3. PENDAFTARAN MURID BARU</h3>
                <p className="mt-2 text-xs text-emerald-100/90 leading-relaxed">
                  Formulir pendaftaran online calon peserta didik baru {schoolProfile.nama_sekolah} Tahun Ajaran {schoolProfile.tahun_ajaran}.
                </p>

                <div className="mt-4 pt-3 border-t border-emerald-800/60 text-[11px] text-emerald-200/80 space-y-1">
                  <div>· Pengisian biodata lengkap & Sekolah Asal (SD/MI)</div>
                  <div>· Langsung cetak bukti & Biodata PDF ukuran F4</div>
                </div>
              </div>

              <div className="mt-6 pt-3">
                <button
                  onClick={onSelectPendaftaranBaru}
                  className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-md"
                >
                  <span>Isi Formulir Murid Baru</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Profil Singkat & Ketentuan Akses */}
      <section id="profil" className="py-10 sm:py-12 bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
            <div className="p-5 rounded-xl border border-slate-200 bg-slate-50/50">
              <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-900 flex items-center justify-center mb-3">
                <Award className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-slate-900 text-sm">Akreditasi Unggul (A)</h4>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                SMP Bhinneka Tunggal Ika berkomitmen menyelenggarakan pendidikan bermutu tinggi berbasis profil pelajar Pancasila.
              </p>
            </div>

            <div className="p-5 rounded-xl border border-slate-200 bg-slate-50/50">
              <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-900 flex items-center justify-center mb-3">
                <BookOpen className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-slate-900 text-sm">Cetak Biodata F4 & Dapodik</h4>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Struktur data siswa 59 kolom terstandardisasi dengan fitur cetak PDF ukuran kertas Folio/F4 (215mm x 330mm) siap arsip.
              </p>
            </div>

            <div className="p-5 rounded-xl border border-slate-200 bg-slate-50/50">
              <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-900 flex items-center justify-center mb-3">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-slate-900 text-sm">Keamanan Akun Orang Tua</h4>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Akses login orang tua diverifikasi secara ketat melalui backend berbasis NISN siswa terdaftar.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Kontak Sekolah */}
      <footer id="kontak" className="mt-auto bg-[#0A192F] text-slate-300 py-8 sm:py-10 border-t border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row items-start justify-between gap-6 pb-8 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-3">
                <SchoolLogo size={38} showText={false} />
                <div>
                  <h4 className="font-bold text-white text-sm">{schoolProfile.nama_sekolah}</h4>
                  <p className="text-xs text-slate-400">Sistem Informasi Pengelolaan Data Siswa (SIPDS)</p>
                </div>
              </div>
              <div className="mt-3 text-xs text-slate-400 flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{schoolProfile.alamat}</span>
              </div>
            </div>

            <div className="space-y-1.5 text-xs text-slate-300">
              <div className="font-semibold text-white">Layanan Tata Usaha:</div>
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-blue-400" />
                <span>{schoolProfile.telepon}</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-blue-400" />
                <span>{schoolProfile.email_resmi}</span>
              </div>
            </div>
          </div>

          <div className="pt-6 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
            <div>© {new Date().getFullYear()} {schoolProfile.nama_sekolah}. Hak cipta dilindungi.</div>
            <div className="font-mono tabular-nums">NPSN: {schoolProfile.npsn} · Semester {schoolProfile.semester_aktif} {schoolProfile.tahun_ajaran}</div>
          </div>
        </div>
      </footer>
    </div>
  );
};
