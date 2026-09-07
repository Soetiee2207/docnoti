import { describe, it, expect, beforeEach } from "vitest"
import { DatabaseSync } from "node:sqlite"
import { createProxyDrizzleDb } from "@/db/client"
import { runMigrations, type MigrationExecutor } from "@/db/migrator"
import { AppSettingsRepository } from "@/repositories/appSettingsRepository"

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

describe("AppSettingsRepository", () => {
  let repo: AppSettingsRepository

  beforeEach(async () => {
    const ctx = createTestContext()
    await runMigrations(ctx.executor)
    repo = new AppSettingsRepository(ctx.db)
  })

  it("returns null or fallback for non-existent key", async () => {
    const val = await repo.get("non_existent_key")
    expect(val).toBeNull()

    const boolVal = await repo.getBoolean("non_existent_key", false)
    expect(boolVal).toBe(false)

    const boolFallback = await repo.getBoolean("non_existent_key", true)
    expect(boolFallback).toBe(true)
  })

  it("stores and retrieves string settings", async () => {
    await repo.set("theme", "dark")
    const val = await repo.get("theme")
    expect(val).toBe("dark")
  })

  it("updates existing setting on subsequent set (upsert)", async () => {
    await repo.set("theme", "dark")
    await repo.set("theme", "light")
    const val = await repo.get("theme")
    expect(val).toBe("light")
  })

  it("stores and retrieves boolean settings", async () => {
    await repo.setBoolean("windows.autostart.enabled", true)
    let boolVal = await repo.getBoolean("windows.autostart.enabled")
    expect(boolVal).toBe(true)

    await repo.setBoolean("windows.autostart.enabled", false)
    boolVal = await repo.getBoolean("windows.autostart.enabled")
    expect(boolVal).toBe(false)
  })

  it("deletes a setting by key", async () => {
    await repo.set("temp_key", "value")
    expect(await repo.get("temp_key")).toBe("value")

    await repo.delete("temp_key")
    expect(await repo.get("temp_key")).toBeNull()
  })

  it("lists all stored settings", async () => {
    await repo.set("k1", "v1")
    await repo.set("k2", "v2")

    const all = await repo.getAll()
    expect(all).toHaveLength(2)
    expect(all.find((s) => s.key === "k1")?.value).toBe("v1")
    expect(all.find((s) => s.key === "k2")?.value).toBe("v2")
  })
})
