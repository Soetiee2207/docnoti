mod db;
mod storage;

use rusqlite::Connection;
use std::fs;
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let base_dir = app
                .path()
                .app_local_data_dir()
                .or_else(|_| app.path().app_data_dir())
                .expect("failed to resolve app data directory");

            if !base_dir.exists() {
                fs::create_dir_all(&base_dir)
                    .expect("failed to create app data directory");
            }

            let db_path = base_dir.join("docnoti.db");
            let conn = Connection::open(&db_path)
                .unwrap_or_else(|e| panic!("failed to open sqlite database at {}: {e}", db_path.display()));

            // Enable WAL mode and foreign keys
            let _ = conn.pragma_update(None, "journal_mode", "WAL");
            let _ = conn.pragma_update(None, "foreign_keys", "ON");

            app.manage(db::DbState(Mutex::new(conn)));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            db::db_execute,
            db::db_query,
            storage::import_pdf_file,
            storage::delete_stored_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
