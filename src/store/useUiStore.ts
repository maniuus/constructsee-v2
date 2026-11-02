import { create } from "zustand";

export type Theme = "dark" | "light";

const THEME_KEY = "construcsee-theme";

function readInitialTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("light", theme === "light");
}

interface UiState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  addOpen: boolean;
  addDirectOpen: boolean;
  removeTargetIds: string[] | null;
  bulkMode: boolean;
  bulkSelection: string[];
  pdfPreviewUrl: string | null;
  activeSheet: string;
  regionOpen: boolean;
  projectInfoOpen: boolean;
  historyOpen: boolean;
  optionsOpen: boolean;
  calculatorOpen: boolean;
  findOpen: boolean;
  compareOpen: boolean;
  navigatorOpen: boolean;
  inspectorOpen: boolean;
  openAdd: () => void;
  closeAdd: () => void;
  openAddDirect: () => void;
  closeAddDirect: () => void;
  askRemove: (id: string) => void;
  askRemoveMany: (ids: string[]) => void;
  cancelRemove: () => void;
  toggleBulkMode: () => void;
  toggleBulkSelect: (id: string) => void;
  setBulkSelection: (ids: string[]) => void;
  openPdfPreview: (url: string) => void;
  closePdfPreview: () => void;
  setActiveSheet: (id: string) => void;
  openRegion: () => void;
  closeRegion: () => void;
  openProjectInfo: () => void;
  closeProjectInfo: () => void;
  openHistory: () => void;
  closeHistory: () => void;
  openOptions: () => void;
  closeOptions: () => void;
  openCalculator: () => void;
  closeCalculator: () => void;
  openFind: () => void;
  closeFind: () => void;
  openCompare: () => void;
  closeCompare: () => void;
  setNavigatorOpen: (open: boolean) => void;
  setInspectorOpen: (open: boolean) => void;
  toggleNavigator: () => void;
  toggleInspector: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  theme: readInitialTheme(),
  setTheme: (theme) => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
    applyTheme(theme);
    set({ theme });
  },
  toggleTheme: () =>
    set((state) => {
      const next: Theme = state.theme === "light" ? "dark" : "light";
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        /* ignore */
      }
      applyTheme(next);
      return { theme: next };
    }),
  addOpen: false,
  addDirectOpen: false,
  removeTargetIds: null,
  bulkMode: false,
  bulkSelection: [],
  pdfPreviewUrl: null,
  activeSheet: "ahsp",
  regionOpen: false,
  projectInfoOpen: false,
  historyOpen: false,
  optionsOpen: false,
  calculatorOpen: true,
  findOpen: false,
  compareOpen: false,
  navigatorOpen: true,
  inspectorOpen: true,
  openAdd: () => set({ addOpen: true }),
  closeAdd: () => set({ addOpen: false }),
  openAddDirect: () => set({ addDirectOpen: true }),
  closeAddDirect: () => set({ addDirectOpen: false }),
  askRemove: (id) => set({ removeTargetIds: [id] }),
  askRemoveMany: (ids) => set({ removeTargetIds: ids }),
  cancelRemove: () => set({ removeTargetIds: null }),
  toggleBulkMode: () =>
    set((state) => ({ bulkMode: !state.bulkMode, bulkSelection: [] })),
  toggleBulkSelect: (id) =>
    set((state) => ({
      bulkSelection: state.bulkSelection.includes(id)
        ? state.bulkSelection.filter((value) => value !== id)
        : [...state.bulkSelection, id],
    })),
  setBulkSelection: (ids) => set({ bulkSelection: ids }),
  openPdfPreview: (url) =>
    set((state) => {
      if (state.pdfPreviewUrl) URL.revokeObjectURL(state.pdfPreviewUrl);
      return { pdfPreviewUrl: url };
    }),
  closePdfPreview: () =>
    set((state) => {
      if (state.pdfPreviewUrl) URL.revokeObjectURL(state.pdfPreviewUrl);
      return { pdfPreviewUrl: null };
    }),
  setActiveSheet: (id) => set({ activeSheet: id }),
  openRegion: () => set({ regionOpen: true }),
  closeRegion: () => set({ regionOpen: false }),
  openProjectInfo: () => set({ projectInfoOpen: true }),
  closeProjectInfo: () => set({ projectInfoOpen: false }),
  openHistory: () => set({ historyOpen: true }),
  closeHistory: () => set({ historyOpen: false }),
  openOptions: () => set({ optionsOpen: true }),
  closeOptions: () => set({ optionsOpen: false }),
  openCalculator: () => set({ calculatorOpen: true }),
  closeCalculator: () => set({ calculatorOpen: false }),
  openFind: () => set({ findOpen: true }),
  closeFind: () => set({ findOpen: false }),
  openCompare: () => set({ compareOpen: true }),
  closeCompare: () => set({ compareOpen: false }),
  setNavigatorOpen: (open) => set({ navigatorOpen: open }),
  setInspectorOpen: (open) => set({ inspectorOpen: open }),
  toggleNavigator: () => set((state) => ({ navigatorOpen: !state.navigatorOpen })),
  toggleInspector: () => set((state) => ({ inspectorOpen: !state.inspectorOpen })),
}));
