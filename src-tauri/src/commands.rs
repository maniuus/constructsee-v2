use tauri::State;

use crate::engine::actor::EngineHandle;
use crate::engine::models::{AffectedPatch, DeltaPayload, EngineSnapshot, WbsNode};

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
pub async fn import_excel(
    path: String,
    engine: State<'_, EngineHandle>,
) -> Result<EngineSnapshot, String> {
    engine.inner().clone().import(path).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn export_excel(
    path: String,
    engine: State<'_, EngineHandle>,
) -> Result<u32, String> {
    engine.inner().clone().export(path).await
}
