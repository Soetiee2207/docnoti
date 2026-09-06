import { invoke } from "@tauri-apps/api/core"

export interface StoredFileInfo {
  id: string
  name: string
  originalPath: string
  storagePath: string
  fileSize: number
  checksum: string
}

export interface StorageService {
  importPdf(sourcePath: string): Promise<StoredFileInfo>
  deleteStoredFile(storagePath: string): Promise<void>
  readFile(storagePath: string): Promise<Uint8Array>
}

export class TauriStorageService implements StorageService {
  async importPdf(sourcePath: string): Promise<StoredFileInfo> {
    const result = await invoke<StoredFileInfo>("import_pdf_file", {
      sourcePath,
    })
    return result
  }

  async deleteStoredFile(storagePath: string): Promise<void> {
    await invoke("delete_stored_file", { storagePath })
  }

  async readFile(storagePath: string): Promise<Uint8Array> {
    const bytes = await invoke<number[]>("read_stored_file", { storagePath })
    return new Uint8Array(bytes)
  }
}

/**
 * In-memory / file adapter for automated testing and dev fallback
 */
export class InMemoryStorageService implements StorageService {
  private files = new Map<string, StoredFileInfo>()
  private fileBuffers = new Map<string, Uint8Array>()
  public shouldFailImport = false

  async importPdf(sourcePath: string): Promise<StoredFileInfo> {
    if (this.shouldFailImport) {
      throw new Error("Simulated storage copy failure")
    }

    if (!sourcePath.toLowerCase().endsWith(".pdf")) {
      throw new Error("Only PDF files are supported in V1")
    }

    const id = `test-doc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
    const name = sourcePath.split(/[/\\]/).pop() || "document.pdf"
    const storagePath = `app_data/documents/${id}.pdf`
    // Mock checksum based on filename and test seed
    const checksum = `sha256_${name}_${sourcePath}`

    const info: StoredFileInfo = {
      id,
      name,
      originalPath: sourcePath,
      storagePath,
      fileSize: 1024 * 100, // 100 KB
      checksum,
    }

    this.files.set(storagePath, info)
    return info
  }

  async deleteStoredFile(storagePath: string): Promise<void> {
    this.files.delete(storagePath)
    this.fileBuffers.delete(storagePath)
  }

  setFileBuffer(storagePath: string, buffer: Uint8Array): void {
    this.fileBuffers.set(storagePath, buffer)
  }

  async readFile(storagePath: string): Promise<Uint8Array> {
    const buffer = this.fileBuffers.get(storagePath)
    if (!buffer) {
      throw new Error(`File not found in storage: ${storagePath}`)
    }
    return buffer
  }

  hasFile(storagePath: string): boolean {
    return this.files.has(storagePath)
  }
}
