import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauriRuntime } from "../../lib/tauriBridge";

const windowAction = (action: "minimize" | "toggle" | "close") => {
  if (!isTauriRuntime()) return;
  const win = getCurrentWindow();
  if (action === "minimize") void win.minimize();
  else if (action === "toggle") void win.toggleMaximize();
  else void win.close();
};

export function TitleBar() {
  return (
    <header className="relative z-20 flex h-9 shrink-0 items-center justify-between border-b border-line bg-panel pl-3 select-none">
      <div data-tauri-drag-region className="flex flex-1 items-center gap-2.5">
        <div className="flex h-4 w-4 items-center justify-center rounded-sm border border-accent/60">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        </div>
        <span className="text-[11px] font-semibold tracking-[0.18em] text-ink">
          CONSTRUCSEE
        </span>
        <span className="hidden text-[10px] tracking-wide text-muted md:inline">
          High-Precision Civil Cost Estimation
        </span>
      </div>

      <div className="flex h-full items-stretch">
        <button
          type="button"
          aria-label="Minimize"
          onClick={() => windowAction("minimize")}
          className="grid w-11 place-items-center text-muted transition hover:bg-panel2 hover:text-ink"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
            <path d="M2 5h6" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Maximize"
          onClick={() => windowAction("toggle")}
          className="grid w-11 place-items-center text-muted transition hover:bg-panel2 hover:text-ink"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
            <rect x="2" y="2" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Close"
          onClick={() => windowAction("close")}
          className="grid w-11 place-items-center text-muted transition hover:bg-danger hover:text-white"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
            <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
      </div>
    </header>
  );
}
