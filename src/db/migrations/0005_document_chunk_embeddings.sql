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

-- Trigger: ensure embeddings are deleted when chunk is deleted, even without PRAGMA foreign_keys
CREATE TRIGGER IF NOT EXISTS trg_document_chunk_embeddings_ad AFTER DELETE ON document_chunks
BEGIN
  DELETE FROM document_chunk_embeddings WHERE chunk_id = old.id;
END;
