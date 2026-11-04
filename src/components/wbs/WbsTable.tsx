import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatIDR, formatKoef, formatMoney, formatNumber, parseNumeric } from "../../lib/format";
import { flattenTree, hasAnalysis } from "../../lib/tree";
import { useWbsStore } from "../../store/useWbsStore";
import { useUiStore } from "../../store/useUiStore";
import { useGridNavigation } from "../../hooks/useGridNavigation";
import type { ComponentItem, ComponentKind, DisplayRow, EditableField, PriceMethod } from "../../types/wbs";

const GRID =
  "grid w-full grid-cols-[80px_minmax(320px,1fr)_36px_64px_72px_56px_112px_104px_104px_104px_120px_80px_120px_120px_120px_140px] min-w-[1752px]";
const ROW_HEIGHT = 32;
const OVERSCAN = 10;

const COMPONENT_COLUMNS: Array<{
  key: ComponentKind;
  label: string;
  letter: string;
  tone: string;
  dot: string;
  surface: string;
  surfaceStrong: string;
}> = [
  {
    key: "tenaga",
    label: "Tenaga Kerja",
    letter: "A",
    tone: "text-accent2",
    dot: "bg-accent2",
    surface: "bg-panel2/40 border-line/40",
    surfaceStrong: "bg-panel2/70 border-line/40",
  },
  {
    key: "bahan",
    label: "Bahan",
    letter: "B",
    tone: "text-accent",
    dot: "bg-accent",
    surface: "bg-panel2/40 border-line/40",
    surfaceStrong: "bg-panel2/70 border-line/40",
  },
  {
    key: "alat",
    label: "Alat",
    letter: "C",
    tone: "text-alat",
    dot: "bg-alat",
    surface: "bg-panel2/40 border-line/40",
    surfaceStrong: "bg-panel2/70 border-line/40",
  },
];

const ANALYSIS_CODE: Record<ComponentKind, string> = {
  bahan: "B",
  tenaga: "T",
  alat: "A",
};

const ANALYSIS_LABEL: Record<ComponentKind, string> = {
  bahan: "Bahan",
  tenaga: "Tenaga Kerja",
  alat: "Alat",
};

type NavAction = "next" | "prev" | "down" | "up";

export function WbsTable() {
  const nodes = useWbsStore((state) => state.nodes);
  const roots = useWbsStore((state) => state.roots);
  const loading = useWbsStore((state) => state.loading);
  const selectedId = useWbsStore((state) => state.selectedId);
  const selectRow = useWbsStore((state) => state.selectRow);
  const openAdd = useUiStore((state) => state.openAdd);
  const openAddDirect = useUiStore((state) => state.openAddDirect);
  const askRemove = useUiStore((state) => state.askRemove);
  const askRemoveMany = useUiStore((state) => state.askRemoveMany);
  const bulkMode = useUiStore((state) => state.bulkMode);
  const bulkSelection = useUiStore((state) => state.bulkSelection);
  const toggleBulkMode = useUiStore((state) => state.toggleBulkMode);
  const toggleBulkSelect = useUiStore((state) => state.toggleBulkSelect);
  const setBulkSelection = useUiStore((state) => state.setBulkSelection);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; nodeId: string; isLeaf: boolean } | null>(null);
  const [ctxSub, setCtxSub] = useState(false);
  const toggleExpand = useWbsStore((state) => state.toggleExpand);
  const setMethod = useWbsStore((state) => state.setMethod);
  const setActiveCell = useWbsStore((state) => state.setActiveCell);
  const activeCell = useWbsStore((state) => state.activeCell);
  const totalCost = useWbsStore((state) => state.totalCost);
  const overhead = useWbsStore((state) => state.overhead);
  const ppn = useWbsStore((state) => state.ppn);
  const setPpn = useWbsStore((state) => state.setPpn);

  const overheadFactor = 1 + overhead / 100;
  const grandTotal = totalCost;
  const ppnValue = grandTotal * (ppn / 100);
  const grandTotalPlusPpn = grandTotal + ppnValue;

  const rows = useMemo(
    () => flattenTree(nodes, roots.filter((id) => (nodes[id]?.children_ids.length ?? 0) > 0)),
    [nodes, roots],
  );
  const fields: EditableField[] = ["volume", "unit_price"];
  const activeRowIndex = activeCell ? rows.findIndex((r) => r.kind === "node" && r.node.id === activeCell.rowId) : -1;
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!bulkMode) return;
    const valid = bulkSelection.filter((id) => Boolean(nodes[id]));
    if (valid.length !== bulkSelection.length) setBulkSelection(valid);
  }, [bulkMode, bulkSelection, nodes, setBulkSelection]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    getItemKey: (index) => rows[index]?.key ?? index,
    overscan: OVERSCAN,
  });

  const focusCell = useCallback(
    (rowIndex: number, field: EditableField) => {
      const row = rows[rowIndex];
      if (!row || row.kind !== "node") return;
      virtualizer.scrollToIndex(rowIndex, { align: "auto" });
      setActiveCell({ rowId: row.node.id, field });
      requestAnimationFrame(() => {
        const input = scrollRef.current?.querySelector<HTMLInputElement>(
          `[data-cell="${rowIndex}:${field}"]`,
        );
        input?.focus();
        input?.select();
      });
    },
    [rows, setActiveCell, virtualizer],
  );

  const nearestLeaf = useCallback(
    (from: number, step: number): number => {
      let index = from + step;
      while (index >= 0 && index < rows.length) {
        if (rows[index].kind === "node" && rows[index].node.children_ids.length === 0) {
          return index;
        }
        index += step;
      }
      return -1;
    },
    [rows],
  );

  const navigate = useCallback(
    (rowIndex: number, field: EditableField, action: NavAction) => {
      if (action === "down" || action === "up") {
        const target = nearestLeaf(rowIndex, action === "down" ? 1 : -1);
        if (target >= 0) focusCell(target, field);
        return;
      }
      if (action === "next") {
        if (field === "volume") {
          focusCell(rowIndex, "unit_price");
          return;
        }
        const target = nearestLeaf(rowIndex, 1);
        if (target >= 0) focusCell(target, "volume");
        return;
      }
      if (action === "prev") {
        if (field === "unit_price") {
          focusCell(rowIndex, "volume");
          return;
        }
        const target = nearestLeaf(rowIndex, -1);
        if (target >= 0) focusCell(target, "unit_price");
        return;
      }
      if (action === "left") {
        if (field === "volume") {
          const target = nearestLeaf(rowIndex, -1);
          if (target >= 0) focusCell(target, "unit_price");
          return;
        }
        if (field === "unit_price") {
          focusCell(rowIndex, "volume");
          return;
        }
        return;
      }
      if (action === "right") {
        if (field === "volume") {
          focusCell(rowIndex, "unit_price");
          return;
        }
        if (field === "unit_price") {
          const target = nearestLeaf(rowIndex, 1);
          if (target >= 0) focusCell(target, "volume");
          return;
        }
        return;
      }
      if (field === "volume") {
        focusCell(rowIndex, "unit_price");
        return;
      }
      if (field === "unit_price") {
        focusCell(rowIndex, "volume");
        return;
      }
      const target = nearestLeaf(rowIndex, -1);
      if (target >= 0) focusCell(target, "unit_price");
    },
    [focusCell, nearestLeaf],
  );

  useGridNavigation({
    rowIndex: Math.max(activeRowIndex, 0),
    activeField: activeCell?.field ?? null,
    fields,
    onNavigate: (r, f, a) => navigate(r, f, a as "next" | "prev" | "down" | "up"),
    focusCell,
  });

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-line bg-panel px-3">
        <div className="flex items-baseline gap-2">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">
            WBS Engine
          </span>
          <span className="font-mono text-[10px] text-muted/50">{rows.length} BARIS</span>
        </div>
        <div className="flex items-center gap-2">
          {bulkMode ? (
            <>
              <span className="font-mono text-[10px] text-accent">
                {bulkSelection.length} dipilih
              </span>
              <button
                type="button"
                onClick={() => setBulkSelection([])}
                disabled={bulkSelection.length === 0}
                className="rounded-[3px] border border-line px-2 py-0.5 text-[10px] text-muted transition hover:bg-panel2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                Kosongkan
              </button>
              <button
                type="button"
                onClick={() => askRemoveMany(bulkSelection)}
                disabled={bulkSelection.length === 0}
                className="rounded-[3px] border border-danger/50 bg-danger/20 px-2 py-0.5 text-[10px] font-medium text-danger transition hover:bg-danger/30 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Hapus Terpilih ({bulkSelection.length})
              </button>
              <button
                type="button"
                onClick={() => toggleBulkMode()}
                className="rounded-[3px] border border-line px-2 py-0.5 text-[10px] text-ink transition hover:bg-panel2"
              >
                Selesai
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 font-mono text-[10px] text-muted/50">
                <span>AHSP · 3 KOMPONEN</span>
                <span className="text-muted/30">|</span>
                <span>DAG · O(d)</span>
              </div>
              <button
                type="button"
                onClick={() => toggleBulkMode()}
                className="rounded-[3px] border border-line px-2 py-0.5 text-[10px] text-muted transition hover:bg-panel2 hover:text-ink"
              >
                Pilih
              </button>
            </>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <div ref={scrollRef} className="h-full overflow-auto">
          <div className="min-w-[1752px]">
            <div className="sticky top-0 z-20">
          <div
            className={`${GRID} min-h-[20px] shrink-0 items-stretch border-b border-line bg-shell text-[10px] uppercase tracking-[0.14em]`}
          >
            <div className="col-span-4" />
            <div className="flex items-center justify-center border-l border-line/40 text-muted">
              Input
            </div>
            <div className="col-span-2 flex items-center justify-center border-l border-line/40 text-muted">
              Referensi AHSP
            </div>
            <div className="col-span-3 flex items-center justify-center border-l border-line/40 text-ink/60">
              Kalkulasi
            </div>
            <div className="col-span-6 flex items-center justify-center border-l border-line/40 text-ink/60">
              Kalkulasi
            </div>
          </div>
          <div
            className={`${GRID} min-h-[36px] shrink-0 items-stretch border-b border-line bg-panel2 text-[10px] uppercase tracking-[0.1em] text-muted`}
          >
            <div className="flex items-center px-2 text-center">Kode</div>
            <div className="flex items-center px-2 text-center">Uraian Pekerjaan</div>
            <div className="flex items-center px-2 text-center">Sat</div>
            <div className="flex items-center justify-center border-l border-line/40 px-2 text-center">
              Metode
            </div>
            <div className="flex items-center border-l border-line/40 px-2 text-center">Volume</div>
            <div className="flex items-center border-l border-line/40 px-2 text-center">Koef</div>
            <div className="flex items-center px-2 text-center">Harga Dasar</div>
            {COMPONENT_COLUMNS.map((col) => (
              <div
                key={col.key}
                className={`flex flex-col items-center justify-center border-l px-2 text-center leading-tight ${col.surfaceStrong} ${col.tone}`}
              >
                <span>Harga Satuan ({col.letter})</span>
                <span className="text-[10px] normal-case tracking-normal text-muted/70">
                  {col.label}
                </span>
              </div>
            ))}
            <div className="flex items-center px-2 text-center">Harga Satuan Pekerjaan (A+B+C)</div>
            <div className="flex items-center justify-center border-l border-line/40 px-2 text-center">BOQ</div>
            {COMPONENT_COLUMNS.map((col) => (
              <div
                key={col.key}
                className={`flex flex-col items-center justify-center border-l px-2 text-center leading-tight ${col.surfaceStrong} ${col.tone}`}
              >
                <span>Subtotal Biaya ({col.letter})</span>
                <span className="text-[10px] normal-case tracking-normal text-muted/70">
                  {col.label}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-center px-2 text-center">Total Biaya</div>
          </div>
            </div>

            <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const row = rows[virtualRow.index];
                const isNode = row.kind === "node";
                const isAnalysis = row.kind === "analysis";
                const isItem = row.kind === "item";
                const isParent = isNode && row.node.children_ids.length > 0;
                const isChildRow = isAnalysis || isItem;
                const selected = isNode && row.node.id === selectedId;
                const volume = row.node.volume;
                const component =
                  row.componentKind !== undefined
                    ? row.node.components[row.componentKind]
                    : null;
                const rowCoefficient = isItem ? row.item?.coefficient : undefined;
                const rowSubtotal = isItem
                  ? row.item?.subtotal
                  : isAnalysis
                    ? component?.subtotal
                    : undefined;
                const totalCost =
                  isChildRow && rowSubtotal !== undefined
                    ? volume * rowSubtotal * (isAnalysis ? overheadFactor : 1)
                    : row.node.total_price * overheadFactor;

                return (
                  <div
                    key={row.key}
                    data-index={virtualRow.index}
                    ref={virtualizer.measureElement}
                    className={`${GRID} absolute left-0 top-0 min-h-[32px] items-center border-b border-line/60 py-0.5 text-[12px] ${
                      isChildRow
                        ? "bg-panel2/20 text-[11px]"
                        : selected
                          ? "bg-accent/[0.07]"
                          : "hover:bg-panel2/40"
                    }`}
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                    onMouseDown={() => selectRow(row.node.id)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      selectRow(row.node.id);
                      setCtxSub(false);
                      setCtxMenu({
                        x: event.clientX,
                        y: event.clientY,
                        nodeId: row.node.id,
                        isLeaf: row.node.children_ids.length === 0,
                      });
                    }}
                  >
                    <div
                      className={`flex items-center gap-1.5 px-2 font-mono text-[11px] ${
                        isChildRow ? "text-muted/40" : "text-muted/80"
                      }`}
                    >
                      {bulkMode && isNode && !isParent ? (
                        <>
                          <button
                            type="button"
                            title="Pilih untuk dihapus"
                            onMouseDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleBulkSelect(row.node.id);
                            }}
                            className="shrink-0"
                          >
                            <span
                              className={`flex h-3.5 w-3.5 items-center justify-center rounded-[2px] border text-[10px] leading-none ${
                                bulkSelection.includes(row.node.id)
                                  ? "border-danger bg-danger/30 text-danger"
                                  : "border-line/70 text-transparent hover:border-danger/60"
                              }`}
                            >
                              ✓
                            </span>
                          </button>
                          <span className="truncate">{row.node.code}</span>
                        </>
                      ) : (
                        <span className="truncate">
                          {isAnalysis && row.componentKind
                            ? ANALYSIS_CODE[row.componentKind]
                            : isItem
                              ? ""
                              : row.node.code}
                        </span>
                      )}
                    </div>
                    <NameCell
                      row={row}
                      onToggle={() => void toggleExpand(row.node.id)}
                    />
                    <div className="px-2 text-center font-mono text-[11px] text-muted/80">
                      {isItem
                        ? row.item?.unit || "—"
                        : isAnalysis
                          ? "—"
                          : row.node.unit || "—"}
                    </div>
                    <div className="flex items-center justify-center border-l border-line/40 px-1">
                      {isNode && !isParent ? (
                        <MethodCell
                          method={row.node.method}
                          onSelect={(method) => void setMethod(row.node.id, method)}
                        />
                      ) : (
                        <span className="text-[10px] text-muted/30">—</span>
                      )}
                    </div>
                    {isNode && !isParent ? (
                      <NumberCell
                        rowIndex={virtualRow.index}
                        row={row}
                        field="volume"
                        navigate={navigate}
                      />
                    ) : (
                      <div className="px-2 text-right font-mono text-[11px] text-muted/30">—</div>
                    )}
                    <div
                      className={`truncate border-l border-line/40 px-2 text-right font-mono text-[11px] ${
                        rowCoefficient !== undefined ? "text-muted/90" : "text-muted/30"
                      }`}
                    >
                      {rowCoefficient !== undefined ? formatKoef(rowCoefficient) : "—"}
                    </div>
                    {isItem && row.item ? (
                      <ItemPriceInput item={row.item} />
                    ) : (
                      <div className="truncate px-2 text-right font-mono text-[11px] text-muted/30">—</div>
                    )}
                    {COMPONENT_COLUMNS.map((col) => {
                      const active = isChildRow && row.componentKind === col.key;
                      const surface = isItem
                        ? active
                          ? col.surface
                          : ""
                        : isNode || active
                          ? col.surfaceStrong
                          : "";
                      const cost = row.node.components[col.key];
                      let value: string;
                      let muted = false;

                      if (isParent) {
                        value = "—";
                        muted = true;
                      } else if (isItem) {
                        if (active && row.item) {
                          value = formatIDR(row.item.subtotal);
                        } else {
                          value = "—";
                          muted = true;
                        }
                      } else if (isAnalysis) {
                        if (active && component) {
                          value = formatIDR(component.subtotal * overheadFactor);
                        } else {
                          value = "—";
                          muted = true;
                        }
                      } else {
                        value = formatIDR(cost.subtotal * overheadFactor);
                      }

                      return (
                        <div
                          key={col.key}
                          className={`border-l px-2 text-right font-mono text-[11px] ${surface} ${
                            muted ? "text-muted/30" : "text-ink/80"
                          }`}
                        >
                          {value}
                        </div>
                      );
                    })}
                    {isNode && !isParent ? (
                      row.node.method === "langsung" ? (
                        <NumberCell
                          rowIndex={virtualRow.index}
                          row={row}
                          field="unit_price"
                          navigate={navigate}
                          scale={overheadFactor}
                        />
                      ) : (
                        <div className="border-l border-line/40 px-2 text-right font-mono text-[10.5px] font-medium text-ink">
                          {formatIDR(row.node.unit_price * overheadFactor)}
                        </div>
                      )
                    ) : (
                      <div className="px-2 text-right font-mono text-[11px] text-muted/30">—</div>
                    )}
                    <div
                      className={`truncate border-l border-line/40 px-2 text-right font-mono text-[11px] ${
                        isChildRow && rowCoefficient !== undefined
                          ? "text-ink/80"
                          : "text-muted/30"
                      }`}
                    >
                      {isChildRow && rowCoefficient !== undefined
                        ? formatNumber(volume * rowCoefficient)
                        : "—"}
                    </div>
                    {COMPONENT_COLUMNS.map((col) => {
                      const active = isChildRow && row.componentKind === col.key;
                      const surface = isItem
                        ? active
                          ? col.surface
                          : ""
                        : isNode || active
                          ? col.surfaceStrong
                          : "";
                      const cost = row.node.components[col.key];
                      let value: string;
                      let muted = false;

                      if (isParent) {
                        value = "—";
                        muted = true;
                      } else if (isItem) {
                        if (active && row.item) {
                          value = formatIDR(volume * row.item.subtotal);
                        } else {
                          value = "—";
                          muted = true;
                        }
                      } else if (isAnalysis) {
                        if (active && component) {
                          value = formatIDR(volume * component.subtotal * overheadFactor);
                        } else {
                          value = "—";
                          muted = true;
                        }
                      } else {
                        value = formatIDR(volume * cost.subtotal * overheadFactor);
                      }

                      return (
                        <div
                          key={col.key}
                          className={`border-l px-2 text-right font-mono text-[11px] ${surface} ${
                            muted ? "text-muted/30" : "text-ink/80"
                          }`}
                        >
                          {value}
                        </div>
                      );
                    })}
                    <div
                      className={`truncate px-2 text-right font-mono text-[10.5px] ${
                        isChildRow
                          ? "text-ink/80"
                          : isParent
                            ? "text-ink"
                            : "text-muted"
                      }`}
                    >
                      {formatIDR(totalCost)}
                    </div>
                  </div>
                );
              })}
            </div>

            {!loading && rows.length === 0 && (
              <div className="calcir-grid grid h-48 place-items-center text-[11px] text-muted/60">
                Belum ada data WBS. Import workbook Excel untuk memulai.
              </div>
            )}

            <div className="sticky bottom-0 z-10 border-t-2 border-line/80 bg-panel text-[10px]">
              <div className={`${GRID} min-h-[28px] items-center border-b border-line/40 bg-accent/[0.04]`}>
                <div style={{ gridColumn: "span 15" }} className="px-3 text-right font-medium text-ink/80">
                  Grand Total
                </div>
                <div className="border-l border-line/40 px-2 text-right font-mono font-semibold text-ink">
                  {formatIDR(grandTotal)}
                </div>
              </div>
              <div className={`${GRID} min-h-[26px] items-center border-b border-line/40`}>
                <div style={{ gridColumn: "span 15" }} className="flex items-center justify-end gap-1.5 px-3 text-muted">
                  <span>PPN</span>
                  <PercentInput value={ppn} onCommit={setPpn} />
                  <span>%</span>
                </div>
                <div className="border-l border-line/40 px-2 text-right font-mono text-muted">
                  {formatIDR(ppnValue)}
                </div>
              </div>
              <div className={`${GRID} min-h-[32px] items-center border-t border-line bg-accent/[0.06]`}>
                <div style={{ gridColumn: "span 15" }} className="px-3 text-right text-[12px] font-semibold uppercase tracking-[0.06em] text-ink">
                  Jumlah Grand Total + PPN
                </div>
                <div className="border-l border-line/40 px-2 text-right font-mono text-[11.5px] font-bold text-accent">
                  {formatIDR(grandTotalPlusPpn)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {loading && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-shell/70 backdrop-blur-[1px]">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.1em] text-muted">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
            Memuat Rust engine
          </div>
        </div>
      )}

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
            className="fixed z-50 min-w-[184px] rounded-[4px] border border-line bg-panel py-1 text-[11px] shadow-lg"
            style={{ left: ctxMenu.x, top: ctxMenu.y }}
          >
            <div className="relative" onMouseEnter={() => setCtxSub(true)} onMouseLeave={() => setCtxSub(false)}>
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-1.5 text-left text-ink hover:bg-panel2"
                onClick={() => setCtxSub((value) => !value)}
              >
                <span>Tambah Pekerjaan</span>
                <ChevronRight size={12} className="text-muted/60" />
              </button>
              {ctxSub && (
                <div className="absolute left-full top-0 min-w-[160px] rounded-[4px] border border-line bg-panel py-1 text-[11px] shadow-lg">
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
    </div>
  );
}

function NameCell({ row, onToggle }: { row: DisplayRow; onToggle: () => void }) {
  const selectedId = useWbsStore((state) => state.selectedId);
  const hasChildren = row.node.children_ids.length > 0;
  const selected = row.kind === "node" && selectedId === row.node.id;
  const expandable = hasChildren || (row.kind === "node" && hasAnalysis(row.node));
  const guides = Math.max(row.depth - 2, 0);

  if (row.kind === "item" && row.item) {
    return (
      <div className="flex min-w-0 items-center gap-0 px-2" style={{ paddingLeft: 8 }}>
        {Array.from({ length: guides }).map((_, index) => (
          <span key={index} className="w-4 shrink-0 self-stretch border-l border-line/50" />
        ))}
        <span className="ml-1 h-px w-2 shrink-0 bg-muted/30" />
        <span className="ml-1.5 truncate text-[10px] text-muted">{row.item.name}</span>
      </div>
    );
  }

  if (row.kind === "analysis" && row.componentKind) {
    const meta = COMPONENT_COLUMNS.find((column) => column.key === row.componentKind);
    return (
      <div className="flex min-w-0 items-center gap-0 px-2" style={{ paddingLeft: 8 }}>
        {Array.from({ length: guides }).map((_, index) => (
          <span key={index} className="w-4 shrink-0 self-stretch border-l border-line/50" />
        ))}
        <span className={`ml-1 h-3.5 w-0.5 shrink-0 ${meta?.dot ?? "bg-muted"}`} />
        <span className={`ml-1.5 truncate text-[10px] ${meta?.tone ?? "text-muted"}`}>
          {ANALYSIS_LABEL[row.componentKind]}
        </span>
        <span className="ml-1 shrink-0 text-[10px] uppercase tracking-[0.1em] text-muted/40">
          komponen dasar
        </span>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-start gap-1 px-2">
      {expandable ? (
        <button
          type="button"
          aria-label={row.node.is_expanded ? "Collapse" : "Expand"}
          onClick={(event) => {
            event.stopPropagation();
            onToggle();
          }}
          className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center text-[10px] text-muted hover:text-accent"
        >
          {row.node.is_expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
      ) : (
        <span className="mt-0.5 h-4 w-4 shrink-0" />
      )}
      <span
        className={`min-w-0 flex-1 whitespace-normal break-words leading-snug ${
          hasChildren ? "font-medium uppercase text-ink" : "text-muted"
        } ${selected ? "text-ink" : ""}`}
        style={{ paddingLeft: row.depth > 0 ? (row.depth - 1) * 6 : 0 }}
      >
        {row.node.name}
      </span>
    </div>
  );
}

function MethodCell({
  method,
  onSelect,
}: {
  method: PriceMethod;
  onSelect: (method: PriceMethod) => void;
}) {
  const base =
    "rounded-[2px] px-1 py-[1px] text-[10px] uppercase tracking-[0.08em] transition-colors";
  return (
    <div className="flex items-center justify-center gap-0.5">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onSelect("ahsp");
        }}
        className={`${base} ${
          method === "ahsp" ? "bg-accent2/20 text-accent2" : "text-muted/50 hover:text-accent2"
        }`}
      >
        SNI
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onSelect("langsung");
        }}
        className={`${base} ${
          method === "langsung" ? "bg-accent/20 text-accent" : "text-muted/50 hover:text-accent"
        }`}
      >
        LS
      </button>
    </div>
  );
}

function PercentInput({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(() => String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = () => {
    const parsed = parseNumeric(draft);
    setDraft(String(parsed));
    onCommit(parsed);
  };

  return (
    <input
      inputMode="decimal"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === "Escape") event.currentTarget.blur();
      }}
      className="h-[18px] w-10 rounded border border-line/60 bg-shell px-1 text-right font-mono text-[11px] text-ink outline-none transition-colors duration-150 focus:border-accent focus:ring-1 focus:ring-inset focus:ring-accent/25"
    />
  );
}

interface NumberCellProps {
  rowIndex: number;
  row: DisplayRow;
  field: EditableField;
  navigate: (rowIndex: number, field: EditableField, action: NavAction) => void;
  scale?: number;
}

function NumberCell({ rowIndex, row, field, navigate, scale = 1 }: NumberCellProps) {
  const updateCell = useWbsStore((state) => state.updateCell);
  const setActiveCell = useWbsStore((state) => state.setActiveCell);
  const isActive = useWbsStore(
    (state) => state.activeCell?.rowId === row.node.id && state.activeCell.field === field,
  );
  const value = field === "volume" ? row.node.volume : row.node.unit_price * scale;
  const fmt = field === "unit_price" ? formatMoney : formatNumber;
  const [draft, setDraft] = useState(() => fmt(value));
  const skipBlur = useRef(false);

  useEffect(() => {
    setDraft(fmt(value));
  }, [value]);

  const commit = () => {
    const parsed = parseNumeric(draft);
    setDraft(fmt(parsed));
    void updateCell(row.node.id, field, field === "unit_price" ? parsed / scale : parsed);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const step = (action: NavAction) => {
      event.preventDefault();
      skipBlur.current = true;
      commit();
      navigate(rowIndex, field, action);
      window.setTimeout(() => {
        skipBlur.current = false;
      }, 0);
    };

    if (event.key === "Tab") step(event.shiftKey ? "prev" : "next");
    else if (event.key === "Enter") step("down");
    else if (event.key === "ArrowDown") step("down");
    else if (event.key === "ArrowUp") step("up");
    else if (event.key === "Escape") {
      skipBlur.current = true;
      setDraft(fmt(value));
      event.currentTarget.blur();
      window.setTimeout(() => {
        skipBlur.current = false;
      }, 0);
    }
  };

  return (
    <div className="px-1">
      <input
        data-cell={`${rowIndex}:${field}`}
        inputMode="decimal"
        value={draft}
        onFocus={(event) => {
          const input = event.currentTarget;
          setActiveCell({ rowId: row.node.id, field });
          setDraft(String(value));
          requestAnimationFrame(() => input.select());
        }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (skipBlur.current) {
            skipBlur.current = false;
            return;
          }
          commit();
        }}
        onKeyDown={handleKeyDown}
        className={`h-[22px] w-full rounded-[2px] border bg-transparent px-1.5 text-right font-mono text-[10.5px] outline-none ${
          isActive
            ? "border-accent bg-shell text-ink"
            : "border-transparent text-muted hover:border-line focus:border-accent"
        }`}
      />
    </div>
  );
}

function ItemPriceInput({ item }: { item: ComponentItem }) {
  const setItemPrice = useWbsStore((state) => state.setItemPrice);
  const [draft, setDraft] = useState(() => formatMoney(item.base_price));

  useEffect(() => {
    setDraft(formatMoney(item.base_price));
  }, [item.base_price]);

  const commit = () => {
    const parsed = parseNumeric(draft);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed !== item.base_price) {
      void setItemPrice(item.name, item.unit, parsed);
    } else {
      setDraft(formatMoney(item.base_price));
    }
  };

  return (
    <div className="px-1">
      <input
        inputMode="decimal"
        value={draft}
        title="Ubah harga dasar (berlaku ke semua kemunculan item)"
        onFocus={(event) => {
          const input = event.currentTarget;
          setDraft(String(item.base_price));
          requestAnimationFrame(() => input.select());
        }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          else if (event.key === "Escape") {
            setDraft(formatMoney(item.base_price));
            event.currentTarget.blur();
          }
        }}
        className="h-[22px] w-full rounded-[2px] border border-transparent bg-transparent px-1.5 text-right font-mono text-[10.5px] text-muted outline-none hover:border-line focus:border-accent focus:bg-shell focus:text-ink"
      />
    </div>
  );
}
