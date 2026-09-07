import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core"

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

export const documentChunkEmbeddings = sqliteTable("document_chunk_embeddings", {
  id: text("id").primaryKey(),
  chunkId: text("chunk_id")
    .notNull()
    .references(() => documentChunks.id, { onDelete: "cascade" }),
  documentId: text("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  model: text("model").notNull(),
  dimensions: integer("dimensions").notNull(),
  embedding: text("embedding").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
})

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  documentId: text("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  analysisId: text("analysis_id").references(() => documentAnalyses.id, {
    onDelete: "set null",
  }),
  analysisVersion: integer("analysis_version"),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("pending"),
  deadlineType: text("deadline_type").notNull().default("none"),
  rawDeadline: text("raw_deadline"),
  deadlineDate: text("deadline_date"),
  semanticStatus: text("semantic_status").notNull().default("UNCERTAIN"),
  confidence: real("confidence"),
  evidence: text("evidence"),
  userEdited: integer("user_edited").notNull().default(0),
  confirmedAt: text("confirmed_at"),
  rejectedAt: text("rejected_at"),
  completedAt: text("completed_at"),
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

export type DocumentChunkEmbeddingRecord = typeof documentChunkEmbeddings.$inferSelect
export type NewDocumentChunkEmbeddingRecord = typeof documentChunkEmbeddings.$inferInsert

export type TaskRecord = typeof tasks.$inferSelect
export type NewTaskRecord = typeof tasks.$inferInsert

export const calendarEvents = sqliteTable("calendar_events", {
  id: text("id").primaryKey(),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  documentId: text("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  externalEventId: text("external_event_id"),
  title: text("title").notNull(),
  description: text("description"),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  isAllDay: integer("is_all_day").notNull().default(1),
  timezone: text("timezone").notNull(),
  status: text("status").notNull().default("scheduled"),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
})

export type CalendarEventRecord = typeof calendarEvents.$inferSelect
export type NewCalendarEventRecord = typeof calendarEvents.$inferInsert

export const reminders = sqliteTable("reminders", {
  id: text("id").primaryKey(),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  documentId: text("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  reminderType: text("reminder_type").notNull(),
  scheduledAt: text("scheduled_at").notNull(),
  status: text("status").notNull().default("pending"),
  deliveredAt: text("delivered_at"),
  cancelledAt: text("cancelled_at"),
  notificationId: text("notification_id"),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  error: text("error"),
  retryCount: integer("retry_count").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
})

export type ReminderRecord = typeof reminders.$inferSelect
export type NewReminderRecord = typeof reminders.$inferInsert

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
})

export type AppSettingRecord = typeof appSettings.$inferSelect
export type NewAppSettingRecord = typeof appSettings.$inferInsert
