import type { WbsNode } from "../types/wbs";
import { SNI_DIVISIONS } from "./divisions";

const DIVISION_RANK = new Map(SNI_DIVISIONS.map((division, index) => [division.code, index]));

function segments(code: string): number[] {
  return code.split(".").map((part) => {
    const value = Number.parseInt(part.replace(/[^0-9]/g, ""), 10);
    return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
  });
}

export function compareCode(a: string, b: string): number {
  const pa = segments(a);
  const pb = segments(b);
  const length = Math.max(pa.length, pb.length);
  for (let index = 0; index < length; index++) {
    const x = pa[index] ?? -1;
    const y = pb[index] ?? -1;
    if (x !== y) return x - y;
  }
  return a.localeCompare(b);
}

export function orderRoots(nodes: Record<string, WbsNode>, roots: string[]): string[] {
  return [...roots].sort((a, b) => {
    const ra = DIVISION_RANK.get(nodes[a]?.code ?? "") ?? Number.POSITIVE_INFINITY;
    const rb = DIVISION_RANK.get(nodes[b]?.code ?? "") ?? Number.POSITIVE_INFINITY;
    if (ra !== rb) return ra - rb;
    return compareCode(nodes[a]?.code ?? "", nodes[b]?.code ?? "");
  });
}

export function orderChildren(nodes: Record<string, WbsNode>, ids: string[]): string[] {
  return [...ids].sort((a, b) => compareCode(nodes[a]?.code ?? "", nodes[b]?.code ?? ""));
}
