import { useEffect } from "react";
import { X } from "lucide-react";
import { useUiStore } from "../../store/useUiStore";

export function PdfPreview() {
  const url = useUiStore((state) => state.pdfPreviewUrl);
  const close = useUiStore((state) => state.closePdfPreview);

  useEffect(() => {
    if (!url) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [url, close]);

  if (!url) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="flex h-full w-full max-w-[1100px] flex-col overflow-hidden rounded-sm border border-line bg-panel shadow-2xl">
        <div className="flex items-center justify-between border-b border-line bg-panel2 px-3 py-2">
          <div className="flex items-baseline gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-ink">
              Pratinjau PDF
            </span>
            <span className="text-[10px] text-muted">RAB — hasil render sebelum ekspor</span>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Tutup pratinjau"
            title="Tutup (Esc)"
            className="grid h-6 w-6 place-items-center rounded-sm text-muted transition-colors hover:bg-shell hover:text-accent"
          >
            <X size={15} strokeWidth={2} />
          </button>
        </div>
        <iframe
          src={url}
          title="Pratinjau PDF RAB"
          className="min-h-0 flex-1 bg-white"
        />
      </div>
    </div>
  );
}
