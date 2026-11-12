import React, { useState, useEffect, useMemo } from 'react';
import { getAuditLogs } from '../../services/dataService';
import { AuditLog } from '../../types';
import { DataTable, Column } from '../../components/common/ModernTable';
import { PageTitle } from '../../components/common/PageTitle';
import { StatisticCard } from '../../components/common/StatCard';
import { FilterDropdown } from '../../components/common/FilterDropdown';
import {
  Shield,
  Calendar,
  ArrowRight,
  Activity,
  UserCheck,
  AlertCircle,
  RefreshCw,
  RotateCcw
} from 'lucide-react';

export const AuditLogPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [actionFilter, setActionFilter] = useState<string>('all');

  const loadData = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getAuditLogs();
      setLogs(data);
    } catch (err: unknown) {
      setLoadError(
        err instanceof Error ? err.message : 'Gagal memuat riwayat audit log sistem.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const roleOptions = useMemo(() => {
    const set = new Set<string>();
    logs.forEach(l => {
      if (l.user_role) set.add(l.user_role);
    });
    return Array.from(set).sort();
  }, [logs]);

  const actionOptions = useMemo(() => {
    const set = new Set<string>();
    logs.forEach(l => {
      if (l.action) set.add(l.action);
    });
    return Array.from(set).sort();
  }, [logs]);

  const filteredLogs = useMemo(() => {
    return logs.filter(l => {
      if (roleFilter !== 'all' && l.user_role !== roleFilter) return false;
      if (actionFilter !== 'all' && l.action !== actionFilter) return false;
      return true;
    });
  }, [logs, roleFilter, actionFilter]);

  const stats = useMemo(() => {
    const total = logs.length;
    const withDiff = logs.filter(
      l =>
        (l.old_values && Object.keys(l.old_values).length > 0) ||
        (l.new_values && Object.keys(l.new_values).length > 0)
    ).length;
    const uniqueUsers = new Set(logs.map(l => l.user_name)).size;
    return { total, withDiff, uniqueUsers };
  }, [logs]);

  const columns: Column<AuditLog>[] = [
    {
      header: 'Waktu Aktivitas',
      render: l => (
        <div className="flex items-center gap-1.5 font-mono text-slate-700 text-xs">
          <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span>{new Date(l.created_at).toLocaleString('id-ID')}</span>
        </div>
      ),
      className: 'w-44 whitespace-nowrap'
    },
    {
      header: 'Pengguna / Aktor',
      render: l => (
        <div>
          <span className="font-bold text-[#101D35]">{l.user_name}</span>
          <div className="text-[11px] text-slate-500 font-medium">Peran: {l.user_role}</div>
        </div>
      ),
      className: 'w-44'
    },
    {
      header: 'Aksi Sistem',
      render: l => (
        <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded-lg bg-[#315FEA]/10 border border-[#315FEA]/20 text-[#315FEA] whitespace-nowrap">
          {l.action}
        </span>
      ),
      className: 'w-44'
    },
    {
      header: 'Sasaran / Target',
      render: l => (
        <span className="text-xs font-medium text-slate-700">
          {l.target_type} {l.target_id ? `(${l.target_id})` : ''}
        </span>
      ),
      className: 'w-40'
    },
    {
      header: 'Rincian Aktivitas & Nilai Sebelum/Sesudah',
      render: l => {
        const hasDiff =
          (l.old_values && Object.keys(l.old_values).length > 0) ||
          (l.new_values && Object.keys(l.new_values).length > 0);
        const diffKeys = Array.from(
          new Set([
            ...Object.keys(l.old_values || {}),
            ...Object.keys(l.new_values || {})
          ])
        );

        return (
          <div className="space-y-1.5 text-xs">
            <div className="text-slate-700 font-medium">{l.details}</div>
            {hasDiff && (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {diffKeys.map(k => {
                  const beforeVal =
                    l.old_values && l.old_values[k] !== undefined
                      ? String(l.old_values[k])
                      : '-';
                  const afterVal =
                    l.new_values && l.new_values[k] !== undefined
                      ? String(l.new_values[k])
                      : '-';
                  return (
                    <div
                      key={k}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-[11px] font-mono"
                    >
                      <span className="font-bold text-slate-600">{k}:</span>
                      <span className="text-rose-700 line-through">{beforeVal}</span>
                      <ArrowRight className="w-3 h-3 text-slate-400" />
                      <span className="text-emerald-800 font-bold">{afterVal}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      }
    }
  ];

  return (
    <div className="space-y-6">
      <PageTitle
        category="Data, Akun & Sistem"
        title="Audit Log Aktivitas Sistem"
        subtitle="Jejak rekaman kronologis aktivitas operasional kesiswaan bersifat append-only beserta rekaman nilai sebelum dan sesudah perubahan."
        icon={Shield}
        actions={
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-900">
              <Shield className="w-3.5 h-3.5 text-emerald-700" />
              <span>Append-Only (Terkunci)</span>
            </div>
            <button
              type="button"
              onClick={loadData}
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#315FEA]' : ''}`} />
              <span>Muat Ulang</span>
            </button>
          </div>
        }
      />

      {loadError && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-rose-900">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold">Gagal Memuat Audit Log</h4>
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

      {/* KPI Ringkasan Audit Log */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatisticCard
          title="Total Rekaman Audit"
          value={stats.total}
          subtitle="Jejak aktivitas sistem tercatat"
          icon={Shield}
          accent="blue"
        />
        <StatisticCard
          title="Perubahan Nilai Data"
          value={stats.withDiff}
          subtitle="Memuat perbandingan nilai lama & baru"
          icon={Activity}
          accent="indigo"
        />
        <StatisticCard
          title="Aktor / Pengguna Aktif"
          value={stats.uniqueUsers}
          subtitle="Admin, operator, & orang tua"
          icon={UserCheck}
          accent="emerald"
        />
      </div>

      <DataTable
        data={filteredLogs}
        columns={columns}
        keyExtractor={l => l.id}
        isLoading={loading}
        searchPlaceholder="Cari nama pengguna, aksi, sasaran, atau rincian perubahan..."
        searchFilter={(l, q) =>
          Boolean(
            l.user_name.toLowerCase().includes(q) ||
              l.action.toLowerCase().includes(q) ||
              l.details.toLowerCase().includes(q) ||
              (l.target_id && l.target_id.toLowerCase().includes(q))
          )
        }
        emptyTitle="Belum Ada Log Tercatat"
        emptyMessage="Riwayat aktivitas sistem akan muncul di sini setelah ada operasi yang dilakukan."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <FilterDropdown
              value={roleFilter}
              onChange={setRoleFilter}
              showFilterIcon
              ariaLabel="Filter Peran"
              options={[
                { value: 'all', label: 'Semua Peran' },
                ...roleOptions.map(r => ({ value: r, label: `Peran: ${r}` }))
              ]}
            />
            <FilterDropdown
              value={actionFilter}
              onChange={setActionFilter}
              ariaLabel="Filter Aksi Sistem"
              options={[
                { value: 'all', label: 'Semua Aksi Sistem' },
                ...actionOptions.map(a => ({ value: a, label: a }))
              ]}
            />
            {(roleFilter !== 'all' || actionFilter !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setRoleFilter('all');
                  setActionFilter('all');
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
    </div>
  );
};
