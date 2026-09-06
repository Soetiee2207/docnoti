import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"

export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  originalPath: text("original_path").notNull(),
  storagePath: text("storage_path").notNull(),
  fileSize: integer("file_size").notNull(),
  mimeType: text("mime_type").notNull().default("application/pdf"),
  checksum: text("checksum").notNull(),
  status: text("status").notNull().default("imported"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
})

export const processingJobs = sqliteTable("processing_jobs", {
  id: text("id").primaryKey(),
  documentId: text("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  jobType: text("job_type").notNull().default("document_pipeline"),
  status: text("status").notNull().default("pending"),
  retryCount: integer("retry_count").notNull().default(0),
  maxRetries: integer("max_retries").notNull().default(3),
  errorMessage: text("error_message"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
})

export const documentPages = sqliteTable("document_pages", {
  id: text("id").primaryKey(),
  documentId: text("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  pageNumber: integer("page_number").notNull(),
  textContent: text("text_content").notNull(),
  charCount: integer("char_count").notNull(),
  hasSufficientText: integer("has_sufficient_text").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
})

export const documentAnalyses = sqliteTable("document_analyses", {
  id: text("id").primaryKey(),
  documentId: text("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  version: integer("version").notNull().default(1),
  isActive: integer("is_active").notNull().default(1),
  status: text("status").notNull().default("completed"),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  documentType: text("document_type").notNull(),
  summary: text("summary").notNull(),
  rawResult: text("raw_result").notNull(),
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  totalTokens: integer("total_tokens"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
})

export const documentChunks = sqliteTable("document_chunks", {
  id: text("id").primaryKey(),
  documentId: text("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  pageNumber: integer("page_number").notNull(),
  chunkIndex: integer("chunk_index").notNull(),
  content: text("content").notNull(),
  charStart: integer("char_start"),
  charEnd: integer("char_end"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
})

export type DocumentRecord = typeof documents.$inferSelect
export type NewDocumentRecord = typeof documents.$inferInsert

export type ProcessingJobRecord = typeof processingJobs.$inferSelect
export type NewProcessingJobRecord = typeof processingJobs.$inferInsert

export type DocumentPageRecord = typeof documentPages.$inferSelect
export type NewDocumentPageRecord = typeof documentPages.$inferInsert

export type DocumentAnalysisRecord = typeof documentAnalyses.$inferSelect
export type NewDocumentAnalysisRecord = typeof documentAnalyses.$inferInsert

export type DocumentChunkRecord = typeof documentChunks.$inferSelect
export type NewDocumentChunkRecord = typeof documentChunks.$inferInsert


