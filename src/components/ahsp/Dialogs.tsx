import { useEffect, useMemo, useState } from "react";
import { useWbsStore } from "../../store/useWbsStore";
import { useUiStore } from "../../store/useUiStore";
import { SNI_DIVISIONS } from "../../lib/divisions";
import {
  ahspLeafToNode,
  buildComponents,
  buildPriceLookup,
  divisionOfItem,
  loadAhspCatalog,
  resourcesOf,
  subdivisionsOf,
  subtreeCodes,
  suggestWbsDivision,
  type AhspCatalog,
  type AhspItem,
} from "../../lib/ahsp";
import { formatIDR, formatKoef, formatNumber, parseNumeric } from "../../lib/format";
import type { WbsComponents, WbsNode } from "../../types/wbs";

export function DialogHost() {
  return (
    <>
      <AddPekerjaanDialog />
      <AddDirectDialog />
      <RemoveConfirmDialog />
    </>
  );
}

function resolveDivisionId(catalog: AhspCatalog, item: AhspItem, divisions: WbsNode[]): string {
  const index = catalog.divisions.findIndex((division) => division.id === item.divisionId);
  if (index >= 0) {
    const code = SNI_DIVISIONS[index]?.code;
    const match = divisions.find((division) => division.code === code);
    if (match) return match.id;
  }
  return suggestWbsDivision(catalog, item, divisions)?.id ?? divisions[0]?.id ?? "";
}

interface CartEntry {
  uid: string;
  item: AhspItem;
  volume: string;
  divisionId: string;
}

function AddPekerjaanDialog() {
  const open = useUiStore((state) => state.addOpen);
  const close = useUiStore((state) => state.closeAdd);
  const nodes = useWbsStore((state) => state.nodes);
  const roots = useWbsStore((state) => state.roots);
  const addNode = useWbsStore((state) => state.addNode);

  const [catalog, setCatalog] = useState<AhspCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [divisionId, setDivisionId] = useState<number | "">("");
  const [subCode, setSubCode] = useState("");
  const [selected, setSelected] = useState<AhspItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [cart, setCart] = useState<CartEntry[]>([]);

  const divisions = useMemo(
    () => roots.map((id) => nodes[id]).filter((node): node is NonNullable<typeof node> => Boolean(node)),
    [roots, nodes],
  );
  const priceLookup = useMemo(() => buildPriceLookup(nodes), [nodes]);
  const subdivisions = useMemo(
    () => (catalog && divisionId !== "" ? subdivisionsOf(catalog, divisionId) : []),
    [catalog, divisionId],
  );
  const results = useMemo(() => {
    if (!catalog) return [];
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    let pool = catalog.leaves;
    if (subCode) {
      const codes = subtreeCodes(catalog, subCode);
      pool = pool.filter((leaf) => codes.has(leaf.code));
    } else if (divisionId !== "") {
      pool = pool.filter((leaf) => leaf.divisionId === divisionId);
    }
    if (tokens.length > 0) {
      pool = pool.filter((leaf) => {
        const haystack = `${leaf.code} ${leaf.name}`.toLowerCase();
        return tokens.every((token) => haystack.includes(token));
      });
    }
    return pool.slice(0, 80);
  }, [catalog, query, divisionId, subCode]);
  const resources = useMemo(
    () => (catalog && selected ? resourcesOf(catalog, selected.id) : []),
    [catalog, selected],
  );
  const components = useMemo(
    () => (selected ? buildComponents(resources, priceLookup) : null),
    [selected, resources, priceLookup],
  );

  useEffect(() => {
    if (!open) return;
    setError(null);
    setBusy(false);
    setQuery("");
    setDivisionId("");
    setSubCode("");
    setSelected(null);
    setCart([]);
    void loadAhspCatalog().then(setCatalog).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const toggleCart = (item: AhspItem) => {
    setCart((current) => {
      if (current.some((entry) => entry.item.id === item.id)) {
        return current.filter((entry) => entry.item.id !== item.id);
      }
      return [
        ...current,
        {
          uid: `${item.id}-${Date.now().toString(36)}`,
          item,
          volume: "1",
          divisionId: catalog ? resolveDivisionId(catalog, item, divisions) : "",
        },
      ];
    });
  };

  const inCart = (id: string) => cart.some((entry) => entry.item.id === id);

  const submitAll = async () => {
    if (!catalog || cart.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const used = new Set<string>(Object.keys(nodes));
      for (const entry of cart) {
        const itemResources = resourcesOf(catalog, entry.item.id);
        const entryVolume = parseNumeric(entry.volume);
        const effective = Number.isFinite(entryVolume) && entryVolume > 0 ? entryVolume : 1;
        const node = ahspLeafToNode(entry.item, itemResources, priceLookup, effective);
        let id = node.id;
        let suffix = 1;
        while (used.has(id)) {
          id = `${node.id}-${suffix++}`;
        }
        used.add(id);
        node.id = id;
        await addNode(entry.divisionId || null, node);
      }
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const selectedDivision = catalog && selected ? divisionOfItem(catalog, selected) : undefined;
  const targetDivision =
    catalog && selected ? nodes[resolveDivisionId(catalog, selected, divisions)] : undefined;

  return (
    <Overlay onClose={close}>
      <div className="flex h-[620px] w-[880px] max-w-[94vw] flex-col rounded-md border border-line bg-panel shadow-2xl">
        <header className="flex h-10 shrink-0 items-center justify-between border-b border-line px-4">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink">
            Tambah Pekerjaan dari AHSP
          </span>
          <button
            type="button"
            onClick={close}
            className="grid h-6 w-6 place-items-center rounded-sm text-muted transition-colors hover:bg-panel2 hover:text-ink"
          >
            ✕
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
          <div className="flex w-[340px] shrink-0 flex-col border-r border-line">
            <div className="border-b border-line p-2">
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cari kode atau nama pekerjaan…"
                className="w-full rounded-[3px] border border-line/60 bg-shell px-2 py-1.5 text-[11px] text-ink outline-none focus:border-accent"
              />
            </div>
            <div className="flex flex-col gap-1.5 border-b border-line px-2 py-2">
              <label className="flex items-center gap-2">
                <span className="w-14 shrink-0 text-[9px] uppercase tracking-widest text-muted/60">Divisi</span>
                <select
                  value={divisionId === "" ? "" : String(divisionId)}
                  onChange={(event) => {
                    const value = event.target.value;
                    setDivisionId(value === "" ? "" : Number(value));
                    setSubCode("");
                  }}
                  className="min-w-0 flex-1 rounded-[3px] border border-line/60 bg-shell px-1.5 py-1 text-[10.5px] text-ink outline-none focus:border-accent"
                >
                  <option value="">Semua divisi</option>
                  {catalog?.divisions.map((division) => (
                    <option key={division.id} value={division.id}>
                      {division.code}. {division.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2">
                <span className="w-14 shrink-0 text-[9px] uppercase tracking-widest text-muted/60">Sub</span>
                <select
                  value={subCode}
                  onChange={(event) => setSubCode(event.target.value)}
                  disabled={divisionId === "" || subdivisions.length === 0}
                  className="min-w-0 flex-1 rounded-[3px] border border-line/60 bg-shell px-1.5 py-1 text-[10.5px] text-ink outline-none focus:border-accent disabled:opacity-40"
                >
                  <option value="">Semua sub divisi</option>
                  {subdivisions.map((sub) => (
                    <option key={sub.id} value={sub.code}>
                      {sub.code} {sub.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {results.map((item) => (
                <div
                  key={item.id}
                  className={`flex items-stretch border-b border-line/30 transition-colors ${
                    selected?.id === item.id ? "bg-accent/10" : "hover:bg-panel2/60"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleCart(item)}
                    title={inCart(item.id) ? "Keluarkan dari keranjang" : "Masukkan ke keranjang"}
                    className="flex w-8 shrink-0 items-center justify-center"
                  >
                    <span
                      className={`grid h-4 w-4 place-items-center rounded-[3px] border text-[10px] leading-none transition-colors ${
                        inCart(item.id)
                          ? "border-accent bg-accent text-shell"
                          : "border-line/70 text-transparent hover:border-accent/60"
                      }`}
                    >
                      ✓
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelected(item)}
                    className="flex min-w-0 flex-1 flex-col items-start gap-0.5 py-1.5 pr-3 text-left"
                  >
                    <span className="font-mono text-[9.5px] text-accent">{item.code}</span>
                    <span className="text-[10.5px] leading-snug text-ink/90">{item.name}</span>
                  </button>
                </div>
              ))}
              {results.length === 0 && (
                <p className="p-3 text-[10.5px] text-muted/60">
                  {catalog ? "Tidak ada pekerjaan cocok." : "Memuat katalog…"}
                </p>
              )}
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            {selected && components ? (
              <>
                <div className="min-h-0 flex-1 overflow-auto p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="rounded-sm border border-accent/40 bg-accent/10 px-1.5 py-0.5 font-mono text-[10px] text-accent">
                      {selected.code}
                    </span>
                    <span className="text-[9px] uppercase tracking-widest text-muted/60">
                      {selectedDivision?.name ?? "—"} · {selected.unit}
                    </span>
                  </div>
                  <h3 className="mb-3 text-[12px] font-medium leading-snug text-ink">{selected.name}</h3>

                  <table className="w-full border-collapse text-[10.5px]">
                    <thead>
                      <tr className="border-b border-line text-[8.5px] uppercase tracking-widest text-muted">
                        <th className="px-2 py-1 text-left font-semibold">Komponen</th>
                        <th className="px-2 py-1 text-right font-semibold">Koef</th>
                        <th className="px-2 py-1 text-right font-semibold">Harga Dasar</th>
                        <th className="px-2 py-1 text-right font-semibold">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(["tenaga", "bahan", "alat"] as const).map((kind) =>
                        components[kind].items.length > 0 ? (
                          components[kind].items.map((item, index) => (
                            <tr key={`${kind}-${index}`} className="border-b border-line/30">
                              <td className="px-2 py-1 text-ink/85">
                                {index === 0 && (
                                  <span className="mr-1.5 text-[9px] uppercase tracking-widest text-muted/60">
                                    {kind}
                                  </span>
                                )}
                                {item.name}
                              </td>
                              <td className="px-2 py-1 text-right font-mono tabular-nums text-muted">
                                {formatKoef(item.coefficient)}
                              </td>
                              <td className="px-2 py-1 text-right font-mono tabular-nums text-ink/80">
                                {item.base_price > 0 ? (
                                  formatIDR(item.base_price)
                                ) : (
                                  <span className="text-danger/70">belum diisi</span>
                                )}
                              </td>
                              <td className="px-2 py-1 text-right font-mono tabular-nums text-ink/80">
                                {formatIDR(item.subtotal)}
                              </td>
                            </tr>
                          ))
                        ) : null,
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="shrink-0 border-t border-line px-3 py-2">
                  <div className="flex items-center justify-between gap-2 text-[9.5px]">
                    <span className="uppercase tracking-widest text-muted/60">Divisi otomatis</span>
                    <span className="truncate text-muted/80">
                      {targetDivision ? `${targetDivision.code} ${targetDivision.name}` : "—"}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <p className="m-auto p-4 text-[11px] text-muted/60">
                Pilih pekerjaan dari daftar untuk melihat rincian komponen.
              </p>
            )}
          </div>
        </div>

        <div className="flex max-h-[164px] min-h-[76px] shrink-0 flex-col border-t border-line bg-panel2/30">
          <div className="flex h-7 shrink-0 items-center justify-between px-4">
            <span className="text-[8.5px] font-semibold uppercase tracking-widest text-muted/60">
              Keranjang ({cart.length})
            </span>
            <span className="font-mono text-[9px] text-muted/50">
              {cart.length > 0 ? "ubah volume bila perlu, lalu Tambahkan Semua" : "belum ada item"}
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
            {cart.length === 0 ? (
              <p className="px-2 py-2 text-[10.5px] text-muted/50">
                Centang pekerjaan di daftar untuk memasukkannya ke keranjang.
              </p>
            ) : (
              cart.map((entry, index) => {
                const division = nodes[entry.divisionId];
                return (
                  <div
                    key={entry.uid}
                    className="flex items-center gap-2 rounded-[3px] px-2 py-1 hover:bg-panel2/60"
                  >
                    <span className="w-4 shrink-0 text-[9px] text-muted/50">{index + 1}</span>
                    <span className="w-24 shrink-0 truncate font-mono text-[9.5px] text-accent">
                      {entry.item.code}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[10.5px] text-ink/90">
                      {entry.item.name}
                    </span>
                    <span className="w-10 shrink-0 text-[9.5px] text-muted">{entry.item.unit}</span>
                    <input
                      inputMode="decimal"
                      value={entry.volume}
                      onChange={(event) =>
                        setCart((current) =>
                          current.map((item) =>
                            item.uid === entry.uid ? { ...item, volume: event.target.value } : item,
                          ),
                        )
                      }
                      className="h-6 w-20 shrink-0 rounded-[3px] border border-line/60 bg-shell px-1.5 text-right font-mono text-[10px] text-ink outline-none focus:border-accent"
                    />
                    <span className="w-36 shrink-0 truncate text-[9px] uppercase tracking-wide text-muted/60">
                      {division ? `${division.code} ${division.name}` : "—"}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setCart((current) => current.filter((item) => item.uid !== entry.uid))
                      }
                      className="grid h-5 w-5 shrink-0 place-items-center rounded-sm text-muted transition hover:bg-danger/20 hover:text-danger"
                    >
                      ✕
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <footer className="flex h-12 shrink-0 items-center justify-between border-t border-line px-4">
          {error ? (
            <span className="text-[10.5px] text-danger">{error}</span>
          ) : (
            <span className="text-[10.5px] text-muted/60">
              {cart.length === 0
                ? "Keranjang kosong"
                : `${cart.length} pekerjaan siap ditambahkan ke divisinya`}
            </span>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={close}
              className="rounded-[3px] border border-line px-3 py-1.5 text-[10.5px] text-muted transition hover:bg-panel2 hover:text-ink"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={cart.length === 0 || busy}
              onClick={() => void submitAll()}
              className="rounded-[3px] border border-accent/50 bg-accent/20 px-4 py-1.5 text-[10.5px] font-medium text-accent transition hover:bg-accent/30 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Menambah…" : `Tambahkan Semua${cart.length > 0 ? ` (${cart.length})` : ""}`}
            </button>
          </div>
        </footer>
      </div>
    </Overlay>
  );
}

function zeroComponents(): WbsComponents {
  const blank = () => ({ coefficient: 0, base_price: 0, subtotal: 0, items: [] });
  return { bahan: blank(), tenaga: blank(), alat: blank() };
}

function AddDirectDialog() {
  const open = useUiStore((state) => state.addDirectOpen);
  const close = useUiStore((state) => state.closeAddDirect);
  const nodes = useWbsStore((state) => state.nodes);
  const roots = useWbsStore((state) => state.roots);
  const addNode = useWbsStore((state) => state.addNode);

  const [name, setName] = useState("");
  const [unit, setUnit] = useState("ls");
  const [volume, setVolume] = useState("1");
  const [price, setPrice] = useState("");
  const [divisionId, setDivisionId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const divisions = useMemo(
    () => roots.map((id) => nodes[id]).filter((node): node is NonNullable<typeof node> => Boolean(node)),
    [roots, nodes],
  );

  useEffect(() => {
    if (!open) return;
    setName("");
    setUnit("ls");
    setVolume("1");
    setPrice("");
    setError(null);
    setBusy(false);
    setDivisionId(divisions[0]?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const parent = divisionId ? nodes[divisionId] : undefined;
  const volumeValue = parseNumeric(volume);
  const priceValue = parseNumeric(price);
  const effectiveVolume = Number.isFinite(volumeValue) && volumeValue > 0 ? volumeValue : 0;
  const effectivePrice = Number.isFinite(priceValue) && priceValue >= 0 ? priceValue : 0;
  const code = parent ? `${parent.code}.${parent.children_ids.length + 1}` : "LS";
  const canSubmit = name.trim().length > 0 && unit.trim().length > 0 && effectiveVolume > 0 && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    let id = `ls-${Date.now().toString(36)}`;
    let suffix = 1;
    while (nodes[id]) id = `ls-${Date.now().toString(36)}-${suffix++}`;
    const node: WbsNode = {
      id,
      parent_id: null,
      children_ids: [],
      code,
      name: name.trim(),
      unit: unit.trim(),
      volume: effectiveVolume,
      unit_price: effectivePrice,
      total_price: effectiveVolume * effectivePrice,
      is_expanded: false,
      components: zeroComponents(),
      method: "langsung",
    };
    setBusy(true);
    setError(null);
    try {
      await addNode(divisionId || null, node);
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Overlay onClose={close}>
      <div className="w-[520px] max-w-[92vw] rounded-md border border-line bg-panel shadow-2xl">
        <header className="flex h-10 shrink-0 items-center justify-between border-b border-line px-4">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink">
            Tambah Pekerjaan Langsung
          </span>
          <button
            type="button"
            onClick={close}
            className="grid h-6 w-6 place-items-center rounded-sm text-muted transition-colors hover:bg-panel2 hover:text-ink"
          >
            ✕
          </button>
        </header>

        <div className="grid grid-cols-2 gap-3 px-4 py-4">
          <label className="col-span-2 block">
            <span className="mb-1 block text-[8.5px] uppercase tracking-widest text-muted/60">
              Uraian Pekerjaan
            </span>
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="mis. Pembersihan lahan & pengukuran"
              className="w-full rounded-[3px] border border-line/60 bg-shell px-2 py-1.5 text-[11px] text-ink outline-none focus:border-accent"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[8.5px] uppercase tracking-widest text-muted/60">Satuan</span>
            <input
              value={unit}
              onChange={(event) => setUnit(event.target.value)}
              placeholder="m2 / m3 / ls"
              className="w-full rounded-[3px] border border-line/60 bg-shell px-2 py-1.5 text-[11px] text-ink outline-none focus:border-accent"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[8.5px] uppercase tracking-widest text-muted/60">Volume</span>
            <input
              inputMode="decimal"
              value={volume}
              onChange={(event) => setVolume(event.target.value)}
              className="w-full rounded-[3px] border border-line/60 bg-shell px-2 py-1.5 text-right font-mono text-[11px] text-ink outline-none focus:border-accent"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[8.5px] uppercase tracking-widest text-muted/60">
              Harga Satuan
            </span>
            <input
              inputMode="decimal"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              placeholder="0"
              className="w-full rounded-[3px] border border-line/60 bg-shell px-2 py-1.5 text-right font-mono text-[11px] text-ink outline-none focus:border-accent"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[8.5px] uppercase tracking-widest text-muted/60">
              Divisi tujuan
            </span>
            <select
              value={divisionId}
              onChange={(event) => setDivisionId(event.target.value)}
              className="w-full rounded-[3px] border border-line/60 bg-shell px-2 py-1.5 text-[11px] text-ink outline-none focus:border-accent"
            >
              {divisions.map((division) => (
                <option key={division.id} value={division.id}>
                  {division.code} {division.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <footer className="flex h-12 shrink-0 items-center justify-between border-t border-line px-4">
          <div className="flex items-baseline gap-2 text-[10.5px] text-muted">
            <span className="text-[8.5px] uppercase tracking-widest text-muted/60">Total Biaya</span>
            <span className="font-mono text-[12px] font-semibold text-accent">
              {formatIDR(effectiveVolume * effectivePrice)}
            </span>
            <span className="text-muted/60">
              ({formatNumber(effectiveVolume)} × {formatIDR(effectivePrice)})
            </span>
          </div>
          {error && <span className="text-[10.5px] text-danger">{error}</span>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={close}
              className="rounded-[3px] border border-line px-3 py-1.5 text-[10.5px] text-muted transition hover:bg-panel2 hover:text-ink"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => void submit()}
              className="rounded-[3px] border border-accent/50 bg-accent/20 px-4 py-1.5 text-[10.5px] font-medium text-accent transition hover:bg-accent/30 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Menambah…" : "Tambah Pekerjaan"}
            </button>
          </div>
        </footer>
      </div>
    </Overlay>
  );
}

function RemoveConfirmDialog() {
  const removeTargetIds = useUiStore((state) => state.removeTargetIds);
  const cancelRemove = useUiStore((state) => state.cancelRemove);
  const nodes = useWbsStore((state) => state.nodes);
  const removeNodes = useWbsStore((state) => state.removeNodes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targets = (removeTargetIds ?? [])
    .map((id) => nodes[id])
    .filter((node): node is WbsNode => Boolean(node));

  useEffect(() => {
    setBusy(false);
    setError(null);
  }, [removeTargetIds]);

  if (!removeTargetIds || targets.length === 0) return null;

  const confirm = async () => {
    setBusy(true);
    try {
      await removeNodes(targets.map((node) => node.id));
      cancelRemove();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const many = targets.length > 1;

  return (
    <Overlay onClose={cancelRemove}>
      <div className="w-[420px] max-w-[92vw] rounded-md border border-line bg-panel shadow-2xl">
        <header className="border-b border-line px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink">
          Hapus Pekerjaan
        </header>
        <div className="px-4 py-4">
          {many ? (
            <>
              <p className="text-[11px] leading-relaxed text-muted">
                Hapus <span className="text-ink">{targets.length}</span> pekerjaan terpilih? Tindakan
                ini tidak dapat dibatalkan.
              </p>
              <ul className="mt-2 max-h-40 overflow-auto rounded-[3px] border border-line/60 bg-shell/60 py-1">
                {targets.map((node) => (
                  <li key={node.id} className="flex gap-2 px-2 py-0.5 text-[10.5px] text-muted">
                    <span className="font-mono text-accent/70">{node.code}</span>
                    <span className="truncate text-ink/90">{node.name}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-[11px] leading-relaxed text-muted">
              Hapus pekerjaan <span className="text-ink">{targets[0].name}</span> ({targets[0].code})?
              Tindakan ini tidak dapat dibatalkan.
            </p>
          )}
          {error && <p className="mt-2 text-[10.5px] text-danger">{error}</p>}
        </div>
        <footer className="flex justify-end gap-2 border-t border-line px-4 py-3">
          <button
            type="button"
            onClick={cancelRemove}
            className="rounded-[3px] border border-line px-3 py-1.5 text-[10.5px] text-muted transition hover:bg-panel2 hover:text-ink"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void confirm()}
            className="rounded-[3px] border border-danger/50 bg-danger/20 px-4 py-1.5 text-[10.5px] font-medium text-danger transition hover:bg-danger/30 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Menghapus…" : many ? `Hapus ${targets.length}` : "Hapus"}
          </button>
        </footer>
      </div>
    </Overlay>
  );
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {children}
    </div>
  );
}
