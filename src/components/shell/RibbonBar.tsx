import { useState, type ReactNode } from "react";
import {
  FilePlus,
  FolderOpen,
  Save,
  Undo,
  Redo,
  Sliders,
  Trash2,
  IndentIncrease,
  IndentDecrease,
  ChevronsDown,
  ChevronsUp,
  Calculator,
  Search,
  BookOpen,
  MapPin,
  PieChart,
  Bookmark,
  GitCompare,
  FileText,
  FileSpreadsheet,
  Share2,
  GitMerge,
  Printer,
  TrendingUp,
  PanelLeft,
  PanelRight,
  RefreshCw,
  Info,
  History,
  type LucideIcon,
} from "lucide-react";
import { useWbsStore } from "../../store/useWbsStore";
import { useUiStore } from "../../store/useUiStore";

type Tab = "Home" | "WBS" | "AHSP & Reference" | "Excel & Export" | "View";

const TABS: Tab[] = ["Home", "WBS", "AHSP & Reference", "Excel & Export", "View"];

interface RibbonButtonProps {
  label: string;
  icon: LucideIcon;
  hint?: string;
  onClick?: () => void;
  disabled?: boolean;
  compact?: boolean;
}

function RibbonButton({ label, icon: Icon, hint, onClick, disabled, compact }: RibbonButtonProps) {
  if (compact) {
    return (
      <button
        type="button"
        title={hint ?? label}
        onClick={onClick}
        disabled={disabled}
        className="group flex h-[18px] min-w-[70px] items-center gap-1 rounded border border-transparent px-1 text-[10px] text-muted transition-colors duration-150 hover:border-line hover:bg-panel2 hover:text-ink outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent/70 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-transparent disabled:hover:bg-transparent"
      >
        <Icon size={12} className="text-muted transition-colors duration-150 group-hover:text-accent" strokeWidth={1.5} />
        <span className="whitespace-nowrap">{label}</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      title={hint ?? label}
      onClick={onClick}
      disabled={disabled}
      className="group flex h-[52px] min-w-[54px] flex-col items-center justify-center gap-0.5 rounded border border-transparent px-1 text-[11px] text-muted transition-colors duration-150 hover:border-line hover:bg-panel2 hover:text-ink outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent/70 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-transparent disabled:hover:bg-transparent"
    >
      <Icon size={16} className="text-muted transition-colors duration-150 group-hover:text-accent" strokeWidth={1.5} />
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex h-full shrink-0 flex-col border-r border-line px-1.5 last:border-r-0">
      <div className="flex flex-1 items-center justify-center gap-0.5">{children}</div>
      <span className="pb-0.5 text-center text-[10px] uppercase tracking-[0.12em] text-muted/55">
        {title}
      </span>
    </div>
  );
}

export function RibbonBar() {
  const [tab, setTab] = useState<Tab>("Home");
  const load = useWbsStore((state) => state.load);
  const importExcel = useWbsStore((state) => state.importExcel);
  const exportExcel = useWbsStore((state) => state.exportExcel);
  const exportPdf = useWbsStore((state) => state.exportPdf);
  const previewPdf = useWbsStore((state) => state.previewPdf);
  const canUndo = useWbsStore((state) => state.canUndo);
  const canRedo = useWbsStore((state) => state.canRedo);
  const undo = useWbsStore((state) => state.undo);
  const redo = useWbsStore((state) => state.redo);
  const selectedId = useWbsStore((state) => state.selectedId);
  const removeNode = useWbsStore((state) => state.removeNode);
  const indentNode = useWbsStore((state) => state.indentNode);
  const outdentNode = useWbsStore((state) => state.outdentNode);
  const expandAll = useWbsStore((state) => state.expandAll);
  const collapseAll = useWbsStore((state) => state.collapseAll);
  const newProject = useWbsStore((state) => state.newProject);
  const openProject = useWbsStore((state) => state.openProject);
  const saveProject = useWbsStore((state) => state.saveProject);
  const openProjectInfo = useUiStore((state) => state.openProjectInfo);
  const openHistory = useUiStore((state) => state.openHistory);
  const openOptions = useUiStore((state) => state.openOptions);
  const calculatorOpen = useUiStore((state) => state.calculatorOpen);
  const openCalculator = useUiStore((state) => state.openCalculator);
  const closeCalculator = useUiStore((state) => state.closeCalculator);
  const openFind = useUiStore((state) => state.openFind);

  return (
    <section className="shrink-0 border-b border-line bg-panel">
      <div className="flex h-8 items-end gap-1 border-b border-line px-2">
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`h-full rounded-t px-3 text-[11px] tracking-wide transition-colors duration-150 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent/70 ${
              tab === item
                ? "bg-panel2 text-ink shadow-[inset_0_1px_0_0_hsl(var(--c-accent))]"
                : "text-muted hover:bg-panel2/60 hover:text-ink"
            }`}
          >
            {item}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 pb-1 text-[10px] uppercase tracking-[0.1em] text-muted/70">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          MPSC Actor Engine
        </div>
      </div>

      <div className="flex h-[68px] items-center overflow-x-auto px-0.5">
        {tab === "Home" && (
          <>
            <Group title="Project">
              <RibbonButton
                label="New"
                icon={FilePlus}
                onClick={() => {
                  if (window.confirm("Buat proyek baru? Seluruh data proyek saat ini akan dihapus.")) {
                    void newProject();
                  }
                }}
                hint="Proyek baru (kosong)"
              />
              <RibbonButton
                label="Open"
                icon={FolderOpen}
                onClick={() => {
                  if (
                    window.confirm(
                      "Buka proyek lain? Data proyek saat ini akan diganti dan riwayat undo dihapus. Simpan (Save) dulu bila perlu.",
                    )
                  ) {
                    void openProject();
                  }
                }}
                hint="Buka file proyek .csee"
              />
              <RibbonButton
                label="Save"
                icon={Save}
                onClick={() => void saveProject()}
                hint="Simpan proyek ke file .csee"
              />
            </Group>
            <Group title="Edit">
              <RibbonButton
                label="Undo"
                icon={Undo}
                onClick={() => void undo()}
                disabled={!canUndo}
                hint="Batal perubahan terakhir (Ctrl+Z)"
              />
              <RibbonButton
                label="Redo"
                icon={Redo}
                onClick={() => void redo()}
                disabled={!canRedo}
                hint="Ulang perubahan dibatalkan (Ctrl+Y)"
              />
              <RibbonButton
                label="History"
                icon={History}
                onClick={openHistory}
                hint="Riwayat undo / redo"
              />
            </Group>
            <Group title="Workspace">
              <RibbonButton
                label="Info"
                icon={Info}
                onClick={openProjectInfo}
                hint="Project info (nama, lokasi, pemilik, kontrak)"
              />
              <RibbonButton
                label="Options"
                icon={Sliders}
                onClick={openOptions}
                hint="Preferensi overhead & PPN"
              />
              <RibbonButton
                label="Reload"
                icon={RefreshCw}
                onClick={() => void load()}
                hint="Muat ulang snapshot dari engine"
              />
            </Group>
          </>
        )}

        {tab === "WBS" && (
          <>
            <Group title="Rows">
              <RibbonButton
                label="Delete"
                icon={Trash2}
                disabled={!selectedId}
                onClick={() => {
                  if (selectedId) void removeNode(selectedId);
                }}
                hint="Hapus baris terpilih"
              />
            </Group>
            <Group title="Structure">
              <RibbonButton
                label="Indent +"
                icon={IndentIncrease}
                disabled={!selectedId}
                onClick={() => {
                  if (selectedId) void indentNode(selectedId);
                }}
                hint="Jadikan anak dari baris di atasnya"
              />
              <RibbonButton
                label="Indent −"
                icon={IndentDecrease}
                disabled={!selectedId}
                onClick={() => {
                  if (selectedId) void outdentNode(selectedId);
                }}
                hint="Keluarkan satu tingkat"
              />
              <RibbonButton
                label="Expand All"
                icon={ChevronsDown}
                onClick={() => void expandAll()}
                hint="Bentangkan seluruh struktur"
              />
              <RibbonButton
                label="Collapse All"
                icon={ChevronsUp}
                onClick={() => void collapseAll()}
                hint="Lipat seluruh struktur"
              />
            </Group>
            <Group title="Tools">
              <RibbonButton
                label="Calculator"
                icon={Calculator}
                onClick={() => (calculatorOpen ? closeCalculator() : openCalculator())}
                hint="Tampilkan/sembunyikan kalkulator di panel kanan (numpad aktif)"
              />
              <RibbonButton
                label="Find"
                icon={Search}
                onClick={openFind}
                hint="Cari pekerjaan (Ctrl+F)"
              />
              <RibbonButton
                label="Reload"
                icon={RefreshCw}
                onClick={() => void load()}
                hint="Sinkronisasi ulang dengan engine"
              />
            </Group>
          </>
        )}

        {tab === "AHSP & Reference" && (
          <>
            <Group title="Library">
              <RibbonButton
                label="AHSP"
                icon={BookOpen}
                onClick={() => useUiStore.getState().openAdd()}
                hint="Tambah pekerjaan dari katalog AHSP"
              />
              <RibbonButton
                label="Langsung"
                icon={Bookmark}
                onClick={() => useUiStore.getState().openAddDirect()}
                hint="Tambah pekerjaan dengan harga satuan langsung"
              />
              <RibbonButton
                label="Wilayah"
                icon={MapPin}
                onClick={() => {
                  useUiStore.getState().openRegion();
                  useUiStore.getState().setActiveSheet("analisa");
                }}
                hint="Pilih wilayah dan indeks harga proyek"
              />
            </Group>
            <Group title="Pricing">
              <RibbonButton
                label="Analisa"
                icon={PieChart}
                onClick={() => useUiStore.getState().setActiveSheet("analisa")}
                hint="Analisa harga satuan & porsi biaya"
              />
              <RibbonButton
                label="Bandingkan"
                icon={GitCompare}
                onClick={() => useUiStore.getState().openCompare()}
                hint="Bandingkan estimasi biaya antar wilayah"
              />
            </Group>
          </>
        )}

        {tab === "Excel & Export" && (
          <>
            <Group title="Workbook">
              <RibbonButton label="Import" icon={FileSpreadsheet} onClick={() => {
                  if (
                    window.confirm(
                      "Import Excel? Seluruh WBS dan rencana kerja proyek saat ini akan diganti dan riwayat undo dihapus. Simpan (Save) dulu bila perlu.",
                    )
                  ) {
                    void importExcel();
                  }
                }} hint="Import .xlsx via calamine" />
              <RibbonButton label="Export" icon={FileText} onClick={() => void exportExcel()} hint="Export .xlsx dengan live formula" />
              <RibbonButton label="PDF" icon={Printer} onClick={() => void exportPdf()} hint="Ekspor RAB ke PDF (F4, standar resmi)" />
            </Group>
            <Group title="Preview">
              <RibbonButton label="Preview" icon={FileText} onClick={() => void previewPdf()} hint="Pratinjau PDF tanpa menyimpan" />
            </Group>
            <Group title="Share">
              <RibbonButton label="Share" icon={Share2} disabled hint="Fase 2: bagikan dokumen" />
              <RibbonButton label="Merge" icon={GitMerge} disabled hint="Fase 2: gabung laporan" />
            </Group>
          </>
        )}

        {tab === "View" && (
          <>
            <Group title="Panels">
              <RibbonButton
                label="Navigator"
                icon={PanelLeft}
                onClick={() => useUiStore.getState().toggleNavigator()}
                hint="Tampilkan/sembunyikan Project Navigator (Ctrl+[)"
              />
              <RibbonButton
                label="Inspector"
                icon={PanelRight}
                onClick={() => useUiStore.getState().toggleInspector()}
                hint="Tampilkan/sembunyikan Properties Inspector (Ctrl+])"
              />
              <RibbonButton
                label="Kurva S"
                icon={TrendingUp}
                onClick={() => useUiStore.getState().setActiveSheet("kurvaS")}
                hint="Grafik waktu-biaya"
              />
            </Group>
          </>
        )}
      </div>
    </section>
  );
}
