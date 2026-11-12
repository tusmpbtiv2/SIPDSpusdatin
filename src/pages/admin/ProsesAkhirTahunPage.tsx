import React, { useState, useEffect, useMemo } from 'react';
import { Siswa } from '../../types';
import {
  getSiswaList,
  processYearEndPromotions,
  processStudentGraduations,
  correctStudentAcademicStatus,
  recordExportLog
} from '../../services/dataService';
import { exportYearEndReviewToExcel } from '../../services/excelService';
import { CLASS_ROSTER } from '../../config/school';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { PageTitle } from '../../components/common/PageTitle';
import { StatisticCard } from '../../components/common/StatCard';
import { SearchInput } from '../../components/common/SearchInput';
import { LoadingSkeleton } from '../../components/common/LoadingSkeleton';
import { EmptyState } from '../../components/common/EmptyState';
import { Modal } from '../../components/common/Modal';
import {
  ArrowUpCircle,
  GraduationCap,
  ShieldCheck,
  Download,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  ArrowRight,
  AlertCircle,
  RefreshCw,
  Clock
} from 'lucide-react';
import { formatDateDMY } from '../../utils/formatters';

type YearEndTab = 'kenaikan_kelas' | 'kelulusan' | 'koreksi';

export const ProsesAkhirTahunPage: React.FC = () => {
  const { adminUser, role } = useAuth();
  const { success, error: notifyError } = useNotification();

  const [activeTab, setActiveTab] = useState<YearEndTab>('kenaikan_kelas');
  const [students, setStudents] = useState<Siswa[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Search states for Tab A & Tab B
  const [promoSearch, setPromoSearch] = useState('');
  const [gradSearch, setGradSearch] = useState('');

  // Tab A: Kenaikan Kelas state
  const [fromAcademicYear, setFromAcademicYear] = useState('2025/2026');
  const [toAcademicYear, setToAcademicYear] = useState('2026/2027');
  const [originClassFilter, setOriginClassFilter] = useState('7A');
  const [promotionMap, setPromotionMap] = useState<
    Record<
      string,
      {
        selected: boolean;
        decision: 'naik_kelas' | 'tinggal_kelas';
        to_class: string;
        catatan: string;
      }
    >
  >({});
  const [showPromotionConfirm, setShowPromotionConfirm] = useState(false);
  const [processingPromotion, setProcessingPromotion] = useState(false);

  // Tab B: Kelulusan Kelas IX state
  const [gradAcademicYear, setGradAcademicYear] = useState('2025/2026');
  const [gradYear, setGradYear] = useState('2026');
  const [gradDate, setGradDate] = useState(new Date().toISOString().slice(0, 10));
  const [gradClassFilter, setGradClassFilter] = useState('all');
  const [graduationMap, setGraduationMap] = useState<
    Record<
      string,
      {
        selected: boolean;
        nomor_ijazah_smp: string;
        sekolah_lanjutan: string;
        catatan: string;
      }
    >
  >({});
  const [showGradConfirm, setShowGradConfirm] = useState(false);
  const [processingGrad, setProcessingGrad] = useState(false);

  // Tab C: Koreksi Aman & Tercatat
  const [correctionStudentId, setCorrectionStudentId] = useState('');
  const [correctionKelas, setCorrectionKelas] = useState('7A');
  const [correctionStatus, setCorrectionStatus] = useState<Siswa['status']>('aktif');
  const [correctionAngkatan, setCorrectionAngkatan] = useState('2025');
  const [correctionReason, setCorrectionReason] = useState('');
  const [savingCorrection, setSavingCorrection] = useState(false);

  const canModify = role === 'super_admin' || role === 'admin' || role === 'operator';

  const getDefaultNextClass = (currentClass: string): string => {
    const clean = currentClass.trim().toUpperCase();
    if (clean.startsWith('7')) return '8' + clean.slice(1);
    if (clean.startsWith('8')) return '9' + clean.slice(1);
    return clean;
  };

  const loadData = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const list = await getSiswaList();
      setStudents(list);

      const nextPromMap: typeof promotionMap = {};
      const nextGradMap: typeof graduationMap = {};

      list.forEach(s => {
        if (s.status === 'aktif' || s.status === 'mutasi_masuk') {
          if (s.tingkat_kelas === '7' || s.tingkat_kelas === '8') {
            nextPromMap[s.id] = {
              selected: true,
              decision: 'naik_kelas',
              to_class: getDefaultNextClass(s.rombel),
              catatan: ''
            };
          }
          if (s.tingkat_kelas === '9') {
            nextGradMap[s.id] = {
              selected: true,
              nomor_ijazah_smp: s.nomor_ijazah_smp || '',
              sekolah_lanjutan: '',
              catatan: ''
            };
          }
        }
      });

      setPromotionMap(nextPromMap);
      setGraduationMap(nextGradMap);
      if (list.length > 0 && !correctionStudentId) {
        setCorrectionStudentId(list[0].id);
        setCorrectionKelas(list[0].rombel);
        setCorrectionStatus(list[0].status);
        setCorrectionAngkatan(list[0].angkatan || list[0].tahun_masuk);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal memuat daftar siswa untuk proses akhir tahun.';
      setLoadError(msg);
      notifyError('Gagal Memuat Data', msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Daftar siswa Kelas VII & VIII aktif untuk Kenaikan Kelas
  const promotionCandidates = useMemo(() => {
    return students.filter(
      s =>
        (s.status === 'aktif' || s.status === 'mutasi_masuk') &&
        (s.tingkat_kelas === '7' || s.tingkat_kelas === '8') &&
        (originClassFilter === 'all' || s.rombel === originClassFilter)
    );
  }, [students, originClassFilter]);

  const displayedPromotionCandidates = useMemo(() => {
    const q = promoSearch.trim().toLowerCase();
    if (!q) return promotionCandidates;
    return promotionCandidates.filter(
      s =>
        s.nama_lengkap.toLowerCase().includes(q) ||
        (s.nis && s.nis.toLowerCase().includes(q)) ||
        (s.nisn && s.nisn.toLowerCase().includes(q)) ||
        s.rombel.toLowerCase().includes(q)
    );
  }, [promotionCandidates, promoSearch]);

  // Daftar siswa Kelas IX aktif (Belum Lulus) untuk Kelulusan
  const class9ActiveStudents = useMemo(() => {
    return students.filter(
      s =>
        (s.status === 'aktif' || s.status === 'mutasi_masuk') &&
        s.tingkat_kelas === '9' &&
        (gradClassFilter === 'all' || s.rombel === gradClassFilter)
    );
  }, [students, gradClassFilter]);

  const displayedClass9Students = useMemo(() => {
    const q = gradSearch.trim().toLowerCase();
    if (!q) return class9ActiveStudents;
    return class9ActiveStudents.filter(
      s =>
        s.nama_lengkap.toLowerCase().includes(q) ||
        (s.nis && s.nis.toLowerCase().includes(q)) ||
        (s.nisn && s.nisn.toLowerCase().includes(q)) ||
        s.rombel.toLowerCase().includes(q)
    );
  }, [class9ActiveStudents, gradSearch]);

  // Ringkasan Pengamanan Proses Akhir Tahun (Sebelum Finalisasi)
  const safetySummary = useMemo(() => {
    let naikCount = 0;
    let tinggalCount = 0;
    let belumDiprosesPromosi = 0;
    const classTransitions = new Set<string>();

    promotionCandidates.forEach(s => {
      const cfg = promotionMap[s.id];
      if (!cfg || !cfg.selected) {
        belumDiprosesPromosi++;
      } else if (cfg.decision === 'tinggal_kelas') {
        tinggalCount++;
        classTransitions.add(`${s.rombel} -> ${cfg.to_class} (Tinggal Kelas)`);
      } else {
        naikCount++;
        classTransitions.add(`${s.rombel} -> ${cfg.to_class}`);
      }
    });

    let lulusDipilihCount = 0;
    let belumDiprosesLulusCount = 0;
    class9ActiveStudents.forEach(s => {
      const cfg = graduationMap[s.id];
      if (cfg?.selected) lulusDipilihCount++;
      else belumDiprosesLulusCount++;
    });

    return {
      naikCount,
      tinggalCount,
      belumDiprosesPromosi,
      lulusDipilihCount,
      belumDiprosesLulusCount,
      transitions: Array.from(classTransitions)
    };
  }, [promotionCandidates, promotionMap, class9ActiveStudents, graduationMap]);

  const handleExportPromotionReview = async () => {
    const items = promotionCandidates.map(s => {
      const cfg = promotionMap[s.id] || {
        selected: false,
        decision: 'naik_kelas',
        to_class: getDefaultNextClass(s.rombel),
        catatan: ''
      };
      return {
        nis: s.nis,
        nisn: s.nisn,
        nama_siswa: s.nama_lengkap,
        angkatan: s.angkatan || s.tahun_masuk,
        kelas_asal: s.rombel,
        keputusan: !cfg.selected
          ? 'BELUM DIPROSES'
          : cfg.decision === 'tinggal_kelas'
          ? 'TIDAK NAIK KELAS'
          : 'NAIK KELAS',
        kelas_tujuan_atau_status: cfg.selected ? `Kelas ${cfg.to_class}` : '-',
        tahun_ajaran_asal: fromAcademicYear,
        tahun_ajaran_tujuan: toAcademicYear,
        catatan: cfg.catatan
      };
    });

    exportYearEndReviewToExcel(items, `Kenaikan_Kelas_${fromAcademicYear.replace('/', '-')}`);
    await recordExportLog({
      exported_by_name: adminUser?.nama_lengkap || 'Admin Sekolah',
      exported_by_role: role || 'admin',
      export_type: 'Pemeriksaan Pra-Konfirmasi Kenaikan Kelas',
      filter_summary: { fromAcademicYear, toAcademicYear, originClassFilter },
      total_records: items.length,
      file_name: `Pemeriksaan_Kenaikan_Kelas.xlsx`
    });
  };

  const handleExportGraduationReview = async () => {
    const items = class9ActiveStudents.map(s => {
      const cfg = graduationMap[s.id];
      return {
        nis: s.nis,
        nisn: s.nisn,
        nama_siswa: s.nama_lengkap,
        angkatan: s.angkatan || s.tahun_masuk,
        kelas_asal: s.rombel,
        keputusan: cfg?.selected ? 'DINYATAKAN LULUS' : 'BELUM DIPROSES KELULUSAN',
        kelas_tujuan_atau_status: cfg?.selected ? `LULUS (${gradYear})` : 'Masih Aktif Kelas IX',
        tahun_ajaran_asal: gradAcademicYear,
        tahun_ajaran_tujuan: gradYear,
        catatan: cfg?.sekolah_lanjutan
          ? `Lanjut ke: ${cfg.sekolah_lanjutan}`
          : cfg?.catatan || '-'
      };
    });

    exportYearEndReviewToExcel(items, `Kelulusan_Kelas_IX_${gradYear}`);
    await recordExportLog({
      exported_by_name: adminUser?.nama_lengkap || 'Admin Sekolah',
      exported_by_role: role || 'admin',
      export_type: 'Pemeriksaan Pra-Konfirmasi Kelulusan Kelas IX',
      filter_summary: { gradAcademicYear, gradYear, gradClassFilter },
      total_records: items.length,
      file_name: `Pemeriksaan_Kelulusan_${gradYear}.xlsx`
    });
  };

  const handleConfirmPromotions = async () => {
    if (!canModify) return;
    const selectedItems = promotionCandidates
      .filter(s => promotionMap[s.id]?.selected)
      .map(s => ({
        student_id: s.id,
        from_class: s.rombel,
        to_class: promotionMap[s.id].to_class,
        decision: promotionMap[s.id].decision,
        catatan: promotionMap[s.id].catatan
      }));

    if (selectedItems.length === 0) {
      notifyError('Pilih Siswa', 'Pilih minimal satu siswa untuk diproses.');
      return;
    }

    setProcessingPromotion(true);
    try {
      const res = await processYearEndPromotions(
        {
          fromAcademicYear,
          toAcademicYear,
          items: selectedItems
        },
        {
          id: adminUser?.id || 'admin',
          name: adminUser?.nama_lengkap || 'Admin Sekolah',
          role: role || 'admin'
        }
      );

      success(
        'Proses Kenaikan Kelas Berhasil',
        `${res.promotedCount} siswa naik kelas, ${res.retainedCount} siswa tinggal kelas (${res.skippedCount} dilewati karena sudah diproses). Riwayat kelas lama tetap utuh.`
      );
      setShowPromotionConfirm(false);
      await loadData();
    } catch (err: unknown) {
      notifyError('Gagal Memproses', err instanceof Error ? err.message : 'Terjadi kesalahan.');
    } finally {
      setProcessingPromotion(false);
    }
  };

  const handleConfirmGraduations = async () => {
    if (!canModify) return;
    const selectedItems = class9ActiveStudents
      .filter(s => graduationMap[s.id]?.selected)
      .map(s => ({
        student_id: s.id,
        nomor_ijazah_smp: graduationMap[s.id].nomor_ijazah_smp,
        sekolah_lanjutan: graduationMap[s.id].sekolah_lanjutan,
        catatan: graduationMap[s.id].catatan
      }));

    if (selectedItems.length === 0) {
      notifyError('Pilih Siswa', 'Pilih minimal satu siswa kelas IX untuk diluluskan.');
      return;
    }

    setProcessingGrad(true);
    try {
      const res = await processStudentGraduations(
        {
          tahunAjaranLulus: gradAcademicYear,
          tahunKelulusan: gradYear,
          tanggalKelulusan: gradDate,
          items: selectedItems
        },
        {
          id: adminUser?.id || 'admin',
          name: adminUser?.nama_lengkap || 'Admin Sekolah',
          role: role || 'admin'
        }
      );

      success(
        'Proses Kelulusan Selesai',
        `${res.graduatedCount} siswa kelas IX resmi dinyatakan LULUS (Tahun ${gradYear}) dan masuk ke Arsip Alumni permanen.`
      );
      setShowGradConfirm(false);
      await loadData();
    } catch (err: unknown) {
      notifyError('Gagal Memproses Kelulusan', err instanceof Error ? err.message : 'Terjadi kesalahan.');
    } finally {
      setProcessingGrad(false);
    }
  };

  const handleCorrectionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canModify || !correctionStudentId) return;
    setSavingCorrection(true);
    try {
      await correctStudentAcademicStatus(
        {
          student_id: correctionStudentId,
          new_kelas: correctionKelas,
          new_status: correctionStatus,
          new_angkatan: correctionAngkatan,
          alasan_koreksi: correctionReason
        },
        {
          id: adminUser?.id || 'admin',
          name: adminUser?.nama_lengkap || 'Admin Sekolah',
          role: role || 'admin'
        }
      );
      success(
        'Koreksi Berhasil Disimpan',
        'Status akademik & penempatan kelas siswa telah dikoreksi dan dicatat di Audit Log.'
      );
      setCorrectionReason('');
      await loadData();
    } catch (err: unknown) {
      notifyError('Gagal Koreksi', err instanceof Error ? err.message : 'Terjadi kesalahan.');
    } finally {
      setSavingCorrection(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageTitle
        category="Akademik & Buku Induk"
        title="Proses Kenaikan Kelas & Kelulusan Siswa"
        subtitle="Kelola kenaikan kelas (VII → VIII, VIII → IX) dan kelulusan siswa Kelas IX secara transaksional tanpa menghapus riwayat kelas lama."
        icon={ArrowUpCircle}
        actions={
          <div className="flex flex-wrap items-center gap-1.5 bg-white p-1.5 rounded-2xl border border-slate-200/80 shadow-2xs">
            <button
              type="button"
              onClick={() => setActiveTab('kenaikan_kelas')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'kenaikan_kelas'
                  ? 'bg-[#315FEA] text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-[#101D35]'
              }`}
            >
              <ArrowUpCircle className="w-3.5 h-3.5" />
              <span>A. Kenaikan Kelas</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('kelulusan')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'kelulusan'
                  ? 'bg-[#10B981] text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-[#101D35]'
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5" />
              <span>B. Kelulusan Kelas IX</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('koreksi')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'koreksi'
                  ? 'bg-[#101D35] text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-[#101D35]'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>C. Koreksi Aman</span>
            </button>
          </div>
        }
      />

      {loadError && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-rose-900">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold">Gagal Memuat Data Siswa</h4>
              <p className="text-xs text-rose-700 mt-0.5">{loadError}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={loadData}
            className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Coba Lagi</span>
          </button>
        </div>
      )}

      {/* Ringkasan Pengamanan Proses (Safety Bar) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatisticCard
          title="Siswa Naik Kelas"
          value={safetySummary.naikCount}
          subtitle={`Filter Kelas: ${originClassFilter === 'all' ? 'Semua VII & VIII' : originClassFilter}`}
          icon={ArrowUpCircle}
          accent="blue"
        />
        <StatisticCard
          title="Siswa Tidak Naik Kelas"
          value={safetySummary.tinggalCount}
          subtitle="Keputusan tinggal kelas"
          icon={AlertTriangle}
          accent="amber"
        />
        <StatisticCard
          title="Siswa Kelas IX Akan Lulus"
          value={safetySummary.lulusDipilihCount}
          subtitle={`Tahun kelulusan ${gradYear}`}
          icon={GraduationCap}
          accent="emerald"
        />
        <StatisticCard
          title="Siswa Belum Diproses"
          value={
            activeTab === 'kenaikan_kelas'
              ? safetySummary.belumDiprosesPromosi
              : safetySummary.belumDiprosesLulusCount
          }
          subtitle="Tidak dicentang dalam batch ini"
          icon={Clock}
          accent="rose"
        />
      </div>

      {/* TAB A: KENAIKAN KELAS */}
      {activeTab === 'kenaikan_kelas' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(16,29,53,0.05)] overflow-hidden space-y-4">
          <div className="p-5 bg-slate-50/70 border-b border-slate-200/80 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
              <div>
                <label className="block text-xs font-bold text-[#101D35] mb-1">
                  Tahun Pelajaran Asal
                </label>
                <input
                  type="text"
                  value={fromAcademicYear}
                  onChange={e => setFromAcademicYear(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono bg-white focus:outline-none focus:ring-2 focus:ring-[#315FEA]/20 focus:border-[#315FEA]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#101D35] mb-1">
                  Tahun Pelajaran Tujuan
                </label>
                <input
                  type="text"
                  value={toAcademicYear}
                  onChange={e => setToAcademicYear(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono bg-white focus:outline-none focus:ring-2 focus:ring-[#315FEA]/20 focus:border-[#315FEA]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#101D35] mb-1">
                  Filter Kelas Asal (VII / VIII)
                </label>
                <select
                  value={originClassFilter}
                  onChange={e => setOriginClassFilter(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-[#315FEA]/20 focus:border-[#315FEA]"
                >
                  <option value="all">Semua Kelas VII &amp; VIII</option>
                  {CLASS_ROSTER.filter(c => c.startsWith('7') || c.startsWith('8')).map(c => (
                    <option key={c} value={c}>
                      Kelas {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportPromotionReview}
                  disabled={promotionCandidates.length === 0}
                  className="flex-1 py-2 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Pemeriksaan</span>
                </button>
                {canModify && (
                  <button
                    type="button"
                    onClick={() => setShowPromotionConfirm(true)}
                    disabled={promotionCandidates.length === 0}
                    className="flex-1 py-2 px-3 rounded-xl bg-[#315FEA] hover:bg-[#244CD2] text-white text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Finalisasi Kenaikan</span>
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-200/70">
              <div className="w-full sm:max-w-md">
                <SearchInput
                  value={promoSearch}
                  onChange={setPromoSearch}
                  placeholder="Cari nama siswa, NIS, NISN, atau kelas asal..."
                />
              </div>
              <div className="text-xs font-semibold text-slate-500">
                Menampilkan <strong className="text-[#101D35] font-mono">{displayedPromotionCandidates.length}</strong> dari{' '}
                <strong className="text-[#101D35] font-mono">{promotionCandidates.length}</strong> kandidat kenaikan kelas
              </div>
            </div>
          </div>

          {loading ? (
            <div className="p-6">
              <LoadingSkeleton rows={6} />
            </div>
          ) : displayedPromotionCandidates.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="Tidak Ada Siswa Aktif pada Filter Ini"
                description="Pilih rombel kelas asal lain atau ubah kata kunci pencarian untuk menampilkan kandidat kenaikan kelas."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3.5 px-4">Proses</th>
                    <th className="py-3.5 px-4">NIS / NISN</th>
                    <th className="py-3.5 px-4">Nama Lengkap Siswa</th>
                    <th className="py-3.5 px-4">Angkatan Tetap</th>
                    <th className="py-3.5 px-4">Kelas Asal ({fromAcademicYear})</th>
                    <th className="py-3.5 px-4">Keputusan</th>
                    <th className="py-3.5 px-4">Kelas Tujuan ({toAcademicYear})</th>
                    <th className="py-3.5 px-4">Catatan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayedPromotionCandidates.map(s => {
                    const cfg = promotionMap[s.id] || {
                      selected: true,
                      decision: 'naik_kelas',
                      to_class: getDefaultNextClass(s.rombel),
                      catatan: ''
                    };

                    return (
                      <tr key={s.id} className="hover:bg-[#315FEA]/[0.03] transition-colors">
                        <td className="py-3 px-4">
                          <input
                            type="checkbox"
                            checked={cfg.selected}
                            onChange={e =>
                              setPromotionMap(prev => ({
                                ...prev,
                                [s.id]: { ...cfg, selected: e.target.checked }
                              }))
                            }
                            className="rounded border-slate-300 text-[#315FEA] focus:ring-[#315FEA]"
                          />
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-700">
                          {s.nis || '-'} / {s.nisn || '-'}
                        </td>
                        <td className="py-3 px-4 font-bold text-[#101D35]">{s.nama_lengkap}</td>
                        <td className="py-3 px-4 font-mono text-[#6366F1] font-semibold">
                          {s.angkatan || s.tahun_masuk}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-800">Kelas {s.rombel}</td>
                        <td className="py-3 px-4">
                          <select
                            value={cfg.decision}
                            onChange={e => {
                              const dec = e.target.value as 'naik_kelas' | 'tinggal_kelas';
                              setPromotionMap(prev => ({
                                ...prev,
                                [s.id]: {
                                  ...cfg,
                                  decision: dec,
                                  to_class:
                                    dec === 'tinggal_kelas'
                                      ? s.rombel
                                      : getDefaultNextClass(s.rombel)
                                }
                              }));
                            }}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-semibold text-slate-800"
                          >
                            <option value="naik_kelas">Naik Kelas</option>
                            <option value="tinggal_kelas">Tidak Naik Kelas</option>
                          </select>
                        </td>
                        <td className="py-3 px-4">
                          <select
                            value={cfg.to_class}
                            onChange={e =>
                              setPromotionMap(prev => ({
                                ...prev,
                                [s.id]: { ...cfg, to_class: e.target.value }
                              }))
                            }
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-[#315FEA]"
                          >
                            {CLASS_ROSTER.map(c => (
                              <option key={c} value={c}>
                                Kelas {c}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-3 px-4">
                          <input
                            type="text"
                            placeholder="Catatan..."
                            value={cfg.catatan}
                            onChange={e =>
                              setPromotionMap(prev => ({
                                ...prev,
                                [s.id]: { ...cfg, catatan: e.target.value }
                              }))
                            }
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 w-44"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB B: KELULUSAN KELAS IX */}
      {activeTab === 'kelulusan' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(16,29,53,0.05)] overflow-hidden space-y-4">
          <div className="p-5 bg-slate-50/70 border-b border-slate-200/80 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 items-end">
              <div>
                <label className="block text-xs font-bold text-[#101D35] mb-1">
                  Tahun Pelajaran Kelulusan
                </label>
                <input
                  type="text"
                  value={gradAcademicYear}
                  onChange={e => setGradAcademicYear(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#101D35] mb-1">
                  Tahun Kelulusan (Permanen)
                </label>
                <input
                  type="text"
                  value={gradYear}
                  onChange={e => setGradYear(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#101D35] mb-1">
                  Tanggal Kelulusan
                </label>
                <input
                  type="date"
                  value={gradDate}
                  onChange={e => setGradDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#101D35] mb-1">
                  Filter Rombel Kelas IX
                </label>
                <select
                  value={gradClassFilter}
                  onChange={e => setGradClassFilter(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white"
                >
                  <option value="all">Semua Kelas IX ({class9ActiveStudents.length})</option>
                  {CLASS_ROSTER.filter(c => c.startsWith('9')).map(c => (
                    <option key={c} value={c}>
                      Kelas {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportGraduationReview}
                  disabled={class9ActiveStudents.length === 0}
                  className="flex-1 py-2 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold flex items-center justify-center gap-1 disabled:opacity-50 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export</span>
                </button>
                {canModify && (
                  <button
                    type="button"
                    onClick={() => setShowGradConfirm(true)}
                    disabled={class9ActiveStudents.length === 0}
                    className="flex-1 py-2 px-3 rounded-xl bg-[#10B981] hover:bg-emerald-600 text-white text-xs font-semibold flex items-center justify-center gap-1 disabled:opacity-50 cursor-pointer"
                  >
                    <GraduationCap className="w-3.5 h-3.5" />
                    <span>Luluskan</span>
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-200/70">
              <div className="w-full sm:max-w-md">
                <SearchInput
                  value={gradSearch}
                  onChange={setGradSearch}
                  placeholder="Cari nama siswa Kelas IX, NIS, NISN, atau kelas..."
                />
              </div>
              <div className="text-xs font-semibold text-slate-500">
                Menampilkan <strong className="text-[#101D35] font-mono">{displayedClass9Students.length}</strong> dari{' '}
                <strong className="text-[#101D35] font-mono">{class9ActiveStudents.length}</strong> siswa Kelas IX aktif
              </div>
            </div>
          </div>

          {safetySummary.belumDiprosesLulusCount > 0 && (
            <div className="mx-5 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Terdapat <strong>{safetySummary.belumDiprosesLulusCount} siswa Kelas IX</strong> yang tidak dicentang (belum diproses kelulusannya) dan akan tetap berstatus siswa aktif.
              </span>
            </div>
          )}

          {loading ? (
            <div className="p-6">
              <LoadingSkeleton rows={6} />
            </div>
          ) : displayedClass9Students.length === 0 ? (
            <div className="p-10 text-center space-y-1 text-xs text-slate-500">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              <p className="font-bold text-[#101D35]">
                Tidak ada siswa Kelas IX aktif yang menunggu proses kelulusan pada filter ini.
              </p>
              <p>Seluruh siswa yang sudah lulus dapat dilihat pada menu <strong>Arsip Alumni</strong>.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3.5 px-4">Luluskan</th>
                    <th className="py-3.5 px-4">Kelas IX</th>
                    <th className="py-3.5 px-4">NIS / NISN</th>
                    <th className="py-3.5 px-4">Nama Lengkap Siswa</th>
                    <th className="py-3.5 px-4">Angkatan Tetap</th>
                    <th className="py-3.5 px-4">No. Ijazah SMP (Opsional)</th>
                    <th className="py-3.5 px-4">Sekolah Lanjutan SMA/SMK</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayedClass9Students.map(s => {
                    const cfg = graduationMap[s.id] || {
                      selected: true,
                      nomor_ijazah_smp: '',
                      sekolah_lanjutan: '',
                      catatan: ''
                    };

                    return (
                      <tr key={s.id} className="hover:bg-[#315FEA]/[0.03] transition-colors">
                        <td className="py-3 px-4">
                          <input
                            type="checkbox"
                            checked={cfg.selected}
                            onChange={e =>
                              setGraduationMap(prev => ({
                                ...prev,
                                [s.id]: { ...cfg, selected: e.target.checked }
                              }))
                            }
                            className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                          />
                        </td>
                        <td className="py-3 px-4 font-bold text-[#101D35]">Kelas {s.rombel}</td>
                        <td className="py-3 px-4 font-mono text-slate-700">
                          {s.nis || '-'} / {s.nisn || '-'}
                        </td>
                        <td className="py-3 px-4 font-bold text-[#101D35]">{s.nama_lengkap}</td>
                        <td className="py-3 px-4 font-mono text-[#6366F1] font-semibold">
                          Angkatan {s.angkatan || s.tahun_masuk}
                        </td>
                        <td className="py-3 px-4">
                          <input
                            type="text"
                            placeholder="DN-01/D-SMP/..."
                            value={cfg.nomor_ijazah_smp}
                            onChange={e =>
                              setGraduationMap(prev => ({
                                ...prev,
                                [s.id]: { ...cfg, nomor_ijazah_smp: e.target.value }
                              }))
                            }
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 w-44 font-mono"
                          />
                        </td>
                        <td className="py-3 px-4">
                          <input
                            type="text"
                            placeholder="SMA/SMK Tujuan..."
                            value={cfg.sekolah_lanjutan}
                            onChange={e =>
                              setGraduationMap(prev => ({
                                ...prev,
                                [s.id]: { ...cfg, sekolah_lanjutan: e.target.value }
                              }))
                            }
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 w-44"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB C: MEKANISME KOREKSI AMAN & TERCATAT */}
      {activeTab === 'koreksi' && (
        <form
          onSubmit={handleCorrectionSubmit}
          className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-[0_1px_3px_rgba(16,29,53,0.05)] space-y-5 max-w-3xl"
        >
          <div>
            <h3 className="font-bold text-[#101D35] text-sm">
              Mekanisme Koreksi Status Akademik &amp; Penempatan Kelas (Tercatat di Audit Log)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Gunakan formulir ini apabila terdapat kesalahan penempatan kelas atau status kelulusan setelah proses akhir tahun dikonfirmasi.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-[#101D35] mb-1">Pilih Siswa *</label>
              <select
                value={correctionStudentId}
                onChange={e => {
                  const id = e.target.value;
                  setCorrectionStudentId(id);
                  const st = students.find(x => x.id === id);
                  if (st) {
                    setCorrectionKelas(st.rombel);
                    setCorrectionStatus(st.status);
                    setCorrectionAngkatan(st.angkatan || st.tahun_masuk);
                  }
                }}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs bg-white font-medium focus:outline-none focus:ring-2 focus:ring-[#315FEA]/20 focus:border-[#315FEA]"
              >
                {students.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.nama_lengkap} — NISN: {s.nisn} (Kelas: {s.rombel}, Status: {s.status})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#101D35] mb-1">Kelas Baru *</label>
              <select
                value={correctionKelas}
                onChange={e => setCorrectionKelas(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs bg-white font-medium focus:outline-none focus:ring-2 focus:ring-[#315FEA]/20 focus:border-[#315FEA]"
              >
                {CLASS_ROSTER.map(c => (
                  <option key={c} value={c}>
                    Kelas {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#101D35] mb-1">Status Siswa Baru *</label>
              <select
                value={correctionStatus}
                onChange={e => setCorrectionStatus(e.target.value as Siswa['status'])}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs bg-white font-medium focus:outline-none focus:ring-2 focus:ring-[#315FEA]/20 focus:border-[#315FEA]"
              >
                <option value="aktif">Aktif</option>
                <option value="lulus">Lulus (Alumni)</option>
                <option value="mutasi_masuk">Mutasi Masuk</option>
                <option value="mutasi_keluar">Mutasi Keluar</option>
                <option value="non_aktif">Non-Aktif</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#101D35] mb-1">
                Tahun Angkatan Tetap
              </label>
              <input
                type="text"
                value={correctionAngkatan}
                onChange={e => setCorrectionAngkatan(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#315FEA]/20 focus:border-[#315FEA]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#101D35] mb-1">
                Alasan Koreksi (Wajib untuk Audit Log) *
              </label>
              <input
                type="text"
                required
                placeholder="Contoh: Koreksi salah pilih rombel tujuan..."
                value={correctionReason}
                onChange={e => setCorrectionReason(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-[#315FEA]/20 focus:border-[#315FEA]"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={!canModify || savingCorrection}
              className="px-5 py-2.5 rounded-xl bg-[#101D35] hover:bg-[#182B4D] text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
            >
              {savingCorrection ? 'Menyimpan Koreksi...' : 'Simpan Koreksi & Catat Audit'}
            </button>
          </div>
        </form>
      )}

      {/* MODAL PENGAMANAN PRA-KONFIRMASI KENAIKAN KELAS */}
      <Modal
        isOpen={showPromotionConfirm}
        onClose={() => setShowPromotionConfirm(false)}
        title="Konfirmasi Pengamanan Proses Kenaikan Kelas"
        subtitle={`Transaksi akhir tahun pelajaran dari ${fromAcademicYear} ke ${toAcademicYear}`}
        maxWidth="lg"
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2 w-full">
            <button
              type="button"
              onClick={handleExportPromotionReview}
              className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Excel Pemeriksaan</span>
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowPromotionConfirm(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={processingPromotion}
                onClick={handleConfirmPromotions}
                className="px-4 py-2 rounded-xl bg-[#315FEA] hover:bg-[#244CD2] text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <span>{processingPromotion ? 'Memproses...' : 'Konfirmasi & Simpan Transaksi'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            Periksa rincian proses akhir tahun pelajaran dari <strong>{fromAcademicYear}</strong> ke{' '}
            <strong>{toAcademicYear}</strong> sebelum disimpan secara transaksional:
          </p>
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
            <div className="flex justify-between">
              <span>Jumlah Siswa Naik Kelas:</span>
              <strong className="font-mono text-[#315FEA]">{safetySummary.naikCount} Siswa</strong>
            </div>
            <div className="flex justify-between">
              <span>Jumlah Siswa Tidak Naik Kelas:</span>
              <strong className="font-mono text-amber-800">{safetySummary.tinggalCount} Siswa</strong>
            </div>
            <div className="flex justify-between">
              <span>Jumlah Siswa Belum Diproses:</span>
              <strong className="font-mono text-rose-800">
                {safetySummary.belumDiprosesPromosi} Siswa
              </strong>
            </div>
            <div className="pt-2.5 border-t border-slate-200">
              <span className="font-bold block mb-1.5">Daftar Kelas Asal &rarr; Kelas Tujuan:</span>
              <div className="flex flex-wrap gap-1.5">
                {safetySummary.transitions.map(t => (
                  <span
                    key={t}
                    className="px-2.5 py-0.5 rounded-lg bg-white border border-slate-200 font-mono text-[11px]"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* MODAL PENGAMANAN PRA-KONFIRMASI KELULUSAN */}
      <Modal
        isOpen={showGradConfirm}
        onClose={() => setShowGradConfirm(false)}
        title="Konfirmasi Pengamanan Kelulusan Siswa Kelas IX"
        subtitle={`Tahun Pelajaran ${gradAcademicYear} · Tahun Lulus ${gradYear}`}
        maxWidth="lg"
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2 w-full">
            <button
              type="button"
              onClick={handleExportGraduationReview}
              className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Excel Pemeriksaan</span>
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowGradConfirm(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={processingGrad}
                onClick={handleConfirmGraduations}
                className="px-4 py-2 rounded-xl bg-[#10B981] hover:bg-emerald-600 text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <span>{processingGrad ? 'Memproses...' : 'Konfirmasi Kelulusan'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            Siswa yang dinyatakan lulus akan diubah statusnya menjadi <strong>Lulus</strong>, disimpan permanen pada tabel <code>student_graduations</code>, dan masuk ke <strong>Arsip Alumni</strong> tanpa menghapus biodata maupun riwayat kelasnya.
          </p>
          <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-2 text-xs">
            <div className="flex justify-between">
              <span>Tahun Pelajaran / Tahun Lulus:</span>
              <strong className="font-mono text-emerald-950">
                {gradAcademicYear} (Lulus {gradYear})
              </strong>
            </div>
            <div className="flex justify-between">
              <span>Tanggal Kelulusan Resmi:</span>
              <strong className="font-mono text-emerald-950">
                {formatDateDMY(gradDate)}
              </strong>
            </div>
            <div className="flex justify-between">
              <span>Jumlah Siswa Dinyatakan Lulus:</span>
              <strong className="font-mono text-emerald-900">
                {safetySummary.lulusDipilihCount} Siswa
              </strong>
            </div>
            <div className="flex justify-between">
              <span>Jumlah Siswa Kelas IX Belum Diproses:</span>
              <strong className="font-mono text-amber-900">
                {safetySummary.belumDiprosesLulusCount} Siswa
              </strong>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};
