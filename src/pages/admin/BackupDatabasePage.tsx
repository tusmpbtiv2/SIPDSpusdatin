import React, { useState } from 'react';
import { FullDatabaseBackupPayload } from '../../types';
import {
  generateFullDatabaseBackup,
  validateDatabaseBackupPayload,
  restoreFullDatabaseBackup,
  BackupValidationReport
} from '../../services/dataService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { PageTitle } from '../../components/common/PageTitle';
import { EmptyState } from '../../components/common/EmptyState';
import {
  Database,
  Download,
  Upload,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Lock
} from 'lucide-react';

export const BackupDatabasePage: React.FC = () => {
  const { adminUser, role } = useAuth();
  const { success, error: notifyError } = useNotification();

  const [generating, setGenerating] = useState(false);
  const [parsedBackup, setParsedBackup] = useState<FullDatabaseBackupPayload | null>(null);
  const [validationReport, setValidationReport] = useState<BackupValidationReport | null>(null);
  const [restoreMode, setRestoreMode] = useState<'skip_existing' | 'merge_update'>('skip_existing');
  const [confirmedRestore, setConfirmedRestore] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<{
    restoredStudents: number;
    skippedStudents: number;
    restoredHistory: number;
    restoredGraduations: number;
    restoredAcademicYears: number;
    restoredClasses: number;
  } | null>(null);

  const isAuthorized = role === 'super_admin' || role === 'admin';

  if (!isAuthorized) {
    return (
      <div className="space-y-6">
        <PageTitle
          category="Data, Akun & Sistem"
          title="Backup & Restore Database SIPDS"
          subtitle="Mencadangkan dan memulihkan seluruh tabel relasional sekolah secara aman."
          icon={Database}
        />
        <div className="bg-white rounded-2xl border border-rose-200 p-8">
          <EmptyState
            icon={Lock}
            title="Akses Dibatasi"
            description="Fitur Backup dan Pemulihan Database Lengkap hanya dapat diakses oleh Super Admin atau Administrator Sekolah yang berwenang."
          />
        </div>
      </div>
    );
  }

  const handleDownloadBackup = async () => {
    setGenerating(true);
    try {
      const payload = await generateFullDatabaseBackup({
        id: adminUser?.id || 'admin',
        name: adminUser?.nama_lengkap || 'Admin Sekolah',
        role: role || 'admin'
      });

      const jsonStr = JSON.stringify(payload, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `SIPDS_SMP_Bhinneka_Full_Backup_${dateStamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      success(
        'Backup Database Berhasil Diunduh',
        'Seluruh tabel relasional berhasil diekspor tanpa menyertakan password, token, atau service role key.'
      );
    } catch (err: unknown) {
      notifyError('Gagal Membuat Backup', err instanceof Error ? err.message : 'Terjadi kesalahan.');
    } finally {
      setGenerating(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoreResult(null);
    setConfirmedRestore(false);

    try {
      const text = await file.text();
      const rawJson = JSON.parse(text);
      const report = await validateDatabaseBackupPayload(rawJson);
      setValidationReport(report);
      if (report.isValid) {
        setParsedBackup(rawJson as FullDatabaseBackupPayload);
      } else {
        setParsedBackup(null);
      }
    } catch {
      setValidationReport({
        isValid: false,
        schemaCompatible: false,
        errors: ['Berkas bukan JSON valid atau rusak.'],
        warnings: [],
        tableCounts: {},
        duplicateNisnCount: 0,
        existingOverlapCount: 0
      });
      setParsedBackup(null);
    }
  };

  const handleExecuteRestore = async () => {
    if (!parsedBackup || !confirmedRestore) return;
    setRestoring(true);
    try {
      const res = await restoreFullDatabaseBackup(parsedBackup, restoreMode, {
        id: adminUser?.id || 'admin',
        name: adminUser?.nama_lengkap || 'Admin Sekolah',
        role: role || 'admin'
      });
      setRestoreResult(res);
      success(
        'Pemulihan Database Selesai',
        `${res.restoredStudents} biodata siswa, ${res.restoredHistory} riwayat kelas, dan ${res.restoredGraduations} data kelulusan berhasil dipulihkan.`
      );
    } catch (err: unknown) {
      notifyError('Gagal Memulihkan Backup', err instanceof Error ? err.message : 'Terjadi kesalahan.');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageTitle
        category="Data, Akun & Sistem"
        title="Backup & Restore Database SIPDS"
        subtitle="Mencadangkan dan memulihkan seluruh tabel relasional sekolah (biodata siswa, data orang tua, angkatan, tahun pelajaran, riwayat kelas, mutasi, kelulusan, pengajuan koreksi, dan audit log) tanpa mengekspor password atau kunci rahasia."
        icon={Database}
        actions={
          <button
            type="button"
            onClick={handleDownloadBackup}
            disabled={generating}
            className="px-4 py-2.5 rounded-xl bg-[#315FEA] hover:bg-[#244CD2] text-white text-xs font-semibold flex items-center gap-2 transition-colors shrink-0 shadow-xs disabled:opacity-50 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>{generating ? 'Menyiapkan Backup...' : 'Unduh Backup Database Lengkap (.JSON)'}</span>
          </button>
        }
      />

      {/* Info Keamanan Backup */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(16,29,53,0.05)] space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-[#101D35]">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <span>1. Cakupan 11 Tabel Relasional</span>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Menyimpan <code>students</code>, <code>academic_years</code>, <code>classes</code>, <code>student_class_history</code>, <code>student_mutations</code>, <code>student_graduations</code>, <code>parent_student_access</code>, <code>student_change_requests</code>, <code>import_batches</code>, <code>export_logs</code>, dan <code>audit_logs</code>.
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(16,29,53,0.05)] space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-[#101D35]">
            <div className="w-8 h-8 rounded-xl bg-[#315FEA]/10 text-[#315FEA] flex items-center justify-center shrink-0">
              <Lock className="w-4 h-4" />
            </div>
            <span>2. Bebas Password &amp; Rahasia</span>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Berkas backup disanitasi otomatis sehingga tidak pernah memuat password pengguna, session token, maupun <code>SUPABASE_SERVICE_ROLE_KEY</code>.
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(16,29,53,0.05)] space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-[#101D35]">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-[#6366F1] flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <span>3. Validasi &amp; Pratinjau Pemulihan</span>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Memeriksa kompatibilitas skema, mendeteksi duplikasi NISN, dan menampilkan pratinjau jumlah rekaman sebelum pemulihan dieksekusi.
          </p>
        </div>
      </div>

      {/* Panel Pemulihan (Restore) Backup */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-[0_1px_3px_rgba(16,29,53,0.05)] space-y-5">
        <div>
          <h3 className="font-bold text-[#101D35] text-sm">Pemulihan Database dari Berkas Backup</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Unggah berkas <code>.json</code> hasil Backup Database SIPDS untuk divalidasi sebelum dipulihkan
          </p>
        </div>

        <label className="block border-2 border-dashed border-slate-300 hover:border-[#315FEA] rounded-2xl p-8 text-center cursor-pointer bg-slate-50/60 hover:bg-[#315FEA]/[0.02] transition-all">
          <div className="w-12 h-12 rounded-2xl bg-[#315FEA]/10 text-[#315FEA] flex items-center justify-center mx-auto mb-3">
            <Upload className="w-6 h-6" />
          </div>
          <span className="text-xs font-bold text-[#101D35] block">
            Klik untuk memilih berkas Backup JSON SIPDS
          </span>
          <span className="text-[11px] text-slate-500 block mt-1">
            Format yang didukung: SIPDS_SMP_Bhinneka_Full_Backup_*.json
          </span>
          <input type="file" accept=".json,application/json" onChange={handleFileUpload} className="hidden" />
        </label>

        {validationReport && (
          <div className="space-y-4">
            {/* Validation Banner */}
            <div
              className={`p-4 rounded-2xl border text-xs space-y-1.5 ${
                validationReport.isValid
                  ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                  : 'bg-rose-50 border-rose-200 text-rose-950'
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-sm">
                {validationReport.isValid ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-700" />
                )}
                <span>
                  {validationReport.isValid
                    ? `Struktur Backup Valid — Versi Skema: ${validationReport.meta?.schema_version}`
                    : 'Validasi Berkas Backup Gagal'}
                </span>
              </div>

              {validationReport.meta && (
                <p className="text-xs opacity-90">
                  Dibuat pada: <strong>{new Date(validationReport.meta.created_at).toLocaleString('id-ID')}</strong> oleh{' '}
                  <strong>{validationReport.meta.exported_by_name}</strong> ({validationReport.meta.school_name})
                </p>
              )}

              {validationReport.errors.map((err, i) => (
                <div key={i} className="text-rose-800 font-semibold">
                  • {err}
                </div>
              ))}

              {validationReport.warnings.map((w, i) => (
                <div key={i} className="text-amber-900 font-medium">
                  • Peringatan: {w}
                </div>
              ))}
            </div>

            {/* Preview Table Counts */}
            {validationReport.isValid && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                  {Object.entries(validationReport.tableCounts).map(([tableName, count]) => (
                    <div
                      key={tableName}
                      className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs"
                    >
                      <span className="font-mono text-[10px] text-slate-500 block truncate">
                        {tableName}
                      </span>
                      <span className="text-base font-extrabold font-mono text-[#101D35] mt-0.5 block">
                        {count} baris
                      </span>
                    </div>
                  ))}
                </div>

                {/* Restore Options & Confirmation */}
                <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-[#101D35] mb-1">
                        Penanganan Data Siswa yang Sudah Ada di Database
                      </label>
                      <select
                        value={restoreMode}
                        onChange={e =>
                          setRestoreMode(e.target.value as 'skip_existing' | 'merge_update')
                        }
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs bg-white font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#315FEA]/20 focus:border-[#315FEA]"
                      >
                        <option value="skip_existing">
                          Aman: Lewati siswa yang NISN-nya sudah terdaftar (Jangan Timpa)
                        </option>
                        <option value="merge_update">
                          Gabungkan &amp; Perbarui: Perbarui biodata siswa yang cocok berdasarkan NISN
                        </option>
                      </select>
                    </div>
                  </div>

                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#101D35] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmedRestore}
                      onChange={e => setConfirmedRestore(e.target.checked)}
                      className="rounded border-slate-300 text-[#315FEA] focus:ring-[#315FEA]"
                    />
                    <span>
                      Saya telah memeriksa pratinjau di atas dan mengonfirmasi pemulihan data ke database SIPDS.
                    </span>
                  </label>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      disabled={!confirmedRestore || restoring}
                      onClick={handleExecuteRestore}
                      className="px-5 py-2.5 rounded-xl bg-[#315FEA] hover:bg-[#244CD2] disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                    >
                      {restoring ? 'Memulihkan Database...' : 'Jalankan Pemulihan Database Sekarang'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Laporan Hasil Pemulihan */}
        {restoreResult && (
          <div className="p-4 rounded-2xl bg-[#315FEA]/5 border border-[#315FEA]/20 text-xs text-[#101D35] space-y-1.5">
            <div className="font-bold text-sm">Laporan Hasil Pemulihan Database:</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 font-mono">
              <div>• Siswa Dipulihkan: <strong>{restoreResult.restoredStudents}</strong></div>
              <div>• Siswa Dilewati (Duplikat): <strong>{restoreResult.skippedStudents}</strong></div>
              <div>• Riwayat Kelas Dipulihkan: <strong>{restoreResult.restoredHistory}</strong></div>
              <div>• Data Kelulusan Dipulihkan: <strong>{restoreResult.restoredGraduations}</strong></div>
              <div>• Tahun Pelajaran: <strong>{restoreResult.restoredAcademicYears}</strong></div>
              <div>• Master Kelas: <strong>{restoreResult.restoredClasses}</strong></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
