import type { SecretsService } from '@/services/secrets';
import {
  type AIProvider,
  type AnalysisRequest,
  type AnalysisResult,
  type ModelMetadata,
  type ProviderAvailability,
  type AIUsage,
  AIError,
} from './types';

export interface OpenAIProviderConfig {
  apiKeySecretKey?: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  fetchFn?: typeof fetch;
}

const DEFAULT_CONFIG: Required<Omit<OpenAIProviderConfig, 'fetchFn'>> = {
  apiKeySecretKey: 'openai_api_key',
  model: 'gpt-4o-mini',
  baseUrl: 'https://api.openai.com/v1',
  timeoutMs: 30000,
  maxRetries: 2,
};

const SYSTEM_PROMPT = `You are the document analysis intelligence engine for docnoti.
Your task is to analyze document text extracted from pages and output structured JSON.

Document Types:
- INVOICE
- CONTRACT
- OFFICIAL_NOTICE
- RECEIPT
- BANK_STATEMENT
- TAX_DOCUMENT
- REPORT
- OTHER

You MUST respond strictly with valid JSON conforming to the following structure:
{
  "documentType": "INVOICE",
  "summary": "Brief 1-3 sentence summary of the document.",
  "fields": [
    {
      "name": "field_name",
      "value": "extracted value or null",
      "semanticStatus": "VERIFIED" | "INFERRED" | "UNCERTAIN",
      "confidence": 0.95,
      "evidence": {
        "claim": "What is claimed",
        "status": "VERIFIED" | "INFERRED" | "UNCERTAIN",
        "confidence": 0.95,
        "citations": [
          {
            "pageNumber": 1,
            "sourceText": "EXACT verbatim quote from the page text"
          }
        ],
        "reasoning": "Reasoning for the field extraction"
      }
    }
  ],
  "evidences": [
    {
      "claim": "Key document fact or verification point",
      "status": "VERIFIED" | "INFERRED" | "UNCERTAIN",
      "confidence": 0.95,
      "citations": [
        {
          "pageNumber": 1,
          "sourceText": "EXACT verbatim quote from the page text"
        }
      ],
      "reasoning": "Context or reasoning"
    }
  ],
  "warnings": []
}

CRITICAL RULES FOR CITATIONS:
1. Every citation MUST have an accurate pageNumber.
2. The sourceText MUST be an EXACT, VERBATIM substring copied directly from that page's text.
3. NEVER fabricate, paraphrase, or hallucinate quotes. If a fact cannot be quoted verbatim, mark status as "INFERRED" or "UNCERTAIN" with appropriate reasoning.
4. Do NOT include markdown code blocks or explanations outside the JSON object. Output pure JSON only.`;

export class OpenAIProvider implements AIProvider {
  readonly id = 'openai';
  private secretsService: SecretsService;
  private config: Required<Omit<OpenAIProviderConfig, 'fetchFn'>> & { fetchFn?: typeof fetch };

  constructor(secretsService: SecretsService, config: OpenAIProviderConfig = {}) {
    this.secretsService = secretsService;
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
  }

  get metadata(): ModelMetadata {
    return {
      providerId: 'openai',
      modelId: this.config.model,
      displayName: `OpenAI ${this.config.model}`,
      contextWindow: 128000,
      isLocal: false,
    };
  }

  private async getApiKey(): Promise<string | null> {
    return this.secretsService.getSecret(this.config.apiKeySecretKey);
  }

  async isAvailable(): Promise<ProviderAvailability> {
    const apiKey = await this.getApiKey();
    if (!apiKey || apiKey.trim().length === 0) {
      return {
        available: false,
        reason: 'OpenAI API key is not configured in secrets store',
      };
    }
    return { available: true };
  }

  private buildUserMessage(request: AnalysisRequest): string {
    const lines: string[] = [
      `Document Title / File Name: ${request.fileName}`,
      `MIME Type: ${request.mimeType}`,
      `Document ID: ${request.documentId}`,
      request.options?.preferredLanguage ? `Preferred Language: ${request.options.preferredLanguage}` : '',
      '\n--- DOCUMENT PAGES ---',
    ];

    for (const page of request.pages) {
      lines.push(`\n=== Page ${page.pageNumber} ===\n${page.text}`);
    }

    return lines.filter(Boolean).join('\n');
  }

  private validateParsedResponse(parsed: unknown): asserts parsed is {
    documentType: string;
    summary: string;
    fields: unknown[];
    evidences: unknown[];
    warnings?: unknown[];
  } {
    if (!parsed || typeof parsed !== 'object') {
      throw new AIError('Model output is not a JSON object', 'MALFORMED_RESPONSE', this.id, false);
    }

    const obj = parsed as Record<string, unknown>;

    if (typeof obj.documentType !== 'string' || obj.documentType.trim().length === 0) {
      throw new AIError('Model output missing valid documentType', 'MALFORMED_RESPONSE', this.id, false);
    }

    if (typeof obj.summary !== 'string') {
      throw new AIError('Model output missing valid summary', 'MALFORMED_RESPONSE', this.id, false);
    }

    if (!Array.isArray(obj.fields)) {
      throw new AIError('Model output missing fields array', 'MALFORMED_RESPONSE', this.id, false);
    }

    if (!Array.isArray(obj.evidences)) {
      throw new AIError('Model output missing evidences array', 'MALFORMED_RESPONSE', this.id, false);
    }
  }

  private async executeCall(apiKey: string, request: AnalysisRequest): Promise<AnalysisResult> {
    const fetchFn = this.config.fetchFn ?? globalThis.fetch;
    const url = `${this.config.baseUrl.replace(/\/+$/, '')}/chat/completions`;

    const userMessage = this.buildUserMessage(request);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    let res: Response;
    try {
      res = await fetchFn(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          response_format: { type: 'json_object' },
          temperature: request.options?.temperature ?? 0.1,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userMessage },
          ],
        }),
        signal: controller.signal,
      });
    } catch (err: unknown) {
      const error = err as Error;
      if (error.name === 'AbortError' || error.message?.includes('aborted') || error.message?.includes('timeout')) {
        throw new AIError(`Request to OpenAI timed out after ${this.config.timeoutMs}ms`, 'TIMEOUT_ERROR', this.id, true);
      }
      throw new AIError(`Network error while contacting OpenAI: ${error.message}`, 'NETWORK_ERROR', this.id, true);
    } finally {
      clearTimeout(timeoutId);
    }

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');

      if (res.status === 401 || res.status === 403) {
        throw new AIError(
          `OpenAI authentication failed (${res.status}): invalid API key or missing permissions.`,
          'AUTH_ERROR',
          this.id,
          false
        );
      }

      if (res.status === 429) {
        throw new AIError(
          `OpenAI rate limit exceeded (${res.status}): ${errorText}`,
          'RATE_LIMIT',
          this.id,
          true
        );
      }

      if (res.status === 408) {
        throw new AIError(
          `OpenAI request timed out (${res.status}): ${errorText}`,
          'TIMEOUT_ERROR',
          this.id,
          true
        );
      }

      if (res.status >= 500) {
        throw new AIError(
          `OpenAI server error (${res.status}): ${errorText}`,
          'API_ERROR',
          this.id,
          true
        );
      }

      throw new AIError(
        `OpenAI API error (${res.status}): ${errorText}`,
        'API_ERROR',
        this.id,
        false
      );
    }

    const data = await res.json() as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      throw new AIError('OpenAI returned empty message content', 'MALFORMED_RESPONSE', this.id, false);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (parseErr) {
      throw new AIError(
        `Failed to parse OpenAI response as JSON: ${(parseErr as Error).message}`,
        'MALFORMED_RESPONSE',
        this.id,
        false
      );
    }

    this.validateParsedResponse(parsed);

    let usage: AIUsage | undefined;
    if (
      data.usage &&
      typeof data.usage.prompt_tokens === 'number' &&
      typeof data.usage.completion_tokens === 'number' &&
      typeof data.usage.total_tokens === 'number'
    ) {
      usage = {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      };
    }

    return {
      documentId: request.documentId,
      documentType: parsed.documentType as any,
      summary: parsed.summary,
      fields: parsed.fields as any,
      evidences: parsed.evidences as any,
      warnings: (parsed.warnings as any) || [],
      provider: this.metadata.providerId,
      model: this.metadata.modelId,
      usage,
      analyzedAt: new Date().toISOString(),
    };
  }

  async analyze(request: AnalysisRequest): Promise<AnalysisResult> {
    const availability = await this.isAvailable();
    if (!availability.available) {
      throw new AIError(
        availability.reason ?? 'OpenAI provider is unavailable',
        'MISSING_CONFIG',
        this.id,
        false
      );
    }

    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new AIError('API key is missing', 'MISSING_CONFIG', this.id, false);
    }

    let lastError: Error | null = null;
    const maxAttempts = Math.max(1, this.config.maxRetries + 1);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.executeCall(apiKey, request);
      } catch (err: unknown) {
        lastError = err as Error;

        if (err instanceof AIError) {
          // Non-retryable errors must abort immediately
          if (!err.retryable) {
            throw err;
          }

          if (attempt >= maxAttempts) {
            throw err;
          }

          // Backoff before retry
          const backoffMs = attempt * 150;
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          continue;
        }

        // Unknown error: treat as non-retryable
        throw err;
      }
    }

    throw lastError ?? new AIError('OpenAI call failed after retries', 'API_ERROR', this.id, false);
  }
}
