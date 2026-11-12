import { useState, useEffect } from 'react';
import { SchoolProfile } from '../types';
import { SCHOOL_CONFIG } from '../config/school';
import { getSupabase, isSupabaseConfigured } from './supabase';

const STORAGE_KEY = 'sipds_school_profile';
const EVENT_NAME = 'sipds_school_profile_updated';

export const DEFAULT_SCHOOL_PROFILE: SchoolProfile = {
  nama_sekolah: 'SMP BHINNEKA TUNGGAL IKA',
  npsn: '20108921',
  status_akreditasi: 'Akreditasi A (Unggul)',
  bentuk_pendidikan: 'Sekolah Menengah Pertama (SMP)',
  semester_aktif: 'Semester Ganjil',
  tahun_ajaran: '2026/2027',
  alamat: 'Jl. Bhinneka Karya No. 45, Kebayoran Baru, Jakarta Selatan, DKI Jakarta 12160',
  telepon: '(021) 7234567',
  email_resmi: 'tatausaha@smpbhinneka.sch.id',
  website: 'https://smpbhinneka.sch.id',
  kepala_sekolah: 'Drs. H. Bambang Sudarmono, M.Pd.',
  nip_kepala_sekolah: '196807151994031004',
  logo_url: ''
};

let hasHydratedFromSupabase = false;
let hydrationPromise: Promise<SchoolProfile> | null = null;

function syncSchoolConfigGlobal(profile: SchoolProfile) {
  Object.assign(SCHOOL_CONFIG, profile);
}

export function getSchoolProfile(): SchoolProfile {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_SCHOOL_PROFILE };
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const merged: SchoolProfile = {
        ...DEFAULT_SCHOOL_PROFILE,
        ...parsed
      };
      syncSchoolConfigGlobal(merged);
      return merged;
    }
  } catch (e) {
    console.error('Failed to parse school profile from storage:', e);
  }

  syncSchoolConfigGlobal(DEFAULT_SCHOOL_PROFILE);
  return { ...DEFAULT_SCHOOL_PROFILE };
}

async function persistSchoolProfileToSupabase(profile: SchoolProfile): Promise<void> {
  if (!isSupabaseConfigured) return;
  const supabase = getSupabase();
  if (!supabase) return;

  try {
    const serialized = JSON.stringify(profile);
    const { error } = await supabase.from('audit_logs').insert([
      {
        actor_name: 'Admin Sekolah',
        actor_role: 'super_admin',
        actor_type: 'admin',
        action: 'SCHOOL_PROFILE_CONFIG',
        target_table: 'school_profile',
        new_values: profile as unknown as Record<string, unknown>,
        details: serialized
      }
    ]);

    if (error) {
      // Fallback if new_values column does not exist in older audit_logs schema
      await supabase.from('audit_logs').insert([
        {
          actor_name: 'Admin Sekolah',
          actor_role: 'super_admin',
          actor_type: 'admin',
          action: 'SCHOOL_PROFILE_CONFIG',
          target_table: 'school_profile',
          details: serialized
        }
      ]);
    }
  } catch (err) {
    console.error('Failed to persist school profile to Supabase:', err);
  }
}

export async function hydrateSchoolProfileFromSupabase(force = false): Promise<SchoolProfile> {
  if (!isSupabaseConfigured) return getSchoolProfile();
  if (hasHydratedFromSupabase && !force) return getSchoolProfile();
  if (hydrationPromise && !force) return hydrationPromise;

  hydrationPromise = (async () => {
    const supabase = getSupabase();
    if (!supabase) return getSchoolProfile();

    let baseProfile = getSchoolProfile();
    let updatedFromRemote = false;

    try {
      // 1. Load latest saved SCHOOL_PROFILE_CONFIG from Supabase audit_logs
      const { data: configRows } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('action', 'SCHOOL_PROFILE_CONFIG')
        .order('created_at', { ascending: false })
        .limit(1);

      const latestRow = configRows?.[0] as Record<string, unknown> | undefined;
      if (latestRow) {
        let remoteProfile: Partial<SchoolProfile> | null = null;
        if (latestRow.new_values && typeof latestRow.new_values === 'object') {
          remoteProfile = latestRow.new_values as Partial<SchoolProfile>;
        } else if (latestRow.new_data && typeof latestRow.new_data === 'object') {
          remoteProfile = latestRow.new_data as Partial<SchoolProfile>;
        } else if (typeof latestRow.details === 'string' && latestRow.details.trim().startsWith('{')) {
          try {
            remoteProfile = JSON.parse(latestRow.details);
          } catch {
            remoteProfile = null;
          }
        }

        if (remoteProfile && remoteProfile.nama_sekolah) {
          baseProfile = {
            ...DEFAULT_SCHOOL_PROFILE,
            ...baseProfile,
            ...remoteProfile
          };
          updatedFromRemote = true;
        }
      }

      // 2. Sync active academic year from academic_years table
      const { data: ayRows } = await supabase
        .from('academic_years')
        .select('*')
        .order('tahun_ajaran', { ascending: false });

      if (ayRows && ayRows.length > 0) {
        const activeRow =
          ayRows.find((r: Record<string, unknown>) => Boolean(r.is_active)) ||
          ayRows.find((r: Record<string, unknown>) => !r.is_archived) ||
          ayRows[0];

        if (activeRow && activeRow.tahun_ajaran) {
          const activeTa = String(activeRow.tahun_ajaran).trim();
          const rawSem = String(activeRow.semester || 'Ganjil').trim();
          const formattedSem = rawSem.toLowerCase().startsWith('semester')
            ? rawSem
            : `Semester ${rawSem}`;

          if (baseProfile.tahun_ajaran !== activeTa || baseProfile.semester_aktif !== formattedSem) {
            baseProfile = {
              ...baseProfile,
              tahun_ajaran: activeTa,
              semester_aktif: formattedSem
            };
            updatedFromRemote = true;
          }
        }
      }

      hasHydratedFromSupabase = true;

      if (updatedFromRemote && typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(baseProfile));
        syncSchoolConfigGlobal(baseProfile);
        window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: baseProfile }));
      }
    } catch (err) {
      console.error('Failed to hydrate school profile from Supabase:', err);
    } finally {
      hydrationPromise = null;
    }

    return baseProfile;
  })();

  return hydrationPromise;
}

export function saveSchoolProfile(
  updates: Partial<SchoolProfile>,
  options?: { skipSupabasePersist?: boolean }
): SchoolProfile {
  const current = getSchoolProfile();
  const updated: SchoolProfile = {
    ...current,
    ...updates
  };

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      syncSchoolConfigGlobal(updated);
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: updated }));
    } catch (e) {
      console.error('Failed to save school profile to storage:', e);
    }
  }

  if (!options?.skipSupabasePersist) {
    void persistSchoolProfileToSupabase(updated);
  }

  return updated;
}

export function resetSchoolProfile(): SchoolProfile {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_SCHOOL_PROFILE));
      syncSchoolConfigGlobal(DEFAULT_SCHOOL_PROFILE);
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: DEFAULT_SCHOOL_PROFILE }));
    } catch (e) {
      console.error('Failed to reset school profile:', e);
    }
  }
  void persistSchoolProfileToSupabase(DEFAULT_SCHOOL_PROFILE);
  return { ...DEFAULT_SCHOOL_PROFILE };
}

export function useSchoolProfile(): {
  profile: SchoolProfile;
  updateProfile: (updates: Partial<SchoolProfile>) => SchoolProfile;
  resetProfile: () => SchoolProfile;
} {
  const [profile, setProfile] = useState<SchoolProfile>(() => getSchoolProfile());

  useEffect(() => {
    const handleUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<SchoolProfile>;
      if (customEvent.detail) {
        setProfile(customEvent.detail);
      } else {
        setProfile(getSchoolProfile());
      }
    };

    window.addEventListener(EVENT_NAME, handleUpdate);

    if (!hasHydratedFromSupabase) {
      void hydrateSchoolProfileFromSupabase();
    }

    return () => {
      window.removeEventListener(EVENT_NAME, handleUpdate);
    };
  }, []);

  return {
    profile,
    updateProfile: saveSchoolProfile,
    resetProfile: resetSchoolProfile
  };
}
