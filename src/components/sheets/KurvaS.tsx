import { useEffect, type ReactNode } from "react";
import { formatIDR, formatNumber } from "../../lib/format";
import { useWbsStore } from "../../store/useWbsStore";
import type { ParetoItem, SCurvePoint, ScheduleItem } from "../../types/wbs";

const NUM = "font-mono tabular-nums";
const ACCENT = "#22C55E";
const ALIGN = { left: "text-left", right: "text-right", center: "text-center" } as const;

function Th({
  children,
  align = "left",
}: {
  children?: ReactNode;
  align?: keyof typeof ALIGN;
}) {
  return (
    <th
      className={`sticky top-0 z-10 whitespace-nowrap border-b border-line bg-panel2 px-2.5 py-1.5 text-[8.5px] font-semibold uppercase tracking-widest text-muted ${ALIGN[align]}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  className = "",
}: {
  children?: ReactNode;
  align?: keyof typeof ALIGN;
  className?: string;
}) {
  return (
    <td className={`whitespace-nowrap px-2.5 py-1 text-[10.5px] text-ink/90 ${ALIGN[align]} ${className}`}>
      {children}
    </td>
  );
}

function pct(value: number): string {
  return `${formatNumber(value)}%`;
}

function SCurveChart({ points }: { points: SCurvePoint[] }) {
  if (points.length === 0) {
    return (
      <div className="flex h-[260px] items-center justify-center rounded-[3px] border border-line bg-shell text-[11px] text-muted">
        Belum ada data jadwal. Isi durasi di sheet Rencana Kerja.
      </div>
    );
  }

  const W = 760;
  const H = 260;
  const padL = 44;
  const padR = 16;
  const padT = 16;
  const padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = points.length;

  const x = (index: number) =>
    padL + (n <= 1 ? plotW / 2 : (index / (n - 1)) * plotW);
  const y = (value: number) => {
    const clamped = Math.min(100, Math.max(0, value));
    return padT + (1 - clamped / 100) * plotH;
  };

  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${x(index).toFixed(1)} ${y(point.cumulative).toFixed(1)}`)
    .join(" ");
  const areaPath =
    `M ${x(0).toFixed(1)} ${y(0).toFixed(1)} ` +
    points.map((point, index) => `L ${x(index).toFixed(1)} ${y(point.cumulative).toFixed(1)}`).join(" ") +
    ` L ${x(n - 1).toFixed(1)} ${y(0).toFixed(1)} Z`;

  const maxWeekly = Math.max(1, ...points.map((point) => point.weekly));
  const barWidth = Math.max(2, (plotW / n) * 0.5);
  const labelStep = Math.max(1, Math.ceil(n / 12));

  return (
    <div className="rounded-[3px] border border-line bg-shell p-2">
      <div className="mb-1 flex items-center gap-4 px-1 text-[8.5px] uppercase tracking-widest text-muted/60">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: ACCENT, opacity: 0.25 }} />
          Bobot mingguan
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-[2px] w-4" style={{ background: ACCENT }} />
          Kumulatif
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Kurva S kumulatif">
        {[0, 25, 50, 75, 100].map((value) => (
          <g key={value}>
            <line
              x1={padL}
              y1={y(value)}
              x2={W - padR}
              y2={y(value)}
              stroke="#2E2E33"
              strokeWidth={1}
              strokeDasharray="3 4"
            />
            <text x={padL - 7} y={y(value) + 3} textAnchor="end" fontSize={9} fill="#A1A1AA" fontFamily="monospace">
              {value}%
            </text>
          </g>
        ))}

        {points.map((point, index) => {
          const height = (point.weekly / maxWeekly) * plotH * 0.85;
          return (
            <rect
              key={`bar-${point.week}`}
              x={x(index) - barWidth / 2}
              y={padT + plotH - height}
              width={barWidth}
              height={Math.max(0, height)}
              fill={ACCENT}
              opacity={0.18}
            />
          );
        })}

        <path d={areaPath} fill={ACCENT} opacity={0.1} />
        <path d={linePath} fill="none" stroke={ACCENT} strokeWidth={2} strokeLinejoin="round" />

        {points.map((point, index) => {
          const showLabel = index % labelStep === 0 || index === n - 1;
          return (
            <g key={`dot-${point.week}`}>
              <circle cx={x(index)} cy={y(point.cumulative)} r={2.6} fill="#121214" stroke={ACCENT} strokeWidth={1.5}>
                <title>{`Minggu ${point.week}${point.date ? ` (${point.date})` : ""}: ${pct(point.cumulative)}`}</title>
              </circle>
              {showLabel && (
                <text x={x(index)} y={H - 10} textAnchor="middle" fontSize={9} fill="#A1A1AA" fontFamily="monospace">
                  {point.week}
                </text>
              )}
            </g>
          );
        })}

        <text x={W / 2} y={H - 1} textAnchor="middle" fontSize={8.5} fill="#71717A" fontFamily="monospace">
          minggu
        </text>
      </svg>
    </div>
  );
}

function WeeklyTable({ points }: { points: SCurvePoint[] }) {
  return (
    <div className="flex min-h-0 flex-col rounded-[3px] border border-line bg-shell">
      <div className="flex h-7 shrink-0 items-center border-b border-line px-2.5 text-[8.5px] font-semibold uppercase tracking-widest text-muted">
        Progres Mingguan
      </div>
      <div className="max-h-[240px] overflow-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <Th align="center">Mg</Th>
              <Th>Tanggal</Th>
              <Th align="right">Bobot</Th>
              <Th align="right">Kumulatif</Th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.week} className="border-b border-line/40 hover:bg-panel2/40">
                <Td align="center" className={`${NUM} text-muted`}>{point.week}</Td>
                <Td className={`${NUM} text-muted/80`}>{point.date || "—"}</Td>
                <Td align="right" className={NUM}>{pct(point.weekly)}</Td>
                <Td align="right" className={`${NUM} font-semibold text-ink`}>{pct(point.cumulative)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ParetoTable({ rows }: { rows: ParetoItem[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-[3px] border border-line bg-shell p-4 text-[11px] text-muted">
        Analisa Pareto belum tersedia — rincian resource AHSP belum ada.
      </div>
    );
  }

  const visible = rows.slice(0, 60);
  return (
    <div className="flex min-h-0 flex-col rounded-[3px] border border-line bg-shell">
      <div className="flex h-7 shrink-0 items-center justify-between border-b border-line px-2.5">
        <span className="text-[8.5px] font-semibold uppercase tracking-widest text-muted">
          Pareto 80/20 — Resource Kritis
        </span>
        <span className="font-mono text-[8.5px] text-muted/50">
          {rows.length} resource{rows.length > visible.length ? ` · tampil ${visible.length}` : ""}
        </span>
      </div>
      <div className="max-h-[320px] overflow-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <Th>Resource</Th>
              <Th>Kategori</Th>
              <Th align="center">Satuan</Th>
              <Th align="right">Biaya</Th>
              <Th align="right">%</Th>
              <Th align="right">Kum.</Th>
              <Th align="center">Kelas</Th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={`${row.name}-${row.unit}-${row.category}`} className="border-b border-line/40 hover:bg-panel2/40">
                <Td>{row.name || "—"}</Td>
                <Td className="capitalize text-muted">{row.category}</Td>
                <Td align="center" className="text-muted">{row.unit || "—"}</Td>
                <Td align="right" className={NUM}>{formatIDR(row.total_cost)}</Td>
                <Td align="right" className={NUM}>{pct(row.cost_percentage)}</Td>
                <Td align="right" className={NUM}>{pct(row.cumulative_percentage)}</Td>
                <Td align="center">
                  <span
                    className={`rounded-sm px-1.5 py-0.5 text-[8.5px] font-semibold uppercase tracking-wider ${
                      row.critical ? "bg-accent/15 text-accent" : "bg-panel2 text-muted/70"
                    }`}
                  >
                    {row.critical ? "Kritis" : "Monitor"}
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ScheduleTable({ rows }: { rows: ScheduleItem[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="flex min-h-0 flex-col rounded-[3px] border border-line bg-shell">
      <div className="flex h-7 shrink-0 items-center border-b border-line px-2.5 text-[8.5px] font-semibold uppercase tracking-widest text-muted">
        Jadwal Sekuensial
      </div>
      <div className="max-h-[300px] overflow-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <Th>Kode</Th>
              <Th>Uraian Pekerjaan</Th>
              <Th align="right">Mulai</Th>
              <Th align="right">Durasi</Th>
              <Th align="right">Selesai</Th>
              <Th align="right">Bobot</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.node_id} className="border-b border-line/40 hover:bg-panel2/40">
                <Td className={`${NUM} text-muted/70`}>{row.code || "—"}</Td>
                <Td>{row.name}</Td>
                <Td align="right" className={NUM}>{formatNumber(row.start_day)}</Td>
                <Td align="right" className={NUM}>{formatNumber(row.duration_days)}</Td>
                <Td align="right" className={NUM}>{formatNumber(row.end_day)}</Td>
                <Td align="right" className={`${NUM} text-ink`}>{pct(row.weight)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function KurvaSSheet() {
  const analytics = useWbsStore((state) => state.analytics);
  const loading = useWbsStore((state) => state.analyticsLoading);
  const loadAnalytics = useWbsStore((state) => state.loadAnalytics);
  const setProjectStart = useWbsStore((state) => state.setProjectStart);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-3 border-b border-line bg-panel/60 px-3">
        <span className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-muted">
          Kurva S &amp; Pareto
        </span>
        <label className="flex items-center gap-1.5 text-[9px] uppercase tracking-widest text-muted/60">
          Mulai
          <input
            type="date"
            value={analytics?.project_start ?? ""}
            onChange={(event) => {
              if (event.target.value) void setProjectStart(event.target.value);
            }}
            className="h-6 rounded-[3px] border border-line bg-shell px-2 font-mono text-[10px] text-ink outline-none focus:border-accent"
          />
        </label>
        <button
          type="button"
          onClick={() => void loadAnalytics()}
          className="h-6 rounded-[3px] border border-line px-2 text-[9px] uppercase tracking-widest text-muted transition hover:border-accent/50 hover:text-ink"
        >
          Refresh
        </button>
        <span className="ml-auto font-mono text-[9px] text-muted/50">
          {analytics
            ? `${analytics.s_curve.length} minggu · ${formatNumber(analytics.total_days)} hari · ${formatIDR(analytics.total_cost)}`
            : loading
              ? "menghitung…"
              : "—"}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {!analytics ? (
          <div className="p-6 text-[11px] text-muted">
            {loading ? "Memuat analitik…" : "Tidak ada data analitik."}
          </div>
        ) : (
          <div className="flex flex-col gap-3 p-3">
            {analytics.warnings.length > 0 && (
              <ul className="rounded-[3px] border border-line bg-panel2/40 px-3 py-2 text-[10px] text-muted">
                {analytics.warnings.map((warning) => (
                  <li key={warning}>— {warning}</li>
                ))}
              </ul>
            )}

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              <SCurveChart points={analytics.s_curve} />
              <WeeklyTable points={analytics.s_curve} />
            </div>

            <ParetoTable rows={analytics.pareto} />
            <ScheduleTable rows={analytics.schedule} />
          </div>
        )}
      </div>
    </div>
  );
}
