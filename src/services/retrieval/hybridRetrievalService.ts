import type { FtsSearchService } from "../search/ftsSearchService"
import type {
  DocumentChunkEmbeddingRepository,
  VectorSearchCandidate,
} from "@/repositories/documentChunkEmbeddingRepository"
import type { EmbeddingProvider } from "../embedding/types"
import { computeRrf, DEFAULT_RRF_K } from "./rrf"
import type {
  HybridRetrievalCandidate,
  HybridRetrievalOptions,
  HybridRetrievalResult,
} from "./types"

export class HybridRetrievalService {
  private ftsService: FtsSearchService
  private embeddingRepo: DocumentChunkEmbeddingRepository
  private embeddingProvider: EmbeddingProvider

  constructor(
    ftsService: FtsSearchService,
    embeddingRepo: DocumentChunkEmbeddingRepository,
    embeddingProvider: EmbeddingProvider
  ) {
    this.ftsService = ftsService
    this.embeddingRepo = embeddingRepo
    this.embeddingProvider = embeddingProvider
  }

  /**
   * Convenience search method returning the fused ranked candidate list directly.
   */
  async search(
    query: string,
    options?: HybridRetrievalOptions
  ): Promise<HybridRetrievalCandidate[]> {
    const result = await this.retrieve(query, options)
    return result.candidates
  }

  /**
   * Executes parallel FTS5 lexical search and dense vector search,
   * combining results using Reciprocal Rank Fusion (RRF).
   *
   * Degraded Mode: If the local vector embedding provider is unavailable
   * (e.g. model weights not downloaded), it falls back gracefully to lexical-only
   * retrieval without throwing and documents the status in the diagnostics.
   */
  async retrieve(
    query: string,
    options?: HybridRetrievalOptions
  ): Promise<HybridRetrievalResult> {
    const startTime = Date.now()
    const trimmedQuery = query ? query.trim() : ""

    if (!trimmedQuery) {
      return {
        candidates: [],
        diagnostics: {
          lexicalCandidateCount: 0,
          vectorCandidateCount: 0,
          isDegraded: false,
          queryTimeMs: Date.now() - startTime,
        },
      }
    }

    const lexicalLimit = options?.lexicalLimit ?? 20
    const vectorLimit = options?.vectorLimit ?? 20
    const finalLimit = options?.limit ?? 10
    const rrfK = options?.rrfK ?? DEFAULT_RRF_K

    let isDegraded = false
    let degradedReason: string | undefined

    // 1. Check local vector provider availability
    let vectorAvailable = false
    try {
      vectorAvailable = await this.embeddingProvider.isAvailable()
      if (!vectorAvailable) {
        isDegraded = true
        degradedReason =
          "Vector embedding provider is unavailable (model weights missing or uninitialized)"
      }
    } catch (err) {
      isDegraded = true
      degradedReason = `Vector availability check failed: ${err instanceof Error ? err.message : String(err)}`
    }

    // 2. Parallel execution: FTS5 Lexical Search + Vector Similarity Search
    const lexicalPromise = this.ftsService
      .search(trimmedQuery, {
        limit: lexicalLimit,
        documentId: options?.documentId,
      })
      .catch((err) => {
        console.error("Lexical search error:", err)
        return []
      })

    const vectorPromise: Promise<VectorSearchCandidate[]> = (async () => {
      if (!vectorAvailable) {
        return []
      }
      try {
        const queryVector = await this.embeddingProvider.embedText(trimmedQuery)
        return await this.embeddingRepo.searchSimilar(queryVector, {
          limit: vectorLimit,
          documentId: options?.documentId,
          model: this.embeddingProvider.model,
          minScore: options?.minVectorScore,
        })
      } catch (err) {
        isDegraded = true
        degradedReason = `Vector similarity search failed: ${err instanceof Error ? err.message : String(err)}`
        return []
      }
    })()

    const [lexicalCandidates, vectorCandidates] = await Promise.all([
      lexicalPromise,
      vectorPromise,
    ])

    // 3. Reciprocal Rank Fusion & Deduplication
    const fusedCandidates = computeRrf(lexicalCandidates, vectorCandidates, {
      rrfK,
    })

    // 4. Apply final limit
    const candidates = fusedCandidates.slice(0, finalLimit)

    return {
      candidates,
      diagnostics: {
        lexicalCandidateCount: lexicalCandidates.length,
        vectorCandidateCount: vectorCandidates.length,
        isDegraded,
        degradedReason,
        queryTimeMs: Date.now() - startTime,
      },
    }
  }
}
