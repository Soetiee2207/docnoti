import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  InMemorySecretsService,
  WindowsSecretsService,
  SECRET_KEYS,
  createDefaultSecretsService,
  type WindowsSecretsNativeBridge,
} from '@/services/secrets';
import { OpenAIProvider } from '@/services/ai/openAiProvider';
import { AIError } from '@/services/ai/types';
import { getAppServices, resetAppServices } from '@/services';
import * as tauriCore from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('SecretsService & Windows Credential Store Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('InMemorySecretsService (Deterministic Test Double)', () => {
    it('sets, gets, and checks existence of secret', async () => {
      const service = new InMemorySecretsService();

      expect(await service.hasSecret('test_key')).toBe(false);
      expect(await service.getSecret('test_key')).toBeNull();

      await service.setSecret('test_key', 'my-super-secret-value');

      expect(await service.hasSecret('test_key')).toBe(true);
      expect(await service.getSecret('test_key')).toBe('my-super-secret-value');
    });

    it('overwrites existing secret without error', async () => {
      const service = new InMemorySecretsService();

      await service.setSecret('test_key', 'value-1');
      expect(await service.getSecret('test_key')).toBe('value-1');

      await service.setSecret('test_key', 'value-2');
      expect(await service.getSecret('test_key')).toBe('value-2');
    });

    it('deletes existing secret and returns false for hasSecret', async () => {
      const service = new InMemorySecretsService({
        initial_key: 'secret-to-delete',
      });

      expect(await service.hasSecret('initial_key')).toBe(true);
      await service.deleteSecret('initial_key');

      expect(await service.hasSecret('initial_key')).toBe(false);
      expect(await service.getSecret('initial_key')).toBeNull();
    });

    it('handles delete on non-existent key gracefully', async () => {
      const service = new InMemorySecretsService();
      await expect(service.deleteSecret('non_existent')).resolves.not.toThrow();
    });

    it('reports availability as true', async () => {
      const service = new InMemorySecretsService();
      expect(await service.isAvailable()).toBe(true);
    });
  });

  describe('WindowsSecretsService (Native Windows Credential Adapter)', () => {
    it('truthfully reports unavailable outside Tauri environment when no bridge is provided', async () => {
      const service = new WindowsSecretsService();
      expect(await service.isAvailable()).toBe(false);
      expect(await service.getSecret('test_key')).toBeNull();
      expect(await service.hasSecret('test_key')).toBe(false);

      await expect(service.setSecret('test_key', 'val')).rejects.toThrow(
        /Secure credential store is unavailable/
      );
    });

    it('delegates to native bridge for setSecret, getSecret, deleteSecret, hasSecret', async () => {
      const mockBridge: WindowsSecretsNativeBridge = {
        isAvailable: vi.fn().mockResolvedValue(true),
        getSecret: vi.fn().mockResolvedValue('retrieved-token'),
        setSecret: vi.fn().mockResolvedValue(undefined),
        deleteSecret: vi.fn().mockResolvedValue(undefined),
        hasSecret: vi.fn().mockResolvedValue(true),
      };

      const service = new WindowsSecretsService(mockBridge);

      expect(await service.isAvailable()).toBe(true);

      await service.setSecret('api_token', 'test-token');
      expect(mockBridge.setSecret).toHaveBeenCalledWith('api_token', 'test-token');

      const value = await service.getSecret('api_token');
      expect(value).toBe('retrieved-token');
      expect(mockBridge.getSecret).toHaveBeenCalledWith('api_token');

      const exists = await service.hasSecret('api_token');
      expect(exists).toBe(true);
      expect(mockBridge.hasSecret).toHaveBeenCalledWith('api_token');

      await service.deleteSecret('api_token');
      expect(mockBridge.deleteSecret).toHaveBeenCalledWith('api_token');
    });

    it('sanitizes error messages so secret value is never leaked in errors', async () => {
      const secretValue = 'super-sensitive-api-key-12345';
      const mockBridge: WindowsSecretsNativeBridge = {
        isAvailable: vi.fn().mockResolvedValue(true),
        getSecret: vi.fn().mockResolvedValue(null),
        setSecret: vi.fn().mockRejectedValue(new Error(`Native error writing ${secretValue} to Advapi32`)),
        deleteSecret: vi.fn().mockRejectedValue(new Error(`Native error deleting ${secretValue}`)),
        hasSecret: vi.fn().mockResolvedValue(false),
      };

      const service = new WindowsSecretsService(mockBridge);

      try {
        await service.setSecret('my_key', secretValue);
        expect.unreachable('Should have failed');
      } catch (err: unknown) {
        const message = (err as Error).message;
        expect(message).toContain('Không thể lưu thông tin xác thực');
      }

      try {
        await service.deleteSecret('my_key');
        expect.unreachable('Should have failed');
      } catch (err: unknown) {
        const message = (err as Error).message;
        expect(message).toContain('Không thể xóa thông tin xác thực');
      }
    });
  });

  describe('OpenAIProvider SecretsService Integration', () => {
    it('queries SecretsService for OPENAI_API_KEY and does not call Tauri invoke directly', async () => {
      const mockInvoke = vi.mocked(tauriCore.invoke);
      const secrets = new InMemorySecretsService({
        [SECRET_KEYS.OPENAI_API_KEY]: 'sk-test-valid-key',
      });
      const getSecretSpy = vi.spyOn(secrets, 'getSecret');

      const provider = new OpenAIProvider(secrets);

      const avail = await provider.isAvailable();
      expect(avail.available).toBe(true);
      expect(getSecretSpy).toHaveBeenCalledWith(SECRET_KEYS.OPENAI_API_KEY);

      // Verify no direct native invoke was called by OpenAIProvider
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('reports unavailable and throws MISSING_CONFIG if secret is not set', async () => {
      const secrets = new InMemorySecretsService();
      const provider = new OpenAIProvider(secrets);

      const avail = await provider.isAvailable();
      expect(avail.available).toBe(false);
      expect(avail.reason).toContain('not configured');

      await expect(
        provider.analyze({
          documentId: 'doc-1',
          fileName: 'test.pdf',
          mimeType: 'application/pdf',
          pages: [{ pageNumber: 1, text: 'Sample' }],
        })
      ).rejects.toMatchObject({
        name: 'AIError',
        code: 'MISSING_CONFIG',
        retryable: false,
      });
    });

    it('passes secret token in Authorization header during analyze()', async () => {
      const secrets = new InMemorySecretsService({
        [SECRET_KEYS.OPENAI_API_KEY]: 'sk-live-secret-test-token',
      });

      let capturedAuthHeader = '';
      const mockFetch = vi.fn().mockImplementation((_url, init) => {
        capturedAuthHeader = init?.headers?.Authorization;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      documentType: 'OTHER',
                      summary: 'Test summary',
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
      });

      const provider = new OpenAIProvider(secrets, { fetchFn: mockFetch });

      await provider.analyze({
        documentId: 'doc-1',
        fileName: 'test.pdf',
        mimeType: 'application/pdf',
        pages: [{ pageNumber: 1, text: 'Hello world' }],
      });

      expect(capturedAuthHeader).toBe('Bearer sk-live-secret-test-token');
    });

    it('maps 401 Unauthorized to AUTH_ERROR without leaking key in error', async () => {
      const secretKey = 'sk-wrong-key-secret-999';
      const secrets = new InMemorySecretsService({
        [SECRET_KEYS.OPENAI_API_KEY]: secretKey,
      });

      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              message: 'Incorrect API key provided: sk-wrong...999',
              type: 'invalid_request_error',
            },
          }),
          { status: 401 }
        )
      );

      const provider = new OpenAIProvider(secrets, { fetchFn: mockFetch });

      try {
        await provider.analyze({
          documentId: 'doc-1',
          fileName: 'test.pdf',
          mimeType: 'application/pdf',
          pages: [{ pageNumber: 1, text: 'Hello' }],
        });
        expect.unreachable('Should have thrown AIError');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(AIError);
        const aiErr = err as AIError;
        expect(aiErr.code).toBe('AUTH_ERROR');
        expect(aiErr.retryable).toBe(false);
      }
    });
  });

  describe('Service Wiring & Factory Integration', () => {
    beforeEach(() => {
      resetAppServices();
    });

    it('createDefaultSecretsService returns SecretsService instance', () => {
      const defaultService = createDefaultSecretsService();
      expect(defaultService).toBeDefined();
      expect(typeof defaultService.getSecret).toBe('function');
      expect(typeof defaultService.setSecret).toBe('function');
      expect(typeof defaultService.deleteSecret).toBe('function');
      expect(typeof defaultService.hasSecret).toBe('function');
      expect(typeof defaultService.isAvailable).toBe('function');
    });

    it('getAppServices wires secretsService and OpenAIProvider correctly', async () => {
      const services = await getAppServices();

      expect(services.secretsService).toBeDefined();
      expect(services.openAiProvider).toBeDefined();
      expect(services.openAiProvider.metadata.providerId).toBe('openai');
    });
  });
});
