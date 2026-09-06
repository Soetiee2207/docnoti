export interface EmbeddingMetadata {
  model: string
  dimensions: number
  version: string
  license: string
}

export interface ChunkEmbeddingInput {
  chunkId: string
  content: string
}

export interface ChunkEmbeddingResult {
  chunkId: string
  vector: number[]
}

export interface EmbeddingProvider {
  readonly name: string
  readonly model: string
  readonly dimensions: number

  getMetadata(): EmbeddingMetadata
  embedChunks(chunks: ChunkEmbeddingInput[]): Promise<ChunkEmbeddingResult[]>
  embedText(text: string): Promise<number[]>
  isAvailable(): Promise<boolean>
}

export class EmbeddingError extends Error {
  readonly code: string
  readonly retryable: boolean

  constructor(message: string, code: string = "EMBEDDING_ERROR", retryable: boolean = true) {
    super(message)
    this.name = "EmbeddingError"
    this.code = code
    this.retryable = retryable
  }
}
