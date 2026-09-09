use std::fs;
use std::process::Command;
use tauri::{AppHandle, Manager};
use uuid::Uuid;

#[tauri::command]
pub fn check_ocr_available() -> bool {
    let output = Command::new("python")
        .arg("scripts/ocr_runner.py")
        .arg("--check")
        .output();

    match output {
        Ok(out) => out.status.success(),
        Err(_) => false,
    }
}

#[tauri::command]
pub fn run_ocr_on_image(app: AppHandle, image_bytes: Vec<u8>) -> Result<String, String> {
    if image_bytes.is_empty() {
        return Err("Dữ liệu ảnh rỗng, không thể chạy OCR.".to_string());
    }

    let temp_dir = crate::storage_config::get_temp_ocr_dir(&app)?;

    let temp_file = temp_dir.join(format!("{}.png", Uuid::new_v4()));
    fs::write(&temp_file, &image_bytes)
        .map_err(|e| format!("Không thể ghi file ảnh tạm cho OCR: {e}"))?;

    let output = Command::new("python")
        .arg("scripts/ocr_runner.py")
        .arg(&temp_file)
        .output();

    // Clean up temporary image immediately
    let _ = fs::remove_file(&temp_file);

    match output {
        Ok(out) => {
            let stdout_str = String::from_utf8_lossy(&out.stdout).to_string();
            if out.status.success() {
                Ok(stdout_str)
            } else {
                let stderr_str = String::from_utf8_lossy(&out.stderr).to_string();
                Err(format!("Lỗi khi chạy OCR: {stderr_str}\n{stdout_str}"))
            }
        }
        Err(e) => Err(format!("Không thể khởi chạy python OCR runner: {e}")),
    }
}
