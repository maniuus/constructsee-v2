# Scope 03: UI/UX & Layout System

## 1. Desktop Shell Architecture
Antarmuka ConstrucSee mengadopsi standar tata letak perangkat lunak CAD/IDE *engineering*:

* **TitleBar:** Custom Tauri window header (tombol Minimize, Maximize, Close, serta Quick Access Toolbar).
* **RibbonBar:** Menu navigasi kontekstual teratas yang dikelompokkan ke dalam Tab (`Home`, `WBS Engine`, `AHSP & Reference`, `Excel & Export`, `View`).
* **Workspace Area:** Area kerja utama menggunakan *resizable panel splitter* tiga kolom:
  1. **Left Sidebar:** Navigator pohon divisi proyek.
  2. **Center Grid:** Virtualized WBS Table.
  3. **Right Properties Inspector:** Detail koefisien AHSP, persentase *overhead & profit*, serta rekapitulasi 3 komponen (Bahan, Tenaga, Alat).
* **StatusBar:** Informasi ringkas batas bawah (Total Biaya RAB, Status Sinkronisasi Engine Rust, Indikator Sel Aktif).

---

## 2. Virtualized WBS Table Engine
* **Virtualization Library:** `@tanstack/react-virtual`.
* **Tree Flattening:** Struktur pohon 3D/rekursif dikonversi di *frontend* menjadi **Flat Array 1D** (`DisplayRow[]`) berdasarkan status status expand/collapse folder.
* **Overscan Buffer:** Ditetapkan `overscan: 10` untuk merender 10 baris ekstra di luar *viewport* guna menjamin kelancaran navigasi keyboard berkecepatan tinggi.

---

## 3. Focus Manager & Navigasi Keyboard
* **Focus Protection:** Mencegah hilangnya elemen input (`HTMLInputElement`) akibat *unmounting DOM* saat *scrolling* cepat.
* **Keyboard Navigation:**
  * `Tab`: Menyimpan data sel aktif & pindah ke kolom kanan.
  * `Shift + Tab`: Pindah ke kolom kiri.
  * `Enter`: Menyimpan data sel aktif & pindah ke baris bawah.
  * `Up / Down Arrow`: Navigasi antar sel vertikal.

---

## 4. UI Error Pipeline (`ErrorPopup`)
* **Global Store:** `useErrorStore.ts` menampung seluruh *runtime error* dan exception dari IPC Rust.
* **Auto Interceptor:** `tauriBridge.ts` mengonversi setiap `Err()` dari Rust menjadi modal popup otomatis.
* **Engine Log Viewer:** Dilengkapi dengan panel *expandable technical details* untuk menyalin *stack trace* Rust/Calamine jika terjadi kegagalan sistem.