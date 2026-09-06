import { eq, and, desc, inArray } from "drizzle-orm"
import { tasks, type TaskRecord, type NewTaskRecord } from "@/db/schema"
import type { AppDatabase } from "@/db/client"
import type { TaskFilter, TaskStatus } from "@/services/tasks/types"

export class TaskRepository {
  private db: AppDatabase

  constructor(db: AppDatabase) {
    this.db = db
  }

  async findAll(filter?: TaskFilter): Promise<TaskRecord[]> {
    const conditions = []

    if (filter?.documentId) {
      conditions.push(eq(tasks.documentId, filter.documentId))
    }

    if (filter?.status) {
      if (Array.isArray(filter.status)) {
        if (filter.status.length > 0) {
          conditions.push(inArray(tasks.status, filter.status))
        }
      } else {
        conditions.push(eq(tasks.status, filter.status))
      }
    }

    if (filter?.deadlineType) {
      conditions.push(eq(tasks.deadlineType, filter.deadlineType))
    }

    if (conditions.length > 0) {
      return this.db
        .select()
        .from(tasks)
        .where(and(...conditions))
        .orderBy(desc(tasks.createdAt))
    }

    return this.db.select().from(tasks).orderBy(desc(tasks.createdAt))
  }

  async findById(id: string): Promise<TaskRecord | null> {
    const results = await this.db
      .select()
      .from(tasks)
      .where(eq(tasks.id, id))
      .limit(1)

    return results[0] ?? null
  }

  async findByDocumentId(documentId: string): Promise<TaskRecord[]> {
    return this.db
      .select()
      .from(tasks)
      .where(eq(tasks.documentId, documentId))
      .orderBy(desc(tasks.createdAt))
  }

  async findPendingByDocumentId(documentId: string): Promise<TaskRecord[]> {
    return this.db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.documentId, documentId),
          eq(tasks.status, "pending")
        )
      )
      .orderBy(desc(tasks.createdAt))
  }

  async findExistingCandidate(
    documentId: string,
    title: string,
    rawDeadline?: string | null
  ): Promise<TaskRecord | null> {
    const normTitle = title.trim().toLowerCase()
    const tasksForDoc = await this.findByDocumentId(documentId)

    const matched = tasksForDoc.find((t) => {
      const titleMatches = t.title.trim().toLowerCase() === normTitle
      if (!titleMatches) return false
      if (rawDeadline && t.rawDeadline) {
        return t.rawDeadline.trim().toLowerCase() === rawDeadline.trim().toLowerCase()
      }
      return true
    })

    return matched ?? null
  }

  async create(data: NewTaskRecord): Promise<TaskRecord> {
    const now = new Date().toISOString()
    const record: NewTaskRecord = {
      ...data,
      status: data.status || "pending",
      deadlineType: data.deadlineType || "none",
      semanticStatus: data.semanticStatus || "UNCERTAIN",
      userEdited: data.userEdited ?? 0,
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now,
    }

    await this.db.insert(tasks).values(record).run()
    const created = await this.findById(data.id)
    if (!created) {
      throw new Error(`Failed to retrieve newly created task with ID: ${data.id}`)
    }
    return created
  }

  async confirm(
    id: string,
    userEdits?: { title?: string; description?: string | null; deadlineDate?: string | null }
  ): Promise<TaskRecord> {
    const existing = await this.findById(id)
    if (!existing) {
      throw new Error(`Task with id ${id} not found.`)
    }

    const now = new Date().toISOString()
    const updateData: Partial<NewTaskRecord> = {
      status: "confirmed",
      confirmedAt: now,
      updatedAt: now,
    }

    if (userEdits) {
      let edited = false
      if (userEdits.title !== undefined && userEdits.title.trim() && userEdits.title.trim() !== existing.title) {
        updateData.title = userEdits.title.trim()
        edited = true
      }
      if (userEdits.description !== undefined && userEdits.description !== existing.description) {
        updateData.description = userEdits.description?.trim() || null
        edited = true
      }
      if (userEdits.deadlineDate !== undefined && userEdits.deadlineDate !== existing.deadlineDate) {
        updateData.deadlineDate = userEdits.deadlineDate
        if (userEdits.deadlineDate) {
          updateData.deadlineType = "exact"
        }
        edited = true
      }
      if (edited) {
        updateData.userEdited = 1
      }
    }

    await this.db
      .update(tasks)
      .set(updateData)
      .where(eq(tasks.id, id))
      .run()

    const updated = await this.findById(id)
    if (!updated) {
      throw new Error(`Failed to retrieve confirmed task with ID: ${id}`)
    }
    return updated
  }

  async reject(id: string): Promise<TaskRecord> {
    const existing = await this.findById(id)
    if (!existing) {
      throw new Error(`Task with id ${id} not found.`)
    }

    const now = new Date().toISOString()
    await this.db
      .update(tasks)
      .set({
        status: "rejected",
        rejectedAt: now,
        updatedAt: now,
      })
      .where(eq(tasks.id, id))
      .run()

    const updated = await this.findById(id)
    if (!updated) {
      throw new Error(`Failed to retrieve rejected task with ID: ${id}`)
    }
    return updated
  }

  async update(id: string, updates: Partial<NewTaskRecord>): Promise<TaskRecord> {
    const existing = await this.findById(id)
    if (!existing) {
      throw new Error(`Task with id ${id} not found.`)
    }

    const now = new Date().toISOString()
    await this.db
      .update(tasks)
      .set({
        ...updates,
        updatedAt: now,
      })
      .where(eq(tasks.id, id))
      .run()

    const updated = await this.findById(id)
    if (!updated) {
      throw new Error(`Failed to retrieve updated task with ID: ${id}`)
    }
    return updated
  }

  async updateStatus(id: string, status: TaskStatus): Promise<TaskRecord> {
    const now = new Date().toISOString()
    const updateData: Partial<NewTaskRecord> = {
      status,
      updatedAt: now,
    }

    if (status === "confirmed") updateData.confirmedAt = now
    if (status === "rejected") updateData.rejectedAt = now
    if (status === "completed") updateData.completedAt = now

    await this.db
      .update(tasks)
      .set(updateData)
      .where(eq(tasks.id, id))
      .run()

    const updated = await this.findById(id)
    if (!updated) {
      throw new Error(`Failed to retrieve task with ID: ${id}`)
    }
    return updated
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(tasks).where(eq(tasks.id, id)).run()
  }
}
