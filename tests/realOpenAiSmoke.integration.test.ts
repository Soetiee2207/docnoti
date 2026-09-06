import { describe, it, expect } from 'vitest';
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
import { buildPdfBuffer } from './fixtures/samplePdfs';

function createRealSmokeContext(apiKey?: string) {
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

  const initialSecrets: Record<string, string> = {};
  if (apiKey) {
    initialSecrets['openai_api_key'] = apiKey;
  }
  const secretsService = new InMemorySecretsService(initialSecrets);

  const mockAiProvider = new MockAIProvider();
  // Real OpenAIProvider using native global fetch
  const openAiProvider = new OpenAIProvider(secretsService, {
    model: 'gpt-4o-mini',
    timeoutMs: 30000,
    maxRetries: 2,
  });

  const aiConfigService = new AIConfigService({
    providerType: apiKey ? 'openai' : 'mock',
    cloudEnabled: Boolean(apiKey),
    openAiModel: 'gpt-4o-mini',
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
    undefined,
    analysisService
  );

  return {
    executor,
    documentRepo,
    jobRepo,
    pageRepo,
    analysisRepo,
    storageService,
    openAiProvider,
    aiConfigService,
    worker,
  };
}

describe('P5.4 Real AI Analysis Smoke Test', () => {
  const realApiKey = process.env.OPENAI_API_KEY;

  it('truthfully discovers OpenAI configuration in runtime environment', async () => {
    const ctx = createRealSmokeContext(realApiKey);
    const isAvailable = await ctx.openAiProvider.isAvailable();

    if (!realApiKey) {
      console.log(
        '[BLOCKED] OPENAI_API_KEY is not configured in current environment. ' +
          'Real cloud API calls cannot be executed without API credentials.'
      );
      expect(isAvailable.available).toBe(false);
      expect(isAvailable.reason).toContain('not configured');
    } else {
      console.log('[INFO] OPENAI_API_KEY detected in runtime environment.');
      expect(isAvailable.available).toBe(true);
    }
  });

  it('verifies safe failure behavior when API key is missing (BLOCKED verification)', async () => {
    // Test the unconfigured path explicitly
    const ctx = createRealSmokeContext(undefined);
    ctx.aiConfigService.setProviderType('openai');
    ctx.aiConfigService.setCloudEnabled(true);

    const now = new Date().toISOString();
    await runMigrations(ctx.executor);
    await ctx.documentRepo.create({
      id: 'doc-blocked-test',
      name: 'doc_blocked.pdf',
      originalPath: '/path/doc_blocked.pdf',
      storagePath: 'app_data/documents/doc_blocked.pdf',
      fileSize: 1024,
      mimeType: 'application/pdf',
      checksum: 'chk_blocked',
      status: 'processed',
      createdAt: now,
      updatedAt: now,
    });

    await ctx.pageRepo.savePages('doc-blocked-test', [
      {
        id: 'p-blocked-1',
        documentId: 'doc-blocked-test',
        pageNumber: 1,
        textContent: 'Van ban khong the phan tich vi thieu key',
        charCount: 40,
        hasSufficientText: 1,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const job = await ctx.worker.enqueueAnalysisJob('doc-blocked-test');
    const result = await ctx.worker.processJob(job.id);

    expect(result.success).toBe(false);
    expect(result.error).toContain('not configured');

    const doc = await ctx.documentRepo.findById('doc-blocked-test');
    expect(doc?.status).toBe('analysis_failed');

    const jobRecord = await ctx.jobRepo.findById(job.id);
    expect(jobRecord?.status).toBe('failed');

    // No corrupt analysis version saved
    const analyses = await ctx.analysisRepo.findByDocumentId('doc-blocked-test');
    expect(analyses.length).toBe(0);
  });

  // Only runs when OPENAI_API_KEY is provided in environment
  const smokeTestFn = realApiKey ? it : it.skip;

  smokeTestFn(
    'executes real end-to-end AI analysis against OpenAI API with Vietnamese PDF fixture',
    async () => {
      const ctx = createRealSmokeContext(realApiKey);
      await runMigrations(ctx.executor);

      // Create a small, realistic Vietnamese PDF fixture (invoice / financial document)
      const vietnameseText =
        'Cong hoa xa hoi chu nghia Viet Nam. Doc lap Tu do Hanh phuc.\n' +
        'CONG TY TNHH DOCNOTI VIET NAM\n' +
        'HOA DON GIA TRI GIA TANG\n' +
        'Ky hieu: AA/2026E. So hoa don: 0001234\n' +
        'Ngay lap hoa don: 06 thang 09 nam 2026\n' +
        'Don vi mua hang: Cong ty Khach Hang A\n' +
        'Noi dung: Dich vu phan tich tai lieu tu dong thang 09 nam 2026\n' +
        'Tong tien thanh toan: 15.000.000 VND\n' +
        'Thoi han thanh toan: Ngay 30 thang 09 nam 2026';

      const pdfBytes = buildPdfBuffer([vietnameseText]);
      const storagePath = 'app_data/documents/real_smoke_invoice.pdf';
      const storageMap = (ctx.storageService as any).fileBuffers as Map<string, Uint8Array>;
      storageMap.set(storagePath, pdfBytes);

      const now = new Date().toISOString();
      const docId = 'doc-real-openai-smoke';
      await ctx.documentRepo.create({
        id: docId,
        name: 'real_smoke_invoice.pdf',
        originalPath: '/test/real_smoke_invoice.pdf',
        storagePath,
        fileSize: pdfBytes.byteLength,
        mimeType: 'application/pdf',
        checksum: 'chk_real_smoke_001',
        status: 'imported',
        createdAt: now,
        updatedAt: now,
      });

      // 1. Process PDF text extraction
      const pdfJob = await ctx.jobRepo.create({
        id: `job-pdf-${docId}`,
        documentId: docId,
        jobType: 'document_pipeline',
        status: 'pending',
        retryCount: 0,
        maxRetries: 3,
        createdAt: now,
        updatedAt: now,
      });

      const pdfJobRes = await ctx.worker.processJob(pdfJob.id);
      expect(pdfJobRes.success).toBe(true);

      const docAfterPdf = await ctx.documentRepo.findById(docId);
      expect(docAfterPdf?.status).toBe('processed');

      const pages = await ctx.pageRepo.findByDocumentId(docId);
      expect(pages.length).toBe(1);
      expect(pages[0].textContent).toContain('CONG TY TNHH DOCNOTI VIET NAM');

      // 2. Enqueue and process real AnalysisJob
      const analysisJob = await ctx.worker.enqueueAnalysisJob(docId);
      expect(analysisJob.status).toBe('pending');

      const startTime = Date.now();
      const analysisJobRes = await ctx.worker.processJob(analysisJob.id);
      const durationMs = Date.now() - startTime;

      expect(analysisJobRes.success).toBe(true);

      // 3. Verify Document state transition
      const docAfterAnalysis = await ctx.documentRepo.findById(docId);
      expect(docAfterAnalysis?.status).toBe('analyzed');

      // 4. Verify persisted Analysis record
      const savedAnalysis = await ctx.analysisRepo.getActiveAnalysis(docId);
      expect(savedAnalysis).toBeDefined();
      expect(savedAnalysis?.version).toBe(1);
      expect(savedAnalysis?.isActive).toBe(1);
      expect(savedAnalysis?.provider).toBe('openai');
      expect(savedAnalysis?.model).toBe('gpt-4o-mini');

      const parsedResult = JSON.parse(savedAnalysis!.rawResult);
      expect(parsedResult.documentType).toBeDefined();
      expect(parsedResult.summary).toBeDefined();
      expect(parsedResult.summary.length).toBeGreaterThan(10);

      // 5. Verify Token Usage
      expect(savedAnalysis?.totalTokens).toBeGreaterThan(0);
      expect(savedAnalysis?.promptTokens).toBeGreaterThan(0);
      expect(savedAnalysis?.completionTokens).toBeGreaterThan(0);

      // Estimated cost for gpt-4o-mini ($0.15 per 1M prompt, $0.60 per 1M completion)
      const promptCost = ((savedAnalysis?.promptTokens ?? 0) / 1_000_000) * 0.15;
      const completionCost = ((savedAnalysis?.completionTokens ?? 0) / 1_000_000) * 0.60;
      const totalCostUsd = promptCost + completionCost;

      console.log(`[SMOKE SUCCESS] Model: gpt-4o-mini, Duration: ${durationMs}ms`);
      console.log(
        `[TOKEN USAGE] Prompt: ${savedAnalysis?.promptTokens}, Completion: ${savedAnalysis?.completionTokens}, Total: ${savedAnalysis?.totalTokens}`
      );
      console.log(`[ESTIMATED COST] ~$${totalCostUsd.toFixed(6)} USD`);
      console.log(`[SUMMARY] ${parsedResult.summary}`);

      // 6. Evidence Validation Gate Check
      // Citations must reference page 1 and cannot be fabricated
      for (const evidence of parsedResult.evidences || []) {
        for (const citation of evidence.citations || []) {
          expect(citation.pageNumber).toBe(1);
        }
      }
    },
    60000
  );
});
