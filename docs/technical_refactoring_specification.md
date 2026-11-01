# Technical Refactoring Specification: ConstrucSee v2

Dokumen ini memuat audit teknis mengenai 5 kendala dan *architectural anti-pattern* pada **ConstrucSee v2**, dilengkapi rancangan solusi, skema basis data, serta contoh implementasi yang **sudah diselaraskan dengan API kode aktual**.

> Catatan audit: setiap contoh kode di bawah telah diverifikasi terhadap `src-tauri/src/**` dan `src/store/**`. Contoh pada bagian "Usulan" belum diterapkan (masih rencana); nama tipe/fungsi mengikuti yang benar-benar ada di basis kode.

---

## Ringkasan Eksekutif

| # | Domain Masalah | Tipe Anti-Pattern | Dampak Sistem | Solusi Utama |
|---|---|---|---|---|
| **1** | Database Persistence | Denormalized JSON Blob | Sulit di-index, pencarian resource `O(N)`, update harga rawan tidak konsisten | Normalisasi 1:N ke tabel `node_resource_items` |
| **2** | Business Engine | Hardcoded Cost Allocation (58/27/15) | Alat teralokasi wajib (15%) walau pekerjaan tanpa alat | Fallback alokasi sadar-kategori (tanpa memaksa Alat) |
| **3** | Excel Interoperability | Forward-Fill Importer tanpa merged-range | Merge cell korup, metadata AHSP hilang (semua `method: "langsung"`) | Preprocessor merged-range dari calamine |
| **4** | State Consistency | Overhead display-only + Rencana Kerja volatil | Pembulatan presisi & data amnesia saat reload | Overhead di Engine + tabel `work_plans` |
| **5** | Tauri IPC Bridge | N+1 IPC pada bulk delete | N roundtrip IPC, N transaksi SQLite, N pass rollup DAG | Command batch atomik `remove_nodes_batch` |

---

## 1. Denormalized SQLite Schema & JSON Blob Component Anti-Pattern

### Deklarasi Masalah
Rincian komponen AHSP (Tenaga/Bahan/Alat) beserta item koefisiennya disimpan sebagai **teks JSON** di kolom `components` pada tabel `wbs_nodes` (lihat `src-tauri/src/engine/db.rs`).

* **Kondisi aktual (`db.rs`):**
  - Tabel `wbs_nodes` berkolom: `id, parent_id, children_ids (JSON), code, name, unit, volume, unit_price, total_price, is_expanded, components (JSON), method`.
  - Skema didefinisikan **inline** lewat konstanta `SCHEMA` di `open()`, lalu migrasi ringan memakai `ALTER TABLE ... ADD COLUMN` (bukan folder `migrations/`).
  - `children_ids` juga disimpan sebagai JSON, dan `roots` disimpan di `project_meta`.
* **Dampak:**
  1. **Tidak dapat di-index:** pencarian resource unik (mis. semua baris yang memakai "Semen Portland") memaksa full-table scan `O(N)` + deserialisasi JSON per baris di level aplikasi.
  2. **Interdependensi lemah:** perubahan harga satu resource mengharuskan penulisan ulang seluruh string JSON pada semua baris terkait (rawan inkonsistensi).

### Solusi Teknis
Normalisasi menjadi relasi `1:N` dengan tabel `node_resource_items`. Nilai agregat per kategori (`coefficient/base_price/subtotal`) **tidak perlu disimpan** karena dapat dihitung dari item (`Σ coefficient`, `Σ coefficient*base_price`).

#### Skema Migrasi SQL (usulan)
> Jalur `migrations/002_normalize_ahsp.sql` belum ada di proyek; saat ini migrasi dijalankan inline di `db.rs::open`. Contoh ini adalah target arsitektur.

```sql
-- 1. Tabel utama node WBS (children_ids tetap perlu untuk kompatibilitas engine)
CREATE TABLE IF NOT EXISTS wbs_nodes (
    id TEXT PRIMARY KEY,
    parent_id TEXT REFERENCES wbs_nodes(id) ON DELETE CASCADE,
    children_ids TEXT NOT NULL DEFAULT '[]',   -- JSON, dipertahankan agar tidak memecah engine
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    unit TEXT NOT NULL,
    volume REAL NOT NULL DEFAULT 0.0,
    unit_price REAL NOT NULL DEFAULT 0.0,
    total_price REAL NOT NULL DEFAULT 0.0,
    method TEXT NOT NULL CHECK (method IN ('ahsp', 'langsung')),
    is_expanded INTEGER NOT NULL DEFAULT 0
);

-- 2. Resource item ter-normalisasi (1:N). hanya untuk baris leaf.
CREATE TABLE IF NOT EXISTS node_resource_items (
    id TEXT PRIMARY KEY,
    node_id TEXT NOT NULL REFERENCES wbs_nodes(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (category IN ('tenaga', 'bahan', 'alat')),
    name TEXT NOT NULL,
    unit TEXT NOT NULL,
    coefficient REAL NOT NULL DEFAULT 0.0,
    base_price REAL NOT NULL DEFAULT 0.0,
    -- SQLite mendukung generated column (>= 3.31); VIRTUAL agar tidak memakan storage.
    subtotal REAL GENERATED ALWAYS AS (coefficient * base_price) VIRTUAL
);

-- Indexing untuk query instan di sheet Harga Dasar & BOQ
CREATE INDEX IF NOT EXISTS idx_resource_node_cat ON node_resource_items(node_id, category);
CREATE INDEX IF NOT EXISTS idx_resource_name_unit ON node_resource_items(name, unit);
```

---

## 2. Hardcoded Biased Cost Distribution (Magic Numbers 58/27/15)

### Deklarasi Masalah
`WbsComponents::from_unit_price` (`src-tauri/src/engine/models.rs:186`) memakai rasio konstan **58% Bahan, 27% Tenaga, 15% Alat** saat menurunkan komponen dari `unit_price`.

* **Dampak:** pekerjaan tanpa komponen alat (mis. *Pengecatan Dinding*, *Pembersihan Lapangan*) tetap dialokasikan 15% ke item placeholder "Alat Berat". Rekapitulasi BOQ menjadi tidak valid secara teknis.
* **Catatan koreksi:** mekanisme rebalance yang **sudah ada** adalah `WbsComponents::rebalanced_to(target)` — ia hanya **menskalakan proporsional** item yang sudah terdaftar (tidak menambah kategori baru). Jadi masalah 58/27/15 murni muncul pada **fallback pembuatan komponen** (`from_unit_price`), bukan pada rebalance.

### Solusi Teknis
**A. Rebalance (sudah benar — pertahankan):** menyesuaikan `unit_price` hanya mengalikan `base_price` item terdaftar secara proporsional.

**B. Fallback sadar-kategori (usulan perubahan):** jangan memaksakan kategori Alat bila pekerjaan tidak memiliki item alat. Turunkan hanya kategori yang relevan (default Bahan + Tenaga).

#### Implementasi Rust saat ini (acuan)
```rust
// models.rs — SUDAH ADA
pub fn rebalanced_to(&self, target: f64) -> Self {
    if !target.is_finite() || target <= 0.0 {
        return Self::from_unit_price(0.0);
    }
    let current = self.total();
    if current <= f64::EPSILON {
        return Self::from_unit_price(target); // <-- fallback memakai rasio 58/27/15
    }
    let factor = target / current;
    Self {
        bahan: self.bahan.scaled(factor),
        tenaga: self.tenaga.scaled(factor),
        alat: self.alat.scaled(factor),
    }
}

// models.rs — helper item yang benar-benar ada
impl ComponentCost {
    fn scaled(&self, factor: f64) -> Self { /* skala base_price + subtotal tiap item */ }
    // Tidak ada `recalculate_totals()` di kode aktual; agregat dihitung inline:
    //   self.subtotal   = items.iter().map(|i| i.subtotal).sum();
    //   self.coefficient = items.iter().map(|i| i.coefficient).sum();
    //   self.base_price  = if coefficient > 0 { subtotal / coefficient } else { base_price };
}
```

#### Usulan: fallback tanpa memaksa Alat
```rust
// models.rs — USULAN (mengganti komposisi fallback)
pub fn from_unit_price(unit_price: f64) -> Self {
    let price = if unit_price.is_finite() && unit_price > 0.0 {
        unit_price
    } else {
        0.0
    };

    // Komposisi default hanya Bahan + Tenaga (70/30).
    // Kategori Alat dibiarkan kosong sampai pengguna menambahkannya sendiri.
    Self {
        bahan: ComponentCost::from_share(price * 0.70, BAHAN_ITEMS),
        tenaga: ComponentCost::from_share(price * 0.30, TENAGA_ITEMS),
        alat: ComponentCost::default(),
    }
}
```

---

## 3. Superficial Excel Import via Naive Forward-Fill

### Deklarasi Masalah
`src-tauri/src/excel/importer.rs` memakai `calamine` **0.37** tetapi **tidak pernah** membaca metadata merged cell; importer hanya:
- membaca **sheet pertama** saja (`sheet_names().first()`),
- melakukan forward-fill pada kolom A **dan** nama (`last_code` / `last_name`),
- memaksa semua node menjadi `method: METHOD_LANGSUNG`.

* **Dampak:** file RAB dengan merged cell kompleks (judul divisi di-merge A:H, atau kolom Satuan di-merge vertikal) kehilangan struktur hierarki; seluruh rincian AHSP asli (koefisien + resource) hilang.

### Solusi Teknis
Gunakan API merge-cell calamine yang **benar**. Di calamine 0.37, merged region dibaca dari **workbook** (bukan dari `Range`) melalui `merge_cells_by_sheet_name(&mut self, name) -> Result<Vec<Dimensions>, _>`, dengan `Dimensions { start: (u32, u32), end: (u32, u32) }`.

> Koreksi terhadap draft: `Range::get_to_merge_list()` dan akses tuple `region.0 .0` **tidak ada** di calamine 0.37.

#### Parser Preprocessor (usulan, API calamine 0.37)
```rust
use calamine::{Data, Dimensions, Range, Reader};
use std::collections::HashMap;

pub struct ExcelGridPreprocessor;

impl ExcelGridPreprocessor {
    /// Replikasi nilai sel kiri-atas ke seluruh area ter-merge.
    pub fn resolve_merged_cells(
        range: &Range<Data>,
        merged: &[Dimensions],
    ) -> HashMap<(u32, u32), Data> {
        let mut cell_map: HashMap<(u32, u32), Data> = HashMap::new();

        // 1. Pemetaan data sel mentah
        for (r, row) in range.rows().enumerate() {
            for (c, val) in row.iter().enumerate() {
                if !val.is_empty() {
                    cell_map.insert((r as u32, c as u32), val.clone());
                }
            }
        }

        // 2. Replikasi nilai berdasarkan Dimensions ter-merge
        for dim in merged {
            let (r0, c0) = dim.start;
            let (r1, c1) = dim.end;
            if let Some(val) = cell_map.get(&(r0, c0)).cloned() {
                for r in r0..=r1 {
                    for c in c0..=c1 {
                        cell_map.entry((r, c)).or_insert_with(|| val.clone());
                    }
                }
            }
        }

        cell_map
    }
}
```

Pemakaian di importer:
```rust
let mut workbook = calamine::open_workbook_auto(path)?;
let sheet = workbook.sheet_names().first().cloned().unwrap();

// merge_cells_by_sheet_name memakai &mut self dan mengembalikan Result<Vec<Dimensions>, _>
let merged = workbook.merge_cells_by_sheet_name(&sheet).unwrap_or_default();
let range = workbook.worksheet_range(&sheet)?;
let grid = ExcelGridPreprocessor::resolve_merged_cells(&range, &merged);
// lalu modul heuristik membaca `grid` (bukan `range.rows()`) untuk membentuk hierarki.
```

---

## 4. Dual-Truth Overhead Calculation & Unpersisted Work Plan State

### Deklarasi Masalah
1. **Split-Brain Overhead:** nilai overhead (**default 10**, disimpan di Zustand `useWbsStore`) dihitung *display-only* di layer React (`WbsTable`). Engine Rust menyimpan `unit_price`/`total_price` **tanpa** overhead. Input `unit_price` di frontend mengalikan/membagi dengan `overheadFactor` sebelum/kembali dari IPC (lihat `NumberCell` prop `scale`), berisiko *precision loss* saat sinkronisasi.
2. **Volatile Work Plan:** input jumlah pekerja & durasi di sheet *Rencana Kerja* hanya hidup di `useState` lokal komponen (`RencanaKerjaSheet`), hilang saat ganti sheet atau reload.

* **Catatan koreksi:** field `profit` (default 8) juga ada di Zustand tetapi **tidak dipakai** pada Grand Total (Grand Total = `totalCost * (1 + overhead/100)`).

### Solusi Teknis
1. **Single Source of Truth Overhead:** pindahkan `overhead_percent` ke `EngineState` Rust; rollup `total_price` dihitung backend sehingga UI tidak lagi melakukan konversi bolak-balik.
2. **Persistensi Rencana Kerja:** tabel `work_plans` dengan kaskade hapus.

#### Skema Persistence Rencana Kerja (usulan)
```sql
CREATE TABLE IF NOT EXISTS work_plans (
    node_id TEXT PRIMARY KEY REFERENCES wbs_nodes(id) ON DELETE CASCADE,
    num_workers INTEGER NOT NULL DEFAULT 1,
    duration_days REAL NOT NULL DEFAULT 1.0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 5. N+1 IPC Event Storming pada Bulk Delete

### Deklarasi Masalah
`useWbsStore.removeNodes` (`src/store/useWbsStore.ts:242`) mengeksekusi `safeInvoke("remove_node", …)` di dalam loop `for (const id of valid)`. Menghapus 50 baris = 50 roundtrip IPC ke Rust; tiap panggilan memicu 1 transaksi SQLite (`db::delete_ids`) dan 1 pass rollup DAG (`.rollup_all`), sehingga UI terasa berat.

### Solusi Teknis
Sediakan command batch tunggal `remove_nodes_batch` yang mengeksekusi penghapusan dalam **satu transaksi SQLite** dan **satu pass rollup DAG**.

#### A. Backend Command Boundary (`src-tauri/src/commands.rs`) — usulan
```rust
#[tauri::command(rename_all = "snake_case")]
pub async fn remove_nodes_batch(
    ids: Vec<String>,
    engine: State<'_, EngineHandle>,
) -> Result<AffectedPatch, String> {
    engine.inner().clone().remove_nodes_batch(ids).await
}
```
> Nama tipe yang benar: `EngineHandle`, `AffectedPatch` (bukan `EnginePatch`).

#### B. MPSC Actor Single-Pass Execution (`src-tauri/src/engine/actor.rs`) — usulan
Varian enum + method handle + method state (mengikuti pola `remove_node` yang sudah ada):
```rust
// 1. Variant command
enum EngineCommand {
    // ... varian lain ...
    RemoveNodesBatch { ids: Vec<String>, reply: Reply<AffectedPatch> },
}

// 2. Handle (mengikuti pola request(...) yang sudah ada)
impl EngineHandle {
    pub async fn remove_nodes_batch(&self, ids: Vec<String>) -> Result<AffectedPatch, String> {
        self.request(|reply| EngineCommand::RemoveNodesBatch { ids, reply }).await
    }
}

// 3. State — satu pass rollup + satu transaksi delete
impl EngineState {
    fn remove_nodes_batch(&mut self, ids: &[String]) -> Result<AffectedPatch, String> {
        let valid: Vec<String> = ids
            .iter()
            .filter(|id| self.nodes.get(*id).map(|n| n.children_ids.is_empty()).unwrap_or(false))
            .cloned()
            .collect();
        if valid.is_empty() {
            return Err("Tidak ada baris pekerjaan (leaf) yang dapat dihapus".to_string());
        }

        let mut affected_ids: Vec<String> = Vec::new();
        for id in &valid {
            if let Some(node) = self.nodes.get(id) {
                match node.parent_id.clone() {
                    Some(pid) => {
                        if let Some(parent) = self.nodes.get_mut(&pid) {
                            parent.children_ids.retain(|child| child != id);
                        }
                        let mut current = self.nodes.get(&pid).and_then(|n| n.parent_id.clone());
                        affected_ids.push(pid.clone());
                        while let Some(cid) = current {
                            let next = self.nodes.get(&cid).and_then(|n| n.parent_id.clone());
                            affected_ids.push(cid);
                            current = next;
                        }
                    }
                    None => {
                        self.roots.retain(|root| root != id);
                    }
                }
            }
        }

        for id in &valid {
            self.nodes.remove(id);
        }

        // Satu pass rollup DAG (bukan per node)
        calc::rollup_all(&mut self.nodes);

        // Satu transaksi delete
        db::delete_ids(&mut self.conn, &valid).map_err(|error| error.to_string())?;

        let mut affected: Vec<WbsNode> = Vec::new();
        let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
        for id in &affected_ids {
            if let Some(node) = self.nodes.get(id) {
                if seen.insert(id.clone()) {
                    affected.push(node.clone());
                }
            }
        }
        db::upsert_many(&mut self.conn, &affected).map_err(|error| error.to_string())?;

        Ok(AffectedPatch {
            nodes: affected,
            total_cost: calc::total_cost(&self.nodes, &self.roots),
        })
    }
}
```
> Nama yang benar: `EngineState.conn` (bukan `db_conn`), `calc::rollup_all` (bukan `recalculate_dag_rollup`), `db::delete_ids`, `AffectedPatch { nodes, total_cost }`.

#### C. Frontend Zustand IPC Integration (`src/store/useWbsStore.ts`) — usulan
`nodes` adalah `Record<string, WbsNode>` (bukan `Map`), dan tidak ada `displayRows`/`treeFlattener` di kode aktual.
```typescript
removeNodes: async (ids: string[]) => {
  const valid = ids.filter((id) => {
    const node = get().nodes[id];
    return Boolean(node) && node.children_ids.length === 0;
  });
  if (valid.length === 0) return;

  set({ syncing: true });
  // Satu panggilan batch atomic
  const patch = await safeInvoke<AffectedPatch>("remove_nodes_batch", { ids: valid });
  if (!patch) {
    set({ syncing: false });
    return;
  }
  set((state) => {
    const nodes = { ...state.nodes };
    for (const id of valid) delete nodes[id];
    for (const node of patch.nodes) nodes[node.id] = normalizeNode(node);
    return { nodes, totalCost: patch.total_cost, syncing: false, lastSyncedAt: Date.now() };
  });
},
```
