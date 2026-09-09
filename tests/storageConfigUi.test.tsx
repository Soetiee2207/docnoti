import React from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderToString } from "react-dom/server"
import { SettingsView } from "@/components/settings/SettingsView"
import * as useStorageConfigModule from "@/hooks/useStorageConfig"
import * as useAutostartModule from "@/hooks/useAutostart"
import * as useSecretsModule from "@/hooks/useSecrets"
import * as useAiConfigModule from "@/hooks/useAiConfig"

vi.mock("@/hooks/useStorageConfig")
vi.mock("@/hooks/useAutostart")
vi.mock("@/hooks/useSecrets")
vi.mock("@/hooks/useAiConfig")

describe("SettingsView - Storage Config UI", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    vi.spyOn(useAutostartModule, "useAutostart").mockReturnValue({
      autostartEnabled: false,
      daemonStatus: null,
      loading: false,
      error: null,
      setAutostart: vi.fn(),
      reload: vi.fn(),
      exitApp: vi.fn(),
    })

    vi.spyOn(useSecretsModule, "useSecrets").mockReturnValue({
      isConfigured: false,
      loading: false,
      error: null,
      saveApiKey: vi.fn(),
      deleteApiKey: vi.fn(),
    })

    vi.spyOn(useAiConfigModule, "useAiConfig").mockReturnValue({
      cloudEnabled: false,
      model: "gpt-4o-mini",
      testingConnection: false,
      testResult: null,
      setCloudEnabled: vi.fn(),
      testConnection: vi.fn(),
    })
  })

  it("renders default storage paths and indicators", () => {
    vi.spyOn(useStorageConfigModule, "useStorageConfig").mockReturnValue({
      paths: {
        documentsDir: "C:\\AppData\\Local\\docnoti\\documents",
        databaseDir: "C:\\AppData\\Local\\docnoti",
        tempOcrDir: "C:\\AppData\\Local\\docnoti\\temp_ocr",
        logDir: "C:\\AppData\\Local\\docnoti\\logs",
        isCustomDocumentsDir: false,
        isCustomDatabaseDir: false,
        isCustomTempOcrDir: false,
        isCustomLogDir: false,
      },
      loading: false,
      error: null,
      reload: vi.fn(),
      updateDir: vi.fn(),
      resetToDefaults: vi.fn(),
      selectDirectory: vi.fn(),
    })

    const html = renderToString(<SettingsView />)

    expect(html).toContain("Lưu trữ cục bộ &amp; Đường dẫn hệ thống")
    expect(html).toContain("Thư mục tài liệu PDF đã lưu")
    expect(html).toContain("Thư mục Cơ sở dữ liệu SQLite (docnoti.db &amp; vectors)")
    expect(html).toContain("Thư mục file tạm OCR")
    expect(html).toContain("Thư mục nhật ký (Logs)")
    expect(html).toContain("C:\\AppData\\Local\\docnoti\\documents")
    expect(html).toContain("C:\\AppData\\Local\\docnoti")
    expect(html).toContain("Mặc định")
    expect(html).toContain("Thay đổi")
  })

  it("renders custom path badges and restore buttons when paths are customized", () => {
    vi.spyOn(useStorageConfigModule, "useStorageConfig").mockReturnValue({
      paths: {
        documentsDir: "D:\\MyStorage\\Documents",
        databaseDir: "D:\\MyStorage\\Db",
        tempOcrDir: "C:\\AppData\\Local\\docnoti\\temp_ocr",
        logDir: "C:\\AppData\\Local\\docnoti\\logs",
        isCustomDocumentsDir: true,
        isCustomDatabaseDir: true,
        isCustomTempOcrDir: false,
        isCustomLogDir: false,
      },
      loading: false,
      error: null,
      reload: vi.fn(),
      updateDir: vi.fn(),
      resetToDefaults: vi.fn(),
      selectDirectory: vi.fn(),
    })

    const html = renderToString(<SettingsView />)

    expect(html).toContain("Tùy chỉnh")
    expect(html).toContain("D:\\MyStorage\\Documents")
    expect(html).toContain("D:\\MyStorage\\Db")
    expect(html).toContain("Khôi phục mặc định")
    expect(html).toContain("Lưu ý quan trọng:")
  })

  it("displays error banner when storage operation fails", () => {
    vi.spyOn(useStorageConfigModule, "useStorageConfig").mockReturnValue({
      paths: null,
      loading: false,
      error: "Không thể truy cập thư mục được chọn: Quyền bị từ chối",
      reload: vi.fn(),
      updateDir: vi.fn(),
      resetToDefaults: vi.fn(),
      selectDirectory: vi.fn(),
    })

    const html = renderToString(<SettingsView />)

    expect(html).toContain("Không thể truy cập thư mục được chọn: Quyền bị từ chối")
  })
})
