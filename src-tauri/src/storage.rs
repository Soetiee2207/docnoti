use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedFileInfo {
    pub id: String,
    pub name: String,
    pub original_path: String,
    pub storage_path: String,
    pub file_size: u64,
    pub checksum: String,
}

fn validate_pdf_file(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Err(format!("File does not exist: {}", path.display()));
    }
    if !path.is_file() {
        return Err(format!("Path is not a regular file: {}", path.display()));
    }

    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    if ext != "pdf" {
        return Err("Only PDF files are supported in V1".to_string());
    }

    let mut file = File::open(path).map_err(|e| format!("Failed to open file: {e}"))?;
    let mut header = [0u8; 1024];
    let bytes_read = file
        .read(&mut header)
        .map_err(|e| format!("Failed to read file header: {e}"))?;

    if bytes_read < 4 || !header[..bytes_read].windows(5).any(|w| w == b"%PDF-") {
        return Err("File is not a valid PDF document (missing %PDF- header)".to_string());
    }

    Ok(())
}

fn compute_sha256(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|e| format!("Failed to open file for hashing: {e}"))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 65536];

    loop {
        let n = file
            .read(&mut buffer)
            .map_err(|e| format!("Failed to read chunk for hashing: {e}"))?;
        if n == 0 {
            break;
        }
        hasher.update(&buffer[..n]);
    }

    Ok(format!("{:x}", hasher.finalize()))
}

pub fn get_storage_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base_dir = app
        .path()
        .app_local_data_dir()
        .or_else(|_| app.path().app_data_dir())
        .map_err(|e| format!("Failed to resolve application data directory: {e}"))?;

    let docs_dir = base_dir.join("documents");
    if !docs_dir.exists() {
        fs::create_dir_all(&docs_dir)
            .map_err(|e| format!("Failed to create storage directory: {e}"))?;
    }
    Ok(docs_dir)
}

#[tauri::command]
pub fn import_pdf_file(app: AppHandle, source_path: String) -> Result<ImportedFileInfo, String> {
    let src_path = Path::new(&source_path);
    validate_pdf_file(src_path)?;

    let checksum = compute_sha256(src_path)?;
    let metadata = fs::metadata(src_path).map_err(|e| format!("Failed to read metadata: {e}"))?;
    let file_size = metadata.len();

    let file_name = src_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("document.pdf")
        .to_string();

    let storage_dir = get_storage_dir(&app)?;
    let doc_id = Uuid::new_v4().to_string();
    let dest_filename = format!("{doc_id}.pdf");
    let dest_path = storage_dir.join(&dest_filename);

    fs::copy(src_path, &dest_path).map_err(|e| {
        format!(
            "Failed to copy file to local storage ({}): {e}",
            dest_path.display()
        )
    })?;

    Ok(ImportedFileInfo {
        id: doc_id,
        name: file_name,
        original_path: source_path,
        storage_path: dest_path.to_string_lossy().to_string(),
        file_size,
        checksum,
    })
}

#[tauri::command]
pub fn delete_stored_file(app: AppHandle, storage_path: String) -> Result<(), String> {
    let storage_dir = get_storage_dir(&app)?;
    let target_path = Path::new(&storage_path);

    // Security guard: ensure target is strictly inside managed storage directory
    if !target_path.starts_with(&storage_dir) {
        return Err("Security violation: target path is not within managed storage".to_string());
    }

    if target_path.exists() {
        fs::remove_file(target_path)
            .map_err(|e| format!("Failed to remove stored file {}: {e}", target_path.display()))?;
    }

    Ok(())
}

#[tauri::command]
pub fn read_stored_file(app: AppHandle, storage_path: String) -> Result<Vec<u8>, String> {
    let storage_dir = get_storage_dir(&app)?;
    let target_path = Path::new(&storage_path);

    // Security guard: ensure target is strictly inside managed storage directory
    if !target_path.starts_with(&storage_dir) {
        return Err("Security violation: target path is not within managed storage".to_string());
    }

    if !target_path.exists() {
        return Err(format!("Stored file does not exist: {}", target_path.display()));
    }

    fs::read(target_path).map_err(|e| format!("Failed to read stored file {}: {e}", target_path.display()))
}

