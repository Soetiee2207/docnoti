import { sql } from "drizzle-orm"
import type { AppDatabase } from "@/db/client"
import type { FtsSearchCandidate, FtsSearchOptions } from "@/services/search/types"

export class FtsSearchRepository {
  private db: AppDatabase

  constructor(db: AppDatabase) {
    this.db = db
  }

  /**
   * Performs lexical search over document_chunks_fts joined with document_chunks.
   * Preserves chunk, page, and document provenance.
   * Results are ranked by BM25 (best matches first).
   */
  async search(
    sanitizedQuery: string,
    options?: FtsSearchOptions
  ): Promise<FtsSearchCandidate[]> {
    if (!sanitizedQuery.trim()) {
      return []
    }

    const limit = options?.limit ?? 10
    const offset = options?.offset ?? 0
    const preTag = options?.highlightPreTag ?? "<mark>"
    const postTag = options?.highlightPostTag ?? "</mark>"
    const maxTokens = options?.snippetMaxTokens ?? 16

    let querySql
    if (options?.documentId) {
      querySql = sql`
        SELECT f.chunk_id,
               f.document_id,
               f.page_number,
               c.chunk_index,
               c.content,
               snippet(document_chunks_fts, 3, ${preTag}, ${postTag}, '...', ${maxTokens}) AS snippet,
               bm25(document_chunks_fts) AS score,
               c.char_start,
               c.char_end
        FROM document_chunks_fts f
        JOIN document_chunks c ON c.id = f.chunk_id
        WHERE document_chunks_fts MATCH ${sanitizedQuery}
          AND f.document_id = ${options.documentId}
        ORDER BY score ASC, c.page_number ASC, c.chunk_index ASC
        LIMIT ${limit} OFFSET ${offset}
      `
    } else {
      querySql = sql`
        SELECT f.chunk_id,
               f.document_id,
               f.page_number,
               c.chunk_index,
               c.content,
               snippet(document_chunks_fts, 3, ${preTag}, ${postTag}, '...', ${maxTokens}) AS snippet,
               bm25(document_chunks_fts) AS score,
               c.char_start,
               c.char_end
        FROM document_chunks_fts f
        JOIN document_chunks c ON c.id = f.chunk_id
        WHERE document_chunks_fts MATCH ${sanitizedQuery}
        ORDER BY score ASC, c.page_number ASC, c.chunk_index ASC
        LIMIT ${limit} OFFSET ${offset}
      `
    }

    const rows = await this.db.all<unknown[] | Record<string, unknown>>(querySql)

    return rows.map((row) => this.mapRow(row))
  }

  /**
   * Returns the count of indexed items in the FTS5 virtual table.
   */
  async count(): Promise<number> {
    const rows = await this.db.all<unknown[] | Record<string, unknown>>(
      sql`SELECT count(*) AS total FROM document_chunks_fts`
    )
    if (!rows || rows.length === 0) return 0
    const first = rows[0]
    if (Array.isArray(first)) {
      return Number(first[0]) || 0
    }
    return Number((first as Record<string, unknown>).total) || 0
  }

  /**
   * Rebuilds the FTS5 index directly from document_chunks (the source of truth).
   * Ensures the index is completely rebuildable at any time.
   */
  async rebuildIndex(): Promise<void> {
    await this.db.run(sql`DELETE FROM document_chunks_fts`)
    await this.db.run(sql`
      INSERT INTO document_chunks_fts (chunk_id, document_id, page_number, content)
      SELECT id, document_id, page_number, content FROM document_chunks
    `)
  }

  private mapRow(row: unknown[] | Record<string, unknown>): FtsSearchCandidate {
    if (Array.isArray(row)) {
      return {
        chunkId: String(row[0]),
        documentId: String(row[1]),
        pageNumber: Number(row[2]),
        chunkIndex: Number(row[3]),
        content: String(row[4]),
        snippet: String(row[5]),
        score: Number(row[6]),
        charStart: row[7] !== null && row[7] !== undefined ? Number(row[7]) : null,
        charEnd: row[8] !== null && row[8] !== undefined ? Number(row[8]) : null,
      }
    }

    const r = row as Record<string, unknown>
    return {
      chunkId: String(r.chunkId ?? r.chunk_id),
      documentId: String(r.documentId ?? r.document_id),
      pageNumber: Number(r.pageNumber ?? r.page_number),
      chunkIndex: Number(r.chunkIndex ?? r.chunk_index),
      content: String(r.content),
      snippet: String(r.snippet),
      score: Number(r.score ?? r.rank),
      charStart:
        r.charStart !== null && r.charStart !== undefined
          ? Number(r.charStart)
          : r.char_start !== null && r.char_start !== undefined
            ? Number(r.char_start)
            : null,
      charEnd:
        r.charEnd !== null && r.charEnd !== undefined
          ? Number(r.charEnd)
          : r.char_end !== null && r.char_end !== undefined
            ? Number(r.char_end)
            : null,
    }
  }
}
