mod commands;
mod engine;
mod excel;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."));
            let db_path = dir.join("constructsee.db");
            app.manage(engine::actor::spawn(db_path));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_wbs,
            commands::update_wbs_cell,
            commands::toggle_expand,
            commands::set_price_method,
            commands::set_item_price,
            commands::add_node,
            commands::remove_node,
            commands::import_excel,
            commands::export_excel
        ])
        .run(tauri::generate_context!())
        .expect("error while running ConstrucSee");
}
