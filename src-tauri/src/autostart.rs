use std::env;
use std::process::Command;

const RUN_KEY: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
const APP_NAME: &str = "docnoti";

#[tauri::command]
pub fn get_autostart_status() -> Result<bool, String> {
    if !cfg!(target_os = "windows") {
        return Ok(false);
    }

    let output = Command::new("reg")
        .args(["query", RUN_KEY, "/v", APP_NAME])
        .output()
        .map_err(|e| format!("Failed to execute reg query: {e}"))?;

    Ok(output.status.success())
}

#[tauri::command]
pub fn set_autostart_status(enabled: bool) -> Result<(), String> {
    if !cfg!(target_os = "windows") {
        return Err("Autostart is only supported on Windows.".to_string());
    }

    if enabled {
        let current_exe = env::current_exe()
            .map_err(|e| format!("Failed to get current exe path: {e}"))?;
        let exe_path = current_exe.to_string_lossy().to_string();
        let cmd_value = format!("\"{}\" --background", exe_path);

        let output = Command::new("reg")
            .args(["add", RUN_KEY, "/v", APP_NAME, "/t", "REG_SZ", "/d", &cmd_value, "/f"])
            .output()
            .map_err(|e| format!("Failed to execute reg add: {e}"))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Failed to register autostart: {stderr}"));
        }
    } else {
        let output = Command::new("reg")
            .args(["delete", RUN_KEY, "/v", APP_NAME, "/f"])
            .output()
            .map_err(|e| format!("Failed to execute reg delete: {e}"))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            if !stderr.contains("unable to find") && !stderr.contains("cannot find") && !stderr.contains("not find") {
                return Err(format!("Failed to unregister autostart: {stderr}"));
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_autostart_status_query() {
        // Must succeed without panic on Windows
        let status = get_autostart_status();
        assert!(status.is_ok());
    }
}
