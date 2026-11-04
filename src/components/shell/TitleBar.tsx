import { getCurrentWindow } from "@tauri-apps/api/window";
import { Moon, Sun } from "lucide-react";
import { isTauriRuntime } from "../../lib/tauriBridge";
import { useUiStore } from "../../store/useUiStore";

const windowAction = (action: "minimize" | "toggle" | "close") => {
  if (!isTauriRuntime()) return;
  const win = getCurrentWindow();
  if (action === "minimize") void win.minimize();
  else if (action === "toggle") void win.toggleMaximize();
  else void win.close();
};

export function TitleBar() {
  const theme = useUiStore((state) => state.theme);
  const toggleTheme = useUiStore((state) => state.toggleTheme);

  return (
    <header className="relative z-20 flex h-10 shrink-0 items-center justify-between border-b border-line bg-panel pl-4 select-none">
      <div data-tauri-drag-region className="flex flex-1 items-center gap-3">
        <div className="flex h-4 w-4 items-center justify-center rounded-[4px] border border-accent/40 bg-accent/10">
          <span className="h-1.5 w-1.5 rounded-[1px] bg-accent" />
        </div>
        <span className="text-[12px] font-medium tracking-[0.14em] text-ink">
          CONSTRUCSEE
        </span>
        <span className="hidden text-[10.5px] text-muted/80 md:inline">
          Estimasi Biaya Konstruksi
        </span>
      </div>

      <div className="flex h-full items-stretch">
        <button
          type="button"
          aria-label={theme === "light" ? "Aktifkan tema gelap" : "Aktifkan tema terang"}
          title={theme === "light" ? "Tema gelap" : "Tema terang"}
          onClick={toggleTheme}
          className="grid w-11 place-items-center text-muted transition-colors duration-150 hover:bg-panel2 hover:text-ink outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent/70"
        >
          {theme === "light" ? (
            <Moon size={14} strokeWidth={1.5} />
          ) : (
            <Sun size={14} strokeWidth={1.5} />
          )}
        </button>
        <button
          type="button"
          aria-label="Minimize"
          onClick={() => windowAction("minimize")}
          className="grid w-11 place-items-center text-muted transition-colors duration-150 hover:bg-panel2 hover:text-ink outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent/70"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
            <path d="M2 5h6" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Maximize"
          onClick={() => windowAction("toggle")}
          className="grid w-11 place-items-center text-muted transition-colors duration-150 hover:bg-panel2 hover:text-ink outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent/70"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
            <rect x="2" y="2" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Close"
          onClick={() => windowAction("close")}
          className="grid w-11 place-items-center text-muted transition-colors duration-150 hover:bg-danger hover:text-white outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent/70"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
            <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
      </div>
    </header>
  );
}
