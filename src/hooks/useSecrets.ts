import { useState, useEffect, useCallback } from 'react';
import { getAppServices, SECRET_KEYS } from '@/services';

export interface UseSecretsResult {
  isConfigured: boolean;
  loading: boolean;
  error: string | null;
  saveApiKey: (key: string) => Promise<void>;
  deleteApiKey: () => Promise<void>;
  reload: () => Promise<void>;
}

export function useSecrets(): UseSecretsResult {
  const [isConfigured, setIsConfigured] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const services = await getAppServices();
      const configured = await services.secretsService.hasSecret(SECRET_KEYS.OPENAI_API_KEY);
      setIsConfigured(configured);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void reload();
    });
  }, [reload]);

  const saveApiKey = useCallback(
    async (rawKey: string): Promise<void> => {
      const trimmed = rawKey.trim();
      if (!trimmed) {
        throw new Error('API key không được để trống');
      }

      try {
        setError(null);
        setLoading(true);
        const services = await getAppServices();
        await services.secretsService.setSecret(SECRET_KEYS.OPENAI_API_KEY, trimmed);
        setIsConfigured(true);
      } catch (err) {
        // Sanitize error: never include key in error message
        const msg = err instanceof Error ? err.message : 'Lỗi khi lưu thông tin xác thực';
        setError(msg);
        throw new Error(msg);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const deleteApiKey = useCallback(async (): Promise<void> => {
    try {
      setError(null);
      setLoading(true);
      const services = await getAppServices();
      await services.secretsService.deleteSecret(SECRET_KEYS.OPENAI_API_KEY);
      setIsConfigured(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi xóa thông tin xác thực';
      setError(msg);
      throw new Error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    isConfigured,
    loading,
    error,
    saveApiKey,
    deleteApiKey,
    reload,
  };
}
