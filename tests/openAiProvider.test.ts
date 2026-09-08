import { describe, it, expect, vi } from 'vitest';
import { OpenAIProvider } from '@/services/ai/openAiProvider';
import { InMemorySecretsService } from '@/services/secrets';
import type { AnalysisRequest } from '@/services/ai/types';
import { AnalysisService } from '@/services/ai/analysisService';
import type { DocumentPageRecord } from '@/db/schema';

const sampleRequest: AnalysisRequest = {
  documentId: 'doc-ai-test',
  fileName: 'hoa_don_vat.pdf',
  mimeType: 'application/pdf',
  pages: [
    {
      pageNumber: 1,
      text: 'CÔNG TY TNHH ABC\nHÓA ĐƠN GIÁ TRỊ GIA TĂNG\nNgày: 15/06/2026\nTổng tiền: 2.000.000 VNĐ',
    },
  ],
};

describe('P5.2 OpenAIProvider Tests', () => {
  describe('Provider Availability & Metadata', () => {
    it('reports unavailable when API key is missing from secrets store', async () => {
      const secrets = new InMemorySecretsService();
      const provider = new OpenAIProvider(secrets);

      const availability = await provider.isAvailable();
      expect(availability.available).toBe(false);
      expect(availability.reason).toContain('not configured');

      expect(provider.metadata.providerId).toBe('openai');
      expect(provider.metadata.modelId).toBe('gpt-4o-mini');
      expect(provider.metadata.isLocal).toBe(false);
    });

    it('reports available when API key exists in secrets store', async () => {
      const secrets = new InMemorySecretsService({
        openai_api_key: 'sk-mock-valid-key',
      });
      const provider = new OpenAIProvider(secrets);

      const availability = await provider.isAvailable();
      expect(availability.available).toBe(true);
    });

    it('throws MISSING_CONFIG if analyze is called when unavailable', async () => {
      const secrets = new InMemorySecretsService();
      const provider = new OpenAIProvider(secrets);

      await expect(provider.analyze(sampleRequest)).rejects.toMatchObject({
        name: 'AIError',
        code: 'MISSING_CONFIG',
        retryable: false,
      });
    });
  });

  describe('API Calls & Structured Output Validation', () => {
    it('successfully parses valid structured JSON response and maps token usage', async () => {
      const secrets = new InMemorySecretsService({
        openai_api_key: 'sk-test-secret',
      });

      const mockResponsePayload = {
        id: 'chatcmpl-123',
        choices: [
          {
            message: {
              content: JSON.stringify({
                documentType: 'OFFICIAL_DOCUMENT',
                summary: 'Hóa đơn giá trị gia tăng của Công ty ABC',
                fields: [
                  {
                    name: 'totalAmount',
                    value: '2.000.000 VNĐ',
                    semanticStatus: 'VERIFIED',
                    confidence: 0.99,
                    evidence: {
                      claim: 'Total amount is 2.000.000 VNĐ',
                      status: 'VERIFIED',
                      confidence: 0.99,
                      citations: [
                        {
                          pageNumber: 1,
                          sourceText: 'Tổng tiền: 2.000.000 VNĐ',
                        },
                      ],
                    },
                  },
                ],
                evidences: [
                  {
                    claim: 'Company ABC issued the VAT invoice',
                    status: 'VERIFIED',
                    confidence: 0.98,
                    citations: [
                      {
                        pageNumber: 1,
                        sourceText: 'CÔNG TY TNHH ABC',
                      },
                    ],
                  },
                ],
                warnings: [],
              }),
            },
          },
        ],
        usage: {
          prompt_tokens: 320,
          completion_tokens: 145,
          total_tokens: 465,
        },
      };

      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(mockResponsePayload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const provider = new OpenAIProvider(secrets, {
        fetchFn: mockFetch,
        model: 'gpt-4o-mini',
      });

      const result = await provider.analyze(sampleRequest);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toBe('https://api.openai.com/v1/chat/completions');
      expect(callArgs[1].headers.Authorization).toBe('Bearer sk-test-secret');

      const requestBody = JSON.parse(callArgs[1].body);
      expect(requestBody.model).toBe('gpt-4o-mini');
      expect(requestBody.response_format).toEqual({ type: 'json_object' });

      expect(result.documentType).toBe('OFFICIAL_DOCUMENT');
      expect(result.summary).toContain('Công ty ABC');
      expect(result.fields[0].name).toBe('totalAmount');
      expect(result.fields[0].value).toBe('2.000.000 VNĐ');
      expect(result.evidences[0].citations[0].sourceText).toBe('CÔNG TY TNHH ABC');

      // Usage mapping
      expect(result.usage).toBeDefined();
      expect(result.usage?.promptTokens).toBe(320);
      expect(result.usage?.completionTokens).toBe(145);
      expect(result.usage?.totalTokens).toBe(465);
    });

    it('handles response where usage is omitted by API without guessing', async () => {
      const secrets = new InMemorySecretsService({
        openai_api_key: 'sk-test-secret',
      });

      const mockResponsePayload = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                documentType: 'REPORT',
                summary: 'Annual report',
                fields: [],
                evidences: [],
              }),
            },
          },
        ],
      };

      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(mockResponsePayload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const provider = new OpenAIProvider(secrets, { fetchFn: mockFetch });
      const result = await provider.analyze(sampleRequest);

      expect(result.usage).toBeUndefined();
    });

    it('rejects malformed non-JSON response with MALFORMED_RESPONSE (not retryable)', async () => {
      const secrets = new InMemorySecretsService({
        openai_api_key: 'sk-test-secret',
      });

      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: 'Sorry, I cannot process this document.' } }],
          }),
          { status: 200 }
        )
      );

      const provider = new OpenAIProvider(secrets, { fetchFn: mockFetch, maxRetries: 2 });

      await expect(provider.analyze(sampleRequest)).rejects.toMatchObject({
        name: 'AIError',
        code: 'MALFORMED_RESPONSE',
        retryable: false,
      });

      // Non-retryable error should not be retried
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('rejects response missing required fields (e.g. missing evidences array)', async () => {
      const secrets = new InMemorySecretsService({
        openai_api_key: 'sk-test-secret',
      });

      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    documentType: 'INVOICE',
                    summary: 'Only summary here',
                    // missing fields and evidences
                  }),
                },
              },
            ],
          }),
          { status: 200 }
        )
      );

      const provider = new OpenAIProvider(secrets, { fetchFn: mockFetch });

      await expect(provider.analyze(sampleRequest)).rejects.toMatchObject({
        name: 'AIError',
        code: 'MALFORMED_RESPONSE',
        retryable: false,
      });
    });
  });

  describe('Error Handling & Retries', () => {
    it('throws AUTH_ERROR and does not retry on 401 Unauthorized', async () => {
      const secrets = new InMemorySecretsService({
        openai_api_key: 'sk-invalid-key',
      });

      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'Incorrect API key provided' } }), {
          status: 401,
        })
      );

      const provider = new OpenAIProvider(secrets, { fetchFn: mockFetch, maxRetries: 2 });

      await expect(provider.analyze(sampleRequest)).rejects.toMatchObject({
        name: 'AIError',
        code: 'AUTH_ERROR',
        retryable: false,
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('retries on 429 Rate Limit error up to maxRetries then throws RATE_LIMIT', async () => {
      const secrets = new InMemorySecretsService({
        openai_api_key: 'sk-test-key',
      });

      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'Rate limit reached' } }), {
          status: 429,
        })
      );

      const provider = new OpenAIProvider(secrets, {
        fetchFn: mockFetch,
        maxRetries: 2,
      });

      await expect(provider.analyze(sampleRequest)).rejects.toMatchObject({
        name: 'AIError',
        code: 'RATE_LIMIT',
        retryable: true,
      });

      // 1 initial attempt + 2 retries = 3 attempts total
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('retries and succeeds if a transient 429 rate limit resolves', async () => {
      const secrets = new InMemorySecretsService({
        openai_api_key: 'sk-test-key',
      });

      const successResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                documentType: 'REPORT',
                summary: 'Report recovered after retry',
                fields: [],
                evidences: [],
              }),
            },
          },
        ],
      };

      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(new Response('Rate limit', { status: 429 }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify(successResponse), { status: 200 })
        );

      const provider = new OpenAIProvider(secrets, {
        fetchFn: mockFetch,
        maxRetries: 2,
      });

      const result = await provider.analyze(sampleRequest);
      expect(result.documentType).toBe('REPORT');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('throws TIMEOUT_ERROR when request times out or is aborted', async () => {
      const secrets = new InMemorySecretsService({
        openai_api_key: 'sk-test-key',
      });

      const abortError = new Error('The operation was aborted due to timeout');
      abortError.name = 'AbortError';

      const mockFetch = vi.fn().mockRejectedValue(abortError);

      const provider = new OpenAIProvider(secrets, {
        fetchFn: mockFetch,
        maxRetries: 1,
      });

      await expect(provider.analyze(sampleRequest)).rejects.toMatchObject({
        name: 'AIError',
        code: 'TIMEOUT_ERROR',
        retryable: true,
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Integration with AnalysisService & Evidence Validation', () => {
    it('downgrades OpenAI candidate evidence if quoted text does not exist in actual document pages', async () => {
      const secrets = new InMemorySecretsService({
        openai_api_key: 'sk-test-key',
      });

      // OpenAI hallucinates a citation that doesn't exist on page 1
      const hallucinatedResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                documentType: 'INVOICE',
                summary: 'Invoice summary',
                fields: [
                  {
                    name: 'taxCode',
                    value: '0102030405',
                    semanticStatus: 'VERIFIED',
                    confidence: 0.95,
                    evidence: {
                      claim: 'Tax code is 0102030405',
                      status: 'VERIFIED',
                      confidence: 0.95,
                      citations: [
                        {
                          pageNumber: 1,
                          sourceText: 'Mã số thuế: 0102030405', // NOT in document
                        },
                      ],
                    },
                  },
                ],
                evidences: [],
              }),
            },
          },
        ],
      };

      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(hallucinatedResponse), { status: 200 })
      );

      const openAiProvider = new OpenAIProvider(secrets, { fetchFn: mockFetch });
      const analysisService = new AnalysisService({ aiProvider: openAiProvider });

      const realPages: DocumentPageRecord[] = [
        {
          id: 'p-1',
          documentId: 'doc-real',
          pageNumber: 1,
          textContent: 'CÔNG TY TNHH ABC\nTổng tiền: 500.000 VNĐ',
          charCount: 38,
          hasSufficientText: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const rawResult = await openAiProvider.analyze({
        documentId: 'doc-real',
        fileName: 'doc.pdf',
        mimeType: 'application/pdf',
        pages: [{ pageNumber: 1, text: realPages[0].textContent }],
      });

      // Evidence validation engine MUST downgrade candidate evidence
      const validated = analysisService.validateResult(rawResult, realPages);

      expect(validated.fields[0].semanticStatus).toBe('UNCERTAIN');
      expect(validated.fields[0].evidence.status).toBe('UNCERTAIN');
      expect(validated.warnings.some((w) => w.code === 'EVIDENCE_QUOTE_NOT_FOUND')).toBe(true);
    });
  });

  describe('Document Q&A & NotebookLM Prompting', () => {
    it('uses QA system prompt and populates answer field when query is provided', async () => {
      const secrets = new InMemorySecretsService({
        openai_api_key: 'sk-test-secret',
      });

      let capturedPayload: any = null;
      const mockFetch = vi.fn().mockImplementation(async (_url, init) => {
        capturedPayload = JSON.parse(init.body);
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    answer: 'Hợp đồng có thời hạn là 12 tháng kể từ ngày ký.',
                    documentType: 'REPORT',
                    confidence: 'VERIFIED',
                    evidences: [
                      {
                        claim: 'Thời hạn hợp đồng là 12 tháng',
                        status: 'VERIFIED',
                        confidence: 0.95,
                        citations: [
                          {
                            pageNumber: 1,
                            sourceText: 'Thời hạn là 12 tháng',
                          },
                        ],
                      },
                    ],
                    fields: [],
                  }),
                },
              },
            ],
            usage: { prompt_tokens: 100, completion_tokens: 40, total_tokens: 140 },
          }),
          { status: 200 }
        );
      });

      const provider = new OpenAIProvider(secrets, { fetchFn: mockFetch });
      const result = await provider.analyze(
        {
          documentId: 'doc-qa-1',
          fileName: 'contract.pdf',
          mimeType: 'application/pdf',
          pages: [{ pageNumber: 1, text: 'Thời hạn là 12 tháng' }],
        },
        { query: 'Thời hạn hợp đồng là bao lâu?' }
      );

      expect(capturedPayload).toBeDefined();
      expect(capturedPayload.messages[0].content).toContain("answer the user's question accurately");
      expect(capturedPayload.messages[1].content).toContain('USER QUESTION: Thời hạn hợp đồng là bao lâu?');
      expect(result.answer).toBe('Hợp đồng có thời hạn là 12 tháng kể từ ngày ký.');
      expect(result.summary).toBe('Hợp đồng có thời hạn là 12 tháng kể từ ngày ký.');
      expect(result.confidence).toBe('VERIFIED');
    });

    it('correctly returns UNCERTAIN answer when document has insufficient context', async () => {
      const secrets = new InMemorySecretsService({
        openai_api_key: 'sk-test-secret',
      });

      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    answer: 'Tài liệu không có thông tin về người bảo lãnh.',
                    documentType: 'UNKNOWN',
                    confidence: 'UNCERTAIN',
                    evidences: [],
                    fields: [],
                  }),
                },
              },
            ],
          }),
          { status: 200 }
        )
      );

      const provider = new OpenAIProvider(secrets, { fetchFn: mockFetch });
      const result = await provider.analyze(
        {
          documentId: 'doc-no-info',
          fileName: 'doc.pdf',
          mimeType: 'application/pdf',
          pages: [{ pageNumber: 1, text: 'Chỉ có thông tin giá hàng.' }],
        },
        { query: 'Ai là người bảo lãnh?' }
      );

      expect(result.confidence).toBe('UNCERTAIN');
      expect(result.answer).toContain('không có thông tin');
      expect(result.evidences).toHaveLength(0);
    });
  });

  describe('SPEC Classification Taxonomy Normalization', () => {
    it('maps legacy or unknown taxonomy strings to valid SPEC taxonomy classes', async () => {
      const secrets = new InMemorySecretsService({
        openai_api_key: 'sk-test-secret',
      });

      const legacyTypes = [
        { raw: 'INVOICE', expected: 'OTHER' },
        { raw: 'CONTRACT', expected: 'OTHER' },
        { raw: 'OFFICIAL_DOCUMENT', expected: 'OFFICIAL_DOCUMENT' },
        { raw: 'REPORT', expected: 'REPORT' },
        { raw: 'ANNOUNCEMENT', expected: 'ANNOUNCEMENT' },
        { raw: 'PLAN', expected: 'PLAN' },
        { raw: 'MEETING_DOCUMENT', expected: 'MEETING_DOCUMENT' },
        { raw: 'ASSIGNMENT', expected: 'ASSIGNMENT' },
        { raw: 'SOMETHING_UNKNOWN_XYZ', expected: 'OTHER' },
      ];

      for (const item of legacyTypes) {
        const mockFetch = vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      documentType: item.raw,
                      summary: `Test for ${item.raw}`,
                      fields: [],
                      evidences: [],
                    }),
                  },
                },
              ],
            }),
            { status: 200 }
          )
        );

        const provider = new OpenAIProvider(secrets, { fetchFn: mockFetch });
        const result = await provider.analyze(sampleRequest);
        expect(result.documentType).toBe(item.expected);
      }
    });
  });

  describe('Test Connection & API Key Protection', () => {
    it('testConnection reports success when API key is valid', async () => {
      const secrets = new InMemorySecretsService({
        openai_api_key: 'sk-valid-key-12345',
      });

      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: 'OK' } }],
          }),
          { status: 200 }
        )
      );

      const provider = new OpenAIProvider(secrets, { fetchFn: mockFetch });
      const res = await provider.testConnection();

      expect(res.success).toBe(true);
      expect(res.message).toContain('thành công');
    });

    it('testConnection reports clear error without leaking key when 401 Unauthorized', async () => {
      const secretKey = 'sk-super-secret-key-do-not-leak';
      const secrets = new InMemorySecretsService({
        openai_api_key: secretKey,
      });

      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { message: 'Incorrect API key provided: ' + secretKey },
          }),
          { status: 401 }
        )
      );

      const provider = new OpenAIProvider(secrets, { fetchFn: mockFetch });
      const res = await provider.testConnection();

      expect(res.success).toBe(false);
      expect(res.message).not.toContain(secretKey);
      expect(res.message).toContain('không hợp lệ');
    });

    it('never leaks API key in error messages or warnings on API failure', async () => {
      const secretKey = 'sk-secret-token-abcdef123456';
      const secrets = new InMemorySecretsService({
        openai_api_key: secretKey,
      });

      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { message: `Fatal error involving ${secretKey}` },
          }),
          { status: 500 }
        )
      );

      const provider = new OpenAIProvider(secrets, { fetchFn: mockFetch, maxRetries: 1 });

      try {
        await provider.analyze(sampleRequest);
        expect.unreachable('Should have thrown');
      } catch (err: any) {
        expect(err.message).not.toContain(secretKey);
      }
    });

    it('parses structured tasks array from model response and preserves evidence', async () => {
      const secrets = new InMemorySecretsService({
        openai_api_key: 'sk-test-key',
      });

      const mockTasksResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                documentType: 'PLAN',
                summary: 'Kế hoạch học kỳ',
                fields: [
                  {
                    name: 'semester',
                    value: 'I',
                    semanticStatus: 'VERIFIED',
                    confidence: 0.95,
                    evidence: {
                      claim: 'Học kỳ I',
                      status: 'VERIFIED',
                      confidence: 0.95,
                      citations: [{ pageNumber: 1, sourceText: 'học kỳ I' }],
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
                      quote: 'Nhập điểm trước ngày 15/10/2026',
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
                      quote: 'Kiểm tra trước ngày 18/10/2026',
                      pageNumber: 1,
                    },
                  },
                ],
                evidences: [],
              }),
            },
          },
        ],
      };

      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(mockTasksResponse), { status: 200 })
      );

      const provider = new OpenAIProvider(secrets, { fetchFn: mockFetch });
      const result = await provider.analyze(sampleRequest);

      // Verify tasks are present and not empty
      expect(result.tasks).toBeDefined();
      expect(result.tasks!.length).toBe(2);
      expect(result.tasks![0].title).toBe('Nhập điểm và hoàn thiện kết quả học tập');
      expect(result.tasks![0].assignee).toBe('Giáo viên bộ môn');
      expect(result.tasks![0].deadline).toBe('15/10/2026');
      expect(result.tasks![0].deadlineType).toBe('EXACT');
      expect(result.tasks![0].evidence?.quote).toBe('Nhập điểm trước ngày 15/10/2026');

      expect(result.tasks![1].title).toBe('Kiểm tra và xác nhận kết quả từng lớp');
      expect(result.tasks![1].assignee).toBe('Giáo viên chủ nhiệm');

      // Verify semester was normalized from "I" to "Học kỳ I"
      const semesterField = result.fields.find((f) => f.name === 'semester');
      expect(semesterField?.value).toBe('Học kỳ I');
    });

    it('normalizes various semester representations (1, HKI, HK 1, Semester 1) to Học kỳ I and Học kỳ II', async () => {
      const secrets = new InMemorySecretsService({
        openai_api_key: 'sk-test-key',
      });

      for (const raw of ['1', 'HKI', 'Học kỳ 1', 'SEMESTER 1']) {
        const mockResp = {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  documentType: 'PLAN',
                  summary: 'Kế hoạch',
                  fields: [{ name: 'semester', value: raw, semanticStatus: 'VERIFIED', confidence: 0.9 }],
                  evidences: [],
                }),
              },
            },
          ],
        };
        const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(mockResp), { status: 200 }));
        const provider = new OpenAIProvider(secrets, { fetchFn: mockFetch });
        const result = await provider.analyze(sampleRequest);
        expect(result.fields[0].value).toBe('Học kỳ I');
      }

      for (const raw of ['2', 'II', 'HKII', 'Học kỳ 2']) {
        const mockResp = {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  documentType: 'PLAN',
                  summary: 'Kế hoạch',
                  fields: [{ name: 'semester', value: raw, semanticStatus: 'VERIFIED', confidence: 0.9 }],
                  evidences: [],
                }),
              },
            },
          ],
        };
        const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(mockResp), { status: 200 }));
        const provider = new OpenAIProvider(secrets, { fetchFn: mockFetch });
        const result = await provider.analyze(sampleRequest);
        expect(result.fields[0].value).toBe('Học kỳ II');
      }
    });
  });
});

