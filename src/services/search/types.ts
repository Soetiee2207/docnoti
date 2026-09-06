export interface FtsSearchCandidate {
  chunkId: string
  documentId: string
  pageNumber: number
  chunkIndex: number
  content: string
  snippet: string
  score: number // Native SQLite BM25 score (smaller/more negative = better match)
  charStart: number | null
  charEnd: number | null
}

export interface FtsSearchOptions {
  limit?: number
  offset?: number
  documentId?: string
  snippetMaxTokens?: number
  highlightPreTag?: string
  highlightPostTag?: string
}
