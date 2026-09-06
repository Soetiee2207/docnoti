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
]

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
      // Split migration SQL by semicolons to execute statements
      const statements = migration.sql
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)

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
