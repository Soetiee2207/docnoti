import { eq, desc, count } from "drizzle-orm"
import { documents, type DocumentRecord, type NewDocumentRecord } from "@/db/schema"
import type { AppDatabase } from "@/db/client"

export class DocumentRepository {
  private db: AppDatabase

  constructor(db: AppDatabase) {
    this.db = db
  }

  async findAll(): Promise<DocumentRecord[]> {
    return this.db.select().from(documents).orderBy(desc(documents.createdAt))
  }

  async findById(id: string): Promise<DocumentRecord | null> {
    const result = await this.db
      .select()
      .from(documents)
      .where(eq(documents.id, id))
      .get()
    return result ?? null
  }

  async findByChecksum(checksum: string): Promise<DocumentRecord | null> {
    const result = await this.db
      .select()
      .from(documents)
      .where(eq(documents.checksum, checksum))
      .get()
    return result ?? null
  }

  async create(data: NewDocumentRecord): Promise<DocumentRecord> {
    await this.db.insert(documents).values(data).run()
    const created = await this.findById(data.id)
    if (!created) {
      throw new Error(`Failed to retrieve newly created document with ID: ${data.id}`)
    }
    return created
  }

  async updateStatus(id: string, status: string): Promise<void> {
    const now = new Date().toISOString()
    await this.db
      .update(documents)
      .set({ status, updatedAt: now })
      .where(eq(documents.id, id))
      .run()
  }

  async count(): Promise<number> {
    const result = await this.db.select({ value: count() }).from(documents).get()
    return result?.value ?? 0
  }
}
