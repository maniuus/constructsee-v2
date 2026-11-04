import type { ComponentKind, WbsNode } from "../types/wbs";
import { ANALYSIS_ORDER } from "./tree";
import { orderChildren, orderRoots } from "./order";

export interface ComponentMeta {
  label: string;
  letter: string;
  dot: string;
  text: string;
}

export const COMPONENT_META: Record<ComponentKind, ComponentMeta> = {
  tenaga: { label: "Tenaga Kerja", letter: "A", dot: "bg-accent2", text: "text-accent2" },
  bahan: { label: "Bahan", letter: "B", dot: "bg-accent", text: "text-accent" },
  alat: { label: "Alat", letter: "C", dot: "bg-alat", text: "text-alat" },
};

export interface LeafInfo {
  node: WbsNode;
  division: WbsNode | undefined;
  ancestors: WbsNode[];
}

export function collectLeaves(
  nodes: Record<string, WbsNode>,
  roots: string[],
): LeafInfo[] {
  const result: LeafInfo[] = [];
  const walk = (id: string, chain: WbsNode[]) => {
    const node = nodes[id];
    if (!node) return;
    if (node.children_ids.length === 0) {
      if (chain.length > 0) {
        result.push({ node, division: chain[chain.length - 1], ancestors: chain });
      }
      return;
    }
    for (const childId of orderChildren(nodes, node.children_ids)) {
      walk(childId, [...chain, node]);
    }
  };
  for (const rootId of orderRoots(nodes, roots)) walk(rootId, []);
  return result;
}

export interface UniqueItem {
  key: string;
  name: string;
  unit: string;
  kind: ComponentKind;
  base_price: number;
  quantity: number;
  subtotal: number;
}

export function collectUniqueItems(
  nodes: Record<string, WbsNode>,
  roots: string[],
): UniqueItem[] {
  const map = new Map<string, UniqueItem>();
  for (const { node } of collectLeaves(nodes, roots)) {
    for (const kind of ANALYSIS_ORDER) {
      for (const item of node.components[kind].items) {
        const key = `${item.name}|${item.unit}`;
        const quantity = node.volume * item.coefficient;
        const subtotal = node.volume * item.subtotal;
        const existing = map.get(key);
        if (existing) {
          existing.quantity += quantity;
          existing.subtotal += subtotal;
        } else {
          map.set(key, {
            key,
            name: item.name,
            unit: item.unit,
            kind,
            base_price: item.base_price,
            quantity,
            subtotal,
          });
        }
      }
    }
  }
  return [...map.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.unit.localeCompare(b.unit),
  );
}

export function tenagaMandays(node: WbsNode): number {
  return node.volume * node.components.tenaga.coefficient;
}

export function divisionLabel(info: LeafInfo): string {
  return info.division ? info.division.name : "—";
}
