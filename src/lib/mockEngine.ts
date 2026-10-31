import type {
  AffectedPatch,
  ComponentCost,
  ComponentItem,
  ComponentKind,
  DeltaPayload,
  EngineSnapshot,
  PriceMethod,
  WbsComponents,
  WbsNode,
} from "../types/wbs";
import { SNI_DIVISIONS } from "./divisions";

const COMPONENT_MODEL: Record<ComponentKind, { share: number }> = {
  bahan: { share: 0.58 },
  tenaga: { share: 0.27 },
  alat: { share: 0.15 },
};

interface ItemTemplate {
  name: string;
  unit: string;
  coefficient: number;
  weight: number;
}

const ITEM_TEMPLATES: Record<ComponentKind, ItemTemplate[]> = {
  bahan: [
    { name: "Material Utama", unit: "ls", coefficient: 0.7, weight: 0.72 },
    { name: "Material Pendukung", unit: "ls", coefficient: 0.3, weight: 0.28 },
  ],
  tenaga: [
    { name: "Pekerja", unit: "OH", coefficient: 0.2, weight: 0.45 },
    { name: "Tukang", unit: "OH", coefficient: 0.1, weight: 0.33 },
    { name: "Kepala Tukang", unit: "OH", coefficient: 0.03, weight: 0.12 },
    { name: "Mandor", unit: "OH", coefficient: 0.02, weight: 0.1 },
  ],
  alat: [
    { name: "Alat Berat", unit: "jam", coefficient: 0.12, weight: 0.7 },
    { name: "Alat Bantu", unit: "jam", coefficient: 0.06, weight: 0.3 },
  ],
};

const componentFromShare = (share: number, kind: ComponentKind): ComponentCost => {
  const items: ComponentItem[] = ITEM_TEMPLATES[kind].map((template) => {
    const subtotal = share * template.weight;
    const basePrice = template.coefficient > 0 ? subtotal / template.coefficient : 0;
    return {
      name: template.name,
      unit: template.unit,
      coefficient: template.coefficient,
      base_price: basePrice,
      subtotal,
    };
  });
  const coefficient = items.reduce((sum, item) => sum + item.coefficient, 0);
  const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
  return {
    coefficient,
    base_price: coefficient > 0 ? subtotal / coefficient : 0,
    subtotal,
    items,
  };
};

export const backfillComponentItems = (components: WbsComponents): WbsComponents => {
  if (!components) return components;
  const fix = (component: ComponentCost | undefined, kind: ComponentKind): ComponentCost => {
    if (!component) return componentsFromPrice(0)[kind];
    if (component.items && component.items.length > 0) return component;
    if (component.coefficient <= 0 && component.subtotal <= 0) return component;
    return componentFromShare(component.subtotal, kind);
  };
  return {
    bahan: fix(components.bahan, "bahan"),
    tenaga: fix(components.tenaga, "tenaga"),
    alat: fix(components.alat, "alat"),
  };
};

const componentsFromPrice = (unitPrice: number): WbsComponents => {
  const price = Number.isFinite(unitPrice) && unitPrice > 0 ? unitPrice : 0;
  return {
    bahan: componentFromShare(price * COMPONENT_MODEL.bahan.share, "bahan"),
    tenaga: componentFromShare(price * COMPONENT_MODEL.tenaga.share, "tenaga"),
    alat: componentFromShare(price * COMPONENT_MODEL.alat.share, "alat"),
  };
};

const componentsTotal = (components: WbsComponents): number =>
  components.bahan.subtotal + components.tenaga.subtotal + components.alat.subtotal;

const scaleComponent = (component: ComponentCost, factor: number): ComponentCost => {
  const items = component.items.map((item) => {
    const basePrice = item.base_price * factor;
    return { ...item, base_price: basePrice, subtotal: item.coefficient * basePrice };
  });
  const basePrice = component.base_price * factor;
  return {
    coefficient: component.coefficient,
    base_price: basePrice,
    subtotal: component.coefficient * basePrice,
    items,
  };
};

const rebalanceComponents = (
  components: WbsComponents,
  target: number,
): WbsComponents => {
  if (!Number.isFinite(target) || target <= 0) return componentsFromPrice(0);
  const current = componentsTotal(components);
  if (current <= Number.EPSILON) return componentsFromPrice(target);
  const factor = target / current;
  return {
    bahan: scaleComponent(components.bahan, factor),
    tenaga: scaleComponent(components.tenaga, factor),
    alat: scaleComponent(components.alat, factor),
  };
};

interface MockRow {
  id: string;
  parent: string | null;
  code: string;
  name: string;
  unit: string;
  volume: number;
  price: number;
  children: string[];
}

const SEED_ITEMS: Record<string, Array<[string, string, string, number, number]>> = {
  "div-1": [
    ["1.1", "Pembersihan Lahan & Pengukuran", "m2", 1200, 25000],
    ["1.2", "Direksi Keet & Mobilisasi", "ls", 1, 18500000],
  ],
  "div-2": [
    ["2.1", "Galian Tanah Pondasi", "m3", 420, 95000],
    ["2.2", "Beton Struktur K-225", "m3", 260, 1450000],
    ["2.3", "Pembesian & Bekisting", "kg", 18500, 16500],
  ],
  "div-3": [
    ["3.1", "Pasangan Dinding Bata Ringan", "m2", 1450, 185000],
    ["3.2", "Plesteran & Acian", "m2", 2900, 68000],
  ],
  "div-5": [
    ["5.1", "Instalasi Listrik & Penerangan", "ls", 1, 125000000],
    ["5.2", "Instalasi Plumbing & Sanitair", "ls", 1, 87000000],
  ],
};

const buildSeed = (): MockRow[] => {
  const rows: MockRow[] = [];
  for (const { id, code, name } of SNI_DIVISIONS) {
    const items = SEED_ITEMS[id] ?? [];
    rows.push({
      id,
      parent: null,
      code,
      name,
      unit: "",
      volume: 0,
      price: 0,
      children: items.map(([itemCode]) => `item-${itemCode}`),
    });
    for (const [itemCode, itemName, unit, volume, price] of items) {
      rows.push({
        id: `item-${itemCode}`,
        parent: id,
        code: itemCode,
        name: itemName,
        unit,
        volume,
        price,
        children: [],
      });
    }
  }
  return rows;
};

const seedRows = buildSeed();

const toNodes = (rows: MockRow[]): Record<string, WbsNode> => {
  const nodes: Record<string, WbsNode> = {};
  for (const row of rows) {
    const components = componentsFromPrice(row.children.length > 0 ? 0 : row.price);
    nodes[row.id] = {
      id: row.id,
      parent_id: row.parent,
      children_ids: [...row.children],
      code: row.code,
      name: row.name,
      unit: row.unit,
      volume: row.volume,
      unit_price: componentsTotal(components),
      total_price: 0,
      is_expanded: row.children.length > 0,
      components,
      method: "langsung",
    };
  }
  rollup(nodes);
  return nodes;
};

const rollup = (nodes: Record<string, WbsNode>): void => {
  const visit = (node: WbsNode): number => {
    if (node.children_ids.length === 0) {
      node.unit_price = componentsTotal(node.components);
      node.total_price = node.volume * node.unit_price;
      return node.total_price;
    }
    node.total_price = node.children_ids.reduce(
      (sum, childId) => sum + visit(nodes[childId]),
      0,
    );
    return node.total_price;
  };
  for (const node of Object.values(nodes)) {
    if (node.parent_id === null) visit(node);
  }
};

let state: { nodes: Record<string, WbsNode>; roots: string[] } | null = null;

const ensureState = () => {
  if (!state) {
    state = {
      nodes: toNodes(seedRows),
      roots: seedRows.filter((row) => row.parent === null).map((row) => row.id),
    };
  }
  return state;
};

const snapshot = (): EngineSnapshot => {
  const current = ensureState();
  const totalCost = current.roots.reduce(
    (sum, id) => sum + current.nodes[id].total_price,
    0,
  );
  return {
    nodes: Object.values(current.nodes).map((node) => ({ ...node })),
    roots: [...current.roots],
    total_cost: totalCost,
  };
};

const updateCell = (payload: DeltaPayload): AffectedPatch => {
  const current = ensureState();
  const node = current.nodes[payload.item_id];
  if (!node) throw new Error(`Node ${payload.item_id} tidak ditemukan`);
  if (node.children_ids.length > 0) throw new Error("Baris parent tidak dapat diedit langsung");

  if (payload.field === "unit_price" && node.method === "ahsp") {
    throw new Error("Harga Satuan Pekerjaan dihitung otomatis pada metode SNI/AHSP");
  }

  if (payload.field === "volume") {
    node.volume = payload.new_value;
  } else {
    node.components = rebalanceComponents(node.components, payload.new_value);
    node.unit_price = componentsTotal(node.components);
  }
  node.total_price = node.volume * node.unit_price;

  const affected: WbsNode[] = [{ ...node }];
  let cursor = node.parent_id;
  while (cursor) {
    const parent = current.nodes[cursor];
    parent.total_price = parent.children_ids.reduce(
      (sum, childId) => sum + current.nodes[childId].total_price,
      0,
    );
    affected.push({ ...parent });
    cursor = parent.parent_id;
  }

  const totalCost = current.roots.reduce(
    (sum, id) => sum + current.nodes[id].total_price,
    0,
  );
  return { nodes: affected, total_cost: totalCost };
};

const toggleExpand = (itemId: string, expanded: boolean): EngineSnapshot => {
  const current = ensureState();
  const node = current.nodes[itemId];
  if (node) node.is_expanded = expanded;
  return snapshot();
};

const setMethod = (itemId: string, method: PriceMethod): AffectedPatch => {
  const current = ensureState();
  const node = current.nodes[itemId];
  if (!node) throw new Error(`Node ${itemId} tidak ditemukan`);
  if (node.children_ids.length > 0) throw new Error("Metode hanya berlaku untuk baris pekerjaan (leaf)");
  if (method !== "ahsp" && method !== "langsung") throw new Error(`Metode tidak dikenal: ${method}`);
  node.method = method;
  const totalCost = current.roots.reduce(
    (sum, id) => sum + current.nodes[id].total_price,
    0,
  );
  return { nodes: [{ ...node }], total_cost: totalCost };
};

const setItemPrice = (name: string, unit: string, basePrice: number): AffectedPatch => {
  const current = ensureState();
  if (!Number.isFinite(basePrice) || basePrice < 0) {
    throw new Error("Harga dasar harus berupa angka non-negatif");
  }

  const setComponentItemPrice = (component: ComponentCost): boolean => {
    let touched = false;
    for (const item of component.items) {
      if (item.name === name && item.unit === unit) {
        item.base_price = basePrice;
        item.subtotal = item.coefficient * basePrice;
        touched = true;
      }
    }
    if (touched) {
      component.subtotal = component.items.reduce((sum, item) => sum + item.subtotal, 0);
      component.coefficient = component.items.reduce((sum, item) => sum + item.coefficient, 0);
      component.base_price =
        component.coefficient > 0 ? component.subtotal / component.coefficient : basePrice;
    }
    return touched;
  };

  const touchedIds: string[] = [];
  for (const node of Object.values(current.nodes)) {
    if (node.children_ids.length > 0) continue;
    const components = node.components;
    const bahanTouched = setComponentItemPrice(components.bahan);
    const tenagaTouched = setComponentItemPrice(components.tenaga);
    const alatTouched = setComponentItemPrice(components.alat);
    if (bahanTouched || tenagaTouched || alatTouched) {
      node.unit_price = componentsTotal(components);
      node.total_price = node.volume * node.unit_price;
      touchedIds.push(node.id);
    }
  }

  if (touchedIds.length === 0) {
    throw new Error(`Item ${name} (${unit}) tidak ditemukan`);
  }

  const affected: WbsNode[] = [];
  const seen = new Set<string>();
  for (const id of touchedIds) {
    const node = current.nodes[id];
    if (seen.add(id)) affected.push({ ...node });
    let cursor = node.parent_id;
    while (cursor) {
      const parent = current.nodes[cursor];
      parent.total_price = parent.children_ids.reduce(
        (sum, childId) => sum + current.nodes[childId].total_price,
        0,
      );
      if (seen.add(cursor)) affected.push({ ...parent });
      cursor = parent.parent_id;
    }
  }

  const totalCost = current.roots.reduce(
    (sum, id) => sum + current.nodes[id].total_price,
    0,
  );
  return { nodes: affected, total_cost: totalCost };
};

const collectAffected = (
  current: { nodes: Record<string, WbsNode> },
  startId: string | null,
): WbsNode[] => {
  const affected: WbsNode[] = [];
  const seen = new Set<string>();
  let cursor = startId;
  while (cursor) {
    const node = current.nodes[cursor];
    if (!node) break;
    if (!seen.has(node.id)) {
      seen.add(node.id);
      affected.push({ ...node });
    }
    cursor = node.parent_id;
  }
  return affected;
};

const addNode = (parentId: string | null, incoming: WbsNode): AffectedPatch => {
  const current = ensureState();
  if (current.nodes[incoming.id]) throw new Error(`Node ${incoming.id} sudah ada`);

  const node: WbsNode = {
    ...incoming,
    parent_id: parentId,
    children_ids: [],
    is_expanded: false,
  };

  if (parentId) {
    const parent = current.nodes[parentId];
    if (!parent) throw new Error(`Divisi induk ${parentId} tidak ditemukan`);
    if (!parent.children_ids.includes(node.id)) parent.children_ids.push(node.id);
  } else {
    current.roots.push(node.id);
  }

  if (componentsTotal(node.components) <= 0 && node.unit_price > 0) {
    node.components = componentsFromPrice(node.unit_price);
  }
  if (componentsTotal(node.components) > 0) {
    node.unit_price = componentsTotal(node.components);
  }
  node.total_price = node.volume * node.unit_price;
  current.nodes[node.id] = node;
  rollup(current.nodes);

  const affected = collectAffected(current, node.id);
  for (const extra of collectAffected(current, parentId)) {
    if (!affected.some((item) => item.id === extra.id)) affected.push(extra);
  }

  const totalCost = current.roots.reduce(
    (sum, id) => sum + current.nodes[id].total_price,
    0,
  );
  return { nodes: affected, total_cost: totalCost };
};

const removeNode = (itemId: string): AffectedPatch => {
  const current = ensureState();
  const node = current.nodes[itemId];
  if (!node) throw new Error(`Node ${itemId} tidak ditemukan`);
  if (node.children_ids.length > 0) {
    throw new Error("Hanya baris pekerjaan (leaf) yang dapat dihapus");
  }

  const parentId = node.parent_id;
  if (parentId) {
    const parent = current.nodes[parentId];
    if (parent) {
      parent.children_ids = parent.children_ids.filter((id) => id !== itemId);
    }
  } else {
    current.roots = current.roots.filter((id) => id !== itemId);
  }
  delete current.nodes[itemId];
  rollup(current.nodes);

  const affected = collectAffected(current, parentId);

  const totalCost = current.roots.reduce(
    (sum, id) => sum + current.nodes[id].total_price,
    0,
  );
  return { nodes: affected, total_cost: totalCost };
};

export async function mockInvoke<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, 40));

  switch (command) {
    case "get_wbs":
      return snapshot() as T;
    case "update_wbs_cell":
      return updateCell(args?.payload as DeltaPayload) as T;
    case "toggle_expand":
      return toggleExpand(
        String(args?.item_id),
        Boolean(args?.expanded),
      ) as T;
    case "set_price_method":
      return setMethod(
        String(args?.item_id),
        args?.method as PriceMethod,
      ) as T;
    case "set_item_price":
      return setItemPrice(
        String(args?.name),
        String(args?.unit),
        Number(args?.base_price),
      ) as T;
    case "add_node":
      return addNode(
        (args?.parent_id as string | null | undefined) ?? null,
        args?.node as WbsNode,
      ) as T;
    case "remove_node":
      return removeNode(String(args?.item_id)) as T;
    case "import_excel":
      throw new Error("Import Excel hanya tersedia pada runtime desktop Tauri.");
    case "export_excel":
      throw new Error("Export Excel hanya tersedia pada runtime desktop Tauri.");
    default:
      throw new Error(`Command mock tidak dikenal: ${command}`);
  }
}
