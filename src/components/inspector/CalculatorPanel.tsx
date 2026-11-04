import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { evaluateExpression } from "../../lib/calc";

const CALC_ROWS: string[][] = [
  ["7", "8", "9", "/"],
  ["4", "5", "6", "*"],
  ["1", "2", "3", "-"],
  ["0", ".", "(", ")"],
  ["C", "⌫", "+", "="],
];

const NUMPAD_MAP: Record<string, string> = {
  Numpad0: "0",
  Numpad1: "1",
  Numpad2: "2",
  Numpad3: "3",
  Numpad4: "4",
  Numpad5: "5",
  Numpad6: "6",
  Numpad7: "7",
  Numpad8: "8",
  Numpad9: "9",
  NumpadDecimal: ".",
  NumpadComma: ".",
  NumpadAdd: "+",
  NumpadSubtract: "-",
  NumpadMultiply: "*",
  NumpadDivide: "/",
};

function formatResult(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toLocaleString("id-ID", { maximumFractionDigits: 8 });
}

export function CalculatorPanel({ onClose }: { onClose?: () => void } = {}) {
  const [expression, setExpression] = useState("");
  const [result, setResult] = useState("");
  const expressionRef = useRef("");
  const inputRef = useRef<HTMLInputElement>(null);

  const update = (next: string) => {
    expressionRef.current = next;
    setExpression(next);
  };

  const press = (key: string) => {
    setResult("");
    update(expressionRef.current + key);
  };

  const backspace = () => {
    setResult("");
    update(expressionRef.current.slice(0, -1));
  };

  const clear = () => {
    setResult("");
    update("");
  };

  const evaluate = useCallback(() => {
    const raw = expressionRef.current;
    try {
      setResult(formatResult(evaluateExpression(raw)));
    } catch (error) {
      setResult(error instanceof Error ? error.message : "Ekspresi tidak valid");
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const inInput = Boolean(
        target?.tagName === "INPUT" ||
          target?.tagName === "TEXTAREA" ||
          target?.isContentEditable,
      );
      if (inInput) return;

      if (event.code === "NumpadEnter") {
        event.preventDefault();
        evaluate();
        return;
      }

      const mapped = NUMPAD_MAP[event.code];
      if (mapped) {
        event.preventDefault();
        press(mapped);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [evaluate]);

  const handleKey = (key: string) => {
    if (key === "C") return clear();
    if (key === "⌫") return backspace();
    if (key === "=") return evaluate();
    press(key);
  };

  return (
    <div className="flex h-[318px] shrink-0 flex-col bg-panel">
      <div className="flex h-9 shrink-0 items-center justify-between border-y border-line px-3">
        <span className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted">
          Calculator
        </span>
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] text-muted/50">NUMPAD</span>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Sembunyikan Calculator"
              aria-label="Sembunyikan Calculator"
              className="grid h-5 w-5 place-items-center rounded-[4px] text-muted transition-colors hover:bg-panel2 hover:text-accent"
            >
              <X size={13} strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
        <input
          ref={inputRef}
          className="w-full rounded border border-line bg-shell px-2 py-1 text-right font-mono text-[14px] tabular-nums text-ink outline-none focus:border-accent/60"
          value={expression}
          onChange={(event) => {
            setResult("");
            update(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") evaluate();
          }}
          placeholder="0"
        />
        <div className="h-6 shrink-0 truncate text-right font-mono text-[12px] tabular-nums text-accent">
          {result}
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-4 grid-rows-5 gap-1">
          {CALC_ROWS.flat().map((key) => {
            const isEquals = key === "=";
            const isOperator = ["/", "*", "-", "+"].includes(key);
            const isAction = key === "C" || key === "⌫";
            return (
              <button
                key={key}
                type="button"
                onClick={() => handleKey(key)}
                className={`rounded border text-[13px] tabular-nums transition-colors duration-150 ${
                  isEquals
                    ? "border-accent bg-accent font-semibold text-white hover:opacity-90"
                    : isOperator
                      ? "border-accent/40 bg-accent/10 text-accent hover:bg-accent/20"
                      : isAction
                        ? "border-line bg-shell text-[12px] text-muted hover:bg-panel2"
                        : "border-line bg-shell text-ink hover:bg-panel2"
                }`}
              >
                {key}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
