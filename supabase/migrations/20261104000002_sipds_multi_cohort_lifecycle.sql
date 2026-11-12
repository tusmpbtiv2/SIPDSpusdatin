-- =================================================================================
-- SIPDS (SISTEM INFORMASI PENGELOLAAN DATA SISWA) - SMP BHINNEKA TUNGGAL IKA
-- Safe Additive SQL Migration for Multi-Cohort, Multi-Academic-Year, Graduation,
-- Alumni Archive (>3 Years), Granular Import Rows, Export Logs, & Full Database Backup
-- Migration: 20261104000002_sipds_multi_cohort_lifecycle.sql
--
-- PRINSIP KEAMANAN PRODUKSI:
-- 1. TIDAK menghapus (DROP) atau membuat ulang tabel `students` atau tabel lama.
-- 2. Menggunakan `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` dan `CREATE TABLE IF NOT EXISTS`.
-- 3. Mempertahankan seluruh data produksi yang sudah ada.
-- =================================================================================

BEGIN;

-- ---------------------------------------------------------------------------------
-- 1. PERLUASAN AMAN TABEL `public.academic_years` (Manajemen & Arsip Tahun Pelajaran)
-- ---------------------------------------------------------------------------------
ALTER TABLE public.academic_years
    ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS catatan TEXT;

CREATE INDEX IF NOT EXISTS idx_academic_years_tahun ON public.academic_years(tahun_ajaran);
CREATE INDEX IF NOT EXISTS idx_academic_years_archived ON public.academic_years(is_archived);

-- ---------------------------------------------------------------------------------
-- 2. PERLUASAN AMAN TABEL `public.students` (Identitas Angkatan & Kelulusan Permanen)
-- ---------------------------------------------------------------------------------
ALTER TABLE public.students
    ADD COLUMN IF NOT EXISTS angkatan TEXT,
    ADD COLUMN IF NOT EXISTS tahun_ajaran_masuk TEXT,
    ADD COLUMN IF NOT EXISTS tahun_lulus TEXT,
    ADD COLUMN IF NOT EXISTS tanggal_lulus DATE,
    ADD COLUMN IF NOT EXISTS nomor_ijazah_smp TEXT;

-- Backfill otomatis kolom `angkatan` untuk data produksi lama yang belum memiliki nilai angkatan
UPDATE public.students
SET angkatan = COALESCE(
    NULLIF(btrim(angkatan), ''),
    CASE
        WHEN tanggal_masuk IS NOT NULL THEN EXTRACT(YEAR FROM tanggal_masuk)::TEXT
        ELSE EXTRACT(YEAR FROM created_at)::TEXT
    END
)
WHERE angkatan IS NULL OR btrim(angkatan) = '';

CREATE INDEX IF NOT EXISTS idx_students_angkatan ON public.students(angkatan);
CREATE INDEX IF NOT EXISTS idx_students_tahun_lulus ON public.students(tahun_lulus);
CREATE INDEX IF NOT EXISTS idx_students_status_angkatan ON public.students(status_aktif, angkatan);

-- Trigger agar setiap siswa baru otomatis memiliki `angkatan` tetap berdasarkan tahun pertama masuk
CREATE OR REPLACE FUNCTION public.trigger_ensure_student_angkatan()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.angkatan IS NULL OR btrim(NEW.angkatan) = '' THEN
        IF NEW.tanggal_masuk IS NOT NULL THEN
            NEW.angkatan := EXTRACT(YEAR FROM NEW.tanggal_masuk)::TEXT;
        ELSE
            NEW.angkatan := EXTRACT(YEAR FROM NOW())::TEXT;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_students_ensure_angkatan ON public.students;
CREATE TRIGGER trg_students_ensure_angkatan
BEFORE INSERT OR UPDATE ON public.students
FOR EACH ROW EXECUTE FUNCTION public.trigger_ensure_student_angkatan();

-- ---------------------------------------------------------------------------------
-- 3. PERLUASAN AMAN TABEL `public.student_class_history` (Riwayat Kelas Lintas Tahun)
-- ---------------------------------------------------------------------------------
ALTER TABLE public.student_class_history
    ADD COLUMN IF NOT EXISTS tahun_ajaran TEXT,
    ADD COLUMN IF NOT EXISTS semester TEXT DEFAULT 'Ganjil',
    ADD COLUMN IF NOT EXISTS angkatan TEXT;

CREATE INDEX IF NOT EXISTS idx_class_history_student_tahun
    ON public.student_class_history(student_id, tahun_ajaran);
CREATE INDEX IF NOT EXISTS idx_class_history_tahun_kelas
    ON public.student_class_history(tahun_ajaran, kelas);

-- ---------------------------------------------------------------------------------
-- 4. TABEL BARU: `public.student_graduations` (Informasi Kelulusan & Arsip Alumni)
-- ---------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_graduations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
    academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE SET NULL,
    nis TEXT,
    nisn TEXT NOT NULL,
    nama_siswa TEXT NOT NULL,
    angkatan TEXT NOT NULL,
    kelas_terakhir TEXT NOT NULL,
    tahun_ajaran_lulus TEXT NOT NULL, -- Contoh: '2026/2027'
    tahun_kelulusan TEXT NOT NULL,    -- Contoh: '2027'
    tanggal_kelulusan DATE NOT NULL DEFAULT CURRENT_DATE,
    nomor_ijazah_smp TEXT,
    nomor_skhun TEXT,
    nilai_rata_rata NUMERIC(5,2),
    sekolah_lanjutan TEXT,
    status_kelulusan TEXT NOT NULL DEFAULT 'Lulus' CHECK (status_kelulusan IN ('Lulus', 'Ditunda')),
    diproses_oleh UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    diproses_oleh_nama TEXT,
    catatan TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_student_graduations_student UNIQUE (student_id)
);

CREATE INDEX IF NOT EXISTS idx_student_graduations_tahun ON public.student_graduations(tahun_kelulusan);
CREATE INDEX IF NOT EXISTS idx_student_graduations_angkatan ON public.student_graduations(angkatan);
CREATE INDEX IF NOT EXISTS idx_student_graduations_nisn ON public.student_graduations(nisn);

DROP TRIGGER IF EXISTS trg_student_graduations_updated_at ON public.student_graduations;
CREATE TRIGGER trg_student_graduations_updated_at
BEFORE UPDATE ON public.student_graduations
FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- ---------------------------------------------------------------------------------
-- 5. PERLUASAN `public.import_batches` & TABEL BARU `public.import_batch_rows`
-- ---------------------------------------------------------------------------------
ALTER TABLE public.import_batches
    ADD COLUMN IF NOT EXISTS import_category TEXT DEFAULT 'siswa_baru',
    ADD COLUMN IF NOT EXISTS tahun_ajaran TEXT,
    ADD COLUMN IF NOT EXISTS angkatan TEXT,
    ADD COLUMN IF NOT EXISTS duplicate_rows INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS review_rows INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.import_batch_rows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,
    row_number INTEGER NOT NULL,
    student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
    nis TEXT,
    nisn TEXT,
    nama_siswa TEXT,
    validation_status TEXT NOT NULL CHECK (validation_status IN ('valid', 'failed', 'duplicate', 'needs_review')),
    action_taken TEXT NOT NULL DEFAULT 'skipped' CHECK (action_taken IN ('inserted', 'updated', 'history_added', 'skipped', 'failed')),
    error_messages JSONB NOT NULL DEFAULT '[]'::jsonb,
    raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    diff_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_batch_rows_batch_id ON public.import_batch_rows(batch_id);
CREATE INDEX IF NOT EXISTS idx_import_batch_rows_status ON public.import_batch_rows(validation_status);

-- ---------------------------------------------------------------------------------
-- 6. TABEL BARU: `public.export_logs` (Catatan Aktivitas Export & Backup)
-- ---------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.export_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exported_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    exported_by_name TEXT NOT NULL,
    exported_by_role TEXT NOT NULL,
    export_type TEXT NOT NULL,
    filter_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    total_records INTEGER NOT NULL DEFAULT 0 CHECK (total_records >= 0),
    file_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_export_logs_created_at ON public.export_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_export_logs_type ON public.export_logs(export_type);

-- ---------------------------------------------------------------------------------
-- 7. KEBIJAKAN ROW LEVEL SECURITY (RLS) UNTUK TABEL BARU
-- ---------------------------------------------------------------------------------
ALTER TABLE public.student_graduations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_batch_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.export_logs ENABLE ROW LEVEL SECURITY;

-- Policies untuk `student_graduations`
DROP POLICY IF EXISTS "staff_read_graduations" ON public.student_graduations;
CREATE POLICY "staff_read_graduations" ON public.student_graduations
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.is_active = TRUE
              AND p.role IN ('super_admin', 'admin', 'operator', 'viewer')
        )
        OR EXISTS (
            SELECT 1 FROM public.parent_student_access psa
            WHERE psa.user_id = auth.uid()
              AND psa.student_id = student_graduations.student_id
              AND psa.is_active = TRUE
        )
    );

DROP POLICY IF EXISTS "staff_write_graduations" ON public.student_graduations;
CREATE POLICY "staff_write_graduations" ON public.student_graduations
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.is_active = TRUE
              AND p.role IN ('super_admin', 'admin', 'operator')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.is_active = TRUE
              AND p.role IN ('super_admin', 'admin', 'operator')
        )
    );

-- Policies untuk `import_batch_rows`
DROP POLICY IF EXISTS "staff_read_import_batch_rows" ON public.import_batch_rows;
CREATE POLICY "staff_read_import_batch_rows" ON public.import_batch_rows
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.is_active = TRUE
              AND p.role IN ('super_admin', 'admin', 'operator', 'viewer')
        )
    );

DROP POLICY IF EXISTS "staff_write_import_batch_rows" ON public.import_batch_rows;
CREATE POLICY "staff_write_import_batch_rows" ON public.import_batch_rows
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.is_active = TRUE
              AND p.role IN ('super_admin', 'admin', 'operator')
        )
    );

-- Policies untuk `export_logs`
DROP POLICY IF EXISTS "staff_read_export_logs" ON public.export_logs;
CREATE POLICY "staff_read_export_logs" ON public.export_logs
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.is_active = TRUE
              AND p.role IN ('super_admin', 'admin', 'operator', 'viewer')
        )
    );

DROP POLICY IF EXISTS "staff_insert_export_logs" ON public.export_logs;
CREATE POLICY "staff_insert_export_logs" ON public.export_logs
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.is_active = TRUE
              AND p.role IN ('super_admin', 'admin', 'operator', 'viewer')
        )
    );

-- ---------------------------------------------------------------------------------
-- 8. RPC TRANSAKSIONAL: KENAIKAN KELAS LINTAS TAHUN PELAJARAN
--    `public.process_year_end_promotions`
--    Memastikan riwayat kelas lama TIDAK dihapus/diubah, menambah riwayat kelas
--    tahun pelajaran baru, mencegah proses ganda, dan mencatat ke audit_logs.
-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_year_end_promotions(
    p_from_academic_year TEXT,
    p_to_academic_year TEXT,
    p_promotions JSONB, -- Array of { student_id, from_class, to_class, decision: 'naik_kelas' | 'tinggal_kelas', catatan }
    p_actor_name TEXT DEFAULT 'Admin Sekolah'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_item JSONB;
    v_student_id UUID;
    v_from_class TEXT;
    v_to_class TEXT;
    v_decision TEXT;
    v_catatan TEXT;
    v_promoted_count INTEGER := 0;
    v_retained_count INTEGER := 0;
    v_skipped_count INTEGER := 0;
BEGIN
    IF p_from_academic_year IS NULL OR p_to_academic_year IS NULL OR p_from_academic_year = p_to_academic_year THEN
        RAISE EXCEPTION 'Tahun pelajaran asal dan tujuan wajib berbeda dan valid.';
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_promotions)
    LOOP
        v_student_id := (v_item->>'student_id')::UUID;
        v_from_class := btrim(COALESCE(v_item->>'from_class', ''));
        v_to_class := btrim(COALESCE(v_item->>'to_class', ''));
        v_decision := COALESCE(v_item->>'decision', 'naik_kelas');
        v_catatan := COALESCE(v_item->>'catatan', '');

        -- Cegah duplikasi riwayat kelas untuk siswa dan tahun pelajaran tujuan yang sama
        IF EXISTS (
            SELECT 1 FROM public.student_class_history
            WHERE student_id = v_student_id
              AND tahun_ajaran = p_to_academic_year
        ) THEN
            v_skipped_count := v_skipped_count + 1;
            CONTINUE;
        END IF;

        -- Update kelas aktif saat ini pada biodata utama siswa (tanpa menghapus riwayat lama)
        UPDATE public.students
        SET kelas = v_to_class,
            updated_at = NOW()
        WHERE id = v_student_id;

        -- Tambahkan catatan riwayat kelas baru untuk tahun pelajaran tujuan
        INSERT INTO public.student_class_history (
            student_id,
            tahun_ajaran,
            kelas,
            tingkat_kelas,
            status_riwayat,
            tanggal_mulai,
            catatan
        ) VALUES (
            v_student_id,
            p_to_academic_year,
            v_to_class,
            CASE WHEN left(v_to_class, 1) IN ('7', '8', '9') THEN left(v_to_class, 1) ELSE '7' END,
            CASE WHEN v_decision = 'tinggal_kelas' THEN 'tinggal_kelas' ELSE 'naik_kelas' END,
            CURRENT_DATE,
            COALESCE(NULLIF(v_catatan, ''), format('Proses akhir tahun %s -> %s (%s -> %s)', p_from_academic_year, p_to_academic_year, v_from_class, v_to_class))
        );

        IF v_decision = 'tinggal_kelas' THEN
            v_retained_count := v_retained_count + 1;
        ELSE
            v_promoted_count := v_promoted_count + 1;
        END IF;
    END LOOP;

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
        auth.uid(),
        p_actor_name,
        'admin',
        'admin',
        'YEAR_END_PROMOTION',
        'student_class_history',
        p_to_academic_year,
        jsonb_build_object(
            'from_academic_year', p_from_academic_year,
            'to_academic_year', p_to_academic_year,
            'promoted_count', v_promoted_count,
            'retained_count', v_retained_count,
            'skipped_count', v_skipped_count
        ),
        format('Proses kenaikan kelas dari %s ke %s selesai: %s naik kelas, %s tinggal kelas.', p_from_academic_year, p_to_academic_year, v_promoted_count, v_retained_count)
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'promoted_count', v_promoted_count,
        'retained_count', v_retained_count,
        'skipped_count', v_skipped_count
    );
END;
$$;

-- ---------------------------------------------------------------------------------
-- 9. RPC TRANSAKSIONAL: KELULUSAN SISWA KELAS IX
--    `public.process_student_graduations`
--    Mengubah status siswa menjadi 'lulus', menyimpan permanen di `student_graduations`,
--    mempertahankan seluruh biodata & riwayat kelas, dan mencatat audit_logs.
-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_student_graduations(
    p_tahun_ajaran_lulus TEXT,
    p_tahun_kelulusan TEXT,
    p_tanggal_kelulusan DATE,
    p_graduations JSONB, -- Array of { student_id, nomor_ijazah_smp, sekolah_lanjutan, catatan }
    p_actor_name TEXT DEFAULT 'Admin Sekolah'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_item JSONB;
    v_student RECORD;
    v_graduated_count INTEGER := 0;
    v_skipped_count INTEGER := 0;
BEGIN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_graduations)
    LOOP
        SELECT * INTO v_student
        FROM public.students
        WHERE id = (v_item->>'student_id')::UUID
        FOR UPDATE;

        IF NOT FOUND THEN
            v_skipped_count := v_skipped_count + 1;
            CONTINUE;
        END IF;

        -- Cegah kelulusan ganda
        IF v_student.status_aktif = 'lulus' OR EXISTS (
            SELECT 1 FROM public.student_graduations WHERE student_id = v_student.id
        ) THEN
            v_skipped_count := v_skipped_count + 1;
            CONTINUE;
        END IF;

        -- 1. Update status siswa pada tabel utama students menjadi 'lulus'
        UPDATE public.students
        SET status_aktif = 'lulus',
            tahun_lulus = p_tahun_kelulusan,
            tanggal_lulus = p_tanggal_kelulusan,
            nomor_ijazah_smp = COALESCE(NULLIF(btrim(v_item->>'nomor_ijazah_smp'), ''), nomor_ijazah_smp),
            updated_at = NOW()
        WHERE id = v_student.id;

        -- 2. Simpan rekaman permanen pada tabel student_graduations
        INSERT INTO public.student_graduations (
            student_id,
            nis,
            nisn,
            nama_siswa,
            angkatan,
            kelas_terakhir,
            tahun_ajaran_lulus,
            tahun_kelulusan,
            tanggal_kelulusan,
            nomor_ijazah_smp,
            sekolah_lanjutan,
            status_kelulusan,
            diproses_oleh,
            diproses_oleh_nama,
            catatan
        ) VALUES (
            v_student.id,
            v_student.nis,
            COALESCE(v_student.nisn, '-'),
            v_student.nama_lengkap_siswa,
            COALESCE(v_student.angkatan, EXTRACT(YEAR FROM COALESCE(v_student.tanggal_masuk, NOW()))::TEXT),
            v_student.kelas,
            p_tahun_ajaran_lulus,
            p_tahun_kelulusan,
            p_tanggal_kelulusan,
            NULLIF(btrim(COALESCE(v_item->>'nomor_ijazah_smp', '')), ''),
            NULLIF(btrim(COALESCE(v_item->>'sekolah_lanjutan', '')), ''),
            'Lulus',
            auth.uid(),
            p_actor_name,
            NULLIF(btrim(COALESCE(v_item->>'catatan', '')), '')
        );

        -- 3. Tambahkan penanda kelulusan pada student_class_history (tanpa menghapus riwayat sebelumnya)
        INSERT INTO public.student_class_history (
            student_id,
            tahun_ajaran,
            kelas,
            tingkat_kelas,
            status_riwayat,
            tanggal_mulai,
            tanggal_selesai,
            catatan
        ) VALUES (
            v_student.id,
            p_tahun_ajaran_lulus,
            v_student.kelas,
            '9',
            'lulus',
            p_tanggal_kelulusan,
            p_tanggal_kelulusan,
            format('Dinyatakan LULUS pada Tahun Pelajaran %s (Tahun Lulus %s)', p_tahun_ajaran_lulus, p_tahun_kelulusan)
        );

        v_graduated_count := v_graduated_count + 1;
    END LOOP;

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
        auth.uid(),
        p_actor_name,
        'admin',
        'admin',
        'PROCESS_GRADUATION',
        'student_graduations',
        p_tahun_kelulusan,
        jsonb_build_object(
            'tahun_ajaran_lulus', p_tahun_ajaran_lulus,
            'tahun_kelulusan', p_tahun_kelulusan,
            'tanggal_kelulusan', p_tanggal_kelulusan,
            'graduated_count', v_graduated_count,
            'skipped_count', v_skipped_count
        ),
        format('Proses kelulusan Kelas IX Tahun Pelajaran %s selesai: %s siswa dinyatakan Lulus.', p_tahun_ajaran_lulus, v_graduated_count)
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'graduated_count', v_graduated_count,
        'skipped_count', v_skipped_count
    );
END;
$$;

COMMIT;
