export type SemanticStatus = 'VERIFIED' | 'INFERRED' | 'UNCERTAIN';

export type DocumentClassification =
  | 'INVOICE'
  | 'CONTRACT'
  | 'OFFICIAL_NOTICE'
  | 'RECEIPT'
  | 'BANK_STATEMENT'
  | 'TAX_DOCUMENT'
  | 'REPORT'
  | 'OTHER';

export interface AnalysisCitation {
  pageNumber: number;
  sourceText: string;
  context?: string;
  charStart?: number;
  charEnd?: number;
}

export interface AnalysisEvidence {
  claim: string;
  status: SemanticStatus;
  confidence: number; // 0.0 to 1.0
  citations: AnalysisCitation[];
  reasoning?: string;
}

export interface AnalysisWarning {
  code: string;
  message: string;
  field?: string;
  pageNumber?: number;
  severity: 'INFO' | 'WARNING' | 'ERROR';
}

export interface ExtractedField {
  name: string;
  value: string | number | boolean | null;
  semanticStatus: SemanticStatus;
  confidence: number;
  evidence: AnalysisEvidence;
}

export interface AIUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd?: number;
}

export interface ModelMetadata {
  providerId: string;
  modelId: string;
  displayName: string;
  contextWindow: number;
  isLocal: boolean;
}

export interface DocumentPageInput {
  pageNumber: number;
  text: string;
}

export interface AnalysisRequest {
  documentId: string;
  fileName: string;
  mimeType: string;
  pages: DocumentPageInput[];
  options?: {
    preferredLanguage?: string;
    temperature?: number;
    forceRefresh?: boolean;
  };
}

export interface AnalysisResult {
  documentId: string;
  documentType: DocumentClassification;
  summary: string;
  fields: ExtractedField[];
  evidences: AnalysisEvidence[];
  warnings: AnalysisWarning[];
  provider: string;
  model: string;
  usage?: AIUsage;
  analyzedAt: string;
}

export interface ProviderAvailability {
  available: boolean;
  reason?: string;
}

export interface AIProvider {
  readonly id: string;
  readonly metadata: ModelMetadata;
  isAvailable(): Promise<ProviderAvailability>;
  analyze(request: AnalysisRequest): Promise<AnalysisResult>;
}

export class AIError extends Error {
  code: string;
  providerId?: string;
  retryable: boolean;

  constructor(message: string, code: string = 'AI_ERROR', providerId?: string, retryable: boolean = false) {
    super(message);
    this.name = 'AIError';
    this.code = code;
    this.providerId = providerId;
    this.retryable = retryable;
  }
}
