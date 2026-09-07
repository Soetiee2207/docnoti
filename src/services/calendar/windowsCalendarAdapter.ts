import type { CalendarProvider } from "./calendarProvider"
import type {
  CalendarEvent,
  CreateCalendarEventRequest,
  UpdateCalendarEventRequest,
  CalendarProviderAvailability,
} from "./types"
import type { CalendarEventRepository } from "@/repositories/calendarEventRepository"
import type { NewCalendarEventRecord } from "@/db/schema"

function isTauriEnvironment(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
  )
}

export interface WindowsCalendarPayload {
  title: string
  description?: string | null
  startDate: string
  endDate: string
  isAllDay: boolean
  timezone: string
}

export interface WindowsCalendarNativeBridge {
  isAvailable(): Promise<boolean>
  createEvent(payload: WindowsCalendarPayload): Promise<{ externalId: string }>
  updateEvent(externalId: string, payload: WindowsCalendarPayload): Promise<void>
  deleteEvent(externalId: string): Promise<void>
}

export class WindowsCalendarAdapter implements CalendarProvider {
  readonly id = "windows"
  readonly name = "Windows Calendar"

  private repository: CalendarEventRepository
  private bridge?: WindowsCalendarNativeBridge

  constructor(repository: CalendarEventRepository, bridge?: WindowsCalendarNativeBridge) {
    this.repository = repository
    this.bridge = bridge
  }

  async checkAvailability(): Promise<CalendarProviderAvailability> {
    if (this.bridge) {
      try {
        const available = await this.bridge.isAvailable()
        return available
          ? { available: true }
          : { available: false, reason: "Windows Calendar bridge báo trạng thái không khả dụng." }
      } catch (err) {
        return {
          available: false,
          reason: `Lỗi khi kiểm tra Windows Calendar bridge: ${err instanceof Error ? err.message : String(err)}`,
        }
      }
    }

    if (!isTauriEnvironment()) {
      return {
        available: false,
        reason: "Không chạy trong môi trường Tauri native Windows.",
      }
    }

    // When running inside Tauri without a mock bridge, check if Tauri native command is implemented
    try {
      const { invoke } = await import("@tauri-apps/api/core")
      const available = await invoke<boolean>("check_windows_calendar_available")
      return available
        ? { available: true }
        : { available: false, reason: "Windows Calendar API không khả dụng trên hệ thống này." }
    } catch {
      return {
        available: false,
        reason: "Tauri command check_windows_calendar_available chưa khả dụng hoặc trả về lỗi.",
      }
    }
  }

  async createEvent(request: CreateCalendarEventRequest): Promise<CalendarEvent> {
    // 1. Check local idempotency first
    const existing = await this.repository.findByIdempotencyKey(request.idempotencyKey)
    if (existing) {
      return existing
    }

    // 2. Verify availability
    const availability = await this.checkAvailability()
    if (!availability.available) {
      throw new Error(`Windows Calendar không khả dụng: ${availability.reason ?? "Không xác định"}`)
    }

    const payload: WindowsCalendarPayload = {
      title: request.title,
      description: request.description,
      startDate: request.startDate,
      endDate: request.endDate,
      isAllDay: request.isAllDay,
      timezone: request.timezone,
    }

    let externalEventId: string | null = null

    if (this.bridge) {
      const result = await this.bridge.createEvent(payload)
      externalEventId = result.externalId
    } else {
      const { invoke } = await import("@tauri-apps/api/core")
      externalEventId = await invoke<string>("create_windows_calendar_event", { payload })
    }

    const now = new Date().toISOString()
    const record: NewCalendarEventRecord = {
      id: crypto.randomUUID(),
      taskId: request.taskId,
      documentId: request.documentId,
      provider: this.id,
      externalEventId,
      title: request.title,
      description: request.description ?? null,
      startDate: request.startDate,
      endDate: request.endDate,
      isAllDay: request.isAllDay ? 1 : 0,
      timezone: request.timezone,
      status: "scheduled",
      idempotencyKey: request.idempotencyKey,
      createdAt: now,
      updatedAt: now,
    }

    return this.repository.create(record)
  }

  async updateEvent(
    eventId: string,
    request: UpdateCalendarEventRequest
  ): Promise<CalendarEvent> {
    const existing = await this.repository.findById(eventId)
    if (!existing) {
      throw new Error(`Calendar event ${eventId} không tồn tại.`)
    }

    const availability = await this.checkAvailability()
    if (!availability.available) {
      throw new Error(`Windows Calendar không khả dụng: ${availability.reason ?? "Không xác định"}`)
    }

    const payload: WindowsCalendarPayload = {
      title: request.title ?? existing.title,
      description: request.description !== undefined ? request.description : existing.description,
      startDate: request.startDate ?? existing.startDate,
      endDate: request.endDate ?? existing.endDate,
      isAllDay: request.isAllDay !== undefined ? request.isAllDay : existing.isAllDay,
      timezone: request.timezone ?? existing.timezone,
    }

    if (existing.externalEventId) {
      if (this.bridge) {
        await this.bridge.updateEvent(existing.externalEventId, payload)
      } else {
        const { invoke } = await import("@tauri-apps/api/core")
        await invoke("update_windows_calendar_event", {
          externalId: existing.externalEventId,
          payload,
        })
      }
    }

    const updates: Partial<NewCalendarEventRecord> = {}
    if (request.title !== undefined) updates.title = request.title
    if (request.description !== undefined) updates.description = request.description
    if (request.startDate !== undefined) updates.startDate = request.startDate
    if (request.endDate !== undefined) updates.endDate = request.endDate
    if (request.isAllDay !== undefined) updates.isAllDay = request.isAllDay ? 1 : 0
    if (request.timezone !== undefined) updates.timezone = request.timezone
    if (request.status !== undefined) updates.status = request.status

    return this.repository.update(eventId, updates)
  }

  async deleteEvent(eventId: string): Promise<void> {
    const existing = await this.repository.findById(eventId)
    if (!existing) return

    const availability = await this.checkAvailability()
    if (availability.available && existing.externalEventId) {
      try {
        if (this.bridge) {
          await this.bridge.deleteEvent(existing.externalEventId)
        } else {
          const { invoke } = await import("@tauri-apps/api/core")
          await invoke("delete_windows_calendar_event", {
            externalId: existing.externalEventId,
          })
        }
      } catch (err) {
        console.warn(`Lỗi khi xóa sự kiện trên Windows Calendar: ${err}`)
      }
    }

    await this.repository.delete(eventId)
  }

  async getEvent(eventId: string): Promise<CalendarEvent | null> {
    return this.repository.findById(eventId)
  }

  async getEventByIdempotencyKey(key: string): Promise<CalendarEvent | null> {
    return this.repository.findByIdempotencyKey(key)
  }
}
