import { describe, it, expect, vi } from "vitest"
import { DatabaseSync } from "node:sqlite"
import { eq } from "drizzle-orm"
import { processingJobs } from "@/db/schema"
import { createProxyDrizzleDb } from "@/db/client"
import { runMigrations, type MigrationExecutor } from "@/db/migrator"
import { DocumentRepository } from "@/repositories/documentRepository"
import { ProcessingJobRepository } from "@/repositories/processingJobRepository"
import { DocumentPageRepository } from "@/repositories/documentPageRepository"
import { AppSettingsRepository } from "@/repositories/appSettingsRepository"
import { ReminderRepository } from "@/repositories/reminderRepository"
import { TaskRepository } from "@/repositories/taskRepository"
import { InMemoryStorageService } from "@/services/storage"
import { DocumentIngestionService } from "@/services/ingestionService"
import { DocumentWorker } from "@/services/worker/documentWorker"
import { PdfJsProcessor } from "@/services/pdf/pdfJsProcessor"
import { AutostartService } from "@/services/lifecycle/autostartService"
import { AppLifecycleService } from "@/services/lifecycle/appLifecycleService"
import { ReminderScheduler } from "@/services/notification/reminderScheduler"
import { createValidTextPdf } from "./fixtures/samplePdfs"

function createHardeningTestContext() {
  const sqlite = new DatabaseSync(":memory:")

  const executor: MigrationExecutor = {
    async execute(sql: string) {
      sqlite.exec(sql)
    },
    async query<T = unknown>(sql: string): Promise<T[]> {
      const stmt = sqlite.prepare(sql)
      return stmt.all() as T[]
    },
  }

  const db = createProxyDrizzleDb(async (sql, params, method) => {
    const stmt = sqlite.prepare(sql)
    if (method === "run") {
      stmt.run(...(params as (string | number | bigint | null)[]))
      return { rows: [] }
    }

    stmt.setReturnArrays(true)
    if (method === "get") {
      const row = stmt.get(...(params as (string | number | bigint | null)[]))
      return { rows: (row ?? undefined) as unknown[] }
    }

    const rows = stmt.all(...(params as (string | number | bigint | null)[]))
    return { rows }
  })

  const documentRepo = new DocumentRepository(db)
  const jobRepo = new ProcessingJobRepository(db)
  const pageRepo = new DocumentPageRepository(db)
  const settingsRepo = new AppSettingsRepository(db)
  const reminderRepo = new ReminderRepository(db)
  const taskRepo = new TaskRepository(db)

  const storageService = new InMemoryStorageService()
  const pdfProcessor = new PdfJsProcessor({ minCharsPerPage: 20 })

  const ingestionService = new DocumentIngestionService(
    documentRepo,
    jobRepo,
    storageService
  )

  const worker = new DocumentWorker(
    documentRepo,
    jobRepo,
    pageRepo,
    storageService,
    pdfProcessor,
    undefined,
    undefined,
    false,
    undefined,
    undefined,
    undefined,
    { workerId: "worker-alpha", leaseDurationMs: 60000, heartbeatIntervalMs: 10000 }
  )

  return {
    sqlite,
    executor,
    db,
    documentRepo,
    jobRepo,
    pageRepo,
    settingsRepo,
    reminderRepo,
    taskRepo,
    storageService,
    pdfProcessor,
    ingestionService,
    worker,
  }
}

describe("ProcessingJob Lifecycle & Worker Hardening", () => {
  it("atomically claims a job with worker lease and timestamp information", async () => {
    const ctx = createHardeningTestContext()
    await runMigrations(ctx.executor)

    const { job } = await ctx.ingestionService.ingestDocument("C:/doc1.pdf")
    expect(job.status).toBe("pending")

    const claimed = await ctx.jobRepo.claimJob(job.id, "worker-1", 60000)
    expect(claimed).not.toBeNull()
    expect(claimed?.status).toBe("processing")
    expect(claimed?.lockedBy).toBe("worker-1")
    expect(claimed?.lockedAt).toBeDefined()
    expect(claimed?.heartbeatAt).toBeDefined()
    expect(claimed?.leaseExpiresAt).toBeDefined()

    // Second claim attempt while still processing must return null
    const secondClaim = await ctx.jobRepo.claimJob(job.id, "worker-2", 60000)
    expect(secondClaim).toBeNull()
  })

  it("ensures that under concurrent claims only one worker wins", async () => {
    const ctx = createHardeningTestContext()
    await runMigrations(ctx.executor)

    const { job } = await ctx.ingestionService.ingestDocument("C:/concurrent.pdf")

    // Create two separate repository instances operating on the same underlying database
    const repoA = new ProcessingJobRepository(ctx.db)
    const repoB = new ProcessingJobRepository(ctx.db)

    // Simulate concurrent claim
    const [claimA, claimB] = await Promise.all([
      repoA.claimJob(job.id, "worker-A", 60000),
      repoB.claimJob(job.id, "worker-B", 60000),
    ])

    const winners = [claimA, claimB].filter((c) => c !== null)
    expect(winners).toHaveLength(1)

    const winnerWorker = winners[0]?.lockedBy
    expect(winnerWorker === "worker-A" || winnerWorker === "worker-B").toBe(true)

    // Verify persisted state in database reflects the sole winner
    const persisted = await ctx.jobRepo.findById(job.id)
    expect(persisted?.status).toBe("processing")
    expect(persisted?.lockedBy).toBe(winnerWorker)
  })

  it("does not recover a fresh processing job whose lease is still active", async () => {
    const ctx = createHardeningTestContext()
    await runMigrations(ctx.executor)

    const { job } = await ctx.ingestionService.ingestDocument("C:/fresh.pdf")
    await ctx.jobRepo.claimJob(job.id, "worker-active", 300000) // 5 minutes in future

    const recoveryResult = await ctx.jobRepo.recoverStaleJobs(300000)
    expect(recoveryResult.recovered).toBe(0)
    expect(recoveryResult.failed).toBe(0)

    const checkJob = await ctx.jobRepo.findById(job.id)
    expect(checkJob?.status).toBe("processing")
    expect(checkJob?.lockedBy).toBe("worker-active")
  })

  it("recovers a stale processing job whose lease has expired, requeuing it as pending", async () => {
    const ctx = createHardeningTestContext()
    await runMigrations(ctx.executor)

    const { job } = await ctx.ingestionService.ingestDocument("C:/stale.pdf")

    // Manually simulate a crashed worker by inserting an expired lease
    await ctx.jobRepo.claimJob(job.id, "dead-worker", -50000) // expired 50s ago

    const recoveryResult = await ctx.jobRepo.recoverStaleJobs(30000)
    expect(recoveryResult.recovered).toBe(1)
    expect(recoveryResult.failed).toBe(0)

    const recovered = await ctx.jobRepo.findById(job.id)
    expect(recovered?.status).toBe("pending")
    expect(recovered?.retryCount).toBe(1)
    expect(recovered?.lockedBy).toBeNull()
    expect(recovered?.lockedAt).toBeNull()
    expect(recovered?.heartbeatAt).toBeNull()
    expect(recovered?.leaseExpiresAt).toBeNull()
    expect(recovered?.errorMessage).toContain("stale lease recovered")
  })

  it("marks a stale job as failed when maxRetries is reached", async () => {
    const ctx = createHardeningTestContext()
    await runMigrations(ctx.executor)

    const { job } = await ctx.ingestionService.ingestDocument("C:/max_retries.pdf")

    // Claim and simulate max retries reached
    await ctx.jobRepo.claimJob(job.id, "dead-worker", -10000)
    // Manually set retryCount to 2 with maxRetries = 3
    await ctx.db
      .update(processingJobs)
      .set({ retryCount: 2, maxRetries: 3 })
      .where(eq(processingJobs.id, job.id))
      .run()

    const recoveryResult = await ctx.jobRepo.recoverStaleJobs(1000)
    expect(recoveryResult.recovered).toBe(0)
    expect(recoveryResult.failed).toBe(1)

    const finalJob = await ctx.jobRepo.findById(job.id)
    expect(finalJob?.status).toBe("failed")
    expect(finalJob?.retryCount).toBe(3)
    expect(finalJob?.completedAt).toBeDefined()
    expect(finalJob?.lockedBy).toBeNull()
  })

  it("heartbeat successfully extends lease for the owning worker only", async () => {
    const ctx = createHardeningTestContext()
    await runMigrations(ctx.executor)

    const { job } = await ctx.ingestionService.ingestDocument("C:/heartbeat.pdf")
    await ctx.jobRepo.claimJob(job.id, "worker-owner", 10000)

    const initial = await ctx.jobRepo.findById(job.id)
    const initialExpires = initial?.leaseExpiresAt

    // Owner heartbeats with 60s extension
    const ownerRenewed = await ctx.jobRepo.heartbeat(job.id, "worker-owner", 60000)
    expect(ownerRenewed).toBe(true)

    const updated = await ctx.jobRepo.findById(job.id)
    expect(updated?.leaseExpiresAt).not.toBe(initialExpires)

    // Non-owner cannot heartbeat
    const intruderRenewed = await ctx.jobRepo.heartbeat(job.id, "worker-intruder", 60000)
    expect(intruderRenewed).toBe(false)
  })

  it("survives crash after claim and allows worker restart to complete the job", async () => {
    const ctx = createHardeningTestContext()
    await runMigrations(ctx.executor)

    const { document, job } = await ctx.ingestionService.ingestDocument("C:/restart_test.pdf")
    ctx.storageService.setFileBuffer(document.storagePath, createValidTextPdf())

    // 1. Worker 1 claims job but crashes before finishing
    await ctx.jobRepo.claimJob(job.id, "crashed-worker", -5000) // expired lease

    // 2. Worker 2 (new process/instance) starts up and recovers stale jobs
    const newWorker = new DocumentWorker(
      ctx.documentRepo,
      ctx.jobRepo,
      ctx.pageRepo,
      ctx.storageService,
      ctx.pdfProcessor,
      undefined,
      undefined,
      false,
      undefined,
      undefined,
      undefined,
      { workerId: "worker-beta" }
    )

    const recovery = await newWorker.recoverStaleJobs()
    expect(recovery.recovered).toBe(1)

    // 3. New worker processes pending queue and finishes job
    const results = await newWorker.processPendingJobs()
    expect(results).toHaveLength(1)
    expect(results[0].success).toBe(true)

    const finishedJob = await ctx.jobRepo.findById(job.id)
    expect(finishedJob?.status).toBe("completed")
    expect(finishedJob?.completedAt).toBeDefined()
  })

  it("worker startBackground and stopBackground are idempotent and clean", async () => {
    const ctx = createHardeningTestContext()
    await runMigrations(ctx.executor)

    expect(ctx.worker.isBackgroundRunning()).toBe(false)

    ctx.worker.startBackground(50000)
    expect(ctx.worker.isBackgroundRunning()).toBe(true)

    // Starting again is a no-op (does not create duplicate timers)
    ctx.worker.startBackground(50000)
    expect(ctx.worker.isBackgroundRunning()).toBe(true)

    ctx.worker.stopBackground()
    expect(ctx.worker.isBackgroundRunning()).toBe(false)

    // Stopping again is safe
    ctx.worker.stopBackground()
    expect(ctx.worker.isBackgroundRunning()).toBe(false)
  })

  it("AppLifecycleService startDaemon executes stale job recovery during startup", async () => {
    const ctx = createHardeningTestContext()
    await runMigrations(ctx.executor)

    const autostartService = new AutostartService(ctx.settingsRepo, {
      getAutostartStatus: vi.fn(async () => false),
      setAutostartStatus: vi.fn(async () => true),
    })

    const mockScheduler = {
      start: vi.fn(async () => {}),
      stop: vi.fn(() => {}),
      isRunning: vi.fn(() => true),
    } as unknown as ReminderScheduler

    const recoverSpy = vi.spyOn(ctx.worker, "recoverStaleJobs")
    const startBgSpy = vi.spyOn(ctx.worker, "startBackground")

    const lifecycleService = new AppLifecycleService(
      autostartService,
      mockScheduler,
      ctx.worker
    )

    const started = await lifecycleService.startDaemon()
    expect(started).toBe(true)

    expect(recoverSpy).toHaveBeenCalledTimes(1)
    expect(startBgSpy).toHaveBeenCalledTimes(1)
    expect(mockScheduler.start).toHaveBeenCalledTimes(1)

    await lifecycleService.stopDaemon()
    expect(lifecycleService.isDaemonRunning()).toBe(false)
  })

  it("pipeline idempotency: retrying PDF processing overwrites pages cleanly without duplicates", async () => {
    const ctx = createHardeningTestContext()
    await runMigrations(ctx.executor)

    const { document, job } = await ctx.ingestionService.ingestDocument("C:/idempotent_test.pdf")
    ctx.storageService.setFileBuffer(document.storagePath, createValidTextPdf())

    // First run
    const res1 = await ctx.worker.processJob(job.id)
    expect(res1.success).toBe(true)

    const pages1 = await ctx.pageRepo.findByDocumentId(document.id)
    expect(pages1.length).toBeGreaterThan(0)

    // Reset job to pending to simulate retry
    await ctx.jobRepo.updateStatus(job.id, "pending")

    // Second run
    const res2 = await ctx.worker.processJob(job.id)
    expect(res2.success).toBe(true)

    const pages2 = await ctx.pageRepo.findByDocumentId(document.id)
    // Page count must remain identical, no duplicated rows
    expect(pages2.length).toBe(pages1.length)
  })
})
