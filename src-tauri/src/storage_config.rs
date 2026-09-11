use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use uuid::Uuid;

pub struct StorageConfigState(pub Mutex<StorageConfig>);

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct StorageConfig {
    pub version: u32,
    pub documents_dir: Option<String>,
    pub database_dir: Option<String>,
    pub temp_ocr_dir: Option<String>,
    pub log_dir: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedStoragePaths {
    pub documents_dir: String,
    pub database_dir: String,
    pub temp_ocr_dir: String,
    pub log_dir: String,
    pub is_custom_documents_dir: bool,
    pub is_custom_database_dir: bool,
    pub is_custom_temp_ocr_dir: bool,
    pub is_custom_log_dir: bool,
}

pub fn get_default_base_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_local_data_dir()
        .or_else(|_| app.path().app_data_dir())
        .unwrap_or_else(|_| PathBuf::from("."))
}

pub fn get_config_file_path(app: &AppHandle) -> PathBuf {
    get_default_base_dir(app).join("storage_config.json")
}

pub fn validate_directory_path(path_str: &str) -> Result<PathBuf, String> {
    let trimmed = path_str.trim();
    if trimmed.is_empty() {
        return Err("Đường dẫn không được để trống".to_string());
    }

    let path = Path::new(trimmed);

    // 1. Must be absolute path
    if !path.is_absolute() {
        return Err(format!("Đường dẫn phải là tuyệt đối: {trimmed}"));
    }

    // 2. Reject path traversal components
    for comp in path.components() {
        if comp == Component::ParentDir {
            return Err("Đường dẫn không được chứa ký tự chuyển cấp '..'".to_string());
        }
    }

    // 3. Reject Windows root drive only (e.g. C:\ or D:\) or system directories
    let normalized = trimmed.replace('/', "\\");
    let lower = normalized.to_lowercase();

    // Check if it's just a root drive (e.g. "c:\" or "c:")
    if lower.len() <= 3 && lower.ends_with(':') || (lower.len() == 3 && lower.ends_with(":\\")) {
        return Err("Không được chọn trực tiếp ổ đĩa gốc làm thư mục lưu trữ".to_string());
    }

    // Check system directories
    if lower.starts_with("c:\\windows")
        || lower.starts_with("c:\\program files")
        || lower.starts_with("c:\\program files (x86)")
        || lower.starts_with("c:\\programdata\\microsoft")
    {
        return Err("Không được chọn thư mục hệ thống của Windows".to_string());
    }

    // 4. Check if directory exists or can be created
    if !path.exists() {
        fs::create_dir_all(path)
            .map_err(|e| format!("Không thể tạo thư mục tại '{trimmed}': {e}"))?;
    } else if !path.is_dir() {
        return Err(format!("Đường dẫn không phải là thư mục: {trimmed}"));
    }

    // 5. Test write permissions by creating and removing a test file
    let test_file = path.join(format!(".docnoti_perm_test_{}.tmp", Uuid::new_v4()));
    match File::create(&test_file).and_then(|mut f| f.write_all(b"test")) {
        Ok(_) => {
            let _ = fs::remove_file(&test_file);
        }
        Err(e) => {
            return Err(format!("Thư mục không có quyền ghi dữ liệu: {e}"));
        }
    }

    Ok(path.to_path_buf())
}

pub fn load_storage_config(app: &AppHandle) -> StorageConfig {
    let mut config_path = get_config_file_path(app);
    if !config_path.exists() {
        // Backward-compatibility: Check legacy com.tauri.dev config path
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            let legacy_path = PathBuf::from(local_app_data)
                .join("com.tauri.dev")
                .join("storage_config.json");
            if legacy_path.exists() {
                #[cfg(debug_assertions)]
                eprintln!("[PATH_AUDIT] Loading legacy storage_config from: {}", legacy_path.display());
                config_path = legacy_path;
            }
        }
    }
    if !config_path.exists() {
        return StorageConfig {
            version: 1,
            documents_dir: None,
            database_dir: None,
            temp_ocr_dir: None,
            log_dir: None,
        };
    }

    match fs::read_to_string(&config_path) {
        Ok(content) => match serde_json::from_str::<StorageConfig>(&content) {
            Ok(config) => config,
            Err(err) => {
                eprintln!("[StorageConfig] Failed to parse config JSON ({config_path:?}): {err}. Using default.");
                StorageConfig {
                    version: 1,
                    documents_dir: None,
                    database_dir: None,
                    temp_ocr_dir: None,
                    log_dir: None,
                }
            }
        },
        Err(err) => {
            eprintln!("[StorageConfig] Failed to read config file ({config_path:?}): {err}. Using default.");
            StorageConfig {
                version: 1,
                documents_dir: None,
                database_dir: None,
                temp_ocr_dir: None,
                log_dir: None,
            }
        }
    }
}

pub fn save_storage_config(app: &AppHandle, config: &StorageConfig) -> Result<(), String> {
    let config_path = get_config_file_path(app);
    if let Some(parent) = config_path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Không thể tạo thư mục chứa cấu hình: {e}"))?;
        }
    }

    let json = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Lỗi tuần tự hóa cấu hình JSON: {e}"))?;

    fs::write(&config_path, json)
        .map_err(|e| format!("Không thể ghi file cấu hình ({config_path:?}): {e}"))?;

    Ok(())
}

pub fn resolve_documents_dir(app: &AppHandle, config: &StorageConfig) -> PathBuf {
    if let Some(ref custom) = config.documents_dir {
        if let Ok(validated) = validate_directory_path(custom) {
            return validated;
        } else {
            eprintln!("[StorageConfig] Custom documents_dir '{custom}' invalid, falling back to default.");
        }
    }
    let default_dir = get_default_base_dir(app).join("documents");
    let _ = fs::create_dir_all(&default_dir);
    default_dir
}

pub fn resolve_database_dir(app: &AppHandle, config: &StorageConfig) -> PathBuf {
    if let Some(ref custom) = config.database_dir {
        if let Ok(validated) = validate_directory_path(custom) {
            return validated;
        } else {
            eprintln!("[StorageConfig] Custom database_dir '{custom}' invalid, falling back to default.");
        }
    }
    let default_dir = get_default_base_dir(app);
    let _ = fs::create_dir_all(&default_dir);
    default_dir
}

pub fn resolve_temp_ocr_dir(app: &AppHandle, config: &StorageConfig) -> PathBuf {
    if let Some(ref custom) = config.temp_ocr_dir {
        if let Ok(validated) = validate_directory_path(custom) {
            return validated;
        } else {
            eprintln!("[StorageConfig] Custom temp_ocr_dir '{custom}' invalid, falling back to default.");
        }
    }
    let default_dir = get_default_base_dir(app).join("temp_ocr");
    let _ = fs::create_dir_all(&default_dir);
    default_dir
}

pub fn resolve_log_dir(app: &AppHandle, config: &StorageConfig) -> PathBuf {
    if let Some(ref custom) = config.log_dir {
        if let Ok(validated) = validate_directory_path(custom) {
            return validated;
        } else {
            eprintln!("[StorageConfig] Custom log_dir '{custom}' invalid, falling back to default.");
        }
    }
    let default_dir = get_default_base_dir(app).join("logs");
    let _ = fs::create_dir_all(&default_dir);
    default_dir
}

pub fn get_resolved_paths(app: &AppHandle) -> ResolvedStoragePaths {
    let config = if let Some(state) = app.try_state::<StorageConfigState>() {
        state.0.lock().map(|g| g.clone()).unwrap_or_else(|_| load_storage_config(app))
    } else {
        load_storage_config(app)
    };

    let doc_dir = resolve_documents_dir(app, &config);
    let db_dir = resolve_database_dir(app, &config);
    let ocr_dir = resolve_temp_ocr_dir(app, &config);
    let log_dir = resolve_log_dir(app, &config);

    ResolvedStoragePaths {
        documents_dir: doc_dir.to_string_lossy().to_string(),
        database_dir: db_dir.to_string_lossy().to_string(),
        temp_ocr_dir: ocr_dir.to_string_lossy().to_string(),
        log_dir: log_dir.to_string_lossy().to_string(),
        is_custom_documents_dir: config.documents_dir.is_some(),
        is_custom_database_dir: config.database_dir.is_some(),
        is_custom_temp_ocr_dir: config.temp_ocr_dir.is_some(),
        is_custom_log_dir: config.log_dir.is_some(),
    }
}

pub fn get_documents_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let config = if let Some(state) = app.try_state::<StorageConfigState>() {
        state.0.lock().map(|g| g.clone()).unwrap_or_else(|_| load_storage_config(app))
    } else {
        load_storage_config(app)
    };
    Ok(resolve_documents_dir(app, &config))
}

pub fn get_temp_ocr_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let config = if let Some(state) = app.try_state::<StorageConfigState>() {
        state.0.lock().map(|g| g.clone()).unwrap_or_else(|_| load_storage_config(app))
    } else {
        load_storage_config(app)
    };
    Ok(resolve_temp_ocr_dir(app, &config))
}

// ----------------- Tauri Commands -----------------

#[tauri::command]
pub fn get_storage_config(app: AppHandle) -> Result<StorageConfig, String> {
    let config = if let Some(state) = app.try_state::<StorageConfigState>() {
        state.0.lock().map(|g| g.clone()).unwrap_or_else(|_| load_storage_config(&app))
    } else {
        load_storage_config(&app)
    };
    Ok(config)
}

#[tauri::command]
pub fn get_resolved_storage_paths(app: AppHandle) -> Result<ResolvedStoragePaths, String> {
    Ok(get_resolved_paths(&app))
}

#[tauri::command]
pub fn validate_storage_dir(path: String) -> Result<bool, String> {
    validate_directory_path(&path).map(|_| true)
}

#[tauri::command]
pub fn update_storage_dir(
    app: AppHandle,
    key: String,
    new_path: Option<String>,
) -> Result<ResolvedStoragePaths, String> {
    let validated_path = match new_path {
        Some(p) if !p.trim().is_empty() => {
            let v = validate_directory_path(&p)?;
            Some(v.to_string_lossy().to_string())
        }
        _ => None,
    };

    let state = app
        .try_state::<StorageConfigState>()
        .ok_or_else(|| "StorageConfigState is not managed in Tauri app".to_string())?;

    let mut config_guard = state
        .0
        .lock()
        .map_err(|e| format!("Failed to acquire storage config lock: {e}"))?;

    match key.as_str() {
        "documents_dir" => config_guard.documents_dir = validated_path,
        "database_dir" => config_guard.database_dir = validated_path,
        "temp_ocr_dir" => config_guard.temp_ocr_dir = validated_path,
        "log_dir" => config_guard.log_dir = validated_path,
        other => return Err(format!("Khóa cài đặt không hợp lệ: '{other}'")),
    }

    save_storage_config(&app, &config_guard)?;
    drop(config_guard);

    Ok(get_resolved_paths(&app))
}

#[tauri::command]
pub fn reset_storage_config(app: AppHandle) -> Result<ResolvedStoragePaths, String> {
    let state = app
        .try_state::<StorageConfigState>()
        .ok_or_else(|| "StorageConfigState is not managed in Tauri app".to_string())?;

    let mut config_guard = state
        .0
        .lock()
        .map_err(|e| format!("Failed to acquire storage config lock: {e}"))?;

    *config_guard = StorageConfig {
        version: 1,
        documents_dir: None,
        database_dir: None,
        temp_ocr_dir: None,
        log_dir: None,
    };

    save_storage_config(&app, &config_guard)?;
    drop(config_guard);

    Ok(get_resolved_paths(&app))
}
