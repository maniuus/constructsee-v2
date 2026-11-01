import { formatIDR } from "../../lib/format";
import { useWbsStore } from "../../store/useWbsStore";

const syncLabel = (syncing: boolean, lastSyncedAt: number | null): string => {
  if (syncing) return "SAVING";
  if (!lastSyncedAt) return "IDLE";
  return `SYNCED ${new Date(lastSyncedAt).toLocaleTimeString("id-ID", {
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
    : "NO CELL";

  return (
    <footer className="flex h-7 shrink-0 items-center justify-between border-t border-line bg-panel px-3 text-[10px] tracking-wide text-muted">
      <div className="flex items-center gap-4">
        <span className="text-muted/70">TOTAL RAB</span>
        <span className="font-mono text-[11px] font-semibold text-ink">{formatIDR(grandTotal)}</span>
        <span className="text-muted/40">|</span>
        <span className="text-muted/70">ACTIVE</span>
        <span className="font-mono text-ink/80">{activeLabel}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              syncing ? "animate-pulse bg-accent" : "bg-accent/70"
            }`}
          />
          RUST ENGINE · {syncLabel(syncing, lastSyncedAt)}
        </span>
        <span className="text-muted/30">|</span>
        <span className="font-mono text-muted/70">SQLITE · WAL</span>
      </div>
    </footer>
  );
}
