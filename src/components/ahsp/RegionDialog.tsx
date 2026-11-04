import { useEffect } from "react";
import { X } from "lucide-react";
import { Overlay, IconButton, Button } from "../ui/primitives";
import { useUiStore } from "../../store/useUiStore";
import { useWbsStore } from "../../store/useWbsStore";
import type { Region } from "../../types/wbs";

export function RegionDialog() {
  const closeRegion = useUiStore((state) => state.closeRegion);
  const regionOpen = useUiStore((state) => state.regionOpen);
  const openRegion = useWbsStore((state) => state.openRegion);
  const regions = useWbsStore((state) => state.regions);
  const masterStats = useWbsStore((state) => state.masterStats);
  const regionId = useWbsStore((state) => state.regionId);
  const regionName = useWbsStore((state) => state.regionName);
  const loadRegion = useWbsStore((state) => state.loadRegion);
  const loadRegions = useWbsStore((state) => state.loadRegions);

  useEffect(() => {
    if (!regionOpen) return;
    loadRegions();
    loadRegion();
  }, [regionOpen]);

  if (!regionOpen) return null;

  return (
    <Overlay onClose={closeRegion}>
      <div className="flex max-h-full w-full max-w-[1100px] flex-col overflow-hidden rounded-md border border-line bg-panel shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-line bg-panel2 px-3 py-2">
          <div className="min-w-0">
            <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink">
              Pengaturan Wilayah
            </h2>
            <p className="truncate text-[10.5px] text-muted/70">
              Indeks harga regional untuk seluruh item proyek
            </p>
          </div>
          <IconButton label="Tutup (Esc)" onClick={closeRegion}>
            <X size={15} strokeWidth={1.75} />
          </IconButton>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="mb-4 rounded border border-line bg-shell px-3 py-2">
            <div className="text-[10.5px] uppercase tracking-[0.1em] text-muted/60">
              Wilayah aktif
            </div>
            <div className="text-[12px] font-medium text-ink">{regionName || "—"}</div>
            {masterStats && (
              <p className="mt-1 text-[10.5px] text-muted/70">
                Katalog master: {masterStats.items} item · {masterStats.regions} wilayah
              </p>
            )}
          </div>

          {regions.length === 0 ? (
            <p className="py-8 text-center text-[11.5px] text-muted">Data wilayah belum dimuat.</p>
          ) : (
            <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {regions.map((region: Region) => {
                const active = region.id === regionId;
                const factor =
                  region.multiplier_factor > 1
                    ? `+${(((region.multiplier_factor - 1) * 1000).toFixed(0)).padStart(3, "0")}%`
                    : "1.00×";
                return (
                  <label
                    key={region.id}
                    className={`flex cursor-pointer items-start gap-3 rounded border px-3 py-2 transition-colors duration-150 ${
                      active
                        ? "border-accent/40 bg-panel2"
                        : "border-line bg-transparent hover:bg-panel2/60"
                    }`}
                  >
                    <input
                      type="radio"
                      checked={active}
                      onChange={() => {
                        openRegion(region.id);
                        loadRegions();
                        loadRegion();
                      }}
                      className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-accent"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-[11.5px] font-medium text-ink">
                        {region.province} — {region.city_regency}
                      </div>
                      <div className="font-mono text-[10.5px] tabular-nums text-muted">
                        Faktor {region.multiplier_factor.toFixed(3)} · {factor}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={regions.length === 0 || regionId === "national"}
              onClick={() => {
                if (regionId !== "national") closeRegion();
              }}
            >
              Batalkan (ke nasional)
            </Button>
            <Button variant="primary" size="sm" onClick={closeRegion}>
              Tutup
            </Button>
          </div>
        </div>
      </div>
    </Overlay>
  );
}
