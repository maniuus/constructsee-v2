import { useState, type ReactNode } from "react";
import {
  FilePlus,
  FolderOpen,
  Save,
  Undo,
  Redo,
  Scissors,
  Copy,
  Clipboard,
  Sliders,
  DatabasePlus,
  PlusCircle,
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
  Settings,
  RefreshCw,
  Eye,
  type LucideIcon,
} from "lucide-react";
import { useWbsStore } from "../../store/useWbsStore";
import { useUiStore } from "../../store/useUiStore";

type Tab = "Home" | "WBS Engine" | "AHSP & Reference" | "Excel & Export" | "View";

const TABS: Tab[] = ["Home", "WBS Engine", "AHSP & Reference", "Excel & Export", "View"];

interface RibbonButtonProps {
  label: string;
  icon: LucideIcon;
  hint?: string;
  onClick?: () => void;
  disabled?: boolean;
}

function RibbonButton({ label, icon: Icon, hint, onClick, disabled }: RibbonButtonProps) {
  return (
    <button
      type="button"
      title={hint ?? label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-[52px] min-w-[64px] flex-col items-center justify-center gap-1 rounded-sm border border-transparent px-2 text-[10px] text-muted transition hover:border-line hover:bg-panel2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-transparent disabled:hover:bg-transparent"
    >
      <Icon size={15} className="text-accent" strokeWidth={1.75} />
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex items-stretch gap-1 border-r border-line px-2 last:border-r-0">
      <div className="flex items-center gap-1">{children}</div>
      <span className="self-end pb-1 text-[9px] uppercase tracking-widest text-muted/60">
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
  const openRegion = useWbsStore((state) => state.openRegion);

  return (
    <section className="shrink-0 border-b border-line bg-panel">
      <div className="flex h-7 items-end gap-1 border-b border-line px-2">
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`h-full rounded-t-sm px-3 text-[10.5px] tracking-wide transition ${
              tab === item
                ? "bg-panel2 text-ink shadow-[inset_0_1px_0_0_#22C55E]"
                : "text-muted hover:bg-panel2/60 hover:text-ink"
            }`}
          >
            {item}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 pb-1 text-[9px] uppercase tracking-widest text-muted/70">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          MPSC Actor Engine
        </div>
      </div>

      <div className="flex h-[68px] items-center overflow-x-auto px-1">
        {tab === "Home" && (
          <>
            <Group title="Project">
              <RibbonButton label="New" icon={FilePlus} disabled hint="Fase 2: manajemen proyek" />
              <RibbonButton label="Open" icon={FolderOpen} disabled hint="Fase 2: manajemen proyek" />
              <RibbonButton label="Save" icon={Save} disabled hint="Fase 2: simpan proyek" />
              <RibbonButton label="Reload" icon={RefreshCw} onClick={() => void load()} hint="Muat ulang snapshot dari Rust engine" />
            </Group>
            <Group title="Undo/Redo">
              <RibbonButton label="Undo" icon={Undo} onClick={() => void undo()} disabled={!canUndo} hint="Batal perubahan terakhir (Ctrl+Z)" />
              <RibbonButton label="Redo" icon={Redo} onClick={() => void redo()} disabled={!canRedo} hint="Ulang perubahan dibatal (Ctrl+Y)" />
            </Group>
            <Group title="Clipboard">
              <RibbonButton label="Cut" icon={Scissors} disabled hint="Fase 2: potong baris" />
              <RibbonButton label="Copy" icon={Copy} disabled hint="Fase 2: salin baris" />
              <RibbonButton label="Paste" icon={Clipboard} disabled hint="Fase 2: tempel baris" />
              <RibbonButton label="Options" icon={Sliders} disabled hint="Fase 2: preferensi" />
            </Group>
          </>
        )}

        {tab === "WBS Engine" && (
          <>
            <Group title="Rows">
              <RibbonButton label="Division" icon={DatabasePlus} disabled hint="Fase 2: tambah divisi" />
              <RibbonButton label="Item" icon={PlusCircle} disabled hint="Fase 2: tambah item" />
              <RibbonButton label="Delete" icon={Trash2} disabled hint="Fase 2: hapus baris" />
            </Group>
            <Group title="Structure">
              <RibbonButton label="Indent +" icon={IndentIncrease} disabled hint="Fase 2: naikkan level" />
              <RibbonButton label="Indent −" icon={IndentDecrease} disabled hint="Fase 2: turunkan level" />
              <RibbonButton label="Expand" icon={ChevronsDown} disabled hint="Fase 2: bentangkan semua" />
              <RibbonButton label="Collapse" icon={ChevronsUp} disabled hint="Fase 2: lipat semua" />
            </Group>
            <Group title="Engine">
              <RibbonButton label="Reload" icon={RefreshCw} onClick={() => void load()} hint="Sinkronisasi ulang dengan engine" />
              <RibbonButton label="Recalc" icon={Calculator} disabled hint="Propagasi DAG otomatis setiap edit" />
              <RibbonButton label="Find" icon={Search} disabled hint="Fase 2: cari pekerjaan" />
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
                  openRegion('dki-jakarta');
                  useUiStore.getState().setActiveSheet('analisa');
                }}
                hint="Fase 4: pilih wilayah proyek"
              />
            </Group>
            <Group title="Pricing">
              <RibbonButton label="Analisa" icon={PieChart} onClick={() => useUiStore.getState().setActiveSheet("analisa")} hint="Analisa komponen harga satuan" />
              <RibbonButton label="Bandingkan" icon={GitCompare} disabled hint="Fase 2: bandingkan HSP" />
            </Group>
          </>
        )}

        {tab === "Excel & Export" && (
          <>
            <Group title="Workbook">
              <RibbonButton label="Import" icon={FileSpreadsheet} onClick={() => void importExcel()} hint="Import .xlsx via calamine" />
              <RibbonButton label="Export" icon={FileText} onClick={() => void exportExcel()} hint="Export .xlsx dengan live formula" />
              <RibbonButton label="PDF" icon={Printer} onClick={() => void exportPdf()} hint="Ekspor RAB ke PDF (F4, standar resmi)" />
              <RibbonButton label="Preview" icon={Eye} onClick={() => void previewPdf()} hint="Pratinjau PDF tanpa perlu ekspor" />
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
              <RibbonButton label="Navigator" icon={PanelLeft} disabled hint="Ctrl+[ untuk toggle" />
              <RibbonButton label="Inspector" icon={PanelRight} disabled hint="Ctrl+] untuk toggle" />
              <RibbonButton label="Kurva S" icon={TrendingUp} onClick={() => useUiStore.getState().setActiveSheet("kurvaS")} hint="Grafik waktu-biaya & Pareto 80/20" />
              <RibbonButton label="Settings" icon={Settings} disabled hint="Fase 2: preferensi tampilan" />
            </Group>
          </>
        )}
      </div>
    </section>
  );
}
