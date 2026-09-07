import type { ReminderRecord, NewReminderRecord } from "@/db/schema"

export type ReminderType = "1_day_before" | "1_hour_before" | "at_deadline" | (string & {})

export type ReminderStatus = "pending" | "delivered" | "failed" | "cancelled" | "missed"

export interface ReminderConfig {
  leadTimes: ReminderType[]
}

export interface ReminderItem {
  id: string
  taskId: string
  documentId: string
  provider: string
  reminderType: ReminderType
  scheduledAt: string
  status: ReminderStatus
  deliveredAt?: string | null
  cancelledAt?: string | null
  notificationId?: string | null
  idempotencyKey: string
  error?: string | null
  retryCount: number
  createdAt: string
  updatedAt: string
}

export interface NotificationPayload {
  id: string
  title: string
  body: string
  taskId: string
  documentId?: string
}

export interface NotificationProviderAvailability {
  available: boolean
  reason?: string
}

export interface ReminderEligibilityResult {
  eligible: boolean
  reason?: string
}

export { type ReminderRecord, type NewReminderRecord }
