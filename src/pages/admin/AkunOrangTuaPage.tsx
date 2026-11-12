import React, { useState, useEffect, useMemo } from 'react';
import { ParentAccountRecord } from '../../types';
import {
  getParentAccounts,
  activateParentAccount,
  toggleParentAccountStatus
} from '../../services/dataService';
import { formatDateDMY } from '../../utils/formatters';
import { CLASS_ROSTER } from '../../config/school';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { DataTable, Column } from '../../components/common/ModernTable';
import { StatusBadge } from '../../components/common/ZeroPillBadge';
import { PageTitle } from '../../components/common/PageTitle';
import { StatisticCard } from '../../components/common/StatCard';
import { FilterDropdown } from '../../components/common/FilterDropdown';
import { ParentAccountModal } from '../../components/admin/ParentAccountModal';
import { ConfirmationModal } from '../../components/common/ConfirmationModal';
import {
  KeyRound,
  ShieldAlert,
  PowerOff,
  Users,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  RotateCcw
} from 'lucide-react';

export const AkunOrangTuaPage: React.FC = () => {
  const { adminUser } = useAuth();
  const { success, error: notifyError } = useNotification();

  const [accounts, setAccounts] = useState<ParentAccountRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [kelasFilter, setKelasFilter] = useState<string>('all');

  const [selectedAccount, setSelectedAccount] = useState<ParentAccountRecord | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Toggle status confirmation
  const [accountToToggle, setAccountToToggle] = useState<ParentAccountRecord | null>(null);

  const loadAccounts = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getParentAccounts();
      setAccounts(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Tidak dapat mengambil data akun orang tua.';
      setLoadError(msg);
      notifyError('Gagal Memuat Akun', msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  const stats = useMemo(() => {
    const total = accounts.length;
    const active = accounts.filter(a => a.is_active).length;
    const inactive = total - active;
    return { total, active, inactive };
  }, [accounts]);

  const filteredAccounts = useMemo(() => {
    return accounts.filter(a => {
      if (statusFilter === 'active' && !a.is_active) return false;
      if (statusFilter === 'inactive' && a.is_active) return false;
      if (kelasFilter !== 'all' && a.kelas !== kelasFilter) return false;
      return true;
    });
  }, [accounts, statusFilter, kelasFilter]);

  const handleActivate = async (nisn: string, customPassword?: string) => {
    if (!adminUser) throw new Error('Sesi admin tidak valid');
    const actor = {
      id: adminUser.id,
      name: adminUser.nama_lengkap,
      role: adminUser.role
    };

    const res = await activateParentAccount(nisn, customPassword, actor);
    success('Aktivasi Berhasil', res.message);
    await loadAccounts();
    return res;
  };

  const handleToggleConfirm = async () => {
    if (!accountToToggle || !adminUser) return;
    const actor = {
      id: adminUser.id,
      name: adminUser.nama_lengkap,
      role: adminUser.role
    };

    try {
      await toggleParentAccountStatus(accountToToggle.nisn, !accountToToggle.is_active, actor);
      success(
        'Status Akun Diubah',
        `Akun orang tua NISN ${accountToToggle.nisn} berhasil ${!accountToToggle.is_active ? 'diaktifkan' : 'dinonaktifkan'}.`
      );
      setAccountToToggle(null);
      await loadAccounts();
    } catch (err: unknown) {
      notifyError('Gagal Mengubah Status', err instanceof Error ? err.message : 'Terjadi kesalahan sistem.');
    }
  };

  const columns: Column<ParentAccountRecord>[] = [
    {
      header: 'NISN Siswa (Username)',
      accessor: 'nisn',
      isMono: true,
      className: 'font-semibold text-[#101D35] w-36'
    },
    {
      header: 'Nama Siswa',
      render: a => (
        <div>
          <span className="font-bold text-[#101D35]">{a.nama_siswa}</span>
          <div className="text-[11px] text-slate-500 font-medium">Kelas {a.kelas}</div>
        </div>
      )
    },
    {
      header: 'Password Default (Tgl Lahir)',
      render: a => (
        <span className="font-mono font-bold text-[#315FEA] text-xs tabular-nums">
          {formatDateDMY(a.tanggal_lahir)}
        </span>
      ),
      className: 'w-40'
    },
    {
      header: 'Nama Wali & No. HP',
      render: a => (
        <div>
          <span className="font-medium text-slate-800">{a.nama_wali}</span>
          <div className="font-mono text-slate-500 text-[11px]">{a.no_hp || '-'}</div>
        </div>
      )
    },
    {
      header: 'Status Akses',
      render: a => (
        <StatusBadge
          status={a.is_active ? 'aktif' : 'non_aktif'}
          label={a.is_active ? 'Aktif' : 'Belum Aktif'}
        />
      ),
      className: 'w-28'
    },
    {
      header: 'Waktu Aktivasi',
      render: a => (
        <span className="font-mono text-slate-600 text-xs tabular-nums">
          {a.activated_at ? formatDateDMY(a.activated_at) : '-'}
        </span>
      ),
      className: 'w-28'
    },
    {
      header: 'Login Terakhir',
      render: a => (
        <span className="font-mono text-slate-500 text-xs tabular-nums">
          {a.last_login_at ? formatDateDMY(a.last_login_at) : 'Belum pernah'}
        </span>
      ),
      className: 'w-28'
    },
    {
      header: 'Aksi Kelola',
      align: 'right',
      render: a => (
        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => {
              setSelectedAccount(a);
              setIsModalOpen(true);
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer ${
              a.is_active
                ? 'bg-slate-100 hover:bg-slate-200 text-[#101D35]'
                : 'bg-[#315FEA] hover:bg-[#244CD2] text-white shadow-2xs'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>{a.is_active ? 'Reset Password' : 'Aktifkan Akun'}</span>
          </button>

          {a.is_active && (
            <button
              type="button"
              onClick={() => setAccountToToggle(a)}
              title="Nonaktifkan Akses"
              className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
            >
              <PowerOff className="w-4 h-4" />
            </button>
          )}
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <PageTitle
        category="Data, Akun & Sistem"
        title="Manajemen Akun Orang Tua"
        subtitle="Otorisasi akses login orang tua berbasis NISN dan Tanggal Lahir Siswa (dd-mm-yyyy) beserta kontrol aktivasi dan reset password."
        icon={KeyRound}
        actions={
          <button
            type="button"
            onClick={loadAccounts}
            className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#315FEA]' : ''}`} />
            <span>Muat Ulang</span>
          </button>
        }
      />

      {loadError && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-rose-900">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold">Gagal Memuat Akun Orang Tua</h4>
              <p className="text-xs text-rose-700 mt-0.5">{loadError}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={loadAccounts}
            className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Coba Lagi</span>
          </button>
        </div>
      )}

      {/* KPI Ringkasan Akun Orang Tua */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatisticCard
          title="Total Akun Terdaftar"
          value={stats.total}
          subtitle="Seluruh siswa terhubung akun wali"
          icon={Users}
          accent="blue"
          onClick={() => setStatusFilter('all')}
        />
        <StatisticCard
          title="Akses Aktif"
          value={stats.active}
          subtitle="Dapat login ke Portal Orang Tua"
          icon={CheckCircle2}
          accent="emerald"
          onClick={() => setStatusFilter('active')}
        />
        <StatisticCard
          title="Belum Aktif / Nonaktif"
          value={stats.inactive}
          subtitle="Menunggu aktivasi atau dinonaktifkan"
          icon={Clock}
          accent="amber"
          onClick={() => setStatusFilter('inactive')}
        />
      </div>

      {/* Security Info Card */}
      <div className="p-4 bg-[#315FEA]/5 border border-[#315FEA]/20 rounded-2xl text-[#101D35] text-xs flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-[#315FEA] shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-bold">Ketentuan Login Orang Tua (NISN &amp; Tanggal Lahir Siswa):</div>
          <p className="text-slate-700 leading-relaxed">
            Orang tua dapat masuk ke Portal Orang Tua menggunakan <strong>10 digit NISN Siswa</strong> sebagai Username dan <strong>Tanggal Lahir Siswa</strong> (format <code>dd-mm-yyyy</code>, contoh: <code>25-08-2012</code>) sebagai Password default. Admin/Tata Usaha juga dapat mengatur ulang password atau menonaktifkan akses siswa tertentu melalui tabel di bawah ini.
          </p>
        </div>
      </div>

      <DataTable
        data={filteredAccounts}
        columns={columns}
        keyExtractor={a => a.id}
        isLoading={loading}
        searchPlaceholder="Cari NISN siswa, nama siswa, atau nama wali..."
        searchFilter={(a, q) =>
          a.nisn.includes(q) ||
          a.nama_siswa.toLowerCase().includes(q) ||
          a.nama_wali.toLowerCase().includes(q)
        }
        emptyTitle="Tidak Ada Akun Orang Tua"
        emptyMessage="Belum ada akun orang tua yang sesuai dengan filter atau pencarian."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <FilterDropdown
              value={statusFilter}
              onChange={setStatusFilter}
              showFilterIcon
              ariaLabel="Filter Status Akses"
              options={[
                { value: 'all', label: 'Semua Status Akses' },
                { value: 'active', label: 'Akses Aktif' },
                { value: 'inactive', label: 'Belum Aktif / Nonaktif' }
              ]}
            />
            <FilterDropdown
              value={kelasFilter}
              onChange={setKelasFilter}
              ariaLabel="Filter Kelas"
              options={[
                { value: 'all', label: 'Semua Kelas' },
                ...CLASS_ROSTER.map(c => ({ value: c, label: `Kelas ${c}` }))
              ]}
            />
            {(statusFilter !== 'all' || kelasFilter !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setStatusFilter('all');
                  setKelasFilter('all');
                }}
                className="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-[#101D35] bg-slate-100 hover:bg-slate-200 rounded-xl inline-flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            )}
          </div>
        }
      />

      <ParentAccountModal
        isOpen={isModalOpen}
        account={selectedAccount}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedAccount(null);
        }}
        onActivate={handleActivate}
      />

      <ConfirmationModal
        isOpen={Boolean(accountToToggle)}
        title="Konfirmasi Perubahan Status Akun"
        message={`Apakah Anda yakin ingin menonaktifkan akun orang tua untuk siswa ${accountToToggle?.nama_siswa} (NISN: ${accountToToggle?.nisn})? Orang tua tidak akan dapat login sampai diaktifkan kembali.`}
        confirmText="Nonaktifkan Akun"
        isDanger={true}
        onClose={() => setAccountToToggle(null)}
        onConfirm={handleToggleConfirm}
      />
    </div>
  );
};
