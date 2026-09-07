import type { CalendarEventRecord, NewCalendarEventRecord } from "@/db/schema"

export type CalendarEventStatus = "scheduled" | "cancelled" | "updated"

export type CalendarProviderId = "internal" | "windows" | (string & {})

export interface CalendarEvent {
  id: string
  taskId: string
  documentId: string
  provider: string
  externalEventId?: string | null
  title: string
  description?: string | null
  startDate: string
  endDate: string
  isAllDay: boolean
  timezone: string
  status: CalendarEventStatus
  idempotencyKey: string
  createdAt: string
  updatedAt: string
}

export interface CreateCalendarEventRequest {
  taskId: string
  documentId: string
  title: string
  description?: string | null
  startDate: string
  endDate: string
  isAllDay: boolean
  timezone: string
  idempotencyKey: string
}

export interface UpdateCalendarEventRequest {
  title?: string
  description?: string | null
  startDate?: string
  endDate?: string
  isAllDay?: boolean
  timezone?: string
  status?: CalendarEventStatus
}

export interface CalendarEventFilter {
  taskId?: string
  documentId?: string
  provider?: string
  status?: CalendarEventStatus
}

export interface CalendarEligibilityResult {
  eligible: boolean
  reason?: string
}

export interface CalendarProviderAvailability {
  available: boolean
  reason?: string
}

export { type CalendarEventRecord, type NewCalendarEventRecord }
