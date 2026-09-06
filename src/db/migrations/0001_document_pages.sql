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
