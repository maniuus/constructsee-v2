use std::collections::HashMap;
use std::path::{Path, PathBuf};

use tokio::sync::{mpsc, oneshot};

use super::history::{CellChange, CommandHistory, RemovedNode, ReversibleCommand};
use super::models::{
    AffectedPatch, DeltaPayload, EngineSnapshot, RegionInfo, WbsComponents, WbsNode, WorkPlan,
    METHOD_AHSP, METHOD_LANGSUNG,
};
use super::analytics::{self, Analytics};
use super::{calc, db, seed};
use crate::excel;

pub type Reply<T> = oneshot::Sender<Result<T, String>>;

pub const DEFAULT_OVERHEAD_PERCENT: f64 = 10.0;

/// Batas entri riwayat undo/redo; melebihi batas → entri terlama dibuang.
pub const HISTORY_CAPACITY: usize = 100;

#[allow(clippy::large_enum_variant)]
pub enum EngineCommand {
    Snapshot { reply: Reply<EngineSnapshot> },
    UpdateCell { payload: DeltaPayload, reply: Reply<AffectedPatch> },
    ToggleExpand { item_id: String, expanded: bool, reply: Reply<EngineSnapshot> },
    SetMethod { item_id: String, method: String, reply: Reply<AffectedPatch> },
    SetItemPrice { name: String, unit: String, base_price: f64, reply: Reply<AffectedPatch> },
    SetOverhead { percent: f64, reply: Reply<EngineSnapshot> },
    GetWorkPlans { reply: Reply<Vec<WorkPlan>> },
    SetWorkPlan { node_id: String, num_workers: f64, duration_days: f64, reply: Reply<WorkPlan> },
    AddNode { parent_id: Option<String>, node: WbsNode, reply: Reply<AffectedPatch> },
    RemoveNode { item_id: String, reply: Reply<AffectedPatch> },
    RemoveNodesBatch { ids: Vec<String>, reply: Reply<AffectedPatch> },
    Import { path: String, reply: Reply<EngineSnapshot> },
    Export { path: String, reply: Reply<u32> },
    ExportPdf { path: String, reply: Reply<u32> },
    PreviewPdf { reply: Reply<Vec<u8>> },
    GetAnalytics { reply: Reply<Analytics> },
    SetProjectStart { date: String, reply: Reply<String> },
    GetRegion { reply: Reply<RegionInfo> },
    SetRegion { region_id: String, region_name: String, multiplier_factor: f64, reply: Reply<EngineSnapshot> },
    Undo { reply: Reply<EngineSnapshot> },
    Redo { reply: Reply<EngineSnapshot> },
    Checkpoint { reply: Reply<()> },
}

#[derive(Clone)]
pub struct EngineHandle {
    tx: mpsc::Sender<EngineCommand>,
}

impl EngineHandle {
    pub async fn snapshot(&self) -> Result<EngineSnapshot, String> {
        self.request(|reply| EngineCommand::Snapshot { reply }).await
    }

    pub async fn update_cell(&self, payload: DeltaPayload) -> Result<AffectedPatch, String> {
        self.request(|reply| EngineCommand::UpdateCell { payload, reply })
            .await
    }

    pub async fn toggle_expand(
        &self,
        item_id: String,
        expanded: bool,
    ) -> Result<EngineSnapshot, String> {
        self.request(|reply| EngineCommand::ToggleExpand {
            item_id,
            expanded,
            reply,
        })
        .await
    }

    pub async fn set_method(&self, item_id: String, method: String) -> Result<AffectedPatch, String> {
        self.request(|reply| EngineCommand::SetMethod {
            item_id,
            method,
            reply,
        })
        .await
    }

    pub async fn set_item_price(
        &self,
        name: String,
        unit: String,
        base_price: f64,
    ) -> Result<AffectedPatch, String> {
        self.request(|reply| EngineCommand::SetItemPrice {
            name,
            unit,
            base_price,
            reply,
        })
        .await
    }

    pub async fn set_overhead(&self, percent: f64) -> Result<EngineSnapshot, String> {
        self.request(|reply| EngineCommand::SetOverhead { percent, reply })
            .await
    }

    pub async fn work_plans(&self) -> Result<Vec<WorkPlan>, String> {
        self.request(|reply| EngineCommand::GetWorkPlans { reply }).await
    }

    pub async fn set_work_plan(
        &self,
        node_id: String,
        num_workers: f64,
        duration_days: f64,
    ) -> Result<WorkPlan, String> {
        self.request(|reply| EngineCommand::SetWorkPlan {
            node_id,
            num_workers,
            duration_days,
            reply,
        })
        .await
    }

    pub async fn add_node(
        &self,
        parent_id: Option<String>,
        node: WbsNode,
    ) -> Result<AffectedPatch, String> {
        self.request(|reply| EngineCommand::AddNode {
            parent_id,
            node,
            reply,
        })
        .await
    }

    pub async fn remove_node(&self, item_id: String) -> Result<AffectedPatch, String> {
        self.request(|reply| EngineCommand::RemoveNode { item_id, reply })
            .await
    }

    pub async fn remove_nodes_batch(&self, ids: Vec<String>) -> Result<AffectedPatch, String> {
        self.request(|reply| EngineCommand::RemoveNodesBatch { ids, reply })
            .await
    }

    pub async fn import(&self, path: String) -> Result<EngineSnapshot, String> {
        self.request(|reply| EngineCommand::Import { path, reply })
            .await
    }

    pub async fn export(&self, path: String) -> Result<u32, String> {
        self.request(|reply| EngineCommand::Export { path, reply })
            .await
    }

    pub async fn export_pdf(&self, path: String) -> Result<u32, String> {
        self.request(|reply| EngineCommand::ExportPdf { path, reply })
            .await
    }

    pub async fn preview_pdf(&self) -> Result<Vec<u8>, String> {
        self.request(|reply| EngineCommand::PreviewPdf { reply }).await
    }

    pub async fn analytics(&self) -> Result<Analytics, String> {
        self.request(|reply| EngineCommand::GetAnalytics { reply }).await
    }

    pub async fn set_project_start(&self, date: String) -> Result<String, String> {
        self.request(|reply| EngineCommand::SetProjectStart { date, reply })
            .await
    }

    pub async fn region(&self) -> Result<RegionInfo, String> {
        self.request(|reply| EngineCommand::GetRegion { reply }).await
    }

    pub async fn set_region(
        &self,
        region_id: String,
        region_name: String,
        multiplier_factor: f64,
    ) -> Result<EngineSnapshot, String> {
        self.request(|reply| EngineCommand::SetRegion {
            region_id,
            region_name,
            multiplier_factor,
            reply,
        })
        .await
    }

    pub async fn undo(&self) -> Result<EngineSnapshot, String> {
        self.request(|reply| EngineCommand::Undo { reply }).await
    }

    pub async fn redo(&self) -> Result<EngineSnapshot, String> {
        self.request(|reply| EngineCommand::Redo { reply }).await
    }

    pub async fn checkpoint(&self) -> Result<(), String> {
        self.request(|reply| EngineCommand::Checkpoint { reply }).await
    }

    async fn request<T>(
        &self,
        build: impl FnOnce(Reply<T>) -> EngineCommand,
    ) -> Result<T, String> {
        let (reply_tx, reply_rx) = oneshot::channel();
        self.tx
            .send(build(reply_tx))
            .await
            .map_err(|_| "Engine actor tidak aktif".to_string())?;
        reply_rx
            .await
            .map_err(|_| "Engine actor gagal merespons".to_string())?
    }
}

pub fn spawn(db_path: PathBuf) -> EngineHandle {
    let (tx, rx) = mpsc::channel(256);

    tauri::async_runtime::spawn(async move {
        match EngineState::load(&db_path) {
            Ok(state) => run(state, rx).await,
            Err(error) => eprintln!("[construcsee] engine gagal dimuat: {error}"),
        }
    });

    EngineHandle { tx }
}

struct EngineState {
    conn: rusqlite::Connection,
    nodes: HashMap<String, WbsNode>,
    roots: Vec<String>,
    overhead_percent: f64,
    work_plans: HashMap<String, WorkPlan>,
    project_start: String,
    region_id: String,
    region_name: String,
    region_multiplier: f64,
    history: CommandHistory,
}

fn default_region_id() -> String {
    "national".to_string()
}

fn default_region_name() -> String {
    "NASIONAL".to_string()
}

fn default_project_start() -> String {
    chrono::Local::now()
        .date_naive()
        .format("%Y-%m-%d")
        .to_string()
}

impl EngineState {
    fn load(path: &Path) -> Result<Self, String> {
        let mut conn = db::open(path).map_err(|error| error.to_string())?;
        let (nodes, roots) = db::load(&mut conn).map_err(|error| error.to_string())?;

        let overhead_percent = db::load_setting(&conn, "overhead")
            .and_then(|raw| raw.parse::<f64>().ok())
            .filter(|value| value.is_finite())
            .unwrap_or(DEFAULT_OVERHEAD_PERCENT);

        let work_plans: HashMap<String, WorkPlan> = db::load_work_plans(&conn)
            .map_err(|error| error.to_string())?
            .into_iter()
            .map(|plan| (plan.node_id.clone(), plan))
            .collect();

        let project_start = db::load_setting(&conn, "project_start")
            .filter(|value| chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d").is_ok())
            .unwrap_or_else(default_project_start);

        let region_id = db::load_setting(&conn, "region_id").unwrap_or_else(default_region_id);
        let region_name = db::load_setting(&conn, "region_name").unwrap_or_else(default_region_name);
        let region_multiplier = db::load_setting(&conn, "region_multiplier")
            .and_then(|raw| raw.parse::<f64>().ok())
            .filter(|value| value.is_finite() && *value > 0.0)
            .unwrap_or(1.0);

        if nodes.is_empty() {
            let (seed_nodes, seed_roots) = seed::sample();
            db::replace_all(&mut conn, &seed_nodes, &seed_roots)
                .map_err(|error| error.to_string())?;
            return Ok(Self {
                conn,
                nodes: seed_nodes
                    .into_iter()
                    .map(|node| (node.id.clone(), node))
                    .collect(),
                roots: seed_roots,
                overhead_percent,
                work_plans,
                project_start,
                region_id,
                region_name,
                region_multiplier,
                history: CommandHistory::new(HISTORY_CAPACITY),
            });
        }

        Ok(Self {
            conn,
            nodes: nodes
                .into_iter()
                .map(|node| (node.id.clone(), node))
                .collect(),
            roots,
            overhead_percent,
            work_plans,
            project_start,
            region_id,
            region_name,
            region_multiplier,
            history: CommandHistory::new(HISTORY_CAPACITY),
        })
    }

    fn snapshot(&self) -> EngineSnapshot {
        EngineSnapshot {
            nodes: calc::ordered_nodes(&self.nodes, &self.roots)
                .into_iter()
                .map(|(node, _)| node)
                .collect(),
            roots: self.roots.clone(),
            total_cost: calc::total_cost(&self.nodes, &self.roots, self.overhead_percent),
            overhead_percent: self.overhead_percent,
            can_undo: self.history.can_undo(),
            can_redo: self.history.can_redo(),
        }
    }

    fn analytics(&self) -> Analytics {
        analytics::compute(
            &self.nodes,
            &self.roots,
            &self.work_plans,
            &self.project_start,
        )
    }

    fn set_project_start(&mut self, date: String) -> Result<String, String> {
        let trimmed = date.trim();
        if chrono::NaiveDate::parse_from_str(trimmed, "%Y-%m-%d").is_err() {
            return Err("Format tanggal harus YYYY-MM-DD".to_string());
        }
        db::save_setting(&self.conn, "project_start", trimmed)
            .map_err(|error| error.to_string())?;
        self.project_start = trimmed.to_string();
        Ok(self.project_start.clone())
    }

    fn region_info(&self) -> RegionInfo {
        RegionInfo {
            region_id: self.region_id.clone(),
            region_name: self.region_name.clone(),
            multiplier_factor: self.region_multiplier,
        }
    }

    /// Terapkan wilayah baru: skala seluruh harga dasar resource pada baris
    /// pekerjaan (leaf) dengan rasio multiplier baru/lama, lalu persist.
    fn set_region(
        &mut self,
        region_id: String,
        region_name: String,
        multiplier_factor: f64,
    ) -> Result<EngineSnapshot, String> {
        if !multiplier_factor.is_finite() || multiplier_factor <= 0.0 {
            return Err("Faktor multiplier wilayah tidak valid".to_string());
        }

        let old = self.region_multiplier;
        let ratio = if old > 0.0 { multiplier_factor / old } else { multiplier_factor };
        if (ratio - 1.0).abs() > 1e-9 {
            for node in self.nodes.values_mut() {
                if !node.children_ids.is_empty() {
                    continue;
                }
                node.components.scale_prices(ratio);
                if node.components.total() > 0.0 {
                    node.unit_price = node.components.total();
                }
                node.total_price = node.volume * node.unit_price;
            }
            calc::rollup_all(&mut self.nodes);
        }

        self.region_id = region_id.clone();
        self.region_name = region_name.clone();
        self.region_multiplier = multiplier_factor;

        db::save_setting(&self.conn, "region_id", &region_id)
            .map_err(|error| error.to_string())?;
        db::save_setting(&self.conn, "region_name", &region_name)
            .map_err(|error| error.to_string())?;
        db::save_setting(
            &self.conn,
            "region_multiplier",
            &multiplier_factor.to_string(),
        )
        .map_err(|error| error.to_string())?;

        let all: Vec<WbsNode> = self.nodes.values().cloned().collect();
        db::upsert_many(&mut self.conn, &all).map_err(|error| error.to_string())?;

        Ok(self.snapshot())
    }

    fn update_cell(&mut self, payload: DeltaPayload) -> Result<AffectedPatch, String> {
        let Some(node) = self.nodes.get(&payload.item_id) else {
            return Err("Item WBS tidak ditemukan".to_string());
        };
        if !node.children_ids.is_empty() {
            return Err("Baris parent tidak dapat diedit langsung".to_string());
        }
        if payload.field != "volume" && payload.field != "unit_price" {
            return Err(format!("Field tidak dikenal: {}", payload.field));
        }
        if payload.field == "unit_price" && node.method == METHOD_AHSP {
            return Err("Harga Satuan Pekerjaan dihitung otomatis pada metode SNI/AHSP".to_string());
        }
        if !payload.new_value.is_finite() || payload.new_value < 0.0 {
            return Err("Nilai harus berupa angka non-negatif".to_string());
        }

        let (old_components, old_value) = {
            let node = self.nodes.get(&payload.item_id).expect("node sudah divalidasi");
            (
                node.components.clone(),
                if payload.field == "volume" {
                    node.volume
                } else {
                    node.unit_price
                },
            )
        };

        {
            let item = self
                .nodes
                .get_mut(&payload.item_id)
                .expect("node sudah divalidasi");
            if payload.field == "volume" {
                item.volume = payload.new_value;
            } else {
                item.components = item.components.rebalanced_to(payload.new_value);
                item.unit_price = item.components.total();
            }
        }

        let affected = calc::apply_leaf_change(&mut self.nodes, &payload.item_id);
        db::upsert_many(&mut self.conn, &affected).map_err(|error| error.to_string())?;

        let (new_components, new_value) = {
            let node = self.nodes.get(&payload.item_id).expect("node sudah divalidasi");
            (
                if payload.field == "unit_price" {
                    Some(node.components.clone())
                } else {
                    None
                },
                if payload.field == "unit_price" {
                    node.unit_price
                } else {
                    payload.new_value
                },
            )
        };
        self.history.record(ReversibleCommand::UpdateCells {
            entries: vec![CellChange {
                node_id: payload.item_id.clone(),
                field: payload.field.clone(),
                old_value,
                new_value,
                old_components: if payload.field == "unit_price" {
                    Some(old_components)
                } else {
                    None
                },
                new_components,
            }],
        });

        Ok(AffectedPatch {
            nodes: affected,
            total_cost: calc::total_cost(&self.nodes, &self.roots, self.overhead_percent),
        })
    }

    fn toggle_expand(&mut self, item_id: &str, expanded: bool) -> Result<EngineSnapshot, String> {
        let updated = {
            let Some(node) = self.nodes.get_mut(item_id) else {
                return Err("Item WBS tidak ditemukan".to_string());
            };
            node.is_expanded = expanded;
            node.clone()
        };

        db::upsert_many(&mut self.conn, std::slice::from_ref(&updated))
            .map_err(|error| error.to_string())?;
        Ok(self.snapshot())
    }

    fn set_method(&mut self, item_id: &str, method: &str) -> Result<AffectedPatch, String> {
        if method != METHOD_AHSP && method != METHOD_LANGSUNG {
            return Err(format!("Metode tidak dikenal: {method}"));
        }

        let updated = {
            let Some(node) = self.nodes.get_mut(item_id) else {
                return Err("Item WBS tidak ditemukan".to_string());
            };
            if !node.children_ids.is_empty() {
                return Err("Metode hanya berlaku untuk baris pekerjaan (leaf)".to_string());
            }
            node.method = method.to_string();
            node.clone()
        };

        db::upsert_many(&mut self.conn, std::slice::from_ref(&updated))
            .map_err(|error| error.to_string())?;

        Ok(AffectedPatch {
            nodes: vec![updated],
            total_cost: calc::total_cost(&self.nodes, &self.roots, self.overhead_percent),
        })
    }

    fn set_item_price(
        &mut self,
        name: &str,
        unit: &str,
        base_price: f64,
    ) -> Result<AffectedPatch, String> {
        if !base_price.is_finite() || base_price < 0.0 {
            return Err("Harga dasar harus berupa angka non-negatif".to_string());
        }

        let leaf_ids: Vec<String> = self
            .nodes
            .values()
            .filter(|node| node.children_ids.is_empty())
            .map(|node| node.id.clone())
            .collect();

        let mut touched_ids: Vec<String> = Vec::new();
        let mut changes: Vec<CellChange> = Vec::new();
        for id in &leaf_ids {
            let node = self.nodes.get_mut(id).expect("leaf sudah dipastikan ada");
            let old_components = node.components.clone();
            let old_unit_price = node.unit_price;
            if node.components.set_item_price(name, unit, base_price) {
                node.unit_price = node.components.total();
                changes.push(CellChange {
                    node_id: id.clone(),
                    field: "unit_price".to_string(),
                    old_value: old_unit_price,
                    new_value: node.unit_price,
                    old_components: Some(old_components),
                    new_components: Some(node.components.clone()),
                });
                touched_ids.push(id.clone());
            }
        }

        if touched_ids.is_empty() {
            return Err(format!("Item {name} ({unit}) tidak ditemukan"));
        }

        let mut affected: Vec<WbsNode> = Vec::new();
        let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
        for id in &touched_ids {
            for node in calc::apply_leaf_change(&mut self.nodes, id) {
                if seen.insert(node.id.clone()) {
                    affected.push(node);
                }
            }
        }

        db::upsert_many(&mut self.conn, &affected).map_err(|error| error.to_string())?;

        self.history.record(ReversibleCommand::UpdateCells { entries: changes });

        Ok(AffectedPatch {
            nodes: affected,
            total_cost: calc::total_cost(&self.nodes, &self.roots, self.overhead_percent),
        })
    }

    fn set_overhead(&mut self, percent: f64) -> Result<EngineSnapshot, String> {
        if !percent.is_finite() || percent < 0.0 {
            return Err("Overhead harus berupa angka non-negatif".to_string());
        }
        let old_percent = self.overhead_percent;
        self.overhead_percent = percent;
        db::save_setting(&self.conn, "overhead", &percent.to_string())
            .map_err(|error| error.to_string())?;
        self.history.record(ReversibleCommand::SetOverhead {
            old_value: old_percent,
            new_value: percent,
        });
        Ok(self.snapshot())
    }

    fn work_plans(&self) -> Vec<WorkPlan> {
        self.work_plans.values().cloned().collect()
    }

    fn set_work_plan(
        &mut self,
        node_id: &str,
        num_workers: f64,
        duration_days: f64,
    ) -> Result<WorkPlan, String> {
        let node = self
            .nodes
            .get(node_id)
            .ok_or_else(|| "Item WBS tidak ditemukan".to_string())?;
        if !node.children_ids.is_empty() {
            return Err("Rencana kerja hanya untuk baris pekerjaan (leaf)".to_string());
        }
        if !num_workers.is_finite()
            || num_workers < 0.0
            || !duration_days.is_finite()
            || duration_days < 0.0
        {
            return Err("Nilai rencana kerja harus berupa angka non-negatif".to_string());
        }

        let plan = WorkPlan {
            node_id: node_id.to_string(),
            num_workers,
            duration_days,
        };
        db::upsert_work_plan(&self.conn, &plan).map_err(|error| error.to_string())?;
        self.work_plans.insert(node_id.to_string(), plan.clone());
        Ok(plan)
    }

    fn remove_nodes_batch(&mut self, ids: &[String]) -> Result<AffectedPatch, String> {
        let valid: Vec<String> = ids
            .iter()
            .filter(|id| {
                self.nodes
                    .get(*id)
                    .map(|node| node.children_ids.is_empty())
                    .unwrap_or(false)
            })
            .cloned()
            .collect();
        if valid.is_empty() {
            return Err("Tidak ada baris pekerjaan (leaf) yang dapat dihapus".to_string());
        }

        let removed: Vec<RemovedNode> = valid
            .iter()
            .filter_map(|id| {
                let node = self.nodes.get(id)?.clone();
                let parent_id = node.parent_id.clone();
                let index = match &parent_id {
                    Some(pid) => self
                        .nodes
                        .get(pid)
                        .and_then(|parent| parent.children_ids.iter().position(|child| child == id))
                        .unwrap_or(0),
                    None => self
                        .roots
                        .iter()
                        .position(|root| root == id)
                        .unwrap_or(0),
                };
                let work_plan = self.work_plans.get(id).cloned();
                Some(RemovedNode {
                    node,
                    parent_id,
                    index,
                    work_plan,
                })
            })
            .collect();

        let mut affected_ids: Vec<String> = Vec::new();
        for id in &valid {
            let parent_id = self.nodes.get(id).and_then(|node| node.parent_id.clone());
            match parent_id {
                Some(pid) => {
                    if let Some(parent) = self.nodes.get_mut(&pid) {
                        parent.children_ids.retain(|child| child != id);
                    }
                    affected_ids.push(pid.clone());
                    let mut current = self.nodes.get(&pid).and_then(|n| n.parent_id.clone());
                    while let Some(cid) = current {
                        let next = self.nodes.get(&cid).and_then(|n| n.parent_id.clone());
                        affected_ids.push(cid);
                        current = next;
                    }
                }
                None => {
                    self.roots.retain(|root| root != id);
                }
            }
        }

        for id in &valid {
            self.nodes.remove(id);
            self.work_plans.remove(id);
        }
        calc::rollup_all(&mut self.nodes);
        db::delete_ids(&mut self.conn, &valid).map_err(|error| error.to_string())?;

        let mut affected: Vec<WbsNode> = Vec::new();
        let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
        for id in &affected_ids {
            if let Some(node) = self.nodes.get(id) {
                if seen.insert(id.clone()) {
                    affected.push(node.clone());
                }
            }
        }
        db::upsert_many(&mut self.conn, &affected).map_err(|error| error.to_string())?;

        self.history
            .record(ReversibleCommand::RemoveNodes { removed });

        Ok(AffectedPatch {
            nodes: affected,
            total_cost: calc::total_cost(&self.nodes, &self.roots, self.overhead_percent),
        })
    }

    fn add_node(
        &mut self,
        parent_id: Option<String>,
        mut node: WbsNode,
    ) -> Result<AffectedPatch, String> {
        if self.nodes.contains_key(&node.id) {
            return Err(format!("Node dengan id {} sudah ada", node.id));
        }
        node.is_expanded = false;
        node.children_ids.clear();
        node.parent_id = parent_id.clone();

        if let Some(pid) = &parent_id {
            if !self.nodes.contains_key(pid) {
                return Err(format!("Divisi induk {pid} tidak ditemukan"));
            }
        }

        if node.components.total() <= f64::EPSILON && node.unit_price > 0.0 {
            node.components = WbsComponents::from_unit_price(node.unit_price);
        }
        if node.components.total() > 0.0 {
            node.unit_price = node.components.total();
        }
        node.total_price = node.volume * node.unit_price;

        self.nodes.insert(node.id.clone(), node.clone());

        let mut affected_ids: Vec<String> = vec![node.id.clone()];
        match &parent_id {
            Some(pid) => {
                if let Some(parent) = self.nodes.get_mut(pid) {
                    if !parent.children_ids.contains(&node.id) {
                        parent.children_ids.push(node.id.clone());
                    }
                    let mut current = parent.parent_id.clone();
                    affected_ids.push(pid.clone());
                    while let Some(cid) = current {
                        let next = self.nodes.get(&cid).and_then(|n| n.parent_id.clone());
                        affected_ids.push(cid);
                        current = next;
                    }
                }
            }
            None => {
                self.roots.push(node.id.clone());
                db::save_roots(&self.conn, &self.roots).map_err(|error| error.to_string())?;
            }
        }

        calc::rollup_all(&mut self.nodes);

        let mut affected: Vec<WbsNode> = Vec::new();
        let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
        for id in &affected_ids {
            if let Some(n) = self.nodes.get(id) {
                if seen.insert(id.clone()) {
                    affected.push(n.clone());
                }
            }
        }

        db::upsert_many(&mut self.conn, &affected).map_err(|error| error.to_string())?;

        if let Some(saved) = self.nodes.get(&node.id) {
            self.history
                .record(ReversibleCommand::AddNode { node: saved.clone() });
        }

        Ok(AffectedPatch {
            nodes: affected,
            total_cost: calc::total_cost(&self.nodes, &self.roots, self.overhead_percent),
        })
    }

    fn remove_node(&mut self, item_id: &str) -> Result<AffectedPatch, String> {
        let node = self
            .nodes
            .get(item_id)
            .ok_or_else(|| "Item WBS tidak ditemukan".to_string())?
            .clone();
        if !node.children_ids.is_empty() {
            return Err("Hanya baris pekerjaan (leaf) yang dapat dihapus".to_string());
        }
        let removed_work_plan = self.work_plans.get(item_id).cloned();

        let mut affected_ids: Vec<String> = Vec::new();
        match node.parent_id.clone() {
            Some(pid) => {
                if let Some(parent) = self.nodes.get_mut(&pid) {
                    parent.children_ids.retain(|id| id != item_id);
                    let mut current = parent.parent_id.clone();
                    affected_ids.push(pid.clone());
                    while let Some(cid) = current {
                        let next = self.nodes.get(&cid).and_then(|n| n.parent_id.clone());
                        affected_ids.push(cid);
                        current = next;
                    }
                }
            }
            None => {
                self.roots.retain(|id| id != item_id);
            }
        }

        self.nodes.remove(item_id);
        self.work_plans.remove(item_id);
        calc::rollup_all(&mut self.nodes);

        db::delete_ids(&mut self.conn, &[item_id.to_string()]).map_err(|error| error.to_string())?;

        let mut affected: Vec<WbsNode> = Vec::new();
        let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
        for id in &affected_ids {
            if let Some(n) = self.nodes.get(id) {
                if seen.insert(id.clone()) {
                    affected.push(n.clone());
                }
            }
        }

        db::upsert_many(&mut self.conn, &affected).map_err(|error| error.to_string())?;

        let parent_id = node.parent_id.clone();
        let index = match parent_id.clone() {
            Some(pid) => self
                .nodes
                .get(&pid)
                .map(|parent| {
                    parent
                        .children_ids
                        .iter()
                        .position(|child| child == item_id)
                        .unwrap_or(0)
                })
                .unwrap_or(0),
            None => self
                .roots
                .iter()
                .position(|root| root == item_id)
                .unwrap_or(0),
        };
        self.history.record(ReversibleCommand::RemoveNodes {
            removed: vec![RemovedNode {
                node,
                parent_id,
                index,
                work_plan: removed_work_plan,
            }],
        });

        Ok(AffectedPatch {
            nodes: affected,
            total_cost: calc::total_cost(&self.nodes, &self.roots, self.overhead_percent),
        })
    }

    fn import(&mut self, path: &str) -> Result<EngineSnapshot, String> {
        let (nodes, roots) = excel::importer::import_workbook(Path::new(path))?;
        if nodes.is_empty() {
            return Err("Tidak ada baris WBS yang terbaca dari workbook".to_string());
        }

        let mut map: HashMap<String, WbsNode> =
            nodes.into_iter().map(|node| (node.id.clone(), node)).collect();
        calc::rollup_all(&mut map);

        let ordered: Vec<WbsNode> = calc::ordered_nodes(&map, &roots)
            .into_iter()
            .map(|(node, _)| node)
            .collect();
        db::replace_all(&mut self.conn, &ordered, &roots).map_err(|error| error.to_string())?;

        self.nodes = map;
        self.roots = roots;
        self.work_plans.clear();
        self.history.clear();
        Ok(self.snapshot())
    }

    fn export(&self, path: &str) -> Result<u32, String> {
        let ordered = calc::ordered_nodes(&self.nodes, &self.roots);
        excel::exporter::export_workbook(Path::new(path), &ordered)
    }

    // ------------------------------------------------------------------
    // Undo / Redo

    fn perform_undo(&mut self) -> Result<(), String> {
        let Some(command) = self.history.take_undo() else {
            return Ok(());
        };
        if let Err(error) = self.apply_command(&command, Direction::Backward) {
            // Gagal membalik → kembalikan entri ke tumpukan undo.
            self.history.record_redone(command);
            return Err(error);
        }
        self.history.record_redo(command);
        Ok(())
    }

    fn perform_redo(&mut self) -> Result<(), String> {
        let Some(command) = self.history.take_redo() else {
            return Ok(());
        };
        if let Err(error) = self.apply_command(&command, Direction::Forward) {
            self.history.record_redo(command);
            return Err(error);
        }
        self.history.record_redone(command);
        Ok(())
    }

    /// Jalankan pembalikan (Backward) atau pengulangan (Forward) perintah
    /// yang terekam, termasuk penulisan ke SQLite.
    fn apply_command(
        &mut self,
        command: &ReversibleCommand,
        direction: Direction,
    ) -> Result<(), String> {
        match command {
            ReversibleCommand::UpdateCells { entries } => {
                self.apply_update_cells(entries, direction)
            }
            ReversibleCommand::AddNode { node } => match direction {
                Direction::Backward => self.remove_recorded(std::slice::from_ref(&node.id)),
                Direction::Forward => self.apply_add_forward(node),
            },
            ReversibleCommand::RemoveNodes { removed } => match direction {
                Direction::Backward => self.restore_removed(removed),
                Direction::Forward => {
                    let ids: Vec<String> = removed
                        .iter()
                        .map(|entry| entry.node.id.clone())
                        .collect();
                    self.remove_recorded(&ids)
                }
            },
            ReversibleCommand::SetOverhead { old_value, new_value } => {
                let percent = match direction {
                    Direction::Backward => *old_value,
                    Direction::Forward => *new_value,
                };
                self.overhead_percent = percent;
                db::save_setting(&self.conn, "overhead", &percent.to_string())
                    .map_err(|error| error.to_string())?;
                Ok(())
            }
        }
    }

    fn apply_update_cells(
        &mut self,
        entries: &[CellChange],
        direction: Direction,
    ) -> Result<(), String> {
        let mut touched: Vec<String> = Vec::new();
        for change in entries {
            let Some(node) = self.nodes.get_mut(&change.node_id) else {
                continue;
            };
            match direction {
                Direction::Backward => {
                    if let Some(components) = &change.old_components {
                        node.components = components.clone();
                        node.unit_price = components.total();
                    } else if change.field == "volume" {
                        node.volume = change.old_value;
                    } else {
                        node.components = node.components.rebalanced_to(change.old_value);
                        node.unit_price = node.components.total();
                    }
                }
                Direction::Forward => {
                    if let Some(components) = &change.new_components {
                        node.components = components.clone();
                        node.unit_price = components.total();
                    } else if change.field == "volume" {
                        node.volume = change.new_value;
                    } else {
                        node.components = node.components.rebalanced_to(change.new_value);
                        node.unit_price = node.components.total();
                    }
                }
            }
            touched.push(change.node_id.clone());
        }

        if touched.is_empty() {
            return Ok(());
        }

        let mut affected: Vec<WbsNode> = Vec::new();
        let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
        for id in &touched {
            for node in calc::apply_leaf_change(&mut self.nodes, id) {
                if seen.insert(node.id.clone()) {
                    affected.push(node);
                }
            }
        }
        db::upsert_many(&mut self.conn, &affected).map_err(|error| error.to_string())?;
        Ok(())
    }

    /// Tambah-ulang node yang terekam (redo dari AddNode / undo pembalikan).
    fn apply_add_forward(&mut self, recorded: &WbsNode) -> Result<(), String> {
        let mut node = recorded.clone();
        let parent_id = node.parent_id.clone();
        node.children_ids.clear();
        node.is_expanded = false;

        self.nodes.insert(node.id.clone(), node.clone());
        let mut affected_ids: Vec<String> = vec![node.id.clone()];
        match &parent_id {
            Some(pid) => {
                if let Some(parent) = self.nodes.get_mut(pid) {
                    if !parent.children_ids.contains(&node.id) {
                        parent.children_ids.push(node.id.clone());
                    }
                }
                let mut current = self
                    .nodes
                    .get(pid)
                    .and_then(|parent| parent.parent_id.clone());
                while let Some(cid) = current {
                    affected_ids.push(cid.clone());
                    current = self.nodes.get(&cid).and_then(|n| n.parent_id.clone());
                }
            }
            None => {
                self.roots.push(node.id.clone());
            }
        }

        calc::rollup_all(&mut self.nodes);

        let mut affected: Vec<WbsNode> = Vec::new();
        let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
        for id in &affected_ids {
            if let Some(saved) = self.nodes.get(id) {
                if seen.insert(id.clone()) {
                    affected.push(saved.clone());
                }
            }
        }
        db::upsert_many(&mut self.conn, &affected).map_err(|error| error.to_string())?;
        if parent_id.is_none() {
            db::save_roots(&self.conn, &self.roots).map_err(|error| error.to_string())?;
        }
        Ok(())
    }

    /// Hapus ulang node berdasarkan id yang terekam (re-do penghapusan /
    /// undo dari AddNode). Aman untuk node yang sudah tidak ada.
    fn remove_recorded(&mut self, ids: &[String]) -> Result<(), String> {
        let mut affected_ids: Vec<String> = Vec::new();
        let mut remove_roots = false;
        for id in ids {
            let Some(node) = self.nodes.get(id) else {
                continue;
            };
            match node.parent_id.clone() {
                Some(pid) => {
                    if let Some(parent) = self.nodes.get_mut(&pid) {
                        parent.children_ids.retain(|child| child != id);
                    }
                    affected_ids.push(pid.clone());
                    let mut current = self.nodes.get(&pid).and_then(|n| n.parent_id.clone());
                    while let Some(cid) = current {
                        affected_ids.push(cid.clone());
                        current = self.nodes.get(&cid).and_then(|n| n.parent_id.clone());
                    }
                }
                None => {
                    remove_roots = true;
                    self.roots.retain(|root| root != id);
                }
            }
        }

        for id in ids {
            self.nodes.remove(id);
            self.work_plans.remove(id);
        }
        calc::rollup_all(&mut self.nodes);
        db::delete_ids(&mut self.conn, ids).map_err(|error| error.to_string())?;

        let mut affected: Vec<WbsNode> = Vec::new();
        let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
        for id in &affected_ids {
            if let Some(node) = self.nodes.get(id) {
                if seen.insert(id.clone()) {
                    affected.push(node.clone());
                }
            }
        }
        db::upsert_many(&mut self.conn, &affected).map_err(|error| error.to_string())?;
        if remove_roots {
            db::save_roots(&self.conn, &self.roots).map_err(|error| error.to_string())?;
        }
        Ok(())
    }

    /// Kembalikan node yang pernah dihapus ke posisi aslinya (undo dari
    /// RemoveNodes), termasuk work plan dan urutan pada induknya.
    fn restore_removed(&mut self, removed: &[RemovedNode]) -> Result<(), String> {
        let mut restore_roots = false;
        for entry in removed {
            let id = entry.node.id.clone();
            self.nodes.insert(id.clone(), entry.node.clone());

            if let Some(parent_id) = &entry.parent_id {
                if let Some(parent) = self.nodes.get_mut(parent_id) {
                    let index = entry.index.min(parent.children_ids.len());
                    parent.children_ids.insert(index, id.clone());
                }
            } else {
                let index = entry.index.min(self.roots.len());
                self.roots.insert(index, id.clone());
                restore_roots = true;
            }
        }

        calc::rollup_all(&mut self.nodes);

        let persist_ids: std::collections::BTreeSet<String> = removed
            .iter()
            .map(|entry| entry.node.id.clone())
            .chain(
                removed
                    .iter()
                    .filter_map(|entry| entry.parent_id.clone()),
            )
            .collect();
        let nodes: Vec<WbsNode> = persist_ids
            .iter()
            .filter_map(|id| self.nodes.get(id).cloned())
            .collect();
        db::upsert_many(&mut self.conn, &nodes).map_err(|error| error.to_string())?;
        // FK: work_plans mereferensi wbs_nodes → tulis setelah node ada lagi.
        for entry in removed {
            if let Some(plan) = &entry.work_plan {
                self.work_plans.insert(plan.node_id.clone(), plan.clone());
                db::upsert_work_plan(&self.conn, plan).map_err(|error| error.to_string())?;
            }
        }
        if restore_roots {
            db::save_roots(&self.conn, &self.roots).map_err(|error| error.to_string())?;
        }
        Ok(())
    }
}

#[derive(Clone, Copy)]
enum Direction {
    Backward,
    Forward,
}

async fn run(mut state: EngineState, mut rx: mpsc::Receiver<EngineCommand>) {
    while let Some(command) = rx.recv().await {
        match command {
            EngineCommand::Snapshot { reply } => {
                let _ = reply.send(Ok(state.snapshot()));
            }
            EngineCommand::UpdateCell { payload, reply } => {
                let _ = reply.send(state.update_cell(payload));
            }
            EngineCommand::ToggleExpand {
                item_id,
                expanded,
                reply,
            } => {
                let _ = reply.send(state.toggle_expand(&item_id, expanded));
            }
            EngineCommand::SetMethod {
                item_id,
                method,
                reply,
            } => {
                let _ = reply.send(state.set_method(&item_id, &method));
            }
            EngineCommand::SetItemPrice {
                name,
                unit,
                base_price,
                reply,
            } => {
                let _ = reply.send(state.set_item_price(&name, &unit, base_price));
            }
            EngineCommand::SetOverhead { percent, reply } => {
                let _ = reply.send(state.set_overhead(percent));
            }
            EngineCommand::GetWorkPlans { reply } => {
                let _ = reply.send(Ok(state.work_plans()));
            }
            EngineCommand::SetWorkPlan {
                node_id,
                num_workers,
                duration_days,
                reply,
            } => {
                let _ = reply.send(state.set_work_plan(&node_id, num_workers, duration_days));
            }
            EngineCommand::AddNode {
                parent_id,
                node,
                reply,
            } => {
                let _ = reply.send(state.add_node(parent_id, node));
            }
            EngineCommand::RemoveNode { item_id, reply } => {
                let _ = reply.send(state.remove_node(&item_id));
            }
            EngineCommand::RemoveNodesBatch { ids, reply } => {
                let _ = reply.send(state.remove_nodes_batch(&ids));
            }
            EngineCommand::Import { path, reply } => {
                let _ = reply.send(state.import(&path));
            }
            EngineCommand::Export { path, reply } => {
                let _ = reply.send(state.export(&path));
            }
            EngineCommand::ExportPdf { path, reply } => {
                let snap = state.snapshot();
                let nodes: Vec<WbsNode> = snap.nodes.clone();
                let _ = reply.send(crate::reports::pdf::render_rab_pdf(Path::new(&path), &snap, &nodes));
            }
            EngineCommand::PreviewPdf { reply } => {
                let snap = state.snapshot();
                let nodes: Vec<WbsNode> = snap.nodes.clone();
                let _ = reply.send(crate::reports::pdf::render_rab_pdf_bytes(&snap, &nodes));
            }
            EngineCommand::GetAnalytics { reply } => {
                let _ = reply.send(Ok(state.analytics()));
            }
            EngineCommand::SetProjectStart { date, reply } => {
                let _ = reply.send(state.set_project_start(date));
            }
            EngineCommand::GetRegion { reply } => {
                let _ = reply.send(Ok(state.region_info()));
            }
            EngineCommand::SetRegion {
                region_id,
                region_name,
                multiplier_factor,
                reply,
            } => {
                let _ = reply.send(state.set_region(region_id, region_name, multiplier_factor));
            }
            EngineCommand::Undo { reply } => {
                let _ = reply.send(state.perform_undo().map(|_| state.snapshot()));
            }
            EngineCommand::Redo { reply } => {
                let _ = reply.send(state.perform_redo().map(|_| state.snapshot()));
            }
            EngineCommand::Checkpoint { reply } => {
                let result = state
                    .conn
                    .query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |_row| Ok(()))
                    .map_err(|error| error.to_string());
                let _ = reply.send(result);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::db;

    fn in_memory_state() -> EngineState {
        let conn = db::open(std::path::Path::new(":memory:")).expect("db gagal dibuat");
        let (nodes, roots) = seed::sample();
        let mut map: HashMap<String, WbsNode> = nodes
            .iter()
            .cloned()
            .map(|node| (node.id.clone(), node))
            .collect();
        calc::rollup_all(&mut map);
        let ordered: Vec<WbsNode> = calc::ordered_nodes(&map, &roots)
            .into_iter()
            .map(|(node, _)| node)
            .collect();
        let mut conn2 = conn;
        db::replace_all(&mut conn2, &ordered, &roots).expect("seed gagal");

        EngineState {
            conn: conn2,
            nodes: map,
            roots,
            overhead_percent: DEFAULT_OVERHEAD_PERCENT,
            work_plans: HashMap::new(),
            project_start: default_project_start(),
            region_id: default_region_id(),
            region_name: default_region_name(),
            region_multiplier: 1.0,
            history: CommandHistory::new(HISTORY_CAPACITY),
        }
    }

    fn first_leaf_id(state: &EngineState) -> String {
        let root = state.roots[0].clone();
        let children = state.nodes[&root].children_ids.clone();
        assert!(!children.is_empty(), "seed harus punya leaf");
        children[0].clone()
    }

    #[test]
    fn undo_redo_update_cell_roundtrip() {
        let mut state = in_memory_state();
        let leaf = first_leaf_id(&state);
        let original_volume = state.nodes[&leaf].volume;

        let patch = state
            .update_cell(DeltaPayload {
                item_id: leaf.clone(),
                field: "volume".to_string(),
                new_value: 999.0,
            })
            .expect("update gagal");
        assert!(state.history.can_undo());
        assert!(patch.nodes.iter().any(|node| node.id == leaf));

        state.perform_undo().expect("undo gagal");
        assert!(!state.history.can_undo());
        assert!(state.history.can_redo());
        assert_eq!(state.nodes[&leaf].volume, original_volume);

        state.perform_redo().expect("redo gagal");
        assert_eq!(state.nodes[&leaf].volume, 999.0);
        assert!(state.history.can_undo());
    }

    #[test]
    fn undo_redo_remove_node_roundtrip() {
        let mut state = in_memory_state();
        let leaf = first_leaf_id(&state);
        let parent_id = state.nodes[&leaf]
            .parent_id
            .clone()
            .expect("leaf harus punya parent");
        let position_before = state.nodes[&parent_id]
            .children_ids
            .iter()
            .position(|child| child == &leaf)
            .unwrap();

        state.remove_node(&leaf).expect("hapus gagal");
        assert!(!state.nodes.contains_key(&leaf));
        assert!(!state.nodes[&parent_id].children_ids.contains(&leaf));

        state.perform_undo().expect("undo gagal");
        assert!(state.nodes.contains_key(&leaf));
        let parent = &state.nodes[&parent_id];
        assert_eq!(
            parent.children_ids.iter().position(|child| child == &leaf),
            Some(position_before),
            "undo harus mengembalikan posisi anak persis"
        );

        state.perform_redo().expect("redo gagal");
        assert!(!state.nodes.contains_key(&leaf));
    }

    #[test]
    fn undo_redo_add_node_roundtrip() {
        let mut state = in_memory_state();
        let parent_id = state.roots[0].clone();
        let node = WbsNode {
            id: "item-test-add-1".to_string(),
            parent_id: None,
            children_ids: Vec::new(),
            code: "9.1".to_string(),
            name: "Pekerjaan Uji Undo".to_string(),
            unit: "ls".to_string(),
            volume: 3.0,
            unit_price: 1000.0,
            total_price: 3000.0,
            is_expanded: false,
            components: WbsComponents::from_unit_price(1000.0),
            method: "langsung".to_string(),
        };

        state
            .add_node(Some(parent_id.clone()), node)
            .expect("add gagal");
        assert!(state.nodes.contains_key("item-test-add-1"));
        assert!(state.nodes[&parent_id]
            .children_ids
            .contains(&"item-test-add-1".to_string()));

        state.perform_undo().expect("undo gagal");
        assert!(!state.nodes.contains_key("item-test-add-1"));
        assert!(!state.nodes[&parent_id]
            .children_ids
            .contains(&"item-test-add-1".to_string()));

        state.perform_redo().expect("redo gagal");
        assert!(state.nodes.contains_key("item-test-add-1"));
        assert_eq!(state.nodes["item-test-add-1"].total_price, 3000.0);
    }

    #[test]
    fn undo_redo_set_overhead_roundtrip() {
        let mut state = in_memory_state();
        state.set_overhead(25.0).expect("set overhead gagal");
        assert_eq!(state.overhead_percent, 25.0);

        state.perform_undo().expect("undo gagal");
        assert_eq!(state.overhead_percent, DEFAULT_OVERHEAD_PERCENT);

        state.perform_redo().expect("redo gagal");
        assert_eq!(state.overhead_percent, 25.0);
    }

    #[test]
    fn record_after_undo_clears_redo() {
        let mut state = in_memory_state();
        let leaf = first_leaf_id(&state);
        state
            .update_cell(DeltaPayload {
                item_id: leaf.clone(),
                field: "volume".to_string(),
                new_value: 700.0,
            })
            .expect("update 2 gagal");
        state.perform_undo().expect("undo gagal");
        assert!(state.history.can_redo());
        state
            .update_cell(DeltaPayload {
                item_id: leaf.clone(),
                field: "volume".to_string(),
                new_value: 900.0,
            })
            .expect("update 3 gagal");
        assert!(!state.history.can_redo());
        assert_eq!(state.nodes[&leaf].volume, 900.0);
    }

    #[test]
    fn set_item_price_undo_restores_components_exactly() {
        let mut state = in_memory_state();
        let leaf = first_leaf_id(&state);
        let (item_name, item_unit, original_base) = {
            let components = &state.nodes[&leaf].components;
            let item = components
                .bahan
                .items
                .first()
                .or_else(|| components.tenaga.items.first())
                .expect("leaf harus punya item komponen");
            (item.name.clone(), item.unit.clone(), item.base_price)
        };
        let unit_price_before = state.nodes[&leaf].unit_price;

        state
            .set_item_price(&item_name, &item_unit, 9999.0)
            .expect("set item price gagal");
        assert!(
            (state.nodes[&leaf].components.total() - unit_price_before).abs() > f64::EPSILON,
            "unit_price walau naik/turun harus berubah"
        );

        state.perform_undo().expect("undo gagal");
        let restored = &state.nodes[&leaf];
        assert_eq!(restored.unit_price, unit_price_before);
        let item = restored
            .components
            .bahan
            .items
            .iter()
            .find(|item| item.name == item_name)
            .expect("item masih ada");
        assert_eq!(item.base_price, original_base);
    }

    #[test]
    fn undo_remove_node_restores_work_plan() {
        let mut state = in_memory_state();
        let leaf = first_leaf_id(&state);
        state
            .set_work_plan(&leaf, 7.0, 2.5)
            .expect("set work plan gagal");

        state.remove_node(&leaf).expect("hapus gagal");
        state.perform_undo().expect("undo gagal");
        assert_eq!(
            state.work_plans.get(&leaf).map(|plan| plan.num_workers),
            Some(7.0),
            "work plan harus ikut dipulihkan"
        );
    }
}
