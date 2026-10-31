import { useState } from "react";
import { WbsTable } from "../wbs/WbsTable";
import {
  AnalisaSheet,
  BoqSheet,
  HargaDasarSheet,
  RabSheet,
  RekapitulasiSheet,
  RencanaKerjaSheet,
  VolumeSheet,
} from "./SheetViews";

type SheetId =
  | "ahsp"
  | "volume"
  | "hargaDasar"
  | "rab"
  | "rekapitulasi"
  | "analisa"
  | "boq"
  | "rencana";

const SHEETS: Array<{ id: SheetId; label: string }> = [
  { id: "ahsp", label: "Full" },
  { id: "volume", label: "Volume" },
  { id: "hargaDasar", label: "Harga Dasar" },
  { id: "rab", label: "RAB" },
  { id: "rekapitulasi", label: "Rekapitulasi" },
  { id: "analisa", label: "Analisa" },
  { id: "boq", label: "BOQ" },
  { id: "rencana", label: "Rencana Kerja" },
];

const VIEWS: Record<SheetId, () => JSX.Element> = {
  ahsp: WbsTable,
  volume: VolumeSheet,
  hargaDasar: HargaDasarSheet,
  rab: RabSheet,
  rekapitulasi: RekapitulasiSheet,
  analisa: AnalisaSheet,
  boq: BoqSheet,
  rencana: RencanaKerjaSheet,
};

export function Sheets() {
  const [active, setActive] = useState<SheetId>("ahsp");
  const View = VIEWS[active];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col">
        <View />
      </div>

      <div
        role="tablist"
        className="flex h-8 shrink-0 items-stretch gap-0.5 overflow-x-auto border-t border-line bg-panel px-2 pt-1"
      >
        {SHEETS.map((sheet) => {
          const isActive = sheet.id === active;
          return (
            <button
              key={sheet.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(sheet.id)}
              className={`shrink-0 rounded-t-sm border-x border-t px-3 text-[10px] font-medium transition-colors ${
                isActive
                  ? "border-line bg-shell text-ink"
                  : "border-transparent text-muted hover:bg-panel2/60 hover:text-ink/80"
              }`}
            >
              {sheet.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
