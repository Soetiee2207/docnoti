import { eq, desc, count, sql } from "drizzle-orm"
import {
  documents,
  documentPages,
  documentChunks,
  documentChunkEmbeddings,
  documentAnalyses,
  tasks,
  processingJobs,
  calendarEvents,
  reminders,
  type DocumentRecord,
  type NewDocumentRecord,
} from "@/db/schema"
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

  /**
   * Deletes a document and all associated database records in full cascade order.
   * Safe and idempotent: returns false if the document does not exist.
   */
  async delete(id: string): Promise<boolean> {
    const doc = await this.findById(id)
    if (!doc) {
      return false
    }

    // 1. reminders (referencing document_id and task_id)
    await this.db.delete(reminders).where(eq(reminders.documentId, id)).run()

    // 2. calendar_events (referencing document_id and task_id)
    await this.db.delete(calendarEvents).where(eq(calendarEvents.documentId, id)).run()

    // 3. tasks (referencing document_id and analysis_id)
    await this.db.delete(tasks).where(eq(tasks.documentId, id)).run()

    // 4. document_chunk_embeddings (referencing document_id and chunk_id)
    await this.db.delete(documentChunkEmbeddings).where(eq(documentChunkEmbeddings.documentId, id)).run()

    // 5. FTS5 entries for chunks of this document
    try {
      await this.db.run(sql`DELETE FROM document_chunks_fts WHERE document_id = ${id}`)
    } catch {
      // FTS5 table may not exist in certain mock environments; trigger or error ignored
    }

    // 6. document_chunks (referencing document_id)
    await this.db.delete(documentChunks).where(eq(documentChunks.documentId, id)).run()

    // 7. document_analyses (referencing document_id)
    await this.db.delete(documentAnalyses).where(eq(documentAnalyses.documentId, id)).run()

    // 8. document_pages (referencing document_id)
    await this.db.delete(documentPages).where(eq(documentPages.documentId, id)).run()

    // 9. processing_jobs (referencing document_id)
    await this.db.delete(processingJobs).where(eq(processingJobs.documentId, id)).run()

    // 10. documents record itself
    await this.db.delete(documents).where(eq(documents.id, id)).run()

    return true
  }
}

