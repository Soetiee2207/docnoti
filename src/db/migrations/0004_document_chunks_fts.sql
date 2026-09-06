CREATE VIRTUAL TABLE IF NOT EXISTS document_chunks_fts USING fts5(
  chunk_id UNINDEXED,
  document_id UNINDEXED,
  page_number UNINDEXED,
  content,
  tokenize = 'unicode61'
);

-- Trigger: index chunk on insert
CREATE TRIGGER IF NOT EXISTS trg_document_chunks_fts_ai AFTER INSERT ON document_chunks
BEGIN
  INSERT INTO document_chunks_fts (chunk_id, document_id, page_number, content)
  VALUES (new.id, new.document_id, new.page_number, new.content);
END;

-- Trigger: delete chunk index on delete
CREATE TRIGGER IF NOT EXISTS trg_document_chunks_fts_ad AFTER DELETE ON document_chunks
BEGIN
  DELETE FROM document_chunks_fts WHERE chunk_id = old.id;
END;

-- Trigger: update chunk index on update
CREATE TRIGGER IF NOT EXISTS trg_document_chunks_fts_au AFTER UPDATE ON document_chunks
BEGIN
  DELETE FROM document_chunks_fts WHERE chunk_id = old.id;
  INSERT INTO document_chunks_fts (chunk_id, document_id, page_number, content)
  VALUES (new.id, new.document_id, new.page_number, new.content);
END;

-- Backfill any existing chunks into FTS5
INSERT INTO document_chunks_fts (chunk_id, document_id, page_number, content)
SELECT id, document_id, page_number, content FROM document_chunks
WHERE NOT EXISTS (SELECT 1 FROM document_chunks_fts WHERE chunk_id = document_chunks.id);

