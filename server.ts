import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const isProduction = process.env.NODE_ENV === 'production';

app.use(express.json({ limit: '25mb' }));

// ============================================================================
// KONFIGURASI SUPABASE SERVER-SIDE (SERVICE ROLE KEY HANYA BERADA DI SERVER)
// ============================================================================
function normalizeSupabaseUrl(rawUrl: string): string {
  const trimmed = (rawUrl || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  const dashboardMatch = trimmed.match(/supabase\.com\/dashboard\/project\/([a-z0-9-]+)/i);
  if (dashboardMatch && dashboardMatch[1]) {
    return `https://${dashboardMatch[1]}.supabase.co`;
  }
  return trimmed.replace(/\/(rest|auth|storage|functions)\/v1.*$/i, '');
}

function getSupabaseUrl(): string {
  return normalizeSupabaseUrl(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '');
}

function getSupabaseAnonKey(): string {
  return (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();
}

function getSupabaseServiceRoleKey(): string {
  return (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
}

function isSupabaseServerConfigured(): boolean {
  const url = getSupabaseUrl();
  const anon = getSupabaseAnonKey();
  return Boolean(
    url &&
    !url.includes('your-project') &&
    anon &&
    !anon.includes('your-supabase-anon')
  );
}

function getSupabaseAdminClient(): SupabaseClient | null {
  const url = getSupabaseUrl();
  const serviceKey = getSupabaseServiceRoleKey();
  if (!url || !serviceKey || url.includes('your-project') || serviceKey.includes('your-supabase')) {
    return null;
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

function getSupabaseAuthClient(): SupabaseClient | null {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey() || getSupabaseServiceRoleKey();
  if (!url || !key || url.includes('your-project')) {
    return null;
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

/**
 * Menghasilkan identitas email internal Supabase Auth untuk akun Orang Tua berbasis NISN.
 * Email internal ini TIDAK PERNAH dikirimkan atau diekspos ke frontend.
 */
function buildInternalParentAuthEmail(nisn: string): string {
  return `ortu.${nisn}@auth-internal.smpbhinneka.sch.id`;
}

// ============================================================================
// ENDPOINT API SUPABASE & AUTENTIKASI
// ============================================================================

// 1. Cek status konfigurasi Supabase & ketersediaan Service Role Key
app.get('/api/supabase/status', (_req: Request, res: Response) => {
  const supabaseUrl = getSupabaseUrl();
  const configured = isSupabaseServerConfigured();
  const hasServiceKey = Boolean(getSupabaseAdminClient());

  res.json({
    configured,
    supabaseUrl: configured ? supabaseUrl : null,
    hasServiceKey
  });
});

// 2. Ambil isi file SQL Migration lengkap untuk ditampilkan/diunduh di Pengaturan
app.get('/api/supabase/migration-sql', (_req: Request, res: Response) => {
  try {
    const baseMigrationPath = path.resolve(
      process.cwd(),
      'supabase/migrations/20261103000001_sipds_complete_schema.sql'
    );
    const lifecycleMigrationPath = path.resolve(
      process.cwd(),
      'supabase/migrations/20261104000002_sipds_multi_cohort_lifecycle.sql'
    );
    const baseSql = fs.existsSync(baseMigrationPath)
      ? fs.readFileSync(baseMigrationPath, 'utf-8')
      : '';
    const lifecycleSql = fs.existsSync(lifecycleMigrationPath)
      ? '\n\n' + fs.readFileSync(lifecycleMigrationPath, 'utf-8')
      : '';
    res.json({
      sql: baseSql + lifecycleSql,
      lifecycleSql: lifecycleSql.trim()
    });
  } catch {
    res.status(404).json({ error: 'Berkas SQL migration tidak ditemukan.' });
  }
});

// 3. LOGIN ADMIN (Role: super_admin, admin, operator, viewer)
// Menggunakan Supabase Auth + tabel public.profiles
app.post('/api/auth/admin-login', async (req: Request, res: Response) => {
  const { identifier, password } = req.body;

  if (!identifier || !password) {
    res.status(400).json({ error: 'Username/Email dan Password wajib diisi.' });
    return;
  }

  const supabaseAuth = getSupabaseAuthClient();
  const supabaseAdmin = getSupabaseAdminClient();

  if (!supabaseAuth) {
    res.status(503).json({
      error:
        'Koneksi Supabase belum dikonfigurasi. Silakan atur VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, dan SUPABASE_SERVICE_ROLE_KEY pada environment aplikasi.'
    });
    return;
  }

  try {
    let emailToLogin = String(identifier).trim().toLowerCase();

    // Jika login menggunakan username (bukan email), cari email di tabel profiles melalui service role
    if (!emailToLogin.includes('@') && supabaseAdmin) {
      const { data: profileByUser } = await supabaseAdmin
        .from('profiles')
        .select('email, role, is_active')
        .ilike('username', emailToLogin)
        .maybeSingle();

      if (!profileByUser || !profileByUser.email) {
        res.status(401).json({ error: 'Username admin tidak ditemukan.' });
        return;
      }
      emailToLogin = profileByUser.email;
    }

    const { data: authData, error: authErr } = await supabaseAuth.auth.signInWithPassword({
      email: emailToLogin,
      password: String(password)
    });

    if (authErr || !authData.user || !authData.session) {
      res.status(401).json({ error: 'Email/Username atau password admin tidak valid.' });
      return;
    }

    // Ambil profil & verifikasi role dari tabel public.profiles
    const clientForProfile = supabaseAdmin || createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
      global: { headers: { Authorization: `Bearer ${authData.session.access_token}` } }
    });

    let { data: profile, error: profileErr } = await clientForProfile
      .from('profiles')
      .select('id, email, username, full_name, role, is_active')
      .eq('id', authData.user.id)
      .maybeSingle();

    if (!profile && !profileErr && !emailToLogin.endsWith('@auth-internal.smpbhinneka.sch.id')) {
      const metaRole = String(authData.user.user_metadata?.role || '');
      const { count: existingAdminCount } = await clientForProfile
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .in('role', ['super_admin', 'admin']);

      const assignedRole = ['super_admin', 'admin', 'operator', 'viewer'].includes(metaRole)
        ? metaRole
        : (existingAdminCount || 0) === 0
        ? 'super_admin'
        : null;

      if (assignedRole) {
        const defaultUsername = String(
          authData.user.user_metadata?.username || emailToLogin.split('@')[0]
        )
          .trim()
          .toLowerCase();
        const defaultFullName = String(
          authData.user.user_metadata?.full_name || 'Super Admin (Tata Usaha)'
        ).trim();

        const { data: insertedProfile } = await clientForProfile
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

        if (insertedProfile) {
          profile = insertedProfile;
        }
      }
    }

    if (profileErr || !profile) {
      res.status(403).json({
        error:
          'Profil pengguna belum terdaftar di tabel public.profiles. Pastikan Anda telah menjalankan SQL Migration dan mendaftarkan akun di tabel public.profiles.'
      });
      return;
    }

    if (!profile.is_active) {
      res.status(403).json({ error: 'Akun admin Anda sedang dinonaktifkan.' });
      return;
    }

    if (!['super_admin', 'admin', 'operator', 'viewer'].includes(profile.role)) {
      res.status(403).json({
        error: 'Akun ini bukan akun staf/admin. Silakan gunakan halaman Login Orang Tua.'
      });
      return;
    }

    const nowIso = new Date().toISOString();
    await clientForProfile.from('profiles').update({ last_login_at: nowIso }).eq('id', profile.id);

    await clientForProfile.from('audit_logs').insert({
      actor_id: profile.id,
      actor_name: profile.full_name,
      actor_role: profile.role,
      actor_type: 'admin',
      action: 'ADMIN_LOGIN',
      target_table: 'profiles',
      target_id: profile.id,
      details: `Login berhasil ke portal admin oleh ${profile.full_name} (${profile.role}).`
    });

    res.json({
      success: true,
      token: authData.session.access_token,
      refresh_token: authData.session.refresh_token,
      user: {
        id: profile.id,
        email: profile.email || emailToLogin,
        username: profile.username || emailToLogin.split('@')[0],
        nama_lengkap: profile.full_name,
        role: profile.role,
        is_active: profile.is_active,
        type: 'admin'
      }
    });
  } catch (err: unknown) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Gagal memproses autentikasi admin.'
    });
  }
});

function formatServerDateDMY(val?: unknown): string {
  if (val === undefined || val === null) return '';
  const str = String(val).trim();
  if (!str || str === '-') return '';
  if (/^\d{2}-\d{2}-\d{4}$/.test(str)) return str;
  const ymd = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) return `${ymd[3]}-${ymd[2]}-${ymd[1]}`;
  const dmy = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmy) return `${dmy[1].padStart(2, '0')}-${dmy[2].padStart(2, '0')}-${dmy[3]}`;
  return str;
}

function isServerBirthDatePasswordMatch(inputPassword: string, dbTanggalLahir?: unknown): boolean {
  if (!inputPassword || !dbTanggalLahir) return false;
  const dmy = formatServerDateDMY(dbTanggalLahir);
  const match = dmy.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return inputPassword.trim() === String(dbTanggalLahir).trim();
  const [, dd, mm, yyyy] = match;
  const dNoZero = String(parseInt(dd, 10));
  const mNoZero = String(parseInt(mm, 10));
  const candidates = new Set([
    `${dd}-${mm}-${yyyy}`,
    `${dd}${mm}${yyyy}`,
    `${dd}/${mm}/${yyyy}`,
    `${dd}.${mm}.${yyyy}`,
    `${yyyy}-${mm}-${dd}`,
    `${yyyy}/${mm}/${dd}`,
    `${yyyy}${mm}${dd}`,
    `${dNoZero}-${mNoZero}-${yyyy}`,
    `${dNoZero}/${mNoZero}/${yyyy}`
  ]);
  return candidates.has(inputPassword.trim());
}

// 4. LOGIN ORANG TUA (NISN sebagai username + Tanggal Lahir Siswa atau Password Kustom)
app.post('/api/auth/parent-login', async (req: Request, res: Response) => {
  const { nisn, password } = req.body;

  if (!nisn || !password) {
    res.status(400).json({ error: 'NISN siswa dan password (Tanggal Lahir) wajib diisi.' });
    return;
  }

  const cleanNisn = String(nisn).trim().replace(/\D/g, '');
  if (cleanNisn.length !== 10) {
    res.status(400).json({ error: 'NISN harus terdiri dari tepat 10 digit angka.' });
    return;
  }

  const supabaseClient = getSupabaseAdminClient() || getSupabaseAuthClient();
  const supabaseAuth = getSupabaseAuthClient();

  if (!supabaseClient || !supabaseAuth) {
    res.status(503).json({
      error: 'Konfigurasi koneksi Supabase belum tersedia di server.'
    });
    return;
  }

  try {
    // 1. Cari siswa berdasarkan NISN pada tabel `students`
    const { data: studentRows } = await supabaseClient
      .from('students')
      .select('*')
      .eq('nisn', cleanNisn)
      .limit(1);

    const student = studentRows?.[0];

    // 2. Cek apakah ada catatan di `parent_student_access`
    const { data: accessRows } = await supabaseClient
      .from('parent_student_access')
      .select('id, user_id, profile_id, student_id, nisn, nama_wali, no_hp_wali, is_active, activated_at')
      .eq('nisn', cleanNisn)
      .limit(1);

    const accessRecord = accessRows?.[0];

    if (accessRecord && accessRecord.is_active === false && accessRecord.activated_at) {
      res.status(403).json({
        error:
          'Akun orang tua dengan NISN ini sedang dinonaktifkan. Silakan hubungi Tata Usaha sekolah.'
      });
      return;
    }

    // 3. Jika password sesuai dengan Tanggal Lahir Siswa (dd-mm-yyyy / ddmmyyyy / yyyy-mm-dd)
    if (student && isServerBirthDatePasswordMatch(String(password), student.tanggal_lahir)) {
      const nowIso = new Date().toISOString();
      if (accessRecord?.id) {
        await supabaseClient
          .from('parent_student_access')
          .update({ last_login_at: nowIso, is_active: true })
          .eq('id', accessRecord.id);
      }

      const waliName =
        accessRecord?.nama_wali ||
        (student.nama_wali && student.nama_wali !== '-' ? student.nama_wali : '') ||
        (student.nama_ayah && student.nama_ayah !== '-' ? student.nama_ayah : '') ||
        (student.nama_ibu_kandung && student.nama_ibu_kandung !== '-' ? student.nama_ibu_kandung : '') ||
        `Orang Tua ${student.nama_lengkap_siswa || ''}`;

      const waliPhone =
        accessRecord?.no_hp_wali ||
        student.no_hp_wali ||
        student.no_wa_ayah ||
        student.no_wa_ibu ||
        '';

      await supabaseClient.from('audit_logs').insert({
        actor_name: waliName,
        actor_role: 'parent',
        actor_type: 'parent',
        action: 'PARENT_LOGIN',
        target_table: 'students',
        target_id: cleanNisn,
        details: `Login portal orang tua menggunakan Tanggal Lahir berhasil untuk NISN ${cleanNisn}.`
      });

      res.json({
        success: true,
        token: `parent-dob-session-${cleanNisn}-${Date.now()}`,
        student,
        user: {
          id: accessRecord?.profile_id || accessRecord?.id || `parent-${student.id}`,
          siswa_id: student.id,
          nisn: cleanNisn,
          nama_wali: waliName,
          no_hp: waliPhone,
          is_active: true,
          type: 'parent'
        }
      });
      return;
    }

    // 4. Jika menggunakan password kustom via Supabase Auth
    const internalEmail = buildInternalParentAuthEmail(cleanNisn);
    const { data: signInData, error: signInErr } = await supabaseAuth.auth.signInWithPassword({
      email: internalEmail,
      password: String(password)
    });

    if (signInErr || !signInData.session) {
      if (!student) {
        res.status(404).json({
          error: `Siswa dengan NISN ${cleanNisn} tidak ditemukan dalam database sekolah.`
        });
        return;
      }
      res.status(401).json({
        error:
          'Password yang Anda masukkan tidak sesuai dengan Tanggal Lahir Siswa (Format: dd-mm-yyyy, contoh: 25-08-2012).'
      });
      return;
    }

    const nowIso = new Date().toISOString();
    if (accessRecord?.id) {
      await supabaseClient
        .from('parent_student_access')
        .update({ last_login_at: nowIso })
        .eq('id', accessRecord.id);
    }

    res.json({
      success: true,
      token: signInData.session.access_token,
      refresh_token: signInData.session.refresh_token,
      student: student || null,
      user: {
        id: accessRecord?.profile_id || signInData.user.id,
        siswa_id: accessRecord?.student_id || student?.id || '',
        nisn: cleanNisn,
        nama_wali:
          accessRecord?.nama_wali ||
          student?.nama_ayah ||
          student?.nama_wali ||
          'Orang Tua / Wali Siswa',
        no_hp: accessRecord?.no_hp_wali || student?.no_hp_wali || '',
        is_active: true,
        type: 'parent'
      }
    });
  } catch (err: unknown) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Gagal memproses login orang tua.'
    });
  }
});

// 5. GANTI PASSWORD ORANG TUA (Melalui Supabase Auth)
app.post('/api/auth/parent-change-password', async (req: Request, res: Response) => {
  const { nisn, oldPassword, newPassword } = req.body;

  if (!nisn || !oldPassword || !newPassword) {
    res.status(400).json({ error: 'NISN, password saat ini, dan password baru wajib diisi.' });
    return;
  }

  const cleanNisn = String(nisn).trim().replace(/\D/g, '');
  if (String(newPassword).length < 8) {
    res.status(400).json({ error: 'Password baru minimal harus 8 karakter.' });
    return;
  }

  if (String(newPassword).includes(cleanNisn)) {
    res.status(400).json({
      error: 'Demi keamanan, password baru tidak boleh menggunakan atau mengandung NISN.'
    });
    return;
  }

  const supabaseAdmin = getSupabaseAdminClient();
  const supabaseAuth = getSupabaseAuthClient();

  if (!supabaseAdmin || !supabaseAuth) {
    res.status(503).json({
      error: 'SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi pada server.'
    });
    return;
  }

  try {
    const { data: accessRecord } = await supabaseAdmin
      .from('parent_student_access')
      .select('id, user_id, profile_id, nama_wali, is_active')
      .eq('nisn', cleanNisn)
      .maybeSingle();

    if (!accessRecord || !accessRecord.is_active) {
      res.status(404).json({ error: 'Akun orang tua aktif tidak ditemukan.' });
      return;
    }

    const { data: authUserRes } = await supabaseAdmin.auth.admin.getUserById(accessRecord.user_id);
    if (!authUserRes?.user?.email) {
      res.status(404).json({ error: 'Identitas autentikasi tidak ditemukan.' });
      return;
    }

    // Verifikasi password lama via Supabase Auth
    const { error: verifyErr } = await supabaseAuth.auth.signInWithPassword({
      email: authUserRes.user.email,
      password: String(oldPassword)
    });

    if (verifyErr) {
      res.status(401).json({ error: 'Password saat ini yang Anda masukkan tidak sesuai.' });
      return;
    }

    // Update password di Supabase Auth
    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(accessRecord.user_id, {
      password: String(newPassword)
    });

    if (updateErr) throw updateErr;

    await supabaseAdmin.from('audit_logs').insert({
      actor_id: accessRecord.profile_id,
      actor_name: accessRecord.nama_wali || `Orang Tua (${cleanNisn})`,
      actor_role: 'parent',
      actor_type: 'parent',
      action: 'PARENT_CHANGE_PASSWORD',
      target_table: 'parent_student_access',
      target_id: cleanNisn,
      details: `Orang tua siswa NISN ${cleanNisn} memperbarui password akun.`
    });

    res.json({
      success: true,
      message: 'Password akun orang tua berhasil diperbarui di Supabase Auth.'
    });
  } catch (err: unknown) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Gagal memperbarui password.'
    });
  }
});

// 6. ADMIN: AKTIVASI AKUN ATAU RESET PASSWORD ORANG TUA (Via Supabase Auth Admin API)
app.post('/api/admin/parents/activate', async (req: Request, res: Response) => {
  const { nisn, custom_password } = req.body;

  if (!nisn) {
    res.status(400).json({ error: 'NISN wajib disertakan.' });
    return;
  }

  const cleanNisn = String(nisn).trim().replace(/\D/g, '');
  if (cleanNisn.length !== 10) {
    res.status(400).json({ error: 'NISN wajib terdiri dari 10 digit angka.' });
    return;
  }

  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    res.status(503).json({
      error: 'SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi pada server.'
    });
    return;
  }

  try {
    // Pastikan siswa ada di tabel public.students
    const { data: student, error: studentErr } = await supabaseAdmin
      .from('students')
      .select('id, nisn, nama_lengkap_siswa, tanggal_lahir, nama_wali, nama_ayah, no_hp_wali, no_wa_ayah')
      .eq('nisn', cleanNisn)
      .maybeSingle();

    if (studentErr || !student) {
      res.status(404).json({
        error: `Siswa dengan NISN ${cleanNisn} tidak ditemukan pada tabel students.`
      });
      return;
    }

    const defaultBirthDatePwd = formatServerDateDMY(student.tanggal_lahir) || '01-01-2012';
    const passwordToSet = custom_password && String(custom_password).trim()
      ? String(custom_password).trim()
      : defaultBirthDatePwd;

    if (passwordToSet.length < 6) {
      res.status(400).json({
        error: 'Password orang tua minimal harus 6 karakter (contoh Tanggal Lahir: 25-08-2012).'
      });
      return;
    }

    const internalEmail = buildInternalParentAuthEmail(cleanNisn);
    const waliName =
      student.nama_wali && student.nama_wali !== '-'
        ? student.nama_wali
        : student.nama_ayah || `Orang Tua ${student.nama_lengkap_siswa}`;
    const waliPhone = student.no_hp_wali || student.no_wa_ayah || '';
    const nowIso = new Date().toISOString();

    const { data: existingAccess } = await supabaseAdmin
      .from('parent_student_access')
      .select('id, user_id')
      .eq('nisn', cleanNisn)
      .maybeSingle();

    let authUserId = existingAccess?.user_id;

    if (authUserId) {
      // Reset password pada Supabase Auth
      const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(authUserId, {
        password: passwordToSet,
        email_confirm: true
      });
      if (updErr) throw updErr;

      await supabaseAdmin
        .from('profiles')
        .update({ is_active: true, full_name: waliName, phone: waliPhone })
        .eq('id', authUserId);

      await supabaseAdmin
        .from('parent_student_access')
        .update({
          is_active: true,
          nama_wali: waliName,
          no_hp_wali: waliPhone,
          password_reset_at: nowIso
        })
        .eq('id', existingAccess!.id);
    } else {
      // Buat akun baru di Supabase Auth
      const { data: createdAuth, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: internalEmail,
        password: passwordToSet,
        email_confirm: true,
        user_metadata: {
          role: 'parent',
          student_id: student.id
        }
      });

      if (createErr || !createdAuth.user) {
        throw createErr || new Error('Gagal membuat identitas Supabase Auth untuk orang tua.');
      }

      authUserId = createdAuth.user.id;

      await supabaseAdmin.from('profiles').upsert({
        id: authUserId,
        email: internalEmail,
        username: cleanNisn,
        full_name: waliName,
        role: 'parent',
        phone: waliPhone,
        is_active: true
      });

      await supabaseAdmin.from('parent_student_access').insert({
        user_id: authUserId,
        profile_id: authUserId,
        student_id: student.id,
        nisn: cleanNisn,
        nama_wali: waliName,
        no_hp_wali: waliPhone,
        is_active: true,
        activated_at: nowIso
      });
    }

    res.json({
      success: true,
      message: `Akun Supabase Auth orang tua untuk NISN ${cleanNisn} (${student.nama_lengkap_siswa}) berhasil diaktifkan.`,
      parent: {
        id: authUserId,
        nisn: cleanNisn,
        nama_wali: waliName,
        is_active: true,
        activated_at: nowIso
      }
    });
  } catch (err: unknown) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Gagal mengaktifkan akun orang tua.'
    });
  }
});

// 7. ADMIN: UBAH STATUS AKTIF / NON-AKTIF AKUN ORANG TUA
app.post('/api/admin/parents/toggle-status', async (req: Request, res: Response) => {
  const { nisn, is_active } = req.body;

  if (!nisn) {
    res.status(400).json({ error: 'NISN wajib disertakan.' });
    return;
  }

  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    res.status(503).json({
      error: 'SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi pada server.'
    });
    return;
  }

  try {
    const cleanNisn = String(nisn).trim().replace(/\D/g, '');
    const { data: accessRecord, error: findErr } = await supabaseAdmin
      .from('parent_student_access')
      .select('id, profile_id, nisn')
      .eq('nisn', cleanNisn)
      .maybeSingle();

    if (findErr || !accessRecord) {
      res.status(404).json({ error: 'Pemetaan akun orang tua tidak ditemukan.' });
      return;
    }

    const activeBool = Boolean(is_active);

    await supabaseAdmin
      .from('parent_student_access')
      .update({ is_active: activeBool })
      .eq('id', accessRecord.id);

    await supabaseAdmin
      .from('profiles')
      .update({ is_active: activeBool })
      .eq('id', accessRecord.profile_id);

    res.json({
      success: true,
      message: `Status akses akun orang tua NISN ${cleanNisn} diubah menjadi ${
        activeBool ? 'Aktif' : 'Non-Aktif'
      }.`,
      is_active: activeBool
    });
  } catch (err: unknown) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Gagal mengubah status akun orang tua.'
    });
  }
});

// 8. ADMIN: BUAT AKUN ADMIN / OPERATOR / VIEWER BARU (Via Supabase Auth Admin API)
app.post('/api/admin/users/create', async (req: Request, res: Response) => {
  const { email, username, full_name, role, password, phone } = req.body;

  if (!email || !full_name || !role || !password) {
    res.status(400).json({ error: 'Email, nama lengkap, role, dan password wajib diisi.' });
    return;
  }

  if (!['super_admin', 'admin', 'operator', 'viewer'].includes(String(role))) {
    res.status(400).json({ error: 'Role tidak valid.' });
    return;
  }

  if (String(password).length < 8) {
    res.status(400).json({ error: 'Password minimal harus 8 karakter.' });
    return;
  }

  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    res.status(503).json({
      error: 'SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi pada server.'
    });
    return;
  }

  try {
    const cleanEmail = String(email).trim().toLowerCase();
    const cleanUsername = String(username || cleanEmail.split('@')[0])
      .trim()
      .toLowerCase();

    const { data: createdAuth, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: cleanEmail,
      password: String(password),
      email_confirm: true,
      user_metadata: {
        role: String(role),
        full_name: String(full_name).trim(),
        username: cleanUsername
      }
    });

    if (createErr || !createdAuth.user) {
      throw createErr || new Error('Gagal membuat user di Supabase Auth.');
    }

    const userId = createdAuth.user.id;
    const { data: profile, error: profErr } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: userId,
        email: cleanEmail,
        username: cleanUsername,
        full_name: String(full_name).trim(),
        role: String(role),
        phone: phone ? String(phone).trim() : null,
        is_active: true
      })
      .select('*')
      .single();

    if (profErr) throw profErr;

    res.json({
      success: true,
      message: `Akun staf ${full_name} (${role}) berhasil dibuat.`,
      profile
    });
  } catch (err: unknown) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Gagal membuat akun admin.'
    });
  }
});

// 9. ENDPOINT DATA SISWA (Pembacaan lengkap 1000+ baris menggunakan Service Role / Token Aktif)
app.get('/api/students', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  const supabaseAdmin = getSupabaseAdminClient();
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();

  const client =
    supabaseAdmin ||
    (url && anonKey
      ? createClient(url, anonKey, {
          auth: { autoRefreshToken: false, persistSession: false },
          global:
            bearerToken && !bearerToken.startsWith('parent-dob-session-')
              ? { headers: { Authorization: `Bearer ${bearerToken}` } }
              : undefined
        })
      : null);

  if (!client) {
    res.status(503).json({ error: 'Supabase belum dikonfigurasi pada server.' });
    return;
  }

  try {
    const allRows: Record<string, unknown>[] = [];
    const CHUNK_SIZE = 1000;
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await client
        .from('students')
        .select('*')
        .order('nama_lengkap_siswa', { ascending: true })
        .range(from, from + CHUNK_SIZE - 1);

      if (error) {
        if (from === 0) {
          const fallbackRes = await client.from('students').select('*').range(0, CHUNK_SIZE - 1);
          if (!fallbackRes.error && fallbackRes.data) {
            allRows.push(...(fallbackRes.data as Record<string, unknown>[]));
          }
        }
        break;
      }

      if (data && data.length > 0) {
        allRows.push(...(data as Record<string, unknown>[]));
        if (data.length < CHUNK_SIZE) {
          hasMore = false;
        } else {
          from += CHUNK_SIZE;
        }
      } else {
        hasMore = false;
      }
    }

    res.json({ students: allRows });
  } catch (err: unknown) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Gagal mengambil daftar siswa.'
    });
  }
});

app.get('/api/students/by-nisn/:nisn', async (req: Request, res: Response) => {
  const cleanNisn = String(req.params.nisn || '').trim().replace(/\D/g, '');
  if (!cleanNisn) {
    res.status(400).json({ error: 'NISN tidak valid.' });
    return;
  }

  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  const supabaseAdmin = getSupabaseAdminClient();
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();

  const client =
    supabaseAdmin ||
    (url && anonKey
      ? createClient(url, anonKey, {
          auth: { autoRefreshToken: false, persistSession: false },
          global:
            bearerToken && !bearerToken.startsWith('parent-dob-session-')
              ? { headers: { Authorization: `Bearer ${bearerToken}` } }
              : undefined
        })
      : null);

  if (!client) {
    res.status(503).json({ error: 'Supabase belum dikonfigurasi pada server.' });
    return;
  }

  try {
    const { data, error } = await client
      .from('students')
      .select('*')
      .eq('nisn', cleanNisn)
      .maybeSingle();

    if (error || !data) {
      res.status(404).json({ error: 'Data siswa tidak ditemukan.' });
      return;
    }

    res.json({ student: data });
  } catch (err: unknown) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Gagal mengambil data siswa.'
    });
  }
});

// 11. UPSERT / SIMPAN DATA SISWA (Mendukung Import Data Excel & Form Biodata)
app.post('/api/students/upsert', async (req: Request, res: Response) => {
  const { id, dbPayload, upsertOnConflict } = req.body as {
    id?: string;
    dbPayload?: Record<string, unknown>;
    upsertOnConflict?: boolean;
  };

  if (!dbPayload || typeof dbPayload !== 'object') {
    res.status(400).json({ error: 'Payload data siswa tidak valid.' });
    return;
  }

  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  const supabaseAdmin = getSupabaseAdminClient();
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();

  const client =
    supabaseAdmin ||
    (url && anonKey
      ? createClient(url, anonKey, {
          auth: { autoRefreshToken: false, persistSession: false },
          global:
            bearerToken && !bearerToken.startsWith('parent-dob-session-')
              ? { headers: { Authorization: `Bearer ${bearerToken}` } }
              : undefined
        })
      : null);

  if (!client) {
    res.status(503).json({ error: 'Supabase belum dikonfigurasi pada server.' });
    return;
  }

  const stripLegacyStudentCols = (raw: Record<string, unknown>) => {
    const copy = { ...raw };
    delete copy.angkatan;
    delete copy.tahun_ajaran_masuk;
    delete copy.tahun_lulus;
    delete copy.tanggal_lulus;
    delete copy.nomor_ijazah_smp;
    delete copy.import_batch_id;
    return copy;
  };

  const isSamePersonName = (a?: unknown, b?: unknown): boolean => {
    const norm = (v: unknown) =>
      String(v || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const nA = norm(a);
    const nB = norm(b);
    if (!nA || !nB) return false;
    if (nA === nB || nA.replace(/\s+/g, '') === nB.replace(/\s+/g, '')) return true;
    const tA = nA.split(' ').filter(t => t.length >= 4);
    const tB = nB.split(' ').filter(t => t.length >= 4);
    if (tA.length >= 2 && tB.length >= 2) {
      const shared = tA.filter(t => tB.includes(t));
      if (shared.length >= 2) return true;
    }
    return false;
  };

  try {
    if (typeof dbPayload.nama_lengkap_siswa === 'string') {
      dbPayload.nama_lengkap_siswa = dbPayload.nama_lengkap_siswa
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
    }
    let targetId = id ? String(id).trim() : '';
    const cleanNisn = dbPayload.nisn ? String(dbPayload.nisn).trim() : '';
    const cleanNis = dbPayload.nis ? String(dbPayload.nis).trim() : '';
    const incomingName = String(dbPayload.nama_lengkap_siswa || '').trim();

    // Jika belum memiliki targetId dan upsertOnConflict aktif, cek apakah NIS atau NISN sudah ada
    // Hanya cocokkan ke baris existing jika nama_lengkap_siswa merujuk pada siswa yang SAMA dan NIS tidak berbeda!
    if (!targetId && upsertOnConflict) {
      if (cleanNis) {
        const { data: existingByNis } = await client
          .from('students')
          .select('id, nama_lengkap_siswa')
          .eq('nis', cleanNis)
          .limit(1);
        if (existingByNis?.[0]?.id) {
          if (isSamePersonName(existingByNis[0].nama_lengkap_siswa, incomingName)) {
            targetId = String(existingByNis[0].id);
          } else {
            dbPayload.nis = null;
          }
        }
      }
      if (!targetId && cleanNisn) {
        const { data: existingByNisn } = await client
          .from('students')
          .select('id, nama_lengkap_siswa, nis')
          .eq('nisn', cleanNisn)
          .limit(1);
        if (existingByNisn?.[0]?.id) {
          const exNis = existingByNisn[0].nis ? String(existingByNisn[0].nis).trim() : '';
          const nisConsistent = !cleanNis || !exNis || exNis === cleanNis;
          if (isSamePersonName(existingByNisn[0].nama_lengkap_siswa, incomingName) && nisConsistent) {
            targetId = String(existingByNisn[0].id);
          } else {
            dbPayload.nisn = null;
          }
        }
      }
    }

    const preserveExistingMutationFields = async (studentIdToCheck: string, payloadToMutate: Record<string, unknown>) => {
      try {
        const { data: existingRow } = await client
          .from('students')
          .select('status_aktif, tanggal_masuk')
          .eq('id', studentIdToCheck)
          .maybeSingle();
        if (!existingRow) return;
        const exStatus = String(existingRow.status_aktif || '');
        const exTgl = String(existingRow.tanggal_masuk || '');
        const incomingStatus = String(payloadToMutate.status_aktif || '');
        const incomingTgl = String(payloadToMutate.tanggal_masuk || '');
        const todayIso = new Date().toISOString().slice(0, 10);

        // Jangan timpa status mutasi_keluar / lulus / non_aktif / mutasi_masuk kembali menjadi 'aktif' saat re-import daftar kelas
        if (
          ['mutasi_keluar', 'lulus', 'non_aktif', 'mutasi_masuk'].includes(exStatus) &&
          incomingStatus === 'aktif'
        ) {
          payloadToMutate.status_aktif = exStatus;
          if (exTgl && exTgl !== '2026-11-08') {
            payloadToMutate.tanggal_masuk = exTgl;
          }
        } else if (
          exTgl &&
          exTgl !== '2026-11-08' &&
          (!incomingTgl || incomingTgl === '2026-11-08' || incomingTgl === todayIso)
        ) {
          payloadToMutate.tanggal_masuk = exTgl;
        }
      } catch {
        // Abaikan jika gagal mengecek baris lama
      }
    };

    if (targetId) {
      if (upsertOnConflict) {
        await preserveExistingMutationFields(targetId, dbPayload);
      }

      let { data, error } = await client
        .from('students')
        .update(dbPayload)
        .eq('id', targetId)
        .select('*')
        .single();

      if (
        error &&
        (error.message.includes('schema cache') ||
          error.message.includes('column') ||
          error.message.includes('angkatan') ||
          error.message.includes('tahun_ajaran_masuk') ||
          error.message.includes('import_batch_id'))
      ) {
        const retryRes = await client
          .from('students')
          .update(stripLegacyStudentCols(dbPayload))
          .eq('id', targetId)
          .select('*')
          .single();
        data = retryRes.data;
        error = retryRes.error;
      }

      // Jika terjadi bentrok unik pada kolom sekunder (mis. NIS bentrok dengan siswa lain saat update berdasarkan NISN)
      if (
        error &&
        (error.message.includes('duplicate key') || error.message.includes('uq_students_'))
      ) {
        const safePayload = stripLegacyStudentCols(dbPayload);
        if (error.message.includes('nis_not_empty')) {
          delete safePayload.nis;
        }
        if (error.message.includes('nisn_not_empty')) {
          delete safePayload.nisn;
        }
        const retrySafe = await client
          .from('students')
          .update(safePayload)
          .eq('id', targetId)
          .select('*')
          .single();
        data = retrySafe.data;
        error = retrySafe.error;
      }

      if (error || !data) {
        res.status(400).json({ error: error?.message || 'Gagal memperbarui data siswa.' });
        return;
      }

      res.json({ student: data, action: 'updated' });
      return;
    }

    let { data, error } = await client
      .from('students')
      .insert([dbPayload])
      .select('*')
      .single();

    if (
      error &&
      (error.message.includes('schema cache') ||
        error.message.includes('column') ||
        error.message.includes('angkatan') ||
        error.message.includes('tahun_ajaran_masuk') ||
        error.message.includes('import_batch_id'))
    ) {
      const retryRes = await client
        .from('students')
        .insert([stripLegacyStudentCols(dbPayload)])
        .select('*')
        .single();
      data = retryRes.data;
      error = retryRes.error;
    }

    // Jika gagal insert karena duplikat NIS/NISN dan upsert diizinkan:
    // Update hanya jika siswa yang sama dan NIS konsisten; jika berbeda, kosongkan kunci bentrok dan insert ulang!
    if (
      error &&
      upsertOnConflict &&
      (error.message.includes('duplicate key') || error.message.includes('uq_students_'))
    ) {
      let existingId = '';
      if (cleanNis) {
        const { data: r2 } = await client
          .from('students')
          .select('id, nama_lengkap_siswa')
          .eq('nis', cleanNis)
          .limit(1);
        if (r2?.[0]?.id) {
          if (isSamePersonName(r2[0].nama_lengkap_siswa, incomingName)) {
            existingId = String(r2[0].id);
          } else {
            dbPayload.nis = null;
          }
        }
      }
      if (!existingId && cleanNisn) {
        const { data: r1 } = await client
          .from('students')
          .select('id, nama_lengkap_siswa, nis')
          .eq('nisn', cleanNisn)
          .limit(1);
        if (r1?.[0]?.id) {
          const exNis = r1[0].nis ? String(r1[0].nis).trim() : '';
          const nisConsistent = !cleanNis || !exNis || exNis === cleanNis;
          if (isSamePersonName(r1[0].nama_lengkap_siswa, incomingName) && nisConsistent) {
            existingId = String(r1[0].id);
          } else {
            dbPayload.nisn = null;
          }
        }
      }
      if (existingId) {
        await preserveExistingMutationFields(existingId, dbPayload);
        const safeUpdate = stripLegacyStudentCols(dbPayload);
        const updRes = await client
          .from('students')
          .update(safeUpdate)
          .eq('id', existingId)
          .select('*')
          .single();
        if (!updRes.error && updRes.data) {
          res.json({ student: updRes.data, action: 'updated' });
          return;
        }
      } else {
        if (error.message.includes('nisn_not_empty')) dbPayload.nisn = null;
        if (error.message.includes('nis_not_empty')) dbPayload.nis = null;
        const retryInsert = await client
          .from('students')
          .insert([dbPayload])
          .select('*')
          .single();
        data = retryInsert.data;
        error = retryInsert.error;
      }
    }

    if (error || !data) {
      res.status(400).json({ error: error?.message || 'Gagal menyimpan data siswa baru.' });
      return;
    }

    res.json({ student: data, action: 'inserted' });
  } catch (err: unknown) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Gagal memproses penyimpanan siswa.'
    });
  }
});

// 12. AMBIL DAFTAR MUTASI SISWA (Mendukung fallback pembacaan penuh via Service Role / Token Aktif)
app.get('/api/mutations', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  const supabaseAdmin = getSupabaseAdminClient();
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();

  const client =
    supabaseAdmin ||
    (url && anonKey
      ? createClient(url, anonKey, {
          auth: { autoRefreshToken: false, persistSession: false },
          global:
            bearerToken && !bearerToken.startsWith('parent-dob-session-')
              ? { headers: { Authorization: `Bearer ${bearerToken}` } }
              : undefined
        })
      : null);

  if (!client) {
    res.status(503).json({ error: 'Supabase belum dikonfigurasi pada server.' });
    return;
  }

  try {
    let { data, error } = await client
      .from('student_mutations')
      .select('*')
      .order('tanggal_pindah', { ascending: false });

    if (error) {
      const fallbackRes = await client.from('student_mutations').select('*');
      data = fallbackRes.data;
      error = fallbackRes.error;
    }

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.json({ mutations: data || [] });
  } catch (err: unknown) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Gagal mengambil daftar mutasi siswa.'
    });
  }
});

// 13. SIMPAN / PERBARUI (UPSERT) TRANSAKSI MUTASI DARI IMPORT EXCEL
app.post('/api/mutations/import-row', async (req: Request, res: Response) => {
  const { mutationPayload } = req.body as {
    mutationPayload?: Record<string, unknown>;
  };

  if (!mutationPayload || typeof mutationPayload !== 'object') {
    res.status(400).json({ error: 'Payload mutasi tidak valid.' });
    return;
  }

  if (typeof mutationPayload.nama_lengkap_siswa === 'string') {
    mutationPayload.nama_lengkap_siswa = mutationPayload.nama_lengkap_siswa
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
  }

  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  const supabaseAdmin = getSupabaseAdminClient();
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();

  const client =
    supabaseAdmin ||
    (url && anonKey
      ? createClient(url, anonKey, {
          auth: { autoRefreshToken: false, persistSession: false },
          global:
            bearerToken && !bearerToken.startsWith('parent-dob-session-')
              ? { headers: { Authorization: `Bearer ${bearerToken}` } }
              : undefined
        })
      : null);

  if (!client) {
    res.status(503).json({ error: 'Supabase belum dikonfigurasi pada server.' });
    return;
  }

  try {
    const studentId = mutationPayload.student_id ? String(mutationPayload.student_id).trim() : '';
    const jenisMutasi = mutationPayload.jenis_mutasi ? String(mutationPayload.jenis_mutasi).trim() : '';
    const nis = mutationPayload.nis ? String(mutationPayload.nis).trim() : '';
    const nisn = mutationPayload.nisn ? String(mutationPayload.nisn).trim() : '';
    const nama = mutationPayload.nama_lengkap_siswa ? String(mutationPayload.nama_lengkap_siswa).trim() : '';

    // Cek apakah sudah ada baris mutasi untuk siswa & jenis_mutasi ini (mis. yang sebelumnya tercatat dengan tanggal default 2026-11-08)
    let existingMutationId = '';
    if (studentId && jenisMutasi) {
      const { data: byStudentId } = await client
        .from('student_mutations')
        .select('id, tanggal_pindah')
        .eq('student_id', studentId)
        .eq('jenis_mutasi', jenisMutasi)
        .neq('status_mutasi', 'dibatalkan')
        .order('updated_at', { ascending: false })
        .limit(5);
      if (byStudentId && byStudentId.length > 0) {
        existingMutationId = String(byStudentId[0].id);
        // Hapus duplikat ekstra jika pernah ter-insert ganda sebelumnya
        if (byStudentId.length > 1) {
          const extraIds = byStudentId.slice(1).map(r => String(r.id));
          await client.from('student_mutations').delete().in('id', extraIds);
        }
      }
    }

    if (!existingMutationId && jenisMutasi && (nisn || nis || nama)) {
      let lookupQuery = client
        .from('student_mutations')
        .select('id')
        .eq('jenis_mutasi', jenisMutasi)
        .neq('status_mutasi', 'dibatalkan');
      if (nisn) lookupQuery = lookupQuery.eq('nisn', nisn);
      else if (nis) lookupQuery = lookupQuery.eq('nis', nis);
      else lookupQuery = lookupQuery.ilike('nama_lengkap_siswa', nama);

      const { data: byIdentity } = await lookupQuery.limit(1);
      if (byIdentity?.[0]?.id) {
        existingMutationId = String(byIdentity[0].id);
      }
    }

    if (studentId && mutationPayload.tanggal_pindah) {
      const kat = String(mutationPayload.kategori_mutasi || '');
      const statusAktifToSync =
        jenisMutasi === 'keluar'
          ? kat === 'Lulus'
            ? 'lulus'
            : kat === 'Pindah sekolah' || !kat
            ? 'mutasi_keluar'
            : 'non_aktif'
          : 'mutasi_masuk';

      await client
        .from('students')
        .update({
          tanggal_masuk: mutationPayload.tanggal_pindah,
          status_aktif: statusAktifToSync
        })
        .eq('id', studentId);
    }

    if (existingMutationId) {
      const { data: updatedData, error: updateErr } = await client
        .from('student_mutations')
        .update(mutationPayload)
        .eq('id', existingMutationId)
        .select('*')
        .single();

      if (!updateErr && updatedData) {
        res.json({ mutation: updatedData, action: 'updated' });
        return;
      }
    }

    const { data, error } = await client
      .from('student_mutations')
      .insert([mutationPayload])
      .select('*')
      .single();

    if (error || !data) {
      res.status(400).json({ error: error?.message || 'Gagal menyimpan catatan mutasi.' });
      return;
    }

    res.json({ mutation: data, action: 'inserted' });
  } catch (err: unknown) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Gagal memproses penyimpanan mutasi.'
    });
  }
});

// 14. AMBIL & SIMPAN RIWAYAT BATCH IMPORT (import_batches & import_batch_rows)
app.get('/api/import-batches', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  const supabaseAdmin = getSupabaseAdminClient();
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();

  const client =
    supabaseAdmin ||
    (url && anonKey
      ? createClient(url, anonKey, {
          auth: { autoRefreshToken: false, persistSession: false },
          global:
            bearerToken && !bearerToken.startsWith('parent-dob-session-')
              ? { headers: { Authorization: `Bearer ${bearerToken}` } }
              : undefined
        })
      : null);

  if (!client) {
    res.status(503).json({ error: 'Supabase belum dikonfigurasi pada server.' });
    return;
  }

  try {
    const { data, error } = await client
      .from('import_batches')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.json({ batches: data || [] });
  } catch (err: unknown) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Gagal mengambil riwayat batch import.'
    });
  }
});

app.post('/api/import-batches', async (req: Request, res: Response) => {
  const { batchPayload, rowsPayload } = req.body as {
    batchPayload?: Record<string, unknown>;
    rowsPayload?: Record<string, unknown>[];
  };

  if (!batchPayload || typeof batchPayload !== 'object') {
    res.status(400).json({ error: 'Payload batch import tidak valid.' });
    return;
  }

  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  const supabaseAdmin = getSupabaseAdminClient();
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();

  const client =
    supabaseAdmin ||
    (url && anonKey
      ? createClient(url, anonKey, {
          auth: { autoRefreshToken: false, persistSession: false },
          global:
            bearerToken && !bearerToken.startsWith('parent-dob-session-')
              ? { headers: { Authorization: `Bearer ${bearerToken}` } }
              : undefined
        })
      : null);

  if (!client) {
    res.status(503).json({ error: 'Supabase belum dikonfigurasi pada server.' });
    return;
  }

  try {
    const now = new Date().toISOString();
    const fullBatchRow: Record<string, unknown> = {
      file_name: batchPayload.file_name || 'Import_SIPDS.xlsx',
      import_mode: batchPayload.import_mode || 'insert_only',
      import_category: batchPayload.import_category || 'siswa_baru',
      tahun_ajaran: batchPayload.tahun_ajaran || null,
      angkatan: batchPayload.angkatan || null,
      total_rows: Number(batchPayload.total_rows || 0),
      success_rows: Number(batchPayload.success_rows || 0),
      failed_rows: Number(batchPayload.failed_rows || 0),
      duplicate_rows: Number(batchPayload.duplicate_rows || 0),
      review_rows: Number(batchPayload.review_rows || 0),
      status: batchPayload.status || 'completed',
      error_details: Array.isArray(batchPayload.error_details) ? batchPayload.error_details : [],
      completed_at: batchPayload.completed_at || now
    };

    let { data, error } = await client
      .from('import_batches')
      .insert([fullBatchRow])
      .select('*')
      .single();

    if (error) {
      const legacyBatchRow = {
        file_name: fullBatchRow.file_name,
        total_rows: fullBatchRow.total_rows,
        success_rows: fullBatchRow.success_rows,
        failed_rows: fullBatchRow.failed_rows,
        status: fullBatchRow.status,
        error_details: fullBatchRow.error_details,
        completed_at: fullBatchRow.completed_at
      };
      const retryBatch = await client
        .from('import_batches')
        .insert([legacyBatchRow])
        .select('*')
        .single();
      data = retryBatch.data;
      error = retryBatch.error;
    }

    if (error || !data) {
      res.status(400).json({ error: error?.message || 'Gagal menyimpan riwayat batch import.' });
      return;
    }

    if (Array.isArray(rowsPayload) && rowsPayload.length > 0) {
      try {
        const dbRows = rowsPayload.map(r => ({
          batch_id: String(data.id),
          row_number: Number(r.row_number || 0),
          student_id: r.student_id || null,
          nis: r.nis || null,
          nisn: r.nisn || null,
          nama_siswa: r.nama_siswa || null,
          validation_status: r.validation_status || 'valid',
          action_taken: r.action_taken === 'mutation_recorded' ? 'inserted' : r.action_taken || 'skipped',
          error_messages: Array.isArray(r.error_messages) ? r.error_messages : [],
          raw_payload: r.raw_payload || {},
          diff_payload: r.diff_payload || {}
        }));
        const CHUNK = 250;
        for (let i = 0; i < dbRows.length; i += CHUNK) {
          await client.from('import_batch_rows').insert(dbRows.slice(i, i + CHUNK));
        }
      } catch {
        // Non-fatal
      }
    }

    res.json({ batch: data });
  } catch (err: unknown) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Gagal menyimpan riwayat batch import.'
    });
  }
});

app.get('/api/import-batches/:batchId/rows', async (req: Request, res: Response) => {
  const { batchId } = req.params;
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  const supabaseAdmin = getSupabaseAdminClient();
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();

  const client =
    supabaseAdmin ||
    (url && anonKey
      ? createClient(url, anonKey, {
          auth: { autoRefreshToken: false, persistSession: false },
          global:
            bearerToken && !bearerToken.startsWith('parent-dob-session-')
              ? { headers: { Authorization: `Bearer ${bearerToken}` } }
              : undefined
        })
      : null);

  if (!client) {
    res.status(503).json({ error: 'Supabase belum dikonfigurasi pada server.' });
    return;
  }

  try {
    const { data, error } = await client
      .from('import_batch_rows')
      .select('*')
      .eq('batch_id', batchId)
      .order('row_number', { ascending: true });

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.json({ rows: data || [] });
  } catch (err: unknown) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Gagal mengambil detail baris batch import.'
    });
  }
});

// 15. AMBIL & SIMPAN RIWAYAT KELAS (student_class_history)
app.get('/api/class-history', async (req: Request, res: Response) => {
  const { student_id, tahun_ajaran, kelas } = req.query as {
    student_id?: string;
    tahun_ajaran?: string;
    kelas?: string;
  };

  const supabaseAdmin = getSupabaseAdminClient();
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  const client =
    supabaseAdmin ||
    (url && anonKey
      ? createClient(url, anonKey, {
          auth: { autoRefreshToken: false, persistSession: false },
          global:
            bearerToken && !bearerToken.startsWith('parent-dob-session-')
              ? { headers: { Authorization: `Bearer ${bearerToken}` } }
              : undefined
        })
      : null);

  if (!client) {
    res.status(503).json({ error: 'Supabase belum dikonfigurasi pada server.' });
    return;
  }

  try {
    let query = client
      .from('student_class_history')
      .select('*')
      .order('tanggal_mulai', { ascending: false })
      .limit(2000);

    if (student_id) query = query.eq('student_id', student_id);
    if (tahun_ajaran && tahun_ajaran !== 'all') query = query.eq('tahun_ajaran', tahun_ajaran);
    if (kelas && kelas !== 'all') query = query.eq('kelas', kelas);

    const { data, error } = await query;
    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.json({ history: data || [] });
  } catch (err: unknown) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Gagal mengambil riwayat kelas.'
    });
  }
});

app.post('/api/class-history/upsert', async (req: Request, res: Response) => {
  const { dbRow } = req.body as { dbRow?: Record<string, unknown> };
  if (!dbRow || typeof dbRow !== 'object') {
    res.status(400).json({ error: 'Payload riwayat kelas tidak valid.' });
    return;
  }

  const supabaseAdmin = getSupabaseAdminClient();
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  const client =
    supabaseAdmin ||
    (url && anonKey
      ? createClient(url, anonKey, {
          auth: { autoRefreshToken: false, persistSession: false },
          global:
            bearerToken && !bearerToken.startsWith('parent-dob-session-')
              ? { headers: { Authorization: `Bearer ${bearerToken}` } }
              : undefined
        })
      : null);

  if (!client) {
    res.status(503).json({ error: 'Supabase belum dikonfigurasi pada server.' });
    return;
  }

  try {
    let { data, error } = await client
      .from('student_class_history')
      .insert([dbRow])
      .select('*')
      .single();

    if (
      error &&
      (error.message.includes('schema cache') ||
        error.message.includes('column') ||
        error.message.includes('tahun_ajaran') ||
        error.message.includes('semester'))
    ) {
      const legacyRow = { ...dbRow };
      delete legacyRow.tahun_ajaran;
      delete legacyRow.semester;
      const retryRes = await client
        .from('student_class_history')
        .insert([legacyRow])
        .select('*')
        .single();
      data = retryRes.data;
      error = retryRes.error;
    }

    if (error || !data) {
      res.status(400).json({ error: error?.message || 'Gagal menyimpan riwayat kelas.' });
      return;
    }

    res.json({ record: data });
  } catch (err: unknown) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Gagal menyimpan riwayat kelas.'
    });
  }
});


// Setup Vite Dev Middleware or Serve Production Static Assets
function startServer() {
  if (!isProduction) {
    const vitePromise = createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });

    app.use(async (req, res, next) => {
      try {
        const vite = await vitePromise;
        vite.middlewares(req, res, next);
      } catch (err) {
        next(err);
      }
    });
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SIPDS SMP BHINNEKA TUNGGAL IKA] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
