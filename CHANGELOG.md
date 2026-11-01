# Changelog

All notable changes to ConstrucSee v2 are documented in this file.

## [v1.0.0] — 2026-11-01 — Fase 1–4 Complete

### Fase 1: Keyboard Ergonomics & Undo/Redo Engine
- MPSC `CommandHistory` di Rust (`UpdateCells`, `RemoveNodes`, `SetOverhead`, max depth 100)
- Grid navigasi 2D (`ArrowUp`/`ArrowDown`, `Tab`/`Shift+Tab`, `F2`/`Enter`, `Escape`) via `useGridNavigation.ts`
- SQLite WAL (`journal_mode=WAL`, `synchronous=NORMAL`, `wal_autocheckpoint=1000`, `busy_timeout=5s`)
- Graceful shutdown: `PRAGMA wal_checkpoint(TRUNCATE)` saat `ExitRequested`
- Tombol Undo/Redo di ribbon + `Ctrl+Z` / `Ctrl+Y`

### Fase 2: Reporting & PDF Engine
- PDF native `typst-rs` 0.11 (F4 215×330mm, header repeat per halaman, zebra, Romans numeration)
- Memuat font sistem lengkap via `fontdb` → perbaiki bug PDF kosong / "3 garis"
- Excel exporter dengan formula live (`=C*D`, `=SUM(...)`) dan format mata uang
- Pratinjau PDF dalam aplikasi via iframe blob URL (tanpa export ulang)

### Fase 3: Kurva S & Pareto
- S-curve kumulatif mingguan + grafik SVG
- Pareto 80/20 kontrol biaya (tabel, badge KRITIS/MONITOR)
- Jadwal sekuensial + input tanggal mulai proyek
- Sheet "Kurva S" diakses dari ribbon View

### Fase 4: Master AHSP & Distribusi
- `master_ahsp.db` (`master_divisions`, `master_items`, `master_components`, `regional_indexes`)
- 10 wilayah dengan multiplier (national 1.000 → papua 1.850)
- Set wilayah → skala semua leaf component, rollup DAG, persist ke SQLite
- `RegionDialog` + tombol Wilayah di ribbon
- Packaging: `bundle.active=true`, `targets=["msi","nsis"]`, identifier kompatibel
- Auto-updater BELUM diaktifkan (butuh `tauri-plugin-updater` + Ed25519 keypair terpisah)

### Verifikasi
- `cargo test --lib`: 22 passed
- `cargo clippy --lib`: bersih
- `npm run typecheck` + `npm run build`: lolos (~339 kB)

### Masalah Diketahui
- PDF Grand Total mencakup PPN; UI footer menggunakan total_cost sebelum PPN
- Auto-updater (4.3) belum diaktifkan
- Proyek masih single DB (`constructsee.db`), belum multi-proyek `.csee`
- Katalog AHSP browsing masih dari JSON statis (master DB sebagai referensi)