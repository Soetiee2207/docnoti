import { eq, desc, and } from "drizzle-orm"
import { processingJobs, type ProcessingJobRecord, type NewProcessingJobRecord } from "@/db/schema"
import type { AppDatabase } from "@/db/client"

export interface StaleJobRecoveryResult {
  recovered: number
  failed: number
  recoveredJobs: ProcessingJobRecord[]
}

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
    const isTerminal = status === "completed" || status === "failed"

    await this.db
      .update(processingJobs)
      .set({
        status,
        errorMessage: errorMessage ?? null,
        updatedAt: now,
        completedAt: isTerminal ? now : undefined,
        lockedBy: isTerminal ? null : undefined,
        lockedAt: isTerminal ? null : undefined,
        heartbeatAt: isTerminal ? null : undefined,
        leaseExpiresAt: isTerminal ? null : undefined,
      })
      .where(eq(processingJobs.id, id))
      .run()
  }

  /**
   * Concurrency-safe atomic job claim.
   * Directly executes an atomic conditional UPDATE with RETURNING clause:
   * UPDATE processing_jobs SET ... WHERE id = :id AND status = 'pending' RETURNING *;
   * Guarantees that only one worker can successfully claim a given job without race conditions.
   */
  async claimJob(
    id: string,
    workerId = "default-worker",
    leaseDurationMs = 5 * 60 * 1000
  ): Promise<ProcessingJobRecord | null> {
    const now = new Date()
    const nowIso = now.toISOString()
    const leaseExpiresIso = new Date(now.getTime() + leaseDurationMs).toISOString()

    const claimed = await this.db
      .update(processingJobs)
      .set({
        status: "processing",
        startedAt: nowIso,
        updatedAt: nowIso,
        lockedBy: workerId,
        lockedAt: nowIso,
        heartbeatAt: nowIso,
        leaseExpiresAt: leaseExpiresIso,
      })
      .where(
        and(
          eq(processingJobs.id, id),
          eq(processingJobs.status, "pending")
        )
      )
      .returning()

    return claimed[0] ?? null
  }

  /**
   * Heartbeat to extend lease for active long-running jobs (e.g. large OCR, embeddings, LLM analysis).
   */
  async heartbeat(
    id: string,
    workerId: string,
    extensionMs = 5 * 60 * 1000
  ): Promise<boolean> {
    const now = new Date()
    const nowIso = now.toISOString()
    const leaseExpiresIso = new Date(now.getTime() + extensionMs).toISOString()

    const updated = await this.db
      .update(processingJobs)
      .set({
        heartbeatAt: nowIso,
        leaseExpiresAt: leaseExpiresIso,
        updatedAt: nowIso,
      })
      .where(
        and(
          eq(processingJobs.id, id),
          eq(processingJobs.status, "processing"),
          eq(processingJobs.lockedBy, workerId)
        )
      )
      .returning()

    return updated.length > 0
  }

  /**
   * Crash recovery for stale jobs.
   * Identifies jobs stuck in 'processing' where lease has expired (or cutoff exceeded).
   * Fresh jobs with active leases are NOT recovered.
   * Bounded retries: requeues to 'pending' if retryCount + 1 < maxRetries; otherwise marks 'failed'.
   */
  async recoverStaleJobs(
    staleThresholdMs = 5 * 60 * 1000
  ): Promise<StaleJobRecoveryResult> {
    const now = new Date()
    const nowIso = now.toISOString()
    const cutoffIso = new Date(now.getTime() - staleThresholdMs).toISOString()

    const allProcessing = await this.db
      .select()
      .from(processingJobs)
      .where(eq(processingJobs.status, "processing"))

    const staleJobs = allProcessing.filter((job) => {
      if (job.leaseExpiresAt) {
        return job.leaseExpiresAt <= nowIso
      }
      return job.updatedAt <= cutoffIso
    })

    let recovered = 0
    let failed = 0
    const recoveredJobs: ProcessingJobRecord[] = []

    for (const job of staleJobs) {
      const nextRetry = job.retryCount + 1
      const errorMsg = job.errorMessage
        ? `${job.errorMessage} | Quá hạn xử lý (stale lease recovered)`
        : "Tiến trình bị gián đoạn (stale lease recovered)"

      if (nextRetry < job.maxRetries) {
        const [updated] = await this.db
          .update(processingJobs)
          .set({
            status: "pending",
            retryCount: nextRetry,
            errorMessage: errorMsg,
            updatedAt: nowIso,
            lockedBy: null,
            lockedAt: null,
            heartbeatAt: null,
            leaseExpiresAt: null,
          })
          .where(
            and(
              eq(processingJobs.id, job.id),
              eq(processingJobs.status, "processing")
            )
          )
          .returning()

        if (updated) {
          recovered++
          recoveredJobs.push(updated)
        }
      } else {
        const [updated] = await this.db
          .update(processingJobs)
          .set({
            status: "failed",
            retryCount: nextRetry,
            errorMessage: "Đạt giới hạn số lần thử lại tối đa sau khi tiến trình bị gián đoạn",
            updatedAt: nowIso,
            completedAt: nowIso,
            lockedBy: null,
            lockedAt: null,
            heartbeatAt: null,
            leaseExpiresAt: null,
          })
          .where(
            and(
              eq(processingJobs.id, job.id),
              eq(processingJobs.status, "processing")
            )
          )
          .returning()

        if (updated) {
          failed++
          recoveredJobs.push(updated)
        }
      }
    }

    return { recovered, failed, recoveredJobs }
  }

  /**
   * Bounded retry logic: increments retryCount and transitions to 'pending' or 'failed',
   * releasing any worker locks.
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
          lockedBy: null,
          lockedAt: null,
          heartbeatAt: null,
          leaseExpiresAt: null,
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
          lockedBy: null,
          lockedAt: null,
          heartbeatAt: null,
          leaseExpiresAt: null,
        })
        .where(eq(processingJobs.id, id))
        .run()
      return { retrying: false, status: "failed" }
    }
  }
}
