import React from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderToString } from "react-dom/server"
import { SettingsView } from "@/components/settings/SettingsView"
import * as useAutostartModule from "@/hooks/useAutostart"

vi.mock("@/hooks/useAutostart")

describe("SettingsView - Autostart & Background Daemon UI", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders disabled autostart state correctly by default", () => {
    vi.spyOn(useAutostartModule, "useAutostart").mockReturnValue({
      autostartEnabled: false,
      daemonStatus: {
        running: true,
        autostartEnabled: false,
        schedulerActive: true,
        workerActive: true,
      },
      loading: false,
      error: null,
      setAutostart: vi.fn(),
      reload: vi.fn(),
      exitApp: vi.fn(),
    })

    const html = renderToString(<SettingsView />)

    expect(html).toContain("Khởi động cùng Windows &amp; Chạy ngầm")
    expect(html).toContain("Đã tắt")
    expect(html).toContain("Đang hoạt động")
    expect(html).toContain("Sẵn sàng (Startup Recovery hoàn tất)")
    expect(html).toContain("Sẵn sàng (Polling active)")
    // Checkbox should not be checked
    expect(html).not.toContain("checked")
  })

  it("renders enabled autostart state when user has opted in", () => {
    vi.spyOn(useAutostartModule, "useAutostart").mockReturnValue({
      autostartEnabled: true,
      daemonStatus: {
        running: true,
        autostartEnabled: true,
        schedulerActive: true,
        workerActive: true,
      },
      loading: false,
      error: null,
      setAutostart: vi.fn(),
      reload: vi.fn(),
      exitApp: vi.fn(),
    })

    const html = renderToString(<SettingsView />)

    expect(html).toContain("Đang bật")
    expect(html).toContain("checked")
  })

  it("displays error banner when operation fails", () => {
    vi.spyOn(useAutostartModule, "useAutostart").mockReturnValue({
      autostartEnabled: false,
      daemonStatus: null,
      loading: false,
      error: "Không thể ghi vào Windows Registry",
      setAutostart: vi.fn(),
      reload: vi.fn(),
      exitApp: vi.fn(),
    })

    const html = renderToString(<SettingsView />)

    expect(html).toContain("Không thể ghi vào Windows Registry")
  })
})
