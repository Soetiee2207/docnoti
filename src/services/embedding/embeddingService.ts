import type { DocumentChunkRepository } from "@/repositories/documentChunkRepository"
import type { DocumentChunkEmbeddingRepository } from "@/repositories/documentChunkEmbeddingRepository"
import type { EmbeddingProvider, ChunkEmbeddingInput } from "./types"
import { EmbeddingError } from "./types"
import type { NewDocumentChunkEmbeddingRecord } from "@/db/schema"

export interface EmbedDocumentResult {
  documentId: string
  embeddedCount: number
  model: string
  dimensions: number
}

export class EmbeddingService {
  private provider: EmbeddingProvider
  private chunkRepo: DocumentChunkRepository
  private embeddingRepo: DocumentChunkEmbeddingRepository

  constructor(
    provider: EmbeddingProvider,
    chunkRepo: DocumentChunkRepository,
    embeddingRepo: DocumentChunkEmbeddingRepository
  ) {
    this.provider = provider
    this.chunkRepo = chunkRepo
    this.embeddingRepo = embeddingRepo
  }

  getProvider(): EmbeddingProvider {
    return this.provider
  }

  setProvider(provider: EmbeddingProvider): void {
    this.provider = provider
  }

  /**
   * Embeds all chunks of a document using the configured local EmbeddingProvider
   * and persists them idempotently into document_chunk_embeddings.
   */
  async embedDocument(documentId: string): Promise<EmbedDocumentResult> {
    const chunks = await this.chunkRepo.findByDocumentId(documentId)
    if (chunks.length === 0) {
      return {
        documentId,
        embeddedCount: 0,
        model: this.provider.model,
        dimensions: this.provider.dimensions,
      }
    }

    const inputs: ChunkEmbeddingInput[] = chunks.map((c) => ({
      chunkId: c.id,
      content: c.content,
    }))

    const results = await this.provider.embedChunks(inputs)

    // Validate vector outputs
    const now = new Date().toISOString()
    const records: NewDocumentChunkEmbeddingRecord[] = []

    for (const res of results) {
      if (!res.vector || res.vector.length !== this.provider.dimensions) {
        throw new EmbeddingError(
          `Invalid embedding vector dimension for chunk ${res.chunkId}. Expected ${this.provider.dimensions}, got ${res.vector?.length ?? 0}.`,
          "DIMENSION_MISMATCH"
        )
      }

      records.push({
        id: `${res.chunkId}_${this.provider.model}`,
        chunkId: res.chunkId,
        documentId,
        model: this.provider.model,
        dimensions: this.provider.dimensions,
        embedding: JSON.stringify(res.vector),
        createdAt: now,
        updatedAt: now,
      })
    }

    await this.embeddingRepo.saveEmbeddings(documentId, records)

    return {
      documentId,
      embeddedCount: records.length,
      model: this.provider.model,
      dimensions: this.provider.dimensions,
    }
  }

  /**
   * Rebuilds embeddings for a document or specific model.
   */
  async rebuildDocumentEmbeddings(documentId: string): Promise<EmbedDocumentResult> {
    return this.embedDocument(documentId)
  }
}
