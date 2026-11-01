import { useEffect } from "react";
import { X } from "lucide-react";
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

  return regionOpen ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeRegion();
      }}
    >
      <div
        className="flex h-full w-full max-w-[1100px] flex-col overflow-hidden rounded-sm border border-line bg-panel shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-line bg-panel2 px-3 py-2">
          <div className="flex items-baseline gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-ink">
              Pengaturan Wilayah
            </span>
          </div>
          <button
            type="button"
            onClick={closeRegion}
            aria-label="Tutup pengaturan wilayah"
            title="Tutup (Esc)"
            className="grid h-6 w-6 place-items-center rounded-sm text-muted transition-colors hover:bg-shell hover:text-accent"
          >
            <X size={15} strokeWidth={2} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted/60 mb-2">
              Kata kunci: {regionName || "—"}
            </p>
            <p className="text-[12px] text-muted">
              Faktor pengali biaya regional terhadap harga dasar per item pekerjaan.
            </p>
            {masterStats && (
              <p className="text-[10px] text-muted/70 mt-1">
                Katalog master: {masterStats.items} item · {masterStats.regions} wilayah
              </p>
            )}
          </div>

          {regions.length === 0 ? (
            <p className="text-[10px] text-muted">Data wilayah belum dimuat.</p>
          ) : (
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {regions.map((region: Region) => (
                <div
                  key={region.id}
                  className={`flex items-start gap-3 rounded-sm border border-line ${
                    region.id === regionId ? "bg-panel2" : "bg-transparent"
                  }`}
                >
                  <input
                    type="radio"
                    checked={region.id === regionId}
                    onChange={() => {
                      openRegion(region.id);
                      loadRegions();
                      loadRegion();
                    }}
                    className="w-4 h-4 rounded bg-accent flex-shrink-0 cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-medium text-ink">
                      {region.province} — {region.city_regency}
                    </div>
                    <div
                      className={`text-[10px] text-muted ${
                        region.id === regionId ? "font-semibold text-ink" : ""
                      }`}
                    >
                      Faktor: {region.multiplier_factor > 1
                        ? `+${(((region.multiplier_factor - 1) * 1000).toFixed(0)).padStart(3, "0")}%`
                        : "1.00×"
                      }
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <button
              disabled={regions.length === 0 || regionId === "national"}
              onClick={() => {
                if (regionId !== "national") {
                  closeRegion();
                }
              }}
              className="px-3 py-1.5 text-[10px] rounded-sm bg-accent text-white hover:bg-shell"
            >
              Batalkan (ke NASIONAL)
            </button>
            {regionId !== "national" && (
              <button
                onClick={() => {
                  closeRegion();
                }}
                className="px-3 py-1.5 text-[10px] rounded-sm bg-shell hover:bg-accent/10"
              >
                Tutup
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  ) : null;
}