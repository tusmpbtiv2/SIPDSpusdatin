-- =================================================================================
-- SIPDS (SISTEM INFORMASI PENGELOLAAN DATA SISWA) - SMP BHINNEKA TUNGGAL IKA
-- Complete Production SQL Migration for Supabase PostgreSQL
-- Migration: 20261103000001_sipds_complete_schema.sql
--
-- Mencakup 11 Tabel Utama:
--   1. academic_years
--   2. classes
--   3. profiles
--   4. students (59 Kolom Biodata Lengkap Sesuai Standar Excel Sekolah)
--   5. student_mutations (Mutasi Masuk & Mutasi Keluar)
--   6. student_class_history (Riwayat Kelas & Kenaikan Kelas Siswa)
--   7. parent_student_access (Pemetaan Aman Akun Supabase Auth Orang Tua <-> Siswa)
--   8. student_change_requests (Header Pengajuan Koreksi Biodata oleh Orang Tua)
--   9. student_change_request_items (Detail Item Kolom yang Diajukan Diubah)
--  10. import_batches (Riwayat & Log Batch Import Excel/CSV)
--  11. audit_logs (Jejak Audit Seluruh Aktivitas Role)
-- =================================================================================

BEGIN;

-- ---------------------------------------------------------------------------------
-- 0. EXTENSIONS & CUSTOM TYPES (ENUMS)
-- ---------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role_type') THEN
        CREATE TYPE public.app_role_type AS ENUM (
            'super_admin',
            'admin',
            'operator',
            'viewer',
            'parent'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'student_status_type') THEN
        CREATE TYPE public.student_status_type AS ENUM (
            'aktif',
            'mutasi_masuk',
            'mutasi_keluar',
            'lulus',
            'non_aktif'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mutation_type') THEN
        CREATE TYPE public.mutation_type AS ENUM (
            'masuk',
            'keluar'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'change_request_status_type') THEN
        CREATE TYPE public.change_request_status_type AS ENUM (
            'draft',
            'pending',
            'partially_approved',
            'approved',
            'rejected',
            'cancelled'
        );
    END IF;
END$$;

-- Trigger helper untuk mengupdate kolom updated_at secara otomatis
CREATE OR REPLACE FUNCTION public.trigger_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------------
-- 1. TABEL: academic_years (Tahun Ajaran & Semester)
-- ---------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.academic_years (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tahun_ajaran TEXT NOT NULL, -- Contoh: '2025/2026'
    semester TEXT NOT NULL CHECK (semester IN ('Ganjil', 'Genap')),
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    tanggal_mulai DATE,
    tanggal_selesai DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_academic_year_semester UNIQUE (tahun_ajaran, semester)
);

CREATE INDEX IF NOT EXISTS idx_academic_years_active ON public.academic_years(is_active);

DROP TRIGGER IF EXISTS trg_academic_years_updated_at ON public.academic_years;
CREATE TRIGGER trg_academic_years_updated_at
BEFORE UPDATE ON public.academic_years
FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- ---------------------------------------------------------------------------------
-- 2. TABEL: classes (Master Kelas / Rombongan Belajar)
-- ---------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE SET NULL,
    nama_kelas TEXT NOT NULL, -- Contoh: '7A', '7B', '8A', '9C'
    tingkat_kelas TEXT NOT NULL CHECK (tingkat_kelas IN ('7', '8', '9')),
    wali_kelas TEXT,
    kapasitas INTEGER NOT NULL DEFAULT 32 CHECK (kapasitas > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_classes_nama_tahun UNIQUE (nama_kelas, academic_year_id)
);

CREATE INDEX IF NOT EXISTS idx_classes_nama ON public.classes(nama_kelas);
CREATE INDEX IF NOT EXISTS idx_classes_tingkat ON public.classes(tingkat_kelas);

DROP TRIGGER IF EXISTS trg_classes_updated_at ON public.classes;
CREATE TRIGGER trg_classes_updated_at
BEFORE UPDATE ON public.classes
FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- ---------------------------------------------------------------------------------
-- 3. TABEL: profiles (Profil Pengguna Supabase Auth - Admin, Operator, Viewer, Parent)
-- Catatan Keamanan: Password TIDAK disimpan di tabel ini melainkan dikelola
-- sepenuhnya oleh Supabase Auth (auth.users).
-- ---------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE,
    username TEXT UNIQUE,
    full_name TEXT NOT NULL,
    role public.app_role_type NOT NULL DEFAULT 'parent',
    phone TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_active ON public.profiles(is_active);

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- ---------------------------------------------------------------------------------
-- 4. TABEL: import_batches (Log Batch Import Data Siswa dari Excel/CSV)
-- ---------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.import_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    imported_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    file_name TEXT NOT NULL,
    import_mode TEXT NOT NULL DEFAULT 'insert_only' CHECK (import_mode IN ('insert_only', 'update_by_nis', 'upsert')),
    total_rows INTEGER NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
    success_rows INTEGER NOT NULL DEFAULT 0 CHECK (success_rows >= 0),
    failed_rows INTEGER NOT NULL DEFAULT 0 CHECK (failed_rows >= 0),
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('processing', 'completed', 'partial', 'failed')),
    error_details JSONB NOT NULL DEFAULT '[]'::jsonb,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_batches_created_at ON public.import_batches(created_at DESC);

-- ---------------------------------------------------------------------------------
-- 5. TABEL: students (Biodata Induk Siswa Lengkap - 59 Kolom Sesuai Excel Pengguna)
-- Semua nomor identitas (NIS, NISN, NIK, KK, NPSN), telepon/WA, dan kode pos
-- bertipe TEXT agar angka nol di depan (leading zero) tidak hilang.
-- Tanggal bertipe DATE. Berat badan, tinggi badan, dan penghasilan bertipe NUMERIC.
-- ---------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Relasi ke Tabel Classes & Import Batch
    class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
    import_batch_id UUID REFERENCES public.import_batches(id) ON DELETE SET NULL,

    -- [1] KELAS
    kelas TEXT NOT NULL,
    tingkat_kelas TEXT GENERATED ALWAYS AS (
        CASE
            WHEN left(btrim(kelas), 1) IN ('7', '8', '9') THEN left(btrim(kelas), 1)
            ELSE '7'
        END
    ) STORED,

    -- [2] NIS (Unik jika terisi, lihat partial unique index di bawah)
    nis TEXT,

    -- [3] ID YYS
    id_yys TEXT,

    -- [4] KAMAR
    kamar TEXT,

    -- [5] NAMA LENGKAP SISWA
    nama_lengkap_siswa TEXT NOT NULL,

    -- [6] NO KK (16 digit TEXT)
    no_kk TEXT,

    -- [7] NIK SISWA (16 digit TEXT)
    nik_siswa TEXT,

    -- [8] NISN (10 digit TEXT, unik jika terisi)
    nisn TEXT,

    -- [9] No Ijazah SD/MI (Bagian Sekolah Asal SD/MI)
    no_ijazah_sd_mi TEXT,

    -- [10] Tanggal Penerbitan Ijazah (Bagian Sekolah Asal SD/MI)
    tanggal_penerbitan_ijazah DATE,

    -- [11] Jenis Kelamin ('L' / 'P')
    jenis_kelamin TEXT NOT NULL CHECK (jenis_kelamin IN ('L', 'P')),

    -- [12] TEMPAT LAHIR
    tempat_lahir TEXT,

    -- [13] TANGGAL LAHIR
    tanggal_lahir DATE,

    -- [14] AGAMA
    agama TEXT DEFAULT 'Islam',

    -- [15] BERAT BADAN (kg - NUMERIC)
    berat_badan NUMERIC(5,2) CHECK (berat_badan IS NULL OR berat_badan >= 0),

    -- [16] TINGGI BADAN (cm - NUMERIC)
    tinggi_badan NUMERIC(5,2) CHECK (tinggi_badan IS NULL OR tinggi_badan >= 0),

    -- [17] RIWAYAT PENYAKIT
    riwayat_penyakit TEXT,

    -- [18] STATUS ANAK
    status_anak TEXT DEFAULT 'Anak Kandung',

    -- [19] KEWARGANEGARAAN
    kewarganegaraan TEXT DEFAULT 'WNI',

    -- [20] Anak Ke-
    anak_ke INTEGER CHECK (anak_ke IS NULL OR anak_ke >= 1),

    -- [21] Jumlah Saudara Kandung
    jumlah_saudara_kandung INTEGER DEFAULT 0 CHECK (jumlah_saudara_kandung IS NULL OR jumlah_saudara_kandung >= 0),

    -- [22] Jumlah Saudara TIRI
    jumlah_saudara_tiri INTEGER DEFAULT 0 CHECK (jumlah_saudara_tiri IS NULL OR jumlah_saudara_tiri >= 0),

    -- [23] Jalan/Dusun
    jalan_dusun TEXT,

    -- [24] RT/RW
    rt_rw TEXT,

    -- [25] Desa/Kelurahan
    desa_kelurahan TEXT,

    -- [26] Kecamatan
    kecamatan TEXT,

    -- [27] Kode Pos (TEXT agar leading zero terjaga)
    kode_pos TEXT,

    -- [28] Kota/Kabupaten
    kota_kabupaten TEXT,

    -- [29] Provinsi
    provinsi TEXT,

    -- [30] Alamat Lengkap
    alamat_lengkap TEXT,

    -- [31] Jenjang (SD / MI / Paket A)
    jenjang TEXT DEFAULT 'SD',

    -- [32] Nama Asal Sekolah
    nama_asal_sekolah TEXT,

    -- [33] NPSN Asal Sekolah (TEXT agar leading zero terjaga)
    npsn_asal_sekolah TEXT,

    -- [34] Kecamatan Asal Sekolah
    kecamatan_asal_sekolah TEXT,

    -- [35] Kabupaten Asal Sekolah
    kabupaten_asal_sekolah TEXT,

    -- [36] Provinsi Asal Sekolah
    provinsi_asal_sekolah TEXT,

    -- [37] NAMA AYAH
    nama_ayah TEXT,

    -- [38] NIK Ayah (TEXT)
    nik_ayah TEXT,

    -- [39] Tempat Lahir Ayah
    tempat_lahir_ayah TEXT,

    -- [40] Tgl Lahir Ayah (DATE)
    tgl_lahir_ayah DATE,

    -- [41] Pendidikan ayah
    pendidikan_ayah TEXT,

    -- [42] Pekerjaan Ayah
    pekerjaan_ayah TEXT,

    -- [43] No WA Ayah (TEXT)
    no_wa_ayah TEXT,

    -- [44] Penghasilan Ayah (NUMERIC)
    penghasilan_ayah NUMERIC(15,2) DEFAULT 0 CHECK (penghasilan_ayah IS NULL OR penghasilan_ayah >= 0),

    -- [45] NAMA IBU KANDUNG
    nama_ibu_kandung TEXT,

    -- [46] NIK IBU (TEXT)
    nik_ibu TEXT,

    -- [47] Tempat Lahir Ibu
    tempat_lahir_ibu TEXT,

    -- [48] Tgl Lahir Ibu (DATE)
    tgl_lahir_ibu DATE,

    -- [49] Pendidikan Ibu
    pendidikan_ibu TEXT,

    -- [50] Pekerjaan Ibu
    pekerjaan_ibu TEXT,

    -- [51] No Wa Ibu (TEXT)
    no_wa_ibu TEXT,

    -- [52] Penghasilan Ibu (NUMERIC)
    penghasilan_ibu NUMERIC(15,2) DEFAULT 0 CHECK (penghasilan_ibu IS NULL OR penghasilan_ibu >= 0),

    -- [53] Nama Wali
    nama_wali TEXT,

    -- [54] NIK Wali (TEXT)
    nik_wali TEXT,

    -- [55] Pekerjaan Wali
    pekerjaan_wali TEXT,

    -- [56] Penghasilan Wali (NUMERIC)
    penghasilan_wali NUMERIC(15,2) DEFAULT 0 CHECK (penghasilan_wali IS NULL OR penghasilan_wali >= 0),

    -- [57] No HP Wali (TEXT)
    no_hp_wali TEXT,

    -- [58] Status Aktif
    status_aktif public.student_status_type NOT NULL DEFAULT 'aktif',

    -- [59] Tanggal Masuk (DATE)
    tanggal_masuk DATE DEFAULT CURRENT_DATE,

    -- Metadata Audit
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Validasi format NISN jika diisi (wajib 10 digit angka)
    CONSTRAINT chk_students_nisn_format CHECK (
        nisn IS NULL OR btrim(nisn) = '' OR nisn ~ '^[0-9]{10}$'
    )
);

-- Unik jika terisi untuk NIS dan NISN
CREATE UNIQUE INDEX IF NOT EXISTS uq_students_nis_not_empty
    ON public.students (btrim(nis))
    WHERE nis IS NOT NULL AND btrim(nis) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_students_nisn_not_empty
    ON public.students (btrim(nisn))
    WHERE nisn IS NOT NULL AND btrim(nisn) <> '';

CREATE INDEX IF NOT EXISTS idx_students_class_id ON public.students(class_id);
CREATE INDEX IF NOT EXISTS idx_students_kelas ON public.students(kelas);
CREATE INDEX IF NOT EXISTS idx_students_nama ON public.students(nama_lengkap_siswa);
CREATE INDEX IF NOT EXISTS idx_students_status ON public.students(status_aktif);
CREATE INDEX IF NOT EXISTS idx_students_nik ON public.students(nik_siswa);

DROP TRIGGER IF EXISTS trg_students_updated_at ON public.students;
CREATE TRIGGER trg_students_updated_at
BEFORE UPDATE ON public.students
FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- ---------------------------------------------------------------------------------
-- 6. TABEL: student_mutations (Mutasi Masuk & Mutasi Keluar Siswa)
-- Kolom Mutasi Keluar : KELAS, NIS, NAMA LENGKAP SISWA, Tanggal Pindah, Alasan Pindah, Sekolah Tujuan
-- Kolom Mutasi Masuk  : KELAS, NIS, NAMA LENGKAP SISWA, Tanggal Pindah, Sekolah Asal
-- Dilengkapi jenis mutasi spesifik, NPSN, Kecamatan, Kabupaten, Provinsi, Tahun Ajaran,
-- Petugas, serta dukungan pembatalan transaksi oleh Admin berwenang.
-- ---------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_mutations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    jenis_mutasi public.mutation_type NOT NULL,
    kategori_mutasi TEXT NOT NULL DEFAULT 'Pindah sekolah' CHECK (
        kategori_mutasi IN (
            'Masuk Pindahan',
            'Pindah sekolah',
            'Mengundurkan diri',
            'Keluar karena alasan lain',
            'Lulus',
            'Meninggal dunia'
        )
    ),
    kelas TEXT NOT NULL,
    nis TEXT,
    nisn TEXT,
    nama_lengkap_siswa TEXT NOT NULL,
    tanggal_pindah DATE NOT NULL DEFAULT CURRENT_DATE,
    tahun_ajaran TEXT NOT NULL DEFAULT '2025/2026',
    alasan_pindah TEXT,
    sekolah_asal TEXT,
    sekolah_tujuan TEXT,
    npsn_sekolah TEXT,
    kecamatan_sekolah TEXT,
    kabupaten_sekolah TEXT,
    provinsi_sekolah TEXT,
    no_surat_mutasi TEXT,
    keterangan TEXT,
    petugas_nama TEXT,
    previous_student_status public.student_status_type DEFAULT 'aktif',
    status_mutasi TEXT NOT NULL DEFAULT 'selesai' CHECK (status_mutasi IN ('diproses', 'selesai', 'dibatalkan')),
    cancelled_at TIMESTAMPTZ,
    cancelled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    cancelled_by_name TEXT,
    alasan_pembatalan TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_mutations_student_id ON public.student_mutations(student_id);
CREATE INDEX IF NOT EXISTS idx_student_mutations_jenis ON public.student_mutations(jenis_mutasi);
CREATE INDEX IF NOT EXISTS idx_student_mutations_kategori ON public.student_mutations(kategori_mutasi);
CREATE INDEX IF NOT EXISTS idx_student_mutations_tanggal ON public.student_mutations(tanggal_pindah DESC);
CREATE INDEX IF NOT EXISTS idx_student_mutations_status ON public.student_mutations(status_mutasi);

DROP TRIGGER IF EXISTS trg_student_mutations_updated_at ON public.student_mutations;
CREATE TRIGGER trg_student_mutations_updated_at
BEFORE UPDATE ON public.student_mutations
FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- ---------------------------------------------------------------------------------
-- 7. TABEL: student_class_history (Riwayat Penempatan Kelas & Kenaikan Kelas Siswa)
-- ---------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_class_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
    academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE SET NULL,
    kelas TEXT NOT NULL,
    tingkat_kelas TEXT NOT NULL CHECK (tingkat_kelas IN ('7', '8', '9')),
    kamar TEXT,
    status_riwayat TEXT NOT NULL DEFAULT 'aktif' CHECK (status_riwayat IN ('aktif', 'naik_kelas', 'tinggal_kelas', 'pindah_rombel', 'lulus', 'mutasi')),
    tanggal_mulai DATE NOT NULL DEFAULT CURRENT_DATE,
    tanggal_selesai DATE,
    catatan TEXT,
    recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_class_history_student_id ON public.student_class_history(student_id);
CREATE INDEX IF NOT EXISTS idx_class_history_class_id ON public.student_class_history(class_id);
CREATE INDEX IF NOT EXISTS idx_class_history_academic_year ON public.student_class_history(academic_year_id);

-- ---------------------------------------------------------------------------------
-- 8. TABEL: parent_student_access (Pemetaan Akun Supabase Auth Orang Tua <-> Siswa)
-- Catatan Arsitektur Autentikasi:
-- - Tabel ini menghubungkan auth.users / public.profiles dengan public.students.
-- - TIDAK menyimpan password. Password disimpan secara terenkripsi oleh Supabase Auth
--   di skema internal auth.users.
-- - Hanya diakses untuk manajemen kredensial oleh Backend/Edge Function menggunakan
--   SUPABASE_SERVICE_ROLE_KEY.
-- ---------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.parent_student_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    nisn TEXT NOT NULL,
    hubungan_wali TEXT NOT NULL DEFAULT 'Orang Tua / Wali',
    nama_wali TEXT,
    no_hp_wali TEXT,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    activated_at TIMESTAMPTZ,
    activated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    password_reset_at TIMESTAMPTZ,
    password_reset_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_parent_student_user UNIQUE (user_id, student_id),
    CONSTRAINT uq_parent_student_nisn UNIQUE (nisn)
);

CREATE INDEX IF NOT EXISTS idx_parent_access_user_id ON public.parent_student_access(user_id);
CREATE INDEX IF NOT EXISTS idx_parent_access_student_id ON public.parent_student_access(student_id);
CREATE INDEX IF NOT EXISTS idx_parent_access_nisn ON public.parent_student_access(nisn);
CREATE INDEX IF NOT EXISTS idx_parent_access_active ON public.parent_student_access(is_active);

DROP TRIGGER IF EXISTS trg_parent_student_access_updated_at ON public.parent_student_access;
CREATE TRIGGER trg_parent_student_access_updated_at
BEFORE UPDATE ON public.parent_student_access
FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- ---------------------------------------------------------------------------------
-- 9. TABEL: student_change_requests (Pengajuan Perubahan Biodata oleh Orang Tua)
-- ---------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_change_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    requested_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    requester_name TEXT,
    requester_relation TEXT DEFAULT 'Orang Tua / Wali',
    nis TEXT,
    nisn TEXT NOT NULL,
    nama_siswa TEXT NOT NULL,
    kelas TEXT,
    alasan_pengajuan TEXT NOT NULL,
    dokumen_pendukung_url TEXT,
    dokumen_pendukung_nama TEXT,
    status public.change_request_status_type NOT NULL DEFAULT 'pending',
    reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reviewer_name TEXT,
    catatan_verifikator TEXT,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_change_requests_student_id ON public.student_change_requests(student_id);
CREATE INDEX IF NOT EXISTS idx_change_requests_requested_by ON public.student_change_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_change_requests_status ON public.student_change_requests(status);
CREATE INDEX IF NOT EXISTS idx_change_requests_submitted_at ON public.student_change_requests(submitted_at DESC);

DROP TRIGGER IF EXISTS trg_student_change_requests_updated_at ON public.student_change_requests;
CREATE TRIGGER trg_student_change_requests_updated_at
BEFORE UPDATE ON public.student_change_requests
FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- ---------------------------------------------------------------------------------
-- 10. TABEL: student_change_request_items (Detail Item Kolom Pengajuan Perubahan)
-- ---------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_change_request_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    change_request_id UUID NOT NULL REFERENCES public.student_change_requests(id) ON DELETE CASCADE,
    field_name TEXT NOT NULL,
    field_label TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    item_status TEXT NOT NULL DEFAULT 'pending' CHECK (item_status IN ('pending', 'approved', 'rejected')),
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_change_request_items_req_id
    ON public.student_change_request_items(change_request_id);

-- ---------------------------------------------------------------------------------
-- 11. TABEL: audit_logs (Jejak Audit Seluruh Aktivitas Pengguna)
-- ---------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    actor_name TEXT NOT NULL,
    actor_role TEXT NOT NULL,
    actor_type TEXT NOT NULL CHECK (actor_type IN ('admin', 'parent', 'system')),
    action TEXT NOT NULL,
    target_table TEXT NOT NULL,
    target_id TEXT,
    old_values JSONB,
    new_values JSONB,
    details TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_table ON public.audit_logs(target_table);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- =================================================================================
-- FUNGSI OTOMATISASI & KEAMANAN (SECURITY DEFINER FUNCTIONS)
-- =================================================================================

-- Mendapatkan role user yang sedang login apabila akunnya aktif
CREATE OR REPLACE FUNCTION public.get_active_user_role()
RETURNS public.app_role_type
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role
    FROM public.profiles
    WHERE id = auth.uid()
      AND is_active = TRUE
    LIMIT 1;
$$;

-- Cek apakah user adalah staf sekolah (super_admin, admin, operator, viewer)
CREATE OR REPLACE FUNCTION public.is_school_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE id = auth.uid()
          AND is_active = TRUE
          AND role IN ('super_admin', 'admin', 'operator', 'viewer')
    );
$$;

-- Cek apakah user adalah admin yang berhak menulis/mengubah data siswa (super_admin, admin, operator)
CREATE OR REPLACE FUNCTION public.can_manage_students()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE id = auth.uid()
          AND is_active = TRUE
          AND role IN ('super_admin', 'admin', 'operator')
    );
$$;

-- Cek apakah user adalah pejabat yang berwenang menyetujui perubahan biodata & mengelola akun (super_admin, admin)
CREATE OR REPLACE FUNCTION public.is_authorized_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE id = auth.uid()
          AND is_active = TRUE
          AND role IN ('super_admin', 'admin')
    );
$$;

-- Cek apakah orang tua yang sedang login terhubung secara sah & aktif dengan siswa tertentu
CREATE OR REPLACE FUNCTION public.is_linked_active_parent(target_student_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.parent_student_access psa
        JOIN public.profiles p ON p.id = psa.profile_id
        WHERE psa.user_id = auth.uid()
          AND psa.student_id = target_student_id
          AND psa.is_active = TRUE
          AND p.is_active = TRUE
          AND p.role = 'parent'
    );
$$;

-- Trigger otomatis mencatat riwayat kelas saat siswa baru ditambahkan atau pindah kelas
CREATE OR REPLACE FUNCTION public.fn_record_student_class_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF (TG_OP = 'INSERT') OR (TG_OP = 'UPDATE' AND OLD.kelas IS DISTINCT FROM NEW.kelas) THEN
        INSERT INTO public.student_class_history (
            student_id,
            class_id,
            kelas,
            tingkat_kelas,
            kamar,
            status_riwayat,
            tanggal_mulai,
            catatan,
            recorded_by
        ) VALUES (
            NEW.id,
            NEW.class_id,
            NEW.kelas,
            NEW.tingkat_kelas,
            NEW.kamar,
            CASE WHEN TG_OP = 'INSERT' THEN 'aktif' ELSE 'pindah_rombel' END,
            CURRENT_DATE,
            CASE
                WHEN TG_OP = 'INSERT' THEN 'Penempatan kelas awal siswa terdaftar'
                ELSE 'Perubahan kelas dari ' || COALESCE(OLD.kelas, '-') || ' ke ' || NEW.kelas
            END,
            auth.uid()
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_student_class_history_auto ON public.students;
CREATE TRIGGER trg_student_class_history_auto
AFTER INSERT OR UPDATE OF kelas ON public.students
FOR EACH ROW EXECUTE FUNCTION public.fn_record_student_class_history();

-- Trigger proteksi: Larang penghapusan siswa yang sudah mutasi keluar
CREATE OR REPLACE FUNCTION public.fn_prevent_delete_mutasi_keluar_student()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.status_aktif = 'mutasi_keluar' OR EXISTS (
        SELECT 1 FROM public.student_mutations sm
        WHERE sm.student_id = OLD.id AND sm.jenis_mutasi = 'keluar'
    ) THEN
        RAISE EXCEPTION 'Siswa yang sudah mutasi keluar tidak boleh dihapus dari buku induk (gunakan arsip / pertahankan riwayat mutasi).';
    END IF;
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_delete_mutasi_keluar ON public.students;
CREATE TRIGGER trg_prevent_delete_mutasi_keluar
BEFORE DELETE ON public.students
FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_delete_mutasi_keluar_student();

-- =================================================================================
-- ROW LEVEL SECURITY (RLS) PADA SELURUH 11 TABEL
-- =================================================================================

ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_mutations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_class_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_student_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_change_request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 1. RLS: academic_years
CREATE POLICY "academic_years_select_authenticated"
    ON public.academic_years FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "academic_years_manage_admin"
    ON public.academic_years FOR ALL
    TO authenticated
    USING (public.is_authorized_admin())
    WITH CHECK (public.is_authorized_admin());

-- 2. RLS: classes
CREATE POLICY "classes_select_authenticated"
    ON public.classes FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "classes_manage_staff"
    ON public.classes FOR ALL
    TO authenticated
    USING (public.can_manage_students())
    WITH CHECK (public.can_manage_students());

-- 3. RLS: profiles
DROP POLICY IF EXISTS "profiles_select_self_or_staff" ON public.profiles;
CREATE POLICY "profiles_select_self_or_staff"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (id = auth.uid() OR public.is_school_staff());

DROP POLICY IF EXISTS "profiles_insert_self_or_admin" ON public.profiles;
CREATE POLICY "profiles_insert_self_or_admin"
    ON public.profiles FOR INSERT
    TO authenticated
    WITH CHECK (id = auth.uid() OR public.is_authorized_admin());

DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;
CREATE POLICY "profiles_update_self"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (id = auth.uid() OR public.is_authorized_admin())
    WITH CHECK (id = auth.uid() OR public.is_authorized_admin());

DROP POLICY IF EXISTS "profiles_manage_super_admin" ON public.profiles;
CREATE POLICY "profiles_manage_super_admin"
    ON public.profiles FOR ALL
    TO authenticated
    USING (public.is_authorized_admin())
    WITH CHECK (public.is_authorized_admin());

-- Trigger otomatis untuk menyinkronkan user baru dari auth.users ke public.profiles (mendukung penuh Netlify signUp)
CREATE OR REPLACE FUNCTION public.fn_handle_new_auth_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role public.app_role_type;
    v_username TEXT;
    v_full_name TEXT;
    v_phone TEXT;
BEGIN
    IF NEW.email IS NOT NULL AND NEW.email LIKE '%@auth-internal.smpbhinneka.sch.id' THEN
        RETURN NEW;
    END IF;

    v_role := CASE
        WHEN (NEW.raw_user_meta_data ->> 'role') IN ('super_admin', 'admin', 'operator', 'viewer', 'parent')
            THEN (NEW.raw_user_meta_data ->> 'role')::public.app_role_type
        ELSE 'operator'::public.app_role_type
    END;

    v_username := lower(btrim(COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'username', ''), split_part(NEW.email, '@', 1))));
    v_full_name := btrim(COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''), split_part(NEW.email, '@', 1)));
    v_phone := NULLIF(btrim(COALESCE(NEW.raw_user_meta_data ->> 'phone', '')), '');

    INSERT INTO public.profiles (id, email, username, full_name, role, phone, is_active)
    VALUES (NEW.id, lower(btrim(NEW.email)), v_username, v_full_name, v_role, v_phone, TRUE)
    ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), public.profiles.full_name),
        role = EXCLUDED.role,
        updated_at = NOW();

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_on_auth_user_created_profile ON auth.users;
CREATE TRIGGER trg_on_auth_user_created_profile
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.fn_handle_new_auth_user_profile();

-- 4. RLS: students
-- Aturan Ketat:
-- - Staf sekolah dapat membaca seluruh data siswa.
-- - Orang tua HANYA bisa membaca biodata siswa yang terhubung dengan akun mereka.
-- - Orang tua TIDAK BOLEH melakukan INSERT, UPDATE, atau DELETE pada tabel students.
CREATE POLICY "students_select_staff_or_linked_parent"
    ON public.students FOR SELECT
    TO authenticated
    USING (
        public.is_school_staff()
        OR public.is_linked_active_parent(id)
    );

CREATE POLICY "students_insert_staff_only"
    ON public.students FOR INSERT
    TO authenticated
    WITH CHECK (public.can_manage_students());

CREATE POLICY "students_update_staff_only"
    ON public.students FOR UPDATE
    TO authenticated
    USING (public.can_manage_students())
    WITH CHECK (public.can_manage_students());

CREATE POLICY "students_delete_authorized_admin_only"
    ON public.students FOR DELETE
    TO authenticated
    USING (public.is_authorized_admin() AND status_aktif <> 'mutasi_keluar');

-- 5. RLS: student_mutations
CREATE POLICY "student_mutations_select_staff_or_parent"
    ON public.student_mutations FOR SELECT
    TO authenticated
    USING (
        public.is_school_staff()
        OR public.is_linked_active_parent(student_id)
    );

CREATE POLICY "student_mutations_manage_staff"
    ON public.student_mutations FOR ALL
    TO authenticated
    USING (public.can_manage_students())
    WITH CHECK (public.can_manage_students());

-- 6. RLS: student_class_history
CREATE POLICY "student_class_history_select_staff_or_parent"
    ON public.student_class_history FOR SELECT
    TO authenticated
    USING (
        public.is_school_staff()
        OR public.is_linked_active_parent(student_id)
    );

CREATE POLICY "student_class_history_manage_staff"
    ON public.student_class_history FOR ALL
    TO authenticated
    USING (public.can_manage_students())
    WITH CHECK (public.can_manage_students());

-- 7. RLS: parent_student_access
-- Orang tua hanya bisa melihat status akses miliknya sendiri; Admin mengelola aktivasi.
CREATE POLICY "parent_access_select_self_or_staff"
    ON public.parent_student_access FOR SELECT
    TO authenticated
    USING (
        user_id = auth.uid()
        OR public.is_school_staff()
    );

CREATE POLICY "parent_access_manage_admin"
    ON public.parent_student_access FOR ALL
    TO authenticated
    USING (public.is_authorized_admin())
    WITH CHECK (public.is_authorized_admin());

-- 8. RLS: student_change_requests
-- Orang tua hanya boleh mengajukan perubahan (INSERT draft/pending), memperbarui draft/membatalkan pengajuan miliknya (UPDATE draft->pending / cancelled), dan membaca pengajuan miliknya.
-- Hanya admin berwenang yang dapat menyetujui/menolak (approved, partially_approved, rejected).
CREATE POLICY "change_requests_select_self_or_staff"
    ON public.student_change_requests FOR SELECT
    TO authenticated
    USING (
        requested_by = auth.uid()
        OR public.is_linked_active_parent(student_id)
        OR public.is_school_staff()
    );

CREATE POLICY "change_requests_insert_linked_parent"
    ON public.student_change_requests FOR INSERT
    TO authenticated
    WITH CHECK (
        requested_by = auth.uid()
        AND public.is_linked_active_parent(student_id)
        AND status IN ('draft', 'pending')
    );

CREATE POLICY "change_requests_update_parent_own_draft_or_cancel"
    ON public.student_change_requests FOR UPDATE
    TO authenticated
    USING (
        requested_by = auth.uid()
        AND public.is_linked_active_parent(student_id)
        AND status IN ('draft', 'pending')
    )
    WITH CHECK (
        requested_by = auth.uid()
        AND public.is_linked_active_parent(student_id)
        AND status IN ('draft', 'pending', 'cancelled')
    );

CREATE POLICY "change_requests_update_authorized_admin"
    ON public.student_change_requests FOR UPDATE
    TO authenticated
    USING (public.is_authorized_admin() OR public.can_manage_students())
    WITH CHECK (public.is_authorized_admin() OR public.can_manage_students());

CREATE POLICY "change_requests_delete_authorized_admin"
    ON public.student_change_requests FOR DELETE
    TO authenticated
    USING (public.is_authorized_admin());

-- 9. RLS: student_change_request_items
CREATE POLICY "change_request_items_select_self_or_staff"
    ON public.student_change_request_items FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.student_change_requests r
            WHERE r.id = change_request_id
              AND (
                  r.requested_by = auth.uid()
                  OR public.is_linked_active_parent(r.student_id)
                  OR public.is_school_staff()
              )
        )
    );

CREATE POLICY "change_request_items_insert_linked_parent"
    ON public.student_change_request_items FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.student_change_requests r
            WHERE r.id = change_request_id
              AND r.requested_by = auth.uid()
              AND public.is_linked_active_parent(r.student_id)
              AND r.status IN ('draft', 'pending')
        )
    );

CREATE POLICY "change_request_items_manage_admin"
    ON public.student_change_request_items FOR ALL
    TO authenticated
    USING (public.is_authorized_admin() OR public.can_manage_students())
    WITH CHECK (public.is_authorized_admin() OR public.can_manage_students());

-- 10. RLS: import_batches
CREATE POLICY "import_batches_select_staff"
    ON public.import_batches FOR SELECT
    TO authenticated
    USING (public.is_school_staff());

CREATE POLICY "import_batches_insert_staff"
    ON public.import_batches FOR INSERT
    TO authenticated
    WITH CHECK (public.can_manage_students());

CREATE POLICY "import_batches_update_staff"
    ON public.import_batches FOR UPDATE
    TO authenticated
    USING (public.can_manage_students())
    WITH CHECK (public.can_manage_students());

-- 11. RLS: audit_logs
CREATE POLICY "audit_logs_select_staff"
    ON public.audit_logs FOR SELECT
    TO authenticated
    USING (public.is_school_staff());

CREATE POLICY "audit_logs_insert_authenticated"
    ON public.audit_logs FOR INSERT
    TO authenticated
    WITH CHECK (actor_id = auth.uid() OR public.is_school_staff());

-- =================================================================================
-- TRANSACTIONAL SUPABASE RPC / DATABASE FUNCTIONS
-- 1. rpc_review_student_change_request (Verifikasi Perubahan Biodata Transaksional)
-- 2. rpc_process_mutation_in (Mutasi Masuk Transaksional)
-- 3. rpc_process_mutation_out (Mutasi Keluar Transaksional)
-- 4. rpc_cancel_student_mutation (Pembatalan Transaksi Mutasi oleh Admin Berwenang)
-- =================================================================================

-- Helper pemetaan nama field aplikasi -> kolom database tabel public.students
CREATE OR REPLACE FUNCTION public.fn_resolve_student_db_column(p_field_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE p_field_name
        WHEN 'rombel' THEN 'kelas'
        WHEN 'nama_lengkap' THEN 'nama_lengkap_siswa'
        WHEN 'no_ijazah_sd' THEN 'no_ijazah_sd_mi'
        WHEN 'tgl_ijazah_sd' THEN 'tanggal_penerbitan_ijazah'
        WHEN 'jml_saudara_kandung' THEN 'jumlah_saudara_kandung'
        WHEN 'jml_saudara_tiri' THEN 'jumlah_saudara_tiri'
        WHEN 'kelurahan' THEN 'desa_kelurahan'
        WHEN 'kab_kota' THEN 'kota_kabupaten'
        WHEN 'alamat' THEN 'alamat_lengkap'
        WHEN 'jenjang_asal' THEN 'jenjang'
        WHEN 'nama_ibu' THEN 'nama_ibu_kandung'
        WHEN 'no_hp_orangtua' THEN 'no_hp_wali'
        WHEN 'status' THEN 'status_aktif'
        ELSE p_field_name
    END;
$$;

-- ---------------------------------------------------------------------------------
-- RPC 1: Verifikasi Perubahan Biodata (Aman & Transaksional)
-- - Memvalidasi role admin (super_admin, admin, operator). Orang tua ditolak keras.
-- - Memvalidasi identitas pengaju, kepemilikan siswa (parent_student_access), dan status pengajuan.
-- - Mencegah persetujuan ganda (wajib berstatus 'pending').
-- - Memeriksa nilai lama (old_value) sebelum update untuk mencegah data terbaru tertimpa.
-- - Hanya kolom yang disetujui ('approved') yang memperbarui tabel public.students.
-- - Mencatat nilai sebelum (old_values) dan sesudah (new_values) dalam public.audit_logs.
-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_review_student_change_request(
    p_request_id UUID,
    p_item_decisions JSONB,
    p_reviewer_note TEXT DEFAULT NULL,
    p_force_override BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_profile public.profiles%ROWTYPE;
    v_req public.student_change_requests%ROWTYPE;
    v_student public.students%ROWTYPE;
    v_student_json JSONB;
    v_item RECORD;
    v_decision_obj JSONB;
    v_item_status TEXT;
    v_item_reason TEXT;
    v_db_col TEXT;
    v_current_db_val TEXT;
    v_expected_old_val TEXT;
    v_approved_count INTEGER := 0;
    v_rejected_count INTEGER := 0;
    v_final_status public.change_request_status_type;
    v_old_values JSONB := '{}'::jsonb;
    v_new_values JSONB := '{}'::jsonb;
BEGIN
    -- 1. Validasi Role Admin (Orang Tua & Viewer dilarang menyetujui)
    SELECT * INTO v_caller_profile
    FROM public.profiles
    WHERE id = v_caller_id AND is_active = TRUE;

    IF NOT FOUND OR v_caller_profile.role NOT IN ('super_admin', 'admin', 'operator') THEN
        RAISE EXCEPTION 'AKSES DITOLAK: Hanya Admin / Operator berwenang yang dapat memverifikasi perubahan biodata.';
    END IF;

    -- 2. Kunci baris pengajuan (FOR UPDATE) & Cegah Persetujuan Ganda
    SELECT * INTO v_req
    FROM public.student_change_requests
    WHERE id = p_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pengajuan perubahan biodata tidak ditemukan.';
    END IF;

    IF v_req.status <> 'pending' THEN
        RAISE EXCEPTION 'CEGAH PERSETUJUAN GANDA: Pengajuan ini sudah memiliki keputusan final (Status saat ini: %).', v_req.status;
    END IF;

    -- 3. Validasi Identitas Pengaju & Kepemilikan Siswa
    IF NOT EXISTS (
        SELECT 1
        FROM public.parent_student_access psa
        WHERE psa.student_id = v_req.student_id
          AND (psa.user_id = v_req.requested_by OR psa.profile_id = v_req.requested_by OR psa.nisn = v_req.nisn)
    ) AND NOT EXISTS (
        SELECT 1 FROM public.profiles p WHERE p.id = v_req.requested_by
    ) THEN
        RAISE EXCEPTION 'VALIDASI KEPEMILIKAN GAGAL: Identitas pengaju tidak terhubung secara sah dengan siswa tersebut.';
    END IF;

    -- 4. Kunci baris siswa di tabel students
    SELECT * INTO v_student
    FROM public.students
    WHERE id = v_req.student_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Data siswa terkait pengajuan ini tidak ditemukan di tabel students.';
    END IF;

    v_student_json := to_jsonb(v_student);

    -- 5. Iterasi setiap item perubahan
    FOR v_item IN
        SELECT * FROM public.student_change_request_items
        WHERE change_request_id = p_request_id
        FOR UPDATE
    LOOP
        v_decision_obj := p_item_decisions -> v_item.field_name;
        IF v_decision_obj IS NULL THEN
            v_item_status := 'approved';
            v_item_reason := NULL;
        ELSIF jsonb_typeof(v_decision_obj) = 'string' THEN
            v_item_status := trim(both '"' from v_decision_obj::text);
            v_item_reason := NULL;
        ELSE
            v_item_status := COALESCE(v_decision_obj ->> 'status', 'approved');
            v_item_reason := v_decision_obj ->> 'reason';
        END IF;

        IF v_item_status NOT IN ('approved', 'rejected') THEN
            RAISE EXCEPTION 'Status keputusan kolom % tidak valid: %', v_item.field_name, v_item_status;
        END IF;

        v_db_col := public.fn_resolve_student_db_column(v_item.field_name);
        v_current_db_val := COALESCE(NULLIF(btrim(v_student_json ->> v_db_col), ''), '-');
        v_expected_old_val := COALESCE(NULLIF(btrim(v_item.old_value), ''), '-');

        IF v_item_status = 'approved' THEN
            -- Periksa nilai lama sebelum update untuk mencegah data terbaru tertimpa
            IF NOT p_force_override AND v_current_db_val IS DISTINCT FROM v_expected_old_val THEN
                RAISE EXCEPTION 'KONFLIK DATA TERBARU pada kolom "%": Nilai saat ini di database ("%") berbeda dengan nilai lama saat diajukan ("%"). Gunakan konfirmasi penimpaan jika ingin tetap menerapkan.',
                    v_item.field_label, v_current_db_val, v_expected_old_val;
            END IF;

            -- Update kolom terkait di tabel public.students secara dinamis & aman
            IF v_db_col IN ('berat_badan', 'tinggi_badan', 'penghasilan_ayah', 'penghasilan_ibu', 'penghasilan_wali') THEN
                EXECUTE format('UPDATE public.students SET %I = $1, updated_by = $2 WHERE id = $3', v_db_col)
                USING NULLIF(regexp_replace(COALESCE(v_item.new_value, ''), '[^0-9.]', '', 'g'), '')::numeric, v_caller_id, v_student.id;
            ELSIF v_db_col IN ('anak_ke', 'jumlah_saudara_kandung', 'jumlah_saudara_tiri') THEN
                EXECUTE format('UPDATE public.students SET %I = $1, updated_by = $2 WHERE id = $3', v_db_col)
                USING NULLIF(regexp_replace(COALESCE(v_item.new_value, ''), '[^0-9]', '', 'g'), '')::integer, v_caller_id, v_student.id;
            ELSIF v_db_col IN ('tanggal_penerbitan_ijazah', 'tanggal_lahir', 'tgl_lahir_ayah', 'tgl_lahir_ibu', 'tanggal_masuk') THEN
                EXECUTE format('UPDATE public.students SET %I = $1, updated_by = $2 WHERE id = $3', v_db_col)
                USING NULLIF(btrim(COALESCE(v_item.new_value, '')), '')::date, v_caller_id, v_student.id;
            ELSE
                EXECUTE format('UPDATE public.students SET %I = $1, updated_by = $2 WHERE id = $3', v_db_col)
                USING NULLIF(btrim(COALESCE(v_item.new_value, '')), ''), v_caller_id, v_student.id;
            END IF;

            v_old_values := v_old_values || jsonb_build_object(v_db_col, v_current_db_val);
            v_new_values := v_new_values || jsonb_build_object(v_db_col, v_item.new_value);
            v_approved_count := v_approved_count + 1;
        ELSE
            -- Perubahan yang ditolak TIDAK mengubah tabel students
            v_rejected_count := v_rejected_count + 1;
        END IF;

        UPDATE public.student_change_request_items
        SET item_status = v_item_status,
            rejection_reason = v_item_reason
        WHERE id = v_item.id;
    END LOOP;

    -- 6. Tentukan status akhir pengajuan
    IF v_approved_count > 0 AND v_rejected_count = 0 THEN
        v_final_status := 'approved';
    ELSIF v_approved_count = 0 THEN
        v_final_status := 'rejected';
    ELSE
        v_final_status := 'partially_approved';
    END IF;

    UPDATE public.student_change_requests
    SET status = v_final_status,
        reviewed_by = v_caller_id,
        reviewer_name = v_caller_profile.full_name,
        catatan_verifikator = COALESCE(NULLIF(btrim(p_reviewer_note), ''), 'Diverifikasi oleh ' || v_caller_profile.full_name),
        reviewed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_request_id;

    -- 7. Catat nilai sebelum dan sesudah perubahan dalam audit_logs
    INSERT INTO public.audit_logs (
        actor_id,
        actor_name,
        actor_role,
        actor_type,
        action,
        target_table,
        target_id,
        old_values,
        new_values,
        details
    ) VALUES (
        v_caller_id,
        v_caller_profile.full_name,
        v_caller_profile.role::text,
        'admin',
        'VERIFY_CHANGE_REQUEST_' || upper(v_final_status::text),
        'student_change_requests',
        p_request_id::text,
        v_old_values,
        v_new_values,
        format('Verifikasi perubahan biodata %s (NISN: %s) -> Status: %s (%s disetujui, %s ditolak). Catatan: %s',
            v_req.nama_siswa, v_req.nisn, v_final_status, v_approved_count, v_rejected_count, COALESCE(p_reviewer_note, '-'))
    );

    RETURN jsonb_build_object(
        'request_id', p_request_id,
        'status', v_final_status,
        'approved_count', v_approved_count,
        'rejected_count', v_rejected_count
    );
END;
$$;

-- ---------------------------------------------------------------------------------
-- RPC 2: Transaksi Mutasi Masuk Siswa (rpc_process_mutation_in)
-- - Mendukung pembuatan siswa baru atau penggunaan record siswa yang sesuai.
-- - Mencegah duplikasi NIS, NISN, dan NIK Siswa.
-- - Mencatat transaksi mutasi masuk dan riwayat kelas secara transaksional.
-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_process_mutation_in(
    p_is_new_student BOOLEAN,
    p_student_id UUID,
    p_nis TEXT,
    p_nisn TEXT,
    p_nik_siswa TEXT,
    p_nama_lengkap TEXT,
    p_jenis_kelamin TEXT,
    p_tempat_lahir TEXT,
    p_tanggal_lahir DATE,
    p_kelas_tujuan TEXT,
    p_tanggal_masuk DATE,
    p_tahun_ajaran TEXT,
    p_sekolah_asal TEXT,
    p_npsn_asal TEXT,
    p_kecamatan_asal TEXT,
    p_kabupaten_asal TEXT,
    p_provinsi_asal TEXT,
    p_alasan TEXT,
    p_no_surat TEXT,
    p_petugas TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_profile public.profiles%ROWTYPE;
    v_target_student_id UUID;
    v_mutation_id UUID;
BEGIN
    SELECT * INTO v_caller_profile
    FROM public.profiles
    WHERE id = v_caller_id AND is_active = TRUE;

    IF NOT FOUND OR v_caller_profile.role NOT IN ('super_admin', 'admin', 'operator') THEN
        RAISE EXCEPTION 'AKSES DITOLAK: Hanya Admin / Operator yang dapat mencatat mutasi masuk.';
    END IF;

    IF p_is_new_student OR p_student_id IS NULL THEN
        -- Cegah duplikasi identitas (NIS, NISN, NIK)
        IF p_nis IS NOT NULL AND btrim(p_nis) <> '' AND EXISTS (
            SELECT 1 FROM public.students WHERE btrim(nis) = btrim(p_nis)
        ) THEN
            RAISE EXCEPTION 'DUPLIKASI IDENTITAS: NIS "%" sudah terdaftar pada Buku Induk Siswa.', p_nis;
        END IF;

        IF p_nisn IS NOT NULL AND btrim(p_nisn) <> '' AND EXISTS (
            SELECT 1 FROM public.students WHERE btrim(nisn) = btrim(p_nisn)
        ) THEN
            RAISE EXCEPTION 'DUPLIKASI IDENTITAS: NISN "%" sudah terdaftar pada Buku Induk Siswa.', p_nisn;
        END IF;

        IF p_nik_siswa IS NOT NULL AND btrim(p_nik_siswa) <> '' AND EXISTS (
            SELECT 1 FROM public.students WHERE btrim(nik_siswa) = btrim(p_nik_siswa)
        ) THEN
            RAISE EXCEPTION 'DUPLIKASI IDENTITAS: NIK Siswa "%" sudah terdaftar pada Buku Induk Siswa.', p_nik_siswa;
        END IF;

        INSERT INTO public.students (
            kelas,
            nis,
            nisn,
            nik_siswa,
            nama_lengkap_siswa,
            jenis_kelamin,
            tempat_lahir,
            tanggal_lahir,
            nama_asal_sekolah,
            npsn_asal_sekolah,
            kecamatan_asal_sekolah,
            kabupaten_asal_sekolah,
            provinsi_asal_sekolah,
            status_aktif,
            tanggal_masuk,
            created_by
        ) VALUES (
            btrim(p_kelas_tujuan),
            NULLIF(btrim(p_nis), ''),
            NULLIF(btrim(p_nisn), ''),
            NULLIF(btrim(p_nik_siswa), ''),
            btrim(p_nama_lengkap),
            CASE WHEN p_jenis_kelamin = 'P' THEN 'P' ELSE 'L' END,
            NULLIF(btrim(p_tempat_lahir), ''),
            p_tanggal_lahir,
            NULLIF(btrim(p_sekolah_asal), ''),
            NULLIF(btrim(p_npsn_asal), ''),
            NULLIF(btrim(p_kecamatan_asal), ''),
            NULLIF(btrim(p_kabupaten_asal), ''),
            NULLIF(btrim(p_provinsi_asal), ''),
            'mutasi_masuk',
            COALESCE(p_tanggal_masuk, CURRENT_DATE),
            v_caller_id
        ) RETURNING id INTO v_target_student_id;
    ELSE
        v_target_student_id := p_student_id;
        UPDATE public.students
        SET kelas = btrim(p_kelas_tujuan),
            status_aktif = 'mutasi_masuk',
            tanggal_masuk = COALESCE(p_tanggal_masuk, tanggal_masuk),
            nama_asal_sekolah = COALESCE(NULLIF(btrim(p_sekolah_asal), ''), nama_asal_sekolah),
            npsn_asal_sekolah = COALESCE(NULLIF(btrim(p_npsn_asal), ''), npsn_asal_sekolah),
            kecamatan_asal_sekolah = COALESCE(NULLIF(btrim(p_kecamatan_asal), ''), kecamatan_asal_sekolah),
            kabupaten_asal_sekolah = COALESCE(NULLIF(btrim(p_kabupaten_asal), ''), kabupaten_asal_sekolah),
            provinsi_asal_sekolah = COALESCE(NULLIF(btrim(p_provinsi_asal), ''), provinsi_asal_sekolah),
            updated_by = v_caller_id
        WHERE id = v_target_student_id;
    END IF;

    INSERT INTO public.student_mutations (
        student_id,
        jenis_mutasi,
        kategori_mutasi,
        kelas,
        nis,
        nisn,
        nama_lengkap_siswa,
        tanggal_pindah,
        tahun_ajaran,
        alasan_pindah,
        sekolah_asal,
        npsn_sekolah,
        kecamatan_sekolah,
        kabupaten_sekolah,
        provinsi_sekolah,
        no_surat_mutasi,
        petugas_nama,
        status_mutasi,
        created_by
    ) VALUES (
        v_target_student_id,
        'masuk',
        'Masuk Pindahan',
        btrim(p_kelas_tujuan),
        NULLIF(btrim(p_nis), ''),
        NULLIF(btrim(p_nisn), ''),
        btrim(p_nama_lengkap),
        COALESCE(p_tanggal_masuk, CURRENT_DATE),
        COALESCE(NULLIF(btrim(p_tahun_ajaran), ''), '2025/2026'),
        NULLIF(btrim(p_alasan), ''),
        NULLIF(btrim(p_sekolah_asal), ''),
        NULLIF(btrim(p_npsn_asal), ''),
        NULLIF(btrim(p_kecamatan_asal), ''),
        NULLIF(btrim(p_kabupaten_asal), ''),
        NULLIF(btrim(p_provinsi_asal), ''),
        NULLIF(btrim(p_no_surat), ''),
        COALESCE(NULLIF(btrim(p_petugas), ''), v_caller_profile.full_name),
        'selesai',
        v_caller_id
    ) RETURNING id INTO v_mutation_id;

    INSERT INTO public.audit_logs (
        actor_id,
        actor_name,
        actor_role,
        actor_type,
        action,
        target_table,
        target_id,
        new_values,
        details
    ) VALUES (
        v_caller_id,
        v_caller_profile.full_name,
        v_caller_profile.role::text,
        'admin',
        'MUTASI_MASUK',
        'student_mutations',
        v_mutation_id::text,
        jsonb_build_object(
            'student_id', v_target_student_id,
            'nama_siswa', p_nama_lengkap,
            'kelas_tujuan', p_kelas_tujuan,
            'sekolah_asal', p_sekolah_asal,
            'tahun_ajaran', p_tahun_ajaran
        ),
        format('Mencatat Mutasi Masuk siswa %s (NIS: %s, Kelas Tujuan: %s) dari %s.',
            p_nama_lengkap, COALESCE(p_nis, '-'), p_kelas_tujuan, COALESCE(p_sekolah_asal, '-'))
    );

    RETURN jsonb_build_object(
        'mutation_id', v_mutation_id,
        'student_id', v_target_student_id
    );
END;
$$;

-- ---------------------------------------------------------------------------------
-- RPC 3: Transaksi Mutasi Keluar Siswa (rpc_process_mutation_out)
-- - Memilih siswa aktif, mencatat mutasi keluar lengkap (termasuk jenis mutasi:
--   Pindah sekolah, Mengundurkan diri, Keluar karena alasan lain, Lulus, Meninggal dunia).
-- - Mengubah status siswa menjadi nonaktif (tanpa menghapus biodata!).
-- - Mencatat riwayat kelas dan audit_logs dalam satu transaksi database.
-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_process_mutation_out(
    p_student_id UUID,
    p_tanggal_keluar DATE,
    p_kelas_terakhir TEXT,
    p_kategori_mutasi TEXT,
    p_alasan TEXT,
    p_sekolah_tujuan TEXT,
    p_npsn_tujuan TEXT,
    p_kecamatan_tujuan TEXT,
    p_kabupaten_tujuan TEXT,
    p_provinsi_tujuan TEXT,
    p_tahun_ajaran TEXT,
    p_no_surat TEXT,
    p_keterangan TEXT,
    p_petugas TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_profile public.profiles%ROWTYPE;
    v_student public.students%ROWTYPE;
    v_mutation_id UUID;
    v_new_student_status public.student_status_type;
BEGIN
    SELECT * INTO v_caller_profile
    FROM public.profiles
    WHERE id = v_caller_id AND is_active = TRUE;

    IF NOT FOUND OR v_caller_profile.role NOT IN ('super_admin', 'admin', 'operator') THEN
        RAISE EXCEPTION 'AKSES DITOLAK: Hanya Admin / Operator yang dapat mencatat mutasi keluar.';
    END IF;

    SELECT * INTO v_student
    FROM public.students
    WHERE id = p_student_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Data siswa tidak ditemukan.';
    END IF;

    IF v_student.status_aktif NOT IN ('aktif', 'mutasi_masuk') THEN
        RAISE EXCEPTION 'Siswa % saat ini sudah berstatus nonaktif / keluar (%).', v_student.nama_lengkap_siswa, v_student.status_aktif;
    END IF;

    -- Ubah status siswa menjadi nonaktif / mutasi_keluar / lulus tanpa menghapus biodata
    v_new_student_status := CASE
        WHEN p_kategori_mutasi = 'Lulus' THEN 'lulus'::public.student_status_type
        WHEN p_kategori_mutasi = 'Pindah sekolah' THEN 'mutasi_keluar'::public.student_status_type
        ELSE 'non_aktif'::public.student_status_type
    END;

    INSERT INTO public.student_mutations (
        student_id,
        jenis_mutasi,
        kategori_mutasi,
        kelas,
        nis,
        nisn,
        nama_lengkap_siswa,
        tanggal_pindah,
        tahun_ajaran,
        alasan_pindah,
        sekolah_tujuan,
        npsn_sekolah,
        kecamatan_sekolah,
        kabupaten_sekolah,
        provinsi_sekolah,
        no_surat_mutasi,
        keterangan,
        petugas_nama,
        previous_student_status,
        status_mutasi,
        created_by
    ) VALUES (
        v_student.id,
        'keluar',
        COALESCE(NULLIF(btrim(p_kategori_mutasi), ''), 'Pindah sekolah'),
        COALESCE(NULLIF(btrim(p_kelas_terakhir), ''), v_student.kelas),
        v_student.nis,
        v_student.nisn,
        v_student.nama_lengkap_siswa,
        COALESCE(p_tanggal_keluar, CURRENT_DATE),
        COALESCE(NULLIF(btrim(p_tahun_ajaran), ''), '2025/2026'),
        NULLIF(btrim(p_alasan), ''),
        NULLIF(btrim(p_sekolah_tujuan), ''),
        NULLIF(btrim(p_npsn_tujuan), ''),
        NULLIF(btrim(p_kecamatan_tujuan), ''),
        NULLIF(btrim(p_kabupaten_tujuan), ''),
        NULLIF(btrim(p_provinsi_tujuan), ''),
        NULLIF(btrim(p_no_surat), ''),
        NULLIF(btrim(p_keterangan), ''),
        COALESCE(NULLIF(btrim(p_petugas), ''), v_caller_profile.full_name),
        v_student.status_aktif,
        'selesai',
        v_caller_id
    ) RETURNING id INTO v_mutation_id;

    UPDATE public.students
    SET status_aktif = v_new_student_status,
        updated_by = v_caller_id
    WHERE id = v_student.id;

    INSERT INTO public.student_class_history (
        student_id,
        class_id,
        kelas,
        tingkat_kelas,
        kamar,
        status_riwayat,
        tanggal_mulai,
        tanggal_selesai,
        catatan,
        recorded_by
    ) VALUES (
        v_student.id,
        v_student.class_id,
        COALESCE(NULLIF(btrim(p_kelas_terakhir), ''), v_student.kelas),
        v_student.tingkat_kelas,
        v_student.kamar,
        CASE WHEN p_kategori_mutasi = 'Lulus' THEN 'lulus' ELSE 'mutasi' END,
        COALESCE(v_student.tanggal_masuk, CURRENT_DATE),
        COALESCE(p_tanggal_keluar, CURRENT_DATE),
        format('Mutasi Keluar (%s): %s', p_kategori_mutasi, COALESCE(p_alasan, '-')),
        v_caller_id
    );

    INSERT INTO public.audit_logs (
        actor_id,
        actor_name,
        actor_role,
        actor_type,
        action,
        target_table,
        target_id,
        old_values,
        new_values,
        details
    ) VALUES (
        v_caller_id,
        v_caller_profile.full_name,
        v_caller_profile.role::text,
        'admin',
        'MUTASI_KELUAR',
        'student_mutations',
        v_mutation_id::text,
        jsonb_build_object('status_aktif', v_student.status_aktif, 'kelas', v_student.kelas),
        jsonb_build_object(
            'status_aktif', v_new_student_status,
            'kategori_mutasi', p_kategori_mutasi,
            'sekolah_tujuan', p_sekolah_tujuan,
            'tanggal_keluar', p_tanggal_keluar
        ),
        format('Mencatat Mutasi Keluar (%s) untuk %s (NIS: %s, Kelas: %s). Status siswa diubah menjadi %s tanpa menghapus biodata.',
            p_kategori_mutasi, v_student.nama_lengkap_siswa, COALESCE(v_student.nis, '-'), v_student.kelas, v_new_student_status)
    );

    RETURN jsonb_build_object(
        'mutation_id', v_mutation_id,
        'student_id', v_student.id,
        'new_status', v_new_student_status
    );
END;
$$;

-- ---------------------------------------------------------------------------------
-- RPC 4: Pembatalan Transaksi Mutasi oleh Admin Berwenang (rpc_cancel_student_mutation)
-- - Hanya dapat dijalankan oleh super_admin atau admin.
-- - Mengembalikan status_aktif siswa ke status sebelum mutasi ('aktif') dan menandai
--   status_mutasi = 'dibatalkan' disertai pencatatan lengkap di audit_logs.
-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_cancel_student_mutation(
    p_mutation_id UUID,
    p_cancel_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_profile public.profiles%ROWTYPE;
    v_mut public.student_mutations%ROWTYPE;
    v_restore_status public.student_status_type;
BEGIN
    SELECT * INTO v_caller_profile
    FROM public.profiles
    WHERE id = v_caller_id AND is_active = TRUE;

    IF NOT FOUND OR v_caller_profile.role NOT IN ('super_admin', 'admin') THEN
        RAISE EXCEPTION 'AKSES DITOLAK: Hanya Super Admin atau Admin berwenang yang dapat membatalkan transaksi mutasi.';
    END IF;

    IF p_cancel_reason IS NULL OR btrim(p_cancel_reason) = '' THEN
        RAISE EXCEPTION 'Alasan pembatalan transaksi mutasi wajib diisi untuk keperluan Audit Log.';
    END IF;

    SELECT * INTO v_mut
    FROM public.student_mutations
    WHERE id = p_mutation_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Data transaksi mutasi tidak ditemukan.';
    END IF;

    IF v_mut.status_mutasi = 'dibatalkan' THEN
        RAISE EXCEPTION 'Transaksi mutasi ini sudah dibatalkan sebelumnya.';
    END IF;

    v_restore_status := COALESCE(v_mut.previous_student_status, 'aktif');

    UPDATE public.student_mutations
    SET status_mutasi = 'dibatalkan',
        cancelled_at = NOW(),
        cancelled_by = v_caller_id,
        cancelled_by_name = v_caller_profile.full_name,
        alasan_pembatalan = btrim(p_cancel_reason),
        updated_at = NOW()
    WHERE id = p_mutation_id;

    UPDATE public.students
    SET status_aktif = v_restore_status,
        updated_by = v_caller_id
    WHERE id = v_mut.student_id;

    INSERT INTO public.audit_logs (
        actor_id,
        actor_name,
        actor_role,
        actor_type,
        action,
        target_table,
        target_id,
        old_values,
        new_values,
        details
    ) VALUES (
        v_caller_id,
        v_caller_profile.full_name,
        v_caller_profile.role::text,
        'admin',
        'CANCEL_MUTATION',
        'student_mutations',
        p_mutation_id::text,
        jsonb_build_object('status_mutasi', v_mut.status_mutasi, 'jenis_mutasi', v_mut.jenis_mutasi),
        jsonb_build_object('status_mutasi', 'dibatalkan', 'restored_student_status', v_restore_status, 'alasan_pembatalan', p_cancel_reason),
        format('Membatalkan transaksi mutasi %s untuk siswa %s (NIS: %s). Status siswa dikembalikan ke %s. Alasan: %s',
            v_mut.jenis_mutasi, v_mut.nama_lengkap_siswa, COALESCE(v_mut.nis, '-'), v_restore_status, p_cancel_reason)
    );

    RETURN jsonb_build_object(
        'mutation_id', p_mutation_id,
        'status_mutasi', 'dibatalkan',
        'restored_student_status', v_restore_status
    );
END;
$$;

COMMIT;
