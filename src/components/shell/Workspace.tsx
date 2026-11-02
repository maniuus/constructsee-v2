import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ProjectNavigator } from "../navigator/ProjectNavigator";
import { Sheets } from "../sheets/Sheets";
import { PropertiesInspector } from "../inspector/PropertiesInspector";
import { CalculatorPanel } from "../inspector/CalculatorPanel";
import { DialogHost } from "../ahsp/Dialogs";
import { useWbsStore } from "../../store/useWbsStore";
import { useUiStore } from "../../store/useUiStore";

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

interface DragState {
  side: "left" | "right";
  startX: number;
  startWidth: number;
}

export function Workspace() {
  const [leftWidth, setLeftWidth] = useState(250);
  const [rightWidth, setRightWidth] = useState(330);
  const navigatorOpen = useUiStore((state) => state.navigatorOpen);
  const inspectorOpen = useUiStore((state) => state.inspectorOpen);
  const setNavigatorOpen = useUiStore((state) => state.setNavigatorOpen);
  const setInspectorOpen = useUiStore((state) => state.setInspectorOpen);
  const leftCollapsed = !navigatorOpen;
  const rightCollapsed = !inspectorOpen;
  const calculatorOpen = useUiStore((state) => state.calculatorOpen);
  const drag = useRef<DragState | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.altKey || event.shiftKey) return;
      if (event.key === "[") {
        event.preventDefault();
        useUiStore.getState().toggleNavigator();
      } else if (event.key === "]") {
        event.preventDefault();
        useUiStore.getState().toggleInspector();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const inInput = Boolean(
        target?.tagName === "INPUT" ||
          target?.tagName === "TEXTAREA" ||
          target?.isContentEditable,
      );
      if (event.key === "z" || event.key === "Z") {
        if (!inInput) {
          event.preventDefault();
          useWbsStore.getState().undo();
        }
        return;
      }
      if ((event.key === "y" || event.key === "Y") || (event.shiftKey && event.key === "z")) {
        if (!inInput) {
          event.preventDefault();
          useWbsStore.getState().redo();
        }
        return;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const beginDrag =
    (side: DragState["side"]) => (event: ReactPointerEvent<HTMLDivElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = {
        side,
        startX: event.clientX,
        startWidth: side === "left" ? leftWidth : rightWidth,
      };
    };

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state) return;
    const delta = event.clientX - state.startX;
    if (state.side === "left") {
      setLeftWidth(clamp(state.startWidth + delta, 190, 440));
    } else {
      setRightWidth(clamp(state.startWidth - delta, 250, 520));
    }
  };

  const endDrag = () => {
    drag.current = null;
  };

  return (
    <main className="flex min-h-0 flex-1 overflow-hidden bg-shell">
      {leftCollapsed ? (
        <aside className="flex w-8 shrink-0 flex-col items-center gap-2 border-r border-line bg-panel py-2">
          <button
            type="button"
            onClick={() => setNavigatorOpen(true)}
            title="Buka Project Navigator"
            aria-label="Expand Project Navigator"
            className="grid h-6 w-6 shrink-0 place-items-center rounded-sm text-muted transition-colors hover:bg-panel2 hover:text-accent"
          >
            ›
          </button>
          <span className="select-none text-[9.5px] font-semibold uppercase tracking-[0.16em] text-muted/60 [writing-mode:vertical-rl]">
            Project Navigator
          </span>
        </aside>
      ) : (
        <aside style={{ width: leftWidth }} className="flex min-w-0 shrink-0 flex-col bg-panel">
          <ProjectNavigator onCollapse={() => setNavigatorOpen(false)} />
        </aside>
      )}

      <div
        role="separator"
        aria-orientation="vertical"
        onPointerDown={beginDrag("left")}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={`w-1 shrink-0 cursor-col-resize bg-line/40 transition hover:bg-accent/60 ${
          leftCollapsed ? "hidden" : ""
        }`}
      />

      <section className="flex min-w-0 flex-1 flex-col bg-shell">
        <Sheets />
      </section>

      <div
        role="separator"
        aria-orientation="vertical"
        onPointerDown={beginDrag("right")}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={`w-1 shrink-0 cursor-col-resize bg-line/40 transition hover:bg-accent/60 ${
          rightCollapsed ? "hidden" : ""
        }`}
      />

      {rightCollapsed ? (
        <aside className="flex w-8 shrink-0 flex-col items-center gap-2 border-l border-line bg-panel py-2">
          <button
            type="button"
            onClick={() => setInspectorOpen(true)}
            title="Buka Properties Inspector"
            aria-label="Expand Properties Inspector"
            className="grid h-6 w-6 shrink-0 place-items-center rounded-sm text-muted transition-colors hover:bg-panel2 hover:text-accent"
          >
            ‹
          </button>
          <span className="select-none text-[9.5px] font-semibold uppercase tracking-[0.16em] text-muted/60 [writing-mode:vertical-rl]">
            Properties Inspector
          </span>
        </aside>
      ) : (
        <aside style={{ width: rightWidth }} className="flex min-w-0 shrink-0 flex-col bg-panel">
          <div className="flex min-h-0 flex-1 flex-col">
            <PropertiesInspector onCollapse={() => setInspectorOpen(false)} />
          </div>
          {calculatorOpen && (
            <CalculatorPanel onClose={() => useUiStore.getState().closeCalculator()} />
          )}
        </aside>
      )}

      <DialogHost />
    </main>
  );
}
