# 09 — Produk: tanpa pool, produk manual, diskon, dan produk mix

Perubahan besar pada manajemen produk: tahap **pool** dihapus, produk bisa
dibuat tangan, tiap produk bisa punya **diskon** sendiri, dan sebuah produk bisa
berisi beberapa produk lain (**mix**) yang dikirim ke supplier terpisah.

## Alur produk sekarang

Dulu menambah produk dua langkah: pilih SKU provider → masuk **pool** → promote
jadi produk. Pool tidak ada lagi — pool adalah `supplier_products` dengan
`product_id = NULL`, dan tahap itu yang dihapus.

Sekarang ada **satu modal** (`Add Products`) dengan dua mode:

| Mode | Apa yang terjadi |
|---|---|
| **Single** | Satu produk. Memilih baris kedua menggantikan yang pertama. |
| **Massal** | Banyak produk sekaligus. |

Di dalamnya admin memilih layanan provider (berpaginasi, dengan pencarian), lalu
mengisi tiap produk **lengkap di situ** — nama, sub-nama, sub-kategori, diskon,
poin, batas harga, margin per plan, dan komposisi mix — lalu memilih **Publish**
atau **Simpan sebagai draft**. Tidak ada lagi langkah "buat dulu, rapikan
belakangan".

Bentuknya **tabel**, bukan form bertumpuk: satu baris per layanan provider, dan
baris yang dicentang menjadi bisa diedit di tempat. Dua filter di atasnya —
**provider** dan **kategori** (beserta jumlahnya, dari `GET /v1/uxiolabs/pool-facets`)
— yang menentukan daftar mana yang tampil. Baris yang belum dicentang tetap
terlihat tetapi inputnya nonaktif, sehingga **Modal** (harga supplier) bisa
dibaca sebagai acuan tanpa sengaja terisi.

**Harga diisi sebagai margin, harga jualnya ditampilkan.** Angka di samping input
margin adalah hasil hitungan (`Modal × (1 + margin)`), bukan yang diketik admin —
server tetap yang menghitung harga sebenarnya lewat `PricingService`, jadi yang
terlihat di tabel adalah pratinjau. Alasannya: kalau harga modal supplier naik,
harga jual ikut menyesuaikan tanpa ada yang perlu mengubah tabelnya.

Field yang memang per produk — **mix** dan batas harga — dibuka lewat tombol
**Detail** pada barisnya. Mix tidak bisa diisi massal, jadi menaruhnya di grid
hanya akan membuat kolom yang selalu kosong untuk sebagian besar baris.

Satu panggilan membawa semuanya: `POST /v1/products/from-supplier` menerima
`items[]`, dan tiap barisnya dijalankan sebagai satu pipeline (buat draft → diskon
→ margin → mix → publish) yang resilien — satu SKU gagal tidak menjatuhkan
sisanya.

**Layanan yang sudah menjadi produk kita tidak bisa dicentang ulang** (tidak
double). Pengecualiannya mix: menyusun komposisi memang butuh produk yang sudah
ada, jadi di bagian mix katalog lengkap tetap bisa dipilih sebagai komponen.

**Tidak ada entri "Manual"** (produk tanpa supplier) di menu lagi. Perilaku
API-nya tetap ada — `POST /v1/products` masih memetakan produk ke supplier
Internal System dan dispatch supplier `is_system` tetap dilewati — jadi entri itu
bisa dikembalikan tanpa perubahan backend.

**Tidak ada tombol Delete.** Yang ada **Listis** (`POST /v1/products/{id}/publish`)
dan **Unlistis** (`/unpublish`). Arsip tetap ada di server — `transactions.product_id`
adalah RESTRICT, jadi sebuah produk harus hidup lebih lama daripada masa
tayangnya — tetapi tidak diekspos di panel. Baris terarsip bisa di-`restore`.

**Efek samping yang penting:** order yang dipetakan ke Internal System **tidak
lagi ditembak ke Uxiotopup**. Sebelumnya `ProcessUxiolabsTransactionAction`
selalu memakai driver supplier yang di-bind global, sehingga produk manual
memesan SKU yang tidak ada di provider. Sekarang dispatch dilewati untuk
supplier `is_system`, dan transaksinya berhenti di `PAID` + `QUEUED` menunggu
manusia.

## Diskon per produk

`products.discount_type` (`percent` | `fixed`) + `products.discount_value`.
Diterapkan di **`PlanPrice`** — satu tempat harga dihitung — lewat
`App\Support\Pricing\ProductDiscount`, dengan aturan yang sama seperti flash
sale: **diskon hanya menurunkan**, tidak pernah di bawah nol. `PlanPrice::listFor()`
menyediakan angka sebelum diskon untuk harga coret.

Ini bukan flash sale (berjangka waktu) dan bukan kode promo (diketik pelanggan);
ia milik produknya sendiri dan tidak kedaluwarsa.

## Produk mix

Satu produk jual yang isinya beberapa produk, mis. 5 Diamond + 10 Diamond.

- **Komposisi**: `product_mix_items` (`product_id`, `component_product_id`,
  `quantity`), unik per pasangan. **Tanpa nesting** — komponen tidak boleh produk
  mix, dan sebuah produk tidak boleh jadi komponen dirinya sendiri.
- **Modal terakumulasi**: `POST /v1/products/{id}/mix` menulis
  `products.price_modal` = **modal SKU produk itu sendiri** (bila masih punya
  mapping) + Σ (modal komponen × qty), lalu menghitung ulang harga jual dari
  modal BARU memakai margin yang sedang berlaku. SKU produk sendiri ikut dihitung
  karena ia juga dikirim (lihat pemenuhan di bawah); produk bundle tanpa supplier
  sendiri bernilai 0 untuk bagian itu. Margin dibaca dari pasangan harga/modal
  yang ada, karena produk mix **tidak punya mapping** tempat
  `supplier_product_margins` bisa menempel.
- **Bisa dijual kalau komponennya bisa dijual**: `Catalog` mengenal mix — sebuah
  mix tayang tepat ketika SEMUA komponennya tayang (dan SKU produknya sendiri,
  bila ia masih punya satu, juga tayang). Satu bagian nonaktif menarik mix-nya
  dari peredaran, dan gerbang publish memakai aturan yang sama.

### Pemenuhan: satu transaksi, beberapa order supplier

Supplier menolak `idtrx` ganda, jadi tiap komponen butuh referensinya sendiri:
`{invoice}-{componentId}-{sequence}` — **diturunkan, bukan dihitung**, supaya
percobaan ulang setelah respons hilang memakai referensi yang sama (idempoten di
sisi supplier, bukan order kedua). Kuantitas >1 menjadi sebanyak itu order.

| Bagian | Perilaku |
|---|---|
| `ProcessMixTransactionAction` | Satu order per komponen, PLUS satu order untuk SKU produk sendiri bila produk masih punya mapping aktif; bagian ber-supplier Internal System dilewati (dipenuhi admin). |
| `transaction_supplier_orders` | Satu baris per order: `idtrx`, `supplier_trx_id`, `provider_status`, `sn`, `attempts`, `last_error`, `retried_by_user_id`/`retried_at`. |
| `DeriveMixStatusAction` | Satu-satunya tempat yang memutuskan hasil mix: semua terkirim → `COMPLETED`; ada yang gagal → `FAILED_PROVIDER`; selain itu `PROCESSING`. |
| Webhook | Resolve lewat `idtrx` sub-order dulu, fallback ke `invoice_number` untuk transaksi lama; satu callback menyelesaikan satu komponen. |
| Poller / cek status | Per komponen, lalu induknya diturunkan. |
| Refund | Satu komponen gagal → **refund penuh** (transaksi mix tidak bisa setengah terkirim). |
| Checkout | Modal dari akumulasi SKU sendiri + komponen; kuota harian dicek untuk setiap bagian, masing-masing dikunci di dalam transaksi tulis. |

`transactions.supplier_trx_id`/`sn`/`provider_status` tetap diisi sebagai
ringkasan order pertama, supaya layar dan laporan yang lebih dulu ada tetap punya
angka. Yang butuh kebenaran utuh membaca `supplier_orders`
(`TransactionResource`) atau `components` (invoice publik).

## Di mana melihatnya

- Panel admin → Produk: `+ Tambah Produk` (From Supplier / Manual / Bulk),
  aksi baris Listis/Unlistis, tab **Product Mix** di form produk.
- Panel admin → Transaksi → detail: tabel **Item Transaksi** — satu baris per
  order supplier (Supplier, Callback/`idtrx`, No. Seri Supplier, Status, Dibuat
  Pada, Terkirim Pada, Di Rehit Oleh) dengan tombol **Rehit** per baris untuk
  mencek ulang satu bagian ke supplier.
- Panel admin → Produk → Tambah Produk: tiap baris punya langkah bernomor
  (Data Produk · Harga & Margin · Batas Harga · Mix Produk), termasuk unggah
  logo dan simulasi modal/markup/keuntungan yang ikut menghitung komponen mix.
- Invoice pelanggan (`/invoice/{nomor}`): daftar bagian, nama + serial, hanya
  saat lebih dari satu.
