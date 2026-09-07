import { describe, it, expect, vi } from "vitest"
import {
  WindowsToastNotificationProvider,
  type WindowsNotificationNativeBridge,
} from "@/services/notification/windowsToastProvider"

describe("WindowsToastNotificationProvider", () => {
  it("truthfully reports unavailable outside Tauri native Windows environment", async () => {
    const provider = new WindowsToastNotificationProvider()
    const avail = await provider.checkAvailability()

    expect(avail.available).toBe(false)
    expect(avail.reason).toContain("Không chạy trong môi trường Tauri native Windows")
  })

  it("throws actionable error when showNotification is called while unavailable", async () => {
    const provider = new WindowsToastNotificationProvider()

    await expect(
      provider.showNotification({
        id: "rem-1",
        title: "Nhắc nhở hạn chót",
        body: "Đến hạn: Báo cáo thuế",
        taskId: "task-1",
      })
    ).rejects.toThrow(/Windows Toast Notification không khả dụng/)
  })

  it("delegates to deterministic bridge test double when injected", async () => {
    const mockBridge: WindowsNotificationNativeBridge = {
      isAvailable: vi.fn().mockResolvedValue(true),
      showNotification: vi.fn().mockResolvedValue({ notificationId: "toast-xyz" }),
      cancelNotification: vi.fn().mockResolvedValue(undefined),
    }

    const provider = new WindowsToastNotificationProvider(mockBridge)
    const avail = await provider.checkAvailability()

    expect(avail.available).toBe(true)
    expect(mockBridge.isAvailable).toHaveBeenCalled()

    const result = await provider.showNotification({
      id: "rem-2",
      title: "Đến hạn công việc",
      body: "Đến hạn: Thanh toán tiền điện",
      taskId: "task-2",
    })

    expect(result.notificationId).toBe("toast-xyz")
    expect(mockBridge.showNotification).toHaveBeenCalledWith({
      id: "rem-2",
      title: "Đến hạn công việc",
      body: "Đến hạn: Thanh toán tiền điện",
      taskId: "task-2",
    })

    await provider.cancelNotification("toast-xyz")
    expect(mockBridge.cancelNotification).toHaveBeenCalledWith("toast-xyz")
  })

  it("surfaces bridge failure truthfully", async () => {
    const mockBridge: WindowsNotificationNativeBridge = {
      isAvailable: vi.fn().mockResolvedValue(false),
      showNotification: vi.fn(),
    }

    const provider = new WindowsToastNotificationProvider(mockBridge)
    const avail = await provider.checkAvailability()

    expect(avail.available).toBe(false)
    expect(avail.reason).toContain("Windows notification bridge báo trạng thái không khả dụng")

    await expect(
      provider.showNotification({
        id: "rem-3",
        title: "Test",
        body: "Test body",
        taskId: "task-3",
      })
    ).rejects.toThrow(/Windows Toast Notification không khả dụng/)
  })
})
