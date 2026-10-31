# Scope 02: Technical Architecture & Core Engine

## 1. Tech Stack Utama
* **Desktop Runtime:** Tauri v2 (Rust-based WebView Wrapper, Memory Footprint $< 40\text{ MB}$).
* **Backend Core:** Rust (Edition 2021) dengan Tokio Async Runtime.
* **Frontend UI:** React 18 + TypeScript + Vite.
* **Styling & Components:** Tailwind CSS + Custom Primitives (Shadcn UI).
* **State Management:** Zustand (Frontend) & Lock-Free MPSC Actor Engine (Rust).

---

## 2. Arsitektur Engine Rust: Lock-Free Actor Pattern
Untuk mencegah *deadlock* dan *lock contention* pada thread GUI, engine WBS berjalan dalam satu *task/thread* Rust terisolasi menggunakan **Tokio MPSC Channel**:

```
[ React Virtualized UI ] 
        |
   (IPC Invoke) -> safeInvoke("update_wbs_cell", payload)
        |
        v
[ Tauri IPC Handler ] -> mpsc::Sender::send(WbsCommand::UpdateCell)
        |
        v
[ Tokio MPSC Receiver Engine ] 
        |--> Mutasi Graph Data (In-Memory)
        |--> Recalculate Bottom-Up DAG O(d)
        |--> Async Auto-Save ke SQLite (WAL Mode)
        |
   (IPC Return) <- Affected Nodes Patch JSON
```

---

## 3. Algoritma Propagasi DAG $O(d)$
* **Struktur Data:** Directed Acyclic Graph (DAG) di mana setiap item WBS menyimpan indeks `parent_id` dan daftar `children_ids`.
* **Kalkulasi Bottom-Up:** Ketika sel *leaf* (misal: harga satuan semen) berubah, kalkulasi re-weighting harga tidak mengulang seluruh tabel $O(N)$, melainkan hanya merambat naik melintasi jalur `parent_id` hingga ke Root Node.
* **Kompleksitas:** $O(d)$ di mana $d$ adalah kedalaman hierarki pohon (efektif $d \le 6$).

---

## 4. Keamanan Persistence Layer
* **Database Engine:** SQLite lokal via crate `rusqlite`.
* **Journal Mode:** Write-Ahead Logging (`WAL`) untuk eksekusi penulisan *asynchronous* berkecepatan tinggi tanpa memblokir operasi pembacaan data WBS oleh UI.