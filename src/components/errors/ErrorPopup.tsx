import { useState } from "react";
import { useErrorStore } from "../../store/useErrorStore";

export function ErrorPopup() {
  const errors = useErrorStore((state) => state.errors);
  const dismiss = useErrorStore((state) => state.dismiss);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  if (errors.length === 0) return null;

  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      window.setTimeout(() => setCopied(null), 1200);
    } catch {
      setCopied(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6 backdrop-blur-[1px]">
      <div className="w-full max-w-lg overflow-hidden border border-danger/50 bg-panel shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-danger" />
            <span className="text-[11px] font-semibold uppercase tracking-widest text-ink">
              Engine Error
            </span>
            <span className="font-mono text-[9px] text-muted/60">{errors.length} ACTIVE</span>
          </div>
          <button
            type="button"
            onClick={() => errors.forEach((error) => dismiss(error.id))}
            className="text-[10px] uppercase tracking-widest text-muted transition hover:text-ink"
          >
            Dismiss all
          </button>
        </div>

        <div className="max-h-[60vh] divide-y divide-line overflow-auto">
          {errors.map((error) => (
            <div key={error.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-mono text-[10px] text-danger">{error.title}</div>
                  <p className="mt-1 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-ink/90">
                    {error.message}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(error.id)}
                  aria-label="Dismiss"
                  className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center border border-line text-[10px] text-muted transition hover:border-danger hover:text-danger"
                >
                  ×
                </button>
              </div>

              {error.detail && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded((current) => (current === error.id ? null : error.id))
                    }
                    className="text-[9px] uppercase tracking-widest text-muted transition hover:text-accent"
                  >
                    {expanded === error.id ? "Hide technical details" : "Show technical details"}
                  </button>
                  {expanded === error.id && (
                    <div className="mt-1.5">
                      <pre className="max-h-40 overflow-auto border border-line bg-shell p-2 font-mono text-[9.5px] leading-relaxed text-muted">
                        {error.detail}
                      </pre>
                      <button
                        type="button"
                        onClick={() =>
                          void copy(error.id, `${error.title}\n${error.message}\n${error.detail}`)
                        }
                        className="mt-1 text-[9px] uppercase tracking-widest text-accent/80 transition hover:text-accent"
                      >
                        {copied === error.id ? "Copied" : "Copy stack trace"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
