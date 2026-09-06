export type RetrievalSource = "lexical" | "vector" | "both"

export interface HybridRetrievalCandidate {
  chunkId: string
  documentId: string
  pageNumber: number
  chunkIndex: number
  content: string
  charStart: number | null
  charEnd: number | null
  fusedScore: number
  lexicalRank: number | null
  lexicalScore: number | null
  vectorRank: number | null
  vectorScore: number | null
  retrievalSources: RetrievalSource
}

export interface HybridRetrievalOptions {
  /** Maximum number of fused candidates to return. Defaults to 10. */
  limit?: number
  /** Maximum number of candidate chunks to fetch from FTS5. Defaults to 20. */
  lexicalLimit?: number
  /** Maximum number of candidate chunks to fetch from vector search. Defaults to 20. */
  vectorLimit?: number
  /** Scope retrieval to a specific document. */
  documentId?: string
  /** Smoothing constant k for RRF calculation: 1 / (k + rank). Defaults to 60. */
  rrfK?: number
}

export interface HybridRetrievalDiagnostics {
  lexicalCandidateCount: number
  vectorCandidateCount: number
  isDegraded: boolean
  degradedReason?: string
  queryTimeMs: number
}

export interface HybridRetrievalResult {
  candidates: HybridRetrievalCandidate[]
  diagnostics: HybridRetrievalDiagnostics
}
