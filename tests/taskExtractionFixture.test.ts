import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { createProxyDrizzleDb } from '@/db/client';
import { runMigrations, type MigrationExecutor } from '@/db/migrator';
import { DocumentRepository } from '@/repositories/documentRepository';
import { DocumentPageRepository } from '@/repositories/documentPageRepository';
import { AnalysisRepository } from '@/repositories/analysisRepository';
import { TaskRepository } from '@/repositories/taskRepository';
import { TaskExtractionService } from '@/services/tasks/taskExtractionService';
import { AnalysisService } from '@/services/ai/analysisService';
import { MockAIProvider } from '@/services/ai/mockAiProvider';
import type { AnalysisResult } from '@/services/ai/types';

function createTestContext() {
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
  const taskRepo = new TaskRepository(db);
  const taskExtractionService = new TaskExtractionService(taskRepo);

  return { sqlite, executor, db, documentRepo, pageRepo, analysisRepo, taskRepo, taskExtractionService };
}

const FIXTURE_PAGE_TEXT = `TRƯỜNG ĐẠI HỌC KHOA HỌC TỰ NHIÊN
Số: 125/KH-KHTN

CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
Độc lập - Tự do - Hạnh phúc
Hà Nội, ngày 15 tháng 09 năm 2026

KẾ HOẠCH
Về việc báo cáo kết quả học tập học kỳ I năm học 2026-2027

Căn cứ quy chế đào tạo đại học hiện hành;
Nhà trường ban hành kế hoạch rà soát, đánh giá và báo cáo kết quả học tập học kỳ I năm học 2026-2027 như sau:

I. TIẾN ĐỘ THỰC HIỆN
1. Nhập điểm và hoàn thiện kết quả học tập: Giáo viên bộ môn hoàn thành trước ngày 15/10/2026.
2. Kiểm tra và xác nhận kết quả từng lớp: Giáo viên chủ nhiệm thực hiện, hạn chót ngày 18/10/2026.
3. Nộp báo cáo kết quả học tập học kỳ I: Giáo viên chủ nhiệm gửi về khoa trước ngày 20/10/2026.
4. Tổng hợp và đối chiếu dữ liệu: Phòng Đào tạo thực hiện trước ngày 23/10/2026.
5. Hoàn tất báo cáo chính thức gửi Ban Giám hiệu: Phòng Đào tạo hoàn thành trước ngày 25/10/2026.

II. TỔ CHỨC THỰC HIỆN
Các đơn vị, cá nhân nghiêm túc thực hiện theo đúng tiến độ nêu trên.

HIỆU TRƯỞNG
(Đã ký)`;

describe('Fixture Test: lich_bao_cao_ket_qua_hoc_tap_test.pdf', () => {
  it('extracts exactly 5 structured task candidates with correct assignees and exact deadlines', async () => {
    const { executor, documentRepo, analysisRepo, taskRepo, taskExtractionService } = createTestContext();
    await runMigrations(executor);

    const now = new Date().toISOString();
    await documentRepo.create({
      id: 'doc-fixture-schedule-1',
      name: 'lich_bao_cao_ket_qua_hoc_tap_test.pdf',
      originalPath: '/test/lich_bao_cao_ket_qua_hoc_tap_test.pdf',
      storagePath: 'storage/lich_bao_cao.pdf',
      fileSize: 4096,
      mimeType: 'application/pdf',
      checksum: 'chk-fixture-0',
      status: 'processed',
      createdAt: now,
      updatedAt: now,
    });

    await analysisRepo.saveAnalysis({
      id: 'analysis-fixture-1',
      documentId: 'doc-fixture-schedule-1',
      version: 1,
      isActive: 1,
      status: 'completed',
      provider: 'openai',
      model: 'gpt-4o-mini',
      documentType: 'PLAN',
      summary: 'Kế hoạch học kỳ',
      rawResult: '{}',
      createdAt: now,
      updatedAt: now,
    });

    await analysisRepo.saveAnalysis({
      id: 'analysis-fixture-2',
      documentId: 'doc-fixture-schedule-1',
      version: 2,
      isActive: 1,
      status: 'completed',
      provider: 'openai',
      model: 'gpt-4o-mini',
      documentType: 'PLAN',
      summary: 'Kế hoạch học kỳ v2',
      rawResult: '{}',
      createdAt: now,
      updatedAt: now,
    });

    const analysisResult: AnalysisResult = {
      documentId: 'doc-fixture-schedule-1',
      documentType: 'PLAN',
      summary: 'Kế hoạch báo cáo kết quả học tập học kỳ I năm học 2026-2027.',
      fields: [
        {
          name: 'semester',
          value: 'Học kỳ I',
          semanticStatus: 'VERIFIED',
          confidence: 0.98,
          evidence: {
            claim: 'Kế hoạch học kỳ I',
            status: 'VERIFIED',
            confidence: 0.98,
            citations: [{ pageNumber: 1, sourceText: 'học kỳ I năm học 2026-2027' }],
          },
        },
        {
          name: 'academicYear',
          value: '2026-2027',
          semanticStatus: 'VERIFIED',
          confidence: 0.98,
          evidence: {
            claim: 'Năm học 2026-2027',
            status: 'VERIFIED',
            confidence: 0.98,
            citations: [{ pageNumber: 1, sourceText: 'năm học 2026-2027' }],
          },
        },
      ],
      tasks: [
        {
          title: 'Nhập điểm và hoàn thiện kết quả học tập',
          assignee: 'Giáo viên bộ môn',
          deadline: '15/10/2026',
          deadlineType: 'EXACT',
          semanticStatus: 'VERIFIED',
          confidence: 0.98,
          evidence: {
            quote: 'Nhập điểm và hoàn thiện kết quả học tập: Giáo viên bộ môn hoàn thành trước ngày 15/10/2026.',
            pageNumber: 1,
          },
        },
        {
          title: 'Kiểm tra và xác nhận kết quả từng lớp',
          assignee: 'Giáo viên chủ nhiệm',
          deadline: '18/10/2026',
          deadlineType: 'EXACT',
          semanticStatus: 'VERIFIED',
          confidence: 0.98,
          evidence: {
            quote: 'Kiểm tra và xác nhận kết quả từng lớp: Giáo viên chủ nhiệm thực hiện, hạn chót ngày 18/10/2026.',
            pageNumber: 1,
          },
        },
        {
          title: 'Nộp báo cáo kết quả học tập học kỳ I',
          assignee: 'Giáo viên chủ nhiệm',
          deadline: '20/10/2026',
          deadlineType: 'EXACT',
          semanticStatus: 'VERIFIED',
          confidence: 0.98,
          evidence: {
            quote: 'Nộp báo cáo kết quả học tập học kỳ I: Giáo viên chủ nhiệm gửi về khoa trước ngày 20/10/2026.',
            pageNumber: 1,
          },
        },
        {
          title: 'Tổng hợp và đối chiếu dữ liệu',
          assignee: 'Phòng Đào tạo',
          deadline: '23/10/2026',
          deadlineType: 'EXACT',
          semanticStatus: 'VERIFIED',
          confidence: 0.98,
          evidence: {
            quote: 'Tổng hợp và đối chiếu dữ liệu: Phòng Đào tạo thực hiện trước ngày 23/10/2026.',
            pageNumber: 1,
          },
        },
        {
          title: 'Hoàn tất báo cáo chính thức gửi Ban Giám hiệu',
          assignee: 'Phòng Đào tạo',
          deadline: '25/10/2026',
          deadlineType: 'EXACT',
          semanticStatus: 'VERIFIED',
          confidence: 0.98,
          evidence: {
            quote: 'Hoàn tất báo cáo chính thức gửi Ban Giám hiệu: Phòng Đào tạo hoàn thành trước ngày 25/10/2026.',
            pageNumber: 1,
          },
        },
      ],
      evidences: [],
      warnings: [],
      provider: 'openai',
      model: 'gpt-4o-mini',
      analyzedAt: new Date().toISOString(),
    };

    const candidates = taskExtractionService.extractCandidates(
      'doc-fixture-schedule-1',
      'analysis-fixture-1',
      1,
      analysisResult
    );

    // 1. Verify exact 5 candidates
    expect(candidates.length).toBe(5);

    // 2. Verify titles, assignees, deadlines, and types
    expect(candidates[0].title).toBe('Nhập điểm và hoàn thiện kết quả học tập');
    expect(candidates[0].description).toBe('Người phụ trách: Giáo viên bộ môn');
    expect(candidates[0].deadlineType).toBe('exact');
    expect(candidates[0].rawDeadline).toBe('15/10/2026');
    expect(candidates[0].deadlineDate).toBe('2026-10-15');
    expect(candidates[0].semanticStatus).toBe('VERIFIED');
    expect(candidates[0].evidence?.citations[0].pageNumber).toBe(1);

    expect(candidates[1].title).toBe('Kiểm tra và xác nhận kết quả từng lớp');
    expect(candidates[1].description).toBe('Người phụ trách: Giáo viên chủ nhiệm');
    expect(candidates[1].deadlineType).toBe('exact');
    expect(candidates[1].rawDeadline).toBe('18/10/2026');
    expect(candidates[1].deadlineDate).toBe('2026-10-18');

    expect(candidates[2].title).toBe('Nộp báo cáo kết quả học tập học kỳ I');
    expect(candidates[2].description).toBe('Người phụ trách: Giáo viên chủ nhiệm');
    expect(candidates[2].deadlineType).toBe('exact');
    expect(candidates[2].rawDeadline).toBe('20/10/2026');
    expect(candidates[2].deadlineDate).toBe('2026-10-20');

    expect(candidates[3].title).toBe('Tổng hợp và đối chiếu dữ liệu');
    expect(candidates[3].description).toBe('Người phụ trách: Phòng Đào tạo');
    expect(candidates[3].deadlineType).toBe('exact');
    expect(candidates[3].rawDeadline).toBe('23/10/2026');
    expect(candidates[3].deadlineDate).toBe('2026-10-23');

    expect(candidates[4].title).toBe('Hoàn tất báo cáo chính thức gửi Ban Giám hiệu');
    expect(candidates[4].description).toBe('Người phụ trách: Phòng Đào tạo');
    expect(candidates[4].deadlineType).toBe('exact');
    expect(candidates[4].rawDeadline).toBe('25/10/2026');
    expect(candidates[4].deadlineDate).toBe('2026-10-25');

    // 3. Save to database and test idempotency
    const saved = await taskExtractionService.extractAndSaveCandidates(
      'doc-fixture-schedule-1',
      'analysis-fixture-1',
      1,
      analysisResult
    );
    expect(saved.length).toBe(5);

    const fromDb = await taskRepo.findByDocumentId('doc-fixture-schedule-1');
    expect(fromDb.length).toBe(5);

    // 4. Re-running extractAndSaveCandidates does NOT duplicate tasks
    const reSaved = await taskExtractionService.extractAndSaveCandidates(
      'doc-fixture-schedule-1',
      'analysis-fixture-2',
      2,
      analysisResult
    );
    expect(reSaved.length).toBe(5);

    const fromDbAfter = await taskRepo.findByDocumentId('doc-fixture-schedule-1');
    expect(fromDbAfter.length).toBe(5);
  });

  it('end-to-end AnalysisService analysis triggers task extraction on document', async () => {
    const ctx = createTestContext();
    await runMigrations(ctx.executor);

    const now = new Date().toISOString();
    await ctx.documentRepo.create({
      id: 'doc-fixture-e2e',
      name: 'lich_bao_cao_ket_qua_hoc_tap_test.pdf',
      originalPath: '/test/lich_bao_cao_ket_qua_hoc_tap_test.pdf',
      storagePath: 'storage/lich_bao_cao.pdf',
      fileSize: 4096,
      mimeType: 'application/pdf',
      checksum: 'chk-fixture-1',
      status: 'processed',
      createdAt: now,
      updatedAt: now,
    });

    await ctx.pageRepo.savePages('doc-fixture-e2e', [
      {
        id: 'page-1',
        documentId: 'doc-fixture-e2e',
        pageNumber: 1,
        textContent: FIXTURE_PAGE_TEXT,
        charCount: FIXTURE_PAGE_TEXT.length,
        hasSufficientText: 1,
        pageWidth: 800,
        pageHeight: 1100,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const mockAi = new MockAIProvider({
      simulatedClassification: 'PLAN',
      simulatedSummary: 'Kế hoạch báo cáo kết quả học tập học kỳ I.',
      simulatedTasks: [
        {
          title: 'Nhập điểm và hoàn thiện kết quả học tập',
          assignee: 'Giáo viên bộ môn',
          deadline: '15/10/2026',
          deadlineType: 'EXACT',
          semanticStatus: 'VERIFIED',
          confidence: 0.98,
          evidence: {
            quote: 'Nhập điểm và hoàn thiện kết quả học tập: Giáo viên bộ môn hoàn thành trước ngày 15/10/2026.',
            pageNumber: 1,
          },
        },
        {
          title: 'Kiểm tra và xác nhận kết quả từng lớp',
          assignee: 'Giáo viên chủ nhiệm',
          deadline: '18/10/2026',
          deadlineType: 'EXACT',
          semanticStatus: 'VERIFIED',
          confidence: 0.98,
          evidence: {
            quote: 'Kiểm tra và xác nhận kết quả từng lớp: Giáo viên chủ nhiệm thực hiện, hạn chót ngày 18/10/2026.',
            pageNumber: 1,
          },
        },
        {
          title: 'Nộp báo cáo kết quả học tập học kỳ I',
          assignee: 'Giáo viên chủ nhiệm',
          deadline: '20/10/2026',
          deadlineType: 'EXACT',
          semanticStatus: 'VERIFIED',
          confidence: 0.98,
          evidence: {
            quote: 'Nộp báo cáo kết quả học tập học kỳ I: Giáo viên chủ nhiệm gửi về khoa trước ngày 20/10/2026.',
            pageNumber: 1,
          },
        },
        {
          title: 'Tổng hợp và đối chiếu dữ liệu',
          assignee: 'Phòng Đào tạo',
          deadline: '23/10/2026',
          deadlineType: 'EXACT',
          semanticStatus: 'VERIFIED',
          confidence: 0.98,
          evidence: {
            quote: 'Tổng hợp và đối chiếu dữ liệu: Phòng Đào tạo thực hiện trước ngày 23/10/2026.',
            pageNumber: 1,
          },
        },
        {
          title: 'Hoàn tất báo cáo chính thức gửi Ban Giám hiệu',
          assignee: 'Phòng Đào tạo',
          deadline: '25/10/2026',
          deadlineType: 'EXACT',
          semanticStatus: 'VERIFIED',
          confidence: 0.98,
          evidence: {
            quote: 'Hoàn tất báo cáo chính thức gửi Ban Giám hiệu: Phòng Đào tạo hoàn thành trước ngày 25/10/2026.',
            pageNumber: 1,
          },
        },
      ],
    });

    const analysisService = new AnalysisService({
      aiProvider: mockAi,
      analysisRepo: ctx.analysisRepo,
      documentRepo: ctx.documentRepo,
      pageRepo: ctx.pageRepo,
      taskExtractionService: ctx.taskExtractionService,
    });

    // Run analysis
    const analysisRes = await analysisService.analyzeDocument('doc-fixture-e2e', { mode: 'full' });
    expect(analysisRes.result.documentType).toBe('PLAN');

    // Confirm tasks were automatically created in database
    const tasksInDb = await ctx.taskRepo.findByDocumentId('doc-fixture-e2e');
    expect(tasksInDb.length).toBe(5);
    const titles = tasksInDb.map((t) => t.title);
    expect(titles).toEqual(
      expect.arrayContaining([
        'Nhập điểm và hoàn thiện kết quả học tập',
        'Kiểm tra và xác nhận kết quả từng lớp',
        'Nộp báo cáo kết quả học tập học kỳ I',
        'Tổng hợp và đối chiếu dữ liệu',
        'Hoàn tất báo cáo chính thức gửi Ban Giám hiệu',
      ])
    );
  });
});
