import type { ComponentCost, ComponentKind, WbsComponents, WbsNode } from "../types/wbs";

export type AhspCategory = "Tenaga Kerja" | "Bahan" | "Alat";

export interface AhspResource {
  category: AhspCategory;
  name: string;
  code: string;
  unit: string;
  coefficient: number;
}

export interface AhspItem {
  id: string;
  code: string;
  name: string;
  unit: string;
  level: number;
  parentCode: string;
  divisionId: number;
}

export interface AhspDivision {
  id: number;
  code: string;
  name: string;
}

export interface AhspCatalog {
  divisions: AhspDivision[];
  divisionsById: Map<number, AhspDivision>;
  items: AhspItem[];
  leaves: AhspItem[];
  byId: Map<string, AhspItem>;
  childrenByParent: Map<string, AhspItem[]>;
  komp: Map<string, AhspResource[]>;
}

const CATEGORY_TO_KIND: Record<string, ComponentKind> = {
  "Tenaga Kerja": "tenaga",
  Bahan: "bahan",
  Alat: "alat",
};

// Peta sinonim kode divisi AHSP -> kata kunci nama divisi WBS.
const DIVISION_SYNONYMS: Record<string, string[]> = {
  "1": ["persiapan", "lapangan", "site"],
  "2": ["struktur", "structure"],
  "3": ["arsitektur", "architecture"],
  "4": ["lansekap", "landscape", "taman"],
  "5": ["mekanikal", "elektrikal", "mep"],
  "6": ["plambing", "plumbing"],
  "7": ["jalan", "road"],
  "8": ["drainase", "drainage"],
  "9": ["pipa"],
  "10": ["risha"],
};

let cache: Promise<AhspCatalog> | null = null;

export function loadAhspCatalog(): Promise<AhspCatalog> {
  if (!cache) {
    cache = parseCatalog().catch((error) => {
      cache = null;
      throw error;
    });
  }
  return cache;
}

async function parseCatalog(): Promise<AhspCatalog> {
  const response = await fetch("/data/ahsp.json");
  if (!response.ok) throw new Error(`Gagal memuat katalog AHSP (${response.status})`);
  const raw = (await response.json()) as {
    divisi: Array<[number, string, string]>;
    items: Array<[number | string, string, string, string, number, string, number]>;
    komp: Record<string, Array<[string, string, string, string, number]>>;
  };

  const divisions: AhspDivision[] = raw.divisi.map(([id, code, name]) => ({
    id: Number(id),
    code: String(code),
    name: String(name),
  }));
  const divisionsById = new Map(divisions.map((division) => [division.id, division]));

  const items: AhspItem[] = raw.items.map((row) => ({
    id: String(row[0]),
    code: String(row[1]),
    name: String(row[2]),
    unit: String(row[3]),
    level: Number(row[4]),
    parentCode: String(row[5]),
    divisionId: Number(row[6]),
  }));
  const byId = new Map(items.map((item) => [item.id, item]));
  const leaves = items.filter((item) => item.unit.trim().length > 0);

  const childrenByParent = new Map<string, AhspItem[]>();
  for (const item of items) {
    const list = childrenByParent.get(item.parentCode);
    if (list) list.push(item);
    else childrenByParent.set(item.parentCode, [item]);
  }

  const komp = new Map<string, AhspResource[]>();
  for (const [id, rows] of Object.entries(raw.komp)) {
    komp.set(
      id,
      rows.map(([category, name, code, unit, coefficient]) => ({
        category: String(category) as AhspCategory,
        name: String(name),
        code: String(code),
        unit: String(unit),
        coefficient: Number(coefficient),
      })),
    );
  }

  return { divisions, divisionsById, items, leaves, byId, childrenByParent, komp };
}

export function resourcesOf(catalog: AhspCatalog, itemId: string): AhspResource[] {
  return catalog.komp.get(itemId) ?? [];
}

export function divisionOfItem(catalog: AhspCatalog, item: AhspItem): AhspDivision | undefined {
  return catalog.divisionsById.get(item.divisionId);
}

/** Subdivisi (level 2) yang berada di bawah sebuah divisi. */
export function subdivisionsOf(catalog: AhspCatalog, divisionId: number): AhspItem[] {
  return catalog.items
    .filter((item) => item.level === 2 && item.divisionId === divisionId)
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
}

/** Semua kode item (termasuk akar) dalam subtree sebuah kode. */
export function subtreeCodes(catalog: AhspCatalog, rootCode: string): Set<string> {
  const codes = new Set<string>();
  const stack = [rootCode];
  while (stack.length > 0) {
    const code = stack.pop() as string;
    if (codes.has(code)) continue;
    codes.add(code);
    const children = catalog.childrenByParent.get(code);
    if (children) for (const child of children) stack.push(child.code);
  }
  return codes;
}

export function searchLeaves(catalog: AhspCatalog, query: string, limit = 60): AhspItem[] {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const pool = tokens.length === 0 ? catalog.leaves : catalog.leaves.filter((item) => {
    const haystack = `${item.code} ${item.name}`.toLowerCase();
    return tokens.every((token) => haystack.includes(token));
  });
  return pool.slice(0, limit);
}

/** Skor kecocokan AHSP division -> kandidat WBS division. */
export function suggestWbsDivision(
  catalog: AhspCatalog,
  item: AhspItem,
  wbsDivisions: WbsNode[],
): WbsNode | undefined {
  const ahspDivision = catalog.divisionsById.get(item.divisionId);
  const keywords = ahspDivision ? DIVISION_SYNONYMS[ahspDivision.code] ?? [] : [];
  let best: WbsNode | undefined;
  let bestScore = 0;
  for (const division of wbsDivisions) {
    const haystack = division.name.toLowerCase();
    const score = keywords.filter((keyword) => haystack.includes(keyword)).length;
    if (score > bestScore) {
      bestScore = score;
      best = division;
    }
  }
  return bestScore > 0 ? best : undefined;
}

export type PriceLookup = (name: string, unit: string) => number;

export function buildPriceLookup(nodes: WbsNode[] | Record<string, WbsNode>): PriceLookup {
  const list = Array.isArray(nodes) ? nodes : Object.values(nodes);
  const map = new Map<string, number>();
  for (const node of list) {
    for (const kind of ["bahan", "tenaga", "alat"] as ComponentKind[]) {
      for (const item of node.components[kind].items) {
        const key = `${item.name}|${item.unit}`;
        const existing = map.get(key);
        if (existing === undefined || (existing === 0 && item.base_price > 0)) {
          map.set(key, item.base_price);
        }
      }
    }
  }
  return (name, unit) => map.get(`${name}|${unit}`) ?? 0;
}

export function buildComponents(resources: AhspResource[], priceLookup: PriceLookup): WbsComponents {
  const empty = (): ComponentCost => ({ coefficient: 0, base_price: 0, subtotal: 0, items: [] });
  const components: WbsComponents = { bahan: empty(), tenaga: empty(), alat: empty() };

  for (const resource of resources) {
    const kind = CATEGORY_TO_KIND[resource.category];
    if (!kind) continue;
    const basePrice = priceLookup(resource.name, resource.unit) || 0;
    components[kind].items.push({
      name: resource.name,
      unit: resource.unit,
      coefficient: resource.coefficient,
      base_price: basePrice,
      subtotal: resource.coefficient * basePrice,
    });
  }

  for (const kind of ["bahan", "tenaga", "alat"] as ComponentKind[]) {
    const component = components[kind];
    component.coefficient = component.items.reduce((sum, item) => sum + item.coefficient, 0);
    component.subtotal = component.items.reduce((sum, item) => sum + item.subtotal, 0);
    component.base_price = component.coefficient > 0 ? component.subtotal / component.coefficient : 0;
  }

  return components;
}

export function componentsTotal(components: WbsComponents): number {
  return components.bahan.subtotal + components.tenaga.subtotal + components.alat.subtotal;
}

export function ahspLeafToNode(
  item: AhspItem,
  resources: AhspResource[],
  priceLookup: PriceLookup,
  volume: number,
): WbsNode {
  const components = buildComponents(resources, priceLookup);
  const unitPrice = componentsTotal(components);
  return {
    id: `ahsp-${item.id}`,
    parent_id: null,
    children_ids: [],
    code: item.code,
    name: item.name,
    unit: item.unit,
    volume,
    unit_price: unitPrice,
    total_price: volume * unitPrice,
    is_expanded: false,
    components,
    method: "ahsp",
  };
}
