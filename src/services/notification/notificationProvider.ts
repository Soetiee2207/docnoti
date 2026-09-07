import type {
  NotificationPayload,
  NotificationProviderAvailability,
} from "./types"

export interface NotificationProvider {
  readonly id: string
  readonly name: string

  checkAvailability(): Promise<NotificationProviderAvailability>

  showNotification(payload: NotificationPayload): Promise<{ notificationId?: string }>

  cancelNotification?(notificationId: string): Promise<void>
}
