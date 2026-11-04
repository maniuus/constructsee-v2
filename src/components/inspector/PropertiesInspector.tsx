import { useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { Field, NumberInput, labelClass } from "../ui/primitives";
import { formatIDR, formatNumber } from "../../lib/format";
import { ancestorChain, componentTotals } from "../../lib/tree";
import { useWbsStore } from "../../store/useWbsStore";
import type { ComponentKind } from "../../types/wbs";

const COMPONENTS: Array<{ key: ComponentKind; label: string; color: string }> = [
  { key: "tenaga", label: "Tenaga", color: "bg-accent2" },
  { key: "bahan", label: "Bahan", color: "bg-accent" },
  { key: "alat", label: "Alat", color: "bg-alat" },
];

export function PropertiesInspector({ onCollapse }: { onCollapse?: () => void } = {}) {
  const nodes = useWbsStore((state) => state.nodes);
  const selectedId = useWbsStore((state) => state.selectedId);
  const activeCell = useWbsStore((state) => state.activeCell);
  const totalCost = useWbsStore((state) => state.totalCost);
  const overhead = useWbsStore((state) => state.overhead);
  const setOverhead = useWbsStore((state) => state.setOverhead);

  const targetId = activeCell?.rowId ?? selectedId;
  const node = targetId ? nodes[targetId] : undefined;
  const chain = node ? ancestorChain(nodes, node.id) : [];
  const grandTotal = totalCost;
  const overheadFactor = 1 + overhead / 100;
  const baseTotal = grandTotal / (overheadFactor || 1);
  const overheadValue = grandTotal - baseTotal;
  const totals = useMemo(
    () => (node ? componentTotals(nodes, node.id) : { bahan: 0, tenaga: 0, alat: 0 }),
    [node, nodes],
  );
  const componentSum = totals.bahan + totals.tenaga + totals.alat;

  return (
    <>
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-line px-3">
        <span className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted">
          Properties Inspector
        </span>
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] text-muted/50">AHSP</span>
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              title="Tutup Properties Inspector"
              aria-label="Collapse Properties Inspector"
              className="grid h-5 w-5 place-items-center rounded-[4px] text-muted transition-colors hover:bg-panel2 hover:text-accent"
            >
              <ChevronRight size={14} strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-3">
        {node ? (
          <>
            <section>
              <div className="mb-1 flex items-center gap-2">
                <span className="rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 font-mono text-[11px] text-accent">
                  {node.code}
                </span>
                <span className="text-[10.5px] uppercase tracking-[0.1em] text-muted/60">
                  {node.method === "ahsp" ? "Analisis AHSP" : "Harga Langsung"}
                </span>
              </div>
              <h2 className="text-[13.5px] font-medium leading-snug text-ink">{node.name}</h2>
              {node.code && (
                <p className="mt-1 truncate text-[10px] text-muted/60">
                  {chain.map((parent) => parent.code).reverse().join(" / ")}
                </p>
              )}
            </section>

            <section className="grid grid-cols-2 gap-2">
              <Field label="Satuan" value={node.unit || "—"} />
              <Field label="Volume" value={formatNumber(node.volume)} mono />
              <Field label="Harga Satuan" value={formatIDR(node.unit_price)} mono />
              <Field label="Total" value={formatIDR(node.total_price)} mono accent />
            </section>

            <section>
              <div className="mb-2 text-[10px] uppercase tracking-[0.1em] text-muted/60">
                Rekapitulasi Komponen
              </div>
              <div className="space-y-1.5">
                {COMPONENTS.map((component) => {
                  const value = totals[component.key];
                  const share = componentSum > 0 ? value / componentSum : 0;
                  return (
                    <div key={component.key} className="flex items-center gap-2">
                      <span className="w-14 text-[11px] text-muted">{component.label}</span>
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-panel2">
                        <div
                          className={`h-full ${component.color}`}
                          style={{ width: `${share * 100}%` }}
                        />
                      </div>
                      <span className="w-24 text-right font-mono text-[11px] tabular-nums text-ink/80">
                        {formatIDR(value)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        ) : (
          <p className="text-[11px] text-muted/60">Pilih baris WBS untuk melihat detail.</p>
        )}

        <section className="border-t border-line pt-3">
          <div className="mb-2 text-[10px] uppercase tracking-[0.1em] text-muted/60">
            Overhead
          </div>
          <div className="grid grid-cols-1 gap-2">
            <PercentInput label="Overhead %" value={overhead} onChange={setOverhead} />
          </div>
          <div className="mt-3 space-y-1 border border-line bg-shell px-2 py-2 text-[10.5px]">
            <div className="flex items-baseline justify-between">
              <span className="text-[10.5px] uppercase tracking-[0.1em] text-muted/70">Subtotal</span>
              <span className="font-mono text-[11.5px] tabular-nums text-ink/80">{formatIDR(baseTotal)}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-[10.5px] uppercase tracking-[0.1em] text-muted/70">
                Overhead ({formatNumber(overhead)}%)
              </span>
              <span className="font-mono text-[11.5px] tabular-nums text-ink/80">{formatIDR(overheadValue)}</span>
            </div>
            <div className="mt-1 flex items-baseline justify-between border-t border-line pt-1.5">
              <span className="text-[10.5px] uppercase tracking-[0.1em] text-muted">Grand Total</span>
              <span className="font-mono text-[13px] font-medium tabular-nums text-accent">
                {formatIDR(grandTotal)}
              </span>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

function PercentInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className={`mb-1 block ${labelClass}`}>{label}</span>
      <NumberInput min={0} step={0.5} value={value} onChange={onChange} />
    </label>
  );
}
