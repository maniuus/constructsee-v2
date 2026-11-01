import type {
  AffectedPatch,
  Analytics,
  ComponentCost,
  ComponentItem,
  ComponentKind,
  DeltaPayload,
  EngineSnapshot,
  MasterStats,
  ParetoItem,
  PriceMethod,
  Region,
  RegionInfo,
  SCurvePoint,
  ScheduleItem,
  WbsComponents,
  WbsNode,
  WorkPlan,
} from "../types/wbs";
import { SNI_DIVISIONS } from "./divisions";

const COMPONENT_MODEL: Record<ComponentKind, { share: number }> = {
  bahan: { share: 0.7 },
  tenaga: { share: 0.3 },
  alat: { share: 0.0 },
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

const emptyComponent = (): ComponentCost => ({
  coefficient: 0,
  base_price: 0,
  subtotal: 0,
  items: [],
});

const componentsFromPrice = (unitPrice: number): WbsComponents => {
  const price = Number.isFinite(unitPrice) && unitPrice > 0 ? unitPrice : 0;
  return {
    bahan: componentFromShare(price * COMPONENT_MODEL.bahan.share, "bahan"),
    tenaga: componentFromShare(price * COMPONENT_MODEL.tenaga.share, "tenaga"),
    alat: emptyComponent(),
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
let overheadPercent = 10;
let workPlans: Record<string, WorkPlan> = {};
let projectStart = new Date().toISOString().slice(0, 10);

const MOCK_REGIONS: Region[] = [
  { id: "national", province: "NASIONAL", city_regency: "NASIONAL", multiplier_factor: 1.0 },
  { id: "dki-jakarta", province: "DKI JAKARTA", city_regency: "JAKARTA PUSAT", multiplier_factor: 1.052 },
  { id: "jawa-barat", province: "JAWA BARAT", city_regency: "KOTA BANDUNG", multiplier_factor: 1.0 },
  { id: "jawa-timur", province: "JAWA TIMUR", city_regency: "KOTA SURABAYA", multiplier_factor: 1.018 },
  { id: "bali", province: "BALI", city_regency: "KOTA DENPASAR", multiplier_factor: 1.095 },
  { id: "kalimantan-timur", province: "KALIMANTAN TIMUR", city_regency: "KOTA BALIKPAPAN", multiplier_factor: 1.248 },
  { id: "papua", province: "PAPUA", city_regency: "KABUPATEN PUNCAK JAYA", multiplier_factor: 1.85 },
];
let regionId = "national";
let regionName = "NASIONAL";
let regionMultiplier = 1;

const regionInfo = (): RegionInfo => ({
  region_id: regionId,
  region_name: regionName,
  multiplier_factor: regionMultiplier,
});

const withOverhead = (base: number): number => base * (1 + overheadPercent / 100);

const computeTotal = (current: { nodes: Record<string, WbsNode>; roots: string[] }): number =>
  withOverhead(
    current.roots.reduce((sum, id) => sum + current.nodes[id].total_price, 0),
  );

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
  const totalCost = computeTotal(current);
  return {
    nodes: Object.values(current.nodes).map((node) => ({ ...node })),
    roots: [...current.roots],
    total_cost: totalCost,
    overhead_percent: overheadPercent,
    can_undo: false,
    can_redo: false,
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

  const totalCost = computeTotal(current);
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
  const totalCost = computeTotal(current);
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

  const totalCost = computeTotal(current);
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

  const totalCost = computeTotal(current);
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

  const totalCost = computeTotal(current);
  return { nodes: affected, total_cost: totalCost };
};

const setOverhead = (percent: number): EngineSnapshot => {
  if (!Number.isFinite(percent) || percent < 0) {
    throw new Error("Overhead harus berupa angka non-negatif");
  }
  overheadPercent = percent;
  return snapshot();
};

const getWorkPlans = (): WorkPlan[] =>
  Object.values(workPlans).map((plan) => ({ ...plan }));

const setWorkPlan = (
  nodeId: string,
  numWorkers: number,
  durationDays: number,
): WorkPlan => {
  const current = ensureState();
  const node = current.nodes[nodeId];
  if (!node) throw new Error("Item WBS tidak ditemukan");
  if (node.children_ids.length > 0) {
    throw new Error("Rencana kerja hanya untuk baris pekerjaan (leaf)");
  }
  if (
    !Number.isFinite(numWorkers) ||
    numWorkers < 0 ||
    !Number.isFinite(durationDays) ||
    durationDays < 0
  ) {
    throw new Error("Nilai rencana kerja harus berupa angka non-negatif");
  }
  const plan: WorkPlan = {
    node_id: nodeId,
    num_workers: numWorkers,
    duration_days: durationDays,
  };
  workPlans = { ...workPlans, [nodeId]: plan };
  return plan;
};

const addDays = (base: string, days: number): string => {
  const date = new Date(`${base}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const orderedNodes = (): WbsNode[] => {
  const current = ensureState();
  const out: WbsNode[] = [];
  const walk = (id: string) => {
    const node = current.nodes[id];
    if (!node) return;
    out.push(node);
    for (const child of node.children_ids) walk(child);
  };
  for (const root of current.roots) walk(root);
  return out;
};

const computeAnalytics = (): Analytics => {
  const ordered = orderedNodes();
  const billable = ordered.filter(
    (node) => node.children_ids.length === 0 && node.total_price > 0,
  );
  const subtotal = billable.reduce((sum, node) => sum + node.total_price, 0);
  const warnings: string[] = [];
  if (subtotal <= 0) {
    warnings.push("Belum ada pekerjaan bernilai biaya untuk dijadwalkan.");
  }

  let cursor = 0;
  let missing = 0;
  const schedule: ScheduleItem[] = [];
  for (const node of billable) {
    const plan = workPlans[node.id];
    let duration = 1;
    if (plan && Number.isFinite(plan.duration_days) && plan.duration_days > 0) {
      duration = plan.duration_days;
    } else {
      missing += 1;
    }
    const weight = subtotal > 0 ? (node.total_price / subtotal) * 100 : 0;
    schedule.push({
      node_id: node.id,
      code: node.code,
      name: node.name,
      start_day: cursor,
      end_day: cursor + duration,
      duration_days: duration,
      weight,
    });
    cursor += duration;
  }
  if (missing > 0) {
    warnings.push(`${missing} pekerjaan belum punya durasi; memakai default 1 hari.`);
  }

  const totalDays = cursor;
  const dayCount = Math.max(1, Math.ceil(totalDays));
  const daily = new Array<number>(dayCount).fill(0);
  for (const item of schedule) {
    if (item.duration_days <= 0 || item.weight <= 0) continue;
    const first = Math.floor(item.start_day);
    const last = Math.ceil(item.end_day);
    for (let day = first; day < last; day += 1) {
      if (day < 0 || day >= dayCount) continue;
      const overlap = Math.min(item.end_day, day + 1) - Math.max(item.start_day, day);
      if (overlap > 0) daily[day] += (item.weight * overlap) / item.duration_days;
    }
  }

  const weekCount = Math.ceil(dayCount / 7);
  const sCurve: SCurvePoint[] = [];
  let cumulative = 0;
  for (let week = 0; week < weekCount; week += 1) {
    let weekly = 0;
    for (let day = week * 7; day < Math.min((week + 1) * 7, dayCount); day += 1) {
      weekly += daily[day];
    }
    cumulative += weekly;
    sCurve.push({
      week: week + 1,
      date: addDays(projectStart, week * 7),
      weekly,
      cumulative,
    });
  }

  const agg = new Map<
    string,
    { name: string; unit: string; category: string; total_cost: number }
  >();
  for (const node of billable) {
    const groups: Array<[string, ComponentCost]> = [
      ["tenaga", node.components.tenaga],
      ["bahan", node.components.bahan],
      ["alat", node.components.alat],
    ];
    for (const [category, cost] of groups) {
      for (const item of cost.items) {
        const total = item.coefficient * item.base_price * node.volume;
        if (total <= 0) continue;
        const key = `${item.name}|${item.unit}|${category}`;
        const existing = agg.get(key);
        if (existing) existing.total_cost += total;
        else agg.set(key, { name: item.name, unit: item.unit, category, total_cost: total });
      }
    }
  }

  const rows = [...agg.values()].sort((a, b) => b.total_cost - a.total_cost);
  const grand = rows.reduce((sum, row) => sum + row.total_cost, 0);
  const pareto: ParetoItem[] = [];
  let cumulativeCost = 0;
  if (grand > 0) {
    for (const row of rows) {
      const before = cumulativeCost;
      cumulativeCost += row.total_cost;
      pareto.push({
        ...row,
        cost_percentage: (row.total_cost / grand) * 100,
        cumulative_percentage: (cumulativeCost / grand) * 100,
        critical: before < 80,
      });
    }
  } else if (subtotal > 0) {
    warnings.push("Rincian resource (AHSP) belum tersedia untuk analisa Pareto.");
  }

  return {
    project_start: projectStart,
    total_cost: subtotal,
    total_days: totalDays,
    s_curve: sCurve,
    schedule,
    pareto,
    warnings,
  };
};

const removeNodesBatch = (ids: string[]): AffectedPatch => {
  const current = ensureState();
  const valid = ids.filter((id) => {
    const node = current.nodes[id];
    return Boolean(node) && node.children_ids.length === 0;
  });
  if (valid.length === 0) {
    throw new Error("Tidak ada baris pekerjaan (leaf) yang dapat dihapus");
  }

  const affectedIds: string[] = [];
  for (const id of valid) {
    const parentId = current.nodes[id].parent_id;
    if (parentId) {
      const parent = current.nodes[parentId];
      if (parent) {
        parent.children_ids = parent.children_ids.filter((child) => child !== id);
      }
      affectedIds.push(parentId);
      let cursor = current.nodes[parentId]?.parent_id ?? null;
      while (cursor) {
        affectedIds.push(cursor);
        cursor = current.nodes[cursor]?.parent_id ?? null;
      }
    } else {
      current.roots = current.roots.filter((root) => root !== id);
    }
  }

  for (const id of valid) {
    delete current.nodes[id];
    delete workPlans[id];
  }
  rollup(current.nodes);

  const affected: WbsNode[] = [];
  const seen = new Set<string>();
  for (const id of affectedIds) {
    const node = current.nodes[id];
    if (node && !seen.has(id)) {
      seen.add(id);
      affected.push({ ...node });
    }
  }
  return { nodes: affected, total_cost: computeTotal(current) };
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
    case "remove_nodes_batch":
      return removeNodesBatch((args?.ids as string[] | undefined) ?? []) as T;
    case "set_overhead":
      return setOverhead(Number(args?.percent)) as T;
    case "get_work_plans":
      return getWorkPlans() as T;
    case "set_work_plan":
      return setWorkPlan(
        String(args?.node_id),
        Number(args?.num_workers),
        Number(args?.duration_days),
      ) as T;
    case "get_analytics":
      return computeAnalytics() as T;
    case "set_project_start": {
      const date = String(args?.date ?? "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new Error("Format tanggal harus YYYY-MM-DD");
      }
      projectStart = date;
      return projectStart as T;
    }
    case "get_region":
      return regionInfo() as T;
    case "get_regions":
      return [...MOCK_REGIONS] as T;
    case "get_master_stats":
      return {
        divisions: 10,
        items: 3155,
        components: 0,
        regions: MOCK_REGIONS.length,
      } as MasterStats as T;
    case "set_region": {
      const id = String(args?.region_id ?? "");
      const region = MOCK_REGIONS.find((item) => item.id === id);
      if (!region) throw new Error(`Wilayah ${id} tidak ditemukan`);
      const ratio = regionMultiplier > 0 ? region.multiplier_factor / regionMultiplier : region.multiplier_factor;
      const current = ensureState();
      for (const node of Object.values(current.nodes)) {
        if (node.children_ids.length > 0) continue;
        for (const kind of ["bahan", "tenaga", "alat"] as ComponentKind[]) {
          const component = node.components[kind];
          for (const item of component.items) {
            item.base_price *= ratio;
            item.subtotal = item.coefficient * item.base_price;
          }
          component.subtotal = component.items.reduce((sum, item) => sum + item.subtotal, 0);
          component.base_price =
            component.coefficient > 0 ? component.subtotal / component.coefficient : component.base_price;
        }
        const total =
          node.components.bahan.subtotal + node.components.tenaga.subtotal + node.components.alat.subtotal;
        if (total > 0) node.unit_price = total;
        node.total_price = node.volume * node.unit_price;
      }
      rollup(current.nodes);
      regionId = region.id;
      regionName = `${region.province} — ${region.city_regency}`;
      regionMultiplier = region.multiplier_factor;
      return snapshot() as T;
    }
    case "import_excel":
      throw new Error("Import Excel hanya tersedia pada runtime desktop Tauri.");
    case "export_excel":
      throw new Error("Export Excel hanya tersedia pada runtime desktop Tauri.");
    case "export_pdf":
      throw new Error("Export PDF hanya tersedia pada runtime desktop Tauri.");
    case "preview_pdf":
      throw new Error("Preview PDF hanya tersedia pada runtime desktop Tauri.");
    default:
      throw new Error(`Command mock tidak dikenal: ${command}`);
  }
}
