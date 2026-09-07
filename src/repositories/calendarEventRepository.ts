import { eq, and, desc } from "drizzle-orm"
import { calendarEvents, type CalendarEventRecord, type NewCalendarEventRecord } from "@/db/schema"
import type { AppDatabase } from "@/db/client"
import type { CalendarEvent, CalendarEventFilter, CalendarEventStatus } from "@/services/calendar/types"

export function mapCalendarEventToDomain(record: CalendarEventRecord): CalendarEvent {
  return {
    id: record.id,
    taskId: record.taskId,
    documentId: record.documentId,
    provider: record.provider,
    externalEventId: record.externalEventId,
    title: record.title,
    description: record.description,
    startDate: record.startDate,
    endDate: record.endDate,
    isAllDay: record.isAllDay === 1,
    timezone: record.timezone,
    status: record.status as CalendarEventStatus,
    idempotencyKey: record.idempotencyKey,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

export class CalendarEventRepository {
  private db: AppDatabase

  constructor(db: AppDatabase) {
    this.db = db
  }

  async create(record: NewCalendarEventRecord): Promise<CalendarEvent> {
    await this.db.insert(calendarEvents).values(record).run()
    const found = await this.findById(record.id)
    if (!found) {
      throw new Error(`Failed to retrieve newly created calendar event ${record.id}`)
    }
    return found
  }

  async findById(id: string): Promise<CalendarEvent | null> {
    const results = await this.db
      .select()
      .from(calendarEvents)
      .where(eq(calendarEvents.id, id))
      .limit(1)

    if (results.length === 0) return null
    return mapCalendarEventToDomain(results[0])
  }

  async findByIdempotencyKey(key: string): Promise<CalendarEvent | null> {
    const results = await this.db
      .select()
      .from(calendarEvents)
      .where(eq(calendarEvents.idempotencyKey, key))
      .limit(1)

    if (results.length === 0) return null
    return mapCalendarEventToDomain(results[0])
  }

  async findByTaskId(taskId: string, provider?: string): Promise<CalendarEvent[]> {
    const conditions = [eq(calendarEvents.taskId, taskId)]
    if (provider) {
      conditions.push(eq(calendarEvents.provider, provider))
    }

    const results = await this.db
      .select()
      .from(calendarEvents)
      .where(and(...conditions))
      .orderBy(desc(calendarEvents.createdAt))

    return results.map(mapCalendarEventToDomain)
  }

  async findByDocumentId(documentId: string): Promise<CalendarEvent[]> {
    const results = await this.db
      .select()
      .from(calendarEvents)
      .where(eq(calendarEvents.documentId, documentId))
      .orderBy(desc(calendarEvents.createdAt))

    return results.map(mapCalendarEventToDomain)
  }

  async findAll(filter?: CalendarEventFilter): Promise<CalendarEvent[]> {
    const conditions = []

    if (filter?.taskId) {
      conditions.push(eq(calendarEvents.taskId, filter.taskId))
    }
    if (filter?.documentId) {
      conditions.push(eq(calendarEvents.documentId, filter.documentId))
    }
    if (filter?.provider) {
      conditions.push(eq(calendarEvents.provider, filter.provider))
    }
    if (filter?.status) {
      conditions.push(eq(calendarEvents.status, filter.status))
    }

    if (conditions.length > 0) {
      const results = await this.db
        .select()
        .from(calendarEvents)
        .where(and(...conditions))
        .orderBy(desc(calendarEvents.createdAt))
      return results.map(mapCalendarEventToDomain)
    }

    const results = await this.db
      .select()
      .from(calendarEvents)
      .orderBy(desc(calendarEvents.createdAt))

    return results.map(mapCalendarEventToDomain)
  }

  async update(id: string, updates: Partial<NewCalendarEventRecord>): Promise<CalendarEvent> {
    const existing = await this.findById(id)
    if (!existing) {
      throw new Error(`Calendar event with id ${id} not found.`)
    }

    const now = new Date().toISOString()
    await this.db
      .update(calendarEvents)
      .set({
        ...updates,
        updatedAt: now,
      })
      .where(eq(calendarEvents.id, id))
      .run()

    const updated = await this.findById(id)
    if (!updated) {
      throw new Error(`Failed to retrieve updated calendar event ${id}`)
    }
    return updated
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(calendarEvents).where(eq(calendarEvents.id, id)).run()
  }
}
