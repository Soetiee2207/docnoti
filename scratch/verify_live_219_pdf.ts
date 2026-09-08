import { DatabaseSync } from 'node:sqlite';
import { createProxyDrizzleDb } from '@/db/client';
import { DocumentRepository } from '@/repositories/documentRepository';
import { DocumentPageRepository } from '@/repositories/documentPageRepository';
import { DocumentChunkRepository } from '@/repositories/documentChunkRepository';
import { DocumentChunkEmbeddingRepository } from '@/repositories/documentChunkEmbeddingRepository';
import { FtsSearchRepository } from '@/repositories/ftsSearchRepository';
import { execSync } from 'node:child_process';
import { AnalysisRepository } from '@/repositories/analysisRepository';
import { FtsSearchService } from '@/services/search/ftsSearchService';
import { DeterministicEmbeddingProvider } from '@/services/embedding/deterministicEmbeddingProvider';
import { HybridRetrievalService } from '@/services/retrieval/hybridRetrievalService';
import { ContextBuilder } from '@/services/ai/context/contextBuilder';
import { AnalysisService } from '@/services/ai/analysisService';
import { OpenAIProvider } from '@/services/ai/openAiProvider';
import { InMemorySecretsService } from '@/services/secrets/inMemorySecretsService';
import { estimateTokenCount } from '@/services/ai/context/tokenBudget';

function getWindowsCredentialSecret(targetName: string): string | null {
  try {
    const out = execSync(
      `python "C:\\Users\\nguye\\.gemini\\antigravity-ide\\brain\\25e766f0-f28c-465c-8636-e95614cacb13\\scratch\\read_cred.py" "${targetName}"`,
      { encoding: 'utf-8' }
    );
    return out.trim() || null;
  } catch {
    return null;
  }
}

async function main() {
  console.log('==================================================');
  console.log('REAL 219-PAGE PDF RUNTIME TEST');
  console.log('==================================================');

  const dbPath = 'C:\\Users\\nguye\\AppData\\Local\\com.tauri.dev\\docnoti.db';
  const sqlite = new DatabaseSync(dbPath);

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

  const docRepo = new DocumentRepository(db);
  const pageRepo = new DocumentPageRepository(db);
  const chunkRepo = new DocumentChunkRepository(db);
  const embeddingRepo = new DocumentChunkEmbeddingRepository(db);
  const ftsSearchRepo = new FtsSearchRepository(db);
  const analysisRepo = new AnalysisRepository(db);

  const ftsService = new FtsSearchService(ftsSearchRepo);
  const embeddingProvider = new DeterministicEmbeddingProvider();
  const hybridRetrieval = new HybridRetrievalService(ftsService, embeddingRepo, embeddingProvider);
  const contextBuilder = new ContextBuilder();
  const apiKey = getWindowsCredentialSecret('docnoti:openai_api_key');
  if (!apiKey) {
    throw new Error('API key not found in Windows Credential Manager');
  }
  const secretsService = new InMemorySecretsService({ openai_api_key: apiKey });

  const openAiProvider = new OpenAIProvider(secretsService, {
    model: 'gpt-4o-mini',
  });

  const analysisService = new AnalysisService({
    aiProvider: openAiProvider,
    documentRepo: docRepo,
    pageRepo,
    analysisRepo,
    hybridRetrievalService: hybridRetrieval,
    contextBuilder,
  });

  const docId = 'b2cb1760-6c67-4c0b-8630-ead263af2c0c';
  const doc = await docRepo.findById(docId);
  console.log(`Document: "${doc?.name}" (ID: ${docId})`);

  const pages = await pageRepo.findByDocumentId(docId);
  console.log(`Extracted Pages: ${pages.length} pages`);

  // --- PART 1: TEST Q&A WITH RETRIEVAL ---
  console.log('\n--- PART 1: TESTING Q&A WITH RETRIEVAL ---');
  const query = 'Giáo trình này nói về nội dung gì?';
  console.log(`User Query: "${query}"`);

  const retrievalResult = await hybridRetrieval.retrieve(query, {
    documentId: docId,
    limit: 20,
  });
  console.log(`Hybrid Retrieval candidates found: ${retrievalResult.candidates.length}`);

  const builtContext = contextBuilder.buildContext(retrievalResult.candidates, undefined, doc?.name);
  console.log(`ContextBuilder output:`);
  console.log(`  - Selected Chunks: ${builtContext.chunks.length}`);
  console.log(`  - Pages represented: ${builtContext.pages.length}`);
  console.log(`  - Total Context Characters: ${builtContext.diagnostics.totalCharacters}`);
  console.log(`  - Estimated Context Tokens: ${builtContext.diagnostics.estimatedTokens}`);

  console.log('\nExecuting analyzeWithRetrieval()...');
  const startTime = Date.now();
  const qaResult = await analysisService.analyzeWithRetrieval(docId, query);
  const elapsed = Date.now() - startTime;

  console.log(`\nQ&A Execution Successful! (${elapsed}ms)`);
  console.log(`Document Type: ${qaResult.result.documentType}`);
  console.log(`Answer Summary:\n${qaResult.result.summary}\n`);
  console.log(`Tokens used:`, qaResult.result.usage);
  console.log(`Evidences count: ${qaResult.result.evidences?.length ?? 0}`);

  if (qaResult.result.evidences && qaResult.result.evidences.length > 0) {
    for (let i = 0; i < Math.min(3, qaResult.result.evidences.length); i++) {
      const ev = qaResult.result.evidences[i]!;
      console.log(`  Evidence ${i + 1}: [${ev.status}] "${ev.claim}"`);
      if (ev.citations && ev.citations[0]) {
        console.log(`    Citation: Page ${ev.citations[0].pageNumber}: "${ev.citations[0].sourceText.slice(0, 70)}..."`);
      }
    }
  }

  // --- PART 2: TEST FULL SUMMARY ---
  console.log('\n--- PART 2: TESTING FULL SUMMARY (219 PAGES) ---');
  console.log('Calling analyzeDocument() on 219 pages...');
  const summaryStartTime = Date.now();
  const summaryResult = await analysisService.analyzeDocument(docId, { mode: 'full' });
  const summaryElapsed = Date.now() - summaryStartTime;

  console.log(`\nFull Summary Execution Successful! (${summaryElapsed}ms)`);
  console.log(`Document Type: ${summaryResult.result.documentType}`);
  console.log(`Summary:\n${summaryResult.result.summary.slice(0, 300)}...\n`);
  console.log(`Tokens used:`, summaryResult.result.usage);
  console.log(`Warnings:`, summaryResult.result.warnings);

  console.log('\n==================================================');
  console.log('ALL RUNTIME VERIFICATIONS PASSED SUCCESSFULLY!');
  console.log('==================================================');
}

main().catch((err) => {
  console.error('\nRUNTIME TEST FAILED:', err);
  process.exit(1);
});
