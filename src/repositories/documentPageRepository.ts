import { eq, asc } from "drizzle-orm"
import { documentPages, type DocumentPageRecord, type NewDocumentPageRecord } from "@/db/schema"
import type { AppDatabase } from "@/db/client"

export class DocumentPageRepository {
  private db: AppDatabase

  constructor(db: AppDatabase) {
    this.db = db
  }

  async findByDocumentId(documentId: string): Promise<DocumentPageRecord[]> {
    return this.db
      .select()
      .from(documentPages)
      .where(eq(documentPages.documentId, documentId))
      .orderBy(asc(documentPages.pageNumber))
  }

  async deleteByDocumentId(documentId: string): Promise<void> {
    await this.db
      .delete(documentPages)
      .where(eq(documentPages.documentId, documentId))
      .run()
  }

  /**
   * Idempotently saves extracted pages for a document by replacing any previously extracted pages.
   */
  async savePages(documentId: string, pages: NewDocumentPageRecord[]): Promise<void> {
    // Delete existing pages for this document to ensure idempotency
    await this.deleteByDocumentId(documentId)

    for (const page of pages) {
      await this.db.insert(documentPages).values(page).run()
    }
  }
}
