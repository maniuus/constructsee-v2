use tauri::State;

use crate::engine::actor::EngineHandle;
use crate::engine::analytics::Analytics;
use crate::engine::models::{
    AffectedPatch, DeltaPayload, EngineSnapshot, HistoryView, ProjectInfo, RegionInfo, WbsNode,
    WorkPlan,
};
use crate::master::{self, MasterDb, MasterStats, Region};

#[tauri::command(rename_all = "snake_case")]
pub async fn get_wbs(engine: State<'_, EngineHandle>) -> Result<EngineSnapshot, String> {
    engine.inner().clone().snapshot().await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn update_wbs_cell(
    payload: DeltaPayload,
    engine: State<'_, EngineHandle>,
) -> Result<AffectedPatch, String> {
    engine.inner().clone().update_cell(payload).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn toggle_expand(
    item_id: String,
    expanded: bool,
    engine: State<'_, EngineHandle>,
) -> Result<EngineSnapshot, String> {
    engine.inner().clone().toggle_expand(item_id, expanded).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn set_price_method(
    item_id: String,
    method: String,
    engine: State<'_, EngineHandle>,
) -> Result<AffectedPatch, String> {
    engine
        .inner()
        .clone()
        .set_method(item_id, method)
        .await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn set_item_price(
    name: String,
    unit: String,
    base_price: f64,
    engine: State<'_, EngineHandle>,
) -> Result<AffectedPatch, String> {
    engine
        .inner()
        .clone()
        .set_item_price(name, unit, base_price)
        .await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn set_overhead(
    percent: f64,
    engine: State<'_, EngineHandle>,
) -> Result<EngineSnapshot, String> {
    engine.inner().clone().set_overhead(percent).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_work_plans(
    engine: State<'_, EngineHandle>,
) -> Result<Vec<WorkPlan>, String> {
    engine.inner().clone().work_plans().await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn set_work_plan(
    node_id: String,
    num_workers: f64,
    duration_days: f64,
    engine: State<'_, EngineHandle>,
) -> Result<WorkPlan, String> {
    engine
        .inner()
        .clone()
        .set_work_plan(node_id, num_workers, duration_days)
        .await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn add_node(
    parent_id: Option<String>,
    node: WbsNode,
    engine: State<'_, EngineHandle>,
) -> Result<AffectedPatch, String> {
    engine.inner().clone().add_node(parent_id, node).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn remove_node(
    item_id: String,
    engine: State<'_, EngineHandle>,
) -> Result<AffectedPatch, String> {
    engine.inner().clone().remove_node(item_id).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn remove_nodes_batch(
    ids: Vec<String>,
    engine: State<'_, EngineHandle>,
) -> Result<AffectedPatch, String> {
    engine.inner().clone().remove_nodes_batch(ids).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn import_excel(
    path: String,
    engine: State<'_, EngineHandle>,
) -> Result<EngineSnapshot, String> {
    engine.inner().clone().import(path).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn undo(engine: State<'_, EngineHandle>) -> Result<EngineSnapshot, String> {
    engine.inner().clone().undo().await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn redo(engine: State<'_, EngineHandle>) -> Result<EngineSnapshot, String> {
    engine.inner().clone().redo().await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn export_excel(
    path: String,
    engine: State<'_, EngineHandle>,
) -> Result<u32, String> {
    engine.inner().clone().export(path).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn export_pdf(
    path: String,
    engine: State<'_, EngineHandle>,
) -> Result<u32, String> {
    engine.inner().clone().export_pdf(path).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn preview_pdf(engine: State<'_, EngineHandle>) -> Result<Vec<u8>, String> {
    engine.inner().clone().preview_pdf().await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_analytics(engine: State<'_, EngineHandle>) -> Result<Analytics, String> {
    engine.inner().clone().analytics().await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn set_project_start(
    date: String,
    engine: State<'_, EngineHandle>,
) -> Result<String, String> {
    engine.inner().clone().set_project_start(date).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn new_project(engine: State<'_, EngineHandle>) -> Result<EngineSnapshot, String> {
    engine.inner().clone().new_project().await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn open_project(
    path: String,
    engine: State<'_, EngineHandle>,
) -> Result<EngineSnapshot, String> {
    engine.inner().clone().open_project(path).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn save_project(
    path: String,
    engine: State<'_, EngineHandle>,
) -> Result<String, String> {
    engine.inner().clone().save_project(path).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_project_info(engine: State<'_, EngineHandle>) -> Result<ProjectInfo, String> {
    engine.inner().clone().project_info().await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn set_project_info(
    info: ProjectInfo,
    engine: State<'_, EngineHandle>,
) -> Result<ProjectInfo, String> {
    engine.inner().clone().set_project_info(info).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_history(engine: State<'_, EngineHandle>) -> Result<HistoryView, String> {
    engine.inner().clone().history().await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn indent_node(
    item_id: String,
    engine: State<'_, EngineHandle>,
) -> Result<EngineSnapshot, String> {
    engine.inner().clone().indent_node(item_id).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn outdent_node(
    item_id: String,
    engine: State<'_, EngineHandle>,
) -> Result<EngineSnapshot, String> {
    engine.inner().clone().outdent_node(item_id).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn set_expand_all(
    expanded: bool,
    engine: State<'_, EngineHandle>,
) -> Result<EngineSnapshot, String> {
    engine.inner().clone().set_expand_all(expanded).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_regions(master: State<'_, MasterDb>) -> Result<Vec<Region>, String> {
    let conn = master.inner().open()?;
    master::regions(&conn)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_master_stats(master: State<'_, MasterDb>) -> Result<MasterStats, String> {
    let conn = master.inner().open()?;
    master::stats(&conn)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_region(engine: State<'_, EngineHandle>) -> Result<RegionInfo, String> {
    engine.inner().clone().region().await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn set_region(
    region_id: String,
    engine: State<'_, EngineHandle>,
    master: State<'_, MasterDb>,
) -> Result<EngineSnapshot, String> {
    let conn = master.inner().open()?;
    let region = master::region(&conn, &region_id)?
        .ok_or_else(|| format!("Wilayah {region_id} tidak ditemukan"))?;
    let label = format!("{} — {}", region.province, region.city_regency);
    engine
        .inner()
        .clone()
        .set_region(region.id, label, region.multiplier_factor)
        .await
}
