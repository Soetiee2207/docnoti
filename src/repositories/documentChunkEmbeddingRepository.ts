import { eq, and, count } from "drizzle-orm"
import {
  documentChunks,
  documentChunkEmbeddings,
  type DocumentChunkEmbeddingRecord,
  type NewDocumentChunkEmbeddingRecord,
} from "@/db/schema"
import type { AppDatabase } from "@/db/client"

export class DocumentChunkEmbeddingRepository {
  private db: AppDatabase

  constructor(db: AppDatabase) {
    this.db = db
  }

  /**
   * Retrieves an embedding record by chunk ID and optional model identifier.
   */
  async findByChunkId(
    chunkId: string,
    model?: string
  ): Promise<DocumentChunkEmbeddingRecord | null> {
    const condition = model
      ? and(
          eq(documentChunkEmbeddings.chunkId, chunkId),
          eq(documentChunkEmbeddings.model, model)
        )
      : eq(documentChunkEmbeddings.chunkId, chunkId)

    const result = await this.db
      .select()
      .from(documentChunkEmbeddings)
      .where(condition)
      .get()

    return result ?? null
  }

  /**
   * Retrieves all chunk embeddings for a specific document.
   */
  async findByDocumentId(
    documentId: string,
    model?: string
  ): Promise<DocumentChunkEmbeddingRecord[]> {
    const condition = model
      ? and(
          eq(documentChunkEmbeddings.documentId, documentId),
          eq(documentChunkEmbeddings.model, model)
        )
      : eq(documentChunkEmbeddings.documentId, documentId)

    return this.db.select().from(documentChunkEmbeddings).where(condition)
  }

  /**
   * Idempotently saves chunk embeddings for a document in a transactional batch.
   * If embeddings already exist for the target chunks and model, they are updated/replaced.
   */
  async saveEmbeddings(
    _documentId: string,
    records: NewDocumentChunkEmbeddingRecord[]
  ): Promise<void> {
    if (records.length === 0) return

    await this.db.transaction(async (tx) => {
      for (const record of records) {
        // Delete existing chunk embedding for the same chunk_id and model if any
        await tx
          .delete(documentChunkEmbeddings)
          .where(
            and(
              eq(documentChunkEmbeddings.chunkId, record.chunkId),
              eq(documentChunkEmbeddings.model, record.model)
            )
          )
          .run()

        await tx.insert(documentChunkEmbeddings).values(record).run()
      }
    })
  }

  /**
   * Deletes all embeddings for a document.
   */
  async deleteByDocumentId(documentId: string): Promise<void> {
    await this.db
      .delete(documentChunkEmbeddings)
      .where(eq(documentChunkEmbeddings.documentId, documentId))
      .run()
  }

  /**
   * Deletes embedding for a specific chunk.
   */
  async deleteByChunkId(chunkId: string): Promise<void> {
    await this.db
      .delete(documentChunkEmbeddings)
      .where(eq(documentChunkEmbeddings.chunkId, chunkId))
      .run()
  }

  /**
   * Counts total persisted embeddings, optionally filtered by model.
   */
  async count(model?: string): Promise<number> {
    const query = model
      ? this.db
          .select({ val: count() })
          .from(documentChunkEmbeddings)
          .where(eq(documentChunkEmbeddings.model, model))
      : this.db.select({ val: count() }).from(documentChunkEmbeddings)

    const result = await query.get()
    return result?.val ?? 0
  }

  /**
   * Deletes all embeddings matching a model to allow clean rebuild.
   */
  async deleteByModel(model: string): Promise<void> {
    await this.db
      .delete(documentChunkEmbeddings)
      .where(eq(documentChunkEmbeddings.model, model))
      .run()
  }

  /**
   * Performs vector similarity search over persisted chunk embeddings.
   * Joins document_chunks to return authoritative chunk content and provenance.
   * Uses cosine similarity to rank candidates descending.
   */
  async searchSimilar(
    queryVector: number[],
    options?: VectorSearchOptions
  ): Promise<VectorSearchCandidate[]> {
    if (!queryVector || queryVector.length === 0) {
      return []
    }

    const conditions = []
    if (options?.documentId) {
      conditions.push(eq(documentChunkEmbeddings.documentId, options.documentId))
    }
    if (options?.model) {
      conditions.push(eq(documentChunkEmbeddings.model, options.model))
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined

    const rows = await this.db
      .select({
        chunkId: documentChunks.id,
        documentId: documentChunks.documentId,
        pageNumber: documentChunks.pageNumber,
        chunkIndex: documentChunks.chunkIndex,
        content: documentChunks.content,
        charStart: documentChunks.charStart,
        charEnd: documentChunks.charEnd,
        embedding: documentChunkEmbeddings.embedding,
      })
      .from(documentChunkEmbeddings)
      .innerJoin(
        documentChunks,
        eq(documentChunks.id, documentChunkEmbeddings.chunkId)
      )
      .where(whereClause)

    const scoredCandidates: VectorSearchCandidate[] = []

    for (const row of rows) {
      let embeddingArr: number[]
      try {
        embeddingArr = JSON.parse(row.embedding) as number[]
      } catch {
        continue
      }

      const score = cosineSimilarity(queryVector, embeddingArr)
      if (options?.minScore !== undefined && score < options.minScore) {
        continue
      }

      scoredCandidates.push({
        chunkId: row.chunkId,
        documentId: row.documentId,
        pageNumber: row.pageNumber,
        chunkIndex: row.chunkIndex,
        content: row.content,
        charStart: row.charStart,
        charEnd: row.charEnd,
        score,
      })
    }

    // Sort descending by score; break ties deterministically by pageNumber and chunkIndex
    scoredCandidates.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score
      }
      if (a.pageNumber !== b.pageNumber) {
        return a.pageNumber - b.pageNumber
      }
      return a.chunkIndex - b.chunkIndex
    })

    const limit = options?.limit ?? 20
    return scoredCandidates.slice(0, limit)
  }
}

export interface VectorSearchCandidate {
  chunkId: string
  documentId: string
  pageNumber: number
  chunkIndex: number
  content: string
  charStart: number | null
  charEnd: number | null
  score: number
}

export interface VectorSearchOptions {
  limit?: number
  documentId?: string
  model?: string
  minScore?: number
}

/**
 * Calculates cosine similarity between two numeric vectors.
 * Returns value between -1 and 1 (1 being identical direction).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    const valA = a[i]!
    const valB = b[i]!
    dot += valA * valB
    normA += valA * valA
    normB += valB * valB
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}
