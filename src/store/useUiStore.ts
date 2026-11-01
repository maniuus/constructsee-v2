import { create } from "zustand";

interface UiState {
  addOpen: boolean;
  addDirectOpen: boolean;
  removeTargetIds: string[] | null;
  bulkMode: boolean;
  bulkSelection: string[];
  pdfPreviewUrl: string | null;
  activeSheet: string;
  regionOpen: boolean;
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
}

export const useUiStore = create<UiState>((set) => ({
  addOpen: false,
  addDirectOpen: false,
  removeTargetIds: null,
  bulkMode: false,
  bulkSelection: [],
  pdfPreviewUrl: null,
  activeSheet: "ahsp",
  regionOpen: false,
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
}));
