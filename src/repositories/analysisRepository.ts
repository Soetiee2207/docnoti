import { eq, and, desc } from 'drizzle-orm';
import { documentAnalyses, type DocumentAnalysisRecord, type NewDocumentAnalysisRecord } from '@/db/schema';
import type { AppDatabase } from '@/db/client';

export class AnalysisRepository {
  private db: AppDatabase;

  constructor(db: AppDatabase) {
    this.db = db;
  }

  async findByDocumentId(documentId: string): Promise<DocumentAnalysisRecord[]> {
    return this.db
      .select()
      .from(documentAnalyses)
      .where(eq(documentAnalyses.documentId, documentId))
      .orderBy(desc(documentAnalyses.version));
  }

  async getActiveAnalysis(documentId: string): Promise<DocumentAnalysisRecord | null> {
    const results = await this.db
      .select()
      .from(documentAnalyses)
      .where(
        and(
          eq(documentAnalyses.documentId, documentId),
          eq(documentAnalyses.isActive, 1)
        )
      )
      .limit(1);

    return results[0] ?? null;
  }

  async getAnalysisByVersion(documentId: string, version: number): Promise<DocumentAnalysisRecord | null> {
    const results = await this.db
      .select()
      .from(documentAnalyses)
      .where(
        and(
          eq(documentAnalyses.documentId, documentId),
          eq(documentAnalyses.version, version)
        )
      )
      .limit(1);

    return results[0] ?? null;
  }

  async getNextVersionNumber(documentId: string): Promise<number> {
    const results = await this.db
      .select({ version: documentAnalyses.version })
      .from(documentAnalyses)
      .where(eq(documentAnalyses.documentId, documentId))
      .orderBy(desc(documentAnalyses.version))
      .limit(1);

    if (results.length === 0 || !results[0]) {
      return 1;
    }
    return results[0].version + 1;
  }

  /**
   * Saves a new analysis record.
   * If markActive is true, marks any existing active analyses for this document as inactive (0).
   */
  async saveAnalysis(
    analysis: NewDocumentAnalysisRecord,
    markActive: boolean = true
  ): Promise<DocumentAnalysisRecord> {
    const now = new Date().toISOString();

    if (markActive) {
      await this.db
        .update(documentAnalyses)
        .set({ isActive: 0, updatedAt: now })
        .where(eq(documentAnalyses.documentId, analysis.documentId))
        .run();
    }

    const versionToSave = analysis.version ?? 1;
    const recordToInsert: NewDocumentAnalysisRecord = {
      ...analysis,
      version: versionToSave,
      isActive: markActive ? 1 : 0,
      createdAt: analysis.createdAt || now,
      updatedAt: analysis.updatedAt || now,
    };

    await this.db.insert(documentAnalyses).values(recordToInsert).run();

    const created = await this.getAnalysisByVersion(analysis.documentId, versionToSave);
    if (!created) {
      throw new Error(`Failed to retrieve saved analysis for document ${analysis.documentId} version ${versionToSave}`);
    }
    return created;
  }

  /**
   * Sets a specific version as the active analysis, deactivating other versions.
   */
  async setActiveVersion(documentId: string, version: number): Promise<void> {
    const target = await this.getAnalysisByVersion(documentId, version);
    if (!target) {
      throw new Error(`Analysis version ${version} not found for document ${documentId}`);
    }

    const now = new Date().toISOString();

    // Deactivate all versions for this document
    await this.db
      .update(documentAnalyses)
      .set({ isActive: 0, updatedAt: now })
      .where(eq(documentAnalyses.documentId, documentId))
      .run();

    // Activate the targeted version
    await this.db
      .update(documentAnalyses)
      .set({ isActive: 1, updatedAt: now })
      .where(
        and(
          eq(documentAnalyses.documentId, documentId),
          eq(documentAnalyses.version, version)
        )
      )
      .run();
  }
}
