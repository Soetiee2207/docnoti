import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { DatabaseSync } from 'node:sqlite';
import { createProxyDrizzleDb } from '@/db/client';
import { runMigrations, type MigrationExecutor } from '@/db/migrator';
import { DocumentRepository } from '@/repositories/documentRepository';
import { DocumentPageRepository } from '@/repositories/documentPageRepository';
import { AnalysisRepository } from '@/repositories/analysisRepository';
import { TaskRepository } from '@/repositories/taskRepository';
import { CalendarEventRepository } from '@/repositories/calendarEventRepository';
import { ReminderRepository } from '@/repositories/reminderRepository';
import { TaskExtractionService } from '@/services/tasks/taskExtractionService';
import { CalendarService } from '@/services/calendar/calendarService';
import { NotificationService } from '@/services/notification/notificationService';
import { TaskCard } from '@/components/tasks/TaskCard';
import type { TaskItem } from '@/services/tasks';
import type { AnalysisResult } from '@/services/ai/types';

function createE2ETestContext() {
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
  const calendarEventRepo = new CalendarEventRepository(db);
  const reminderRepo = new ReminderRepository(db);

  const taskExtractionService = new TaskExtractionService(taskRepo);
  const calendarService = new CalendarService(taskRepo);
  const notificationService = new NotificationService(taskRepo, reminderRepo);

  return {
    sqlite,
    executor,
    db,
    documentRepo,
    pageRepo,
    analysisRepo,
    taskRepo,
    calendarEventRepo,
    reminderRepo,
    taskExtractionService,
    calendarService,
    notificationService,
  };
}

const DOCUMENT_ID = 'doc-e2e-schedule';

const FIXTURE_ANALYSIS_RESULT: AnalysisResult = {
  documentId: DOCUMENT_ID,
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

describe('End-to-End Task Lifecycle UI & Eligibility Tests', () => {
  let ctx: ReturnType<typeof createE2ETestContext>;

  beforeEach(async () => {
    ctx = createE2ETestContext();
    await runMigrations(ctx.executor);

    const now = new Date().toISOString();
    await ctx.documentRepo.create({
      id: DOCUMENT_ID,
      name: 'lich_bao_cao_ket_qua_hoc_tap_test.pdf',
      originalPath: '/test/lich_bao_cao_ket_qua_hoc_tap_test.pdf',
      storagePath: 'storage/lich_bao_cao.pdf',
      fileSize: 4096,
      mimeType: 'application/pdf',
      checksum: 'chk-fixture-e2e',
      status: 'analyzed',
      createdAt: now,
      updatedAt: now,
    });

    await ctx.analysisRepo.saveAnalysis({
      id: 'analysis-e2e-1',
      documentId: DOCUMENT_ID,
      version: 1,
      isActive: 1,
      status: 'completed',
      provider: 'openai',
      model: 'gpt-4o-mini',
      documentType: 'PLAN',
      summary: 'Kế hoạch học kỳ',
      rawResult: JSON.stringify(FIXTURE_ANALYSIS_RESULT),
      createdAt: now,
      updatedAt: now,
    });

    await ctx.analysisRepo.saveAnalysis({
      id: 'analysis-e2e-2',
      documentId: DOCUMENT_ID,
      version: 2,
      isActive: 1,
      status: 'completed',
      provider: 'openai',
      model: 'gpt-4o-mini',
      documentType: 'PLAN',
      summary: 'Kế hoạch học kỳ v2',
      rawResult: JSON.stringify(FIXTURE_ANALYSIS_RESULT),
      createdAt: now,
      updatedAt: now,
    });
  });

  it('verifies 5 tasks extraction, exact properties, evidence, and absence of duplicates', async () => {
    const saved = await ctx.taskExtractionService.extractAndSaveCandidates(
      DOCUMENT_ID,
      'analysis-e2e-1',
      1,
      FIXTURE_ANALYSIS_RESULT
    );

    // 1. Verify exactly 5 tasks
    expect(saved.length).toBe(5);

    const tasksFromDb = await ctx.taskRepo.findByDocumentId(DOCUMENT_ID);
    expect(tasksFromDb.length).toBe(5);

    // 2. Verify each task has title, assignee in description, exact deadline, pending status, and evidence
    const titles = tasksFromDb.map((t) => t.title);
    expect(titles).toContain('Nhập điểm và hoàn thiện kết quả học tập');
    expect(titles).toContain('Kiểm tra và xác nhận kết quả từng lớp');
    expect(titles).toContain('Nộp báo cáo kết quả học tập học kỳ I');
    expect(titles).toContain('Tổng hợp và đối chiếu dữ liệu');
    expect(titles).toContain('Hoàn tất báo cáo chính thức gửi Ban Giám hiệu');

    for (const t of tasksFromDb) {
      expect(t.status).toBe('pending');
      expect(t.deadlineType).toBe('exact');
      expect(t.rawDeadline).toMatch(/^\d{2}\/10\/2026$/);
      expect(t.deadlineDate).toMatch(/^2026-10-\d{2}$/);
      expect(t.description).toMatch(/^Người phụ trách: (Giáo viên bộ môn|Giáo viên chủ nhiệm|Phòng Đào tạo)$/);
      expect(t.evidence).toBeTruthy();
      const evidence = JSON.parse(t.evidence!);
      expect(evidence.citations[0].pageNumber).toBe(1);
      expect(evidence.citations[0].sourceText).toBeTruthy();
    }

    // 3. Verify no duplicates on re-analysis
    const secondRun = await ctx.taskExtractionService.extractAndSaveCandidates(
      DOCUMENT_ID,
      'analysis-e2e-2',
      2,
      FIXTURE_ANALYSIS_RESULT
    );
    expect(secondRun.length).toBe(5);
    const countAfterSecond = await ctx.taskRepo.findByDocumentId(DOCUMENT_ID);
    expect(countAfterSecond.length).toBe(5);
  });

  it('enforces that unconfirmed (pending) tasks are NEVER eligible for Calendar or Reminders', async () => {
    const saved = await ctx.taskExtractionService.extractAndSaveCandidates(
      DOCUMENT_ID,
      'analysis-e2e-1',
      1,
      FIXTURE_ANALYSIS_RESULT
    );

    for (const task of saved) {
      expect(task.status).toBe('pending');

      // Check Calendar Eligibility
      const calEligibility = ctx.calendarService.validateTaskEligibility(task);
      expect(calEligibility.eligible).toBe(false);
      expect(calEligibility.reason).toContain('Chỉ công việc đã được xác nhận (confirmed) mới có thể tạo lịch');

      // Check Reminder Eligibility
      const remEligibility = ctx.notificationService.validateTaskEligibility(task);
      expect(remEligibility.eligible).toBe(false);
      expect(remEligibility.reason).toContain('Chỉ công việc đã được xác nhận (confirmed) mới có thể lên lịch nhắc nhở');
    }
  });

  it('confirms a task: transitions status, preserves uniqueness, and unlocks Calendar & Reminder eligibility', async () => {
    const saved = await ctx.taskExtractionService.extractAndSaveCandidates(
      DOCUMENT_ID,
      'analysis-e2e-1',
      1,
      FIXTURE_ANALYSIS_RESULT
    );

    const taskToConfirm = saved.find((t) => t.title === 'Nhập điểm và hoàn thiện kết quả học tập')!;
    expect(taskToConfirm).toBeDefined();

    // Confirm the task
    const confirmedRecord = await ctx.taskRepo.confirm(taskToConfirm.id);
    expect(confirmedRecord.status).toBe('confirmed');
    expect(confirmedRecord.confirmedAt).toBeTruthy();

    // Verify no duplicates created
    const allTasks = await ctx.taskRepo.findByDocumentId(DOCUMENT_ID);
    expect(allTasks.length).toBe(5);

    // Verify Calendar eligibility for the confirmed task
    const calElig = ctx.calendarService.validateTaskEligibility({
      status: confirmedRecord.status,
      deadlineType: confirmedRecord.deadlineType as any,
      deadlineDate: confirmedRecord.deadlineDate,
    });
    expect(calElig.eligible).toBe(true);
    expect(calElig.reason).toBeUndefined();

    // Verify Reminder eligibility for the confirmed task
    const remElig = ctx.notificationService.validateTaskEligibility({
      status: confirmedRecord.status,
      deadlineType: confirmedRecord.deadlineType as any,
      deadlineDate: confirmedRecord.deadlineDate,
    });
    expect(remElig.eligible).toBe(true);
    expect(remElig.reason).toBeUndefined();

    // Confirming again or re-running analysis preserves confirmed status
    const reAnalysis = await ctx.taskExtractionService.extractAndSaveCandidates(
      DOCUMENT_ID,
      'analysis-e2e-2',
      2,
      FIXTURE_ANALYSIS_RESULT
    );
    const confirmedAfterReanalysis = reAnalysis.find((t) => t.id === taskToConfirm.id)!;
    expect(confirmedAfterReanalysis.status).toBe('confirmed');
  });

  it('rejects a task: transitions status, prevents Calendar & Reminder eligibility', async () => {
    const saved = await ctx.taskExtractionService.extractAndSaveCandidates(
      DOCUMENT_ID,
      'analysis-e2e-1',
      1,
      FIXTURE_ANALYSIS_RESULT
    );

    const taskToReject = saved.find((t) => t.title === 'Kiểm tra và xác nhận kết quả từng lớp')!;
    expect(taskToReject).toBeDefined();

    // Reject the task
    const rejectedRecord = await ctx.taskRepo.reject(taskToReject.id);
    expect(rejectedRecord.status).toBe('rejected');
    expect(rejectedRecord.rejectedAt).toBeTruthy();

    // Verify Calendar eligibility is false
    const calElig = ctx.calendarService.validateTaskEligibility({
      status: rejectedRecord.status,
      deadlineType: rejectedRecord.deadlineType as any,
      deadlineDate: rejectedRecord.deadlineDate,
    });
    expect(calElig.eligible).toBe(false);
    expect(calElig.reason).toContain('Chỉ công việc đã được xác nhận (confirmed)');

    // Verify Reminder eligibility is false
    const remElig = ctx.notificationService.validateTaskEligibility({
      status: rejectedRecord.status,
      deadlineType: rejectedRecord.deadlineType as any,
      deadlineDate: rejectedRecord.deadlineDate,
    });
    expect(remElig.eligible).toBe(false);
    expect(remElig.reason).toContain('Chỉ công việc đã được xác nhận (confirmed)');

    // Re-analysis preserves rejected status
    const reAnalysis = await ctx.taskExtractionService.extractAndSaveCandidates(
      DOCUMENT_ID,
      'analysis-e2e-2',
      2,
      FIXTURE_ANALYSIS_RESULT
    );
    const rejectedAfterReanalysis = reAnalysis.find((t) => t.id === taskToReject.id)!;
    expect(rejectedAfterReanalysis.status).toBe('rejected');
  });

  it('renders all 5 tasks properly in TaskCard UI component with full metadata', async () => {
    const saved = await ctx.taskExtractionService.extractAndSaveCandidates(
      DOCUMENT_ID,
      'analysis-e2e-1',
      1,
      FIXTURE_ANALYSIS_RESULT
    );

    // Confirm 1 task, reject 1 task, leave 3 pending
    await ctx.taskRepo.confirm(saved[0]!.id);
    await ctx.taskRepo.reject(saved[1]!.id);

    const latestTasks = await ctx.taskRepo.findByDocumentId(DOCUMENT_ID);

    for (const record of latestTasks) {
      const taskItem: TaskItem = {
        ...record,
        evidence: record.evidence ? JSON.parse(record.evidence) : null,
        status: record.status as any,
        semanticStatus: record.semanticStatus as any,
        deadlineType: record.deadlineType as any,
      };

      const html = renderToString(
        <TaskCard
          task={taskItem}
          onConfirm={async () => {}}
          onReject={async () => {}}
        />
      );

      // Title must be present
      expect(html).toContain(taskItem.title);

      // Description (Assignee) must be present
      expect(html).toContain(taskItem.description!);

      // Exact deadline date must be rendered
      expect(html).toContain(`Hạn chót: ${taskItem.deadlineDate}`);

      // Evidence quote must be rendered
      expect(html).toContain('Căn cứ trích dẫn');
      expect(html).toContain('Trang 1');

      if (taskItem.status === 'pending') {
        expect(html).toContain('Chờ xác nhận');
        expect(html).toContain('Cần bạn xác nhận trước khi lưu vào Lịch / Thông báo');
        expect(html).toContain('Xác nhận');
        expect(html).toContain('Từ chối');
        expect(html).toContain('Sửa');
      } else if (taskItem.status === 'confirmed') {
        expect(html).toContain('Đã xác nhận');
        expect(html).not.toContain('Cần bạn xác nhận trước khi lưu vào Lịch / Thông báo');
        // Unlocks calendar scheduling
        expect(html).toContain('Lên lịch sự kiện');
      } else if (taskItem.status === 'rejected') {
        expect(html).toContain('Đã từ chối');
        expect(html).not.toContain('Lên lịch sự kiện');
      }
    }
  });

  it('verifies reload simulation: state is strictly persisted across reloads', async () => {
    const saved = await ctx.taskExtractionService.extractAndSaveCandidates(
      DOCUMENT_ID,
      'analysis-e2e-1',
      1,
      FIXTURE_ANALYSIS_RESULT
    );

    const task1 = saved[0]!;
    await ctx.taskRepo.confirm(task1.id);

    // Simulate new connection / reload by instantiating new TaskRepository on same DB
    const reloadedRepo = new TaskRepository(ctx.db);
    const reloadedTasks = await reloadedRepo.findByDocumentId(DOCUMENT_ID);

    expect(reloadedTasks.length).toBe(5);
    const reloadedTask1 = reloadedTasks.find((t) => t.id === task1.id)!;
    expect(reloadedTask1.status).toBe('confirmed');
    expect(reloadedTask1.confirmedAt).toBeTruthy();

    const pendingTasks = reloadedTasks.filter((t) => t.status === 'pending');
    expect(pendingTasks.length).toBe(4);
  });
});
