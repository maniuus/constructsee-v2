import { useMemo, useState } from "react";
import { formatIDR } from "../../lib/format";
import { orderChildren, orderRoots } from "../../lib/order";
import { useWbsStore } from "../../store/useWbsStore";
import { useUiStore } from "../../store/useUiStore";

export function ProjectNavigator({ onCollapse }: { onCollapse?: () => void } = {}) {
  const nodes = useWbsStore((state) => state.nodes);
  const roots = useWbsStore((state) => state.roots);
  const selectedId = useWbsStore((state) => state.selectedId);
  const selectRow = useWbsStore((state) => state.selectRow);
  const toggleExpand = useWbsStore((state) => state.toggleExpand);
  const openAdd = useUiStore((state) => state.openAdd);
  const openAddDirect = useUiStore((state) => state.openAddDirect);
  const askRemove = useUiStore((state) => state.askRemove);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; nodeId: string; isLeaf: boolean } | null>(null);
  const [ctxSub, setCtxSub] = useState(false);
  const orderedRoots = useMemo(() => orderRoots(nodes, roots), [nodes, roots]);

  const renderNode = (id: string, depth: number) => {
    const node = nodes[id];
    if (!node) return null;
    const hasChildren = node.children_ids.length > 0;
    const selected = selectedId === id;

    return (
      <div key={id}>
        <button
          type="button"
          onClick={() => selectRow(id)}
          onContextMenu={(event) => {
            event.preventDefault();
            selectRow(id);
            setCtxSub(false);
            setCtxMenu({
              x: event.clientX,
              y: event.clientY,
              nodeId: id,
              isLeaf: node.children_ids.length === 0,
            });
          }}
          className={`flex w-full items-center gap-1.5 py-1 pr-2 text-left text-[11px] transition ${
            selected ? "bg-accent/10 text-ink" : "text-muted hover:bg-panel2/70 hover:text-ink"
          }`}
          style={{ paddingLeft: 8 + depth * 12 }}
        >
          {hasChildren ? (
            <span
              role="button"
              tabIndex={-1}
              onClick={(event) => {
                event.stopPropagation();
                void toggleExpand(id);
              }}
              className="grid h-3.5 w-3.5 place-items-center text-[9px] text-muted hover:text-accent"
            >
              {node.is_expanded ? "▾" : "▸"}
            </span>
          ) : (
            <span className="h-3.5 w-3.5" />
          )}
          <span className="font-mono text-[10px] text-accent/80">{node.code}</span>
          <span className="min-w-0 flex-1 truncate uppercase tracking-wide">{node.name}</span>
        </button>
        {selected && (
          <div
            className="pb-1 font-mono text-[9.5px] text-muted/70"
            style={{ paddingLeft: 32 + depth * 12 }}
          >
            {formatIDR(node.total_price)}
          </div>
        )}
        {hasChildren && node.is_expanded && orderChildren(nodes, node.children_ids).map((childId) => renderNode(childId, depth + 1))}
      </div>
    );
  };

  return (
    <>
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-line px-3">
        <span className="flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-muted">
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              title="Tutup Project Navigator"
              aria-label="Collapse Project Navigator"
              className="grid h-5 w-5 shrink-0 place-items-center rounded-sm text-muted transition-colors hover:bg-panel2 hover:text-accent"
            >
              ‹
            </button>
          )}
          Project Navigator
        </span>
        <span className="font-mono text-[9px] text-muted/50">{roots.length} DIVISI</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto py-1">{orderedRoots.map((id) => renderNode(id, 0))}</div>

      {ctxMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onMouseDown={() => setCtxMenu(null)}
            onContextMenu={(event) => {
              event.preventDefault();
              setCtxMenu(null);
            }}
          />
          <div
            className="fixed z-50 min-w-[184px] rounded-[4px] border border-line bg-panel py-1 text-[11px] shadow-xl"
            style={{ left: ctxMenu.x, top: ctxMenu.y }}
          >
            <div className="relative" onMouseEnter={() => setCtxSub(true)} onMouseLeave={() => setCtxSub(false)}>
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-1.5 text-left text-ink hover:bg-panel2"
                onClick={() => setCtxSub((value) => !value)}
              >
                <span>Tambah Pekerjaan</span>
                <span className="text-muted/60">▸</span>
              </button>
              {ctxSub && (
                <div className="absolute left-full top-0 min-w-[160px] rounded-[4px] border border-line bg-panel py-1 text-[11px] shadow-xl">
                  <button
                    type="button"
                    className="block w-full px-3 py-1.5 text-left text-ink hover:bg-panel2"
                    onClick={() => {
                      setCtxMenu(null);
                      openAdd();
                    }}
                  >
                    Dari AHSP
                  </button>
                  <button
                    type="button"
                    className="block w-full px-3 py-1.5 text-left text-ink hover:bg-panel2"
                    onClick={() => {
                      setCtxMenu(null);
                      openAddDirect();
                    }}
                  >
                    Langsung
                  </button>
                </div>
              )}
            </div>
            <button
              type="button"
              className="block w-full px-3 py-1.5 text-left text-ink hover:bg-panel2 disabled:cursor-not-allowed disabled:text-muted/40 disabled:hover:bg-transparent"
              disabled={!ctxMenu.isLeaf}
              onClick={() => {
                setCtxMenu(null);
                askRemove(ctxMenu.nodeId);
              }}
            >
              Hapus Pekerjaan
            </button>
          </div>
        </>
      )}
    </>
  );
}
