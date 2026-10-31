use std::collections::HashMap;
use std::path::{Path, PathBuf};

use tokio::sync::{mpsc, oneshot};

use super::models::{
    AffectedPatch, DeltaPayload, EngineSnapshot, WbsComponents, WbsNode, METHOD_AHSP,
    METHOD_LANGSUNG,
};
use super::{calc, db, seed};
use crate::excel;

pub type Reply<T> = oneshot::Sender<Result<T, String>>;

pub enum EngineCommand {
    Snapshot { reply: Reply<EngineSnapshot> },
    UpdateCell { payload: DeltaPayload, reply: Reply<AffectedPatch> },
    ToggleExpand { item_id: String, expanded: bool, reply: Reply<EngineSnapshot> },
    SetMethod { item_id: String, method: String, reply: Reply<AffectedPatch> },
    SetItemPrice { name: String, unit: String, base_price: f64, reply: Reply<AffectedPatch> },
    AddNode { parent_id: Option<String>, node: WbsNode, reply: Reply<AffectedPatch> },
    RemoveNode { item_id: String, reply: Reply<AffectedPatch> },
    Import { path: String, reply: Reply<EngineSnapshot> },
    Export { path: String, reply: Reply<u32> },
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

    pub async fn import(&self, path: String) -> Result<EngineSnapshot, String> {
        self.request(|reply| EngineCommand::Import { path, reply })
            .await
    }

    pub async fn export(&self, path: String) -> Result<u32, String> {
        self.request(|reply| EngineCommand::Export { path, reply })
            .await
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
}

impl EngineState {
    fn load(path: &Path) -> Result<Self, String> {
        let mut conn = db::open(path).map_err(|error| error.to_string())?;
        let (nodes, roots) = db::load(&conn).map_err(|error| error.to_string())?;

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
            });
        }

        Ok(Self {
            conn,
            nodes: nodes
                .into_iter()
                .map(|node| (node.id.clone(), node))
                .collect(),
            roots,
        })
    }

    fn snapshot(&self) -> EngineSnapshot {
        EngineSnapshot {
            nodes: calc::ordered_nodes(&self.nodes, &self.roots)
                .into_iter()
                .map(|(node, _)| node)
                .collect(),
            roots: self.roots.clone(),
            total_cost: calc::total_cost(&self.nodes, &self.roots),
        }
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

        Ok(AffectedPatch {
            nodes: affected,
            total_cost: calc::total_cost(&self.nodes, &self.roots),
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
            total_cost: calc::total_cost(&self.nodes, &self.roots),
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
        for id in &leaf_ids {
            let node = self.nodes.get_mut(id).expect("leaf sudah dipastikan ada");
            if node.components.set_item_price(name, unit, base_price) {
                node.unit_price = node.components.total();
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

        Ok(AffectedPatch {
            nodes: affected,
            total_cost: calc::total_cost(&self.nodes, &self.roots),
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

        Ok(AffectedPatch {
            nodes: affected,
            total_cost: calc::total_cost(&self.nodes, &self.roots),
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

        Ok(AffectedPatch {
            nodes: affected,
            total_cost: calc::total_cost(&self.nodes, &self.roots),
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
        Ok(self.snapshot())
    }

    fn export(&self, path: &str) -> Result<u32, String> {
        let ordered = calc::ordered_nodes(&self.nodes, &self.roots);
        excel::exporter::export_workbook(Path::new(path), &ordered)
    }
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
            EngineCommand::Import { path, reply } => {
                let _ = reply.send(state.import(&path));
            }
            EngineCommand::Export { path, reply } => {
                let _ = reply.send(state.export(&path));
            }
        }
    }
}
