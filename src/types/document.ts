export type DocumentStatus =
    | "pending"
    | "processing"
    | "completed"
    | "failed"

export interface Document {
    id: string
    name: string
    type: "pdf" | "docx"
    status: DocumentStatus
    createdAt: string
}