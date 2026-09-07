#[cfg(target_os = "windows")]
mod windows_cred {
    use std::ffi::c_void;
    use std::os::windows::ffi::OsStrExt;
    use std::ptr;

    const CRED_TYPE_GENERIC: u32 = 1;
    const CRED_PERSIST_LOCAL_MACHINE: u32 = 2;

    #[repr(C)]
    struct CREDENTIALW {
        flags: u32,
        type_: u32,
        target_name: *mut u16,
        comment: *mut u16,
        last_written: [u32; 2],
        credential_blob_size: u32,
        credential_blob: *mut u8,
        persist: u32,
        attribute_count: u32,
        attributes: *mut c_void,
        target_alias: *mut u16,
        user_name: *mut u16,
    }

    #[link(name = "advapi32")]
    extern "system" {
        fn CredWriteW(credential: *const CREDENTIALW, flags: u32) -> i32;
        fn CredReadW(
            target_name: *const u16,
            type_: u32,
            flags: u32,
            credential: *mut *mut CREDENTIALW,
        ) -> i32;
        fn CredDeleteW(target_name: *const u16, type_: u32, flags: u32) -> i32;
        fn CredFree(buffer: *mut c_void);
    }

    fn to_wide(s: &str) -> Vec<u16> {
        std::ffi::OsStr::new(s)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    }

    fn format_target(key: &str) -> String {
        format!("docnoti:{}", key)
    }

    pub fn set_secret(key: &str, secret: &str) -> Result<(), String> {
        let target = format_target(key);
        let mut target_wide = to_wide(&target);
        let mut user_wide = to_wide("docnoti");
        let mut secret_bytes = secret.as_bytes().to_vec();

        let cred = CREDENTIALW {
            flags: 0,
            type_: CRED_TYPE_GENERIC,
            target_name: target_wide.as_mut_ptr(),
            comment: ptr::null_mut(),
            last_written: [0, 0],
            credential_blob_size: secret_bytes.len() as u32,
            credential_blob: secret_bytes.as_mut_ptr(),
            persist: CRED_PERSIST_LOCAL_MACHINE,
            attribute_count: 0,
            attributes: ptr::null_mut(),
            target_alias: ptr::null_mut(),
            user_name: user_wide.as_mut_ptr(),
        };

        let ret = unsafe { CredWriteW(&cred, 0) };
        if ret != 0 {
            Ok(())
        } else {
            let err = std::io::Error::last_os_error();
            Err(format!("CredWriteW failed: {}", err))
        }
    }

    pub fn get_secret(key: &str) -> Result<Option<String>, String> {
        let target = format_target(key);
        let target_wide = to_wide(&target);
        let mut cred_ptr: *mut CREDENTIALW = ptr::null_mut();

        let ret = unsafe { CredReadW(target_wide.as_ptr(), CRED_TYPE_GENERIC, 0, &mut cred_ptr) };
        if ret != 0 {
            if cred_ptr.is_null() {
                return Ok(None);
            }
            let cred = unsafe { &*cred_ptr };
            let slice = unsafe {
                std::slice::from_raw_parts(cred.credential_blob, cred.credential_blob_size as usize)
            };
            let secret = String::from_utf8(slice.to_vec())
                .map_err(|e| format!("Invalid UTF-8 in secret blob: {}", e))?;
            unsafe { CredFree(cred_ptr as *mut c_void) };
            Ok(Some(secret))
        } else {
            let err = std::io::Error::last_os_error();
            // ERROR_NOT_FOUND is 1168 (0x490)
            if err.raw_os_error() == Some(1168) {
                Ok(None)
            } else {
                Err(format!("CredReadW failed: {}", err))
            }
        }
    }

    pub fn delete_secret(key: &str) -> Result<(), String> {
        let target = format_target(key);
        let target_wide = to_wide(&target);

        let ret = unsafe { CredDeleteW(target_wide.as_ptr(), CRED_TYPE_GENERIC, 0) };
        if ret != 0 {
            Ok(())
        } else {
            let err = std::io::Error::last_os_error();
            if err.raw_os_error() == Some(1168) {
                // Not found is considered successful deletion (idempotent)
                Ok(())
            } else {
                Err(format!("CredDeleteW failed: {}", err))
            }
        }
    }
}

#[cfg(not(target_os = "windows"))]
mod non_windows_fallback {
    use std::sync::Mutex;
    use std::collections::HashMap;

    static FALLBACK_STORE: Mutex<Option<HashMap<String, String>>> = Mutex::new(None);

    pub fn set_secret(key: &str, secret: &str) -> Result<(), String> {
        let mut guard = FALLBACK_STORE.lock().unwrap();
        let map = guard.get_or_insert_with(HashMap::new);
        map.insert(key.to_string(), secret.to_string());
        Ok(())
    }

    pub fn get_secret(key: &str) -> Result<Option<String>, String> {
        let guard = FALLBACK_STORE.lock().unwrap();
        if let Some(map) = guard.as_ref() {
            Ok(map.get(key).cloned())
        } else {
            Ok(None)
        }
    }

    pub fn delete_secret(key: &str) -> Result<(), String> {
        let mut guard = FALLBACK_STORE.lock().unwrap();
        if let Some(map) = guard.as_mut() {
            map.remove(key);
        }
        Ok(())
    }
}

#[tauri::command]
pub fn get_secret(key: String) -> Result<Option<String>, String> {
    #[cfg(target_os = "windows")]
    {
        windows_cred::get_secret(&key)
    }
    #[cfg(not(target_os = "windows"))]
    {
        non_windows_fallback::get_secret(&key)
    }
}

#[tauri::command]
pub fn set_secret(key: String, value: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        windows_cred::set_secret(&key, &value)
    }
    #[cfg(not(target_os = "windows"))]
    {
        non_windows_fallback::set_secret(&key, &value)
    }
}

#[tauri::command]
pub fn delete_secret(key: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        windows_cred::delete_secret(&key)
    }
    #[cfg(not(target_os = "windows"))]
    {
        non_windows_fallback::delete_secret(&key)
    }
}

#[tauri::command]
pub fn has_secret(key: String) -> Result<bool, String> {
    match get_secret(key) {
        Ok(Some(val)) => Ok(!val.trim().is_empty()),
        Ok(None) => Ok(false),
        Err(e) => Err(e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_secret_lifecycle_roundtrip() {
        let test_key = "test_test_key_roundtrip_12345";
        let test_val = "sk-test-mock-secret-val-98765";

        // 1. Initial should be None / false
        let init = get_secret(test_key.to_string()).unwrap();
        assert_eq!(init, None);
        assert_eq!(has_secret(test_key.to_string()).unwrap(), false);

        // 2. Set secret
        set_secret(test_key.to_string(), test_val.to_string()).unwrap();

        // 3. Get secret & has_secret
        let fetched = get_secret(test_key.to_string()).unwrap();
        assert_eq!(fetched, Some(test_val.to_string()));
        assert_eq!(has_secret(test_key.to_string()).unwrap(), true);

        // 4. Overwrite secret
        let overwrite_val = "sk-test-overwrite-new-secret";
        set_secret(test_key.to_string(), overwrite_val.to_string()).unwrap();
        assert_eq!(get_secret(test_key.to_string()).unwrap(), Some(overwrite_val.to_string()));

        // 5. Delete secret
        delete_secret(test_key.to_string()).unwrap();
        assert_eq!(get_secret(test_key.to_string()).unwrap(), None);
        assert_eq!(has_secret(test_key.to_string()).unwrap(), false);

        // 6. Delete again is idempotent
        delete_secret(test_key.to_string()).unwrap();
    }
}
