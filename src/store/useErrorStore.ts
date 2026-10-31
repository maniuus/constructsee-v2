import { create } from "zustand";

export interface EngineError {
  id: string;
  title: string;
  message: string;
  detail?: string;
  at: number;
}

interface ErrorState {
  errors: EngineError[];
  push: (input: Omit<EngineError, "id" | "at">) => void;
  dismiss: (id: string) => void;
  clear: () => void;
}

const nextId = () =>
  globalThis.crypto?.randomUUID?.() ?? `err-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const useErrorStore = create<ErrorState>((set) => ({
  errors: [],
  push: (input) =>
    set((state) => ({
      errors: [...state.errors, { ...input, id: nextId(), at: Date.now() }],
    })),
  dismiss: (id) => set((state) => ({ errors: state.errors.filter((e) => e.id !== id) })),
  clear: () => set({ errors: [] }),
}));
