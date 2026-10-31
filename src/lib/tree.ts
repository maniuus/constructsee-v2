import type { ComponentKind, DisplayRow, WbsNode } from "../types/wbs";
import { orderChildren, orderRoots } from "./order";

export type ComponentTotals = Record<ComponentKind, number>;

const emptyTotals = (): ComponentTotals => ({ bahan: 0, tenaga: 0, alat: 0 });

export const ANALYSIS_ORDER: ComponentKind[] = ["tenaga", "bahan", "alat"];

export function hasAnalysis(node: WbsNode): boolean {
  if (node.children_ids.length > 0) return false;
  return ANALYSIS_ORDER.some(
    (kind) =>
      node.components[kind].coefficient > 0 ||
      node.components[kind].subtotal > 0 ||
      node.components[kind].items.length > 0,
  );
}

export function flattenTree(
  nodes: Record<string, WbsNode>,
  roots: string[],
): DisplayRow[] {
  const rows: DisplayRow[] = [];

  const walk = (id: string, depth: number) => {
    const node = nodes[id];
    if (!node) return;
    const hasChildren = node.children_ids.length > 0;
    rows.push({ key: id, kind: "node", node, depth, hasChildren });
    if (hasChildren && node.is_expanded) {
      for (const childId of orderChildren(nodes, node.children_ids)) {
        walk(childId, depth + 1);
      }
      return;
    }
    if (!hasChildren && node.is_expanded && hasAnalysis(node)) {
      for (const componentKind of ANALYSIS_ORDER) {
        rows.push({
          key: `${id}:${componentKind}`,
          kind: "analysis",
          node,
          depth: depth + 1,
          hasChildren: false,
          componentKind,
        });
        node.components[componentKind].items.forEach((item, index) => {
          rows.push({
            key: `${id}:${componentKind}:${index}`,
            kind: "item",
            node,
            depth: depth + 2,
            hasChildren: false,
            componentKind,
            item,
          });
        });
      }
    }
  };

  for (const rootId of orderRoots(nodes, roots)) {
    walk(rootId, 0);
  }

  return rows;
}

export function componentTotals(
  nodes: Record<string, WbsNode>,
  id: string,
): ComponentTotals {
  const node = nodes[id];
  if (!node) return emptyTotals();

  if (node.children_ids.length === 0) {
    return {
      bahan: node.components.bahan.subtotal * node.volume,
      tenaga: node.components.tenaga.subtotal * node.volume,
      alat: node.components.alat.subtotal * node.volume,
    };
  }

  const totals = emptyTotals();
  for (const childId of node.children_ids) {
    const child = componentTotals(nodes, childId);
    totals.bahan += child.bahan;
    totals.tenaga += child.tenaga;
    totals.alat += child.alat;
  }
  return totals;
}

export function ancestorChain(nodes: Record<string, WbsNode>, id: string): WbsNode[] {
  const chain: WbsNode[] = [];
  let cursor = nodes[id]?.parent_id ?? null;
  while (cursor) {
    const parent = nodes[cursor];
    if (!parent) break;
    chain.push(parent);
    cursor = parent.parent_id;
  }
  return chain;
}
