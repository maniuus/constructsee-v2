import { X } from "lucide-react";
import { Overlay, IconButton } from "../ui/primitives";
import { useUiStore } from "../../store/useUiStore";

export function PdfPreview() {
  const url = useUiStore((state) => state.pdfPreviewUrl);
  const close = useUiStore((state) => state.closePdfPreview);

  if (!url) return null;

  return (
    <Overlay onClose={close}>
      <div className="flex h-full w-full max-w-[1100px] flex-col overflow-hidden rounded-md border border-line bg-panel shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-line bg-panel2 px-3 py-2">
          <div className="flex min-w-0 items-baseline gap-2">
            <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink">
              Pratinjau PDF
            </h2>
            <span className="truncate text-[10.5px] text-muted/70">
              RAB — hasil render sebelum ekspor
            </span>
          </div>
          <IconButton label="Tutup (Esc)" onClick={close}>
            <X size={15} strokeWidth={1.75} />
          </IconButton>
        </header>
        <iframe src={url} title="Pratinjau PDF RAB" className="min-h-0 flex-1 bg-white" />
      </div>
    </Overlay>
  );
}
