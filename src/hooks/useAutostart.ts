import { useState, useEffect, useCallback } from "react"
import { getAppServices } from "@/services"
import type { DaemonStatus } from "@/services/lifecycle"

export interface UseAutostartResult {
  autostartEnabled: boolean
  daemonStatus: DaemonStatus | null
  loading: boolean
  error: string | null
  setAutostart: (enabled: boolean) => Promise<boolean>
  reload: () => Promise<void>
  exitApp: () => Promise<void>
}

export function useAutostart(): UseAutostartResult {
  const [autostartEnabled, setAutostartEnabled] = useState<boolean>(false)
  const [daemonStatus, setDaemonStatus] = useState<DaemonStatus | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const services = await getAppServices()

      const enabled = await services.autostartService.isEnabled()
      const status = await services.appLifecycleService.getStatus()

      setAutostartEnabled(enabled)
      setDaemonStatus(status)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      void reload()
    })
  }, [reload])

  const setAutostart = useCallback(
    async (enabled: boolean): Promise<boolean> => {
      try {
        setError(null)
        const services = await getAppServices()
        const result = await services.autostartService.setEnabled(enabled)
        setAutostartEnabled(result)
        const status = await services.appLifecycleService.getStatus()
        setDaemonStatus(status)
        return result
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setError(msg)
        throw err
      }
    },
    []
  )

  const exitApp = useCallback(async () => {
    try {
      setError(null)
      const services = await getAppServices()
      await services.appLifecycleService.exitApp()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      throw err
    }
  }, [])

  return {
    autostartEnabled,
    daemonStatus,
    loading,
    error,
    setAutostart,
    reload,
    exitApp,
  }
}
