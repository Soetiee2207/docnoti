import { eq, and, asc, count } from "drizzle-orm"
import {
  documentChunks,
  type DocumentChunkRecord,
  type NewDocumentChunkRecord,
} from "@/db/schema"
import type { AppDatabase } from "@/db/client"

export class DocumentChunkRepository {
  private db: AppDatabase

  constructor(db: AppDatabase) {
    this.db = db
  }

  /**
   * Retrieves all chunks for a document ordered deterministically by chunk_index.
   */
  async findByDocumentId(documentId: string): Promise<DocumentChunkRecord[]> {
    return this.db
      .select()
      .from(documentChunks)
      .where(eq(documentChunks.documentId, documentId))
      .orderBy(asc(documentChunks.chunkIndex))
  }

  /**
   * Retrieves chunks for a specific document page ordered deterministically by chunk_index.
   */
  async findByPage(
    documentId: string,
    pageNumber: number
  ): Promise<DocumentChunkRecord[]> {
    return this.db
      .select()
      .from(documentChunks)
      .where(
        and(
          eq(documentChunks.documentId, documentId),
          eq(documentChunks.pageNumber, pageNumber)
        )
      )
      .orderBy(asc(documentChunks.chunkIndex))
  }

  /**
   * Finds a specific chunk by its primary key ID.
   */
  async findById(id: string): Promise<DocumentChunkRecord | null> {
    const result = await this.db
      .select()
      .from(documentChunks)
      .where(eq(documentChunks.id, id))
      .get()
    return result ?? null
  }

  /**
   * Counts the total number of chunks for a document.
   */
  async countByDocumentId(documentId: string): Promise<number> {
    const result = await this.db
      .select({ val: count() })
      .from(documentChunks)
      .where(eq(documentChunks.documentId, documentId))
      .get()
    return result?.val ?? 0
  }

  /**
   * Deletes all chunks associated with a document.
   */
  async deleteByDocumentId(documentId: string): Promise<void> {
    await this.db
      .delete(documentChunks)
      .where(eq(documentChunks.documentId, documentId))
      .run()
  }

  /**
   * Idempotently saves chunks for a document using a transactional replace strategy.
   * If saving fails partway through, the entire replacement is rolled back, leaving
   * no partially replaced chunk set.
   * Never modifies or deletes document_pages.
   */
  async saveChunks(
    documentId: string,
    chunks: NewDocumentChunkRecord[]
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(documentChunks)
        .where(eq(documentChunks.documentId, documentId))
        .run()

      for (const chunk of chunks) {
        await tx.insert(documentChunks).values(chunk).run()
      }
    })
  }
}
