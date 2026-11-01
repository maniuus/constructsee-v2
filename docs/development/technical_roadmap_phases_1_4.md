# Technical Architecture & Implementation Blueprint: Phases 1 to 4

Dokumen ini memuat arahan teknis, rancangan arsitektur, dan *best practices* industri untuk pengembangan tingkat lanjut **ConstrucSee v2** dari **Fase 1 hingga Fase 4**.

---

## 1. Fase 1: Keyboard Ergonomics, State Safety & Undo/Redo Engine

### 1.1 MPSC Engine Undo/Redo Architecture (Rust Level)

Untuk menjamin performa tingkatan *enterprise* tanpa membebankan *memory footprint* di frontend, *State History* **wajib** ditangani penuh secara *lock-free* di dalam Rust Engine (bukan di Zustand).

```
[ User Action / Hotkey ] 
       |
  (Tauri IPC) -> safeInvoke("undo" / "redo" / "execute_command")
       |
       v
[ Tokio MPSC Receiver Engine ]
  |-- CommandHistory (Ring Buffer / VecDeque, Max Depth = 100)
  |-- Execute Reverse Operation
  |-- SQLite Immediate Transaction Rollback
  |-- Recalculate DAG O(d)
       |
  (IPC Return) <- Affected Nodes Patch Payload
```

#### Datastructure Definition (`src-tauri/src/engine/history.rs`)

```rust
use crate::engine::models::WbsNode;
use std::collections::VecDeque;

#[derive(Debug, Clone)]
pub enum ReversibleCommand {
    UpdateCell {
        node_id: String,
        field: String,
        old_value: String,
        new_value: String,
    },
    RemoveNodes {
        removed_nodes: Vec<WbsNode>,
        parent_relations: Vec<(String, Option<String>)>,
    },
    SetOverhead {
        old_percent: f64,
        new_percent: f64,
    },
}

pub struct CommandHistory {
    undo_stack: VecDeque<ReversibleCommand>,
    redo_stack: VecDeque<ReversibleCommand>,
    max_depth: usize,
}

impl CommandHistory {
    pub fn new(max_depth: usize) -> Self {
        Self {
            undo_stack: VecDeque::with_capacity(max_depth),
            redo_stack: VecDeque::with_capacity(max_depth),
            max_depth,
        }
    }

    pub fn push(&mut self, cmd: ReversibleCommand) {
        if self.undo_stack.len() >= self.max_depth {
            self.undo_stack.pop_front(); // Hapus history tertua
        }
        self.undo_stack.push_back(cmd);
        self.redo_stack.clear(); // Clear redo stack pada aksi baru
    }

    pub fn pop_undo(&mut self) -> Option<ReversibleCommand> {
        let cmd = self.undo_stack.pop_back()?;
        self.redo_stack.push_back(cmd.clone());
        Some(cmd)
    }

    pub fn pop_redo(&mut self) -> Option<ReversibleCommand> {
        let cmd = self.redo_stack.pop_back()?;
        self.undo_stack.push_back(cmd.clone());
        Some(cmd)
    }
}
```

### 1.2 Custom Grid Navigation Hook (`useGridNavigation.ts`)

Mengingat `@tanstack/react-virtual` melakukan *unmount* pada DOM sel yang keluar dari *viewport*, manajemen fokus tidak boleh bergantung pada `document.activeElement`. Seluruh navigasi diatur oleh *2D Coordinate System State*.

* **Navigasi Keyboard Standard:**
  * `ArrowUp` / `ArrowDown`: Menggeser koordinat `[row, col]`. Memicu `virtualizer.scrollToIndex(row)` secara otomatis jika sel berada di luar *overscan area*.
  * `Tab` / `Shift+Tab`: Menggeser sel horizontal. Pada batas kolom terakhir, kursor berpindah ke kolom pertama pada baris berikutnya.
  * `F2` / `Enter`: Mengubah mode sel dari `NAVIGATION` ke `EDITING`.
  * `Escape`: Membatalkan perubahan input dan mengebalikan status ke mode `NAVIGATION`.

### 1.3 SQLite WAL Checkpoint & Graceful Shutdown

Untuk mencegah korupsi berkas `.db` saat aplikasi dihentikan secara paksa:

1. **Inisialisasi Database:** Terapkan `PRAGMA wal_autocheckpoint = 1000;` dan `PRAGMA synchronous = NORMAL;`.
2. **Tauri Event Listener (`src-tauri/src/main.rs`):**
   ```rust
   tauri::Builder::default()
       .build(tauri::generate_context!())
       .expect("error while building tauri application")
       .run(|_app_handle, event| match event {
           tauri::RunEvent::ExitRequested { .. } => {
               // Eksekusi checkpoint paksa sebelum exit
               // PRAGMA wal_checkpoint(TRUNCATE);
           }
           _ => {}
       });
   ```

---

## 2. Fase 2: Reporting & PDF Engine

### 2.1 Native PDF Generation Architecture (`typst-rs`)

Penggunaan PDF Generator berbasais JavaScript/Browser sangat lambat untuk dokumen berukuran ratusan halaman. **ConstrucSee v2** menggunakan engine native `typst-rs` yang dikompilasi langsung di dalam Rust Engine.

```
[ Data SQLite / Graph ] -> [ Typst Markup Generator ] -> [ typst::compile() ] -> [ Berkas PDF (.pdf) ]
```

#### Keunggulan Typst Native Engine:
* Waktu kompilasi $< 50\text{ ms}$ untuk 200 halaman dokumen RAB.
* Otomatis menangani *Page Break*, *Repeat Table Header*, dan *Page Numbering* (`Halaman X dari Y`).

### 2.2 Formula-Driven Excel Exporter (`rust_xlsxwriter`)

Ekspor Excel tidak boleh menghasilkan angka statis murni. Rantai formula harus di-inject secara dinamis agar berkas dapat di-audit ulang di Microsoft Excel.

#### Aturan Injection Formula:

1. **Sel Total Item Leaf:**
   ```rust
   worksheet.write_formula(row, col_total, format!("=C{}*D{}", row + 1, row + 1))?;
   ```
2. **Sel Total Sub-Divisi / Parent:**
   ```rust
   worksheet.write_formula(row, col_total, format!("=SUM(E{}:E{})", start_row + 1, end_row + 1))?;
   ```
3. **Format Angka Standard:**
   ```rust
   let format_currency = Format::new().set_num_format("_(* #,##0.00_);_(* (#,##0.00);_(* \"-\"??_);_(@_)");
   ```

---

## 3. Fase 3: Time-Cost Integration & Visual Analytics (Kurva S & Pareto)

### 3.1 Formula Matematika Kurva S

Kurva S dihitung berdasarkan akumulasi bobot harian/mingguan dari seluruh pekerjaan WBS.

#### 1. Perhitungan Bobot Pekerjaan $i$ ($\%$)
$$\text{Bobot}_i = \left( \frac{\text{Total Biaya}_i}{\text{Grand Total RAB}} \right) \times 100$$

#### 2. Distribusi Bobot Harian Pekerjaan $i$
$$\text{Bobot Harian}_i = \frac{\text{Bobot}_i}{\text{Durasi Hari}_i}$$

#### 3. Agregasi Kurva S Kumulatif Minggu ke-$t$
$$S(t) = \sum_{\tau=1}^{t} \left( \sum_{i \in \text{Active}( \tau )} \text{Bobot Mingguan}_i \right)$$

### 3.2 Pipeline Data Kurva S (Rust to React)

1. Rust Engine mengekstrak $Volume$, $Unit Price$, $Workers$, dan $Duration$ dari SQLite.
2. Rust menghitung array `incremental_progress` dan `cumulative_progress`.
3. Frontend menerima payload JSON dan merender grafik menggunakan library Canvas/SVG (`Recharts`) tanpa perlu melakukan komputasi berat di UI Thread.

### 3.3 Query Agregasi Pareto 80/20 Cost Control

Query berikut mengekstrak resource paling kritis yang menyerap 80% anggaran proyek:

```sql
WITH ResourceCosts AS (
    SELECT 
        nri.name,
        nri.unit,
        nri.category,
        SUM(nri.coefficient * nri.base_price * wn.volume) AS total_cost
    FROM node_resource_items nri
    JOIN wbs_nodes wn ON nri.node_id = wn.id
    GROUP BY nri.name, nri.unit, nri.category
),
CumulativeCosts AS (
    SELECT 
        name,
        unit,
        category,
        total_cost,
        SUM(total_cost) OVER (ORDER BY total_cost DESC) AS cumulative_cost,
        SUM(total_cost) OVER () AS grand_total
    FROM ResourceCosts
)
SELECT 
    name,
    unit,
    category,
    total_cost,
    (total_cost / grand_total * 100) AS cost_percentage,
    (cumulative_cost / grand_total * 100) AS cumulative_percentage,
    CASE 
        WHEN (cumulative_cost / grand_total * 100) <= 80.0 THEN 'KRITIS (80%)'
        ELSE 'MONITOR (20%)'
    END AS pareto_class
FROM CumulativeCosts
ORDER BY total_cost DESC;
```

---

## 4. Fase 4: Master AHSP Management & Application Distribution

### 4.1 Dual Database Architecture

Untuk mencegah intervensi data master oleh proyek lokal, aplikasi memisahkan penyimpanan ke dalam dua berkas SQLite terpisah:

```
AppData/
├── master_ahsp.db         <-- Pustaka Katalog SNI/PUPR Master (Read-Only State)
└── projects/
    └── Proyek_A.csee      <-- File Proyek Aktif (SQLite WAL Mode)
```

* **Deep-Copy Mechanics:** Saat user memilih pekerjaan dari Katalog, Rust Engine menyalin baris data beserta seluruh *resource items*-nya ke file `.csee` proyek. Perubahan harga pada proyek tidak memengaruhi `master_ahsp.db`.

### 4.2 Regional Price Multiplier Indexing

Tabel indeks wilayah pada `master_ahsp.db`:

```sql
CREATE TABLE IF NOT EXISTS regional_indexes (
    id TEXT PRIMARY KEY,
    province TEXT NOT NULL,
    city_regency TEXT NOT NULL,
    multiplier_factor REAL NOT NULL DEFAULT 1.0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

Saat proyek baru diinisialisasi dengan wilayah tertentu (misal: Kabupaten Puncak Jaya, Multiplier = 1.85), seluruh `base_price` katalog yang di-copy ke proyek otomatis dikalikan dengan `multiplier_factor`.

### 4.3 Packaging & Auto-Updater Pipeline

#### Konfigurasi Release Bundler (`src-tauri/tauri.conf.json`)

```json
{
  "bundle": {
    "active": true,
    "targets": ["msi", "nsis"],
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/icon.ico"],
    "identifier": "com.construcsee.desktop",
    "publisher": "ConstrucSee Engineering"
  },
  "plugins": {
    "updater": {
      "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6IGF1dG91cGRhdGUgcHVibGljIGtleQ...",
      "endpoints": [
        "https://github.com/your-org/construcsee/releases/latest/download/latest.json"
      ]
    }
  }
}
```

#### Alur Auto-Update Otomatis:
1. `npm run tauri build` menghasilkan installer `.exe`/`.msi` dan signature file `latest.json`.
2. Push tag Git (misal `v2.1.0`) memicu rilis otomatis di GitHub Releases.
3. Aplikasi desktop memeriksa endpoint `latest.json` secara berkala. Jika ditemukan versi baru dengan signature kriptografi Ed25519 yang valid, aplikasi mengunduh dan melakukan pembaruan secara mandiri.