import { useState, useEffect, useCallback } from "react"
import { getAppServices } from "@/services"
import type {
  CalendarEvent,
  CalendarProviderAvailability,
  CalendarEligibilityResult,
} from "@/services/calendar"
import type { TaskItem } from "@/services/tasks"

export interface ProviderInfo {
  id: string
  name: string
  availability: CalendarProviderAvailability
}

export interface UseCalendarOptions {
  documentId?: string
  taskId?: string
}

export interface UseCalendarResult {
  events: CalendarEvent[]
  providers: ProviderInfo[]
  loading: boolean
  error: string | null
  scheduleTask: (taskId: string, providerId?: string) => Promise<CalendarEvent>
  cancelEvent: (taskId: string, providerId?: string) => Promise<void>
  checkEligibility: (task: Pick<TaskItem, "status" | "deadlineType" | "deadlineDate">) => CalendarEligibilityResult
  getEventForTask: (taskId: string, providerId?: string) => CalendarEvent | undefined
  reload: () => Promise<void>
}

export function useCalendar(options: UseCalendarOptions = {}): UseCalendarResult {
  const { documentId, taskId } = options
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const services = await getAppServices()

      const providerList = await services.calendarService.listProviders()
      setProviders(providerList)

      let loadedEvents: CalendarEvent[] = []
      if (taskId) {
        loadedEvents = await services.calendarService.getEventsForTask(taskId)
      } else if (documentId) {
        loadedEvents = await services.calendarEventRepo.findByDocumentId(documentId)
      } else {
        loadedEvents = await services.calendarEventRepo.findAll()
      }
      setEvents(loadedEvents)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [documentId, taskId])

  useEffect(() => {
    queueMicrotask(() => {
      void reload()
    })
  }, [reload])

  const scheduleTask = useCallback(
    async (targetTaskId: string, providerId = "internal"): Promise<CalendarEvent> => {
      try {
        setError(null)
        const services = await getAppServices()
        const event = await services.calendarService.scheduleTask(targetTaskId, providerId)
        await reload()
        return event
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setError(msg)
        throw err
      }
    },
    [reload]
  )

  const cancelEvent = useCallback(
    async (targetTaskId: string, providerId?: string): Promise<void> => {
      try {
        setError(null)
        const services = await getAppServices()
        await services.calendarService.cancelEventForTask(targetTaskId, providerId)
        await reload()
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setError(msg)
        throw err
      }
    },
    [reload]
  )

  const checkEligibility = useCallback(
    (task: Pick<TaskItem, "status" | "deadlineType" | "deadlineDate">): CalendarEligibilityResult => {
      // Basic synchronous eligibility check conforming to calendar rules
      if (task.status !== "confirmed") {
        return {
          eligible: false,
          reason: `Chỉ công việc đã được xác nhận (status: confirmed) mới có thể lên lịch. Trạng thái hiện tại: '${task.status}'.`,
        }
      }
      if (task.deadlineType !== "exact") {
        if (task.deadlineType === "relative") {
          return {
            eligible: false,
            reason: "Hạn chót tương đối chưa được quy đổi thành ngày cụ thể. Vui lòng chỉnh sửa hạn chót trước khi lên lịch.",
          }
        }
        if (task.deadlineType === "ambiguous") {
          return {
            eligible: false,
            reason: "Hạn chót không rõ ràng. Vui lòng xác định ngày cụ thể trước khi lên lịch.",
          }
        }
        return {
          eligible: false,
          reason: "Công việc không có hạn chót. Không thể tự ý tạo ngày cho lịch.",
        }
      }
      if (!task.deadlineDate || task.deadlineDate.trim() === "") {
        return {
          eligible: false,
          reason: "Thiếu ngày hạn chót hợp lệ.",
        }
      }
      const parsed = new Date(task.deadlineDate)
      if (Number.isNaN(parsed.getTime())) {
        return {
          eligible: false,
          reason: `Ngày hạn chót '${task.deadlineDate}' không đúng định dạng hợp lệ.`,
        }
      }
      return { eligible: true }
    },
    []
  )

  const getEventForTask = useCallback(
    (targetTaskId: string, providerId?: string): CalendarEvent | undefined => {
      return events.find(
        (e) => e.taskId === targetTaskId && (providerId ? e.provider === providerId : true)
      )
    },
    [events]
  )

  return {
    events,
    providers,
    loading,
    error,
    scheduleTask,
    cancelEvent,
    checkEligibility,
    getEventForTask,
    reload,
  }
}
