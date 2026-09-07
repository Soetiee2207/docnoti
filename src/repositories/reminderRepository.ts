import { eq, and, lte, desc, asc } from "drizzle-orm"
import { reminders, type ReminderRecord, type NewReminderRecord } from "@/db/schema"
import type { AppDatabase } from "@/db/client"
import type { ReminderItem, ReminderStatus, ReminderType } from "@/services/notification/types"

export function mapReminderRecordToDomain(record: ReminderRecord): ReminderItem {
  return {
    id: record.id,
    taskId: record.taskId,
    documentId: record.documentId,
    provider: record.provider,
    reminderType: record.reminderType as ReminderType,
    scheduledAt: record.scheduledAt,
    status: record.status as ReminderStatus,
    deliveredAt: record.deliveredAt,
    cancelledAt: record.cancelledAt,
    notificationId: record.notificationId,
    idempotencyKey: record.idempotencyKey,
    error: record.error,
    retryCount: record.retryCount,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

export class ReminderRepository {
  private db: AppDatabase

  constructor(db: AppDatabase) {
    this.db = db
  }

  async create(record: NewReminderRecord): Promise<ReminderItem> {
    await this.db.insert(reminders).values(record).run()
    const found = await this.findById(record.id)
    if (!found) {
      throw new Error(`Failed to retrieve newly created reminder ${record.id}`)
    }
    return found
  }

  async findById(id: string): Promise<ReminderItem | null> {
    const results = await this.db
      .select()
      .from(reminders)
      .where(eq(reminders.id, id))
      .limit(1)

    if (results.length === 0) return null
    return mapReminderRecordToDomain(results[0])
  }

  async findByIdempotencyKey(key: string): Promise<ReminderItem | null> {
    const results = await this.db
      .select()
      .from(reminders)
      .where(eq(reminders.idempotencyKey, key))
      .limit(1)

    if (results.length === 0) return null
    return mapReminderRecordToDomain(results[0])
  }

  async findByTaskId(taskId: string): Promise<ReminderItem[]> {
    const results = await this.db
      .select()
      .from(reminders)
      .where(eq(reminders.taskId, taskId))
      .orderBy(asc(reminders.scheduledAt))

    return results.map(mapReminderRecordToDomain)
  }

  async findByDocumentId(documentId: string): Promise<ReminderItem[]> {
    const results = await this.db
      .select()
      .from(reminders)
      .where(eq(reminders.documentId, documentId))
      .orderBy(desc(reminders.createdAt))

    return results.map(mapReminderRecordToDomain)
  }

  async findDuePendingReminders(nowIso: string): Promise<ReminderItem[]> {
    const results = await this.db
      .select()
      .from(reminders)
      .where(and(eq(reminders.status, "pending"), lte(reminders.scheduledAt, nowIso)))
      .orderBy(asc(reminders.scheduledAt))

    return results.map(mapReminderRecordToDomain)
  }

  async update(id: string, updates: Partial<NewReminderRecord>): Promise<ReminderItem> {
    const existing = await this.findById(id)
    if (!existing) {
      throw new Error(`Reminder with id ${id} not found.`)
    }

    const now = new Date().toISOString()
    await this.db
      .update(reminders)
      .set({
        ...updates,
        updatedAt: now,
      })
      .where(eq(reminders.id, id))
      .run()

    const updated = await this.findById(id)
    if (!updated) {
      throw new Error(`Failed to retrieve updated reminder ${id}`)
    }
    return updated
  }

  async markDelivered(id: string, notificationId?: string): Promise<ReminderItem> {
    const now = new Date().toISOString()
    return this.update(id, {
      status: "delivered",
      deliveredAt: now,
      notificationId: notificationId ?? null,
      error: null,
    })
  }

  async markFailed(id: string, error: string, retryCount: number): Promise<ReminderItem> {
    return this.update(id, {
      status: "failed",
      error,
      retryCount,
    })
  }

  async cancelPendingForTask(taskId: string): Promise<void> {
    const now = new Date().toISOString()
    await this.db
      .update(reminders)
      .set({
        status: "cancelled",
        cancelledAt: now,
        updatedAt: now,
      })
      .where(and(eq(reminders.taskId, taskId), eq(reminders.status, "pending")))
      .run()
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(reminders).where(eq(reminders.id, id)).run()
  }
}
