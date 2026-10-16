# 10 — SOP IT Department (pedoman developer dan AI agent)

Versi Markdown dari **SOP IT Department v2.0** (diperbarui 28 September 2026). Aturan Git, PR, QA, dan rilis di dokumen ini mengikat developer **dan** AI agent (Claude, Commandcode, Gemini) yang bekerja di repo ini.

## Aturan untuk AI agent

Baca bagian ini sebelum membuat branch, commit, push, atau PR.

1. **Satu tugas, satu branch baru.** Jangan mengerjakan tugas di `main` atau `staging`.
   - Fitur baru: `dev-[role]-[nama-fitur]-[ddmmyyyy]` → `dev-frontend-auth-28092026`
   - Bug fix / revisi: `mtc-[role]-[nama-fitur]-[ddmmyyyy]` → `mtc-backend-api-timeout-28092026`
   - `role` = `frontend` atau `backend`. Nama fitur **wajib ada** (menghindari konflik kalau satu developer memegang banyak task dalam sehari). Tanggal = hari pembuatan, format `ddmmyyyy`.
2. **Commit memakai prefix**: `feat:` fitur baru · `fix:` perbaikan bug · `refactor:` rapikan kode tanpa ubah perilaku · `chore:` konfigurasi, dependency, housekeeping · `docs:` dokumentasi.
   - Scope boleh dipakai: `feat(settings): …`. Bahasa Inggris, imperatif, ≤72 karakter, tanpa titik di akhir.
   - Satu unit logis per commit. Perubahan format murni dipisah sebagai `chore`.
   - Tipe di luar lima prefix itu (`a11y`, `style`, `perf`, dari `apps/admin/.claude/rules/commit.md`) hanya dipakai bila tidak ada padanan di lima prefix SOP.
3. **Jangan pernah** commit atau push ke `main`/`staging`/production, merge PR, membuat tag `vX.Y.Z`, atau deploy. Hanya **Head of IT** yang berwenang.
4. **PR ke `staging`.** Deskripsi wajib memuat: apa yang diubah, cara tes, dan screenshot bila ada perubahan UI. Pastikan tidak ada konflik dengan branch target sebelum minta review.
5. **Checklist sebelum PR** (centang jujur; kalau satu belum dilakukan, tulis di deskripsi PR):
   - [ ] Fitur sudah diuji di lokal
   - [ ] Tidak ada error di console/browser/terminal
   - [ ] Lint dan type check lolos
   - [ ] Commit message sudah rapi
   - [ ] Tidak ada file sensitif (`.env`, secret) yang ikut ter-commit
6. **Stage hanya file yang termasuk tugas.** Jangan menjalankan formatter ke seluruh direktori; format file yang disentuh saja (pernah menimbulkan noise 12 file pada 16 Oktober 2026).
7. **Jangan membuang perubahan yang belum di-commit** (`checkout --`, `restore`, `reset`, `clean`) tanpa persetujuan eksplisit user.
8. **Setelah PR di-merge**, ingatkan developer untuk QA mandiri di staging, dan mengecek production dalam 15 menit setelah rilis diumumkan.
9. **Selesai mengerjakan**, laporkan nama branch dan link PR (dipakai untuk komentar card Trello).
10. Kalau menemukan bug di production: berhenti, lapor ke Head of IT untuk hotfix/rollback.

## Peran dan tanggung jawab

| Peran | Tanggung jawab utama |
|---|---|
| Manajemen / Stakeholder | Memberi instruksi, brief, atau permintaan fitur. Titik awal setiap tugas. |
| Head of IT | Administrator server, DevOps (release & deployment), menyaring tugas, code review PR, Website QA tahap akhir. **Satu-satunya** yang boleh merge ke staging/production. |
| Front-End Developer | UI/UX, integrasi API, pemeliharaan visual, responsif dan performa sisi klien. |
| Back-End Developer | Logika sistem, arsitektur database, API, validasi data, autentikasi/otorisasi, pemeliharaan server-side. |

**Prinsip dasar:** tidak ada kode yang masuk ke `main` atau production tanpa PR dan persetujuan Head of IT. Developer bertanggung jawab penuh atas fitur dari lokal sampai production.

## Alur kerja end-to-end

1. Stakeholder memberi brief → Head of IT menyaring dan mendelegasikan ke FE atau BE.
2. Developer membuat branch sesuai konvensi, mengerjakan, lalu mengajukan **PR**.
3. Head of IT review dan merge ke **staging**.
4. Developer **QA mandiri di staging**. Ada error → kembali ke PR. Aman → lanjut.
5. Head of IT **release ke production** (tag `vX.Y.Z`).
6. Developer **QA di production** dalam 15 menit. Error → lapor Head of IT (hotfix/rollback). Aman → selesai.

## QA pasca-deploy (QA mandiri)

Developer wajib memastikan kodenya jalan di server langsung, bukan hanya di localhost.

- **Staging:** setelah PR di-merge, uji happy path dan edge case utama.
- **Production:** begitu Head of IT menyatakan fitur naik, cek aplikasi live **dalam 15 menit**.

Daftar pemeriksaan wajib:
- Fitur yang diubah berfungsi sesuai brief
- Tidak ada error di browser console maupun log server
- Responsif di mobile dan desktop (untuk UI)
- Data tersimpan/terbaca benar di database
- Notifikasi, email, dan payment callback tetap normal

**Darurat:** error/bug di production → hentikan tugas lain, segera lapor Head of IT untuk hotfix/rollback.

## Manajemen tugas (Trello)

- Pindahkan card ke **Doing** begitu mulai mengerjakan.
- Tambahkan checklist QA mandiri (Local testing, Staging testing) di setiap card.
- Tulis nama branch dan link PR di komentar card.
- Pindahkan ke **Review** saat PR diajukan, ke **Done** setelah production aman.

## Arsitektur project (ringkas)

Monorepo dengan satu backend Laravel dan tiga frontend React. Keempat aplikasi memakai backend yang sama dan dideploy ke server yang sama (dari 46 hari kerja, 33 hari menyentuh lebih dari satu aplikasi). Detail ada di [02 — Arsitektur kode](02-arsitektur.md).

| App | Stack | Isi |
|---|---|---|
| `apps/api` | Laravel 13 · PHP 8.3+ · MySQL · Sanctum | Backend tunggal untuk tiga frontend |
| `apps/admin` | React 19 · Vite · Tailwind v4 | Panel admin: produk, order, pengguna, laporan |
| `apps/storefront` | React 19 · i18n id/en · Vite | Etalase publik pelanggan |
| `apps/payment` | React 19 · Vite | Uxiolabs Pay: penagihan dan penarikan dana |

- **Website Template** (repo ini) adalah cetakan platform top-up. Perbaikan engine transaksi dan integrasi Hub lahir di sini; perbedaan antar situs (UI, provider, gateway, kanal notifikasi) dibuat sebagai colokan/plugin/driver, bukan cabang kode di engine.
- **ISG Store** (`isgstore-monorepo`) adalah instance produksi turunan template: struktur sama, plus `dist/`, workflow per app, `.tanstack/`, log, dan taste sendiri.
- **Uxio Hub** (`uxiotopup-hub` + `uxiotopup-hub-api`) tetap di luar monorepo (server dan siklus rilis berbeda). Situs mengirim data lewat `/v1/hub/*` di `apps/api`.
- Alur: Template → (clone & customize) → ISG Store → (laporan & manajemen) → Hub Panel → Hub API → (monitoring) → situs.

Pola folder fitur frontend (admin dan storefront): `features/[nama-fitur]/{components,pages,hooks,services,schemas,types,tests}`.

Domain backend (`apps/api/app/Actions/`): Auth/User/Member · Category/Product/Supplier · Checkout/Transaction/Payment · Refund/Rating/PointHistory · Content/Banner/Announcement · Financial/Wallet/Withdrawal · Integration/Hub/Uxiolabs · Report/Log/Dashboard · Service/Invoice/Installation.

## Perintah cepat

```bash
# Monorepo (root)
npm run install:all
npm run dev:admin        # atau dev:storefront, dev:payment
npm run build && npm run test && npm run lint

# API
cd apps/api
composer install && cp .env.example .env && php artisan key:generate
php artisan migrate --seed
php artisan serve        # atau: composer run dev
composer run test && ./vendor/bin/pint
```

Catatan: shim di `node_modules/.bin` rusak di repo ini; lihat `CLAUDE.md` root untuk cara menjalankan entrypoint aslinya.

**Rilis:** production dirilis lewat **tag `vX.Y.Z`**, bukan push langsung ke `main`. Versi tercatat di `.env`, bisa dibaca dari `GET /v1/version` dan sidebar admin (`VITE_APP_VERSION`). **Rollback** = jalankan workflow deploy dengan tag lama. Detail: [04 — Deployment](04-deployment.md).

## Kalau SOP bertabrakan dengan aturan lain

- **Alur Git, PR, dan rilis:** SOP ini menang.
- **Hal teknis** (gaya kode, TDD, struktur folder, token desain): `CLAUDE.md` terdekat dan `.claude/rules/` di app tersebut menang. Contoh: `apps/admin` mewajibkan Plan → Approve → Build dan satu feature log per perubahan; itu tetap berlaku di atas SOP.
- Ragu → ikuti yang lebih ketat dan sebutkan konfliknya ke user.
