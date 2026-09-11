import type { DocumentRecord, DocumentPageRecord, DocumentAnalysisRecord } from '@/db/schema';
import type { DocumentRepository } from '@/repositories/documentRepository';
import type { DocumentPageRepository } from '@/repositories/documentPageRepository';
import type { AnalysisRepository } from '@/repositories/analysisRepository';
import type { HybridRetrievalService, HybridRetrievalResult } from '@/services/retrieval';
import type { TaskExtractionService } from '@/services/tasks/taskExtractionService';
import {
  ContextBuilder,
  type BuiltContext,
  type ContextBudgetConfig,
  DEFAULT_SUMMARY_TOKEN_BUDGET,
} from './context';

import type {
  AIProvider,
  AnalysisRequest,
  AnalysisResult,
  AnalysisWarning,
  AnalysisEvidence,
  ExtractedField,
} from './types';

export interface AnalysisServiceDeps {
  aiProvider: AIProvider | (() => AIProvider);
  analysisRepo?: AnalysisRepository;
  documentRepo?: DocumentRepository;
  pageRepo?: DocumentPageRepository;
  hybridRetrievalService?: HybridRetrievalService;
  contextBuilder?: ContextBuilder;
  taskExtractionService?: TaskExtractionService;
}

export interface AnalyzeDocumentOptions {
  preferredLanguage?: string;
  forceRefresh?: boolean;
  query?: string;
  mode?: 'retrieval' | 'full';
  budget?: ContextBudgetConfig;
  minVectorScore?: number;
}

export interface AnalyzeDocumentResult {
  result: AnalysisResult;
  record?: DocumentAnalysisRecord;
  context?: BuiltContext;
}

export class AnalysisService {
  private aiProvider: AIProvider | (() => AIProvider);
  private analysisRepo?: AnalysisRepository;
  private documentRepo?: DocumentRepository;
  private pageRepo?: DocumentPageRepository;
  private hybridRetrievalService?: HybridRetrievalService;
  private contextBuilder: ContextBuilder;
  private taskExtractionService?: TaskExtractionService;

  constructor(deps: AnalysisServiceDeps) {
    this.aiProvider = deps.aiProvider;
    this.analysisRepo = deps.analysisRepo;
    this.documentRepo = deps.documentRepo;
    this.pageRepo = deps.pageRepo;
    this.hybridRetrievalService = deps.hybridRetrievalService;
    this.contextBuilder = deps.contextBuilder ?? new ContextBuilder();
    this.taskExtractionService = deps.taskExtractionService;
  }

  getProvider(): AIProvider {
    return typeof this.aiProvider === 'function' ? this.aiProvider() : this.aiProvider;
  }

  setProvider(provider: AIProvider | (() => AIProvider)): void {
    this.aiProvider = provider;
  }

  getContextBuilder(): ContextBuilder {
    return this.contextBuilder;
  }

  setContextBuilder(builder: ContextBuilder): void {
    this.contextBuilder = builder;
  }

  setHybridRetrievalService(service: HybridRetrievalService): void {
    this.hybridRetrievalService = service;
  }

  hasTaskExtractionService(): boolean {
    return Boolean(this.taskExtractionService);
  }

  setTaskExtractionService(service: TaskExtractionService): void {
    this.taskExtractionService = service;
  }

  /**
   * Budgets document pages for full-document summary mode using a 4-Tier Layered Strategy:
   *
   * Tier 1 (Mandatory Anchors):
   * - Front pages (Cover, Table of Contents, Introduction)
   * - Final pages (Conclusions, Closing provisions, Commitments, Signatures)
   * - Guarantees that neither start nor conclusion is ever dropped when budget is packed.
   *
   * Tier 2 (High-Signal Density Pages):
   * - Scans intermediate pages for actionable signals (dates, deadlines, milestones, tasks).
   * - Prioritizes key actionable sections without letting them monopolize coverage.
   *
   * Tier 3 (Dynamic Uniform Grid - Zero Blind Spots):
   * - Divides the middle section into dynamic uniform intervals.
   * - Picks representative samples across every sector of the document.
   * - Eliminates fixed gap blind spots (such as the previous 0.45 -> 0.60 void).
   *
   * Tier 4 (Deterministic Budget Enforcement):
   * - Guarantees that total characters strictly respect maxCharacters (never overflowing token budget).
   * - Keeps whole pages intact (never slicing provenance).
   */
  prepareBudgetedSummaryPages(
    pages: DocumentPageRecord[],
    maxCharacters: number = DEFAULT_SUMMARY_TOKEN_BUDGET.maxContextCharacters
  ): {
    selectedPages: DocumentPageRecord[];
    isSampled: boolean;
    totalOriginalChars: number;
    diagnostics?: {
      totalPages: number;
      selectedCount: number;
      frontCount: number;
      backCount: number;
      signalCount: number;
      gridCount: number;
      totalChars: number;
      budgetChars: number;
      pageDistribution: number[];
    };
  } {
    const sortedPages = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
    const totalOriginalChars = sortedPages.reduce(
      (acc, p) => acc + (p.textContent?.length ?? 0),
      0
    );

    if (totalOriginalChars <= maxCharacters) {
      return {
        selectedPages: sortedPages,
        isSampled: false,
        totalOriginalChars,
        diagnostics: {
          totalPages: sortedPages.length,
          selectedCount: sortedPages.length,
          frontCount: sortedPages.length,
          backCount: 0,
          signalCount: 0,
          gridCount: 0,
          totalChars: totalOriginalChars,
          budgetChars: maxCharacters,
          pageDistribution: sortedPages.map((p) => p.pageNumber),
        },
      };
    }

    // Document exceeds safe summary budget. Apply 4-Tier Layered Selection.
    const frontCount = Math.min(sortedPages.length, 4);
    const frontPages = sortedPages.slice(0, frontCount);

    const backCount = Math.min(3, Math.max(0, sortedPages.length - frontCount));
    const backPages = sortedPages.slice(sortedPages.length - backCount);

    const middlePages = sortedPages.slice(frontCount, sortedPages.length - backCount);

    // Reserved anchors: Front + Back
    const anchorMap = new Map<number, DocumentPageRecord>();
    for (const p of frontPages) anchorMap.set(p.pageNumber, p);
    for (const p of backPages) anchorMap.set(p.pageNumber, p);

    const anchorChars = Array.from(anchorMap.values()).reduce(
      (acc, p) => acc + (p.textContent?.length ?? 0),
      0
    );

    // If anchors alone exceed budget (extremely dense front/back pages):
    if (anchorChars > maxCharacters) {
      const trimmedAnchors: DocumentPageRecord[] = [];
      let currentLen = 0;
      // Guarantee at least page 1 and the last page if possible
      const essential = [frontPages[0]!, backPages[backPages.length - 1]!].filter(Boolean);
      for (const p of essential) {
        if (currentLen + (p.textContent?.length ?? 0) <= maxCharacters) {
          trimmedAnchors.push(p);
          currentLen += p.textContent?.length ?? 0;
        }
      }
      return {
        selectedPages: trimmedAnchors.sort((a, b) => a.pageNumber - b.pageNumber),
        isSampled: true,
        totalOriginalChars,
      };
    }

    // Tier 2: Content Signal Scoring on Middle Pages
    const signalRegex = /\b(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}|hạn chót|thời hạn|deadline|trước ngày|trong vòng|đến ngày|ngày \d{1,2}|tháng \d{1,2})\b/gi;
    const actionRegex = /\b(nhiệm vụ|phân công|giao cho|chủ trì|phối hợp|hoàn thành|báo cáo|nộp|cam kết|tiểu luận|đề tài|nghiệm thu|kết luận)\b/gi;

    const scoredMiddlePages = middlePages.map((p) => {
      const text = p.textContent ?? "";
      const dateMatches = (text.match(signalRegex) || []).length;
      const actionMatches = (text.match(actionRegex) || []).length;
      const score = dateMatches * 3 + actionMatches * 2;
      return { page: p, score };
    });

    const highSignalPages = scoredMiddlePages
      .filter((sp) => sp.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((sp) => sp.page);

    // Allocate remaining budget across middle pages
    let remainingBudget = maxCharacters - anchorChars;
    const avgPageLen = Math.max(1, Math.round(totalOriginalChars / sortedPages.length));
    const allowedMiddlePages = Math.max(1, Math.floor(remainingBudget / avgPageLen));

    // Dedicate up to 40% of middle quota to high-signal hotspots (dates/tasks/deadlines)
    const signalQuota = Math.min(highSignalPages.length, Math.max(1, Math.floor(allowedMiddlePages * 0.4)));
    const gridQuota = Math.max(2, allowedMiddlePages - signalQuota);

    // Uniformly distribute grid across the entire span of middlePages from start to finish
    const gridPages: DocumentPageRecord[] = [];
    if (middlePages.length > 0) {
      const step = middlePages.length / gridQuota;
      for (let i = 0; i < gridQuota; i++) {
        const centerIdx = Math.min(middlePages.length - 1, Math.floor((i + 0.5) * step));
        gridPages.push(middlePages[centerIdx]!);
      }
    }

    const selectedMiddleMap = new Map<number, DocumentPageRecord>();

    // Add high-signal pages first to capture crucial actionable milestones
    for (let i = 0; i < signalQuota && i < highSignalPages.length; i++) {
      const p = highSignalPages[i]!;
      const pLen = p.textContent?.length ?? 0;
      if (pLen <= remainingBudget) {
        selectedMiddleMap.set(p.pageNumber, p);
        remainingBudget -= pLen;
      }
    }

    // Add uniform grid pages spanning the entire document without gaps
    for (const p of gridPages) {
      if (selectedMiddleMap.has(p.pageNumber)) continue;
      const pLen = p.textContent?.length ?? 0;
      if (pLen <= remainingBudget) {
        selectedMiddleMap.set(p.pageNumber, p);
        remainingBudget -= pLen;
      }
    }

    // Merge Tier 1 Anchors + Selected Middle Pages
    const allCandidates = [
      ...Array.from(anchorMap.values()),
      ...Array.from(selectedMiddleMap.values()),
    ].sort((a, b) => a.pageNumber - b.pageNumber);

    const selectedPages = allCandidates;
    const finalChars = selectedPages.reduce((acc, p) => acc + (p.textContent?.length ?? 0), 0);

    return {
      selectedPages,
      isSampled: true,
      totalOriginalChars,
      diagnostics: {
        totalPages: sortedPages.length,
        selectedCount: selectedPages.length,
        frontCount: frontPages.length,
        backCount: backPages.length,
        signalCount: selectedMiddleMap.size,
        gridCount: gridPages.length,
        totalChars: finalChars,
        budgetChars: maxCharacters,
        pageDistribution: selectedPages.map((p) => p.pageNumber),
      },
    };
  }

  /**
   * Prepares an AnalysisRequest from document metadata and extracted pages (full-document mode).
   */
  prepareRequest(
    document: DocumentRecord,
    pages: DocumentPageRecord[],
    options?: AnalyzeDocumentOptions
  ): AnalysisRequest {
    const sortedPages = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);

    return {
      documentId: document.id,
      fileName: document.name,
      mimeType: document.mimeType,
      pages: sortedPages.map((p) => ({
        pageNumber: p.pageNumber,
        text: p.textContent,
      })),
      options: {
        preferredLanguage: options?.preferredLanguage,
        forceRefresh: options?.forceRefresh,
        query: options?.query,
      },
    };
  }

  /**
   * Prepares an AnalysisRequest bounded by ContextBuilder (retrieval-augmented mode).
   * Ensures unbounded raw page text is never sent directly to AI providers.
   */
  prepareBoundedRequest(
    document: DocumentRecord,
    context: BuiltContext,
    options?: AnalyzeDocumentOptions
  ): AnalysisRequest {
    return {
      documentId: document.id,
      fileName: document.name,
      mimeType: document.mimeType,
      pages: context.pages,
      options: {
        preferredLanguage: options?.preferredLanguage,
        forceRefresh: options?.forceRefresh,
        query: options?.query,
        isRetrievalGrounded: true,
      },
    };
  }

  /**
   * Normalizes text by collapsing whitespace sequences to a single space.
   */
  private normalizeText(text: string): string {
    return text.replace(/\s+/g, ' ').trim().toLowerCase();
  }

  /**
   * Verifies an evidence item against the source document pages or supplied context map.
   * If a citation refers to a non-existent page or quotes text not present in the allowed text,
   * the evidence is downgraded to UNCERTAIN and warnings are collected.
   */
  validateEvidence(
    evidence: AnalysisEvidence,
    pageMap: Map<number, string>,
    warnings: AnalysisWarning[]
  ): AnalysisEvidence {
    let isValid = true;
    const validatedCitations = [...evidence.citations];

    for (const citation of validatedCitations) {
      const pageText = pageMap.get(citation.pageNumber);

      if (pageText === undefined) {
        isValid = false;
        warnings.push({
          code: 'EVIDENCE_PAGE_NOT_FOUND',
          message: `Citation refers to page ${citation.pageNumber}, which was not provided in the analysis context.`,
          pageNumber: citation.pageNumber,
          severity: 'WARNING',
        });
        continue;
      }

      if (!citation.sourceText || citation.sourceText.trim().length === 0) {
        isValid = false;
        warnings.push({
          code: 'EVIDENCE_SOURCE_TEXT_EMPTY',
          message: `Citation on page ${citation.pageNumber} contains empty sourceText.`,
          pageNumber: citation.pageNumber,
          severity: 'WARNING',
        });
        continue;
      }

      const normalizedPage = this.normalizeText(pageText);
      const normalizedSource = this.normalizeText(citation.sourceText);

      if (!normalizedPage.includes(normalizedSource)) {
        isValid = false;
        const excerpt = citation.sourceText.length > 50
          ? `${citation.sourceText.slice(0, 47)}...`
          : citation.sourceText;
        warnings.push({
          code: 'EVIDENCE_QUOTE_NOT_FOUND',
          message: `Evidence quote not found in context for page ${citation.pageNumber}: "${excerpt}".`,
          pageNumber: citation.pageNumber,
          severity: 'WARNING',
        });
      }
    }

    if (!isValid && evidence.status === 'VERIFIED') {
      return {
        ...evidence,
        status: 'UNCERTAIN',
        reasoning: evidence.reasoning
          ? `${evidence.reasoning} [Evidence downgraded: citation not verified in document text]`
          : 'Downgraded to UNCERTAIN: citation quote not found in document text.',
      };
    }

    return evidence;
  }

  /**
   * Validates the complete AnalysisResult against actual document pages or supplied context map.
   * Ensures no fabricated evidence passes through as VERIFIED.
   */
  validateResult(
    result: AnalysisResult,
    pagesOrMap: DocumentPageRecord[] | Map<number, string>
  ): AnalysisResult {
    let pageMap: Map<number, string>;
    if (pagesOrMap instanceof Map) {
      pageMap = pagesOrMap;
    } else {
      pageMap = new Map<number, string>();
      for (const page of pagesOrMap) {
        pageMap.set(page.pageNumber, page.textContent);
      }
    }

    const warnings: AnalysisWarning[] = [...(result.warnings || [])];

    // Validate overall evidences
    const validatedEvidences: AnalysisEvidence[] = (result.evidences || []).map((evidence) =>
      this.validateEvidence(evidence, pageMap, warnings)
    );

    // Validate extracted fields and their embedded evidence
    const validatedFields: ExtractedField[] = (result.fields || []).map((field) => {
      if (!field.evidence) {
        return field;
      }

      const fieldWarnings: AnalysisWarning[] = [];
      const updatedEvidence = this.validateEvidence(field.evidence, pageMap, fieldWarnings);

      warnings.push(
        ...fieldWarnings.map((w) => ({
          ...w,
          field: field.name,
        }))
      );

      let fieldStatus = field.semanticStatus;
      if (updatedEvidence.status === 'UNCERTAIN' && fieldStatus === 'VERIFIED') {
        fieldStatus = 'UNCERTAIN';
      }

      return {
        ...field,
        semanticStatus: fieldStatus,
        evidence: updatedEvidence,
      };
    });

    // Validate tasks if present
    const validatedTasks = (result.tasks ?? []).map((task) => {
      if (!task.evidence?.quote) {
        return task;
      }
      const pageText = pageMap.get(task.evidence.pageNumber);
      if (!pageText || !pageText.includes(task.evidence.quote)) {
        warnings.push({
          code: 'EVIDENCE_QUOTE_NOT_FOUND',
          message: `Task "${task.title}" evidence quote not found verbatim in page ${task.evidence.pageNumber} text.`,
          pageNumber: task.evidence.pageNumber,
          severity: 'WARNING',
        });
        return {
          ...task,
          semanticStatus: 'UNCERTAIN' as const,
        };
      }
      return task;
    });

    return {
      ...result,
      fields: validatedFields,
      tasks: result.tasks ? validatedTasks : undefined,
      evidences: validatedEvidences,
      warnings,
    };
  }

  /**
   * Performs retrieval-augmented analysis on a document:
   * 1. Fetches document metadata
   * 2. Executes HybridRetrievalService query
   * 3. Builds bounded evidence context via ContextBuilder
   * 4. Invokes AIProvider with bounded context (no raw unbounded document text)
   * 5. Validates evidence against the supplied context chunks
   * 6. Persists versioned result
   */
  async analyzeWithRetrieval(
    documentId: string,
    query: string,
    options?: AnalyzeDocumentOptions
  ): Promise<AnalyzeDocumentResult> {
    if (!this.documentRepo) {
      throw new Error('AnalysisService requires documentRepo for analyzeWithRetrieval');
    }
    if (!this.hybridRetrievalService) {
      throw new Error('AnalysisService requires hybridRetrievalService for retrieval-augmented analysis');
    }

    const document = await this.documentRepo.findById(documentId);
    if (!document) {
      throw new Error(`Document not found: ${documentId}`);
    }

    const trimmedQuery = query?.trim() ?? '';
    if (!trimmedQuery) {
      throw new Error('Retrieval-augmented analysis requires a non-empty query');
    }

    // 1. Execute retrieval
    let retrievalResult: HybridRetrievalResult;
    try {
      retrievalResult = await this.hybridRetrievalService.retrieve(trimmedQuery, {
        documentId,
        limit: options?.budget?.maxChunks ?? 20,
        minVectorScore: options?.minVectorScore,
      });
    } catch (err) {
      throw new Error(
        `Retrieval infrastructure failure during analysis: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // 2. Build bounded context
    const context = this.contextBuilder.buildContext(
      retrievalResult.candidates,
      options?.budget,
      document.name
    );

    // 3. Prepare bounded request
    const request = this.prepareBoundedRequest(document, context, {
      ...options,
      query: trimmedQuery,
    });

    // 4. Invoke AI provider
    const provider = this.getProvider();
    const rawResult = await provider.analyze(request);

    // 5. Annotate warnings from retrieval diagnostics if degraded or empty
    if (retrievalResult.diagnostics.isDegraded) {
      rawResult.warnings.push({
        code: 'RETRIEVAL_DEGRADED',
        message: `Vector retrieval degraded: ${retrievalResult.diagnostics.degradedReason ?? 'Local model unavailable'}. Grounded in lexical retrieval.`,
        severity: 'WARNING',
      });
    }

    if (retrievalResult.candidates.length === 0) {
      rawResult.warnings.push({
        code: 'NO_RETRIEVAL_CANDIDATES',
        message: `No retrieval candidates matched the query: "${trimmedQuery}". Analysis contains no document grounding.`,
        severity: 'WARNING',
      });
    }

    // 6. Validate evidence strictly against the supplied context text
    const validatedResult = this.validateResult(rawResult, context.pageContextMap);

    // 7. Persist analysis
    let savedRecord: DocumentAnalysisRecord | undefined;
    if (this.analysisRepo) {
      const nextVersion = await this.analysisRepo.getNextVersionNumber(documentId);
      const analysisId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `analysis-${documentId}-v${nextVersion}-${Date.now()}`;

      // Q&A / Retrieval analyses are saved for query history and token tracking,
      // but must NOT overwrite the active full summary (markActive = false)
      savedRecord = await this.analysisRepo.saveAnalysis(
        {
          id: analysisId,
          documentId,
          version: nextVersion,
          isActive: 0,
          status: 'completed',
          provider: validatedResult.provider,
          model: validatedResult.model,
          documentType: validatedResult.documentType,
          summary: validatedResult.summary,
          rawResult: JSON.stringify(validatedResult),
          promptTokens: validatedResult.usage?.promptTokens,
          completionTokens: validatedResult.usage?.completionTokens,
          totalTokens: validatedResult.usage?.totalTokens,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        false // markActive = false: do not replace active full document summary
      );

      // Boundary Contract: Q&A flow strictly produces answers & evidence;
      // it must NEVER call TaskExtractionService or create tasks/reminders/calendar events.
    }

    return {
      result: validatedResult,
      record: savedRecord,
      context,
    };
  }

  /**
   * End-to-end document analysis:
   * Distinguishes between targeted retrieval analysis (when query is specified or mode = 'retrieval')
   * and full-document summary analysis (existing default flow).
   */
  async analyzeDocument(
    documentId: string,
    options?: AnalyzeDocumentOptions
  ): Promise<AnalyzeDocumentResult> {
    if (options?.query || options?.mode === 'retrieval') {
      const query = options?.query?.trim() || '';
      return this.analyzeWithRetrieval(documentId, query, options);
    }

    // Full-document summary mode (preserves existing architecture)
    if (!this.documentRepo || !this.pageRepo) {
      throw new Error('AnalysisService requires documentRepo and pageRepo for analyzeDocument');
    }

    const document = await this.documentRepo.findById(documentId);
    if (!document) {
      throw new Error(`Document not found: ${documentId}`);
    }

    const pages = await this.pageRepo.findByDocumentId(documentId);
    if (!pages || pages.length === 0) {
      throw new Error(`Cannot analyze document ${documentId}: no extracted pages found. Ensure document is processed.`);
    }

    // Budget document pages to strictly prevent oversized prompt requests (e.g. 219 pages / 206k tokens)
    const { selectedPages, isSampled, totalOriginalChars } = this.prepareBudgetedSummaryPages(pages);

    const request = this.prepareRequest(document, selectedPages, options);
    const provider = this.getProvider();
    const rawResult = await provider.analyze(request);

    if (isSampled) {
      rawResult.warnings.push({
        code: 'LARGE_DOCUMENT_SAMPLED',
        message: `Tài liệu gồm ${pages.length} trang (${Math.round(totalOriginalChars / 1000)}k ký tự). Tóm tắt tổng quan được tạo dựa trên ${selectedPages.length} trang trọng tâm (mục lục, phần mở đầu, kết luận và mẫu phân đoạn) để đảm bảo an toàn hạn mức token. Hãy dùng tính năng Hỏi đáp (Q&A) để tra cứu chi tiết từng trang cụ thể.`,
        severity: 'INFO',
      });
    }

    const validatedResult = this.validateResult(rawResult, selectedPages);

    let savedRecord: DocumentAnalysisRecord | undefined;
    if (this.analysisRepo) {
      const nextVersion = await this.analysisRepo.getNextVersionNumber(documentId);
      const analysisId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `analysis-${documentId}-v${nextVersion}-${Date.now()}`;

      savedRecord = await this.analysisRepo.saveAnalysis({
        id: analysisId,
        documentId,
        version: nextVersion,
        isActive: 1,
        status: 'completed',
        provider: validatedResult.provider,
        model: validatedResult.model,
        documentType: validatedResult.documentType,
        summary: validatedResult.summary,
        rawResult: JSON.stringify(validatedResult),
        promptTokens: validatedResult.usage?.promptTokens,
        completionTokens: validatedResult.usage?.completionTokens,
        totalTokens: validatedResult.usage?.totalTokens,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      if (this.taskExtractionService) {
        try {
          await this.taskExtractionService.extractAndSaveCandidates(
            documentId,
            savedRecord.id,
            savedRecord.version,
            validatedResult
          );
        } catch (extractErr) {
          console.warn(`[AnalysisService] Task candidate extraction warning for document ${documentId}:`, extractErr);
        }
      }
    }

    return {
      result: validatedResult,
      record: savedRecord,
    };
  }
}
