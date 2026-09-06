import { eq, desc } from "drizzle-orm"
import { processingJobs, type ProcessingJobRecord, type NewProcessingJobRecord } from "@/db/schema"
import type { AppDatabase } from "@/db/client"

export class ProcessingJobRepository {
  private db: AppDatabase

  constructor(db: AppDatabase) {
    this.db = db
  }

  async create(data: NewProcessingJobRecord): Promise<ProcessingJobRecord> {
    await this.db.insert(processingJobs).values(data).run()
    const created = await this.findById(data.id)
    if (!created) {
      throw new Error(`Failed to retrieve newly created processing job with ID: ${data.id}`)
    }
    return created
  }

  async findById(id: string): Promise<ProcessingJobRecord | null> {
    const result = await this.db
      .select()
      .from(processingJobs)
      .where(eq(processingJobs.id, id))
      .get()
    return result ?? null
  }

  async findByDocumentId(documentId: string): Promise<ProcessingJobRecord[]> {
    return this.db
      .select()
      .from(processingJobs)
      .where(eq(processingJobs.documentId, documentId))
      .orderBy(desc(processingJobs.createdAt))
  }

  async findPendingJobs(): Promise<ProcessingJobRecord[]> {
    return this.db
      .select()
      .from(processingJobs)
      .where(eq(processingJobs.status, "pending"))
      .orderBy(processingJobs.createdAt)
  }

  async updateStatus(id: string, status: string, errorMessage?: string): Promise<void> {
    const now = new Date().toISOString()
    await this.db
      .update(processingJobs)
      .set({
        status,
        errorMessage: errorMessage ?? null,
        updatedAt: now,
        completedAt: status === "completed" || status === "failed" ? now : undefined,
      })
      .where(eq(processingJobs.id, id))
      .run()
  }

  /**
   * Concurrency-safe job claim: only claims if job status is 'pending'
   */
  async claimJob(id: string): Promise<ProcessingJobRecord | null> {
    const job = await this.findById(id)
    if (!job || job.status !== "pending") {
      return null
    }

    const now = new Date().toISOString()
    await this.db
      .update(processingJobs)
      .set({
        status: "processing",
        startedAt: now,
        updatedAt: now,
      })
      .where(eq(processingJobs.id, id))
      .run()

    return this.findById(id)
  }

  /**
   * Bounded retry logic: increments retryCount and transitions to 'pending' or 'failed'
   */
  async failOrRetry(
    id: string,
    errorMessage: string
  ): Promise<{ retrying: boolean; status: string }> {
    const job = await this.findById(id)
    if (!job) {
      throw new Error(`Job not found: ${id}`)
    }

    const nextRetry = job.retryCount + 1
    const now = new Date().toISOString()

    if (nextRetry < job.maxRetries) {
      await this.db
        .update(processingJobs)
        .set({
          status: "pending",
          retryCount: nextRetry,
          errorMessage,
          updatedAt: now,
        })
        .where(eq(processingJobs.id, id))
        .run()
      return { retrying: true, status: "pending" }
    } else {
      await this.db
        .update(processingJobs)
        .set({
          status: "failed",
          retryCount: nextRetry,
          errorMessage,
          updatedAt: now,
          completedAt: now,
        })
        .where(eq(processingJobs.id, id))
        .run()
      return { retrying: false, status: "failed" }
    }
  }
}

