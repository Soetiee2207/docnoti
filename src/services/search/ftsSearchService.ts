import type { FtsSearchRepository } from "@/repositories/ftsSearchRepository"
import type { FtsSearchCandidate, FtsSearchOptions } from "./types"

/**
 * Sanitizes user search input into valid SQLite FTS5 query syntax.
 * Quotes each token to treat punctuation and special operators (colons, asterisks, hyphens)
 * as literal characters rather than FTS5 syntax control chars, preventing parse errors.
 */
export function sanitizeFtsQuery(query: string): string {
  if (!query || typeof query !== "string") {
    return ""
  }

  const regex = /"([^"]+)"|(\S+)/g
  const terms: string[] = []
  let match: RegExpExecArray | null

  while ((match = regex.exec(query)) !== null) {
    const raw = match[1] ?? match[2]
    if (!raw) continue

    const cleaned = raw.replace(/"/g, '""').trim()
    if (cleaned.length === 0 || /^[\s\p{P}]+$/u.test(cleaned)) {
      continue
    }

    terms.push(`"${cleaned}"`)
  }

  return terms.join(" ")
}

export class FtsSearchService {
  private repo: FtsSearchRepository

  constructor(repo: FtsSearchRepository) {
    this.repo = repo
  }

  /**
   * Searches document chunk content with BM25 ranking and document/page provenance.
   * Handles empty or symbol-only queries safely without database syntax errors.
   */
  async search(
    query: string,
    options?: FtsSearchOptions
  ): Promise<FtsSearchCandidate[]> {
    const sanitized = sanitizeFtsQuery(query)
    if (!sanitized) {
      return []
    }

    return this.repo.search(sanitized, options)
  }

  /**
   * Rebuilds the FTS5 secondary index from the authoritative document_chunks table.
   */
  async rebuildIndex(): Promise<void> {
    return this.repo.rebuildIndex()
  }

  /**
   * Returns the count of indexed items in the FTS5 index.
   */
  async count(): Promise<number> {
    return this.repo.count()
  }
}
