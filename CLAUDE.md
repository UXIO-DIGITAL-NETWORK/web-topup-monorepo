# CLAUDE.md — Monorepo Website Topup

Peta akar. **Dokumen yang mengikat ada di tiap app** — baca `CLAUDE.md` terdekat dengan berkas yang sedang dikerjakan.

| Kalau menyentuh… | Baca |
|---|---|
| `apps/api/**` | `apps/api/CLAUDE.md` — 69 KB, dokumen arsitektur sesungguhnya |
| `apps/admin/**` | `apps/admin/CLAUDE.md` |
| `apps/storefront/**` | `apps/storefront/CLAUDE.md` — memuat kontrak API dan pola routing |
| `apps/payment/**` | `apps/payment/CLAUDE.md` |
| Lintas aplikasi | `docs/` |
| Membuat branch, commit, push, PR, atau rilis | `docs/10-sop-it-department.md` — SOP IT: format branch, prefix commit, isi PR, siapa yang boleh merge |

## Perintah

```bash
# API
cd apps/api && composer run test && ./vendor/bin/pint

# Frontend (dari akar)
npm run test:admin
npm run lint:storefront
npm run build:payment
```

**Shim di `node_modules/.bin` rusak di repo-repo ini.** Jalankan entrypoint aslinya:

```bash
node node_modules/vitest/vitest.mjs run
node node_modules/typescript/bin/tsc -b --force
node node_modules/eslint/bin/eslint.js .
```

## Aturan yang berlaku di seluruh repo

- **Git flow mengikuti SOP IT** (`docs/10-sop-it-department.md`): branch baru `dev-[role]-[nama-fitur]-[ddmmyyyy]` atau `mtc-…`, commit berprefix `feat:`/`fix:`/`refactor:`/`chore:`/`docs:`, PR ke `staging` dengan deskripsi (perubahan, cara tes, screenshot UI). Agent tidak pernah push ke `main`/`staging`, merge PR, atau membuat tag rilis — itu wewenang Head of IT.
- **Pipeline API wajib:** `Route → FormRequest → Controller → Action → ApiResponse`. Controller tidak boleh memuat logika.
- **Angka yang menyangkut uang hanya dihitung di satu tempat.** Lihat `apps/api/app/Support/` — `Money`, `PlanPrice`, `PointRules`, `WalletLedger`, `PointLedger`.
- **Satu `features/*` tidak boleh mengimpor dari `features/*` lain.** Kode bersama diangkat ke `components/common`, `lib`, atau `utils`.
- **Jangan melebarkan proyeksi publik** di `ShowInvoiceAction`, `TrackOrdersAction`, `ListMemberTransactionsAction` — arraynya disusun field demi field supaya data sensitif tidak bocor karena kelalaian.
- **Setiap grup rute terlindungi wajib membawa `abilities:access-api`.** Tanpa itu refresh token 30 hari menjadi sesi API penuh.
- **Vitest storefront tidak menjalankan `.tsx`.** Logika yang perlu diuji harus tinggal di `lib/*.ts`.

## Dependensi

Tiap app punya `package-lock.json` sendiri dan dipasang dengan `npm ci`. **Jangan menggantinya dengan npm workspaces yang di-hoist tanpa keputusan tersendiri** — membuang lockfile menaikkan 35 dari 57 dependensi langsung dan mematahkan lint. Alasan lengkapnya di `docs/04-deployment.md`.

## Struktur

```
apps/{api,admin,storefront,payment}   empat aplikasi
docs/                                 dokumentasi lintas-app (bahasa Indonesia)
.github/workflows/                    satu CI + satu deploy, dengan path filter
```
