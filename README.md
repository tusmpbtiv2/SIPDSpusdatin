# SIPDS — Sistem Informasi Pengelolaan Data Siswa
## SMP BHINNEKA TUNGGAL IKA

Aplikasi web skala produksi (**React 19 + TypeScript + Vite + Tailwind CSS + Supabase PostgreSQL & Auth**) untuk pengelolaan Buku Induk Siswa (59 Kolom Standar), Portal Orang Tua berbasis NISN, Verifikasi Perubahan Biodata Transaksional, Pencatatan Mutasi Masuk & Keluar, Audit Log, serta Dashboard Analitik Real-Time.

---

## 1. Arsitektur & Fitur Utama

1. **Autentikasi Terpisah (Admin & Orang Tua)**:
   - **Login Admin/Petugas**: Menggunakan email & password Supabase Auth dengan dukungan 4 role (`super_admin`, `admin`, `operator`, `viewer`).
   - **Login Orang Tua/Wali**: Menggunakan **NISN Siswa (10 digit)** dan password khusus yang diaktifkan oleh Admin. Dilengkapi jembatan autentikasi aman melalui **Supabase Edge Function (`parent-auth`)** atau **Express Backend (`/api/auth/parent-login`)** menggunakan `SUPABASE_SERVICE_ROLE_KEY`.
2. **Buku Induk Siswa 59 Kolom**:
   - Mendukung penuh 59 kolom standar Excel SMP Bhinneka Tunggal Ika, dikelompokkan ke dalam 8 tab terstruktur (Identitas, Pendidikan SD/MI, Alamat, Kesehatan, Ayah, Ibu, Wali, Administrasi).
   - Dilengkapi Cetak PDF ukuran F4 (210mm x 330mm), Import Excel pintar (Auto-Mapping 59 kolom + Log `import_batches`), dan Export Excel.
3. **Portal Orang Tua & Usulan Koreksi Biodata**:
   - Menampilkan profil anak, indikator kelengkapan 59 kolom biodata, statistik status pengajuan (`Pending`, `Approved`, `Rejected`, `Draft`), serta riwayat pengajuan.
   - Orang tua **tidak pernah dapat mengubah tabel `students` secara langsung**. Semua usulan perubahan disimpan ke `student_change_requests` dan `student_change_request_items`.
4. **Verifikasi Perubahan Biodata Transaksional (`public.verify_student_change_request`)**:
   - Mendukung persetujuan semua kolom, penolakan semua kolom, atau persetujuan sebagian kolom (*partial approval*) beserta catatan alasan penolakan.
   - Menggunakan penguncian baris (`FOR UPDATE`), mencegah persetujuan ganda, memvalidasi nilai lama agar tidak menimpa data terbaru secara tidak sengaja, dan mencatat `before/after` ke `audit_logs`.
5. **Mutasi Masuk & Mutasi Keluar Transaksional**:
   - **Mutasi Masuk (`public.process_incoming_mutation`)**: Mendukung pembuatan siswa baru atau pengaktifan kembali siswa pindahan, mencegah duplikasi NIS/NISN/NIK, serta mencatat riwayat kelas (`student_class_history`) dan `audit_logs`.
   - **Mutasi Keluar (`public.process_outgoing_mutation`)**: Mengubah status siswa menjadi `mutasi_keluar` (tidak pernah menghapus record siswa), menutup riwayat kelas aktif, serta menyediakan fitur cetak Surat Keterangan Pindah Sekolah ukuran F4.
6. **Dashboard Analitik (8 KPI & 7 Grafik) + Pusat Pengaturan**:
   - 8 Kartu Statistik & 7 Grafik interaktif dengan 6 filter dimensi real-time (membedakan jumlah transaksi mutasi dan jumlah siswa unik, serta mengabaikan transaksi yang dibatalkan).
   - Pusat Pengaturan: Manajemen Kelas (`classes`), Manajemen Tahun Ajaran (`academic_years`), Manajemen Akun Admin & Role (`profiles`), Manajemen Akun Orang Tua berbasis NISN (`parent_student_access`), dan Audit Log (`audit_logs`).

---

## 2. Panduan Setup Database Supabase

1. Buat project baru di [Supabase Dashboard](https://supabase.com/dashboard).
2. Buka menu **SQL Editor** -> **New Query**.
3. Salin seluruh isi file `/supabase/migrations/20261103000001_sipds_complete_schema.sql` (atau unduh langsung dari menu **Pengaturan -> Supabase & Dokumentasi** di dalam aplikasi).
4. Klik **Run** untuk mengeksekusi pembuatan:
   - **11 Tabel Utama**: `academic_years`, `classes`, `profiles`, `students`, `parent_student_access`, `student_mutations`, `student_class_history`, `student_change_requests`, `student_change_request_items`, `import_batches`, `audit_logs`.
   - **Row Level Security (RLS)** ketat untuk seluruh 11 tabel.
   - **4 Fungsi RPC Transaksional**:
     - `public.verify_student_change_request`
     - `public.process_incoming_mutation`
     - `public.process_outgoing_mutation`
     - `public.cancel_student_mutation`

### Membuat Akun Super Admin Pertama
1. Di Supabase Dashboard, buka **Authentication -> Users -> Add User -> Create New User**.
2. Masukkan email dan password untuk Super Admin sekolah.
3. Jalankan SQL berikut di **SQL Editor** untuk menetapkan role `super_admin`:
   ```sql
   INSERT INTO public.profiles (id, email, full_name, role, is_active)
   SELECT id, email, 'Administrator Utama SIPDS', 'super_admin', true
   FROM auth.users
   WHERE email = 'admin@smpbhinneka.sch.id'
   ON CONFLICT (id) DO UPDATE SET role = 'super_admin', is_active = true;
   ```

---

## 3. Panduan Aktivasi Akun Orang Tua Berbasis NISN

Karena Supabase Auth menggunakan autentikasi berbasis email secara native, SIPDS menyediakan mekanisme pemetaan aman dari **NISN 10 digit** ke akun internal Supabase Auth (`nisn.<nisn>@parent.sipds.local`) yang divalidasi terhadap tabel `public.parent_student_access`:

1. Login sebagai **Admin / Super Admin / Operator**.
2. Buka menu **Data Siswa** atau **Pengaturan -> Akun Orang Tua (NISN)**.
3. Klik tombol **Aktivasi / Kelola Akun Ortu** pada baris siswa yang bersangkutan.
4. Tetapkan password awal (minimal 6 karakter) dan pastikan status akun **Aktif**.
5. Orang tua kini dapat login melalui tab **Login Orang Tua** menggunakan **NISN Siswa** dan password tersebut.

> **Catatan Deployment Serverless (Netlify)**:
> Jika aplikasi di-hosting secara statis di Netlify tanpa server Node.js (`server.ts`), deploy juga fungsi `/supabase/functions/parent-auth/index.ts` ke Supabase Edge Functions dengan perintah:
> ```bash
> supabase functions deploy parent-auth --no-verify-jwt
> ```

---

## 4. Panduan Import Excel Pertama Kali (59 Kolom)

1. Login ke Dashboard Admin dan buka menu **Import / Export Excel**.
2. Klik **Unduh Template Excel (59 Kolom)** apabila Anda membutuhkan format header standar, atau langsung unggah file `.xlsx` / `.xls` Buku Induk Siswa SMP Bhinneka Tunggal Ika.
3. Sistem akan otomatis memetakan ke-59 header Excel ke kolom database `snake_case`, mendeteksi duplikasi NIS/NISN di dalam file maupun terhadap database, dan menampilkan **Preview Baris Valid vs Baris Bermasalah**.
4. Pilih mode penyimpanan (**Tambah Siswa Baru** atau **Tambah & Perbarui / Upsert**) lalu klik **Proses Simpan ke Database**.
5. Riwayat import tercatat secara permanen di tabel `public.import_batches` dan `public.audit_logs`.

---

## 5. Panduan Deployment ke GitHub & Netlify

1. **Push ke Repository GitHub**:
   ```bash
   git init
   git add .
   git commit -m "Release: SIPDS SMP Bhinneka Tunggal Ika Production"
   git branch -M main
   git remote add origin https://github.com/username/sipds-smp-bhinneka.git
   git push -u origin main
   ```
2. **Hubungkan ke Netlify**:
   - Masuk ke [Netlify Dashboard](https://app.netlify.com/) -> **Add new site -> Import an existing project -> GitHub**.
   - Pilih repository GitHub Anda. File `netlify.toml` sudah mengonfigurasi:
     - **Build command**: `npm run build`
     - **Publish directory**: `dist`
     - **SPA Redirect**: `/* -> /index.html (200)`
3. **Konfigurasi Environment Variables di Netlify**:
   Buka **Site configuration -> Environment variables**, lalu tambahkan:
   - `VITE_SUPABASE_URL` = `https://<project-ref>.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = `<anon-public-key-anda>`
4. Klik **Deploy site**.
