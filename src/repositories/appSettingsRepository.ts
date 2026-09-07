import { eq } from "drizzle-orm"
import { appSettings, type AppSettingRecord } from "@/db/schema"
import type { AppDatabase } from "@/db/client"

export class AppSettingsRepository {
  private db: AppDatabase

  constructor(db: AppDatabase) {
    this.db = db
  }

  async get(key: string): Promise<string | null> {
    const results = await this.db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, key))
      .limit(1)

    if (results.length === 0) return null
    return results[0].value
  }

  async getBoolean(key: string, defaultValue = false): Promise<boolean> {
    const val = await this.get(key)
    if (val === null) return defaultValue
    return val === "true" || val === "1"
  }

  async set(key: string, value: string): Promise<void> {
    const now = new Date().toISOString()
    const existing = await this.get(key)

    if (existing !== null) {
      await this.db
        .update(appSettings)
        .set({
          value,
          updatedAt: now,
        })
        .where(eq(appSettings.key, key))
        .run()
    } else {
      await this.db
        .insert(appSettings)
        .values({
          key,
          value,
          updatedAt: now,
        })
        .run()
    }
  }

  async setBoolean(key: string, value: boolean): Promise<void> {
    await this.set(key, value ? "true" : "false")
  }

  async delete(key: string): Promise<void> {
    await this.db.delete(appSettings).where(eq(appSettings.key, key)).run()
  }

  async getAll(): Promise<AppSettingRecord[]> {
    return this.db.select().from(appSettings)
  }
}
