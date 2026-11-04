import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatIDR, formatKoef, formatNumber, parseNumeric } from "../../lib/format";
import {
  collectLeaves,
  collectUniqueItems,
  COMPONENT_META,
  tenagaMandays,
  type LeafInfo,
} from "../../lib/sheets";
import { ANALYSIS_ORDER } from "../../lib/tree";
import { useWbsStore } from "../../store/useWbsStore";
import { Th, Td, EmptyRow } from "../ui/primitives";

const NUM = "font-mono tabular-nums";

function NumInput({
  value,
  onCommit,
  title,
  className = "",
}: {
  value: number;
  onCommit: (value: number) => void;
  title?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(() => formatNumber(value));
  useEffect(() => {
    setDraft(formatNumber(value));
  }, [value]);

  const commit = () => {
    const parsed = parseNumeric(draft);
    if (parsed !== value) onCommit(parsed);
    else setDraft(formatNumber(value));
  };

  return (
    <input
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={(event) => event.target.select()}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          setDraft(formatNumber(value));
          event.currentTarget.blur();
        }
      }}
      inputMode="decimal"
      title={title}
      className={`h-6 w-24 rounded border border-line/60 bg-shell px-2 text-right font-mono text-[11.5px] text-ink outline-none transition-colors duration-150 focus:border-accent focus:ring-1 focus:ring-inset focus:ring-accent/25 ${className}`}
    />
  );
}

function SheetShell({
  title,
  meta,
  children,
}: {
  title: string;
  meta: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-line bg-panel/60 px-3">
        <span className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-muted">
          {title}
        </span>
        <span className="font-mono text-[10px] text-muted/50">{meta}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto calcir-grid">
        <div className="bg-shell">{children}</div>
      </div>
    </div>
  );
}

function useLeaves(): LeafInfo[] {
  const nodes = useWbsStore((state) => state.nodes);
  const roots = useWbsStore((state) => state.roots);
  return useMemo(() => collectLeaves(nodes, roots), [nodes, roots]);
}

export function VolumeSheet() {
  const leaves = useLeaves();
  const updateCell = useWbsStore((state) => state.updateCell);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const divisions = useMemo(() => {
    const order: Array<{ key: string; code: string; label: string; leaves: LeafInfo[] }> = [];
    const map = new Map<string, (typeof order)[number]>();
    for (const info of leaves) {
      const key = info.division?.id ?? "__none";
      let group = map.get(key);
      if (!group) {
        group = {
          key,
          code: info.division?.code ?? "—",
          label: info.division?.name ?? "Tanpa Divisi",
          leaves: [],
        };
        map.set(key, group);
        order.push(group);
      }
      group.leaves.push(info);
    }
    return order;
  }, [leaves]);

  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <SheetShell title="Volume Pekerjaan" meta={`${leaves.length} item · ${divisions.length} divisi`}>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <Th>Kode</Th>
            <Th>AHSP</Th>
            <Th align="center">Satuan</Th>
            <Th align="right">Volume</Th>
          </tr>
        </thead>
        <tbody>
          {divisions.length === 0 && <EmptyRow cols={4} label="Belum ada pekerjaan. Tambahkan item dari katalog AHSP." />}
          {divisions.map((division) => {
            const isOpen = !collapsed.has(division.key);
            return (
              <FragmentRows key={division.key}>
                <tr
                  onClick={() => toggle(division.key)}
                  className="cursor-pointer border-t border-line bg-panel2/40 hover:bg-panel2/60"
                >
                  <td colSpan={3} className="border-b border-line/40 px-3 py-1.5 text-[11.5px]">
                    <span className="flex items-center gap-2">
                      <span className="flex w-3 items-center text-muted">{isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
                      <span className={`text-muted/70 ${NUM}`}>{division.code}</span>
                      <span className="font-medium text-ink">{division.label}</span>
                    </span>
                  </td>
                  <td
                    className={`border-b border-line/40 px-3 py-1.5 text-right text-[11.5px] ${NUM} text-muted`}
                  >
                    {division.leaves.length} item
                  </td>
                </tr>
                {isOpen &&
                  division.leaves.map(({ node }) => (
                    <tr key={node.id} className="hover:bg-panel2/30">
                      <Td className={`text-muted/70 ${NUM}`}>{node.code}</Td>
                      <Td className="pl-6">{node.name}</Td>
                      <Td align="center" className="text-muted">
                        {node.unit || "—"}
                      </Td>
                      <Td align="right">
                        <NumInput
                          value={node.volume}
                          onCommit={(value) => updateCell(node.id, "volume", value)}
                          title="Ubah volume"
                        />
                      </Td>
                    </tr>
                  ))}
              </FragmentRows>
            );
          })}
        </tbody>
      </table>
    </SheetShell>
  );
}

export function RabSheet() {
  const leaves = useLeaves();
  const overhead = useWbsStore((state) => state.overhead);
  const totalCost = useWbsStore((state) => state.totalCost);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const divisions = useMemo(() => {
    const order: Array<{
      key: string;
      code: string;
      label: string;
      total: number;
      leaves: LeafInfo[];
    }> = [];
    const map = new Map<string, (typeof order)[number]>();
    for (const info of leaves) {
      const key = info.division?.id ?? "__none";
      let group = map.get(key);
      if (!group) {
        group = {
          key,
          code: info.division?.code ?? "—",
          label: info.division?.name ?? "Tanpa Divisi",
          total: 0,
          leaves: [],
        };
        map.set(key, group);
        order.push(group);
      }
      group.total += info.node.total_price;
      group.leaves.push(info);
    }
    return order;
  }, [leaves]);

  const grandTotal = divisions.reduce((sum, group) => sum + group.total, 0);

  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <SheetShell title="RAB" meta={`${leaves.length} item · ${divisions.length} divisi`}>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <Th>Kode</Th>
            <Th>Uraian Pekerjaan</Th>
            <Th align="right">Volume</Th>
            <Th align="center">Satuan</Th>
            <Th align="right">Harga Satuan</Th>
            <Th align="right">Total Biaya</Th>
          </tr>
        </thead>
        <tbody>
          {divisions.length === 0 && <EmptyRow cols={6} label="Belum ada pekerjaan untuk dihitung." />}
          {divisions.map((division) => {
            const isOpen = !collapsed.has(division.key);
            return (
              <FragmentRows key={division.key}>
                <tr
                  onClick={() => toggle(division.key)}
                  className="cursor-pointer border-t border-line bg-panel2/40 hover:bg-panel2/60"
                >
                  <td colSpan={5} className="border-b border-line/40 px-3 py-1.5 text-[11.5px]">
                    <span className="flex items-center gap-2">
                      <span className="flex w-3 items-center text-muted">{isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
                      <span className={`text-muted/70 ${NUM}`}>{division.code}</span>
                      <span className="font-medium text-ink">{division.label}</span>
                    </span>
                  </td>
                  <td
                    className={`border-b border-line/40 px-3 py-1.5 text-right text-[11.5px] ${NUM} font-semibold text-ink`}
                  >
                    {formatIDR(division.total)}
                  </td>
                </tr>
                {isOpen &&
                  division.leaves.map(({ node }) => (
                    <tr key={node.id} className="hover:bg-panel2/30">
                      <Td className={`text-muted/70 ${NUM}`}>{node.code}</Td>
                      <Td className="pl-6">{node.name}</Td>
                      <Td align="right" className={NUM}>
                        {formatNumber(node.volume)}
                      </Td>
                      <Td align="center" className="text-muted">
                        {node.unit || "—"}
                      </Td>
                      <Td align="right" className={NUM}>
                        {formatIDR(node.unit_price)}
                      </Td>
                      <Td align="right" className={`${NUM} font-medium text-ink`}>
                        {formatIDR(node.total_price)}
                      </Td>
                    </tr>
                  ))}
              </FragmentRows>
            );
          })}
          <tr className="border-t border-line bg-panel2/50">
            <td
              colSpan={5}
              className="border-b border-line/40 px-3 py-1.5 text-[11.5px] uppercase tracking-[0.08em] text-ink/70"
            >
              Subtotal RAB
            </td>
            <td
              className={`border-b border-line/40 px-3 py-1.5 text-right text-[11.5px] ${NUM} text-ink/80`}
            >
              {formatIDR(grandTotal)}
            </td>
          </tr>
          {overhead > 0 && (
            <tr>
              <td
                colSpan={5}
                className="border-b border-line/40 px-3 py-1.5 text-[11.5px] uppercase tracking-[0.08em] text-ink/70"
              >
                Overhead ({formatNumber(overhead)}%)
              </td>
              <td className={`border-b border-line/40 px-3 py-1.5 text-right text-[11.5px] ${NUM} text-ink/80`}>
                {formatIDR(grandTotal * (overhead / 100))}
              </td>
            </tr>
          )}
          <tr className="border-t border-line bg-panel2/50">
            <td
              colSpan={5}
              className="border-b border-line/40 px-3 py-1.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink"
            >
              Grand Total (termasuk overhead)
            </td>
            <td
              className={`border-b border-line/40 px-3 py-1.5 text-right text-[11.5px] ${NUM} font-semibold text-ink`}
            >
              {formatIDR(totalCost)}
            </td>
          </tr>
        </tbody>
      </table>
    </SheetShell>
  );
}

export function RekapitulasiSheet() {
  const leaves = useLeaves();
  const overhead = useWbsStore((state) => state.overhead);
  const totalCost = useWbsStore((state) => state.totalCost);
  const groups = useMemo(() => {
    const order: Array<{ key: string; code: string; label: string; total: number }> = [];
    const map = new Map<string, { key: string; code: string; label: string; total: number }>();
    for (const { node, division } of leaves) {
      const key = division?.id ?? "__none";
      let group = map.get(key);
      if (!group) {
        group = {
          key,
          code: division?.code ?? "—",
          label: division?.name ?? "Tanpa Divisi",
          total: 0,
        };
        map.set(key, group);
        order.push(group);
      }
      group.total += node.total_price;
    }
    return order;
  }, [leaves]);

  const grandTotal = groups.reduce((sum, group) => sum + group.total, 0);

  return (
    <SheetShell
      title="Rekapitulasi"
      meta={`${groups.length} divisi${overhead > 0 ? ` · TOTAL ${formatIDR(totalCost)}` : ""}`}
    >
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <Th>Divisi</Th>
            <Th align="right">Total Biaya</Th>
            <Th align="right">Porsi</Th>
          </tr>
        </thead>
        <tbody>
          {groups.length === 0 && <EmptyRow cols={3} label="Belum ada divisi." />}
          {groups.map((group) => {
            const share = grandTotal > 0 ? group.total / grandTotal : 0;
            return (
              <tr key={group.key} className="hover:bg-panel2/30">
                <Td>
                  <span className={`mr-2 text-muted/70 ${NUM}`}>{group.code}</span>
                  {group.label}
                </Td>
                <Td align="right" className={`${NUM} font-medium text-ink`}>
                  {formatIDR(group.total)}
                </Td>
                <Td align="right" className={NUM}>
                  {grandTotal > 0 ? (
                    <span className="flex items-center justify-end gap-2">
                      <span className={`h-1.5 w-16 overflow-hidden rounded-full bg-panel2`}>
                        <span
                          className="block h-full bg-accent/70"
                          style={{ width: `${share * 100}%` }}
                        />
                      </span>
                      <span className="w-10 text-muted">{formatNumber(share * 100)}%</span>
                    </span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </Td>
              </tr>
            );
          })}
          <tr className="border-t border-line bg-panel2/50">
            <Td className="uppercase tracking-[0.08em] text-ink/70">Subtotal RAB</Td>
            <Td align="right" className={`${NUM} text-ink/80`}>
              {formatIDR(grandTotal)}
            </Td>
            <Td align="right" className={`${NUM} text-muted`}>
              {grandTotal > 0 ? "100%" : "—"}
            </Td>
          </tr>
          {overhead > 0 && (
            <tr>
              <Td className="uppercase tracking-[0.08em] text-ink/70">
                Overhead ({formatNumber(overhead)}%)
              </Td>
              <Td align="right" className={`${NUM} text-ink/80`}>
                {formatIDR(grandTotal * (overhead / 100))}
              </Td>
              <Td align="right" className={`${NUM} text-muted`}>
                —
              </Td>
            </tr>
          )}
          <tr className="border-t border-line bg-panel2/50">
            <Td className="font-semibold uppercase tracking-[0.08em] text-ink">
              Grand Total (termasuk overhead)
            </Td>
            <Td align="right" className={`${NUM} font-semibold text-ink`}>
              {formatIDR(totalCost)}
            </Td>
            <Td align="right" className={`${NUM} font-semibold text-muted`}>
              —
            </Td>
          </tr>
        </tbody>
      </table>
    </SheetShell>
  );
}

export function HargaDasarSheet() {
  const nodes = useWbsStore((state) => state.nodes);
  const roots = useWbsStore((state) => state.roots);
  const setItemPrice = useWbsStore((state) => state.setItemPrice);
  const items = useMemo(() => collectUniqueItems(nodes, roots), [nodes, roots]);
  const unfilled = items.filter((item) => item.base_price <= 0).length;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const groups = useMemo(
    () =>
      ANALYSIS_ORDER.map((kind) => ({
        kind,
        items: items.filter((item) => item.kind === kind),
      })).filter((group) => group.items.length > 0),
    [items],
  );

  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <SheetShell
      title="Harga Dasar"
      meta={`${items.length} harga unik${unfilled > 0 ? ` · ${unfilled} belum diisi` : ""}`}
    >
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <Th>Nama</Th>
            <Th align="center">Satuan</Th>
            <Th align="right">Harga Dasar</Th>
            <Th align="right">Status</Th>
          </tr>
        </thead>
        <tbody>
          {groups.length === 0 && <EmptyRow cols={4} label="Belum ada harga dasar dari komponen AHSP." />}
          {groups.map((group) => {
            const meta = COMPONENT_META[group.kind];
            const isOpen = !collapsed.has(group.kind);
            const groupUnfilled = group.items.filter((item) => item.base_price <= 0).length;
            return (
              <FragmentRows key={group.kind}>
                <tr
                  onClick={() => toggle(group.kind)}
                  className="cursor-pointer border-t border-line bg-panel2/40 hover:bg-panel2/60"
                >
                  <td colSpan={4} className="border-b border-line/40 px-3 py-1.5 text-[11.5px]">
                    <span className="flex items-center gap-2">
                      <span className="flex w-3 items-center text-muted">{isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
                      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                      <span className="font-medium text-ink">{meta.label}</span>
                      <span className="text-muted/60">({meta.letter})</span>
                      <span className="text-muted/50">· {group.items.length}</span>
                      {groupUnfilled > 0 && (
                        <span className="text-danger/80">· {groupUnfilled} belum diisi</span>
                      )}
                    </span>
                  </td>
                </tr>
                {isOpen &&
                  group.items.map((item) => (
                    <tr key={item.key} className="hover:bg-panel2/30">
                      <Td className="pl-7">{item.name}</Td>
                      <Td align="center" className="text-muted">
                        {item.unit}
                      </Td>
                      <Td align="right">
                        <NumInput
                          value={item.base_price}
                          onCommit={(value) => setItemPrice(item.name, item.unit, value)}
                          title="Ubah harga dasar (berlaku ke semua kemunculan item)"
                          className="w-28"
                        />
                      </Td>
                      <Td align="right">
                        {item.base_price <= 0 ? (
                          <span className="rounded border border-danger/40 bg-danger/10 px-1.5 py-0.5 text-[10px] text-danger">
                            Belum diisi
                          </span>
                        ) : (
                          <span className="text-muted/40">—</span>
                        )}
                      </Td>
                    </tr>
                  ))}
              </FragmentRows>
            );
          })}
        </tbody>
      </table>
    </SheetShell>
  );
}

export function BoqSheet() {
  const nodes = useWbsStore((state) => state.nodes);
  const roots = useWbsStore((state) => state.roots);
  const overhead = useWbsStore((state) => state.overhead);
  const totalCost = useWbsStore((state) => state.totalCost);
  const items = useMemo(() => collectUniqueItems(nodes, roots), [nodes, roots]);
  const grandTotal = items.reduce((sum, item) => sum + item.subtotal, 0);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const groups = useMemo(
    () =>
      ANALYSIS_ORDER.map((kind) => ({
        kind,
        items: items.filter((item) => item.kind === kind),
      })).filter((group) => group.items.length > 0),
    [items],
  );

  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <SheetShell title="BOQ" meta={`${items.length} material`}>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <Th>Nama</Th>
            <Th align="center">Satuan</Th>
            <Th align="right">Harga Dasar</Th>
            <Th align="right">Kebutuhan</Th>
            <Th align="right">Jumlah</Th>
          </tr>
        </thead>
        <tbody>
          {groups.length === 0 && <EmptyRow cols={5} label="Belum ada material pada komponen AHSP." />}
          {groups.map((group) => {
            const meta = COMPONENT_META[group.kind];
            const isOpen = !collapsed.has(group.kind);
            const groupTotal = group.items.reduce((sum, item) => sum + item.subtotal, 0);
            return (
              <FragmentRows key={group.kind}>
                <tr
                  onClick={() => toggle(group.kind)}
                  className="cursor-pointer border-t border-line bg-panel2/40 hover:bg-panel2/60"
                >
                  <td colSpan={4} className="border-b border-line/40 px-3 py-1.5 text-[11.5px]">
                    <span className="flex items-center gap-2">
                      <span className="flex w-3 items-center text-muted">{isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
                      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                      <span className="font-medium text-ink">{meta.label}</span>
                      <span className="text-muted/60">({meta.letter})</span>
                      <span className="text-muted/50">· {group.items.length}</span>
                    </span>
                  </td>
                  <td
                    className={`border-b border-line/40 px-3 py-1.5 text-right text-[11.5px] ${NUM} font-semibold text-ink`}
                  >
                    {formatIDR(groupTotal)}
                  </td>
                </tr>
                {isOpen &&
                  group.items.map((item) => (
                    <tr key={item.key} className="hover:bg-panel2/30">
                      <Td className="pl-7">{item.name}</Td>
                      <Td align="center" className="text-muted">
                        {item.unit}
                      </Td>
                      <Td align="right" className={item.base_price <= 0 ? "" : NUM}>
                        {item.base_price > 0 ? (
                          formatIDR(item.base_price)
                        ) : (
                          <span className="rounded border border-danger/40 bg-danger/10 px-1.5 py-0.5 text-[10px] text-danger">
                            Belum diisi
                          </span>
                        )}
                      </Td>
                      <Td align="right" className={`${NUM} text-ink/70`}>
                        {formatNumber(item.quantity)}
                      </Td>
                      <Td align="right" className={`${NUM} font-medium text-ink`}>
                        {formatIDR(item.subtotal)}
                      </Td>
                    </tr>
                  ))}
              </FragmentRows>
            );
          })}
          <tr className="border-t border-line bg-panel2/50">
            <td
              colSpan={4}
              className="border-b border-line/40 px-3 py-1.5 text-[11.5px] uppercase tracking-[0.08em] text-ink/70"
            >
              Subtotal BOQ
            </td>
            <td
              className={`border-b border-line/40 px-3 py-1.5 text-right text-[11.5px] ${NUM} text-ink/80`}
            >
              {formatIDR(grandTotal)}
            </td>
          </tr>
          {overhead > 0 && (
            <tr>
              <td
                colSpan={4}
                className="border-b border-line/40 px-3 py-1.5 text-[11.5px] uppercase tracking-[0.08em] text-ink/70"
              >
                Overhead ({formatNumber(overhead)}%)
              </td>
              <td className={`border-b border-line/40 px-3 py-1.5 text-right text-[11.5px] ${NUM} text-ink/80`}>
                {formatIDR(grandTotal * (overhead / 100))}
              </td>
            </tr>
          )}
          <tr className="border-t border-line bg-panel2/50">
            <td
              colSpan={4}
              className="border-b border-line/40 px-3 py-1.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink"
            >
              Grand Total (termasuk overhead)
            </td>
            <td
              className={`border-b border-line/40 px-3 py-1.5 text-right text-[11.5px] ${NUM} font-semibold text-ink`}
            >
              {formatIDR(totalCost)}
            </td>
          </tr>
        </tbody>
      </table>
    </SheetShell>
  );
}

export function AnalisaSheet() {
  const leaves = useLeaves();
  return (
    <SheetShell title="Analisa" meta={`${leaves.length} analisa`}>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <Th>Kode</Th>
            <Th>Uraian</Th>
            <Th align="center">Satuan</Th>
            <Th align="right">Koef</Th>
            <Th align="right">Harga Dasar</Th>
            <Th align="right">Subtotal</Th>
            <Th align="right">Harga Satuan Pekerjaan</Th>
          </tr>
        </thead>
        <tbody>
          {leaves.length === 0 && <EmptyRow cols={7} label="Belum ada analisa pekerjaan." />}
          {leaves.map(({ node }) => (
            <AnalisaBlock key={node.id} id={node.id} />
          ))}
        </tbody>
      </table>
    </SheetShell>
  );
}

function AnalisaBlock({ id }: { id: string }) {
  const node = useWbsStore((state) => state.nodes[id]);
  if (!node) return null;
  return (
    <>
      <tr className="border-t border-line bg-panel2/50">
        <Td className={`text-muted ${NUM}`}>{node.code}</Td>
        <Td className="font-medium text-ink">{node.name}</Td>
        <Td align="center" className="text-muted">
          {node.unit || "—"}
        </Td>
        <Td />
        <Td />
        <Td />
        <Td align="right" className={`${NUM} font-semibold text-ink`}>
          {formatIDR(node.unit_price)}
        </Td>
      </tr>
      {ANALYSIS_ORDER.map((kind) => {
        const component = node.components[kind];
        if (component.subtotal <= 0 && component.items.length === 0) return null;
        const meta = COMPONENT_META[kind];
        return (
          <FragmentRows key={kind}>
            <tr className="bg-shell/40">
              <Td />
              <Td className={meta.text}>
                {meta.letter} · {meta.label}
              </Td>
              <Td />
              <Td />
              <Td />
              <Td align="right" className={`${NUM} ${meta.text}`}>
                {formatIDR(component.subtotal)}
              </Td>
              <Td />
            </tr>
            {component.items.map((item, index) => (
              <tr key={index} className="hover:bg-panel2/30">
                <Td />
                <Td className="pl-8 text-ink/80">{item.name}</Td>
                <Td align="center" className="text-muted">
                  {item.unit}
                </Td>
                <Td align="right" className={`${NUM} text-muted`}>
                  {formatKoef(item.coefficient)}
                </Td>
                <Td align="right" className={NUM}>
                  {formatIDR(item.base_price)}
                </Td>
                <Td align="right" className={`${NUM} text-ink/80`}>
                  {formatIDR(item.subtotal)}
                </Td>
                <Td />
              </tr>
            ))}
          </FragmentRows>
        );
      })}
    </>
  );
}

function FragmentRows({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function RencanaKerjaSheet() {
  const leaves = useLeaves();
  const workPlans = useWbsStore((state) => state.workPlans);
  const setWorkPlan = useWbsStore((state) => state.setWorkPlan);
  const [drafts, setDrafts] = useState<Record<string, { workers: string; duration: string }>>({});

  useEffect(() => {
    setDrafts((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [id, plan] of Object.entries(workPlans)) {
        if (!next[id]) {
          next[id] = {
            workers: plan.num_workers ? formatNumber(plan.num_workers) : "",
            duration: plan.duration_days ? formatNumber(plan.duration_days) : "",
          };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [workPlans]);

  const setWorkers = (id: string, mandays: number, raw: string) => {
    const workers = parseNumeric(raw);
    const duration = mandays > 0 && workers > 0 ? formatNumber(mandays / workers) : "";
    setDrafts((prev) => ({ ...prev, [id]: { workers: raw, duration } }));
  };

  const setDuration = (id: string, mandays: number, raw: string) => {
    const duration = parseNumeric(raw);
    const workers = mandays > 0 && duration > 0 ? formatNumber(mandays / duration) : "";
    setDrafts((prev) => ({ ...prev, [id]: { workers, duration: raw } }));
  };

  const commit = (id: string) => {
    const entry = drafts[id];
    if (!entry) return;
    void setWorkPlan(id, parseNumeric(entry.workers) || 0, parseNumeric(entry.duration) || 0);
  };

  const totalMandays = leaves.reduce((sum, { node }) => sum + tenagaMandays(node), 0);

  return (
    <SheetShell title="Rencana Kerja" meta={`${formatNumber(totalMandays)} mandays`}>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <Th>Kode</Th>
            <Th>AHSP</Th>
            <Th align="center">Satuan</Th>
            <Th align="right">Volume</Th>
            <Th align="right">Mandays (OH)</Th>
            <Th align="right">Jumlah Pekerja</Th>
            <Th align="right">Durasi (hari)</Th>
          </tr>
        </thead>
        <tbody>
          {leaves.length === 0 && <EmptyRow cols={7} label="Belum ada pekerjaan pada rencana kerja." />}
          {leaves.map(({ node }) => {
            const mandays = tenagaMandays(node);
            const entry = drafts[node.id] ?? { workers: "", duration: "" };
            return (
              <tr key={node.id} className="hover:bg-panel2/30">
                <Td className={`text-muted/70 ${NUM}`}>{node.code}</Td>
                <Td>{node.name}</Td>
                <Td align="center" className="text-muted">
                  {node.unit || "—"}
                </Td>
                <Td align="right" className={NUM}>
                  {formatNumber(node.volume)}
                </Td>
                <Td align="right" className={`${NUM} text-ink/70`}>
                  {formatNumber(mandays)}
                </Td>
                <Td align="right">
                  <input
                    value={entry.workers}
                    onChange={(event) => setWorkers(node.id, mandays, event.target.value)}
                    onBlur={() => commit(node.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                    }}
                    inputMode="decimal"
                    placeholder="—"
                    className="h-6 w-20 rounded border border-line bg-shell px-2 text-right font-mono text-[11.5px] text-ink outline-none placeholder:text-muted/40 transition-colors hover:border-accent/50 focus:border-accent"
                  />
                </Td>
                <Td align="right">
                  <input
                    value={entry.duration}
                    onChange={(event) => setDuration(node.id, mandays, event.target.value)}
                    onBlur={() => commit(node.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                    }}
                    inputMode="decimal"
                    placeholder="—"
                    className="h-6 w-20 rounded border border-line bg-shell px-2 text-right font-mono text-[11.5px] text-ink outline-none placeholder:text-muted/40 transition-colors hover:border-accent/50 focus:border-accent"
                  />
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </SheetShell>
  );
}
