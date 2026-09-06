import type { FtsSearchCandidate } from "../search/types"
import type { VectorSearchCandidate } from "@/repositories/documentChunkEmbeddingRepository"
import type { HybridRetrievalCandidate } from "./types"

export interface RrfOptions {
  /**
   * Smoothing constant k for RRF calculation: 1 / (k + rank).
   * Default is 60.
   */
  rrfK?: number
}

export const DEFAULT_RRF_K = 60

/**
 * Reciprocal Rank Fusion (RRF) algorithm:
 * Combines ranked lists from lexical (FTS5) and dense vector retrieval pools.
 * Formula: RRF(d) = Σ 1 / (k + rank), where rank is 1-based.
 *
 * Deduplicates candidates by chunkId. Candidates appearing in only one pool
 * remain eligible with their single source contribution.
 */
export function computeRrf(
  lexicalCandidates: FtsSearchCandidate[],
  vectorCandidates: VectorSearchCandidate[],
  options?: RrfOptions
): HybridRetrievalCandidate[] {
  const k = options?.rrfK ?? DEFAULT_RRF_K
  const candidateMap = new Map<string, HybridRetrievalCandidate>()

  // 1. Process Lexical Candidates (1-based rank)
  for (let i = 0; i < lexicalCandidates.length; i++) {
    const item = lexicalCandidates[i]!
    const rank = i + 1
    const rrfScore = 1 / (k + rank)

    candidateMap.set(item.chunkId, {
      chunkId: item.chunkId,
      documentId: item.documentId,
      pageNumber: item.pageNumber,
      chunkIndex: item.chunkIndex,
      content: item.content,
      charStart: item.charStart,
      charEnd: item.charEnd,
      fusedScore: rrfScore,
      lexicalRank: rank,
      lexicalScore: item.score,
      vectorRank: null,
      vectorScore: null,
      retrievalSources: "lexical",
    })
  }

  // 2. Process Vector Candidates (1-based rank)
  for (let j = 0; j < vectorCandidates.length; j++) {
    const item = vectorCandidates[j]!
    const rank = j + 1
    const rrfScore = 1 / (k + rank)

    const existing = candidateMap.get(item.chunkId)
    if (existing) {
      existing.fusedScore += rrfScore
      existing.vectorRank = rank
      existing.vectorScore = item.score
      existing.retrievalSources = "both"
    } else {
      candidateMap.set(item.chunkId, {
        chunkId: item.chunkId,
        documentId: item.documentId,
        pageNumber: item.pageNumber,
        chunkIndex: item.chunkIndex,
        content: item.content,
        charStart: item.charStart,
        charEnd: item.charEnd,
        fusedScore: rrfScore,
        lexicalRank: null,
        lexicalScore: null,
        vectorRank: rank,
        vectorScore: item.score,
        retrievalSources: "vector",
      })
    }
  }

  // 3. Sort candidates descending by fusedScore
  const results = Array.from(candidateMap.values())
  results.sort((a, b) => {
    if (b.fusedScore !== a.fusedScore) {
      return b.fusedScore - a.fusedScore
    }
    if (a.pageNumber !== b.pageNumber) {
      return a.pageNumber - b.pageNumber
    }
    if (a.chunkIndex !== b.chunkIndex) {
      return a.chunkIndex - b.chunkIndex
    }
    return a.chunkId.localeCompare(b.chunkId)
  })

  return results
}
