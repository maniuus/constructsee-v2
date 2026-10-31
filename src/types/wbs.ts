export type ComponentKind = "bahan" | "tenaga" | "alat";

export interface ComponentItem {
  name: string;
  unit: string;
  coefficient: number;
  base_price: number;
  subtotal: number;
}

export interface ComponentCost {
  coefficient: number;
  base_price: number;
  subtotal: number;
  items: ComponentItem[];
}

export type WbsComponents = Record<ComponentKind, ComponentCost>;

export type PriceMethod = "ahsp" | "langsung";

export interface WbsNode {
  id: string;
  parent_id: string | null;
  children_ids: string[];
  code: string;
  name: string;
  unit: string;
  volume: number;
  unit_price: number;
  total_price: number;
  is_expanded: boolean;
  components: WbsComponents;
  method: PriceMethod;
}

export interface EngineSnapshot {
  nodes: WbsNode[];
  roots: string[];
  total_cost: number;
}

export interface AffectedPatch {
  nodes: WbsNode[];
  total_cost: number;
}

export interface DeltaPayload {
  item_id: string;
  field: EditableField;
  new_value: number;
}

export type EditableField = "volume" | "unit_price";

export type DisplayRowKind = "node" | "analysis" | "item";

export interface DisplayRow {
  key: string;
  kind: DisplayRowKind;
  node: WbsNode;
  depth: number;
  hasChildren: boolean;
  componentKind?: ComponentKind;
  item?: ComponentItem;
}
