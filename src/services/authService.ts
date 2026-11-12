import { AdminUser, ParentUser, AuthUser, AdminRole } from '../types';
import {
  getSupabase,
  isSupabaseConfigured,
  setSupabaseSessionToken,
  clearSupabaseSessionToken,
  registerSupabaseTokenRefreshCallback,
  isJwtTokenValid
} from './supabase';
import { isBirthDatePasswordMatch, formatDateDMY } from '../utils/formatters';

const SESSION_KEY = 'sipds_auth_session';
export const PARENT_STUDENT_CACHE_KEY = 'sipds_parent_student_cache';

export interface AuthSession {
  token: string;
  refresh_token?: string;
  user: AuthUser;
}

let currentSession: AuthSession | null = null;
const listeners = new Set<(session: AuthSession | null) => void>();

function notify() {
  listeners.forEach(fn => fn(currentSession));
}

function saveSessionToStorage(session: AuthSession | null): void {
  try {
    if (session) {
      const serialized = JSON.stringify(session);
      sessionStorage.setItem(SESSION_KEY, serialized);
      localStorage.setItem(SESSION_KEY, serialized);
    } else {
      sessionStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(PARENT_STUDENT_CACHE_KEY);
    }
  } catch {
    // Ignore storage issues
  }
}

registerSupabaseTokenRefreshCallback((newAccessToken, newRefreshToken) => {
  if (currentSession) {
    currentSession = {
      ...currentSession,
      token: newAccessToken,
      refresh_token: newRefreshToken
    };
    saveSessionToStorage(currentSession);
  }
});

try {
  const stored = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
  if (stored) {
    currentSession = JSON.parse(stored);
    if (currentSession?.token) {
      setSupabaseSessionToken(currentSession.token, currentSession.refresh_token).then(
        async isSessionValid => {
          // Jika sesi admin berasal dari hari sebelumnya dan JWT sudah kedaluwarsa serta refresh_token tidak lagi valid
          if (
            !isSessionValid &&
            currentSession?.user?.type === 'admin' &&
            !isJwtTokenValid(currentSession.token)
          ) {
            try {
              const res = await fetch('/api/supabase/status');
              const parsed = await safeParseJsonResponse<{ hasServiceKey?: boolean }>(res);
              if (parsed.isJson && parsed.data?.hasServiceKey) {
                return;
              }
            } catch {
              // Ignore
            }
            // Bersihkan sesi yang sudah kedaluwarsa agar admin dapat login ulang dengan token baru yang segar
            currentSession = null;
            saveSessionToStorage(null);
            notify();
          }
        }
      );
    }
  }
} catch {
  // Session storage unavailable or restricted
}

export function getSession(): AuthSession | null {
  return currentSession;
}

export function subscribeAuth(callback: (session: AuthSession | null) => void): () => void {
  listeners.add(callback);
  callback(currentSession);
  return () => {
    listeners.delete(callback);
  };
}

function buildInternalParentAuthEmail(nisn: string): string {
  return `ortu.${nisn}@auth-internal.smpbhinneka.sch.id`;
}

/**
 * Mengekstrak JSON secara aman dari Response HTTP tanpa pernah melempar
 * "Unexpected token '<', '<html><hea'... is not valid JSON" ketika host statis (Netlify)
 * atau proxy mengembalikan halaman HTML.
 */
export async function safeParseJsonResponse<T = Record<string, unknown>>(
  response: Response
): Promise<{ isJson: boolean; data: T | null; rawText: string }> {
  const rawText = await response.text();
  const trimmed = rawText.trim();
  if (!trimmed || trimmed.startsWith('<')) {
    return { isJson: false, data: null, rawText };
  }
  try {
    return { isJson: true, data: JSON.parse(trimmed) as T, rawText };
  } catch {
    return { isJson: false, data: null, rawText };
  }
}

function formatSupabaseNetworkError(err: unknown, fallbackMessage: string): string {
  const msg = err instanceof Error ? err.message : String(err || '');
  if (msg.includes("Unexpected token '<'") || msg.includes('is not valid JSON')) {
    return (
      'Konfigurasi URL Supabase mengembalikan halaman HTML, bukan JSON. ' +
      'Pastikan VITE_SUPABASE_URL diisi dengan Project URL Supabase (format: https://<project-id>.supabase.co), ' +
      'bukan URL Dashboard Supabase atau URL website aplikasi.'
    );
  }
  return msg || fallbackMessage;
}

function persistAndNotifySession(session: AuthSession): void {
  currentSession = session;
  saveSessionToStorage(session);
  notify();
}

export async function loginAdmin(identifier: string, password: string): Promise<AdminUser> {
  const cleanIdentifier = identifier.trim().toLowerCase();
  if (!cleanIdentifier || !password) {
    throw new Error('Username/Email dan Password wajib diisi.');
  }

  // 1. Jika client Supabase langsung dikonfigurasi (mendukung penuh Netlify & AI Studio)
  const supabase = getSupabase();
  if (isSupabaseConfigured && supabase) {
    try {
      let emailToLogin = cleanIdentifier;

      // Jika pengguna memasukkan username (tanpa @), coba cari email dari tabel profiles
      if (!emailToLogin.includes('@')) {
        const { data: profileByUser } = await supabase
          .from('profiles')
          .select('email')
          .ilike('username', emailToLogin)
          .maybeSingle();

        if (profileByUser?.email) {
          emailToLogin = String(profileByUser.email).trim().toLowerCase();
        }
      }

      if (emailToLogin.includes('@')) {
        const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
          email: emailToLogin,
          password: String(password)
        });

        if (authErr) {
          throw new Error(
            formatSupabaseNetworkError(
              authErr,
              'Email/Username atau password admin tidak valid.'
            )
          );
        }

        if (authData?.user && authData?.session) {
          await setSupabaseSessionToken(
            authData.session.access_token,
            authData.session.refresh_token
          );

          let { data: profile, error: profileErr } = await supabase
            .from('profiles')
            .select('id, email, username, full_name, role, is_active')
            .eq('id', authData.user.id)
            .maybeSingle();

          // Jika user baru saja dibuat di Supabase Authentication -> Users dan belum ada baris di public.profiles
          if (
            !profile &&
            !profileErr &&
            !emailToLogin.endsWith('@auth-internal.smpbhinneka.sch.id')
          ) {
            const metaRole = String(authData.user.user_metadata?.role || '');
            const assignedRole: AdminRole = ['super_admin', 'admin', 'operator', 'viewer'].includes(
              metaRole
            )
              ? (metaRole as AdminRole)
              : 'super_admin';

            const defaultUsername = String(
              authData.user.user_metadata?.username || emailToLogin.split('@')[0]
            )
              .trim()
              .toLowerCase();
            const defaultFullName = String(
              authData.user.user_metadata?.full_name || 'Super Admin (Tata Usaha)'
            ).trim();

            const { data: createdProfile } = await supabase
              .from('profiles')
              .upsert({
                id: authData.user.id,
                email: emailToLogin,
                username: defaultUsername,
                full_name: defaultFullName,
                role: assignedRole,
                is_active: true
              })
              .select('id, email, username, full_name, role, is_active')
              .maybeSingle();

            if (createdProfile) {
              profile = createdProfile;
            }
          }

          if (profile) {
            if (!profile.is_active) {
              await clearSupabaseSessionToken();
              throw new Error('Akun admin Anda sedang dinonaktifkan.');
            }

            if (!['super_admin', 'admin', 'operator', 'viewer'].includes(profile.role)) {
              await clearSupabaseSessionToken();
              throw new Error(
                'Akun ini bukan akun staf/admin. Silakan gunakan halaman Login Orang Tua.'
              );
            }

            const nowIso = new Date().toISOString();
            await supabase
              .from('profiles')
              .update({ last_login_at: nowIso })
              .eq('id', profile.id);

            await supabase.from('audit_logs').insert({
              actor_id: profile.id,
              actor_name: profile.full_name,
              actor_role: profile.role,
              actor_type: 'admin',
              action: 'ADMIN_LOGIN',
              target_table: 'profiles',
              target_id: profile.id,
              details: `Login berhasil ke portal admin oleh ${profile.full_name} (${profile.role}).`
            });

            const adminUser: AdminUser = {
              id: profile.id,
              email: profile.email || emailToLogin,
              username: profile.username || emailToLogin.split('@')[0],
              nama_lengkap: profile.full_name,
              role: profile.role as AdminRole,
              is_active: Boolean(profile.is_active),
              type: 'admin'
            };

            persistAndNotifySession({
              token: authData.session.access_token,
              refresh_token: authData.session.refresh_token,
              user: adminUser
            });

            return adminUser;
          }
        }
      }
    } catch (directErr: unknown) {
      const msg = formatSupabaseNetworkError(directErr, '');
      // Jika error kredensial/validasi jelas dari Supabase, langsung lempar tanpa memanggil endpoint HTML
      if (
        msg.includes('Invalid login credentials') ||
        msg.includes('Email not confirmed') ||
        msg.includes('dinonaktifkan') ||
        msg.includes('bukan akun staf') ||
        msg.includes('Konfigurasi URL Supabase')
      ) {
        if (msg.includes('Invalid login credentials')) {
          throw new Error('Email/Username atau password admin tidak sesuai.');
        }
        if (msg.includes('Email not confirmed')) {
          throw new Error(
            'Email akun belum dikonfirmasi di Supabase Auth. Aktifkan "Auto Confirm User" atau konfirmasi email di Supabase Dashboard.'
          );
        }
        throw new Error(msg);
      }
    }
  }

  // 2. Fallback melalui endpoint backend `/api/auth/admin-login` (dengan parsing JSON aman)
  let response: Response;
  try {
    response = await fetch('/api/auth/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: cleanIdentifier, password })
    });
  } catch (err: unknown) {
    throw new Error(formatSupabaseNetworkError(err, 'Gagal menghubungi layanan autentikasi.'));
  }

  const parsed = await safeParseJsonResponse<{
    error?: string;
    token?: string;
    refresh_token?: string;
    user?: AdminUser;
  }>(response);

  if (!parsed.isJson || !parsed.data) {
    if (!isSupabaseConfigured) {
      throw new Error(
        'Koneksi Supabase belum dikonfigurasi. Pastikan Environment Variables VITE_SUPABASE_URL (https://<project-id>.supabase.co) dan VITE_SUPABASE_ANON_KEY sudah diatur.'
      );
    }
    throw new Error(
      'Gagal memproses respons login. Jika menggunakan username, silakan masuk menggunakan alamat Email lengkap yang terdaftar di Supabase Authentication (contoh: superadmin@smpbhinneka.sch.id).'
    );
  }

  if (!response.ok || !parsed.data.user || !parsed.data.token) {
    throw new Error(parsed.data.error || 'Gagal masuk sebagai admin.');
  }

  await setSupabaseSessionToken(parsed.data.token, parsed.data.refresh_token);

  persistAndNotifySession({
    token: parsed.data.token,
    refresh_token: parsed.data.refresh_token,
    user: parsed.data.user
  });

  return parsed.data.user;
}

export async function loginParent(nisn: string, password: string): Promise<ParentUser> {
  const cleanNisn = nisn.trim().replace(/\D/g, '');
  if (cleanNisn.length !== 10) {
    throw new Error('NISN harus terdiri dari 10 digit angka.');
  }

  const cleanPassword = String(password || '').trim();
  if (!cleanPassword) {
    throw new Error('Password (Tanggal Lahir Siswa) wajib diisi.');
  }

  // 1. Coba melalui endpoint server `/api/auth/parent-login` terlebih dahulu (menggunakan Service Role Key jika tersedia)
  try {
    const response = await fetch('/api/auth/parent-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nisn: cleanNisn, password: cleanPassword })
    });

    const parsed = await safeParseJsonResponse<{
      error?: string;
      token?: string;
      refresh_token?: string;
      student?: Record<string, unknown> | null;
      user?: ParentUser;
    }>(response);

    if (parsed.isJson && parsed.data) {
      if (response.ok && parsed.data.user && parsed.data.token) {
        if (parsed.data.student) {
          try {
            sessionStorage.setItem(
              PARENT_STUDENT_CACHE_KEY,
              JSON.stringify(parsed.data.student)
            );
          } catch {
            // Ignore
          }
        }

        if (!parsed.data.token.startsWith('parent-dob-session-')) {
          await setSupabaseSessionToken(parsed.data.token, parsed.data.refresh_token);
        }

        persistAndNotifySession({
          token: parsed.data.token,
          refresh_token: parsed.data.refresh_token,
          user: parsed.data.user
        });

        return parsed.data.user;
      }

      // Jika server memberikan error validasi spesifik (401 / 403 / 404)
      if (response.status === 401 || response.status === 403 || response.status === 404) {
        throw new Error(parsed.data.error || 'Gagal masuk sebagai orang tua.');
      }
    }
  } catch (serverErr: unknown) {
    const msg = serverErr instanceof Error ? serverErr.message : '';
    if (
      msg.includes('tidak ditemukan') ||
      msg.includes('tidak sesuai') ||
      msg.includes('dinonaktifkan')
    ) {
      throw serverErr;
    }
    // Jika endpoint tidak tersedia (mis. static hosting Netlify), lanjutkan ke pengecekan Supabase langsung
  }

  // 2. Jika client Supabase dikonfigurasi, periksa NISN & Tanggal Lahir Siswa secara langsung
  const supabase = getSupabase();
  if (isSupabaseConfigured && supabase) {
    try {
      const { data: studentRows, error: studentErr } = await supabase
        .from('students')
        .select('*')
        .eq('nisn', cleanNisn)
        .limit(1);

      const student = studentRows?.[0] as Record<string, unknown> | undefined;

      if (!studentErr && student) {
        const { data: accessRows } = await supabase
          .from('parent_student_access')
          .select('id, user_id, profile_id, student_id, nisn, nama_wali, no_hp_wali, is_active, activated_at')
          .eq('nisn', cleanNisn)
          .limit(1);

        const accessRecord = accessRows?.[0] as Record<string, unknown> | undefined;

        if (accessRecord && accessRecord.is_active === false && accessRecord.activated_at) {
          throw new Error(
            'Akun orang tua dengan NISN ini sedang dinonaktifkan oleh Admin Sekolah. Silakan hubungi Tata Usaha.'
          );
        }

        // Cek apakah password sesuai dengan Tanggal Lahir Siswa (dd-mm-yyyy / ddmmyyyy / yyyy-mm-dd)
        if (isBirthDatePasswordMatch(cleanPassword, student.tanggal_lahir)) {
          try {
            sessionStorage.setItem(PARENT_STUDENT_CACHE_KEY, JSON.stringify(student));
          } catch {
            // Ignore
          }

          const nowIso = new Date().toISOString();
          if (accessRecord?.id) {
            await supabase
              .from('parent_student_access')
              .update({ last_login_at: nowIso, is_active: true })
              .eq('id', String(accessRecord.id));
          }

          const waliName =
            String(accessRecord?.nama_wali || '').trim() ||
            (student.nama_wali && String(student.nama_wali).trim() !== '-'
              ? String(student.nama_wali).trim()
              : '') ||
            (student.nama_ayah && String(student.nama_ayah).trim() !== '-'
              ? String(student.nama_ayah).trim()
              : '') ||
            (student.nama_ibu_kandung && String(student.nama_ibu_kandung).trim() !== '-'
              ? String(student.nama_ibu_kandung).trim()
              : '') ||
            `Orang Tua ${String(student.nama_lengkap_siswa || '')}`;

          const waliPhone =
            String(accessRecord?.no_hp_wali || '').trim() ||
            String(student.no_hp_wali || student.no_wa_ayah || student.no_wa_ibu || '').trim();

          await supabase.from('audit_logs').insert([
            {
              actor_name: waliName,
              actor_role: 'parent',
              actor_type: 'parent',
              action: 'PARENT_LOGIN',
              target_table: 'students',
              target_id: cleanNisn,
              details: `Login portal orang tua menggunakan Tanggal Lahir berhasil untuk NISN ${cleanNisn} (${String(student.nama_lengkap_siswa || '')}).`
            }
          ]);

          const parentUser: ParentUser = {
            id: String(accessRecord?.profile_id || accessRecord?.id || `parent-${student.id}`),
            siswa_id: String(student.id),
            nisn: cleanNisn,
            nama_wali: waliName,
            no_hp: waliPhone,
            is_active: true,
            type: 'parent'
          };

          persistAndNotifySession({
            token: `parent-dob-session-${cleanNisn}-${Date.now()}`,
            user: parentUser
          });

          return parentUser;
        }
      }

      // 2b. Jika bukan tanggal lahir, dukung juga password kustom yang terdaftar di Supabase Auth
      const internalEmail = buildInternalParentAuthEmail(cleanNisn);
      const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
        email: internalEmail,
        password: cleanPassword
      });

      if (!signInErr && signInData?.session && signInData?.user) {
        await setSupabaseSessionToken(
          signInData.session.access_token,
          signInData.session.refresh_token
        );

        const { data: accessRecord } = await supabase
          .from('parent_student_access')
          .select('id, user_id, profile_id, student_id, nisn, nama_wali, no_hp_wali, is_active')
          .eq('nisn', cleanNisn)
          .maybeSingle();

        if (accessRecord && accessRecord.is_active === false) {
          await clearSupabaseSessionToken();
          throw new Error(
            'Akun orang tua dengan NISN ini sedang dinonaktifkan. Silakan hubungi Tata Usaha.'
          );
        }

        const nowIso = new Date().toISOString();
        if (accessRecord?.id) {
          await supabase
            .from('parent_student_access')
            .update({ last_login_at: nowIso })
            .eq('id', accessRecord.id);
        }

        const parentUser: ParentUser = {
          id: accessRecord?.profile_id || signInData.user.id,
          siswa_id: accessRecord?.student_id || String(student?.id || ''),
          nisn: cleanNisn,
          nama_wali:
            accessRecord?.nama_wali ||
            String(student?.nama_ayah || student?.nama_wali || 'Orang Tua / Wali Siswa'),
          no_hp: accessRecord?.no_hp_wali || String(student?.no_hp_wali || ''),
          is_active: true,
          type: 'parent'
        };

        persistAndNotifySession({
          token: signInData.session.access_token,
          refresh_token: signInData.session.refresh_token,
          user: parentUser
        });

        return parentUser;
      }

      if (student) {
        const expectedHint = student.tanggal_lahir ? formatDateDMY(student.tanggal_lahir) : 'dd-mm-yyyy';
        throw new Error(
          `Password tidak sesuai. Gunakan Tanggal Lahir Siswa dengan format dd-mm-yyyy (contoh: ${expectedHint.replace(/\d{2}-\d{2}-/, 'dd-mm-')}).`
        );
      }

      throw new Error(
        `Siswa dengan NISN ${cleanNisn} tidak ditemukan atau Tanggal Lahir (dd-mm-yyyy) yang dimasukkan tidak sesuai.`
      );
    } catch (directErr: unknown) {
      throw new Error(
        formatSupabaseNetworkError(
          directErr,
          'Gagal memproses login orang tua. Pastikan NISN (10 digit) dan Tanggal Lahir Siswa (dd-mm-yyyy) sudah benar.'
        )
      );
    }
  }

  throw new Error(
    'Gagal memproses login orang tua. Pastikan NISN (10 digit) dan Tanggal Lahir Siswa (dd-mm-yyyy) sudah benar.'
  );
}

export async function changeParentPassword(
  nisn: string,
  oldPassword: string,
  newPassword: string
): Promise<string> {
  const cleanNisn = nisn.trim().replace(/\D/g, '');
  if (String(newPassword).length < 8) {
    throw new Error('Password baru minimal harus 8 karakter.');
  }
  if (String(newPassword).includes(cleanNisn)) {
    throw new Error('Demi keamanan, password baru tidak boleh menggunakan atau mengandung NISN.');
  }

  // 1. Jika Supabase Client terhubung langsung
  const supabase = getSupabase();
  if (isSupabaseConfigured && supabase) {
    const internalEmail = buildInternalParentAuthEmail(cleanNisn);
    const { error: verifyErr } = await supabase.auth.signInWithPassword({
      email: internalEmail,
      password: String(oldPassword)
    });

    if (verifyErr) {
      throw new Error('Password saat ini yang Anda masukkan tidak sesuai.');
    }

    const { error: updateErr } = await supabase.auth.updateUser({
      password: String(newPassword)
    });

    if (updateErr) {
      throw new Error(formatSupabaseNetworkError(updateErr, 'Gagal memperbarui password.'));
    }

    return 'Password akun orang tua berhasil diperbarui di Supabase Auth.';
  }

  // 2. Fallback melalui endpoint server
  const response = await fetch('/api/auth/parent-change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nisn: cleanNisn, oldPassword, newPassword })
  });

  const parsed = await safeParseJsonResponse<{ error?: string; message?: string }>(response);

  if (!parsed.isJson || !parsed.data) {
    throw new Error('Layanan perubahan password tidak merespons dalam format JSON yang valid.');
  }

  if (!response.ok) {
    throw new Error(parsed.data.error || 'Gagal mengubah password akun orang tua.');
  }

  return parsed.data.message || 'Password berhasil diperbarui.';
}

export function logout(): void {
  currentSession = null;
  clearSupabaseSessionToken();
  saveSessionToStorage(null);
  notify();
}
