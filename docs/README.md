# Dokumentasi Website Topup

Sembilan dokumen. Enam yang pertama ditulis dari kode yang benar-benar ada di repo ini per 7 September 2026; 07 dan 08 adalah aturan zona dan catatan status pekerjaan; 09 mencatat perubahan manajemen produk (pool dihapus, produk manual, diskon, produk mix).

Bisa dibaca di dua tempat: langsung di GitHub, atau sebagai halaman web di
**<https://uxio-digital-network.github.io/web-topup-monorepo/>** — diagram alurnya
ikut terender di kedua tempat.

| Dokumen | Untuk menjawab |
|---|---|
| [01 — Alur website](01-alur-website.md) | Apa yang terjadi ketika pelanggan memesan, membayar, gagal, atau minta uangnya kembali |
| [02 — Arsitektur kode](02-arsitektur.md) | Di mana sebuah kode seharusnya ditulis, dan kenapa di situ |
| [03 — Referensi API](03-api.md) | Endpoint apa saja yang ada, siapa yang boleh memanggilnya |
| [04 — Deployment](04-deployment.md) | Cara menaikkan ke produksi tanpa merusak apa pun |
| [05 — Basis data](05-basis-data.md) | Arti tiap kolom uang, dan relasi antar tabel |
| [06 — Referensi rute API](06-referensi-rute-api.md) | Peta 152 endpoint per grup rute. Dulu dilayani publik di `GET /` |
| [07 — Zona: dapur, colokan, pendengar, hiasan](07-zona-dapur.md) | Bagian mana yang wajib sama di semua situs, mana yang bebas, dan di mana sebuah perubahan harus dikerjakan |
| [08 — Rencana kerja & status](08-rencana-kerja.md) | Apa yang sudah dikerjakan, apa yang belum, cara mengujinya, dan cara menambah colokan |
| [09 — Produk: tanpa pool, manual, diskon, produk mix](09-produk-dan-mix.md) | Bagaimana produk dibuat dan dijual sekarang, dan bagaimana satu transaksi mix dikirim ke supplier dalam beberapa bagian |

**Versi HTML interaktif**: [`interaktif.html`](interaktif.html) — satu berkas mandiri (bisa dibuka lewat `file://`, tanpa server), berisi seluruh dokumen di halaman ini, plus sidebar dan pencarian (`/` atau `Ctrl+K`). Dibangun dari Markdown oleh [`build-interaktif.py`](build-interaktif.py); jalankan `python3 docs/build-interaktif.py` setelah mengubah dokumen.

## Urutan acuan bila dokumen bertentangan

1. **Kode** — selalu menang.
2. **`apps/*/CLAUDE.md`** — dokumen paling terawat di repo ini; `apps/api/CLAUDE.md` (69 KB) praktis adalah dokumen arsitektur API.
3. **`docs/` ini** — ringkasan lintas-aplikasi.
4. **`apps/api/docs/api/*-spec.md`** — spesifikasi endpoint per domain.

## Dokumen lama yang sudah kedaluwarsa

Ketiganya masih ada di repo karena ikut terbawa riwayat, tapi **jangan dijadikan acuan**:

- `apps/api/README.md` — masih berjudul "Template API - Headless API Engine", sisa dari templat awal.
- `apps/api/artifacts/monetapay_digiflazz_integration_overview.md` — menyebut Laravel 11, PHP 8.2, dan **Digiflazz**, padahal supplier sudah pindah ke Uxiolabs sejak Agustus 2026.
- `apps/api/docs/artifacts/payment-and-supplier-flow.md` — isinya sebagian besar masih berlaku, tapi headernya menyebut Laravel 11.

## Yang bukan bagian dari sistem ini

`uxiotopup-hub` dan `uxiotopup-hub-api` **sengaja tidak ikut** ke monorepo ini. Hub adalah pusat kendali lintas-situs: ia mengawasi banyak deployment sekaligus, hidup di server sendiri, dan punya siklus rilis sendiri. Empat aplikasi di sini adalah **satu situs** yang di-deploy per klien.

Sisi situs dari integrasi Hub tetap ada di `apps/api` (endpoint `/v1/hub/*`, perintah `hub:sync-*`), dan didokumentasikan di [03 — Referensi API](03-api.md).
