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
