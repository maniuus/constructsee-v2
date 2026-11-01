mod commands;
mod engine;
mod excel;
mod master;
mod reports;

use tauri::{Manager, RunEvent};

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."));
            let db_path = dir.join("constructsee.db");
            let master_path = dir.join("master_ahsp.db");
            if let Err(error) = master::ensure(&master_path) {
                eprintln!("[constructsee] master AHSP DB gagal disiapkan: {error}");
            }
            app.manage(master::MasterDb::new(master_path));
            app.manage(engine::actor::spawn(db_path));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_wbs,
            commands::update_wbs_cell,
            commands::toggle_expand,
            commands::set_price_method,
            commands::set_item_price,
            commands::set_overhead,
            commands::get_work_plans,
            commands::set_work_plan,
            commands::add_node,
            commands::remove_node,
            commands::remove_nodes_batch,
            commands::import_excel,
            commands::export_excel,
            commands::export_pdf,
            commands::preview_pdf,
            commands::get_analytics,
            commands::set_project_start,
            commands::get_regions,
            commands::get_master_stats,
            commands::get_region,
            commands::set_region,
            commands::undo,
            commands::redo
        ])
        .build(tauri::generate_context!())
        .expect("error while building ConstrucSee")
        .run(|app_handle, event| {
            if let RunEvent::ExitRequested { .. } = event {
                let engine = app_handle.state::<engine::actor::EngineHandle>();
                if let Err(error) = tauri::async_runtime::block_on(engine.checkpoint()) {
                    eprintln!("[constructsee] checkpoint WAL gagal: {error}");
                }
            }
        });
}
