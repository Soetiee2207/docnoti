export interface MigrationExecutor {
  execute(sql: string): Promise<void>
  query<T = unknown>(sql: string): Promise<T[]>
}

export const INITIAL_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  original_path TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/pdf',
  checksum TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'imported',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS processing_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL DEFAULT 'document_pipeline',
  status TEXT NOT NULL DEFAULT 'pending',
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_documents_checksum ON documents(checksum);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_document_id ON processing_jobs(document_id);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_status ON processing_jobs(status);
`

export const DOCUMENT_PAGES_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS document_pages (
  id TEXT PRIMARY KEY NOT NULL,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  text_content TEXT NOT NULL,
  char_count INTEGER NOT NULL,
  has_sufficient_text INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_document_pages_document_id ON document_pages(document_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_document_pages_doc_page ON document_pages(document_id, page_number);
`

export const DOCUMENT_ANALYSES_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS document_analyses (
  id TEXT PRIMARY KEY NOT NULL,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'completed',
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  document_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  raw_result TEXT NOT NULL,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_document_analyses_document_id ON document_analyses(document_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_document_analyses_doc_version ON document_analyses(document_id, version);
`

export const DOCUMENT_CHUNKS_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS document_chunks (
  id TEXT PRIMARY KEY NOT NULL,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  char_start INTEGER,
  char_end INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_doc_page ON document_chunks(document_id, page_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_document_chunks_doc_chunk_idx ON document_chunks(document_id, chunk_index);
`

export const DOCUMENT_CHUNKS_FTS_MIGRATION_SQL = `
CREATE VIRTUAL TABLE IF NOT EXISTS document_chunks_fts USING fts5(
  chunk_id UNINDEXED,
  document_id UNINDEXED,
  page_number UNINDEXED,
  content,
  tokenize = 'unicode61'
);

CREATE TRIGGER IF NOT EXISTS trg_document_chunks_fts_ai AFTER INSERT ON document_chunks
BEGIN
  INSERT INTO document_chunks_fts (chunk_id, document_id, page_number, content)
  VALUES (new.id, new.document_id, new.page_number, new.content);
END;

CREATE TRIGGER IF NOT EXISTS trg_document_chunks_fts_ad AFTER DELETE ON document_chunks
BEGIN
  DELETE FROM document_chunks_fts WHERE chunk_id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_document_chunks_fts_au AFTER UPDATE ON document_chunks
BEGIN
  DELETE FROM document_chunks_fts WHERE chunk_id = old.id;
  INSERT INTO document_chunks_fts (chunk_id, document_id, page_number, content)
  VALUES (new.id, new.document_id, new.page_number, new.content);
END;

INSERT INTO document_chunks_fts (chunk_id, document_id, page_number, content)
SELECT id, document_id, page_number, content FROM document_chunks
WHERE NOT EXISTS (SELECT 1 FROM document_chunks_fts WHERE chunk_id = document_chunks.id);
`

export const DOCUMENT_CHUNK_EMBEDDINGS_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS document_chunk_embeddings (
  id TEXT PRIMARY KEY NOT NULL,
  chunk_id TEXT NOT NULL REFERENCES document_chunks(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  dimensions INTEGER NOT NULL,
  embedding TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_doc_chunk_embeddings_chunk_model
  ON document_chunk_embeddings(chunk_id, model);

CREATE INDEX IF NOT EXISTS idx_doc_chunk_embeddings_doc_id
  ON document_chunk_embeddings(document_id);

CREATE INDEX IF NOT EXISTS idx_doc_chunk_embeddings_model
  ON document_chunk_embeddings(model);

CREATE TRIGGER IF NOT EXISTS trg_document_chunk_embeddings_ad AFTER DELETE ON document_chunks
BEGIN
  DELETE FROM document_chunk_embeddings WHERE chunk_id = old.id;
END;
`

interface MigrationItem {
  id: string
  sql: string
}

const MIGRATIONS: MigrationItem[] = [
  {
    id: "0000_initial",
    sql: INITIAL_MIGRATION_SQL,
  },
  {
    id: "0001_document_pages",
    sql: DOCUMENT_PAGES_MIGRATION_SQL,
  },
  {
    id: "0002_document_analyses",
    sql: DOCUMENT_ANALYSES_MIGRATION_SQL,
  },
  {
    id: "0003_document_chunks",
    sql: DOCUMENT_CHUNKS_MIGRATION_SQL,
  },
  {
    id: "0004_document_chunks_fts",
    sql: DOCUMENT_CHUNKS_FTS_MIGRATION_SQL,
  },
  {
    id: "0005_document_chunk_embeddings",
    sql: DOCUMENT_CHUNK_EMBEDDINGS_MIGRATION_SQL,
  },
]


export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = []
  let current = ""
  let inSingleQuote = false
  let inDoubleQuote = false
  let inLineComment = false
  let inBlockComment = false
  let triggerDepth = 0

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i]
    const nextChar = sql[i + 1]

    if (inLineComment) {
      current += char
      if (char === "\n") inLineComment = false
      continue
    }
    if (inBlockComment) {
      current += char
      if (char === "*" && nextChar === "/") {
        current += nextChar
        i++
        inBlockComment = false
      }
      continue
    }
    if (inSingleQuote) {
      current += char
      if (char === "'") {
        if (nextChar === "'") {
          current += nextChar
          i++
        } else {
          inSingleQuote = false
        }
      }
      continue
    }
    if (inDoubleQuote) {
      current += char
      if (char === '"') {
        if (nextChar === '"') {
          current += nextChar
          i++
        } else {
          inDoubleQuote = false
        }
      }
      continue
    }

    if (char === "-" && nextChar === "-") {
      inLineComment = true
      current += char
      continue
    }
    if (char === "/" && nextChar === "*") {
      inBlockComment = true
      current += char
      continue
    }
    if (char === "'") {
      inSingleQuote = true
      current += char
      continue
    }
    if (char === '"') {
      inDoubleQuote = true
      current += char
      continue
    }

    const prevChar = i > 0 ? sql[i - 1] : " "
    const isWordBoundaryBefore = /[^a-zA-Z0-9_]/.test(prevChar)

    if (isWordBoundaryBefore) {
      const remaining = sql.slice(i)
      const beginMatch = remaining.match(/^BEGIN\b/i)
      const endMatch = remaining.match(/^END\b/i)

      if (beginMatch) {
        triggerDepth++
        current += beginMatch[0]
        i += beginMatch[0].length - 1
        continue
      }
      if (endMatch) {
        if (triggerDepth > 0) triggerDepth--
        current += endMatch[0]
        i += endMatch[0].length - 1
        continue
      }
    }

    if (char === ";" && triggerDepth === 0) {
      const trimmed = current.trim()
      if (trimmed.length > 0) {
        statements.push(trimmed)
      }
      current = ""
      continue
    }
    current += char
  }
  const lastTrimmed = current.trim()
  if (lastTrimmed.length > 0) {
    statements.push(lastTrimmed)
  }
  return statements
}

export async function runMigrations(executor: MigrationExecutor): Promise<void> {
  // Ensure migrations tracking table exists
  await executor.execute(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL
    );
  `)

  // Check applied migrations
  const appliedRows = await executor.query<{ name: string }>(
    `SELECT name FROM __drizzle_migrations`
  )
  const applied = new Set(appliedRows.map((r) => r.name))

  for (const migration of MIGRATIONS) {
    if (!applied.has(migration.id)) {
      const statements = splitSqlStatements(migration.sql)

      for (const statement of statements) {
        await executor.execute(statement)
      }

      const now = new Date().toISOString()
      await executor.execute(
        `INSERT OR IGNORE INTO __drizzle_migrations (name, applied_at) VALUES ('${migration.id}', '${now}');`
      )
    }
  }
}

