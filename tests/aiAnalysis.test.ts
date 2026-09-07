import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { createProxyDrizzleDb } from '@/db/client';
import { runMigrations, type MigrationExecutor } from '@/db/migrator';
import { DocumentRepository } from '@/repositories/documentRepository';
import { DocumentPageRepository } from '@/repositories/documentPageRepository';
import { AnalysisRepository } from '@/repositories/analysisRepository';
import { MockAIProvider } from '@/services/ai/mockAiProvider';
import { AnalysisService } from '@/services/ai/analysisService';
import type { AnalysisResult } from '@/services/ai/types';
import type { DocumentPageRecord } from '@/db/schema';

function createAiTestContext() {
  const sqlite = new DatabaseSync(':memory:');

  const executor: MigrationExecutor = {
    async execute(sql: string) {
      sqlite.exec(sql);
    },
    async query<T = unknown>(sql: string): Promise<T[]> {
      const stmt = sqlite.prepare(sql);
      return stmt.all() as T[];
    },
  };

  const db = createProxyDrizzleDb(async (sql, params, method) => {
    const stmt = sqlite.prepare(sql);
    if (method === 'run') {
      stmt.run(...(params as (string | number | bigint | null)[]));
      return { rows: [] };
    }

    stmt.setReturnArrays(true);
    if (method === 'get') {
      const row = stmt.get(...(params as (string | number | bigint | null)[]));
      return { rows: (row ?? undefined) as unknown[] };
    }

    const rows = stmt.all(...(params as (string | number | bigint | null)[]));
    return { rows };
  });

  const documentRepo = new DocumentRepository(db);
  const pageRepo = new DocumentPageRepository(db);
  const analysisRepo = new AnalysisRepository(db);
  const aiProvider = new MockAIProvider();
  const analysisService = new AnalysisService({
    aiProvider,
    analysisRepo,
    documentRepo,
    pageRepo,
  });

  return {
    sqlite,
    executor,
    db,
    documentRepo,
    pageRepo,
    analysisRepo,
    aiProvider,
    analysisService,
  };
}

describe('P5.1 AI Analysis Foundation', () => {
  describe('MockAIProvider Contract', () => {
    it('provides valid model metadata and availability status', async () => {
      const provider = new MockAIProvider();
      expect(provider.id).toBe('mock-ai-provider');
      expect(provider.metadata.providerId).toBe('mock-ai-provider');
      expect(provider.metadata.isLocal).toBe(true);

      const availability = await provider.isAvailable();
      expect(availability.available).toBe(true);
    });

    it('handles simulated provider unavailability', async () => {
      const provider = new MockAIProvider({
        available: false,
        unavailableReason: 'Service in maintenance',
      });

      const availability = await provider.isAvailable();
      expect(availability.available).toBe(false);
      expect(availability.reason).toContain('Service in maintenance');

      await expect(
        provider.analyze({
          documentId: 'doc-1',
          fileName: 'test.pdf',
          mimeType: 'application/pdf',
          pages: [{ pageNumber: 1, text: 'Sample text' }],
        })
      ).rejects.toThrow(/Provider unavailable/);
    });

    it('returns deterministic structured result with document citations', async () => {
      const provider = new MockAIProvider();
      const result = await provider.analyze({
        documentId: 'doc-123',
        fileName: 'contract.pdf',
        mimeType: 'application/pdf',
        pages: [{ pageNumber: 1, text: 'HỢP ĐỒNG KINH TẾ số 10/2026 giữa Công ty A và Công ty B' }],
      });

      expect(result.documentId).toBe('doc-123');
      expect(result.documentType).toBe('REPORT');
      expect(result.summary).toContain('contract.pdf');
      expect(result.provider).toBe('mock-ai-provider');
      expect(result.evidences.length).toBeGreaterThan(0);
      expect(result.evidences[0].citations[0].pageNumber).toBe(1);
      expect(result.evidences[0].citations[0].sourceText).toContain('HỢP ĐỒNG');
    });
  });

  describe('AnalysisService Evidence Validation', () => {
    let ctx: ReturnType<typeof createAiTestContext>;

    beforeEach(async () => {
      ctx = createAiTestContext();
    });

    it('passes valid evidence verbatim without downgrading', () => {
      const samplePages: DocumentPageRecord[] = [
        {
          id: 'p-1',
          documentId: 'doc-1',
          pageNumber: 1,
          textContent: 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nĐộc lập - Tự do - Hạnh phúc',
          charCount: 60,
          hasSufficientText: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const rawResult: AnalysisResult = {
        documentId: 'doc-1',
        documentType: 'OFFICIAL_NOTICE',
        summary: 'Official Vietnamese notice',
        fields: [
          {
            name: 'header',
            value: 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM',
            semanticStatus: 'VERIFIED',
            confidence: 0.99,
            evidence: {
              claim: 'Official notice header',
              status: 'VERIFIED',
              confidence: 0.99,
              citations: [
                {
                  pageNumber: 1,
                  sourceText: 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM',
                },
              ],
            },
          },
        ],
        evidences: [
          {
            claim: 'Document header is present',
            status: 'VERIFIED',
            confidence: 0.99,
            citations: [
              {
                pageNumber: 1,
                sourceText: 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM',
              },
            ],
          },
        ],
        warnings: [],
        provider: 'mock-ai-provider',
        model: 'mock-doc-v1',
        analyzedAt: new Date().toISOString(),
      };

      const validated = ctx.analysisService.validateResult(rawResult, samplePages);

      expect(validated.evidences[0].status).toBe('VERIFIED');
      expect(validated.fields[0].semanticStatus).toBe('VERIFIED');
      expect(validated.warnings.length).toBe(0);
    });

    it('downgrades fabricated quotes to UNCERTAIN and records warnings', () => {
      const samplePages: DocumentPageRecord[] = [
        {
          id: 'p-1',
          documentId: 'doc-1',
          pageNumber: 1,
          textContent: 'Hóa đơn tiền điện tháng 05/2026. Số tiền: 1.500.000 VNĐ.',
          charCount: 55,
          hasSufficientText: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const rawResult: AnalysisResult = {
        documentId: 'doc-1',
        documentType: 'INVOICE',
        summary: 'Electricity bill',
        fields: [
          {
            name: 'dueDate',
            value: '2026-12-31',
            semanticStatus: 'VERIFIED',
            confidence: 0.95,
            evidence: {
              claim: 'Due date is end of year',
              status: 'VERIFIED',
              confidence: 0.95,
              citations: [
                {
                  pageNumber: 1,
                  sourceText: 'Hạn thanh toán: 31/12/2026', // Fabricated quote not in page text
                },
              ],
            },
          },
        ],
        evidences: [
          {
            claim: 'Payment deadline claimed',
            status: 'VERIFIED',
            confidence: 0.95,
            citations: [
              {
                pageNumber: 1,
                sourceText: 'Hạn thanh toán: 31/12/2026',
              },
            ],
          },
        ],
        warnings: [],
        provider: 'mock-ai-provider',
        model: 'mock-doc-v1',
        analyzedAt: new Date().toISOString(),
      };

      const validated = ctx.analysisService.validateResult(rawResult, samplePages);

      // Must be downgraded to UNCERTAIN
      expect(validated.evidences[0].status).toBe('UNCERTAIN');
      expect(validated.fields[0].semanticStatus).toBe('UNCERTAIN');
      expect(validated.warnings.length).toBeGreaterThan(0);
      expect(validated.warnings.some((w) => w.code === 'EVIDENCE_QUOTE_NOT_FOUND')).toBe(true);
    });

    it('downgrades citations referencing non-existent pages', () => {
      const samplePages: DocumentPageRecord[] = [
        {
          id: 'p-1',
          documentId: 'doc-1',
          pageNumber: 1,
          textContent: 'Page 1 content only',
          charCount: 19,
          hasSufficientText: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const rawResult: AnalysisResult = {
        documentId: 'doc-1',
        documentType: 'REPORT',
        summary: 'Single page document',
        fields: [],
        evidences: [
          {
            claim: 'Page 2 claim',
            status: 'VERIFIED',
            confidence: 0.9,
            citations: [
              {
                pageNumber: 99, // Non-existent page
                sourceText: 'Page 99 text',
              },
            ],
          },
        ],
        warnings: [],
        provider: 'mock-ai-provider',
        model: 'mock-doc-v1',
        analyzedAt: new Date().toISOString(),
      };

      const validated = ctx.analysisService.validateResult(rawResult, samplePages);

      expect(validated.evidences[0].status).toBe('UNCERTAIN');
      expect(validated.warnings.some((w) => w.code === 'EVIDENCE_PAGE_NOT_FOUND')).toBe(true);
    });
  });

  describe('Analysis Persistence and Versioning', () => {
    let ctx: ReturnType<typeof createAiTestContext>;

    beforeEach(async () => {
      ctx = createAiTestContext();
      await runMigrations(ctx.executor);
    });

    it('persists initial analysis as version 1 and marks it active', async () => {
      const now = new Date().toISOString();
      await ctx.documentRepo.create({
        id: 'doc-version-test',
        name: 'test.pdf',
        originalPath: '/path/test.pdf',
        storagePath: '/storage/test.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        checksum: 'checksum1',
        status: 'ready',
        createdAt: now,
        updatedAt: now,
      });

      await ctx.pageRepo.savePages('doc-version-test', [
        {
          id: 'p-1',
          documentId: 'doc-version-test',
          pageNumber: 1,
          textContent: 'Nội dung văn bản thử nghiệm số 1',
          charCount: 30,
          hasSufficientText: 1,
          createdAt: now,
          updatedAt: now,
        },
      ]);

      const res1 = await ctx.analysisService.analyzeDocument('doc-version-test');
      expect(res1.record).toBeDefined();
      expect(res1.record?.version).toBe(1);
      expect(res1.record?.isActive).toBe(1);

      const active = await ctx.analysisRepo.getActiveAnalysis('doc-version-test');
      expect(active?.id).toBe(res1.record?.id);
      expect(active?.version).toBe(1);
    });

    it('creates version 2 on re-analysis, preserves version 1, and marks version 2 active', async () => {
      const now = new Date().toISOString();
      const docId = 'doc-multi-version';
      await ctx.documentRepo.create({
        id: docId,
        name: 'invoice.pdf',
        originalPath: '/path/invoice.pdf',
        storagePath: '/storage/invoice.pdf',
        fileSize: 2048,
        mimeType: 'application/pdf',
        checksum: 'checksum2',
        status: 'ready',
        createdAt: now,
        updatedAt: now,
      });

      await ctx.pageRepo.savePages(docId, [
        {
          id: 'p-1',
          documentId: docId,
          pageNumber: 1,
          textContent: 'HÓA ĐƠN GTGT Mẫu số 01GTKT Ngày 01/06/2026',
          charCount: 42,
          hasSufficientText: 1,
          createdAt: now,
          updatedAt: now,
        },
      ]);

      // First analysis -> version 1
      const res1 = await ctx.analysisService.analyzeDocument(docId);
      expect(res1.record?.version).toBe(1);
      expect(res1.record?.isActive).toBe(1);

      // Second analysis -> version 2
      const res2 = await ctx.analysisService.analyzeDocument(docId);
      expect(res2.record?.version).toBe(2);
      expect(res2.record?.isActive).toBe(1);

      // Verify all versions are preserved in repository
      const allVersions = await ctx.analysisRepo.findByDocumentId(docId);
      expect(allVersions.length).toBe(2);

      const v1 = allVersions.find((v) => v.version === 1);
      const v2 = allVersions.find((v) => v.version === 2);

      expect(v1?.isActive).toBe(0); // Deactivated
      expect(v2?.isActive).toBe(1); // Currently active

      // Test activating previous version (rollback/view past version)
      await ctx.analysisRepo.setActiveVersion(docId, 1);
      const activeAfterToggle = await ctx.analysisRepo.getActiveAnalysis(docId);
      expect(activeAfterToggle?.version).toBe(1);
      expect(activeAfterToggle?.isActive).toBe(1);

      const v2AfterToggle = await ctx.analysisRepo.getAnalysisByVersion(docId, 2);
      expect(v2AfterToggle?.isActive).toBe(0);
    });

    it('rejects analysis if document has no extracted pages', async () => {
      const now = new Date().toISOString();
      const docId = 'doc-no-pages';
      await ctx.documentRepo.create({
        id: docId,
        name: 'empty.pdf',
        originalPath: '/path/empty.pdf',
        storagePath: '/storage/empty.pdf',
        fileSize: 100,
        mimeType: 'application/pdf',
        checksum: 'checksum3',
        status: 'imported',
        createdAt: now,
        updatedAt: now,
      });

      await expect(ctx.analysisService.analyzeDocument(docId)).rejects.toThrow(
        /no extracted pages found/
      );
    });
  });
});
