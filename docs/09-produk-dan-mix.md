# 09 — Produk: tanpa pool, produk manual, diskon, dan produk mix

Perubahan besar pada manajemen produk: tahap **pool** dihapus, produk bisa
dibuat tangan, tiap produk bisa punya **diskon** sendiri, dan sebuah produk bisa
berisi beberapa produk lain (**mix**) yang dikirim ke supplier terpisah.

## Alur produk sekarang

Dulu menambah produk dua langkah: pilih SKU provider → masuk **pool** → promote
jadi produk. Pool tidak ada lagi — pilihannya `supplier_products` dengan
`product_id = NULL`, dan tahap itu yang dihapus.

| Pintu | Apa yang terjadi |
|---|---|
| **From Supplier** | `POST /v1/products/from-supplier` — tiap SKU provider langsung jadi **produk draft** (`status = false`, `published_at = null`) beserta mapping-nya. Belum tayang sampai admin mem-publish. |
| **Manual** | `POST /v1/products` — produk tanpa provider. Dipetakan ke supplier **Internal System** dan dipenuhi admin lewat `POST /v1/transactions/{id}/manual-review`. |
| **Bulk** | `POST /v1/products/bulk-create` — jalur lama, tidak berubah. |

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
  `products.price_modal` = Σ (modal komponen × qty), lalu menghitung ulang harga
  jual dari modal BARU memakai margin yang sedang berlaku. Margin dibaca dari
  pasangan harga/modal yang ada, karena produk mix **tidak punya mapping** tempat
  `supplier_product_margins` bisa menempel.
- **Bisa dijual kalau komponennya bisa dijual**: `Catalog` mengenal mix — sebuah
  mix tayang tepat ketika SEMUA komponennya tayang. Satu komponen nonaktif
  menarik mix-nya dari peredaran, dan gerbang publish memakai aturan yang sama.

### Pemenuhan: satu transaksi, beberapa order supplier

Supplier menolak `idtrx` ganda, jadi tiap komponen butuh referensinya sendiri:
`{invoice}-{componentId}-{sequence}` — **diturunkan, bukan dihitung**, supaya
percobaan ulang setelah respons hilang memakai referensi yang sama (idempoten di
sisi supplier, bukan order kedua). Kuantitas >1 menjadi sebanyak itu order.

| Bagian | Perilaku |
|---|---|
| `ProcessMixTransactionAction` | Satu order per komponen; komponen ber-supplier Internal System dilewati (dipenuhi admin). |
| `transaction_supplier_orders` | Satu baris per order: `idtrx`, `supplier_trx_id`, `provider_status`, `sn`, `attempts`, `last_error`. |
| `DeriveMixStatusAction` | Satu-satunya tempat yang memutuskan hasil mix: semua terkirim → `COMPLETED`; ada yang gagal → `FAILED_PROVIDER`; selain itu `PROCESSING`. |
| Webhook | Resolve lewat `idtrx` sub-order dulu, fallback ke `invoice_number` untuk transaksi lama; satu callback menyelesaikan satu komponen. |
| Poller / cek status | Per komponen, lalu induknya diturunkan. |
| Refund | Satu komponen gagal → **refund penuh** (transaksi mix tidak bisa setengah terkirim). |
| Checkout | Modal dari akumulasi komponen; kuota harian dicek untuk SETIAP komponen, masing-masing dikunci di dalam transaksi tulis. |

`transactions.supplier_trx_id`/`sn`/`provider_status` tetap diisi sebagai
ringkasan order pertama, supaya layar dan laporan yang lebih dulu ada tetap punya
angka. Yang butuh kebenaran utuh membaca `supplier_orders`
(`TransactionResource`) atau `components` (invoice publik).

## Di mana melihatnya

- Panel admin → Produk: `+ Tambah Produk` (From Supplier / Manual / Bulk),
  aksi baris Listis/Unlistis, tab **Product Mix** di form produk.
- Panel admin → Transaksi → detail: daftar **bagian** muncul saat order punya
  lebih dari satu order supplier.
- Invoice pelanggan (`/invoice/{nomor}`): daftar bagian, nama + serial, hanya
  saat lebih dari satu.
