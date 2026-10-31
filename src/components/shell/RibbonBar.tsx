import { useState, type ReactNode } from "react";
import { useWbsStore } from "../../store/useWbsStore";
import { useUiStore } from "../../store/useUiStore";

type Tab = "Home" | "WBS Engine" | "AHSP & Reference" | "Excel & Export" | "View";

const TABS: Tab[] = ["Home", "WBS Engine", "AHSP & Reference", "Excel & Export", "View"];

interface RibbonButtonProps {
  label: string;
  hint?: string;
  onClick?: () => void;
  disabled?: boolean;
}

function RibbonButton({ label, hint, onClick, disabled }: RibbonButtonProps) {
  return (
    <button
      type="button"
      title={hint ?? label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-[52px] min-w-[64px] flex-col items-center justify-center gap-1 rounded-sm border border-transparent px-2 text-[10px] text-muted transition hover:border-line hover:bg-panel2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-transparent disabled:hover:bg-transparent"
    >
      <span className="text-[13px] leading-none text-accent">{label.slice(0, 1)}</span>
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
              <RibbonButton label="New" disabled hint="Fase 2: manajemen proyek" />
              <RibbonButton label="Open" disabled hint="Fase 2: manajemen proyek" />
              <RibbonButton label="Reload" onClick={() => void load()} hint="Muat ulang snapshot dari Rust engine" />
            </Group>
            <Group title="View">
              <RibbonButton label="Expand" disabled hint="Fase 2: bulk expand" />
              <RibbonButton label="Collapse" disabled hint="Fase 2: bulk collapse" />
            </Group>
          </>
        )}

        {tab === "WBS Engine" && (
          <>
            <Group title="Rows">
              <RibbonButton label="Division" disabled hint="Fase 2: tambah divisi" />
              <RibbonButton label="Item" disabled hint="Fase 2: tambah item" />
            </Group>
            <Group title="Engine">
              <RibbonButton label="Reload" onClick={() => void load()} hint="Sinkronisasi ulang dengan engine" />
              <RibbonButton label="Recalc" disabled hint="Propagasi DAG otomatis setiap edit" />
            </Group>
          </>
        )}

        {tab === "AHSP & Reference" && (
          <>
            <Group title="Library">
              <RibbonButton
                label="AHSP"
                onClick={() => useUiStore.getState().openAdd()}
                hint="Tambah pekerjaan dari katalog AHSP"
              />
              <RibbonButton
                label="Langsung"
                onClick={() => useUiStore.getState().openAddDirect()}
                hint="Tambah pekerjaan dengan harga satuan langsung"
              />
              <RibbonButton label="Coefficient" disabled />
            </Group>
            <Group title="Pricing">
              <RibbonButton label="Overhead" disabled />
              <RibbonButton label="Profit" disabled />
            </Group>
          </>
        )}

        {tab === "Excel & Export" && (
          <>
            <Group title="Workbook">
              <RibbonButton label="Import" onClick={() => void importExcel()} hint="Import .xlsx via calamine" />
              <RibbonButton label="Export" onClick={() => void exportExcel()} hint="Export .xlsx dengan live formula" />
            </Group>
            <Group title="Audit">
              <RibbonButton label="Formula" disabled hint="Fase 2: validasi rantai formula" />
            </Group>
          </>
        )}

        {tab === "View" && (
          <>
            <Group title="Panels">
              <RibbonButton label="Navigator" disabled />
              <RibbonButton label="Inspector" disabled />
            </Group>
            <Group title="Grid">
              <RibbonButton label="Density" disabled />
            </Group>
          </>
        )}
      </div>
    </section>
  );
}
