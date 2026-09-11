import type { SecretsService } from '@/services/secrets';
import {
  type AIProvider,
  type AnalysisRequest,
  type AnalysisResult,
  type AnalysisOptions,
  type ModelMetadata,
  type ProviderAvailability,
  type AIUsage,
  type DocumentClassification,
  type SemanticStatus,
  AIError,
} from './types';
import {
  estimateTokenCount,
  HARD_MAX_REQUEST_PROMPT_TOKENS,
} from './context';

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

const VALID_CLASSIFICATIONS = new Set<string>([
  'UNKNOWN',
  'OFFICIAL_DOCUMENT',
  'ANNOUNCEMENT',
  'PLAN',
  'REPORT',
  'MEETING_DOCUMENT',
  'ASSIGNMENT',
  'OTHER',
]);

function normalizeClassification(type: string): DocumentClassification {
  const upper = (type || '').trim().toUpperCase();
  if (VALID_CLASSIFICATIONS.has(upper)) {
    return upper as DocumentClassification;
  }
  if (upper === 'OFFICIAL_NOTICE' || upper === 'NOTICE') {
    return 'OFFICIAL_DOCUMENT';
  }
  return 'OTHER';
}

const QA_SYSTEM_PROMPT = `You are the grounded document intelligence engine for docnoti.
Your task is to answer the user's question accurately, concisely, and naturally based ONLY on the supplied document excerpts.

Document Classification Types (conform to SPEC):
- UNKNOWN
- OFFICIAL_DOCUMENT
- ANNOUNCEMENT
- PLAN
- REPORT
- MEETING_DOCUMENT
- ASSIGNMENT
- OTHER

CRITICAL GROUNDING & EVIDENCE RULES:
1. Answer the user's question directly, clearly, and conversationally in the same language as the question (e.g. Vietnamese if the user asks in Vietnamese).
2. Strict Grounding: Base your answer EXCLUSIVELY on the provided document excerpts.
3. If the excerpts do not contain enough information to answer the question, clearly state that the document does not contain enough information to answer. DO NOT speculate or fabricate facts.
4. Do NOT reference internal system diagnostics (such as RRF, vector scores, chunk IDs, BM25) or say debug text like "Analyzed X containing N pages".
5. Distinguish direct facts from inferences:
   - Mark semantic status as "VERIFIED" when facts are explicitly stated verbatim in the text.
   - Mark semantic status as "INFERRED" when drawing a logical conclusion directly supported by the text.
   - Mark semantic status as "UNCERTAIN" when the text is ambiguous, incomplete, or partially conflicting.
6. Evidence & Citations:
   - For every key claim in your answer, provide an evidence entry with citations.
   - Each citation MUST specify the accurate pageNumber.
   - The sourceText MUST be an EXACT, VERBATIM substring copied directly from that page's text in the excerpts.
   - NEVER fabricate or paraphrase citations. If you cannot quote verbatim, set status to "INFERRED" or "UNCERTAIN".

You MUST respond strictly with valid JSON conforming to the following structure:
{
  "documentType": "REPORT",
  "summary": "Natural, clear, direct answer to the user question.",
  "fields": [],
  "evidences": [
    {
      "claim": "Direct factual claim from the answer",
      "status": "VERIFIED" | "INFERRED" | "UNCERTAIN",
      "confidence": 0.95,
      "citations": [
        {
          "pageNumber": 1,
          "sourceText": "EXACT verbatim quote from the page text"
        }
      ],
      "reasoning": "Brief explanation connecting the claim to the quote"
    }
  ],
  "warnings": []
}
Output pure JSON only, with no markdown formatting fence.`;

const FULL_SUMMARY_SYSTEM_PROMPT = `You are the document analysis intelligence engine for docnoti.
Your task is to analyze document text extracted from pages, identify its document type, and provide an evidence-grounded summary and structured information.

LANGUAGE PREFERENCE:
- By default, provide the summary, claim descriptions, and reasoning in Vietnamese (tiếng Việt).
- Always preserve proper names, project titles, school/institution names, personal names, and technical terms as written in the original document. Do NOT attempt to translate proper names.

Document Classification Types (conform to SPEC):
- UNKNOWN
- OFFICIAL_DOCUMENT
- ANNOUNCEMENT
- PLAN
- REPORT
- MEETING_DOCUMENT
- ASSIGNMENT
- OTHER

You MUST respond strictly with valid JSON conforming to the following structure:
{
  "documentType": "PLAN",
  "summary": "Comprehensive, well-structured summary of the document's content, key points, and context.",
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
  "tasks": [
    {
      "title": "Tên công việc / nhiệm vụ cụ thể",
      "assignee": "Người phụ trách / Đơn vị thực hiện nếu tài liệu nêu rõ, hoặc null",
      "deadline": "Hạn chót nếu có (ví dụ: '15/10/2026', '2026-10-15')",
      "deadlineType": "EXACT" | "RELATIVE" | "AMBIGUOUS" | "NONE",
      "semanticStatus": "VERIFIED" | "INFERRED" | "UNCERTAIN",
      "confidence": 0.95,
      "evidence": {
        "quote": "EXACT verbatim quote from the page text containing the task and deadline",
        "pageNumber": 1
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

CRITICAL RULES FOR TASKS & DEADLINE EXTRACTION:
1. If the document contains any tasks, milestones, action items, work schedules, or deadlines, extract EACH task individually into the "tasks" array.
2. Schedule and Plan tables: READ EVERY ROW. Each row that specifies a task/action + responsible person/department + deadline MUST become a separate object in "tasks".
3. DO NOT merge or collapse multiple rows or tasks into a single general deadline field.
4. DO NOT put tasks into the "fields" array as workaround fields (e.g. NEVER do { name: "Nhiệm vụ: ...", value: "..." } in fields). Tasks MUST be structured in the "tasks" array.
5. "assignee": Extract if explicitly stated in the text (e.g. "Giáo viên bộ môn", "Giáo viên chủ nhiệm", "Phòng Đào tạo"). If not specified, leave null or omit. DO NOT speculate or invent assignees.
6. "deadline": Extract exact date/timeframe as stated in the text. DO NOT fabricate or guess dates.
7. "deadlineType" classification:
   - "EXACT": for specific calendar dates (e.g. "15/10/2026", "2026-10-15", "ngày 20 tháng 10 năm 2026").
   - "RELATIVE": for relative timeframes (e.g. "sau 5 ngày kể từ ngày ký", "trong vòng 1 tuần").
   - "AMBIGUOUS": for unclear or non-specific dates (e.g. "cuối tháng", "sớm nhất có thể").
   - "NONE": if no deadline is mentioned.
8. Ground each task with verbatim "evidence" containing "quote" and "pageNumber".
9. Thorough Inspection of Entire Document (No Lost Endings):
   - You MUST thoroughly inspect all supplied pages from beginning to end, including intermediate chapters and the final concluding pages.
   - Pay special attention to concluding provisions, final chapters, compliance commitments, reporting requirements, and submission duties at the end of regulations, rules, or agreements (e.g. 'nộp bản cam kết', 'báo cáo tuân thủ', 'hoàn thành trước ngày...').
   - Whenever an actionable deadline, submission, or requirement appears on ANY page (including the final page or middle chapters), you MUST extract it as an individual item in the 'tasks' array.

METADATA NORMALIZATION RULES:
- If extracting a "semester" (or "học kỳ") field, normalize "I", "1", "HKI", "Học kỳ 1" to "Học kỳ I"; and "II", "2", "HKII", "Học kỳ 2" to "Học kỳ II".

CRITICAL RULES FOR CITATIONS:
1. Every citation MUST have an accurate pageNumber.
2. The sourceText and quote MUST be an EXACT, VERBATIM substring copied directly from that page's text.
3. NEVER fabricate, paraphrase, or hallucinate quotes. If a fact cannot be quoted verbatim, mark status as "INFERRED" or "UNCERTAIN" with appropriate reasoning.
4. Output pure JSON only.`;

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

  /**
   * Lightweight connection test without burning significant tokens.
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    const apiKey = await this.getApiKey();
    if (!apiKey || apiKey.trim().length === 0) {
      return {
        success: false,
        message: 'Chưa cấu hình OpenAI API key trong Windows Credential Manager.',
      };
    }

    const fetchFn = this.config.fetchFn ?? globalThis.fetch;
    const url = `${this.config.baseUrl.replace(/\/+$/, '')}/chat/completions`;

    try {
      const res = await fetchFn(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [{ role: 'user', content: 'Ping' }],
          max_tokens: 1,
        }),
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          return { success: false, message: 'Khóa API không hợp lệ hoặc không có quyền truy cập (HTTP 401/403).' };
        }
        if (res.status === 429) {
          return { success: false, message: 'Đã vượt giới hạn lượt gọi hoặc hết quota tài khoản OpenAI (HTTP 429).' };
        }
        return { success: false, message: `OpenAI trả về mã lỗi HTTP ${res.status}.` };
      }

      return { success: true, message: `Kết nối thành công tới OpenAI (${this.config.model}).` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, message: `Lỗi kết nối mạng: ${msg}` };
    }
  }

  private buildUserMessage(request: AnalysisRequest): string {
    const isQa = Boolean(request.options?.query);
    const lines: string[] = [];

    if (isQa) {
      lines.push(`USER QUESTION: ${request.options!.query}`);
      lines.push(`Document Title / File Name: ${request.fileName}`);
      lines.push(`Document ID: ${request.documentId}`);
      if (request.options?.preferredLanguage) {
        lines.push(`Preferred Language: ${request.options.preferredLanguage}`);
      }
      lines.push('\n--- SUPPLIED DOCUMENT EXCERPTS ---');
    } else {
      lines.push(`Document Title / File Name: ${request.fileName}`);
      lines.push(`MIME Type: ${request.mimeType}`);
      lines.push(`Document ID: ${request.documentId}`);
      if (request.options?.preferredLanguage) {
        lines.push(`Preferred Language: ${request.options.preferredLanguage}`);
      }
      lines.push('\n--- DOCUMENT PAGES ---');
    }

    for (const page of request.pages) {
      lines.push(`\n=== Page ${page.pageNumber} ===\n${page.text}`);
    }

    if (!isQa) {
      lines.push('\n--- ANALYSIS INSTRUCTION ---');
      lines.push('Analyze all supplied pages from Page 1 to the final page. Thoroughly extract any tasks, commitments, obligations, or deadlines across all pages into the "tasks" array before generating your response.');
    }

    return lines.filter(Boolean).join('\n');
  }

  private validateParsedResponse(parsed: unknown): asserts parsed is {
    documentType: string;
    summary: string;
    fields: unknown[];
    tasks?: unknown[];
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

    if (typeof obj.summary !== 'string' && typeof obj.answer === 'string') {
      obj.summary = obj.answer;
    } else if (typeof obj.answer !== 'string' && typeof obj.summary === 'string') {
      obj.answer = obj.summary;
    }

    if (typeof obj.summary !== 'string') {
      throw new AIError('Model output missing valid summary', 'MALFORMED_RESPONSE', this.id, false);
    }

    if (!Array.isArray(obj.fields)) {
      obj.fields = [];
    } else {
      // Normalize semester field if present
      for (const f of obj.fields) {
        if (f && typeof f === 'object') {
          const fieldObj = f as Record<string, unknown>;
          const name = String(fieldObj.name || '').trim().toLowerCase();
          if (
            name === 'semester' ||
            name === 'hoc_ky' ||
            name === 'học kỳ' ||
            name === 'hoc ky' ||
            name === 'học kì' ||
            name === 'hoc ki'
          ) {
            const rawVal = String(fieldObj.value ?? '').trim();
            const upper = rawVal.toUpperCase();
            if (
              upper === 'I' ||
              upper === '1' ||
              upper === 'HKI' ||
              upper === 'HK 1' ||
              upper === 'HK I' ||
              upper === 'HỌC KỲ I' ||
              upper === 'HỌC KỲ 1' ||
              upper === 'HỌC KÌ I' ||
              upper === 'HỌC KÌ 1' ||
              upper === 'SEMESTER 1' ||
              upper === 'SEMESTER I'
            ) {
              fieldObj.value = 'Học kỳ I';
            } else if (
              upper === 'II' ||
              upper === '2' ||
              upper === 'HKII' ||
              upper === 'HK 2' ||
              upper === 'HK II' ||
              upper === 'HỌC KỲ II' ||
              upper === 'HỌC KỲ 2' ||
              upper === 'HỌC KÌ II' ||
              upper === 'HỌC KÌ 2' ||
              upper === 'SEMESTER 2' ||
              upper === 'SEMESTER II'
            ) {
              fieldObj.value = 'Học kỳ II';
            }
          }
        }
      }
    }

    if (obj.tasks !== undefined) {
      if (!Array.isArray(obj.tasks)) {
        obj.tasks = [];
      } else {
        // Validate structured task objects
        obj.tasks = obj.tasks.filter((t: any) => {
          return t && typeof t === 'object' && typeof t.title === 'string' && t.title.trim().length > 0;
        });
      }
    }

    if (!Array.isArray(obj.evidences)) {
      if (Array.isArray(obj.evidence)) {
        obj.evidences = obj.evidence;
      } else {
        throw new AIError('Model output missing evidences array', 'MALFORMED_RESPONSE', this.id, false);
      }
    }
  }

  private async executeCall(apiKey: string, request: AnalysisRequest): Promise<AnalysisResult> {
    const fetchFn = this.config.fetchFn ?? globalThis.fetch;
    const url = `${this.config.baseUrl.replace(/\/+$/, '')}/chat/completions`;

    const userMessage = this.buildUserMessage(request);
    const systemPrompt = request.options?.query ? QA_SYSTEM_PROMPT : FULL_SUMMARY_SYSTEM_PROMPT;

    // Pre-flight prompt token budget guardrail: halt oversized payloads locally without sending to OpenAI
    const estimatedPromptTokens =
      estimateTokenCount(systemPrompt) + estimateTokenCount(userMessage);
    if (estimatedPromptTokens > HARD_MAX_REQUEST_PROMPT_TOKENS) {
      throw new AIError(
        'Ngữ cảnh tài liệu quá lớn. Hệ thống đã tự động thu gọn các đoạn liên quan.',
        'CONTEXT_LENGTH_EXCEEDED',
        this.id,
        false
      );
    }

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
            { role: 'system', content: systemPrompt },
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
        // Do NOT retry oversized requests that breached token limit (TPM).
        // Only transient rate limits (RPM / concurrency) should be eligible for retry.
        const isTokenLimitExceeded =
          errorText.includes('rate_limit_exceeded') ||
          errorText.includes('tokens per min') ||
          errorText.includes('TPM') ||
          errorText.includes('Requested:');

        throw new AIError(
          `OpenAI rate limit exceeded (${res.status}): ${errorText}`,
          'RATE_LIMIT',
          this.id,
          !isTokenLimitExceeded
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
        `OpenAI request failed with status ${res.status}: ${errorText}`,
        'API_ERROR',
        this.id,
        false
      );
    }

    let data: any;
    try {
      data = await res.json();
    } catch {
      throw new AIError('Failed to parse OpenAI response body as JSON', 'MALFORMED_RESPONSE', this.id, false);
    }

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

    const docType = normalizeClassification(parsed.documentType);
    const rawConfidence = (parsed as any).confidence;
    const confidence: SemanticStatus =
      rawConfidence === 'VERIFIED' || rawConfidence === 'INFERRED' || rawConfidence === 'UNCERTAIN'
        ? rawConfidence
        : 'VERIFIED';

    return {
      documentId: request.documentId,
      documentType: docType,
      summary: parsed.summary,
      answer: (parsed as any).answer || parsed.summary,
      confidence,
      fields: (parsed.fields as any) || [],
      tasks: (parsed as any).tasks || undefined,
      evidences: (parsed.evidences as any) || [],
      warnings: (parsed.warnings as any) || [],
      provider: this.metadata.providerId,
      model: this.metadata.modelId,
      usage,
      analyzedAt: new Date().toISOString(),
    };
  }

  async analyze(request: AnalysisRequest, options?: AnalysisOptions): Promise<AnalysisResult> {
    const effectiveRequest: AnalysisRequest = options
      ? { ...request, options: { ...request.options, ...options } }
      : request;

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
        return await this.executeCall(apiKey, effectiveRequest);
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
