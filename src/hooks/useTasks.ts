import { useState, useEffect, useCallback } from "react"
import { getAppServices } from "@/services"
import type { TaskItem, TaskStatus, TaskUpdateInput } from "@/services/tasks"
import type { AnalysisEvidence } from "@/services/ai"
import type { TaskRecord } from "@/db/schema"

export interface UseTasksOptions {
  documentId?: string
  status?: TaskStatus | "all"
}

export interface UseTasksResult {
  tasks: TaskItem[]
  loading: boolean
  error: string | null
  pendingCount: number
  confirmedCount: number
  rejectedCount: number
  confirmTask: (
    id: string,
    userEdits?: { title?: string; description?: string | null; deadlineDate?: string | null }
  ) => Promise<void>
  rejectTask: (id: string) => Promise<void>
  updateTask: (id: string, updates: TaskUpdateInput) => Promise<void>
  reloadTasks: () => Promise<void>
}

function parseTaskItem(record: TaskRecord): TaskItem {
  let parsedEvidence: AnalysisEvidence | null = null
  if (record.evidence) {
    try {
      parsedEvidence = JSON.parse(record.evidence) as AnalysisEvidence
    } catch {
      parsedEvidence = null
    }
  }

  return {
    ...record,
    evidence: parsedEvidence,
    status: (record.status as TaskItem["status"]) || "pending",
    semanticStatus: (record.semanticStatus as TaskItem["semanticStatus"]) || "UNCERTAIN",
    deadlineType: (record.deadlineType as TaskItem["deadlineType"]) || "none",
  }
}

export function useTasks(options: UseTasksOptions = {}): UseTasksResult {
  const { documentId, status } = options
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [allDocTasks, setAllDocTasks] = useState<TaskItem[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const reloadTasks = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const services = await getAppServices()

      // Fetch all tasks for counts
      const allRecords = await services.taskRepo.findAll(
        documentId ? { documentId } : undefined
      )
      const parsedAll = allRecords.map(parseTaskItem)
      setAllDocTasks(parsedAll)

      // Filter by status if specified
      if (status && status !== "all") {
        setTasks(parsedAll.filter((t) => t.status === status))
      } else {
        setTasks(parsedAll)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [documentId, status])

  useEffect(() => {
    queueMicrotask(() => {
      void reloadTasks()
    })
  }, [reloadTasks])

  const confirmTask = useCallback(
    async (
      id: string,
      userEdits?: { title?: string; description?: string | null; deadlineDate?: string | null }
    ) => {
      try {
        setError(null)
        const services = await getAppServices()
        await services.taskRepo.confirm(id, userEdits)
        await reloadTasks()
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        throw err
      }
    },
    [reloadTasks]
  )

  const rejectTask = useCallback(
    async (id: string) => {
      try {
        setError(null)
        const services = await getAppServices()
        await services.taskRepo.reject(id)
        await reloadTasks()
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        throw err
      }
    },
    [reloadTasks]
  )

  const updateTask = useCallback(
    async (id: string, updates: TaskUpdateInput) => {
      try {
        setError(null)
        const services = await getAppServices()
        await services.taskRepo.update(id, updates)
        await reloadTasks()
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        throw err
      }
    },
    [reloadTasks]
  )

  const pendingCount = allDocTasks.filter((t) => t.status === "pending").length
  const confirmedCount = allDocTasks.filter((t) => t.status === "confirmed").length
  const rejectedCount = allDocTasks.filter((t) => t.status === "rejected").length

  return {
    tasks,
    loading,
    error,
    pendingCount,
    confirmedCount,
    rejectedCount,
    confirmTask,
    rejectTask,
    updateTask,
    reloadTasks,
  }
}
