import { formatIDR } from "../../lib/format";
import { useWbsStore } from "../../store/useWbsStore";

const syncLabel = (syncing: boolean, lastSyncedAt: number | null): string => {
  if (syncing) return "MENYIMPAN";
  if (!lastSyncedAt) return "SIAP";
  return `TERSIMPAN ${new Date(lastSyncedAt).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })}`;
};

export function StatusBar() {
  const totalCost = useWbsStore((state) => state.totalCost);
  const syncing = useWbsStore((state) => state.syncing);
  const lastSyncedAt = useWbsStore((state) => state.lastSyncedAt);
  const activeCell = useWbsStore((state) => state.activeCell);
  const nodes = useWbsStore((state) => state.nodes);

  const grandTotal = totalCost;
  const activeLabel = activeCell
    ? `${nodes[activeCell.rowId]?.code ?? "?"} · ${activeCell.field === "unit_price" ? "HARGA SATUAN" : "VOLUME"}`
    : "TIDAK ADA SEL";

  return (
    <footer className="flex h-8 shrink-0 items-center justify-between border-t border-line bg-panel px-3 text-[10.5px] tracking-wide text-muted tabular-nums">
      <div className="flex items-center gap-4">
        <span className="text-muted/70">TOTAL RAB</span>
        <span className="font-mono text-[11.5px] font-medium text-ink">{formatIDR(grandTotal)}</span>
        <span className="text-muted/40">|</span>
        <span className="text-muted/70">SEL AKTIF</span>
        <span className="font-mono text-ink/75">{activeLabel}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              syncing ? "animate-pulse bg-accent" : "bg-accent/70"
            }`}
          />
          ENGINE RUST · {syncLabel(syncing, lastSyncedAt)}
        </span>
        <span className="text-muted/30">|</span>
        <span className="font-mono text-muted/70">SQLITE · WAL</span>
      </div>
    </footer>
  );
}
