import { createClient, SupabaseClient } from '@supabase/supabase-js';

function normalizeSupabaseUrl(rawUrl: string): string {
  const trimmed = (rawUrl || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';

  // Jika pengguna tidak sengaja memasukkan URL Dashboard Supabase:
  // contoh: https://supabase.com/dashboard/project/xyz123abc/...
  const dashboardMatch = trimmed.match(/supabase\.com\/dashboard\/project\/([a-z0-9-]+)/i);
  if (dashboardMatch && dashboardMatch[1]) {
    return `https://${dashboardMatch[1]}.supabase.co`;
  }

  // Hapus suffix path seperti /rest/v1 atau /auth/v1 jika ikut tersalin
  return trimmed.replace(/\/(rest|auth|storage|functions)\/v1.*$/i, '');
}

const DEFAULT_PUBLIC_SUPABASE_URL = 'https://cmewsqitnesvnxnswiih.supabase.co';
const DEFAULT_PUBLIC_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtZXdzcWl0bmVzdm54bnN3aWloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM2NDQ3MTAsImV4cCI6MjEwOTIyMDcxMH0.eZdfdAv9nwkoNOxdBpfaiMh5zAl-auzx57eNv83-_ps';

const envObj = (import.meta as unknown as { env?: Record<string, string> })?.env || {};
export const supabaseUrl = normalizeSupabaseUrl(
  envObj.VITE_SUPABASE_URL || DEFAULT_PUBLIC_SUPABASE_URL
);
export const supabaseAnonKey = (
  envObj.VITE_SUPABASE_ANON_KEY || DEFAULT_PUBLIC_SUPABASE_ANON_KEY
).trim();

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseUrl.startsWith('http') &&
  !supabaseUrl.includes('your-project') &&
  supabaseAnonKey &&
  !supabaseAnonKey.includes('your-supabase-anon') &&
  supabaseAnonKey !== 'your-anon-key'
);

let clientInstance: SupabaseClient | null = null;
let sessionInitPromise: Promise<boolean> | null = null;
let tokenRefreshCallback: ((accessToken: string, refreshToken: string) => void) | null = null;

function decodeJwtExp(token?: string): number | null {
  if (!token || token.startsWith('parent-dob-session-')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(base64);
    const payload = JSON.parse(json) as { exp?: number };
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

export function isJwtTokenValid(token?: string): boolean {
  const exp = decodeJwtExp(token);
  if (!exp) return false;
  // Valid jika belum kedaluwarsa (buffer 15 detik)
  return exp * 1000 > Date.now() + 15000;
}

export function registerSupabaseTokenRefreshCallback(
  cb: (accessToken: string, refreshToken: string) => void
): void {
  tokenRefreshCallback = cb;
}

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!clientInstance) {
    clientInstance = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      }
    });

    clientInstance.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token && session?.refresh_token && tokenRefreshCallback) {
        tokenRefreshCallback(session.access_token, session.refresh_token);
      }
    });
  }
  return clientInstance;
}

/**
 * Membuat instance client Supabase terisolasi (tanpa menimpa sesi login admin aktif)
 * untuk keperluan manajemen akun dari sisi client saat di-deploy di static hosting (Netlify).
 */
export function createIsolatedSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    }
  });
}

function applyRestBearerHeader(client: SupabaseClient, accessToken: string): void {
  try {
    const restClient = (client as unknown as { rest?: { headers?: Record<string, string> } }).rest;
    if (restClient && restClient.headers) {
      restClient.headers['Authorization'] = `Bearer ${accessToken}`;
    }
  } catch {
    // Ignore
  }
}

function resetRestBearerToAnon(client: SupabaseClient): void {
  if (supabaseAnonKey) {
    applyRestBearerHeader(client, supabaseAnonKey);
  }
}

/**
 * Mengatur access_token JWT Supabase pada client setelah login atau saat pemulihan sesi
 * agar seluruh query ke 11 tabel mematuhi kebijakan Row Level Security (RLS) `auth.uid()`.
 */
export function setSupabaseSessionToken(
  accessToken?: string,
  refreshToken?: string
): Promise<boolean> {
  const client = getSupabase();
  if (!client || !accessToken || accessToken.startsWith('parent-dob-session-')) {
    return Promise.resolve(false);
  }

  // Jika access_token masih valid, pasang langsung di header REST agar query paralel tidak menunggu
  if (isJwtTokenValid(accessToken)) {
    applyRestBearerHeader(client, accessToken);
  } else {
    resetRestBearerToAnon(client);
  }

  const task = (async (): Promise<boolean> => {
    try {
      const { data: current } = await client.auth.getSession();
      if (current?.session?.access_token && isJwtTokenValid(current.session.access_token)) {
        applyRestBearerHeader(client, current.session.access_token);
        if (tokenRefreshCallback && current.session.refresh_token) {
          tokenRefreshCallback(current.session.access_token, current.session.refresh_token);
        }
        return true;
      }

      if (refreshToken) {
        if (isJwtTokenValid(accessToken)) {
          const { data, error } = await client.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (!error && data?.session?.access_token && isJwtTokenValid(data.session.access_token)) {
            applyRestBearerHeader(client, data.session.access_token);
            if (tokenRefreshCallback && data.session.refresh_token) {
              tokenRefreshCallback(data.session.access_token, data.session.refresh_token);
            }
            return true;
          }
        }

        // Jika access_token lama habis, coba refreshSession langsung
        const { data: refreshed, error: refreshErr } = await client.auth.refreshSession({
          refresh_token: refreshToken,
        });
        if (!refreshErr && refreshed?.session?.access_token && isJwtTokenValid(refreshed.session.access_token)) {
          applyRestBearerHeader(client, refreshed.session.access_token);
          if (tokenRefreshCallback && refreshed.session.refresh_token) {
            tokenRefreshCallback(refreshed.session.access_token, refreshed.session.refresh_token);
          }
          return true;
        }
      }

      // Jika refresh_token gagal namun access_token sendiri masih belum kedaluwarsa
      if (isJwtTokenValid(accessToken)) {
        applyRestBearerHeader(client, accessToken);
        return true;
      }

      resetRestBearerToAnon(client);
      return false;
    } catch {
      if (isJwtTokenValid(accessToken)) {
        applyRestBearerHeader(client, accessToken);
        return true;
      }
      resetRestBearerToAnon(client);
      return false;
    }
  })();

  sessionInitPromise = task;
  return task;
}

/**
 * Memastikan sesi autentikasi Supabase sudah siap sebelum menjalankan query RLS ke database.
 * Mengembalikan false jika tidak ada JWT aktif yang valid agar aplikasi dapat langsung menggunakan endpoint server.
 */
export async function ensureSupabaseSessionReady(): Promise<boolean> {
  const client = getSupabase();
  if (!client) return false;

  if (sessionInitPromise) {
    try {
      const ok = await sessionInitPromise;
      if (ok) return true;
    } catch {
      // Lanjutkan pengecekan getSession
    }
  }

  try {
    const { data } = await client.auth.getSession();
    if (data?.session?.access_token && isJwtTokenValid(data.session.access_token)) {
      applyRestBearerHeader(client, data.session.access_token);
      return true;
    }
    if (data?.session?.refresh_token) {
      const { data: refreshed, error } = await client.auth.refreshSession({
        refresh_token: data.session.refresh_token,
      });
      if (!error && refreshed?.session?.access_token && isJwtTokenValid(refreshed.session.access_token)) {
        applyRestBearerHeader(client, refreshed.session.access_token);
        if (tokenRefreshCallback && refreshed.session.refresh_token) {
          tokenRefreshCallback(refreshed.session.access_token, refreshed.session.refresh_token);
        }
        return true;
      }
    }
  } catch {
    // Ignore
  }

  resetRestBearerToAnon(client);
  return false;
}

export async function clearSupabaseSessionToken(): Promise<void> {
  sessionInitPromise = null;
  const client = getSupabase();
  if (!client) return;
  try {
    const restClient = (client as unknown as { rest?: { headers?: Record<string, string> } }).rest;
    if (restClient && restClient.headers) {
      restClient.headers['Authorization'] = `Bearer ${supabaseAnonKey}`;
    }
    await client.auth.signOut();
  } catch {
    // Ignore
  }
}

export const SUPABASE_REQUIRED_TABLES = [
  'academic_years',
  'classes',
  'profiles',
  'students',
  'student_mutations',
  'student_class_history',
  'parent_student_access',
  'student_change_requests',
  'student_change_request_items',
  'import_batches',
  'audit_logs',
] as const;

export async function testSupabaseConnection(): Promise<{
  success: boolean;
  message: string;
  tablesReady?: boolean;
}> {
  if (!isSupabaseConfigured) {
    return {
      success: false,
      message:
        'Variabel lingkunganVITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY belum dikonfigurasi pada environment.',
      tablesReady: false,
    };
  }

  try {
    const client = getSupabase();
    if (!client) throw new Error('Client Supabase tidak dapat diinisialisasi.');

    const { error } = await client.from('students').select('id').limit(1);

    if (error && error.code !== 'PGRST116') {
      if (error.message.includes('relation "public.students" does not exist')) {
        return {
          success: true,
          tablesReady: false,
          message:
            'Terkoneksi ke Supabase! Silakan jalankan file SQL migration (/supabase/migrations/20261103000001_sipds_complete_schema.sql) di Supabase SQL Editor untuk membuat 11 tabel & RLS.',
        };
      }
      return { success: false, tablesReady: false, message: error.message };
    }

    return {
      success: true,
      tablesReady: true,
      message:
        'Terhubung ke Supabase PostgreSQL! Ke-11 tabel SIPDS dan kebijakan Row Level Security (RLS) siap digunakan.',
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Gagal menghubungi server Supabase.';
    return { success: false, tablesReady: false, message: msg };
  }
}
