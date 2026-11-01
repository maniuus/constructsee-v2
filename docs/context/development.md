---
id: constructsee-v2-development-context
type: note
as_of: 2026-10-31
status: current
confidence: high
---

# ConstrucSee v2 — Development Context

Catatan kerja untuk memahami struktur dan keputusan implementasi ConstrucSee v2. Dokumen ini fokus pada kondisi kode yang ada, bukan rencana produk panjang.

## 1. Stack & perintah

- Desktop: Tauri v2, Rust edition 2021, Tokio.
- Frontend: React 18, TypeScript, Vite 6, Tailwind CSS 3, Zustand 5.
- Tabel WBS: `@tanstack/react-virtual` (row virtualization, overscan 10, tinggi baris dinamis `min-h-[30px]` + dynamic measurement).
- Database: SQLite via `rusqlite`, WAL mode, `PRAGMA foreign_keys=ON`.
- Excel: import `calamine`, export `rust_xlsxwriter` dengan formula hidup.

Perintah dari root proyek:

```bash
npm run dev          # frontend browser + mock engine
npm run typecheck    # TypeScript
npm run build        # tsc + vite build
npm run tauri dev    # desktop + Rust engine
```

Database runtime ada di app data Tauri (`constructsee.db`). Saat pertama kali kosong, engine mengisi seed.

## 2. Peta folder

| Path | Isi |
| --- | --- |
| `src/components/shell` | TitleBar, RibbonBar, Workspace, StatusBar |
| `src/components/wbs` | WbsTable virtualized + cell editor |
| `src/components/navigator` | ProjectNavigator (tree divisi) |
| `src/components/inspector` | PropertiesInspector |
| `src/store/useWbsStore.ts` | State WBS, IPC orchestration, overhead |
| `src/lib/mockEngine.ts` | Engine tiruan untuk browser (tanpa Tauri) |
| `src/lib/tauriBridge.ts` | `safeInvoke` + error pipeline |
| `src/types/wbs.ts` | Tipe data yang sama dengan Rust |
| `src-tauri/src/engine` | Actor, model, kalkulasi, DB, seed |
| `src-tauri/src/excel` | Importer dan exporter |
| `src-tauri/src/commands.rs` | Tauri command boundary |

## 3. Alur data

```
React (Zustand) -> safeInvoke -> Tauri command -> EngineHandle (mpsc)
   -> EngineState (HashMap WbsNode)
   -> kalkulasi rollup
   -> SQLite WAL
   -> AffectedPatch / EngineSnapshot -> Zustand -> UI
```

- Browser tanpa Tauri memakai `mockInvoke`; perilakunya sengaja menyerupai engine Rust.
- Semua error IPC masuk ke `useErrorStore` dan tampil lewat `ErrorPopup`.
- `updateCell` mengirim delta `{ item_id, field, new_value }`; engine mengembalikan node yang terpengaruh + total biaya baru.

## 4. Model WBS dan komponen AHSP

`WbsNode` memakai `snake_case` agar identik antara Rust dan TypeScript:

```ts
interface WbsNode {
  id: string;
  parent_id: string | null;
  children_ids: string[];
  code: string;
  name: string;
  unit: string;
  volume: number;
  unit_price: number;
  total_price: number;
  is_expanded: boolean;
  method: PriceMethod;
  components: {
    bahan: ComponentCost;
    tenaga: ComponentCost;
    alat: ComponentCost;
  };
}

type PriceMethod = "ahsp" | "langsung";

interface ComponentCost {
  coefficient: number;
  base_price: number;
  subtotal: number;
  items: ComponentItem[];
}

interface ComponentItem {
  name: string;
  unit: string;
  coefficient: number;
  base_price: number;
  subtotal: number;
}
```

Aturan kalkulasi leaf:

```
item subtotal      = item.coefficient * item.base_price
komponen subtotal  = Σ item subtotal
komponen base_price = komponen subtotal / Σ koefisien item
unit_price         = subtotal tenaga + bahan + alat
total_price        = volume * unit_price
```

Tiap komponen memiliki daftar `items` (resource AHSP: nama, satuan, koefisien, harga dasar). `subtotal` komponen selalu sama dengan jumlah `subtotal` item-nya.

Aturan parent: `total_price` adalah jumlah `total_price` seluruh child; komponen parent tidak dipakai dan ditampilkan `—` di tabel.

Komponen **tidak lagi** disimpan sebagai JSON blob. Sejak refactor §1, persistence ternormalisasi: tabel `wbs_nodes` tetap menyimpan kolom `components` (kini selalu ditulis `'{}'`) dan `method`, sedangkan tiap resource item hidup di tabel **`node_resource_items`** (`node_id`, `category` ∈ tenaga/bahan/alat, `ord`, `name`, `unit`, `coefficient`, `base_price`, `subtotal` = kolom `GENERATED ALWAYS AS (coefficient*base_price) VIRTUAL`, PK `(node_id,category,ord)`, FK `ON DELETE CASCADE`). Skema didefinisikan inline di `db.rs::open` (`SCHEMA` const + `ALTER TABLE` untuk kolom lama).

Saat `load`, `db.rs` menyusun ulang `WbsComponents` dari baris `node_resource_items` (`ComponentCost::from_items`). Migrasi satu kali: bila tabel items kosong padahal node punya komponen, isi di-*sync* ke tabel items. `upsert_many`/`replace_all` menulis ulang items tiap node (`sync_items`), `delete_ids` menghapus items + work plan (cascade). Database lama yang masih berisi JSON `components` tetap dibuka: baris leaf dengan total komponen ~0 diregenerasi dari `unit_price`, baris dengan subtotal di-*backfill* `WbsComponents::backfill_items()`. Frontend juga menjalankan `backfillComponentItems()` di `ingest` store untuk runtime yang belum di-rebuild.


### 4.1 Distribusi komponen saat ini

Selama belum ada data resource AHSP nyata per baris, komponen leaf diturunkan dari `unit_price` dengan porsi biaya **fallback** 70% bahan / 30% tenaga (tanpa alat) di `WbsComponents::from_unit_price` / `componentsFromPrice`. Porsi tiap komponen lalu dipecah ke item resource placeholder dengan bobot tetap:

| Komponen | Item | Satuan | Koefisien | Bobot biaya |
| --- | --- | --- | ---: | ---: |
| Bahan | Material Utama | ls | 0.70 | 72% |
| Bahan | Material Pendukung | ls | 0.30 | 28% |
| Tenaga | Pekerja | OH | 0.20 | 45% |
| Tenaga | Tukang | OH | 0.10 | 33% |
| Tenaga | Kepala Tukang | OH | 0.03 | 12% |
| Tenaga | Mandor | OH | 0.02 | 10% |
| Alat | Alat Berat | jam | 0.12 | 70% |
| Alat | Alat Bantu | jam | 0.06 | 30% |

Template didefinisikan di `src-tauri/src/engine/models.rs` (`TENAGA_ITEMS`, `BAHAN_ITEMS`, `ALAT_ITEMS`) dan dicerminkan di `src/lib/mockEngine.ts` (`ITEM_TEMPLATES`). `base_price` tiap item dihitung agar `koefisien * harga dasar` sama dengan porsi biaya item tersebut. Konstanta `ALAT_ITEMS` hanya dipakai oleh `backfill_items()` (untuk baris lama yang sudah punya subtotal alat); jalur fallback `from_unit_price` tidak lagi mengisi alat. Ini placeholder yang konsisten secara matematis, bukan data AHSP nyata.

Saat `unit_price` diedit langsung, seluruh komponen dan item di-rebalance proporsional (koefisien tetap, base price diskalakan) agar jumlah subtotal selalu sama dengan harga satuan baru.

### 4.2 Metode harga (AHSP/SNI vs langsung)

Setiap leaf punya field `method` (`PriceMethod`) yang menentukan bagaimana `unit_price` diperlakukan:

- **`langsung`** (default): `unit_price` adalah data **input** yang bisa diedit pengguna. Saat diedit, komponen dan item di-rebalance proporsional (lihat §4.1).
- **`ahsp`**: `unit_price` adalah data **kalkulasi**, selalu sama dengan `components.total()`, dan tidak bisa diedit langsung dari tabel (read-only). Upaya edit `unit_price` ditolak engine lewat guard di `actor.rs::update_cell` dengan pesan "Harga Satuan Pekerjaan dihitung otomatis pada metode SNI/AHSP".

Field disimpan di kolom `method` pada tabel `wbs_nodes` (default `'langsung'`, ditambahkan lewat `ALTER TABLE`). Konstanta `METHOD_AHSP`/`METHOD_LANGSUNG` ada di `models.rs`; tipe `PriceMethod` di `src/types/wbs.ts`. Perubahan metode lewat command `set_price_method` (Tauri) / `setMethod` (store + `mockEngine`), leaf-only. Import saat ini selalu menghasilkan `method: "langsung"` (import database SNI belum ada).

### 4.3 Harga item dua arah (set_item_price)

Command `set_item_price { name, unit, base_price }` (Tauri `commands.rs` → `actor.rs::EngineState::set_item_price`; mirror `mockEngine.ts::setItemPrice` + `useWbsStore.setItemPrice`) menimpa harga item untuk **semua** kemunculan dengan `name`+`unit` yang sama di seluruh leaf. Untuk tiap item yang cocok: `base_price = v`, `subtotal = coefficient × v`; lalu komponen dihitung ulang (`coefficient = Σ koef item`, `subtotal = Σ subtotal item`, `base_price = subtotal/coefficient`); `unit_price = components.total()` dan `total_price = volume × unit_price`, lalu rollup parent. Guard: harga non-finite/negatif ditolak; jika tak ada item cocok → error "Item {name} ({unit}) tidak ditemukan". Karena harga per item di data aktual bisa berbeda antar leaf (diturunkan dari share komponen), menimpa satu harga membuat item tsb seragam di semua baris dan HSP tiap baris dihitung ulang (bisa naik/turun) — sesuai keputusan "item jadi sumber kebenaran, timpa HSP".

## 5. Tabel WBS

Kolom saat ini:

1. Kode
2. Uraian Pekerjaan
3. Sat
4. Metode
5. Volume
6. Koef
7. Harga Dasar
8. Tenaga Kerja — Harga Satuan (A)
9. Bahan — Harga Satuan (B)
10. Alat — Harga Satuan (C)
11. Harga Satuan Pekerjaan (A+B+C)
12. BOQ
13. Tenaga Kerja — Subtotal Biaya (A)
14. Bahan — Subtotal Biaya (B)
15. Alat — Subtotal Biaya (C)
16. Total Biaya

Di atas baris header ada **baris band kategori data** (mengikuti `GRID` yang sama) yang menandai zona kolom sesuai spesifikasi teknis: **Input** (identitas + `Volume`), **Referensi AHSP** (`Koef`, `Harga Dasar`), **Kalkulasi** (`Harga Satuan A/B/C`, `Harga Satuan Pekerjaan`, `BOQ`, `Subtotal Biaya A/B/C`, `Total Biaya`), dengan `Metode` dan segmen setelah `Harga Satuan Pekerjaan` ditandai ulang **Input**/**Kalkulasi** sesuai mode.

Kolom `Metode` berisi tombol dua segmen **SNI/AHSP** vs **LS** (langsung) per leaf; baris parent diisi `—`. Kolom `Koef` dan `Harga Dasar` adalah kolom baris (diisi pada baris item saja; baris analisa/node diisi `—`). Urutan grup komponen dari kiri ke kanan: Tenaga Kerja (A), Bahan (B), Alat (C). Tiap grup punya satu kolom `Harga Satuan` berisi subtotal per satuan (`component.subtotal` untuk baris node/analisa, `item.subtotal` untuk baris item). Jumlah ketiga kolom komponen = `Harga Satuan Pekerjaan (A+B+C)` (`node.unit_price`). Kolom `Harga Satuan Pekerjaan` bersifat **mode-aware**: leaf dengan metode `langsung` memakai sel input `NumberCell`, sedangkan leaf metode `ahsp` menampilkan nilai read-only. Header kini satu baris: tiap sel komponen menumpuk dua baris — `Harga Satuan (A/B/C)` di atas dan nama komponen (Tenaga Kerja/Bahan/Alat) di bawahnya; semua label rata tengah (`text-center`). Kolom `BOQ` (di kanan `Harga Satuan Pekerjaan`, sebelum `Total Biaya`) berisi `volume × koefisien` pada baris item (`volume × item.coefficient`); baris analisa (jenis komponen) dan node diisi `—`. Kolom `Subtotal Biaya (A/B/C)` (di kanan `BOQ`, sebelum `Total Biaya`) berisi `volume × subtotal`: baris node leaf = `volume × component.subtotal` (ketiga kolom terisi), baris analisa = `volume × component.subtotal` (kolom miliknya saja), baris item = `volume × item.subtotal` (kolom miliknya saja); baris parent diisi `—`.

**Overhead dibakar ke kolom komponen (display-only).** Faktor `overheadFactor = 1 + overhead/100` (persen dari store, default 10) diterapkan pada **nilai komponen** di kolom `Harga Satuan (A/B/C)` dan `Subtotal Biaya (A/B/C)` untuk baris **node leaf** dan **analisa (jenis komponen)**; baris **item komponen tidak** dikali (tetap nilai dasar). Akibatnya jumlah `Harga Satuan (A/B/C)` = `Harga Satuan Pekerjaan`, dan jumlah `Subtotal Biaya (A/B/C)` = `Total Biaya` (keduanya sudah termasuk overhead). `Total Biaya` baris node = `node.total_price × overheadFactor`; sel `unit_price` LS tetap menampilkan `unit_price × overheadFactor` dan menulis balik `nilai_diketik / overheadFactor`. Nilai `unit_price`/`total_price` yang tersimpan di engine **tidak** berubah (overhead murni tampilan).

Format angka (`src/lib/format.ts`): kolom `Koef` memakai `formatKoef` (tetap 4 desimal, mis. `0,3500`); kolom uang (`Harga Dasar`, `Harga Satuan (A/B/C)`, `Subtotal Biaya (A/B/C)`, `Harga Satuan Pekerjaan`, `Total Biaya`) memakai `formatIDR` (tetap 2 desimal, mis. `Rp 3.038,00`); sel input `unit_price` memakai `formatMoney` (2 desimal tanpa simbol). Kolom kuantitas `Volume` dan `BOQ` memakai `formatNumber` (maks 2 desimal, nol akhir dipotong).

Header adalah satu baris (label komponen ditumpuk di dalam sel), dengan baris band kategori di atasnya. Grid memakai `min-w-[1748px]` (kolom **Kode** 76px, kolom **Uraian Pekerjaan** `minmax(320px,1fr)`) dan horizontal scroll di wrapper luar; header dan body bergerak bersama secara horizontal, sementara body punya scroll vertikal sendiri. Nama pada kolom **Uraian Pekerjaan** **tidak dipotong** — teks boleh membungkus ke beberapa baris (`whitespace-normal break-words`), sehingga tinggi baris bersifat dinamis: baris memakai `min-h-[30px]` dan virtualizer (`@tanstack/react-virtual`) memakai **dynamic measurement** (`ref={virtualizer.measureElement}` + `data-index`, `getItemKey` dari `row.key`) agar tinggi terukur per baris.

Navigasi keyboard saat ini hanya untuk kolom editable `volume` dan `unit_price` (yang terakhir hanya pada leaf metode `langsung`):
`Tab`, `Shift+Tab`, `Enter`, `ArrowUp`, `ArrowDown`, `Escape`. Parent row dilewati saat navigasi vertikal.

### 5.1 Baris analisa komponen dan item (expand leaf)

Leaf item bisa di-expand untuk menampilkan komponen dasarnya (Tenaga Kerja, Bahan, Alat) beserta item resource tiap komponen. Implementasi:

- Flag `is_expanded` pada `WbsNode` dipakai ulang untuk leaf; engine `toggle_expand` sudah menerima node apa pun, dan `useWbsStore.toggleExpand` tidak lagi memblokir leaf.
- `src/lib/tree.ts` mengekspor `ANALYSIS_ORDER` (`["tenaga", "bahan", "alat"]`), `hasAnalysis()`, dan `flattenTree()`. Saat leaf `is_expanded === true`, untuk tiap komponen disisipkan satu baris `kind: "analysis"` (grup komponen) lalu satu baris `kind: "item"` per resource item. `DisplayRow` punya `key`, `kind`, `componentKind?`, dan `item?`.
- Di tabel, baris analisa menampilkan bar warna vertikal + label komponen + penanda `komponen dasar`; baris item menampilkan nama resource. Keduanya punya **guide-lines hierarki**: span tipis `border-l border-line/50` per level (`row.depth - 2` span). Hanya kolom `Harga Satuan` dan `Subtotal Biaya` grup komponen terkait yang terisi; grup lain `—`. Kolom `Koef`/`Harga Dasar` terisi pada baris item saja (per resource); baris analisa/node `—`. `Total Biaya` baris anak = `volume * subtotal`.
- Baris analisa dan item bukan target seleksi/navigasi keyboard; `nearestLeaf()` dan `focusCell()` melewatinya (hanya `kind === "node"`).
- Seed: leaf default `is_expanded: false` di Rust (`seed.rs`) dan mock (`mockEngine.ts`) agar tabel tidak langsung panjang.

### 5.2 Footer rekapitulasi (Grand Total, PPN)

Di bawah baris data, di **dalam** kontainer scroll vertikal, ada blok rekapitulasi 3 baris (memakai `GRID` yang sama; sel label `style={{ gridColumn: "span 15" }}`, nilai di kolom terakhir `Total Biaya`):

1. `Grand Total` — `totalCost` dari engine (sudah **termasuk** overhead, karena `calc::total_cost` mengalikan base dengan `1 + overhead/100`).
2. `PPN` — persen **input user** (`PercentInput`, default 11); nilainya `grandTotal * ppn/100`.
3. `Jumlah Grand Total + PPN` — `grandTotal + ppnValue`.

Baris `Overhead` terpisah di footer **sudah dihapus** (overhead kini dibakar ke nilai komponen & Total Biaya di tabel). Label dirata-kanan (rata dengan kolom nilai). Wrapper `sticky bottom-0 z-10`: saat daftar pendek footer menempel langsung di bawah baris data terakhir (in-flow), saat daftar overflow footer "freeze" menempel di dasar viewport scroll. `ppn`/`setPpn` ada di Zustand (belum masuk engine/DB).

Sheet **RAB**, **Rekapitulasi**, dan **BOQ** kini transparan terhadap overhead: footernya 3 baris — `Subtotal (RAB/BOQ)` = Σ nilai leaf **sebelum overhead**, `Overhead (n%)` (baris disembunyikan saat 0%, dari `grandTotal × overhead/100`), lalu `Grand Total (incl. Overhead)` = `totalCost` engine — sehingga angkanya **konsisten** dengan StatusBar dan inspector. Sheet **Rekapitulasi** juga menampilkan kolom **Porsi** sebagai progress bar mini (`h-1.5 w-16` track + fill `bg-accent2/70` + persen).

**Pola grid kalkir** (`.calcir-grid`, `styles.css`: garis 24px via linear-gradient): dipakai di body scroll SheetShell (konten dibungkus `bg-shell` sehingga pola hanya terlihat di **area kosong di bawah tabel**) dan pada empty-state WbsTable.

## 6. Komponen biaya & inspector

PropertiesInspector menampilkan rekapitulasi biaya komponen dari data nyata (urutan Tenaga, Bahan, Alat):

- Leaf: `subtotal komponen * volume`.
- Parent: agregasi seluruh leaf di bawahnya lewat `componentTotals()` di `src/lib/tree.ts`.

Sejak refactor §4a, **overhead** adalah **single source of truth di engine**: `overhead_percent` ada di `EngineState` (dimuat dari `project_meta` key `overhead`, default 10) dan disertakan di `EngineSnapshot`. `calc::total_cost(nodes, roots, overhead_percent)` mengembalikan `base × (1 + overhead/100)`, sehingga `totalCost` dari engine sudah termasuk overhead. **Grand Total** di inspector, StatusBar, dan footer tabel semuanya cukup `= totalCost` (nilainya konsisten). Overhead diubah lewat command `set_overhead { percent }` → store `setOverhead` (optimistic + invoke + ingest ulang snapshot). Inspector menampilkan **breakdown** Subtotal (= `totalCost ÷ (1 + overhead/100)`) → `Overhead (n%)` → `Grand Total = totalCost`; **field Profit dihapus seluruhnya** (inspector, Ribbon tombol "Profit", store `profit`/`setProfit`) karena sudah tercakup overhead. Angka Total di StatusBar memakai `text-ink` (bukan aksen hijau).

Panel inspector bisa di-**collapse/expand**: tombol `›` di header menyembunyikan panel (menjadi strip vertikal `w-8` berisi tombol `‹` + label `[writing-mode:vertical-rl]`); state ada di `Workspace.tsx` (`rightCollapsed`). Separator drag juga disembunyikan saat collapsed. Shortcut:** `Ctrl+]` toggle inspector, `Ctrl+[` toggle Project Navigator (keydown listener di `Workspace.tsx`).

## 7. Import / export

- Import: `calamine`, deteksi layout gabungan (A = kode+uraian, B = volume, C = harga) atau layout terpisah. Sejak refactor §3, **merged range asli dibaca** (`merge_cells_by_sheet_name` untuk `Sheets::Xlsx`/`Xls`) — nilai sel kiri-atas merge direplikasi ke seluruh sel gabungan (`merged_fill`), sehingga kode/uraian yang di-merge tetap terisi tanpa mengandalkan forward-fill saja.
- Setiap baris import membentuk `components` dari `unit_price` memakai distribusi fallback 70/30 (bahan/tenaga, tanpa alat) dan template item placeholder.
- Export: sheet `RAB`, kolom A uraian, B volume, C harga satuan, D formula total, E satuan. Belum mengekspor kolom komponen.
- Import/export hanya aktif di runtime Tauri; di browser akan memunculkan error desktop-only.

## 8. Batasan yang diketahui

- Komponen dan item resource tidak punya UI edit langsung; harga item diubah lewat sheet **Harga Dasar** (`set_item_price`, menimpa semua kemunculan nama+satuan) dan volume lewat sheet **Volume**.
- Item resource masih placeholder (nama/satuan/koefisien tetap per jenis), belum dari resource AHSP nyata per pekerjaan.
- Import sudah membaca merged range asli (§7) tetapi belum memetakan kolom/item komponen ke tabel resource.
- Import Excel tidak memetakan kolom/item komponen dan default `method: "langsung"`. Katalog AHSP (bundled `public/data/ahsp.json`) hanya dipakai oleh dialog **Tambah Pekerjaan** (lihat §11).
- Export belum menulis koefisien/harga dasar/subtotal komponen.
- Sheet RAB/Rekapitulasi/Analisa/BOQ murni tampilan (turunan dari store); sheet Volume & Harga Dasar edibel (dua arah). Input jumlah pekerja/durasi di **Rencana Kerja** kini **dipersistensi** (tabel `work_plans` + command `get_work_plans`/`set_work_plan`).
- Sheet **Full** dan semua sheet turunan hanya menampilkan divisi yang punya item pekerjaan; divisi kosong tetap ada di WBS/Project Navigator. Navigator selalu menampilkan 10 divisi SNI/AHSP.
- Resource hasil tambah dari katalog AHSP tanpa harga dasar tampil sebagai "Belum diisi" di sheet Harga Dasar & BOQ.
- Beberapa tombol Ribbon masih disabled (fase berikutnya) — **tombol Undo/Redo sudah terintegrasi di Home tab**.
- Belum ada test otomatis.

## 12. Fase 1 Selesai

Roadmap Fase 1 (Undo/Redo engine MPSC + WAL pragma + exit checkpoint + useGridNavigation) selesai dan diverifikasi:
- **Rust**: 11 cargo tests passing, clippy clean, cargo check OK, typecheck + build PASS. ReversibleCommand enum + CommandHistory ring buffer (capacity 100) dengan undo/redo untuk update_cell, set_item_price, set_overhead, add_node, remove_node/removeNodes, import clear. EngineState ingest() memetakan `can_undo`/`can_redo` → store `canUndo`/`canRedo`. markMutated spread pada 5 patch-based setState returns. db.rs menambah `PRAGMA wal_autocheckpoint=1000` setelah `journal_mode=WAL` + `synchronous NORMAL`; `RunEvent::ExitRequested` memicu checkpoint pada keluar.
- **Frontend**: types/wbs.ts menambah `can_undo`/`can_redo` ke EngineSnapshot; store/useWbsStore.ts menambah `canUndo`/`canRedo` + `undo()`/`redo()` actions; mockEngine.ts meniru history stack (record/update pada updateCell/setItemPrice/addNode/removeNode/removeNodesBatch/setOverhead, clear pada import). RibbonBar menambah tombol Undo/Redo di Home tab (disabled berdasarkan canUndo/canRedo). **useGridNavigation** (baru di `src/hooks/useGridNavigation.ts`) mengatur navigasi 2D: ArrowUp/Down pindah baris via nearestLeaf, ArrowLeft/Right berganti field volume↔unit_price dalam baris yang sama, Tab/Shift+Tab berganti field, Enter/F2 fokus sel editing, Escape batal edit; terintegrasi ke WbsTable lewat `navigate()` + `focusCell()`. **Workspace.tsx** menambah shortcut **Ctrl+Z** (undo) / **Ctrl+Y atau Ctrl+Shift+Z** (redo), dengan guard saat focus berada di input/textarea agar native undo tekstur tetap aktif.

Semua item Fase 1 selesai dan diverifikasi.

## 9. Titik perubahan saat menambah kolom baru

1. `src/types/wbs.ts` — tipe data.
2. `src/components/wbs/WbsTable.tsx` — `GRID`, header, dan cell.
3. `src-tauri/src/engine/models.rs` — struct + kalkulasi.
4. `src-tauri/src/engine/db.rs` — kolom SQLite, select, insert/upsert, migrasi.
5. `src/lib/mockEngine.ts` — perilaku browser.
6. `src/components/inspector/PropertiesInspector.tsx` — ringkasan.
7. `src-tauri/src/excel/importer.rs` dan `exporter.rs` — bila kolom ikut Excel.

Selalu jalankan `npm run typecheck` dan `cargo check` setelah perubahan model.

## 10. Sheet tampilan (navigasi)

Area tengah workspace menampung beberapa **sheet** yang murni tampilan (data sama, hanya sudut pandang berbeda). Tab sheet ada di **bawah** (gaya Excel). Komponen: `src/components/sheets/Sheets.tsx` (host + state `active` + tab bar) dan `SheetViews.tsx` (isi tiap sheet). Derivation ada di `src/lib/sheets.ts` (`collectLeaves`, `collectUniqueItems`, `tenagaMandays`, `COMPONENT_META`).

Tabel AHSP lama tetap dipakai sebagai sheet pertama. Daftar sheet:

1. **Full** — `<WbsTable/>` (tabel utama + footer rekapitulasi; tab ini bernama "Full").
2. **Volume** — compact & collapsible per divisi (pola sama dengan RAB): kolom `Kode` paling kiri, lalu AHSP, Satuan, Volume; tiap divisi jadi baris header dapat-diklik (`▸`/`▾` + kode + nama + jumlah item, **default terbuka**; state `collapsed` `Set` lokal — user bisa menutup grup manual). Sel **Volume edibel** (input dua arah → `updateCell(id, "volume", v)`).
3. **Harga Dasar** — harga dasar **unik** (agregasi item komponen berdasarkan **nama + satuan**), **dikelompokkan per jenis komponen urut A/B/C** (Tenaga Kerja, Bahan, Alat — masing-masing baris header dapat-diklik `▸`/`▾`, **default terbuka**; header menampilkan label, kode huruf, jumlah item, dan jumlah "belum diisi"). Kolom Nama/Satuan/Harga Dasar/Status. Sel **Harga Dasar edibel** → `setItemPrice(name, unit, v)`: menimpa harga item di **semua kemunculan** (nama+satuan) di seluruh baris, lalu komponen & HSP baris terkait dihitung ulang. Resource dengan `base_price <= 0` (mis. hasil tambah dari katalog AHSP) diberi chip merah **"Belum diisi"**; header menampilkan jumlah harga yang belum diisi.
4. **RAB** — compact & collapsible per divisi. Kolom `Kode` paling kiri, lalu Uraian Pekerjaan, Volume, Satuan, Harga Satuan, Total Biaya. Tiap divisi jadi baris header (`▸`/`▾` + kode + nama divisi + subtotal divisi) yang bisa diklik; **default terbuka** (state `collapsed` `Set` lokal), baris leaf muncul saat dibuka. Footer 3 baris: Subtotal RAB / Overhead (n%) / Grand Total (incl. Overhead).
5. **Rekapitulasi** — rekap biaya per divisi: Divisi, Total Biaya, **Porsi** (persen + progress bar mini), plus footer 3 baris: Subtotal RAB / Overhead (n%) / Grand Total (incl. Overhead). Dihitung dari `collectLeaves` (agregasi `node.total_price` per divisi).
6. **Analisa** — tiap AHSP terpakai ditampilkan sebagai blok: baris header (kode, uraian, HSP), baris komponen (A/B/C) dengan subtotal, lalu baris item (nama, satuan, koef, harga dasar, subtotal).
7. **BOQ** — daftar unik yang sama seperti Harga Dasar, **dikelompokkan per jenis komponen urut A/B/C** (baris header dapat-diklik `▸`/`▾`, **default terbuka**; header menampilkan subtotal grup). Kolom Nama/Satuan/Harga Dasar/Kebutuhan/`Σ volume × item.coefficient` dan Jumlah (`Σ volume × item.subtotal`), footer 3 baris: Subtotal BOQ / Overhead (n%) / Grand Total (incl. Overhead). Harga `<= 0` juga diberi chip **"Belum diisi"**.
8. **Rencana Kerja** — tiap AHSP dengan Volume, Mandays tenaga (`volume × components.tenaga.coefficient`, satuan OH), lalu dua input dua arah: isi **Jumlah Pekerja** → Durasi = mandays ÷ pekerja; isi **Durasi** → Jumlah Pekerja = mandays ÷ durasi. Input kini punya affordance simpan (`border-line` + `hover:border-accent/50` + `transition-colors`).

Selebihnya read-only, kecuali input dua arah: (a) tabel **Full/AHSP** (Volume/HSP/Metode seperti biasa), (b) **Volume** (edit volume tiap item), (c) **Harga Dasar** (edit harga item unik → menimpa semua kemunculan), dan (d) **Rencana Kerja** (jumlah pekerja/durasi, kini dipersistensi ke tabel `work_plans` lewat store `workPlans`/`setWorkPlan`).

Semua sheet turunan dibangun dari `collectLeaves`; divisi tanpa anak (hasil hapus seluruh pekerjaannya) otomatis dilewati sehingga tidak muncul di sheet mana pun.

## 11. Katalog AHSP & tambah/hapus pekerjaan

Katalog AHSP dibundel di `public/data/ahsp.json` (disajikan Vite di `/data/ahsp.json`, ikut ter-bundle di build Tauri). Parser: `src/lib/ahsp.ts` (`loadAhspCatalog` memoized + `searchLeaves`, `suggestWbsDivision`, `buildPriceLookup`, `buildComponents`, `ahspLeafToNode`).

- **Tambah Pekerjaan (Dari AHSP)** — dialog `AddPekerjaanDialog` di `src/components/ahsp/Dialogs.tsx`. Ada **filter per divisi + subdivisi**: dropdown `Divisi` (Semua + 10 divisi katalog) memfilter leaf ke divisi tersebut (semua subdivisinya sampai sequence), lalu dropdown `Sub` (Semua + subdivisi level-2 dari divisi terpilih) memfilter lebih dalam ke subtree subdivisi itu (`subdivisionsOf` + `subtreeCodes` di `src/lib/ahsp.ts`, dicocokkan lewat kode hierarkis). Pencarian teks (kode/nama) bekerja di atas filter. Alur **bulk + checklist**: cari leaf katalog (kode/nama), **centang** beberapa pekerjaan — setiap centang langsung masuk **keranjang** (default volume 1, divisi otomatis). Panel bawah = keranjang: tiap baris menampilkan kode/nama/satuan/divisi dengan **volume yang bisa diubah** dan tombol hapus; tombol **Tambahkan Semua (n)** menambahkan seluruh isi keranjang sekaligus (id unik `ahsp-<itemId>` + suffix bila bentrok). Klik badan baris (bukan centang) menampilkan rincian komponen (Tenaga/Bahan/Alat + koef/harga dasar/subtotal; harga `<= 0` ditandai "belum diisi") **tanpa** mengubah keranjang. **Divisi tujuan otomatis** mengikuti divisi AHSP item (`resolveDivisionId`: `divisionId` → index → kode divisi SNI, fallback `suggestWbsDivision`); tidak ada dropdown divisi. Node dibuat oleh `ahspLeafToNode` (id `ahsp-<itemId>`, `method: "ahsp"`, `unit_price` = total komponen) dan dikirim ke store `addNode(parentId, node)` per item, sehingga langsung terkelompok ke divisinya.
- **Tambah Pekerjaan (Langsung)** — dialog `AddDirectDialog`: isi Uraian Pekerjaan, Satuan, Volume, Harga Satuan, dan Divisi tujuan (dropdown). Node dibuat dengan `method: "langsung"` dan komponen kosong; engine/mock mengisi komponen dari harga satuan (`from_unit_price`/`componentsFromPrice`, distribusi fallback 70/30 bahan/tenaga tanpa alat) saat `components.total() <= 0 && unit_price > 0`.
- Tiga pintu masuk: tombol **AHSP** & **Langsung** di tab ribbon **AHSP & Reference**, dan **klik kanan** pada baris tabel WBS maupun baris **Project Navigator** → submenu **Tambah Pekerjaan ▸** berisi **Dari AHSP** / **Langsung**.
- **Hapus Pekerjaan (satuan)** — hanya baris leaf; klik kanan → "Hapus Pekerjaan" (disabled untuk non-leaf) → dialog konfirmasi → store `removeNode(itemId)`. Divisi induk tidak dihapus; divisi yang jadi kosong tinggal tersembunyi dari sheet turunan.
- **Hapus Pekerjaan (bulk, mode pilih)** — tombol **Pilih** di header tabel WBS mengaktifkan **mode pilih**: setiap baris leaf menampilkan kotak centang di kolom Kode (baris non-leaf tanpa centang). Header saat mode aktif menampilkan `n dipilih`, tombol **Kosongkan**, **Hapus Terpilih (n)** (disabled bila kosong), dan **Selesai**. Hapus Terpilih membuka dialog konfirmasi (satu pesan ringkas + daftar pekerjaan bila lebih dari satu) → store `removeNodes(ids)` yang memanggil **satu** command `remove_nodes_batch { ids }` (§5) dan menerapkan patch gabungan. Pilihan yang sudah terhapus otomatis dibersihkan dari state (efek pruning di `WbsTable`).
- State dialog di `src/store/useUiStore.ts` (`addOpen`, `addDirectOpen`, `removeTargetIds`, `openAdd`, `closeAdd`, `openAddDirect`, `closeAddDirect`, `askRemove`, `askRemoveMany`, `cancelRemove`, plus mode pilih `bulkMode`/`bulkSelection`/`toggleBulkMode`/`toggleBulkSelect`/`setBulkSelection`); `DialogHost` dirender di `Workspace.tsx`.
- Engine: perintah `add_node` / `remove_node` / `remove_nodes_batch` (`src-tauri/src/engine/actor.rs`, `commands.rs`, `lib.rs`) + `db::delete_ids` / `db::save_roots`; mirror di `mockEngine.ts` (`addNode`/`removeNode`/`removeNodesBatch`). Hapus bulk memakai **satu** command `remove_nodes_batch` (§5). Sama seperti fitur lain, perubahan Rust butuh rebuild+restart Tauri; build browser (mock) langsung berlaku.
- **Divisi (10 SNI/AHSP)** — konstanten `src/lib/divisions.ts` (`SNI_DIVISIONS`, kode I..X = 10 divisi katalog AHSP). Seed (`seed.rs` + `mockEngine.buildSeed`) memakai daftar ini (item demo di divisi I, II, III, V). Saat `load`, store **memastikan** kesepuluh divisi ada sebagai root (top-up berdasar nama; non-fatal bila `add_node` belum ada) sehingga database lama pun ikut lengkap.
- **Navigator vs workspace** — **Project Navigator** menampilkan **semua** divisi (termasuk yang kosong). **Workspace** (sheet Full + sheet turunan) hanya menampilkan divisi yang punya pekerjaan: WbsTable menyaring root `children_ids.length > 0`, sedangkan sheet turunan lewat guard `collectLeaves` (divisi tanpa anak dilewati).
- **Urutan otomatis** — `src/lib/order.ts` (`compareCode`, `orderRoots`, `orderChildren`): divisi diurutkan sesuai urutan `SNI_DIVISIONS`, anak diurutkan natural berdasar `code` (mis. `1.1`, `1.2`, `1.10`). Dipakai di `flattenTree` (tabel Full), `collectLeaves` (sheet turunan), dan ProjectNavigator.

## 13. Fase 2: Reporting & PDF Export

Roadmap Fase 2 (Reporting & PDF Engine) sebagian besar telah diimplementasi:

- **Rust**: `typst = "0.11"` + `typst-pdf = "0.11"` ditambahkan ke `Cargo.toml` (compile OK). Baru modul `src-tauri/src/reports/`:
  - `templates.rs` — template typst RAB sesuai `professional_presentation_standards.md`: kertas F4 215×330mm, margin 25/20/20/15mm, Liberation Sans, running header/footer dengan nomor halaman, tabel dengan header berulang, footer Subtotal/Overhead(10%)/Total Sebelum PPN/PPN(11%)/GRAND TOTAL (Rp), blok persetujuan 3 kolom (unbreakable), format angka Indonesia (titik ribuan, koma desimal).
  - `pdf.rs` — World implementasi (fontdb system fonts, `Library::default()`, `Source::detached()`), `render_rab_pdf()` via `typst::compile()` + `typst_pdf::pdf()`, 1 unit test (render roundtrip).
- **Command**: `EngineCommand::ExportPdf` di `actor.rs`, `export_pdf` Tauri command di `commands.rs`, terdaftar di `lib.rs` invoke_handler.
- **Excel exporter**: `exporter.rs` ditambah `Format` dengan `set_num_format` mata uang Indonesia (`_(* #,##0.00_);...`), diterapkan pada sel volume/HSP/total dan formula.
- **Frontend**: `exportPdf()` action di `useWbsStore` (save dialog default `RAB-ConstrucSee.pdf`, filter PDF), tombol **PDF** di RibbonBar tab "Excel & Export", mockEngine case `export_pdf` (throw error di browser).
- Sisa Fase 2: typst-pdf crate fetching saat pertama build (sudah di-cache), template AHSP/BOQ/Analisa belum dibuat (hanya RAB), nomor halaman `#counter(page)` sudah berfungsi.
