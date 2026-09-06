import { drizzle, type SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy"
import * as schema from "./schema"
import { runMigrations, type MigrationExecutor } from "./migrator"
import { invoke } from "@tauri-apps/api/core"

export type AppDatabase = SqliteRemoteDatabase<typeof schema>

function isTauriEnvironment(): boolean {
  return typeof window !== "undefined" && Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
}

let dbInstance: AppDatabase | null = null
let isInitialized = false
let initPromise: Promise<AppDatabase> | null = null

export function createTauriDrizzleDb(): AppDatabase {
  return drizzle(
    async (sql: string, params: unknown[], method: "run" | "all" | "values" | "get") => {
      try {
        if (method === "run") {
          await invoke("db_execute", { sql, params: params ?? [] })
          return { rows: [] }
        }

        const rows = await invoke<unknown[][]>("db_query", {
          sql,
          params: params ?? [],
        })

        if (method === "get") {
          return { rows: (rows && rows.length > 0 ? rows[0] : undefined) as unknown[] }
        }

        return { rows: rows ?? [] }
      } catch (err) {
        console.error(`Database query failed [${method}]:`, sql, params, err)
        throw err
      }
    },
    { schema }
  )
}

/**
 * Creates an in-memory or custom executor database for testing / development
 */
export function createProxyDrizzleDb(
  callback: (sql: string, params: unknown[], method: "run" | "all" | "values" | "get") => Promise<{ rows: unknown[] }>
): AppDatabase {
  return drizzle(callback, { schema })
}

export async function initDb(customDb?: AppDatabase): Promise<AppDatabase> {
  if (customDb) {
    dbInstance = customDb
    isInitialized = true
    return dbInstance
  }

  if (dbInstance && isInitialized) {
    return dbInstance
  }

  if (initPromise) {
    return initPromise
  }

  initPromise = (async () => {
    try {
      if (isTauriEnvironment()) {
        dbInstance = createTauriDrizzleDb()

        const executor: MigrationExecutor = {
          async execute(sql: string) {
            await invoke("db_execute", { sql, params: [] })
          },
          async query<T = unknown>(sql: string): Promise<T[]> {
            const rows = await invoke<unknown[][]>("db_query", { sql, params: [] })
            return rows.map((r) => ({ name: r[0] })) as T[]
          },
        }

        await runMigrations(executor)
      } else {
        dbInstance = drizzle(
          async (_sql: string, _params: unknown[], method: "run" | "all" | "values" | "get") => {
            console.warn("Running in Web fallback mode without native Tauri SQLite.")
            if (method === "run") return { rows: [] }
            return { rows: [] }
          },
          { schema }
        )
      }

      isInitialized = true
      return dbInstance
    } finally {
      initPromise = null
    }
  })()

  return initPromise
}

export function getDb(): AppDatabase {
  if (!dbInstance) {
    if (isTauriEnvironment()) {
      dbInstance = createTauriDrizzleDb()
    } else {
      throw new Error("Database not initialized. Call initDb() first.")
    }
  }
  return dbInstance
}
