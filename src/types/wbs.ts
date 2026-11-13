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
  overhead_percent: number;
  ppn_percent: number;
  can_undo: boolean;
  can_redo: boolean;
}

export interface WorkPlan {
  node_id: string;
  num_workers: number;
  duration_days: number;
}

export interface AffectedPatch {
  nodes: WbsNode[];
  total_cost: number;
}

export interface SCurvePoint {
  week: number;
  date: string;
  weekly: number;
  cumulative: number;
}

export interface ScheduleItem {
  node_id: string;
  code: string;
  name: string;
  start_day: number;
  end_day: number;
  duration_days: number;
  weight: number;
}

export interface ParetoItem {
  name: string;
  unit: string;
  category: string;
  total_cost: number;
  cost_percentage: number;
  cumulative_percentage: number;
  critical: boolean;
}

export interface Analytics {
  project_start: string;
  total_cost: number;
  total_days: number;
  s_curve: SCurvePoint[];
  schedule: ScheduleItem[];
  pareto: ParetoItem[];
  warnings: string[];
}

export interface DeltaPayload {
  item_id: string;
  field: EditableField;
  new_value: number;
}

export type EditableField = "volume" | "unit_price";

export interface Region {
  id: string;
  province: string;
  city_regency: string;
  multiplier_factor: number;
}

export interface RegionInfo {
  region_id: string;
  region_name: string;
  multiplier_factor: number;
}

export interface MasterStats {
  divisions: number;
  items: number;
  components: number;
  regions: number;
}

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

export interface ProjectInfo {
  name: string;
  location: string;
  owner: string;
  contractor: string;
  contract_no: string;
  start_date: string;
}

export interface HistoryView {
  undo: string[];
  redo: string[];
  can_undo: boolean;
  can_redo: boolean;
}
