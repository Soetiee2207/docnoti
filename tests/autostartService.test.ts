import { describe, it, expect, beforeEach, vi } from "vitest"
import { DatabaseSync } from "node:sqlite"
import { createProxyDrizzleDb } from "@/db/client"
import { runMigrations, type MigrationExecutor } from "@/db/migrator"
import { AppSettingsRepository } from "@/repositories/appSettingsRepository"
import { AutostartService } from "@/services/lifecycle/autostartService"
import { AUTOSTART_SETTING_KEY, type AutostartBridge } from "@/services/lifecycle/types"

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

describe("AutostartService", () => {
  let settingsRepo: AppSettingsRepository
  let mockBridge: AutostartBridge
  let autostartService: AutostartService
  let bridgeStatus = false

  beforeEach(async () => {
    const ctx = createTestContext()
    await runMigrations(ctx.executor)
    settingsRepo = new AppSettingsRepository(ctx.db)

    bridgeStatus = false
    mockBridge = {
      getAutostartStatus: vi.fn(async () => bridgeStatus),
      setAutostartStatus: vi.fn(async (enabled: boolean) => {
        bridgeStatus = enabled
        return enabled
      }),
    }

    autostartService = new AutostartService(settingsRepo, mockBridge)
  })

  it("is disabled by default (strictly opt-in)", async () => {
    const enabled = await autostartService.isEnabled()
    expect(enabled).toBe(false)
    // No database record initially
    const rawVal = await settingsRepo.get(AUTOSTART_SETTING_KEY)
    expect(rawVal).toBeNull()
  })

  it("persists preference and synchronizes with native bridge when enabled", async () => {
    const res = await autostartService.setEnabled(true)
    expect(res).toBe(true)

    expect(await autostartService.isEnabled()).toBe(true)
    expect(mockBridge.setAutostartStatus).toHaveBeenCalledWith(true)
    expect(bridgeStatus).toBe(true)

    const rawVal = await settingsRepo.get(AUTOSTART_SETTING_KEY)
    expect(rawVal).toBe("true")
  })

  it("persists preference and removes from native bridge when disabled", async () => {
    await autostartService.setEnabled(true)
    expect(await autostartService.isEnabled()).toBe(true)

    const res = await autostartService.setEnabled(false)
    expect(res).toBe(false)

    expect(await autostartService.isEnabled()).toBe(false)
    expect(mockBridge.setAutostartStatus).toHaveBeenCalledWith(false)
    expect(bridgeStatus).toBe(false)

    const rawVal = await settingsRepo.get(AUTOSTART_SETTING_KEY)
    expect(rawVal).toBe("false")
  })

  it("syncOnStartup does not enable autostart if user never opted in", async () => {
    await autostartService.syncOnStartup()
    expect(mockBridge.setAutostartStatus).not.toHaveBeenCalled()
  })

  it("syncOnStartup re-syncs native bridge if user had opted in", async () => {
    await autostartService.setEnabled(true)
    vi.clearAllMocks()

    await autostartService.syncOnStartup()
    expect(mockBridge.setAutostartStatus).toHaveBeenCalledWith(true)
  })
})
