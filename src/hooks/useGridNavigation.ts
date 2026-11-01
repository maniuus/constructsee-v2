"use client";

import { useCallback, useEffect } from "react";
import type { EditableField } from "../types/wbs";

export type NavAction = "up" | "down" | "left" | "right";

interface UseGridNavigationProps {
  rowIndex: number;
  activeField: EditableField | null;
  fields: EditableField[];
  onNavigate: (rowIndex: number, field: EditableField, action: NavAction) => void;
  focusCell: (rowIndex: number, field: EditableField) => void;
}

export function useGridNavigation({ rowIndex, activeField, fields, onNavigate, focusCell }: UseGridNavigationProps) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const inInput = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
      if (!activeField || fields.length === 0) return;

      const idx = fields.indexOf(activeField);
      const lastIdx = fields.length - 1;
      let nextIdx = idx;
      let handled = false;
      let action: NavAction | null = null;

      if (inInput) {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          nextIdx = Math.max(idx - 1, 0);
          handled = true;
          action = "left";
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          nextIdx = Math.min(idx + 1, lastIdx);
          handled = true;
          action = "right";
        } else {
          return; // ArrowUp/Down/Enter/Tab/Escape handled by cell
        }
      } else {
        if (event.key === "ArrowUp") {
          event.preventDefault();
          handled = true;
          action = "up";
        } else if (event.key === "ArrowDown") {
          event.preventDefault();
          handled = true;
          action = "down";
        } else if (event.key === "Tab") {
          event.preventDefault();
          nextIdx = event.shiftKey ? Math.max(idx - 1, 0) : Math.min(idx + 1, lastIdx);
          handled = true;
        } else if (event.key === "Enter") {
          event.preventDefault();
          handled = true;
          action = "down";
        } else if (event.key === "F2") {
          event.preventDefault();
          handled = true;
          focusCell(rowIndex, activeField);
        } else if (event.key === "Escape") {
          event.preventDefault();
          const el = document.activeElement as HTMLElement | null;
          if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) {
            el.blur();
          }
          handled = true;
        } else {
          return;
        }
      }

      if (!handled || !action) {
        const nextField = fields[nextIdx] ?? fields[idx];
        if (nextField !== activeField) {
          focusCell(rowIndex, nextField);
        }
        return;
      }

      onNavigate(rowIndex, fields[idx], action);
    },
    [rowIndex, activeField, fields, onNavigate, focusCell],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return null;
}
