import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, inputClass, labelClass } from "../ui/primitives";
import { useUiStore } from "../../store/useUiStore";
import { useWbsStore } from "../../store/useWbsStore";
import { formatIDR } from "../../lib/format";
import type { WbsNode } from "../../types/wbs";

/* ------------------------------------------------------------------ */
/* Project Info                                                        */
/* ------------------------------------------------------------------ */

function ProjectInfoDialog() {
  const close = useUiStore((state) => state.closeProjectInfo);
  const projectInfo = useWbsStore((state) => state.projectInfo);
  const saveProjectInfo = useWbsStore((state) => state.saveProjectInfo);
  const [form, setForm] = useState(projectInfo);

  const update = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }));

  return (
    <Modal title="Project Info" subtitle="Metadata header dokumen RAB" onClose={close}>
      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2 flex flex-col gap-1">
          <span className={labelClass}>Nama Proyek</span>
          <input className={inputClass} value={form.name} onChange={update("name")} />
        </label>
        <label className="col-span-2 flex flex-col gap-1">
          <span className={labelClass}>Lokasi</span>
          <input className={inputClass} value={form.location} onChange={update("location")} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Pemilik</span>
          <input className={inputClass} value={form.owner} onChange={update("owner")} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Kontraktor</span>
          <input className={inputClass} value={form.contractor} onChange={update("contractor")} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>No. Kontrak</span>
          <input className={inputClass} value={form.contract_no} onChange={update("contract_no")} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Tanggal Mulai</span>
          <input
            type="date"
            className={inputClass}
            value={form.start_date}
            onChange={update("start_date")}
          />
        </label>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={close}
          className="rounded-sm border border-line px-3 py-1.5 text-[10px] text-muted hover:bg-shell"
        >
          Batal
        </button>
        <button
          type="button"
          onClick={() => {
            void saveProjectInfo(form).then(close);
          }}
          className="rounded-sm bg-accent px-3 py-1.5 text-[10px] font-semibold text-white hover:opacity-90"
        >
          Simpan
        </button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* History                                                             */
/* ------------------------------------------------------------------ */

function HistoryDialog() {
  const close = useUiStore((state) => state.closeHistory);
  const history = useWbsStore((state) => state.history);
  const loadHistory = useWbsStore((state) => state.loadHistory);
  const undo = useWbsStore((state) => state.undo);
  const redo = useWbsStore((state) => state.redo);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const Column = ({ title, items, tone }: { title: string; items: string[]; tone: string }) => (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={`mb-1 text-[10px] font-semibold uppercase tracking-[0.1em] ${tone}`}>
        {title} ({items.length})
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto rounded-sm border border-line bg-shell p-2">
        {items.length === 0 ? (
          <div className="text-[10px] text-muted/60">Kosong</div>
        ) : (
          items.map((item, index) => (
            <div
              key={`${item}-${index}`}
              className="truncate rounded-sm border border-line/60 bg-panel px-2 py-1 text-[10px] text-muted"
            >
              {item}
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <Modal
      title="History"
      subtitle="Riwayat perubahan undo / redo"
      onClose={close}
      width="max-w-[720px]"
    >
      <div className="flex h-[320px] gap-3">
        <Column title="Undo" items={history.undo} tone="text-accent" />
        <Column title="Redo" items={history.redo} tone="text-muted/70" />
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => void loadHistory()}
          className="rounded-sm border border-line px-3 py-1.5 text-[10px] text-muted hover:bg-shell"
        >
          Muat Ulang
        </button>
        <button
          type="button"
          disabled={!history.can_undo}
          onClick={() => void undo().then(loadHistory)}
          className="rounded-sm border border-line px-3 py-1.5 text-[10px] text-muted hover:bg-shell disabled:opacity-40"
        >
          Undo
        </button>
        <button
          type="button"
          disabled={!history.can_redo}
          onClick={() => void redo().then(loadHistory)}
          className="rounded-sm bg-accent px-3 py-1.5 text-[10px] font-semibold text-white hover:opacity-90 disabled:opacity-40"
        >
          Redo
        </button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Options                                                             */
/* ------------------------------------------------------------------ */

function OptionsDialog() {
  const close = useUiStore((state) => state.closeOptions);
  const overhead = useWbsStore((state) => state.overhead);
  const ppn = useWbsStore((state) => state.ppn);
  const setOverhead = useWbsStore((state) => state.setOverhead);
  const setPpn = useWbsStore((state) => state.setPpn);
  const [overheadInput, setOverheadInput] = useState(String(overhead));
  const [ppnInput, setPpnInput] = useState(String(ppn));

  return (
    <Modal title="Options" subtitle="Preferensi perhitungan RAB" onClose={close}>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Overhead (%)</span>
          <input
            type="number"
            min={0}
            step={0.5}
            className={inputClass}
            value={overheadInput}
            onChange={(event) => setOverheadInput(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>PPN (%)</span>
          <input
            type="number"
            min={0}
            step={0.5}
            className={inputClass}
            value={ppnInput}
            onChange={(event) => setPpnInput(event.target.value)}
          />
        </label>
      </div>
      <p className="mt-3 text-[10px] leading-relaxed text-muted/70">
        Overhead langsung memengaruhi total engine. PPN saat ini hanya berlaku pada perhitungan
        tampilan; dokumen PDF mengikuti standar 11%.
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={close}
          className="rounded-sm border border-line px-3 py-1.5 text-[10px] text-muted hover:bg-shell"
        >
          Batal
        </button>
        <button
          type="button"
          onClick={() => {
            void setOverhead(Number(overheadInput));
            setPpn(Number(ppnInput));
            close();
          }}
          className="rounded-sm bg-accent px-3 py-1.5 text-[10px] font-semibold text-white hover:opacity-90"
        >
          Terapkan
        </button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Find                                                                */
/* ------------------------------------------------------------------ */

function FindDialog() {
  const close = useUiStore((state) => state.closeFind);
  const nodes = useWbsStore((state) => state.nodes);
  const selectRow = useWbsStore((state) => state.selectRow);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [] as WbsNode[];
    return Object.values(nodes)
      .filter(
        (node) =>
          node.name.toLowerCase().includes(needle) ||
          node.code.toLowerCase().includes(needle),
      )
      .slice(0, 60);
  }, [nodes, query]);

  const choose = (node: WbsNode) => {
    selectRow(node.id);
    close();
  };

  return (
    <Modal title="Find" subtitle="Cari pekerjaan berdasarkan kode atau uraian" onClose={close}>
      <input
        ref={inputRef}
        className={inputClass}
        placeholder="Ketik nama atau kode pekerjaan…"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(0);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((index) => Math.min(index + 1, results.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((index) => Math.max(index - 1, 0));
          } else if (event.key === "Enter" && results[activeIndex]) {
            choose(results[activeIndex]);
          }
        }}
      />
      <div className="mt-2 max-h-[320px] space-y-1 overflow-y-auto">
        {query.trim() && results.length === 0 && (
          <div className="text-[10px] text-muted/60">Tidak ada hasil.</div>
        )}
        {results.map((node, index) => (
          <button
            key={node.id}
            type="button"
            onMouseEnter={() => setActiveIndex(index)}
            onClick={() => choose(node)}
            className={`flex w-full items-center gap-2 rounded-sm border px-2 py-1.5 text-left text-[10px] ${
              index === activeIndex
                ? "border-accent bg-panel2 text-ink"
                : "border-line/60 bg-shell text-muted"
            }`}
          >
            <span className="w-20 shrink-0 truncate font-mono text-[10px] text-muted/80">
              {node.code || "—"}
            </span>
            <span className="min-w-0 flex-1 truncate">{node.name || "(tanpa nama)"}</span>
            <span className="shrink-0 text-[10px] text-muted/60">{node.unit}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Compare                                                             */
/* ------------------------------------------------------------------ */

function CompareDialog() {
  const close = useUiStore((state) => state.closeCompare);
  const regions = useWbsStore((state) => state.regions);
  const regionId = useWbsStore((state) => state.regionId);
  const regionMultiplier = useWbsStore((state) => state.regionMultiplier);
  const totalCost = useWbsStore((state) => state.totalCost);

  const rows = useMemo(() => {
    const base = totalCost / (regionMultiplier || 1);
    return regions
      .map((region) => ({ ...region, projected: base * region.multiplier_factor }))
      .sort((a, b) => a.projected - b.projected);
  }, [regions, regionMultiplier, totalCost]);

  return (
    <Modal
      title="Bandingkan Wilayah"
      subtitle="Estimasi biaya proyek pada tiap indeks wilayah"
      onClose={close}
      width="max-w-[620px]"
    >
      {rows.length === 0 ? (
        <p className="py-6 text-center text-[11px] text-muted">Belum ada data wilayah.</p>
      ) : (
        <div className="overflow-auto rounded-sm border border-line">
          <table className="w-full border-collapse text-[10.5px]">
            <thead>
              <tr className="bg-panel2 text-[10px] uppercase tracking-[0.1em] text-muted">
                <th className="px-2 py-1.5 text-left font-medium">Wilayah</th>
                <th className="px-2 py-1.5 text-right font-medium">Faktor</th>
                <th className="px-2 py-1.5 text-right font-medium">Estimasi Biaya</th>
                <th className="px-2 py-1.5 text-right font-medium">Selisih</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((region) => {
                const active = region.id === regionId;
                const delta = region.projected - totalCost;
                return (
                  <tr
                    key={region.id}
                    className={`border-t border-line/60 ${active ? "bg-accent/10 text-accent" : "text-ink"}`}
                  >
                    <td className="px-2 py-1.5">
                      <span className="font-medium">{region.province}</span>
                      <span className="ml-1 text-[10px] text-muted">— {region.city_regency}</span>
                      {active && <span className="ml-1 text-[10px] uppercase">aktif</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono">
                      {region.multiplier_factor.toFixed(3)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono">
                      {formatIDR(region.projected)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono">
                      {delta >= 0 ? "+" : ""}
                      {formatIDR(delta)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Host                                                                */
/* ------------------------------------------------------------------ */

export function Dialogs() {
  const projectInfoOpen = useUiStore((state) => state.projectInfoOpen);
  const historyOpen = useUiStore((state) => state.historyOpen);
  const optionsOpen = useUiStore((state) => state.optionsOpen);
  const findOpen = useUiStore((state) => state.findOpen);
  const compareOpen = useUiStore((state) => state.compareOpen);

  return (
    <>
      {projectInfoOpen && <ProjectInfoDialog />}
      {historyOpen && <HistoryDialog />}
      {optionsOpen && <OptionsDialog />}
      {findOpen && <FindDialog />}
      {compareOpen && <CompareDialog />}
    </>
  );
}
