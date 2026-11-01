# Professional Presentation & Reporting Standards: ConstrucSee v2

Dokumen ini memuat spesifikasi standar penyajian laporan profesional (*court/government-grade presentation standards*) untuk seluruh *output* dokumen (PDF & Excel) pada **ConstrucSee v2**, yang disesuaikan dengan standar industri konstruksi Indonesia (PUPR, BUMN, Konsultan QS, dan Kontraktor Swasta).

---

## 1. Standar Media, Layout & Ukuran Kertas

Di industri konstruksi Indonesia, penggunaan ukuran kertas ditentukan oleh jenis dan peruntukan dokumen:

| Jenis Dokumen | Ukuran Kertas Utama | Dimensi (mm) | Orientation | Margin (Top, Bottom, Left, Right) | Peruntukan |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **RAB / Rekapitulasi / BOQ** | **F4 / Folio** | $215 \times 330\text{ mm}$ | Portrait | $25\text{mm}, 20\text{mm}, 20\text{mm}, 15\text{mm}$ | Standar Instansi Pemerintah / Dinas / BUMN |
| **Dokumen Tender A4** | **A4** | $210 \times 297\text{ mm}$ | Portrait | $20\text{mm}, 20\text{mm}, 20\text{mm}, 15\text{mm}$ | Konsultan Swasta / Swasta Internasional |
| **Lampiran AHSP Detail** | **F4 / Folio** | $215 \times 330\text{ mm}$ | Portrait | $20\text{mm}, 20\text{mm}, 20\text{mm}, 15\text{mm}$ | Lampiran Rincian Biaya |
| **Kurva S & Gantt Chart** | **A3** | $297 \times 420\text{ mm}$ | Landscape | $15\text{mm}, 15\text{mm}, 15\text{mm}, 15\text{mm}$ | Cetak S-Curve & Time Schedule |

> **Catatan Binding Margin:** Margin kiri sengaja diset minimal $20\text{mm}$ untuk menyediakan ruang jilid (*gutter binding*) tanpa menutupi kode WBS atau uraian pekerjaan.

---

## 2. Aturan Tipografi & Format Numerik Indonesia

### 2.1 Standar Tipografi
* **Font Utama Laporan:** Arial, Helvetica, atau Liberation Sans (San-serif neutral, highly readable).
* **Font Numerik Tabel:** Monospaced Tabular Figures (`font-mono`, `tabular-nums`) agar posisi koma desimal dan pemisah ribuan sejajar secara vertikal dari baris ke baris.

### 2.2 Hirarki Ukuran & Bobot Teks

| Elemen Laporan | Ukuran Font | Style / Weight | Alignment | Case |
| :--- | :--- | :--- | :--- | :--- |
| **Judul Utama Laporan** | $14\text{pt}$ | Bold | Center | UPPERCASE |
| **Sub-Judul / Nama Proyek** | $11\text{pt}$ | Semi-Bold | Center | Title Case |
| **Header Divisi (Level 1 WBS)** | $9.5\text{pt}$ | Bold | Left | UPPERCASE |
| **Header Sub-Divisi (Level 2 WBS)** | $9\text{pt}$ | Bold | Left | Title Case |
| **Baris Pekerjaan (Leaf Node)** | $8.5\text{pt}$ | Regular | Left | Sentence case |
| **Baris Component / Item AHSP** | $8\text{pt}$ | Italic / Regular | Left (Indented $5\text{mm}$) | Sentence case |
| **Data Numerik (Harga/Volume)** | $8.5\text{pt}$ | Monospace Regular | Right | N/A |
| **Grand Total / Subtotal** | $9.5\text{pt}$ | Bold | Right | Title Case |
| **Running Header / Footer** | $7.5\text{pt}$ | Regular (Muted Color) | Left / Right | Title Case |

### 2.3 Aturan Format Angka Indonesia (Locale `id-ID`)
1. **Pemisah Ribuan & Desimal:**
   * Pemisah Ribuan = Titik (`.`)
   * Pemisah Desimal = Koma (`,`)
   * *Contoh:* `1.500.000,00`
2. **Mata Uang (Rupiah):**
   * Di kolom ber-header "Harga Satuan (Rp)" atau "Total Biaya (Rp)", nilai numerik **tidak perlu** menggunakan simbol `Rp` di setiap baris sel (agar tabel bersih).
   * Pada baris **Grand Total / Total RAB**, simbol `Rp` dicantumkan eksplisit: `Rp 1.592.910.000,00`.
3. **Presisi Desimal:**
   * **Mata Uang:** Tepat 2 desimal (`15.187,50`).
   * **Volume / Kuantitas:** Maksimal 2 desimal; nol akhir dibuang (`120` atau `1.200,5` atau `0,75`).
   * **Koefisien AHSP:** Fixed 4 desimal (`0,2000` atau `0,0350`).

---

## 3. Struktur Anatomi Dokumen Resmi (Anatomy of Official Report)

Setiap dokumen cetak laporan PDF dari ConstrucSee v2 wajib mengikuti 5 zona struktural:

```
+-------------------------------------------------------------------------+
| ZONA 1: RUNNING HEADER (Nama Proyek | Jenis Dokumen | Logo Perusahaan)  |
+-------------------------------------------------------------------------+
| ZONA 2: COVER RINGKAS / METADATA HEADER                                 |
| - Nama Proyek, Lokasi, Pemilik Proyek, Kontraktor, Tanggal, No. Kontrak |
+-------------------------------------------------------------------------+
| ZONA 3: DATA TABEL UTAMA                                                |
| - Header Tabel (REPEATING di setiap pergantian halaman)                  |
| - Grouping Baris Divisi (Background Fill Soft Gray / Slate)             |
| - Baris Data (Alternating Zebra Striping tipis)                         |
| - Baris Subtotal / Grand Total                                          |
+-------------------------------------------------------------------------+
| ZONA 4: APPROVAL BLOCK / LEMBAR PENGESAHAN (UNBREAKABLE)                |
| - Tanggal Pengesahan                                                    |
| - 3 Kolom Tanda Tangan: Diajukan (QS/Kontraktor), Diperiksa (Konsultan), |
|   Disetujui (Owner/Klien)                                              |
+-------------------------------------------------------------------------+
| ZONA 5: RUNNING FOOTER                                                  |
| - Watermark Status (DRAFT / FINAL / TENDER) | Halaman X dari Y          |
+-------------------------------------------------------------------------+
```

### 3.1 Rules Mencegah Orphan & Broken Layout (Page Break Constraints)
* **`Table Header Repeat`:** Setiap kali tabel terpotong dan berlanjut ke halaman berikutnya, header tabel (`No`, `Uraian Pekerjaan`, `Satuan`, `Volume`, `Harga Satuan`, `Total Biaya`) **wajib muncul kembali** otomatis di bagian atas halaman baru.
* **`Unbreakable Approval Block`:** Blok tanda tangan (Zona 4) diikat dengan properti `keep_together` / `block(breakable: false)`. Blok tanda tangan tidak boleh terpisah sendirian di halaman baru tanpa didampingi minimal 2-3 baris data atau baris total.

---

## 4. Spesifikasi Standar per Jenis Laporan

### 4.1 Laporan Rencana Anggaran Biaya (RAB Utama)
* **Judul Dokumen:** `RENCANA ANGGARAN BIAYA (RAB)`
* **Kolom Wajib:** `No` (Kode WBS), `Uraian Pekerjaan`, `Satuan`, `Volume`, `Harga Satuan Pekerjaan (Rp)`, `Total Biaya (Rp)`.
* **Footer Tabel:**
  1. `Subtotal Biaya Pekerjaan` (Jumlah seluruh leaf).
  2. `Jasa & Overhead (10%)` (Bila dihitung terpisah).
  3. `Total Sebelum PPN`.
  4. `PPN (11%)`.
  5. `GRAND TOTAL (RAB)`.
  6. `Terbilang:` (Kalimat terbilang otomatis dalam bahasa Indonesia, misal: *"Satu Miliar Lima Ratus Sembilan Puluh Dua Juta..."*).

### 4.2 Laporan Rekapitulasi Biaya (Cost Summary)
* **Judul Dokumen:** `REKAPITULASI RENCANA ANGGARAN BIAYA`
* **Kolom Wajib:** `No Divisi`, `Uraian Divisi Pekerjaan`, `Jumlah Biaya (Rp)`, `Bobot / Porsi (%)`.
* **Visualisasi:** Kolom `Bobot (%)` dilengkapi *progress bar* proporsional atau grafik *Pie Chart* ringkasan di halaman pertama.

### 4.3 Laporan Analisa Harga Satuan Pekerjaan (AHSP)
* **Judul Dokumen:** `ANALISA HARGA SATUAN PEKERJAAN (AHSP)`
* **Layout:** Setiap item AHSP disajikan sebagai satu blok terisolasi berisi:
  * Kode AHSP & Nama Pekerjaan.
  * Satuan & Formula Standar (SNI/PUPR).
  * Tabel Rincian: Group **A. Tenaga Kerja**, **B. Bahan/Material**, **C. Peralatan**.
  * Kolom Rincian: `No`, `Komponen / Resource`, `Satuan`, `Koefisien`, `Harga Satuan Dasar (Rp)`, `Subtotal (Rp)`.
  * Total A, Total B, Total C, Total A+B+C, Overhead & Profit %, dan Harga Satuan Pekerjaan Akhir.

### 4.4 Laporan Bill of Quantities (BOQ / Rekapitulasi Resource)
* **Judul Dokumen:** `BILL OF QUANTITIES (BOQ) & REKAPITULASI MATERIAL/TENAGA`
* **Grouping:** Dikelompokkan ketat berdasarkan kategori: **I. Kebutuhan Tenaga Kerja**, **II. Kebutuhan Bahan**, **III. Kebutuhan Alat**.
* **Kolom Wajib:** `No`, `Nama Resource / Spesifikasi`, `Satuan`, `Total Kebutuhan (Volume)`, `Harga Satuan Dasar (Rp)`, `Total Biaya Kebutuhan (Rp)`.

---

## 5. Aturan Ekspor Excel Interoperabel (`rust_xlsxwriter`)

Ekspor Excel pada **ConstrucSee v2** mematuhi standar *Audit-Ready Excel Model*:

1. **Formula Matematika Hidup (Dynamic Excel Formulas):**
   * Dilarang mengekspor angka total statis. Seluruh total harus menggunakan formula Excel asli:
     * Baris Total Item: `=C12*D12` (Volume $\times$ Harga Satuan).
     * Baris Subtotal Divisi: `=SUM(F12:F25)`.
     * Baris Grand Total: `=SUM(F10, F26, F40)`.
2. **Tab / Worksheet Architecture:**
   Satu berkas `.xlsx` hasil ekspor berisi 5 worksheet terorganisir:
   * Tab `01_Rekapitulasi`
   * Tab `02_RAB_Utama`
   * Tab `03_AHSP_Analisa`
   * Tab `04_BOQ_Resource`
   * Tab `05_Rencana_Kerja`
3. **Format Sel Bawaan (Cell Formatting):**
   * Kolom Uang: `Format::set_num_format("_(* #,##0.00_);_(* (#,##0.00);_(* \"-\"??_);_(@_)")`
   * Gridlines: Wajib diaktifkan eksplisit (`worksheet.set_gridlines(Gridlines::Show)`).
   * Auto-fit Column Width: Lebar kolom dihitung otomatis berdasarkan teks terpanjang + *padding* 3 karakter.

---

## 6. Template Rust Typst Generator (`src-tauri/src/reports/templates.rs`)

```rust
pub fn build_typst_rab_template() -> &'static str {
    r#"
#set page(
  paper: "us-letter", // Disesuaikan ke F4 via width/height manual
  width: 215mm,
  height: 330mm,
  margin: (top: 25mm, bottom: 20mm, left: 20mm, right: 15mm),
  header: align(right)[
    #text(size: 7.5pt, fill: luma(120), font: "Liberation Sans")[
      *ConstrucSee v2* | Dokumen Estimasi Biaya Resmi
    ]
  ],
  footer: [
    #line(length: 100%, stroke: 0.4pt + luma(200))
    #grid(
      columns: (1fr, 1fr),
      align(left)[#text(size: 7.5pt, fill: luma(100))[Status: DRAFT / CONFIDENTIAL]],
      align(right)[#text(size: 7.5pt, fill: luma(100))[Halaman #counter(page).display("1 dari 1", both: true)]]
    )
  ]
)

#set text(font: "Liberation Sans", size: 8.5pt)

// Setup Helper Formatter
#let fmt(val) = {
  if val == 0 { "—" } else { val }
}

// Typst Content Render Engine Call
// ...
"#
}
```