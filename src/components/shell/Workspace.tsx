import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ProjectNavigator } from "../navigator/ProjectNavigator";
import { Sheets } from "../sheets/Sheets";
import { PropertiesInspector } from "../inspector/PropertiesInspector";
import { DialogHost } from "../ahsp/Dialogs";

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
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const drag = useRef<DragState | null>(null);

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
            onClick={() => setLeftCollapsed(false)}
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
          <ProjectNavigator onCollapse={() => setLeftCollapsed(true)} />
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
            onClick={() => setRightCollapsed(false)}
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
          <PropertiesInspector onCollapse={() => setRightCollapsed(true)} />
        </aside>
      )}

      <DialogHost />
    </main>
  );
}
