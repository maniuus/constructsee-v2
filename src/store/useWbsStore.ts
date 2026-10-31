import { create } from "zustand";
import { open, save } from "@tauri-apps/plugin-dialog";
import { backfillComponentItems } from "../lib/mockEngine";
import { SNI_DIVISIONS } from "../lib/divisions";
import { isTauriRuntime, safeInvoke } from "../lib/tauriBridge";
import type {
  AffectedPatch,
  EditableField,
  EngineSnapshot,
  PriceMethod,
  WbsComponents,
  WbsNode,
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
  profit: number;
  ppn: number;
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
  setOverhead: (value: number) => void;
  setProfit: (value: number) => void;
  setPpn: (value: number) => void;
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
  loading: false,
  syncing: false,
  lastSyncedAt: Date.now(),
});

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
  profit: 8,
  ppn: 11,

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
      return { nodes, totalCost: patch.total_cost, syncing: false, lastSyncedAt: Date.now() };
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
      return { nodes, totalCost: patch.total_cost, syncing: false, lastSyncedAt: Date.now() };
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
      return { nodes, totalCost: patch.total_cost, syncing: false, lastSyncedAt: Date.now() };
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
      return { nodes, totalCost: patch.total_cost, syncing: false, lastSyncedAt: Date.now() };
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
    const merged: Record<string, WbsNode> = {};
    let totalCost = get().totalCost;

    for (const id of valid) {
      const patch = await safeInvoke<AffectedPatch>("remove_node", { item_id: id });
      if (!patch) continue;
      for (const node of patch.nodes) merged[node.id] = node;
      totalCost = patch.total_cost;
    }

    set((state) => {
      const nodes = { ...state.nodes };
      for (const id of valid) delete nodes[id];
      for (const node of Object.values(merged)) {
        const normalized = normalizeNode(node);
        nodes[normalized.id] = normalized;
      }
      return { nodes, totalCost, syncing: false, lastSyncedAt: Date.now() };
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

  setOverhead: (value) => set({ overhead: value }),
  setProfit: (value) => set({ profit: value }),
  setPpn: (value) => set({ ppn: value }),
}));
