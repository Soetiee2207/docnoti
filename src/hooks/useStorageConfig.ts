import { useState, useEffect, useCallback } from "react"
import { invoke } from "@tauri-apps/api/core"
import { open } from "@tauri-apps/plugin-dialog"

export interface StorageConfig {
  version: number
  documentsDir: string | null
  databaseDir: string | null
  tempOcrDir: string | null
  logDir: string | null
}

export interface ResolvedStoragePaths {
  documentsDir: string
  databaseDir: string
  tempOcrDir: string
  logDir: string
  isCustomDocumentsDir: boolean
  isCustomDatabaseDir: boolean
  isCustomTempOcrDir: boolean
  isCustomLogDir: boolean
}

export type StorageDirKey = "documents_dir" | "database_dir" | "temp_ocr_dir" | "log_dir"

function isTauriEnvironment(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
  )
}

const FALLBACK_PATHS: ResolvedStoragePaths = {
  documentsDir: "data/local_storage/documents",
  databaseDir: "data/local_storage",
  tempOcrDir: "data/local_storage/temp_ocr",
  logDir: "data/local_storage/logs",
  isCustomDocumentsDir: false,
  isCustomDatabaseDir: false,
  isCustomTempOcrDir: false,
  isCustomLogDir: false,
}

export interface UseStorageConfigResult {
  paths: ResolvedStoragePaths | null
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  updateDir: (key: StorageDirKey, newPath: string | null) => Promise<ResolvedStoragePaths>
  resetToDefaults: () => Promise<ResolvedStoragePaths>
  selectDirectory: (title?: string) => Promise<string | null>
}

export function useStorageConfig(): UseStorageConfigResult {
  const [paths, setPaths] = useState<ResolvedStoragePaths | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      if (isTauriEnvironment()) {
        const resolved = await invoke<ResolvedStoragePaths>("get_resolved_storage_paths")
        setPaths(resolved)
      } else {
        setPaths(FALLBACK_PATHS)
      }
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

  const updateDir = useCallback(
    async (key: StorageDirKey, newPath: string | null): Promise<ResolvedStoragePaths> => {
      try {
        setError(null)
        setLoading(true)

        if (isTauriEnvironment()) {
          const updated = await invoke<ResolvedStoragePaths>("update_storage_dir", {
            key,
            newPath: newPath && newPath.trim() ? newPath.trim() : null,
          })
          setPaths(updated)
          return updated
        } else {
          // Fallback simulation for non-Tauri dev/test environment
          const isCustom = Boolean(newPath && newPath.trim())
          const updated: ResolvedStoragePaths = {
            ...(paths || FALLBACK_PATHS),
            ...(key === "documents_dir"
              ? { documentsDir: newPath || FALLBACK_PATHS.documentsDir, isCustomDocumentsDir: isCustom }
              : {}),
            ...(key === "database_dir"
              ? { databaseDir: newPath || FALLBACK_PATHS.databaseDir, isCustomDatabaseDir: isCustom }
              : {}),
            ...(key === "temp_ocr_dir"
              ? { tempOcrDir: newPath || FALLBACK_PATHS.tempOcrDir, isCustomTempOcrDir: isCustom }
              : {}),
            ...(key === "log_dir"
              ? { logDir: newPath || FALLBACK_PATHS.logDir, isCustomLogDir: isCustom }
              : {}),
          }
          setPaths(updated)
          return updated
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setError(msg)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [paths]
  )

  const resetToDefaults = useCallback(async (): Promise<ResolvedStoragePaths> => {
    try {
      setError(null)
      setLoading(true)

      if (isTauriEnvironment()) {
        const reset = await invoke<ResolvedStoragePaths>("reset_storage_config")
        setPaths(reset)
        return reset
      } else {
        setPaths(FALLBACK_PATHS)
        return FALLBACK_PATHS
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const selectDirectory = useCallback(async (title = "Chọn thư mục"): Promise<string | null> => {
    try {
      if (isTauriEnvironment()) {
        const selected = await open({
          directory: true,
          multiple: false,
          title,
        })
        if (typeof selected === "string") {
          return selected
        }
        return null
      }
      return null
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return null
    }
  }, [])

  return {
    paths,
    loading,
    error,
    reload,
    updateDir,
    resetToDefaults,
    selectDirectory,
  }
}
