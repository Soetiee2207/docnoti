use std::fs;
use std::path::PathBuf;
use std::process::Command;
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use tauri::{AppHandle, Manager};
use uuid::Uuid;

/// Resolves the absolute path to scripts/ocr_runner.py across:
/// 1. Bundled application resources (production installer / release bundle)
/// 2. Parent directory (npm run tauri dev from src-tauri)
/// 3. Project root directory (from workspace root)
/// 4. Next to the current executable
pub fn find_ocr_script(app: &AppHandle) -> Result<PathBuf, String> {
    let mut candidates = Vec::new();

    // 1. Tauri bundled resource directory (primary for production)
    if let Ok(res_dir) = app.path().resource_dir() {
        candidates.push(res_dir.join("scripts").join("ocr_runner.py"));
        candidates.push(res_dir.join("ocr_runner.py"));
    }

    // 2. Relative to src-tauri during development
    candidates.push(PathBuf::from("../scripts/ocr_runner.py"));

    // 3. Direct relative to project root
    candidates.push(PathBuf::from("scripts/ocr_runner.py"));

    // 4. Relative to current executable
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            candidates.push(exe_dir.join("scripts").join("ocr_runner.py"));
            candidates.push(exe_dir.join("resources").join("scripts").join("ocr_runner.py"));
            candidates.push(exe_dir.join("../scripts/ocr_runner.py"));
            candidates.push(exe_dir.join("../../scripts/ocr_runner.py"));
            candidates.push(exe_dir.join("ocr_runner.py"));
        }
    }

    for candidate in candidates {
        if candidate.exists() && candidate.is_file() {
            #[cfg(debug_assertions)]
            eprintln!(
                "[PATH_AUDIT] OCR_RESOURCE resolved='{}' exists=true is_file=true",
                candidate.display()
            );
            return Ok(candidate);
        }
    }

    #[cfg(debug_assertions)]
    eprintln!(
        "[PATH_AUDIT] OCR_RESOURCE failed to resolve. Checked candidates from cwd='{}', resource_dir='{:?}'",
        std::env::current_dir().map(|p| p.display().to_string()).unwrap_or_default(),
        app.path().resource_dir()
    );

    Err("Không tìm thấy file scripts/ocr_runner.py trong các đường dẫn tiêu chuẩn.".to_string())
}

/// Resolves the Python executable across:
/// 1. DOCNOTI_PYTHON environment variable
/// 2. Project virtualenvs (.venv, venv)
/// 3. System PATH ("python")
pub fn find_python_exe() -> PathBuf {
    // 1. Check explicit environment override
    if let Ok(custom) = std::env::var("DOCNOTI_PYTHON") {
        let p = PathBuf::from(custom.trim());
        if p.exists() {
            #[cfg(debug_assertions)]
            eprintln!(
                "[PATH_AUDIT] PYTHON_RUNTIME resolved='{}' exists=true (from DOCNOTI_PYTHON)",
                p.display()
            );
            return p;
        }
    }

    // 2. Check virtual environment locations (dev / portable)
    let venv_candidates = [
        "../.venv/Scripts/python.exe",
        "../venv/Scripts/python.exe",
        ".venv/Scripts/python.exe",
        "venv/Scripts/python.exe",
        "../.venv/bin/python",
        ".venv/bin/python",
    ];

    for candidate in venv_candidates {
        let p = PathBuf::from(candidate);
        if p.exists() {
            #[cfg(debug_assertions)]
            eprintln!(
                "[PATH_AUDIT] PYTHON_RUNTIME resolved='{}' exists=true (from local venv)",
                p.display()
            );
            return p;
        }
    }

    // 3. Fallback to system "python"
    #[cfg(debug_assertions)]
    eprintln!("[PATH_AUDIT] PYTHON_RUNTIME resolved='python' (system PATH)");
    PathBuf::from("python")
}

#[tauri::command]
pub fn check_ocr_available(app: AppHandle) -> bool {
    let script = match find_ocr_script(&app) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[OCR] check_ocr_available failed to locate script: {e}");
            return false;
        }
    };

    let python = find_python_exe();
    let mut cmd = Command::new(&python);
    #[cfg(windows)]
    cmd.creation_flags(0x08000000);

    let output = cmd
        .arg(&script)
        .arg("--check")
        .output();

    match output {
        Ok(out) => out.status.success(),
        Err(e) => {
            eprintln!("[OCR] Failed to spawn python process ({}): {e}", python.display());
            false
        }
    }
}

#[tauri::command]
pub fn run_ocr_on_image(app: AppHandle, image_bytes: Vec<u8>) -> Result<String, String> {
    if image_bytes.is_empty() {
        return Err("Dữ liệu ảnh rỗng, không thể chạy OCR.".to_string());
    }

    let script = find_ocr_script(&app)?;
    let temp_dir = crate::storage_config::get_temp_ocr_dir(&app)?;

    let temp_file = temp_dir.join(format!("{}.png", Uuid::new_v4()));
    fs::write(&temp_file, &image_bytes)
        .map_err(|e| format!("Không thể ghi file ảnh tạm cho OCR: {e}"))?;

    let python = find_python_exe();
    let mut cmd = Command::new(&python);
    #[cfg(windows)]
    cmd.creation_flags(0x08000000);

    let output = cmd
        .arg(&script)
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
        Err(e) => Err(format!(
            "Không thể khởi chạy python OCR runner ({}): {e}",
            python.display()
        )),
    }
}
