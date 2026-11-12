/**
 * Supabase Edge Function: parent-auth
 * SIPDS (Sistem Informasi Pengelolaan Data Siswa) - SMP BHINNEKA TUNGGAL IKA
 *
 * Arsitektur Keamanan Autentikasi NISN:
 * 1. Tidak membuat tabel password sendiri & tidak menyimpan password plaintext.
 * 2. Menggunakan SUPABASE_SERVICE_ROLE_KEY (hanya di server/Edge Function) untuk
 *    memetakan NISN siswa ke identitas internal Supabase Auth (auth.users) melalui
 *    tabel `public.parent_student_access` dan `public.profiles`.
 * 3. Memastikan orang tua hanya dapat login apabila `parent_student_access.is_active = true`
 *    dan `profiles.is_active = true`.
 * 4. Menyediakan endpoint khusus Admin (`super_admin` / `admin`) untuk aktivasi akun
 *    orang tua dan reset password melalui Supabase Admin Auth API.
 */

import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * Menghasilkan alamat email internal deterministik yang hanya diketahui oleh server
 * untuk memetakan NISN ke akun Supabase Auth tanpa membukanya ke publik.
 */
function buildInternalParentAuthEmail(nisn: string): string {
  return `ortu.${nisn}@auth-internal.smpbhinneka.sch.id`;
}

export async function handleParentAuthRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return new Response(
      JSON.stringify({
        error: 'Konfigurasi SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib tersedia di server.'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Service-role client (HANYA di server, bypass RLS untuk verifikasi pemetaan NISN)
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  // Public auth client untuk signInWithPassword standar Supabase Auth
  const supabaseAuthClient = createClient(supabaseUrl, supabaseAnonKey || supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  try {
    const body = await req.json();
    const { action } = body;

    // =========================================================================
    // 1. LOGIN ORANG TUA DENGAN NISN + PASSWORD TERSENDIRI
    // =========================================================================
    if (action === 'login_parent') {
      const cleanNisn = String(body.nisn || '').trim().replace(/\D/g, '');
      const password = String(body.password || '');

      if (cleanNisn.length !== 10 || !password) {
        return new Response(
          JSON.stringify({ error: 'NISN (10 digit angka) dan password wajib diisi.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Cari pemetaan NISN di parent_student_access
      const { data: accessRow, error: accessErr } = await supabaseAdmin
        .from('parent_student_access')
        .select('id, user_id, profile_id, student_id, nisn, nama_wali, no_hp_wali, is_active')
        .eq('nisn', cleanNisn)
        .maybeSingle();

      if (accessErr || !accessRow) {
        return new Response(
          JSON.stringify({
            error: 'Akun orang tua untuk NISN tersebut belum terdaftar atau belum diaktifkan oleh admin sekolah.'
          }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!accessRow.is_active) {
        return new Response(
          JSON.stringify({
            error: 'Akun orang tua untuk NISN ini belum aktif. Silakan hubungi Tata Usaha SMP Bhinneka Tunggal Ika.'
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Ambil email internal dari auth.users melalui Admin API (tidak pernah diekspos ke frontend)
      const { data: authUserData, error: userErr } = await supabaseAdmin.auth.admin.getUserById(accessRow.user_id);
      if (userErr || !authUserData?.user?.email) {
        return new Response(
          JSON.stringify({ error: 'Identitas autentikasi orang tua tidak valid.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Verifikasi password melalui Supabase Auth native (bukan pencocokan manual)
      const { data: signInData, error: signInErr } = await supabaseAuthClient.auth.signInWithPassword({
        email: authUserData.user.email,
        password
      });

      if (signInErr || !signInData.session) {
        return new Response(
          JSON.stringify({ error: 'NISN atau password yang Anda masukkan salah.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const nowIso = new Date().toISOString();
      await supabaseAdmin
        .from('parent_student_access')
        .update({ last_login_at: nowIso })
        .eq('id', accessRow.id);

      await supabaseAdmin
        .from('profiles')
        .update({ last_login_at: nowIso })
        .eq('id', accessRow.profile_id);

      await supabaseAdmin.from('audit_logs').insert({
        actor_id: accessRow.profile_id,
        actor_name: accessRow.nama_wali || `Orang Tua (${cleanNisn})`,
        actor_role: 'parent',
        actor_type: 'parent',
        action: 'PARENT_LOGIN',
        target_table: 'parent_student_access',
        target_id: cleanNisn,
        details: `Login berhasil oleh orang tua siswa dengan NISN ${cleanNisn}.`
      });

      return new Response(
        JSON.stringify({
          success: true,
          access_token: signInData.session.access_token,
          refresh_token: signInData.session.refresh_token,
          user: {
            id: accessRow.profile_id,
            siswa_id: accessRow.student_id,
            nisn: accessRow.nisn,
            nama_wali: accessRow.nama_wali || 'Orang Tua Siswa',
            no_hp: accessRow.no_hp_wali || '',
            is_active: accessRow.is_active,
            type: 'parent'
          }
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =========================================================================
    // 2. AKTIVASI AKUN & RESET PASSWORD ORANG TUA OLEH ADMIN BERWENANG
    // =========================================================================
    if (action === 'activate_or_reset_parent') {
      const authHeader = req.headers.get('Authorization') || '';
      const jwt = authHeader.replace('Bearer ', '').trim();
      if (!jwt) {
        return new Response(JSON.stringify({ error: 'Token otorisasi admin wajib disertakan.' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { data: callerAuth, error: callerErr } = await supabaseAdmin.auth.getUser(jwt);
      if (callerErr || !callerAuth?.user) {
        return new Response(JSON.stringify({ error: 'Sesi admin tidak valid.' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { data: adminProfile } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name, role, is_active')
        .eq('id', callerAuth.user.id)
        .single();

      if (!adminProfile || !adminProfile.is_active || !['super_admin', 'admin'].includes(adminProfile.role)) {
        return new Response(
          JSON.stringify({ error: 'Akses ditolak. Hanya Super Admin atau Admin yang dapat mengelola akun orang tua.' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const cleanNisn = String(body.nisn || '').trim().replace(/\D/g, '');
      const newPassword = String(body.password || '').trim();

      if (cleanNisn.length !== 10 || newPassword.length < 8) {
        return new Response(
          JSON.stringify({ error: 'NISN wajib 10 digit dan password minimal 8 karakter.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Pastikan jangan menggunakan NISN sebagai password
      if (newPassword.includes(cleanNisn)) {
        return new Response(
          JSON.stringify({ error: 'Demi keamanan, password tidak boleh mengandung atau sama dengan NISN siswa.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Cari siswa berdasarkan NISN
      const { data: student, error: studentErr } = await supabaseAdmin
        .from('students')
        .select('id, nisn, nama_lengkap_siswa, nama_wali, nama_ayah, no_hp_wali, no_wa_ayah')
        .eq('nisn', cleanNisn)
        .maybeSingle();

      if (studentErr || !student) {
        return new Response(
          JSON.stringify({ error: `Data siswa dengan NISN ${cleanNisn} tidak ditemukan di tabel students.` }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const internalEmail = buildInternalParentAuthEmail(cleanNisn);
      const waliName = student.nama_wali || student.nama_ayah || `Wali dari ${student.nama_lengkap_siswa}`;
      const waliPhone = student.no_hp_wali || student.no_wa_ayah || '';

      // Cek apakah parent_student_access sudah ada
      const { data: existingAccess } = await supabaseAdmin
        .from('parent_student_access')
        .select('id, user_id')
        .eq('nisn', cleanNisn)
        .maybeSingle();

      const nowIso = new Date().toISOString();
      let authUserId = existingAccess?.user_id;

      if (authUserId) {
        // Update password di Supabase Auth
        const { error: updateAuthErr } = await supabaseAdmin.auth.admin.updateUserById(authUserId, {
          password: newPassword,
          email_confirm: true
        });
        if (updateAuthErr) throw updateAuthErr;

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
            password_reset_at: nowIso,
            password_reset_by: adminProfile.id
          })
          .eq('id', existingAccess!.id);
      } else {
        // Buat user baru di Supabase Auth
        const { data: createdAuth, error: createAuthErr } = await supabaseAdmin.auth.admin.createUser({
          email: internalEmail,
          password: newPassword,
          email_confirm: true,
          user_metadata: {
            role: 'parent',
            student_id: student.id
          }
        });
        if (createAuthErr || !createdAuth.user) {
          throw createAuthErr || new Error('Gagal membuat akun Supabase Auth orang tua.');
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
          activated_at: nowIso,
          activated_by: adminProfile.id
        });
      }

      await supabaseAdmin.from('audit_logs').insert({
        actor_id: adminProfile.id,
        actor_name: adminProfile.full_name,
        actor_role: adminProfile.role,
        actor_type: 'admin',
        action: existingAccess ? 'RESET_PARENT_PASSWORD' : 'ACTIVATE_PARENT_ACCOUNT',
        target_table: 'parent_student_access',
        target_id: cleanNisn,
        details: `${existingAccess ? 'Reset password & aktivasi' : 'Aktivasi akun baru'} orang tua untuk NISN ${cleanNisn} (${student.nama_lengkap_siswa}).`
      });

      return new Response(
        JSON.stringify({
          success: true,
          message: `Akun orang tua untuk NISN ${cleanNisn} (${student.nama_lengkap_siswa}) berhasil diaktifkan.`
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Action tidak dikenali.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: unknown) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : 'Terjadi kesalahan internal pada layanan autentikasi.'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
