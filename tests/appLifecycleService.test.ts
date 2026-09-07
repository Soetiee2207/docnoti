import { describe, it, expect, beforeEach, vi } from "vitest"
import { DatabaseSync } from "node:sqlite"
import { createProxyDrizzleDb } from "@/db/client"
import { runMigrations, type MigrationExecutor } from "@/db/migrator"
import { AppSettingsRepository } from "@/repositories/appSettingsRepository"
import { AutostartService } from "@/services/lifecycle/autostartService"
import { AppLifecycleService } from "@/services/lifecycle/appLifecycleService"
import type { AutostartBridge } from "@/services/lifecycle/types"
import type { ReminderScheduler } from "@/services/notification/reminderScheduler"
import type { DocumentWorker } from "@/services/worker/documentWorker"

function createTestContext() {
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

  return { sqlite, executor, db }
}

describe("AppLifecycleService", () => {
  let settingsRepo: AppSettingsRepository
  let autostartService: AutostartService
  let mockBridge: AutostartBridge
  let mockScheduler: ReminderScheduler
  let mockWorker: DocumentWorker
  let lifecycleService: AppLifecycleService

  let schedulerRunning = false
  let workerRunning = false

  beforeEach(async () => {
    const ctx = createTestContext()
    await runMigrations(ctx.executor)
    settingsRepo = new AppSettingsRepository(ctx.db)

    mockBridge = {
      getAutostartStatus: vi.fn(async () => false),
      setAutostartStatus: vi.fn(async (en) => en),
    }

    autostartService = new AutostartService(settingsRepo, mockBridge)

    schedulerRunning = false
    workerRunning = false

    mockScheduler = {
      start: vi.fn(async () => {
        schedulerRunning = true
      }),
      stop: vi.fn(() => {
        schedulerRunning = false
      }),
      isRunning: vi.fn(() => schedulerRunning),
    } as unknown as ReminderScheduler

    mockWorker = {
      startBackground: vi.fn(() => {
        workerRunning = true
      }),
      stopBackground: vi.fn(() => {
        workerRunning = false
      }),
      isBackgroundRunning: vi.fn(() => workerRunning),
    } as unknown as DocumentWorker

    lifecycleService = new AppLifecycleService(
      autostartService,
      mockScheduler,
      mockWorker
    )
  })

  it("starts daemon services and performs startup synchronization", async () => {
    expect(lifecycleService.isDaemonRunning()).toBe(false)

    const started = await lifecycleService.startDaemon()
    expect(started).toBe(true)
    expect(lifecycleService.isDaemonRunning()).toBe(true)

    expect(mockScheduler.start).toHaveBeenCalledTimes(1)
    expect(mockWorker.startBackground).toHaveBeenCalledTimes(1)
  })

  it("prevents duplicate service initialization (singleton guard)", async () => {
    const firstStart = await lifecycleService.startDaemon()
    expect(firstStart).toBe(true)

    // Call startDaemon again (e.g. when main window re-opens or re-mounts)
    const secondStart = await lifecycleService.startDaemon()
    expect(secondStart).toBe(false)

    // Ensure scheduler and worker start methods were called EXACTLY once
    expect(mockScheduler.start).toHaveBeenCalledTimes(1)
    expect(mockWorker.startBackground).toHaveBeenCalledTimes(1)
  })

  it("stops daemon services cleanly", async () => {
    await lifecycleService.startDaemon()
    expect(lifecycleService.isDaemonRunning()).toBe(true)

    await lifecycleService.stopDaemon()
    expect(lifecycleService.isDaemonRunning()).toBe(false)
    expect(mockScheduler.stop).toHaveBeenCalledTimes(1)
    expect(mockWorker.stopBackground).toHaveBeenCalledTimes(1)
  })

  it("returns comprehensive daemon health and status", async () => {
    await autostartService.setEnabled(true)
    await lifecycleService.startDaemon()

    const status = await lifecycleService.getStatus()
    expect(status).toEqual({
      running: true,
      autostartEnabled: true,
      schedulerActive: true,
      workerActive: true,
    })

    await lifecycleService.stopDaemon()
    const stoppedStatus = await lifecycleService.getStatus()
    expect(stoppedStatus).toEqual({
      running: false,
      autostartEnabled: true,
      schedulerActive: false,
      workerActive: false,
    })
  })

  it("gracefully stops services on exitApp", async () => {
    await lifecycleService.startDaemon()
    await lifecycleService.exitApp()

    expect(mockScheduler.stop).toHaveBeenCalledTimes(1)
    expect(mockWorker.stopBackground).toHaveBeenCalledTimes(1)
    expect(lifecycleService.isDaemonRunning()).toBe(false)
  })
})
