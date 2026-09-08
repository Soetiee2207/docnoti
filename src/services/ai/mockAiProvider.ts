import type {
  AIProvider,
  AnalysisRequest,
  AnalysisResult,
  AnalysisOptions,
  DocumentClassification,
  ModelMetadata,
  ProviderAvailability,
  ExtractedField,
  AnalysisEvidence,
  ExtractedTask,
} from './types';

export interface MockAIProviderOptions {
  available?: boolean;
  unavailableReason?: string;
  simulatedClassification?: DocumentClassification;
  simulatedSummary?: string;
  simulatedFields?: ExtractedField[];
  simulatedTasks?: ExtractedTask[];
  simulatedEvidences?: AnalysisEvidence[];
  injectInvalidEvidence?: boolean;
}

export class MockAIProvider implements AIProvider {
  readonly id = 'mock-ai-provider';
  readonly metadata: ModelMetadata = {
    providerId: 'mock-ai-provider',
    modelId: 'mock-doc-v1',
    displayName: 'Mock AI Provider (Deterministic)',
    contextWindow: 128000,
    isLocal: true,
  };

  private options: MockAIProviderOptions;

  constructor(options: MockAIProviderOptions = {}) {
    this.options = options;
  }

  setOptions(options: MockAIProviderOptions): void {
    this.options = { ...this.options, ...options };
  }

  async isAvailable(): Promise<ProviderAvailability> {
    if (this.options.available === false) {
      return {
        available: false,
        reason: this.options.unavailableReason ?? 'Mock AI provider is configured as unavailable',
      };
    }
    return { available: true };
  }

  async analyze(request: AnalysisRequest, options?: AnalysisOptions): Promise<AnalysisResult> {
    const availability = await this.isAvailable();
    if (!availability.available) {
      throw new Error(`Provider unavailable: ${availability.reason}`);
    }

    const effectiveRequest: AnalysisRequest = options
      ? { ...request, options: { ...request.options, ...options } }
      : request;

    const firstPage = effectiveRequest.pages[0];
    const pageNumber = firstPage?.pageNumber ?? 1;
    const pageText = firstPage?.text ?? '';

    // Take a deterministic slice from the first page text if available for evidence quote
    const sampleWords = pageText.trim().split(/\s+/).slice(0, 6).join(' ');
    const evidenceText = this.options.injectInvalidEvidence
      ? 'THIS TEXT DOES NOT EXIST ANYWHERE IN THE ORIGINAL DOCUMENT'
      : (sampleWords || 'Sample text excerpt');

    const classification: DocumentClassification = this.options.simulatedClassification ?? 'REPORT';
    let summary = this.options.simulatedSummary;
    if (!summary) {
      if (request.options?.query) {
        summary = `Dựa trên nội dung trích xuất từ tài liệu "${request.fileName}", thông tin về "${request.options.query}" được ghi nhận với các nội dung chính: "${sampleWords}".`;
      } else {
        summary = `Bản tóm tắt tổng quan cho tài liệu "${request.fileName}" gồm ${request.pages.length} trang.`;
      }
    }

    const fields: ExtractedField[] = this.options.simulatedFields ?? [
      {
        name: 'title',
        value: request.fileName,
        semanticStatus: 'INFERRED',
        confidence: 0.95,
        evidence: {
          claim: `Document title derived from file name: ${request.fileName}`,
          status: 'INFERRED',
          confidence: 0.95,
          citations: [
            {
              pageNumber,
              sourceText: evidenceText,
            },
          ],
          reasoning: 'Derived from document header and filename.',
        },
      },
    ];

    const evidences: AnalysisEvidence[] = this.options.simulatedEvidences ?? [
      {
        claim: 'Document content verified from page text',
        status: 'VERIFIED',
        confidence: 0.98,
        citations: [
          {
            pageNumber,
            sourceText: evidenceText,
          },
        ],
        reasoning: 'Extracted directly from page content.',
      },
    ];

    return {
      documentId: request.documentId,
      documentType: classification,
      summary,
      fields,
      tasks: this.options.simulatedTasks,
      evidences,
      warnings: [],
      provider: this.metadata.providerId,
      model: this.metadata.modelId,
      usage: {
        promptTokens: 150,
        completionTokens: 80,
        totalTokens: 230,
      },
      analyzedAt: new Date().toISOString(),
    };
  }
}
