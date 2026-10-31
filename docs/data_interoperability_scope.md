# Scope 04: Data Architecture & Excel Interoperability

## 1. Skema Data WBS (Data Models)

### Rust Struct (`src-tauri/src/engine/models.rs`)
```rust
pub struct WBSNode {
    pub id: String,
    pub parent_id: Option<String>,
    pub children_ids: Vec<String>,
    pub code: String,            // e.g., "1.1.2"
    pub name: String,            // e.g., "Pekerjaan Beton K-225"
    pub unit: String,            // e.g., "m3"
    pub volume: f64,
    pub unit_price: f64,         // Calculated or Overridden
    pub total_price: f64,        // volume * unit_price
    pub is_expanded: bool,
}

pub struct DeltaPayload {
    pub item_id: String,
    pub field: String,
    pub new_value: f64,
}
```

---

## 2. Pipeline Import Excel (`calamine`)
1. **File Ingestion:** File `.xlsx` dibaca menggunakan crate `calamine` di Rust ($< 200\text{ ms}$ untuk 50.000 baris).
2. **Merged-Cell Pre-processor:**
   * Melakukan pemindaian metadata *merged range*.
   * Mereplikasi nilai sel utama ke seluruh sel dalam *range* yang di-merge untuk mencegah nilai `Nil/Empty`.
3. **Regex Heuristik Hierarki:**
   * Deteksi Divisi: `^([I|V|X]+)\.` (misal: "I. PEKERJAAN PERSIAPAN").
   * Deteksi Sub-Pekerjaan: `^(\d+\.\d+)` (misal: "1.1 Pekerjaan Tanah").
   * Deteksi Kode AHSP: Format baku standar SNI (misal: "A.2.3.1.9").

---

## 3. Pipeline Export Excel (`rust_xlsxwriter`)
* **Live Formulas Injection:** Sel total biaya tidak diekspor sebagai angka statis, melainkan di-inject dengan formula asli Excel:
  * Total Biaya Item: `=B10*C10` (Volume $\times$ Harga Satuan).
  * Total Sub-Divisi: `=SUM(D11:D25)`.
* **Compatibility:** Memastikan file `.xlsx` hasil ekspor dapat dibuka dan diedit kembali secara manual di Microsoft Excel 2007 hingga versi terbaru tanpa merusak rantai formula.