import { invoke } from "@tauri-apps/api/core"
import type { OCRProvider, OCRPageResult } from "./types"
import { OCRError } from "./types"

function isTauriEnvironment(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
  )
}

interface RunnerOutput {
  success: boolean
  text: string
  lines: Array<{
    text: string
    confidence?: number
    box?: {
      x: number
      y: number
      width: number
      height: number
    }
  }>
  error?: string
}

export class PaddleOCRProvider implements OCRProvider {
  readonly name = "PaddleOCR"

  async isAvailable(): Promise<boolean> {
    if (isTauriEnvironment()) {
      try {
        return await invoke<boolean>("check_ocr_available")
      } catch (err) {
        console.warn("Lỗi khi kiểm tra trạng thái PaddleOCR qua Tauri IPC:", err)
        return false
      }
    }

    // Node.js fallback (tests / CLI)
    try {
      // Dynamic import to avoid bundling issues in browser
      const { spawnSync } = await import("node:child_process")
      const res = spawnSync("python", ["scripts/ocr_runner.py", "--check"], {
        encoding: "utf-8",
        stdio: "pipe",
      })
      return res.status === 0
    } catch {
      return false
    }
  }

  async recognizePage(imageBytes: Uint8Array, pageNumber: number): Promise<OCRPageResult> {
    if (!imageBytes || imageBytes.length === 0) {
      throw new OCRError("Dữ liệu ảnh trang rỗng, không thể nhận dạng OCR.")
    }

    const available = await this.isAvailable()
    if (!available) {
      throw new OCRError(
        "PaddleOCR chưa được cài đặt trong môi trường Python cục bộ. " +
          "Vui lòng chạy lệnh: pip install paddlepaddle paddleocr để sử dụng OCR."
      )
    }

    let rawOutput: string
    if (isTauriEnvironment()) {
      try {
        rawOutput = await invoke<string>("run_ocr_on_image", {
          imageBytes: Array.from(imageBytes),
        })
      } catch (err) {
        throw new OCRError(
          `Lỗi thực thi PaddleOCR qua native IPC: ${err instanceof Error ? err.message : String(err)}`,
          err
        )
      }
    } else {
      // Node.js test environment runner
      try {
        const { spawnSync } = await import("node:child_process")
        const fs = await import("node:fs")
        const path = await import("node:path")
        const os = await import("node:os")

        const tempFile = path.join(os.tmpdir(), `ocr_${Date.now()}_${Math.random().toString(36).slice(2)}.png`)
        fs.writeFileSync(tempFile, imageBytes)

        try {
          const res = spawnSync("python", ["scripts/ocr_runner.py", tempFile], {
            encoding: "utf-8",
            maxBuffer: 10 * 1024 * 1024,
          })

          if (res.status !== 0) {
            throw new Error(res.stderr || res.stdout || `Exit code ${res.status}`)
          }
          rawOutput = res.stdout
        } finally {
          if (fs.existsSync(tempFile)) {
            fs.unlinkSync(tempFile)
          }
        }
      } catch (err) {
        throw new OCRError(
          `Lỗi thực thi PaddleOCR: ${err instanceof Error ? err.message : String(err)}`,
          err
        )
      }
    }

    try {
      const parsed: RunnerOutput = JSON.parse(rawOutput)
      if (!parsed.success) {
        throw new OCRError(parsed.error || "PaddleOCR trả về kết quả không thành công.")
      }

      return {
        pageNumber,
        text: parsed.text || "",
        confidence:
          parsed.lines && parsed.lines.length > 0
            ? parsed.lines.reduce((acc, l) => acc + (l.confidence || 0), 0) / parsed.lines.length
            : undefined,
        lines: parsed.lines || [],
      }
    } catch (err) {
      if (err instanceof OCRError) throw err
      throw new OCRError(
        `Không thể phân tích kết quả JSON từ PaddleOCR: ${err instanceof Error ? err.message : String(err)}`,
        err
      )
    }
  }
}
