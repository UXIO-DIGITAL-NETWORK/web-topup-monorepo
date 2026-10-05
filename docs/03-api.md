# Referensi API

Semua endpoint berada di bawah `/api/v1`. Sekitar **345 rute**, dibagi jadi delapan tingkat akses di `apps/api/routes/api.php`.

## Bentuk jawaban

Setiap endpoint memakai trait `ApiResponse`:

```json
{ "status": "success", "code": 200, "message": "...", "data": { } }
```

Daftar berpaginasi selalu membungkus dengan bentuk yang sama:

```json
{ "status": "success", "code": 200, "message": "...",
  "data": { "data": [...], "links": {...}, "meta": {...} } }
```

Kegagalan validasi selalu `{"status":"fail","code":422,"message":"...","errors":{...}}`. Bentuk itu juga yang dirender `bootstrap/app.php` untuk setiap `ValidationException`, jadi 422 yang ditulis tangan di controller tidak boleh menyimpang darinya.

---

## Delapan tingkat akses

| # | Prefix | Middleware | Rute | Untuk |
|---|---|---|---|---|
| 1 | `v1` | — | ~55 | Publik: storefront, checkout, callback gateway |
| 2 | `v1` | `auth:sanctum`, `abilities:access-api` | ~24 | Member yang masuk |
| 3 | `v1` | + `admin`, `two-factor` | ~187 | Back-office |
| 4 | `v1/payment-admin` | + `payment-admin` | ~19 | Klien pemilik situs |
| 5 | `v1/payment-internal` | + `payment-internal` | ~48 | Keuangan Uxio |
| 6 | `v1/hub` | `hub` | 6 | Hub menarik laporan |
| 7 | `v1/hub` | `hub`, `throttle:hub-sync` | 1 | Hub memicu sinkronisasi |
| 8 | `v1/hub` | `hub`, `hub-write` | 5 | Hub menyentuh uang |

### 1. Publik

Storefront pelanggan plus callback gateway. Endpoint yang paling sering dipakai:

| Endpoint | Catatan |
|---|---|
| `GET /games`, `GET /games/{game}` | `{game}` bisa slug, kode, atau id |
| `GET /games/{game}/products` | Sudah berharga sesuai paket membership pemanggil |
| `POST /games/{game}/validate-id` | **Selalu 200.** Provider mati pun menjawab `{nickname: null}` — 4xx di sini akan terbaca sebagai form pesanan yang rusak |
| `POST /checkout` | `throttle:checkout` (10/menit) |
| `GET /invoices/{invoiceNumber}` | Di-polling tiap 5 detik sampai status final |
| `GET /orders/track?query=` | Nomor invoice atau nomor telepon persis |
| `POST /refund-claims/*` | `throttle:refund-claim` (6/menit) |
| `POST /payment/callback`, `/uxiolabs/callback` | `throttle:webhooks` (120/menit) |
| `GET /storefront/{banners,announcements,leaderboard}` | **Berprefix `storefront` dengan sengaja** — `/v1/banners` sudah dipakai rute admin, dan koleksi rute Laravel dikunci pada metode+URI, sehingga rute publik dengan path sama akan diam-diam menggantikan rute admin |

**Jangan pernah melebarkan proyeksi publik.** `ShowInvoiceAction`, `TrackOrdersAction`, dan `ListMemberTransactionsAction` menyusun array-nya **field demi field**, bukan menyerialisasi model — supaya `guest_contact`, `margin`, `price_modal`, dan id supplier tidak bisa bocor karena kelalaian. Ada test yang menjaga ini.

### 2. Member

`GET /user`, `PATCH /users/sync-timezone`, dan seluruh `/v1/me/*`: profil, kata sandi, dashboard, transaksi, poin, refund, log aktivitas, penilaian.

Setiap kueri **dibatasi ke `user_id` lebih dulu, sebelum filter apa pun**, sehingga tidak ada kombinasi filter yang bisa melebarkannya ke baris pelanggan lain.

### 3. Admin

Bagian terbesar: pengguna, kategori, produk, supplier, transaksi, refund, harga, membership, konten, laporan, integrasi.

**Semuanya berada di balik `two-factor`.** Admin yang belum mendaftarkan authenticator mendapat 403 dengan `data.code = two_factor_setup_required`, dan panel mengarahkannya ke halaman pendaftaran. Rute `/2fa/setup` dan `/2fa/confirm` sengaja **di luar** grup ini — kalau tidak, admin yang sedang mendaftar tidak akan pernah bisa mencapainya.

### 4–5. Halaman pembayaran

`payment-admin` adalah klien; `payment-internal` adalah tim keuangan Uxio. Keduanya dipisah tegas di seluruh sistem.

### 6–8. Hub

Dijaga `X-Hub-Key`, mati total bila tidak ada kunci yang dikonfigurasi. **Kontrak baca bersifat aditif saja** — situs berjalan di versi yang berbeda-beda, jadi field boleh ditambah tapi tidak boleh diganti nama atau dihapus.

Jalur tulis butuh **kunci kedua** plus `HUB_WRITE_ENABLED`. Pemisahan ini ada supaya kunci baca yang bocor tidak bisa menggerakkan uang.

---

## Ability token — dan kenapa itu ada

**`abilities:access-api` wajib ada di setiap grup terlindungi, termasuk yang dibuat nanti.**

`auth:sanctum` sendirian menerima **token apa pun** yang belum kedaluwarsa, tanpa peduli untuk apa token itu diterbitkan. Tanpa pemeriksaan ability, `refresh_token` berumur 30 hari — yang disimpan panel admin di cookie terbaca JavaScript dan bertahan melewati penggantian kata sandi — adalah sesi API penuh.

`Sanctum::actingAs($user)` bawaannya **tanpa ability sama sekali**, jadi test wajib menuliskan `['access-api']`. `tests/Feature/Auth/TokenAbilityTest.php` yang menjaga semuanya.

## Pembatas laju

Delapan, didefinisikan di `AppServiceProvider`:

| Limiter | Batas | Dipakai |
|---|---|---|
| `api` | 120/menit | global |
| `checkout` | 10/menit | checkout, lacak pesanan |
| `webhooks` | 120/menit per IP | seluruh callback |
| `login` | 5/menit per **email\|IP** + plafon per IP | login, daftar, lupa & reset kata sandi |
| `two-factor` | dikunci pada hash token tantangan | verifikasi 2FA |
| `refund-claim` | 6/menit | klaim refund |
| `hub-sync`, `hub-write` | — | endpoint Hub |

`login` dikunci pada **email|IP**, bukan IP saja: satu bucket per IP berarti lima orang yang login dari satu kantor mengunci pemulihan kata sandi untuk semua orang di alamat itu.

---

## Spesifikasi per domain

Empat dokumen lebih rinci ada di `apps/api/docs/api/`: `category-master-data-spec.md`, `cms-spec.md`, `supplier-product-spec.md`, `transactions-payments-spec.md`.

Koleksi Postman: `apps/api/uxio-topup-api-v3.postman_collection.json` — memetakan **semua** rute di `routes/api.php` (426 endpoint), masing-masing dengan contoh request dan response. Uji cakupannya dengan `python3 apps/api/docs/scripts/postman_coverage.py`. Cara impor dan ganti peran ada di `apps/api/docs/postman.md`.

