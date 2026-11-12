import React from 'react';
import { StudentStatus, AdminRole, ChangeRequestStatus } from '../../types';

export interface ZeroPillBadgeProps {
  status?:
    | StudentStatus
    | ChangeRequestStatus
    | 'masuk'
    | 'keluar'
    | 'diproses'
    | 'selesai'
    | 'dibatalkan'
    | 'active_account'
    | 'inactive_account'
    | 'mutasi'
    | 'naik_kelas'
    | 'pindah_rombel'
    | 'tinggal_kelas'
    | 'completed'
    | 'failed'
    | 'partial'
    | 'processing'
    | string;
  role?: AdminRole;
  label?: string;
  customLabel?: string;
}

export const ZeroPillBadge: React.FC<ZeroPillBadgeProps> = ({
  status,
  role,
  label,
  customLabel
}) => {
  if (role) {
    const roleMap: Record<AdminRole, { label: string; classes: string; dot: string }> = {
      super_admin: {
        label: 'SUPER ADMIN',
        classes: 'bg-[#EEF3FF] text-[#315FEA] border-[#315FEA]/25',
        dot: 'bg-[#315FEA]'
      },
      admin: {
        label: 'ADMIN TU',
        classes: 'bg-[#EEF2FF] text-[#6366F1] border-[#6366F1]/25',
        dot: 'bg-[#6366F1]'
      },
      operator: {
        label: 'OPERATOR',
        classes: 'bg-[#ECFDF5] text-[#059669] border-[#10B981]/25',
        dot: 'bg-[#10B981]'
      },
      viewer: {
        label: 'VIEWER',
        classes: 'bg-slate-100 text-slate-700 border-slate-200',
        dot: 'bg-slate-500'
      }
    };

    const config = roleMap[role];
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[11px] font-semibold border whitespace-nowrap ${config.classes}`}
      >
        <span className={`w-1.5 h-1.5 rounded-xs ${config.dot}`} />
        {customLabel || label || config.label}
      </span>
    );
  }

  const statusMap: Record<string, { label: string; classes: string; dot: string }> = {
    aktif: {
      label: 'Aktif',
      classes: 'bg-[#ECFDF5] text-[#059669] border-[#10B981]/25',
      dot: 'bg-[#10B981]'
    },
    mutasi_masuk: {
      label: 'Mutasi Masuk',
      classes: 'bg-[#EEF3FF] text-[#315FEA] border-[#315FEA]/25',
      dot: 'bg-[#315FEA]'
    },
    mutasi_keluar: {
      label: 'Mutasi Keluar',
      classes: 'bg-[#FFFBEB] text-[#D97706] border-[#F59E0B]/30',
      dot: 'bg-[#F59E0B]'
    },
    mutasi: {
      label: 'Mutasi',
      classes: 'bg-[#FFFBEB] text-[#D97706] border-[#F59E0B]/30',
      dot: 'bg-[#F59E0B]'
    },
    naik_kelas: {
      label: 'Naik Kelas',
      classes: 'bg-[#EEF3FF] text-[#315FEA] border-[#315FEA]/25',
      dot: 'bg-[#315FEA]'
    },
    pindah_rombel: {
      label: 'Pindah Rombel',
      classes: 'bg-[#EEF2FF] text-[#6366F1] border-[#6366F1]/25',
      dot: 'bg-[#6366F1]'
    },
    tinggal_kelas: {
      label: 'Tinggal Kelas',
      classes: 'bg-[#FFFBEB] text-[#D97706] border-[#F59E0B]/30',
      dot: 'bg-[#F59E0B]'
    },
    lulus: {
      label: 'Lulus',
      classes: 'bg-[#EEF2FF] text-[#6366F1] border-[#6366F1]/25',
      dot: 'bg-[#6366F1]'
    },
    non_aktif: {
      label: 'Arsip / Non-Aktif',
      classes: 'bg-slate-100 text-slate-600 border-slate-200',
      dot: 'bg-slate-400'
    },
    draft: {
      label: 'Draft',
      classes: 'bg-slate-100 text-slate-700 border-slate-200',
      dot: 'bg-slate-500'
    },
    pending: {
      label: 'Menunggu Verifikasi',
      classes: 'bg-[#FFFBEB] text-[#D97706] border-[#F59E0B]/30',
      dot: 'bg-[#F59E0B]'
    },
    partially_approved: {
      label: 'Disetujui Sebagian',
      classes: 'bg-[#EEF3FF] text-[#315FEA] border-[#315FEA]/25',
      dot: 'bg-[#315FEA]'
    },
    approved: {
      label: 'Disetujui',
      classes: 'bg-[#ECFDF5] text-[#059669] border-[#10B981]/25',
      dot: 'bg-[#10B981]'
    },
    rejected: {
      label: 'Ditolak',
      classes: 'bg-[#FEF2F2] text-[#DC2626] border-[#EF4444]/25',
      dot: 'bg-[#EF4444]'
    },
    cancelled: {
      label: 'Dibatalkan',
      classes: 'bg-slate-100 text-slate-600 border-slate-200',
      dot: 'bg-slate-400'
    },
    masuk: {
      label: 'Mutasi Masuk',
      classes: 'bg-[#EEF3FF] text-[#315FEA] border-[#315FEA]/25',
      dot: 'bg-[#315FEA]'
    },
    keluar: {
      label: 'Mutasi Keluar',
      classes: 'bg-[#FFFBEB] text-[#D97706] border-[#F59E0B]/30',
      dot: 'bg-[#F59E0B]'
    },
    diproses: {
      label: 'Diproses',
      classes: 'bg-[#FFFBEB] text-[#D97706] border-[#F59E0B]/30',
      dot: 'bg-[#F59E0B]'
    },
    processing: {
      label: 'Diproses',
      classes: 'bg-[#FFFBEB] text-[#D97706] border-[#F59E0B]/30',
      dot: 'bg-[#F59E0B]'
    },
    selesai: {
      label: 'Selesai',
      classes: 'bg-[#ECFDF5] text-[#059669] border-[#10B981]/25',
      dot: 'bg-[#10B981]'
    },
    completed: {
      label: 'Selesai',
      classes: 'bg-[#ECFDF5] text-[#059669] border-[#10B981]/25',
      dot: 'bg-[#10B981]'
    },
    partial: {
      label: 'Sebagian',
      classes: 'bg-[#FFFBEB] text-[#D97706] border-[#F59E0B]/30',
      dot: 'bg-[#F59E0B]'
    },
    failed: {
      label: 'Gagal',
      classes: 'bg-[#FEF2F2] text-[#DC2626] border-[#EF4444]/25',
      dot: 'bg-[#EF4444]'
    },
    dibatalkan: {
      label: 'Dibatalkan',
      classes: 'bg-[#FEF2F2] text-[#DC2626] border-[#EF4444]/25',
      dot: 'bg-[#EF4444]'
    },
    active_account: {
      label: 'Aktif Terdaftar',
      classes: 'bg-[#ECFDF5] text-[#059669] border-[#10B981]/25',
      dot: 'bg-[#10B981]'
    },
    inactive_account: {
      label: 'Belum Diaktifkan',
      classes: 'bg-slate-100 text-slate-600 border-slate-200',
      dot: 'bg-slate-400'
    }
  };

  const config = (status && statusMap[status]) || {
    label: status || 'Unknown',
    classes: 'bg-slate-100 text-slate-700 border-slate-200',
    dot: 'bg-slate-400'
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[11px] font-semibold border whitespace-nowrap ${config.classes}`}
    >
      <span className={`w-1.5 h-1.5 rounded-xs ${config.dot}`} />
      {customLabel || label || config.label}
    </span>
  );
};

export const StatusBadge = ZeroPillBadge;
