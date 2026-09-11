import { useState, useEffect, useCallback } from "react"
import { getAppServices } from "@/services"
import type { DocumentRecord } from "@/db/schema"
import { open } from "@tauri-apps/plugin-dialog"
import { getCurrentWebview } from "@tauri-apps/api/webview"

function isTauriEnvironment(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
  )
}

export function useDocuments() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [importing, setImporting] = useState<boolean>(false)
  const [processing, setProcessing] = useState<boolean>(false)

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      const services = await getAppServices()
      const docs = await services.documentRepo.findAll()
      setDocuments(docs)
      setError(null)
    } catch (err) {
      console.error("Failed to load documents:", err)
      setError("Không thể tải danh sách tài liệu từ cơ sở dữ liệu.")
    } finally {
      setLoading(false)
    }
  }, [])

  const processPendingJobs = useCallback(async () => {
    setProcessing(true)
    try {
      const services = await getAppServices()
      await services.documentWorker.processPendingJobs()
      await refresh()
    } catch (err) {
      console.error("Background processing error:", err)
    } finally {
      setProcessing(false)
    }
  }, [refresh])

  useEffect(() => {
    queueMicrotask(() => {
      void refresh().then(() => {
        // Automatically process any pending jobs on startup
        void processPendingJobs()
      })
    })
  }, [refresh, processPendingJobs])

  const importFilePaths = useCallback(
    async (paths: string[]): Promise<{ succeeded: number; failed: number; message?: string }> => {
      if (paths.length === 0) return { succeeded: 0, failed: 0 }

      setImporting(true)
      setError(null)
      try {
        const services = await getAppServices()
        const result = await services.ingestionService.ingestMultiple(paths)

        await refresh()

        // Trigger worker processing for imported documents
        if (result.succeeded.length > 0) {
          setProcessing(true)
          services.documentWorker
            .processPendingJobs()
            .then(() => refresh())
            .finally(() => setProcessing(false))
        }

        let message: string | undefined
        if (result.failed.length > 0) {
          message = result.failed
            .map((f) => `${f.path.split(/[/\\]/).pop()}: ${f.error.message}`)
            .join("; ")
          setError(message)
        }

        return {
          succeeded: result.succeeded.length,
          failed: result.failed.length,
          message,
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setError(msg)
        return { succeeded: 0, failed: paths.length, message: msg }
      } finally {
        setImporting(false)
      }
    },
    [refresh]
  )

  const openPickerAndImport = useCallback(async () => {
    if (isTauriEnvironment()) {
      try {
        const selected = await open({
          multiple: true,
          filters: [
            {
              name: "Tài liệu PDF (*.pdf)",
              extensions: ["pdf"],
            },
          ],
        })

        if (!selected) return

        const paths = Array.isArray(selected) ? selected : [selected]
        await importFilePaths(paths)
      } catch (err) {
        console.error("Tauri dialog error:", err)
        setError("Không thể mở hộp thoại chọn tệp.")
      }
    } else {
      // In browser fallback, trigger hidden file input
      const input = document.createElement("input")
      input.type = "file"
      input.accept = ".pdf,application/pdf"
      input.multiple = true
      input.onchange = async (e) => {
        const files = (e.target as HTMLInputElement).files
        if (!files || files.length === 0) return
        const paths = Array.from(files).map((f) => (f as unknown as { path?: string }).path || f.name)
        await importFilePaths(paths)
      }
      input.click()
    }
  }, [importFilePaths])

  const reprocessDocument = useCallback(
    async (documentId: string): Promise<void> => {
      try {
        setError(null)
        setProcessing(true)
        const services = await getAppServices()
        await services.documentWorker.reprocessDocument(documentId)
        await refresh()
        // Run worker processing immediately
        services.documentWorker
          .processPendingJobs()
          .then(() => refresh())
          .finally(() => setProcessing(false))
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setError(msg)
        setProcessing(false)
      }
    },
    [refresh]
  )

  const deleteDocument = useCallback(
    async (documentId: string): Promise<boolean> => {
      try {
        setError(null)
        const services = await getAppServices()
        const success = await services.ingestionService.deleteDocument(documentId)
        await refresh()
        return success
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setError(msg)
        throw err
      }
    },
    [refresh]
  )

  const setupDragDropListener = useCallback(
    (onEnter: () => void, onLeave: () => void) => {
      if (!isTauriEnvironment()) return () => {}

      let cancelled = false
      let unlistenFn: (() => void) | null = null

      getCurrentWebview()
        .onDragDropEvent(async (event) => {
          if (cancelled) return
          const { type } = event.payload
          if (type === "enter") {
            onEnter()
          } else if (type === "leave") {
            onLeave()
          } else if (type === "drop") {
            onLeave()
            const paths = (event.payload as { paths: string[] }).paths
            if (paths && paths.length > 0) {
              await importFilePaths(paths)
            }
          }
        })
        .then((fn) => {
          if (cancelled) {
            fn()
          } else {
            unlistenFn = fn
          }
        })
        .catch(console.error)

      return () => {
        cancelled = true
        unlistenFn?.()
      }
    },
    [importFilePaths]
  )

  return {
    documents,
    loading,
    error,
    importing,
    processing,
    refresh,
    reprocessDocument,
    deleteDocument,
    processPendingJobs,
    importFilePaths,
    openPickerAndImport,
    setupDragDropListener,
  }
}

