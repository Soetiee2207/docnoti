export type TaskStatus = "pending" | "completed"

export interface Task {
    id: string
    title: string
    dueDate?: string
    status: TaskStatus
    sourceDocumentId?: string
}