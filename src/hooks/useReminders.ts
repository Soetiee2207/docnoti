import { useState, useEffect, useCallback } from "react"
import { getAppServices } from "@/services"
import type {
  ReminderItem,
  ReminderType,
  NotificationProviderAvailability,
} from "@/services/notification"

export interface UseRemindersOptions {
  taskId?: string
}

export interface UseRemindersResult {
  reminders: ReminderItem[]
  providerAvailability: NotificationProviderAvailability | null
  loading: boolean
  error: string | null
  configureReminders: (taskId: string, leadTimes: ReminderType[]) => Promise<ReminderItem[]>
  cancelReminders: (taskId: string) => Promise<void>
  reload: () => Promise<void>
}

export function useReminders(options: UseRemindersOptions = {}): UseRemindersResult {
  const { taskId } = options
  const [reminders, setReminders] = useState<ReminderItem[]>([])
  const [providerAvailability, setProviderAvailability] =
    useState<NotificationProviderAvailability | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const services = await getAppServices()

      const avail = await services.windowsToastProvider.checkAvailability()
      setProviderAvailability(avail)

      if (taskId) {
        const list = await services.notificationService.getRemindersForTask(taskId)
        setReminders(list)
      } else {
        setReminders([])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [taskId])

  useEffect(() => {
    queueMicrotask(() => {
      void reload()
    })
  }, [reload])

  const configureReminders = useCallback(
    async (targetTaskId: string, leadTimes: ReminderType[]): Promise<ReminderItem[]> => {
      try {
        setError(null)
        const services = await getAppServices()
        const updated = await services.notificationService.scheduleRemindersForTask(targetTaskId, {
          leadTimes,
        })
        await reload()
        return updated
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setError(msg)
        throw err
      }
    },
    [reload]
  )

  const cancelReminders = useCallback(
    async (targetTaskId: string): Promise<void> => {
      try {
        setError(null)
        const services = await getAppServices()
        await services.notificationService.cancelRemindersForTask(targetTaskId)
        await reload()
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setError(msg)
        throw err
      }
    },
    [reload]
  )

  return {
    reminders,
    providerAvailability,
    loading,
    error,
    configureReminders,
    cancelReminders,
    reload,
  }
}
