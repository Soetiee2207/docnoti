import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { createProxyDrizzleDb } from '@/db/client';
import { runMigrations, type MigrationExecutor } from '@/db/migrator';
import { DocumentRepository } from '@/repositories/documentRepository';
import { ProcessingJobRepository } from '@/repositories/processingJobRepository';
import { DocumentPageRepository } from '@/repositories/documentPageRepository';
import { AnalysisRepository } from '@/repositories/analysisRepository';
import { InMemoryStorageService } from '@/services/storage';
import { PdfJsProcessor } from '@/services/pdf/pdfJsProcessor';
import { DocumentWorker } from '@/services/worker/documentWorker';
import { MockAIProvider } from '@/services/ai/mockAiProvider';
import { OpenAIProvider } from '@/services/ai/openAiProvider';
import { AIConfigService, AIProviderSelector } from '@/services/ai/aiConfig';
import { AnalysisService } from '@/services/ai/analysisService';
import { InMemorySecretsService } from '@/services/secrets';
import { createValidTextPdf } from './fixtures/samplePdfs';

function createPipelineTestContext() {
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
  const jobRepo = new ProcessingJobRepository(db);
  const pageRepo = new DocumentPageRepository(db);
  const analysisRepo = new AnalysisRepository(db);
  const storageService = new InMemoryStorageService();
  const pdfProcessor = new PdfJsProcessor({ minCharsPerPage: 20 });

  const secretsService = new InMemorySecretsService();
  const mockAiProvider = new MockAIProvider();
  const mockFetch = vi.fn();
  const openAiProvider = new OpenAIProvider(secretsService, { fetchFn: mockFetch });

  const aiConfigService = new AIConfigService({
    providerType: 'mock',
    cloudEnabled: false,
  });

  const aiProviderSelector = new AIProviderSelector(
    mockAiProvider,
    openAiProvider,
    aiConfigService
  );

  const analysisService = new AnalysisService({
    aiProvider: () => aiProviderSelector.getActiveProvider(),
    analysisRepo,
    documentRepo,
    pageRepo,
  });

  const worker = new DocumentWorker(
    documentRepo,
    jobRepo,
    pageRepo,
    storageService,
    pdfProcessor,
    undefined, // no OCR service needed for text PDF
    analysisService
  );

  return {
    sqlite,
    executor,
    db,
    documentRepo,
    jobRepo,
    pageRepo,
    analysisRepo,
    storageService,
    pdfProcessor,
    secretsService,
    mockAiProvider,
    openAiProvider,
    mockFetch,
    aiConfigService,
    aiProviderSelector,
    analysisService,
    worker,
  };
}

describe('P5.3 AI Configuration & Analysis Pipeline Orchestration', () => {
  let ctx: ReturnType<typeof createPipelineTestContext>;

  beforeEach(async () => {
    ctx = createPipelineTestContext();
    await runMigrations(ctx.executor);
  });

  async function seedProcessedDocument(docId: string, text: string) {
    const now = new Date().toISOString();
    await ctx.documentRepo.create({
      id: docId,
      name: `${docId}.pdf`,
      originalPath: `/mock/${docId}.pdf`,
      storagePath: `app_data/documents/${docId}.pdf`,
      fileSize: 1024,
      mimeType: 'application/pdf',
      checksum: `chk_${docId}`,
      status: 'processed',
      createdAt: now,
      updatedAt: now,
    });

    await ctx.pageRepo.savePages(docId, [
      {
        id: `${docId}_p1`,
        documentId: docId,
        pageNumber: 1,
        textContent: text,
        charCount: text.length,
        hasSufficientText: 1,
        createdAt: now,
        updatedAt: now,
      },
    ]);
  }

  describe('AnalysisJob Lifecycle & Idempotency', () => {
    it('creates an AnalysisJob for a processed document and executes pipeline to completion', async () => {
      await seedProcessedDocument(
        'doc-100',
        'HỢP ĐỒNG KINH TẾ GIỮA CÔNG TY X VÀ CÔNG TY Y'
      );

      const job = await ctx.worker.enqueueAnalysisJob('doc-100');
      expect(job.jobType).toBe('analysis');
      expect(job.status).toBe('pending');

      const result = await ctx.worker.processJob(job.id);
      expect(result.success).toBe(true);
      expect(result.jobType).toBe('analysis');

      // Verify document status transitions to analyzed
      const updatedDoc = await ctx.documentRepo.findById('doc-100');
      expect(updatedDoc?.status).toBe('analyzed');

      // Verify analysis result is saved in document_analyses
      const activeAnalysis = await ctx.analysisRepo.getActiveAnalysis('doc-100');
      expect(activeAnalysis).toBeDefined();
      expect(activeAnalysis?.version).toBe(1);
      expect(activeAnalysis?.isActive).toBe(1);
      expect(activeAnalysis?.provider).toBe('mock-ai-provider');
    });

    it('is idempotent: repeatedly enqueuing analysis does not create duplicate pending jobs', async () => {
      await seedProcessedDocument('doc-idempotent', 'Hóa đơn dịch vụ');

      const job1 = await ctx.worker.enqueueAnalysisJob('doc-idempotent');
      const job2 = await ctx.worker.enqueueAnalysisJob('doc-idempotent');

      expect(job1.id).toBe(job2.id);

      const allJobs = await ctx.jobRepo.findByDocumentId('doc-idempotent');
      const analysisJobs = allJobs.filter((j) => j.jobType === 'analysis');
      expect(analysisJobs.length).toBe(1);
    });

    it('autoAnalyze: automatically enqueues and runs analysis after PDF processing when enabled', async () => {
      ctx.worker.setAutoAnalyze(true);

      const pdfBytes = await createValidTextPdf();
      const storagePath = 'app_data/documents/auto_doc.pdf';
      const storageMap = (ctx.storageService as any).fileBuffers as Map<string, Uint8Array>;
      storageMap.set(storagePath, pdfBytes);

      const now = new Date().toISOString();
      await ctx.documentRepo.create({
        id: 'auto_doc',
        name: 'auto_doc.pdf',
        originalPath: '/path/auto_doc.pdf',
        storagePath,
        fileSize: pdfBytes.byteLength,
        mimeType: 'application/pdf',
        checksum: 'chk_auto',
        status: 'imported',
        createdAt: now,
        updatedAt: now,
      });

      // PDF job
      const pdfJob = await ctx.jobRepo.create({
        id: 'job-pdf-auto',
        documentId: 'auto_doc',
        jobType: 'document_pipeline',
        status: 'pending',
        retryCount: 0,
        maxRetries: 3,
        createdAt: now,
        updatedAt: now,
      });

      // Process PDF job: should auto-enqueue analysis job
      await ctx.worker.processJob(pdfJob.id);

      const jobsAfterPdf = await ctx.jobRepo.findByDocumentId('auto_doc');
      const analysisJob = jobsAfterPdf.find((j) => j.jobType === 'analysis');
      expect(analysisJob).toBeDefined();
      expect(analysisJob?.status).toBe('pending');

      // Process pending jobs will run the analysis job
      const workerResults = await ctx.worker.processPendingJobs();
      expect(workerResults.some((r) => r.jobType === 'analysis' && r.success)).toBe(true);

      const docFinal = await ctx.documentRepo.findById('auto_doc');
      expect(docFinal?.status).toBe('analyzed');
    });
  });

  describe('Provider Selection Policy & Cloud Opt-in', () => {
    it('uses local Mock provider by default without sending network requests', async () => {
      await seedProcessedDocument('doc-default', 'Văn bản bảo mật nội bộ công ty');

      expect(ctx.aiConfigService.getConfig().providerType).toBe('mock');
      expect(ctx.aiConfigService.getConfig().cloudEnabled).toBe(false);

      const job = await ctx.worker.enqueueAnalysisJob('doc-default');
      await ctx.worker.processJob(job.id);

      // Verify no network call made
      expect(ctx.mockFetch).not.toHaveBeenCalled();

      const analysis = await ctx.analysisRepo.getActiveAnalysis('doc-default');
      expect(analysis?.provider).toBe('mock-ai-provider');
    });

    it('rejects analysis and transitions to analysis_failed if OpenAI is selected without cloudEnabled opt-in', async () => {
      await seedProcessedDocument('doc-optin-fail', 'Hợp đồng cần gửi lên cloud');

      // Configure providerType as openai, but cloudEnabled is FALSE
      ctx.aiConfigService.setProviderType('openai');
      ctx.aiConfigService.setCloudEnabled(false);

      const job = await ctx.worker.enqueueAnalysisJob('doc-optin-fail');
      const result = await ctx.worker.processJob(job.id);

      expect(result.success).toBe(false);
      expect(result.error).toContain('explicit user opt-in required');

      // Must not silently fall back to mock!
      expect(ctx.mockFetch).not.toHaveBeenCalled();

      // Document status must be analysis_failed (non-retryable config error)
      const doc = await ctx.documentRepo.findById('doc-optin-fail');
      expect(doc?.status).toBe('analysis_failed');

      // Job must be failed immediately without retry
      const failedJob = await ctx.jobRepo.findById(job.id);
      expect(failedJob?.status).toBe('failed');
      expect(failedJob?.retryCount).toBe(0);
    });

    it('fails cleanly when OpenAI is enabled but API key is missing from secrets store', async () => {
      await seedProcessedDocument('doc-no-key', 'Văn bản thử nghiệm');

      // Explicit opt-in enabled
      ctx.aiConfigService.setProviderType('openai');
      ctx.aiConfigService.setCloudEnabled(true);

      // No API key in secretsService
      const job = await ctx.worker.enqueueAnalysisJob('doc-no-key');
      const result = await ctx.worker.processJob(job.id);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not configured');
      expect(ctx.mockFetch).not.toHaveBeenCalled();

      const doc = await ctx.documentRepo.findById('doc-no-key');
      expect(doc?.status).toBe('analysis_failed');
    });

    it('successfully calls OpenAI when explicitly enabled and API key is present', async () => {
      await seedProcessedDocument(
        'doc-openai-success',
        'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nĐộc lập - Tự do - Hạnh phúc'
      );

      // Set API key and opt-in
      await ctx.secretsService.setSecret('openai_api_key', 'sk-real-secret');
      ctx.aiConfigService.setProviderType('openai');
      ctx.aiConfigService.setCloudEnabled(true);

      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                documentType: 'OFFICIAL_DOCUMENT',
                summary: 'Vietnamese official declaration',
                fields: [],
                evidences: [
                  {
                    claim: 'Header matches national motto',
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
              }),
            },
          },
        ],
        usage: {
          prompt_tokens: 180,
          completion_tokens: 75,
          total_tokens: 255,
        },
      };

      ctx.mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), { status: 200 })
      );

      const job = await ctx.worker.enqueueAnalysisJob('doc-openai-success');
      const result = await ctx.worker.processJob(job.id);

      expect(result.success).toBe(true);
      expect(ctx.mockFetch).toHaveBeenCalledTimes(1);

      const analysis = await ctx.analysisRepo.getActiveAnalysis('doc-openai-success');
      expect(analysis?.provider).toBe('openai');
      expect(analysis?.documentType).toBe('OFFICIAL_DOCUMENT');
      expect(analysis?.totalTokens).toBe(255);
    });
  });

  describe('Re-Analysis Versioning & Evidence Gate', () => {
    it('creates version 2 on re-analysis, preserving version 1 in history', async () => {
      await seedProcessedDocument('doc-versions', 'Báo cáo tài chính quý 2 năm 2026');

      // First analysis -> version 1
      const job1 = await ctx.worker.enqueueAnalysisJob('doc-versions');
      await ctx.worker.processJob(job1.id);

      const v1 = await ctx.analysisRepo.getActiveAnalysis('doc-versions');
      expect(v1?.version).toBe(1);

      // Re-analysis -> creates new job and version 2
      const job2 = await ctx.worker.enqueueAnalysisJob('doc-versions');
      expect(job2.id).not.toBe(job1.id);
      await ctx.worker.processJob(job2.id);

      const v2 = await ctx.analysisRepo.getActiveAnalysis('doc-versions');
      expect(v2?.version).toBe(2);
      expect(v2?.isActive).toBe(1);

      // Previous version preserved
      const all = await ctx.analysisRepo.findByDocumentId('doc-versions');
      expect(all.length).toBe(2);
      const pastV1 = all.find((r) => r.version === 1);
      expect(pastV1?.isActive).toBe(0);
    });

    it('does not create a new version if analysis fails before producing valid result', async () => {
      await seedProcessedDocument('doc-fail-no-version', 'Văn bản kế toán');

      // Version 1 succeeded
      const job1 = await ctx.worker.enqueueAnalysisJob('doc-fail-no-version');
      await ctx.worker.processJob(job1.id);
      expect((await ctx.analysisRepo.findByDocumentId('doc-fail-no-version')).length).toBe(1);

      // Simulate failure on re-analysis: configure OpenAI without key
      ctx.aiConfigService.setProviderType('openai');
      ctx.aiConfigService.setCloudEnabled(true);

      const job2 = await ctx.worker.enqueueAnalysisJob('doc-fail-no-version');
      const failResult = await ctx.worker.processJob(job2.id);
      expect(failResult.success).toBe(false);

      // Still only 1 version exists; failed attempt did not corrupt history
      const allAfterFail = await ctx.analysisRepo.findByDocumentId('doc-fail-no-version');
      expect(allAfterFail.length).toBe(1);
      expect(allAfterFail[0].version).toBe(1);
      expect(allAfterFail[0].isActive).toBe(1);
    });

    it('enforces evidence validation as final gate during pipeline orchestration', async () => {
      await seedProcessedDocument('doc-evidence-pipeline', 'Nội dung thực tế: 100 triệu đồng');

      await ctx.secretsService.setSecret('openai_api_key', 'sk-key');
      ctx.aiConfigService.setProviderType('openai');
      ctx.aiConfigService.setCloudEnabled(true);

      // OpenAI hallucinates quote not in document
      const hallucinatedResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                documentType: 'INVOICE',
                summary: 'Invoice with hallucinated quote',
                fields: [
                  {
                    name: 'amount',
                    value: '500 triệu',
                    semanticStatus: 'VERIFIED',
                    confidence: 0.95,
                    evidence: {
                      claim: 'Total is 500 million',
                      status: 'VERIFIED',
                      confidence: 0.95,
                      citations: [{ pageNumber: 1, sourceText: 'Nội dung bịa đặt: 500 triệu đồng' }],
                    },
                  },
                ],
                evidences: [],
              }),
            },
          },
        ],
      };

      ctx.mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(hallucinatedResponse), { status: 200 })
      );

      const job = await ctx.worker.enqueueAnalysisJob('doc-evidence-pipeline');
      await ctx.worker.processJob(job.id);

      const saved = await ctx.analysisRepo.getActiveAnalysis('doc-evidence-pipeline');
      const parsedResult = JSON.parse(saved!.rawResult);

      // The field and evidence must be downgraded to UNCERTAIN in the persisted record
      expect(parsedResult.fields[0].semanticStatus).toBe('UNCERTAIN');
      expect(parsedResult.fields[0].evidence.status).toBe('UNCERTAIN');
      expect(parsedResult.warnings.some((w: any) => w.code === 'EVIDENCE_QUOTE_NOT_FOUND')).toBe(true);
    });
  });
});
