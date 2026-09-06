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

export type DocumentRecord = typeof documents.$inferSelect
export type NewDocumentRecord = typeof documents.$inferInsert

export type ProcessingJobRecord = typeof processingJobs.$inferSelect
export type NewProcessingJobRecord = typeof processingJobs.$inferInsert
