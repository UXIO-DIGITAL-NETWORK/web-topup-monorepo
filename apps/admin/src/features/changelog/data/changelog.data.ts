/**
 * Catatan rilis, ditulis untuk dua pembaca sekaligus.
 *
 * `changes` ditujukan ke admin/operator: apa yang sekarang **terlihat atau bisa
 * dipakai**. Tanpa nama modul, tanpa path berkas, tanpa istilah teknis — kalau
 * pembacanya harus tahu kode untuk mengerti, kalimatnya salah.
 *
 * `technical` ditujukan ke web developer: modul yang tersentuh dan alasan
 * teknisnya. Boleh apa adanya, termasuk nama kelas dan kolom.
 *
 * Aturan penulisannya:
 *
 *  - Satu perubahan = satu baris. Kalau butuh tiga baris, mungkin itu tiga hal.
 *  - `changes` boleh kosong untuk rilis yang memang tidak terlihat admin (mis.
 *    hanya pekerjaan deploy). Halaman akan mengatakannya terus terang. Yang
 *    tidak boleh: mengarang pembaruan fitur supaya daftarnya kelihatan berisi.
 *  - `technical` boleh kosong untuk rilis yang murni kosmetik.
 *  - Entri ditulis di commit yang membuat perubahannya, bukan menumpuk di akhir.
 *  - Hanya rilis **stabil**. Tag `-rc` tidak masuk — yang dibaca admin adalah
 *    apa yang benar-benar sudah naik ke produksi.
 *  - Terbaru di atas. Urutannya dibaca orang, bukan diurutkan program.
 */

export type ChangelogKind = "new" | "improved" | "fixed" | "removed";

export interface ChangelogChange {
  kind: ChangelogKind;
  /** Satu kalimat, untuk admin. */
  text: string;
}

export interface ChangelogRelease {
  /**
   * Tag rilis apa adanya (`"v1.4.9"`). Dicocokkan langsung dengan
   * `ENV.APP_VERSION` untuk menandai versi yang sedang berjalan — jadi jangan
   * menuliskannya dengan gaya lain.
   */
  version: string;
  /** Tanggal tag dibuat, `YYYY-MM-DD`. */
  releasedAt: string;
  /** Yang admin lihat berubah. */
  changes: ChangelogChange[];
  /** Yang developer butuh. */
  technical: string[];
}

export const CHANGELOG: ChangelogRelease[] = [
  {
    version: "v1.4.9",
    releasedAt: "2026-10-15",
    changes: [],
    technical: [
      "deploy: notifikasi deploy dan log aplikasi disatukan ke satu kanal Discord.",
    ],
  },
  {
    version: "v1.4.8",
    releasedAt: "2026-10-15",
    changes: [
      {
        kind: "new",
        text: "Tiap transaksi kini menampilkan paket keanggotaan yang harganya benar-benar dipakai pembeli.",
      },
      {
        kind: "new",
        text: "Halaman Transaksi punya kartu ringkasan, keuntungan per transaksi, dan log invoice.",
      },
      {
        kind: "fixed",
        text: "Filter di halaman Transaksi memakai data sungguhan dan bisa dicari, bukan daftar contoh.",
      },
      {
        kind: "fixed",
        text: "Filter Pengguna hanya menawarkan akun pembeli — staf tidak lagi ikut muncul.",
      },
      { kind: "improved", text: "Format uang tampil seragam di seluruh panel." },
    ],
    technical: [
      "admin,api: harga plan per transaksi diekspos; produk dan plan dibaca dari relasi, bukan diturunkan ulang.",
      "admin: untung per transaksi dihitung dari biaya modal yang tercatat, bukan dari selisih harga jual.",
      "api: filter transaksi memakai kolom asli + pencarian; daftar karangan dihapus.",
      "admin: hint filter Pengguna dibatasi ke role pembeli.",
    ],
  },
  {
    version: "v1.4.7",
    releasedAt: "2026-10-15",
    changes: [
      {
        kind: "improved",
        text: "Panduan pengisian kolom lebih ringkas, dan kolom contoh kini menampilkan hasil nyata (mis. Mobile Legends).",
      },
      {
        kind: "fixed",
        text: "Placeholder kolom isian berisi contoh, dan teks pilihan (SelectField) ikut bahasa panel.",
      },
    ],
    technical: [
      "admin: copy panduan kolom isian dipersingkat; contoh keluaran ditambahkan per kategori.",
      "admin: SelectField menerima placeholder bercontoh dan label yang mengikuti locale aktif.",
    ],
  },
];
