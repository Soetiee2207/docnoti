mod db;
mod storage;
mod ocr;
mod autostart;
mod tray;
mod secrets;

use rusqlite::Connection;
use std::fs;
use std::sync::Mutex;
use tauri::{Manager, WindowEvent};

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

            // Set up system tray
            if let Err(err) = tray::setup_tray(app.handle()) {
                eprintln!("Failed to initialize system tray: {err}");
            }

            // Check if launched with --background or --minimized flag
            let args: Vec<String> = std::env::args().collect();
            let start_in_background = args.iter().any(|arg| arg == "--background" || arg == "--minimized");
            if start_in_background {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
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
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // Prevent application exit on window close; hide to system tray instead.
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            db::db_execute,
            db::db_query,
            storage::import_pdf_file,
            storage::delete_stored_file,
            storage::read_stored_file,
            ocr::check_ocr_available,
            ocr::run_ocr_on_image,
            autostart::get_autostart_status,
            autostart::set_autostart_status,
            secrets::get_secret,
            secrets::set_secret,
            secrets::delete_secret,
            secrets::has_secret
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
