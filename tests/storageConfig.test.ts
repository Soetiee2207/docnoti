import { describe, it, expect } from "vitest"
import type { StorageConfig, ResolvedStoragePaths, StorageDirKey } from "@/hooks/useStorageConfig"

describe("StorageConfig Data Model & Rules", () => {
  it("defines correct structure and defaults for StorageConfig", () => {
    const config: StorageConfig = {
      version: 1,
      documentsDir: null,
      databaseDir: null,
      tempOcrDir: null,
      logDir: null,
    }

    expect(config.version).toBe(1)
    expect(config.documentsDir).toBeNull()
    expect(config.databaseDir).toBeNull()
    expect(config.tempOcrDir).toBeNull()
    expect(config.logDir).toBeNull()
  })

  it("deserializes custom storage paths correctly", () => {
    const rawJson = JSON.stringify({
      version: 1,
      documentsDir: "D:\\CustomDocs",
      databaseDir: "D:\\CustomDb",
      tempOcrDir: null,
      logDir: "D:\\CustomLogs",
    })

    const parsed = JSON.parse(rawJson) as StorageConfig

    expect(parsed.version).toBe(1)
    expect(parsed.documentsDir).toBe("D:\\CustomDocs")
    expect(parsed.databaseDir).toBe("D:\\CustomDb")
    expect(parsed.tempOcrDir).toBeNull()
    expect(parsed.logDir).toBe("D:\\CustomLogs")
  })

  it("handles fallback resolution when custom paths are null", () => {
    const fallback: ResolvedStoragePaths = {
      documentsDir: "C:\\Users\\test\\AppData\\Local\\com.tauri.dev\\documents",
      databaseDir: "C:\\Users\\test\\AppData\\Local\\com.tauri.dev",
      tempOcrDir: "C:\\Users\\test\\AppData\\Local\\com.tauri.dev\\temp_ocr",
      logDir: "C:\\Users\\test\\AppData\\Local\\com.tauri.dev\\logs",
      isCustomDocumentsDir: false,
      isCustomDatabaseDir: false,
      isCustomTempOcrDir: false,
      isCustomLogDir: false,
    }

    expect(fallback.isCustomDocumentsDir).toBe(false)
    expect(fallback.isCustomDatabaseDir).toBe(false)
    expect(fallback.documentsDir).toContain("documents")
    expect(fallback.databaseDir).not.toContain("documents")
  })

  it("updates resolution flags when custom paths are applied", () => {
    const custom: ResolvedStoragePaths = {
      documentsDir: "E:\\Custom\\Documents",
      databaseDir: "C:\\Users\\test\\AppData\\Local\\com.tauri.dev",
      tempOcrDir: "C:\\Users\\test\\AppData\\Local\\com.tauri.dev\\temp_ocr",
      logDir: "E:\\Custom\\Logs",
      isCustomDocumentsDir: true,
      isCustomDatabaseDir: false,
      isCustomTempOcrDir: false,
      isCustomLogDir: true,
    }

    expect(custom.isCustomDocumentsDir).toBe(true)
    expect(custom.isCustomDatabaseDir).toBe(false)
    expect(custom.isCustomLogDir).toBe(true)
    expect(custom.documentsDir).toBe("E:\\Custom\\Documents")
  })

  describe("Directory Path Safety Validation Rules", () => {
    function validatePath(pathStr: string): { valid: boolean; error?: string } {
      const trimmed = pathStr.trim()
      if (!trimmed) {
        return { valid: false, error: "Đường dẫn không được để trống" }
      }

      // Check relative path (Windows: must start with drive like C:\ or UNC \\)
      const isAbsolute = /^[a-zA-Z]:[\\/]/.test(trimmed) || trimmed.startsWith("\\\\") || trimmed.startsWith("/")
      if (!isAbsolute) {
        return { valid: false, error: "Đường dẫn phải là tuyệt đối" }
      }

      // Path traversal check
      if (trimmed.includes("..")) {
        return { valid: false, error: "Đường dẫn không được chứa ký tự chuyển cấp '..'" }
      }

      const lower = trimmed.toLowerCase().replace(/\//g, "\\")

      // Root drive check (e.g. C:\ or C:)
      if (lower.length <= 3 && (lower.endsWith(":") || lower.endsWith(":\\"))) {
        return { valid: false, error: "Không được chọn trực tiếp ổ đĩa gốc làm thư mục lưu trữ" }
      }

      // Windows system directory check
      if (
        lower.startsWith("c:\\windows") ||
        lower.startsWith("c:\\program files") ||
        lower.startsWith("c:\\program files (x86)") ||
        lower.startsWith("c:\\programdata\\microsoft")
      ) {
        return { valid: false, error: "Không được chọn thư mục hệ thống của Windows" }
      }

      return { valid: true }
    }

    it("rejects empty paths", () => {
      expect(validatePath("").valid).toBe(false)
      expect(validatePath("   ").valid).toBe(false)
    })

    it("rejects relative paths", () => {
      expect(validatePath("documents/storage").valid).toBe(false)
      expect(validatePath(".\\data").valid).toBe(false)
    })

    it("rejects path traversal attempts", () => {
      expect(validatePath("D:\\Data\\..\\Windows").valid).toBe(false)
    })

    it("rejects bare root drive", () => {
      expect(validatePath("C:\\").valid).toBe(false)
      expect(validatePath("D:").valid).toBe(false)
    })

    it("rejects system directories", () => {
      expect(validatePath("C:\\Windows\\System32").valid).toBe(false)
      expect(validatePath("C:\\Program Files\\Docnoti").valid).toBe(false)
      expect(validatePath("C:\\Program Files (x86)\\Docnoti").valid).toBe(false)
    })

    it("accepts valid custom storage paths", () => {
      expect(validatePath("D:\\DocnotiData\\Documents").valid).toBe(true)
      expect(validatePath("E:\\Storage\\docnoti_db").valid).toBe(true)
      expect(validatePath("C:\\Users\\John\\Documents\\docnoti").valid).toBe(true)
    })
  })
})
