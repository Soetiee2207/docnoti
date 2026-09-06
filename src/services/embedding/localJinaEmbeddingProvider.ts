import { invoke } from "@tauri-apps/api/core"
import type {
  EmbeddingProvider,
  EmbeddingMetadata,
  ChunkEmbeddingInput,
  ChunkEmbeddingResult,
} from "./types"
import { EmbeddingError } from "./types"

function isTauriEnvironment(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
  )
}

export class LocalJinaEmbeddingProvider implements EmbeddingProvider {
  readonly name = "LocalJinaEmbeddingProvider"
  readonly model = "jina-embeddings-v5-text-small"
  readonly dimensions = 1024
  readonly version = "1.0.0"
  readonly license = "CC BY-NC 4.0"

  getMetadata(): EmbeddingMetadata {
    return {
      model: this.model,
      dimensions: this.dimensions,
      version: this.version,
      license: this.license,
    }
  }

  /**
   * Verifies if local model weights and runner are available without accessing the network.
   */
  async isAvailable(): Promise<boolean> {
    if (isTauriEnvironment()) {
      try {
        return await invoke<boolean>("check_embedding_available")
      } catch {
        return false
      }
    }

    try {
      const { spawnSync } = await import("node:child_process")
      const res = spawnSync("python", ["scripts/embedding_runner.py", "--check"], {
        encoding: "utf-8",
        stdio: "pipe",
      })
      return res.status === 0
    } catch {
      return false
    }
  }

  async embedText(text: string): Promise<number[]> {
    const results = await this.embedChunks([{ chunkId: "query", content: text }])
    if (results.length === 0 || !results[0].vector) {
      throw new EmbeddingError("Failed to generate embedding for text", "EMBEDDING_FAILED")
    }
    return results[0].vector
  }

  async embedChunks(chunks: ChunkEmbeddingInput[]): Promise<ChunkEmbeddingResult[]> {
    if (chunks.length === 0) {
      return []
    }

    const available = await this.isAvailable()
    if (!available) {
      throw new EmbeddingError(
        `Local model weights for '${this.model}' are not present on disk. ` +
          "In accordance with local-first privacy rules, model weights must be pre-downloaded.",
        "MODEL_WEIGHTS_MISSING",
        false
      )
    }

    // Execute via child_process or Tauri IPC
    try {
      const { spawnSync } = await import("node:child_process")
      const { writeFileSync, unlinkSync, readFileSync } = await import("node:fs")
      const { tmpdir } = await import("node:os")
      const { join } = await import("node:path")

      const tempIn = join(tmpdir(), `embed_in_${Date.now()}_${Math.random().toString(36).slice(2)}.json`)
      const tempOut = join(tmpdir(), `embed_out_${Date.now()}_${Math.random().toString(36).slice(2)}.json`)

      writeFileSync(tempIn, JSON.stringify({ chunks }), "utf-8")

      const res = spawnSync(
        "python",
        ["scripts/embedding_runner.py", "--input", tempIn, "--output", tempOut],
        { encoding: "utf-8", stdio: "pipe" }
      )

      try {
        unlinkSync(tempIn)
      } catch {
        // ignore
      }

      if (res.status !== 0) {
        throw new EmbeddingError(
          `Embedding runner exited with code ${res.status}: ${res.stderr || res.stdout}`,
          "RUNNER_ERROR"
        )
      }

      const rawOut = readFileSync(tempOut, "utf-8")
      try {
        unlinkSync(tempOut)
      } catch {
        // ignore
      }

      const parsed = JSON.parse(rawOut)
      if (!parsed.success) {
        throw new EmbeddingError(parsed.error || "Runner failed", "RUNNER_FAILURE")
      }

      return parsed.results as ChunkEmbeddingResult[]
    } catch (err) {
      if (err instanceof EmbeddingError) throw err
      throw new EmbeddingError(
        `Failed to run local embedding inference: ${err instanceof Error ? err.message : String(err)}`,
        "INFERENCE_FAILED"
      )
    }
  }
}
