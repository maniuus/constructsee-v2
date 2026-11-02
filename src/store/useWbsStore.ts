import { create } from "zustand";
import { open, save } from "@tauri-apps/plugin-dialog";
import { backfillComponentItems } from "../lib/mockEngine";
import { SNI_DIVISIONS } from "../lib/divisions";
import { isTauriRuntime, safeInvoke } from "../lib/tauriBridge";
import { useUiStore } from "./useUiStore";
import type {
  AffectedPatch,
  Analytics,
  EditableField,
  EngineSnapshot,
  HistoryView,
  MasterStats,
  PriceMethod,
  ProjectInfo,
  Region,
  RegionInfo,
  WbsComponents,
  WbsNode,
  WorkPlan,
} from "../types/wbs";

const emptyComponents = (): WbsComponents => {
  const blank = () => ({ coefficient: 0, base_price: 0, subtotal: 0, items: [] });
  return { bahan: blank(), tenaga: blank(), alat: blank() };
};

interface ActiveCell {
  rowId: string;
  field: EditableField;
}

interface WbsState {
  nodes: Record<string, WbsNode>;
  roots: string[];
  totalCost: number;
  loading: boolean;
  syncing: boolean;
  lastSyncedAt: number | null;
  activeCell: ActiveCell | null;
  selectedId: string | null;
  overhead: number;
  ppn: number;
  workPlans: Record<string, WorkPlan>;
  analytics: Analytics | null;
  analyticsLoading: boolean;
  canUndo: boolean;
  canRedo: boolean;
  regionId: string;
  regionName: string;
  regionMultiplier: number;
  regions: Region[];
  masterStats: MasterStats | null;
  projectInfo: ProjectInfo;
  history: HistoryView;
  load: () => Promise<void>;
  selectRow: (id: string) => void;
  setActiveCell: (cell: ActiveCell | null) => void;
  updateCell: (itemId: string, field: EditableField, value: number) => Promise<void>;
  toggleExpand: (itemId: string) => Promise<void>;
  setMethod: (itemId: string, method: PriceMethod) => Promise<void>;
  setItemPrice: (name: string, unit: string, basePrice: number) => Promise<void>;
  addNode: (parentId: string | null, node: WbsNode) => Promise<void>;
  removeNode: (itemId: string) => Promise<void>;
  removeNodes: (itemIds: string[]) => Promise<void>;
  importExcel: () => Promise<void>;
  exportExcel: () => Promise<void>;
  exportPdf: () => Promise<void>;
  previewPdf: () => Promise<void>;
  setOverhead: (value: number) => Promise<void>;
  setPpn: (value: number) => void;
  loadWorkPlans: () => Promise<void>;
  setWorkPlan: (nodeId: string, numWorkers: number, durationDays: number) => Promise<void>;
  loadAnalytics: () => Promise<void>;
  setProjectStart: (date: string) => Promise<void>;
  loadRegion: () => Promise<void>;
  openRegion: (regionId: string) => Promise<void>;
  loadRegions: () => Promise<void>;
  setRegion: (regionId: string) => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  newProject: () => Promise<void>;
  openProject: () => Promise<void>;
  saveProject: () => Promise<void>;
  loadProjectInfo: () => Promise<void>;
  saveProjectInfo: (info: ProjectInfo) => Promise<void>;
  loadHistory: () => Promise<void>;
  indentNode: (itemId: string) => Promise<void>;
  outdentNode: (itemId: string) => Promise<void>;
  expandAll: () => Promise<void>;
  collapseAll: () => Promise<void>;
}

const normalizeNode = (node: WbsNode): WbsNode => {
  if (node.children_ids.length > 0) return node;
  return { ...node, components: backfillComponentItems(node.components) };
};

const ingest = (snapshot: EngineSnapshot) => ({
  nodes: Object.fromEntries(snapshot.nodes.map((node) => {
    const normalized = normalizeNode(node);
    return [normalized.id, normalized];
  })),
  roots: snapshot.roots,
  totalCost: snapshot.total_cost,
  overhead: Number.isFinite(snapshot.overhead_percent) ? snapshot.overhead_percent : 10,
  canUndo: Boolean(snapshot.can_undo),
  canRedo: Boolean(snapshot.can_redo),
  loading: false,
  syncing: false,
  lastSyncedAt: Date.now(),
});

/** Patch tidak membawa flag history → update optimis di sisi UI. */
const markMutated = {
  canUndo: true,
  canRedo: false,
};

export const useWbsStore = create<WbsState>((set, get) => ({
  nodes: {},
  roots: [],
  totalCost: 0,
  loading: true,
  syncing: false,
  lastSyncedAt: null,
  activeCell: null,
  selectedId: null,
  overhead: 10,
  ppn: 11,
  workPlans: {},
  analytics: null,
  analyticsLoading: false,
  canUndo: false,
  canRedo: false,
  regionId: "national",
  regionName: "NASIONAL",
  regionMultiplier: 1,
  regions: [],
  masterStats: null,
  projectInfo: {
    name: "",
    location: "",
    owner: "",
    contractor: "",
    contract_no: "",
    start_date: "",
  },
  history: { undo: [], redo: [], can_undo: false, can_redo: false },

  load: async () => {
    set({ loading: true });
    const snapshot = await safeInvoke<EngineSnapshot>("get_wbs");
    if (!snapshot) {
      set({ loading: false });
      return;
    }
    set((state) => ({
      ...ingest(snapshot),
      selectedId: state.selectedId ?? snapshot.roots[0] ?? null,
    }));

    const current = get();
    const names = new Set(
      current.roots
        .map((id) => current.nodes[id]?.name?.trim().toUpperCase())
        .filter((name): name is string => Boolean(name)),
    );
    for (const division of SNI_DIVISIONS) {
      if (names.has(division.name.toUpperCase()) || get().nodes[division.id]) continue;
      try {
        await get().addNode(null, {
          id: division.id,
          parent_id: null,
          children_ids: [],
          code: division.code,
          name: division.name,
          unit: "",
          volume: 0,
          unit_price: 0,
          total_price: 0,
          is_expanded: true,
          components: emptyComponents(),
          method: "langsung",
        });
      } catch {
        // non-fatal: engine lama mungkin belum punya add_node
      }
    }

    await get().loadWorkPlans();
    await get().loadRegion();
    await get().loadProjectInfo();
  },

  selectRow: (id) => set({ selectedId: id }),

  setActiveCell: (cell) =>
    set({ activeCell: cell, selectedId: cell?.rowId ?? get().selectedId }),

  updateCell: async (itemId, field, value) => {
    const current = get().nodes[itemId];
    if (!current || current.children_ids.length > 0) return;
    if (field === "volume" && current.volume === value) return;
    if (field === "unit_price" && current.unit_price === value) return;

    set({ syncing: true });
    const patch = await safeInvoke<AffectedPatch>("update_wbs_cell", {
      payload: { item_id: itemId, field, new_value: value },
    });
    if (!patch) {
      set({ syncing: false });
      return;
    }
    set((state) => {
      const nodes = { ...state.nodes };
      for (const node of patch.nodes) {
        const normalized = normalizeNode(node);
        nodes[normalized.id] = normalized;
      }
      return { nodes, totalCost: patch.total_cost, syncing: false, lastSyncedAt: Date.now(), ...markMutated };
    });
  },

  toggleExpand: async (itemId) => {
    const node = get().nodes[itemId];
    if (!node) return;

    set((state) => ({
      nodes: {
        ...state.nodes,
        [itemId]: { ...node, is_expanded: !node.is_expanded },
      },
    }));

    const snapshot = await safeInvoke<EngineSnapshot>("toggle_expand", {
      item_id: itemId,
      expanded: !node.is_expanded,
    });
    if (snapshot) set((state) => ({ ...ingest(snapshot), selectedId: state.selectedId }));
  },

  setMethod: async (itemId, method) => {
    const current = get().nodes[itemId];
    if (!current || current.children_ids.length > 0) return;
    if (current.method === method) return;

    set({ syncing: true });
    const patch = await safeInvoke<AffectedPatch>("set_price_method", {
      item_id: itemId,
      method,
    });
    if (!patch) {
      set({ syncing: false });
      return;
    }
    set((state) => {
      const nodes = { ...state.nodes };
      for (const node of patch.nodes) {
        const normalized = normalizeNode(node);
        nodes[normalized.id] = normalized;
      }
      return { nodes, totalCost: patch.total_cost, syncing: false, lastSyncedAt: Date.now(), ...markMutated };
    });
  },

  setItemPrice: async (name, unit, basePrice) => {
    if (!Number.isFinite(basePrice) || basePrice < 0) return;
    set({ syncing: true });
    const patch = await safeInvoke<AffectedPatch>("set_item_price", {
      name,
      unit,
      base_price: basePrice,
    });
    if (!patch) {
      set({ syncing: false });
      return;
    }
    set((state) => {
      const nodes = { ...state.nodes };
      for (const node of patch.nodes) {
        const normalized = normalizeNode(node);
        nodes[normalized.id] = normalized;
      }
      return { nodes, totalCost: patch.total_cost, syncing: false, lastSyncedAt: Date.now(), ...markMutated };
    });
  },

  addNode: async (parentId, node) => {
    set({ syncing: true });
    const patch = await safeInvoke<AffectedPatch>("add_node", {
      parent_id: parentId,
      node,
    });
    if (!patch) {
      set({ syncing: false });
      return;
    }
    set((state) => {
      const nodes = { ...state.nodes };
      for (const updated of patch.nodes) {
        const normalized = normalizeNode(updated);
        nodes[normalized.id] = normalized;
      }
      return { nodes, totalCost: patch.total_cost, syncing: false, lastSyncedAt: Date.now(), ...markMutated };
    });
  },

  removeNode: async (itemId) => {
    await get().removeNodes([itemId]);
  },

  removeNodes: async (itemIds) => {
    const valid = itemIds.filter((id) => {
      const node = get().nodes[id];
      return Boolean(node) && node.children_ids.length === 0;
    });
    if (valid.length === 0) return;

    set({ syncing: true });
    const patch = await safeInvoke<AffectedPatch>("remove_nodes_batch", { ids: valid });
    if (!patch) {
      set({ syncing: false });
      return;
    }

    set((state) => {
      const nodes = { ...state.nodes };
      for (const id of valid) delete nodes[id];
      for (const node of patch.nodes) {
        const normalized = normalizeNode(node);
        nodes[normalized.id] = normalized;
      }
      const workPlans = { ...state.workPlans };
      for (const id of valid) delete workPlans[id];
      return { nodes, workPlans, totalCost: patch.total_cost, syncing: false, lastSyncedAt: Date.now(), ...markMutated };
    });
  },

  importExcel: async () => {
    if (!isTauriRuntime()) {
      await safeInvoke("import_excel", { path: "" });
      return;
    }
    const path = await open({
      multiple: false,
      filters: [{ name: "Excel Workbook", extensions: ["xlsx", "xlsm", "xls"] }],
    });
    if (!path || Array.isArray(path)) return;
    set({ syncing: true, loading: true });
    const snapshot = await safeInvoke<EngineSnapshot>("import_excel", { path });
    if (snapshot) {
      set((state) => ({
        ...ingest(snapshot),
        selectedId: snapshot.roots[0] ?? state.selectedId,
        activeCell: null,
      }));
    } else {
      set({ syncing: false, loading: false });
    }
  },

  exportExcel: async () => {
    if (!isTauriRuntime()) {
      await safeInvoke("export_excel", { path: "" });
      return;
    }
    const path = await save({
      defaultPath: "RAB-ConstrucSee.xlsx",
      filters: [{ name: "Excel Workbook", extensions: ["xlsx"] }],
    });
    if (!path) return;
    set({ syncing: true });
    const written = await safeInvoke<number>("export_excel", { path });
    set({ syncing: false, lastSyncedAt: written ? Date.now() : get().lastSyncedAt });
  },

  exportPdf: async () => {
    if (!isTauriRuntime()) {
      await safeInvoke("export_pdf", { path: "" });
      return;
    }
    const path = await save({
      defaultPath: "RAB-ConstrucSee.pdf",
      filters: [{ name: "PDF Document", extensions: ["pdf"] }],
    });
    if (!path) return;
    set({ syncing: true });
    const written = await safeInvoke<number>("export_pdf", { path });
    set({ syncing: false, lastSyncedAt: written ? Date.now() : get().lastSyncedAt });
  },

  previewPdf: async () => {
    if (!isTauriRuntime()) {
      await safeInvoke("preview_pdf");
      return;
    }
    set({ syncing: true });
    try {
      const bytes = await safeInvoke<number[]>("preview_pdf");
      if (!bytes || bytes.length === 0) return;
      const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      useUiStore.getState().openPdfPreview(url);
    } finally {
      set({ syncing: false });
    }
  },

  setOverhead: async (value) => {
    if (!Number.isFinite(value) || value < 0) return;
    set({ overhead: value });
    const snapshot = await safeInvoke<EngineSnapshot>("set_overhead", { percent: value });
    if (snapshot) set((state) => ({ ...ingest(snapshot), selectedId: state.selectedId }));
  },
  undo: async () => {
    const snapshot = await safeInvoke<EngineSnapshot>("undo");
    if (snapshot) set((state) => ({ ...ingest(snapshot), selectedId: state.selectedId }));
  },
  redo: async () => {
    const snapshot = await safeInvoke<EngineSnapshot>("redo");
    if (snapshot) set((state) => ({ ...ingest(snapshot), selectedId: state.selectedId }));
  },
  setPpn: (value) => set({ ppn: value }),

  loadWorkPlans: async () => {
    const plans = await safeInvoke<WorkPlan[]>("get_work_plans");
    if (!plans) return;
    const map: Record<string, WorkPlan> = {};
    for (const plan of plans) map[plan.node_id] = plan;
    set({ workPlans: map });
  },

  setWorkPlan: async (nodeId, numWorkers, durationDays) => {
    set((state) => ({
      workPlans: {
        ...state.workPlans,
        [nodeId]: { node_id: nodeId, num_workers: numWorkers, duration_days: durationDays },
      },
    }));
    const plan = await safeInvoke<WorkPlan>("set_work_plan", {
      node_id: nodeId,
      num_workers: numWorkers,
      duration_days: durationDays,
    });
    if (plan) set((state) => ({ workPlans: { ...state.workPlans, [plan.node_id]: plan } }));
  },

  loadAnalytics: async () => {
    set({ analyticsLoading: true });
    const analytics = await safeInvoke<Analytics>("get_analytics");
    set({ analytics: analytics ?? null, analyticsLoading: false });
  },

  setProjectStart: async (date) => {
    if (!date) return;
    const saved = await safeInvoke<string>("set_project_start", { date });
    if (saved) {
      set((state) => ({
        analytics: state.analytics ? { ...state.analytics, project_start: saved } : state.analytics,
      }));
      await get().loadAnalytics();
    }
  },

  loadRegion: async () => {
    const info = await safeInvoke<RegionInfo>("get_region");
    if (info) {
      set({
        regionId: info.region_id,
        regionName: info.region_name,
        regionMultiplier: info.multiplier_factor,
      });
    }
  },

  openRegion: async (regionId) => {
    await get().setRegion(regionId);
  },

  loadRegions: async () => {
    const regions = await safeInvoke<Region[]>("get_regions");
    const stats = await safeInvoke<MasterStats>("get_master_stats");
    set({ regions: regions ?? [], masterStats: stats ?? null });
  },

  setRegion: async (regionId) => {
    set({ syncing: true });
    try {
      const snapshot = await safeInvoke<EngineSnapshot>("set_region", {
        region_id: regionId,
      });
      if (snapshot) set(ingest(snapshot));
      await get().loadRegion();
    } finally {
      set({ syncing: false, lastSyncedAt: Date.now() });
    }
  },

  newProject: async () => {
    if (!isTauriRuntime()) return;
    set({ syncing: true });
    try {
      const snapshot = await safeInvoke<EngineSnapshot>("new_project");
      if (snapshot) {
        set({ ...ingest(snapshot), selectedId: null });
        await get().loadProjectInfo();
        await get().loadRegion();
      }
    } finally {
      set({ syncing: false, lastSyncedAt: Date.now() });
    }
  },

  openProject: async () => {
    if (!isTauriRuntime()) return;
    const path = await open({
      multiple: false,
      filters: [{ name: "ConstrucSee Project", extensions: ["csee", "db"] }],
    });
    if (!path) return;
    set({ syncing: true });
    try {
      const snapshot = await safeInvoke<EngineSnapshot>("open_project", { path });
      if (snapshot) {
        set({ ...ingest(snapshot), selectedId: snapshot.roots[0] ?? null });
        await get().loadProjectInfo();
        await get().loadRegion();
        await get().loadWorkPlans();
      }
    } finally {
      set({ syncing: false, lastSyncedAt: Date.now() });
    }
  },

  saveProject: async () => {
    if (!isTauriRuntime()) return;
    const path = await save({
      defaultPath: "Proyek-ConstrucSee.csee",
      filters: [{ name: "ConstrucSee Project", extensions: ["csee"] }],
    });
    if (!path) return;
    set({ syncing: true });
    try {
      const written = await safeInvoke<string>("save_project", { path });
      set({ lastSyncedAt: written ? Date.now() : get().lastSyncedAt });
    } finally {
      set({ syncing: false });
    }
  },

  loadProjectInfo: async () => {
    const info = await safeInvoke<ProjectInfo>("get_project_info");
    if (info) set({ projectInfo: info });
  },

  saveProjectInfo: async (info) => {
    const saved = await safeInvoke<ProjectInfo>("set_project_info", { info });
    if (saved) set({ projectInfo: saved });
  },

  loadHistory: async () => {
    const history = await safeInvoke<HistoryView>("get_history");
    if (history) set({ history });
  },

  indentNode: async (itemId) => {
    const snapshot = await safeInvoke<EngineSnapshot>("indent_node", { item_id: itemId });
    if (snapshot) set((state) => ({ ...ingest(snapshot), selectedId: state.selectedId }));
  },

  outdentNode: async (itemId) => {
    const snapshot = await safeInvoke<EngineSnapshot>("outdent_node", { item_id: itemId });
    if (snapshot) set((state) => ({ ...ingest(snapshot), selectedId: state.selectedId }));
  },

  expandAll: async () => {
    const snapshot = await safeInvoke<EngineSnapshot>("set_expand_all", { expanded: true });
    if (snapshot) set((state) => ({ ...ingest(snapshot), selectedId: state.selectedId }));
  },

  collapseAll: async () => {
    const snapshot = await safeInvoke<EngineSnapshot>("set_expand_all", { expanded: false });
    if (snapshot) set((state) => ({ ...ingest(snapshot), selectedId: state.selectedId }));
  },
}));
