import type { CalendarProvider } from "./calendarProvider"
import type {
  CalendarEvent,
  CreateCalendarEventRequest,
  UpdateCalendarEventRequest,
  CalendarProviderAvailability,
} from "./types"
import type { CalendarEventRepository } from "@/repositories/calendarEventRepository"
import type { NewCalendarEventRecord } from "@/db/schema"

export class InternalCalendarProvider implements CalendarProvider {
  readonly id = "internal"
  readonly name = "Lịch nội bộ"

  private repository: CalendarEventRepository

  constructor(repository: CalendarEventRepository) {
    this.repository = repository
  }

  async checkAvailability(): Promise<CalendarProviderAvailability> {
    return { available: true }
  }

  async createEvent(request: CreateCalendarEventRequest): Promise<CalendarEvent> {
    // Check if event already exists with this idempotency key
    const existing = await this.repository.findByIdempotencyKey(request.idempotencyKey)
    if (existing) {
      return existing
    }

    const now = new Date().toISOString()
    const record: NewCalendarEventRecord = {
      id: crypto.randomUUID(),
      taskId: request.taskId,
      documentId: request.documentId,
      provider: this.id,
      externalEventId: null,
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
    await this.repository.delete(eventId)
  }

  async getEvent(eventId: string): Promise<CalendarEvent | null> {
    return this.repository.findById(eventId)
  }

  async getEventByIdempotencyKey(key: string): Promise<CalendarEvent | null> {
    return this.repository.findByIdempotencyKey(key)
  }
}
