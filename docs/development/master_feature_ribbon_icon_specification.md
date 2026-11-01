# Master Feature & Ribbon Icon Specification: ConstrucSee v2

Dokumen ini memuat daftar lengkap seluruh fitur profesional (*core*, *advanced*, dan *QS essential*) serta spesifikasi kebutuhan 32 ikon SVG pada Ribbon Bar untuk **ConstrucSee v2**.

---

## 1. Spesifikasi Modul Fitur Perangkat Lunak

### Modul 1: WBS Engine & Workspace Grid (Core)
* **Unlimited Hierarchical WBS Tree:** Pengelompokan hierarkis (*Division*, *Sub-division*, *Work Item*) dengan pengurutan otomatis kode WBS (misal `1.1`, `1.2`, `1.10`).
* **Dual Pricing Method (`PriceMethod`):**
  * `AHSP` (SNI/PUPR): Harga satuan terkunci (*read-only*), dihitung otomatis dari $A + B + C$ (Tenaga + Bahan + Alat).
  * `Langsung` (LS): Harga satuan edibel langsung, komponen biayanya di-rebalance secara proporsional.
* **Volume Takeoff & Formula Evaluator (Backing Sheet):**
  * Sel `volume` mendukung input rumus matematika (misal: `=2*(3.5+4)*0.15`).
  * Modal/Popover *Backing Sheet* per pekerjaan untuk rincian perkalian $P \times L \times T \times \text{Jumlah}$.
* **Dynamic Component Allocation:**
  * Murni berbasis item resource aktual tanpa alokasi persentase buatan (58/27/15).
* **Keyboard Ergonomics Kelas Spreadsheet:**
  * `F2`: Edit sel aktif.
  * `Tab` / `Shift+Tab`: Pindah sel horizontal (kanan/kiri).
  * `Enter` / `Shift+Enter`: Simpan nilai & pindah sel vertikal (bawah/atas).
  * `Arrow Keys`: Navigasi grid virtual.
  * `Tab` / `Shift+Tab` pada baris WBS: *Indent* / *Outdent* hierarki divisi.
* **Selection & Row Operations:**
  * Multi-cell drag & selection untuk *copy*, *cut*, *paste*, *duplicate*, dan *delete*.
  * Context menu (klik kanan) pada baris WBS & Project Navigator.

### Modul 2: Resource & Catalog Management (AHSP & Indeks)
* **Master Resource Database (Tenaga, Bahan, Alat):**
  * Registrasi resource unik berdasarkan kombinasi `Nama` + `Satuan`.
  * Indikator status chip merah **"Belum diisi"** untuk resource bernilai $\le 0$.
* **Global Price Override (`set_item_price`):**
  * Pengubahan harga dasar satu resource di sheet *Harga Dasar* otomatis menimpa seluruh kemunculannya di semua WBS leaf dan memicu re-calc DAG.
* **Katalog AHSP SNI PUPR Integration:**
  * Pustaka bawaan katalog standar (Permen PUPR) dengan pencarian teks & filter divisi.
  * System *WBS Cart/Keranjang*: Pilih beberapa pekerjaan katalog sekaligus, atur volume, lalu tambahkan massal (*bulk add*).
* **Indeks Harga Wilayah (Regional Price Multiplier):**
  * Pengali faktor harga dasar otomatis berdasarkan kabupaten/kota target proyek.
* **Pareto 80/20 Cost Control Analysis:**
  * Penandaan otomatis 20% item resource teratas yang menyerap 80% anggaran proyek.

### Modul 3: Multi-Sheet View & Analisis Visual
* **Full / WBS Grid Sheet:** Tampilan utama grid virtualized (`@tanstack/react-virtual`) dengan perincian komponen $A/B/C$ dan *expandable leaf*.
* **Volume Sheet:** Tampilan ringkas per divisi dengan input volume dua arah.
* **Harga Dasar Sheet:** Editor harga resource unik terkelompok per kategori Tenaga (A), Bahan (B), dan Alat (C).
* **RAB Sheet:** Compact & collapsible per divisi dengan pembakaran faktor *Overhead* yang transparan.
* **Rekapitulasi Sheet:** Distribusi biaya per divisi beserta bobot persentase porsi anggaran.
* **Analisa Sheet:** Rincian koefisien, harga dasar, dan subtotal per item pekerjaan AHSP.
* **BOQ Sheet (Bill of Quantities):** Rekapitulasi total kebutuhan material/tenaga/alat seluruh proyek.
* **Rencana Kerja Sheet:** Kalkulasi *Mandays* (OH), input *Jumlah Pekerja*, dan *Durasi (Hari)* yang tersinkronisasi ke SQLite.
* **Kurva S & Visual Timeline Sheet:** Visualisasi grafik S-Curve interaktif (akumulasi bobot biaya harian/mingguan) dari data Rencana Kerja.

### Modul 4: Reporting, Printing & Export Engine
* **Rust Native PDF Engine (`typst-rs`):**
  * Generator laporan PDF *lightning-fast* tanpa beban headless browser.
  * Halaman Cover Resmi, Logo Perusahaan, Header/Footer otomatis (`Halaman X dari Y`), dan Blok Tanda Tangan (*Approval Block*).
* **Standar Ukuran Kertas Indonesia:**
  * Support penuh untuk ukuran kertas **F4 / Folio (215 $\times$ 330 mm)**, A4, A3, dan Legal.
  * Mode *Fit to Page Width* agar tabel lebar tidak terpotong.
* **Live-Formula Excel Exporter (`rust_xlsxwriter`):**
  * Ekspor `.xlsx` dengan formula matematika hidup (`=SUM()`, `=B2*C2`), pembatasan border, penataan warna header, dan tab worksheet terpisah.
* **Export/Import Partial Branch (`.csee-branch`):**
  * Ekspor/impor cabang divisi tertentu untuk kolaborasi tim (Sipil, MEP, Arsitektur).

### Modul 5: Safety, Search & Team Collaboration
* **Engine Undo / Redo (`MPSC Command History`):**
  * *Stack history* di Rust Engine hingga 50 langkah untuk memutar balik perubahan cell, penambahan, atau penghapusan node.
* **Global Search, Filter & Replace (`Ctrl + F`):**
  * Pencarian cepat nama pekerjaan/kode WBS dan *bulk find & replace* nama/harga material di seluruh proyek.
* **Revision Baseline & Addendum Tracking:**
  * Fitur *Save Baseline* (Owner Estimate / HPS).
  * Komparasi *Baseline* vs *Penawaran* vs *Variance* (Selisih Biaya).
* **Auto-Save & WAL Checkpoint Safety:**
  * Penulisan otomatis ke SQLite WAL mode dan pembuatan berkas cadangan (`.bak`).

### Modul 6: System, Project Settings & Distribution
* **Project Settings Modal:** Pengaturan Nama Proyek, Nomor Kontrak, Nama Klien, PPN %, Overhead %, dan Profit %.
* **Dual Database Architecture:** Pemisahan `master_ahsp.db` (Pustaka Standar) dan `Proyek.csee` (File Kerja Proyek).
* **Desktop Shell & Status Bar:** Top TitleBar custom, RibbonBar, dan Status Bar dengan indikator real-time sync & total RAB.
* **Installer & Auto-Updater:** Bundler installer `.exe` / `.msi` via Tauri + otomatisasi pembaruan via GitHub Releases.

---

## 2. Pemetaan 32 Ikon SVG Ribbon Bar (`lucide-react`)

### Tab 1: Home / File (9 Ikon)
1. `file-plus` — **New Project**
2. `folder-open` — **Open Project**
3. `save` — **Save / Save As**
4. `undo` — **Undo Action**
5. `redo` — **Redo Action**
6. `scissors` — **Cut Selection**
7. `copy` — **Copy Selection**
8. `clipboard` — **Paste Selection**
9. `sliders` — **Project Settings**

### Tab 2: WBS Engine (9 Ikon)
10. `database-plus` — **Add Pekerjaan (AHSP)**
11. `plus-circle` — **Add Pekerjaan (Langsung)**
12. `trash-2` — **Delete / Batch Delete**
13. `indent-increase` — **Indent WBS Node**
14. `indent-decrease` — **Outdent WBS Node**
15. `chevrons-down` — **Expand All**
16. `chevrons-up` — **Collapse All**
17. `calculator` — **Volume Backing Sheet**
18. `search` — **Find & Replace (`Ctrl + F`)**

### Tab 3: AHSP & Reference (5 Ikon)
19. `book-open` — **Master AHSP Catalog**
20. `map-pin` — **Regional Price Index**
21. `pie-chart` — **Pareto 80/20 Cost Control**
22. `bookmark` — **Save Baseline (HPS)**
23. `git-compare` — **Compare Baseline vs Penawaran**

### Tab 4: Export & Report (5 Ikon)
24. `file-text` — **Export Laporan PDF**
25. `file-spreadsheet` — **Export Excel (.xlsx)**
26. `share-2` — **Export Branch (.csee-branch)**
27. `git-merge` — **Merge Branch**
28. `printer` — **Page Setup (F4/Folio/A4)**

### Tab 5: View & Window (4 Ikon)
29. `trending-up` — **Kurva S Visual**
30. `panel-left` — **Toggle Project Navigator**
31. `panel-right` — **Toggle Properties Inspector**
32. `settings` — **App Preferences**