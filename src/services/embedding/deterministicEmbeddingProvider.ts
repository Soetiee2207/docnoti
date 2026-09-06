import type {
  EmbeddingProvider,
  EmbeddingMetadata,
  ChunkEmbeddingInput,
  ChunkEmbeddingResult,
} from "./types"

export class DeterministicEmbeddingProvider implements EmbeddingProvider {
  readonly name = "DeterministicEmbeddingProvider"
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

  async isAvailable(): Promise<boolean> {
    return true
  }

  async embedText(text: string): Promise<number[]> {
    return this.generateVector(text)
  }

  async embedChunks(chunks: ChunkEmbeddingInput[]): Promise<ChunkEmbeddingResult[]> {
    return chunks.map((chunk) => ({
      chunkId: chunk.chunkId,
      vector: this.generateVector(chunk.content),
    }))
  }

  /**
   * Generates a deterministic, L2-normalized 1024-dimensional vector from input text.
   * Uses dual 32-bit hashing combined with a centered LCG to generate consistent vectors.
   */
  private generateVector(text: string): number[] {
    let h1 = 0x811c9dc5
    let h2 = 0x1a2b3c4d

    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i)
      h1 = Math.imul(h1 ^ code, 0x01000193)
      h2 = Math.imul(h2 ^ (code << 3), 0x5bd1e995)
    }

    let seed = (h1 ^ h2) >>> 0
    const raw: number[] = new Array(this.dimensions)
    let sumSquares = 0

    for (let i = 0; i < this.dimensions; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      const val = (seed / 4294967295) * 2 - 1
      raw[i] = val
      sumSquares += val * val
    }

    const norm = Math.sqrt(sumSquares) || 1
    for (let i = 0; i < this.dimensions; i++) {
      raw[i] = raw[i] / norm
    }

    return raw
  }
}
