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
