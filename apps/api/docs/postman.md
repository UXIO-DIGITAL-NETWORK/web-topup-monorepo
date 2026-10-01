# Postman — Uxio TopUp API v3

Koleksi Postman lengkap untuk API ini: **setiap rute** di `apps/api/routes/api.php`
(426 endpoint) dipetakan, masing-masing dengan contoh request **dan** contoh
response (sukses + 422 validasi untuk endpoint ber-body).

Berkas: `apps/api/uxio-topup-api-v3.postman_collection.json` (Postman Collection v2.1.0).

## Impor

1. Buka Postman → **Import** → pilih `apps/api/uxio-topup-api-v3.postman_collection.json`.
2. Set variabel `base_url` (default `http://localhost:8000/api/v1`).
3. Jalankan salah satu request **Auth › Login (…)** di bawah untuk mengambil token.

Menjalankan server lokal:

```bash
cd apps/api
composer install
php artisan migrate:fresh --seed    # katalog game/produk tidak di-seed default
php artisan serve
```

## Peran & token

Satu token hanya berlaku untuk satu peran, jadi koleksi memakai variabel token
terpisah. Jalankan login sesuai folder yang akan dipakai — skrip test-nya yang
mengisi variabel:

| Peran | Request | Variabel | Dipakai oleh folder |
|---|---|---|---|
| Admin | `Auth › Login` | `token_admin` | System, Admin · * |
| Member | `Auth › Login (Member)` | `token_member` | Member (Self-Service), Refund Claims › attach |
| Payment admin (klien) | `Auth › Login (Client / payment-admin)` | `token_client` | Payment Admin (Merchant) |
| Payment internal (kita) | `Auth › Login (Internal / payment-internal)` | `token_internal` | Payment Internal (Kita) |
| Hub | — | `hub_key`, `hub_write_key` | Hub |

Kredensial seed (password `uxiolabsJaya123`):

| Email | Peran |
|---|---|
| `admin@uxiotopup.id` | Admin |
| `client@uxiotopup.id` | Payment admin |
| `internal@uxiotopup.id` | Payment internal |
| `developer@uxiotopup.id` | Admin, **bebas 2FA** |

## Dua faktor (2FA)

Admin wajib TOTP. Login admin **bukan** `developer@uxiotopup.id` akan menjawab
`{ two_factor_required: true, challenge_token }` — bukan token. Skrip login
menyimpan `challenge_token`, lalu jalankan **Auth › Verify 2FA** (`{ "code": "123456" }`)
untuk mendapatkan token. Untuk menghindari langkah ini, login sebagai
`developer@uxiotopup.id`.

## Hub

Folder **Hub** tidak memakai Bearer. Isi `hub_key` (dan `hub_write_key` untuk
rute tulis). Rute tulis juga menuntut `HUB_WRITE_ENABLED=true` di server.

## Chaining id

Beberapa list endpoint menyimpan id baris pertama ke variabel agar request
berikutnya tinggal jalan (`{{product_admin_id}}`, `{{transaction_id}}`,
`{{refund_id}}`, `{{service_invoice_id}}`, `{{withdrawal_number}}`,
`{{api_credential_id}}`, `{{game}}`, `{{payment_channel_id}}`,
`{{membership_plan_id}}`, `{{product_id}}`). Endpoint yang memakai id manual
memakai variabel `{{id}}` — isi sesuai baris yang dituju.

## Struktur folder

| Folder | Tier |
|---|---|
| 01 System (Public) | publik |
| 02 Auth | publik + bearer |
| 03 Storefront (Public) | publik |
| 04 Refund Claims (Public) | publik |
| 05 Member (Self-Service) | bearer |
| 06 Admin · Overview | admin + 2FA |
| 07 Admin · Master Data | admin + 2FA |
| 08 Admin · Products & Pricing | admin + 2FA |
| 09 Admin · Content & Marketing | admin + 2FA |
| 10 Admin · Uxiolabs Tools | admin + 2FA |
| 11 Admin · Monetapay Tools | admin + 2FA |
| 12 Admin · Transactions | admin + 2FA |
| 13 Admin · Refunds | admin + 2FA |
| 14 Admin · Payments, Points & Ratings | admin + 2FA |
| 15 Payment Admin (Merchant) | payment-admin |
| 16 Payment Internal (Kita) | payment-internal |
| 17 Hub | X-Hub-Key / X-Hub-Write-Key |
| 18 Webhooks (Reference) | publik (signature / IP) |

Folder **18** hanya rujukan payload masuk — jangan dijadikan uji fungsional.

## Envelope response

- Sukses: `{ "status": "success", "code": 200, "message": "...", "data": ... }`
- Berpaginasi: `data` berisi `{ data, links, meta }`
- Gagal validasi: `{ "status": "fail", "code": 422, "message": "...", "errors": {...} }`
- Gagal lain: `{ "status": "error", "code": <int>, "message": "...", "data": null }`

## Verifikasi cakupan

Skrip ini membandingkan koleksi dengan `php artisan route:list --json` dan gagal
bila ada rute yang belum terpetakan, atau item tanpa contoh response:

```bash
python3 apps/api/docs/scripts/postman_coverage.py
```

Jalankan setelah rute berubah. Koleksi `v1`/`v2` lama dibiarkan sebagai arsip.
