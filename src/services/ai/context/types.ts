import type { RetrievalSource } from "@/services/retrieval"
import type { DocumentPageInput } from "../types"

export interface ContextBudgetConfig {
  /** Maximum number of tokens allowed in the context. Defaults to 6500 tokens. */
  maxTokens?: number
  /** Maximum total characters allowed. If specified, overrides maxTokens. */
  maxCharacters?: number
  /** Approximation ratio for character-to-token conversion. Defaults to 2.8 chars per token. */
  charsPerToken?: number
  /** Maximum number of candidate chunks to select. Defaults to 25. */
  maxChunks?: number
  /** Maximum number of chunks allowed from a single page for diversity. Defaults to 3. */
  maxChunksPerPage?: number
}

export interface ContextBudgetDiagnostics {
  totalCandidates: number
  selectedChunksCount: number
  skippedChunksCount: number
  totalCharacters: number
  estimatedTokens: number
  budgetExceeded: boolean
  truncatedDueToBudget: boolean
}

export interface SelectedContextChunk {
  chunkId: string
  documentId: string
  documentName?: string
  pageNumber: number
  chunkIndex: number
  content: string
  charStart: number | null
  charEnd: number | null
  fusedScore: number
  lexicalRank: number | null
  vectorRank: number | null
  retrievalSources: RetrievalSource
}

export interface DocumentPageContextGroup {
  pageNumber: number
  chunks: SelectedContextChunk[]
}

export interface DocumentContextGroup {
  documentId: string
  documentName?: string
  pages: DocumentPageContextGroup[]
}

export interface BuiltContext {
  chunks: SelectedContextChunk[]
  groups: DocumentContextGroup[]
  /** Formatted text representation designed for LLM prompts with stable source identifiers */
  formattedText: string
  /** Bounded pages representation compatible with AnalysisRequest.pages */
  pages: DocumentPageInput[]
  diagnostics: ContextBudgetDiagnostics
  /** Quick lookup of allowed source text per page for evidence validation */
  pageContextMap: Map<number, string>
  /** Set of chunk IDs included in the context */
  includedChunkIds: Set<string>
}
