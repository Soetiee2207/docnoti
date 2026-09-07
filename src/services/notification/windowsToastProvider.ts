import type { NotificationProvider } from "./notificationProvider"
import type {
  NotificationPayload,
  NotificationProviderAvailability,
} from "./types"

function isTauriEnvironment(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
  )
}

export interface WindowsNotificationNativeBridge {
  isAvailable(): Promise<boolean>
  showNotification(payload: NotificationPayload): Promise<{ notificationId?: string }>
  cancelNotification?(notificationId: string): Promise<void>
}

export class WindowsToastNotificationProvider implements NotificationProvider {
  readonly id = "windows_toast"
  readonly name = "Windows Toast Notification"

  private bridge?: WindowsNotificationNativeBridge

  constructor(bridge?: WindowsNotificationNativeBridge) {
    this.bridge = bridge
  }

  async checkAvailability(): Promise<NotificationProviderAvailability> {
    if (this.bridge) {
      try {
        const available = await this.bridge.isAvailable()
        return available
          ? { available: true }
          : { available: false, reason: "Windows notification bridge báo trạng thái không khả dụng." }
      } catch (err) {
        return {
          available: false,
          reason: `Lỗi khi kiểm tra notification bridge: ${err instanceof Error ? err.message : String(err)}`,
        }
      }
    }

    if (!isTauriEnvironment()) {
      return {
        available: false,
        reason: "Không chạy trong môi trường Tauri native Windows.",
      }
    }

    try {
      const { invoke } = await import("@tauri-apps/api/core")
      const available = await invoke<boolean>("check_notification_available")
      return available
        ? { available: true }
        : { available: false, reason: "Windows Toast Notification API không khả dụng trên hệ thống này." }
    } catch {
      return {
        available: false,
        reason: "Tauri command check_notification_available chưa khả dụng hoặc trả về lỗi.",
      }
    }
  }

  async showNotification(payload: NotificationPayload): Promise<{ notificationId?: string }> {
    const availability = await this.checkAvailability()
    if (!availability.available) {
      throw new Error(`Windows Toast Notification không khả dụng: ${availability.reason ?? "Không xác định"}`)
    }

    if (this.bridge) {
      return this.bridge.showNotification(payload)
    }

    const { invoke } = await import("@tauri-apps/api/core")
    const result = await invoke<{ notificationId?: string }>("show_toast_notification", {
      title: payload.title,
      body: payload.body,
    })
    return result ?? { notificationId: payload.id }
  }

  async cancelNotification(notificationId: string): Promise<void> {
    if (this.bridge?.cancelNotification) {
      await this.bridge.cancelNotification(notificationId)
    }
  }
}
