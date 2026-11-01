# UI/UX Audit & Polish Roadmap: ConstrucSee v2

Evaluasi antarmuka untuk **ConstrucSee v2**. Dokumen ini sudah **diverifikasi ulang terhadap kode per 2026-10-31**: klaim yang kedaluwarsa atau salah fakta telah dikoreksi, dan temuan yang kebetulan sudah terimplementasi ditandai. Status tiap poin: **SAH** (masalah nyata), **SAH SEBAGIAN** (fakta lama, ringkasan masih relevan), atau **SUDAH TERATASI**.

---

## 1. Evaluasi Tema & Visual Identity

### 1.1 Estetika "Matrix/Cyberpunk" vs Ergonomi Posko Proyek — SAH SEBAGIAN

* **Fakta kode:** latar utama **bukan** pitch-black `#050505`/`#000000` — `tailwind.config.cjs` memakai `shell #121214` (dark zinc), `panel #18181B`, `panel2 #27272A`, garis `#2E2E33`. Angka teks `ink #F4F4F5` sudah persis nilai netral yang direkomendasikan dokumen ini.
* **Yang tetap valid:** aksen **hijau neon `#22C55E`** (`accent`) dipakai luas (selection, TOTAL RAB, titik status, Kode, centang bulk) di samping `accent2 #10B981` dan `amber-400` untuk Alat. Kontras neon-on-dark masih berpotensi *eye strain* bagi pemakaian 6–10 jam dan after-image saat lihat gambar kerja.
* **Rekomendasi yang tersisa:**
  * Batasi `accent #22C55E` untuk status aktif/kursor/primary action saja; nilai data memakai `ink`, bukan hijau.
  * Jika ingin lebih lembut lagi, opsi menaikkan `shell` ke `#16161A`–`#1B1B1F` (tetap zinc, tanpa ganti set token).

---

## 2. Audit Komponen Shell & Layout

```
+-----------------------------------------------------------------------------------+
| TitleBar & Quick Access                                                           |
+-----------------------------------------------------------------------------------+
| RibbonBar (Group caption + letter/label buttons)                                  |
+---------------------+---------------------------------------+---------------------+
|                     | Center Viewport (Sheet aktif)         |                     |
| Project Navigator   |                                       | Properties          |
| (semua 10 divisi)   |                                       | Inspector           |
|                     | Bottom Sheet Tabs                     | (kontekstual)       |
+---------------------+---------------------------------------+---------------------+
| StatusBar (Total RAB | Active Cell Indicator | Sync Engine State)                 |
+-----------------------------------------------------------------------------------+
```

### 2.1 Ribbon Bar Top Navigation — SAH SEBAGIAN

* **Fakta kode:** `RibbonButton` **sudah** menampilkan huruf aksen (`label.slice(0,1)`) **dan label lengkap di bawahnya**, tinggi `h-[52px]`, `min-w-[64px]` — bukan micro-icon tanpa label. Solusi "ikon 24×24 + teks label" pada dasarnya sudah dipenuhi (hanya bedanya ikon berupa huruf, bukan glyph).
* **Yang masih valid:** banyak tombol masih *disabled* (New, Open, Expand/Collapse, Division/Item, Recalc, Coefficient, Overhead/Profit, Formula, Navigator/Inspector, Density) — target klik tak produktif memakan ruang Ribbon. Selesai-kan fungsinya atau sembunyikan dari Ribbon (lihat juga §4).

### 2.2 Redundansi Tiga Panel — SUDAH TERATASI (klaim tidak akurat)

* **Fakta kode:** Properties Inspector **bukan** pengulang statis; ia sudah berperan **kontekstual**: kode + nama baris terpilih, rantai hierarki (path divisi), field Satuan/Volume/Harga Satuan/Total, **Rekapitulasi Komponen dengan progress bar** Tenaga/Bahan/Alat, input Overhead %/Profit %, dan Grand Total. Menampilkan nama baris aktif di inspector adalah pola standar (mirip property grid CAD/Excel), bukan triplikasi data yang berbahaya.
* **Sisa yang bisa dipertimbangkan (opsional):** saat seleksi = divisi, sembunyikan field Satuan/Volume yang tidak relevan (kini menampilkan `—`).

---

## 3. Analisis Forensik Sheet-by-Sheet

> Catatan: tangkapan layar referensi ada di `docs/screenshots/` dengan ekstensi **`.png`** (`01-full.png` … `08-rencana-kerja.png`) — versi awal dokumen menulis `.jpg`. Tangkapan tersebut juga **kedaluwarsa** terhadap kode saat ini (diambil sebelum beberapa perubahan di bawah).

### 3.1 Sheet `Full` / WBS Engine (`01-full.png`) — SAH

* **Masalah:** kerapatan baris analisa + item memang besar; indentasi hierarki (parent → leaf → komponen → item) ada (padding depth + dot warna + tag "komponen dasar") tetapi **tidak ada tree guide-line** dan teks antar level relatif seragam.
* **Solusi (tetap terbuka):** garis panduan pohon tipis (`border-l` per level) + badge latar tipis untuk membedakan baris Pekerjaan vs Rincian AHSP.

### 3.2 Sheet `Volume` (`02-volume.png`) — SAH SEBAGIAN

* **Fakta sekarang:** sheet Volume **collapsible per divisi, default tertutup** — "void hitam" yang dimaksud kini berupa daftar grup `▸` yang ringkas, bukan 85% kanvas kosong dengan baris tersebar. Void hanya muncul saat semua divisi dibuka dengan sedikit item.
* **Solusi (tetap menarik):** area kosong bawah bisa diisi mini-chart distribusi volume/biaya per divisi atau riwayat edit volume.

### 3.3 Sheet `Harga Dasar` (`03-harga-dasar.png`) — SUDAH TERATASI

* **Fakta kode:** kolom `Status` **sudah** menampilkan chip merah **"Belum diisi"** untuk `base_price <= 0` (dan ringkasan `n belum diisi` di meta header), bukan hanya strip `—`. Sel Harga Dasar juga **edibel** (`setItemPrice`, menimpa semua kemunculan nama+satuan).
* **Sisa (ide baru):** indikator "harga berubah vs basis data SNI master" belum ada — perlu perbandingan terhadap katalog `public/data/ahsp.json` (katalog AHSP memang **tidak menyimpan harga**, jadi ini butuh dataset harga referensi terpisah).

### 3.4 Sheet `RAB` (`04-rab.png`) & Discrepancy Angka Total — SAH (KRITIS)

* **Fakta kode (masih ada):**
  * Sheet RAB: baris `Grand Total` = Σ `total_price` leaf = **nilai dasar tanpa overhead** (contoh seed: `Rp 1.448.100.000,00`).
  * StatusBar ("TOTAL RAB") & Properties Inspector & footer sheet Full: `totalCost` dari engine yang **sudah termasuk overhead 10%** (`calc::total_cost(nodes, roots, overhead_percent)`) → `Rp 1.592.910.000,00`.
  * Selisih `Rp 144.810.000,00` = tepat 10% overhead — dua "Grand Total" berbeda tampil di layar yang sama tanpa label pembeda → berbahaya bagi kepercayaan pengguna.
* **Solusi (sesuai audit, valid):** di footer sheet RAB tampilkan transparansi bertingkat — `Subtotal RAB` / `Overhead (n%)` / `Grand Total` (footer dinamis sudah punya infrastruktur `Grand Total/PPN/Jumlah`; cukup tambah baris Subtotal & Overhead, atau minimal ganti label footer RAB jadi "Subtotal RAB (belum termasuk overhead)").
* **Alternatif:** konsisten-kan semua sheet turunan memakai nilai termasuk overhead dengan label eksplisit.

### 3.5 Sheet `Analisa` (`05-analisa.png`) & `BOQ` (`06-boq.png`) — SUDAH TERATASI

* **Fakta kode:** seluruh kolom numerik (Koef, Harga Dasar, Subtotal, HS Pekerjaan, Kebutuhan, Jumlah) **sudah rata-kanan** (`Th/Td align="right"`) dan memakai `font-mono tabular-nums`; koefisien 4 desimal tetap (`formatKoef`), uang 2 desimal (`formatIDR`). Klaim "beberapa kolom masih rata-kiri" tidak berlaku lagi untuk kode saat ini; kolom teks (Kode/Uraian) memang sengaja rata-kiri.

### 3.6 Sheet `Rekapitulasi` (`07-rekapitulasi.png`) — SAH

* **Masalah:** kolom `Porsi` masih angka mentah (`3,35%`, `49,87%`).
* **Solusi (valid):** progress bar proporsional di dalam sel `Porsi` (pola progress bar yang sama sudah dipakai di PropertiesInspector §Rekapitulasi Komponen — konsisten design system).

### 3.7 Sheet `Rencana Kerja` (`08-rencana-kerja.png`) — SAH SEBAGIAN

* **Fakta kode:** input Jumlah Pekerja/Durasi memakai `border-line/60 bg-shell text-ink` dengan `focus:border-accent` dan placeholder `—`; **sudah** ada affordance fokus menjel, tetapi **tidak ada hover/border lebih terang saat idle** sehingga bisa tampak read-only. Nilai juga kini **dipersistensi** (tabel `work_plans`), bukan state lokal — bagian klaim "kesan disabled" masih layak dipoles.
* **Solusi (valid):** naikkan border idle ke `border-line`, tambahkan `hover:border-accent/40`, dan/atau ikon pensil halus di sel input.

---

## 4. Actionable Design System & Polish Roadmap

### 4.1 Token Warna — SAH SEBAGIAN (rancang di atas palet zinc yang ada)

Palet saat ini (`tailwind.config.cjs`) sudah zinc/gelap dan `ink #F4F4F5`; usulan ganti total ke Slate `#0F172A` tidak wajib. Perubahan minimal yang setara dengan maksud audit:

```cjs
module.exports = {
  theme: {
    extend: {
      colors: {
        shell: "#16161A",     // sedikit naik dari #121214 (opsional)
        panel: "#18181B",
        panel2: "#27272A",
        line: "#2E2E33",
        ink: "#F4F4F5",
        muted: "#A1A1AA",
        accent: "#22C55E",    // dibatasi utk status/primary action saja
        accent2: "#10B981",
        danger: "#EF4444",
        info: "#3B82F6",      // baru: highlight data input (usulan audit)
      },
    },
  },
};
```

Catatan: `accent2 #10B981` (emerald) dan `danger #EF4444` yang diusulkan audit **sudah ada**; `Alat` memakai `amber-400` (perlu masuk token resmi bila ingin konsisten).

### 4.2 Standar Typography & Numeric Alignment — SUDAH TERATASI (hampir seluruhnya)

1. Format angka sudah sesuai: `formatIDR` (`Rp 1.592.910.000,00`), `formatKoef` tetap 4 desimal (`0,2000`), `formatMoney` untuk input unit_price.
2. Tabel sheet kini memakai `font-mono tabular-nums` (`NUM`) dan WbsTable memakai font-mono per sel numerik.
3. Sisa kecil: kode WBS di tabel belum bold — opsional `font-medium` jika ingin tegas.

### 4.3 Panduan Layout Splitter & Panel Responsif — SAH SEBAGIAN

* **Fakta kode:** default widths saat ini 250px (Navigator) / 330px (Inspector), clamp drag 190..440 / 250..520; keduanya bisa di-collapse lewat tombol header (`‹`/`›`) menjadi strip vertikal 32px (bukan 0px).
* **Sisa yang belum ada (valid untuk diimplementasi):**
  1. Keyboard shortcut toggle panel (usulan `Ctrl + ]` untuk Inspector, kira-kira `Ctrl + [` untuk Navigator).
  2. **Empty state grid pattern**: jika sheet berisi sedikit baris, sisa area tidak polos — beri pola grid halus ala kertas kalkir (`background-image` radial/linear 1px) di badan sheet.
  3. (Dari §2.1) keputusan atas tombol Ribbon disabled — aktifkan atau sembunyikan.

---

## 5. Ringkasan Prioritas (hasil verifikasi)

| # | Temuan | Status | Prioritas |
| --- | --- | --- | --- |
| 1 | Mismatch total RAB (base) vs StatusBar/Inspector (incl. overhead) | SAH — masih terjadi | **Tinggi** |
| 2 | Porsi Rekapitulasi tanpa visualisasi | SAH | Sedang |
| 3 | Tree guide-line & pembeda visual baris analisa di sheet Full | SAH | Sedang |
| 4 | Affordance input Rencana Kerja (hover/idle border) | SAH SEBAGIAN | Sedang |
| 5 | Shortcut collapse panel + empty-state grid pattern | SAH SEBAGIAN | Rendah |
| 6 | Ribbon buttons disabled menumpuk | SAH SEBAGIAN | Rendah |
| 7 | Pembatasan pemakaian warna accent hijau | SAH SEBAGIAN | Rendah |
| 8 | Status "Belum diisi" di Harga Dasar/BOQ | SUDAH TERATASI | — |
| 9 | Alignment & tabular-nums angka | SUDAH TERATASI | — |
| 10 | Inspector sebagai pengulang statis | SUDAH TERATASI (klaim tidak akurat) | — |
