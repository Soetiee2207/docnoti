import type { DocumentRecord, DocumentPageRecord, DocumentAnalysisRecord } from '@/db/schema';
import type { DocumentRepository } from '@/repositories/documentRepository';
import type { DocumentPageRepository } from '@/repositories/documentPageRepository';
import type { AnalysisRepository } from '@/repositories/analysisRepository';

import type {
  AIProvider,
  AnalysisRequest,
  AnalysisResult,
  AnalysisWarning,
  AnalysisEvidence,
  ExtractedField,
} from './types';

export interface AnalysisServiceDeps {
  aiProvider: AIProvider;
  analysisRepo?: AnalysisRepository;
  documentRepo?: DocumentRepository;
  pageRepo?: DocumentPageRepository;
}

export interface AnalyzeDocumentOptions {
  preferredLanguage?: string;
  forceRefresh?: boolean;
}

export class AnalysisService {
  private aiProvider: AIProvider;
  private analysisRepo?: AnalysisRepository;
  private documentRepo?: DocumentRepository;
  private pageRepo?: DocumentPageRepository;

  constructor(deps: AnalysisServiceDeps) {
    this.aiProvider = deps.aiProvider;
    this.analysisRepo = deps.analysisRepo;
    this.documentRepo = deps.documentRepo;
    this.pageRepo = deps.pageRepo;
  }

  /**
   * Prepares an AnalysisRequest from document metadata and extracted pages.
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
   * Verifies an evidence item against the source document pages.
   * If a citation refers to a non-existent page or quotes text not present in the page,
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
          message: `Citation refers to page ${citation.pageNumber}, which does not exist in the document.`,
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
          message: `Evidence quote not found on page ${citation.pageNumber}: "${excerpt}".`,
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
   * Validates the complete AnalysisResult against actual document pages.
   * Ensures no fabricated evidence passes through as VERIFIED.
   */
  validateResult(
    result: AnalysisResult,
    pages: DocumentPageRecord[]
  ): AnalysisResult {
    const pageMap = new Map<number, string>();
    for (const page of pages) {
      pageMap.set(page.pageNumber, page.textContent);
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

    return {
      ...result,
      fields: validatedFields,
      evidences: validatedEvidences,
      warnings,
    };
  }

  /**
   * End-to-end document analysis:
   * 1. Fetches document & pages
   * 2. Prepares request
   * 3. Invokes AI provider
   * 4. Validates evidence
   * 5. Persists versioned result
   */
  async analyzeDocument(
    documentId: string,
    options?: AnalyzeDocumentOptions
  ): Promise<{ result: AnalysisResult; record?: DocumentAnalysisRecord }> {
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

    const request = this.prepareRequest(document, pages, options);
    const rawResult = await this.aiProvider.analyze(request);
    const validatedResult = this.validateResult(rawResult, pages);

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
    }

    return {
      result: validatedResult,
      record: savedRecord,
    };
  }
}
